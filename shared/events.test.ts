import { describe, expect, it } from "vite-plus/test";
import { ID_PATTERN, isAgentEvent, parseAgentEvent } from "./events.ts";
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

  it.each(["explore", "plan", "general", "other"])(
    "accepts handoff out with subagentKind %s",
    (k) => {
      expect(parseAgentEvent({ ...valid.handoff, subagentKind: k })).toMatchObject({
        subagentKind: k,
      });
    },
  );

  it("rejects handoff with an invalid subagentKind", () => {
    expect(isAgentEvent({ ...valid.handoff, subagentKind: "Explore" })).toBe(false);
    expect(isAgentEvent({ ...valid.handoff, subagentKind: "secret text" })).toBe(false);
    expect(isAgentEvent({ ...valid.handoff, subagentKind: 3 })).toBe(false);
    expect(isAgentEvent({ ...valid.handoff, subagentKind: null })).toBe(false);
  });

  it("rejects handoff back that carries subagentKind", () => {
    expect(isAgentEvent({ ...valid.handoff, direction: "back", subagentKind: "plan" })).toBe(false);
  });

  it("accepts handoff out and back without subagentKind", () => {
    const out = parseAgentEvent(valid.handoff) as Record<string, unknown>;
    expect(out).not.toBeNull();
    expect(Object.hasOwn(out, "subagentKind")).toBe(false);
    expect(isAgentEvent({ ...valid.handoff, direction: "back" })).toBe(true);
  });

  it("still drops a stray subagentKind on other kinds", () => {
    const parsed = parseAgentEvent({ ...valid.done, subagentKind: "plan" }) as Record<
      string,
      unknown
    >;
    expect(parsed).not.toBeNull();
    expect(Object.hasOwn(parsed, "subagentKind")).toBe(false);
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

  it("rejects a 513-char sessionId and accepts 128", () => {
    expect(isAgentEvent({ ...valid.done, sessionId: "x".repeat(513) })).toBe(false);
    expect(isAgentEvent({ ...valid.done, sessionId: "x".repeat(128) })).toBe(true);
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

describe("stricter guard (T1)", () => {
  it.each(["sessionId", "projectId"])("rejects empty %s", (field) => {
    expect(isAgentEvent({ ...valid.done, [field]: "" })).toBe(false);
  });

  it("rejects empty non-null ids and keeps null agentId", () => {
    expect(isAgentEvent({ ...valid.done, agentId: "" })).toBe(false);
    expect(isAgentEvent({ ...valid.agent_started, parentAgentId: "" })).toBe(false);
    expect(isAgentEvent({ ...valid.handoff, fromAgentId: "" })).toBe(false);
    expect(isAgentEvent({ ...valid.handoff, toAgentId: "" })).toBe(false);
    expect(isAgentEvent({ ...valid.needs_attention, episodeId: "" })).toBe(false);
    expect(
      isAgentEvent({ ...valid.working, tool: { phase: "start", id: "", isSubagent: false } }),
    ).toBe(false);
    expect(isAgentEvent({ ...valid.done, agentId: null })).toBe(true);
  });

  it("accepts a boolean fallback on needs_attention and rejects a non-boolean one", () => {
    expect(isAgentEvent({ ...valid.needs_attention, fallback: true })).toBe(true);
    expect(isAgentEvent({ ...valid.needs_attention, fallback: false })).toBe(true);
    for (const bad of ["true", 1, null, {}]) {
      expect(isAgentEvent({ ...valid.needs_attention, fallback: bad })).toBe(false);
    }
  });

  it("rejects negative ts and waitingSince", () => {
    expect(isAgentEvent({ ...valid.done, ts: -5 })).toBe(false);
    expect(isAgentEvent({ ...valid.needs_attention, waitingSince: -1 })).toBe(false);
  });

  it("rejects fractional ts and waitingSince, accepts 0", () => {
    expect(isAgentEvent({ ...valid.done, ts: 1.5 })).toBe(false);
    expect(isAgentEvent({ ...valid.needs_attention, waitingSince: 2.5 })).toBe(false);
    expect(isAgentEvent({ ...valid.done, ts: 0 })).toBe(true);
  });

  it("rejects ts beyond the safe integer range", () => {
    expect(isAgentEvent({ ...valid.done, ts: Number.MAX_SAFE_INTEGER + 1 })).toBe(false);
  });
});

describe("parseAgentEvent", () => {
  it("returns null for invalid input", () => {
    expect(parseAgentEvent({ ...valid.done, ts: -5 })).toBeNull();
    expect(parseAgentEvent(null)).toBeNull();
  });

  it("returns an equal but fresh object for every valid kind", () => {
    for (const event of Object.values(valid)) {
      const parsed = parseAgentEvent(event);
      expect(parsed).toEqual(event);
      expect(parsed).not.toBe(event);
    }
  });

  it("copies tool into a fresh object", () => {
    const parsed = parseAgentEvent(valid.working);
    expect(parsed).not.toBeNull();
    expect((parsed as { tool: object }).tool).not.toBe(valid.working.tool);
  });

  it("drops extra text from a spread transcript entry, top level and tool", () => {
    const entry = { type: "assistant", message: { content: [{ text: "SECRET" }] }, text: "SECRET" };
    const parsed = parseAgentEvent({
      ...entry,
      ...valid.working,
      tool: { phase: "start", id: "t1", isSubagent: false, input: "SECRET" },
    });
    expect(parsed).not.toBeNull();
    expect(JSON.stringify(parsed)).not.toContain("SECRET");
    expect(Object.keys(parsed as object).toSorted()).toEqual(
      ["agentId", "kind", "projectId", "sessionId", "tool", "ts"].toSorted(),
    );
    expect(Object.keys((parsed as { tool: object }).tool).toSorted()).toEqual([
      "id",
      "isSubagent",
      "phase",
    ]);
  });

  it("omits tool when absent", () => {
    const parsed = parseAgentEvent({ ...base, kind: "working" });
    expect(parsed).not.toBeNull();
    expect(Object.hasOwn(parsed as object, "tool")).toBe(false);
  });
});

// Every id field in every kind, built so a single field is replaced and nothing else changes.
const idFields: Array<[string, AgentEventKind, (id: string) => Record<string, unknown>]> = [
  ["sessionId", "done", (id) => ({ ...valid.done, sessionId: id })],
  ["sessionId", "working", (id) => ({ ...valid.working, sessionId: id })],
  ["sessionId", "waiting_on_subagents", (id) => ({ ...valid.waiting_on_subagents, sessionId: id })],
  ["sessionId", "needs_attention", (id) => ({ ...valid.needs_attention, sessionId: id })],
  ["sessionId", "handoff", (id) => ({ ...valid.handoff, sessionId: id })],
  ["sessionId", "agent_started", (id) => ({ ...valid.agent_started, sessionId: id })],
  ["agentId", "done", (id) => ({ ...valid.done, agentId: id })],
  ["agentId", "working", (id) => ({ ...valid.working, agentId: id })],
  ["agentId", "waiting_on_subagents", (id) => ({ ...valid.waiting_on_subagents, agentId: id })],
  ["agentId", "needs_attention", (id) => ({ ...valid.needs_attention, agentId: id })],
  ["agentId", "handoff", (id) => ({ ...valid.handoff, agentId: id })],
  ["agentId", "agent_started", (id) => ({ ...valid.agent_started, agentId: id })],
  ["parentAgentId", "agent_started", (id) => ({ ...valid.agent_started, parentAgentId: id })],
  ["fromAgentId", "handoff", (id) => ({ ...valid.handoff, fromAgentId: id })],
  ["toAgentId", "handoff", (id) => ({ ...valid.handoff, toAgentId: id })],
  [
    "tool.id",
    "working",
    (id) => ({ ...valid.working, tool: { phase: "start", id, isSubagent: false } }),
  ],
  ["episodeId", "needs_attention", (id) => ({ ...valid.needs_attention, episodeId: id })],
];

describe("id pattern (T06)", () => {
  const bad = [".", " ", "../x", "caf\u00e9", "\u65e5\u672c", "a b", "a/b", "", "x".repeat(129)];
  const good = [
    "x".repeat(128),
    "a1b2c3d4e5f6a7b8c",
    "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    "toolu_01A09q90qw90lq917835lq9",
    "0123456789abcdef0123456789abcdef",
  ];

  for (const [field, kind, build] of idFields) {
    it.each(bad)(`rejects ${field} of ${kind} = %j`, (id) => {
      expect(isAgentEvent(build(id))).toBe(false);
    });
    it.each(good)(`accepts ${field} of ${kind} = %j`, (id) => {
      expect(isAgentEvent(build(id))).toBe(true);
    });
  }

  it("covers every id field of the spec", () => {
    expect(new Set(idFields.map(([f]) => f))).toEqual(
      new Set([
        "sessionId",
        "agentId",
        "parentAgentId",
        "fromAgentId",
        "toAgentId",
        "tool.id",
        "episodeId",
      ]),
    );
    expect(new Set(idFields.map(([, k]) => k))).toEqual(new Set(Object.keys(valid)));
  });

  it("caps projectId at MAX_STRING_LENGTH: 512 accepted, 513 rejected", () => {
    expect(isAgentEvent({ ...valid.done, projectId: "p".repeat(512) })).toBe(true);
    expect(isAgentEvent({ ...valid.done, projectId: "p".repeat(513) })).toBe(false);
  });

  it("keeps projectId lax: any non-empty string within the length cap", () => {
    expect(isAgentEvent({ ...valid.done, projectId: "-Users-x.y z" })).toBe(true);
    expect(isAgentEvent({ ...valid.done, projectId: "" })).toBe(false);
  });

  it("exports the pattern the guard uses", () => {
    expect(ID_PATTERN.test("a".repeat(128))).toBe(true);
    expect(ID_PATTERN.test("a".repeat(129))).toBe(false);
    expect(ID_PATTERN.test("a.b")).toBe(false);
  });
});
