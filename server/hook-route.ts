/**
 * POST /__office/hook handling, split out of feed-plugin.ts (D7): token gate, body limits, rate
 * windows and ingestion through hooks-adapter. Everything stateful or shared with the feed (the
 * ring, the SSE send, the clock, the log, the general-event session map) is injected, so this
 * file imports nothing from feed-plugin.ts.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import type { AgentEvent } from "../shared/events.ts";
import { hookToEvents } from "./hooks-adapter.ts";

// POST /__office/hook: body cap, and events accepted per second per session and overall. A
// window is one second; what exceeds it is dropped (still answered 204), not queued.
// needs_attention is the one event that must not be lost to a burst of others, so it has its own
// small budget (per session and overall) that the other events neither spend nor wait for.
export const HOOK_MAX_BODY_BYTES = 64 * 1024;
export const HOOK_SESSION_PER_SEC = 20;
export const HOOK_TOTAL_PER_SEC = 100;
export const HOOK_ATTENTION_PER_SEC = 5;
export const HOOK_ATTENTION_TOTAL_PER_SEC = 20;
// A body that has not finished by then is dropped, so a stalled one cannot hold the socket.
export const HOOK_BODY_TIMEOUT_MS = 5000;
export const HOOK_WINDOW_MS = 1000;
const HOOK_MAX_SESSIONS = 1000;
const HOOK_LOG_MS = 5000;

type HookReq = Pick<IncomingMessage, "method" | "headers"> & {
  on?: (event: string, cb: (arg: Buffer) => void) => unknown;
  destroy?: () => unknown;
};
type HookRes = Pick<ServerResponse, "end" | "statusCode" | "setHeader">;

export type HookWindow = { start: number; count: number };

export type HookRouteDeps = {
  /** Undefined disables the route (404). */
  token: string | undefined;
  ring: {
    has(sessionId: string, agentId: string): boolean;
    wasReturned(sessionId: string, agentId: string): boolean;
    add(event: AgentEvent): void;
  };
  send: (frame: unknown) => void;
  now: () => number;
  log: (line: string) => void;
  /** Makes an untrusted value safe to log. */
  loggable: (value: unknown) => string;
  /** Per-session windows of the general budget; the caller keeps it to read its size. */
  sessions: Map<string, HookWindow>;
};

export function createHookRoute(deps: HookRouteDeps) {
  const { ring, send, now, sessions: hookSessions, loggable } = deps;
  const hookTokenDigest =
    deps.token === undefined ? null : createHash("sha256").update(deps.token).digest();
  const hookLogged = new Map<string, number>();
  let hookTotal = { start: Number.NEGATIVE_INFINITY, count: 0 };
  const hookAttentionSessions = new Map<string, HookWindow>();
  let hookAttentionTotal = { start: Number.NEGATIVE_INFINITY, count: 0 };

  /** One line per reason per HOOK_LOG_MS, so a flood of bad requests cannot flood the log. */
  function hookLog(reason: string, detail = ""): void {
    const at = now();
    if (at - (hookLogged.get(reason) ?? Number.NEGATIVE_INFINITY) < HOOK_LOG_MS) return;
    hookLogged.set(reason, at);
    deps.log(`hook ${reason}${detail}`);
  }

  function tokenOk(header: string | string[] | undefined): boolean {
    if (hookTokenDigest === null || typeof header !== "string") return false;
    return timingSafeEqual(createHash("sha256").update(header).digest(), hookTokenDigest);
  }

  /**
   * True when the event fits both the session's and the overall window of its own budget:
   * needs_attention counts only against the attention one.
   */
  function hookAdmit(sessionId: string, attention: boolean): boolean {
    const at = now();
    const sessions = attention ? hookAttentionSessions : hookSessions;
    const sessionCap = attention ? HOOK_ATTENTION_PER_SEC : HOOK_SESSION_PER_SEC;
    const totalCap = attention ? HOOK_ATTENTION_TOTAL_PER_SEC : HOOK_TOTAL_PER_SEC;
    let total = attention ? hookAttentionTotal : hookTotal;
    if (at - total.start >= HOOK_WINDOW_MS) total = { start: at, count: 0 };
    if (attention) hookAttentionTotal = total;
    else hookTotal = total;
    let w = sessions.get(sessionId);
    if (w === undefined || at - w.start >= HOOK_WINDOW_MS) {
      if (w === undefined && sessions.size >= HOOK_MAX_SESSIONS) {
        sessions.delete(sessions.keys().next().value as string);
      }
      w = { start: at, count: 0 };
      sessions.set(sessionId, w);
    }
    if (w.count >= sessionCap || total.count >= totalCap) return false;
    w.count++;
    total.count++;
    return true;
  }

  function ingestHook(payload: unknown): void {
    for (const event of hookToEvents(payload, { now: now() })) {
      // The tailer announces the same subagent from its transcript, with its real parent; a hook
      // start for a known agent would overwrite that, and a stop for an unknown one would make a
      // ghost entry. Both are dropped; the hook only fills in what the tailer has not seen yet.
      // A child already handed back is finished: a late hook must not revive it either (start or
      // attention), even after the ring evicted it.
      const known = event.agentId !== null && ring.has(event.sessionId, event.agentId);
      const returned = event.agentId !== null && ring.wasReturned(event.sessionId, event.agentId);
      if (event.kind === "agent_started" && (known || returned)) continue;
      if (event.kind === "done" && (!known || returned)) continue;
      if (event.kind === "needs_attention" && returned) continue;
      if (!hookAdmit(event.sessionId, event.kind === "needs_attention")) {
        hookLog("rate limited");
        continue;
      }
      ring.add(event);
      send({ type: "event", event });
    }
  }

  function handleHook(req: HookReq, res: HookRes): void {
    const empty = (code: number) => {
      res.statusCode = code;
      res.end();
    };
    if (hookTokenDigest === null) {
      res.statusCode = 404;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end("not found\n");
    } else if (req.method !== "POST") {
      empty(405);
    } else if (!tokenOk(req.headers["x-office-token"])) {
      hookLog("refused (401)");
      empty(401);
    } else if (!/^application\/json\s*(;|$)/i.test(String(req.headers["content-type"] ?? ""))) {
      hookLog("refused (415)", ` content-type=${loggable(req.headers["content-type"])}`);
      empty(415);
    } else if (Number(req.headers["content-length"]) > HOOK_MAX_BODY_BYTES) {
      hookLog("refused (413)");
      empty(413);
      req.destroy?.();
    } else {
      readHookBody(req, empty);
    }
  }

  function readHookBody(req: HookReq, empty: (code: number) => void): void {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    const stalled = setTimeout(() => {
      over = true;
      chunks.length = 0;
      hookLog("refused (408)");
      empty(408);
      req.destroy?.();
    }, HOOK_BODY_TIMEOUT_MS);
    stalled.unref();
    req.on?.("data", (chunk) => {
      if (over) return;
      size += chunk.length;
      if (size > HOOK_MAX_BODY_BYTES) {
        over = true;
        clearTimeout(stalled);
        chunks.length = 0;
        hookLog("refused (413)");
        empty(413);
        req.destroy?.();
        return;
      }
      chunks.push(chunk);
    });
    req.on?.("end", () => {
      clearTimeout(stalled);
      if (over) return;
      let payload: unknown;
      let parsed = false;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        parsed = true;
      } catch {
        hookLog("ignored an unparseable payload");
      }
      if (parsed) {
        try {
          ingestHook(payload);
        } catch (e) {
          hookLog(`handling failed: ${loggable(e instanceof Error ? e.name : typeof e)}`);
        }
      }
      empty(204);
    });
    req.on?.("close", () => clearTimeout(stalled));
    req.on?.("error", () => {
      clearTimeout(stalled);
      if (!over) hookLog("request failed");
    });
  }

  return { handle: handleHook };
}
