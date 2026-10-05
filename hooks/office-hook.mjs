#!/usr/bin/env node
/**
 * Claude Code command hook for Office Agents. Forwards ids only (an allowlist, never message,
 * prompt, tool_input or transcript contents) to the local dev server's POST /__office/hook.
 * Safety contract: never blocks, never slows, never changes Claude Code. Always exits 0 and
 * writes nothing to stdout or stderr. Talks to loopback only (127.0.0.1 or ::1). Dependency-free.
 */
import { constants as fsConstants, closeSync, fstatSync, openSync, readFileSync } from "node:fs";
import { request } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

const STDIN_CAP = 256 * 1024;
const DEADLINE_MS = 400;
/**
 * The fields server/hooks-adapter.ts reads, plus `agent_type`, which is forwarded but unused
 * there. Everything else is dropped.
 */
const ALLOWED = [
  "hook_event_name",
  "session_id",
  "agent_id",
  "agent_type",
  "notification_type",
  "tool_use_id",
  "cwd",
  "transcript_path",
];
// Same as MAX_STRING_LENGTH in shared/events.ts: the adapter drops longer values anyway.
const MAX_VALUE = 512;
const INFO_CAP = 64 * 1024;

const done = () => process.exit(0);
// Hard deadline for the whole run, stdin included.
setTimeout(done, DEADLINE_MS).unref();
process.on("uncaughtException", done);
process.on("unhandledRejection", done);

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === "EPERM";
  }
}

function readStdin(cb) {
  const chunks = [];
  let size = 0;
  let finished = false;
  const finish = (value) => {
    if (finished) return;
    finished = true;
    process.stdin.pause();
    process.stdin.removeAllListeners("data");
    cb(value);
  };
  process.stdin.on("data", (c) => {
    size += c.length;
    if (size > STDIN_CAP) return finish(null);
    chunks.push(c);
  });
  process.stdin.on("end", () => finish(Buffer.concat(chunks).toString("utf8")));
  process.stdin.on("error", () => finish(null));
}

function buildBody(text) {
  const payload = JSON.parse(text);
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const body = {};
  for (const key of ALLOWED) {
    const v = Object.hasOwn(payload, key) ? payload[key] : undefined;
    if (typeof v === "string" && v.length > 0 && v.length <= MAX_VALUE) body[key] = v;
  }
  return body;
}

/** Reads hook.json only if it is a small regular file (a FIFO would block); else null. */
function readInfo(file) {
  // O_NONBLOCK so opening a FIFO with no writer returns at once.
  const fd = openSync(file, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK);
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > INFO_CAP) return null;
    return JSON.parse(readFileSync(fd, "utf8"));
  } finally {
    closeSync(fd);
  }
}

function send(body) {
  const dir = process.env.OFFICE_HOOK_DIR || join(homedir(), ".office-agents");
  const info = readInfo(join(dir, "hook.json"));
  if (info === null) return done();
  if (!Number.isInteger(info.port) || typeof info.token !== "string" || !pidAlive(info.pid)) {
    return done();
  }
  // Only the two loopback literals, never a hostname from the file: Vite binds [::1] or
  // 127.0.0.1 depending on the machine, and the server records which.
  const host = info.host === "::1" ? "::1" : "127.0.0.1";
  const data = JSON.stringify(body);
  const req = request(
    {
      host,
      port: info.port,
      path: "/__office/hook",
      method: "POST",
      agent: false,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(data),
        "x-office-token": info.token,
      },
    },
    (res) => {
      res.resume();
      res.on("end", done);
      res.on("error", done);
    },
  );
  req.on("error", done);
  req.setTimeout(DEADLINE_MS, () => req.destroy());
  req.end(data);
}

readStdin((text) => {
  try {
    if (text === null) return done();
    const body = buildBody(text);
    if (body === null) return done();
    send(body);
  } catch {
    done();
  }
});
