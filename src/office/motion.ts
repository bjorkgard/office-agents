import {
  assignWorkDesks,
  idleTrip,
  idleTripDrink,
  idleTripNext,
  stand,
  subagentPath,
  waitTrip,
  waitTripDrink,
  waitTripNext,
  IDLE_BEFORE_TRIP_MS,
  RETURN_CAP_MS,
  type SubagentCtx,
  type TripCtx,
  type TripSample,
} from "./choreo";
import type { Fit, OfficeLayout } from "./iso";
import type { Agent } from "./machine";
import { poseForState, type AgentState, type Pose } from "./poses";
import type { RigPose } from "./CharacterRig";
import type { Drink } from "./breaks";
import { COFFEE_SPOTS } from "./room";
import {
  deskZ,
  planSubagents,
  QUEUE_VISIBLE,
  SEATED_FOOT,
  STANDING_FOOT,
  type Geometry,
  type Point,
  type SubagentPlan,
} from "./scene-model";
import { byKey, type Seats } from "./selectors";

/**
 * Scene-side motion decisions, pure: who walks a path, who stays on a standing slot or in the
 * door queue, how long a coffee trip is remembered, and where the overlay (hit area, tag) sits
 * while its agent moves. Paths themselves live in choreo.ts; this file only chooses and adapts.
 */

/** Torso center above the foot point, in room px. */
export const TORSO = 48;

/** What one agent looks like at one instant, ready for the Character to draw. */
export type Frame = {
  /** Standing-foot point (choreo.ts): the rig's top-left is (x - RIG_WIDTH / 2, y - STANDING_FOOT). */
  x: number;
  y: number;
  pose: Pose;
  mirror: boolean;
  carryPaper: boolean;
  opacity: number;
  /** At its desk, slot or seat: the pose then follows the displayed state, not the path. */
  rest: boolean;
  /** At rest but standing (a subagent on a slot beside its parent's desk). */
  standing: boolean;
  /** Debug hook (data-break): the trip phase, only for an agent on a trip. */
  phase?: TripSample["phase"];
  /** Debug hook (data-drink): the trip's drink, only for an agent on a trip. */
  drink?: Drink;
};

export type Drive = {
  /** Stacking value of the desk the agent sits at, or null when it never sits at one. */
  deskZ: number | null;
  frame(t: number): Frame;
  /** True once nothing will move without new props: the Character stops its animation loop. */
  settled(t: number): boolean;
  /**
   * The next epoch ms at which the output moves or changes phase (`t` itself while it is moving),
   * or null if it never will. Pure. A settled drive with a next change is woken by `runLoop`.
   */
  nextChange(t: number): number | null;
};

/** A remembered coffee trip; the machine forgets idleSince and the wait start once they end. */
export type Trip = {
  kind: "idle" | "wait";
  since: number;
  /** When the reason for the trip ended; null while it lasts. */
  resumedAt: number | null;
  spot: number;
};

/**
 * When a parent's wait really began: its earliest still-open tool it waits on, clamped to `now`
 * (a reload then lands on the same break plan); first sight when none is known.
 */
function waitStart(a: Agent, now: number): number {
  let since = now;
  for (const id of a.waitingOn) {
    const t = Object.hasOwn(a.openTools, id) ? a.openTools[id] : undefined;
    if (t) since = Math.min(since, t.startedAt);
  }
  return since;
}

/**
 * Trips by agent key. A top-level agent with a seat that is idle (from `idleSince`) or waiting on
 * subagents (from first sight) gets one; it takes the lowest coffee spot nobody else holds. When
 * the reason ends it is marked `resumedAt` once (choreo walks the agent home within a second);
 * leavers and vanished agents lose theirs. Past the last coffee spot (COFFEE_SPOTS) an agent
 * gets no trip and stays seated.
 */
export function updateTrips(
  prev: ReadonlyMap<string, Trip>,
  agents: readonly Agent[],
  seats: Seats,
  now: number,
): Map<string, Trip> {
  const next = new Map<string, Trip>();
  const taken = new Set<number>();
  const wants = (a: Agent): { kind: Trip["kind"]; since: number } | null => {
    if (a.agentId !== null || seats[a.sessionId] === undefined) return null;
    if (a.state === "idle" && a.idleSince !== null) return { kind: "idle", since: a.idleSince };
    if (a.state === "waiting-on-subagents") return { kind: "wait", since: waitStart(a, now) };
    return null;
  };
  const sorted = [...agents].sort(byKey);
  const fresh: { a: Agent; want: { kind: Trip["kind"]; since: number } }[] = [];
  for (const a of sorted) {
    const m = prev.get(a.key);
    const want = wants(a);
    if (a.state === "leaving" || a.agentId !== null) continue;
    const same =
      m &&
      want &&
      m.resumedAt === null &&
      m.kind === want.kind &&
      (m.kind === "wait" || m.since === want.since);
    if (m && same) {
      next.set(a.key, m);
      taken.add(m.spot);
    } else if (want) fresh.push({ a, want });
    else if (m && (m.resumedAt === null || now - m.resumedAt <= RETURN_CAP_MS)) {
      next.set(a.key, m.resumedAt === null ? { ...m, resumedAt: now } : m);
      taken.add(m.spot);
    }
  }
  for (const { a, want } of fresh) {
    let spot = 0;
    while (taken.has(spot)) spot++;
    taken.add(spot);
    if (spot >= COFFEE_SPOTS) continue;
    next.set(a.key, { kind: want.kind, since: want.since, resumedAt: null, spot });
  }
  return next;
}

function tripFrame(s: TripSample, drink: Drink): Frame {
  return {
    x: s.x,
    y: s.y,
    pose: s.pose,
    mirror: s.mirror,
    carryPaper: false,
    opacity: s.opacity,
    rest: s.phase === "seated",
    standing: false,
    phase: s.phase,
    drink,
  };
}

function tripDrive(trip: Trip, ctx: TripCtx, deskZ: number): Drive {
  const idle = trip.kind === "idle";
  const at = (t: number) => (idle ? idleTrip : waitTrip)(ctx, trip.since, trip.resumedAt, t);
  return {
    deskZ,
    frame: (t) =>
      tripFrame(
        at(t),
        idle
          ? idleTripDrink(ctx, trip.since)
          : // After it resumed the parent only walks back: the drink stays that of the break it left.
            waitTripDrink(ctx, trip.since, Math.min(t, trip.resumedAt ?? t)),
      ),
    settled: (t) => {
      const s = at(t);
      if (trip.resumedAt !== null) return s.phase === "seated";
      // A waiting parent rests at the station and on its seat between breaks; nextChange wakes it.
      if (!idle) return s.phase === "seated" || s.phase === "at-coffee";
      return s.phase === "seated" && t - trip.since >= IDLE_BEFORE_TRIP_MS;
    },
    nextChange: (t) => (idle ? idleTripNext : waitTripNext)(ctx, trip.since, trip.resumedAt, t),
  };
}

function subagentDrive(a: Agent, ctx: SubagentCtx, deskZ: number | null): Drive | null {
  if (subagentPath(a, ctx, 0) === null) return null;
  const at = (t: number) => subagentPath(a, ctx, t)!;
  const drive: Drive = {
    deskZ,
    frame: (t) => {
      const s = at(t);
      return {
        x: s.x,
        y: s.y,
        pose: s.pose,
        mirror: s.mirror,
        carryPaper: s.carryPaper,
        opacity: s.opacity,
        rest: s.phase === "working",
        standing: ctx.workDesk === null,
      };
    },
    settled: (t) => {
      const s = at(t);
      return s.phase === "working" || (s.phase === "leaving" && s.opacity <= 0);
    },
    // Walking or pausing it is never settled; once settled nothing changes.
    nextChange: (t) => (drive.settled(t) ? null : t),
  };
  return drive;
}

export type MotionInput = {
  agents: readonly Agent[];
  seats: Seats;
  layout: OfficeLayout;
  geo: Geometry;
  /** The previous `desks`, so a subagent keeps its work desk. */
  prevDesks: ReadonlyMap<string, number | null>;
  /** The previous `trips`. */
  prevTrips: ReadonlyMap<string, Trip>;
  /** The previous `subs` and `cache`, so a re-planned subagent walks on and drives stay stable. */
  prevSubs?: ReadonlyMap<string, SubMemory>;
  prevCache?: ReadonlyMap<string, CacheEntry>;
  reducedMotion: boolean;
  now: number;
};

/** Where a subagent was planned last time: its path context, or its place in the door queue. */
export type SubMemory = { ctx: SubagentCtx | null; queue: number | null };
/** A built drive and what it was built from; reused while all of that is unchanged. */
export type CacheEntry = { geo: Geometry; ctx: SubagentCtx | null; sig: string; drive: Drive };

export type Motion = {
  /** Work desk per subagent whose parent has a seat (null: standing slot); pass back next time. */
  desks: Map<string, number | null>;
  /** Subagents sitting at an empty desk (also in reduced motion, where they just appear there). */
  workDeskOf: Map<string, number>;
  /** Slots and door queue for the subagents that have no work desk. */
  plan: SubagentPlan;
  trips: Map<string, Trip>;
  /** Agents that walk; always empty in reduced motion. Same object while nothing changed. */
  drives: Map<string, Drive>;
  /** Pass back next time as `prevSubs` / `prevCache`. */
  subs: Map<string, SubMemory>;
  cache: Map<string, CacheEntry>;
};

const queueSpotOf = (geo: Geometry, queue: number): Point =>
  stand(geo.queueSpot(Math.min(queue, QUEUE_VISIBLE - 1)));

/** A drive is rebuilt only when its inputs changed, so a render does not restart its animation. */
type Keep = (
  key: string,
  ctx: SubagentCtx | null,
  sig: string,
  make: () => Drive | null,
) => Drive | null;

/** Coffee-trip drives of top-level agents, into `drives`. */
function planTripDrives(
  input: MotionInput,
  trips: ReadonlyMap<string, Trip>,
  keep: Keep,
  drives: Map<string, Drive>,
): void {
  const { agents, seats, layout, geo } = input;
  for (const a of agents) {
    if (a.agentId !== null) continue;
    const parent = seats[a.sessionId];
    const trip = trips.get(a.key);
    if (!trip || parent === undefined) continue;
    const sig = `${trip.kind}|${trip.since}|${trip.resumedAt}|${trip.spot}|${parent}`;
    const drive = keep(a.key, null, sig, () => {
      const ctx = {
        geo,
        desk: parent,
        spot: trip.spot,
        seatPose: "seated-idle" as const,
        seed: a.key,
      };
      return tripDrive(trip, ctx, deskZ(layout, parent));
    });
    if (drive) drives.set(a.key, drive);
  }
}

/** Path contexts and drives of subagents, into `subs` and `drives`. */
function planSubagentDrives(
  input: MotionInput,
  workDeskOf: ReadonlyMap<string, number>,
  plan: SubagentPlan,
  keep: Keep,
  subs: Map<string, SubMemory>,
  drives: Map<string, Drive>,
): void {
  const { agents, seats, layout, geo, now } = input;
  for (const a of agents) {
    if (a.agentId === null) continue;
    const parent = seats[a.sessionId];
    if (parent === undefined) continue;

    const workDesk = workDeskOf.get(a.key) ?? null;
    const slot = plan.slot.get(a.key);
    const was = input.prevSubs?.get(a.key);
    // Queued subagents stand at the door.
    if (workDesk === null && slot === undefined && a.state !== "leaving") {
      subs.set(a.key, { ctx: null, queue: plan.queue.indexOf(a.key) });
      continue;
    }
    const want: SubagentCtx = { geo, parentDesk: parent, workDesk, slotIndex: slot?.index ?? 0 };
    let ctx = want;
    if (a.state === "leaving") {
      // A leaver walks out from where it really stood: its last path context, else its queue spot.
      if (was?.ctx) ctx = was.ctx.geo === geo ? was.ctx : { ...was.ctx, geo };
      else if (was?.queue != null) {
        const spot = queueSpotOf(geo, was.queue);
        ctx = {
          ...want,
          workDesk: null,
          home: spot,
          resume: { at: a.arrivedAt, point: spot, mirror: false, carry: false },
        };
      }
    } else if (was?.ctx) {
      const o = was.ctx;
      const same =
        o.parentDesk === parent &&
        o.workDesk === workDesk &&
        (workDesk !== null || o.slotIndex === want.slotIndex);
      if (same) ctx = o.geo === geo ? o : { ...o, geo };
      else {
        // Re-planned (its desk was taken, a sibling left): walk on from where it is now.
        const at = subagentPath(a, o, now);
        if (at)
          ctx = {
            ...want,
            resume: {
              at: now,
              point: { x: at.x, y: at.y },
              mirror: at.mirror,
              carry: at.carryPaper,
            },
          };
      }
    } else if (was?.queue != null) {
      const point = queueSpotOf(geo, was.queue);
      ctx = { ...want, resume: { at: now, point, mirror: false, carry: false } };
    }
    subs.set(a.key, { ctx, queue: null });
    const sig = `${a.phase}|${a.arrivedAt}|${a.leftAt}`;
    const drive = keep(a.key, ctx, sig, () =>
      subagentDrive(a, ctx, ctx.workDesk === null ? null : deskZ(layout, ctx.workDesk)),
    );
    if (drive) drives.set(a.key, drive);
  }
}

export function planMotion(input: MotionInput): Motion {
  const { agents, seats, layout, geo, reducedMotion, now } = input;
  const kids = agents.filter((a) => a.agentId !== null && seats[a.sessionId] !== undefined);
  const desks = assignWorkDesks(
    input.prevDesks,
    kids,
    new Set(Object.values(seats)),
    layout.desks.length,
  );
  const workDeskOf = new Map<string, number>();
  for (const [key, desk] of desks) if (desk !== null) workDeskOf.set(key, desk);
  const plan = planSubagents(
    agents.filter((a) => !workDeskOf.has(a.key)),
    seats,
  );
  const trips = reducedMotion
    ? new Map<string, Trip>()
    : updateTrips(input.prevTrips, agents, seats, now);
  const drives = new Map<string, Drive>();
  const subs = new Map<string, SubMemory>();
  const cache = new Map<string, CacheEntry>();
  if (reducedMotion) return { desks, workDeskOf, plan, trips, drives, subs, cache };

  const keep: Keep = (key, ctx, sig, make) => {
    const old = input.prevCache?.get(key);
    const drive = old && old.geo === geo && old.ctx === ctx && old.sig === sig ? old.drive : make();
    if (drive) cache.set(key, { geo, ctx, sig, drive });
    return drive;
  };
  planTripDrives(input, trips, keep, drives);
  planSubagentDrives(input, workDeskOf, plan, keep, subs, drives);
  return { desks, workDeskOf, plan, trips, drives, subs, cache };
}

type Scheduler = {
  raf: (cb: () => void) => number;
  caf: (id: number) => void;
  setTimeout: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
};

/** setTimeout holds its delay in 32 bits; a later change just re-arms. */
export const MAX_WAKE_MS = 2 ** 31 - 1;
/** A wake-up due now or already late waits one frame, so it can never spin. */
const MIN_WAKE_MS = 16;

/**
 * Runs `frame` at once and then on every animation frame until the drive is settled. A settled
 * drive with a next change (`nextChange`) arms one timer for it and restarts the frame loop when
 * it fires, so a rest between two movements costs nothing but that timer. Returns the cleanup that
 * cancels the pending frame and timer. The only place a settled agent stops costing anything.
 */
export function runLoop(
  drive: Drive,
  clock: () => number,
  frame: (t: number) => void,
  sched: Scheduler = {
    raf: (cb) => requestAnimationFrame(cb),
    caf: (id) => cancelAnimationFrame(id),
    setTimeout: (cb, ms) => setTimeout(cb, ms),
    clearTimeout: (id) => clearTimeout(id),
  },
): () => void {
  let id = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const step = () => {
    timer = null;
    const t = clock();
    frame(t);
    if (!drive.settled(t)) {
      id = sched.raf(step);
      return;
    }
    const next = drive.nextChange(t);
    if (next === null) return;
    const wait = next > t ? Math.ceil(next - t) + 1 : MIN_WAKE_MS;
    timer = sched.setTimeout(step, Math.min(wait, MAX_WAKE_MS));
  };
  step();
  return () => {
    sched.caf(id);
    if (timer !== null) sched.clearTimeout(timer);
  };
}

/** The foot point the overlay hangs from: seated frames end at the chair base, others at the soles. */
export function overlayFoot(f: Frame): Point {
  return f.rest && !f.standing
    ? { x: f.x, y: f.y - STANDING_FOOT + SEATED_FOOT }
    : { x: f.x, y: f.y };
}

/** Hit-area center and tag anchor in screen px for an overlay foot point, at a fit. */
export function overlayPoints(foot: Point, fit: Fit, hit: number) {
  const left = foot.x * fit.scale + fit.x;
  const top = (foot.y - TORSO) * fit.scale + fit.y;
  return { hit: { left, top }, tag: { left, top: top + hit / 2 + 4 } };
}

/** `calc()` for one overlay coordinate: room px through the fit vars, plus screen px. */
function fitCalc(axis: "x" | "y", room: number, screen = 0): string {
  const s = axis === "x" ? "--fit-x" : "--fit-y";
  return `calc(var(--fit-s) * ${room}px + var(${s})${screen === 0 ? "" : ` + ${screen}px`})`;
}

/**
 * The same points as `overlayPoints`, as CSS in terms of the overlay container's fit vars
 * (--fit-s, --fit-x, --fit-y), so they ease with the camera instead of jumping.
 */
export function overlayCalc(foot: Point, hit: number) {
  const left = fitCalc("x", foot.x);
  const room = foot.y - TORSO;
  return {
    hit: { left, top: fitCalc("y", room) },
    tag: { left, top: fitCalc("y", room, hit / 2 + 4) },
  };
}

/** A room point through the fit vars plus a screen-px offset (a bubble's own size and nudge). */
export function roomCalcAt(p: Point, offset: Point) {
  return { left: fitCalc("x", p.x, offset.x), top: fitCalc("y", p.y, offset.y) };
}

/** A queue-marker style position: a room point through the fit vars. */
export function roomCalc(p: Point) {
  return { left: fitCalc("x", p.x), top: fitCalc("y", p.y) };
}

/** Debug hooks (data-break, data-drink): written only on change, removed when the frame has no trip. */
export function syncTripAttrs(
  node: { dataset: Record<string, string | undefined> },
  f: Pick<Frame, "phase" | "drink">,
): void {
  for (const [name, value] of [
    ["break", f.phase],
    ["drink", f.drink],
  ] as const) {
    if (value === undefined) {
      if (name in node.dataset) delete node.dataset[name];
    } else if (node.dataset[name] !== value) node.dataset[name] = value;
  }
}

/** Stacking: behind its desk when seated (a raised arm in front), otherwise by foot depth. */
export function frameZ(f: Frame, deskZ: number | null, attention: boolean): number {
  return deskZ !== null && f.rest && !f.standing ? deskZ + (attention ? 1 : -1) : Math.round(f.y);
}

/** The rig pose of an agent that is not driven by a path (seated at its desk, on a slot, queued). */
export function legacyPose(
  displayed: AgentState,
  o: { seated: boolean; subagent: boolean; reducedMotion: boolean },
): RigPose {
  const pose = poseForState(displayed);
  if (pose === "walking") {
    // A waiting parent with no coffee spot left stays seated.
    if (!o.reducedMotion && !(o.seated && displayed === "waiting-on-subagents")) return pose;
    return o.seated || !o.subagent ? "seated-idle" : "standing";
  }
  if (pose === "standing-mug") return o.seated ? "seated-idle" : pose;
  if (!o.subagent || pose === "seated-raised-hand") return pose;
  return o.seated ? pose : "standing";
}

/** The rig pose of a driven agent at rest: its state's pose, seated or standing as it is placed. */
export function restPose(displayed: AgentState, standing: boolean): RigPose {
  const pose = poseForState(displayed);
  if (pose === "seated-raised-hand") return pose;
  if (standing) return "standing";
  return pose === "walking" ? "seated-typing" : pose === "standing-mug" ? "seated-idle" : pose;
}
