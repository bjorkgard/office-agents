/**
 * Counts-only census of Claude Code transcripts: `node server/census-transcripts.ts [root]`
 * (default ~/.claude/projects; a missing root prints one line and exits 2).
 *
 * Run it after a Claude Code upgrade, to see whether the transcript format drifted from what
 * server/normalize.ts expects. It replays every file through the normalizer and prints ONE JSON
 * object of numbers and number maps, then one human line. It never prints a project dir, file
 * name, path, id value or transcript text; the output keys are a fixed allowlist.
 *
 * What each key answers:
 *   drift                  normalizer drift per reason; "sub:" prefix for subagent files
 *   sessionIdMismatches    T05: files whose records carry a sessionId other than the file's
 *   agentIdLength          T06: histogram of agent id lengths (length -> count)
 *   idsFailingIdPattern    T06: agent/session/tool ids that fail the guard's ID_PATTERN
 *   idMaxLength            T06: longest agent, session and tool id seen (lengths only, never values)
 *   maxLineChars, linesOverCap, readCapBytes
 *                          T10: longest line seen (in BYTES, as the feed plugin counts; the key name is
 *                          kept) against the feed plugin's read cap
 *   notificationStatuses   task-notification statuses seen (unknown ones count as "other")
 *   agentMessageEnqueues, resumesSeen, versions, eventKinds   context for the T-series
 *   files, subagentFiles, readErrors, skippedLines   coverage; skippedLines are lines over
 *                          LINE_CAP_BYTES, never parsed
 */
import { createReadStream } from "node:fs";
import { lstat, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ID_PATTERN } from "../shared/events.ts";
import { READ_CAP_BYTES } from "./feed-plugin.ts";
import {
  NOTIFICATION_STATUSES,
  createNormalizerState,
  isObj,
  normalize,
  tag,
} from "./normalize.ts";
import type { DriftReason, NormalizerState } from "./normalize.ts";

/** A line longer than this is counted and skipped, so one runaway line cannot exhaust memory. */
const LINE_CAP_BYTES = 8 * 1024 * 1024;
/** Live-only drift reason; the census reports it as sessionIdMismatches instead. */
const LIVE_ONLY_DRIFT: DriftReason = "session_id_mismatch";
const SEMVER = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

type Counts = Record<string, number>;

export type Census = {
  files: number;
  subagentFiles: number;
  readErrors: number;
  skippedLines: number;
  drift: Counts;
  eventKinds: Counts;
  sessionIdMismatches: number;
  agentIdLength: Counts;
  idsFailingIdPattern: number;
  idMaxLength: { agent: number; session: number; tool: number };
  maxLineChars: number;
  readCapBytes: number;
  linesOverCap: number;
  versions: Counts;
  notificationStatuses: Counts;
  agentMessageEnqueues: number;
  resumesSeen: number;
};

const add = (m: Counts, key: string, n = 1): void => {
  m[key] = (m[key] ?? 0) + n;
};

/** Semver versions and known enum values only; anything else is bucketed so no free text escapes. */
const enumKey = (v: string, known: readonly string[] | null): string =>
  (known === null ? SEMVER.test(v) : known.includes(v)) ? v : "other";

/**
 * Splits a file into lines without ever holding more than LINE_CAP_BYTES of one line.
 * `chars` is the line's UTF-8 byte length (the name stays for the output key); a leading BOM is dropped.
 */
async function* readLines(path: string): AsyncGenerator<{ line: string | null; chars: number }> {
  let tail = "";
  let tailBytes = 0;
  let overflow = false;
  let first = true;
  for await (const chunk of createReadStream(path, { encoding: "utf8" })) {
    const parts = (chunk as string).split("\n");
    if (first) {
      first = false;
      if (parts[0].startsWith("\uFEFF")) parts[0] = parts[0].slice(1);
    }
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const bytes = Buffer.byteLength(part);
      if (!overflow) {
        tail += part;
        tailBytes += bytes;
        if (tailBytes > LINE_CAP_BYTES) {
          overflow = true;
          tail = "";
        }
      } else {
        tailBytes += bytes;
      }
      if (i === parts.length - 1) break; // no newline after the last part: the line continues
      if (overflow) yield { line: null, chars: tailBytes };
      else if (tailBytes > 0) yield { line: tail, chars: tailBytes };
      tail = "";
      tailBytes = 0;
      overflow = false;
    }
  }
  if (overflow) yield { line: null, chars: tailBytes };
  else if (tailBytes > 0) yield { line: tail, chars: tailBytes };
}

type FileKind = { sessionId: string; agentId: string | null };

function longest(c: Census, k: keyof Census["idMaxLength"], id: string): void {
  c.idMaxLength[k] = Math.max(c.idMaxLength[k], id.length);
}

async function censusFile(path: string, kind: FileKind, c: Census): Promise<void> {
  const sub = kind.agentId !== null;
  const state: NormalizerState = createNormalizerState({
    projectId: "census",
    subagent: sub,
    sessionId: kind.sessionId,
  });
  state.batched = true; // replay the finished file in full, as a live tail would see it
  let mismatch = false;
  const ids: string[] = [kind.sessionId];
  if (kind.agentId !== null) ids.push(kind.agentId);
  longest(c, "session", kind.sessionId);
  if (kind.agentId !== null) longest(c, "agent", kind.agentId);
  for await (const { line, chars } of readLines(path)) {
    c.maxLineChars = Math.max(c.maxLineChars, chars);
    if (chars > READ_CAP_BYTES) c.linesOverCap++;
    if (line === null) {
      c.skippedLines++;
      continue;
    }
    try {
      for (const e of normalize(state, line)) add(c.eventKinds, e.kind);
    } catch {
      c.readErrors++; // the normalizer should never throw; count it, never print it
    }
    try {
      const rec: unknown = JSON.parse(line);
      if (!isObj(rec)) continue;
      if (typeof rec.version === "string") add(c.versions, enumKey(rec.version, null));
      if (typeof rec.sessionId === "string" && rec.sessionId !== kind.sessionId) mismatch = true;
      if (rec.type === "assistant" && isObj(rec.message) && Array.isArray(rec.message.content)) {
        for (const b of rec.message.content) {
          if (isObj(b) && b.type === "tool_use" && typeof b.id === "string") {
            longest(c, "tool", b.id);
            if (!ID_PATTERN.test(b.id)) c.idsFailingIdPattern++;
          }
        }
      }
      if (
        rec.type === "queue-operation" &&
        rec.operation === "enqueue" &&
        typeof rec.content === "string"
      ) {
        if (rec.content.startsWith("<agent-message")) c.agentMessageEnqueues++;
        if (rec.content.startsWith("<task-notification>")) {
          const status = tag(rec.content, "status");
          if (status !== null) add(c.notificationStatuses, enumKey(status, NOTIFICATION_STATUSES));
        }
      }
    } catch {
      // malformed lines are already counted as drift by normalize; one bad line costs one line
    }
  }
  if (mismatch) c.sessionIdMismatches++;
  c.resumesSeen += state.resumes.size;
  for (const launch of state.launches.values()) {
    if (launch.agentId !== null) {
      ids.push(launch.agentId);
      longest(c, "agent", launch.agentId);
    }
  }
  for (const id of ids) if (!ID_PATTERN.test(id)) c.idsFailingIdPattern++;
  if (kind.agentId !== null) add(c.agentIdLength, String(kind.agentId.length));
  else
    for (const launch of state.launches.values())
      if (launch.agentId !== null) add(c.agentIdLength, String(launch.agentId.length));
  for (const [reason, n] of Object.entries(state.drift)) {
    // the census already reports sessionIdMismatches; the live counter would double count
    if (reason === LIVE_ONLY_DRIFT) continue;
    add(c.drift, sub ? `sub:${reason}` : reason, n);
  }
}

/** Regular `*.jsonl` files directly in `dir`; symlinks and other entries are skipped. */
async function jsonlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith(".jsonl")).map((e) => e.name);
}

async function subdirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

const sortKeys = (m: Counts): Counts =>
  Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

export async function runCensus(root: string): Promise<Census> {
  const c: Census = {
    files: 0,
    subagentFiles: 0,
    readErrors: 0,
    skippedLines: 0,
    drift: {},
    eventKinds: {},
    sessionIdMismatches: 0,
    agentIdLength: {},
    idsFailingIdPattern: 0,
    idMaxLength: { agent: 0, session: 0, tool: 0 },
    maxLineChars: 0,
    readCapBytes: READ_CAP_BYTES,
    linesOverCap: 0,
    versions: {},
    notificationStatuses: {},
    agentMessageEnqueues: 0,
    resumesSeen: 0,
  };
  const visit = async (path: string, kind: FileKind): Promise<void> => {
    if (kind.agentId === null) c.files++;
    else c.subagentFiles++;
    try {
      await censusFile(path, kind, c);
    } catch {
      c.readErrors++;
    }
  };
  const tryList = async <T>(list: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await list();
    } catch {
      c.readErrors++;
      return [];
    }
  };
  for (const project of await tryList(() => subdirs(root))) {
    const projectDir = join(root, project);
    // lstat, not stat: a symlinked session or subagents dir is skipped, never followed.
    const isRealDir = (p: string) =>
      lstat(p).then(
        (s) => s.isDirectory(),
        () => false,
      );
    for (const name of await tryList(() => jsonlFiles(projectDir))) {
      const sessionId = name.slice(0, -".jsonl".length);
      await visit(join(projectDir, name), { sessionId, agentId: null });
    }
    // Session dirs are found on their own, not through a sibling top-level file.
    for (const sessionId of await tryList(() => subdirs(projectDir))) {
      const subDir = join(projectDir, sessionId, "subagents");
      if (!(await isRealDir(subDir))) continue;
      for (const sf of await tryList(() => jsonlFiles(subDir))) {
        const stem = sf.slice(0, -".jsonl".length);
        const agentId = stem.startsWith("agent-") ? stem.slice("agent-".length) : stem;
        await visit(join(subDir, sf), { sessionId, agentId });
      }
    }
  }
  c.drift = sortKeys(c.drift);
  c.eventKinds = sortKeys(c.eventKinds);
  c.agentIdLength = sortKeys(c.agentIdLength);
  c.versions = sortKeys(c.versions);
  c.notificationStatuses = sortKeys(c.notificationStatuses);
  return c;
}

async function main(): Promise<void> {
  const root = process.argv[2] ?? join(homedir(), ".claude", "projects");
  const ok = await stat(root).then(
    (s) => s.isDirectory(),
    () => false,
  );
  if (!ok) {
    console.error("census: transcript root not found");
    process.exit(2);
  }
  const c = await runCensus(root);
  const driftTotal = Object.values(c.drift).reduce((a, b) => a + b, 0);
  console.log(JSON.stringify(c));
  console.log(`drift: ${driftTotal} across ${c.files + c.subagentFiles} files`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
