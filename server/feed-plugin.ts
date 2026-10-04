/**
 * Vite dev-server plugin: tails Claude Code transcripts and serves AgentEvents over SSE
 * (T3/T4/T5/T6; decisions D9, D10, D12, E2, E3, E5). One file, exported pure helpers
 * (isLoopbackRequest, assignSeat, createTailer). Nothing here reads transcript text
 * into an event: lines go through server/normalize.ts and parseAgentEvent only.
 *
 * Wire format at /__office/events (every frame is one `data:` line of JSON):
 *   {type:"snapshot", events, seats}  first frame, written synchronously with subscribe
 *   {type:"event", event}             a delta
 *   {type:"seat", sessionId, desk}    a seat was assigned
 *   {type:"gone", sessionId, agentId} that agent's events were dropped (file vanished, aged
 *                                     out, or truncated and about to be replayed)
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { constants } from "node:fs";
import { open, readdir as fsReaddir, lstat as fsLstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { Plugin } from "vite-plus";
import { ATTENTION_STALE_MS, DESKS_PER_ROW } from "../shared/tuning.ts";
import type { AgentEvent } from "../shared/events.ts";
import { createNormalizerState, normalizeBatch } from "./normalize.ts";
import type { NormalizerState } from "./normalize.ts";

const ACTIVE_SCAN_MS = 1000;
const TREE_WALK_MS = 5000;
const COLD_TAIL_BYTES = 400 * 1024;
// READ_CAP_BYTES bounds the first-read window when growing it to fit one line, each later
// read, and the longest unterminated line kept between reads. That last use is the invariant:
// the line cap must be >= the read chunk so a line that fits in one chunk is never dropped as oversize.
const READ_CAP_BYTES = 4 * 1024 * 1024;
const MAX_READ_RETRIES = 5;
// A path denied for anything but permissions is retried after this long; the set stays bounded.
const DENY_RETRY_MS = 60_000;
const MAX_DENIED = 1000;
// Snapshot retention is per agent: its agent_started, the wait marker of its open sync launch,
// and its open tool starts, unresolved handoffs and returned children (up to
// ESSENTIAL_PER_AGENT each, oldest dropped past that) always stay; RECENT_PER_AGENT bounds the
// rest. SNAPSHOT_CAP bounds the whole ring and evicts the least recently active agents whole,
// agents whose latest state is a question last (they are only evicted when nothing else is left).
const RECENT_PER_AGENT = 40;
// Per map, so a parent that fanned out to a few hundred children keeps every back.
const ESSENTIAL_PER_AGENT = 200;
const SNAPSHOT_CAP = 2000;
const DRIFT_LOG_MS = 60_000;
const MAX_SSE_CLIENTS = 8;
const MAX_CLIENT_BACKLOG_BYTES = 1024 * 1024;
const DRAIN_TIMEOUT_MS = 10_000;
// An SSE comment frame this often makes a dead peer fail the write and drop its slot.
const HEARTBEAT_MS = 15_000;
const MAX_LOGGED_HEADER = 64;
// A replaced file is told from a grown one by its inode and this many leading bytes.
const HEAD_BYTES = 256;
// Open without following a leaf symlink and without blocking on a FIFO or device.
const OPEN_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

// ---- loopback guard (R3/R5, D10) ------------------------------------------------------

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function hostname(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    return end < 0 ? h : h.slice(1, end);
  }
  const colon = h.lastIndexOf(":");
  // A bare IPv6 literal has several colons and no port; "host:port" has exactly one.
  return colon >= 0 && h.indexOf(":") === colon ? h.slice(0, colon) : h;
}

function isLoopbackAddress(addr: string | undefined): boolean {
  if (addr === undefined) return false;
  return addr === "::1" || /^127\./.test(addr) || /^::ffff:127\./i.test(addr);
}

/** True only when both the Host hostname and the socket's remote address are loopback. */
export function isLoopbackRequest(req: {
  headers: { host?: string | undefined };
  socket: { remoteAddress?: string | undefined };
}): boolean {
  const host = req.headers.host;
  if (typeof host !== "string" || !LOOPBACK_HOSTS.has(hostname(host))) return false;
  return isLoopbackAddress(req.socket.remoteAddress);
}

/** True when the Origin header is absent or names a loopback host on any port. */
function isLoopbackOrigin(origin: string | string[] | undefined): boolean {
  if (origin === undefined) return true;
  if (typeof origin !== "string") return false;
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      LOOPBACK_HOSTS.has(hostname(url.host))
    );
  } catch {
    return false; // "null" and other opaque origins
  }
}

/** Why a request must be refused beyond the Host/socket check, or null when it may proceed. */
export function crossOriginReason(req: {
  headers: Record<string, string | string[] | undefined>;
}): string | null {
  const h = req.headers;
  if (!isLoopbackOrigin(h.origin)) return "foreign origin";
  if (Object.keys(h).some((k) => k.toLowerCase().startsWith("x-forwarded-"))) {
    return "forwarded request";
  }
  const site = h["sec-fetch-site"];
  if (site !== undefined && site !== "same-origin" && site !== "none") return "cross-site request";
  return null;
}

/** A header value safe for one log line: control characters become "?", length capped. */
function loggable(value: unknown): string {
  return (
    String(value)
      // oxlint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, "?")
      .slice(0, MAX_LOGGED_HEADER)
  );
}

// ---- seat table (T10/R8) --------------------------------------------------------------

export type SeatTable = {
  /** desk index -> session id, null = free. */
  desks: (string | null)[];
  bySession: Map<string, number>;
  projectOf: Map<string, string>;
};

export function createSeatTable(): SeatTable {
  return { desks: [], bySession: new Map(), projectOf: new Map() };
}

/**
 * Seats a session. A seated session keeps its desk; a new one takes a free desk beside
 * a desk of its own project (same row, left then right), else the first free desk.
 */
export function assignSeat(table: SeatTable, sessionId: string, projectId: string): number {
  const existing = table.bySession.get(sessionId);
  if (existing !== undefined) return existing;
  const isFree = (d: number) => d >= 0 && (table.desks[d] ?? null) === null;
  const sameRow = (a: number, b: number) =>
    Math.floor(a / DESKS_PER_ROW) === Math.floor(b / DESKS_PER_ROW);
  let desk = -1;
  for (let d = 0; d < table.desks.length && desk < 0; d++) {
    const owner = table.desks[d];
    if (owner === null || table.projectOf.get(owner) !== projectId) continue;
    desk = [d - 1, d + 1].find((n) => isFree(n) && sameRow(n, d)) ?? -1;
  }
  if (desk < 0) {
    desk = table.desks.findIndex((o) => o === null);
    if (desk < 0) desk = table.desks.length;
  }
  table.desks[desk] = sessionId;
  table.bySession.set(sessionId, desk);
  table.projectOf.set(sessionId, projectId);
  return desk;
}

/** Frees one session's desk; every other desk is untouched. */
export function releaseSeat(table: SeatTable, sessionId: string): void {
  const desk = table.bySession.get(sessionId);
  if (desk === undefined) return;
  table.desks[desk] = null;
  table.bySession.delete(sessionId);
  table.projectOf.delete(sessionId);
}

export function seatsOf(table: SeatTable): Record<string, number> {
  return Object.fromEntries(table.bySession);
}

// ---- tailer ---------------------------------------------------------------------------

export type DirEntry = { name: string; isFile(): boolean; isDirectory(): boolean };
export type TailerIo = {
  readdir(path: string): Promise<DirEntry[]>;
  lstat(path: string): Promise<{
    size: number;
    mtimeMs: number;
    dev?: number;
    ino?: number;
    isSymbolicLink(): boolean;
  }>;
  /** Opens without following a symlink and fstats the handle: a non-regular file (FIFO, socket,
   * device) fails with code ENOTREG, a symlink with ELOOP, and neither blocks. */
  read(path: string, start: number, end: number): Promise<Buffer>;
};

const defaultIo: TailerIo = {
  readdir: (path) => fsReaddir(path, { withFileTypes: true }),
  lstat: (path) => fsLstat(path),
  async read(path, start, end) {
    const handle = await open(path, OPEN_FLAGS);
    try {
      if (!(await handle.stat()).isFile()) {
        throw Object.assign(new Error("not a regular file"), { code: "ENOTREG" });
      }
      const buf = Buffer.alloc(end - start);
      const { bytesRead } = await handle.read(buf, 0, buf.length, start);
      return buf.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  },
};

export type TailerStatus = {
  filesTracked: number;
  drift: Record<string, number>;
  lastScanMs: number;
};

export type TailerOptions = {
  root: string;
  now?: () => number;
  io?: TailerIo;
  log?: (line: string) => void;
  /** Called with each file's new events, in order. */
  onEvents: (events: AgentEvent[], file: { projectId: string }) => void;
  /** Called when a tracked file leaves the mtime window, vanishes, or is denied. */
  onUntracked?: (file: { projectId: string; sessionId: string; agentId: string | null }) => void;
  /** Called when a truncated file is about to be re-read from the start. */
  onReset?: (file: { projectId: string; sessionId: string; agentId: string | null }) => void;
  windowMs?: number;
  coldTailBytes?: number;
  coldCapBytes?: number;
};

type Tracked = {
  path: string;
  projectId: string;
  sessionId: string;
  agentId: string | null;
  state: NormalizerState;
  offset: number;
  pending: Buffer;
  /** Dropping the rest of an oversize line, up to its next newline. */
  discarding: boolean;
  cold: boolean;
  /** Identity of the file read so far: inode and a hash of its first bytes. */
  ident: { dev?: number; ino?: number } | null;
  head: { len: number; hash: string } | null;
};

type Candidate = Omit<
  Tracked,
  "state" | "offset" | "pending" | "discarding" | "cold" | "ident" | "head"
>;

const errCode = (e: unknown): string | undefined => (e as NodeJS.ErrnoException | null)?.code;

const hashOf = (buf: Buffer): string => createHash("sha256").update(buf).digest("hex");

function splitLines(buf: Buffer): string[] {
  return buf
    .toString("utf8")
    .split("\n")
    .filter((l) => l.length > 0);
}

export function createTailer(opts: TailerOptions) {
  const now = opts.now ?? Date.now;
  const io = opts.io ?? defaultIo;
  const log = opts.log ?? (() => {});
  const windowMs = opts.windowMs ?? ATTENTION_STALE_MS;
  const coldTail = opts.coldTailBytes ?? COLD_TAIL_BYTES;
  const coldCap = opts.coldCapBytes ?? READ_CAP_BYTES;

  const tracked = new Map<string, Tracked>();
  /** Denied path -> when it may be tried again; permission errors never expire. */
  const denied = new Map<string, number>();
  const failures = new Map<string, number>();
  const retiredDrift: Record<string, number> = {};
  const ownDrift: Record<string, number> = {};
  let rootMissingLogged = false;
  let lastWalk = Number.NEGATIVE_INFINITY;
  let lastScanMs = 0;
  let didFirstScan = false;
  let coldBytes = 0;
  let stopped = false;
  let current: Promise<void> | null = null;
  let queued: Promise<void> | null = null;

  const addDrift = (into: Record<string, number>, from: Record<string, number | undefined>) => {
    for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + (v ?? 0);
  };

  function retire(file: Tracked): void {
    addDrift(retiredDrift, file.state.drift);
    tracked.delete(file.path);
    failures.delete(file.path);
    opts.onUntracked?.({
      projectId: file.projectId,
      sessionId: file.sessionId,
      agentId: file.agentId,
    });
  }

  function isDenied(path: string): boolean {
    const until = denied.get(path);
    if (until === undefined) return false;
    if (now() < until) return true;
    denied.delete(path);
    return false;
  }

  /** Only EACCES/EPERM are permanent; any other error lets the path be retried later. */
  function deny(path: string, e: unknown): void {
    if (isDenied(path)) return;
    const code = errCode(e);
    if (denied.size >= MAX_DENIED) denied.delete(denied.keys().next().value as string);
    denied.set(path, code === "EACCES" || code === "EPERM" ? Infinity : now() + DENY_RETRY_MS);
    log(`skipping ${loggable(basename(path))}: ${code ?? "read error"}`);
  }

  /** ENOENT retires the file (the agent leaves), a permission error denies it for good,
   * anything else is retried on later scans up to MAX_READ_RETRIES. */
  function fail(file: Tracked, e: unknown): void {
    const code = errCode(e);
    if (code === "ENOENT") {
      retire(file);
    } else if (code === "EACCES" || code === "EPERM" || code === "ELOOP" || code === "ENOTREG") {
      deny(file.path, e);
      retire(file);
    } else {
      const n = (failures.get(file.path) ?? 0) + 1;
      failures.set(file.path, n);
      if (n === 1) log(`retrying ${loggable(basename(file.path))}: ${code ?? "read error"}`);
      if (n >= MAX_READ_RETRIES) {
        deny(file.path, e);
        retire(file);
      }
    }
  }

  async function candidates(): Promise<Array<Candidate>> {
    const out: Array<Candidate> = [];
    let projects: DirEntry[];
    try {
      projects = await io.readdir(opts.root);
    } catch (e) {
      if (!rootMissingLogged) {
        rootMissingLogged = true;
        log(`no sessions: cannot read ${opts.root} (${errCode(e) ?? "error"})`);
      }
      return out;
    }
    rootMissingLogged = false;
    for (const project of projects) {
      if (!project.isDirectory()) continue; // symlinks are not followed
      const projectDir = join(opts.root, project.name);
      const entries = await io.readdir(projectDir).catch((e) => {
        deny(projectDir, e);
        return [] as DirEntry[];
      });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          out.push({
            path: join(projectDir, entry.name),
            projectId: project.name,
            sessionId: entry.name.slice(0, -".jsonl".length),
            agentId: null,
          });
        } else if (entry.isDirectory()) {
          const subDir = join(projectDir, entry.name, "subagents");
          const link = await io.lstat(subDir).catch(() => null);
          if (link === null || link.isSymbolicLink()) continue; // symlinks are not followed
          const subs = await io.readdir(subDir).catch(() => [] as DirEntry[]);
          for (const sub of subs) {
            if (!sub.isFile() || !/^agent-.+\.jsonl$/.test(sub.name)) continue;
            out.push({
              path: join(subDir, sub.name),
              projectId: project.name,
              sessionId: entry.name,
              agentId: sub.name.slice("agent-".length, -".jsonl".length),
            });
          }
        }
      }
    }
    return out;
  }

  const failed = (
    key: "consumer_error" | "normalizer_error",
    what: string,
    e: unknown,
    file?: Tracked,
  ): void => {
    ownDrift[key] = (ownDrift[key] ?? 0) + 1;
    if (file === undefined) {
      if (ownDrift[key] === 1) log(`${what} failed: ${String(e)}`);
    } else if (!loggedNormalizer.has(file)) {
      loggedNormalizer.add(file);
      log(`${what} failed: ${String(e)}`);
    }
  };
  /** Files whose normalizer failure was already logged: once per file, not per tailer. */
  const loggedNormalizer = new WeakSet<Tracked>();

  /** Events of the scan in progress, per file; flushed merged by ts so a parent's handoff
   * `back` never precedes its child's own events, whichever file was read first. */
  let buckets: Map<Tracked, AgentEvent[]> = new Map();

  function flush(): void {
    // One stable sort by ts across files. A file's own order is kept by sorting on its running
    // max ts, so a line stamped earlier than its predecessor never jumps ahead of it.
    const tagged: Array<{
      key: number;
      file: number;
      at: number;
      projectId: string;
      event: AgentEvent;
    }> = [];
    let n = 0;
    for (const [file, events] of buckets) {
      let key = Number.NEGATIVE_INFINITY;
      events.forEach((event, at) => {
        key = Math.max(key, event.ts);
        tagged.push({ key, file: n, at, projectId: file.projectId, event });
      });
      n++;
    }
    buckets = new Map();
    tagged.sort((a, b) => a.key - b.key || a.file - b.file || a.at - b.at);
    let run: { projectId: string; events: AgentEvent[] } | null = null;
    const deliver = () => {
      if (run === null || stopped) return;
      try {
        opts.onEvents(run.events, { projectId: run.projectId });
      } catch (e) {
        failed("consumer_error", "event handling", e);
      }
      run = null;
    };
    for (const t of tagged) {
      if (run !== null && run.projectId !== t.projectId) deliver();
      run ??= { projectId: t.projectId, events: [] };
      run.events.push(t.event);
    }
    deliver();
  }

  /** Session id comes from the path, never the record body; a parent is looked up among the
   * session's other files' launches (a top-level parent has no agentId, so that stays null). */
  function stateFor(file: Candidate): NormalizerState {
    return createNormalizerState({
      projectId: file.projectId,
      subagent: file.agentId !== null,
      sessionId: file.sessionId,
      parentOf: (agentId) => {
        for (const t of tracked.values()) {
          if (t.sessionId !== file.sessionId || t.path === file.path) continue;
          for (const l of t.state.launches.values()) if (l.agentId === agentId) return l.by;
        }
        return null;
      },
    });
  }

  function emit(file: Tracked, lines: string[]): void {
    // A normalizer exception must not look like a read error and deny the file.
    try {
      const events = normalizeBatch(file.state, lines, (e) =>
        failed("normalizer_error", "normalizing", e, file),
      );
      if (events.length > 0) buckets.set(file, [...(buckets.get(file) ?? []), ...events]);
    } catch (e) {
      failed("normalizer_error", "normalizing", e, file);
    }
  }

  /** First read: tail window, doubling to the cap while no complete line fits (E3, D9). */
  async function readCold(file: Tracked, size: number): Promise<void> {
    let win = coldTail;
    for (;;) {
      const start = Math.max(0, size - win);
      const from = start > 0 ? start - 1 : 0;
      const buf = await io.read(file.path, from, size);
      const head = start > 0 ? buf.indexOf(10) : -1;
      const body = start > 0 ? (head < 0 ? Buffer.alloc(0) : buf.subarray(head + 1)) : buf;
      const last = body.lastIndexOf(10);
      if (last < 0 && start > 0 && win < coldCap) {
        win = Math.min(win * 2, coldCap);
        continue;
      }
      file.cold = false;
      file.offset = from + buf.length;
      coldBytes += buf.length;
      if (last < 0 && start > 0) {
        ownDrift.oversize_line = (ownDrift.oversize_line ?? 0) + 1;
        file.pending = Buffer.alloc(0);
        // The oversize line is already complete when the window ends on a newline.
        file.discarding = buf.length > 0 && buf[buf.length - 1] !== 10;
        return;
      }
      file.pending = body.subarray(last + 1);
      emit(file, splitLines(body.subarray(0, last + 1)));
      return;
    }
  }

  async function readMore(file: Tracked, size: number): Promise<void> {
    const end = Math.min(size, file.offset + READ_CAP_BYTES);
    let buf = await io.read(file.path, file.offset, end);
    file.offset += buf.length;
    if (file.discarding) {
      const nl = buf.indexOf(10);
      if (nl < 0) return;
      file.discarding = false;
      buf = buf.subarray(nl + 1);
    }
    const data = Buffer.concat([file.pending, buf]);
    const last = data.lastIndexOf(10);
    file.pending = data.subarray(last + 1);
    if (file.pending.length > READ_CAP_BYTES) {
      ownDrift.oversize_line = (ownDrift.oversize_line ?? 0) + 1;
      file.pending = Buffer.alloc(0);
      file.discarding = true;
    }
    emit(file, splitLines(data.subarray(0, last + 1)));
  }

  /** True when the file at this path is not the one read so far: a new inode, or leading bytes
   * that changed while the file grew past the old offset. */
  async function replaced(
    file: Tracked,
    stat: { size: number; dev?: number; ino?: number },
  ): Promise<boolean> {
    const id = file.ident;
    if (id !== null && (id.ino !== stat.ino || id.dev !== stat.dev)) return true;
    if (file.head === null || stat.size === file.offset) return false;
    const now = await io.read(file.path, 0, file.head.len);
    return now.length < file.head.len || hashOf(now) !== file.head.hash;
  }

  /** Notes the hash of the file's first bytes, widening it while the file is under HEAD_BYTES. */
  async function remember(file: Tracked): Promise<void> {
    const len = Math.min(HEAD_BYTES, file.offset);
    if (len === 0 || (file.head !== null && file.head.len >= len)) return;
    const head = await io.read(file.path, 0, len);
    file.head = { len: head.length, hash: hashOf(head) };
  }

  async function pollFile(file: Tracked): Promise<void> {
    if (isDenied(file.path)) return;
    let stat: { size: number; mtimeMs: number; dev?: number; ino?: number };
    try {
      stat = await io.lstat(file.path);
    } catch (e) {
      fail(file, e);
      return;
    }
    if (now() - stat.mtimeMs > windowMs) {
      retire(file);
      return;
    }
    try {
      if (file.cold) await readCold(file, stat.size);
      else if (stat.size < file.offset || (await replaced(file, stat))) {
        // Truncated or replaced: reset offset and state; the agent is re-synthesized.
        addDrift(retiredDrift, file.state.drift);
        file.state = stateFor(file);
        file.offset = 0;
        file.pending = Buffer.alloc(0);
        file.discarding = false;
        file.cold = true;
        opts.onReset?.(file);
        file.ident = null;
        file.head = null;
        await readCold(file, stat.size);
      } else if (stat.size > file.offset) await readMore(file, stat.size);
      if (file.ident === null) file.ident = { dev: stat.dev, ino: stat.ino };
      await remember(file);
      failures.delete(file.path);
    } catch (e) {
      fail(file, e);
    }
  }

  async function run(): Promise<void> {
    const began = now();
    if (now() - lastWalk >= TREE_WALK_MS) {
      lastWalk = now();
      for (const c of await candidates()) {
        if (stopped) return;
        if (tracked.has(c.path) || isDenied(c.path)) continue;
        try {
          const stat = await io.lstat(c.path);
          if (now() - stat.mtimeMs > windowMs) continue;
        } catch (e) {
          if (errCode(e) !== "ENOENT") deny(c.path, e);
          continue;
        }
        tracked.set(c.path, {
          ...c,
          state: stateFor(c),
          offset: 0,
          pending: Buffer.alloc(0),
          discarding: false,
          cold: true,
          ident: null,
          head: null,
        });
      }
    }
    for (const file of [...tracked.values()].sort((a, b) => (a.path < b.path ? -1 : 1))) {
      if (stopped) return;
      await pollFile(file);
    }
    flush();
    lastScanMs = now() - began;
    if (!didFirstScan) {
      didFirstScan = true;
      log(`cold start: ${tracked.size} files, ${coldBytes} bytes, ${lastScanMs} ms`);
    }
  }

  /** Single-flight: a call during a scan queues exactly one follow-up scan. */
  function scanOnce(): Promise<void> {
    if (current === null) {
      current = run().finally(() => {
        current = null;
      });
      return current;
    }
    // The follow-up runs whether or not the scan in flight failed; that failure is the
    // first caller's to report, and a stuck rejected `queued` would block every later one.
    queued ??= current
      .catch(() => {})
      .then(() => {
        queued = null;
        return scanOnce();
      });
    return queued;
  }

  return {
    scanOnce,
    stop(): void {
      stopped = true;
    },
    status(): TailerStatus {
      const drift: Record<string, number> = {};
      addDrift(drift, retiredDrift);
      addDrift(drift, ownDrift);
      for (const f of tracked.values()) addDrift(drift, f.state.drift);
      return { filesTracked: tracked.size, drift, lastScanMs };
    },
  };
}

// ---- snapshot ring --------------------------------------------------------------------

type AgentRing = {
  started: AgentEvent | null;
  /** Tool starts without an end yet, by tool id. */
  openTools: Map<string, AgentEvent>;
  /** Out-handoffs without a back yet, by child id. */
  unresolved: Map<string, AgentEvent>;
  /** Children already handed back, by child id: the back must outlive the recent window. */
  returned: Map<string, AgentEvent>;
  /** The wait marker of the newest open sync launch. */
  waiting: AgentEvent | null;
  /** The done (or needs_attention) event of an agent whose latest state is a question. */
  question: AgentEvent | null;
  recent: AgentEvent[];
  /** Newest ts this agent has produced. */
  last: number;
};

/**
 * Late-client snapshot, kept per (sessionId, agentId) so one busy or early-sorted agent can
 * never push another's agent_started out. An agent is evicted whole or not at all.
 */
export function createSnapshotRing() {
  const agents = new Map<string, AgentRing>();
  const order = new WeakMap<AgentEvent, number>();
  let seq = 0;
  let total = 0;
  const keyOf = (sessionId: string, agentId: string | null) => `${sessionId}\u0000${agentId ?? ""}`;
  const sizeOf = (r: AgentRing) =>
    (r.started ? 1 : 0) +
    r.openTools.size +
    r.unresolved.size +
    r.returned.size +
    (r.waiting ? 1 : 0) +
    (r.question ? 1 : 0) +
    r.recent.length;
  const capped = <V>(map: Map<string, V>): string | null => {
    if (map.size <= ESSENTIAL_PER_AGENT) return null;
    const oldest = map.keys().next().value as string;
    map.delete(oldest);
    return oldest;
  };

  function add(event: AgentEvent): void {
    const key = keyOf(event.sessionId, event.agentId);
    const r: AgentRing = agents.get(key) ?? {
      started: null,
      openTools: new Map(),
      unresolved: new Map(),
      returned: new Map(),
      waiting: null,
      question: null,
      recent: [],
      last: Number.NEGATIVE_INFINITY,
    };
    total -= sizeOf(r);
    agents.delete(key); // re-insert last: the first key is always the least recently active
    agents.set(key, r);
    order.set(event, seq++);
    r.last = Math.max(r.last, event.ts);
    const recent = () => {
      r.recent.push(event);
      if (r.recent.length > RECENT_PER_AGENT) r.recent.shift();
    };
    const asking =
      (event.kind === "done" && event.endsWithQuestion) || event.kind === "needs_attention";
    // Only a question or a handoff leaves the question standing; any other event is activity.
    if (!asking && event.kind !== "handoff") r.question = null;
    if (asking) {
      r.question = event;
      r.openTools.clear();
      r.waiting = null;
    } else if (event.kind === "agent_started") {
      r.started = event;
    } else if (event.kind === "working" && event.tool?.phase === "start") {
      r.openTools.set(event.tool.id, event);
      capped(r.openTools);
    } else if (event.kind === "working" && event.tool?.phase === "end") {
      r.openTools.delete(event.tool.id);
      if (r.openTools.size === 0) r.waiting = null;
      recent();
    } else if (event.kind === "waiting_on_subagents") {
      r.waiting = event;
    } else if (event.kind === "handoff" && event.direction === "out") {
      r.unresolved.set(event.toAgentId, event);
      capped(r.unresolved);
    } else if (event.kind === "handoff") {
      r.unresolved.delete(event.toAgentId);
      r.returned.delete(event.toAgentId); // re-insert last: the first key is the oldest
      r.returned.set(event.toAgentId, event);
      // A child whose back was evicted must not outlive it as a ghost worker.
      const oldest = r.returned.values().next().value as Extract<AgentEvent, { kind: "handoff" }>;
      const dropped = capped(r.returned);
      if (dropped !== null) {
        const child = agents.get(keyOf(event.sessionId, dropped));
        // A child resumed after that back (newer events, or open tools) is not a ghost.
        if (child !== undefined && child.last <= oldest.ts && child.openTools.size === 0) {
          total -= sizeOf(child);
          agents.delete(keyOf(event.sessionId, dropped));
        }
      }
    } else {
      if (event.kind === "done") {
        r.openTools.clear();
        r.waiting = null;
      }
      recent();
    }
    total += sizeOf(r);
    while (total > SNAPSHOT_CAP && agents.size > 1) {
      // The first agent without a standing question; with none, the oldest asker (never `r`).
      let victim: [string, AgentRing] | undefined;
      for (const entry of agents) {
        if (entry[1] === r) break;
        victim ??= entry;
        if (entry[1].question === null) {
          victim = entry;
          break;
        }
      }
      if (victim === undefined) break;
      agents.delete(victim[0]);
      total -= sizeOf(victim[1]);
    }
  }

  return {
    add,
    forget(sessionId: string, agentId: string | null): void {
      const key = keyOf(sessionId, agentId);
      const r = agents.get(key);
      if (r === undefined) return;
      total -= sizeOf(r);
      agents.delete(key);
    },
    /** Every retained event, ordered by ts (arrival order breaks ties). */
    events(): AgentEvent[] {
      const out: AgentEvent[] = [];
      for (const r of agents.values()) {
        if (r.started) out.push(r.started);
        out.push(
          ...r.openTools.values(),
          ...r.unresolved.values(),
          ...r.returned.values(),
          ...r.recent,
        );
        if (r.question) out.push(r.question);
        if (r.waiting) out.push(r.waiting);
      }
      return out.sort((a, b) => a.ts - b.ts || (order.get(a) ?? 0) - (order.get(b) ?? 0));
    },
  };
}

// ---- feed (tailer + SSE + seats + routes) ---------------------------------------------

type Req = Pick<IncomingMessage, "url" | "method" | "headers" | "socket"> & {
  on?: (event: "close", cb: () => void) => unknown;
};
type Res = Pick<ServerResponse, "writeHead" | "write" | "end" | "statusCode" | "setHeader"> & {
  on?: (event: "close" | "drain" | "error", cb: () => void) => unknown;
  writableLength?: number;
  destroy?: () => unknown;
};

export type FeedOptions = {
  root?: string;
  now?: () => number;
  io?: TailerIo;
  log?: (line: string) => void;
  intervalMs?: number;
  setIntervalFn?: (fn: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
};

export function createFeed(options: FeedOptions = {}) {
  const now = options.now ?? Date.now;
  const log = (line: string) => (options.log ?? console.warn)(`[office] ${line}`);
  const seats = createSeatTable();
  const ring = createSnapshotRing();
  const clients = new Set<Res>();
  /** Clients whose last write returned false, with the time it did, until they drain. */
  const blocked = new Map<Res, number>();
  let timer: unknown = null;
  let heartbeat: NodeJS.Timeout | null = null;
  let lastDriftLog = Number.NEGATIVE_INFINITY;
  let lastDriftTotal = 0;

  function send(frame: unknown): void {
    broadcast(`data: ${JSON.stringify(frame)}\n\n`);
  }

  function broadcast(data: string): void {
    if (clients.size === 0) return;
    for (const res of [...clients]) {
      try {
        if (!res.write(data) && !blocked.has(res)) blocked.set(res, now());
      } catch {
        dropSlow(res);
        continue;
      }
      if (isStuck(res)) dropSlow(res);
    }
  }

  function isStuck(res: Res): boolean {
    const stuckSince = blocked.get(res);
    const stuck = stuckSince !== undefined && now() - stuckSince >= DRAIN_TIMEOUT_MS;
    return stuck || (res.writableLength ?? 0) > MAX_CLIENT_BACKLOG_BYTES;
  }

  /** Ends and destroys a client's socket so a non-reading peer cannot hold the slot. */
  function dropSlow(res: Res): void {
    log("dropping a slow SSE client");
    try {
      res.end();
      res.destroy?.();
    } catch {
      // already closed
    }
    dropClient(res);
  }

  function dropClient(res: Res): void {
    clients.delete(res);
    blocked.delete(res);
    if (clients.size === 0) stopHeartbeat();
  }

  function stopHeartbeat(): void {
    if (heartbeat !== null) clearInterval(heartbeat);
    heartbeat = null;
  }

  /** Removes a vanished agent's events from the snapshot ring and tells live clients. */
  function forget(file: { sessionId: string; agentId: string | null }): void {
    ring.forget(file.sessionId, file.agentId);
    send({ type: "gone", sessionId: file.sessionId, agentId: file.agentId });
  }

  const tailer = createTailer({
    root: options.root ?? join(homedir(), ".claude", "projects"),
    now,
    ...(options.io ? { io: options.io } : {}),
    log,
    onEvents(events, file) {
      for (const event of events) {
        if (event.kind === "agent_started" && event.agentId === null) {
          const before = seats.bySession.get(event.sessionId);
          const desk = assignSeat(seats, event.sessionId, file.projectId);
          if (before === undefined) send({ type: "seat", sessionId: event.sessionId, desk });
        }
        ring.add(event);
        send({ type: "event", event });
      }
    },
    onUntracked(file) {
      if (file.agentId === null) releaseSeat(seats, file.sessionId);
      forget(file);
    },
    onReset: forget,
  });

  function status() {
    return { ...tailer.status(), sseClients: clients.size };
  }

  async function scanOnce(): Promise<void> {
    await tailer.scanOnce();
    for (const res of [...clients]) if (isStuck(res)) dropSlow(res);
    const { drift } = tailer.status();
    const total = Object.values(drift).reduce((a, b) => a + b, 0);
    if (total !== lastDriftTotal && now() - lastDriftLog >= DRIFT_LOG_MS) {
      lastDriftLog = now();
      lastDriftTotal = total;
      log(`drift ${JSON.stringify(drift)}`);
    }
  }

  function reply(res: Res, code: number, type: string, body: string): void {
    res.statusCode = code;
    res.setHeader("content-type", type);
    res.end(body);
  }

  /** Connect-style handler: non-/__office URLs go to next() untouched. */
  function handle(req: Req, res: Res, next: () => void): void {
    const url = req.url ?? "";
    const path = url.split("?")[0];
    if (path !== "/__office" && !path.startsWith("/__office/")) {
      next();
      return;
    }
    const refusal = isLoopbackRequest(req) ? crossOriginReason(req) : "not loopback";
    if (refusal !== null) {
      log(
        `refused ${loggable(path)} (${refusal}): host=${loggable(req.headers.host)} remote=${loggable(req.socket.remoteAddress)}`,
      );
      reply(res, 403, "text/plain; charset=utf-8", "forbidden: office feed is loopback only\n");
      return;
    }
    if (req.method !== "GET") {
      reply(res, 405, "text/plain; charset=utf-8", "method not allowed\n");
    } else if (path === "/__office/status") {
      reply(res, 200, "application/json", JSON.stringify(status()));
    } else if (path === "/__office/events") {
      if (clients.size >= MAX_SSE_CLIENTS) {
        reply(res, 503, "text/plain; charset=utf-8", "too many clients\n");
        return;
      }
      // Snapshot and subscribe in one synchronous step: no delta can fall between them.
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const snapshot = `data: ${JSON.stringify({ type: "snapshot", events: ring.events(), seats: seatsOf(seats) })}\n\n`;
      if (!res.write(snapshot)) blocked.set(res, now());
      clients.add(res);
      heartbeat ??= setInterval(() => broadcast(": ping\n\n"), HEARTBEAT_MS).unref();
      const drop = () => dropClient(res);
      req.on?.("close", drop);
      res.on?.("close", drop);
      res.on?.("error", drop);
      res.on?.("drain", () => blocked.delete(res));
    } else {
      reply(res, 404, "text/plain; charset=utf-8", "not found\n");
    }
  }

  function start(): void {
    if (timer !== null) return;
    const tick = () => void scanOnce().catch((e: unknown) => log(`scan failed: ${String(e)}`));
    tick();
    timer = (options.setIntervalFn ?? ((fn, ms) => setInterval(fn, ms).unref()))(
      tick,
      options.intervalMs ?? ACTIVE_SCAN_MS,
    );
  }

  /** Clears the timer and ends every SSE stream; safe to call twice. */
  function stop(): void {
    tailer.stop();
    if (timer !== null) {
      (options.clearIntervalFn ?? ((h) => clearInterval(h as NodeJS.Timeout)))(timer);
      timer = null;
    }
    for (const res of clients) {
      try {
        res.end();
      } catch {
        // already closed
      }
    }
    clients.clear();
    blocked.clear();
    stopHeartbeat();
  }

  return { handle, start, stop, scanOnce, status, clients, seats };
}

export function officeFeed(options: FeedOptions = {}): Plugin {
  return {
    name: "office-feed",
    apply: "serve",
    configureServer(server) {
      // Vitest runs a serve-mode Vite server too; it must not scan the real transcripts.
      if (server.config.mode === "test") return;
      try {
        const feed = createFeed({
          log: (line) => server.config.logger.warn(line),
          ...options,
        });
        server.middlewares.use((req, res, next) => feed.handle(req, res, next));
        server.httpServer?.once("close", () => feed.stop());
        feed.start();
      } catch (e) {
        server.config.logger.warn(`[office] feed disabled: ${String(e)}`);
      }
    },
  };
}
