#!/usr/bin/env node
/**
 * Throwaway probe for which Claude Code hook events fire, and with which ids. Logs ids and key
 * names only (never message, prompt, tool_input, cwd or paths). Dependency-free.
 *   node hooks/probe.mjs             write a temp settings file, print the `claude --settings` command
 *   node hooks/probe.mjs --log       the hook itself: read stdin JSON, append one line to the log
 *   node hooks/probe.mjs --summary   summarise the log
 * The --log mode never throws, never writes to stdout or stderr, and always exits 0.
 */
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EVENTS = [
  "PermissionRequest",
  "Notification",
  "PostToolUse",
  "UserPromptSubmit",
  "Stop",
  "SubagentStart",
  "SubagentStop",
  "PreToolUse",
];
const MAX_ID = 128;
const STDIN_CAP = 256 * 1024;
const PAIR_WINDOW_MS = 5000;
const logPath = () => join(homedir(), ".office-agents", "probe.log");

/** A string of safe id characters, truncated; null when absent; "(invalid)" otherwise. */
function safe(v) {
  if (typeof v !== "string") return null;
  return /^[A-Za-z0-9_-]+$/.test(v) ? v.slice(0, MAX_ID) : "(invalid)";
}

export function logLine(raw, now = new Date()) {
  const p = JSON.parse(raw);
  if (typeof p !== "object" || p === null || Array.isArray(p)) throw new Error("not an object");
  return JSON.stringify({
    ts: now.toISOString(),
    hook_event_name: safe(p.hook_event_name),
    notification_type: safe(p.notification_type),
    session_id: safe(p.session_id),
    agent_id: safe(p.agent_id),
    tool_use_id: safe(p.tool_use_id),
    tool_name: safe(p.tool_name),
    keys: Object.keys(p).sort(),
  });
}

function readStdin() {
  const chunks = [];
  let size = 0;
  return new Promise((resolve) => {
    process.stdin.on("data", (c) => {
      size += c.length;
      if (size <= STDIN_CAP) chunks.push(c);
    });
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", () => resolve(""));
  });
}

async function logMode() {
  try {
    const line = logLine(await readStdin());
    mkdirSync(dirname(logPath()), { recursive: true });
    appendFileSync(logPath(), `${line}\n`);
  } catch {
    // The probe must never disturb Claude Code.
  }
}

const known = (v) => typeof v === "string" && v !== "" && v !== "(invalid)";

export function summarize(text) {
  const rows = [];
  for (const l of text.split("\n")) {
    try {
      const r = JSON.parse(l);
      if (r && typeof r === "object") rows.push(r);
    } catch {
      // skip blank or malformed lines
    }
  }
  const byEvent = new Map();
  for (const r of rows) {
    const name = r.hook_event_name ?? "(none)";
    const e = byEvent.get(name) ?? { count: 0, types: new Set() };
    e.count++;
    if (r.notification_type) e.types.add(r.notification_type);
    byEvent.set(name, e);
  }
  const out = [];
  for (const [name, e] of [...byEvent].sort()) {
    const types = e.types.size ? ` notification_types: ${[...e.types].sort().join(", ")}` : "";
    out.push(`${name}: ${e.count}${types}`);
  }
  let compared = 0;
  let shared = false;
  const prs = rows.filter((r) => r.hook_event_name === "PermissionRequest");
  const notes = rows.filter((r) => r.hook_event_name === "Notification");
  for (const a of prs) {
    for (const b of notes) {
      if (!known(a.session_id) || a.session_id !== b.session_id) continue;
      const gap = Math.abs(Date.parse(a.ts) - Date.parse(b.ts));
      if (Number.isNaN(gap) || gap > PAIR_WINDOW_MS) continue;
      if (!known(a.tool_use_id) || !known(b.tool_use_id)) continue;
      compared++;
      if (a.tool_use_id === b.tool_use_id) shared = true;
    }
  }
  out.push(`pair shares tool_use_id: ${shared ? "yes" : compared > 0 ? "no" : "unknown"}`);
  return out.join("\n");
}

function printMode() {
  const script = fileURLToPath(import.meta.url);
  const command = `node '${script.replaceAll("'", `'\\''`)}' --log`;
  const entry = {
    matcher: "",
    hooks: [{ type: "command", command, timeout: 2, async: true }],
  };
  const settings = { hooks: Object.fromEntries(EVENTS.map((e) => [e, [entry]])) };
  const file = join(mkdtempSync(join(tmpdir(), "office-probe-")), "settings.json");
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
  process.stdout.write(`Wrote ${file}\nLog: ${logPath()}\n\nRun:\n  claude --settings ${file}\n`);
}

// realpath: a symlinked path must still count as the entry point.
const entry = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === entry) {
  const mode = process.argv[2];
  if (mode === "--log") {
    await logMode();
  } else if (mode === "--summary") {
    let text = "";
    try {
      text = readFileSync(logPath(), "utf8");
    } catch {
      process.stdout.write(`No log at ${logPath()}\n`);
    }
    process.stdout.write(`${summarize(text)}\n`);
  } else {
    printMode();
  }
}
