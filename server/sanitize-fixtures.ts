/**
 * Allowlist fixture sanitizer (D4, P23-ADD-3a). Turns a real transcript into a fixture
 * that keeps only structure: line type, role, block types, tool names, hashed ids,
 * timestamps, stop_reason, status, isAsync, isSidechain and the notification tags
 * task-id, tool-use-id, status. All text becomes `x`, or `x?` when the original ended in
 * a question mark (same predicate the normalizer uses). Everything else is dropped.
 *
 * Ids are hashed with a per-run salt (random unless OFFICE_FIXTURE_SALT or --salt is given; an
 * empty OFFICE_FIXTURE_SALT counts as unset); tool names outside KNOWN_TOOLS become "x".
 * The committed fixtures in server/fixtures use the EMPTY salt, which the CLI never accepts:
 * regenerate them through the library, sanitizeTranscript(raw) and sanitizeFileName(name)
 * with the default salt.
 *
 * Usage: node server/sanitize-fixtures.ts [--salt <salt>] <out-dir> <transcript.jsonl>...
 * (--salt may appear anywhere in the arguments.)
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { endsWithQuestion, isObj, NOTIFICATION_STATUSES, tag } from "./normalize.ts";
import type { Json } from "./normalize.ts";

export const PLACEHOLDER_CWD = "/fixture/project";

/** Tool names kept as they are; anything else (custom, MCP) could name a person or project. */
export const KNOWN_TOOLS: ReadonlySet<string> = new Set([
  "Agent",
  "AskUserQuestion",
  "Bash",
  "BashOutput",
  "Edit",
  "ExitPlanMode",
  "Glob",
  "Grep",
  "KillShell",
  "MultiEdit",
  "NotebookEdit",
  "Read",
  "SendMessage",
  "Skill",
  "SlashCommand",
  "Task",
  "TaskOutput",
  "TaskStop",
  "TodoWrite",
  "WebFetch",
  "WebSearch",
  "Write",
]);

/**
 * One hash for agentId, tool ids, session ids and file names so links survive. An empty salt
 * is the reproducible form the committed fixtures use.
 */
export function hashId(id: string, salt = ""): string {
  const input = salt === "" ? `office-fixture:${id}` : `office-fixture:${salt}:${id}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/** `agent-<id>.jsonl`, `agent-<id>.meta.json` and `<session>.jsonl` get hashed ids. */
export function sanitizeFileName(name: string, salt = ""): string {
  const m = /^(agent-)?(.+?)(\.meta\.json|\.jsonl)$/.exec(name);
  if (m === null) return `${hashId(name, salt)}.jsonl`;
  return `${m[1] ?? ""}${hashId(m[2], salt)}${m[3]}`;
}

type Hash = (id: string) => string;

const text = (v: unknown): string => (typeof v === "string" && endsWithQuestion(v) ? "x?" : "x");
const hashed = (v: unknown, h: Hash): string | undefined =>
  typeof v === "string" && v ? h(v) : undefined;
const keep = (o: Json, keys: string[]): Json =>
  Object.fromEntries(keys.filter((k) => typeof o[k] === "boolean").map((k) => [k, o[k]]));

function enumOf(v: unknown, allowed: readonly string[]): string | undefined {
  return typeof v === "string" && allowed.includes(v) ? v : undefined;
}

function block(b: Json, h: Hash): Json | null {
  switch (b.type) {
    case "text":
    case "thinking":
      return { type: b.type, text: text(b.text ?? b.thinking) };
    case "tool_use": {
      const input = isObj(b.input) ? b.input : {};
      return {
        type: "tool_use",
        id: hashed(b.id, h),
        name: typeof b.name === "string" && KNOWN_TOOLS.has(b.name) ? b.name : "x",
        input: { ...keep(input, ["run_in_background"]), to: hashed(input.to, h) },
      };
    }
    case "tool_result":
      return { type: "tool_result", tool_use_id: hashed(b.tool_use_id, h), content: "x" };
    default:
      return null;
  }
}

function message(m: unknown, h: Hash): Json | undefined {
  if (!isObj(m)) return undefined;
  const content = Array.isArray(m.content)
    ? m.content
        .filter(isObj)
        .map((b) => block(b, h))
        .filter((b) => b !== null)
    : text(m.content);
  return {
    role: enumOf(m.role, ["user", "assistant"]),
    stop_reason: enumOf(m.stop_reason, ["end_turn", "tool_use", "stop_sequence", "max_tokens"]),
    content,
  };
}

/** Rebuilds a notification keeping only task-id, tool-use-id, status. */
function notification(content: unknown, h: Hash): string {
  if (typeof content !== "string" || !content.startsWith("<task-notification>")) return "x";
  const taskId = tag(content, "task-id");
  const toolUseId = tag(content, "tool-use-id");
  const status = enumOf(tag(content, "status") ?? "", NOTIFICATION_STATUSES);
  if (taskId === null || toolUseId === null || status === undefined) return "x";
  return (
    "<task-notification>" +
    `<task-id>${h(taskId)}</task-id><tool-use-id>${h(toolUseId)}</tool-use-id>` +
    `<status>${status}</status></task-notification>`
  );
}

const LINE_TYPES = ["assistant", "user", "queue-operation", "system", "attachment"] as const;

function sanitizeLine(rec: Json, h: Hash): Json {
  const type = enumOf(rec.type, LINE_TYPES) ?? "other";
  const out: Json = {
    type,
    sessionId: hashed(rec.sessionId, h),
    agentId: hashed(rec.agentId, h),
    ...keep(rec, ["isSidechain"]),
    cwd: typeof rec.cwd === "string" ? PLACEHOLDER_CWD : undefined,
    // Re-serialized, so text that merely parses as a date cannot ride along.
    timestamp:
      typeof rec.timestamp === "string" && !Number.isNaN(Date.parse(rec.timestamp))
        ? new Date(Date.parse(rec.timestamp)).toISOString()
        : undefined,
  };
  if (type === "assistant" || type === "user") out.message = message(rec.message, h);
  if (type === "queue-operation") {
    out.operation = enumOf(rec.operation, ["enqueue", "remove", "dequeue", "popAll"]);
    out.content = notification(rec.content, h);
  }
  if (type === "system")
    out.subtype = enumOf(rec.subtype, ["turn_duration", "stop_hook_summary", "informational"]);
  if (isObj(rec.toolUseResult)) {
    const r = rec.toolUseResult;
    out.toolUseResult = {
      status: enumOf(r.status, ["async_launched", ...NOTIFICATION_STATUSES]),
      agentId: hashed(r.agentId, h),
      ...keep(r, ["isAsync"]),
    };
  }
  return out;
}

/** Sanitizes a whole transcript; unparseable lines are dropped. Output is JSONL. */
export function sanitizeTranscript(raw: string, salt = ""): string {
  const h: Hash = (id) => hashId(id, salt);
  const lines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    let rec: unknown;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (isObj(rec)) lines.push(JSON.stringify(sanitizeLine(rec, h)));
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

export interface CliArgs {
  salt: string;
  outDir: string;
  inputs: string[];
}

/** Parses CLI arguments; null means usage error. An empty env salt is treated as unset. */
export function parseCliArgs(
  args: readonly string[],
  env: Record<string, string | undefined>,
): CliArgs | null {
  let salt = env.OFFICE_FIXTURE_SALT || randomBytes(16).toString("hex");
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--salt") {
      salt = args[++i] ?? "";
    } else {
      positional.push(args[i]);
    }
  }
  const [outDir, ...inputs] = positional;
  if (!outDir || inputs.length === 0 || salt === "") return null;
  return { salt, outDir, inputs };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const parsed = parseCliArgs(process.argv.slice(2), process.env);
  if (parsed === null) {
    console.error(
      "usage: node server/sanitize-fixtures.ts [--salt <salt>] <out-dir> <transcript.jsonl>...",
    );
    process.exit(2);
  }
  const { salt, outDir, inputs } = parsed;
  mkdirSync(outDir, { recursive: true });
  for (const file of inputs) {
    writeFileSync(
      join(outDir, sanitizeFileName(basename(file), salt)),
      sanitizeTranscript(readFileSync(file, "utf8"), salt),
    );
  }
}
