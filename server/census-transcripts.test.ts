import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { READ_CAP_BYTES } from "./feed-plugin.ts";
import { runCensus } from "./census-transcripts.ts";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "census-transcripts.ts");
const ALLOWED = [
  "files",
  "subagentFiles",
  "readErrors",
  "skippedLines",
  "drift",
  "eventKinds",
  "sessionIdMismatches",
  "agentIdLength",
  "idsNonConservativeChars",
  "maxLineChars",
  "readCapBytes",
  "linesOverCap",
  "versions",
  "notificationStatuses",
  "agentMessageEnqueues",
  "resumesSeen",
];
const PROJECT = "proj-zzz-private";
const SESSION = "sess-qqq-private";
const TS = "2026-01-01T00:00:00.000Z";
const rec = (o: Record<string, unknown>): string => JSON.stringify({ timestamp: TS, ...o });

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "office-census-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const topFile = (name: string, body: string[]): string => {
  mkdirSync(join(root, PROJECT), { recursive: true });
  const p = join(root, PROJECT, `${name}.jsonl`);
  writeFileSync(p, body.join("\n") + "\n");
  return p;
};
const subFile = (session: string, id: string, body: string[]): void => {
  const d = join(root, PROJECT, session, "subagents");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, `agent-${id}.jsonl`), body.join("\n") + "\n");
};

function tinyTree(): void {
  topFile(SESSION, [
    rec({
      type: "assistant",
      sessionId: SESSION,
      version: "9.9.9",
      message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
    }),
    rec({
      type: "queue-operation",
      operation: "enqueue",
      sessionId: SESSION,
      content:
        "<task-notification><task-id>tid-secret</task-id><tool-use-id>toolu_secret</tool-use-id><status>killed</status></task-notification>",
    }),
    rec({
      type: "queue-operation",
      operation: "enqueue",
      sessionId: SESSION,
      content: '<agent-message from="x">\nhi</agent-message>',
    }),
    "{not json",
    rec({ type: "assistant", sessionId: "someone-else", message: { content: [] } }),
  ]);
  subFile(SESSION, "agentsix", [rec({ type: "assistant", version: "9.9.9", message: {} })]);
  subFile(SESSION, "bad.id7", [rec({ type: "assistant", version: "9.9.9", message: {} })]);
}

describe("runCensus", () => {
  it("counts a tiny tree", async () => {
    tinyTree();
    const c = await runCensus(root);
    expect(c.files).toBe(1);
    expect(c.subagentFiles).toBe(2);
    expect(c.drift).toEqual({ malformed_json: 1, orphan_completion: 1, "sub:bad_shape": 2 });
    expect(c.notificationStatuses).toEqual({ killed: 1 });
    expect(c.agentMessageEnqueues).toBe(1);
    expect(c.sessionIdMismatches).toBe(1);
    expect(c.agentIdLength).toEqual({ "7": 1, "8": 1 });
    expect(c.idsNonConservativeChars).toBe(1);
    expect(c.versions).toEqual({ "9.9.9": 3 });
    expect(c.readCapBytes).toBe(READ_CAP_BYTES);
    expect(c.eventKinds.agent_started).toBeGreaterThan(0);
  });

  it("handles an empty root and descends into empty files", async () => {
    const empty = await runCensus(root);
    expect(empty.files).toBe(0);
    expect(empty.subagentFiles).toBe(0);
    expect(empty.drift).toEqual({});
    expect(empty.readErrors).toBe(0);
    mkdirSync(join(root, PROJECT), { recursive: true });
    writeFileSync(join(root, PROJECT, `${SESSION}.jsonl`), "");
    subFile(SESSION, "agentsix", []);
    const c = await runCensus(root);
    expect(c.files).toBe(1);
    expect(c.subagentFiles).toBe(1);
    expect(c.drift).toEqual({});
  });

  it("counts a failed root listing as a read error", async () => {
    const file = join(root, "not-a-dir");
    writeFileSync(file, "");
    const c = await runCensus(file);
    expect(c.readErrors).toBe(1);
    expect(c.files).toBe(0);
  });

  it("buckets unknown statuses and non-semver versions as other", async () => {
    topFile(SESSION, [
      rec({
        type: "queue-operation",
        operation: "enqueue",
        content: "<task-notification><status>secret-status</status></task-notification>",
      }),
      rec({ type: "assistant", version: "secret-version", message: {} }),
      rec({ type: "assistant", version: "1.2.3-secret", message: {} }),
      rec({ type: "assistant", version: "1.2.3", message: {} }),
    ]);
    const c = await runCensus(root);
    expect(c.notificationStatuses).toEqual({ other: 1 });
    expect(c.versions).toEqual({ "1.2.3": 1, other: 2 });
  });

  it("does not follow symlinked session or subagents dirs", async () => {
    const outside = mkdtempSync(join(tmpdir(), "office-census-out-"));
    try {
      mkdirSync(join(outside, "sess-a", "subagents"), { recursive: true });
      writeFileSync(join(outside, "sess-a", "subagents", "agent-aaa.jsonl"), "{\n");
      mkdirSync(join(outside, "subs"), { recursive: true });
      writeFileSync(join(outside, "subs", "agent-bbb.jsonl"), "{\n");
      mkdirSync(join(root, PROJECT), { recursive: true });
      for (const sess of ["sess-a", "sess-b"])
        writeFileSync(join(root, PROJECT, `${sess}.jsonl`), "");
      symlinkSync(join(outside, "sess-a"), join(root, PROJECT, "sess-a"));
      mkdirSync(join(root, PROJECT, "sess-b"));
      symlinkSync(join(outside, "subs"), join(root, PROJECT, "sess-b", "subagents"));
      const c = await runCensus(root);
      expect(c.files).toBe(2);
      expect(c.subagentFiles).toBe(0);
      expect(c.drift).toEqual({});
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("tracks launch-derived agent ids and SendMessage resumes", async () => {
    topFile(SESSION, [
      rec({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "Agent",
              input: { run_in_background: true, subagent_type: "general-purpose" },
            },
          ],
        },
      }),
      rec({
        type: "user",
        message: { content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "ok" }] },
        toolUseResult: { agentId: "agent!x", status: "async_launched" },
      }),
      rec({
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", id: "toolu_2", name: "SendMessage", input: { to: "agent!x" } },
          ],
        },
      }),
    ]);
    const c = await runCensus(root);
    expect(c.resumesSeen).toBe(1);
    expect(c.agentIdLength).toEqual({ "7": 1 });
    expect(c.idsNonConservativeChars).toBe(1);
  });

  // Value: protects=census never reads outside the root via symlinks; fails_when=a symlinked file or project dir is followed; why_new=only session/subagents dir links were covered; seam=none
  it("does not read a symlinked jsonl file or a symlinked project dir", async () => {
    const outside = mkdtempSync(join(tmpdir(), "office-census-out-"));
    try {
      writeFileSync(join(outside, "linked.jsonl"), "{\n");
      mkdirSync(join(outside, "proj-out"));
      writeFileSync(join(outside, "proj-out", "s.jsonl"), "{\n");
      mkdirSync(join(root, PROJECT), { recursive: true });
      symlinkSync(join(outside, "linked.jsonl"), join(root, PROJECT, "linked.jsonl"));
      symlinkSync(join(outside, "proj-out"), join(root, "proj-link"));
      const c = await runCensus(root);
      expect(c.files).toBe(0);
      expect(c.drift).toEqual({});
      expect(c.readErrors).toBe(0);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  // Value: protects=sub-file sessionId drift is reported; fails_when=a subagent record with a foreign sessionId is not counted; why_new=only the top-level mismatch was tested; seam=none
  it("counts a subagent file whose sessionId differs from its parent", async () => {
    topFile(SESSION, [rec({ type: "assistant", sessionId: SESSION, message: {} })]);
    subFile(SESSION, "agentone", [
      rec({ type: "assistant", sessionId: "other-sess", message: {} }),
    ]);
    const c = await runCensus(root);
    expect(c.sessionIdMismatches).toBe(1);
  });

  // Value: protects=a subagent file without the agent- prefix keeps its whole stem as id; fails_when=the prefix is sliced unconditionally; why_new=every fixture used agent- names; seam=none
  it("uses the whole stem as agent id when a subagent file has no agent- prefix", async () => {
    topFile(SESSION, []);
    const d = join(root, PROJECT, SESSION, "subagents");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "plainid.jsonl"), rec({ type: "assistant", message: {} }) + "\n");
    const c = await runCensus(root);
    expect(c.subagentFiles).toBe(1);
    expect(c.agentIdLength).toEqual({ "7": 1 });
  });

  // Value: protects=odd launch tool_use ids and resume keys are flagged; fails_when=either id is not checked against the conservative charset; why_new=only agentIds were covered; seam=none
  it("flags a non-conforming launch tool_use id and resume key", async () => {
    const launch = (id: string) =>
      rec({
        type: "assistant",
        message: {
          content: [{ type: "tool_use", id, name: "Agent", input: { run_in_background: true } }],
        },
      });
    const result = (id: string) =>
      rec({
        type: "user",
        message: { content: [{ type: "tool_result", tool_use_id: id, content: "ok" }] },
        toolUseResult: { agentId: "goodagent", status: "async_launched" },
      });
    const send = (id: string) =>
      rec({
        type: "assistant",
        message: {
          content: [{ type: "tool_use", id, name: "SendMessage", input: { to: "goodagent" } }],
        },
      });
    topFile("sess-launch", [launch("toolu!1"), result("toolu!1")]);
    const a = await runCensus(root);
    expect(a.idsNonConservativeChars).toBe(1);
    rmSync(join(root, PROJECT), { recursive: true });
    topFile("sess-resume", [launch("toolu_ok"), result("toolu_ok"), send("toolu!2")]);
    const b = await runCensus(root);
    expect(b.resumesSeen).toBe(1);
    expect(b.idsNonConservativeChars).toBe(1);
  });

  it("drops a leading BOM so the first line still parses", async () => {
    const p = topFile(SESSION, []);
    writeFileSync(p, "\uFEFF" + rec({ type: "assistant", version: "4.5.6", message: {} }) + "\n");
    const c = await runCensus(root);
    expect(c.drift.malformed_json).toBeUndefined();
    expect(c.versions).toEqual({ "4.5.6": 1 });
  });

  it("counts malformed lines as drift and keeps going", async () => {
    topFile(SESSION, ["{", "][", rec({ type: "assistant", sessionId: SESSION, message: {} })]);
    const c = await runCensus(root);
    expect(c.drift.malformed_json).toBe(2);
    expect(c.readErrors).toBe(0);
  });

  it.skipIf(process.getuid?.() === 0)("counts an unreadable file and continues", async () => {
    const p = topFile("sess-locked", [rec({ type: "assistant", sessionId: "sess-locked" })]);
    topFile(SESSION, ["{"]);
    chmodSync(p, 0o000);
    try {
      const c = await runCensus(root);
      expect(c.files).toBe(2);
      expect(c.readErrors).toBe(1);
      expect(c.drift.malformed_json).toBe(1);
    } finally {
      chmodSync(p, 0o600);
    }
  });

  it("counts a line over the cap as skipped, not fatal", async () => {
    const huge = "x".repeat(8 * 1024 * 1024 + 10);
    topFile(SESSION, [huge, "{"]);
    const c = await runCensus(root);
    expect(c.skippedLines).toBe(1);
    expect(c.linesOverCap).toBe(1);
    expect(c.maxLineChars).toBe(huge.length);
    expect(c.drift.malformed_json).toBe(1);
    expect(c.readErrors).toBe(0);
  });

  it("counts a line between the read cap and the line cap as over the read cap but parsed", async () => {
    const mid = "y".repeat(READ_CAP_BYTES + 5);
    topFile(SESSION, [mid]);
    const c = await runCensus(root);
    expect(c.skippedLines).toBe(0);
    expect(c.linesOverCap).toBe(1);
    expect(c.drift.malformed_json).toBe(1);
  });

  it("treats a line of exactly the caps as within them", async () => {
    topFile(SESSION, ["z".repeat(READ_CAP_BYTES)]);
    const atRead = await runCensus(root);
    expect(atRead.linesOverCap).toBe(0);
    expect(atRead.maxLineChars).toBe(READ_CAP_BYTES);
    topFile(SESSION, ["z".repeat(8 * 1024 * 1024)]);
    const atLine = await runCensus(root);
    expect(atLine.skippedLines).toBe(0);
    expect(atLine.drift.malformed_json).toBe(1);
  });

  it("sets maxLineChars from parsed lines", async () => {
    const line = rec({ type: "assistant", message: {} });
    topFile(SESSION, [line]);
    const c = await runCensus(root);
    expect(c.maxLineChars).toBe(Buffer.byteLength(line));
    expect(c.skippedLines).toBe(0);
  });

  it("measures line length in bytes, not characters", async () => {
    const mid = "\u00e9".repeat(READ_CAP_BYTES / 2 + 3); // under the cap by chars, over by bytes
    topFile(SESSION, [mid]);
    const a = await runCensus(root);
    expect(a.linesOverCap).toBe(1);
    expect(a.maxLineChars).toBe(Buffer.byteLength(mid));
    const huge = "\u00e9".repeat(4 * 1024 * 1024 + 5);
    topFile(SESSION, [huge]);
    const b = await runCensus(root);
    expect(b.skippedLines).toBe(1);
    expect(b.maxLineChars).toBe(Buffer.byteLength(huge));
  });
});

describe("census CLI", () => {
  it("prints only allowlisted keys and no path, project, file name or id", () => {
    tinyTree();
    const r = spawnSync("node", [SCRIPT, root], { encoding: "utf8" });
    expect(r.status).toBe(0);
    const [json, human, ...rest] = r.stdout.split("\n");
    expect(rest.join("")).toBe("");
    expect(human).toBe("drift: 4 across 3 files");
    const keys = Object.keys(JSON.parse(json));
    expect(keys.every((k) => ALLOWED.includes(k))).toBe(true);
    expect(keys).toEqual(ALLOWED);
    for (const secret of [
      root,
      PROJECT,
      SESSION,
      "agentsix",
      "bad.id7",
      "tid-secret",
      "toolu_secret",
      "someone-else",
      "hello",
      tmpdir(),
    ])
      expect(r.stdout + r.stderr).not.toContain(secret);
  });

  it("exits 2 with one line for a missing root", () => {
    const r = spawnSync("node", [SCRIPT, join(root, "nope")], { encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr.trim().split("\n")).toHaveLength(1);
    expect(r.stderr).not.toContain(root);
  });
});

describe("census with a throwing normalizer", () => {
  afterEach(() => {
    vi.doUnmock("./normalize.ts");
    vi.resetModules();
  });

  // Value: protects=a normalize exception is counted, not fatal; fails_when=the catch around normalize stops counting readErrors or rethrows; why_new=the normalizer never throws on real input; seam=none
  it("counts a normalize exception as a read error and keeps going", async () => {
    vi.resetModules();
    vi.doMock("./normalize.ts", async (orig) => {
      const real = await orig<typeof import("./normalize.ts")>();
      return {
        ...real,
        normalize: (state: Parameters<typeof real.normalize>[0], line: string) => {
          if (line.includes("boom")) throw new Error("boom");
          return real.normalize(state, line);
        },
      };
    });
    const { runCensus: run } = await import("./census-transcripts.ts");
    topFile(SESSION, [rec({ type: "assistant", message: {}, note: "boom" }), "{"]);
    const c = await run(root);
    expect(c.readErrors).toBe(1);
    expect(c.drift.malformed_json).toBe(1);
  });
});
