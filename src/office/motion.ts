import {
  assignWorkDesks,
  idleTrip,
  subagentPath,
  waitTrip,
  IDLE_BEFORE_TRIP_MS,
  RETURN_CAP_MS,
  type SubagentCtx,
  type TripCtx,
  type TripSample,
} from "./choreo";
import type { OfficeLayout } from "./iso";
import type { Agent } from "./machine";
import { poseForState, type AgentState, type Pose } from "./poses";
import type { RigPose } from "./CharacterRig";
import { COFFEE_SPOTS } from "./room";
import {
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
};

export type Drive = {
  /** Stacking value of the desk the agent sits at, or null when it never sits at one. */
  deskZ: number | null;
  frame(t: number): Frame;
  /** True once nothing will move without new props: the Character stops its animation loop. */
  settled(t: number): boolean;
};

/** A remembered coffee trip; the machine forgets idleSince and the wait start once they end. */
export type Trip = {
  kind: "idle" | "wait";
  since: number;
  /** When the reason for the trip ended; null while it lasts. */
  resumedAt: number | null;
  spot: number;
};

const deskZOf = (layout: OfficeLayout, desk: number) => Math.round(layout.desks[desk].y + 30);

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
    if (a.state === "waiting-on-subagents") return { kind: "wait", since: now };
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

function tripFrame(s: TripSample): Frame {
  return {
    x: s.x,
    y: s.y,
    pose: s.pose,
    mirror: s.mirror,
    carryPaper: false,
    opacity: s.opacity,
    rest: s.phase === "seated",
    standing: false,
  };
}

function tripDrive(trip: Trip, ctx: TripCtx, deskZ: number): Drive {
  const at = (t: number) =>
    (trip.kind === "idle" ? idleTrip : waitTrip)(ctx, trip.since, trip.resumedAt, t);
  return {
    deskZ,
    frame: (t) => tripFrame(at(t)),
    settled: (t) => {
      const s = at(t);
      if (trip.resumedAt !== null) return s.phase === "seated";
      if (trip.kind === "wait") return s.phase === "at-coffee";
      return s.phase === "seated" && t - trip.since >= IDLE_BEFORE_TRIP_MS;
    },
  };
}

function subagentDrive(a: Agent, ctx: SubagentCtx, deskZ: number | null): Drive | null {
  if (subagentPath(a, ctx, 0) === null) return null;
  const at = (t: number) => subagentPath(a, ctx, t)!;
  return {
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
  };
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
  standing(geo.queueSpot(Math.min(queue, QUEUE_VISIBLE - 1)));
const standing = (p: Point): Point => ({ x: p.x, y: p.y - SEATED_FOOT + STANDING_FOOT });

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

  // A drive is rebuilt only when its inputs changed, so a render does not restart its animation.
  const keep = (
    key: string,
    ctx: SubagentCtx | null,
    sig: string,
    make: () => Drive | null,
  ): Drive | null => {
    const old = input.prevCache?.get(key);
    const drive = old && old.geo === geo && old.ctx === ctx && old.sig === sig ? old.drive : make();
    if (drive) cache.set(key, { geo, ctx, sig, drive });
    return drive;
  };

  for (const a of agents) {
    const parent = seats[a.sessionId];
    if (a.agentId === null) {
      const trip = trips.get(a.key);
      if (trip && parent !== undefined) {
        const sig = `${trip.kind}|${trip.since}|${trip.resumedAt}|${trip.spot}|${parent}`;
        const drive = keep(a.key, null, sig, () => {
          const ctx = { geo, desk: parent, spot: trip.spot, seatPose: "seated-idle" as const };
          return tripDrive(trip, ctx, deskZOf(layout, parent));
        });
        if (drive) drives.set(a.key, drive);
      }
      continue;
    }
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
      subagentDrive(a, ctx, ctx.workDesk === null ? null : deskZOf(layout, ctx.workDesk)),
    );
    if (drive) drives.set(a.key, drive);
  }
  return { desks, workDeskOf, plan, trips, drives, subs, cache };
}

/**
 * Runs `frame` at once and then on every animation frame until the drive is settled; returns the
 * cleanup that cancels the pending frame. The only place a settled agent stops costing anything.
 */
export function runLoop(
  drive: Drive,
  clock: () => number,
  frame: (t: number) => void,
  sched: { raf: (cb: () => void) => number; caf: (id: number) => void } = {
    raf: (cb) => requestAnimationFrame(cb),
    caf: (id) => cancelAnimationFrame(id),
  },
): () => void {
  let id = 0;
  const step = () => {
    const t = clock();
    frame(t);
    if (!drive.settled(t)) id = sched.raf(step);
  };
  step();
  return () => sched.caf(id);
}

/** The foot point the overlay hangs from: seated frames end at the chair base, others at the soles. */
export function overlayFoot(f: Frame): Point {
  return f.rest && !f.standing
    ? { x: f.x, y: f.y - STANDING_FOOT + SEATED_FOOT }
    : { x: f.x, y: f.y };
}

/** Hit-area center and tag anchor in screen px for an overlay foot point. */
export function overlayPoints(foot: Point, scale: number, hit: number) {
  const left = foot.x * scale;
  const top = (foot.y - TORSO) * scale;
  return { hit: { left, top }, tag: { left, top: top + hit / 2 + 4 } };
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
