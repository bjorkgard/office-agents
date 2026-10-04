import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  truncateSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { get, request } from "node:http";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite-plus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ATTENTION_STALE_MS } from "../shared/tuning.ts";
import {
  assignSeat,
  createFeed,
  createSeatTable,
  createSnapshotRing,
  createTailer,
  isLoopbackRequest,
  officeFeed,
  releaseSeat,
} from "./feed-plugin.ts";
import type { TailerIo } from "./feed-plugin.ts";
import type { AgentEvent } from "../shared/events.ts";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixtureLines = (name: string): string[] =>
  readFileSync(join(fixtures, `${name}.jsonl`), "utf8")
    .split("\n")
    .filter(Boolean);
const sessionOf = (name: string): string => JSON.parse(fixtureLines(name)[0]).sessionId as string;
const agentOf = (name: string): string => JSON.parse(fixtureLines(name)[0]).agentId as string;

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "office-feed-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Writes a top-level transcript; `session` renames the session so fixtures can coexist. */
function putTop(project: string, fixture: string, text?: string, session?: string): string {
  const dir = join(root, project);
  mkdirSync(dir, { recursive: true });
  const body = text ?? readFileSync(join(fixtures, `${fixture}.jsonl`), "utf8");
  const id = session ?? sessionOf(fixture);
  const file = join(dir, `${id}.jsonl`);
  writeFileSync(file, session === undefined ? body : body.replaceAll(sessionOf(fixture), id));
  return file;
}

function putSub(project: string, fixture: string): string {
  const dir = join(root, project, sessionOf(fixture), "subagents");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `agent-${agentOf(fixture)}.jsonl`);
  writeFileSync(file, readFileSync(join(fixtures, `${fixture}.jsonl`), "utf8"));
  return file;
}

function tailer(overrides: Partial<Parameters<typeof createTailer>[0]> = {}) {
  const events: AgentEvent[] = [];
  const gone: string[] = [];
  const logs: string[] = [];
  const t = createTailer({
    root,
    log: (l) => logs.push(l),
    onEvents: (e) => events.push(...e),
    onUntracked: (f) => gone.push(`${f.sessionId}:${f.agentId}`),
    ...overrides,
  });
  return { t, events, gone, logs };
}

const kinds = (events: AgentEvent[]) => events.map((e) => e.kind);

describe("tailer", () => {
  it("emits a live top-level file once and only new bytes afterwards", async () => {
    const file = putTop("p1", "top-live");
    const { t, events } = tailer();
    await t.scanOnce();
    expect(kinds(events)[0]).toBe("agent_started");
    const n = events.length;
    await t.scanOnce();
    expect(events).toHaveLength(n);
    appendFileSync(file, fixtureLines("top-live")[2] + "\n");
    await t.scanOnce();
    expect(events.length).toBeGreaterThan(n);
    expect(t.status().filesTracked).toBe(1);
  });

  it("buffers a split line until its newline arrives", async () => {
    const lines = fixtureLines("top-live");
    const file = putTop("p1", "top-live", lines[0] + "\n");
    const { t, events } = tailer();
    await t.scanOnce();
    const base = events.length;
    const half = Math.floor(lines[2].length / 2);
    appendFileSync(file, lines[2].slice(0, half));
    await t.scanOnce();
    expect(events).toHaveLength(base);
    appendFileSync(file, lines[2].slice(half) + "\n");
    await t.scanOnce();
    expect(events.length).toBeGreaterThan(base);
    expect(t.status().drift).toEqual({});
  });

  it("reports a deleted file as the agent leaving (ENOENT)", async () => {
    const file = putTop("p1", "top-live");
    const { t, gone } = tailer();
    await t.scanOnce();
    unlinkSync(file);
    await t.scanOnce();
    expect(gone).toEqual([`${sessionOf("top-live")}:null`]);
    expect(t.status().filesTracked).toBe(0);
  });

  it("tracks subagent files and skips a finished one at first sight (E3)", async () => {
    putSub("p1", "sub-live");
    putSub("p1", "sub-finished");
    const { t, events } = tailer();
    await t.scanOnce();
    expect(events.every((e) => e.agentId === agentOf("sub-live"))).toBe(true);
    expect(events.length).toBeGreaterThan(0);
    expect(t.status().filesTracked).toBe(2);
  });

  it("does not track a file outside the ATTENTION_STALE_MS window (ET3)", async () => {
    const file = putTop("p1", "top-live");
    const old = new Date(Date.now() - ATTENTION_STALE_MS - 60_000);
    utimesSync(file, old, old);
    putTop("p2", "top-finished-question");
    const { t } = tailer();
    await t.scanOnce();
    expect(t.status().filesTracked).toBe(1);
  });

  it("resets offset and state when the file is truncated", async () => {
    const lines = fixtureLines("top-live");
    const file = putTop("p1", "top-live", lines.join("\n") + "\n");
    const { t, events } = tailer();
    await t.scanOnce();
    expect(kinds(events).filter((k) => k === "agent_started")).toHaveLength(1);
    truncateSync(file, 0);
    writeFileSync(file, lines[0] + "\n");
    await t.scanOnce();
    expect(kinds(events).filter((k) => k === "agent_started")).toHaveLength(2);
  });

  it("re-reads from the start when the file is replaced and grows past the old offset", async () => {
    const lines = fixtureLines("top-live");
    const file = putTop("p1", "top-live", lines.join("\n") + "\n");
    const resets: string[] = [];
    const { t, events } = tailer({ onReset: (f) => resets.push(f.sessionId) });
    await t.scanOnce();
    expect(kinds(events).filter((k) => k === "agent_started")).toHaveLength(1);
    // A different inode, longer than the old offset: size alone cannot tell.
    const next = file + ".new";
    writeFileSync(next, lines.join("\n") + "\n" + lines[2] + "\n");
    renameSync(next, file);
    await t.scanOnce();
    expect(resets).toHaveLength(1);
    expect(kinds(events).filter((k) => k === "agent_started")).toHaveLength(2);
  });

  it("re-reads from the start when the same inode is rewritten with a different head", async () => {
    const lines = fixtureLines("top-live");
    const file = putTop("p1", "top-live", lines.join("\n") + "\n");
    const resets: string[] = [];
    const { t, events } = tailer({ onReset: (f) => resets.push(f.sessionId) });
    await t.scanOnce();
    writeFileSync(file, "{}\n" + lines.join("\n") + "\n" + lines[2] + "\n");
    await t.scanOnce();
    expect(resets).toHaveLength(1);
    expect(kinds(events).filter((k) => k === "agent_started")).toHaveLength(2);
  });

  it("does not reset a file that only grows, even while its head is shorter than the head window", async () => {
    const lines = fixtureLines("top-live");
    const file = putTop("p1", "top-live", lines[0] + "\n");
    const resets: string[] = [];
    const { t } = tailer({ onReset: (f) => resets.push(f.sessionId) });
    await t.scanOnce();
    for (const l of lines.slice(1)) {
      appendFileSync(file, l + "\n");
      await t.scanOnce();
    }
    expect(resets).toEqual([]);
  });

  it("does not follow a leaf swapped for a symlink after it was tracked", async () => {
    const lines = fixtureLines("top-live");
    const file = putTop("p1", "top-live", lines.join("\n") + "\n");
    const other = join(root, "elsewhere.jsonl");
    writeFileSync(other, lines.join("\n") + "\n" + lines.join("\n") + "\n");
    const { t, events, logs } = tailer();
    await t.scanOnce();
    const n = events.length;
    unlinkSync(file);
    symlinkSync(other, file);
    await t.scanOnce();
    expect(events).toHaveLength(n);
    expect(t.status().filesTracked).toBe(0);
    expect(logs.some((l) => l.includes("skipping"))).toBe(true);
  });

  it("rejects a FIFO swapped in for a tracked file without blocking, logging once", async () => {
    const file = putTop("p1", "top-live");
    const { t, logs } = tailer();
    await t.scanOnce();
    unlinkSync(file);
    execFileSync("mkfifo", [file]);
    await t.scanOnce();
    await t.scanOnce();
    expect(t.status().filesTracked).toBe(0);
    const skipped = logs.filter((l) => l.includes("skipping"));
    expect(skipped).toHaveLength(1);
    // oxlint-disable-next-line no-control-regex
    expect(skipped[0]).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
  }, 3000);

  it("retries a transient read error on the next scan and logs once", async () => {
    putTop("p1", "top-live");
    const fs = await import("node:fs/promises");
    let fails = 2;
    const io: TailerIo = {
      readdir: (p) => fs.readdir(p, { withFileTypes: true }),
      lstat: (p) => fs.lstat(p),
      async read(p, s, e) {
        if (fails-- > 0) throw Object.assign(new Error("io"), { code: "EIO" });
        return Buffer.from(readFileSync(p).subarray(s, e));
      },
    };
    const { t, events, logs } = tailer({ io });
    await t.scanOnce();
    await t.scanOnce();
    expect(events).toHaveLength(0);
    await t.scanOnce();
    expect(kinds(events)[0]).toBe("agent_started");
    expect(logs.filter((l) => l.includes("EIO"))).toHaveLength(1);
  });

  it("gives up on a file that keeps failing with a non-permission error", async () => {
    putTop("p1", "top-live");
    const fs = await import("node:fs/promises");
    let reads = 0;
    const io: TailerIo = {
      readdir: (p) => fs.readdir(p, { withFileTypes: true }),
      lstat: (p) => fs.lstat(p),
      async read() {
        reads++;
        throw Object.assign(new Error("io"), { code: "EIO" });
      },
    };
    const { t } = tailer({ io });
    for (let i = 0; i < 12; i++) await t.scanOnce();
    expect(reads).toBe(5);
  });

  it("a record claiming another session keeps the file's own session id", async () => {
    putTop(
      "p1",
      "top-live",
      readFileSync(join(fixtures, "top-live.jsonl"), "utf8").replaceAll(
        sessionOf("top-live"),
        "spoofed",
      ),
      "real-session",
    );
    const { t, events } = tailer();
    await t.scanOnce();
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.sessionId === "real-session")).toBe(true);
  });

  it("a throwing consumer does not deny the file", async () => {
    const file = putTop("p1", "top-live");
    let throwNext = true;
    const events: AgentEvent[] = [];
    const logs: string[] = [];
    const t = createTailer({
      root,
      log: (l) => logs.push(l),
      onEvents: (e) => {
        if (throwNext) {
          throwNext = false;
          throw new Error("consumer bug");
        }
        events.push(...e);
      },
    });
    await t.scanOnce();
    expect(events).toHaveLength(0);
    expect(t.status().drift.consumer_error).toBe(1);
    expect(
      logs.filter((l) => l.includes("event handling failed: Error: consumer bug")),
    ).toHaveLength(1);
    appendFileSync(file, fixtureLines("top-live")[2] + "\n");
    await t.scanOnce();
    expect(events.length).toBeGreaterThan(0);
  });

  it("a throwing line costs one line and logs once per file", async () => {
    const T = 1_800_000_000_000;
    const line = (o: object, n: number) =>
      JSON.stringify({
        sessionId: "ps",
        cwd: "/x",
        timestamp: new Date(T + n * 1000).toISOString(),
        ...o,
      });
    const boom = line(
      {
        type: "assistant",
        message: {
          role: "assistant",
          stop_reason: "tool_use",
          content: [
            { type: "tool_use", id: "BOOM", name: "Agent", input: { run_in_background: true } },
          ],
        },
      },
      1,
    );
    const ok = (n: number) => line({ type: "user", message: { role: "user", content: "x" } }, n);
    putTop("p1", "top-live", [ok(0), boom, ok(2), boom, ok(3)].join("\n") + "\n", "ps");
    const set: typeof Map.prototype.set = Reflect.get(Map.prototype, "set");
    Map.prototype.set = function (this: Map<unknown, unknown>, k: unknown, v: unknown) {
      if (k === "BOOM") throw new Error("launch bug");
      return set.call(this, k, v);
    } as typeof Map.prototype.set;
    const { t, events, logs } = tailer();
    try {
      await t.scanOnce();
    } finally {
      Map.prototype.set = set;
    }
    expect(events.length).toBeGreaterThan(0);
    expect(t.status().drift.normalizer_error).toBe(2);
    expect(logs.filter((l) => l.includes("normalizing failed"))).toHaveLength(1);
    expect(logs.join("\n")).not.toContain('x"');
  });

  it("fills parentAgentId from a tracked launcher file, else null", async () => {
    const T = 1_800_000_000_000;
    const line = (o: object, n: number) =>
      JSON.stringify({
        sessionId: "ps",
        cwd: "/x",
        timestamp: new Date(T + n * 1000).toISOString(),
        ...o,
      });
    const launcher = [
      line(
        {
          type: "assistant",
          agentId: "amid",
          message: {
            role: "assistant",
            stop_reason: "tool_use",
            content: [
              { type: "tool_use", id: "tu2", name: "Agent", input: { run_in_background: true } },
            ],
          },
        },
        1,
      ),
      line(
        {
          type: "user",
          agentId: "amid",
          message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu2" }] },
          toolUseResult: { status: "async_launched", agentId: "kid" },
        },
        2,
      ),
    ];
    const child = (id: string) =>
      line(
        {
          type: "assistant",
          agentId: id,
          message: { role: "assistant", stop_reason: "tool_use", content: [] },
        },
        3,
      );
    putTop("p1", "top-live", line({ type: "user", message: { content: "x" } }, 0) + "\n", "ps");
    const dir = join(root, "p1", "ps", "subagents");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "agent-amid.jsonl"), launcher.join("\n") + "\n");
    let skew = 0;
    const { t, events } = tailer({ now: () => Date.now() + skew });
    await t.scanOnce();
    skew = 10_000; // past the tree-walk throttle so the new files are found
    writeFileSync(join(dir, "agent-kid.jsonl"), child("kid") + "\n");
    writeFileSync(join(dir, "agent-stray.jsonl"), child("stray") + "\n");
    await t.scanOnce();
    const started = (id: string) =>
      events.find((e) => e.kind === "agent_started" && e.agentId === id);
    expect(started("kid")).toMatchObject({ parentAgentId: "amid" });
    expect(started("stray")).toMatchObject({ parentAgentId: null });
  });

  it("runs a later scan after a scan rejects while a follow-up was queued", async () => {
    putTop("p1", "top-live");
    const fs = await import("node:fs/promises");
    let clock = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let walks = 0;
    const io: TailerIo = {
      async readdir(p) {
        if (p === root && ++walks === 1) {
          await gate;
          return [
            {
              name: "bad",
              isDirectory() {
                throw new Error("walk exploded");
              },
            },
          ] as unknown as Awaited<ReturnType<TailerIo["readdir"]>>;
        }
        return fs.readdir(p, { withFileTypes: true });
      },
      lstat: (p) => fs.lstat(p),
      async read(p, s, e) {
        return Buffer.from(readFileSync(p).subarray(s, e));
      },
    };
    // Every clock read moves 10 s, so each scan walks the tree and `walks` counts scans.
    const { t, events } = tailer({ io, now: () => (clock += 10_000) });
    const first = t.scanOnce().catch(() => "failed");
    const second = t.scanOnce().catch(() => "failed");
    release();
    await first;
    await second;
    expect(walks).toBe(2); // the queued follow-up ran after the first scan rejected
    const third = t.scanOnce();
    const fourth = t.scanOnce().catch(() => "failed");
    await third;
    await fourth;
    expect(walks).toBe(4); // a later overlapping tick still queues its follow-up
    expect(kinds(events)[0]).toBe("agent_started");
  });

  it("delivers a parent's handoff back after its child's own events on cold start", async () => {
    const T = 1_800_000_000_000;
    const iso = (n: number) => new Date(T + n * 1000).toISOString();
    const line = (o: object) => JSON.stringify({ sessionId: "ps", cwd: "/x", ...o });
    const parent = [
      line({ type: "user", timestamp: iso(0), message: { role: "user", content: "x" } }),
      line({
        type: "assistant",
        timestamp: iso(1),
        message: {
          role: "assistant",
          stop_reason: "tool_use",
          content: [
            { type: "tool_use", id: "tu1", name: "Agent", input: { run_in_background: true } },
          ],
        },
      }),
      line({
        type: "user",
        timestamp: iso(2),
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu1" }] },
        toolUseResult: { status: "async_launched", agentId: "kid" },
      }),
      line({
        type: "queue-operation",
        timestamp: iso(10),
        operation: "enqueue",
        content:
          "<task-notification><task-id>kid</task-id><tool-use-id>tu1</tool-use-id><status>completed</status></task-notification>",
      }),
    ];
    const child = [3, 4].map((n) =>
      line({
        type: "assistant",
        agentId: "kid",
        timestamp: iso(n),
        message: { role: "assistant", stop_reason: "tool_use", content: [] },
      }),
    );
    putTop("p1", "top-live", parent.join("\n") + "\n", "ps");
    const dir = join(root, "p1", "ps", "subagents");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "agent-kid.jsonl"), child.join("\n") + "\n");
    const { t, events } = tailer();
    await t.scanOnce();
    const back = events.findIndex((e) => e.kind === "handoff" && e.direction === "back");
    const lastChild = events.map((e) => e.agentId).lastIndexOf("kid");
    expect(back).toBeGreaterThan(-1);
    expect(lastChild).toBeGreaterThan(-1);
    expect(back).toBeGreaterThan(lastChild);
    const ts = events.map((e) => e.ts);
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
  });

  it("drops an unterminated line over MAX_LINE_BYTES and parses the next one", async () => {
    const lines = fixtureLines("top-live");
    const file = putTop("p1", "top-live", lines[0] + "\n");
    const { t, events } = tailer();
    await t.scanOnce();
    const base = events.length;
    appendFileSync(file, Buffer.alloc(5 * 1024 * 1024, 120)); // no newline
    await t.scanOnce();
    await t.scanOnce(); // the second chunk pushes the pending line past the cap
    expect(t.status().drift.oversize_line).toBe(1);
    expect(events).toHaveLength(base);
    appendFileSync(file, "\n" + lines[2] + "\n");
    await t.scanOnce();
    expect(events.length).toBeGreaterThan(base);
    expect(t.status().drift.oversize_line).toBe(1);
  });

  it("discards the tail of an oversize line instead of parsing it as a new line", async () => {
    const lines = fixtureLines("top-live");
    const file = putTop("p1", "top-live", lines[0] + "\n");
    const { t, events } = tailer();
    await t.scanOnce();
    const base = events.length;
    appendFileSync(file, Buffer.alloc(5 * 1024 * 1024, 120)); // no newline
    await t.scanOnce();
    await t.scanOnce();
    expect(t.status().drift.oversize_line).toBe(1);
    appendFileSync(file, 'tail-of-the-big-line"}\n' + lines[2] + "\n");
    await t.scanOnce();
    expect(events.length).toBeGreaterThan(base);
    const drift = t.status().drift;
    expect(drift.oversize_line).toBe(1);
    expect(drift.malformed_json).toBeUndefined();
  });

  it("keeps a file cold when a doubling read fails, so the retry still applies cold-start logic", async () => {
    const T = 1_800_000_000_000;
    const line = (i: number) =>
      JSON.stringify({
        type: "assistant",
        sessionId: "cold-s",
        cwd: "/x",
        timestamp: new Date(T + i * 1000).toISOString(),
        message: { role: "assistant", stop_reason: "tool_use", content: [] },
      });
    const early = Array.from({ length: 100 }, (_, i) => line(i));
    const big = JSON.stringify({ type: "x", pad: "a".repeat(5000) });
    const file = putTop("p1", "top-live", `${early.join("\n")}\n${big}\n`, "cold-s");
    const fs = await import("node:fs/promises");
    let reads = 0;
    const io: TailerIo = {
      readdir: (p) => fs.readdir(p, { withFileTypes: true }),
      lstat: (p) => fs.lstat(p),
      async read(p, s, e) {
        if (++reads === 2) throw Object.assign(new Error("boom"), { code: "EIO" });
        return Buffer.from(readFileSync(p).subarray(s, e));
      },
    };
    const { t, events } = tailer({ io, coldTailBytes: 1000, coldCapBytes: 16_000 });
    await t.scanOnce(); // the first read finds no whole line; the doubled read fails
    expect(events).toHaveLength(0);
    await t.scanOnce();
    expect(readFileSync(file).length).toBeGreaterThan(8000);
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.ts === T)).toBe(false); // the cold window, not a replay from byte 0
  });

  it("keeps each project's runs and the ts order across two interleaved projects", async () => {
    const T = 1_800_000_000_000;
    const line = (session: string, n: number) =>
      JSON.stringify({
        type: n < 4 ? "user" : "assistant",
        sessionId: session,
        cwd: "/x",
        timestamp: new Date(T + n * 1000).toISOString(),
        message:
          n < 4
            ? { role: "user", content: "x" }
            : { role: "assistant", stop_reason: "tool_use", content: [] },
      });
    putTop("p1", "top-live", [0, 2, 4].map((n) => line("s-a", n)).join("\n") + "\n", "s-a");
    putTop("p2", "top-live", [1, 3, 5].map((n) => line("s-b", n)).join("\n") + "\n", "s-b");
    const runs: Array<{ projectId: string; events: AgentEvent[] }> = [];
    const { t } = tailer({
      onEvents: (e, f) => runs.push({ projectId: f.projectId, events: e }),
    });
    await t.scanOnce();
    const all = runs.flatMap((r) => r.events);
    expect(all.map((e) => e.ts)).toEqual([...all.map((e) => e.ts)].sort((a, b) => a - b));
    expect(runs.length).toBeGreaterThan(1);
    for (const r of runs) {
      for (const e of r.events) expect(e.projectId).toBe(r.projectId);
    }
    expect(new Set(runs.map((r) => r.projectId))).toEqual(new Set(["p1", "p2"]));
  });

  it("reads a backlog larger than READ_CAP_BYTES in chunks, each line once and in order", async () => {
    const file = putTop("p1", "top-live", fixtureLines("top-live")[0] + "\n");
    const { t, events } = tailer();
    await t.scanOnce();
    const base = events.length;
    const count = 48_000; // about 5 MB, so a chunk boundary falls inside a line
    const body = Array.from({ length: count }, (_, i) =>
      JSON.stringify({
        type: "assistant",
        sessionId: sessionOf("top-live"),
        cwd: "/x",
        timestamp: new Date(1_800_000_000_000 + i * 1000).toISOString(),
        message: { role: "assistant", stop_reason: "tool_use", content: [] },
      }),
    ).join("\n");
    appendFileSync(file, body + "\n");
    expect(readFileSync(file).length).toBeGreaterThan(4 * 1024 * 1024 + 1024 * 1024);
    await t.scanOnce();
    expect(events.length).toBeLessThan(base + count); // first chunk only
    await t.scanOnce();
    const got = events.slice(base).map((e) => e.ts);
    expect(got).toEqual(Array.from({ length: count }, (_, i) => 1_800_000_000_000 + i * 1000));
    expect(t.status().drift).toEqual({});
  });

  it("skips an unreadable file with one log line (EACCES)", async () => {
    putTop("p1", "top-live");
    const real: TailerIo = {
      readdir: async (p) => (await import("node:fs/promises")).readdir(p, { withFileTypes: true }),
      lstat: async (p) => (await import("node:fs/promises")).lstat(p),
      read: async () => {
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      },
    };
    const { t, events, logs } = tailer({ io: real });
    await t.scanOnce();
    await t.scanOnce();
    expect(events).toHaveLength(0);
    expect(logs.filter((l) => l.includes("EACCES"))).toHaveLength(1);
  });

  it("retries a file after a transient read error lapses, but never one denied for permissions", async () => {
    const file = putTop("p1", "top-live");
    const fs = await import("node:fs/promises");
    let code = "EIO";
    let broken = true;
    const io: TailerIo = {
      readdir: (p) => fs.readdir(p, { withFileTypes: true }),
      lstat: (p) => fs.lstat(p),
      async read(p, s, e) {
        if (broken) throw Object.assign(new Error("boom"), { code });
        return Buffer.from(readFileSync(p).subarray(s, e));
      },
    };
    let clock = Date.now();
    const { t, events } = tailer({ io, now: () => clock });
    for (let i = 0; i < 6; i++) await t.scanOnce(); // retries exhausted: denied for a while
    broken = false;
    clock += 10_000;
    await t.scanOnce();
    expect(events).toHaveLength(0);
    clock += 61_000;
    utimesSync(file, new Date(clock), new Date(clock));
    await t.scanOnce();
    expect(events.length).toBeGreaterThan(0);

    code = "EACCES";
    broken = true;
    const perm = tailer({ io, now: () => clock });
    await perm.t.scanOnce();
    broken = false;
    clock += 10 * 60_000;
    utimesSync(file, new Date(clock), new Date(clock));
    await perm.t.scanOnce();
    expect(perm.events).toHaveLength(0);
  });

  it("doubles the cold window for an oversize last line, then counts drift at the cap", async () => {
    const big = JSON.stringify({ type: "x", pad: "a".repeat(5000) });
    const small = fixtureLines("top-live").join("\n");
    putTop("p1", "top-live", `${small}\n${big}\n`);
    const ok = tailer({ coldTailBytes: 1000, coldCapBytes: 16_000 });
    await ok.t.scanOnce();
    expect(ok.events.length).toBeGreaterThan(0);
    expect(ok.t.status().drift).toEqual({});

    const capped = tailer({ coldTailBytes: 1000, coldCapBytes: 2000 });
    await capped.t.scanOnce();
    expect(capped.events).toHaveLength(0);
    expect(capped.t.status().drift.oversize_line).toBe(1);
  });

  it("delivers a line appended after an oversize last line that ended in a newline", async () => {
    const big = JSON.stringify({ type: "x", pad: "a".repeat(5000) });
    const lines = fixtureLines("top-live");
    const file = putTop("p1", "top-live", `${lines[0]}\n${big}\n`);
    const { t, events } = tailer({ coldTailBytes: 1000, coldCapBytes: 2000 });
    await t.scanOnce();
    expect(events).toHaveLength(0);
    expect(t.status().drift.oversize_line).toBe(1);
    appendFileSync(file, lines[2] + "\n");
    await t.scanOnce();
    expect(events.length).toBeGreaterThan(0);
  });

  it("does not follow symlinked directories or files", async () => {
    const outside = mkdtempSync(join(tmpdir(), "office-outside-"));
    try {
      writeFileSync(join(outside, "x.jsonl"), fixtureLines("top-live").join("\n") + "\n");
      symlinkSync(outside, join(root, "linked-project"));
      mkdirSync(join(root, "real"));
      symlinkSync(join(outside, "x.jsonl"), join(root, "real", "y.jsonl"));
      const { t, events } = tailer();
      await t.scanOnce();
      expect(events).toHaveLength(0);
      expect(t.status().filesTracked).toBe(0);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("does not follow a symlinked subagents directory", async () => {
    const outside = mkdtempSync(join(tmpdir(), "office-outside-"));
    try {
      const file = putSub("p", "sub-live");
      const real = dirname(file);
      const moved = join(outside, "subagents");
      renameSync(real, moved);
      symlinkSync(moved, real);
      const { t, events } = tailer();
      await t.scanOnce();
      expect(events).toHaveLength(0);
      expect(t.status().filesTracked).toBe(0);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("logs one line and stays empty when the root is missing", async () => {
    rmSync(root, { recursive: true, force: true });
    const { t, logs } = tailer();
    await t.scanOnce();
    await t.scanOnce();
    expect(logs.filter((l) => l.includes("no sessions"))).toHaveLength(1);
    expect(t.status().filesTracked).toBe(0);
  });

  it("is single-flight: overlapping calls chain, never overlap, and queue one follow-up", async () => {
    putTop("p1", "top-live");
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let enter: () => void = () => {};
    const entered = new Promise<void>((r) => (enter = r));
    let active = 0;
    let maxActive = 0;
    let reads = 0;
    const fs = await import("node:fs/promises");
    const io: TailerIo = {
      readdir: (p) => fs.readdir(p, { withFileTypes: true }),
      lstat: (p) => fs.lstat(p),
      async read(p, s, e) {
        active++;
        maxActive = Math.max(maxActive, active);
        reads++;
        if (reads === 1) {
          enter();
          await gate;
        }
        const buf = Buffer.from(readFileSync(p).subarray(s, e));
        active--;
        return buf;
      },
    };
    const { t, events } = tailer({ io });
    const first = t.scanOnce();
    const second = t.scanOnce();
    const third = t.scanOnce();
    expect(third).toBe(second); // one queued follow-up, not two
    await entered;
    expect(events).toHaveLength(0); // paused inside the first read
    release();
    await Promise.all([first, second, third]);
    expect(maxActive).toBe(1);
    const afterFirst = events.length;
    expect(afterFirst).toBeGreaterThan(0);
    // follow-up scan saw no new bytes, so no duplicates
    expect(new Set(events.map((e) => JSON.stringify(e))).size).toBe(afterFirst);
  });
});

describe("loopback guard", () => {
  const req = (host: string | undefined, remoteAddress: string | undefined) => ({
    headers: { host },
    socket: { remoteAddress },
  });
  it.each([
    ["localhost:5173", "127.0.0.1", true],
    ["127.0.0.1:5173", "::1", true],
    ["[::1]:5173", "::ffff:127.0.0.1", true],
    ["localhost", "127.0.0.5", true],
    ["LOCALHOST:1", "::1", true],
    ["localhost:5173", "192.168.1.20", false], // LAN client spoofing Host
    ["localhost:5173", "10.0.0.2", false],
    ["localhost:5173", undefined, false],
    ["::1", "::1", true], // bare IPv6 literal
    ["[::1]", "127.0.0.1", true],
    [" localhost ", "127.0.0.1", true], // surrounding whitespace
    ["localhost:5173", "::ffff:10.0.0.1", false], // v4-mapped non-loopback remote
    ["evil.example:5173", "127.0.0.1", false], // DNS rebinding
    ["192.168.1.5:5173", "127.0.0.1", false],
    ["localhost.evil.example", "127.0.0.1", false],
    [undefined, "127.0.0.1", false],
    ["", "127.0.0.1", false],
  ])("host %s remote %s -> %s", (host, remote, expected) => {
    expect(isLoopbackRequest(req(host, remote))).toBe(expected);
  });
});

describe("seat table", () => {
  it("seats new sessions in order and keeps a desk for a repeat call", () => {
    const t = createSeatTable();
    expect(assignSeat(t, "a", "p1")).toBe(0);
    expect(assignSeat(t, "b", "p2")).toBe(1);
    expect(assignSeat(t, "a", "p1")).toBe(0);
  });

  it("keeps a desk after an earlier agent leaves, and reuses the freed desk", () => {
    const t = createSeatTable();
    assignSeat(t, "a", "p1");
    assignSeat(t, "b", "p2");
    releaseSeat(t, "a");
    expect(assignSeat(t, "b", "p2")).toBe(1);
    expect(assignSeat(t, "c", "p3")).toBe(0);
  });

  it("seats a new agent beside its project in the same row", () => {
    const t = createSeatTable();
    assignSeat(t, "a", "p1"); // 0
    assignSeat(t, "b", "p2"); // 1
    assignSeat(t, "c", "p3"); // 2
    expect(assignSeat(t, "d", "p2")).toBe(3); // both neighbors of b are taken: first free desk
    const u = createSeatTable();
    u.desks = [null, "a", null, null, null];
    u.bySession.set("a", 1);
    u.projectOf.set("a", "p1");
    expect(assignSeat(u, "n", "p1")).toBe(0);
    expect(assignSeat(u, "m", "p1")).toBe(2);
  });

  it("does not seat across a row boundary", () => {
    const t = createSeatTable();
    t.desks = ["a", "x", "y", "z"];
    for (const [i, s] of t.desks.entries()) {
      t.bySession.set(s as string, i);
      t.projectOf.set(s as string, s === "z" ? "p1" : "other");
    }
    // desk 3 (p1) has only desk 4 on the right, which is the next row: not beside.
    t.desks[4] = null;
    t.desks[2] = null;
    t.bySession.delete("y");
    expect(assignSeat(t, "n", "p1")).toBe(2); // left neighbor of 3, same row
  });
});

describe("feed", () => {
  const fakeReq = (url: string, host = "localhost:5173", remote = "127.0.0.1") => {
    const ee = new EventEmitter();
    return Object.assign(ee, {
      url,
      method: "GET",
      headers: { host },
      socket: { remoteAddress: remote },
    });
  };
  const fakeRes = () => {
    const ee = new EventEmitter();
    const written: string[] = [];
    const res = Object.assign(ee, {
      statusCode: 0,
      headers: {} as Record<string, unknown>,
      written,
      ended: false,
      destroyed: false,
      destroy() {
        res.destroyed = true;
      },
      writeHead(code: number, h?: Record<string, unknown>) {
        res.statusCode = code;
        Object.assign(res.headers, h);
        return res;
      },
      setHeader(k: string, v: unknown) {
        res.headers[k] = v;
      },
      write(s: string): boolean {
        written.push(s);
        return true;
      },
      end(s?: string) {
        if (s) written.push(s);
        res.ended = true;
      },
    });
    return res;
  };
  const call = (feed: ReturnType<typeof createFeed>, req: ReturnType<typeof fakeReq>) => {
    const res = fakeRes();
    let nexts = 0;
    feed.handle(req as never, res as never, () => nexts++);
    return { res, nexts };
  };
  const frame = (s: string) => JSON.parse(s.replace(/^data: /, "").trim());

  it("passes non-/__office URLs to next() once and writes nothing", () => {
    const feed = createFeed({ root, log: () => {} });
    for (const url of ["/", "/?art", "/@vite/client", "/src/main.tsx", "/__officex"]) {
      const { res, nexts } = call(feed, fakeReq(url, "evil.example", "10.0.0.9"));
      expect(nexts).toBe(1);
      expect(res.written).toEqual([]);
      expect(res.statusCode).toBe(0);
    }
  });

  it("refuses a non-loopback socket with 403, one reason line, no data, one log line", () => {
    const logs: string[] = [];
    const feed = createFeed({ root, log: (l) => logs.push(l) });
    for (const url of ["/__office/status", "/__office/events"]) {
      const { res, nexts } = call(feed, fakeReq(url, "localhost:5173", "192.168.1.20"));
      expect(nexts).toBe(0);
      expect(res.statusCode).toBe(403);
      expect(res.written.join("")).toBe("forbidden: office feed is loopback only\n");
      expect(feed.clients.size).toBe(0);
    }
    expect(logs.filter((l) => l.includes("refused"))).toHaveLength(2);
  });

  const withHeaders = (url: string, headers: Record<string, string>) => {
    const r = fakeReq(url);
    Object.assign(r.headers, headers);
    return r;
  };

  it.each([
    [{ origin: "http://evil.example" }, 403],
    [{ origin: "null" }, 403],
    [{ origin: "http://localhost.evil.example:5173" }, 403],
    [{ origin: "http://localhost:5173" }, 200],
    [{ origin: "http://127.0.0.1:3000" }, 200],
    [{ origin: "http://[::1]:8080" }, 200],
    [{ "x-forwarded-for": "10.0.0.1" }, 403],
    [{ "x-forwarded-host": "evil.example" }, 403],
    [{ "sec-fetch-site": "cross-site" }, 403],
    [{ "sec-fetch-site": "same-site" }, 403],
    [{ "sec-fetch-site": "same-origin" }, 200],
    [{ "sec-fetch-site": "none" }, 200],
    [{}, 200],
  ])("request headers %j -> %s", (headers, code) => {
    const feed = createFeed({ root, log: () => {} });
    const { res } = call(feed, withHeaders("/__office/status", headers));
    expect(res.statusCode).toBe(code);
  });

  it("logs a refused Host without control characters and within a bounded length", () => {
    const logs: string[] = [];
    const feed = createFeed({ root, log: (l) => logs.push(l) });
    const host = `evil\r\n[office] forged\u001b[31m${"x".repeat(5000)}`;
    call(feed, fakeReq("/__office/status", host));
    expect(logs).toHaveLength(1);
    // oxlint-disable-next-line no-control-regex
    expect(logs[0]).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    expect(logs[0].length).toBeLessThan(400);
  });

  it("logs a refused path and remote address without control characters", () => {
    const logs: string[] = [];
    const feed = createFeed({ root, log: (l) => logs.push(l) });
    const req = fakeReq(
      "/__office/a\r\n[office] forged\u001b[31m",
      "evil.example",
      "10.0.0.1\r\nx",
    );
    call(feed, req);
    expect(logs).toHaveLength(1);
    // oxlint-disable-next-line no-control-regex
    expect(logs[0]).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    expect(logs[0]).toContain("forged");
  });

  it("refuses an array-valued or comma-joined (duplicate) Origin header", () => {
    const feed = createFeed({ root, log: () => {} });
    const twice = ["http://localhost:5173", "http://localhost:5173"];
    const arr = withHeaders("/__office/status", {});
    Object.assign(arr.headers, { origin: twice });
    expect(call(feed, arr).res.statusCode).toBe(403);
    const joined = withHeaders("/__office/status", {
      origin: "http://localhost:5173, http://evil.example",
    });
    expect(call(feed, joined).res.statusCode).toBe(403);
  });

  it("does not let the heartbeat timer keep the process alive", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    try {
      const feed = createFeed({ root, log: () => {} });
      call(feed, fakeReq("/__office/events"));
      const timer = spy.mock.results[0].value as NodeJS.Timeout;
      expect(timer.hasRef()).toBe(false);
      feed.stop();
    } finally {
      spy.mockRestore();
    }
  });

  it("pings SSE clients every 15 s and clears the timer once the last client closes", () => {
    vi.useFakeTimers();
    try {
      const feed = createFeed({ root, log: () => {} });
      const reqA = fakeReq("/__office/events");
      const a = call(feed, reqA);
      expect(vi.getTimerCount()).toBe(1);
      vi.advanceTimersByTime(14_999);
      expect(a.res.written).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(a.res.written[1]).toBe(": ping\n\n");
      reqA.emit("close");
      expect(vi.getTimerCount()).toBe(0);
      const b = call(feed, fakeReq("/__office/events"));
      expect(vi.getTimerCount()).toBe(1);
      feed.stop();
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(60_000);
      expect(b.res.written).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("serves status JSON on loopback", async () => {
    putTop("p1", "top-live");
    const feed = createFeed({ root, log: () => {} });
    await feed.scanOnce();
    const { res } = call(feed, fakeReq("/__office/status"));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.written.join(""));
    expect(body).toMatchObject({ filesTracked: 1, drift: {}, sseClients: 0 });
    expect(typeof body.lastScanMs).toBe("number");
  });

  it("sends snapshot first, then each delta exactly once (snapshot-then-subscribe)", async () => {
    const lines = fixtureLines("top-live");
    const file = putTop("p1", "top-live", lines[0] + "\n");
    const feed = createFeed({ root, log: () => {} });
    await feed.scanOnce();
    const { res } = call(feed, fakeReq("/__office/events"));
    const snap = frame(res.written[0]);
    expect(snap.type).toBe("snapshot");
    expect(snap.events.map((e: AgentEvent) => e.kind)).toContain("agent_started");
    expect(snap.seats).toEqual({ [sessionOf("top-live")]: 0 });
    const deltas = () => res.written.slice(1).map(frame);
    expect(deltas()).toEqual([]);
    appendFileSync(file, lines[2] + "\n");
    await feed.scanOnce();
    const got = deltas();
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((f) => f.type === "event")).toBe(true);
    const seen = new Set(snap.events.map((e: AgentEvent) => JSON.stringify(e)));
    for (const f of got) expect(seen.has(JSON.stringify(f.event))).toBe(false);
  });

  it("answers 405 for a non-GET on a known route and 404 for an unknown GET", () => {
    const feed = createFeed({ root, log: () => {} });
    const post = call(feed, Object.assign(fakeReq("/__office/events"), { method: "POST" }));
    expect(post.res.statusCode).toBe(405);
    expect(feed.clients.size).toBe(0);
    const missing = call(feed, fakeReq("/__office/nope"));
    expect(missing.res.statusCode).toBe(404);
    expect(missing.res.written.join("")).toBe("not found\n");
  });

  it("answers 405 to POST and HEAD on /__office/status", () => {
    const feed = createFeed({ root, log: () => {} });
    for (const method of ["POST", "HEAD"]) {
      const r = call(feed, Object.assign(fakeReq("/__office/status"), { method }));
      expect(r.res.statusCode).toBe(405);
      expect(r.nexts).toBe(0);
    }
  });

  it("drops an SSE client whose response emits an error", () => {
    const feed = createFeed({ root, log: () => {} });
    const { res } = call(feed, fakeReq("/__office/events"));
    expect(feed.clients.size).toBe(1);
    expect(() => res.emit("error", new Error("EPIPE"))).not.toThrow();
    expect(feed.clients.size).toBe(0);
  });

  it("includes the seat table and a gone frame when a file disappears", async () => {
    const file = putTop("p1", "top-live");
    const feed = createFeed({ root, log: () => {} });
    await feed.scanOnce();
    const { res } = call(feed, fakeReq("/__office/events"));
    unlinkSync(file);
    await feed.scanOnce();
    expect(res.written.map(frame).some((f) => f.type === "gone")).toBe(true);
    const late = call(feed, fakeReq("/__office/events")).res;
    expect(frame(late.written[0]).events).toEqual([]);
    expect(frame(late.written[0]).seats).toEqual({});
  });

  it("removes a client on close and ends clients and the timer on stop()", async () => {
    const cleared: unknown[] = [];
    const feed = createFeed({
      root,
      log: () => {},
      intervalMs: 1000,
      setIntervalFn: () => "handle",
      clearIntervalFn: (h) => cleared.push(h),
    });
    const a = call(feed, fakeReq("/__office/events"));
    const reqB = fakeReq("/__office/events");
    const b = call(feed, reqB);
    expect(feed.clients.size).toBe(2);
    reqB.emit("close");
    expect(feed.clients.size).toBe(1);
    feed.start();
    feed.stop();
    feed.stop();
    expect(cleared).toEqual(["handle"]);
    expect(a.res.ended).toBe(true);
    expect(b.res.ended).toBe(false);
    expect(feed.clients.size).toBe(0);
  });

  const aged = () => new Date(Date.now() - ATTENTION_STALE_MS - 60_000);
  const gones = (res: { written: string[] }) =>
    res.written.map(frame).filter((f) => f.type === "gone");
  const snapshotOf = (feed: ReturnType<typeof createFeed>) =>
    frame(call(feed, fakeReq("/__office/events")).res.written[0]);

  it("forgets a top-level agent and frees its seat when its file leaves the window", async () => {
    const file = putTop("p1", "top-live");
    const feed = createFeed({ root, log: () => {} });
    await feed.scanOnce();
    const { res } = call(feed, fakeReq("/__office/events"));
    expect(snapshotOf(feed).seats).toEqual({ [sessionOf("top-live")]: 0 });
    utimesSync(file, aged(), aged());
    await feed.scanOnce();
    expect(gones(res)).toEqual([{ type: "gone", sessionId: sessionOf("top-live"), agentId: null }]);
    expect(snapshotOf(feed)).toMatchObject({ events: [], seats: {} });
  });

  it("forgets a subagent on window expiry but keeps its parent's seat", async () => {
    const session = sessionOf("sub-live");
    putTop("p1", "top-live", undefined, session);
    const sub = putSub("p1", "sub-live");
    const feed = createFeed({ root, log: () => {} });
    await feed.scanOnce();
    const { res } = call(feed, fakeReq("/__office/events"));
    utimesSync(sub, aged(), aged());
    await feed.scanOnce();
    expect(gones(res)).toEqual([
      { type: "gone", sessionId: session, agentId: agentOf("sub-live") },
    ]);
    const snap = snapshotOf(feed);
    expect(snap.seats).toEqual({ [session]: 0 });
    expect(snap.events.length).toBeGreaterThan(0);
    expect(snap.events.every((e: AgentEvent) => e.agentId === null)).toBe(true);
  });

  it("retires a file denied mid-run: events leave the snapshot and the desk frees", async () => {
    const lines = fixtureLines("top-live");
    const file = putTop("p1", "top-live", lines[0] + "\n");
    const fs = await import("node:fs/promises");
    let deny = false;
    const io: TailerIo = {
      readdir: (p) => fs.readdir(p, { withFileTypes: true }),
      lstat: (p) => fs.lstat(p),
      async read(p, s, e) {
        if (deny) throw Object.assign(new Error("denied"), { code: "EACCES" });
        return Buffer.from(readFileSync(p).subarray(s, e));
      },
    };
    const feed = createFeed({ root, log: () => {}, io });
    await feed.scanOnce();
    const { res } = call(feed, fakeReq("/__office/events"));
    expect(snapshotOf(feed).seats).toEqual({ [sessionOf("top-live")]: 0 });
    deny = true;
    appendFileSync(file, lines[2] + "\n");
    await feed.scanOnce();
    expect(gones(res)).toEqual([{ type: "gone", sessionId: sessionOf("top-live"), agentId: null }]);
    expect(snapshotOf(feed)).toMatchObject({ events: [], seats: {} });
    expect(feed.status().filesTracked).toBe(0);
  });

  it("resends the seat after gone when a top-level file is truncated", async () => {
    const lines = fixtureLines("top-live");
    const file = putTop("p1", "top-live", lines.join("\n") + "\n");
    const feed = createFeed({ root, log: () => {} });
    await feed.scanOnce();
    const { res } = call(feed, fakeReq("/__office/events"));
    truncateSync(file, 0);
    writeFileSync(file, lines[0] + "\n");
    await feed.scanOnce();
    const types = res.written.map(frame).map((f) => f.type);
    expect(types.indexOf("seat")).toBeGreaterThan(types.indexOf("gone"));
    expect(res.written.map(frame).filter((f) => f.type === "seat")).toEqual([
      { type: "seat", sessionId: sessionOf("top-live"), desk: 0 },
    ]);
    expect(snapshotOf(feed).seats).toEqual({ [sessionOf("top-live")]: 0 });
  });

  it("sends no seat when a subagent file is truncated", async () => {
    const session = sessionOf("sub-live");
    putTop("p1", "top-live", undefined, session);
    const sub = putSub("p1", "sub-live");
    const feed = createFeed({ root, log: () => {} });
    await feed.scanOnce();
    const { res } = call(feed, fakeReq("/__office/events"));
    const first = readFileSync(sub, "utf8").split("\n")[0];
    truncateSync(sub, 0);
    writeFileSync(sub, first + "\n");
    await feed.scanOnce();
    expect(gones(res)).toEqual([
      { type: "gone", sessionId: session, agentId: agentOf("sub-live") },
    ]);
    expect(res.written.map(frame).filter((f) => f.type === "seat")).toEqual([]);
    expect(snapshotOf(feed).seats).toEqual({ [session]: 0 });
  });

  it("purges the ring and sends gone when a file is truncated", async () => {
    const lines = fixtureLines("top-live");
    const file = putTop("p1", "top-live", lines.join("\n") + "\n");
    const feed = createFeed({ root, log: () => {} });
    await feed.scanOnce();
    const { res } = call(feed, fakeReq("/__office/events"));
    truncateSync(file, 0);
    writeFileSync(file, lines[0] + "\n");
    await feed.scanOnce();
    expect(gones(res)).toHaveLength(1);
    const events: AgentEvent[] = snapshotOf(feed).events;
    expect(kinds(events)).toEqual(["agent_started", "working"]); // the first line only
  });

  it("keeps a returned child's back in the snapshot after 100 more parent events", () => {
    const ring = createSnapshotRing();
    const at = { sessionId: "r-s", projectId: "p1" } as const;
    let ts = 1_800_000_000_000;
    ring.add({
      ...at,
      agentId: null,
      ts: ts++,
      kind: "agent_started",
      projectPath: "/x",
      parentAgentId: null,
    });
    ring.add({
      ...at,
      agentId: null,
      ts: ts++,
      kind: "handoff",
      fromAgentId: null,
      toAgentId: "kid",
      direction: "out",
    });
    ring.add({
      ...at,
      agentId: "kid",
      ts: ts++,
      kind: "agent_started",
      projectPath: "/x",
      parentAgentId: null,
    });
    ring.add({
      ...at,
      agentId: null,
      ts: ts++,
      kind: "handoff",
      fromAgentId: null,
      toAgentId: "kid",
      direction: "back",
    });
    for (let i = 0; i < 100; i++) ring.add({ ...at, agentId: null, ts: ts++, kind: "working" });
    const events = ring.events();
    const hasBack = events.some((e) => e.kind === "handoff" && e.direction === "back");
    expect(hasBack).toBe(true);
  });

  describe("returned-child memory bound", () => {
    // MAX_RETURNED_SEEN in feed-plugin.ts is 10_000.
    const CAP = 10_000;
    const back = (sessionId: string, ts: number): AgentEvent => ({
      sessionId,
      projectId: "p1",
      agentId: null,
      ts,
      kind: "handoff",
      fromAgentId: null,
      toAgentId: "kid",
      direction: "back",
    });

    it("forgets the oldest returned child once more than the cap are remembered", () => {
      const ring = createSnapshotRing();
      for (let i = 0; i < CAP + 5; i++) ring.add(back(`s${i}`, 1_800_000_000_000 + i));
      expect(ring.wasReturned("s0", "kid")).toBe(false);
      expect(ring.wasReturned("s4", "kid")).toBe(false);
      expect(ring.wasReturned("s5", "kid")).toBe(true);
      expect(ring.wasReturned(`s${CAP + 4}`, "kid")).toBe(true);
    });

    it("keeps a child that was handed back again recently (LRU re-insert)", () => {
      const ring = createSnapshotRing();
      let ts = 1_800_000_000_000;
      ring.add(back("old", ts++));
      for (let i = 0; i < CAP - 1; i++) ring.add(back(`s${i}`, ts++));
      ring.add(back("old", ts++)); // now the newest again
      ring.add(back("extra1", ts++));
      ring.add(back("extra2", ts++));
      expect(ring.wasReturned("old", "kid")).toBe(true);
      expect(ring.wasReturned("s0", "kid")).toBe(false);
    });
  });

  describe("ring essentials", () => {
    const at = { sessionId: "e-s", projectId: "p1" } as const;
    const started = (agentId: string | null): AgentEvent => ({
      ...at,
      agentId,
      ts: 1_800_000_000_000,
      kind: "agent_started",
      projectPath: "/x",
      parentAgentId: null,
    });
    const handoff = (ts: number, to: string, direction: "out" | "back"): AgentEvent => ({
      ...at,
      agentId: null,
      ts,
      kind: "handoff",
      fromAgentId: null,
      toAgentId: to,
      direction,
    });
    const tool = (ts: number, id: string, phase: "start" | "end"): AgentEvent => ({
      ...at,
      agentId: null,
      ts,
      kind: "working",
      tool: { phase, id, isSubagent: true },
    });
    const filler = (ring: ReturnType<typeof createSnapshotRing>, from: number, n: number) => {
      for (let i = 0; i < n; i++) ring.add({ ...at, agentId: null, ts: from + i, kind: "working" });
    };
    const T = 1_800_000_001_000;

    const done = (agentId: string | null, ts: number, endsWithQuestion: boolean): AgentEvent => ({
      ...at,
      agentId,
      ts,
      kind: "done",
      endsWithQuestion,
    });
    const crowd = (ring: ReturnType<typeof createSnapshotRing>, agents: number, each: number) => {
      for (let a = 0; a < agents; a++) {
        const id = `busy-${a}`;
        ring.add(started(id));
        for (let i = 0; i < each; i++) {
          ring.add({ ...at, agentId: id, ts: T + a * 100 + i, kind: "working" });
        }
      }
    };

    it("keeps an agent waiting on a question when busier agents fill the ring", () => {
      const ring = createSnapshotRing();
      ring.add(started("asker"));
      ring.add(done("asker", T, true));
      crowd(ring, 80, 40);
      const mine = ring.events().filter((e) => e.agentId === "asker");
      expect(mine.map((e) => e.kind)).toEqual(["agent_started", "done"]);
      expect(ring.events().length).toBeLessThanOrEqual(2000);
    });

    it("lets a questioning agent be evicted again once it resumes work", () => {
      const ring = createSnapshotRing();
      ring.add(started("asker"));
      ring.add(done("asker", T, true));
      ring.add({ ...at, agentId: "asker", ts: T + 1, kind: "working" });
      crowd(ring, 80, 40);
      expect(ring.events().some((e) => e.agentId === "asker")).toBe(false);
    });

    it("keeps one question done per agent and bounds the total with many askers", () => {
      const ring = createSnapshotRing();
      for (let a = 0; a < 3000; a++) {
        ring.add(started(`q-${a}`));
        ring.add(done(`q-${a}`, T + a, true));
        ring.add(done(`q-${a}`, T + a + 1, true));
      }
      const events = ring.events();
      expect(events.length).toBeLessThanOrEqual(2000);
      expect(events.filter((e) => e.agentId === "q-2999")).toHaveLength(2);
    });

    describe("standing needs_attention", () => {
      const attn = (ts: number): AgentEvent => ({
        ...at,
        agentId: null,
        ts,
        kind: "needs_attention",
        waitingSince: 10_000,
        episodeId: "e1",
      });
      const start = (ts: number): AgentEvent => tool(ts, "t1", "start");
      const survives = (ring: ReturnType<typeof createSnapshotRing>) =>
        ring.events().some((e) => e.kind === "needs_attention");

      it("keeps it through activity older than its waitingSince", () => {
        const ring = createSnapshotRing();
        ring.add(started(null));
        ring.add(attn(10_000));
        ring.add(start(9_900));
        expect(survives(ring)).toBe(true);
      });

      it("keeps it through activity at exactly its waitingSince", () => {
        const ring = createSnapshotRing();
        ring.add(started(null));
        ring.add(attn(10_000));
        ring.add({ ...at, agentId: null, ts: 10_000, kind: "working" });
        expect(survives(ring)).toBe(true);
      });

      it("drops it on activity newer than its waitingSince", () => {
        const ring = createSnapshotRing();
        ring.add(started(null));
        ring.add(attn(10_000));
        ring.add(start(10_001));
        expect(survives(ring)).toBe(false);
      });

      it("still prefers evicting agents without a standing question", () => {
        const ring = createSnapshotRing();
        ring.add(started("asker"));
        ring.add({ ...attn(10_000), agentId: "asker" });
        ring.add({ ...at, agentId: "asker", ts: 9_900, kind: "working" });
        crowd(ring, 80, 40);
        expect(ring.events().some((e) => e.kind === "needs_attention")).toBe(true);
      });

      // The machine side of this live == replay equivalence is covered by src/office/machine.test.ts
      // ("activity not newer than the episode's waitingSince does not end it, live or replay").
      it("replays the standing episode through older activity and drops it on newer", () => {
        const ring = createSnapshotRing();
        ring.add({ ...started(null), ts: 0 });
        ring.add({ ...at, agentId: null, ts: 0, kind: "working" });
        ring.add(attn(10_000));
        ring.add(start(9_900));
        const standing = ring.events().filter((e) => e.kind === "needs_attention");
        expect(standing).toHaveLength(1);
        expect(standing[0]).toMatchObject({
          kind: "needs_attention",
          episodeId: "e1",
          waitingSince: 10_000,
        });
        ring.add(start(10_001));
        expect(survives(ring)).toBe(false);
      });
    });

    it("keeps a waiting marker through 100 events and drops it when the tool ends", () => {
      const ring = createSnapshotRing();
      ring.add(started(null));
      ring.add(tool(T, "sync", "start"));
      ring.add({ ...at, agentId: null, ts: T + 1, kind: "waiting_on_subagents" });
      filler(ring, T + 2, 100);
      expect(ring.events().some((e) => e.kind === "waiting_on_subagents")).toBe(true);
      ring.add(tool(T + 200, "sync", "end"));
      expect(ring.events().some((e) => e.kind === "waiting_on_subagents")).toBe(false);
    });

    it("keeps an out-handoff with no back, then moves it to returned after the back", () => {
      const ring = createSnapshotRing();
      ring.add(started(null));
      ring.add(handoff(T, "kid", "out"));
      filler(ring, T + 1, 100);
      const handoffs = () =>
        ring.events().filter((e) => e.kind === "handoff") as Extract<
          AgentEvent,
          { kind: "handoff" }
        >[];
      expect(handoffs().map((e) => e.direction)).toEqual(["out"]);
      ring.add(handoff(T + 200, "kid", "back"));
      expect(handoffs().map((e) => e.direction)).toEqual(["back"]);
      filler(ring, T + 201, 100);
      expect(handoffs().map((e) => e.direction)).toEqual(["back"]);
    });

    it("leaves no ghost worker when a parent's returned cap evicts old children", () => {
      const ring = createSnapshotRing();
      ring.add(started(null));
      let ts = T;
      for (let i = 0; i < 210; i++) {
        const kid = `kid-${String(i).padStart(3, "0")}`;
        ring.add(handoff(ts++, kid, "out"));
        ring.add(started(kid));
        ring.add(handoff(ts++, kid, "back"));
      }
      const events = ring.events();
      const backs = events.filter((e) => e.kind === "handoff" && e.direction === "back");
      expect(backs).toHaveLength(200);
      const ghosts = events.filter((e) => e.agentId?.startsWith("kid-") && e.agentId < "kid-010");
      expect(ghosts).toEqual([]);
      expect(events.some((e) => e.agentId === "kid-209" && e.kind === "agent_started")).toBe(true);
    });

    it("keeps a resumed child's ring when its old back is evicted", () => {
      const ring = createSnapshotRing();
      ring.add(started(null));
      let ts = T;
      ring.add(handoff(ts++, "kid-000", "out"));
      ring.add(started("kid-000"));
      ring.add(handoff(ts++, "kid-000", "back"));
      ring.add({ ...at, agentId: "kid-000", ts: ts++, kind: "working" }); // resumed after the back
      for (let i = 1; i < 205; i++) {
        const kid = `kid-${String(i).padStart(3, "0")}`;
        ring.add(handoff(ts++, kid, "out"));
        ring.add(started(kid));
        ring.add(handoff(ts++, kid, "back"));
      }
      const events = ring.events();
      expect(events.some((e) => e.agentId === "kid-000" && e.kind === "working")).toBe(true);
      expect(events.some((e) => e.agentId === "kid-001" && e.kind === "agent_started")).toBe(false);
    });

    it("caps open tools and unresolved handoffs per agent, oldest evicted", () => {
      const ring = createSnapshotRing();
      ring.add(started(null));
      let ts = T;
      for (let i = 0; i < 230; i++) ring.add(tool(ts++, `t${i}`, "start"));
      for (let i = 0; i < 230; i++) ring.add(handoff(ts++, `u${i}`, "out"));
      const events = ring.events();
      const tools = events.filter((e) => e.kind === "working" && e.tool?.phase === "start");
      const outs = events.filter((e) => e.kind === "handoff");
      expect(tools).toHaveLength(200);
      expect(outs).toHaveLength(200);
      expect(tools.some((e) => e.kind === "working" && e.tool?.id === "t29")).toBe(false);
      expect(tools.some((e) => e.kind === "working" && e.tool?.id === "t30")).toBe(true);
      expect(outs.some((e) => e.kind === "handoff" && e.toAgentId === "u29")).toBe(false);
      expect(outs.some((e) => e.kind === "handoff" && e.toAgentId === "u30")).toBe(true);
    });
  });

  describe("snapshot ring cap", () => {
    const working = (i: number) =>
      JSON.stringify({
        type: "assistant",
        sessionId: "cap-s",
        cwd: "/x",
        timestamp: new Date(1_800_000_000_000 + i * 1000).toISOString(),
        message: { role: "assistant", stop_reason: "tool_use", content: [] },
      });
    const text = (n: number) => Array.from({ length: n }, (_, i) => working(i)).join("\n") + "\n";

    const toolStart = JSON.stringify({
      type: "assistant",
      sessionId: "cap-s",
      cwd: "/x",
      timestamp: new Date(1_800_000_000_000 - 1000).toISOString(),
      message: {
        role: "assistant",
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "open-tool", name: "Bash", input: {} }],
      },
    });

    it("keeps one agent's started and open tool start plus a bounded recent window", async () => {
      putTop("p1", "top-live", toolStart + "\n" + text(500), "cap-s");
      const feed = createFeed({ root, log: () => {} });
      await feed.scanOnce();
      const events: AgentEvent[] = snapshotOf(feed).events;
      expect(events.length).toBeLessThan(100);
      expect(events.some((e) => e.kind === "agent_started")).toBe(true);
      expect(
        events.some(
          (e) => e.kind === "working" && e.tool?.phase === "start" && e.tool.id === "open-tool",
        ),
      ).toBe(true);
      const ts = events.map((e) => e.ts);
      expect(ts).toEqual([...ts].sort((a, b) => a - b));
    });

    it("gives a late client every live agent's agent_started after 1500+ events", async () => {
      const ids = Array.from({ length: 30 }, (_, i) => `cap-${String(i).padStart(2, "0")}`);
      for (const id of ids) {
        putTop("p1", "top-live", text(60).replaceAll("cap-s", id), id);
      }
      const feed = createFeed({ root, log: () => {} });
      await feed.scanOnce();
      const events: AgentEvent[] = snapshotOf(feed).events;
      const seen = new Set(
        events.filter((e) => e.kind === "agent_started").map((e) => e.sessionId),
      );
      expect([...seen].sort()).toEqual(ids);
    });

    it("evicts the least recently active whole agents past the overall bound", async () => {
      const ids = Array.from({ length: 80 }, (_, i) => `ev-${String(i).padStart(2, "0")}`);
      // Each agent's lines are a distinct minute, so agents arrive one after another.
      ids.forEach((id, n) => {
        const body = Array.from({ length: 60 }, (_, i) =>
          working(n * 100 + i).replaceAll("cap-s", id),
        ).join("\n");
        putTop("p1", "top-live", body + "\n", id);
      });
      const feed = createFeed({ root, log: () => {} });
      await feed.scanOnce();
      const events: AgentEvent[] = snapshotOf(feed).events;
      expect(events.length).toBeLessThanOrEqual(2000);
      for (const id of new Set(events.map((e) => e.sessionId))) {
        expect(events.some((e) => e.sessionId === id && e.kind === "agent_started")).toBe(true);
      }
    });

    it("purges the agent's events on gone and keeps other sessions", async () => {
      const file = putTop("p1", "top-live", text(5), "cap-s");
      putTop("p2", "top-live", undefined, "other-s");
      const feed = createFeed({ root, log: () => {} });
      await feed.scanOnce();
      unlinkSync(file);
      await feed.scanOnce();
      const events: AgentEvent[] = snapshotOf(feed).events;
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((e) => e.sessionId === "other-s")).toBe(true);
    });
  });

  it("throttles drift log lines to one per minute and only when the total changed", async () => {
    let clock = 0;
    const logs: string[] = [];
    const file = putTop("p1", "top-live", fixtureLines("top-live")[0] + "\nnot json\n");
    const feed = createFeed({ root, log: (l) => logs.push(l), now: () => Date.now() + clock });
    const drifts = () => logs.filter((l) => l.includes("drift")).length;
    await feed.scanOnce();
    expect(drifts()).toBe(1);
    await feed.scanOnce();
    expect(drifts()).toBe(1); // total unchanged
    appendFileSync(file, "still not json\n");
    clock = 10_000;
    await feed.scanOnce();
    expect(drifts()).toBe(1); // changed but inside the minute
    clock = 61_000;
    await feed.scanOnce();
    expect(drifts()).toBe(2);
  });

  it("caps concurrent SSE clients at 8 and answers the ninth with 503", () => {
    const feed = createFeed({ root, log: () => {} });
    const reqs = Array.from({ length: 8 }, () => fakeReq("/__office/events"));
    for (const r of reqs) expect(call(feed, r).res.statusCode).toBe(200);
    const ninth = call(feed, fakeReq("/__office/events")).res;
    expect(ninth.statusCode).toBe(503);
    expect(ninth.written).toEqual(["too many clients\n"]);
    expect(feed.clients.size).toBe(8);
    reqs[0].emit("close");
    expect(call(feed, fakeReq("/__office/events")).res.statusCode).toBe(200);
  });

  it("survives a client whose write throws: the others still get the frame", async () => {
    const file = putTop("p1", "top-live", fixtureLines("top-live")[0] + "\n");
    const feed = createFeed({ root, log: () => {} });
    await feed.scanOnce();
    const broken = call(feed, fakeReq("/__office/events")).res;
    const fine = call(feed, fakeReq("/__office/events")).res;
    broken.write = () => {
      throw new Error("EPIPE");
    };
    const before = fine.written.length;
    appendFileSync(file, fixtureLines("top-live")[2] + "\n");
    await feed.scanOnce();
    expect(fine.written.length).toBeGreaterThan(before);
    expect(feed.clients.has(broken as never)).toBe(false);
    expect(feed.clients.has(fine as never)).toBe(true);
    expect(feed.status().drift.consumer_error).toBeUndefined();
  });

  it("drops a client whose write backlog exceeds the cap", async () => {
    const file = putTop("p1", "top-live", fixtureLines("top-live")[0] + "\n");
    const feed = createFeed({ root, log: () => {} });
    await feed.scanOnce();
    const { res } = call(feed, fakeReq("/__office/events"));
    const fine = call(feed, fakeReq("/__office/events")).res;
    Object.assign(res, { writableLength: 2 * 1024 * 1024 });
    appendFileSync(file, fixtureLines("top-live")[2] + "\n");
    await feed.scanOnce();
    expect(feed.clients.has(res as never)).toBe(false);
    expect(res.ended).toBe(true);
    expect(res.destroyed).toBe(true);
    expect(feed.clients.has(fine as never)).toBe(true);
  });

  it("frees a stuck client's slot on an idle scan and destroys its socket", async () => {
    let clock = 0;
    const file = putTop("p1", "top-live", fixtureLines("top-live")[0] + "\n");
    const feed = createFeed({ root, log: () => {}, now: () => Date.now() + clock });
    await feed.scanOnce();
    const stuck = call(feed, fakeReq("/__office/events")).res;
    stuck.write = (s: string) => (stuck.written.push(s), false);
    appendFileSync(file, fixtureLines("top-live")[2] + "\n");
    await feed.scanOnce();
    expect(feed.clients.has(stuck as never)).toBe(true);
    clock = 11_000;
    await feed.scanOnce(); // nothing new to send
    expect(feed.clients.has(stuck as never)).toBe(false);
    expect(stuck.destroyed).toBe(true);
  });

  it("drops a client whose initial snapshot write backs up on a quiet feed", async () => {
    let clock = 0;
    putTop("p1", "top-live", fixtureLines("top-live")[0] + "\n");
    const feed = createFeed({ root, log: () => {}, now: () => Date.now() + clock });
    await feed.scanOnce();
    const req = fakeReq("/__office/events");
    const res = fakeRes();
    res.write = (s: string) => (res.written.push(s), false);
    feed.handle(req as never, res as never, () => {});
    expect(feed.clients.has(res as never)).toBe(true);
    clock = 11_000;
    await feed.scanOnce(); // no new events
    expect(feed.clients.has(res as never)).toBe(false);
    expect(res.destroyed).toBe(true);
  });

  it("destroys a client whose write throws", async () => {
    const file = putTop("p1", "top-live", fixtureLines("top-live")[0] + "\n");
    const feed = createFeed({ root, log: () => {} });
    await feed.scanOnce();
    const { res } = call(feed, fakeReq("/__office/events"));
    res.write = () => {
      throw new Error("EPIPE");
    };
    appendFileSync(file, fixtureLines("top-live")[2] + "\n");
    await feed.scanOnce();
    expect(res.destroyed).toBe(true);
  });

  it("drops a client that backs up and never drains, but not one that drains", async () => {
    let clock = 0;
    const file = putTop("p1", "top-live", fixtureLines("top-live")[0] + "\n");
    const feed = createFeed({ root, log: () => {}, now: () => Date.now() + clock });
    await feed.scanOnce();
    const stuck = call(feed, fakeReq("/__office/events")).res;
    const draining = call(feed, fakeReq("/__office/events")).res;
    stuck.write = (s: string) => (stuck.written.push(s), false);
    draining.write = (s: string) => (draining.written.push(s), false);
    const lines = fixtureLines("top-live");
    appendFileSync(file, lines[2] + "\n");
    await feed.scanOnce();
    expect(feed.clients.size).toBe(2); // blocked, not yet over the drain timeout
    draining.emit("drain");
    clock = 11_000;
    appendFileSync(file, lines[2] + "\n");
    await feed.scanOnce();
    expect(feed.clients.has(stuck as never)).toBe(false);
    expect(feed.clients.has(draining as never)).toBe(true);
  });

  it("seats a second session of the same project beside the first", async () => {
    putTop("p1", "top-live");
    putTop("p1", "top-live", undefined, "second-session");
    putTop("p2", "top-live", undefined, "third-session");
    const feed = createFeed({ root, log: () => {} });
    await feed.scanOnce();
    const { res } = call(feed, fakeReq("/__office/events"));
    const seats = frame(res.written[0]).seats as Record<string, number>;
    const desks = Object.values(seats);
    expect(new Set(desks).size).toBe(desks.length);
    const a = seats[sessionOf("top-live")];
    const b = seats["second-session"];
    expect(Math.abs(a - b)).toBe(1);
  });

  it("groups seats by project when two projects' sessions interleave", async () => {
    const T = 1_800_000_000_000;
    const line = (session: string, n: number) =>
      JSON.stringify({
        type: n < 4 ? "user" : "assistant",
        sessionId: session,
        cwd: "/x",
        timestamp: new Date(T + n * 1000).toISOString(),
        message:
          n < 4
            ? { role: "user", content: "x" }
            : { role: "assistant", stop_reason: "tool_use", content: [] },
      });
    const sessions: Array<[string, string, number[]]> = [
      ["a1", "p1", [0, 4]],
      ["a2", "p1", [1, 5]],
      ["b1", "p2", [2, 6]],
      ["b2", "p2", [3, 7]],
    ];
    for (const [id, project, ns] of sessions) {
      putTop(project, "top-live", ns.map((n) => line(id, n)).join("\n") + "\n", id);
    }
    const feed = createFeed({ root, log: () => {} });
    await feed.scanOnce();
    const { res } = call(feed, fakeReq("/__office/events"));
    const seats = frame(res.written[0]).seats as Record<string, number>;
    expect(new Set(Object.values(seats)).size).toBe(4);
    expect(Math.abs(seats.a1 - seats.a2)).toBe(1);
    expect(Math.abs(seats.b1 - seats.b2)).toBe(1);
  });
});

describe("plugin", () => {
  it("applies only to serve", () => {
    expect(officeFeed({ root }).apply).toBe("serve");
  });

  it("logs a warning and does not throw when the feed fails to configure", () => {
    const warnings: string[] = [];
    const plugin = officeFeed({ root, log: () => {} });
    const server = {
      config: { mode: "development", logger: { warn: (m: string) => warnings.push(m) } },
      middlewares: {
        use() {
          throw new Error("no middleware");
        },
      },
      httpServer: null,
    };
    const hook = plugin.configureServer as (s: unknown) => void;
    expect(() => hook(server)).not.toThrow();
    expect(warnings.some((w) => w.includes("feed disabled"))).toBe(true);
  });

  it("serves existing pages untouched and the feed over a real socket", async () => {
    putTop("p1", "top-live");
    const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
    const server = await createServer({
      configFile: false,
      root: repo,
      logLevel: "silent",
      plugins: [react(), officeFeed({ root, log: () => {}, hookDir: join(root, "hook") })],
      server: { port: 0, host: "127.0.0.1", hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    try {
      await server.listen();
      const addr = server.httpServer?.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : 0;
      const fetchText = (path: string, host?: string) =>
        new Promise<{ status: number; body: string }>((resolve, reject) => {
          const r = request(
            { host: "127.0.0.1", port, path, headers: host ? { host } : {} },
            (res: IncomingMessage) => {
              let body = "";
              res.on("data", (c: Buffer) => (body += c.toString()));
              res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
            },
          );
          r.on("error", reject);
          r.end();
        });

      expect((await fetchText("/")).status).toBe(200);
      expect((await fetchText("/?art")).status).toBe(200);
      const status = await fetchText("/__office/status");
      expect(status.status).toBe(200);
      expect(JSON.parse(status.body)).toHaveProperty("filesTracked");
      expect((await fetchText("/__office/status", "evil.example")).status).toBe(403);

      const first = await new Promise<string>((resolve, reject) => {
        const r = get({ host: "127.0.0.1", port, path: "/__office/events" }, (res) => {
          res.once("data", (c: Buffer) => {
            resolve(c.toString());
            r.destroy();
          });
        });
        r.on("error", (e) => {
          if ((e as NodeJS.ErrnoException).code !== "ECONNRESET") reject(e);
        });
      });
      expect(first.startsWith("data: ")).toBe(true);
      expect(JSON.parse(first.slice(6)).type).toBe("snapshot");
    } finally {
      await server.close();
    }
  }, 30_000);
});
