import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { request } from "node:http";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createLogger, createServer } from "vite-plus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  HOOK_BODY_TIMEOUT_MS,
  HOOK_WINDOW_MS,
  HOOK_MAX_BODY_BYTES,
  HOOK_SESSION_PER_SEC,
  HOOK_TOTAL_PER_SEC,
  createFeed,
  officeFeed,
} from "./feed-plugin.ts";
import { HOOK_FILE } from "./hook-discovery.ts";

const TOKEN = "t".repeat(64);
const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "office-hook-route-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

type PostOpts = {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  host?: string;
  remote?: string;
  token?: string | null;
  json?: boolean;
};

const fakeRes = () => {
  const written: string[] = [];
  const res = Object.assign(new EventEmitter(), {
    statusCode: 0,
    headers: {} as Record<string, unknown>,
    written,
    ended: false,
    done: null as unknown as Promise<void>,
    resolveDone: () => {},
    destroy() {},
    writeHead(code: number, h?: Record<string, unknown>) {
      res.statusCode = code;
      Object.assign(res.headers, h);
      return res;
    },
    setHeader(k: string, v: unknown) {
      res.headers[k] = v;
    },
    write(s: string): boolean {
      written.push(s);
      return true;
    },
    end(s?: string) {
      if (s) written.push(s);
      res.ended = true;
      res.resolveDone();
    },
  });
  res.done = new Promise<void>((r) => (res.resolveDone = r));
  return res;
};

type Feed = ReturnType<typeof createFeed>;

async function post(feed: Feed, o: PostOpts = {}) {
  const headers: Record<string, string> = {
    host: o.host ?? "127.0.0.1:5173",
    ...(o.json === false ? {} : { "content-type": "application/json" }),
    ...(o.token === null ? {} : { "x-office-token": o.token ?? TOKEN }),
    ...o.headers,
  };
  const req = Object.assign(new EventEmitter(), {
    url: "/__office/hook",
    method: o.method ?? "POST",
    headers,
    socket: { remoteAddress: o.remote ?? "127.0.0.1" },
    destroyed: false,
    destroy() {
      req.destroyed = true;
    },
  });
  const res = fakeRes();
  feed.handle(req as never, res as never, () => {
    throw new Error("next() called");
  });
  setImmediate(() => {
    if (req.destroyed) return;
    if (o.body !== undefined) req.emit("data", Buffer.from(o.body));
    req.emit("end");
  });
  await Promise.race([res.done, new Promise((r) => setTimeout(r, 500))]);
  return { status: res.statusCode, body: res.written.join(""), res };
}

const hook = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    hook_event_name: "SubagentStart",
    session_id: "s1",
    agent_id: "a1",
    cwd: "/w/p",
    transcript_path: "/h/.claude/projects/-w-p/s1.jsonl",
    ...over,
  });

function listen(feed: Feed) {
  const res = fakeRes();
  feed.handle(
    {
      url: "/__office/events",
      method: "GET",
      headers: { host: "127.0.0.1:5173" },
      socket: { remoteAddress: "127.0.0.1" },
      on: () => {},
    } as never,
    res as never,
    () => {},
  );
  const frames = () =>
    res.written
      .join("")
      .split("\n\n")
      .filter((f) => f.startsWith("data: "))
      .map((f) => JSON.parse(f.slice(6)));
  return { res, frames };
}

const newFeed = (extra: Partial<Parameters<typeof createFeed>[0]> = {}) => {
  const logs: string[] = [];
  const feed = createFeed({
    root,
    log: (l) => logs.push(l),
    hookToken: TOKEN,
    ...extra,
  });
  return { feed, logs };
};

describe("POST /__office/hook", () => {
  it("accepts a good payload with an empty 204 and broadcasts one event", async () => {
    const { feed } = newFeed();
    const { frames } = listen(feed);
    const r = await post(feed, { body: hook() });
    expect(r.status).toBe(204);
    expect(r.body).toBe("");
    const events = frames().filter((f) => f.type === "event");
    expect(events).toHaveLength(1);
    expect(events[0].event).toMatchObject({ kind: "agent_started", agentId: "a1" });
    expect(frames()[0].type).toBe("snapshot");
  });

  it("puts the event in the ring so a late client sees it", async () => {
    const { feed } = newFeed();
    await post(feed, { body: hook() });
    const late = listen(feed);
    expect(late.frames()[0].events).toHaveLength(1);
  });

  it("is off (404) when the feed has no token", async () => {
    const { feed } = newFeed({ hookToken: undefined });
    expect((await post(feed, { body: hook() })).status).toBe(404);
  });

  describe("token", () => {
    it.each([
      ["missing", null],
      ["wrong", "x".repeat(64)],
      ["a prefix of the right one", TOKEN.slice(0, 10)],
      ["empty", ""],
    ])("%s -> 401, nothing reaches the ring or clients", async (_n, token) => {
      const { feed, logs } = newFeed();
      const { frames } = listen(feed);
      const r = await post(feed, { body: hook(), token });
      expect(r.status).toBe(401);
      expect(frames().filter((f) => f.type === "event")).toEqual([]);
      expect(logs.join("\n")).not.toContain(TOKEN);
    });

    it("an array-valued token header is refused", async () => {
      const { feed } = newFeed();
      const req = { headers: { "x-office-token": [TOKEN, TOKEN] } };
      const r = await post(feed, { body: hook(), headers: req.headers as never });
      expect(r.status).toBe(401);
    });
  });

  it.each(["GET", "PUT", "DELETE", "PATCH"])("%s -> 405", async (method) => {
    const { feed } = newFeed();
    expect((await post(feed, { method, body: hook() })).status).toBe(405);
  });

  it.each([
    ["text/plain", "text/plain"],
    ["form", "application/x-www-form-urlencoded"],
    ["missing", null],
  ])("content type %s -> 415", async (_n, type) => {
    const { feed } = newFeed();
    const r = await post(feed, {
      body: hook(),
      json: false,
      ...(type ? { headers: { "content-type": type } } : {}),
    });
    expect(r.status).toBe(415);
  });

  it("accepts application/json with a charset", async () => {
    const { feed } = newFeed();
    const r = await post(feed, {
      body: hook(),
      headers: { "content-type": "Application/JSON; charset=utf-8" },
    });
    expect(r.status).toBe(204);
  });

  it("an oversize body -> 413 and the request is destroyed", async () => {
    const { feed } = newFeed();
    const { frames } = listen(feed);
    const big = hook({ pad: "x".repeat(HOOK_MAX_BODY_BYTES) });
    const r = await post(feed, { body: big });
    expect(r.status).toBe(413);
    expect(frames().filter((f) => f.type === "event")).toEqual([]);
  });

  describe("stalled body", () => {
    afterEach(() => {
      vi.useRealTimers();
    });
    const stalledReq = () => {
      const req = Object.assign(new EventEmitter(), {
        url: "/__office/hook",
        method: "POST",
        headers: {
          host: "127.0.0.1:5173",
          "content-type": "application/json",
          "x-office-token": TOKEN,
        },
        socket: { remoteAddress: "127.0.0.1" },
        destroyed: false,
        destroy() {
          req.destroyed = true;
        },
      });
      return req;
    };

    it("answers 408 and destroys the request after the timeout, emitting nothing", () => {
      vi.useFakeTimers();
      const { feed } = newFeed();
      const { frames } = listen(feed);
      const req = stalledReq();
      const res = fakeRes();
      feed.handle(req as never, res as never, () => {});
      req.emit("data", Buffer.from('{"hook_event_name":'));
      vi.advanceTimersByTime(HOOK_BODY_TIMEOUT_MS - 1);
      expect(res.ended).toBe(false);
      vi.advanceTimersByTime(1);
      expect(res.statusCode).toBe(408);
      expect(res.ended).toBe(true);
      expect(req.destroyed).toBe(true);
      req.emit("end"); // a late end changes nothing
      expect(frames().filter((f) => f.type === "event")).toEqual([]);
    });

    it("a body that finishes in time is not answered 408 afterwards", () => {
      vi.useFakeTimers();
      const { feed } = newFeed();
      const req = stalledReq();
      const res = fakeRes();
      feed.handle(req as never, res as never, () => {});
      req.emit("data", Buffer.from(hook()));
      req.emit("end");
      expect(res.statusCode).toBe(204);
      vi.advanceTimersByTime(HOOK_BODY_TIMEOUT_MS * 2);
      expect(res.statusCode).toBe(204);
      expect(req.destroyed).toBe(false);
    });
  });

  it("an oversize content-length is refused before the body is read", async () => {
    const { feed } = newFeed();
    const r = await post(feed, {
      body: hook(),
      headers: { "content-length": String(HOOK_MAX_BODY_BYTES + 1) },
    });
    expect(r.status).toBe(413);
  });

  it("a body of exactly the cap is read", async () => {
    const { feed } = newFeed();
    const probe = hook({ pad: "" });
    const pad = "x".repeat(HOOK_MAX_BODY_BYTES - Buffer.byteLength(probe));
    const body = hook({ pad });
    expect(Buffer.byteLength(body)).toBe(HOOK_MAX_BODY_BYTES);
    expect((await post(feed, { body })).status).toBe(204);
  });

  it.each([
    ["foreign origin", { origin: "http://evil.example" }, undefined, undefined],
    ["forwarded", { "x-forwarded-for": "1.2.3.4" }, undefined, undefined],
    ["cross-site fetch", { "sec-fetch-site": "cross-site" }, undefined, undefined],
    ["foreign host", {}, "evil.example", undefined],
    ["non-loopback peer", {}, undefined, "192.168.1.9"],
  ])("%s -> 403 even with the right token", async (_n, headers, host, remote) => {
    const { feed, logs } = newFeed();
    const { frames } = listen(feed);
    const r = await post(feed, { body: hook(), headers, host, remote });
    expect(r.status).toBe(403);
    expect(frames().filter((f) => f.type === "event")).toEqual([]);
    expect(logs.some((l) => l.includes("refused"))).toBe(true);
  });

  it("answers 204 and emits nothing for malformed, unknown and ignorable payloads", async () => {
    const { feed } = newFeed();
    const { frames } = listen(feed);
    for (const body of [
      "{not json",
      "",
      "null",
      "[]",
      "3",
      JSON.stringify({ hook_event_name: "Stop", session_id: "s1" }),
      JSON.stringify({ hook_event_name: "Notification", session_id: "s1", notification_type: "x" }),
      hook({ session_id: 7 }),
    ]) {
      const r = await post(feed, { body });
      expect(r.status).toBe(204);
      expect(r.body).toBe("");
    }
    expect(frames().filter((f) => f.type === "event")).toEqual([]);
  });

  it("a bad payload costs one request: the next good one still works", async () => {
    const { feed } = newFeed();
    await post(feed, { body: "{{{" });
    expect((await post(feed, { body: hook() })).status).toBe(204);
  });

  it("never echoes the payload or the token", async () => {
    const { feed } = newFeed();
    const canary = "ECHO-CANARY";
    for (const [token, body] of [
      [TOKEN, hook({ message: canary })],
      ["bad", hook({ message: canary })],
    ] as const) {
      const r = await post(feed, { body, token });
      expect(r.body).not.toContain(canary);
      expect(r.body).not.toContain(TOKEN);
    }
  });

  describe("rate limit", () => {
    it("drops events past the per-session cap and keeps the other sessions' ones", async () => {
      let t = 1_000_000;
      const { feed } = newFeed({ now: () => t });
      const { frames } = listen(feed);
      for (let i = 0; i < HOOK_SESSION_PER_SEC + 10; i++) {
        const r = await post(feed, {
          body: hook({ hook_event_name: "PermissionRequest", tool_use_id: `tu${i}` }),
        });
        expect(r.status).toBe(204);
      }
      const count = () => frames().filter((f) => f.type === "event").length;
      expect(count()).toBe(HOOK_SESSION_PER_SEC);
      await post(feed, { body: hook({ session_id: "other", transcript_path: undefined }) });
      expect(count()).toBe(HOOK_SESSION_PER_SEC + 1);
      t += 1001;
      await post(feed, { body: hook({ hook_event_name: "PermissionRequest", tool_use_id: "z" }) });
      expect(count()).toBe(HOOK_SESSION_PER_SEC + 2);
    });

    it("bounds the per-session windows it remembers", async () => {
      let t = 1_000_000;
      const { feed } = newFeed({ now: () => t });
      for (let i = 0; i < 1200; i++) {
        t += HOOK_WINDOW_MS + 1; // each post starts a fresh overall window
        await post(feed, { body: hook({ session_id: `s${i}`, transcript_path: undefined }) });
      }
      expect(feed.hookSessionCount()).toBe(1000);
    });

    it("drops events past the global cap even across many sessions", async () => {
      const { feed } = newFeed({ now: () => 5_000_000 });
      const { frames } = listen(feed);
      for (let i = 0; i < HOOK_TOTAL_PER_SEC + 20; i++) {
        await post(feed, { body: hook({ session_id: `s${i}`, transcript_path: undefined }) });
      }
      expect(frames().filter((f) => f.type === "event")).toHaveLength(HOOK_TOTAL_PER_SEC);
    });
  });

  describe("privacy", () => {
    it("lets no content field reach a frame, the ring or a log", async () => {
      const canary = "LEAK-CANARY-7c1e";
      const { feed, logs } = newFeed();
      const live = listen(feed);
      for (const name of ["PermissionRequest", "Notification", "SubagentStart", "SubagentStop"]) {
        await post(feed, {
          body: hook({
            hook_event_name: name,
            notification_type: "permission_prompt",
            message: canary,
            prompt: canary,
            tool_input: { command: canary },
            last_assistant_message: canary,
            agent_type: canary,
            session_title: canary,
          }),
        });
      }
      await post(feed, { body: hook({ message: canary }), token: "wrong" });
      await post(feed, { body: `{"message":"${canary}"`, headers: { origin: "http://x.test" } });
      const late = listen(feed);
      const all = JSON.stringify([live.res.written, late.res.written, logs]);
      expect(live.frames().filter((f) => f.type === "event").length).toBeGreaterThan(0);
      expect(all).not.toContain(canary);
    });

    it("sanitizes what a refusal logs", async () => {
      const { feed, logs } = newFeed();
      await post(feed, { body: hook(), host: "evil\r\n[office] forged" });
      expect(logs.length).toBeGreaterThan(0);
      // oxlint-disable-next-line no-control-regex
      expect(logs.join("")).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    });
  });

  describe("idempotence with the transcript tailer", () => {
    const putSub = () => {
      const session = JSON.parse(
        readFileSync(join(fixtures, "sub-live.jsonl"), "utf8").split("\n")[0],
      ).sessionId as string;
      const agent = "923dda2d85e13872";
      const dir = join(root, "p1", session, "subagents");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `agent-${agent}.jsonl`),
        readFileSync(join(fixtures, "sub-live.jsonl"), "utf8"),
      );
      return { session, agent };
    };
    const starts = (
      frames: Array<{ type: string; event?: { kind: string; agentId: string } }>,
      a: string,
    ) =>
      frames.filter(
        (f) => f.type === "event" && f.event?.kind === "agent_started" && f.event.agentId === a,
      );

    it("drops a hook agent_started for an agent the tailer already announced", async () => {
      const { session, agent } = putSub();
      const { feed } = newFeed();
      await feed.scanOnce();
      const { frames } = listen(feed);
      const before = frames()[0].events.filter(
        (e: { kind: string; agentId: string }) => e.kind === "agent_started" && e.agentId === agent,
      );
      expect(before).toHaveLength(1);
      const r = await post(feed, {
        body: hook({ session_id: session, agent_id: agent, transcript_path: undefined }),
      });
      expect(r.status).toBe(204);
      expect(starts(frames(), agent)).toEqual([]);
      const after = listen(feed)
        .frames()[0]
        .events.filter(
          (e: { kind: string; agentId: string }) =>
            e.kind === "agent_started" && e.agentId === agent,
        );
      expect(after).toEqual(before); // the tailer's event, with its real parent, survives
    });

    it("keeps one agent_started when the hook arrives first and the tailer follows", async () => {
      const { session, agent } = putSub();
      const { feed } = newFeed();
      await post(feed, { body: hook({ session_id: session, agent_id: agent }) });
      await feed.scanOnce();
      const snap = listen(feed).frames()[0].events as Array<{ kind: string; agentId: string }>;
      expect(snap.filter((e) => e.kind === "agent_started" && e.agentId === agent)).toHaveLength(1);
    });

    it("drops a repeated SubagentStart", async () => {
      const { feed } = newFeed();
      const { frames } = listen(feed);
      await post(feed, { body: hook() });
      await post(feed, { body: hook() });
      expect(starts(frames(), "a1")).toHaveLength(1);
    });

    it("drops a SubagentStop for an agent nobody announced", async () => {
      const { feed } = newFeed();
      const { frames } = listen(feed);
      await post(feed, { body: hook({ hook_event_name: "SubagentStop", agent_id: "ghost" }) });
      expect(frames().filter((f) => f.type === "event")).toEqual([]);
      expect(listen(feed).frames()[0].events).toEqual([]);
    });

    describe("a child that was already handed back", () => {
      const T = Date.now() - 1_000_000;
      // A parent that ran 205 sync subagents: the ring keeps only the newest 200 backs.
      const putParent = (children: number) => {
        const iso = (n: number) => new Date(T + n * 1000).toISOString();
        const line = (o: object) => JSON.stringify({ sessionId: "ps", cwd: "/w/p", ...o });
        const lines: string[] = [];
        for (let i = 0; i < children; i++) {
          lines.push(
            line({
              type: "assistant",
              timestamp: iso(i * 2),
              message: {
                role: "assistant",
                stop_reason: "tool_use",
                content: [
                  {
                    type: "tool_use",
                    id: `tu${i}`,
                    name: "Agent",
                    input: { run_in_background: false },
                  },
                ],
              },
            }),
            line({
              type: "user",
              timestamp: iso(i * 2 + 1),
              message: { role: "user", content: [{ type: "tool_result", tool_use_id: `tu${i}` }] },
              toolUseResult: { status: "completed", agentId: `kid-${i}` },
            }),
          );
        }
        mkdirSync(join(root, "p1"), { recursive: true });
        writeFileSync(join(root, "p1", "ps.jsonl"), lines.join("\n") + "\n");
      };
      const hookFor = (name: string, agent: string) =>
        hook({
          hook_event_name: name,
          session_id: "ps",
          agent_id: agent,
          transcript_path: undefined,
        });
      const agentEvents = (
        frames: Array<{ type: string; event?: { agentId: string | null } }>,
        a: string,
      ) => frames.filter((f) => f.type === "event" && f.event?.agentId === a);

      it("drops a late SubagentStop for a child the ring still holds but its parent handed back", async () => {
        putParent(3);
        const dir = join(root, "p1", "ps", "subagents");
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          join(dir, "agent-kid-2.jsonl"),
          JSON.stringify({
            type: "assistant",
            sessionId: "ps",
            agentId: "kid-2",
            cwd: "/w/p",
            timestamp: new Date(T + 1000).toISOString(),
            message: { role: "assistant", stop_reason: "tool_use", content: [] },
          }) + "\n",
        );
        const { feed } = newFeed();
        await feed.scanOnce();
        const snap = listen(feed).frames()[0].events as Array<{ agentId: string | null }>;
        expect(snap.some((e) => e.agentId === "kid-2")).toBe(true); // known to the ring
        const { frames } = listen(feed);
        await post(feed, { body: hookFor("SubagentStop", "kid-2") });
        await post(feed, { body: hookFor("SubagentStart", "kid-2") });
        expect(agentEvents(frames(), "kid-2")).toEqual([]);
      });

      it("205 children: a late hook start or stop for an evicted child is dropped", async () => {
        putParent(205);
        const { feed } = newFeed();
        await feed.scanOnce();
        const snap = () =>
          listen(feed).frames()[0].events as Array<{
            kind: string;
            toAgentId?: string;
            agentId: string | null;
          }>;
        const before = snap();
        expect(before.filter((e) => e.kind === "handoff")).toHaveLength(200);
        expect(before.some((e) => e.toAgentId === "kid-0")).toBe(false); // evicted
        const { frames } = listen(feed);
        for (const kid of ["kid-0", "kid-4", "kid-204"]) {
          await post(feed, { body: hookFor("SubagentStart", kid) });
          await post(feed, { body: hookFor("SubagentStop", kid) });
        }
        expect(frames().filter((f) => f.type === "event")).toEqual([]);
        expect(snap()).toEqual(before);
      });

      it("drops a hook needs_attention for a returned child, held or evicted", async () => {
        putParent(205);
        const { feed } = newFeed();
        await feed.scanOnce();
        const { frames } = listen(feed);
        for (const kid of ["kid-0", "kid-204"]) {
          const r = await post(feed, { body: hookFor("PermissionRequest", kid) });
          expect(r.status).toBe(204);
        }
        expect(frames().filter((f) => f.type === "event")).toEqual([]);
      });

      it("still passes a hook needs_attention for a child nobody handed back", async () => {
        putParent(3);
        const { feed } = newFeed();
        await feed.scanOnce();
        const { frames } = listen(feed);
        await post(feed, { body: hookFor("PermissionRequest", "fresh") });
        expect(agentEvents(frames(), "fresh")).toHaveLength(1);
      });

      it("still passes a hook start for a child nobody handed back", async () => {
        putParent(3);
        const { feed } = newFeed();
        await feed.scanOnce();
        const { frames } = listen(feed);
        await post(feed, { body: hookFor("SubagentStart", "fresh") });
        expect(agentEvents(frames(), "fresh")).toHaveLength(1);
      });
    });

    it("passes a SubagentStop for a known agent", async () => {
      const { feed } = newFeed();
      const { frames } = listen(feed);
      await post(feed, { body: hook() });
      await post(feed, { body: hook({ hook_event_name: "SubagentStop" }) });
      const kinds = frames()
        .filter((f) => f.type === "event")
        .map((f) => f.event.kind);
      expect(kinds).toEqual(["agent_started", "done"]);
    });
  });
});

describe("plugin discovery file", () => {
  const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
  const get = (port: number, path: string, headers: Record<string, string> = {}) =>
    new Promise<number>((resolve, reject) => {
      const r = request(
        { host: "127.0.0.1", port, path, method: "POST", headers },
        (res: IncomingMessage) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode ?? 0));
        },
      );
      r.on("error", reject);
      r.end("{}");
    });

  it("is written on listen with the live port and token, serves the route, and is removed on close", async () => {
    const dir = join(root, "hookdir");
    const server = await createServer({
      configFile: false,
      root: repo,
      logLevel: "silent",
      plugins: [react(), officeFeed({ root, log: () => {}, hookDir: dir })],
      server: { port: 0, host: "127.0.0.1", hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    let closed = false;
    try {
      await server.listen();
      const addr = server.httpServer?.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : 0;
      const file = join(dir, HOOK_FILE);
      const info = JSON.parse(readFileSync(file, "utf8"));
      expect(info).toMatchObject({ port, pid: process.pid });
      expect(info.token).toMatch(/^[0-9a-f]{64}$/);
      const json = { "content-type": "application/json" };
      expect(await get(port, "/__office/hook", json)).toBe(401);
      expect(await get(port, "/__office/hook", { ...json, "x-office-token": info.token })).toBe(
        204,
      );
      await server.close();
      closed = true;
      expect(existsSync(file)).toBe(false);
    } finally {
      if (!closed) await server.close();
    }
  }, 30_000);

  it("records the address the server is bound to as host", async () => {
    for (const [bind, want] of [
      ["::1", "::1"],
      ["127.0.0.1", "127.0.0.1"],
      ["0.0.0.0", "127.0.0.1"],
      ["::", "127.0.0.1"],
    ] as const) {
      const dir = join(root, `host-${bind.replaceAll(":", "_")}`);
      const server = await createServer({
        configFile: false,
        root: repo,
        logLevel: "silent",
        plugins: [react(), officeFeed({ root, log: () => {}, hookDir: dir })],
        server: { port: 0, host: bind, hmr: false, watch: null },
        optimizeDeps: { noDiscovery: true, include: [] },
      });
      try {
        try {
          await server.listen();
        } catch {
          continue; // this machine cannot bind that family
        }
        expect(JSON.parse(readFileSync(join(dir, HOOK_FILE), "utf8")).host).toBe(want);
      } finally {
        await server.close();
      }
    }
  }, 30_000);

  it("still listens, warns once and answers the route when the discovery file cannot be written", async () => {
    // A regular file where the directory should be: mkdir fails.
    const dir = join(root, "not-a-dir");
    writeFileSync(dir, "x");
    const logger = createLogger("warn", { allowClearScreen: false });
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const token = "k".repeat(64);
    const server = await createServer({
      configFile: false,
      root: repo,
      customLogger: logger,
      plugins: [react(), officeFeed({ root, log: () => {}, hookDir: dir, hookToken: token })],
      server: { port: 0, host: "127.0.0.1", hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    try {
      await server.listen();
      const addr = server.httpServer?.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : 0;
      expect(port).toBeGreaterThan(0);
      const written = warn.mock.calls.filter((c) =>
        String(c[0]).includes("hook discovery file not written"),
      );
      expect(written).toHaveLength(1);
      const json = { "content-type": "application/json", "x-office-token": token };
      expect(await get(port, "/__office/hook", json)).toBe(204);
    } finally {
      await server.close();
    }
    expect(readFileSync(dir, "utf8")).toBe("x");
  }, 30_000);

  it("removes the file from the process exit and SIGINT handlers it registers, and drops them on close", () => {
    const dir = join(root, "exitdir");
    const handlers = new Map<string, () => void>();
    const once = vi.spyOn(process, "once").mockImplementation(((e: string, h: () => void) => {
      handlers.set(e, h);
      return process;
    }) as never);
    const off = vi.spyOn(process, "off").mockImplementation((() => process) as never);
    const kill = vi.spyOn(process, "kill").mockImplementation((() => true) as never);
    try {
      let closeHandler = () => {};
      const plugin = officeFeed({ root, log: () => {}, hookDir: dir });
      (plugin.configureServer as (s: unknown) => void)({
        config: { mode: "development", logger: { warn: () => {} } },
        middlewares: { use() {} },
        httpServer: {
          listening: true,
          address: () => ({ port: 4321 }),
          on() {},
          once: (_e: string, h: () => void) => (closeHandler = h),
        },
      });
      const file = join(dir, HOOK_FILE);
      expect(existsSync(file)).toBe(true);
      expect([...handlers.keys()].sort()).toEqual(["SIGINT", "exit"]);
      handlers.get("exit")?.();
      expect(existsSync(file)).toBe(false);

      (plugin.configureServer as (s: unknown) => void)({
        config: { mode: "development", logger: { warn: () => {} } },
        middlewares: { use() {} },
        httpServer: {
          listening: true,
          address: () => ({ port: 4321 }),
          on() {},
          once: (_e: string, h: () => void) => (closeHandler = h),
        },
      });
      expect(existsSync(file)).toBe(true);
      handlers.get("SIGINT")?.();
      expect(existsSync(file)).toBe(false);
      expect(kill).toHaveBeenCalledWith(process.pid, "SIGINT");

      closeHandler();
      expect(off.mock.calls.map((c) => String(c[0])).sort((a, b) => (a < b ? -1 : 1))).toEqual([
        "SIGINT",
        "exit",
      ]);
    } finally {
      once.mockRestore();
      off.mockRestore();
      kill.mockRestore();
    }
  });

  it("does not write a file when the feed is disabled by a failing setup", () => {
    const dir = join(root, "none");
    const plugin = officeFeed({ root, log: () => {}, hookDir: dir });
    const server = {
      config: { mode: "development", logger: { warn: () => {} } },
      middlewares: {
        use() {
          throw new Error("no middleware");
        },
      },
      httpServer: null,
    };
    (plugin.configureServer as (s: unknown) => void)(server);
    expect(existsSync(join(dir, HOOK_FILE))).toBe(false);
  });
});

describe("discovery file on a signal", () => {
  const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
  // A real process running the plugin in a real Vite server, as `vp dev` does.
  const script = `
    import { createLogger, createServer } from "vite-plus";
    import { officeFeed } from ${JSON.stringify(join(repo, "server", "feed-plugin.ts"))};
    const server = await createServer({
      configFile: false,
      root: ${JSON.stringify(repo)},
      logLevel: "silent",
      plugins: [officeFeed({ root: ${JSON.stringify("/nonexistent-office-root")}, log: () => {}, hookDir: process.env.OFFICE_HOOK_DIR })],
      server: { port: 0, host: "127.0.0.1", hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    await server.listen();
    console.log("ready");
    setInterval(() => {}, 1000);
  `;

  // Every child is killed (whole process group) after each test, also when the test timed out.
  const spawned: number[] = [];
  afterEach(() => {
    for (const pid of spawned.splice(0)) {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
  });

  async function killedBy(signal: "SIGINT" | "SIGTERM") {
    const dir = join(root, "sigdir");
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
      cwd: repo,
      env: { ...process.env, OFFICE_HOOK_DIR: dir },
      stdio: ["ignore", "pipe", "ignore"],
      detached: true,
    });
    if (child.pid !== undefined) spawned.push(child.pid);
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", () => reject(new Error("child exited before ready")));
      child.stdout.on("data", (d: Buffer) => d.toString().includes("ready") && resolve());
    });
    const file = join(dir, HOOK_FILE);
    expect(existsSync(file)).toBe(true);
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((r) =>
      child.once("exit", (code, sig) => r({ code, signal: sig })),
    );
    child.kill(signal);
    const result = await exited;
    expect(existsSync(file)).toBe(false);
    return result;
  }

  it("SIGINT removes the file and the process still dies of the signal", async () => {
    const r = await killedBy("SIGINT");
    expect(r.signal).toBe("SIGINT");
  }, 60_000);

  it("SIGTERM removes the file and Vite ends the process with exit code 143", async () => {
    const r = await killedBy("SIGTERM");
    expect(r).toEqual({ code: 143, signal: null });
  }, 60_000);
});
