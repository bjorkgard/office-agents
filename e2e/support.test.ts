import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  appendFixtureLines,
  appendLive,
  coreFixtureSet,
  coreSessions,
  feedStatusAttachment,
  isRunRoot,
  liveLine,
  makeTempRoot,
  officeEnv,
  removeRoot,
  removeRunRoot,
  shiftFixture,
  twelveAgentFixtureSet,
  writeFixtureSet,
} from "./support.ts";

const line = (ts: string, extra = "") => `{"type":"user","timestamp":"${ts}"${extra}}`;
const tsOf = (text: string): number[] =>
  text
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => Date.parse((JSON.parse(l) as { timestamp: string }).timestamp));

const roots: string[] = [];
const temp = () => {
  const r = mkdtempSync(join(tmpdir(), "support-test-"));
  roots.push(r);
  return r;
};
afterEach(() => {
  for (const r of roots.splice(0)) removeRoot(r);
});

const NOW = Date.parse("2030-01-01T00:00:00.000Z");

describe("shiftFixture", () => {
  it("puts the last line at anchorNow and preserves gaps", () => {
    const out = shiftFixture([line("2026-10-02T10:00:00.000Z"), line("2026-10-02T10:00:05.000Z")], {
      anchorNow: NOW,
    });
    expect(tsOf(out)).toEqual([NOW - 5000, NOW]);
  });

  it("accepts text and applies the age offset", () => {
    const text = `${line("2026-10-02T10:00:00.000Z")}\n${line("2026-10-02T10:00:02.000Z")}\n`;
    const out = shiftFixture(text, { anchorNow: NOW, ageOffsetMs: 60_000 });
    expect(tsOf(out)).toEqual([NOW - 62_000, NOW - 60_000]);
    expect(out.endsWith("\n")).toBe(true);
  });

  it("uses an explicit global maxTs so files keep their relative order", () => {
    const early = shiftFixture([line("2026-10-02T10:00:00.000Z")], {
      anchorNow: NOW,
      maxTs: Date.parse("2026-10-02T10:00:10.000Z"),
    });
    expect(tsOf(early)).toEqual([NOW - 10_000]);
  });

  it("throws with file:line on malformed JSON", () => {
    expect(() =>
      shiftFixture([line("2026-10-02T10:00:00.000Z"), "{nope"], {
        anchorNow: NOW,
        name: "a.jsonl",
      }),
    ).toThrow(/a\.jsonl:2/);
  });

  it("throws on a missing or invalid timestamp", () => {
    expect(() => shiftFixture(['{"type":"user"}'], { anchorNow: NOW, name: "b.jsonl" })).toThrow(
      /b\.jsonl:1/,
    );
    expect(() => shiftFixture([line("garbage")], { anchorNow: NOW, name: "c.jsonl" })).toThrow(
      /c\.jsonl:1/,
    );
  });

  it("throws on an input with no lines", () => {
    expect(() => shiftFixture("\n", { anchorNow: NOW, name: "d.jsonl" })).toThrow(/d\.jsonl/);
  });
});

describe("writeFixtureSet", () => {
  const files = [
    {
      path: "p/s1.jsonl",
      text: `${line("2026-10-02T10:00:00.000Z")}\n${line("2026-10-02T10:00:10.000Z")}\n`,
    },
    { path: "p/s1/subagents/agent-a1.jsonl", text: `${line("2026-10-02T10:00:20.000Z")}\n` },
  ];

  it("anchors on the global max across files and sets utimes", () => {
    const root = temp();
    writeFixtureSet(root, files, { anchorNow: NOW, ageOffsetMs: 1000 });
    const top = readFileSync(join(root, "p/s1.jsonl"), "utf8");
    const sub = readFileSync(join(root, "p/s1/subagents/agent-a1.jsonl"), "utf8");
    expect(tsOf(sub)).toEqual([NOW - 1000]);
    expect(tsOf(top)).toEqual([NOW - 21_000, NOW - 11_000]);
    expect(Math.abs(statSync(join(root, "p/s1.jsonl")).mtimeMs - (NOW - 11_000))).toBeLessThan(2);
    expect(
      Math.abs(statSync(join(root, "p/s1/subagents/agent-a1.jsonl")).mtimeMs - (NOW - 1000)),
    ).toBeLessThan(2);
  });

  it("throws on zero files", () => {
    expect(() => writeFixtureSet(temp(), [], { anchorNow: NOW })).toThrow(/no fixture files/);
  });
});

describe("isRunRoot", () => {
  it("accepts a fresh run root under the temp dir", () => {
    const root = makeTempRoot("run");
    roots.push(root);
    expect(isRunRoot(root)).toBe(true);
  });

  it("rejects home, the filesystem root, other paths and a wrong prefix", () => {
    expect(isRunRoot(homedir())).toBe(false);
    expect(isRunRoot("/")).toBe(false);
    expect(isRunRoot("")).toBe(false);
    expect(isRunRoot("/usr/local/office-e2e-run-abc")).toBe(false);
    expect(isRunRoot(join(tmpdir(), "office-e2e-core-abc"))).toBe(false);
    expect(isRunRoot(join(tmpdir(), "office-e2e-run-abc", "nested"))).toBe(false);
    expect(isRunRoot(tmpdir())).toBe(false);
  });
});

describe("appendFixtureLines", () => {
  it("appends with the same shift and bumps mtime", () => {
    const root = temp();
    const set = writeFixtureSet(
      root,
      [{ path: "p/s.jsonl", text: `${line("2026-10-02T10:00:00.000Z")}\n` }],
      { anchorNow: NOW },
    );
    appendFixtureLines(set, "p/s.jsonl", [line("2026-10-02T10:00:03.000Z")]);
    const text = readFileSync(join(root, "p/s.jsonl"), "utf8");
    expect(tsOf(text)).toEqual([NOW, NOW + 3000]);
    expect(Math.abs(statSync(join(root, "p/s.jsonl")).mtimeMs - (NOW + 3000))).toBeLessThan(2);
  });

  it("throws when the target file does not exist", () => {
    const set = writeFixtureSet(
      temp(),
      [{ path: "a.jsonl", text: `${line("2026-10-02T10:00:00.000Z")}\n` }],
      {
        anchorNow: NOW,
      },
    );
    expect(() =>
      appendFixtureLines(set, "missing.jsonl", [line("2026-10-02T10:00:01.000Z")]),
    ).toThrow(/missing\.jsonl/);
  });
});

describe("fixture sets", () => {
  it("coreFixtureSet is non-empty and every file parses", () => {
    const set = coreFixtureSet();
    expect(set.length).toBeGreaterThan(0);
    const root = temp();
    expect(() => writeFixtureSet(root, set, { anchorNow: NOW })).not.toThrow();
  });

  it("twelveAgentFixtureSet yields 12 distinct sessions", () => {
    const set = twelveAgentFixtureSet();
    const sessions = new Set(set.map((f) => f.path.split("/")[1]!.replace(/\.jsonl$/, "")));
    expect(sessions.size).toBe(12);
    const root = temp();
    writeFixtureSet(root, set, { anchorNow: NOW });
    expect(existsSync(join(root, set[0]!.path))).toBe(true);
    expect(readdirSync(join(root, set[0]!.path.split("/")[0]!)).length).toBeGreaterThanOrEqual(12);
  });
});

describe("officeEnv", () => {
  it("returns {} for an empty env", () => {
    expect(officeEnv({})).toEqual({});
  });
  it("returns only root when only root is set", () => {
    expect(officeEnv({ OFFICE_E2E_ROOT: "/r" })).toEqual({ root: "/r" });
  });
  it("returns only cacheDir when only the cache is set", () => {
    expect(officeEnv({ OFFICE_E2E_CACHE: "/c" })).toEqual({ cacheDir: "/c" });
  });
  it("returns both when both are set and ignores empty strings", () => {
    expect(officeEnv({ OFFICE_E2E_ROOT: "/r", OFFICE_E2E_CACHE: "/c" })).toEqual({
      root: "/r",
      cacheDir: "/c",
    });
    expect(officeEnv({ OFFICE_E2E_ROOT: "", OFFICE_E2E_CACHE: "" })).toEqual({});
  });
});

describe("removeRoot", () => {
  it("is safe to call twice", () => {
    const r = temp();
    writeFileSync(join(r, "f"), "x");
    removeRoot(r);
    expect(existsSync(r)).toBe(false);
    expect(() => removeRoot(r)).not.toThrow();
  });
});

describe("removeRunRoot", () => {
  it("removes a real run root", () => {
    const root = makeTempRoot("run");
    roots.push(root);
    writeFileSync(join(root, "f"), "x");
    removeRunRoot(root);
    expect(existsSync(root)).toBe(false);
  });

  for (const slash of ["", "/"]) {
    it(`leaves a symlink's target alone (suffix ${JSON.stringify(slash)})`, () => {
      const target = temp();
      writeFileSync(join(target, "keep"), "x");
      const link = join(tmpdir(), `office-e2e-run-link-${process.pid}${slash === "" ? "a" : "b"}`);
      symlinkSync(target, link);
      roots.push(link);
      removeRunRoot(link + slash);
      expect(existsSync(join(target, "keep"))).toBe(true);
      expect(existsSync(target)).toBe(true);
    });
  }
});

describe("live lines", () => {
  it("stamps a line aged N ms at now minus N once appended", () => {
    const root = temp();
    const file = "-p/s.jsonl";
    const lines = [
      liveLine("s", { type: "user", ageMs: 5000 }),
      liveLine("s", { type: "end_turn", text: "x?", ageMs: 0 }),
    ];
    const before = Date.now();
    appendLive(root, file, lines);
    const after = Date.now();
    const [first, last] = tsOf(readFileSync(join(root, file), "utf8"));
    expect(last).toBeGreaterThanOrEqual(before);
    expect(last).toBeLessThanOrEqual(after);
    expect(last! - first!).toBe(5000);
  });

  it("creates a new file empty first and keeps appending to an existing one", () => {
    const root = temp();
    appendLive(root, "-p/s.jsonl", [liveLine("s", { type: "user", ageMs: 0 })]);
    appendLive(root, "-p/s.jsonl", [liveLine("s", { type: "user", ageMs: 0 })]);
    expect(readFileSync(join(root, "-p/s.jsonl"), "utf8").trim().split("\n")).toHaveLength(2);
  });

  it("marks subagent lines with their agent id", () => {
    const l = JSON.parse(liveLine("s", { type: "user", ageMs: 0 }, { agentId: "a1" }));
    expect(l).toMatchObject({ agentId: "a1", isSidechain: true });
  });

  it("coreSessions names the core set's top-level files", () => {
    const paths = coreFixtureSet().map((f) => f.path);
    const { question, async: asyncId, live } = coreSessions();
    for (const id of [question, asyncId, live]) {
      expect(paths).toContain(`-fixture-core/${id}.jsonl`);
    }
  });

  it("twelve sessions all render: a finished file must end on a question", () => {
    for (const f of twelveAgentFixtureSet()) {
      const last = JSON.parse(f.text.trim().split("\n").at(-1)!) as {
        message?: { stop_reason?: string; content?: { text?: string }[] };
      };
      if (last.message?.stop_reason === "end_turn") {
        expect(last.message.content?.at(-1)?.text?.endsWith("?")).toBe(true);
      }
    }
  });
});

describe("feedStatusAttachment", () => {
  it("ok status body is attached verbatim", async () => {
    const body = '{"tracked":3,\n "ok":true}';
    const a = await feedStatusAttachment(async () => ({ status: 200, body }));
    expect(a).toEqual({ name: "feed-status", contentType: "application/json", body });
  });

  it("status fetch failure becomes an attachment, not a throw", async () => {
    const a = await feedStatusAttachment(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    expect(a.name).toBe("feed-status");
    expect(a.contentType).toBe("text/plain");
    expect(a.body).toContain("ECONNREFUSED");
  });

  it("a non-200 status keeps its code and body as text", async () => {
    const a = await feedStatusAttachment(async () => ({ status: 403, body: "nope" }));
    expect(a.contentType).toBe("text/plain");
    expect(a.body).toContain("403");
    expect(a.body).toContain("nope");
  });

  it("a hung fetch times out into an attachment", async () => {
    const a = await feedStatusAttachment(() => new Promise<never>(() => {}), 20);
    expect(a.contentType).toBe("text/plain");
    expect(a.body).toContain("timed out");
  });
});
