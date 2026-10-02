import { describe, expect, it } from "vite-plus/test";
import design from "../../DESIGN.md?raw";
import { tokenRows } from "../design-md";
import { agentKey, type Agent } from "./machine";
import type { AgentState } from "./poses";
import { DESK_HEIGHT, DESK_WIDTH, RIG_HEIGHT, RIG_WIDTH } from "./CharacterRig";
import { layoutOffice } from "./iso";
import { CELL } from "./pixel";
import { DESK, FRAMES, HEAD_ANCHOR } from "./sprites";
import {
  assignShirts,
  deskCountFor,
  bubbleText,
  geometryFor,
  lookFor,
  lostFocus,
  planSubagents,
  SLOTS_PER_DESK,
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

  it("lights the monitor only while working", () => {
    expect(STATES.filter((s) => lookFor(s).lit)).toEqual(["working"]);
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
  it("keeps a project's shirt while it stays active, gives new ones distinct shirts", () => {
    const a = assignShirts({}, { a: "/x/a", b: "/x/b" }, ["a", "b"]);
    expect(a.a).not.toEqual(a.b);
    const again = assignShirts(a, { a: "/x/a", b: "/x/b", c: "/x/c" }, ["c", "b", "a"]);
    expect(again.a).toEqual(a.a);
    expect(again.b).toEqual(a.b);
    expect(again.c).not.toEqual(a.a);
    expect(again.c).not.toEqual(a.b);
  });

  it("drops inactive projects and skips unknown paths", () => {
    const a = assignShirts({}, { a: "/x/a" }, ["a", "ghost"]);
    expect(Object.keys(a)).toEqual(["a"]);
    expect(Object.keys(assignShirts(a, { a: "/x/a" }, []))).toEqual([]);
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
