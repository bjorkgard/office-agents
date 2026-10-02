import { describe, expect, it, vi } from "vite-plus/test";
import type { AgentEvent } from "../../shared/events";
import {
  createFeedClient,
  REOPEN_DELAYS_MS,
  STABLE_OPEN_MS,
  type EventSourceLike,
  type FeedDeps,
  type FeedState,
} from "./feed-client";
import { agentKey, TUNING } from "./machine";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const T0 = 1_700_000_000_000;

class FakeSource implements EventSourceLike {
  readyState = 0;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  send(frame: unknown) {
    this.onmessage?.({ data: typeof frame === "string" ? frame : JSON.stringify(frame) });
  }
  /** Browser auto-retry in progress. */
  drop() {
    this.readyState = 0;
    this.onerror?.();
  }
  /** Non-2xx: the browser gives up. */
  refuse() {
    this.readyState = 2;
    this.onerror?.();
  }
}

type Probe = { resolve(status: number): void; reject(): void };

function harness(overrides: Partial<FeedDeps> = {}) {
  let now = T0;
  const sources: FakeSource[] = [];
  const probes: Probe[] = [];
  const timers: { id: number; at: number; ms: number; fn: () => void }[] = [];
  let nextId = 1;
  const warn = vi.fn();
  const states: FeedState[] = [];
  const deps: FeedDeps = {
    createSource: (url) => {
      const s = new FakeSource(url);
      sources.push(s);
      return s;
    },
    fetch: () =>
      new Promise((resolve, reject) => {
        probes.push({
          resolve: (status) => resolve({ status }),
          reject: () => reject(new Error("net")),
        });
      }),
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.push({ id, at: now + ms, ms, fn });
      return id;
    },
    clearTimeout: (id) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    now: () => now,
    warn,
    ...overrides,
  };
  const client = createFeedClient(deps, (s) => states.push(s));
  /** Advances the clock, firing due timers in order. */
  function advance(ms: number) {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift();
      now = Math.max(now, next.at);
      next.fn();
    }
    now = end;
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return {
    client,
    sources,
    probes,
    timers,
    warn,
    states,
    advance,
    flush,
    last: () => sources[sources.length - 1],
    /** The pending reopen timer (not the 1 s tick or the 10 s stable-open timer). */
    reopen: () => timers.find((t) => REOPEN_DELAYS_MS.includes(t.ms)),
    state: () => client.getState(),
    setNow: (n: number) => {
      now = n;
    },
  };
}

const base = { sessionId: "s1", projectId: "p1" } as const;
const started = (
  ts: number,
  over: Partial<{ sessionId: string; agentId: string | null; parent: string | null }> = {},
): AgentEvent => ({
  ...base,
  sessionId: over.sessionId ?? "s1",
  agentId: over.agentId ?? null,
  kind: "agent_started",
  ts,
  projectPath: "/work/p1",
  parentAgentId: over.parent ?? null,
});
const working = (
  ts: number,
  agentId: string | null = null,
  tool?: { phase: "start" | "end"; id: string; isSubagent: boolean },
): AgentEvent => ({
  ...base,
  agentId,
  kind: "working",
  ts,
  ...(tool ? { tool } : {}),
});
const done = (ts: number, endsWithQuestion: boolean): AgentEvent => ({
  ...base,
  agentId: null,
  kind: "done",
  ts,
  endsWithQuestion,
});
const snapshot = (events: AgentEvent[], seats: Record<string, number> = {}) => ({
  type: "snapshot",
  events,
  seats,
});

function live(h: ReturnType<typeof harness>, events: AgentEvent[] = [], seats = {}) {
  h.client.start();
  h.last().open();
  h.last().send(snapshot(events, seats));
}

describe("connection classification (D15)", () => {
  it("starts connecting, goes live on open, no-sessions on an empty snapshot", () => {
    const h = harness();
    expect(h.state().connection).toBe("connecting");
    h.client.start();
    expect(h.last().url).toBe("/__office/events");
    h.last().open();
    expect(h.state().connection).toBe("live");
    h.last().send(snapshot([]));
    expect(h.state().connection).toBe("no-sessions");
    h.last().send({ type: "event", event: started(T0) });
    expect(h.state().connection).toBe("live");
  });

  it("drop: reconnecting keeps the last scene; recovery replaces it from the new snapshot", () => {
    const h = harness();
    live(h, [started(T0 - 1000), working(T0 - 900)]);
    const before = Object.keys(h.state().office.agents);
    expect(before).toHaveLength(1);
    h.last().drop();
    expect(h.state().connection).toBe("reconnecting");
    expect(Object.keys(h.state().office.agents)).toEqual(before);
    expect(h.probes).toHaveLength(0);
    h.last().open();
    expect(h.state().connection).toBe("live");
    h.last().send(snapshot([]));
    expect(h.state().connection).toBe("no-sessions");
    expect(h.sources).toHaveLength(1);
  });

  it("403 shows refused, then the timer reopens the stream", async () => {
    const h = harness();
    h.client.start();
    h.last().refuse();
    expect(h.probes).toHaveLength(1);
    h.probes[0].resolve(403);
    await h.flush();
    expect(h.state().connection).toBe("refused");
    h.advance(REOPEN_DELAYS_MS[0] - 1);
    expect(h.sources).toHaveLength(1);
    h.advance(1);
    expect(h.sources).toHaveLength(2);
    h.last().open();
    expect(h.state().connection).toBe("live");
  });

  it("probe URL is /__office/status", async () => {
    const urls: string[] = [];
    const h = harness({
      fetch: (url) => {
        urls.push(url);
        return Promise.resolve({ status: 503 });
      },
    });
    h.client.start();
    h.last().refuse();
    await h.flush();
    expect(urls).toEqual(["/__office/status"]);
  });

  it("503, a built page (404) and a network failure all show feed unavailable", async () => {
    for (const settle of [
      (p: Probe) => p.resolve(503),
      (p: Probe) => p.resolve(404),
      (p: Probe) => p.reject(),
    ]) {
      const h = harness();
      h.client.start();
      h.last().refuse();
      settle(h.probes[0]);
      await h.flush();
      expect(h.state().connection).toBe("unavailable");
    }
  });

  it("reopen delays back off 2, 4, 8, 16 then hold at 30 s", async () => {
    expect(REOPEN_DELAYS_MS).toEqual([2000, 4000, 8000, 16000, 30000]);
    const h = harness();
    h.client.start();
    const seen: number[] = [];
    for (let i = 0; i < 7; i++) {
      const count = h.sources.length;
      h.last().refuse();
      h.probes[i].resolve(503);
      await h.flush();
      const delay = h.reopen()!.ms;
      seen.push(delay);
      h.advance(delay);
      expect(h.sources).toHaveLength(count + 1);
    }
    expect(seen).toEqual([2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });

  it("the counter resets after a stream stays open 10 s", async () => {
    const h = harness();
    h.client.start();
    h.last().refuse();
    h.probes[0].resolve(503);
    await h.flush();
    h.advance(2000);
    h.last().open();
    h.advance(STABLE_OPEN_MS);
    h.last().refuse();
    h.probes[1].resolve(503);
    await h.flush();
    expect(h.reopen()!.ms).toBe(2000);
  });

  it("the counter does not reset when the stream drops before 10 s", async () => {
    const h = harness();
    h.client.start();
    h.last().refuse();
    h.probes[0].resolve(503);
    await h.flush();
    h.advance(2000);
    h.last().open();
    h.advance(STABLE_OPEN_MS - 1);
    h.last().refuse();
    h.probes[1].resolve(503);
    await h.flush();
    expect(h.reopen()!.ms).toBe(4000);
  });

  it("stale probe, order A: reopen succeeds, then the old 403 arrives and is ignored", async () => {
    const h = harness();
    h.client.start();
    h.last().refuse();
    h.advance(REOPEN_DELAYS_MS[0]);
    h.last().open();
    expect(h.state().connection).toBe("live");
    h.probes[0].resolve(403);
    await h.flush();
    expect(h.state().connection).toBe("live");
  });

  it("stale probe, order B: the probe lands first, the reopen then wins", async () => {
    const h = harness();
    h.client.start();
    h.last().refuse();
    h.probes[0].resolve(403);
    await h.flush();
    expect(h.state().connection).toBe("refused");
    h.advance(REOPEN_DELAYS_MS[0]);
    h.last().open();
    await h.flush();
    expect(h.state().connection).toBe("live");
  });

  it("an old probe does not overwrite a newer attempt's verdict", async () => {
    const h = harness();
    h.client.start();
    h.last().refuse();
    h.advance(REOPEN_DELAYS_MS[0]);
    h.last().refuse();
    h.probes[1].resolve(503);
    await h.flush();
    expect(h.state().connection).toBe("unavailable");
    h.probes[0].resolve(403);
    await h.flush();
    expect(h.state().connection).toBe("unavailable");
  });
});

describe("frame validation (D16)", () => {
  it("skips bad JSON, unknown frames and invalid events, counting each and warning once per kind", () => {
    const h = harness();
    live(h, [started(T0 - 1000)]);
    const agents = h.state().office;
    h.last().send("{not json");
    h.last().send("{also bad");
    h.last().send({ type: "mystery" });
    h.last().send("[1]");
    h.last().send({ type: "event", event: { kind: "working", sessionId: 5 } });
    h.last().send({ type: "event", event: null });
    h.last().send({
      type: "snapshot",
      events: [{ nope: 1 }, started(T0 - 500, { sessionId: "s9" })],
      seats: {},
    });
    const s = h.state();
    expect(s.skipped).toEqual({ json: 2, frame: 2, event: 3 });
    expect(h.warn).toHaveBeenCalledTimes(3);
    expect(s.failure).toBeNull();
    expect(Object.keys(s.office.agents)).toEqual([agentKey("s9", null)]);
    expect(agents).not.toBe(s.office);
  });

  it("keeps the state when a snapshot has no events array", () => {
    const h = harness();
    live(h, [started(T0 - 1000)]);
    const before = h.state().office;
    h.last().send({ type: "snapshot", events: "x", seats: {} });
    expect(h.state().office).toBe(before);
    expect(h.state().skipped.frame).toBe(1);
  });

  it("a machine throw is recorded, stops the stream and is not swallowed", () => {
    const h = harness({
      apply: () => {
        throw new TypeError("boom");
      },
    });
    live(h);
    h.last().send({ type: "event", event: started(T0) });
    expect(h.state().failure).toBeInstanceOf(TypeError);
    expect(h.state().connection).toBe("unavailable");
    expect(h.last().closed).toBe(true);
    expect(h.timers).toHaveLength(0);
  });
});

describe("snapshot replay (D12)", () => {
  it("keeps a 1 h old question", () => {
    const h = harness();
    live(h, [started(T0 - HOUR), working(T0 - HOUR + 10), done(T0 - HOUR + 20, true)]);
    const a = h.state().office.agents[agentKey("s1", null)];
    expect(a.state).toBe("attention");
    expect(a.episode?.waitingSince).toBe(T0 - HOUR + 20);
  });

  it("drops a 1 h old tool call", () => {
    const h = harness();
    live(h, [
      started(T0 - HOUR),
      working(T0 - HOUR + 10, null, { phase: "start", id: "t1", isSubagent: false }),
    ]);
    expect(h.state().office.agents).toEqual({});
    expect(h.state().connection).toBe("no-sessions");
  });

  it("removes leaving agents outright, with no walk-out", () => {
    const h = harness();
    live(h, [started(T0 - 5 * HOUR), done(T0 - 5 * HOUR + 1, true)]);
    expect(h.state().office.agents).toEqual({});
  });

  it("a 1 h old working agent keeps its project, parent link and arrivedAt", () => {
    const h = harness();
    live(h, [
      started(T0 - HOUR, { agentId: "p" }),
      started(T0 - HOUR + 5, { agentId: "c", parent: "p" }),
      working(T0 - 40 * MIN, "p"),
      working(T0 - 40 * MIN + 1, "c"),
      working(T0 - 20 * MIN, "p"),
      working(T0 - 20 * MIN + 1, "c"),
      working(T0 - MIN, "p"),
      working(T0 - MIN + 1, "c"),
    ]);
    const c = h.state().office.agents[agentKey("s1", "c")];
    expect(c.projectId).toBe("p1");
    expect(c.parentAgentId).toBe("p");
    expect(c.arrivedAt).toBe(T0 - HOUR + 5);
    expect(h.state().office.agents[agentKey("s1", "p")].arrivedAt).toBe(T0 - HOUR);
    expect(h.state().projects).toEqual({ p1: "/work/p1" });
  });

  it("deltas apply at the live clock", () => {
    const h = harness();
    live(h);
    h.last().send({ type: "event", event: started(T0 + 99 * HOUR) });
    expect(h.state().office.agents[agentKey("s1", null)].arrivedAt).toBe(T0);
  });
});

describe("gone frames remove the agent (P1)", () => {
  const top = agentKey("s1", null);
  const child = agentKey("s1", "c");

  it("top-level gone removes the agent and the seat", () => {
    const h = harness();
    live(h, [started(T0 - 1000), working(T0 - 900)], { s1: 0 });
    h.last().send({ type: "gone", sessionId: "s1", agentId: null });
    expect(h.state().office.agents[top]).toBeUndefined();
    expect(h.state().seats).toEqual({});
  });

  it("subagent gone removes only that subagent", () => {
    const h = harness();
    live(h, [started(T0 - 1000), started(T0 - 900, { agentId: "c", parent: null })], { s1: 0 });
    h.last().send({ type: "gone", sessionId: "s1", agentId: "c" });
    expect(h.state().office.agents[child]).toBeUndefined();
    expect(h.state().office.agents[top]).toBeDefined();
    expect(h.state().seats).toEqual({ s1: 0 });
  });

  it("an unknown key is a no-op", () => {
    const h = harness();
    live(h, [started(T0 - 1000)], { s1: 0 });
    const before = h.state().office;
    h.last().send({ type: "gone", sessionId: "s1", agentId: "zzz" });
    h.last().send({ type: "gone", sessionId: "other", agentId: null });
    expect(h.state().office).toBe(before);
    expect(h.state().seats).toEqual({ s1: 0 });
  });

  it("a malformed gone is still skipped", () => {
    const h = harness();
    live(h);
    h.last().send({ type: "gone", agentId: null });
    expect(h.state().skipped.frame).toBe(1);
  });

  it("a reset then replay does not resurrect old state", () => {
    const h = harness();
    live(
      h,
      [started(T0 - 1000), working(T0 - 900, null, { phase: "start", id: "t", isSubagent: false })],
      {
        s1: 0,
      },
    );
    h.setNow(T0 + 20 * 1000);
    h.advance(0);
    h.last().send({ type: "gone", sessionId: "s1", agentId: null });
    h.last().send({ type: "event", event: started(T0 + 20 * 1000 - 500) });
    const a = h.state().office.agents[top];
    expect(a.openTools).toEqual({});
    expect(a.arrivedAt).toBe(T0 + 20 * 1000 - 500);
  });
});

describe("seats (S1-1)", () => {
  it("snapshot replaces, seat sets, top-level gone deletes, subagent gone keeps", () => {
    const h = harness();
    live(h, [started(T0 - 1000)], { s1: 0, s2: 1 });
    expect(h.state().seats).toEqual({ s1: 0, s2: 1 });
    h.last().send({ type: "seat", sessionId: "s3", desk: 5 });
    expect(h.state().seats).toEqual({ s1: 0, s2: 1, s3: 5 });
    h.last().send({ type: "gone", sessionId: "s2", agentId: "child" });
    expect(h.state().seats.s2).toBe(1);
    h.last().send({ type: "gone", sessionId: "s2", agentId: null });
    expect(h.state().seats).toEqual({ s1: 0, s3: 5 });
    h.last().send(snapshot([], { s7: 2 }));
    expect(h.state().seats).toEqual({ s7: 2 });
  });

  it("a missing seat does not crash: the agent is present with no seat", () => {
    const h = harness();
    live(h, [started(T0 - 1000)], {});
    expect(h.state().seats).toEqual({});
    expect(Object.keys(h.state().office.agents)).toHaveLength(1);
    expect(h.state().failure).toBeNull();
  });

  it("a session id named like an Object.prototype member does not collide", () => {
    const h = harness();
    live(h, [], {});
    expect(h.state().seats.constructor).toBeUndefined();
    h.last().send({ type: "seat", sessionId: "s1", desk: 1 });
    expect(h.state().seats.constructor).toBeUndefined();
    h.last().send({ type: "seat", sessionId: "constructor", desk: 4 });
    expect(h.state().seats.constructor).toBe(4);
    h.last().send({ type: "gone", sessionId: "constructor", agentId: null });
    expect(h.state().seats.constructor).toBeUndefined();
    h.last().send(snapshot([], { s7: 2 }));
    expect(h.state().seats.constructor).toBeUndefined();
  });

  it("ignores an absurdly large desk number and counts the frame", () => {
    const h = harness();
    live(h);
    h.last().send({ type: "seat", sessionId: "s3", desk: 1e9 });
    expect(h.state().seats).toEqual({});
    expect(h.state().skipped.frame).toBe(1);
  });

  it("a project id named like an Object.prototype member does not collide", () => {
    const h = harness();
    live(h, [], {});
    expect(h.state().projects.constructor).toBeUndefined();
    h.last().send({ type: "event", event: started(T0) });
    expect(h.state().projects.constructor).toBeUndefined();
    h.last().send({
      type: "event",
      event: { ...started(T0), projectId: "constructor", projectPath: "/work/ctor" },
    });
    expect(h.state().projects.constructor).toBe("/work/ctor");
    h.last().send(snapshot([], {}));
    expect(h.state().projects.constructor).toBeUndefined();
  });

  it("accepts desk 255 and rejects desk 256", () => {
    const h = harness();
    live(h);
    h.last().send({ type: "seat", sessionId: "s3", desk: 255 });
    expect(h.state().seats.s3).toBe(255);
    h.last().send({ type: "seat", sessionId: "s4", desk: 256 });
    expect(h.state().seats.s4).toBeUndefined();
    expect(h.state().skipped.frame).toBe(1);
  });

  it("a snapshot keeps only the valid seats", () => {
    const h = harness();
    live(h, [], { a: 1e9, b: 2 });
    expect(h.state().seats).toEqual({ b: 2 });
  });

  it("ignores a malformed desk number and counts the frame", () => {
    const h = harness();
    live(h);
    h.last().send({ type: "seat", sessionId: "s3", desk: -1 });
    h.last().send({ type: "seat", sessionId: "s3", desk: "x" });
    expect(h.state().seats).toEqual({});
    expect(h.state().skipped.frame).toBe(2);
  });
});

describe("tick and cleanup", () => {
  it("ticks every second and finishes the arrival", () => {
    const h = harness();
    live(h, []);
    h.last().send({ type: "event", event: started(T0) });
    expect(h.state().office.agents[agentKey("s1", null)].state).toBe("arriving");
    h.advance(TUNING.arrivingMs + 1000);
    expect(h.state().office.agents[agentKey("s1", null)].state).toBe("working");
  });

  it("a tick that changes nothing does not notify", () => {
    const h = harness();
    live(h, []);
    const n = h.states.length;
    h.advance(5000);
    expect(h.states.length).toBe(n);
  });

  it("stop closes the stream, clears every timer and ignores a late probe", async () => {
    const h = harness();
    h.client.start();
    h.last().refuse();
    h.client.stop();
    expect(h.timers).toHaveLength(0);
    const n = h.states.length;
    h.probes[0].resolve(403);
    await h.flush();
    expect(h.states.length).toBe(n);
    expect(h.sources[0].closed).toBe(true);
  });

  it("remount (StrictMode): the first client leaves nothing open, the second works alone", () => {
    const h = harness();
    h.client.start();
    h.client.stop();
    expect(h.sources[0].closed).toBe(true);
    expect(h.timers).toHaveLength(0);
    h.sources[0].open();
    h.sources[0].send(snapshot([started(T0)]));
    expect(h.state().connection).toBe("connecting");
    h.client.start();
    h.last().open();
    expect(h.state().connection).toBe("live");
    expect(h.sources.filter((s) => !s.closed)).toHaveLength(1);
  });
});
