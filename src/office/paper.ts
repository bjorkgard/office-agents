// Paper: <paperOnDesk parent subagents ctxOf now/> whether the sheet lies on a parent's desk, and when that next changes.
// Pure and a function of timestamps: the sheet is there from a subagent's arrival until it takes the paper, and
// from a leaver's handover until the parent has had it a while. Times follow the paths in choreo.ts.
import { HANDOVER_MS, PAPER_MS, WALK_SPEED, stand, subagentPath, type SubagentCtx } from "./choreo";
import type { Agent } from "./machine";
import { MAX_WAKE_MS, type Motion } from "./motion";

/** After a leaver hands the paper over it lies at least this long. */
export const PAPER_HOLD_MS = 4000;
/** It never lies longer than this, whatever the parent does. */
export const PAPER_MAX_MS = 30_000;
/** The sheet fades out over this long (--dur-slow). */
export const PAPER_FADE_MS = 600;

export type Paper = {
  visible: boolean;
  /** Still fading out after its end. */
  fading: boolean;
  /** When the sheet appeared (epoch ms), null when none lies. */
  since: number | null;
  /** The next instant the answer changes (epoch ms), null when it will not by itself. */
  nextChange: number | null;
};

type Sub = Pick<Agent, "phase" | "arrivedAt" | "leftAt">;

const walkMs = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  (Math.hypot(b.x - a.x, b.y - a.y) / WALK_SPEED) * 1000;

/** The sheet lies from arrival until the arriving subagent takes it (or leaves first). */
function arrivalSpan(a: Sub, ctx: SubagentCtx): [number, number] | null {
  // A re-planned or formerly queued subagent walks straight on (no pause at the parent's desk).
  if (ctx.parentDesk === null || ctx.resume) return null;
  const stop = stand(ctx.geo.slot(ctx.parentDesk, 0));
  const took = a.arrivedAt + walkMs(ctx.geo.door, stop) + PAPER_MS;
  return [a.arrivedAt, a.phase === "leaving" ? Math.min(took, a.leftAt ?? took) : took];
}

/** The sheet lies from the leaver's handover until the hold ends (a longer one while the parent waits). */
function leavingSpan(a: Sub, ctx: SubagentCtx, waiting: boolean): [number, number] | null {
  if (ctx.parentDesk === null || a.phase !== "leaving") return null;
  const leftAt = a.leftAt ?? a.arrivedAt;
  const from = subagentPath(
    { phase: "working", arrivedAt: a.arrivedAt, leftAt: null },
    ctx,
    leftAt,
  );
  if (!from) return null;
  const stop = stand(ctx.geo.slot(ctx.parentDesk, 0));
  const start = leftAt + walkMs(from, stop) + PAPER_MS;
  return [start, start + (waiting ? PAPER_MAX_MS : PAPER_HOLD_MS)];
}

type Span = [number, number];

/** Folds the spans into the sheet's state at `now`. */
function fold(spans: readonly (Span | null)[], now: number): Paper {
  let since: number | null = null;
  let fading = false;
  let next = Infinity;
  const soon = (t: number) => {
    if (t > now) next = Math.min(next, t);
  };
  for (const span of spans) {
    if (!span) continue;
    const [start, end] = span;
    if (end <= start) continue;
    soon(start);
    if (now >= start && now < end) {
      since = since === null ? start : Math.min(since, start);
      soon(end);
    } else if (now >= end && now < end + PAPER_FADE_MS) {
      fading = true;
      soon(end + PAPER_FADE_MS);
    }
  }
  const visible = since !== null;
  return {
    visible,
    fading: !visible && fading,
    since,
    nextChange: Number.isFinite(next) ? next : null,
  };
}

/**
 * The sheet on one parent desk. `subagents` are that session's subagents, `ctxOf` their path
 * context (the one the walk uses, `Motion.subs`; null: no walk, so no sheet). `parent.state` ends
 * the hold: the sheet stays while the parent waits on subagents (up to PAPER_MAX_MS) and
 * otherwise PAPER_HOLD_MS.
 */
export function paperOnDesk<S extends Sub>(
  parent: Pick<Agent, "state">,
  subagents: readonly S[],
  ctxOf: (a: S) => SubagentCtx | null,
  now: number,
): Paper {
  const waiting = parent.state === "waiting-on-subagents";
  const spans: (Span | null)[] = [];
  for (const a of subagents) {
    const ctx = ctxOf(a);
    if (ctx) spans.push(arrivalSpan(a, ctx), leavingSpan(a, ctx, waiting));
  }
  return fold(spans, now);
}

/**
 * Reduced motion: nobody walks, so the sheet follows state alone. It lies for one handover time
 * from a subagent's arrival and from a leaver's departure (the leaving hold as above), fading in
 * and out; there is no taking or handing over in between.
 */
export function stillPaperOnDesk(
  parent: Pick<Agent, "state">,
  subagents: readonly Sub[],
  now: number,
): Paper {
  const waiting = parent.state === "waiting-on-subagents";
  const spans: Span[] = [];
  for (const a of subagents) {
    const gone = a.phase === "leaving" ? (a.leftAt ?? a.arrivedAt) : Infinity;
    spans.push([a.arrivedAt, Math.min(a.arrivedAt + HANDOVER_MS, gone)]);
    if (a.phase === "leaving") spans.push([gone, gone + (waiting ? PAPER_MAX_MS : PAPER_HOLD_MS)]);
  }
  return fold(spans, now);
}

/** The sheet on a parent's desk, from the plan the walkers use (`motion`). */
export function paperOfParent(
  parent: Agent,
  agents: readonly Agent[],
  motion: Pick<Motion, "subs" | "workDeskOf" | "plan">,
  reducedMotion: boolean,
  now: number,
): Paper {
  const subs = agents.filter((a) => a.agentId !== null && a.sessionId === parent.sessionId);
  if (reducedMotion) {
    // Only those that appear (at a desk or a slot), as in the scene.
    const placed = subs.filter((a) => motion.workDeskOf.has(a.key) || motion.plan.slot.has(a.key));
    return stillPaperOnDesk(parent, placed, now);
  }
  return paperOnDesk(parent, subs, (a) => motion.subs.get(a.key)?.ctx ?? null, now);
}

/** Milliseconds to wait for a timer to reach `next`: rounded up, plus 1, so it never fires early. */
export const paperDelay = (next: number, now: number) => Math.ceil(Math.max(0, next - now)) + 1;

/** Arms one timer that calls `bump` at `next` (epoch ms, null: none); returns its cancel. */
export function armPaperTimer(
  next: number | null,
  clock: () => number,
  bump: () => void,
  schedule: (fn: () => void, ms: number) => unknown = setTimeout,
  cancel: (id: never) => void = clearTimeout,
): () => void {
  if (next === null || !Number.isFinite(next)) return () => {};
  const id = schedule(bump, Math.min(paperDelay(next, clock()), MAX_WAKE_MS));
  return () => cancel(id as never);
}
