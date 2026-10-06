// Paper: <paperOnDesk parent subagents ctxOf now/> whether the sheet lies on a parent's desk, and when that next changes.
// Pure and a function of timestamps: the sheet is there from a subagent's arrival until it takes the paper, and
// from a leaver's handover until the parent has had it a while. Times follow the paths in choreo.ts.
// Also owns the door ajar's timing from the same spans: doorOpen, doorOpenFor and DOOR_TUNING.
import type { SubagentKind } from "../../shared/events";
import {
  FADE_MS,
  HANDOVER_MS,
  PAPER_MS,
  WALK_SPEED,
  stand,
  subagentDoorAt,
  subagentPath,
  type SubagentCtx,
} from "./choreo";
import { TUNING, type Agent } from "./machine";
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
  /** Distinct kinds of the sheets live now (not merely fading), in order of span start. */
  kinds: readonly SubagentKind[];
};

type Sub = Pick<Agent, "phase" | "arrivedAt" | "leftAt">;
/** A subagent as the paper sees it; `key` finds its kind (a missing one reads as "other"). */
type PaperSub = Sub & { key?: string };

/** What a sheet is labelled with, per kind (a Record, so a new kind fails to compile). */
export const PAPER_KIND_LABEL: Record<SubagentKind, string> = {
  explore: "Explore",
  plan: "Plan",
  general: "General",
  other: "Subagent",
};

/** The label shows at most this many kinds; the rest collapse into ` +N`. */
export const PAPER_LABEL_MAX = 3;

/** The label for a sheet's kinds: the first PAPER_LABEL_MAX, then ` +N` for the rest; "" for none. */
export function paperLabel(kinds: readonly SubagentKind[]): string {
  const shown = kinds.slice(0, PAPER_LABEL_MAX).map((k) => PAPER_KIND_LABEL[k]);
  const more = kinds.length - PAPER_LABEL_MAX;
  return more > 0 ? `${shown.join(", ")} +${more}` : shown.join(", ");
}

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
/** A span with the kind of the child it belongs to. */
type Item = { span: Span | null; kind: SubagentKind };

/** Folds the spans into the sheet's state at `now`. */
function fold(items: readonly Item[], now: number): Paper {
  let since: number | null = null;
  const live: { start: number; kind: SubagentKind }[] = [];
  let fading = false;
  let next = Infinity;
  const soon = (t: number) => {
    if (t > now) next = Math.min(next, t);
  };
  for (const { span, kind } of items) {
    if (!span) continue;
    const [start, end] = span;
    if (end <= start) continue;
    soon(start);
    if (now >= start && now < end) {
      live.push({ start, kind });
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
    kinds: [...new Set(live.sort((a, b) => a.start - b.start).map((l) => l.kind))],
  };
}

const kindOf = (kinds: Readonly<Record<string, SubagentKind>>, a: PaperSub): SubagentKind =>
  (a.key !== undefined && Object.hasOwn(kinds, a.key) ? kinds[a.key] : undefined) ?? "other";

/**
 * The sheet on one parent desk. `subagents` are that session's subagents, `ctxOf` their path
 * context (the one the walk uses, `Motion.subs`; null: no walk, so no sheet). `parent.state` ends
 * the hold: the sheet stays while the parent waits on subagents (up to PAPER_MAX_MS) and
 * otherwise PAPER_HOLD_MS.
 */
export function paperOnDesk<S extends PaperSub>(
  parent: Pick<Agent, "state">,
  subagents: readonly S[],
  ctxOf: (a: S) => SubagentCtx | null,
  now: number,
  kinds: Readonly<Record<string, SubagentKind>> = {},
): Paper {
  const waiting = parent.state === "waiting-on-subagents";
  const items: Item[] = [];
  for (const a of subagents) {
    const ctx = ctxOf(a);
    const kind = kindOf(kinds, a);
    if (ctx) {
      items.push({ span: arrivalSpan(a, ctx), kind }, { span: leavingSpan(a, ctx, waiting), kind });
    }
  }
  return fold(items, now);
}

/**
 * Reduced motion: nobody walks, so the sheet follows state alone. It lies for one handover time
 * from a subagent's arrival and from a leaver's departure (the leaving hold as above), fading in
 * and out; there is no taking or handing over in between.
 */
export function stillPaperOnDesk(
  parent: Pick<Agent, "state">,
  subagents: readonly PaperSub[],
  now: number,
  kinds: Readonly<Record<string, SubagentKind>> = {},
): Paper {
  const waiting = parent.state === "waiting-on-subagents";
  const items: Item[] = [];
  for (const a of subagents) {
    const kind = kindOf(kinds, a);
    const gone = a.phase === "leaving" ? (a.leftAt ?? a.arrivedAt) : Infinity;
    items.push({ span: [a.arrivedAt, Math.min(a.arrivedAt + HANDOVER_MS, gone)], kind });
    if (a.phase === "leaving") {
      items.push({ span: [gone, gone + (waiting ? PAPER_MAX_MS : PAPER_HOLD_MS)], kind });
    }
  }
  return fold(items, now);
}

/** The sheet on a parent's desk, from the plan the walkers use (`motion`). */
export function paperOfParent(
  parent: Agent,
  agents: readonly Agent[],
  motion: Pick<Motion, "subs" | "workDeskOf" | "plan">,
  reducedMotion: boolean,
  now: number,
  kinds: Readonly<Record<string, SubagentKind>> = {},
): Paper {
  const subs = agents.filter((a) => a.agentId !== null && a.sessionId === parent.sessionId);
  if (reducedMotion) {
    // Only those that appear (at a desk or a slot), as in the scene.
    const placed = subs.filter((a) => motion.workDeskOf.has(a.key) || motion.plan.slot.has(a.key));
    return stillPaperOnDesk(parent, placed, now, kinds);
  }
  return paperOnDesk(parent, subs, (a) => motion.subs.get(a.key)?.ctx ?? null, now, kinds);
}

/** Door ajar: how long it opens for an arrival and ahead of a leaver, and the run cap. */
export const DOOR_TUNING = {
  /** An arriving subagent holds the door open this long from `arrivedAt`. */
  ARRIVE_OPEN_MS: 1200,
  /** A leaver opens it this long before it reaches the door (and it closes FADE_MS after). */
  LEAD_MS: 600,
  /** An open run lasts at most this long... */
  RUN_CAP_MS: 2000,
  /** ...and is followed by this long closed. */
  GAP_MS: 400,
  /** One call looks at no more runs than this (a guard: real schedules are far below it). */
  MAX_RUNS: 64,
};

export type Door = {
  open: boolean;
  /** The next instant the answer changes (epoch ms), null when it will not by itself. */
  nextChange: number | null;
};

const CLOSED: Door = { open: false, nextChange: null };

/** The open windows of each subagent (arrival; leaving, ending at its removal), non-finite spans dropped. */
function doorWindows<S extends Sub>(
  subs: readonly S[],
  ctxOf: (a: S) => SubagentCtx | null,
  now: number,
): Span[] {
  const { ARRIVE_OPEN_MS, LEAD_MS } = DOOR_TUNING;
  const spans: Span[] = [];
  for (const a of subs) {
    const ctx = ctxOf(a);
    if (!ctx) continue;
    const leaving = a.phase === "leaving";
    const leftAt = a.leftAt ?? a.arrivedAt;
    if (leaving && now < leftAt) continue;
    const removal = leaving ? leftAt + TUNING.subagentLeavingMs : Infinity;
    // Only one that walks in from the door opens it (not a re-planned one, which walks on).
    if (!ctx.resume) spans.push([a.arrivedAt, Math.min(a.arrivedAt + ARRIVE_OPEN_MS, removal)]);
    const reach = subagentDoorAt(a, ctx);
    if (reach !== null) spans.push([reach - LEAD_MS, Math.min(reach + FADE_MS, removal)]);
  }
  return spans.filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s);
}

/**
 * Whether the door stands ajar at `now`, and when that next changes. It opens while a subagent
 * walks in from it or out to it (windows above), the windows are unioned, and no run stays open
 * longer than RUN_CAP_MS: it then closes for GAP_MS (also after a run that ended by itself).
 */
export function doorOpenFor<S extends Sub>(
  subs: readonly S[],
  ctxOf: (a: S) => SubagentCtx | null,
  now: number,
): Door {
  if (!Number.isFinite(now)) return CLOSED;
  const windows = doorWindows(subs, ctxOf, now).sort((a, b) => a[0] - b[0]);
  const merged: Span[] = [];
  for (const [s, e] of windows) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const { RUN_CAP_MS, GAP_MS, MAX_RUNS } = DOOR_TUNING;
  // A window that ended at least GAP_MS before the next starts leaves nothing behind (its `free`
  // is already past), so those can be dropped; one that ended closer keeps shifting the next run.
  let first = 0;
  for (let i = 0; i + 1 < merged.length; i++)
    if (merged[i][1] <= now && merged[i][1] + GAP_MS <= merged[i + 1][0]) first = i + 1;
  let free = -Infinity;
  let runs = 0;
  for (const [s, e] of merged.slice(first)) {
    for (let a = Math.max(s, free); a < e; a = free) {
      if (a > now) return { open: false, nextChange: a };
      if (++runs > MAX_RUNS) return CLOSED;
      const b = Math.min(e, a + RUN_CAP_MS);
      free = b + GAP_MS;
      if (now >= a && now < b) return { open: true, nextChange: b };
    }
  }
  return CLOSED;
}

/** The door from the plan the walkers use (`motion`); under reduced motion it stays closed. */
export function doorOpen(
  agents: readonly Agent[],
  motion: Pick<Motion, "subs">,
  reducedMotion: boolean,
  now: number,
): Door {
  if (reducedMotion) return CLOSED;
  const subs = agents.filter((a) => a.agentId !== null);
  return doorOpenFor(subs, (a) => motion.subs.get(a.key)?.ctx ?? null, now);
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
