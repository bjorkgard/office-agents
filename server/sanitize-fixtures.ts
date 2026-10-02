/**
 * Allowlist fixture sanitizer (D4, P23-ADD-3a). Turns a real transcript into a fixture
 * that keeps only structure: line type, role, block types, tool names, hashed ids,
 * timestamps, stop_reason, status, isAsync, isSidechain and the notification tags
 * task-id, tool-use-id, status. All text becomes `x`, or `x?` when the original ended in
 * a question mark (same predicate the normalizer uses). Everything else is dropped.
 *
 * Usage: node server/sanitize-fixtures.ts <out-dir> <transcript.jsonl>...
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { endsWithQuestion, isObj, tag } from "./normalize.ts";
import type { Json } from "./normalize.ts";

export const PLACEHOLDER_CWD = "/fixture/project";

/** One hash for agentId, tool ids, session ids and file names so links survive. */
export function hashId(id: string): string {
  return createHash("sha256").update(`office-fixture:${id}`).digest("hex").slice(0, 16);
}

/** `agent-<id>.jsonl`, `agent-<id>.meta.json` and `<session>.jsonl` get hashed ids. */
export function sanitizeFileName(name: string): string {
  const m = /^(agent-)?(.+?)(\.meta\.json|\.jsonl)$/.exec(name);
  if (m === null) return `${hashId(name)}.jsonl`;
  return `${m[1] ?? ""}${hashId(m[2])}${m[3]}`;
}

const text = (v: unknown): string => (typeof v === "string" && endsWithQuestion(v) ? "x?" : "x");
const hashed = (v: unknown): string | undefined =>
  typeof v === "string" && v ? hashId(v) : undefined;
const keep = (o: Json, keys: string[]): Json =>
  Object.fromEntries(keys.filter((k) => typeof o[k] === "boolean").map((k) => [k, o[k]]));

function enumOf(v: unknown, allowed: readonly string[]): string | undefined {
  return typeof v === "string" && allowed.includes(v) ? v : undefined;
}

function block(b: Json): Json | null {
  switch (b.type) {
    case "text":
    case "thinking":
      return { type: b.type, text: text(b.text ?? b.thinking) };
    case "tool_use": {
      const input = isObj(b.input) ? b.input : {};
      return {
        type: "tool_use",
        id: hashed(b.id),
        name: typeof b.name === "string" && /^[\w:.-]{1,64}$/.test(b.name) ? b.name : "x",
        input: { ...keep(input, ["run_in_background"]), to: hashed(input.to) },
      };
    }
    case "tool_result":
      return { type: "tool_result", tool_use_id: hashed(b.tool_use_id), content: "x" };
    default:
      return null;
  }
}

function message(m: unknown): Json | undefined {
  if (!isObj(m)) return undefined;
  const content = Array.isArray(m.content)
    ? m.content
        .filter(isObj)
        .map(block)
        .filter((b) => b !== null)
    : text(m.content);
  return {
    role: enumOf(m.role, ["user", "assistant"]),
    stop_reason: enumOf(m.stop_reason, ["end_turn", "tool_use", "stop_sequence", "max_tokens"]),
    content,
  };
}

/** Rebuilds a notification keeping only task-id, tool-use-id, status. */
function notification(content: unknown): string {
  if (typeof content !== "string" || !content.includes("<task-notification>")) return "x";
  const taskId = tag(content, "task-id");
  const toolUseId = tag(content, "tool-use-id");
  const status = enumOf(tag(content, "status") ?? "", ["completed", "failed"]);
  if (taskId === null || toolUseId === null || status === undefined) return "x";
  return (
    "<task-notification>" +
    `<task-id>${hashId(taskId)}</task-id><tool-use-id>${hashId(toolUseId)}</tool-use-id>` +
    `<status>${status}</status></task-notification>`
  );
}

const LINE_TYPES = ["assistant", "user", "queue-operation", "system", "attachment"] as const;

function sanitizeLine(rec: Json): Json {
  const type = enumOf(rec.type, LINE_TYPES) ?? "other";
  const out: Json = {
    type,
    sessionId: hashed(rec.sessionId),
    agentId: hashed(rec.agentId),
    ...keep(rec, ["isSidechain"]),
    cwd: typeof rec.cwd === "string" ? PLACEHOLDER_CWD : undefined,
    // Re-serialized, so text that merely parses as a date cannot ride along.
    timestamp:
      typeof rec.timestamp === "string" && !Number.isNaN(Date.parse(rec.timestamp))
        ? new Date(Date.parse(rec.timestamp)).toISOString()
        : undefined,
  };
  if (type === "assistant" || type === "user") out.message = message(rec.message);
  if (type === "queue-operation") {
    out.operation = enumOf(rec.operation, ["enqueue", "remove", "dequeue", "popAll"]);
    out.content = notification(rec.content);
  }
  if (type === "system")
    out.subtype = enumOf(rec.subtype, ["turn_duration", "stop_hook_summary", "informational"]);
  if (isObj(rec.toolUseResult)) {
    const r = rec.toolUseResult;
    out.toolUseResult = {
      status: enumOf(r.status, ["async_launched", "completed", "failed"]),
      agentId: hashed(r.agentId),
      ...keep(r, ["isAsync"]),
    };
  }
  return out;
}

/** Sanitizes a whole transcript; unparseable lines are dropped. Output is JSONL. */
export function sanitizeTranscript(raw: string): string {
  const lines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    let rec: unknown;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (isObj(rec)) lines.push(JSON.stringify(sanitizeLine(rec)));
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [outDir, ...inputs] = process.argv.slice(2);
  if (!outDir || inputs.length === 0) {
    console.error("usage: node server/sanitize-fixtures.ts <out-dir> <transcript.jsonl>...");
    process.exit(2);
  }
  mkdirSync(outDir, { recursive: true });
  for (const file of inputs) {
    writeFileSync(
      join(outDir, sanitizeFileName(basename(file))),
      sanitizeTranscript(readFileSync(file, "utf8")),
    );
  }
}
