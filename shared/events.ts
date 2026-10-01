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
 * | handoff              | server/normalize.ts                   | machine (handoff animation)   | ids only                              |
 * | done                 | server/normalize.ts                   | machine (R2 question check)   | boolean only, never message text      |
 *
 * No kind may ever carry transcript text (DESIGN principle 4).
 */

export type AgentEventBase = {
  sessionId: string;
  /** null = the top-level session. */
  agentId: string | null;
  projectId: string;
  /** Epoch milliseconds. */
  ts: number;
};

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
    })
  | (AgentEventBase & {
      kind: "handoff";
      fromAgentId: string | null;
      toAgentId: string;
      direction: "out" | "back";
    })
  | (AgentEventBase & { kind: "done"; endsWithQuestion: boolean });

export type AgentEventKind = AgentEvent["kind"];

/** Maximum length of any string field accepted by the guard. */
export const MAX_STRING_LENGTH = 512;

// `optional` only applies to object fields; enum `values` are not tied to the union
// at type level, shared/events.test.ts iterates each union literal instead.
type FieldSpec =
  | { type: "string"; nullable?: boolean }
  | { type: "number" }
  | { type: "boolean" }
  | { type: "enum"; values: readonly string[] }
  | { type: "object"; optional?: boolean; fields: Record<string, FieldSpec> };

const str: FieldSpec = { type: "string" };
const nullableStr: FieldSpec = { type: "string", nullable: true };
const num: FieldSpec = { type: "number" };
const bool: FieldSpec = { type: "boolean" };

/** Every field of T (minus "kind") needs a spec, so a missing or renamed field is a tsc error. */
type SpecFor<T> = { [K in Exclude<keyof T, "kind">]-?: FieldSpec };
type EventOf<K extends AgentEventKind> = Extract<AgentEvent, { kind: K }>;

const baseFields: SpecFor<AgentEventBase> = {
  sessionId: str,
  agentId: nullableStr,
  projectId: str,
  ts: num,
};

const SPEC: { [K in AgentEventKind]: SpecFor<EventOf<K>> } = {
  agent_started: { ...baseFields, projectPath: str, parentAgentId: nullableStr },
  working: {
    ...baseFields,
    tool: {
      type: "object",
      optional: true,
      fields: {
        phase: { type: "enum", values: ["start", "end"] },
        id: str,
        isSubagent: bool,
      } satisfies SpecFor<NonNullable<EventOf<"working">["tool"]>>,
    },
  },
  waiting_on_subagents: { ...baseFields },
  needs_attention: { ...baseFields, waitingSince: num, episodeId: str },
  handoff: {
    ...baseFields,
    fromAgentId: nullableStr,
    toAgentId: str,
    direction: { type: "enum", values: ["out", "back"] },
  },
  done: { ...baseFields, endsWithQuestion: bool },
};

function fieldOk(spec: FieldSpec, value: unknown): boolean {
  switch (spec.type) {
    case "string":
      if (value === null) return spec.nullable === true;
      return typeof value === "string" && value.length <= MAX_STRING_LENGTH;
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "enum":
      return typeof value === "string" && spec.values.includes(value);
    case "object":
      return typeof value === "object" && value !== null && fieldsOk(spec.fields, value);
  }
}

function fieldsOk(fields: Record<string, FieldSpec>, obj: object): boolean {
  const record = obj as Record<string, unknown>;
  for (const [name, spec] of Object.entries(fields)) {
    const value = record[name];
    if (value === undefined) {
      if (spec.type === "object" && spec.optional) continue;
      return false;
    }
    if (!fieldOk(spec, value)) return false;
  }
  return true;
}

/** Runtime guard for untrusted input. Never throws; extra fields are ignored. */
export function isAgentEvent(value: unknown): value is AgentEvent {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const kind = (value as Record<string, unknown>).kind;
    if (typeof kind !== "string" || !Object.hasOwn(SPEC, kind)) return false;
    return fieldsOk(SPEC[kind as AgentEventKind], value);
  } catch {
    return false;
  }
}
