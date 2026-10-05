/**
 * Node-only helpers for the Playwright harness (no @playwright/test import, so Vitest and
 * vite.config.ts can load it). Fixture sets are shifted so their newest line sits at "now"
 * minus a per-scenario age; one global anchor keeps every file's gaps and order intact, and
 * fs.utimes matches mtime because the tailer drops files by mtime.
 */
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { hashId } from "../server/sanitize-fixtures.ts";

export type FixtureFile = { path: string; text: string };
export type Shift = { anchorNow: number; ageOffsetMs?: number };
export type ShiftOptions = Shift & { maxTs?: number; name?: string };
export type FixtureHandle = {
  root: string;
  files: string[];
  shift: Required<Shift> & { maxTs: number };
};

const FIXTURE_DIR = join(import.meta.dirname, "..", "server", "fixtures");
const TEMPLATE_SESSION = "6fb589b64edabbfd";

type Parsed = { line: number; json: Record<string, unknown>; ts: number };

function parseLines(input: string | string[], name: string): Parsed[] {
  const raw = typeof input === "string" ? input.split("\n") : input;
  const out: Parsed[] = [];
  raw.forEach((text, i) => {
    if (text.trim() === "") return;
    const where = `${name}:${i + 1}`;
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error(`${where}: malformed JSON (${String(e)})`);
    }
    if (typeof json !== "object" || json === null || Array.isArray(json)) {
      throw new Error(`${where}: not a JSON object`);
    }
    const stamp = (json as Record<string, unknown>).timestamp;
    const ts = typeof stamp === "string" ? Date.parse(stamp) : Number.NaN;
    if (Number.isNaN(ts)) throw new Error(`${where}: missing or invalid timestamp`);
    out.push({ line: i + 1, json: json as Record<string, unknown>, ts });
  });
  if (out.length === 0) throw new Error(`${name}: no lines`);
  return out;
}

export function maxTimestamp(input: string | string[], name = "input"): number {
  return Math.max(...parseLines(input, name).map((p) => p.ts));
}

/** Rewrites every line's timestamp so `maxTs` (default: this input's newest) lands at anchorNow - ageOffsetMs. */
export function shiftFixture(input: string | string[], options: ShiftOptions): string {
  const parsed = parseLines(input, options.name ?? "input");
  const maxTs = options.maxTs ?? Math.max(...parsed.map((p) => p.ts));
  const target = options.anchorNow - (options.ageOffsetMs ?? 0);
  return (
    parsed
      .map((p) =>
        JSON.stringify({ ...p.json, timestamp: new Date(p.ts - maxTs + target).toISOString() }),
      )
      .join("\n") + "\n"
  );
}

export function makeTempRoot(label: string): string {
  return mkdtempSync(join(tmpdir(), `office-e2e-${label}-`));
}

/** True only for a directory that makeTempRoot("run") could have made: directly under the temp dir. */
export function isRunRoot(path: string): boolean {
  if (path === "") return false;
  const abs = resolve(path);
  return basename(abs).startsWith("office-e2e-run-") && dirname(abs) === resolve(tmpdir());
}

/** Removes a run base, and refuses anything that is not one (the env var is not trusted). */
export function removeRunRoot(path: string): void {
  const abs = resolve(path);
  if (!isRunRoot(abs) || !isRealDirectory(abs)) return;
  removeRoot(abs);
}

/** lstat, so a symlink (which rmSync would follow through a trailing slash) does not count. */
export function isRealDirectory(path: string): boolean {
  try {
    const st = lstatSync(path);
    return st.isDirectory() && !st.isSymbolicLink();
  } catch {
    return false;
  }
}

/** Safe to call twice and on a path that never existed. */
export function removeRoot(path: string): void {
  rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

function touch(path: string, ms: number): void {
  utimesSync(path, ms / 1000, ms / 1000);
}

/** Writes every file shifted by one global anchor and sets each mtime to its last timestamp. */
export function writeFixtureSet(root: string, files: FixtureFile[], shift: Shift): FixtureHandle {
  if (files.length === 0) throw new Error("no fixture files");
  const maxTs = Math.max(...files.map((f) => maxTimestamp(f.text, f.path)));
  const full = { anchorNow: shift.anchorNow, ageOffsetMs: shift.ageOffsetMs ?? 0, maxTs };
  for (const f of files) {
    const text = shiftFixture(f.text, { ...full, name: f.path });
    const path = join(root, f.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    touch(path, maxTimestamp(text));
  }
  return { root, files: files.map((f) => f.path), shift: full };
}

/** Appends more fixture lines to a file of an already written set, with the set's shift. */
export function appendFixtureLines(
  set: FixtureHandle,
  path: string,
  lines: string | string[],
): void {
  const full = join(set.root, path);
  if (!existsSync(full)) throw new Error(`${path}: cannot append, file does not exist`);
  const text = shiftFixture(lines, { ...set.shift, name: path });
  appendFileSync(full, text);
  touch(full, maxTimestamp(text));
}

// ---- fixture sets ---------------------------------------------------------------------

const template = (name: string): string => readFileSync(join(FIXTURE_DIR, `${name}.jsonl`), "utf8");

function agentIdOf(text: string): string {
  const m = /"agentId":"([0-9a-f]+)"/.exec(text);
  if (m === null) throw new Error("subagent template has no agentId");
  return m[1]!;
}

const TOP_TEMPLATES = [
  "top-finished-question",
  "sync-flow",
  "async-flow",
  "top-live",
  "top-finished-plain",
] as const;

/** A top-level session file from a template, with its session id replaced by `session`. */
function sessionFile(project: string, session: string, name: string): FixtureFile {
  return {
    path: `${project}/${session}.jsonl`,
    text: template(name).replaceAll(TEMPLATE_SESSION, session),
  };
}

function subagentFile(project: string, session: string, name: string, tag: string): FixtureFile {
  const text = template(name);
  const agentId = hashId(`${session}:${tag}`);
  return {
    path: `${project}/${session}/subagents/agent-${agentId}.jsonl`,
    text: text.replaceAll(TEMPLATE_SESSION, session).replaceAll(agentIdOf(text), agentId),
  };
}

/** Every committed template as its own session; the two subagent templates hang off a parent. */
export function coreFixtureSet(): FixtureFile[] {
  const project = "-fixture-core";
  const files = TOP_TEMPLATES.map((name) => sessionFile(project, hashId(`core:${name}`), name));
  const syncParent = hashId("core:sync-flow");
  const asyncParent = hashId("core:async-flow");
  files.push(subagentFile(project, syncParent, "sub-live", "live"));
  files.push(subagentFile(project, asyncParent, "sub-finished", "finished"));
  return files;
}

/** A top-level session that has a finished tool call and no open one: shown as working. */
function workingText(session: string): string {
  const base = { sessionId: session, isSidechain: false, cwd: "/fixture/project" };
  return (
    [
      {
        type: "user",
        timestamp: "2026-10-02T10:00:10.000Z",
        message: { role: "user", content: "x" },
      },
      {
        type: "assistant",
        timestamp: "2026-10-02T10:00:11.000Z",
        message: {
          role: "assistant",
          stop_reason: "tool_use",
          content: [{ type: "tool_use", id: hashId(`${session}:tool`), name: "Read", input: {} }],
        },
      },
      {
        type: "user",
        timestamp: "2026-10-02T10:00:12.000Z",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: hashId(`${session}:tool`), content: "x" }],
        },
      },
    ]
      .map((l) => JSON.stringify({ ...l, ...base }))
      .join("\n") + "\n"
  );
}

/** Session ids of the core set's top-level files (the sync parent's file is written and dropped at first sight, so only its subagent draws). */
export function coreSessions(): {
  question: string;
  async: string;
  live: string;
  syncParent: string;
} {
  return {
    question: hashId("core:top-finished-question"),
    async: hashId("core:async-flow"),
    live: hashId("core:top-live"),
    syncParent: hashId("core:sync-flow"),
  };
}

const TWELVE_KINDS = ["top-finished-question", "working", "async-flow", "top-live"] as const;

/**
 * `count` distinct sessions that all render (a finished plain session is dropped at first sight):
 * an even mix of a question, a working agent, an async flow (question) and a stuck tool call.
 */
export function agentFixtureSet(count: number): FixtureFile[] {
  const project = "-fixture-twelve";
  return Array.from({ length: count }, (_, i) => {
    const name = TWELVE_KINDS[i % TWELVE_KINDS.length]!;
    const session = hashId(`twelve:${i}`);
    return name === "working"
      ? { path: `${project}/${session}.jsonl`, text: workingText(session) }
      : sessionFile(project, session, name);
  });
}

export function twelveAgentFixtureSet(): FixtureFile[] {
  return agentFixtureSet(12);
}

// ---- live lines -----------------------------------------------------------------------

/** The pinned office view of the @visual test (office.spec.ts) and the release hero shot (release.ts). */
export const VISUAL_QUERY = "/?hour=14&seed=e2e&scene=afternoon&decor=0";

/** Fixed reference instant: a live line "aged" N ms is stamped LIVE_REF_TS - N, shifted to now - N. */
export const LIVE_REF_TS = Date.parse("2026-01-01T00:00:00.000Z");

export function liveHandle(root: string, anchorNow = Date.now()): FixtureHandle {
  return { root, files: [], shift: { anchorNow, ageOffsetMs: 0, maxTs: LIVE_REF_TS } };
}

export type LiveLine = { ageMs: number } & (
  | { type: "user" }
  | { type: "tool_use"; id: string; name?: string; input?: Record<string, unknown> }
  | { type: "tool_result"; id: string; result?: Record<string, unknown> }
  | { type: "end_turn"; text: string }
);

/** One transcript line for `session`; `agentId` makes it a subagent line. */
export function liveLine(
  session: string,
  line: LiveLine,
  opts: { agentId?: string; cwd?: string } = {},
): string {
  const base = {
    sessionId: session,
    ...(opts.agentId === undefined
      ? { isSidechain: false }
      : { agentId: opts.agentId, isSidechain: true }),
    cwd: opts.cwd ?? "/fixture/live",
    timestamp: new Date(LIVE_REF_TS - line.ageMs).toISOString(),
  };
  switch (line.type) {
    case "user":
      return JSON.stringify({ type: "user", ...base, message: { role: "user", content: "x" } });
    case "tool_use":
      return JSON.stringify({
        type: "assistant",
        ...base,
        message: {
          role: "assistant",
          stop_reason: "tool_use",
          content: [
            { type: "tool_use", id: line.id, name: line.name ?? "Read", input: line.input ?? {} },
          ],
        },
      });
    case "tool_result":
      return JSON.stringify({
        type: "user",
        ...base,
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: line.id, content: "x" }],
        },
        ...(line.result === undefined ? {} : { toolUseResult: line.result }),
      });
    case "end_turn":
      return JSON.stringify({
        type: "assistant",
        ...base,
        message: {
          role: "assistant",
          stop_reason: "end_turn",
          content: [{ type: "text", text: line.text }],
        },
      });
  }
}

/** Appends live lines to `path` under `root`, creating the (empty) file first when it is new. */
export function appendLive(root: string, path: string, lines: string[]): void {
  const full = join(root, path);
  if (!existsSync(full)) {
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, "");
  }
  appendFixtureLines(liveHandle(root), path, lines);
}

// ---- env ------------------------------------------------------------------------------

/** Feed root and Vite cacheDir overrides from the environment; `{}` when neither is set. */
export function officeEnv(env: Record<string, string | undefined>): {
  root?: string;
  cacheDir?: string;
} {
  const out: { root?: string; cacheDir?: string } = {};
  const root = env.OFFICE_E2E_ROOT;
  const cacheDir = env.OFFICE_E2E_CACHE;
  if (root !== undefined && root !== "") out.root = root;
  if (cacheDir !== undefined && cacheDir !== "") out.cacheDir = cacheDir;
  return out;
}

// ---- failure context ------------------------------------------------------------------

export type FeedStatusAttachment = { name: "feed-status"; contentType: string; body: string };
export type StatusFetch = () => Promise<{ status: number; body: string }>;

/** The `/__office/status` body for a failed test: verbatim on 200, else text saying why. Never throws. */
export async function feedStatusAttachment(
  fetchStatus: StatusFetch,
  timeoutMs = 2000,
): Promise<FeedStatusAttachment> {
  const text = (body: string): FeedStatusAttachment => ({
    name: "feed-status",
    contentType: "text/plain",
    body,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs);
    });
    const res = await Promise.race([fetchStatus(), timeout]);
    if (res.status === 200) {
      return { name: "feed-status", contentType: "application/json", body: res.body };
    }
    return text(`status fetch returned ${res.status}: ${res.body}`);
  } catch (e) {
    return text(`status fetch failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}
