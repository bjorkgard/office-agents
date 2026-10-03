import { describe, expect, it, vi } from "vite-plus/test";
import { HANDOVER_MS, PAPER_MS, WALK_SPEED, stand, type SubagentCtx } from "./choreo";
import { DESK_KINDS, type Rect } from "./desk-kinds";
import { layoutOffice } from "./iso";
import type { Agent } from "./machine";
import {
  MAX_WAKE_MS,
  planMotion,
  type CacheEntry,
  type Motion,
  type SubMemory,
  type Trip,
} from "./motion";
import {
  PAPER_FADE_MS,
  PAPER_HOLD_MS,
  PAPER_MAX_MS,
  armPaperTimer,
  paperDelay,
  paperOfParent,
  paperOnDesk,
  stillPaperOnDesk,
} from "./paper";
import { PROPS } from "./props";
import { geometryFor } from "./scene-model";
import { agentKey } from "./machine";
import { DESK } from "./sprites";

const geo = geometryFor(layoutOffice(4, { width: 1200, height: 800 }));
const ctx = (over: Partial<SubagentCtx> = {}): SubagentCtx => ({
  geo,
  parentDesk: 0,
  workDesk: 1,
  ...over,
});
const sub = (
  arrivedAt: number,
  phase: Agent["phase"] = "working",
  leftAt: number | null = null,
) => ({
  phase,
  arrivedAt,
  leftAt,
});
const walkMs = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  (Math.hypot(b.x - a.x, b.y - a.y) / WALK_SPEED) * 1000;
const stop = stand(geo.slot(0, 0));
// Where the paper changes hands on arrival: door, walk to the stop, half the pause.
const takeover = (arrivedAt: number) => arrivedAt + walkMs(geo.door, stop) + PAPER_MS;
const working = { state: "working" } as const;
const waiting = { state: "waiting-on-subagents" } as const;
const at = (parent: { state: Agent["state"] }, subs: ReturnType<typeof sub>[], now: number) =>
  paperOnDesk(parent, subs, () => ctx(), now);

describe("paperOnDesk", () => {
  it("lies on the parent's desk from arrival until the subagent takes it", () => {
    const t = takeover(1000);
    const before = at(working, [sub(1000)], 999);
    expect(before.visible).toBe(false);
    expect(before.nextChange).toBe(1000);
    const lying = at(working, [sub(1000)], 1000);
    expect(lying).toMatchObject({ visible: true, since: 1000, nextChange: t });
    expect(at(working, [sub(1000)], t - 1).visible).toBe(true);
    const gone = at(working, [sub(1000)], t);
    expect(gone.visible).toBe(false);
    expect(gone.fading).toBe(true);
    expect(gone.nextChange).toBe(t + PAPER_FADE_MS);
    const done = at(working, [sub(1000)], t + PAPER_FADE_MS);
    expect(done).toMatchObject({ visible: false, fading: false, nextChange: null });
  });

  it("is a 600 ms fade", () => {
    expect(PAPER_FADE_MS).toBe(600);
    expect(HANDOVER_MS).toBeGreaterThan(0);
  });

  it("appears at the leaving handover and stays the hold time", () => {
    const left = sub(0, "leaving", 100_000);
    // Seated long ago: the leaver walks from its work desk to the handover stop.
    const from = stand(geo.seat(1));
    const handover = 100_000 + walkMs(from, stop) + PAPER_MS;
    expect(at(working, [left], handover - 1).visible).toBe(false);
    expect(at(working, [left], handover - 1).nextChange).toBe(handover);
    const shown = at(working, [left], handover);
    expect(shown).toMatchObject({ visible: true, since: handover });
    expect(shown.nextChange).toBe(handover + PAPER_HOLD_MS);
    expect(at(working, [left], handover + PAPER_HOLD_MS - 1).visible).toBe(true);
    expect(at(working, [left], handover + PAPER_HOLD_MS).visible).toBe(false);
  });

  it("stays while the parent waits, up to the cap, then fades", () => {
    const left = sub(0, "leaving", 100_000);
    const handover = 100_000 + walkMs(stand(geo.seat(1)), stop) + PAPER_MS;
    const held = at(waiting, [left], handover + PAPER_HOLD_MS + 1000);
    expect(held.visible).toBe(true);
    expect(held.nextChange).toBe(handover + PAPER_MAX_MS);
    expect(at(waiting, [left], handover + PAPER_MAX_MS - 1).visible).toBe(true);
    const capped = at(waiting, [left], handover + PAPER_MAX_MS);
    expect(capped.visible).toBe(false);
    expect(capped.fading).toBe(true);
    expect(at(waiting, [left], handover + PAPER_MAX_MS + PAPER_FADE_MS).fading).toBe(false);
  });

  it("holds 4 s and caps at 30 s", () => {
    expect(PAPER_HOLD_MS).toBe(4000);
    expect(PAPER_MAX_MS).toBe(30_000);
  });

  it("has no paper without a seat or without subagents", () => {
    const none = paperOnDesk(working, [], () => ctx(), 5000);
    expect(none).toEqual({ visible: false, fading: false, since: null, nextChange: null });
    const seatless = paperOnDesk(working, [sub(1000)], () => ctx({ parentDesk: null }), 1500);
    expect(seatless).toEqual({ visible: false, fading: false, since: null, nextChange: null });
  });

  it("lies nowhere for a resumed subagent: it walks straight on, no arrival sheet", () => {
    const none = paperOnDesk(
      working,
      [sub(1000)],
      () => ctx({ resume: { at: 1200, point: geo.door, mirror: false, carry: false } }),
      1500,
    );
    expect(none).toEqual({ visible: false, fading: false, since: null, nextChange: null });
  });

  it("reports the earliest start of two overlapping sheets", () => {
    const t = takeover(1000);
    const both = at(working, [sub(1500), sub(1000)], t - 1);
    expect(both.visible).toBe(true);
    expect(both.since).toBe(1000);
  });

  it("is a function of its inputs", () => {
    const args = [working, [sub(0, "leaving", 5000)], () => ctx(), 7000] as const;
    expect(paperOnDesk(...args)).toEqual(paperOnDesk(...args));
  });
});

const agentOf = (sessionId: string, agentId: string | null, over: Partial<Agent> = {}): Agent => ({
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
});

// Four seated sessions fill all four desks: A's subagents stand in slots 0 and 1, the third queues.
describe("paperOfParent against the walkers", () => {
  const layout = layoutOffice(4, { width: 1200, height: 800 });
  const seats = { A: 0, B: 1, C: 2, D: 3 };
  const parents = ["A", "B", "C", "D"].map((id) => agentOf(id, null));
  type Prev = {
    desks: Map<string, number | null>;
    trips: Map<string, Trip>;
    subs: Map<string, SubMemory>;
    cache: Map<string, CacheEntry>;
  };
  const plan = (
    agents: Agent[],
    now: number,
    prev?: Prev,
    reducedMotion = false,
    seated: Record<string, number> = seats,
  ): Motion =>
    planMotion({
      agents,
      seats: seated,
      layout,
      geo: geometryFor(layout),
      prevDesks: prev?.desks ?? new Map(),
      prevTrips: prev?.trips ?? new Map(),
      prevSubs: prev?.subs,
      prevCache: prev?.cache,
      reducedMotion,
      now,
    });
  const kid = (n: number, over: Partial<Agent> = {}) =>
    agentOf("A", `k${n}`, { arrivedAt: 1000, ...over });
  const parentA = parents[0];

  // The time the walker hands the paper over: its carryPaper drops after `from`.
  const handoverOf = (m: Motion, key: string, from: number) => {
    const drive = m.drives.get(key)!;
    const frame = (t: number) => drive.frame(t);
    expect(frame(from + 1).carryPaper).toBe(true);
    for (let t = from + 2; t < from + 20_000; t++) if (!frame(t).carryPaper) return t;
    throw new Error("never handed over");
  };
  // The time the sheet appears at or after `from`.
  const sheetAppears = (m: Motion, agents: Agent[], from: number) => {
    for (let t = from; t < from + 20_000; t++)
      if (paperOfParent(parentA, agents, m, false, t).visible) return t;
    throw new Error("no sheet");
  };

  const settled = [kid(1), kid(2), kid(3)];
  const before = plan([...parents, ...settled], 2000);

  it("shows the sheet of a slot-1 leaver when the walker hands it over", () => {
    const left = 60_000;
    const agents = [
      ...parents,
      kid(1),
      kid(2, { state: "leaving", phase: "leaving", leftAt: left }),
      kid(3),
    ];
    const m = plan(agents, left, before);
    expect(m.subs.get(agentKey("A", "k2"))!.ctx!.slotIndex).toBe(1);
    const hand = handoverOf(m, agentKey("A", "k2"), left);
    expect(Math.abs(sheetAppears(m, agents, left) - hand)).toBeLessThanOrEqual(1);
  });

  it("shows the sheet of a queued leaver when the walker hands it over", () => {
    const left = 60_000;
    const agents = [
      ...parents,
      kid(1),
      kid(2),
      kid(3, { state: "leaving", phase: "leaving", leftAt: left }),
    ];
    const m = plan(agents, left, before);
    const hand = handoverOf(m, agentKey("A", "k3"), left);
    expect(hand).toBeGreaterThan(left + 1000);
    expect(Math.abs(sheetAppears(m, agents, left) - hand)).toBeLessThanOrEqual(1);
  });

  it("gives a queued subagent that is not leaving no sheet", () => {
    const late = kid(3, { arrivedAt: 100_000 });
    const agents = [...parents, kid(1), kid(2), late];
    const m = plan(agents, 100_500, before);
    expect(m.subs.get(late.key)!.ctx).toBeNull();
    for (let t = 100_000; t < 106_000; t += 50)
      expect(paperOfParent(parentA, agents, m, false, t).visible).toBe(false);
  });

  it("gives parent A no sheet for another session's subagent, which does put one on its own parent", () => {
    const other = agentOf("B", "kb", { arrivedAt: 1000 });
    const agents = [...parents, other];
    const m = plan(agents, 1500);
    const parentB = parents[1];
    let b = 0;
    for (let t = 1000; t < 12_000; t += 50) {
      expect(paperOfParent(parentA, agents, m, false, t).visible).toBe(false);
      if (paperOfParent(parentB, agents, m, false, t).visible) b++;
    }
    expect(b).toBeGreaterThan(0);
  });

  it("under reduced motion follows state: arrival, then the leaving hold, fading only", () => {
    const left = 60_000;
    const lone = { A: 0 };
    const first = plan([parentA, kid(1)], 2000, undefined, true, lone);
    const agents = [parentA, kid(1, { state: "leaving", phase: "leaving", leftAt: left })];
    const m = plan(agents, left, first, true, lone);
    expect(m.workDeskOf.has(agentKey("A", "k1"))).toBe(true);
    expect(m.subs.size).toBe(0);
    const at = (t: number) => paperOfParent(parentA, agents, m, true, t);
    expect(at(1000).visible).toBe(true);
    expect(at(1000 + HANDOVER_MS).visible).toBe(false);
    expect(at(1000 + HANDOVER_MS).fading).toBe(true);
    expect(at(30_000)).toMatchObject({ visible: false, fading: false });
    expect(at(left)).toMatchObject({ visible: true, since: left });
    expect(at(left + PAPER_HOLD_MS).visible).toBe(false);
    expect(at(left + PAPER_HOLD_MS).fading).toBe(true);
  });

  it("under reduced motion gives an unplaced (queued) subagent no sheet", () => {
    const agents = [...parents, kid(1), kid(2), kid(3)];
    const m = plan(agents, 1500, undefined, true);
    expect(m.workDeskOf.has(agentKey("A", "k3"))).toBe(false);
    expect(m.plan.slot.has(agentKey("A", "k3"))).toBe(false);
    expect(stillPaperOnDesk(parentA, [kid(3)], 1500).visible).toBe(true);
    // Only the two placed ones count; with one of them gone the sheet is still theirs.
    const only = paperOfParent(parentA, [...parents, kid(3)], m, true, 1500);
    expect(only.visible).toBe(false);
  });
});

describe("paper timer", () => {
  it("rounds the delay up and adds 1 ms, whatever the fraction", () => {
    expect(paperDelay(1000.2, 1000)).toBe(2);
    expect(paperDelay(1000.9, 1000)).toBe(2);
    expect(paperDelay(1001, 1000)).toBe(2);
    expect(paperDelay(990, 1000)).toBe(1);
  });

  // Models Scene's effect: it re-runs (cancel, arm) on every render, and a fired timer renders
  // again through the tick. A timer that fires before the clock reaches the change must not
  // strand the sheet.
  it("arms nothing for no change or a NaN one, and cancels the id it scheduled", () => {
    const schedule = vi.fn(() => 42);
    const cancel = vi.fn();
    for (const next of [null, NaN]) {
      armPaperTimer(
        next,
        () => 0,
        () => {},
        schedule,
        cancel,
      )();
    }
    expect(schedule).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    armPaperTimer(
      5000,
      () => 0,
      () => {},
      schedule,
      cancel,
    )();
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledExactlyOnceWith(42);
  });

  it("caps the delay at the largest setTimeout can hold", () => {
    const schedule = vi.fn(() => 1);
    armPaperTimer(
      40 * 24 * 3600 * 1000,
      () => 0,
      () => {},
      schedule,
      () => {},
    );
    expect(schedule).toHaveBeenLastCalledWith(expect.any(Function), 2 ** 31 - 1);
    expect(MAX_WAKE_MS).toBe(2 ** 31 - 1);
  });

  it("leaves a near delay alone", () => {
    const schedule = vi.fn(() => 1);
    armPaperTimer(
      1000,
      () => 0,
      () => {},
      schedule,
      () => {},
    );
    expect(schedule).toHaveBeenLastCalledWith(expect.any(Function), 1001);
  });

  it("still shows the right sheet when the timer fires early", () => {
    const sub = [{ phase: "working", arrivedAt: 1000, leftAt: null } as const];
    const target = takeover(1000);
    let clock = 1000;
    let pending: (() => void) | null = null;
    let armed = 0;
    let shown = paperOnDesk(working, sub, () => ctx(), clock);
    const render = () => {
      shown = paperOnDesk(working, sub, () => ctx(), clock);
      armPaperTimer(
        shown.nextChange,
        () => clock,
        () => {
          pending = null;
          render();
        },
        (fn) => {
          armed += 1;
          pending = fn;
        },
        () => {},
      );
    };
    render();
    expect(shown.visible).toBe(true);
    // The timer fires 0.4 ms before the change.
    clock = target - 0.4;
    pending!();
    expect(shown.visible).toBe(true);
    // The render armed the next timer, which fires after the change.
    expect(pending).not.toBeNull();
    clock = target + 1;
    pending!();
    expect(shown.fading).toBe(true);
    expect(armed).toBe(3);
  });
});

describe("PAPER_DESK", () => {
  // Same top-surface rule as desk-kinds.test.ts (plain top wood above the front-right edge).
  const isTop = (x: number, y: number) => DESK[y][x] === "w" && y <= 40 + (61 - x) * 0.45;
  const inRect = (r: Rect, x: number, y: number) =>
    x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

  it("is a known prop that fits its slot", () => {
    const grid = PROPS.PAPER_DESK;
    for (const k of DESK_KINDS) {
      expect(grid[0].length).toBeLessThanOrEqual(k.paperSlot.w);
      expect(grid.length).toBeLessThanOrEqual(k.paperSlot.h);
    }
  });

  it("covers only top-surface cells inside the slot, in both kinds", () => {
    const grid = PROPS.PAPER_DESK;
    for (const k of DESK_KINDS)
      grid.forEach((row, j) =>
        row.split("").forEach((c, i) => {
          if (c === ".") return;
          const x = k.paperSlot.x + i;
          const y = k.paperSlot.y + j;
          expect(inRect(k.paperSlot, x, y), `${k.id} ${x},${y}`).toBe(true);
          expect(isTop(x, y), `${k.id} ${x},${y}`).toBe(true);
        }),
      );
  });

  it("is skewed: columns step down one row for every two across", () => {
    const grid = PROPS.PAPER_DESK;
    const top = (col: number) => grid.findIndex((r) => r[col] !== ".");
    expect(top(0)).toBe(top(1));
    expect(top(2)).toBe(top(0) + 1);
    expect(top(3)).toBe(top(2));
    expect(top(4)).toBe(top(2) + 1);
  });
});
