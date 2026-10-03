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

  it("a subagent's own done is ignored", () => {
    let s = applyEvent(working0(), started("a"), 0);
    s = applyEvent(s, { ...done(true), agentId: "a" }, 1000);
    expect(stateOf(s, "a")).toBe("arriving");
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
      const ref = new Map<string, { id: string | null; ws: number; exitedAt: number | null }>();
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
            if (!wasAttention) {
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
