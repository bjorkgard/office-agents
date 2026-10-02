import { describe, expect, it } from "vite-plus/test";
import { layoutOffice } from "./iso";
import { TUNING, type Agent } from "./machine";
import { roomShell, type Point } from "./room";
import { geometryFor, SEATED_FOOT, STANDING_FOOT } from "./scene-model";
import {
  COFFEE_DWELL_MS,
  FADE_MS,
  HANDOVER_MS,
  IDLE_BEFORE_TRIP_MS,
  PAPER_MS,
  RETURN_CAP_MS,
  STRIDE_LENGTH,
  STRIDE_MS,
  WALK_SPEED,
  assignWorkDesks,
  idleTrip,
  subagentArrivalMs,
  subagentLeaveMs,
  subagentPath,
  waitTrip,
  type Sample,
  type SubagentCtx,
  type TripCtx,
} from "./choreo";

const view = { width: 1024, height: 768 };
const counts = [1, 4, 8, 12, 24];

const inside = (poly: Point[], p: Point) => {
  const sides = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  });
  return sides.every((v) => v >= -1e-6) || sides.every((v) => v <= 1e-6);
};
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const stand = (p: Point): Point => ({ x: p.x, y: p.y - SEATED_FOOT + STANDING_FOOT });

const sub = (key: string, arrivedAt: number, phase: Agent["phase"] = "working") => ({
  key,
  arrivedAt,
  phase,
});

describe("assignWorkDesks", () => {
  const none = new Map<string, number | null>();

  it("picks the lowest empty desk and never a seated one", () => {
    const got = assignWorkDesks(none, [sub("a", 1), sub("b", 2)], new Set([0, 2]), 5);
    expect([...got]).toEqual([
      ["a", 1],
      ["b", 3],
    ]);
  });

  it("goes by arrival order, ties by key, whatever the input order", () => {
    const got = assignWorkDesks(none, [sub("z", 5), sub("b", 5), sub("a", 9)], new Set([0]), 4);
    expect(got.get("b")).toBe(1);
    expect(got.get("z")).toBe(2);
    expect(got.get("a")).toBe(3);
  });

  it("is stable when called again with the previous map", () => {
    const agents = [sub("a", 1), sub("b", 2)];
    const first = assignWorkDesks(none, agents, new Set([0]), 4);
    // A newcomer arriving earlier in sort order must not shuffle the holders.
    const again = assignWorkDesks(first, [sub("c", 0), ...agents], new Set([0]), 4);
    expect(again.get("a")).toBe(first.get("a"));
    expect(again.get("b")).toBe(first.get("b"));
    expect(assignWorkDesks(again, [sub("c", 0), ...agents], new Set([0]), 4)).toEqual(again);
  });

  it("gives null when no empty desk exists, and keeps it null", () => {
    const got = assignWorkDesks(none, [sub("a", 1)], new Set([0]), 1);
    expect(got.get("a")).toBeNull();
    expect(assignWorkDesks(got, [sub("a", 1)], new Set([0]), 4).get("a")).toBeNull();
    expect(assignWorkDesks(none, [sub("a", 1), sub("b", 2)], new Set(), 1).get("b")).toBeNull();
  });

  it("reassigns only when a seated session takes its desk", () => {
    const first = assignWorkDesks(none, [sub("a", 1)], new Set([0]), 4);
    expect(first.get("a")).toBe(1);
    expect(assignWorkDesks(first, [sub("a", 1)], new Set([0, 3]), 4).get("a")).toBe(1);
    const moved = assignWorkDesks(first, [sub("a", 1)], new Set([0, 1]), 4);
    expect(moved.get("a")).toBe(2);
    const stuck = assignWorkDesks(first, [sub("a", 1)], new Set([0, 1, 2, 3]), 4);
    expect(stuck.get("a")).toBeNull();
  });

  it("drops agents that are gone and frees their desk; a leaver gets no new desk", () => {
    const first = assignWorkDesks(none, [sub("a", 1), sub("b", 2)], new Set([0]), 4);
    const after = assignWorkDesks(first, [sub("b", 2), sub("c", 3, "leaving")], new Set([0]), 4);
    expect(after.has("a")).toBe(false);
    expect(after.get("b")).toBe(2);
    expect(after.get("c")).toBeNull();
  });

  it("never hands one desk to two agents", () => {
    const got = assignWorkDesks(new Map([["a", 1]]), [sub("a", 5), sub("b", 1)], new Set([0]), 3);
    expect(new Set([got.get("a"), got.get("b")]).size).toBe(2);
  });
});

describe("subagentPath", () => {
  const layout = layoutOffice(4, view);
  const geo = geometryFor(layout);
  const floor = roomShell(layout).floor;
  const ctx: SubagentCtx = { geo, parentDesk: 0, workDesk: 2 };
  const parentSpot = stand(geo.slot(0, 0));
  const home = stand(geo.seat(2));
  const arrived = { phase: "arriving" as const, arrivedAt: 1000, leftAt: null };
  const leaving = { phase: "leaving" as const, arrivedAt: 1000, leftAt: 50_000 };
  const at = (a: typeof arrived | typeof leaving, now: number) => subagentPath(a, ctx, now)!;

  function walk(a: typeof arrived | typeof leaving, from: number, ms: number, step = 10) {
    const out: { t: number; s: ReturnType<typeof at> }[] = [];
    for (let t = from; t <= from + ms; t += step) out.push({ t, s: at(a, t) });
    return out;
  }

  it("starts at the door, arriving, and ends seated at the work desk", () => {
    const first = at(arrived, 1000);
    expect(dist(first, geo.door)).toBeLessThan(1);
    expect(first.phase).toBe("arriving");
    expect(first.carryPaper).toBe(false);
    const end = at(arrived, 1000 + subagentArrivalMs(ctx)! + 1);
    expect(dist(end, home)).toBeLessThan(1e-6);
    expect(end).toMatchObject({ phase: "working", pose: "seated-typing", carryPaper: false });
    expect(end.mirror).toBe(false);
  });

  it("never jumps more than speed * dt between consecutive frames", () => {
    for (const a of [arrived, leaving]) {
      const ms = (a === arrived ? subagentArrivalMs(ctx)! : subagentLeaveMs(ctx)!) + 500;
      const frames = walk(a, a === arrived ? 1000 : 50_000, ms, 10);
      for (let i = 1; i < frames.length; i++) {
        const dt = frames[i].t - frames[i - 1].t;
        expect(dist(frames[i].s, frames[i - 1].s)).toBeLessThanOrEqual(
          (WALK_SPEED * dt) / 1000 + 1e-6,
        );
      }
    }
  });

  it("passes the parent's desk before the work desk, pausing there", () => {
    const frames = walk(arrived, 1000, subagentArrivalMs(ctx)!, 5);
    const near = (p: Point) => frames.filter((f) => dist(f.s, p) < 1).map((f) => f.t);
    const atParent = near(parentSpot);
    const atHome = near(home);
    expect(atParent[0]).toBeLessThan(atHome[0]);
    expect(atParent[atParent.length - 1] - atParent[0]).toBeGreaterThanOrEqual(HANDOVER_MS - 10);
  });

  it("carries the paper from the middle of the pickup pause until it sits down", () => {
    const frames = walk(arrived, 1000, subagentArrivalMs(ctx)! + 1000, 5);
    const on = frames.filter((f) => f.s.carryPaper);
    const firstOn = on[0].s;
    expect(dist(firstOn, parentSpot)).toBeLessThan(1);
    // contiguous: every frame between the first and last carrying frame carries
    const i0 = frames.indexOf(on[0]);
    const i1 = frames.indexOf(on[on.length - 1]);
    expect(frames.slice(i0, i1 + 1).every((f) => f.s.carryPaper)).toBe(true);
    expect(on[0].t - frames.find((f) => dist(f.s, parentSpot) < 1)!.t).toBeGreaterThanOrEqual(
      PAPER_MS - 10,
    );
    expect(dist(on[on.length - 1].s, home)).toBeLessThan(WALK_SPEED * 0.01 + 1);
    expect(frames[frames.length - 1].s.carryPaper).toBe(false);
  });

  it("leaves via the parent's desk, hands the paper over, then the door, and fades", () => {
    const first = at(leaving, 50_000);
    expect(dist(first, home)).toBeLessThan(1e-6);
    expect(first).toMatchObject({ phase: "leaving", carryPaper: true, opacity: 1 });
    const frames = walk(leaving, 50_000, subagentLeaveMs(ctx)! + 500, 5);
    const near = (p: Point) => frames.filter((f) => dist(f.s, p) < 1).map((f) => f.t);
    const atParent = near(parentSpot);
    const atDoor = near(geo.door);
    expect(atParent[0]).toBeLessThan(atDoor[0]);
    // carrying on arrival at the parent, dropped by the end of the pause, never again
    expect(frames.find((f) => dist(f.s, parentSpot) < 1)!.s.carryPaper).toBe(true);
    const drop = frames.findIndex((f) => !f.s.carryPaper);
    expect(frames[drop].t - atParent[0]).toBeGreaterThanOrEqual(PAPER_MS - 10);
    expect(frames.slice(drop).every((f) => !f.s.carryPaper)).toBe(true);
    // faded out at the door
    const last = frames[frames.length - 1].s;
    expect(dist(last, geo.door)).toBeLessThan(1e-6);
    expect(last.opacity).toBe(0);
    expect(frames.filter((f) => f.s.opacity < 1).every((f) => dist(f.s, geo.door) < 1e-6)).toBe(
      true,
    );
    expect(frames.find((f) => f.s.opacity < 1)!.t).toBeGreaterThanOrEqual(atDoor[0] - 10);
    expect(FADE_MS).toBeGreaterThan(0);
  });

  it("snaps to the desk when first seen long after arriving", () => {
    const s = at(arrived, 1000 + 10 * 60_000);
    expect(dist(s, home)).toBeLessThan(1e-6);
    expect(s).toMatchObject({ phase: "working", carryPaper: false, opacity: 1 });
  });

  it("a leaver caught mid-arrival continues from where it was", () => {
    const early = { phase: "leaving" as const, arrivedAt: 1000, leftAt: 1000 + 700 };
    const before = at(arrived, 1000 + 700);
    const after = at(early, 1000 + 700);
    expect(dist(before, after)).toBeLessThan(1e-6);
    const frames = walk(early, 1700, 12_000, 10);
    for (let i = 1; i < frames.length; i++) {
      expect(dist(frames[i].s, frames[i - 1].s)).toBeLessThanOrEqual(WALK_SPEED * 0.01 + 1e-6);
    }
  });

  it("falls back to the standing slot and to nothing", () => {
    const slotCtx: SubagentCtx = { geo, parentDesk: 0, workDesk: null, slotIndex: 1 };
    const end = subagentPath(arrived, slotCtx, 1_000_000)!;
    expect(dist(end, stand(geo.slot(0, 1)))).toBeLessThan(1e-6);
    expect(subagentPath(arrived, { geo, parentDesk: null, workDesk: null }, 5000)).toBeNull();
    const noParent = subagentPath(arrived, { geo, parentDesk: null, workDesk: 1 }, 1_000_000)!;
    expect(dist(noParent, stand(geo.seat(1)))).toBeLessThan(1e-6);
  });

  it("faces the way it walks (mirror when heading screen-left)", () => {
    const frames = walk(arrived, 1000, subagentArrivalMs(ctx)!, 10);
    for (let i = 1; i < frames.length; i++) {
      const dx = frames[i].s.x - frames[i - 1].s.x;
      if (frames[i].s.pose !== "walking" || Math.abs(dx) < 0.5) continue;
      expect(frames[i].s.mirror).toBe(dx < 0);
    }
    const out = walk(leaving, 50_000, subagentLeaveMs(ctx)!, 10);
    for (let i = 1; i < out.length; i++) {
      const dx = out[i].s.x - out[i - 1].s.x;
      if (Math.abs(dx) < 0.5) continue;
      expect(out[i].s.mirror).toBe(dx < 0);
    }
  });

  it("stays inside the floor for every parent and work desk in every room", () => {
    let longest = 0;
    for (const n of counts) {
      const l = layoutOffice(n, view);
      const g = geometryFor(l);
      const shell = roomShell(l);
      for (let p = 0; p < n; p++) {
        for (const w of [null, ...Array.from({ length: n }, (_, i) => i)]) {
          if (w === p) continue;
          const c: SubagentCtx = { geo: g, parentDesk: p, workDesk: w, slotIndex: 0 };
          const arriveMs = subagentArrivalMs(c)!;
          const leaveMs = subagentLeaveMs(c)!;
          longest = Math.max(longest, leaveMs);
          for (const [a, from, ms] of [
            [arrived, 1000, arriveMs],
            [leaving, 50_000, leaveMs],
          ] as const) {
            for (let t = 0; t <= ms + 100; t += 100) {
              const s = subagentPath(a, c, from + t)!;
              expect(inside(shell.floor, s)).toBe(true);
            }
          }
        }
      }
    }
    expect(inside(floor, geo.door)).toBe(true);
    // the machine keeps a leaving subagent long enough for the longest walk-out
    expect(longest).toBeLessThanOrEqual(TUNING.subagentLeavingMs);
  });
});

describe("coffee trips", () => {
  const layout = layoutOffice(4, view);
  const geo = geometryFor(layout);
  const floor = roomShell(layout).floor;
  const ctx: TripCtx = { geo, desk: 1, spot: 0, seatPose: "seated-idle" };
  const seat = stand(geo.seat(1));
  const cup = geo.coffeeSpot(0);
  const T0 = 10_000;
  const trip = (now: number, resumed: number | null = null) => idleTrip(ctx, T0, resumed, now);
  const phases = (samples: { phase: string }[]) =>
    samples.map((s) => s.phase).filter((p, i, all) => i === 0 || p !== all[i - 1]);
  const run = (ms: number, resumed: number | null = null, step = 10) => {
    const out: { t: number; s: ReturnType<typeof trip> }[] = [];
    for (let t = 0; t <= ms; t += step) out.push({ t, s: trip(T0 + t, resumed) });
    return out;
  };
  const walkMs = (dist(seat, cup) / WALK_SPEED) * 1000;

  it("sits idle, walks to the coffee spot, dwells with the mug, walks back and sits", () => {
    const frames = run(IDLE_BEFORE_TRIP_MS + 2 * walkMs + COFFEE_DWELL_MS + 1000);
    expect(phases(frames.map((f) => f.s))).toEqual([
      "seated",
      "to-coffee",
      "at-coffee",
      "back",
      "seated",
    ]);
    expect(frames[0].s).toMatchObject({ pose: "seated-idle", phase: "seated" });
    expect(dist(frames[0].s, seat)).toBeLessThan(1e-6);
    const dwell = frames.filter((f) => f.s.phase === "at-coffee");
    expect(dwell.every((f) => f.s.pose === "standing-mug" && dist(f.s, cup) < 1e-6)).toBe(true);
    expect(dwell[dwell.length - 1].t - dwell[0].t).toBeGreaterThanOrEqual(COFFEE_DWELL_MS - 10);
    expect(
      frames.filter((f) => f.s.phase === "to-coffee").every((f) => f.s.pose === "walking"),
    ).toBe(true);
    const end = frames[frames.length - 1].s;
    expect(dist(end, seat)).toBeLessThan(1e-6);
    expect(end).toMatchObject({ pose: "seated-idle", mirror: false });
  });

  it("moves smoothly and stays on the floor", () => {
    const frames = run(IDLE_BEFORE_TRIP_MS + 2 * walkMs + COFFEE_DWELL_MS + 500);
    for (let i = 1; i < frames.length; i++) {
      expect(dist(frames[i].s, frames[i - 1].s)).toBeLessThanOrEqual(WALK_SPEED * 0.01 + 1e-6);
      expect(inside(floor, frames[i].s)).toBe(true);
    }
  });

  it("is deterministic from the time idle began", () => {
    const a = trip(T0 + 4321);
    expect(trip(T0 + 4321)).toEqual(a);
    expect(idleTrip(ctx, 5, null, 5 + 4321)).toEqual(a);
  });

  it("a trip in progress when work resumes walks straight back within a second", () => {
    for (const resumeAt of [IDLE_BEFORE_TRIP_MS + 300, IDLE_BEFORE_TRIP_MS + walkMs + 3000]) {
      const r = T0 + resumeAt;
      const before = trip(r - 1, r);
      expect(dist(trip(r, r), before)).toBeLessThan(WALK_SPEED * 0.002 + 1e-6);
      const frames: Sample[] = [];
      for (let t = 0; t <= RETURN_CAP_MS + 10; t += 10) frames.push(trip(r + t, r));
      expect(frames[0].pose).toBe("walking");
      const end = frames[frames.length - 1];
      expect(dist(end, seat)).toBeLessThan(1e-6);
      expect(end.pose).toBe("seated-idle");
      for (const f of frames) expect(inside(floor, f)).toBe(true);
    }
  });

  it("work resuming before the trip starts changes nothing", () => {
    const r = T0 + 500;
    expect(trip(r + 3000, r)).toMatchObject({ phase: "seated", pose: "seated-idle" });
    expect(dist(trip(r + 3000, r), seat)).toBeLessThan(1e-6);
  });

  it("a waiting parent walks at once, stays while the wait lasts, then returns", () => {
    const w = (now: number, resumed: number | null = null) =>
      waitTrip({ ...ctx, seatPose: "seated-typing" }, T0, resumed, now);
    expect(w(T0 + 1)).toMatchObject({ phase: "to-coffee", pose: "walking" });
    expect(w(T0 + walkMs + 60_000)).toMatchObject({ phase: "at-coffee", pose: "standing-mug" });
    const r = T0 + walkMs + 5000;
    const end = w(r + RETURN_CAP_MS + 1, r);
    expect(end).toMatchObject({ phase: "seated", pose: "seated-typing" });
    expect(dist(end, seat)).toBeLessThan(1e-6);
  });

  it("every agent's coffee spot is on the floor, in every room", () => {
    for (const n of counts) {
      const l = layoutOffice(n, view);
      const g = geometryFor(l);
      const shell = roomShell(l);
      for (let d = 0; d < n; d++) {
        const c: TripCtx = { geo: g, desk: d, spot: Math.min(d, 5), seatPose: "seated-idle" };
        for (let t = 0; t <= IDLE_BEFORE_TRIP_MS + 20_000; t += 250) {
          expect(inside(shell.floor, idleTrip(c, 0, null, t))).toBe(true);
        }
      }
    }
  });
});

describe("stride cadence", () => {
  it("is the stride length over the walking speed", () => {
    expect(STRIDE_MS).toBe((STRIDE_LENGTH / WALK_SPEED) * 1000);
  });
});
