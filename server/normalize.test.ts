import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { MAX_STRING_LENGTH, parseAgentEvent, type AgentEvent } from "../shared/events.ts";
import {
  createNormalizerState,
  endsWithQuestion,
  NOTIFICATION_STATUSES,
  normalize,
  normalizeBatch,
} from "./normalize.ts";
import { hashId, parseCliArgs, sanitizeFileName, sanitizeTranscript } from "./sanitize-fixtures.ts";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const lines = (name: string): string[] =>
  readFileSync(join(dir, `${name}.jsonl`), "utf8")
    .split("\n")
    .filter(Boolean);
const top = () => createNormalizerState({ projectId: "p1", subagent: false });
const sub = () => createNormalizerState({ projectId: "p1", subagent: true });
const run = (state: ReturnType<typeof top>, name: string): AgentEvent[] =>
  lines(name).flatMap((l) => normalize(state, l));
const handoffs = (events: AgentEvent[]) =>
  events.filter((e) => e.kind === "handoff").map((e) => `${e.toAgentId}:${e.direction}`);

const ONE = hashId("agent-one");
const TWO = hashId("agent-two");

describe("endsWithQuestion", () => {
  it("strips trailing whitespace and newlines", () => {
    expect(endsWithQuestion("really?  \n")).toBe(true);
    expect(endsWithQuestion("really.")).toBe(false);
    expect(endsWithQuestion("")).toBe(false);
  });
});

describe("async flow", () => {
  const state = top();
  const events = run(state, "async-flow");

  it("synthesizes agent_started once, from the first line, with the fixture cwd", () => {
    const started = events.filter((e) => e.kind === "agent_started");
    expect(started).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "agent_started",
      projectPath: "/fixture/project",
      agentId: null,
    });
  });

  it("async_launched emits an out handoff and no waiting_on_subagents (D7)", () => {
    expect(events.some((e) => e.kind === "waiting_on_subagents")).toBe(false);
    expect(handoffs(events).slice(0, 2)).toEqual([`${ONE}:out`, `${TWO}:out`]);
  });

  it("completed and failed notifications both emit a back handoff", () => {
    expect(handoffs(events)).toContain(`${ONE}:back`);
    expect(handoffs(events)).toContain(`${TWO}:back`);
  });

  it("duplicate copies (attachment, repeated enqueue, remove) give one walk-back per launch", () => {
    expect(handoffs(events).filter((h) => h === `${ONE}:back`)).toHaveLength(2); // launch + SendMessage resume
    expect(handoffs(events).filter((h) => h === `${TWO}:back`)).toHaveLength(1);
  });

  it("a SendMessage resume carries a new tool-use-id, so its completion survives", () => {
    const back = handoffs(events).filter((h) => h === `${ONE}:back`);
    expect(back).toHaveLength(2);
  });

  it("an unknown tool-use-id is an orphan: ignored and counted", () => {
    expect(state.drift.orphan_completion).toBe(1);
  });

  it("top-level end_turn emits done with endsWithQuestion from the same message (x?)", () => {
    expect(events.at(-1)).toMatchObject({ kind: "done", endsWithQuestion: true, agentId: null });
  });

  it("turn_duration and unknown line types emit nothing and are not drift", () => {
    // The fixture's two Agent launches carry no subagent_type (the sanitizer strips it); a
    // missing type is the general-purpose fallback, not drift, so only the orphan counts.
    expect(state.drift).toEqual({ orphan_completion: 1 });
  });

  it("every event passes the guard and carries no text", () => {
    const json = JSON.stringify(events);
    expect(json).not.toContain("secret");
    expect(json).not.toContain("/Users/");
  });
});

describe("task-notification ids", () => {
  const use = (id: string, name: string, input: Record<string, unknown> = {}) =>
    JSON.stringify({
      type: "assistant",
      sessionId: "s",
      timestamp: "2026-10-02T10:00:00Z",
      message: { content: [{ type: "tool_use", id, name, input }], stop_reason: "tool_use" },
    });
  const notify = (toolUseId: string, taskId = "task1") =>
    JSON.stringify({
      type: "queue-operation",
      operation: "enqueue",
      sessionId: "s",
      timestamp: "2026-10-02T10:00:01Z",
      content: `<task-notification><task-id>${taskId}</task-id><tool-use-id>${toolUseId}</tool-use-id><status>completed</status></task-notification>`,
    });
  it("a non-agent tool_use in the same file emits nothing and is not drift", () => {
    const state = top();
    normalize(state, use("bg1", "Bash"));
    expect(normalize(state, notify("bg1"))).toEqual([]);
    expect(state.drift).toEqual({});
    expect(state.completed.size).toBe(0);
  });
  it("an id with no tool_use in the file is still an orphan", () => {
    const state = top();
    expect(normalize(state, notify("ghost"))).toEqual([]);
    expect(state.drift).toEqual({ orphan_completion: 1 });
  });
  it("an Agent launch still hands back", () => {
    const state = top();
    normalize(state, use("a1", "Agent", { run_in_background: true }));
    expect(handoffs(normalize(state, notify("a1")))).toHaveLength(1);
    expect(state.drift).toEqual({});
  });
  it("a SendMessage resume of a known agent still hands back", () => {
    const state = top();
    normalize(state, use("a1", "Agent", { run_in_background: true }));
    state.launches.get("a1")!.agentId = "ag1";
    normalize(state, use("m1", "SendMessage", { to: "ag1" }));
    expect(handoffs(normalize(state, notify("m1", "task2")))).toEqual(["ag1:back"]);
    expect(state.drift).toEqual({});
  });
  it("a SendMessage to an unknown agent is not a known tool id and stays an orphan", () => {
    const state = top();
    normalize(state, use("m1", "SendMessage", { to: "nobody" }));
    normalize(state, notify("m1"));
    expect(state.drift).toEqual({ orphan_completion: 1 });
  });
});

describe("sync flow", () => {
  it("sync launch waits on subagents, then a completed result hands back; end_turn x is a plain done", () => {
    const events = run(top(), "sync-flow");
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("waiting_on_subagents");
    expect(handoffs(events)).toEqual([
      `${hashId("agent-sync")}:out`,
      `${hashId("agent-sync")}:back`,
    ]);
    expect(events.at(-1)).toMatchObject({ kind: "done", endsWithQuestion: false });
  });
});

describe("subagent file", () => {
  it("end_turn emits no done and events carry the agentId", () => {
    const events = run(sub(), "sub-live");
    expect(events.some((e) => e.kind === "done")).toBe(false);
    expect(events[0]).toMatchObject({ kind: "agent_started", agentId: hashId("agent-live") });
    expect(run(sub(), "sub-finished").some((e) => e.kind === "done")).toBe(false);
  });
});

describe("cold start (E3)", () => {
  it("a finished subagent emits nothing", () => {
    expect(normalizeBatch(sub(), lines("sub-finished"))).toEqual([]);
  });
  it("a finished top-level ending in ? emits started plus done", () => {
    const events = normalizeBatch(top(), lines("top-finished-question"));
    expect(events.map((e) => e.kind)).toEqual(["agent_started", "done"]);
    expect(events[1]).toMatchObject({ endsWithQuestion: true });
  });
  it("a finished top-level without ? emits nothing", () => {
    expect(normalizeBatch(top(), lines("top-finished-plain"))).toEqual([]);
  });
  it("unfinished files arrive normally, turn_duration ignored", () => {
    const events = normalizeBatch(top(), lines("top-live"));
    expect(events[0].kind).toBe("agent_started");
    expect(events.some((e) => e.kind === "working")).toBe(true);
    expect(events.some((e) => e.kind === "done")).toBe(false);
    expect(normalizeBatch(sub(), lines("sub-live"))[0].kind).toBe("agent_started");
  });
  it("a first batch of only unknown lines does not suppress the next batch", () => {
    const state = top();
    expect(normalizeBatch(state, [JSON.stringify({ type: "mystery" })])).toEqual([]);
    const events = normalizeBatch(state, lines("top-live"));
    expect(events.some((e) => e.kind === "working")).toBe(true);
  });
  it("a finished subagent that later resumes is synthesized then", () => {
    const state = sub();
    expect(normalizeBatch(state, lines("sub-finished"))).toEqual([]);
    const next = normalize(state, lines("sub-live")[1]);
    expect(next[0].kind).toBe("agent_started");
  });
  it("replaying a finished file keeps launch state for later notifications", () => {
    const state = top();
    const all = lines("async-flow");
    normalizeBatch(state, all.slice(0, 3));
    expect(state.launches.size).toBe(2);
  });
});

describe("state map bounds", () => {
  const stamp = "2026-10-02T10:00:00.000Z";
  const assistant = (id: string) =>
    JSON.stringify({
      type: "assistant",
      sessionId: "s",
      cwd: "/x",
      timestamp: stamp,
      message: {
        role: "assistant",
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id, name: "Agent", input: {} }],
      },
    });

  it("does not store an over-long tool id or launched agent id", () => {
    const state = top();
    normalize(state, assistant("t".repeat(600)));
    expect(state.launches.size).toBe(0);
    normalize(state, assistant("ok"));
    expect(state.launches.size).toBe(1);
    const result = (agentId: string) =>
      JSON.stringify({
        type: "user",
        sessionId: "s",
        timestamp: stamp,
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "ok" }] },
        toolUseResult: { status: "completed", agentId },
      });
    const out = normalize(state, result("a".repeat(600)));
    expect(out.some((e) => e.kind === "handoff")).toBe(false);
    expect(state.launches.get("ok")?.agentId).toBeNull();
    expect(state.completed.size).toBe(0);
  });
});

describe("drift", () => {
  it("malformed JSON returns [] and counts", () => {
    const state = top();
    expect(normalize(state, "{not json")).toEqual([]);
    expect(state.drift.malformed_json).toBe(1);
  });
  it("known type with a bad shape returns [] and counts", () => {
    const state = top();
    const bad = JSON.stringify({
      type: "assistant",
      sessionId: "s",
      timestamp: "2026-10-02T10:00:00Z",
      message: 5,
    });
    expect(normalize(state, bad)).toEqual([]);
    expect(state.drift.bad_shape).toBe(1);
  });
  it("a bad timestamp counts and emits nothing", () => {
    const state = top();
    const bad = JSON.stringify({
      type: "user",
      sessionId: "s",
      timestamp: "nope",
      message: { content: "x" },
    });
    expect(normalize(state, bad)).toEqual([]);
    expect(state.drift.bad_timestamp).toBe(1);
  });
  it("a bad timestamp on a finished file's last record counts as bad_timestamp in a batch", () => {
    const state = top();
    const batch = lines("top-finished-question").map((l, i, all) =>
      i === all.length - 1 ? l.replace(/"timestamp":"[^"]*"/, '"timestamp":"nope"') : l,
    );
    expect(normalizeBatch(state, batch)).toEqual([]);
    expect(state.drift.bad_shape).toBeUndefined();
    expect(state.drift.bad_timestamp).toBeGreaterThan(0);
  });
  it("an event the guard rejects counts as bad_event", () => {
    const state = top();
    const line = JSON.stringify({
      type: "assistant",
      sessionId: "s".repeat(600),
      timestamp: "2026-10-02T10:00:00Z",
      message: { content: [], stop_reason: "tool_use" },
    });
    expect(normalize(state, line)).toEqual([]);
    expect(state.drift.bad_event).toBeGreaterThan(0);
  });
  it("evicts the oldest launch past MAP_CAP", () => {
    const state = top();
    for (let i = 0; i < 2001; i++) {
      normalize(
        state,
        JSON.stringify({
          type: "assistant",
          sessionId: "s",
          timestamp: "2026-10-02T10:00:00Z",
          message: {
            content: [{ type: "tool_use", id: `t${i}`, name: "Agent", input: {} }],
            stop_reason: "tool_use",
          },
        }),
      );
    }
    expect(state.launches.size).toBe(2000);
    expect(state.launches.has("t0")).toBe(false);
    expect(state.launches.has("t2000")).toBe(true);
  });
  it("evicts the oldest non-agent tool id past MAP_CAP and ignores an over-long one", () => {
    const state = top();
    const use = (id: string, name: string) =>
      JSON.stringify({
        type: "assistant",
        sessionId: "s",
        timestamp: "2026-10-02T10:00:00Z",
        message: { content: [{ type: "tool_use", id, name, input: {} }], stop_reason: "tool_use" },
      });
    for (let i = 0; i < 2001; i++) normalize(state, use(`b${i}`, "Bash"));
    const long = "x".repeat(MAX_STRING_LENGTH + 1);
    normalize(state, use(long, "Bash"));
    expect(state.otherTools.size).toBe(2000);
    expect(state.otherTools.has(long)).toBe(false);
    expect(state.otherTools.has("b0")).toBe(false);
    expect(state.otherTools.has("b1")).toBe(true);
    expect(state.otherTools.has("b2000")).toBe(true);
  });
  it("an unknown line type returns [] without drift", () => {
    const state = top();
    expect(normalize(state, JSON.stringify({ type: "mystery", sessionId: "s" }))).toEqual([]);
    expect(state.drift).toEqual({});
  });
});

describe("fixture leak check (ET5)", () => {
  const HASH = /^[0-9a-f]{16}$/;
  const ISO = /^\d{4}-\d\d-\d\dT[\d:.]+Z$/;
  const NOTIFICATION = new RegExp(
    "^<task-notification><task-id>[0-9a-f]{16}</task-id><tool-use-id>[0-9a-f]{16}</tool-use-id>" +
      `<status>(${NOTIFICATION_STATUSES.join("|")})</status></task-notification>$`,
  );
  const WORDS = new Set([
    "assistant",
    "user",
    "queue-operation",
    "system",
    "attachment",
    "other",
    "text",
    "thinking",
    "tool_use",
    "tool_result",
    "Agent",
    "Bash",
    "Read",
    "SendMessage",
    "x",
    "x?",
    "end_turn",
    "stop_sequence",
    "max_tokens",
    "async_launched",
    ...NOTIFICATION_STATUSES,
    "enqueue",
    "remove",
    "dequeue",
    "popAll",
    "turn_duration",
    "stop_hook_summary",
    "informational",
    "/fixture/project",
  ]);
  const KEYS = new Set([
    "type",
    "sessionId",
    "agentId",
    "isSidechain",
    "cwd",
    "timestamp",
    "message",
    "role",
    "stop_reason",
    "content",
    "text",
    "id",
    "name",
    "input",
    "run_in_background",
    "to",
    "tool_use_id",
    "operation",
    "subtype",
    "toolUseResult",
    "status",
    "isAsync",
  ]);

  function scan(value: unknown, where: string): void {
    if (typeof value === "string") {
      const ok =
        WORDS.has(value) ||
        HASH.test(value) ||
        ISO.test(value) ||
        NOTIFICATION.test(value) ||
        value === "user" ||
        value === "assistant";
      expect(ok, `non-allowlisted string at ${where}: ${value.slice(0, 40)}`).toBe(true);
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => scan(v, `${where}[${i}]`));
    } else if (typeof value === "object" && value !== null) {
      for (const [k, v] of Object.entries(value)) {
        expect(KEYS.has(k), `non-allowlisted key ${k} at ${where}`).toBe(true);
        scan(v, `${where}.${k}`);
      }
    }
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  it("fixtures exist", () => expect(files.length).toBeGreaterThanOrEqual(7));
  for (const f of files) {
    it(`${f} holds only allowlisted strings and no home path`, () => {
      const raw = readFileSync(join(dir, f), "utf8");
      expect(raw).not.toMatch(/\/Users\/|\/home\/|C:\\\\Users|nathanael/i);
      raw
        .split("\n")
        .filter(Boolean)
        .forEach((l, i) => scan(JSON.parse(l), `${f}:${i + 1}`));
    });
  }

  it("the sanitizer drops text, summaries, paths and extra keys, and keeps a trailing ?", () => {
    const raw = JSON.stringify({
      type: "assistant",
      sessionId: "s",
      cwd: "/Users/someone/secret",
      timestamp: "2026-10-02T10:00:00.000Z",
      secretKey: "leak",
      message: {
        role: "assistant",
        stop_reason: "end_turn",
        content: [
          { type: "text", text: "my password?\n" },
          { type: "tool_use", id: "t", name: "Bash", input: { command: "cat /etc/passwd" } },
        ],
      },
    });
    const out = sanitizeTranscript(raw);
    expect(out).not.toMatch(/password|someone|leak|passwd/);
    expect(out).toContain('"text":"x?"');
  });

  // Value: protects=killed completions survive fixture sanitizing; fails_when=killed is dropped from the status list or an unknown status passes through; why_new=only async_launched was asserted; seam=none
  it("the sanitizer keeps a killed status and maps an unknown one away", () => {
    const line = (status: string) =>
      JSON.stringify({ type: "user", sessionId: "s", toolUseResult: { status } });
    expect(JSON.parse(sanitizeTranscript(line("killed"))).toolUseResult.status).toBe("killed");
    const out = sanitizeTranscript(line("secret-status"));
    expect(out).not.toContain("secret");
    expect(JSON.parse(out).toolUseResult.status).toBeUndefined();
  });

  it("re-serializes timestamps so date-parsable text cannot leak", () => {
    const out = sanitizeTranscript(
      JSON.stringify({ type: "user", sessionId: "s", timestamp: "secret 2026-01-01" }),
    );
    expect(out).not.toContain("secret");
    expect(out).toMatch(/"timestamp":"\d{4}-\d\d-\d\dT[\d:.]+Z"/);
  });

  it("hashes ids consistently, including file names", () => {
    expect(sanitizeFileName("agent-abc123.jsonl")).toBe(`agent-${hashId("abc123")}.jsonl`);
    expect(sanitizeFileName("agent-abc123.meta.json")).toBe(`agent-${hashId("abc123")}.meta.json`);
    expect(sanitizeFileName("sess-1.jsonl")).toBe(`${hashId("sess-1")}.jsonl`);
  });

  it("a salt changes every hash but keeps links between ids within one run", () => {
    expect(hashId("abc123", "pepper")).not.toBe(hashId("abc123"));
    expect(hashId("abc123", "pepper")).toBe(hashId("abc123", "pepper"));
    expect(hashId("abc123", "pepper")).not.toBe(hashId("abc123", "salt"));
    const line = (extra: object) =>
      JSON.stringify({ type: "assistant", sessionId: "s", agentId: "a1", ...extra });
    const use = {
      message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Bash" }] },
    };
    const res = {
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1" }] },
    };
    const out = sanitizeTranscript([line(use), line(res)].join("\n"), "pepper");
    expect(out).toContain(`"id":"${hashId("t1", "pepper")}"`);
    expect(out).toContain(`"tool_use_id":"${hashId("t1", "pepper")}"`);
    expect(out).toContain(`"agentId":"${hashId("a1", "pepper")}"`);
    expect(out).not.toContain(hashId("t1"));
    expect(sanitizeFileName("agent-abc123.jsonl", "pepper")).toBe(
      `agent-${hashId("abc123", "pepper")}.jsonl`,
    );
  });

  it("maps a tool name outside the known list to a fixed placeholder", () => {
    const line = (name: string) =>
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "tool_use", id: "t", name }] },
      });
    const names = (name: string) =>
      JSON.parse(sanitizeTranscript(line(name)).trim()).message.content[0].name;
    expect(names("Bash")).toBe("Bash");
    expect(names("SendMessage")).toBe("SendMessage");
    expect(names("mcp__acme-payroll__fire_jane")).toBe("x");
    expect(names("jane-doe-deploy")).toBe("x");
  });
});

describe("over-long cwd", () => {
  it("truncates projectPath so the agent still starts", () => {
    const state = top();
    const line = JSON.stringify({
      type: "assistant",
      sessionId: "s-long",
      cwd: "/" + "a".repeat(2000),
      timestamp: "2026-01-01T00:00:00.000Z",
      message: { role: "assistant", stop_reason: "tool_use", content: [] },
    });
    const events = normalize(state, line);
    const started = events.find((e) => e.kind === "agent_started");
    expect(started).toBeDefined();
    expect(started?.kind === "agent_started" && started.projectPath.length).toBe(512);
    expect(state.drift.bad_event).toBeUndefined();
  });
});

describe("atomic handlers", () => {
  const env = { sessionId: "s-atomic", cwd: "/p", timestamp: "2026-01-01T00:00:00.000Z" };
  const assistant = (content: unknown[]) =>
    JSON.stringify({
      type: "assistant",
      ...env,
      message: { role: "assistant", stop_reason: "tool_use", content },
    });

  it("a malformed later tool_result leaves no state change, so the notification still hands back", () => {
    const state = top();
    normalize(
      state,
      assistant([
        { type: "tool_use", id: "T1", name: "Agent", input: { run_in_background: true } },
      ]),
    );
    const user = JSON.stringify({
      type: "user",
      ...env,
      toolUseResult: { status: "completed", agentId: "A1" },
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "T1" }, { type: "tool_result" }],
      },
    });
    expect(normalize(state, user)).toEqual([]);
    const note = JSON.stringify({
      type: "queue-operation",
      ...env,
      operation: "enqueue",
      content:
        "<task-notification><task-id>A1</task-id><tool-use-id>T1</tool-use-id><status>completed</status></task-notification>",
    });
    expect(handoffs(normalize(state, note))).toEqual(["A1:back"]);
  });

  it("ignores enqueue content that embeds the tag mid-string", () => {
    const state = top();
    const before = { ...state.drift };
    const note = JSON.stringify({
      type: "queue-operation",
      ...env,
      operation: "enqueue",
      content:
        "quoted: <task-notification><task-id>A1</task-id><tool-use-id>T1</tool-use-id><status>completed</status></task-notification>",
    });
    expect(normalize(state, note)).toEqual([]);
    expect(state.drift).toEqual(before);
  });

  it("a malformed later tool_use leaves no stale launch entry", () => {
    const state = top();
    const events = normalize(
      state,
      assistant([
        { type: "tool_use", id: "T1", name: "Agent", input: { run_in_background: false } },
        { type: "tool_use", id: "T2" },
      ]),
    );
    expect(events).toEqual([]);
    expect(state.launches.size).toBe(0);
    expect(state.drift.bad_shape).toBe(1);
  });
});

describe("backlog follow-ups", () => {
  const env = { sessionId: "S", cwd: "/x", timestamp: "2026-10-02T10:00:00.000Z" };
  const rec = (type: string, extra: object) => JSON.stringify({ type, ...env, ...extra });
  const launch = (id: string) =>
    rec("assistant", {
      message: {
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id, name: "Agent", input: { run_in_background: true } }],
      },
    });

  it("pairs each tool_result in one record with its own toolUseResult (array or object)", () => {
    const state = top();
    normalize(state, launch("T1"));
    normalize(state, launch("T2"));
    const user = (toolUseResult: unknown) =>
      rec("user", {
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "T1" },
            { type: "tool_result", tool_use_id: "T2" },
          ],
        },
        toolUseResult,
      });
    const events = normalize(
      state,
      user([
        { tool_use_id: "T2", status: "async_launched", agentId: "B" },
        { tool_use_id: "T1", status: "async_launched", agentId: "A" },
      ]),
    );
    expect(handoffs(events)).toEqual(["A:out", "B:out"]);
    // A lone object cannot be told apart across two blocks, so it maps to neither.
    const s2 = top();
    normalize(s2, launch("T1"));
    normalize(s2, launch("T2"));
    expect(handoffs(normalize(s2, user({ status: "async_launched", agentId: "A" })))).toEqual([]);
  });

  it("falls back by position only for array entries that name no block", () => {
    const state = top();
    normalize(state, launch("T1"));
    normalize(state, launch("T2"));
    const events = normalize(
      state,
      rec("user", {
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "T1" },
            { type: "tool_result", tool_use_id: "T2" },
          ],
        },
        toolUseResult: [
          { tool_use_id: "T2", status: "async_launched", agentId: "B" },
          { status: "async_launched", agentId: "A" },
        ],
      }),
    );
    expect(handoffs(events)).toEqual(["A:out", "B:out"]);
  });

  it("takes the session id from the file path, not the record body", () => {
    const state = createNormalizerState({ projectId: "p1", subagent: false, sessionId: "FILE" });
    const events = normalize(state, rec("user", { sessionId: "OTHER", message: { content: "x" } }));
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.sessionId === "FILE")).toBe(true);
  });

  it("fills parentAgentId from the launcher when known, else null", () => {
    const state = createNormalizerState({
      projectId: "p1",
      subagent: true,
      parentOf: (id) => (id === "kid" ? "mid" : null),
    });
    const line = rec("user", { agentId: "kid", message: { content: "x" } });
    expect(normalize(state, line)[0]).toMatchObject({
      kind: "agent_started",
      parentAgentId: "mid",
    });
    const none = createNormalizerState({ projectId: "p1", subagent: true });
    expect(normalize(none, line)[0]).toMatchObject({ parentAgentId: null });
  });

  it("normalizeBatch isolates a throwing line and reports it", () => {
    const state = top();
    const seen: unknown[] = [];
    const orig = state.launches.set.bind(state.launches);
    state.launches.set = () => {
      throw new Error("boom");
    };
    const events = normalizeBatch(
      state,
      [launch("T1"), rec("user", { message: { content: "x" } })],
      (e) => seen.push(e),
    );
    state.launches.set = orig;
    expect(seen).toHaveLength(1);
    expect(events.length).toBeGreaterThan(0);
  });
});

describe("sanitize-fixtures CLI args", () => {
  it("treats an empty OFFICE_FIXTURE_SALT as unset and falls back to a random salt", () => {
    const a = parseCliArgs(["out", "t.jsonl"], { OFFICE_FIXTURE_SALT: "" });
    expect(a).toMatchObject({ outDir: "out", inputs: ["t.jsonl"] });
    expect(a?.salt).toMatch(/^[0-9a-f]{32}$/);
  });

  it("uses a non-empty OFFICE_FIXTURE_SALT", () => {
    expect(parseCliArgs(["out", "t.jsonl"], { OFFICE_FIXTURE_SALT: "pepper" })?.salt).toBe(
      "pepper",
    );
  });

  it("recognises --salt in any position, and it beats the env var", () => {
    const env = { OFFICE_FIXTURE_SALT: "env" };
    for (const args of [
      ["--salt", "cli", "out", "a.jsonl", "b.jsonl"],
      ["out", "--salt", "cli", "a.jsonl", "b.jsonl"],
      ["out", "a.jsonl", "b.jsonl", "--salt", "cli"],
    ]) {
      expect(parseCliArgs(args, env)).toEqual({
        salt: "cli",
        outDir: "out",
        inputs: ["a.jsonl", "b.jsonl"],
      });
    }
  });

  it("rejects a missing or empty --salt value and missing positionals", () => {
    expect(parseCliArgs(["out", "a.jsonl", "--salt"], {})).toBeNull();
    expect(parseCliArgs(["--salt", "", "out", "a.jsonl"], {})).toBeNull();
    expect(parseCliArgs(["out"], {})).toBeNull();
  });

  it("the committed fixtures use the empty salt, which the library default reproduces", () => {
    expect(hashId("abc123", "")).toBe(hashId("abc123"));
    expect(sanitizeTranscript("{}", "")).toBe(sanitizeTranscript("{}"));
  });
});

describe("sanitize-fixtures CLI main block", () => {
  const script = join(dirname(fileURLToPath(import.meta.url)), "sanitize-fixtures.ts");
  const run = (args: string[]) =>
    spawnSync(process.execPath, [script, ...args], {
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, OFFICE_FIXTURE_SALT: "" },
    });

  // Value: protects=a bad invocation prints usage and exits 2 instead of writing anything; fails_when=the null-args guard or exit code 2 changes; why_new=the script's main block never ran in a test; seam=none
  it("exits 2 with usage when given no arguments", () => {
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("usage:");
  });

  // Value: protects=the CLI really writes one sanitized file per input into the out dir; fails_when=the write loop, out-dir creation or salt handling breaks; why_new=only parseCliArgs was covered, not the main block; seam=none
  it("writes the sanitized transcript into a created out dir for valid arguments", () => {
    const tmp = mkdtempSync(join(tmpdir(), "office-sanitize-"));
    try {
      const input = join(tmp, "t.jsonl");
      writeFileSync(input, "{}\n");
      const out = join(tmp, "nested", "out");
      const r = run(["--salt", "pepper", out, input]);
      expect(r.status).toBe(0);
      const files = readdirSync(out);
      expect(files).toEqual([sanitizeFileName("t.jsonl", "pepper")]);
      expect(readFileSync(join(out, files[0]), "utf8")).toBe(sanitizeTranscript("{}\n", "pepper"));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("subagentKind", () => {
  const T = "2026-10-02T10:00:00Z";
  const launch = (tool: string, toolId: string, input: Record<string, unknown>) =>
    JSON.stringify({
      type: "assistant",
      sessionId: "s",
      timestamp: T,
      message: { content: [{ type: "tool_use", id: toolId, name: tool, input }] },
    });
  const result = (toolId: string, agentId: string, status: string) =>
    JSON.stringify({
      type: "user",
      sessionId: "s",
      timestamp: T,
      message: { content: [{ type: "tool_result", tool_use_id: toolId }] },
      toolUseResult: { status, agentId },
    });
  const outs = (events: AgentEvent[]) =>
    events.filter((e) => e.kind === "handoff" && e.direction === "out");
  const kindOf = (tool: string, input: Record<string, unknown>, bg = true) => {
    const state = top();
    const events = [
      launch(tool, "tu1", { ...input, run_in_background: bg }),
      result("tu1", "c1", bg ? "async_launched" : "completed"),
    ].flatMap((l) => normalize(state, l));
    const out = outs(events);
    expect(out).toHaveLength(1);
    return { sub: (out[0] as { subagentKind?: string }).subagentKind, state };
  };

  it.each([
    ["Explore", "explore"],
    ["Plan", "plan"],
    ["general-purpose", "general"],
  ])("maps %s to %s for Agent and Task", (type, kind) => {
    expect(kindOf("Agent", { subagent_type: type }).sub).toBe(kind);
    expect(kindOf("Task", { subagent_type: type }).sub).toBe(kind);
  });

  it.each([
    ["number", 7],
    ["null", null],
    ["object", { a: 1 }],
    ["empty", ""],
    ["too long", "x".repeat(513)],
    ["exactly MAX_STRING_LENGTH", "x".repeat(MAX_STRING_LENGTH)],
    ["lowercase explore", "explore"],
    ["roster name", "code-reviewer"],
    ["__proto__", "__proto__"],
    ["constructor", "constructor"],
    ["toString", "toString"],
  ])("%s subagent_type maps to other and counts drift", (_n, value) => {
    const { sub, state } = kindOf("Agent", { subagent_type: value });
    expect(sub).toBe("other");
    expect(state.drift.unmapped_subagent_type).toBe(1);
  });

  it("a missing subagent_type reads general (Claude Code's fallback) and is not drift", () => {
    const { sub, state } = kindOf("Agent", {});
    expect(sub).toBe("general");
    expect(state.drift.unmapped_subagent_type).toBe(undefined);
  });

  it("a MAX_STRING_LENGTH subagent_type still yields events that pass the guard", () => {
    const state = top();
    const events = [
      launch("Agent", "tu1", {
        subagent_type: "x".repeat(MAX_STRING_LENGTH),
        run_in_background: true,
      }),
      result("tu1", "c1", "async_launched"),
    ].flatMap((l) => normalize(state, l));
    expect(outs(events)).toHaveLength(1);
    for (const e of events) expect(parseAgentEvent(e)).not.toBeNull();
  });

  it("a mapped type does not count drift", () => {
    expect(kindOf("Agent", { subagent_type: "Plan" }).state.drift.unmapped_subagent_type).toBe(
      undefined,
    );
  });

  it("sync launch carries the kind on out and not on back", () => {
    const state = top();
    const events = [
      launch("Agent", "tu1", { subagent_type: "Plan", run_in_background: false }),
      result("tu1", "c1", "completed"),
    ].flatMap((l) => normalize(state, l));
    const hs = events.filter((e) => e.kind === "handoff");
    expect(hs.map((h) => h.direction)).toEqual(["out", "back"]);
    expect(hs[0]).toMatchObject({ subagentKind: "plan" });
    expect(Object.hasOwn(hs[1], "subagentKind")).toBe(false);
  });

  it("queue-operation back carries no subagentKind and a SendMessage resume emits no second out", () => {
    const state = top();
    const notify = (toolId: string) =>
      JSON.stringify({
        type: "queue-operation",
        operation: "enqueue",
        sessionId: "s",
        timestamp: T,
        content: `<task-notification><task-id>c1</task-id><tool-use-id>${toolId}</tool-use-id><status>completed</status></task-notification>`,
      });
    const events = [
      launch("Agent", "tu1", { subagent_type: "Explore", run_in_background: true }),
      result("tu1", "c1", "async_launched"),
      launch("SendMessage", "tu2", { to: "c1" }),
      result("tu2", "c1", "queued"),
      notify("tu1"),
      notify("tu2"),
    ].flatMap((l) => normalize(state, l));
    expect(outs(events)).toHaveLength(1);
    const backs = events.filter((e) => e.kind === "handoff" && e.direction === "back");
    expect(backs).toHaveLength(2);
    for (const b of backs) expect(Object.hasOwn(b, "subagentKind")).toBe(false);
  });

  it("never lets the raw subagent_type reach an emitted event", () => {
    const marker = "LEAKMARKER-7f3a";
    const state = top();
    const events = [
      launch("Agent", "tu1", { subagent_type: marker, run_in_background: true }),
      result("tu1", "c1", "async_launched"),
      launch("Agent", "tu2", { subagent_type: `${marker}-sync`, run_in_background: false }),
      result("tu2", "c2", "completed"),
    ].flatMap((l) => normalize(state, l));
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toContain(marker);
    expect(JSON.stringify(state.drift)).not.toContain(marker);
  });
});

describe("killed notifications", () => {
  const T = "2026-10-02T10:00:00Z";
  const launch = (toolId: string, bg: boolean) =>
    JSON.stringify({
      type: "assistant",
      sessionId: "s",
      timestamp: T,
      message: {
        content: [
          { type: "tool_use", id: toolId, name: "Agent", input: { run_in_background: bg } },
        ],
      },
    });
  const result = (toolId: string, status: string) =>
    JSON.stringify({
      type: "user",
      sessionId: "s",
      timestamp: T,
      message: { content: [{ type: "tool_result", tool_use_id: toolId }] },
      toolUseResult: { status, agentId: "c1" },
    });
  const notify = (toolId: string, status: string) =>
    JSON.stringify({
      type: "queue-operation",
      operation: "enqueue",
      sessionId: "s",
      timestamp: T,
      content: `<task-notification><task-id>c1</task-id><tool-use-id>${toolId}</tool-use-id><status>${status}</status></task-notification>`,
    });
  const backs = (events: AgentEvent[]) =>
    events.filter((e) => e.kind === "handoff" && e.direction === "back");

  it("the status set is completed, failed and killed", () => {
    expect([...NOTIFICATION_STATUSES].sort()).toEqual(["completed", "failed", "killed"]);
  });

  it("killed emits one back handoff and no drift", () => {
    const state = top();
    const events = [
      launch("tu1", true),
      result("tu1", "async_launched"),
      notify("tu1", "killed"),
    ].flatMap((l) => normalize(state, l));
    expect(backs(events)).toHaveLength(1);
    expect(state.drift).toEqual({});
  });

  it("killed and a completed copy for the same task and tool use emit one back", () => {
    const state = top();
    const events = [
      launch("tu1", true),
      result("tu1", "async_launched"),
      notify("tu1", "killed"),
      notify("tu1", "completed"),
    ].flatMap((l) => normalize(state, l));
    expect(backs(events)).toHaveLength(1);
    expect(state.drift).toEqual({});
  });

  it("completed then killed for the same task and tool use emit one back", () => {
    const state = top();
    const events = [
      launch("tu1", true),
      result("tu1", "async_launched"),
      notify("tu1", "completed"),
      notify("tu1", "killed"),
    ].flatMap((l) => normalize(state, l));
    expect(backs(events)).toHaveLength(1);
    expect(state.drift).toEqual({});
  });

  it("a SendMessage resume that ends killed emits a back and no drift", () => {
    const state = top();
    const resume = JSON.stringify({
      type: "assistant",
      sessionId: "s",
      timestamp: T,
      message: {
        content: [{ type: "tool_use", id: "tu2", name: "SendMessage", input: { to: "c1" } }],
      },
    });
    const events = [
      launch("tu1", true),
      result("tu1", "async_launched"),
      resume,
      notify("tu2", "killed"),
    ].flatMap((l) => normalize(state, l));
    expect(backs(events)).toHaveLength(1);
    expect(state.drift).toEqual({});
  });

  it("killed after a sync completed result is suppressed", () => {
    const state = top();
    const events = [
      launch("tu1", false),
      result("tu1", "completed"),
      notify("tu1", "killed"),
    ].flatMap((l) => normalize(state, l));
    expect(backs(events)).toHaveLength(1);
    expect(state.drift).toEqual({});
  });

  it("killed with an unknown launch is an orphan completion", () => {
    const state = top();
    const events = normalize(state, notify("nope", "killed"));
    expect(events).toEqual([]);
    expect(state.drift).toEqual({ orphan_completion: 1 });
  });

  it("the killed-flow fixture hands back once", () => {
    const state = top();
    const events = run(state, "killed-flow");
    expect(backs(events)).toHaveLength(1);
    expect(state.drift).toEqual({});
  });

  it("the sanitizer keeps killed and maps an unknown status away", () => {
    const line = (status: string) =>
      JSON.stringify({
        type: "queue-operation",
        operation: "enqueue",
        content: `<task-notification><task-id>a</task-id><tool-use-id>b</tool-use-id><status>${status}</status></task-notification>`,
      });
    expect(sanitizeTranscript(line("killed"))).toContain("<status>killed</status>");
    const out = sanitizeTranscript(line("cancelled"));
    expect(out).not.toContain("cancelled");
    expect(out).toContain('"content":"x"');
  });
});
