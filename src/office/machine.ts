import type { AgentEvent } from "../../shared/events";
import { ATTENTION_STALE_MS, STALE_MS } from "../../shared/tuning";
import type { AgentState } from "./poses";

/**
 * Pure office state machine (T7, ET2). No timers, no clock: every function takes `now`
 * (epoch ms) and returns a new state. Callers feed events through `applyEvent` and call
 * `tick` on a short interval to fire the time-based rules (arrival, R1, expiry, leaving).
 * Only ids and timestamps pass through here; no transcript text (DESIGN principle 4).
 */

/** Client state-machine timings. Limits shared with the server live in shared/tuning.ts (E4). */
export const TUNING = {
  /** Silent arriving, working and waiting-on-subagents agents leave after this long (E2). */
  staleMs: STALE_MS,
  /** Silent attention agents leave after this long (E2). */
  attentionStaleMs: ATTENTION_STALE_MS,
  /** Re-entry into attention within this long keeps episodeId and waitingSince (D8). */
  episodeHoldMs: 60 * 1000,
  /** R1: a non-subagent tool call without a result this long waves. */
  toolTimerMs: 10 * 1000,
  /** R2: a top-level agent idle this long walks out. */
  idleLeaveMs: 5 * 60 * 1000,
  /** Walk-in duration before `arriving` becomes `working`. */
  arrivingMs: 1500,
  /** Walk-out duration before a leaving agent is removed. */
  leavingMs: 4000,
  /**
   * Walk-out of a subagent: desk to the parent's desk to the door (choreo.ts), longer than a
   * top-level walk-out. An upper bound; choreo.test.ts checks every room fits.
   */
  subagentLeavingMs: 20000,
};

export type AttentionTrigger = "tool" | "question" | "exact";

type Phase = "arriving" | "working" | "idle" | "leaving";

export type Agent = {
  key: string;
  sessionId: string;
  agentId: string | null;
  projectId: string;
  parentAgentId: string | null;
  state: AgentState;
  phase: Phase;
  arrivedAt: number;
  lastEventAt: number;
  idleSince: number | null;
  leftAt: number | null;
  /** Tool calls without a result yet, by tool id. */
  openTools: Record<string, { startedAt: number; isSubagent: boolean }>;
  /** Launched subagents that have not returned, child agentId to launch time. */
  unresolved: Record<string, number>;
  /** Open sync-launch tool ids the parent is blocked on (D7); ends with the tool result. */
  waitingOn: string[];
  attention: { trigger: AttentionTrigger } | null;
  /** Owned by the machine (T12). `exitedAt` is set while the agent is out of attention. */
  episode: { id: string; waitingSince: number; exitedAt: number | null; exactId?: string } | null;
};

export type OfficeState = {
  agents: Record<string, Agent>;
  episodeSeq: number;
  /** Children already returned by a handoff `back`, agent key to that event's ts. */
  returned: Record<string, number>;
};

const RETURNED_CAP = 2000;

export function createOffice(): OfficeState {
  return { agents: {}, episodeSeq: 0, returned: {} };
}

export function agentKey(sessionId: string, agentId: string | null): string {
  return `${sessionId}\u0000${agentId ?? ""}`;
}

/** Drops one agent and its returned mark (the server says it is gone); `state` itself if absent. */
export function removeAgent(
  state: OfficeState,
  sessionId: string,
  agentId: string | null,
): OfficeState {
  const key = agentKey(sessionId, agentId);
  if (!(key in state.agents) && !(key in state.returned)) return state;
  const { [key]: _agent, ...agents } = state.agents;
  const { [key]: _returned, ...returned } = state.returned;
  return { ...state, agents, returned };
}

/** Sets an own property, so an id like `__proto__` is data and not the prototype setter. */
function setOwn<T>(o: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(o, key, { value, writable: true, enumerable: true, configurable: true });
}

function stateOf(a: Agent): AgentState {
  if (a.phase === "leaving") return "leaving";
  if (a.attention) return "attention";
  if (a.waitingOn.some((id) => Object.hasOwn(a.openTools, id))) return "waiting-on-subagents";
  return a.phase;
}

function settle(a: Agent): void {
  a.waitingOn = a.waitingOn.filter((id) => Object.hasOwn(a.openTools, id));
  a.state = stateOf(a);
}

function arrive(sessionId: string, agentId: string | null, projectId: string, now: number): Agent {
  return {
    key: agentKey(sessionId, agentId),
    sessionId,
    agentId,
    projectId,
    parentAgentId: null,
    state: "arriving",
    phase: "arriving",
    arrivedAt: now,
    lastEventAt: now,
    idleSince: null,
    leftAt: null,
    openTools: {},
    unresolved: {},
    waitingOn: [],
    attention: null,
    episode: null,
  };
}

/** Finds the agent for an event, creating or re-arriving it, and records the activity. */
function touch(
  s: OfficeState,
  sessionId: string,
  agentId: string | null,
  projectId: string,
  now: number,
): Agent {
  const key = agentKey(sessionId, agentId);
  let a = s.agents[key];
  if (!a || a.phase === "leaving") {
    a = arrive(sessionId, agentId, projectId, now);
    s.agents[key] = a;
  } else {
    a.lastEventAt = Math.max(a.lastEventAt, now); // a delayed event must not rewind liveness
  }
  return a;
}

function enterAttention(
  s: OfficeState,
  a: Agent,
  trigger: AttentionTrigger,
  now: number,
  waitingSince = now,
): void {
  if (!a.attention) {
    const ep = a.episode;
    if (ep && ep.exitedAt !== null && now - ep.exitedAt < TUNING.episodeHoldMs) {
      ep.exitedAt = null;
    } else {
      s.episodeSeq += 1;
      a.episode = { id: `${a.key}#${s.episodeSeq}`, waitingSince, exitedAt: null };
    }
  }
  // A heuristic firing for a wait the hooks already announced keeps the exact trigger.
  if (a.attention?.trigger !== "exact") a.attention = { trigger };
  settle(a);
}

/**
 * The hooks adapter's exact signal. One wave per `episodeId`: a repeat (or replay) of the
 * open or just-ended id changes nothing. A new id always wins (D35): it supersedes an open
 * exact episode, and replaces an open heuristic one in place (same id, so live and replay
 * agree), taking the event's since-time. A 0, negative, non-finite or future `waitingSince`
 * is implausible and falls back to the clock; it must never read as an epoch-sized wait.
 */
function enterExact(
  s: OfficeState,
  a: Agent,
  episodeId: string,
  waitingSince: number,
  now: number,
): void {
  const since =
    Number.isFinite(waitingSince) && waitingSince > 0 ? Math.min(waitingSince, now) : now;
  if (a.attention && a.episode && a.attention.trigger !== "exact") {
    a.episode.waitingSince = since;
    a.episode.exactId = episodeId;
  } else {
    s.episodeSeq += 1;
    a.episode = {
      id: `${a.key}#${s.episodeSeq}`,
      waitingSince: since,
      exitedAt: null,
      exactId: episodeId,
    };
  }
  a.attention = { trigger: "exact" };
  // Like R2: an agent in attention is not idle, so the idle walk-out must not take it.
  a.phase = "working";
  a.idleSince = null;
  settle(a);
}

/**
 * Ends attention (optionally only for some triggers). Activity no newer than an exact
 * episode's since-time predates it (events arrive out of order), so it cannot end it.
 */
function clearAttention(a: Agent, now: number, only?: (t: AttentionTrigger) => boolean): void {
  if (!a.attention || (only && !only(a.attention.trigger))) return;
  if (a.attention.trigger === "exact" && a.episode && now <= a.episode.waitingSince) return;
  a.attention = null;
  if (a.episode) a.episode.exitedAt = now;
}

function leave(a: Agent, now: number): void {
  a.attention = null;
  a.episode = null;
  a.phase = "leaving";
  a.leftAt = now;
  a.waitingOn = [];
  settle(a);
}

function setWorking(a: Agent): void {
  if (a.phase === "arriving" || a.phase === "idle") {
    a.phase = "working";
    a.idleSince = null;
  }
}

/** True when `from` is already waiting on `target`, directly or through other subagents. */
function waitsOn(
  s: OfficeState,
  sessionId: string,
  from: string,
  target: string,
  seen = new Set<string>(),
): boolean {
  if (from === target) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  const a = s.agents[agentKey(sessionId, from)];
  return !!a && Object.keys(a.unresolved).some((id) => waitsOn(s, sessionId, id, target, seen));
}

/** Sends a returned child out and remembers it, so its late events cannot resurrect it. */
function walkOut(
  s: OfficeState,
  key: string,
  child: Agent | undefined,
  ts: number,
  now: number,
): void {
  delete s.returned[key]; // re-insert last so the oldest is the first key
  s.returned[key] = Math.min(ts, now); // a far-future ts must not block the child forever
  const keys = Object.keys(s.returned);
  if (keys.length > RETURNED_CAP) delete s.returned[keys[0]];
  // `now`, not the event's ts: the leaving walk-out is timed from when we see it, not a replayed ts.
  if (child && child.phase !== "leaving") leave(child, now);
}

export function applyEvent(state: OfficeState, event: AgentEvent, now: number): OfficeState {
  return applyOwned(structuredClone(state), event, now, state);
}

/**
 * Applies `events` in order on one clone. Live, every event is applied at `now`; with
 * `replay` each uses its own `ts` as the clock (D12), and the caller ticks once at `now`.
 */
export function applyEvents(
  state: OfficeState,
  events: readonly AgentEvent[],
  now: number,
  opts: { replay?: boolean } = {},
): OfficeState {
  if (events.length === 0) return state;
  let s = structuredClone(state);
  for (const e of events) s = applyOwned(s, e, opts.replay ? Math.min(e.ts, now) : now, s);
  return s;
}

/** Applies one event to `s`, which the caller owns. `orig` is returned when nothing changed. */
function applyOwned(
  s: OfficeState,
  event: AgentEvent,
  now: number,
  orig: OfficeState,
): OfficeState {
  // A child's events arriving after its parent's `back` (feeds merge files out of order)
  // are old news: dropping them keeps the child from reappearing as a ghost.
  const returnedAt =
    event.agentId === null ? undefined : s.returned[agentKey(event.sessionId, event.agentId)];
  if (returnedAt !== undefined && returnedAt >= event.ts) return tickOwned(s, now, orig);
  // Replaying an old snapshot at receive time must not make stale sessions look fresh.
  const clock = Math.min(event.ts, now);
  const { sessionId, projectId } = event;
  switch (event.kind) {
    case "agent_started": {
      const a = touch(s, sessionId, event.agentId, projectId, clock);
      a.parentAgentId = event.parentAgentId;
      settle(a);
      break;
    }
    case "working": {
      const a = touch(s, sessionId, event.agentId, projectId, clock);
      const tool = event.tool;
      if (tool?.phase === "start") {
        setOwn(a.openTools, tool.id, { startedAt: clock, isSubagent: tool.isSubagent });
        clearAttention(a, clock, (t) => t !== "tool");
      } else {
        if (tool) delete a.openTools[tool.id];
        // A result means progress: restart the R1 clock of the calls still open.
        for (const t of Object.values(a.openTools)) t.startedAt = clock;
        clearAttention(a, clock);
      }
      setWorking(a);
      settle(a);
      break;
    }
    case "waiting_on_subagents": {
      const a = touch(s, sessionId, event.agentId, projectId, clock);
      // The normalizer emits this right after the sync launch's tool start: the newest open one.
      let latest: string | null = null;
      let at = -Infinity;
      for (const [id, t] of Object.entries(a.openTools)) {
        if (t.isSubagent && t.startedAt >= at) [latest, at] = [id, t.startedAt];
      }
      if (latest !== null) a.waitingOn = [...new Set([...a.waitingOn, latest])];
      clearAttention(a, clock);
      setWorking(a);
      settle(a);
      break;
    }
    case "needs_attention": {
      // Exact adapters only (hooks); the transcript normalizer never emits it.
      const known = s.agents[agentKey(sessionId, event.agentId)];
      // A repeat of the open or just-ended episode is old news: no touch, so it cannot
      // refresh the agent's silence clock or re-trigger the wave.
      if (known && known.phase !== "leaving" && known.episode?.exactId === event.episodeId) break;
      const a = touch(s, sessionId, event.agentId, projectId, clock);
      enterExact(s, a, event.episodeId, event.waitingSince, clock);
      break;
    }
    case "handoff": {
      const parent = touch(s, sessionId, event.fromAgentId, projectId, clock);
      const child = s.agents[agentKey(sessionId, event.toAgentId)];
      if (event.direction === "out") {
        // A launch that would close a wait loop could never expire; ignore it.
        const loop =
          event.fromAgentId !== null && waitsOn(s, sessionId, event.toAgentId, event.fromAgentId);
        if (!loop) setOwn(parent.unresolved, event.toAgentId, clock);
      } else {
        delete parent.unresolved[event.toAgentId];
        walkOut(s, agentKey(sessionId, event.toAgentId), child, event.ts, now);
      }
      settle(parent);
      break;
    }
    case "done": {
      // E1: the normalizer never emits a subagent `done`; only the hooks adapter does
      // (SubagentStop), and it is that child's exact completion. An unknown or already
      // leaving child is ignored, so a stop can never create a ghost.
      if (event.agentId !== null) {
        const key = agentKey(sessionId, event.agentId);
        const child = s.agents[key];
        if (child && child.phase !== "leaving") walkOut(s, key, child, event.ts, now);
        break;
      }
      const a = touch(s, sessionId, null, projectId, clock);
      a.openTools = {};
      a.waitingOn = [];
      // gstack-shortcut(dec-R2): trailing "?" heuristic; fallback, exact signal preferred when the hooks adapter supplies it
      if (event.endsWithQuestion) {
        a.phase = "working";
        a.idleSince = null;
        enterAttention(s, a, "question", clock);
      } else {
        clearAttention(a, clock);
        // An out-of-order done that the guard ignored keeps enterExact's working phase.
        if (!a.attention) {
          a.phase = "idle";
          a.idleSince = clock;
        }
        settle(a);
      }
      break;
    }
  }
  return tick(s, now, true);
}

function pass(s: OfficeState, now: number): boolean {
  let changed = false;
  const agents = Object.values(s.agents);

  // A launch is resolved when its child has left, or never showed up for staleMs.
  for (const a of agents) {
    if (a.phase === "leaving") continue;
    for (const [id, launchedAt] of Object.entries(a.unresolved)) {
      const child = s.agents[agentKey(a.sessionId, id)];
      const gone = child ? child.phase === "leaving" : now - launchedAt >= TUNING.staleMs;
      if (gone) {
        delete a.unresolved[id];
        settle(a);
        changed = true;
      }
    }
  }

  for (const a of agents) {
    if (a.phase === "leaving") {
      const walkMs = a.agentId === null ? TUNING.leavingMs : TUNING.subagentLeavingMs;
      if (now - (a.leftAt ?? now) >= walkMs) {
        delete s.agents[a.key];
        changed = true;
      }
      continue;
    }
    const silent = now - a.lastEventAt;
    if (a.phase === "arriving" && now - a.arrivedAt >= TUNING.arrivingMs && !a.attention) {
      a.phase = "working";
      settle(a);
      changed = true;
    }
    // A sync wait has no handoff to the child, so it holds while another agent recently spoke,
    // or sits in attention (which outlasts staleMs).
    const active = (o: Agent) =>
      o !== a &&
      o.sessionId === a.sessionId &&
      o.state !== "idle" &&
      o.state !== "leaving" &&
      o.state !== "waiting-on-subagents" &&
      now - o.lastEventAt < (o.state === "attention" ? TUNING.attentionStaleMs : TUNING.staleMs);
    const blocked =
      Object.keys(a.unresolved).length > 0 || (a.waitingOn.length > 0 && agents.some(active));
    const expired =
      a.state === "attention"
        ? silent >= TUNING.attentionStaleMs
        : a.state !== "idle" && !blocked && silent >= TUNING.staleMs;
    if (expired) {
      leave(a, now);
      changed = true;
      continue;
    }
    // gstack-shortcut(dec-R1): tool-call timer heuristic; fallback, exact signal preferred when the hooks adapter supplies it
    if (a.state === "working") {
      let since = Infinity;
      for (const t of Object.values(a.openTools)) {
        if (!t.isSubagent && now - t.startedAt >= TUNING.toolTimerMs) {
          since = Math.min(since, t.startedAt + TUNING.toolTimerMs);
        }
      }
      if (since !== Infinity) {
        // The wait began when the call crossed the timer, not when this tick noticed (E1).
        enterAttention(s, a, "tool", now, since);
        changed = true;
        continue;
      }
    }
    if (
      a.phase === "idle" &&
      a.agentId === null &&
      now - (a.idleSince ?? now) >= TUNING.idleLeaveMs
    ) {
      leave(a, now);
      changed = true;
    }
  }
  return changed;
}

/** Fires every time-based rule due at `now`. Repeats until stable, so a parent whose
 * last subagent just expired can expire in the same call. Returns `state` itself when
 * nothing fired. */
export function tick(state: OfficeState, now: number, owned = false): OfficeState {
  return owned ? tickOwned(state, now, state) : tickOwned(structuredClone(state), now, state);
}

/** Runs the passes on `s` (owned); gives back `orig` if no pass changed anything. */
function tickOwned(s: OfficeState, now: number, orig: OfficeState): OfficeState {
  // Each pass can only expire one more layer of a parent chain, so agents + 2 passes settle it.
  const maxPasses = Object.keys(s.agents).length + 2;
  let changed = false;
  for (let i = 0; i < maxPasses; i++) {
    if (!pass(s, now)) break;
    changed = true;
  }
  return changed ? s : orig;
}
