/**
 * AgentEvent contract (P1-S1-1). Pure types and a runtime guard. No imports, no
 * Node or DOM globals: this file is compiled by both tsconfig.node.json and
 * tsconfig.app.json.
 *
 * | kind                 | producer                              | consumer                      | privacy note                          |
 * | -------------------- | ------------------------------------- | ----------------------------- | ------------------------------------- |
 * | agent_started        | server/normalize.ts (Phase 2)         | office machine (Phase 3)      | projectPath is a path, not content    |
 * | working              | server/normalize.ts                   | machine (R1 tool timer)       | tool id only, never tool input/output |
 * | waiting_on_subagents | server/normalize.ts                   | machine                       | ids only                              |
 * | needs_attention      | exact adapters only (hooks adapter)   | machine                       | ids and timestamps only               |
 * | handoff              | server/normalize.ts                   | machine (handoff animation)   | ids and a closed-enum subagentKind    |
 * | done                 | server/normalize.ts                   | machine (R2 question check)   | boolean only, never message text      |
 *
 * No kind may ever carry transcript text (DESIGN principle 4). parseAgentEvent is the
 * runtime guard: producers must build every event through it and drop what it rejects.
 */

export type AgentEventBase = {
  sessionId: string;
  /** null = the top-level session. */
  agentId: string | null;
  projectId: string;
  /** Epoch milliseconds. */
  ts: number;
};

export const SUBAGENT_KINDS = ["explore", "plan", "general", "other"] as const;
export type SubagentKind = (typeof SUBAGENT_KINDS)[number];

export type AgentEvent =
  | (AgentEventBase & {
      kind: "agent_started";
      projectPath: string;
      parentAgentId: string | null;
    })
  | (AgentEventBase & {
      kind: "working";
      tool?: { phase: "start" | "end"; id: string; isSubagent: boolean };
    })
  | (AgentEventBase & { kind: "waiting_on_subagents" })
  | (AgentEventBase & {
      kind: "needs_attention";
      waitingSince: number;
      episodeId: string;
      /** Set on a Notification-derived event: a backup the machine drops while an exact episode
       * is open. Absent means false. */
      fallback?: boolean;
    })
  | (AgentEventBase & {
      kind: "handoff";
      fromAgentId: string | null;
      toAgentId: string;
      direction: "out" | "back";
      /** Closed enum, only on "out"; never free text. */
      subagentKind?: SubagentKind;
    })
  | (AgentEventBase & { kind: "done"; endsWithQuestion: boolean });

export type AgentEventKind = AgentEvent["kind"];

/** Maximum length of any string field accepted by the guard. */
export const MAX_STRING_LENGTH = 512;

// `optional` applies to every spec type: parseFields skips an absent optional field.
// Enum `values` are not tied to the union at type level, shared/events.test.ts
// iterates each union literal instead.
type FieldSpec = { optional?: boolean } & (
  | { type: "string"; nullable?: boolean; nonEmpty?: boolean; pattern?: RegExp }
  | { type: "timestamp" }
  | { type: "boolean" }
  | { type: "enum"; values: readonly string[] }
  | { type: "object"; fields: Record<string, FieldSpec> }
);

/** What an agent, session, tool or episode id may look like: 1 to 128 of [A-Za-z0-9_-]. */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Free-form string (a path); may be empty. */
const str: FieldSpec = { type: "string" };
/** Identifier: matches ID_PATTERN. */
const id: FieldSpec = { type: "string", pattern: ID_PATTERN };
const nullableId: FieldSpec = {
  type: "string",
  nullable: true,
  pattern: ID_PATTERN,
};
/** A project directory name: any non-empty string (its character set is not measured yet). */
const projectId: FieldSpec = { type: "string", nonEmpty: true };
/** Epoch milliseconds: a non-negative safe integer. */
const ts: FieldSpec = { type: "timestamp" };
const bool: FieldSpec = { type: "boolean" };

/** Every field of T (minus "kind") needs a spec, so a missing or renamed field is a tsc error. */
type SpecFor<T> = { [K in Exclude<keyof T, "kind">]-?: FieldSpec };
type EventOf<K extends AgentEventKind> = Extract<AgentEvent, { kind: K }>;

const baseFields: SpecFor<AgentEventBase> = {
  sessionId: id,
  agentId: nullableId,
  projectId,
  ts,
};

const SPEC: { [K in AgentEventKind]: SpecFor<EventOf<K>> } = {
  agent_started: { ...baseFields, projectPath: str, parentAgentId: nullableId },
  working: {
    ...baseFields,
    tool: {
      type: "object",
      optional: true,
      fields: {
        phase: { type: "enum", values: ["start", "end"] },
        id,
        isSubagent: bool,
      } satisfies SpecFor<NonNullable<EventOf<"working">["tool"]>>,
    },
  },
  waiting_on_subagents: { ...baseFields },
  needs_attention: {
    ...baseFields,
    waitingSince: ts,
    episodeId: id,
    fallback: { type: "boolean", optional: true },
  },
  handoff: {
    ...baseFields,
    fromAgentId: nullableId,
    toAgentId: id,
    direction: { type: "enum", values: ["out", "back"] },
    subagentKind: { type: "enum", optional: true, values: SUBAGENT_KINDS },
  },
  done: { ...baseFields, endsWithQuestion: bool },
};

const INVALID = Symbol("invalid");

/** Returns a validated copy of the value, or INVALID. Scalars are copied by value. */
function parseField(spec: FieldSpec, value: unknown): unknown {
  switch (spec.type) {
    case "string":
      if (value === null) return spec.nullable === true ? null : INVALID;
      if (typeof value !== "string" || value.length > MAX_STRING_LENGTH) return INVALID;
      if (spec.nonEmpty && value.length === 0) return INVALID;
      return spec.pattern !== undefined && !spec.pattern.test(value) ? INVALID : value;
    case "timestamp":
      return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
        ? value
        : INVALID;
    case "boolean":
      return typeof value === "boolean" ? value : INVALID;
    case "enum":
      return typeof value === "string" && spec.values.includes(value) ? value : INVALID;
    case "object":
      return typeof value === "object" && value !== null
        ? parseFields(spec.fields, value)
        : INVALID;
  }
}

function parseFields(
  fields: Record<string, FieldSpec>,
  obj: object,
): Record<string, unknown> | typeof INVALID {
  const record = obj as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(fields)) {
    const value = Object.hasOwn(record, name) ? record[name] : undefined;
    if (value === undefined) {
      if (spec.optional) continue;
      return INVALID;
    }
    const parsed = parseField(spec, value);
    if (parsed === INVALID) return INVALID;
    out[name] = parsed;
  }
  return out;
}

/**
 * Validates untrusted input and returns a fresh object holding only the declared
 * fields (nested `tool` included), or null. Never throws. Extra fields are dropped,
 * so a spread transcript entry cannot carry text past this function.
 */
export function parseAgentEvent(value: unknown): AgentEvent | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const kind = Object.hasOwn(value, "kind") ? (value as Record<string, unknown>).kind : undefined;
    if (typeof kind !== "string" || !Object.hasOwn(SPEC, kind)) return null;
    const fields = parseFields(SPEC[kind as AgentEventKind], value);
    if (fields === INVALID) return null;
    // subagentKind marks a launch; a "back" that carries one is malformed.
    if (kind === "handoff" && fields.direction === "back" && "subagentKind" in fields) return null;
    return { kind, ...fields } as AgentEvent;
  } catch {
    return null;
  }
}

/** Runtime guard for untrusted input; delegates to parseAgentEvent. */
export function isAgentEvent(value: unknown): value is AgentEvent {
  return parseAgentEvent(value) !== null;
}
