import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import mainSrc from "../main.tsx?raw";
import { DESKS_PER_ROW } from "../../shared/tuning";
import { Scene } from "./Scene";
import { layoutOffice } from "./iso";
import { agentKey, type Agent, type OfficeState } from "./machine";
import { planMotion, syncTripAttrs, type Frame, type MotionInput } from "./motion";
import { geometryFor } from "./scene-model";
import { deskKindFor } from "./desk-kinds";
import { IDLE_BEFORE_TRIP_MS } from "./choreo";
import {
  activeOverrides,
  parseHourParam,
  sceneFor,
  setHourOverride,
  setSeedOverride,
  setSceneOverride,
  sceneAt,
} from "./decor";

const VIEW = { width: 1200, height: 800 };

function agent(sessionId: string, over: Partial<Agent> = {}): Agent {
  return {
    key: agentKey(sessionId, null),
    sessionId,
    agentId: null,
    projectId: "p",
    parentAgentId: null,
    state: "working",
    phase: "working",
    arrivedAt: 0,
    lastEventAt: 0,
    idleSince: null,
    leftAt: null,
    openTools: {},
    unresolved: {},
    waitingOn: [],
    attention: null,
    episode: null,
    ...over,
  };
}

function render(agents: Agent[], seats: Record<string, number>, clock?: () => number) {
  const office: OfficeState = {
    agents: Object.fromEntries(agents.map((a) => [a.key, a])),
    episodeSeq: 0,
    returned: {},
    kinds: {},
  };
  return renderToStaticMarkup(
    <Scene
      office={office}
      seats={seats}
      projects={{ p: "/work/atlas" }}
      viewport={VIEW}
      now={10 * 60_000}
      failure={null}
      clock={clock}
    />,
  );
}

const crowd = (n: number) => {
  const agents = Array.from({ length: n }, (_, i) => agent(`s${i}`));
  const seats = Object.fromEntries(agents.map((a, i) => [a.sessionId, i]));
  return { agents, seats };
};

describe("debug hooks: scene and desks", () => {
  it.each([1, 2, 3])("exposes data-rows and data-desks matching the layout at %i rows", (rows) => {
    const { agents, seats } = crowd(DESKS_PER_ROW * rows);
    const html = render(agents, seats);
    const layout = layoutOffice(DESKS_PER_ROW * rows, VIEW);
    expect(layout.rows).toBe(rows);
    expect(html).toMatch(new RegExp(`data-rows="${rows}" data-desks="${layout.desks.length}"`));
  });

  it("puts the kind of every desk on its div, by index parity", () => {
    const { agents, seats } = crowd(DESKS_PER_ROW * 2);
    const html = render(agents, seats);
    const kinds = [...html.matchAll(/data-desk="(\d+)"[^>]*data-desk-kind="(\w+)"/g)];
    expect(kinds).toHaveLength(DESKS_PER_ROW * 2);
    for (const [, i, kind] of kinds) {
      expect(kind).toBe(deskKindFor(Number(i)).id);
      expect(kind).toBe(Number(i) % 2 === 0 ? "tidy" : "cluttered");
    }
  });
});

describe("debug hooks: trips", () => {
  const SINCE = 5000;
  const idle = agent("s1", { state: "idle", phase: "idle", idleSince: SINCE });
  const seats = { s1: 0 };
  const geo = geometryFor(layoutOffice(1, VIEW));
  const sample = (t: number) => {
    const input = {
      agents: [idle],
      seats,
      layout: layoutOffice(1, VIEW),
      geo,
      prevDesks: new Map(),
      prevTrips: new Map(),
      prevSubs: new Map(),
      prevCache: new Map(),
      reducedMotion: false,
      now: SINCE,
    } satisfies MotionInput;
    return planMotion(input).drives.get(idle.key)!.frame(t);
  };
  const times = [
    SINCE + 500,
    SINCE + IDLE_BEFORE_TRIP_MS + 600,
    SINCE + IDLE_BEFORE_TRIP_MS + 6000,
    SINCE + 60_000,
  ];

  it.each(times)("exposes data-break matching the trip sample at %i", (t) => {
    const f = sample(t);
    expect(f.phase).toBeDefined();
    const html = render([idle], seats, () => t);
    expect(html).toContain(`data-break="${f.phase}"`);
  });

  it("walks through every phase", () => {
    expect(new Set(times.map((t) => sample(t).phase))).toEqual(
      new Set(["seated", "to-coffee", "at-coffee"]),
    );
  });

  // The expected drink comes from the pose at the station (cup: water, mug: coffee), not from the
  // drink functions under test. Several idle starts and wait keys, so a wrong pick shows up.
  const drinkOfPose = (pose: string) => (pose === "standing-cup" ? "water" : "coffee");
  const framesOf = (frameAt: (t: number) => Frame, from: number) => {
    const first = new Map<string, number>();
    let drink = "";
    for (let t = from; t < from + 90_000; t += 100) {
      const f = frameAt(t);
      if (f.phase === undefined) continue;
      if (f.phase === "at-coffee") drink = drinkOfPose(f.pose);
      if (!first.has(f.phase)) first.set(f.phase, t);
      if (f.phase === "seated" && first.has("back")) break;
    }
    return { first, drink };
  };

  it.each(Array.from({ length: 24 }, (_, i) => SINCE + i * 7))(
    "idle trip from %i: data-drink follows the pose at the station through every phase",
    (since) => {
      const a = agent("s1", { state: "idle", phase: "idle", idleSince: since });
      const input = {
        agents: [a],
        seats,
        layout: layoutOffice(1, VIEW),
        geo,
        prevDesks: new Map(),
        prevTrips: new Map(),
        prevSubs: new Map(),
        prevCache: new Map(),
        reducedMotion: false,
        now: since,
      } satisfies MotionInput;
      const frameAt = planMotion(input).drives.get(a.key)!.frame;
      const { first, drink } = framesOf(frameAt, since);
      expect([...first.keys()]).toEqual(["seated", "to-coffee", "at-coffee", "back"]);
      for (const [phase, t] of first) {
        const html = render([a], seats, () => t);
        expect(html).toContain(`data-break="${phase}"`);
        expect(html).toContain(`data-drink="${drink}"`);
      }
    },
  );

  it.each(Array.from({ length: 24 }, (_, i) => `w${i}`))(
    "waiting parent %s: data-drink follows the pose at the station through every phase",
    (id) => {
      const NOW = 10 * 60_000;
      const a = agent(id, {
        state: "waiting-on-subagents",
        waitingOn: ["tool1"],
        openTools: { tool1: { startedAt: NOW, isSubagent: true } },
      });
      const input = {
        agents: [a],
        seats: { [id]: 0 },
        layout: layoutOffice(1, VIEW),
        geo,
        prevDesks: new Map(),
        prevTrips: new Map(),
        prevSubs: new Map(),
        prevCache: new Map(),
        reducedMotion: false,
        now: NOW,
      } satisfies MotionInput;
      const frameAt = planMotion(input).drives.get(a.key)!.frame;
      const { first, drink } = framesOf(frameAt, NOW);
      expect([...first.keys()]).toEqual(["to-coffee", "at-coffee", "back", "seated"]);
      for (const [phase, t] of first) {
        const html = render([a], { [id]: 0 }, () => t);
        expect(html).toContain(`data-break="${phase}"`);
        expect(html).toContain(`data-drink="${drink}"`);
      }
    },
  );

  it("leaves both attributes off an agent without a trip", () => {
    const html = render([agent("s1")], seats, () => 20_000);
    expect(html).not.toContain("data-break");
    expect(html).not.toContain("data-drink");
  });
});

describe("debug hooks: overrides", () => {
  afterEach(() => {
    setSceneOverride(null);
    setHourOverride(null);
    setSeedOverride("");
  });

  it("parses ?hour as a whole 0 to 23 and ignores anything else", () => {
    expect(parseHourParam("7")).toBe(7);
    expect(parseHourParam("0")).toBe(0);
    expect(parseHourParam("23")).toBe(23);
    for (const bad of ["24", "-1", "x", "", "7.5", "007", " 7", null]) {
      expect(parseHourParam(bad), String(bad)).toBeNull();
    }
  });

  it("forces the hour of the window scene, not the clock", () => {
    const noon = new Date(2026, 5, 10, 12, 0, 0).getTime();
    setHourOverride(23);
    expect(sceneAt(noon)).toBe("night");
    setHourOverride(18);
    expect(sceneAt(noon)).toBe("dusk");
    setHourOverride(null);
    expect(sceneAt(noon)).toBe(sceneFor("2026-06-10", 12));
  });

  it("salts the variant seed: same without it, different for some salt", () => {
    expect(sceneFor("2026-06-10", 12, "")).toBe(sceneFor("2026-06-10", 12));
    const days = Array.from({ length: 30 }, (_, d) => `2026-06-${String(d + 1).padStart(2, "0")}`);
    expect(days.some((day) => sceneFor(day, 12, "a") !== sceneFor(day, 12))).toBe(true);
  });

  it("lists the active overrides", () => {
    expect(activeOverrides()).toEqual([]);
    setSceneOverride("rain");
    setHourOverride(9);
    setSeedOverride("abc");
    expect(activeOverrides()).toEqual(["scene=rain", "hour=9", "seed=abc"]);
  });

  it("reads ?hour and ?seed only inside import.meta.env.DEV in main.tsx", () => {
    expect(mainSrc.match(/get\("hour"\)/g)).toHaveLength(1);
    expect(mainSrc.match(/get\("seed"\)/g)).toHaveLength(1);
    expect(mainSrc).toMatch(
      /if \(import\.meta\.env\.DEV\) \{[^]*get\("hour"\)[^]*get\("seed"\)[^]*setSeedOverride[^]*?\n\}/,
    );
    const dev = mainSrc.indexOf("import.meta.env.DEV");
    expect(mainSrc.indexOf('get("hour")')).toBeGreaterThan(dev);
    expect(mainSrc.indexOf('get("seed")')).toBeGreaterThan(dev);
    // Both reads sit before the first block closes: inside the same DEV branch as ?scene.
    const close = mainSrc.indexOf("\n}\n", dev);
    expect(mainSrc.indexOf('get("hour")')).toBeLessThan(close);
    expect(mainSrc.indexOf('get("seed")')).toBeLessThan(close);
  });
});

describe("debug hooks: trip attributes on a driven node", () => {
  // A fake node that counts every write to its dataset.
  const fake = () => {
    const data: Record<string, string | undefined> = {};
    const writes: string[] = [];
    const dataset = new Proxy(data, {
      set(t, k: string, v) {
        writes.push(`set ${k}=${v}`);
        t[k] = v;
        return true;
      },
      deleteProperty(t, k: string) {
        writes.push(`delete ${k}`);
        delete t[k];
        return true;
      },
    });
    return { node: { dataset }, data, writes };
  };

  it("sets on the first frame, leaves a repeat alone, and updates on a phase change", () => {
    const { node, data, writes } = fake();
    syncTripAttrs(node, { phase: "to-coffee", drink: "coffee" });
    expect(data).toEqual({ break: "to-coffee", drink: "coffee" });
    writes.length = 0;
    syncTripAttrs(node, { phase: "to-coffee", drink: "coffee" });
    expect(writes).toEqual([]);
    syncTripAttrs(node, { phase: "at-coffee", drink: "coffee" });
    expect(writes).toEqual(["set break=at-coffee"]);
    expect(data).toEqual({ break: "at-coffee", drink: "coffee" });
  });

  it("clears both attributes when the frame has no trip", () => {
    const { node, data } = fake();
    syncTripAttrs(node, { phase: "seated", drink: "water" });
    syncTripAttrs(node, {});
    expect(data).toEqual({});
    expect("break" in data).toBe(false);
    expect("drink" in data).toBe(false);
  });
});
