import { describe, expect, it } from "vite-plus/test";
import type { AgentEvent } from "../../shared/events";
import { ATTENTION_STALE_MS, STALE_MS } from "../../shared/tuning";
import {
  agentKey,
  applyEvent,
  applyEvents,
  createOffice,
  removeAgent,
  tick,
  TUNING,
  type Agent,
  type OfficeState,
} from "./machine";
import asyncFlow from "../../server/fixtures/async-flow.jsonl?raw";
import syncFlow from "../../server/fixtures/sync-flow.jsonl?raw";
import { createNormalizerState, normalize } from "../../server/normalize.ts";
import type { AgentState } from "./poses";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const S = "s1";
/** An event ts later than any test clock, so applyEvent stamps agents with `now`. */
const LIVE = Number.MAX_SAFE_INTEGER;
const base = { sessionId: S, projectId: "p1" } as const;

const started = (agentId: string | null = null): AgentEvent => ({
  ...base,
  kind: "agent_started",
  agentId,
  ts: LIVE,
  projectPath: "/p",
  parentAgentId: null,
});
const working = (
  agentId: string | null = null,
  tool?: { phase: "start" | "end"; id: string; isSubagent?: boolean },
): AgentEvent => ({
  ...base,
  kind: "working",
  agentId,
  ts: LIVE,
  ...(tool ? { tool: { isSubagent: false, ...tool } } : {}),
});
const done = (endsWithQuestion: boolean): AgentEvent => ({
  ...base,
  kind: "done",
  agentId: null,
  ts: LIVE,
  endsWithQuestion,
});
const waitingSubs = (): AgentEvent => ({
  ...base,
  kind: "waiting_on_subagents",
  agentId: null,
  ts: LIVE,
});
const handoff = (to: string, direction: "out" | "back"): AgentEvent => ({
  ...base,
  kind: "handoff",
  agentId: null,
  ts: LIVE,
  fromAgentId: null,
  toAgentId: to,
  direction,
});

const get = (s: OfficeState, id: string | null = null): Agent | undefined =>
  s.agents[agentKey(S, id)];
const stateOf = (s: OfficeState, id: string | null = null): AgentState | undefined =>
  get(s, id)?.state;

/** Starts a top-level agent and lets it finish arriving, at t = 0. */
function working0(): OfficeState {
  let s = applyEvent(createOffice(), started(), 0);
  s = applyEvent(s, working(), 0);
  return s;
}

describe("TUNING", () => {
  it("uses the shared liveness limits", () => {
    expect(TUNING.staleMs).toBe(STALE_MS);
    expect(TUNING.attentionStaleMs).toBe(ATTENTION_STALE_MS);
    expect(TUNING.episodeHoldMs).toBe(60 * 1000);
  });
});

describe("arrival, R1 and R2", () => {
  it("arrives, then works on the first working event", () => {
    let s = applyEvent(createOffice(), started(), 0);
    expect(stateOf(s)).toBe("arriving");
    s = applyEvent(s, working(), 100);
    expect(stateOf(s)).toBe("working");
  });

  it("finishes arriving by the arrival timer", () => {
    const s = tick(applyEvent(createOffice(), started(), 0), TUNING.arrivingMs);
    expect(stateOf(s)).toBe("working");
  });

  it("R1: a tool call without a result waves after the timer, and a result clears it", () => {
    let s = applyEvent(working0(), working(null, { phase: "start", id: "t1" }), 0);
    expect(stateOf(tick(s, TUNING.toolTimerMs - 1))).toBe("working");
    s = tick(s, TUNING.toolTimerMs);
    expect(stateOf(s)).toBe("attention");
    expect(get(s)?.attention?.trigger).toBe("tool");
    s = applyEvent(s, working(null, { phase: "end", id: "t1" }), TUNING.toolTimerMs + 1000);
    expect(stateOf(s)).toBe("working");
  });

  it("R1 ignores subagent tool calls", () => {
    const s = applyEvent(
      working0(),
      working(null, { phase: "start", id: "t1", isSubagent: true }),
      0,
    );
    expect(stateOf(tick(s, 5 * MIN))).toBe("working");
  });

  it("R2: done without a question idles, and an idle top-level agent leaves", () => {
    let s = applyEvent(working0(), done(false), 1000);
    expect(stateOf(s)).toBe("idle");
    expect(stateOf(tick(s, 1000 + TUNING.idleLeaveMs - 1))).toBe("idle");
    s = tick(s, 1000 + TUNING.idleLeaveMs);
    expect(stateOf(s)).toBe("leaving");
    expect(get(tick(s, 1000 + TUNING.idleLeaveMs + TUNING.leavingMs))).toBeUndefined();
  });

  it("R2: done with a question waves until the user replies", () => {
    let s = applyEvent(working0(), done(true), 1000);
    expect(stateOf(s)).toBe("attention");
    expect(get(s)?.attention?.trigger).toBe("question");
    s = applyEvent(s, working(), 2000);
    expect(stateOf(s)).toBe("working");
  });

  it("a subagent's done is its completion, never a question wave", () => {
    let s = applyEvent(working0(), started("a"), 0);
    s = applyEvent(s, { ...done(true), agentId: "a" }, 1000);
    expect(stateOf(s, "a")).toBe("leaving");
    expect(get(s, "a")!.attention).toBeNull();
  });
});

describe("subagents (D7)", () => {
  it("a background launch does not send the parent to coffee", () => {
    let s = applyEvent(working0(), handoff("a", "out"), 10);
    s = applyEvent(s, started("a"), 10);
    expect(stateOf(s)).toBe("working");
    expect(Object.keys(get(s)!.unresolved)).toEqual(["a"]);
  });

  it("a sync launch sends the parent to coffee until its result", () => {
    let s = applyEvent(
      working0(),
      working(null, { phase: "start", id: "t3", isSubagent: true }),
      10,
    );
    s = applyEvent(s, waitingSubs(), 10);
    s = applyEvent(s, started("a"), 10);
    expect(stateOf(s)).toBe("waiting-on-subagents");
    s = applyEvent(s, working(null, { phase: "end", id: "t3", isSubagent: true }), 20);
    s = applyEvent(s, handoff("a", "back"), 20);
    expect(stateOf(s)).toBe("working");
    expect(stateOf(s, "a")).toBe("leaving");
  });

  it("an out-handoff alone never sends the parent to coffee", () => {
    let s = applyEvent(working0(), handoff("a", "out"), 10);
    s = applyEvent(s, waitingSubs(), 10); // no open subagent tool to wait on
    s = applyEvent(s, handoff("b", "out"), 11);
    expect(stateOf(s)).toBe("working");
  });

  it("a background agent finishing does not end a sync wait on another", () => {
    let s = applyEvent(working0(), handoff("bg", "out"), 10);
    s = applyEvent(s, working(null, { phase: "start", id: "t3", isSubagent: true }), 11);
    s = applyEvent(s, waitingSubs(), 11);
    expect(stateOf(s)).toBe("waiting-on-subagents");
    s = applyEvent(s, handoff("bg", "back"), 20);
    expect(stateOf(s)).toBe("waiting-on-subagents");
    s = applyEvent(s, working(null, { phase: "end", id: "t3", isSubagent: true }), 30);
    expect(stateOf(s)).toBe("working");
  });
});

describe("returned children", () => {
  it("ignores a child's events that arrive after the parent's back and are not newer", () => {
    let s = applyEvent(createOffice(), { ...started(), ts: 1000 }, 5000);
    s = applyEvent(s, { ...handoff("kid", "back"), ts: 1000 }, 5000);
    for (const ts of [900, 1000]) {
      s = applyEvent(s, { ...started("kid"), ts }, 5000);
      s = applyEvent(s, { ...working("kid"), ts }, 5000);
    }
    expect(get(s, "kid")).toBeUndefined();
  });

  it("a back with a far-future ts does not block a later resumed child", () => {
    let s = applyEvent(createOffice(), { ...handoff("kid", "back"), ts: LIVE }, 5000);
    s = applyEvent(s, { ...working("kid"), ts: 7000 }, 8000);
    expect(get(s, "kid")).toBeDefined();
  });

  it("lets a resumed child (a newer event) back in", () => {
    let s = applyEvent(createOffice(), { ...handoff("kid", "back"), ts: 1000 }, 5000);
    s = applyEvent(s, { ...working("kid"), ts: 2000 }, 5000);
    expect(get(s, "kid")).toBeDefined();
  });
});

describe("hook-sourced subagent stop", () => {
  const stop = (id: string, ts = LIVE): AgentEvent => ({
    ...base,
    kind: "done",
    agentId: id,
    ts,
    endsWithQuestion: false,
  });
  const withKid = (): OfficeState => {
    let s = applyEvent(working0(), handoff("kid", "out"), 10);
    s = applyEvent(s, started("kid"), 10);
    return applyEvent(s, working("kid"), 11);
  };

  it("walks a live child out and resolves the parent's launch", () => {
    let s = applyEvent(withKid(), stop("kid"), 20);
    expect(get(s, "kid")!.phase).toBe("leaving");
    expect(get(s, "kid")!.leftAt).toBe(20);
    s = tick(s, 20 + TUNING.subagentLeavingMs);
    expect(get(s, "kid")).toBeUndefined();
    expect(get(s)!.unresolved).toEqual({});
  });

  it("ignores a stop for an unknown child (no ghost, no returned mark)", () => {
    const before = working0();
    const s = applyEvent(before, stop("nobody"), 20);
    expect(get(s, "nobody")).toBeUndefined();
    expect(s.returned).toEqual({});
  });

  it("late child activity after the stop does not resurrect it", () => {
    let s = applyEvent(withKid(), { ...stop("kid", 1000) }, 1000);
    s = applyEvent(s, { ...working("kid"), ts: 900 }, 1000);
    s = applyEvent(s, { ...started("kid"), ts: 1000 }, 1000);
    expect(get(s, "kid")!.phase).toBe("leaving");
    s = tick(s, 1000 + TUNING.subagentLeavingMs);
    expect(get(s, "kid")).toBeUndefined();
  });

  it("live and replay agree", () => {
    const events: AgentEvent[] = [
      { ...started(), ts: 100 },
      { ...handoff("kid", "out"), ts: 110 },
      { ...started("kid"), ts: 120 },
      { ...working("kid"), ts: 130 },
      stop("kid", 140),
      { ...working("kid"), ts: 135 },
    ];
    const t = 200;
    let live = createOffice();
    for (const e of events) live = applyEvent(live, e, Math.min(e.ts, t));
    const replay = tick(applyEvents(createOffice(), events, t, { replay: true }), t);
    expect(replay.returned).toEqual(live.returned);
    expect(get(replay, "kid")?.phase).toBe(get(live, "kid")?.phase);
  });

  it("a stop then the parent's back does not double count", () => {
    let s = applyEvent(withKid(), stop("kid"), 20);
    const left = get(s, "kid")!.leftAt;
    s = applyEvent(s, handoff("kid", "back"), 25);
    expect(get(s, "kid")!.leftAt).toBe(left);
    expect(Object.keys(s.returned)).toEqual([agentKey(S, "kid")]);
  });

  it("caps the returned map like a back does", () => {
    const events: AgentEvent[] = [];
    for (let i = 0; i < 2100; i++) events.push(started(`k${i}`), stop(`k${i}`));
    const s = applyEvents(createOffice(), events, 5000);
    expect(Object.keys(s.returned).length).toBeLessThanOrEqual(2000);
    expect(Object.keys(s.returned).length).toBeGreaterThan(0);
  });
});

describe("touch never rewinds liveness", () => {
  it("a delayed event older than attentionStaleMs keeps an exact attention agent", () => {
    const T = 10 * HOUR;
    let s = applyEvent(
      createOffice(),
      { ...base, kind: "needs_attention", agentId: null, ts: T, waitingSince: T, episodeId: "e1" },
      T,
    );
    s = applyEvent(s, { ...working(), ts: T - TUNING.attentionStaleMs }, T);
    expect(get(s)!.lastEventAt).toBe(T);
    s = tick(s, T + 1);
    expect(stateOf(s)).toBe("attention");
  });
});

// Value: protects=subagent walk-out lasts subagentLeavingMs not leavingMs; fails_when=pass() uses leavingMs for subagents (child vanishes mid-walk) or boundary is off by one; why_new=existing tests only check the long-run bound, not the exact boundary; seam=none
describe("walk-out duration by kind", () => {
  it("keeps a returned subagent walking past leavingMs and removes it at subagentLeavingMs", () => {
    let s = applyEvent(createOffice(), { ...started(), ts: 0 }, 0);
    s = applyEvent(s, { ...started("kid"), ts: 0 }, 0);
    s = applyEvent(s, { ...handoff("kid", "back"), ts: 10 }, 10);
    expect(get(s, "kid")!.phase).toBe("leaving");
    const at = (ms: number) => get(tick(s, 10 + ms), "kid");
    expect(at(TUNING.leavingMs)).toBeDefined();
    expect(at(TUNING.subagentLeavingMs - 1)).toBeDefined();
    expect(at(TUNING.subagentLeavingMs)).toBeUndefined();
  });
});

describe("episodes (D8)", () => {
  function waved(): OfficeState {
    return applyEvent(working0(), done(true), 1000);
  }

  it("re-entry within the hold keeps the episode id and waitingSince", () => {
    let s = waved();
    const first = { ...get(s)!.episode! };
    s = applyEvent(s, working(), 5000);
    expect(stateOf(s)).toBe("working");
    s = applyEvent(s, done(true), 5000 + TUNING.episodeHoldMs - 1);
    expect(get(s)!.episode!.id).toBe(first.id);
    expect(get(s)!.episode!.waitingSince).toBe(first.waitingSince);
  });

  it("re-entry after the hold starts a new episode", () => {
    let s = waved();
    const first = get(s)!.episode!.id;
    s = applyEvent(s, working(), 5000);
    s = applyEvent(s, done(true), 5000 + TUNING.episodeHoldMs);
    expect(get(s)!.episode!.id).not.toBe(first);
    expect(get(s)!.episode!.waitingSince).toBe(5000 + TUNING.episodeHoldMs);
  });

  it("a timer flap (R1 fires, result, next call times out) is one episode", () => {
    let s = applyEvent(working0(), working(null, { phase: "start", id: "t1" }), 0);
    s = tick(s, TUNING.toolTimerMs);
    const id = get(s)!.episode!.id;
    s = applyEvent(s, working(null, { phase: "end", id: "t1" }), 12_000);
    s = applyEvent(s, working(null, { phase: "start", id: "t2" }), 12_000);
    s = tick(s, 12_000 + TUNING.toolTimerMs);
    expect(stateOf(s)).toBe("attention");
    expect(get(s)!.episode!.id).toBe(id);
  });

  it("staying in attention never changes the episode", () => {
    let s = waved();
    const id = get(s)!.episode!.id;
    s = applyEvent(s, done(true), 3000);
    s = tick(s, HOUR);
    expect(get(s)!.episode!.id).toBe(id);
  });
});

describe("two-tier expiry (E2)", () => {
  it("a silent working agent leaves after staleMs", () => {
    const s = working0();
    expect(stateOf(tick(s, STALE_MS - 1))).toBe("working");
    expect(stateOf(tick(s, STALE_MS))).toBe("leaving");
  });

  it("a silent arriving agent leaves after staleMs", () => {
    const s = applyEvent(createOffice(), started(), 0);
    expect(stateOf(tick(s, STALE_MS))).toBe("leaving");
  });

  it("a silent attention agent outlasts staleMs and leaves after attentionStaleMs", () => {
    const s = applyEvent(working0(), done(true), 0);
    expect(stateOf(tick(s, STALE_MS))).toBe("attention");
    expect(stateOf(tick(s, ATTENTION_STALE_MS - 1))).toBe("attention");
    expect(stateOf(tick(s, ATTENTION_STALE_MS))).toBe("leaving");
  });

  it("a silent coffee agent leaves once its subagent is gone", () => {
    let s = applyEvent(
      working0(),
      working(null, { phase: "start", id: "t3", isSubagent: true }),
      0,
    );
    s = applyEvent(s, waitingSubs(), 0);
    expect(stateOf(s)).toBe("waiting-on-subagents");
    expect(stateOf(tick(s, STALE_MS - 1))).toBe("waiting-on-subagents");
    expect(stateOf(tick(s, STALE_MS))).toBe("leaving");
  });

  it("a sync wait holds while the child is talking, then expires", () => {
    let s = applyEvent(
      working0(),
      working(null, { phase: "start", id: "t3", isSubagent: true }),
      0,
    );
    s = applyEvent(s, waitingSubs(), 0);
    s = applyEvent(s, working("a"), STALE_MS - 1);
    expect(stateOf(tick(s, STALE_MS + 10))).toBe("waiting-on-subagents");
    expect(stateOf(tick(s, 3 * STALE_MS))).toBe("leaving");
  });

  it("a sync wait holds while the child waits in attention, until it expires", () => {
    let s = applyEvent(
      working0(),
      working(null, { phase: "start", id: "t3", isSubagent: true }),
      0,
    );
    s = applyEvent(s, waitingSubs(), 0);
    s = applyEvent(s, working("a", { phase: "start", id: "b1" }), MIN);
    s = tick(s, MIN + TUNING.toolTimerMs);
    expect(stateOf(s, "a")).toBe("attention");
    s = tick(s, MIN + STALE_MS);
    expect(stateOf(s)).toBe("waiting-on-subagents");
    expect(stateOf(s, "a")).toBe("attention");
    s = tick(s, MIN + ATTENTION_STALE_MS);
    expect(stateOf(s, "a")).toBe("leaving");
    expect(stateOf(s)).toBe("leaving");
  });

  it("no expiry while a launched subagent is alive and unresolved", () => {
    let s = applyEvent(working0(), handoff("a", "out"), 0);
    s = applyEvent(s, started("a"), 0);
    s = applyEvent(s, working("a"), STALE_MS - 1);
    s = tick(s, STALE_MS + 10);
    expect(stateOf(s)).toBe("working");
    expect(stateOf(s, "a")).toBe("working");
    // The subagent goes silent too: both leave in one call.
    s = tick(s, 2 * STALE_MS);
    expect(stateOf(s)).toBe("leaving");
    expect(stateOf(s, "a")).toBe("leaving");
  });

  it("any new event re-arrives an expired or removed agent", () => {
    let s = tick(working0(), STALE_MS);
    expect(stateOf(s)).toBe("leaving");
    s = applyEvent(s, started(), STALE_MS + 1000);
    expect(stateOf(s)).toBe("arriving");
    expect(get(s)?.arrivedAt).toBe(STALE_MS + 1000);
    s = tick(s, 3 * STALE_MS);
    s = tick(s, 3 * STALE_MS + TUNING.leavingMs);
    expect(get(s)).toBeUndefined();
    s = applyEvent(s, done(false), 4 * STALE_MS);
    expect(stateOf(s)).toBe("idle");
  });

  it("a leaving agent loses its episode, so re-arrival starts fresh", () => {
    let s = applyEvent(working0(), done(true), 0);
    const id = get(s)!.episode!.id;
    s = tick(s, ATTENTION_STALE_MS);
    s = applyEvent(s, done(true), ATTENTION_STALE_MS + 1000);
    expect(get(s)!.episode!.id).not.toBe(id);
  });
});

describe("tick is pure", () => {
  it("does not mutate its input", () => {
    const s = applyEvent(working0(), done(true), 0);
    const copy = structuredClone(s);
    tick(s, 10 * HOUR);
    applyEvent(s, working(), 10);
    expect(s).toEqual(copy);
  });
});

describe("tick identity", () => {
  it("returns the same object when nothing changed, a new one when something fired", () => {
    const s = applyEvent(working0(), working(null, { phase: "start", id: "t1" }), 0);
    expect(tick(s, 1000)).toBe(s);
    const fired = tick(s, TUNING.toolTimerMs);
    expect(fired).not.toBe(s);
    expect(tick(fired, TUNING.toolTimerMs)).toBe(fired);
  });

  it("returns the same object when an event is dropped as already returned", () => {
    let s = applyEvent(createOffice(), started("a"), 0);
    s = applyEvent(s, handoff("a", "back"), 10);
    const next = applyEvent(s, { ...working("a"), ts: 5 }, 20);
    expect(next).toBe(s);
  });
});

describe("R1 wait start and bulk replay (E1)", () => {
  it("a stuck tool replayed an hour later keeps about an hour of wait", () => {
    const t0 = 1_000_000;
    const events: AgentEvent[] = [
      { ...started(), ts: t0 },
      { ...working(null, { phase: "start", id: "t1" }), ts: t0 + 1000 },
      // Later activity keeps the agent alive; t1 stays stuck.
      { ...working(null, { phase: "start", id: "t2" }), ts: t0 + HOUR - 1000 },
    ];
    const now = t0 + HOUR;
    const s = tick(applyEvents(createOffice(), events, now, { replay: true }), now);
    expect(stateOf(s)).toBe("attention");
    expect(get(s)!.episode!.waitingSince).toBe(t0 + 1000 + TUNING.toolTimerMs);
    expect(now - get(s)!.episode!.waitingSince).toBeGreaterThan(HOUR - MIN);
  });

  it("live: a tool wait starts at the tool start plus the timer, not the detecting tick", () => {
    let s = applyEvent(working0(), working(null, { phase: "start", id: "t1" }), 100);
    s = tick(s, 100 + TUNING.toolTimerMs + 700);
    expect(get(s)!.episode!.waitingSince).toBe(100 + TUNING.toolTimerMs);
  });
});

// Seeded generator (mulberry32) so the sequences are the same on every run.
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STATES: readonly AgentState[] = [
  "arriving",
  "working",
  "waiting-on-subagents",
  "idle",
  "attention",
  "leaving",
];
const GAPS = [0, 500, 1000, 5000, 15_000, 59_000, 61_000, 2 * MIN, 10 * MIN, 40 * MIN, 5 * HOUR];

describe("random sequences (ADD-4a)", () => {
  it("holds invariants (a) to (c) over 1,000 seeded sequences of 50 events", () => {
    const rand = rng(20261002);
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
    const maxTimer = Math.max(...Object.values(TUNING));
    const ids = [null, "a", "b"] as const;
    const kids = ["a", "b"] as const;

    function randomEvent(): AgentEvent {
      const agentId = pick(ids);
      const common = { sessionId: S, projectId: "p1", ts: LIVE };
      switch (Math.floor(rand() * 8)) {
        case 0:
          return {
            ...common,
            kind: "agent_started",
            agentId,
            projectPath: "/p",
            parentAgentId: null,
          };
        case 1:
        case 2:
          return {
            ...common,
            kind: "working",
            agentId,
            tool: pick([
              undefined,
              { phase: "start", id: pick(["t1", "t2"]), isSubagent: false },
              { phase: "start", id: "t3", isSubagent: true },
              { phase: "end", id: pick(["t1", "t2", "t3"]), isSubagent: false },
            ]),
          };
        case 3:
          return { ...common, kind: "waiting_on_subagents", agentId };
        case 4:
          return { ...common, kind: "needs_attention", agentId, waitingSince: 0, episodeId: "x" };
        case 5:
          return {
            ...common,
            kind: "handoff",
            agentId: null,
            fromAgentId: pick(ids),
            toAgentId: pick(kids),
            direction: pick(["out", "back"]),
          };
        default:
          return { ...common, kind: "done", agentId, endsWithQuestion: rand() < 0.5 };
      }
    }

    for (let seq = 0; seq < 1000; seq++) {
      let s = createOffice();
      let now = 1_000_000;
      // Reference model for episodes: per agent life, the last id, waitingSince and exit time.
      const ref = new Map<
        string,
        { id: string | null; ws: number; exitedAt: number | null; exactId?: string }
      >();
      const allIds = new Set<string>();
      const log: AgentEvent[] = [];

      for (let i = 0; i < 50; i++) {
        now += pick(GAPS);
        const prev = s;
        const ev = randomEvent();
        log.push({ ...ev, ts: now });
        s = applyEvent(s, ev, now);

        for (const key of new Set([...Object.keys(prev.agents), ...Object.keys(s.agents)])) {
          const before = prev.agents[key];
          const cur = s.agents[key];
          if (!cur || cur.state === "leaving") {
            ref.delete(key);
            continue;
          }
          if (!before || before.state === "leaving")
            ref.set(key, { id: null, ws: 0, exitedAt: null });
          const r = ref.get(key)!;
          const wasAttention = before?.state === "attention";
          if (cur.state === "attention") {
            const ep = cur.episode!;
            expect(ep.exitedAt).toBeNull();
            expect(cur.attention).not.toBeNull();
            if (ep.exactId !== undefined && ep.exactId !== r.exactId) {
              // D35: a new exact id wins. Its implausible waitingSince (0) falls back to the
              // event's clock; an open heuristic episode is replaced in place, keeping its id.
              expect(cur.attention!.trigger).toBe("exact");
              expect(ep.waitingSince).toBe(now);
              if (wasAttention && before!.attention!.trigger !== "exact") {
                expect(ep.id).toBe(r.id);
              } else {
                expect(allIds.has(ep.id)).toBe(false);
              }
            } else if (!wasAttention) {
              // Entry (a): kept only inside the hold, else a never-seen id.
              const kept =
                r.id !== null && r.exitedAt !== null && now - r.exitedAt < TUNING.episodeHoldMs;
              if (kept) {
                expect(ep.id).toBe(r.id);
                expect(ep.waitingSince).toBe(r.ws);
              } else {
                expect(allIds.has(ep.id)).toBe(false);
                // A tool wait starts when its earliest overdue call crossed the timer (R1).
                const overdue = Object.values(cur.openTools)
                  .filter((t) => !t.isSubagent && now - t.startedAt >= TUNING.toolTimerMs)
                  .map((t) => t.startedAt + TUNING.toolTimerMs);
                expect(ep.waitingSince).toBe(
                  cur.attention!.trigger === "tool" ? Math.min(...overdue) : now,
                );
              }
            } else {
              expect(ep.id).toBe(r.id);
              expect(ep.waitingSince).toBe(r.ws);
            }
            allIds.add(ep.id);
            r.id = ep.id;
            r.ws = ep.waitingSince;
            r.exactId = ep.exactId;
            r.exitedAt = null;
          } else {
            expect(cur.attention).toBeNull();
            if (wasAttention) r.exitedAt = now;
          }
        }

        // (c) states stay within the six; coffee needs an open sync launch.
        for (const a of Object.values(s.agents)) {
          expect(STATES).toContain(a.state);
          if (a.state === "waiting-on-subagents") {
            expect(a.waitingOn.some((id) => id in a.openTools)).toBe(true);
          }
        }
      }

      // Bulk apply equals sequential: live (one now) and replay (each event's own ts).
      const lastNow = now;
      let seqLive = createOffice();
      let seqReplay = createOffice();
      for (const e of log) {
        seqLive = applyEvent(seqLive, e, lastNow);
        seqReplay = applyEvent(seqReplay, e, e.ts);
      }
      expect(applyEvents(createOffice(), log, lastNow)).toEqual(seqLive);
      expect(applyEvents(createOffice(), log, lastNow, { replay: true })).toEqual(seqReplay);

      // (b) after the last event plus the longest timer, only idle or leaving agents remain.
      s = tick(s, now + maxTimer);
      for (const a of Object.values(s.agents)) {
        expect(["idle", "leaving"]).toContain(a.state);
      }
      // ...and a further subagentLeavingMs clears every walker.
      s = tick(s, now + maxTimer + TUNING.subagentLeavingMs);
      expect(Object.values(s.agents).filter((a) => a.state !== "idle")).toEqual([]);
    }
  }, 30_000);
});

describe("sync flow through the machine (D7, end to end)", () => {
  const stateOfTop = (s: OfficeState) =>
    Object.values(s.agents).find((a) => a.agentId === null)?.state;
  /** Feeds each transcript line through normalize, then applyEvent; returns the parent state after each. */
  function walk(ls: string[]): (string | undefined)[] {
    const st = createNormalizerState({ projectId: "p1", subagent: false });
    let s = createOffice();
    let now = 1_000_000;
    return ls.map((l) => {
      for (const e of normalize(st, l)) s = applyEvent(s, e, (now += 1000));
      return stateOfTop(s);
    });
  }

  it("the parent waits on subagents during a sync run and works after the result", () => {
    // user, tool_use (sync), tool_result, end_turn
    const states = walk(syncFlow.split("\n").filter(Boolean));
    expect(states[1]).toBe("waiting-on-subagents");
    expect(states[2]).toBe("working"); // out + back in sequence leave no wait behind
  });

  it("a later async launch in the same turn does not send the parent to coffee", () => {
    const ls = syncFlow.split("\n").filter(Boolean);
    const asyncUse = JSON.stringify({
      ...JSON.parse(ls[1]!),
      message: {
        role: "assistant",
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "bg-1", name: "Agent", input: { run_in_background: true } },
        ],
      },
    });
    const asyncResult = JSON.stringify({
      ...JSON.parse(ls[2]!),
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "bg-1", content: "x" }],
      },
      toolUseResult: { status: "async_launched", agentId: "bgagent" },
    });
    const states = walk([ls[0]!, ls[1]!, ls[2]!, asyncUse, asyncResult]);
    expect(states[1]).toBe("waiting-on-subagents");
    expect(states[2]).toBe("working");
    expect(states[3]).toBe("working");
    expect(states[4]).toBe("working"); // the out-handoff alone is not a wait
  });
});

describe("snapshot replay (clock = min(event.ts, now))", () => {
  it("replaying an old snapshot at a later now ends agents expired, not arriving or attention", () => {
    const t0 = 1_000_000;
    const old = (e: AgentEvent): AgentEvent => ({ ...e, ts: t0 });
    const events = [
      old(started()),
      old(working(null, { phase: "start", id: "t1" })),
      old(done(true)),
      old(started("a")),
      old(working("a", { phase: "start", id: "t2" })),
    ];
    let s = createOffice();
    const later = t0 + ATTENTION_STALE_MS + 5 * MIN;
    for (const e of events) s = applyEvent(s, e, later);
    for (const a of Object.values(s.agents)) {
      expect(a.state).toBe("leaving");
    }
    expect(Object.values(s.agents).some((a) => a.state === "attention")).toBe(false);
    expect(get(s)?.lastEventAt ?? t0).toBe(t0);
  });

  it("stamps the older of the event ts and now", () => {
    const s = applyEvent(createOffice(), { ...started(), ts: 500 }, 1000);
    expect(get(s)!.lastEventAt).toBe(500);
    expect(get(s)!.arrivedAt).toBe(500);
  });
});

describe("handoff wait loop guard", () => {
  const out = (from: string, to: string): AgentEvent => ({
    ...base,
    kind: "handoff",
    agentId: null,
    ts: LIVE,
    fromAgentId: from,
    toAgentId: to,
    direction: "out",
  });

  it("ignores B->A when A already waits on B, and both expire", () => {
    let s = applyEvent(createOffice(), started("A"), 0);
    s = applyEvent(s, started("B"), 0);
    s = applyEvent(s, out("A", "B"), 1);
    s = applyEvent(s, out("B", "A"), 2);
    expect(Object.keys(get(s, "A")!.unresolved)).toEqual(["B"]);
    expect(get(s, "B")!.unresolved).toEqual({});
    s = tick(s, STALE_MS + 10);
    for (const id of ["A", "B"]) expect(["leaving", undefined]).toContain(stateOf(s, id));
  });
});

describe("needs_attention event", () => {
  it("creates an attention episode that a working event ends", () => {
    const attn: AgentEvent = {
      ...base,
      kind: "needs_attention",
      agentId: null,
      ts: LIVE,
      waitingSince: 0,
      episodeId: "x",
    };
    let s = applyEvent(working0(), attn, 10);
    expect(stateOf(s)).toBe("attention");
    expect(get(s)!.attention).toEqual({ trigger: "exact" });
    expect(get(s)!.episode).not.toBeNull();
    s = applyEvent(s, working(), 20);
    expect(stateOf(s)).toBe("working");
    expect(get(s)!.attention).toBeNull();
  });
});

describe("exact needs_attention (hooks adapter)", () => {
  const exact = (episodeId: string, waitingSince: number, agentId: string | null = null) =>
    ({
      ...base,
      kind: "needs_attention",
      agentId,
      ts: LIVE,
      waitingSince,
      episodeId,
    }) as AgentEvent;

  it("enters attention at once with the event's waitingSince", () => {
    const s = applyEvent(working0(), exact("e1", 500), 10_000);
    expect(stateOf(s)).toBe("attention");
    expect(get(s)!.episode!.waitingSince).toBe(500);
  });

  it("a repeated event with the same episodeId keeps the episode and since-time", () => {
    let s = applyEvent(working0(), exact("e1", 500), 10_000);
    const first = structuredClone(get(s)!.episode);
    const seq = s.episodeSeq;
    s = applyEvent(s, exact("e1", 9_000), 20_000);
    expect(get(s)!.episode).toEqual(first);
    expect(s.episodeSeq).toBe(seq);
    expect(get(s)!.lastEventAt).toBe(10_000);
  });

  it("the same episodeId after the agent left attention does not re-enter", () => {
    let s = applyEvent(working0(), exact("e1", 500), 10_000);
    s = applyEvent(s, working(null, { phase: "start", id: "t1" }), 11_000);
    expect(stateOf(s)).toBe("working");
    s = applyEvent(s, exact("e1", 500), 12_000);
    expect(stateOf(s)).toBe("working");
  });

  it("a new episodeId after the agent left attention starts a new episode", () => {
    let s = applyEvent(working0(), exact("e1", 500), 10_000);
    s = applyEvent(s, working(), 11_000);
    s = applyEvent(s, exact("e2", 11_500), 12_000);
    expect(stateOf(s)).toBe("attention");
    expect(get(s)!.episode!.waitingSince).toBe(11_500);
  });

  it("a new episodeId while in an exact episode supersedes it", () => {
    let s = applyEvent(working0(), exact("e1", 500), 10_000);
    const id = get(s)!.episode!.id;
    s = applyEvent(s, exact("e2", 7_000), 12_000);
    expect(stateOf(s)).toBe("attention");
    expect(get(s)!.episode!.id).not.toBe(id);
    expect(get(s)!.episode!.waitingSince).toBe(7_000);
  });

  describe("fallback (Notification-derived) events", () => {
    const fallback = (episodeId: string, waitingSince: number, agentId: string | null = null) =>
      ({ ...exact(episodeId, waitingSince, agentId), fallback: true }) as AgentEvent;

    it("is ignored while an exact episode is open: one episode, one wave", () => {
      let s = applyEvent(working0(), exact("e1", 500), 10_000);
      const first = structuredClone(get(s)!.episode);
      const seq = s.episodeSeq;
      s = applyEvent(s, fallback("n1", 12_500), 22_000);
      expect(get(s)!.episode).toEqual(first);
      expect(get(s)!.episode!.waitingSince).toBe(500);
      expect(s.episodeSeq).toBe(seq);
      expect(get(s)!.lastEventAt).toBe(10_000);
    });

    it("alone (sandbox prompt) opens an exact attention", () => {
      const s = applyEvent(working0(), fallback("n1", 500), 10_000);
      expect(stateOf(s)).toBe("attention");
      expect(get(s)!.attention!.trigger).toBe("exact");
      expect(get(s)!.episode!.waitingSince).toBe(500);
    });

    it("after the exact episode was cleared opens a new wave", () => {
      let s = applyEvent(working0(), exact("e1", 500), 10_000);
      s = applyEvent(s, working(), 11_000);
      expect(stateOf(s)).toBe("working");
      s = applyEvent(s, fallback("n1", 11_500), 12_000);
      expect(stateOf(s)).toBe("attention");
      expect(get(s)!.episode!.waitingSince).toBe(11_500);
    });

    it("upgrades a heuristic attention as a plain exact event does", () => {
      const heuristic = (): OfficeState => applyEvent(working0(), done(true), 10_000);
      const viaPlain = applyEvent(heuristic(), exact("n1", 500), 11_000);
      const viaFallback = applyEvent(heuristic(), fallback("n1", 500), 11_000);
      expect(get(viaFallback)).toEqual(get(viaPlain));
    });
  });

  it("each activity kind ends an exact episode", () => {
    const ends: [string, AgentEvent][] = [
      ["working", working()],
      ["tool start", working(null, { phase: "start", id: "t1" })],
      ["tool end", working(null, { phase: "end", id: "t1" })],
      ["done without question", done(false)],
      ["waiting_on_subagents", waitingSubs()],
    ];
    for (const [name, ev] of ends) {
      let s = applyEvent(
        working0(),
        working(null, { phase: "start", id: "sub", isSubagent: true }),
        5,
      );
      s = applyEvent(s, exact("e1", 500), 10_000);
      s = applyEvent(s, ev, 11_000);
      expect(get(s)!.attention, name).toBeNull();
    }
  });

  it("an agent that left in an exact episode comes back without attention on agent_started", () => {
    let s = applyEvent(working0(), exact("e1", 500), 10_000);
    s = tick(s, 10_000 + TUNING.attentionStaleMs);
    s = tick(s, 10_000 + TUNING.attentionStaleMs + TUNING.leavingMs);
    expect(get(s)).toBeUndefined();
    s = applyEvent(s, started(), 10_000 + ATTENTION_STALE_MS + 10_000);
    expect(get(s)!.attention).toBeNull();
    expect(stateOf(s)).not.toBe("attention");
  });

  it("R1 firing on an open exact episode changes neither id nor since-time", () => {
    let s = applyEvent(working0(), working(null, { phase: "start", id: "t1" }), 1_000);
    s = applyEvent(s, exact("e1", 500), 2_000);
    const ep = structuredClone(get(s)!.episode);
    const seq = s.episodeSeq;
    s = tick(s, 1_000 + TUNING.toolTimerMs + 5_000);
    expect(get(s)!.episode).toEqual(ep);
    expect(s.episodeSeq).toBe(seq);
    expect(get(s)!.attention).toEqual({ trigger: "exact" });
  });

  it("R2 on an open exact episode changes neither id nor since-time", () => {
    let s = applyEvent(working0(), exact("e1", 500), 10_000);
    const ep = structuredClone(get(s)!.episode);
    s = applyEvent(s, done(true), 12_000);
    expect(get(s)!.episode).toEqual(ep);
    expect(get(s)!.attention).toEqual({ trigger: "exact" });
  });

  it("an exact event while a heuristic episode is open replaces it with the exact since-time", () => {
    let s = applyEvent(working0(), done(true), 10_000);
    const ep = structuredClone(get(s)!.episode);
    s = applyEvent(s, exact("e1", 9_000), 11_000);
    expect(get(s)!.episode!.id).toBe(ep!.id);
    expect(get(s)!.episode!.waitingSince).toBe(9_000);
    expect(get(s)!.episode!.exactId).toBe("e1");
    expect(get(s)!.attention).toEqual({ trigger: "exact" });
    // and a repeat of it is now a no-op
    const again = applyEvent(s, exact("e1", 9_500), 12_000);
    expect(get(again)!.episode).toEqual(get(s)!.episode);
  });

  it("an exact event within the hold of a just-ended heuristic episode takes the exact since-time", () => {
    let s = applyEvent(working0(), done(true), 10_000);
    s = applyEvent(s, working(), 11_000);
    s = applyEvent(s, exact("e1", 11_500), 12_000);
    expect(get(s)!.episode!.waitingSince).toBe(11_500);
    expect(get(s)!.episode!.exactId).toBe("e1");
    expect(get(s)!.attention).toEqual({ trigger: "exact" });
  });

  it("an episodeId like __proto__ is plain data", () => {
    let s = applyEvent(working0(), exact("__proto__", 500), 10_000);
    s = applyEvent(s, exact("__proto__", 600), 11_000);
    expect(get(s)!.episode!.waitingSince).toBe(500);
  });

  it("replay gives the same state as the live path, capped at now", () => {
    const evs: AgentEvent[] = [
      { ...started(), ts: 1_000 },
      { ...exact("e1", 1_500), ts: 2_000 },
      { ...exact("e1", 1_500), ts: 2_500 },
      { ...exact("e2", 99_999_999), ts: 3_000 },
    ];
    const now = 50_000;
    const replayed = applyEvents(createOffice(), evs, now, { replay: true });
    let live = createOffice();
    for (const e of evs) live = applyEvent(live, e, e.ts);
    live = tick(live, now);
    const r = tick(replayed, now);
    expect(get(r)!.episode).toEqual(get(live)!.episode);
    expect(get(r)!.attention).toEqual({ trigger: "exact" });
    expect(get(r)!.episode!.waitingSince).toBe(3_000); // future since capped to the clock
    expect(get(r)!.lastEventAt).toBe(3_000);
  });

  describe("live equals replay (D35)", () => {
    const at = (e: AgentEvent, ts: number): AgentEvent => ({ ...e, ts });
    /** Live: every event at its own ts, ticking every 250 ms in between, like the client. */
    function liveRun(evs: AgentEvent[], end: number): OfficeState {
      let s = createOffice();
      let t = 0;
      for (const e of evs) {
        for (; t + 250 <= e.ts; t += 250) s = tick(s, t + 250);
        s = applyEvent(s, e, e.ts);
      }
      for (; t + 250 <= end; t += 250) s = tick(s, t + 250);
      return tick(s, end);
    }
    const replayRun = (evs: AgentEvent[], end: number) =>
      tick(applyEvents(createOffice(), evs, end, { replay: true }), end);
    const sameEpisode = (evs: AgentEvent[], end: number) => {
      const l = get(liveRun(evs, end))!;
      const r = get(replayRun(evs, end))!;
      expect(r.state).toBe(l.state);
      expect(r.attention).toEqual(l.attention);
      expect(r.episode).toEqual(l.episode);
      return l;
    };

    it("a heuristic wait open when the exact event arrives: since is the exact one in both", () => {
      const l = sameEpisode(
        [
          at(started(), 0),
          at(working(), 0),
          at(working(null, { phase: "start", id: "t1" }), 1_000),
          at(exact("e1", 13_000), 13_000),
        ],
        20_000,
      );
      expect(l.episode!.waitingSince).toBe(13_000);
      expect(l.episode!.exactId).toBe("e1");
    });

    it("exact, activity, then a heuristic wait inside the D8 hold: same episode in both", () => {
      const l = sameEpisode(
        [
          at(started(), 0),
          at(working(), 0),
          at(exact("e1", 5_000), 5_000),
          at(working(null, { phase: "start", id: "t1" }), 6_000),
        ],
        30_000,
      );
      expect(l.attention).toEqual({ trigger: "tool" });
      expect(l.episode!.waitingSince).toBe(5_000);
    });

    it("heuristic, then exact, then done: idle in both", () => {
      const l = sameEpisode(
        [
          at(started(), 0),
          at(working(), 0),
          at(working(null, { phase: "start", id: "t1" }), 1_000),
          at(exact("e1", 13_000), 13_000),
          at(done(false), 14_000),
        ],
        15_000,
      );
      expect(l.state).toBe("idle");
    });
  });

  it("an exact episode keeps the agent out of the idle walk-out (like R2)", () => {
    let s = applyEvent(working0(), done(false), 1_000);
    s = applyEvent(s, exact("e1", 61_000), 61_000);
    s = tick(s, 1_000 + TUNING.idleLeaveMs + 1);
    expect(stateOf(s)).toBe("attention");
    expect(get(s)!.phase).toBe("working");
    expect(get(s)!.idleSince).toBeNull();
    s = tick(s, 61_000 + TUNING.attentionStaleMs - 1);
    expect(stateOf(s)).toBe("attention");
    s = tick(s, 61_000 + TUNING.attentionStaleMs);
    expect(stateOf(s)).toBe("leaving");
  });

  it("an implausible waitingSince (0, negative, non-finite, future) falls back to the clock", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 99_999_999]) {
      const s = applyEvent(working0(), exact("e1", bad), 10_000);
      expect(get(s)!.episode!.waitingSince, String(bad)).toBe(10_000);
    }
    const ok = applyEvent(working0(), exact("e1", 1), 10_000);
    expect(get(ok)!.episode!.waitingSince).toBe(1);
  });

  it("activity not newer than the episode's waitingSince does not end it, live or replay", () => {
    const at = (e: AgentEvent, ts: number): AgentEvent => ({ ...e, ts });
    const evs: AgentEvent[] = [
      at(started(), 0),
      at(working(), 0),
      at(exact("e1", 10_000), 10_000),
      at(working(null, { phase: "start", id: "t1" }), 9_900),
    ];
    const now = 10_500;
    let live = createOffice();
    for (const e of evs) live = applyEvent(live, e, now);
    const replayed = applyEvents(createOffice(), evs, now, { replay: true });
    for (const s of [live, replayed]) {
      expect(stateOf(s)).toBe("attention");
      expect(get(s)!.attention).toEqual({ trigger: "exact" });
    }
    // newer activity does end it
    const after = applyEvent(replayed, at(working(), 10_001), now);
    expect(get(after)!.attention).toBeNull();
  });

  it("without any needs_attention event the exact path is never taken", () => {
    let s = applyEvent(working0(), done(true), 10_000);
    expect(get(s)!.attention).toEqual({ trigger: "question" });
    expect(get(s)!.episode!.exactId).toBeUndefined();
    s = applyEvent(s, working(null, { phase: "start", id: "t" }), 11_000);
    s = tick(s, 11_000 + TUNING.toolTimerMs);
    expect(get(s)!.attention).toEqual({ trigger: "tool" });
  });
});

describe("async flow through normalize into the machine", () => {
  it("never sends the parent to coffee, and a child walks out on completion", () => {
    const st = createNormalizerState({ projectId: "p1", subagent: false });
    let s = createOffice();
    let now = 1_000_000;
    const parentStates = new Set<string | undefined>();
    let backs = 0;
    const launched = new Set<string>();
    for (const l of asyncFlow.split("\n").filter(Boolean)) {
      for (const e of normalize(st, l)) {
        s = applyEvent(s, e, (now += 1000));
        if (e.kind === "handoff" && e.direction === "out") {
          launched.add(e.toAgentId);
          s = applyEvent(s, { ...started(e.toAgentId), sessionId: e.sessionId, ts: LIVE }, now);
        }
        if (e.kind === "handoff" && e.direction === "back") {
          // Only a child the machine saw arrive can walk out; resumes and unknown ids are no-ops.
          if (!launched.has(e.toAgentId)) continue;
          launched.delete(e.toAgentId);
          backs++;
          expect(s.agents[agentKey(e.sessionId, e.toAgentId)]?.state).toBe("leaving");
        }
        parentStates.add(s.agents[agentKey(e.sessionId, null)]?.state);
      }
    }
    expect(backs).toBeGreaterThan(0);
    expect(parentStates.has("waiting-on-subagents")).toBe(false);
  });
});

describe("returned cap", () => {
  it("evicts the oldest returned child at the cap, and a repeated back refreshes its place", () => {
    let s = createOffice();
    for (let i = 0; i < 2000; i++) s = applyEvent(s, handoff(`c${i}`, "back"), 0);
    expect(Object.keys(s.returned)).toHaveLength(2000);
    s = applyEvent(s, handoff("c0", "back"), 0); // refresh: c0 is now the newest
    s = applyEvent(s, handoff("c2000", "back"), 0); // evicts the oldest, c1
    const keys = Object.keys(s.returned);
    expect(keys).toHaveLength(2000);
    expect(keys).toContain(agentKey(S, "c0"));
    expect(keys).toContain(agentKey(S, "c2000"));
    expect(keys).not.toContain(agentKey(S, "c1"));
  });
});

describe("removeAgent", () => {
  it("removes exactly that agent and its returned mark, immutably", () => {
    let s = applyEvent(createOffice(), started(null), 0);
    s = applyEvent(s, started("c"), 0);
    s = applyEvent(s, handoff("c", "back"), 0);
    const before = structuredClone(s);
    const next = removeAgent(s, S, "c");
    expect(Object.keys(next.agents)).toEqual([agentKey(S, null)]);
    expect(next.returned[agentKey(S, "c")]).toBeUndefined();
    expect(s).toEqual(before);
    const top = removeAgent(s, S, null);
    expect(top.agents[agentKey(S, null)]).toBeUndefined();
    expect(top.agents[agentKey(S, "c")]).toBeDefined();
  });

  it("returns the same state when there is nothing to remove", () => {
    const s = applyEvent(createOffice(), started(null), 0);
    expect(removeAgent(s, S, "nope")).toBe(s);
    expect(removeAgent(s, "other", null)).toBe(s);
  });
});

describe("replay clock cap", () => {
  it("a far-future event neither expires other agents nor never expires itself", () => {
    const now = 10 * HOUR;
    const events: AgentEvent[] = [
      { ...started("a"), ts: now - 1000 },
      { ...working("a"), ts: now - 1000 },
      { ...started("b"), ts: now + 100 * HOUR },
      { ...working("b"), ts: now + 100 * HOUR },
    ];
    const s = tick(applyEvents(createOffice(), events, now, { replay: true }), now);
    expect(stateOf(s, "a")).not.toBe("leaving");
    expect(get(s, "a")).toBeDefined();
    expect(get(s, "b")!.lastEventAt).toBe(now);
    const later = tick(s, now + STALE_MS + 1);
    expect(["leaving", undefined]).toContain(stateOf(later, "b"));
  });
});

describe("ids that collide with Object.prototype", () => {
  const ids = ["__proto__", "constructor", "toString"];

  it("tracks a tool and a launched child under each id", () => {
    for (const id of ids) {
      let s = applyEvent(createOffice(), started(), 0);
      s = applyEvent(s, working(null, { phase: "start", id, isSubagent: true }), 1);
      expect(Object.keys(get(s)!.openTools)).toEqual([id]);
      s = applyEvent(s, waitingSubs(), 2);
      expect(stateOf(s)).toBe("waiting-on-subagents");
      s = applyEvent(s, working(null, { phase: "end", id, isSubagent: true }), 3);
      expect(Object.keys(get(s)!.openTools)).toEqual([]);
      expect(get(s)!.waitingOn).toEqual([]);
      expect(stateOf(s)).not.toBe("waiting-on-subagents");
      s = applyEvent(s, handoff(id, "out"), 4);
      expect(Object.keys(get(s)!.unresolved)).toEqual([id]);
      s = applyEvent(s, handoff(id, "back"), 5);
      expect(Object.keys(get(s)!.unresolved)).toEqual([]);
    }
  });

  it("does not see an absent id as an open tool", () => {
    let s = applyEvent(createOffice(), started(), 0);
    s = applyEvent(s, working(null, { phase: "start", id: "x", isSubagent: true }), 1);
    s = applyEvent(s, waitingSubs(), 2);
    s = applyEvent(s, working(null, { phase: "end", id: "toString" }), 3);
    expect(Object.keys(get(s)!.openTools)).toEqual(["x"]);
    expect(get(s)!.waitingOn).toEqual(["x"]);
    expect(stateOf(s)).toBe("waiting-on-subagents");
  });
});

describe("out-of-order done keeps an exact attention episode", () => {
  const exactAt = (ts: number): AgentEvent => ({
    ...base,
    kind: "needs_attention",
    agentId: null,
    ts,
    waitingSince: ts,
    episodeId: "e1",
  });

  it("a done no newer than the episode does not idle the agent or end attention", () => {
    let s = applyEvent(working0(), exactAt(10_000), 10_000);
    s = applyEvent(s, { ...done(false), ts: 9_900 }, 10_100);
    expect(get(s)!.attention).toEqual({ trigger: "exact" });
    expect(get(s)!.idleSince).toBeNull();
    s = tick(s, 10_100 + TUNING.idleLeaveMs + 1_000);
    expect(stateOf(s)).toBe("attention");
  });
});

describe("a replayed exact needs_attention and the stale window", () => {
  const replayed = (age: number) => {
    const now = 10 * HOUR;
    const ts = now - age;
    const events: AgentEvent[] = [
      { ...started(), ts },
      { ...working(), ts },
      {
        ...base,
        kind: "needs_attention",
        agentId: null,
        ts,
        waitingSince: ts,
        episodeId: "e1",
      } as AgentEvent,
    ];
    const s = applyEvents(createOffice(), events, now, { replay: true });
    return { s, now };
  };

  it("older than attentionStaleMs expires on the first tick", () => {
    const { s, now } = replayed(TUNING.attentionStaleMs + 1);
    expect(stateOf(tick(s, now))).toBe("leaving");
  });

  it("just inside the window stays in attention", () => {
    const { s, now } = replayed(TUNING.attentionStaleMs - 1_000);
    expect(stateOf(tick(s, now))).toBe("attention");
  });
});

describe("kinds", () => {
  const out = (from: string | null, to: string, subagentKind?: "explore" | "plan"): AgentEvent => ({
    ...base,
    kind: "handoff",
    agentId: null,
    ts: LIVE,
    fromAgentId: from,
    toAgentId: to,
    direction: "out",
    ...(subagentKind ? { subagentKind } : {}),
  });
  const kindOf = (s: OfficeState, id: string) => s.kinds[agentKey(S, id)];

  it("stores the kind on an out handoff, and nothing without one", () => {
    let s = applyEvent(working0(), out(null, "a", "explore"), 10);
    s = applyEvent(s, out(null, "b"), 10);
    expect(kindOf(s, "a")).toBe("explore");
    expect(agentKey(S, "b") in s.kinds).toBe(false);
  });

  it("does not store the kind of a launch the wait-loop guard ignores", () => {
    let s = applyEvent(createOffice(), started("A"), 0);
    s = applyEvent(s, started("B"), 0);
    s = applyEvent(s, out("A", "B", "plan"), 1);
    s = applyEvent(s, out("B", "A", "explore"), 2);
    expect(kindOf(s, "B")).toBe("plan");
    expect(kindOf(s, "A")).toBeUndefined();
  });

  it("leaves the kind alone on a back", () => {
    let s = applyEvent(working0(), out(null, "a", "plan"), 10);
    s = applyEvent(s, handoff("a", "back"), 20);
    expect(kindOf(s, "a")).toBe("plan");
  });

  it("evicts the oldest kind at the cap, and a repeated launch refreshes its place", () => {
    let s = createOffice();
    for (let i = 0; i < 2000; i++) s = applyEvent(s, out(null, `c${i}`, "plan"), 0);
    expect(Object.keys(s.kinds)).toHaveLength(2000);
    s = applyEvent(s, out(null, "c0", "explore"), 0);
    s = applyEvent(s, out(null, "c2000", "plan"), 0);
    const keys = Object.keys(s.kinds);
    expect(keys).toHaveLength(2000);
    expect(keys).toContain(agentKey(S, "c0"));
    expect(keys).not.toContain(agentKey(S, "c1"));
    expect(kindOf(s, "c0")).toBe("explore");
  });

  it("removeAgent clears the kind, even when no agent is left", () => {
    let s = applyEvent(createOffice(), out(null, "c", "plan"), 0);
    expect(kindOf(s, "c")).toBe("plan");
    s = removeAgent(s, S, "c");
    expect(agentKey(S, "c") in s.kinds).toBe(false);
  });

  it("drops the kind of a child the tick prunes", () => {
    let s = applyEvent(working0(), out(null, "kid", "plan"), 10);
    s = applyEvent(s, started("kid"), 10);
    expect(kindOf(s, "kid")).toBe("plan");
    s = tick(s, HOUR);
    expect(get(s, "kid")!.phase).toBe("leaving");
    s = tick(s, HOUR + TUNING.subagentLeavingMs);
    expect(get(s, "kid")).toBeUndefined();
    expect(agentKey(S, "kid") in s.kinds).toBe(false);
  });

  it("replaying the same events gives the same kinds", () => {
    const events = [out(null, "a", "explore"), out(null, "b", "plan"), handoff("a", "back")];
    const live = events.reduce((s, e) => applyEvent(s, e, 10), createOffice());
    const replay = applyEvents(createOffice(), events, 10, { replay: true });
    expect(replay.kinds).toEqual(live.kinds);
  });
});

describe("dropped tool_result (T10): bounded-stuck outcome", () => {
  it("an open tool with no result stays open until a top-level done clears it", () => {
    let s = applyEvent(working0(), working(null, { phase: "start", id: "t1" }), 0);
    s = tick(s, TUNING.toolTimerMs + 1000);
    expect(Object.keys(get(s)!.openTools)).toEqual(["t1"]);
    expect(get(s)!.state).toBe("attention");
    s = applyEvent(s, done(false), TUNING.toolTimerMs + 2000);
    expect(get(s)!.openTools).toEqual({});
    expect(get(s)!.state).toBe("idle");
  });

  it("an unresolved handoff with no child is removed by tick once staleMs elapses", () => {
    let s = applyEvent(working0(), handoff("a", "out"), 0);
    s = applyEvent(s, working(), STALE_MS - 1);
    s = tick(s, STALE_MS - 1);
    expect(Object.keys(get(s)!.unresolved)).toEqual(["a"]);
    s = tick(s, STALE_MS);
    expect(get(s)!.unresolved).toEqual({});
  });
});
