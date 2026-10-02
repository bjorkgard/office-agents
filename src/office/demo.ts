import type { AgentEvent } from "../../shared/events";
import type { EventSourceLike, FeedDeps } from "./feed-client";

/**
 * Dev-only scripted feed (D2, T7). It plays through the same `createSource` seam the feed
 * client already consumes, so the machine, hook and Scene run unchanged. Production code
 * never imports this module (main.tsx loads it behind `import.meta.env.DEV`), so the marker
 * below must not appear in `dist/`.
 */

export const DEMO_MARKER = "__OFFICE_DEMO__";

export type DemoScenario = "tour" | "crowd24" | "crowd12";

/** `?demo` plays the tour, `?demo=24` and `?demo=12` the crowd cases; null outside dev. */
export function demoScenario(search: string): DemoScenario | null {
  if (!import.meta.env.DEV) return null;
  const params = new URLSearchParams(search);
  if (!params.has("demo")) return null;
  const value = params.get("demo");
  return value === "24" ? "crowd24" : value === "12" ? "crowd12" : "tour";
}

export type DemoClock = Pick<FeedDeps, "setTimeout" | "clearTimeout" | "now">;

type Seats = Record<string, number>;
type Step = { at: number; event: (ts: number) => AgentEvent };

const DEMO_PROJECTS = [
  { id: "demo-atlas", path: "/Users/demo/atlas" },
  { id: "demo-harbor", path: "/Users/demo/harbor" },
  { id: "demo-lumen", path: "/Users/demo/lumen" },
  { id: "demo-quill", path: "/Users/demo/quill" },
];

const started = (
  at: number,
  sessionId: string,
  agentId: string | null,
  project: (typeof DEMO_PROJECTS)[number],
  parentAgentId: string | null = null,
): Step => ({
  at,
  event: (ts) => ({
    kind: "agent_started",
    sessionId,
    agentId,
    projectId: project.id,
    projectPath: project.path,
    parentAgentId,
    ts,
  }),
});

const working = (
  at: number,
  sessionId: string,
  agentId: string | null,
  projectId: string,
  tool?: { phase: "start" | "end"; id: string; isSubagent: boolean },
): Step => ({
  at,
  event: (ts) => ({ kind: "working", sessionId, agentId, projectId, ts, ...(tool && { tool }) }),
});

/**
 * Tour timing in ms from the start; tune the subagent and idle beats here. The subagent walks in
 * through the door and to its parent's desk before it sits (about 4-5 s), works for
 * SUBAGENT_WORK_MS, then the handoff back sends it out.
 */
export const DEMO_TIMING = {
  /** The parent launches a subagent and starts waiting. */
  subagentLaunchAt: 9000,
  /** The subagent starts, shortly after the handoff out. */
  subagentStartAt: 9200,
  /** How long the subagent stays on the job (walk-in included) before the handoff back. */
  subagentWorkMs: 22000,
  /** The second session finishes its work and goes idle: it fetches a coffee soon after. */
  idleAt: 16000,
  /** The launching session finishes after its subagent has walked out. */
  parentDoneAfterBackMs: 6000,
};

/** Two projects: arrive, work, wave (exact and question), subagent lifecycle at an empty desk, idle. */
function tour(): { steps: Step[]; seats: Seats } {
  const [atlas, harbor] = DEMO_PROJECTS;
  const s1 = "demo-session-1";
  const s2 = "demo-session-2";
  const launchAt = DEMO_TIMING.subagentLaunchAt;
  const backAt = DEMO_TIMING.subagentStartAt + DEMO_TIMING.subagentWorkMs;
  const steps: Step[] = [
    started(0, s1, null, atlas),
    started(500, s2, null, harbor),
    working(2000, s1, null, atlas.id, { phase: "start", id: "t1", isSubagent: false }),
    working(3000, s1, null, atlas.id, { phase: "end", id: "t1", isSubagent: false }),
    working(3000, s2, null, harbor.id, { phase: "start", id: "t2", isSubagent: false }),
    working(4000, s2, null, harbor.id, { phase: "end", id: "t2", isSubagent: false }),
    {
      at: 5000,
      event: (ts) => ({
        kind: "needs_attention",
        sessionId: s1,
        agentId: null,
        projectId: atlas.id,
        waitingSince: ts,
        episodeId: "demo-episode-1",
        ts,
      }),
    },
    {
      at: 6000,
      event: (ts) => ({
        kind: "done",
        sessionId: s2,
        agentId: null,
        projectId: harbor.id,
        endsWithQuestion: true,
        ts,
      }),
    },
    working(8000, s1, null, atlas.id),
    // s1 launches a subagent: waits, hands off out, the child works, hands back.
    working(launchAt, s1, null, atlas.id, { phase: "start", id: "sub1", isSubagent: true }),
    {
      at: launchAt,
      event: (ts) => ({
        kind: "waiting_on_subagents",
        sessionId: s1,
        agentId: null,
        projectId: atlas.id,
        ts,
      }),
    },
    {
      at: launchAt,
      event: (ts) => ({
        kind: "handoff",
        sessionId: s1,
        agentId: null,
        projectId: atlas.id,
        fromAgentId: null,
        toAgentId: "sub1",
        direction: "out",
        ts,
      }),
    },
    started(DEMO_TIMING.subagentStartAt, s1, "sub1", atlas),
    working(launchAt + 7000, s1, "sub1", atlas.id, { phase: "start", id: "c1", isSubagent: false }),
    working(launchAt + 9000, s1, "sub1", atlas.id, { phase: "end", id: "c1", isSubagent: false }),
    working(launchAt + 12000, s1, "sub1", atlas.id, {
      phase: "start",
      id: "c2",
      isSubagent: false,
    }),
    working(launchAt + 15000, s1, "sub1", atlas.id, { phase: "end", id: "c2", isSubagent: false }),
    working(12000, s2, null, harbor.id, { phase: "start", id: "t3", isSubagent: false }),
    working(13000, s2, null, harbor.id, { phase: "end", id: "t3", isSubagent: false }),
    {
      at: backAt,
      event: (ts) => ({
        kind: "handoff",
        sessionId: s1,
        agentId: null,
        projectId: atlas.id,
        fromAgentId: null,
        toAgentId: "sub1",
        direction: "back",
        ts,
      }),
    },
    working(backAt, s1, null, atlas.id, { phase: "end", id: "sub1", isSubagent: true }),
    {
      at: DEMO_TIMING.idleAt,
      event: (ts) => ({
        kind: "done",
        sessionId: s2,
        agentId: null,
        projectId: harbor.id,
        endsWithQuestion: false,
        ts,
      }),
    },
    {
      at: backAt + DEMO_TIMING.parentDoneAfterBackMs,
      event: (ts) => ({
        kind: "done",
        sessionId: s1,
        agentId: null,
        projectId: atlas.id,
        endsWithQuestion: false,
        ts,
      }),
    },
  ];
  // Desk 1 stays empty: the subagent works there.
  return { steps, seats: { [s1]: 0, [s2]: 2 } };
}

/** `count` top-level agents arriving 200 ms apart across four projects, then working. */
function crowd(count: number): { steps: Step[]; seats: Seats } {
  const steps: Step[] = [];
  const seats: Seats = {};
  for (let i = 0; i < count; i++) {
    const sessionId = `demo-crowd-${String(i + 1).padStart(2, "0")}`;
    const project = DEMO_PROJECTS[i % DEMO_PROJECTS.length];
    seats[sessionId] = i;
    steps.push(started(i * 200, sessionId, null, project));
    steps.push(
      working(i * 200 + 2000, sessionId, null, project.id, {
        phase: "start",
        id: `w${i}`,
        isSubagent: false,
      }),
    );
  }
  return { steps, seats };
}

function script(scenario: DemoScenario): { steps: Step[]; seats: Seats } {
  const built = scenario === "crowd24" ? crowd(24) : scenario === "crowd12" ? crowd(12) : tour();
  // Stable: steps at the same instant keep their written order.
  return { ...built, steps: [...built.steps].sort((a, b) => a.at - b.at) };
}

/**
 * Feed deps whose source plays `scenario`. `clock` is injected: the browser passes its
 * timers, tests a fake. Event `ts` is the clock at emission, so a run is deterministic.
 * Each `createSource` replays from the start (StrictMode opens, closes, opens again).
 */
export function createDemoDeps(clock: DemoClock, scenario: DemoScenario = "tour"): FeedDeps {
  return {
    ...clock,
    fetch: () => Promise.resolve({ status: 200 }),
    createSource: (): EventSourceLike => {
      const { steps, seats } = script(scenario);
      let handle: unknown = null;
      let closed = false;
      const source: EventSourceLike = {
        readyState: 0,
        onopen: null,
        onmessage: null,
        onerror: null,
        close() {
          closed = true;
          source.readyState = 2;
          if (handle !== null) clock.clearTimeout(handle);
          handle = null;
        },
      };
      const send = (frame: unknown) => source.onmessage?.({ data: JSON.stringify(frame) });
      const play = (i: number, from: number) => {
        if (closed || i >= steps.length) return;
        handle = clock.setTimeout(() => {
          handle = null;
          if (closed) return;
          // Steps at the same instant fire back to back, in script order.
          let j = i;
          do {
            send({ type: "event", event: steps[j].event(clock.now()) });
            j += 1;
          } while (j < steps.length && steps[j].at === steps[i].at && !closed);
          play(j, steps[i].at);
        }, steps[i].at - from);
      };
      handle = clock.setTimeout(() => {
        handle = null;
        if (closed) return;
        source.readyState = 1;
        source.onopen?.();
        send({ type: "snapshot", events: [], seats });
        play(0, 0);
      }, 0);
      return source;
    },
  };
}
