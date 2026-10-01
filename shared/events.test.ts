import { describe, expect, it } from "vite-plus/test";
import { isAgentEvent } from "./events.ts";
import type { AgentEvent, AgentEventKind } from "./events.ts";

const base = { sessionId: "s1", agentId: null, projectId: "p1", ts: 1700000000000 };

const valid: Record<AgentEventKind, Record<string, unknown>> = {
  agent_started: { ...base, kind: "agent_started", projectPath: "/a/b", parentAgentId: null },
  working: {
    ...base,
    kind: "working",
    tool: { phase: "start", id: "t1", isSubagent: false },
  },
  waiting_on_subagents: { ...base, kind: "waiting_on_subagents" },
  needs_attention: {
    ...base,
    kind: "needs_attention",
    waitingSince: 1700000000000,
    episodeId: "e1",
  },
  handoff: { ...base, kind: "handoff", fromAgentId: null, toAgentId: "a2", direction: "out" },
  done: { ...base, kind: "done", endsWithQuestion: false },
};

// One required field to remove per kind.
const required: Record<AgentEventKind, string> = {
  agent_started: "projectPath",
  working: "projectId",
  waiting_on_subagents: "sessionId",
  needs_attention: "episodeId",
  handoff: "toAgentId",
  done: "endsWithQuestion",
};

describe("isAgentEvent", () => {
  for (const [kind, event] of Object.entries(valid) as [
    AgentEventKind,
    Record<string, unknown>,
  ][]) {
    it(`accepts a valid ${kind}`, () => {
      expect(isAgentEvent(event)).toBe(true);
    });
    it(`rejects ${kind} missing ${required[kind]}`, () => {
      const copy = { ...event };
      delete copy[required[kind]];
      expect(isAgentEvent(copy)).toBe(false);
    });
  }

  for (const [kind, event] of Object.entries(valid)) {
    it(`rejects ${kind} with agentId missing`, () => {
      const copy = { ...event };
      delete copy.agentId;
      expect(isAgentEvent(copy)).toBe(false);
    });
    it(`rejects ${kind} with numeric agentId`, () => {
      expect(isAgentEvent({ ...event, agentId: 7 })).toBe(false);
    });
  }

  it('rejects handoff direction "sideways"', () => {
    expect(isAgentEvent({ ...valid.handoff, direction: "sideways" })).toBe(false);
  });

  it("rejects working tool with id missing", () => {
    expect(isAgentEvent({ ...valid.working, tool: { phase: "start", isSubagent: false } })).toBe(
      false,
    );
  });

  it("rejects a 513-char tool.id", () => {
    expect(
      isAgentEvent({
        ...valid.working,
        tool: { phase: "start", id: "x".repeat(513), isSubagent: false },
      }),
    ).toBe(false);
  });

  it("accepts working without tool", () => {
    expect(isAgentEvent({ ...base, kind: "working" })).toBe(true);
  });

  it.each([null, undefined, [], {}, "done", 42])("rejects non-event %j", (value) => {
    expect(isAgentEvent(value)).toBe(false);
  });

  it.each([NaN, Infinity, -Infinity])("rejects ts %s", (ts) => {
    expect(isAgentEvent({ ...valid.done, ts })).toBe(false);
  });

  it("rejects a 513-char sessionId and accepts 512", () => {
    expect(isAgentEvent({ ...valid.done, sessionId: "x".repeat(513) })).toBe(false);
    expect(isAgentEvent({ ...valid.done, sessionId: "x".repeat(512) })).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(isAgentEvent({ ...base, kind: "exploded" })).toBe(false);
  });

  it('rejects tool.phase "x"', () => {
    expect(
      isAgentEvent({ ...valid.working, tool: { phase: "x", id: "t1", isSubagent: false } }),
    ).toBe(false);
  });

  it('accepts tool.phase "end"', () => {
    expect(
      isAgentEvent({ ...valid.working, tool: { phase: "end", id: "t1", isSubagent: false } }),
    ).toBe(true);
  });

  it("accepts tool.isSubagent true", () => {
    expect(
      isAgentEvent({ ...valid.working, tool: { phase: "start", id: "t1", isSubagent: true } }),
    ).toBe(true);
  });

  it("accepts non-null agentId, parentAgentId and fromAgentId", () => {
    expect(isAgentEvent({ ...valid.done, agentId: "a1" })).toBe(true);
    expect(isAgentEvent({ ...valid.agent_started, parentAgentId: "a1" })).toBe(true);
    expect(isAgentEvent({ ...valid.handoff, fromAgentId: "a1" })).toBe(true);
  });

  it("rejects tool.isSubagent as a string and tool as a string", () => {
    expect(
      isAgentEvent({ ...valid.working, tool: { phase: "start", id: "t1", isSubagent: "yes" } }),
    ).toBe(false);
    expect(isAgentEvent({ ...valid.working, tool: "x" })).toBe(false);
  });

  // Value: protects=every enum literal in the union is accepted by the guard; fails_when=a literal is added to the type but not to SPEC values; why_new=type system cannot tie values to the union; seam=none
  it("accepts every literal of the enum unions", () => {
    type Tool = NonNullable<Extract<AgentEvent, { kind: "working" }>["tool"]>;
    type Direction = Extract<AgentEvent, { kind: "handoff" }>["direction"];
    const phases: Record<Tool["phase"], true> = { start: true, end: true };
    const directions: Record<Direction, true> = { out: true, back: true };
    for (const phase of Object.keys(phases)) {
      expect(isAgentEvent({ ...valid.working, tool: { phase, id: "t1", isSubagent: false } })).toBe(
        true,
      );
    }
    for (const direction of Object.keys(directions)) {
      expect(isAgentEvent({ ...valid.handoff, direction })).toBe(true);
    }
  });

  it("rejects ts as a string", () => {
    expect(isAgentEvent({ ...valid.done, ts: "1700000000000" })).toBe(false);
  });

  it("rejects endsWithQuestion as a string", () => {
    expect(isAgentEvent({ ...valid.done, endsWithQuestion: "true" })).toBe(false);
  });

  it("ignores extra fields", () => {
    expect(isAgentEvent({ ...valid.done, extra: { a: 1 } })).toBe(true);
  });

  // Value: protects=null ids and tool never pass; fails_when=a null check or typeof object guard is loosened; why_new=existing rows only remove fields; seam=none
  it("rejects null sessionId and null tool", () => {
    expect(isAgentEvent({ ...valid.done, sessionId: null })).toBe(false);
    expect(isAgentEvent({ ...valid.working, tool: null })).toBe(false);
  });

  // Value: protects=prototype names and non-string kinds are not kinds; fails_when=hasOwn becomes in/lookup; why_new=only "exploded" was covered; seam=none
  it.each(["toString", "constructor", 1, {}, null])("rejects kind %j", (kind) => {
    expect(isAgentEvent({ ...valid.done, kind })).toBe(false);
  });

  // Value: protects=inherited values never satisfy the guard; fails_when=own-property check becomes plain access; why_new=only own-property objects were tried; seam=none
  for (const [kind, event] of Object.entries(valid)) {
    it(`rejects ${kind} built with Object.create(validEvent)`, () => {
      expect(isAgentEvent(Object.create(event))).toBe(false);
    });
  }

  it("rejects a required field present only on the prototype", () => {
    const copy = { ...valid.done };
    delete copy.endsWithQuestion;
    expect(isAgentEvent(Object.assign(Object.create({ endsWithQuestion: false }), copy))).toBe(
      false,
    );
  });

  it("rejects a nullable field present only on the prototype", () => {
    const copy = { ...valid.done };
    delete copy.agentId;
    expect(isAgentEvent(Object.assign(Object.create({ agentId: null }), copy))).toBe(false);
  });

  it("rejects a tool field present only on the prototype", () => {
    const tool = Object.create({ id: "t1" });
    Object.assign(tool, { phase: "start", isSubagent: false });
    expect(isAgentEvent({ ...valid.working, tool })).toBe(false);
  });

  it("treats an inherited tool as absent and accepts the event", () => {
    const copy = { ...base, kind: "working" };
    const proto = { tool: { phase: "start", id: "t1", isSubagent: false } };
    expect(isAgentEvent(Object.assign(Object.create(proto), copy))).toBe(true);
  });

  // Value: protects=guard never throws on hostile input; fails_when=try/catch removed; why_new=no hostile object covered; seam=none
  it("returns false for a throwing getter or Proxy", () => {
    const getter = {
      ...valid.done,
      get sessionId(): string {
        throw new Error("boom");
      },
    };
    const proxy = new Proxy(
      {},
      {
        get() {
          throw new Error("boom");
        },
      },
    );
    expect(isAgentEvent(getter)).toBe(false);
    expect(isAgentEvent(proxy)).toBe(false);
  });
});
