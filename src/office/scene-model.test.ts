import { describe, expect, it } from "vite-plus/test";
import design from "../../DESIGN.md?raw";
import { tokenRows } from "../design-md";
import { agentKey, type Agent } from "./machine";
import type { AgentState } from "./poses";
import { DESK_HEIGHT, DESK_WIDTH, RIG_HEIGHT, RIG_WIDTH } from "./CharacterRig";
import { DESKS_PER_ROW, DESK_CAP } from "../../shared/tuning";
import { layoutOffice } from "./iso";
import { planMotion, type CacheEntry, type SubMemory } from "./motion";
import { CELL } from "./pixel";
import { DESK, FRAMES, HEAD_ANCHOR } from "./sprites";
import {
  assignShirts,
  shirtOf,
  deskCountFor,
  deskDemand,
  deskZ,
  sceneDemand,
  bubbleText,
  geometryFor,
  lookFor,
  lostFocus,
  newDeskIndexes,
  planSubagents,
  SLOTS_PER_DESK,
  stepRowHold,
  HOLD_MS,
  type RowHold,
} from "./scene-model";

const STATES: AgentState[] = [
  "arriving",
  "working",
  "waiting-on-subagents",
  "idle",
  "attention",
  "leaving",
];

function agent(sessionId: string, agentId: string | null, over: Partial<Agent> = {}): Agent {
  return {
    key: agentKey(sessionId, agentId),
    sessionId,
    agentId,
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

describe("lookFor (DESIGN state to look)", () => {
  it("attention always has the raised hand, the floor ring and the bubble", () => {
    expect(lookFor("attention")).toMatchObject({
      pose: "seated-raised-hand",
      ring: true,
      bubble: true,
    });
  });

  it("no other state has a ring or a bubble", () => {
    for (const s of STATES.filter((s) => s !== "attention")) {
      expect(lookFor(s), s).toMatchObject({ ring: false, bubble: false });
    }
  });

  it("animates the screen while working, holds it still while waiting on subagents, else dark", () => {
    expect(STATES.filter((s) => lookFor(s).screen === "live")).toEqual(["working"]);
    expect(STATES.filter((s) => lookFor(s).screen === "still")).toEqual(["waiting-on-subagents"]);
    expect(STATES.filter((s) => lookFor(s).screen === "off")).toEqual([
      "arriving",
      "idle",
      "attention",
      "leaving",
    ]);
  });

  it("sends the coffee break to the coffee station", () => {
    expect(STATES.filter((s) => lookFor(s).place === "coffee")).toEqual(["waiting-on-subagents"]);
  });
});

describe("ring contrast", () => {
  const tokens = tokenRows(design);
  const token = (name: string) => tokens.get(name)!;
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  it("--accent ring against the --bg floor is at least 3:1 (rings are graphics)", () => {
    const [hi, lo] = [lum(token("--accent")), lum(token("--bg"))].sort((a, b) => b - a);
    expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThanOrEqual(3);
  });
});

describe("bubbleText", () => {
  it("never carries transcript text", () => {
    expect(bubbleText("tool")).toBe("Stuck?");
    expect(bubbleText("question")).toBe("Asking you");
    expect(bubbleText("exact")).toBe("Asking you");
    expect(bubbleText(undefined)).toBe("Asking you");
  });
});

describe("assignShirts", () => {
  it("keeps a session's shirt while it stays active, gives new ones distinct shirts", () => {
    const a = assignShirts({}, ["a", "b"]);
    expect(a.a).not.toEqual(a.b);
    const again = assignShirts(a, ["a", "b", "c"]);
    expect(again.a).toEqual(a.a);
    expect(again.b).toEqual(a.b);
    expect(again.c).not.toEqual(a.a);
    expect(again.c).not.toEqual(a.b);
  });

  it("treats session ids like __proto__ and constructor as plain data", () => {
    const ids = ["__proto__", "constructor", "toString", "hasOwnProperty"];
    const a = assignShirts({}, ids);
    expect(Object.getPrototypeOf(a)).toBe(Object.prototype);
    expect(Object.keys(a).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      const shirt = shirtOf(a, id);
      expect(typeof shirt?.index).toBe("number");
      expect(Object.hasOwn(a, id)).toBe(true);
    }
    const again = assignShirts(a, ids);
    expect(Object.getPrototypeOf(again)).toBe(Object.prototype);
    for (const id of ids) expect(shirtOf(again, id)).toEqual(shirtOf(a, id));
    expect(shirtOf({}, "constructor")).toBeUndefined();
    expect(shirtOf({}, "__proto__")).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("drops inactive sessions", () => {
    const a = assignShirts({}, ["a"]);
    expect(Object.keys(assignShirts(a, []))).toEqual([]);
  });
});

describe("planSubagents (8C)", () => {
  const parent = agent("s1", null);
  const kids = ["k1", "k2", "k3", "k4"].map((id, i) =>
    agent("s1", id, { parentAgentId: null, arrivedAt: i }),
  );

  it("gives each desk two slots in arrival order and queues the rest near the door", () => {
    const plan = planSubagents([parent, ...kids], { s1: 0 });
    expect(SLOTS_PER_DESK).toBe(2);
    expect(plan.slot.get(kids[0].key)).toEqual({ desk: 0, index: 0 });
    expect(plan.slot.get(kids[1].key)).toEqual({ desk: 0, index: 1 });
    expect(plan.queue).toEqual([kids[2].key, kids[3].key]);
    expect(plan.overflow.get("s1")).toBe(2);
  });

  it("queues subagents of an unseated session and counts nothing on the parent tag", () => {
    const plan = planSubagents([parent, kids[0]], {});
    expect(plan.queue).toEqual([kids[0].key]);
    expect(plan.overflow.size).toBe(0);
  });

  it("frees a slot for the queue when a subagent goes", () => {
    const plan = planSubagents([parent, kids[1], kids[2], kids[3]], { s1: 0 });
    expect(plan.queue).toEqual([kids[3].key]);
  });
});

describe("geometryFor", () => {
  const view = { width: 1200, height: 800 };
  const layout = layoutOffice(8, view);
  const g = geometryFor(layout);

  it("puts the door left of the back desk and coffee right of the back row", () => {
    expect(g.door.x).toBeLessThan(layout.desks[0].x);
    expect(g.coffee.x).toBeGreaterThan(layout.desks[3].x);
    expect(g.coffee.x).toBeLessThan(layout.width);
    expect(g.door.x).toBeGreaterThan(0);
  });

  it("keeps the door and coffee fixed against the back desk when a row is added", () => {
    const more = layoutOffice(12, view);
    const m = geometryFor(more);
    expect(m.door.x - more.desks[0].x).toBeCloseTo(g.door.x - layout.desks[0].x);
    expect(m.coffee.x - more.desks[0].x).toBeCloseTo(g.coffee.x - layout.desks[0].x);
    expect(m.door.y - more.desks[0].y).toBeCloseTo(g.door.y - layout.desks[0].y);
    expect(m.coffee.y - more.desks[0].y).toBeCloseTo(g.coffee.y - layout.desks[0].y);
  });

  it("stands the door on the back wall, behind and left of the back desk", () => {
    expect(g.door.x).toBeLessThan(layout.desks[0].x);
    expect(g.door.y).toBeLessThan(layout.desks[0].y);
  });

  it("places seats and slots per desk", () => {
    expect(g.seat(0)).not.toEqual(g.seat(1));
    expect(g.slot(0, 0).x).toBeLessThan(g.slot(0, 1).x);
  });

  it("stands coffee-break agents apart and queues near the door", () => {
    expect(g.coffeeSpot(0)).not.toEqual(g.coffeeSpot(1));
    expect(g.queueSpot(0).x).toBeGreaterThan(g.door.x);
    expect(g.queueSpot(1).x).toBeGreaterThan(g.queueSpot(0).x);
  });
});

describe("deskCountFor", () => {
  const office = (...as: Agent[]) => ({
    agents: Object.fromEntries(as.map((a) => [a.key, a])),
    episodeSeq: 0,
    returned: {},
  });

  it("is the highest seat of a present agent plus one, leavers keep their desk", () => {
    const seats = { a: 0, b: 5, c: 9 };
    expect(deskCountFor(office(agent("a", null), agent("b", null)), seats)).toBe(6);
    expect(deskCountFor(office(agent("c", null, { state: "leaving" })), seats)).toBe(10);
    expect(deskCountFor(office(agent("z", null)), seats)).toBe(0);
  });
});

describe("seated agents stay visible behind their desk", () => {
  const layout = layoutOffice(4, { width: 1200, height: 800 });
  const g = geometryFor(layout);
  const top = g.desk(0);
  const seat = g.seat(0);
  // Rig top-left in cells relative to the desk sprite, from the real placement.
  const ox = (seat.x - RIG_WIDTH / 2 - top.x) / CELL;
  const oy = (seat.y - RIG_HEIGHT - top.y) / CELL;
  const covered = (x: number, y: number) => {
    const dx = x + ox;
    const dy = y + oy;
    return (
      dy >= 0 &&
      dy < DESK_HEIGHT / CELL &&
      dx >= 0 &&
      dx < DESK_WIDTH / CELL &&
      DESK[dy][dx] !== "."
    );
  };
  // Head layer rows plus 12 torso rows, body columns only (arms reaching the keyboard excluded).
  function visibleFraction(frame: "SEATED_TYPING" | "SEATED_IDLE" | "SEATED_RAISED") {
    const grid = FRAMES[frame];
    const [, hy] = HEAD_ANCHOR[frame];
    let drawn = 0;
    let hidden = 0;
    for (let y = 0; y < hy + 16 + 12; y++)
      for (let x = 0; x < 24; x++) {
        if (grid[y][x] === ".") continue;
        drawn++;
        if (covered(x, y)) hidden++;
      }
    return 1 - hidden / drawn;
  }

  it.each(["SEATED_TYPING", "SEATED_IDLE", "SEATED_RAISED"] as const)(
    "shows at least 90 percent of the head and torso of %s with the desk drawn over it",
    (frame) => {
      expect(visibleFraction(frame)).toBeGreaterThanOrEqual(0.9);
    },
  );

  it("keeps the desk's own slots clear of the seat", () => {
    const d = layout.desks[0];
    for (const i of [0, 1]) expect(Math.abs(g.slot(0, i).x - seat.x)).toBeGreaterThanOrEqual(48);
    expect(g.slot(0, 0).y).toBeGreaterThan(d.y);
  });
});

describe("lostFocus", () => {
  const body = {};
  const gone = { isConnected: false };
  const here = { isConnected: true };
  it("is true only when the focused element was removed and focus fell to the body", () => {
    expect(lostFocus(gone, body, body)).toBe(true);
    expect(lostFocus(gone, null, body)).toBe(true);
    expect(lostFocus(gone, here, body)).toBe(false);
    expect(lostFocus(here, body, body)).toBe(false);
    expect(lostFocus(null, body, body)).toBe(false);
  });
});

const rowsOf = (desks: number) => Math.ceil(desks / DESKS_PER_ROW);

// Seats of agents in the office (all of them occupied), no held desks.
const demand = (seats: number[], needed: number, held: number[] = [], stale: number[] = []) =>
  deskDemand(seats, [...seats, ...stale], held, needed);

describe("deskDemand (desks a room needs, whole rows)", () => {
  it("is empty with no seats and no subagents", () => {
    expect(demand([], 0)).toBe(0);
  });
  it("one seat and no subagents is one row", () => {
    expect(rowsOf(demand([0], 0))).toBe(1);
  });
  it("four seats and one subagent need a second row", () => {
    expect(demand([0, 1, 2, 3], 1)).toBe(8);
  });
  it("seats 0..3 with three subagents seat everyone in two rows", () => {
    expect(demand([0, 1, 2, 3], 3)).toBe(8);
  });
  it("counts the highest seat, so sparse seats keep their rows", () => {
    expect(rowsOf(demand([9], 0))).toBe(3);
  });
  it("subagents fill the gaps below the highest seat before any new row", () => {
    // seats 0 and 5: desks 1-4 are free, so four subagents need no row beyond the second.
    expect(rowsOf(demand([0, 5], 4))).toBe(2);
    expect(rowsOf(demand([0, 5], 5))).toBe(2);
    expect(rowsOf(demand([0, 5], 7))).toBe(3);
  });
  it("a departed session's seat is occupied: it takes a desk but pulls no row of its own", () => {
    // Seat 1 is stale: A (seat 0) plus 3 subagents need desks 2, 3, 4 -> two rows.
    expect(demand([0], 3, [], [1])).toBe(8);
    expect(demand([0], 2, [], [1])).toBe(4);
    // A stale seat above the present ones is occupied too, never drawn for its own sake.
    expect(demand([0], 0, [], [9])).toBe(4);
    expect(demand([0], 3, [], [1, 2])).toBe(8);
  });
  it("a desk held by a leaving subagent counts as taken and keeps its row", () => {
    // Seat 0, a leaver holds desk 1, three new subagents need desks 2, 3, 4.
    expect(demand([0], 3, [1])).toBe(8);
    expect(demand([0], 2, [1])).toBe(4);
    expect(rowsOf(demand([0], 0, [6]))).toBe(2);
    expect(rowsOf(demand([0], 0, [7]))).toBe(2);
    expect(rowsOf(demand([0], 0, [8]))).toBe(3);
  });
  it("caps only the growth for new subagents, never the base", () => {
    expect(DESK_CAP).toBe(24);
    expect(demand([0, 1, 2, 3], 40)).toBe(DESK_CAP);
    // Seats, held desks and occupied seats above the cap keep their rows.
    expect(demand([26], 0)).toBe(28);
    expect(demand([2], 0, [27])).toBe(28);
    expect(demand([0], 0, [90])).toBe(92);
    expect(demand([26], 5)).toBe(28);
    expect(demand([0], 3, [], [29])).toBe(4);
    expect(demand([0, 29], 40)).toBe(32);
  });
  it("with no subagents, the Scene path (sceneDemand + stepRowHold) draws today's rows, departed seats included", () => {
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31);
    const sets: number[][] = [];
    for (let n = 0; n <= 30; n++) sets.push(Array.from({ length: n }, (_, i) => i));
    for (let i = 0; i < 600; i++) sets.push([...Array(30).keys()].filter(() => next() % 3 === 0));
    for (const set of sets) {
      const seats: Record<string, number> = {};
      const agents: Agent[] = [];
      set.forEach((d, i) => {
        seats[`s${i}`] = d;
        if (next() % 4 !== 0) agents.push(agent(`s${i}`, null)); // the rest departed, seat kept
      });
      const office = {
        agents: Object.fromEntries(agents.map((a) => [a.key, a])),
        episodeSeq: 0,
        returned: {},
      };
      const sessionRows = Math.max(1, rowsOf(deskCountFor(office, seats)));
      let hold: RowHold | null = null;
      for (const now of [5000, 9000, 1000, 70000]) {
        const rows = Math.ceil(sceneDemand(agents, seats, new Map()) / DESKS_PER_ROW);
        hold = stepRowHold(hold, sessionRows, rows, now);
        expect(hold.rows).toBe(sessionRows);
      }
    }
  });
});

/** One Scene render: rows via sceneDemand + stepRowHold, then planMotion with drives, as Scene.tsx does. */
type Mem = {
  desks: Map<string, number | null>;
  hold: RowHold | null;
  subs: Map<string, SubMemory>;
  cache: Map<string, CacheEntry>;
};
const freshMem = (): Mem => ({ desks: new Map(), hold: null, subs: new Map(), cache: new Map() });
function scenePass(all: Agent[], seats: Record<string, number>, mem: Mem, now: number) {
  const office = {
    agents: Object.fromEntries(all.map((a) => [a.key, a])),
    episodeSeq: 0,
    returned: {},
  };
  const sessionRows = Math.max(1, Math.ceil(deskCountFor(office, seats) / DESKS_PER_ROW));
  const demandRows = Math.ceil(sceneDemand(all, seats, mem.desks) / DESKS_PER_ROW);
  const hold = stepRowHold(mem.hold, sessionRows, demandRows, now);
  const layout = layoutOffice(hold.rows * DESKS_PER_ROW, { width: 1200, height: 800 });
  const out = planMotion({
    agents: all,
    seats,
    layout,
    geo: geometryFor(layout),
    prevDesks: mem.desks,
    prevTrips: new Map(),
    prevSubs: mem.subs,
    prevCache: mem.cache,
    reducedMotion: false,
    now,
  });
  // Scene reads deskZ for every desk it seats someone at.
  for (const d of out.workDeskOf.values()) deskZ(layout, d);
  mem.desks = out.desks;
  mem.hold = hold;
  mem.subs = out.subs;
  mem.cache = out.cache;
  return { layout, out };
}

describe("a held desk above the cap survives (refuter-29)", () => {
  // Departed sessions keep seats 0..25 (B is seat 2), A sits at 26, B's subagent gets desk 27.
  const seats: Record<string, number> = { A: 26, B: 2 };
  for (let i = 0; i < 26; i++) if (i !== 2) seats[`x${i}`] = i;
  const kid = (over: Partial<Agent> = {}) => agent("B", "k", { arrivedAt: 0, ...over });
  const key = agentKey("B", "k");

  it("a leaver keeps desk 27 when A departs: no throw, desk still in the room", () => {
    const mem = freshMem();
    const first = scenePass([agent("A", null), agent("B", null), kid()], seats, mem, 0);
    expect(first.out.workDeskOf.get(key)).toBe(27);
    const leaving = kid({ state: "leaving", phase: "leaving", leftAt: 1000 });
    const second = scenePass([agent("B", null), leaving], seats, mem, 1000);
    expect(second.layout.desks.length).toBeGreaterThan(27);
    expect(second.out.workDeskOf.get(key)).toBe(27);
  });
  it("a working subagent stays on desk 27 when A departs", () => {
    const mem = freshMem();
    scenePass([agent("A", null), agent("B", null), kid()], seats, mem, 0);
    const second = scenePass([agent("B", null), kid()], seats, mem, 1000);
    expect(second.out.workDeskOf.get(key)).toBe(27);
  });
});

describe("deskZ guard", () => {
  it("clamps an out-of-range desk to the nearest desk instead of throwing", () => {
    const layout = layoutOffice(4, { width: 1200, height: 800 });
    expect(deskZ(layout, 99)).toBe(deskZ(layout, 3));
    expect(deskZ(layout, -1)).toBe(deskZ(layout, 0));
  });
});

describe("sceneDemand and planMotion agree (nobody stands below the cap)", () => {
  it("a leaving subagent keeps its desk while three new ones arrive: all three get one", () => {
    const seats = { s0: 0 };
    const run = (all: Agent[], prev: Map<string, number | null>) => {
      const rows = Math.ceil(sceneDemand(all, seats, prev) / DESKS_PER_ROW);
      const layout = layoutOffice(rows * DESKS_PER_ROW, { width: 1200, height: 800 });
      return planMotion({
        agents: all,
        seats,
        layout,
        geo: geometryFor(layout),
        prevDesks: prev,
        prevTrips: new Map(),
        reducedMotion: true,
        now: 0,
      });
    };
    const parent = agent("s0", null);
    const first = run([parent, agent("s0", "k0", { arrivedAt: 0 })], new Map());
    expect(first.workDeskOf.get(agentKey("s0", "k0"))).toBe(1);
    const next = [
      parent,
      agent("s0", "k0", { arrivedAt: 0, phase: "leaving" }),
      ...[1, 2, 3].map((i) => agent("s0", `k${i}`, { arrivedAt: i })),
    ];
    const second = run(next, first.desks);
    for (const i of [1, 2, 3]) expect(second.workDeskOf.has(agentKey("s0", `k${i}`))).toBe(true);
  });

  // A seeded scan through the Scene path (sceneDemand + stepRowHold + planMotion with drives, memory
  // carried between renders): seats up to 30 with departed entries, held desks, leavers, bursts.
  it("no held desk is lost, nothing throws, nobody stands below the cap", () => {
    let seed = 99;
    const rnd = (n: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return (seed >>> 8) % n;
    };
    let standing = 0;
    let checked = 0;
    let held = 0;
    for (let round = 0; round < 400; round++) {
      const parents = 1 + rnd(5);
      const seats: Record<string, number> = {};
      const taken = new Set<number>();
      const agents: Agent[] = [];
      const spread = round % 2 === 0 ? 10 : 31;
      for (let i = 0; i < parents + rnd(3) + (round % 2 === 0 ? 0 : rnd(20)); i++) {
        let d = rnd(spread);
        while (taken.has(d)) d = (d + 1) % 31;
        taken.add(d);
        seats[`s${i}`] = d;
        if (i < parents) agents.push(agent(`s${i}`, null)); // the rest departed, seat kept
      }
      const kids = (n: number, from: number) =>
        Array.from({ length: n }, (_, i) =>
          agent("s0", `k${from + i}`, {
            arrivedAt: from + i,
            phase: rnd(4) === 0 ? "leaving" : "working",
          }),
        );
      const mem = freshMem();
      let all = [...agents, ...kids(rnd(8), 0)];
      for (let step = 0; step < 6; step++) {
        const before = mem.desks;
        const { layout, out } = scenePass(all, seats, mem, step * 20_000);
        for (const a of all) {
          if (a.agentId === null) continue;
          const had = before.get(a.key);
          if (typeof had === "number" && !Object.values(seats).includes(had)) {
            held++;
            expect(had).toBeLessThan(layout.desks.length);
            expect(out.workDeskOf.get(a.key)).toBe(had);
          }
          if (a.phase === "leaving" || before.has(a.key)) continue;
          checked++;
          if (layout.desks.length < DESK_CAP && !out.workDeskOf.has(a.key)) standing++;
        }
        // Some of them start to leave (they keep their desks), some sessions depart, a new batch arrives.
        all = [
          ...all
            .filter((a) => a.agentId !== null || a.sessionId === "s0" || rnd(4) !== 0)
            .map((a) =>
              a.agentId !== null && rnd(3) === 0
                ? { ...a, state: "leaving" as const, phase: "leaving" as const, leftAt: 1 }
                : a,
            ),
          ...kids(rnd(24), 100 * (step + 1)),
        ];
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(held).toBeGreaterThan(500);
    expect(standing).toBe(0);
  });
});

describe("stepRowHold (rows grow at once, shrink after the hold)", () => {
  it("starts at the larger of sessions and demand", () => {
    expect(stepRowHold(null, 1, 3, 0).rows).toBe(3);
    expect(stepRowHold(null, 2, 1, 0).rows).toBe(2);
  });
  it("grows immediately", () => {
    const a = stepRowHold(null, 1, 1, 0);
    expect(stepRowHold(a, 1, 2, 10).rows).toBe(2);
  });
  it("holds rows for 59999 ms of lower demand and shrinks at 60000", () => {
    const a = stepRowHold(null, 1, 2, 0);
    expect(stepRowHold(a, 1, 1, 59_999).rows).toBe(2);
    expect(HOLD_MS).toBe(60_000);
    expect(stepRowHold(a, 1, 1, 60_000).rows).toBe(1);
  });
  it("restarts the clock whenever demand reaches the held rows again", () => {
    let h = stepRowHold(null, 1, 2, 0);
    h = stepRowHold(h, 1, 1, 50_000);
    h = stepRowHold(h, 1, 2, 55_000);
    h = stepRowHold(h, 1, 1, 100_000);
    expect(h.rows).toBe(2);
    expect(stepRowHold(h, 1, 1, 114_999).rows).toBe(2);
    expect(stepRowHold(h, 1, 1, 115_000).rows).toBe(1);
  });
  it("floors the age at 0 when time goes backwards", () => {
    const a = stepRowHold(null, 1, 2, 100_000);
    expect(stepRowHold(a, 1, 1, 0).rows).toBe(2);
    expect(stepRowHold(a, 1, 1, 100_000 + 59_999).rows).toBe(2);
  });
  it("shrinks to the lower demand, not to the old sessions", () => {
    const a = stepRowHold(null, 1, 4, 0);
    expect(stepRowHold(a, 1, 2, 60_000).rows).toBe(2);
  });
  it("never goes below the session rows", () => {
    const a = stepRowHold(null, 3, 3, 0);
    expect(stepRowHold(a, 3, 1, 1_000_000).rows).toBe(3);
    expect(stepRowHold(a, 3, 1, 10).rows).toBe(3);
  });
  it("shrinks at once when sessions leave (nothing to hold for them)", () => {
    const a = stepRowHold(null, 3, 3, 0);
    expect(stepRowHold(a, 2, 2, 1).rows).toBe(2);
    expect(stepRowHold(a, 1, 1, 2).rows).toBe(1);
  });
  it("holds only the rows above the sessions when both shrink", () => {
    const a = stepRowHold(null, 2, 4, 0);
    const b = stepRowHold(a, 1, 1, 1_000);
    expect(b.rows).toBe(4);
    expect(stepRowHold(b, 1, 1, 60_000).rows).toBe(1);
  });
});

describe("newDeskIndexes", () => {
  it("lists none on the first render", () => {
    expect(newDeskIndexes(null, 8)).toEqual([]);
  });
  it("lists only the desks that did not exist", () => {
    expect(newDeskIndexes(4, 8)).toEqual([4, 5, 6, 7]);
    expect(newDeskIndexes(8, 12)).toEqual([8, 9, 10, 11]);
  });
  it("lists none when the room stays or shrinks", () => {
    expect(newDeskIndexes(8, 8)).toEqual([]);
    expect(newDeskIndexes(8, 4)).toEqual([]);
  });
});
