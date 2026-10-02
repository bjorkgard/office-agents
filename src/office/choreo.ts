import { SEATED_FOOT, STANDING_FOOT, type Geometry, type Point } from "./scene-model";
import type { Agent } from "./machine";
import { byKey } from "./selectors";
import type { Pose } from "./poses";

/**
 * Pure movement choreography: where an agent is, and how it looks, at time `now`. No DOM, no
 * React, no timers; every function is a function of timestamps, so the same inputs always give
 * the same frame. Waypoints are straight legs in unscaled room px (the floor is convex, so a leg
 * between two floor points stays on the floor); desks are not routed around.
 *
 * Every returned x/y is a STANDING foot point (bottom center of the rig, `STANDING_FOOT` below
 * its top), whatever the pose: the rig's top-left is always (x - RIG_WIDTH / 2, y - STANDING_FOOT),
 * so a pose change at a desk never moves the sprite. `mirror` is the existing mirror mechanism
 * (the two authored views, the second one mirrored): true when walking toward screen-left.
 */

/** Walking speed in unscaled room px per second; leg durations follow path length. */
export const WALK_SPEED = 200;
/** Ground covered by one stride (two steps, WALK_A then WALK_B), unscaled room px. */
export const STRIDE_LENGTH = 160;
/** One stride takes this long, so the legs keep pace with WALK_SPEED (DESIGN.md "Motion"). */
export const STRIDE_MS = (STRIDE_LENGTH / WALK_SPEED) * 1000;
/** A subagent stops at its parent's desk this long to receive (and later hand over) the paper. */
export const HANDOVER_MS = 600;
/** The paper changes hands in the middle of the pause. */
export const PAPER_MS = HANDOVER_MS / 2;
/** A leaver fades out at the door this long. */
export const FADE_MS = 400;
/** An idle agent sits this long before it goes for coffee. */
export const IDLE_BEFORE_TRIP_MS = 2000;
/** An idle agent stays at the coffee station this long. */
export const COFFEE_DWELL_MS = 8000;
/** An interrupted trip gets the agent back to its seat within this long (faster than walking if needed). */
export const RETURN_CAP_MS = 1000;

export type { Point };

/** What to draw at one instant. */
export type Sample = {
  x: number;
  y: number;
  pose: Pose;
  mirror: boolean;
  carryPaper: boolean;
  /** 1 except while fading out at the door. */
  opacity: number;
};
export type SubagentSample = Sample & { phase: "arriving" | "working" | "leaving" };
export type TripSample = Sample & { phase: "seated" | "to-coffee" | "at-coffee" | "back" };

// ---------- timeline engine ----------

type Seg<P extends string> = {
  from: Point;
  to: Point;
  ms: number;
  pose: Pose;
  carry: boolean;
  mirror: boolean;
  phase: P;
  fade: boolean;
};

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

function timeline<P extends string>(start: Point, startMirror = false) {
  const segs: Seg<P>[] = [];
  let at = start;
  let face = startMirror;
  return {
    segs,
    walk(to: Point, carry: boolean, phase: P) {
      if (Math.abs(to.x - at.x) > 0.5) face = to.x < at.x;
      const ms = (dist(at, to) / WALK_SPEED) * 1000;
      segs.push({ from: at, to, ms, pose: "walking", carry, mirror: face, phase, fade: false });
      at = to;
    },
    stay(
      ms: number,
      pose: Pose,
      carry: boolean,
      phase: P,
      opts: { face?: boolean; fade?: boolean } = {},
    ) {
      if (opts.face !== undefined) face = opts.face;
      segs.push({
        from: at,
        to: at,
        ms,
        pose,
        carry,
        mirror: face,
        phase,
        fade: opts.fade ?? false,
      });
    },
  };
}

function sampleSegs<P extends string>(segs: readonly Seg<P>[], t: number): Sample & { phase: P } {
  let start = 0;
  let seg = segs[segs.length - 1];
  let u = 1;
  const at = Math.max(0, t);
  for (const s of segs) {
    if (at < start + s.ms) {
      seg = s;
      u = Number.isFinite(s.ms) && s.ms > 0 ? (at - start) / s.ms : 0;
      break;
    }
    start += s.ms;
  }
  return {
    x: seg.from.x + (seg.to.x - seg.from.x) * u,
    y: seg.from.y + (seg.to.y - seg.from.y) * u,
    pose: seg.pose,
    mirror: seg.mirror,
    carryPaper: seg.carry,
    opacity: seg.fade ? 1 - u : 1,
    phase: seg.phase,
  };
}

const total = (segs: readonly Seg<string>[]) => segs.reduce((n, s) => n + s.ms, 0);

/** Geometry's seat and slot points are seated-foot points; paths use standing-foot ones. */
const stand = (p: Point): Point => ({ x: p.x, y: p.y - SEATED_FOOT + STANDING_FOOT });

// ---------- work desks ----------

/**
 * Gives each working subagent an EMPTY desk: an index below `deskCount` that no top-level
 * session sits at (`occupied`) and no other subagent holds. Only desks the room already draws
 * count (`deskCount` is the layout's desk count, highest seated desk + 1): rooms never grow for
 * work desks, so free desks are the gaps below the highest seat. A subagent with no empty desk
 * gets `null` and the caller falls back to the standing slot beside the parent.
 *
 * Deterministic and stable: `prev` (the previous result) is passed back in; an agent keeps its
 * desk until a seated session takes it, then gets the lowest free one (or null). A `null` stays
 * null while the agent lives, so nobody jumps from a slot to a desk mid-task. Agents are handled
 * in arrival order (ties by key); entries for agents no longer passed are dropped. A leaving
 * agent only keeps what it already holds.
 */
export function assignWorkDesks(
  prev: ReadonlyMap<string, number | null>,
  subagents: readonly Pick<Agent, "key" | "arrivedAt" | "phase">[],
  occupied: ReadonlySet<number>,
  deskCount: number,
): Map<string, number | null> {
  const order = [...subagents].sort((a, b) => a.arrivedAt - b.arrivedAt || byKey(a, b));
  const next = new Map<string, number | null>();
  const used = new Set<number>();
  const free = (d: number) =>
    Number.isInteger(d) && d >= 0 && d < deskCount && !occupied.has(d) && !used.has(d);
  for (const a of order) {
    const had = prev.get(a.key);
    if (had === null) next.set(a.key, null);
    else if (had !== undefined && free(had)) {
      next.set(a.key, had);
      used.add(had);
    }
  }
  for (const a of order) {
    if (next.has(a.key)) continue;
    let pick: number | null = null;
    if (a.phase !== "leaving") {
      for (let d = 0; d < deskCount; d++) {
        if (free(d)) {
          pick = d;
          break;
        }
      }
    }
    next.set(a.key, pick);
    if (pick !== null) used.add(pick);
  }
  return next;
}

// ---------- subagent path ----------

export type SubagentCtx = {
  geo: Geometry;
  /** Desk of the parent session; null when it has no seat (then nothing is choreographed). */
  parentDesk: number | null;
  /** Empty desk from `assignWorkDesks`; null falls back to the standing slot beside the parent. */
  workDesk: number | null;
  /** Standing slot (0 or 1) beside the parent desk, used when `workDesk` is null. */
  slotIndex?: number;
  /** Standing-foot point where it settles instead of the desk or slot (a queued subagent leaving). */
  home?: Point;
  /**
   * The agent was re-planned (new work desk or slot) while it stood at `point` at time `at`: it
   * walks on from there to its new home instead of starting again at the door.
   */
  resume?: { at: number; point: Point; mirror: boolean; carry: boolean };
};

type SubPhase = SubagentSample["phase"];

function homeOf(ctx: SubagentCtx): Point | null {
  if (ctx.home) return ctx.home;
  if (ctx.workDesk !== null) return stand(ctx.geo.seat(ctx.workDesk));
  if (ctx.parentDesk !== null) return stand(ctx.geo.slot(ctx.parentDesk, ctx.slotIndex ?? 0));
  return null;
}

/** Where the subagent stops beside the parent's desk to exchange the paper. */
function handoverOf(ctx: SubagentCtx): Point | null {
  return ctx.parentDesk === null ? null : stand(ctx.geo.slot(ctx.parentDesk, 0));
}

function arrivalSegs(ctx: SubagentCtx, home: Point) {
  const r = ctx.resume;
  if (r) {
    const walk = timeline<SubPhase>(r.point, r.mirror);
    walk.walk(home, r.carry, "arriving");
    walk.stay(Infinity, "seated-typing", false, "working", { face: false });
    return walk.segs;
  }
  const tl = timeline<SubPhase>(ctx.geo.door);
  const stop = handoverOf(ctx);
  if (stop) {
    tl.walk(stop, false, "arriving");
    tl.stay(PAPER_MS, "walking", false, "arriving");
    tl.stay(HANDOVER_MS - PAPER_MS, "walking", true, "arriving");
    tl.walk(home, true, "arriving");
  } else {
    tl.walk(home, false, "arriving");
  }
  tl.stay(Infinity, "seated-typing", false, "working", { face: false });
  return tl.segs;
}

function leavingSegs(ctx: SubagentCtx, from: Sample) {
  const tl = timeline<SubPhase>({ x: from.x, y: from.y }, from.mirror);
  const stop = handoverOf(ctx);
  if (stop) {
    tl.walk(stop, true, "leaving");
    tl.stay(PAPER_MS, "walking", true, "leaving");
    tl.stay(HANDOVER_MS - PAPER_MS, "walking", false, "leaving");
  }
  tl.walk(ctx.geo.door, false, "leaving");
  tl.stay(FADE_MS, "walking", false, "leaving", { fade: true });
  return tl.segs;
}

/** Milliseconds from the door to being seated at the work desk (or slot); null if not choreographed. */
export function subagentArrivalMs(ctx: SubagentCtx): number | null {
  const home = homeOf(ctx);
  return home && total(arrivalSegs(ctx, home).slice(0, -1));
}

/** Milliseconds from sitting at the work desk (or slot) to fully faded out at the door. */
export function subagentLeaveMs(ctx: SubagentCtx): number | null {
  const home = homeOf(ctx);
  return home && total(leavingSegs(ctx, { x: home.x, y: home.y, mirror: false } as Sample));
}

/**
 * The subagent's frame at `now`. ARRIVING (from `arrivedAt`, or from `ctx.resume` when it was re-planned): door, the parent's desk (the paper
 * is received in the middle of a pause, `carryPaper` turns on), then its work desk. WORKING:
 * sits there; `pose` is then only the default seated-typing, the caller shows the state's own
 * pose. LEAVING (machine phase `leaving`, from `leftAt`): from wherever it is (a leaver caught
 * mid-arrival continues from there) to the parent's desk, paper handed over (`carryPaper` ends in
 * the middle of the pause), the door, and a fade. Elapsed time past the end of a path lands on
 * its last frame, so an agent first seen long after it arrived (reload) simply sits at its desk.
 * Returns null when there is nowhere to go (no parent desk and no work desk): the caller keeps
 * its queue placement.
 */
export function subagentPath(
  agent: Pick<Agent, "phase" | "arrivedAt" | "leftAt">,
  ctx: SubagentCtx,
  now: number,
): SubagentSample | null {
  const home = homeOf(ctx);
  if (!home) return null;
  const arrival = arrivalSegs(ctx, home);
  const since = ctx.resume?.at ?? agent.arrivedAt;
  if (agent.phase !== "leaving") return sampleSegs(arrival, now - since);
  const leftAt = agent.leftAt ?? now;
  const from = sampleSegs(arrival, leftAt - since);
  return sampleSegs(leavingSegs(ctx, from), now - leftAt);
}

// ---------- coffee trips ----------

export type TripCtx = {
  geo: Geometry;
  /** The agent's own desk. */
  desk: number;
  /** Coffee spot index below COFFEE_SPOTS (room.ts). */
  spot: number;
  /** Pose when seated: seated-idle for an idle trip, seated-typing for a waiting parent. */
  seatPose: Pose;
};

type TripPhase = TripSample["phase"];

function tripSegs(ctx: TripCtx, beforeMs: number, dwellMs: number) {
  const seat = stand(ctx.geo.seat(ctx.desk));
  const cup = ctx.geo.coffeeSpot(ctx.spot);
  const tl = timeline<TripPhase>(seat);
  tl.stay(beforeMs, ctx.seatPose, false, "seated", { face: false });
  tl.walk(cup, false, "to-coffee");
  tl.stay(dwellMs, "standing-mug", false, "at-coffee", { face: true });
  tl.walk(seat, false, "back");
  tl.stay(Infinity, ctx.seatPose, false, "seated", { face: false });
  return tl.segs;
}

/**
 * A trip's frame `elapsed` ms after it began. `resumed` is the elapsed time when the reason
 * for the trip ended (null while it lasts): the agent then walks straight back from wherever it
 * is, within RETURN_CAP_MS.
 */
function tripAt(
  ctx: TripCtx,
  segs: readonly Seg<TripPhase>[],
  elapsed: number,
  resumed: number | null,
): TripSample {
  if (resumed === null || elapsed < resumed) return sampleSegs(segs, elapsed);
  const from = sampleSegs(segs, resumed);
  if (from.phase === "seated") return sampleSegs(segs, Infinity);
  const seat = stand(ctx.geo.seat(ctx.desk));
  const ms = Math.min((dist(from, seat) / WALK_SPEED) * 1000, RETURN_CAP_MS);
  const back = timeline<TripPhase>({ x: from.x, y: from.y }, from.mirror);
  back.walk(seat, false, "back");
  back.segs[0].ms = ms;
  back.stay(Infinity, ctx.seatPose, false, "seated", { face: false });
  return sampleSegs(back.segs, elapsed - resumed);
}

/**
 * An idle top-level agent's coffee trip, deterministic from the time idle began (`idleSince`):
 * sits IDLE_BEFORE_TRIP_MS, walks to its coffee spot, stays COFFEE_DWELL_MS with the mug, walks
 * back and sits idle. `resumedAt` is when it stopped being idle (new work), null while idle.
 */
export function idleTrip(
  ctx: TripCtx,
  idleSince: number,
  resumedAt: number | null,
  now: number,
): TripSample {
  const segs = tripSegs(ctx, IDLE_BEFORE_TRIP_MS, COFFEE_DWELL_MS);
  return tripAt(ctx, segs, now - idleSince, resumedAt === null ? null : resumedAt - idleSince);
}

/**
 * A parent waiting on subagents: walks to the coffee station at once, stays there while the
 * wait lasts, walks back when it ends (`resumedAt`, null while waiting).
 */
export function waitTrip(
  ctx: TripCtx,
  waitSince: number,
  resumedAt: number | null,
  now: number,
): TripSample {
  const segs = tripSegs(ctx, 0, Infinity);
  const resumed = resumedAt === null ? null : resumedAt - waitSince;
  return tripAt(ctx, segs, now - waitSince, resumed);
}
