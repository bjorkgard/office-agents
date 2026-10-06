import { describe, expect, it, vi } from "vite-plus/test";
import type { AgentEvent } from "../shared/events.ts";
import { HOOK_SESSION_PER_SEC, createHookRoute } from "./hook-route.ts";
import type { HookWindow } from "./hook-route.ts";

function setup(token: string | undefined) {
  const added: AgentEvent[] = [];
  const sent: unknown[] = [];
  const logs: string[] = [];
  const sessions = new Map<string, HookWindow>();
  const clock = { t: 0 };
  const route = createHookRoute({
    token,
    ring: { has: () => false, wasReturned: () => false, add: (e) => added.push(e) },
    send: (f) => sent.push(f),
    now: () => clock.t,
    log: (l) => logs.push(l),
    loggable: String,
    sessions,
  });
  return { route, added, sent, logs, sessions, clock };
}

function call(
  route: ReturnType<typeof createHookRoute>,
  opts: { method?: string; token?: string; body?: string } = {},
) {
  const handlers: Record<string, (arg: Buffer) => void> = {};
  const req = {
    method: opts.method ?? "POST",
    headers: { "x-office-token": opts.token ?? "tok", "content-type": "application/json" },
    on: (ev: string, cb: (arg: Buffer) => void) => {
      handlers[ev] = cb;
    },
    destroy: vi.fn(),
  };
  const res = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
  route.handle(req as never, res as never);
  if (opts.body !== undefined) {
    handlers.data?.(Buffer.from(opts.body));
    handlers.end?.(Buffer.alloc(0));
  }
  return res;
}

const start = (id: string) =>
  JSON.stringify({ hook_event_name: "SubagentStart", session_id: "s1", agent_id: id, cwd: "/p" });

describe("createHookRoute", () => {
  it("404s when no token is configured, 405s non-POST, 401s a bad token", () => {
    expect(call(setup(undefined).route).statusCode).toBe(404);
    expect(call(setup("tok").route, { method: "GET" }).statusCode).toBe(405);
    expect(call(setup("tok").route, { token: "nope" }).statusCode).toBe(401);
  });

  it("ingests a subagent start into the ring and the feed, answering 204", () => {
    const { route, added, sent } = setup("tok");
    const res = call(route, { body: start("a1") });
    expect(res.statusCode).toBe(204);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ kind: "agent_started", sessionId: "s1", agentId: "a1" });
    expect(sent).toEqual([{ type: "event", event: added[0] }]);
  });

  it("drops events past the per-session budget on the injected clock and map", () => {
    const { route, added, sessions, clock } = setup("tok");
    for (let i = 0; i < HOOK_SESSION_PER_SEC + 5; i++) call(route, { body: start(`a${i}`) });
    expect(added).toHaveLength(HOOK_SESSION_PER_SEC);
    expect(sessions.get("s1")?.count).toBe(HOOK_SESSION_PER_SEC);
    clock.t += 1000;
    call(route, { body: start("later") });
    expect(added).toHaveLength(HOOK_SESSION_PER_SEC + 1);
  });
});
