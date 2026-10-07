/**
 * Claude Code hook payload -> AgentEvent (step 6, decisions D18, D19, D20). Pure: the exact
 * signals the transcript cannot give (a permission prompt, a subagent's real start and stop).
 * Only ids, enums and the receipt time are read from a payload; `message`, `prompt`, `tool_input`,
 * `last_assistant_message` and every other field are never touched. Events are built field by
 * field through parseAgentEvent, never by spreading the payload.
 */
import { createHash } from "node:crypto";
import { ID_PATTERN, MAX_STRING_LENGTH, parseAgentEvent } from "../shared/events.ts";
import type { AgentEvent } from "../shared/events.ts";

type Rule = "attention" | "attention_by_type" | "subagent_start" | "subagent_stop";

/**
 * hook_event_name -> what it means. UNVERIFIED (no interactive probe yet, D20): which of these
 * fire for a permission prompt or an agent's question. PermissionRequest and the Notification
 * types below are the researched guesses; unknown names and types are ignored, so a wrong row
 * costs nothing but a missed signal. SubagentStart/SubagentStop are CONFIRMED by the probe.
 */
export const HOOK_EVENTS: Readonly<Record<string, Rule>> = {
  PermissionRequest: "attention", // UNVERIFIED
  Notification: "attention_by_type", // UNVERIFIED which types fire when
  SubagentStart: "subagent_start", // CONFIRMED
  SubagentStop: "subagent_stop", // CONFIRMED
};

/** notification_type values that mean "a human is needed". idle_prompt and agent_completed are
 * left out until probed. UNVERIFIED. */
export const ATTENTION_NOTIFICATIONS: ReadonlySet<string> = new Set([
  "permission_prompt",
  "elicitation_dialog",
  "agent_needs_input",
]);

export type HookContext = {
  now: number;
  /** Called with a fixed reason (never an id value) when a payload is dropped for a bad id. */
  onReject?: (reason: string) => void;
};

/** The fixed reasons reported through `onReject`; they never carry an id value. */
export const REJECT_SESSION_ID = "rejected a payload with an invalid session id";
export const REJECT_AGENT_ID = "rejected a payload with an invalid agent id";

/** True when the payload carries `key` as anything but a valid id: a string the guard would
 * refuse, or a non-string value (number, boolean, object, array). Absent, undefined, null and an
 * empty string count as absent, as they did before the guard. */
function badIdOf(payload: Record<string, unknown>, key: string): boolean {
  const v = Object.hasOwn(payload, key) ? payload[key] : undefined;
  if (v === undefined || v === null || v === "") return false;
  return typeof v !== "string" || !ID_PATTERN.test(v);
}

/** A non-empty string within MAX_STRING_LENGTH, else null. Own properties only. It does not
 * check the id charset or the 128 limit: badIdOf and the event guard enforce those. */
function idOf(payload: Record<string, unknown>, key: string): string | null {
  const v = Object.hasOwn(payload, key) ? payload[key] : undefined;
  return typeof v === "string" && v.length > 0 && v.length <= MAX_STRING_LENGTH ? v : null;
}

/** The project directory name the tailer would use: the segment above the session's transcript,
 * else Claude Code's own encoding of the cwd. */
function projectIdOf(sessionId: string, transcriptPath: string | null, cwd: string): string | null {
  if (transcriptPath !== null) {
    const parts = transcriptPath.split(/[\\/]/);
    const at = parts.findIndex((p) => p === `${sessionId}.jsonl` || p === sessionId);
    if (at > 0 && parts[at - 1].length > 0) return parts[at - 1];
  }
  const encoded = cwd.replace(/[^A-Za-z0-9]/g, "-");
  return encoded.length > 0 ? encoded : null;
}

/** Deterministic, bounded, and made of ids only. */
function episodeIdOf(parts: Array<string | number>): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32);
}

/** Zero or more validated events for one hook payload; never throws. */
export function hookToEvents(payload: unknown, ctx: HookContext): AgentEvent[] {
  try {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return [];
    const p = payload as Record<string, unknown>;
    const name = idOf(p, "hook_event_name");
    if (name === null || !Object.hasOwn(HOOK_EVENTS, name)) return [];
    const rule = HOOK_EVENTS[name];
    if (badIdOf(p, "session_id")) {
      ctx.onReject?.(REJECT_SESSION_ID);
      return [];
    }
    if (badIdOf(p, "agent_id")) {
      ctx.onReject?.(REJECT_AGENT_ID);
      return [];
    }
    const sessionId = idOf(p, "session_id");
    if (sessionId === null) return [];
    const ts = Number.isFinite(ctx.now) ? Math.max(0, Math.floor(ctx.now)) : 0;
    const cwd = idOf(p, "cwd") ?? "";
    const projectId = projectIdOf(sessionId, idOf(p, "transcript_path"), cwd);
    if (projectId === null) return [];
    const agentId = idOf(p, "agent_id");

    let event: Record<string, unknown>;
    switch (rule) {
      case "attention_by_type":
      case "attention": {
        const type = idOf(p, "notification_type");
        if (rule === "attention_by_type" && (type === null || !ATTENTION_NOTIFICATIONS.has(type))) {
          return [];
        }
        event = {
          kind: "needs_attention",
          agentId,
          waitingSince: ts,
          episodeId: episodeIdOf([name, sessionId, agentId ?? "", idOf(p, "tool_use_id") ?? ts]),
        };
        break;
      }
      case "subagent_start":
        if (agentId === null) return [];
        event = { kind: "agent_started", agentId, projectPath: cwd, parentAgentId: null };
        break;
      case "subagent_stop":
        if (agentId === null) return [];
        event = { kind: "done", agentId, endsWithQuestion: false };
        break;
    }
    const parsed = parseAgentEvent({ sessionId, projectId, ts, ...event });
    return parsed === null ? [] : [parsed];
  } catch {
    return [];
  }
}
