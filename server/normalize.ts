/**
 * Transcript line -> AgentEvent normalizer (T2/T3, decisions D3, D7, D12, E1, E3).
 * Stateful per transcript file: `normalize(state, line)` returns zero or more events.
 * Events are built field by field and passed through parseAgentEvent, so no transcript
 * text can reach an AgentEvent (DESIGN principle 4). Unknown line types return []; known
 * types with a bad shape bump a per-reason drift counter.
 */
import { MAX_STRING_LENGTH, parseAgentEvent } from "../shared/events.ts";
import type { AgentEvent } from "../shared/events.ts";

/** The one trailing-`?` predicate (R2). Shared with server/sanitize-fixtures.ts. */
export function endsWithQuestion(text: string): boolean {
  return text.trimEnd().endsWith("?");
}

export type DriftReason =
  | "malformed_json"
  | "bad_shape"
  | "bad_timestamp"
  | "bad_event"
  | "orphan_completion";

export type NormalizerState = {
  projectId: string;
  /** True for `<session>/subagents/agent-<id>.jsonl`. */
  subagent: boolean;
  drift: Partial<Record<DriftReason, number>>;
  /** True once agent_started was emitted for this file. */
  started: boolean;
  /** Discard emitted events while replaying a finished file's tail. */
  suppress: boolean;
  /** Agent/Task tool_use id -> launch facts. */
  launches: Map<string, { sync: boolean; agentId: string | null }>;
  /** SendMessage tool_use id -> the known agent it resumes. */
  resumes: Map<string, string>;
  /** `task-id|tool-use-id` of completions already emitted. */
  completed: Set<string>;
  /** Whether the first batch (first sight, E3) was already consumed. */
  batched: boolean;
};

export function createNormalizerState(opts: {
  projectId: string;
  subagent: boolean;
}): NormalizerState {
  return {
    projectId: opts.projectId,
    subagent: opts.subagent,
    drift: {},
    started: false,
    suppress: false,
    launches: new Map(),
    resumes: new Map(),
    completed: new Set(),
    batched: false,
  };
}

const MAP_CAP = 2000;
const SUBAGENT_TOOLS = new Set(["Agent", "Task"]);

export type Json = Record<string, unknown>;
type Ctx = { state: NormalizerState; rec: Json; ts: number; sessionId: string; cwd: string };
type Handler = (ctx: Ctx) => AgentEvent[] | "bad_shape";

function bump(state: NormalizerState, reason: DriftReason): void {
  state.drift[reason] = (state.drift[reason] ?? 0) + 1;
}

/** State maps hold ids for the whole file's life; an over-long one is ignored, not stored. */
const tooLong = (s: string): boolean => s.length > MAX_STRING_LENGTH;

/** Evicts the oldest entry at MAP_CAP before adding, as `remember` does for the maps. */
function markCompleted(state: NormalizerState, key: string): void {
  if (state.completed.has(key)) return;
  if (state.completed.size >= MAP_CAP)
    state.completed.delete(state.completed.values().next().value as string);
  state.completed.add(key);
}

function remember<V>(map: Map<string, V>, key: string, value: V): void {
  if (tooLong(key)) return;
  if (map.size >= MAP_CAP) map.delete(map.keys().next().value as string);
  map.set(key, value);
}

export const isObj = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const asStr = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** Validates a record's envelope; the drift reason when it has none. Order matters:
 * a bad timestamp is reported ahead of a bad shape. */
function buildCtx(state: NormalizerState, rec: Json): Ctx | "bad_timestamp" | "bad_shape" {
  const ts = typeof rec.timestamp === "string" ? Date.parse(rec.timestamp) : NaN;
  if (Number.isNaN(ts)) return "bad_timestamp";
  const sessionId = asStr(rec.sessionId);
  if (sessionId === null || (state.subagent && asStr(rec.agentId) === null)) return "bad_shape";
  return { state, rec, ts, sessionId, cwd: typeof rec.cwd === "string" ? rec.cwd : "" };
}

/** Builds one event through parseAgentEvent; returns [] (and counts drift) if it fails the guard. */
function emit(state: NormalizerState, ctx: Ctx, agentId: string | null, event: Json): AgentEvent[] {
  const parsed = parseAgentEvent({
    sessionId: ctx.sessionId,
    agentId,
    projectId: state.projectId,
    ts: ctx.ts,
    ...event,
  });
  if (parsed === null) {
    bump(state, "bad_event");
    return [];
  }
  return [parsed];
}

function ownAgentId(ctx: Ctx): string | null {
  return ctx.state.subagent ? asStr(ctx.rec.agentId) : null;
}

function contentBlocks(rec: Json): Json[] | null {
  const message = rec.message;
  if (!isObj(message)) return null;
  if (typeof message.content === "string") return [];
  if (!Array.isArray(message.content)) return null;
  return message.content.filter(isObj);
}

function lastText(blocks: Json[]): string {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.type === "text" && typeof b.text === "string") return b.text;
  }
  return "";
}

function started(ctx: Ctx): AgentEvent[] {
  const { state } = ctx;
  if (state.started) return [];
  state.started = true;
  return emit(state, ctx, ownAgentId(ctx), {
    kind: "agent_started",
    projectPath: ctx.cwd.slice(0, MAX_STRING_LENGTH),
    parentAgentId: null,
  });
}

function handoff(ctx: Ctx, toAgentId: string, direction: "out" | "back"): AgentEvent[] {
  return emit(ctx.state, ctx, ownAgentId(ctx), {
    kind: "handoff",
    fromAgentId: ownAgentId(ctx),
    toAgentId,
    direction,
  });
}

const onAssistant: Handler = (ctx) => {
  const { state, rec } = ctx;
  const blocks = contentBlocks(rec);
  const message = rec.message as Json | undefined;
  if (blocks === null || !isObj(message)) return "bad_shape";
  const out: AgentEvent[] = [];
  const agentId = ownAgentId(ctx);
  // Validate every block before touching state, so a bad one drops the record whole.
  for (const b of blocks) {
    if (b.type === "tool_use" && (asStr(b.id) === null || asStr(b.name) === null)) {
      return "bad_shape";
    }
  }
  let toolUses = 0;
  for (const b of blocks) {
    if (b.type !== "tool_use") continue;
    const id = asStr(b.id) as string;
    const name = asStr(b.name) as string;
    toolUses++;
    const isSubagent = SUBAGENT_TOOLS.has(name);
    out.push(
      ...emit(state, ctx, agentId, {
        kind: "working",
        tool: { phase: "start", id, isSubagent },
      }),
    );
    const input = isObj(b.input) ? b.input : {};
    if (isSubagent) {
      const sync = input.run_in_background === false;
      remember(state.launches, id, { sync, agentId: null });
      if (sync) out.push(...emit(state, ctx, agentId, { kind: "waiting_on_subagents" }));
    } else if (name === "SendMessage") {
      const to = asStr(input.to);
      if (
        to !== null &&
        !tooLong(to) &&
        [...state.launches.values()].some((l) => l.agentId === to)
      ) {
        remember(state.resumes, id, to);
      }
    }
  }
  if (toolUses === 0 && message.stop_reason !== "end_turn") {
    out.push(...emit(state, ctx, agentId, { kind: "working" }));
  }
  if (message.stop_reason === "end_turn" && !state.subagent) {
    out.push(
      ...emit(state, ctx, null, {
        kind: "done",
        endsWithQuestion: endsWithQuestion(lastText(blocks)),
      }),
    );
  }
  return out;
};

const onUser: Handler = (ctx) => {
  const { state, rec } = ctx;
  const blocks = contentBlocks(rec);
  if (blocks === null) return "bad_shape";
  const agentId = ownAgentId(ctx);
  const result = isObj(rec.toolUseResult) ? rec.toolUseResult : null;
  const out: AgentEvent[] = [];
  // Validate every block before touching state, so a bad one drops the record whole.
  if (blocks.some((b) => b.type === "tool_result" && asStr(b.tool_use_id) === null)) {
    return "bad_shape";
  }
  let results = 0;
  for (const b of blocks) {
    if (b.type !== "tool_result") continue;
    const id = asStr(b.tool_use_id) as string;
    results++;
    const launch = state.launches.get(id);
    out.push(
      ...emit(state, ctx, agentId, {
        kind: "working",
        tool: { phase: "end", id, isSubagent: launch !== undefined },
      }),
    );
    const launched = result === null ? null : asStr(result.agentId);
    if (launch === undefined || result === null || launched === null || tooLong(launched)) continue;
    launch.agentId = launched;
    if (result.status === "async_launched") {
      // D7: background launch emits only the out-handoff; the parent keeps working.
      out.push(...handoff(ctx, launched, "out"));
    } else if (result.status === "completed") {
      // D7: the child id is only known now, so a sync launch emits its out-handoff just before the back.
      if (launch.sync && !state.completed.has(`${launched}|${id}`)) {
        out.push(...handoff(ctx, launched, "out"));
      }
      out.push(...handoff(ctx, launched, "back"));
      if (!tooLong(id)) markCompleted(state, `${launched}|${id}`);
    }
  }
  if (results === 0) out.push(...emit(state, ctx, agentId, { kind: "working" }));
  return out;
};

const TAG_PATTERNS = {
  "task-id": /<task-id>([^<]*)<\/task-id>/,
  "tool-use-id": /<tool-use-id>([^<]*)<\/tool-use-id>/,
  status: /<status>([^<]*)<\/status>/,
};

export function tag(text: string, name: keyof typeof TAG_PATTERNS): string | null {
  const m = TAG_PATTERNS[name].exec(text);
  return m === null || m[1].length === 0 ? null : m[1];
}

const onQueueOperation: Handler = (ctx) => {
  const { state, rec } = ctx;
  if (rec.operation !== "enqueue") return []; // remove copies are not counted
  if (typeof rec.content !== "string" || !rec.content.includes("<task-notification>")) return [];
  const taskId = tag(rec.content, "task-id");
  const toolUseId = tag(rec.content, "tool-use-id");
  const status = tag(rec.content, "status");
  if (taskId === null || toolUseId === null || status === null) return "bad_shape";
  if (status !== "completed" && status !== "failed") return "bad_shape";
  if (tooLong(taskId) || tooLong(toolUseId)) return "bad_shape";
  const key = `${taskId}|${toolUseId}`;
  if (state.completed.has(key)) return [];
  const launch = state.launches.get(toolUseId);
  const resumed = state.resumes.get(toolUseId);
  if (launch === undefined && resumed === undefined) {
    bump(state, "orphan_completion");
    return [];
  }
  markCompleted(state, key);
  const toAgentId = launch !== undefined ? (launch.agentId ?? taskId) : (resumed as string);
  return handoff(ctx, toAgentId, "back");
};

/** Table of known line types; anything else returns [] without drift. */
const HANDLERS: Record<string, Handler> = {
  assistant: onAssistant,
  user: onUser,
  "queue-operation": onQueueOperation,
};

export function normalize(state: NormalizerState, line: string): AgentEvent[] {
  let rec: unknown;
  try {
    rec = JSON.parse(line);
  } catch {
    bump(state, "malformed_json");
    return [];
  }
  if (!isObj(rec)) {
    bump(state, "bad_shape");
    return [];
  }
  const handler =
    typeof rec.type === "string" && Object.hasOwn(HANDLERS, rec.type)
      ? HANDLERS[rec.type]
      : undefined;
  if (handler === undefined) return [];
  const ctx = buildCtx(state, rec);
  if (typeof ctx === "string") {
    bump(state, ctx);
    return [];
  }
  const events = handler(ctx);
  if (events === "bad_shape") {
    bump(state, "bad_shape");
    return [];
  }
  // Cold start / first sight: synthesize agent_started from the first parsed line.
  const out =
    state.suppress || state.started || rec.type === "queue-operation"
      ? events
      : [...started(ctx), ...events];
  return state.suppress ? [] : out;
}

/** Last user/assistant record of a batch, or null. */
function lastRecord(lines: string[]): Json | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const rec: unknown = JSON.parse(lines[i]);
      if (isObj(rec) && (rec.type === "assistant" || rec.type === "user")) return rec;
    } catch {
      // keep scanning backwards
    }
  }
  return null;
}

/**
 * Feed a batch of lines in order. At first sight of a file (E3) whose last record is an
 * end_turn: a subagent file emits nothing; a top-level file emits agent_started plus done
 * only when its last text ends with a question; unfinished files arrive normally.
 */
export function normalizeBatch(state: NormalizerState, lines: string[]): AgentEvent[] {
  if (state.batched || lines.length === 0) return lines.flatMap((l) => normalize(state, l));
  state.batched = true;
  const last = lastRecord(lines);
  const message = last !== null && isObj(last.message) ? last.message : null;
  const finished = last?.type === "assistant" && message?.stop_reason === "end_turn";
  if (!finished) return lines.flatMap((l) => normalize(state, l));

  state.suppress = true;
  for (const l of lines) normalize(state, l); // rebuild launch/dedupe state silently
  state.suppress = false;
  if (state.subagent) return [];

  const blocks = contentBlocks(last as Json) ?? [];
  if (!endsWithQuestion(lastText(blocks))) return [];
  const ctx = buildCtx(state, last as Json);
  if (typeof ctx === "string") {
    bump(state, ctx);
    return [];
  }
  return [...started(ctx), ...emit(state, ctx, null, { kind: "done", endsWithQuestion: true })];
}
