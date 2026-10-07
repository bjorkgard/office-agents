import { describe, expect, it } from "vite-plus/test";
import { MAX_STRING_LENGTH } from "../shared/events.ts";
import {
  ATTENTION_NOTIFICATIONS,
  HOOK_EVENTS,
  REJECT_AGENT_ID,
  REJECT_SESSION_ID,
  hookToEvents,
} from "./hooks-adapter.ts";

const NOW = 1_800_000_000_000;
const base = {
  session_id: "sess1",
  cwd: "/work/proj",
  transcript_path: "/home/u/.claude/projects/-work-proj/sess1.jsonl",
};
const run = (payload: unknown, now = NOW) => hookToEvents(payload, { now });

describe("hookToEvents", () => {
  it("PermissionRequest -> needs_attention for the session, stamped with the receipt time", () => {
    const [e, ...rest] = run({
      ...base,
      hook_event_name: "PermissionRequest",
      tool_name: "Bash",
      tool_use_id: "tu1",
    });
    expect(rest).toEqual([]);
    expect(e).toMatchObject({
      kind: "needs_attention",
      sessionId: "sess1",
      agentId: null,
      projectId: "-work-proj",
      ts: NOW,
      waitingSince: NOW,
    });
    expect(e.kind === "needs_attention" && e.episodeId).toMatch(/^[0-9a-f]{32}$/);
  });

  describe("AskUserQuestion (real probe payload shape: PermissionRequest, no tool_use_id)", () => {
    const SECRET = "s3cret-question-text";
    const ask = {
      ...base,
      hook_event_name: "PermissionRequest",
      tool_name: "AskUserQuestion",
      tool_input: { questions: [{ question: SECRET }] },
      effort: "high",
      permission_mode: "default",
      prompt_id: "p1",
      scratchpad_dir: "/tmp/scratch",
    };

    it("yields exactly one needs_attention and leaks nothing from tool_input", () => {
      const events = run(ask);
      expect(events).toHaveLength(1);
      const [e] = events;
      expect(e).toMatchObject({
        kind: "needs_attention",
        sessionId: "sess1",
        agentId: null,
        waitingSince: NOW,
      });
      expect(e.kind === "needs_attention" && e.episodeId).toMatch(/^[0-9a-f]{32}$/);
      expect(JSON.stringify(e)).not.toContain(SECRET);
    });

    it("falls back to the receipt time: the same payload at two times is two episodes", () => {
      const a = run(ask, NOW)[0];
      const b = run(ask, NOW + 1000)[0];
      expect(a.kind === "needs_attention" && b.kind === "needs_attention").toBe(true);
      expect(a.kind === "needs_attention" && a.episodeId).not.toBe(
        b.kind === "needs_attention" && b.episodeId,
      );
    });

    it("the PostToolUse that follows yields no events", () => {
      expect(
        run({ ...base, hook_event_name: "PostToolUse", tool_name: "AskUserQuestion" }),
      ).toEqual([]);
    });
  });

  it("keeps the agent id when the permission request came from a subagent", () => {
    expect(
      run({ ...base, hook_event_name: "PermissionRequest", agent_id: "ag1" })[0],
    ).toMatchObject({
      kind: "needs_attention",
      agentId: "ag1",
    });
  });

  it.each([...ATTENTION_NOTIFICATIONS])("Notification %s -> needs_attention", (type) => {
    expect(run({ ...base, hook_event_name: "Notification", notification_type: type })).toHaveLength(
      1,
    );
  });

  it.each(["idle_prompt", "agent_completed", "auth_success", "", 5, null])(
    "Notification type %j is ignored",
    (type) => {
      expect(run({ ...base, hook_event_name: "Notification", notification_type: type })).toEqual(
        [],
      );
    },
  );

  it("ignores a Notification without a type", () => {
    expect(run({ ...base, hook_event_name: "Notification" })).toEqual([]);
  });

  it("SubagentStart -> agent_started with no parent and the cwd as path", () => {
    expect(run({ ...base, hook_event_name: "SubagentStart", agent_id: "ag1" })).toEqual([
      {
        kind: "agent_started",
        sessionId: "sess1",
        agentId: "ag1",
        projectId: "-work-proj",
        projectPath: "/work/proj",
        parentAgentId: null,
        ts: NOW,
      },
    ]);
  });

  it("SubagentStop -> done without a question", () => {
    expect(run({ ...base, hook_event_name: "SubagentStop", agent_id: "ag1" })).toEqual([
      {
        kind: "done",
        sessionId: "sess1",
        agentId: "ag1",
        projectId: "-work-proj",
        endsWithQuestion: false,
        ts: NOW,
      },
    ]);
  });

  it("takes the project from a subagent-style transcript path too", () => {
    const transcript_path = "/h/.claude/projects/-p/sess1/subagents/agent-ag1.jsonl";
    const [e] = run({
      ...base,
      transcript_path,
      hook_event_name: "SubagentStart",
      agent_id: "ag1",
    });
    expect(e.projectId).toBe("-p");
  });

  it("falls back to the encoded cwd when the transcript path has no session segment", () => {
    const [e] = run({
      ...base,
      transcript_path: "/elsewhere/x.jsonl",
      hook_event_name: "SubagentStart",
      agent_id: "ag1",
    });
    expect(e.projectId).toBe("-work-proj");
  });

  it("makes the episode id deterministic and sensitive to session, agent and tool id", () => {
    const id = (over: Record<string, unknown>) => {
      const e = run({ ...base, hook_event_name: "PermissionRequest", ...over })[0];
      return e.kind === "needs_attention" ? e.episodeId : "";
    };
    expect(id({ tool_use_id: "a" })).toBe(id({ tool_use_id: "a" }));
    expect(id({ tool_use_id: "a" })).not.toBe(id({ tool_use_id: "b" }));
    expect(id({ tool_use_id: "a" })).not.toBe(id({ tool_use_id: "a", agent_id: "x" }));
    expect(id({ tool_use_id: "a" })).not.toBe(id({ tool_use_id: "a", session_id: "s2" }));
  });

  it.each([
    ["subagent start without an agent id", { hook_event_name: "SubagentStart" }],
    ["subagent stop without an agent id", { hook_event_name: "SubagentStop" }],
    ["no session id", { hook_event_name: "PermissionRequest", session_id: undefined }],
    ["empty session id", { hook_event_name: "PermissionRequest", session_id: "" }],
    ["non-string session id", { hook_event_name: "PermissionRequest", session_id: 4 }],
    [
      "session id over the length cap",
      { hook_event_name: "PermissionRequest", session_id: "s".repeat(MAX_STRING_LENGTH + 1) },
    ],
    [
      "agent id over the length cap",
      {
        hook_event_name: "SubagentStart",
        agent_id: "a".repeat(MAX_STRING_LENGTH + 1),
      },
    ],
    [
      "no cwd and no usable transcript path",
      {
        hook_event_name: "PermissionRequest",
        cwd: undefined,
        transcript_path: undefined,
      },
    ],
  ])("drops %s", (_what, over) => {
    expect(run({ ...base, ...over })).toEqual([]);
  });

  it.each([
    ["Stop", {}],
    ["SessionStart", {}],
    ["UserPromptSubmit", {}],
    ["PreToolUse", {}],
    ["__proto__", {}],
    ["constructor", {}],
    ["toString", {}],
    ["", {}],
  ])("ignores the %j hook", (name) => {
    expect(run({ ...base, hook_event_name: name, agent_id: "ag1" })).toEqual([]);
  });

  it.each([null, undefined, 3, "x", [], [{ hook_event_name: "SubagentStart" }], true])(
    "returns [] for payload %j",
    (payload) => {
      expect(run(payload)).toEqual([]);
    },
  );

  it.each([
    ["session_id", REJECT_SESSION_ID, { hook_event_name: "PermissionRequest" }],
    ["agent_id", REJECT_AGENT_ID, { hook_event_name: "SubagentStart" }],
    ["agent_id", REJECT_AGENT_ID, { hook_event_name: "PermissionRequest" }],
  ])("a bad %s returns [] and reports the reason without the value", (key, reason, over) => {
    for (const value of ["../x", "a b", "caf\u00e9", ".", "x".repeat(129)]) {
      const reasons: string[] = [];
      const out = hookToEvents(
        { ...base, agent_id: "ag1", ...over, [key]: value },
        { now: NOW, onReject: (r) => reasons.push(r) },
      );
      expect(out).toEqual([]);
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toBe(reason);
      expect(reasons[0]).not.toContain(value);
    }
  });

  it.each([
    ["session_id", REJECT_SESSION_ID, { hook_event_name: "PermissionRequest" }],
    ["agent_id", REJECT_AGENT_ID, { hook_event_name: "SubagentStart" }],
    ["agent_id", REJECT_AGENT_ID, { hook_event_name: "PermissionRequest" }],
  ])("a present non-string %s returns [] and reports exactly one reason", (key, reason, over) => {
    for (const value of [123, true, {}, [], ["x"]]) {
      const reasons: string[] = [];
      const out = hookToEvents(
        { ...base, agent_id: "ag1", ...over, [key]: value },
        { now: NOW, onReject: (r) => reasons.push(r) },
      );
      expect(out).toEqual([]);
      expect(reasons).toEqual([reason]);
    }
  });

  it.each([null, "", undefined, "absent"])(
    "treats agent_id %j as the main agent on PermissionRequest, nothing reported",
    (value) => {
      const reasons: string[] = [];
      const payload: Record<string, unknown> = { ...base, hook_event_name: "PermissionRequest" };
      delete payload.agent_id;
      if (value !== "absent") payload.agent_id = value;
      const out = hookToEvents(payload, { now: NOW, onReject: (r) => reasons.push(r) });
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ kind: "needs_attention", agentId: null });
      expect(reasons).toEqual([]);
    },
  );

  it("treats an empty agent_id as absent: main-session event, nothing reported", () => {
    const reasons: string[] = [];
    const out = hookToEvents(
      { ...base, hook_event_name: "PermissionRequest", agent_id: "" },
      { now: NOW, onReject: (r) => reasons.push(r) },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "needs_attention", agentId: null });
    expect(reasons).toEqual([]);
  });

  it("treats an empty session_id as absent: no events, nothing reported", () => {
    const reasons: string[] = [];
    const out = hookToEvents(
      { ...base, hook_event_name: "PermissionRequest", session_id: "" },
      { now: NOW, onReject: (r) => reasons.push(r) },
    );
    expect(out).toEqual([]);
    expect(reasons).toEqual([]);
  });

  it("does not report an ignored hook or a good payload", () => {
    const reasons: string[] = [];
    const ctx = { now: NOW, onReject: (r: string) => reasons.push(r) };
    hookToEvents({ ...base, hook_event_name: "Stop", session_id: "../x" }, ctx);
    hookToEvents({ ...base, hook_event_name: "SubagentStart", agent_id: "ag1" }, ctx);
    expect(reasons).toEqual([]);
  });

  it("does not throw on hostile objects", () => {
    const evil = new Proxy(
      {},
      {
        get() {
          throw new Error("boom");
        },
        has() {
          throw new Error("boom");
        },
        getOwnPropertyDescriptor() {
          throw new Error("boom");
        },
      },
    );
    expect(run(evil)).toEqual([]);
  });

  it("clamps a bad receipt time to a valid timestamp", () => {
    expect(run({ ...base, hook_event_name: "SubagentStop", agent_id: "a" }, -5)[0].ts).toBe(0);
    expect(run({ ...base, hook_event_name: "SubagentStop", agent_id: "a" }, NaN)[0].ts).toBe(0);
    expect(run({ ...base, hook_event_name: "SubagentStop", agent_id: "a" }, 12.9)[0].ts).toBe(12);
  });

  it("names every mapped hook in the table", () => {
    expect(Object.keys(HOOK_EVENTS).sort()).toEqual([
      "Notification",
      "PermissionRequest",
      "SubagentStart",
      "SubagentStop",
    ]);
  });

  it("never carries payload content into an event", () => {
    const canary = "CANARY-9f3a";
    const events = ["PermissionRequest", "Notification", "SubagentStart", "SubagentStop"].flatMap(
      (name) =>
        run({
          ...base,
          hook_event_name: name,
          notification_type: "permission_prompt",
          agent_id: "ag1",
          message: canary,
          prompt: canary,
          tool_input: { command: canary },
          last_assistant_message: canary,
          agent_type: canary,
        }),
    );
    expect(events).toHaveLength(4);
    expect(JSON.stringify(events)).not.toContain(canary);
  });
});
