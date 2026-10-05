import { describe, expect, it } from "vite-plus/test";
import { breakPlan, COOLDOWN_MIN_MS, pickDrink } from "./breaks";
import { layoutOffice } from "./iso";
import { TUNING, type Agent } from "./machine";
import { COFFEE_SPOTS, roomShell, type Point } from "./room";
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
  subagentDoorAt,
  subagentLeaveMs,
  subagentPath,
  idleTripNext,
  waitTrip,
  waitTripNext,
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

  // Value: protects=the door opens exactly when a leaver reaches it (paper.ts reads this time);
  // fails_when=subagentDoorAt drifts from the path subagentPath walks, or gains a leaver that never
  // arrives; why_new=paper.test only checks the windows built from it, not it against the path;
  // seam=none
  it("subagentDoorAt is when a leaver first stands at the door, before its fade", () => {
    const reach = subagentDoorAt(leaving, ctx)!;
    expect(reach).toBeGreaterThan(leaving.leftAt);
    expect(dist(at(leaving, reach + FADE_MS), geo.door)).toBeLessThan(1);
    expect(dist(at(leaving, reach), geo.door)).toBeLessThan(1);
    expect(at(leaving, reach).opacity).toBe(1);
    expect(at(leaving, reach + FADE_MS / 2).opacity).toBeLessThan(1);
    expect(dist(at(leaving, reach - 100), geo.door)).toBeGreaterThan(1);
  });

  it("subagentDoorAt is null for a non-leaver and for a leaver with no home", () => {
    expect(subagentDoorAt(arrived, ctx)).toBeNull();
    expect(subagentDoorAt(leaving, { geo, parentDesk: null, workDesk: null })).toBeNull();
  });

  it("a resumed leaver still reaches the door", () => {
    const resumed: SubagentCtx = {
      ...ctx,
      resume: { at: 20_000, point: stand(geo.slot(0, 0)), mirror: false, carry: false },
    };
    const reach = subagentDoorAt(leaving, resumed)!;
    expect(reach).toBeGreaterThan(leaving.leftAt);
    expect(dist(subagentPath(leaving, resumed, reach + FADE_MS)!, geo.door)).toBeLessThan(1);
    expect(subagentPath(leaving, resumed, reach)!.opacity).toBe(1);
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

/** The first seed `k0`, `k1`, ... for which `ok` holds: pins a drink choice without a hook. */
const seedWhere = (ok: (seed: string) => boolean) => {
  for (let i = 0; i < 5000; i++) if (ok(`k${i}`)) return `k${i}`;
  throw new Error("seedWhere: no seed among k0..k4999 satisfies the predicate");
};

describe("coffee trips", () => {
  const layout = layoutOffice(4, view);
  const geo = geometryFor(layout);
  const floor = roomShell(layout).floor;
  const T0 = 10_000;
  // Idle trips pick their drink from the seed and the idle start; this seed picks coffee at T0.
  const coffeeSeed = seedWhere((s) => pickDrink(s, T0) === "coffee");
  const ctx: TripCtx = { geo, desk: 1, spot: 0, seatPose: "seated-idle", seed: coffeeSeed };
  const seat = stand(geo.seat(1));
  const cup = geo.coffeeSpot(0);
  const trip = (now: number, resumed: number | null = null) => idleTrip(ctx, T0, resumed, now);
  const phases = (samples: { phase: string }[]) =>
    samples.map((s) => s.phase).filter((p, i, all) => i === 0 || p !== all[i - 1]);
  const run = (ms: number, resumed: number | null = null, step = 10) => {
    const out: { t: number; s: ReturnType<typeof trip> }[] = [];
    for (let t = 0; t <= ms; t += step) out.push({ t, s: trip(T0 + t, resumed) });
    return out;
  };
  const walkMs = (dist(seat, cup) / WALK_SPEED) * 1000;
  // A waiting parent's plan is timed with the longest walk over every spot, not its own spot's.
  const plannedWalk = (g: typeof geo, desk: number, drink: "coffee" | "water") =>
    Math.max(
      ...Array.from({ length: COFFEE_SPOTS }, (_, i) => {
        const to = drink === "water" ? g.waterSpot(i) : g.coffeeSpot(i);
        return (dist(stand(g.seat(desk)), to) / WALK_SPEED) * 1000;
      }),
    );
  const planFor = (seed: string, g = geo, desk = 1) =>
    breakPlan(seed, plannedWalk(g, desk, "coffee"), plannedWalk(g, desk, "water"));

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

  describe("a waiting parent", () => {
    // Every cycle of the first four takes coffee, so the walks match the plan's (the water
    // cycles are in "drinks" below).
    const waitSeed = seedWhere((s) => [0, 1, 2, 3].every((c) => pickDrink(s, c) === "coffee"));
    const wctx: TripCtx = { ...ctx, seatPose: "seated-typing", seed: waitSeed };
    const plan = planFor(waitSeed);
    const w = (now: number, resumed: number | null = null, since = T0) =>
      waitTrip(wctx, since, resumed, now);
    const at = (cycle: number, off: number) => T0 + plan.start(cycle) + off;

    it("walks at once and stays at the station the planned dwell", () => {
      expect(w(T0)).toMatchObject({ phase: "to-coffee", pose: "walking" });
      expect(w(at(0, walkMs + 1))).toMatchObject({ phase: "at-coffee", pose: "standing-mug" });
      const dwell = plan.dwellMs(0);
      expect(w(at(0, walkMs + dwell - 1)).phase).toBe("at-coffee");
      expect(w(at(0, walkMs + dwell + 1)).phase).toBe("back");
    });

    it("sits through the planned cooldown, then goes again at the exact computed time", () => {
      for (const c of [0, 1, 2]) {
        const seated = at(c, 2 * walkMs + plan.dwellMs(c) + 5);
        expect(w(seated)).toMatchObject({ phase: "seated", pose: "seated-typing" });
        expect(dist(w(seated), seat)).toBeLessThan(1e-6);
        expect(w(at(c + 1, -1)).phase).toBe("seated");
        expect(w(at(c + 1, 1)).phase).toBe("to-coffee");
        expect(w(at(c + 1, walkMs + 1)).phase).toBe("at-coffee");
      }
    });

    it("is reload-stable: the same wait start gives the same frame at any time", () => {
      for (const off of [0, 7_000, 90_000, 400_000]) {
        expect(w(T0 + off)).toEqual(waitTrip({ ...wctx }, T0, null, T0 + off));
      }
      const other = { ...wctx, seed: `${waitSeed}-other` };
      const offs = Array.from({ length: 60 }, (_, i) => i * 5_000);
      expect(offs.some((o) => waitTrip(other, T0, null, T0 + o).phase !== w(T0 + o).phase)).toBe(
        true,
      );
    });

    it("returns within the cap from any phase when the wait ends", () => {
      const resumes = [
        at(0, 300),
        at(0, walkMs + 2000),
        at(0, 2 * walkMs + plan.dwellMs(0) - 200),
        at(0, 2 * walkMs + plan.dwellMs(0) + 3000),
        at(1, walkMs + 1000),
      ];
      for (const r of resumes) {
        const end = w(r + RETURN_CAP_MS + 1, r);
        expect(end).toMatchObject({ phase: "seated", pose: "seated-typing" });
        expect(dist(end, seat)).toBeLessThan(1e-6);
        // later frames stay seated: no second break once the wait ended
        expect(w(r + 200_000, r)).toMatchObject({ phase: "seated" });
        for (let t = 0; t <= RETURN_CAP_MS; t += 50) expect(inside(floor, w(r + t, r))).toBe(true);
      }
    });

    it("reports when the output next changes", () => {
      const next = (now: number, resumed: number | null = null) =>
        waitTripNext(wctx, T0, resumed, now);
      // walking: it moves now
      expect(next(at(0, 100))).toBe(at(0, 100));
      // at the station: when the dwell ends
      expect(next(at(0, walkMs + 50))).toBe(at(0, walkMs + plan.dwellMs(0)));
      // walking back: now
      expect(next(at(0, walkMs + plan.dwellMs(0) + 50))).toBe(at(0, walkMs + plan.dwellMs(0) + 50));
      // cooldown: the next cycle's start
      expect(next(at(0, 2 * walkMs + plan.dwellMs(0) + 10))).toBe(at(1, 0));
      // wait over and seated: never
      const r = at(0, walkMs + 1000);
      expect(next(r + RETURN_CAP_MS + 5, r)).toBeNull();
      // wait over while seated in the cooldown: nothing will move
      const rc = at(0, 2 * walkMs + plan.dwellMs(0) + 100);
      expect(next(rc + 50, rc)).toBeNull();
    });
  });

  it("an idle trip reports its next change and never changes once seated again", () => {
    const n = (now: number, resumed: number | null = null) => idleTripNext(ctx, T0, resumed, now);
    expect(n(T0 + 100)).toBe(T0 + IDLE_BEFORE_TRIP_MS);
    expect(n(T0 + IDLE_BEFORE_TRIP_MS + 100)).toBe(T0 + IDLE_BEFORE_TRIP_MS + 100);
    expect(n(T0 + IDLE_BEFORE_TRIP_MS + walkMs + 100)).toBe(
      T0 + IDLE_BEFORE_TRIP_MS + walkMs + COFFEE_DWELL_MS,
    );
    expect(n(T0 + IDLE_BEFORE_TRIP_MS + 2 * walkMs + COFFEE_DWELL_MS + 100)).toBeNull();
  });

  describe("drinks", () => {
    const water = geo.waterSpot(0);
    const waterSeed = seedWhere((s) => pickDrink(s, T0) === "water");
    const wctxIdle: TripCtx = { ...ctx, seed: waterSeed };
    const waterWalkMs = (dist(seat, water) / WALK_SPEED) * 1000;

    it("an idle water trip stands at the water spot with the cup, on the same clock", () => {
      const at = (off: number) => idleTrip(wctxIdle, T0, null, T0 + off);
      expect(at(IDLE_BEFORE_TRIP_MS + 100)).toMatchObject({ phase: "to-coffee", pose: "walking" });
      const dwellStart = IDLE_BEFORE_TRIP_MS + waterWalkMs;
      for (const off of [dwellStart + 1, dwellStart + COFFEE_DWELL_MS - 1]) {
        const s = at(off);
        expect(s).toMatchObject({ phase: "at-coffee", pose: "standing-cup" });
        expect(dist(s, water)).toBeLessThan(1e-6);
      }
      expect(at(dwellStart + COFFEE_DWELL_MS + 1).phase).toBe("back");
      const end = at(dwellStart + COFFEE_DWELL_MS + waterWalkMs + 1);
      expect(end).toMatchObject({ phase: "seated", pose: "seated-idle" });
      expect(dist(end, seat)).toBeLessThan(1e-6);
    });

    it("a coffee trip still stands at the coffee spot with the mug", () => {
      const s = idleTrip(ctx, T0, null, T0 + IDLE_BEFORE_TRIP_MS + walkMs + 100);
      expect(s).toMatchObject({ pose: "standing-mug" });
      expect(dist(s, cup)).toBeLessThan(1e-6);
    });

    it("an idle trip's next change follows the water walk", () => {
      const n = (off: number) => idleTripNext(wctxIdle, T0, null, T0 + off);
      expect(n(IDLE_BEFORE_TRIP_MS + waterWalkMs + 100)).toBe(
        T0 + IDLE_BEFORE_TRIP_MS + waterWalkMs + COFFEE_DWELL_MS,
      );
      expect(n(IDLE_BEFORE_TRIP_MS + 2 * waterWalkMs + COFFEE_DWELL_MS + 100)).toBeNull();
    });

    it("a waiting parent picks per cycle, and every cycle keeps the plan's start times", () => {
      const seed = seedWhere(
        (s) => new Set([0, 1, 2, 3, 4, 5].map((c) => pickDrink(s, c))).size === 2,
      );
      const c: TripCtx = { ...ctx, seatPose: "seated-typing", seed };
      const plan = planFor(seed);
      const w = (now: number) => waitTrip(c, T0, null, now);
      for (let cycle = 0; cycle < 6; cycle++) {
        const drink = pickDrink(seed, cycle);
        const spot = drink === "water" ? water : cup;
        const walk = (dist(seat, spot) / WALK_SPEED) * 1000;
        const start = T0 + plan.start(cycle);
        const mid = w(start + walk + 1);
        expect(mid, `cycle ${cycle}`).toMatchObject({
          phase: "at-coffee",
          pose: drink === "water" ? "standing-cup" : "standing-mug",
        });
        expect(dist(mid, spot)).toBeLessThan(1e-6);
        expect(w(start + walk + plan.dwellMs(cycle) - 1).phase).toBe("at-coffee");
        expect(w(start + 2 * walk + plan.dwellMs(cycle) + 1).phase).toBe("seated");
        // the next cycle starts exactly when the plan says, whichever drink this one took
        expect(w(T0 + plan.start(cycle + 1) - 1).phase).toBe("seated");
        expect(w(T0 + plan.start(cycle + 1) + 1).phase).toBe("to-coffee");
      }
    });

    it("a waiting parent's seated tail is the plan's cooldown, and the next break starts on the plan, for both drinks", () => {
      const seed = seedWhere(
        (s) => new Set([0, 1, 2, 3, 4, 5].map((c) => pickDrink(s, c))).size === 2,
      );
      const c: TripCtx = { ...ctx, seatPose: "seated-typing", seed };
      const plan = planFor(seed);
      const seen = new Set<string>();
      for (let cycle = 0; cycle < 6; cycle++) {
        const drink = plan.drink(cycle);
        seen.add(drink);
        const walk = drink === "water" ? waterWalkMs : walkMs;
        const seatedAt = T0 + plan.start(cycle) + 2 * walk + plan.dwellMs(cycle);
        const next = T0 + plan.start(cycle + 1);
        // the seated rest is the plan's cooldown plus the walk this spot saves, never under 20 s
        const saved = 2 * (plannedWalk(geo, 1, drink) - walk);
        expect(next - seatedAt).toBeCloseTo(plan.cooldownMs(cycle) + saved, 6);
        expect(next - seatedAt).toBeGreaterThanOrEqual(COOLDOWN_MIN_MS);
        // and the wake-up lands exactly on the next cycle start, from anywhere in the tail
        for (const off of [1, plan.cooldownMs(cycle) / 2, plan.cooldownMs(cycle) - 1]) {
          expect(
            waitTripNext(c, T0, null, seatedAt + off),
            `${drink} ${cycle} +${off}`,
          ).toBeCloseTo(next, 6);
        }
      }
      expect([...seen].sort()).toEqual(["coffee", "water"]);
    });

    it("the seated rest is at least 20 s in every cycle, over layouts, desks, spots and seeds", () => {
      for (const n of [1, 4, 8]) {
        const l = layoutOffice(n, view);
        const g = geometryFor(l);
        for (let d = 0; d < n; d++) {
          for (let spot = 0; spot < 8; spot++) {
            const s = stand(g.seat(d));
            const walkOf = (dr: "coffee" | "water") =>
              (dist(s, dr === "water" ? g.waterSpot(spot) : g.coffeeSpot(spot)) / WALK_SPEED) *
              1000;
            const cx: TripCtx = {
              geo: g,
              desk: d,
              spot,
              seatPose: "seated-typing",
              seed: `rest${d}`,
            };
            const plan = planFor(cx.seed!, g, d);
            for (let cycle = 0; cycle < 8; cycle++) {
              const seatedAt =
                plan.start(cycle) + 2 * walkOf(plan.drink(cycle)) + plan.dwellMs(cycle);
              const probe = waitTripNext(cx, 0, null, seatedAt + 1);
              expect(probe).toBeCloseTo(plan.start(cycle + 1), 6);
              expect(plan.start(cycle + 1) - seatedAt).toBeGreaterThanOrEqual(COOLDOWN_MIN_MS);
            }
          }
        }
      }
    });
  });

  describe("a waiting parent's breaks do not depend on its coffee spot", () => {
    const seed = seedWhere(
      (s) => new Set([0, 1, 2, 3, 4, 5].map((c) => pickDrink(s, c))).size === 2,
    );
    const ctxAt = (desk: number, spot: number): TripCtx => ({
      geo,
      desk,
      spot,
      seatPose: "seated-typing",
      seed,
    });
    const spots = [0, COFFEE_SPOTS - 1];
    const CYCLES = 6;

    it("has the same cycle starts and phase boundaries whatever the spot, over several cycles", () => {
      const awayStarts = (spot: number) => {
        const c = ctxAt(1, spot);
        const out: number[] = [];
        let prev = "seated";
        const plan = planFor(seed);
        for (let t = 0; t < plan.start(CYCLES); t += 25) {
          const phase = waitTrip(c, 0, null, t).phase;
          if (prev === "seated" && phase !== "seated") out.push(t);
          prev = phase;
        }
        return out;
      };
      const a = awayStarts(spots[0]);
      expect(a).toHaveLength(CYCLES);
      expect(awayStarts(spots[1])).toEqual(a);
      // and each of those is within one sample of the plan's own start
      const plan = planFor(seed);
      a.forEach((t, i) => {
        expect(t - plan.start(i)).toBeLessThan(25);
        expect(t - plan.start(i)).toBeGreaterThanOrEqual(0);
      });
    });

    it("lasts exactly the plan interval in every cycle, for every spot, desk and drink", () => {
      const seen = new Set<string>();
      for (const desk of [0, 1, 3]) {
        const plan = planFor(seed, geo, desk);
        const home = stand(geo.seat(desk));
        for (let spot = 0; spot < COFFEE_SPOTS; spot++) {
          const c = ctxAt(desk, spot);
          for (let cycle = 0; cycle < CYCLES; cycle++) {
            seen.add(plan.drink(cycle));
            const next = plan.start(cycle + 1);
            const before = waitTrip(c, 0, null, next - 1);
            expect(before, `d${desk} s${spot} c${cycle}`).toMatchObject({ phase: "seated" });
            expect(dist(before, home)).toBeLessThan(1e-6);
            const on = waitTrip(c, 0, null, next);
            expect(on.phase).toBe("to-coffee");
            expect(dist(on, home)).toBeLessThan(1e-6);
            expect(dist(before, on)).toBeLessThan(1e-6);
          }
        }
      }
      expect([...seen].sort()).toEqual(["coffee", "water"]);
    });

    it("still stands at its own spot during at-coffee, for each spot", () => {
      const plan = planFor(seed);
      for (let spot = 0; spot < COFFEE_SPOTS; spot++) {
        const c = ctxAt(1, spot);
        for (let cycle = 0; cycle < CYCLES; cycle++) {
          const drink = plan.drink(cycle);
          const to = drink === "water" ? geo.waterSpot(spot) : geo.coffeeSpot(spot);
          const walk = (dist(seat, to) / WALK_SPEED) * 1000;
          const s = waitTrip(c, 0, null, plan.start(cycle) + walk + 10);
          expect(s).toMatchObject({
            phase: "at-coffee",
            pose: drink === "water" ? "standing-cup" : "standing-mug",
          });
          expect(dist(s, to)).toBeLessThan(1e-6);
        }
      }
    });
  });

  it("every agent's coffee spot is on the floor, in every room", () => {
    for (const n of counts) {
      const l = layoutOffice(n, view);
      const g = geometryFor(l);
      const shell = roomShell(l);
      for (let d = 0; d < n; d++) {
        for (const drink of ["coffee", "water"] as const) {
          const seed = seedWhere((k) => pickDrink(k, 0) === drink);
          const c: TripCtx = {
            geo: g,
            desk: d,
            spot: Math.min(d, 5),
            seatPose: "seated-idle",
            seed,
          };
          for (let t = 0; t <= IDLE_BEFORE_TRIP_MS + 20_000; t += 250) {
            expect(inside(shell.floor, idleTrip(c, 0, null, t))).toBe(true);
          }
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
