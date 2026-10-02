import { describe, expect, it } from "vite-plus/test";
import { parseAgentEvent } from "../../shared/events";
import { createDemoDeps, DEMO_MARKER, DEMO_TIMING, demoScenario, type DemoScenario } from "./demo";
import { COFFEE_DWELL_MS, IDLE_BEFORE_TRIP_MS } from "./choreo";
import { createFeedClient, type FeedState } from "./feed-client";

const T0 = 1_700_000_000_000;

function run(scenario: DemoScenario, totalMs: number, stepMs = 250) {
  let now = T0;
  const timers: { id: number; at: number; fn: () => void }[] = [];
  let nextId = 1;
  const clock = {
    setTimeout: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.push({ id, at: now + ms, fn });
      return id;
    },
    clearTimeout: (id: unknown) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    now: () => now,
  };
  const base = createDemoDeps(clock, scenario);
  const deps = { ...base, createSource: (url: string) => base.createSource(url) };
  const seen: { at: number; state: FeedState }[] = [];
  const sent: unknown[] = [];
  deps.createSource = (url) => {
    const source = base.createSource(url);
    return new Proxy(source, {
      set(target, prop, value) {
        if (prop === "onmessage") {
          target.onmessage = (e) => {
            sent.push(JSON.parse(e.data));
            value(e);
          };
          return true;
        }
        (target as Record<string | symbol, unknown>)[prop] = value;
        return true;
      },
    });
  };
  const client = createFeedClient(deps, (state) => seen.push({ at: now, state }));
  client.start();
  const advance = (ms: number) => {
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
  };
  for (let t = 0; t < totalMs; t += stepMs) advance(stepMs);
  client.stop();
  return { seen, sent, client };
}

const statesOf = (seen: ReturnType<typeof run>["seen"]) =>
  new Set(seen.flatMap((s) => Object.values(s.state.office.agents).map((a) => a.state)));

describe("demo script", () => {
  it("reaches every state through the feed client", () => {
    const { seen } = run("tour", 6 * 60 * 1000);
    expect(statesOf(seen)).toEqual(
      new Set(["arriving", "working", "waiting-on-subagents", "idle", "attention", "leaving"]),
    );
  });

  it("leaves an empty desk and runs a subagent's whole life at it", () => {
    const { seen } = run("tour", 90_000);
    const last = seen[seen.length - 1].state;
    const taken = new Set(Object.values(last.seats));
    const free = Array.from({ length: Math.max(...taken) + 1 }, (_, i) => i).filter(
      (i) => !taken.has(i),
    );
    expect(free.length).toBeGreaterThan(0);
    const kid = (s: (typeof seen)[number]) =>
      Object.values(s.state.office.agents).find((a) => a.agentId === "sub1");
    const present = seen.filter((s) => kid(s));
    const appeared = present[0].at - T0;
    const left = seen.find((s) => kid(s)?.phase === "leaving")!.at - T0;
    expect(appeared).toBeGreaterThanOrEqual(DEMO_TIMING.subagentStartAt);
    // It stays for the work time, then is told to leave after the handoff back, and is removed.
    expect(left - appeared).toBeGreaterThanOrEqual(DEMO_TIMING.subagentWorkMs - 500);
    expect(seen.some((s) => s.at > T0 + left && !kid(s))).toBe(true);
  });

  it("lets an agent go idle long enough to fetch a coffee and come back", () => {
    const { seen } = run("tour", 90_000);
    const idle = seen.filter((s) =>
      Object.values(s.state.office.agents).some((a) => a.state === "idle" && a.idleSince !== null),
    );
    const span = idle[idle.length - 1].at - idle[0].at;
    expect(idle[0].at - T0).toBeGreaterThanOrEqual(DEMO_TIMING.idleAt);
    expect(span).toBeGreaterThan(IDLE_BEFORE_TRIP_MS + COFFEE_DWELL_MS + 10_000);
  });

  it("seats and connects like a live feed", () => {
    const { seen } = run("tour", 1000);
    const last = seen[seen.length - 1].state;
    expect(last.connection).toBe("live");
    expect(Object.keys(last.seats).length).toBe(2);
    expect(Object.keys(last.projects).length).toBe(2);
  });

  it("every event passes parseAgentEvent and nothing is skipped", () => {
    for (const scenario of ["tour", "crowd24", "crowd12"] as const) {
      const { sent, seen } = run(scenario, 10_000);
      const events = sent.filter((f) => (f as { type: string }).type === "event");
      expect(events.length).toBeGreaterThan(0);
      for (const f of events) {
        const event = (f as { event: unknown }).event;
        expect(parseAgentEvent(event)).toEqual(event);
      }
      expect(seen[seen.length - 1].state.skipped).toEqual({ json: 0, frame: 0, event: 0 });
    }
  });

  it("holds 24 and 12 agents at once", () => {
    for (const [scenario, count] of [
      ["crowd24", 24],
      ["crowd12", 12],
    ] as const) {
      const { seen } = run(scenario, 10_000);
      const peak = Math.max(...seen.map((s) => Object.keys(s.state.office.agents).length));
      expect(peak).toBe(count);
    }
  });

  it("is deterministic across two runs", () => {
    const a = run("tour", 60_000);
    const b = run("tour", 60_000);
    expect(b.sent).toEqual(a.sent);
    expect(b.seen.map((s) => s.state.office)).toEqual(a.seen.map((s) => s.state.office));
  });

  it("stops emitting once the source is closed", () => {
    const { sent } = run("tour", 1000);
    const count = sent.length;
    const again = run("tour", 1000);
    expect(again.sent.length).toBe(count);
  });

  it("reads the scenario from the query string in dev", () => {
    expect(demoScenario("")).toBeNull();
    expect(demoScenario("?art")).toBeNull();
    expect(demoScenario("?demo")).toBe("tour");
    expect(demoScenario("?demo=24")).toBe("crowd24");
    expect(demoScenario("?demo=12")).toBe("crowd12");
    expect(DEMO_MARKER).toBe("__OFFICE_DEMO__");
  });
});
