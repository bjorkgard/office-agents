import { describe, expect, it } from "vite-plus/test";
import {
  COFFEE_DWELL_MS,
  IDLE_BEFORE_TRIP_MS,
  RETURN_CAP_MS,
  WALK_SPEED,
  waitTrip,
} from "./choreo";
import { breakPlan, pickDrink } from "./breaks";
import { layoutOffice } from "./iso";
import { agentKey, type Agent } from "./machine";
import {
  frameZ,
  legacyPose,
  overlayCalc,
  overlayFoot,
  overlayPoints,
  planMotion,
  runLoop,
  TORSO,
  updateTrips,
  type Drive,
  type Frame,
  type Motion,
  type MotionInput,
  type Trip,
} from "./motion";
import { COFFEE_SPOTS } from "./room";
import { geometryFor, SEATED_FOOT, STANDING_FOOT } from "./scene-model";

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

const view = { width: 1200, height: 800 };
const NOW = 1_000_000;
// One geometry per desk count, like the Scene's memo: drives are reused only for the same geo.
const geos = new Map<number, ReturnType<typeof geometryFor>>();

function input(agents: Agent[], seats: Record<string, number>, over: Partial<MotionInput> = {}) {
  const deskCount = Math.max(0, ...Object.values(seats).map((d) => d + 1));
  const layout = layoutOffice(deskCount, view);
  geos.set(deskCount, geos.get(deskCount) ?? geometryFor(layout));
  return {
    agents,
    seats,
    layout,
    geo: geos.get(deskCount)!,
    prevDesks: new Map(),
    prevTrips: new Map(),
    prevSubs: new Map(),
    prevCache: new Map(),
    reducedMotion: false,
    now: NOW,
    ...over,
  } satisfies MotionInput;
}

describe("planMotion work desks", () => {
  // s1 at desk 0, s2 at desk 2: desk 1 is empty.
  const seats = { s1: 0, s2: 2 };
  const kid = agent("s1", "k1", { arrivedAt: NOW - 1000 });

  it("sends a subagent to the empty desk and keeps it there between calls", () => {
    const first = planMotion(input([agent("s1", null), agent("s2", null), kid], seats));
    expect(first.desks.get(kid.key)).toBe(1);
    expect(first.workDeskOf.get(kid.key)).toBe(1);
    expect(first.drives.has(kid.key)).toBe(true);
    const again = planMotion(
      input([agent("s1", null), agent("s2", null), kid], seats, { prevDesks: first.desks }),
    );
    expect(again.desks.get(kid.key)).toBe(1);
  });

  it("falls back to a standing slot (still walking a path) when no desk is empty", () => {
    const full = { s1: 0, s2: 1, s3: 2, s4: 3 };
    const sessions = Object.keys(full).map((id) => agent(id, null));
    const m = planMotion(input([...sessions, kid], full));
    expect(m.desks.get(kid.key)).toBeNull();
    expect(m.workDeskOf.has(kid.key)).toBe(false);
    expect(m.plan.slot.get(kid.key)).toEqual({ desk: 0, index: 0 });
    const f = m.drives.get(kid.key)!.frame(NOW + 60_000);
    expect(f.standing).toBe(true);
  });

  it("keeps queued agents (no seat for the parent, or past the slots) off the paths", () => {
    const orphan = agent("zz", "k9", { arrivedAt: 0 });
    const m = planMotion(input([agent("s1", null), orphan], { s1: 0 }));
    expect(m.drives.has(orphan.key)).toBe(false);
    expect(m.plan.queue).toEqual([orphan.key]);
    const crowd = ["a", "b", "c"].map((id, i) => agent("s1", id, { arrivedAt: i }));
    const four = { s1: 0, s2: 1, s3: 2, s4: 3 };
    const others = ["s2", "s3", "s4"].map((id) => agent(id, null));
    const full = planMotion(input([agent("s1", null), ...others, ...crowd], four));
    expect(full.plan.queue).toEqual([crowd[2].key]);
    expect(full.drives.has(crowd[2].key)).toBe(false);
    expect(full.drives.has(crowd[0].key)).toBe(true);
  });

  it("takes the desk away from a subagent when a session sits there", () => {
    const m1 = planMotion(input([agent("s1", null), agent("s2", null), kid], seats));
    const seated = { s1: 0, s2: 2, s3: 1 };
    const m2 = planMotion(
      input([agent("s1", null), agent("s2", null), agent("s3", null), kid], seated, {
        prevDesks: m1.desks,
      }),
    );
    // Desk 3 is still empty in the four-desk row: it takes the subagent in.
    expect(m2.desks.get(kid.key)).toBe(3);
    const crowded = { s1: 0, s2: 2, s3: 1, s4: 3 };
    const all = ["s1", "s2", "s3", "s4"].map((id) => agent(id, null));
    expect(
      planMotion(input([...all, kid], crowded, { prevDesks: m1.desks })).desks.get(kid.key),
    ).toBeNull();
  });

  it("walks a subagent in time, and sits it at its desk once the path is over", () => {
    const m = planMotion(input([agent("s1", null), agent("s2", null), kid], seats));
    const drive = m.drives.get(kid.key)!;
    const early = drive.frame(kid.arrivedAt + 100);
    expect(early.pose).toBe("walking");
    expect(early.rest).toBe(false);
    expect(drive.settled(kid.arrivedAt + 100)).toBe(false);
    const late = drive.frame(kid.arrivedAt + 120_000);
    expect(late.rest).toBe(true);
    expect(drive.settled(kid.arrivedAt + 120_000)).toBe(true);
  });
});

describe("planMotion reduced motion", () => {
  const seats = { s1: 0, s2: 2 };
  const kid = agent("s1", "k1", { arrivedAt: NOW - 1000 });
  const idle = agent("s1", null, { state: "idle", phase: "idle", idleSince: NOW - 5000 });

  it("uses no paths and no trips; a subagent still sits at its empty desk", () => {
    const m = planMotion(input([idle, agent("s2", null), kid], seats, { reducedMotion: true }));
    expect(m.drives.size).toBe(0);
    expect(m.trips.size).toBe(0);
    expect(m.workDeskOf.get(kid.key)).toBe(1);
  });

  it("shows the seated pose for walking states and for the waiting parent", () => {
    expect(legacyPose("arriving", { seated: true, subagent: false, reducedMotion: true })).toBe(
      "seated-idle",
    );
    expect(legacyPose("arriving", { seated: false, subagent: true, reducedMotion: true })).toBe(
      "standing",
    );
    expect(
      legacyPose("waiting-on-subagents", { seated: true, subagent: false, reducedMotion: true }),
    ).toBe("seated-idle");
  });
});

describe("legacyPose", () => {
  it("sits a subagent at its work desk, stands one in a slot, keeps the raised hand", () => {
    const at = (seated: boolean) => ({ seated, subagent: true, reducedMotion: false });
    expect(legacyPose("working", at(true))).toBe("seated-typing");
    expect(legacyPose("working", at(false))).toBe("standing");
    expect(legacyPose("attention", at(false))).toBe("seated-raised-hand");
  });
});

describe("coffee trips", () => {
  const seats = { s1: 0, s2: 1 };
  const idleAgent = (key: string, since: number) =>
    agent(key, null, { state: "idle", phase: "idle", idleSince: since });

  it("starts an idle trip from idleSince and gives each trip its own coffee spot", () => {
    const t = updateTrips(
      new Map(),
      [idleAgent("s1", NOW - 100), idleAgent("s2", NOW - 50)],
      seats,
      NOW,
    );
    const a = t.get(agentKey("s1", null))!;
    const b = t.get(agentKey("s2", null))!;
    expect(a).toMatchObject({ kind: "idle", since: NOW - 100, resumedAt: null });
    expect(a.spot).not.toBe(b.spot);
  });

  it("keeps a running trip and marks it resumed when the agent works again", () => {
    const first = updateTrips(new Map(), [idleAgent("s1", NOW)], seats, NOW);
    const same = updateTrips(first, [idleAgent("s1", NOW)], seats, NOW + 3000);
    expect(same.get(agentKey("s1", null))).toEqual(first.get(agentKey("s1", null)));
    const back = updateTrips(first, [agent("s1", null)], seats, NOW + 4000);
    expect(back.get(agentKey("s1", null))!.resumedAt).toBe(NOW + 4000);
    // Once marked, the time does not move.
    const later = updateTrips(back, [agent("s1", null)], seats, NOW + 4500);
    expect(later.get(agentKey("s1", null))!.resumedAt).toBe(NOW + 4000);
  });

  it("keeps a resumed waiting parent's drink fixed from the moment it resumed", () => {
    const parent = agent("s1", null, { state: "waiting-on-subagents" });
    const others = [parent, agent("s2", null)];
    const m0 = planMotion(input(others, seats, { now: NOW }));
    const resumeAt = NOW + 70_000;
    const back = agent("s1", null);
    const m1 = planMotion(
      input([back, agent("s2", null)], seats, { prevTrips: m0.trips, now: resumeAt }),
    );
    expect(m1.trips.get(back.key)!.resumedAt).toBe(resumeAt);
    const drive = m1.drives.get(back.key)!;
    const drink = drive.frame(resumeAt).drink;
    expect(drink).toBeDefined();
    for (let t = resumeAt; t < resumeAt + 3_600_000; t += 7000)
      expect(drive.frame(t).drink, `t+${t - resumeAt}`).toBe(drink);
  });

  it("an attention agent on a coffee break is back in its seat within a second", () => {
    const idle = idleAgent("s1", NOW);
    const m0 = planMotion(input([idle, agent("s2", null)], seats, { now: NOW }));
    const atCoffee = NOW + IDLE_BEFORE_TRIP_MS + 3000;
    const m1 = planMotion(
      input([idle, agent("s2", null)], seats, { prevTrips: m0.trips, now: atCoffee - 1000 }),
    );
    const waving = agent("s1", null, { state: "attention" });
    const m2 = planMotion(
      input([waving, agent("s2", null)], seats, { prevTrips: m1.trips, now: atCoffee }),
    );
    const drive = m2.drives.get(waving.key)!;
    expect(drive.frame(atCoffee).rest).toBe(false);
    const home = drive.frame(atCoffee + RETURN_CAP_MS + 1);
    expect(home.rest).toBe(true);
    expect(drive.settled(atCoffee + RETURN_CAP_MS + 1)).toBe(true);
  });

  it("walks to the coffee station, dwells, and sits again", () => {
    const idle = idleAgent("s1", NOW);
    const m = planMotion(input([idle, agent("s2", null)], seats, { now: NOW }));
    const drive = m.drives.get(idle.key)!;
    expect(drive.frame(NOW + 500).rest).toBe(true);
    expect(drive.settled(NOW + 500)).toBe(false);
    expect(drive.frame(NOW + IDLE_BEFORE_TRIP_MS + 1000).pose).toBe("walking");
    expect(drive.settled(NOW + IDLE_BEFORE_TRIP_MS + 1000)).toBe(false);
    const end = NOW + IDLE_BEFORE_TRIP_MS + COFFEE_DWELL_MS + 60_000;
    expect(drive.frame(end).rest).toBe(true);
    expect(drive.settled(end)).toBe(true);
  });

  it("fetches water from the water spot with the cup, coffee from the coffee spot with the mug", () => {
    const key = agentKey("s1", null);
    const since = (drink: "coffee" | "water") => {
      for (let t = NOW; t < NOW + 5000; t++) if (pickDrink(key, t) === drink) return t;
      throw new Error(`no idle start within 5000 ms of NOW picks ${drink}`);
    };
    for (const drink of ["coffee", "water"] as const) {
      const t0 = since(drink);
      const idle = idleAgent("s1", t0);
      const others = [idle, agent("s2", null)];
      const m = planMotion(input(others, seats, { now: t0 }));
      const drive = m.drives.get(idle.key)!;
      const g = input(others, seats).geo;
      const n = m.trips.get(idle.key)!.spot;
      const spot = drink === "water" ? g.waterSpot(n) : g.coffeeSpot(n);
      const seat = stand(g.seat(0));
      const walk = (Math.hypot(seat.x - spot.x, seat.y - spot.y) / WALK_SPEED) * 1000;
      const f = drive.frame(t0 + IDLE_BEFORE_TRIP_MS + walk + 50);
      expect(f.pose).toBe(drink === "water" ? "standing-cup" : "standing-mug");
      expect(Math.hypot(f.x - spot.x, f.y - spot.y)).toBeLessThan(1e-6);
      // same clock as before: the dwell ends COFFEE_DWELL_MS after arrival
      expect(drive.nextChange(t0 + IDLE_BEFORE_TRIP_MS + walk + 50)).toBe(
        t0 + IDLE_BEFORE_TRIP_MS + walk + COFFEE_DWELL_MS,
      );
    }
  });

  describe("a waiting parent's breaks", () => {
    const parent = agent("s1", null, { state: "waiting-on-subagents" });
    const others = [parent, agent("s2", null)];
    const m = planMotion(input(others, seats, { now: NOW }));
    const drive = m.drives.get(parent.key)!;
    const trip = m.trips.get(parent.key)!;
    const seat = stand(input(others, seats).geo.seat(0));
    const cup = input(others, seats).geo.coffeeSpot(trip.spot);
    const walk = (Math.hypot(seat.x - cup.x, seat.y - cup.y) / WALK_SPEED) * 1000;
    // The plan is timed with the longest walk over every spot, whichever spot the trip got.
    const g0 = input(others, seats).geo;
    const longest = (spotOf: (i: number) => { x: number; y: number }) =>
      Math.max(
        ...Array.from(
          { length: COFFEE_SPOTS },
          (_, i) => (Math.hypot(seat.x - spotOf(i).x, seat.y - spotOf(i).y) / WALK_SPEED) * 1000,
        ),
      );
    const plan = breakPlan(
      parent.key,
      longest((i) => g0.coffeeSpot(i)),
      longest((i) => g0.waterSpot(i)),
    );
    const at = (c: number, off: number) => NOW + plan.start(c) + off;
    // Each cycle picks its drink and is timed with that drink's own walk.
    const water = (c: number) => pickDrink(parent.key, c) === "water";
    const walkOf = (c: number) => {
      const to = water(c) ? input(others, seats).geo.waterSpot(trip.spot) : cup;
      return (Math.hypot(seat.x - to.x, seat.y - to.y) / WALK_SPEED) * 1000;
    };
    const poseOf = (c: number) => (water(c) ? "standing-cup" : "standing-mug");

    it("is at the station at once, seated after the dwell, away again after the cooldown", () => {
      expect(drive.frame(NOW + walkOf(0) + 50).pose).toBe(poseOf(0));
      expect(drive.settled(NOW + walkOf(0) + 50)).toBe(true);
      const back = at(0, 2 * walkOf(0) + plan.dwellMs(0) + 10);
      expect(drive.frame(back).rest).toBe(true);
      expect(drive.settled(back)).toBe(true);
      for (const c of [1, 2]) {
        expect(drive.frame(at(c, -1)).rest).toBe(true);
        expect(drive.frame(at(c, 1)).pose).toBe("walking");
        expect(drive.settled(at(c, 1))).toBe(false);
        expect(drive.frame(at(c, walkOf(c) + 10)).pose).toBe(poseOf(c));
      }
    });

    it("says when it next changes, and never while a wait lasts is it null", () => {
      expect(drive.nextChange(NOW + walkOf(0) + 50)).toBe(at(0, walkOf(0) + plan.dwellMs(0)));
      const cool = at(0, 2 * walkOf(0) + plan.dwellMs(0) + 10);
      expect(drive.nextChange(cool)).toBe(at(1, 0));
      expect(drive.nextChange(NOW + 100)).toBe(NOW + 100);
    });

    it("is back within the cap when the wait ends, and then never changes", () => {
      const r = at(0, walk + 2000);
      const m1 = planMotion(
        input([agent("s1", null), agent("s2", null)], seats, { prevTrips: m.trips, now: r }),
      );
      const d = m1.drives.get(parent.key)!;
      expect(d.frame(r + RETURN_CAP_MS + 1).rest).toBe(true);
      expect(d.settled(r + RETURN_CAP_MS + 1)).toBe(true);
      expect(d.nextChange(r + RETURN_CAP_MS + 1)).toBeNull();
      expect(d.frame(r + 300_000).rest).toBe(true);
    });
  });

  it("anchors a waiting parent's plan to its earliest open tool, so a reload keeps the plan", () => {
    const tools = {
      a: { startedAt: NOW - 50_000, isSubagent: true },
      b: { startedAt: NOW - 9_000, isSubagent: true },
    };
    const wait = (over: Partial<Agent> = {}) =>
      agent("s1", null, {
        state: "waiting-on-subagents",
        openTools: tools,
        waitingOn: ["a", "b"],
        ...over,
      });
    const t1 = updateTrips(new Map(), [wait()], seats, NOW);
    expect(t1.get(agentKey("s1", null))).toMatchObject({ kind: "wait", since: NOW - 50_000 });
    // a reload 70 s later sees the same anchor
    const t2 = updateTrips(new Map(), [wait()], seats, NOW + 70_000);
    expect(t2.get(agentKey("s1", null))!.since).toBe(NOW - 50_000);
    // a start in the future is clamped to now; no open tool falls back to first sight
    const future = { a: { startedAt: NOW + 9_000, isSubagent: true } };
    expect(
      updateTrips(new Map(), [wait({ openTools: future, waitingOn: ["a"] })], seats, NOW).get(
        agentKey("s1", null),
      )!.since,
    ).toBe(NOW);
    expect(
      updateTrips(new Map(), [wait({ openTools: {}, waitingOn: [] })], seats, NOW).get(
        agentKey("s1", null),
      )!.since,
    ).toBe(NOW);
    // the drive at the same real time is the same plan whenever it is built
    const frameAt = (builtAt: number) => {
      const p = wait();
      const mm = planMotion(input([p, agent("s2", null)], seats, { now: builtAt }));
      return mm.drives.get(p.key)!.frame(NOW + 12_345);
    };
    expect(frameAt(NOW)).toEqual(frameAt(NOW + 5_000));
  });

  it("gives a waiting parent no break past the last coffee spot", () => {
    const many = Array.from({ length: COFFEE_SPOTS + 2 }, (_, i) => `w${i}`);
    const seatsMany = Object.fromEntries(many.map((id, i) => [id, i]));
    const t = updateTrips(
      new Map(),
      many.map((id) => agent(id, null, { state: "waiting-on-subagents" })),
      seatsMany,
      NOW,
    );
    expect(t.size).toBe(COFFEE_SPOTS);
  });
});

describe("overlay follows the foot point", () => {
  const frame = (over: Partial<Frame>): Frame => ({
    x: 100,
    y: 200,
    pose: "walking",
    mirror: false,
    carryPaper: false,
    opacity: 1,
    rest: false,
    standing: false,
    ...over,
  });

  it("a seated frame uses the seated foot, a walking one the standing foot", () => {
    const seated = overlayFoot(frame({ rest: true, pose: "seated-typing" }));
    expect(seated).toEqual({ x: 100, y: 200 - STANDING_FOOT + SEATED_FOOT });
    expect(overlayFoot(frame({}))).toEqual({ x: 100, y: 200 });
    expect(overlayFoot(frame({ rest: true, standing: true }))).toEqual({ x: 100, y: 200 });
  });

  it("puts the hit and tag around the torso at any scale, moving with the foot", () => {
    const a = overlayPoints({ x: 100, y: 200 }, { scale: 1, x: 0, y: 0 }, 44);
    const b = overlayPoints({ x: 130, y: 210 }, { scale: 1, x: 0, y: 0 }, 44);
    expect(b.hit.left - a.hit.left).toBe(30);
    expect(b.hit.top - a.hit.top).toBe(10);
    expect(b.tag.left - a.tag.left).toBe(30);
    expect(overlayPoints({ x: 100, y: 200 }, { scale: 2, x: 0, y: 0 }, 44).hit.left).toBe(200);
  });

  it("keeps seated hit centers at least 24px apart between neighbouring desks", () => {
    const layout = layoutOffice(4, view);
    const g = geometryFor(layout);
    const centers = [0, 1, 2, 3].map((i) => overlayPoints(g.seat(i), layout.fit, 24).hit);
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++)
        expect(
          Math.hypot(centers[i].left - centers[j].left, centers[i].top - centers[j].top),
        ).toBeGreaterThanOrEqual(24);
  });
});

describe("overlay fit (eng D4: equal to the pre-fit overlay at fit offset 0)", () => {
  // The formula as it was before the fit: screen px from room px and a bare scale.
  const old = (foot: { x: number; y: number }, scale: number, hit: number) => {
    const left = foot.x * scale;
    const top = (foot.y - TORSO) * scale;
    return { hit: { left, top }, tag: { left, top: top + hit / 2 + 4 } };
  };
  const feet = [-310.25, -12, 0, 7.5, 133.333, 640.9, 1500];
  const scales = [0.5, 0.5137, 0.75, 1, 1.5];
  const hits = [24, 30.5, 44];

  it("evaluates to the old numbers within 0.01px for many feet, scales and hit sizes", () => {
    let n = 0;
    for (const x of feet)
      for (const y of feet)
        for (const scale of scales)
          for (const hit of hits) {
            const a = overlayPoints({ x, y }, { scale, x: 0, y: 0 }, hit);
            const b = old({ x, y }, scale, hit);
            for (const part of ["hit", "tag"] as const)
              for (const axis of ["left", "top"] as const) {
                expect(Math.abs(a[part][axis] - b[part][axis])).toBeLessThan(0.01);
                n++;
              }
          }
    expect(n).toBe(feet.length ** 2 * scales.length * hits.length * 4);
  });

  it("adds the fit offset after scaling, on each axis", () => {
    const a = overlayPoints({ x: 100, y: 200 }, { scale: 0.5, x: 30, y: -12 }, 44);
    const b = old({ x: 100, y: 200 }, 0.5, 44);
    expect(a.hit.left - b.hit.left).toBeCloseTo(30);
    expect(a.hit.top - b.hit.top).toBeCloseTo(-12);
    expect(a.tag.top - b.tag.top).toBeCloseTo(-12);
  });

  // Evaluates a calc() string the way the browser does, from the overlay's fit vars.
  const evalCalc = (s: string, fit: { scale: number; x: number; y: number }) => {
    const m =
      /^calc\(var\(--fit-s\) \* (-?[\d.e-]+)px \+ var\(--fit-([xy])\)(?: \+ (-?[\d.e-]+)px)?\)$/.exec(
        s,
      );
    expect(m, s).not.toBeNull();
    return fit.scale * Number(m![1]) + fit[m![2] as "x" | "y"] + Number(m![3] ?? 0);
  };

  it("writes calc() strings in the fit vars that evaluate to the same points", () => {
    const fit = { scale: 0.5137, x: 41.5, y: -8.25 };
    for (const x of feet)
      for (const y of feet)
        for (const hit of hits) {
          const c = overlayCalc({ x, y }, hit);
          const n = overlayPoints({ x, y }, fit, hit);
          expect(evalCalc(c.hit.left, fit)).toBeCloseTo(n.hit.left, 6);
          expect(evalCalc(c.hit.top, fit)).toBeCloseTo(n.hit.top, 6);
          expect(evalCalc(c.tag.left, fit)).toBeCloseTo(n.tag.left, 6);
          expect(evalCalc(c.tag.top, fit)).toBeCloseTo(n.tag.top, 6);
        }
  });
});

describe("frameZ", () => {
  const rest: Frame = {
    x: 0,
    y: 100.4,
    pose: "seated-typing",
    mirror: false,
    carryPaper: false,
    opacity: 1,
    rest: true,
    standing: false,
  };
  it("sits behind the desk, in front for a raised arm, and by depth when walking", () => {
    expect(frameZ(rest, 50, false)).toBe(49);
    expect(frameZ(rest, 50, true)).toBe(51);
    expect(frameZ({ ...rest, rest: false }, 50, false)).toBe(100);
    expect(frameZ(rest, null, false)).toBe(100);
  });
});

const stand = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - SEATED_FOOT + STANDING_FOOT });

/** Replans with the previous result's memory, like the Scene commits after a render. */
function step(
  prev: Motion | null,
  agents: Agent[],
  seats: Record<string, number>,
  now: number,
): Motion {
  return planMotion(
    input(agents, seats, {
      now,
      prevDesks: prev?.desks ?? new Map(),
      prevTrips: prev?.trips ?? new Map(),
      prevSubs: prev?.subs ?? new Map(),
      prevCache: prev?.cache ?? new Map(),
    }),
  );
}

/** Largest distance between consecutive frames over [from, to], and the allowed one per step. */
function biggestJump(frameAt: (t: number) => Frame, from: number, to: number, dt = 50) {
  let worst = 0;
  let last = frameAt(from);
  for (let t = from + dt; t <= to; t += dt) {
    const f = frameAt(t);
    worst = Math.max(worst, Math.hypot(f.x - last.x, f.y - last.y));
    last = f;
  }
  return { worst, allowed: (WALK_SPEED * dt) / 1000 + 0.5 };
}

const near = (a: Frame, b: Frame) => Math.hypot(a.x - b.x, a.y - b.y) < 1;

describe("every row draws all its desks", () => {
  it("gives a lone session a row of four desks, three of them empty", () => {
    expect(layoutOffice(1, view).desks).toHaveLength(4);
    expect(layoutOffice(0, view).desks).toHaveLength(4);
    expect(layoutOffice(5, view).desks).toHaveLength(8);
  });

  it("sends the subagent of a single live session to an empty desk, not a slot", () => {
    const kid1 = agent("s1", "k1", { arrivedAt: NOW - 1000 });
    const m = step(null, [agent("s1", null), kid1], { s1: 0 }, NOW);
    expect(m.workDeskOf.get(kid1.key)).toBe(1);
    expect(m.plan.slot.size).toBe(0);
  });
});

describe("reassignments walk", () => {
  const kid = agent("s1", "k1", { arrivedAt: NOW - 60_000 });
  const t2 = NOW + 30_000;

  it("walks a working subagent away when a session is seated at its desk", () => {
    const seats = { s1: 0, s2: 2 };
    const two = [agent("s1", null), agent("s2", null), kid];
    const m1 = step(null, two, seats, NOW);
    expect(m1.workDeskOf.get(kid.key)).toBe(1);
    const seated = { s1: 0, s2: 2, s3: 1 };
    const three = [agent("s1", null), agent("s2", null), agent("s3", null), kid];
    const m2 = step(m1, three, seated, t2);
    expect(m2.workDeskOf.get(kid.key)).toBe(3);
    const before = m1.drives.get(kid.key)!.frame(t2);
    const after = m2.drives.get(kid.key)!;
    expect(Math.hypot(after.frame(t2).x - before.x, after.frame(t2).y - before.y)).toBeLessThan(1);
    const { worst, allowed } = biggestJump((t) => after.frame(t), t2, t2 + 6000);
    expect(worst).toBeLessThanOrEqual(allowed);
    expect(after.frame(t2 + 100).pose).toBe("walking");
    expect(after.frame(t2 + 60_000).rest).toBe(true);
  });

  it("walks to a standing slot when no desk is left, never jumping", () => {
    const four = { s1: 0, s2: 2, s3: 3 };
    const base = ["s1", "s2", "s3"].map((id) => agent(id, null));
    const m1 = step(null, [...base, kid], four, NOW);
    expect(m1.workDeskOf.get(kid.key)).toBe(1);
    const all = { ...four, s4: 1 };
    const m2 = step(m1, [...base, agent("s4", null), kid], all, t2);
    expect(m2.desks.get(kid.key)).toBeNull();
    const d = m2.drives.get(kid.key)!;
    expect(near(d.frame(t2), m1.drives.get(kid.key)!.frame(t2))).toBe(true);
    const { worst, allowed } = biggestJump((t) => d.frame(t), t2, t2 + 6000);
    expect(worst).toBeLessThanOrEqual(allowed);
    expect(d.frame(t2 + 60_000).standing).toBe(true);
  });

  it("walks the remaining slot subagent over when its sibling leaves", () => {
    const seats = { s1: 0, s2: 1, s3: 2, s4: 3 };
    const sess = ["s1", "s2", "s3", "s4"].map((id) => agent(id, null));
    const a = agent("s1", "a", { arrivedAt: NOW - 90_000 });
    const b = agent("s1", "b", { arrivedAt: NOW - 80_000 });
    const m1 = step(null, [...sess, a, b], seats, NOW);
    expect(m1.plan.slot.get(b.key)).toEqual({ desk: 0, index: 1 });
    const left = { ...a, state: "leaving" as const, phase: "leaving" as const, leftAt: t2 };
    const m2 = step(m1, [...sess, left, b], seats, t2);
    expect(m2.plan.slot.get(b.key)).toEqual({ desk: 0, index: 0 });
    const d = m2.drives.get(b.key)!;
    expect(near(d.frame(t2), m1.drives.get(b.key)!.frame(t2))).toBe(true);
    const { worst, allowed } = biggestJump((t) => d.frame(t), t2, t2 + 3000);
    expect(worst).toBeLessThanOrEqual(allowed);
    const g = geometryFor(layoutOffice(4, view));
    const slot0 = stand(g.slot(0, 0));
    expect(d.frame(t2 + 60_000)).toMatchObject({ x: slot0.x, y: slot0.y });
    // The leaver starts from its own slot (0) and walks out; nobody jumps.
    const l = m2.drives.get(a.key)!;
    expect(biggestJump((t) => l.frame(t), t2, t2 + 12_000).worst).toBeLessThanOrEqual(
      (WALK_SPEED * 50) / 1000 + 0.5,
    );
  });
});

describe("leavers start from their real previous home", () => {
  const seats = { s1: 0, s2: 1, s3: 2, s4: 3 };
  const sess = ["s1", "s2", "s3", "s4"].map((id) => agent(id, null));
  const g = geometryFor(layoutOffice(4, view));
  const t2 = NOW + 30_000;

  it("a queued third subagent leaves from its door queue spot", () => {
    const kids = ["a", "b", "c"].map((id, i) => agent("s1", id, { arrivedAt: NOW - 90_000 + i }));
    const m1 = step(null, [...sess, ...kids], seats, NOW);
    expect(m1.plan.queue).toEqual([kids[2].key]);
    const left = { ...kids[2], state: "leaving" as const, phase: "leaving" as const, leftAt: t2 };
    const m2 = step(m1, [...sess, kids[0], kids[1], left], seats, t2);
    const d = m2.drives.get(left.key)!;
    const spot = stand(g.queueSpot(0));
    expect(d.frame(t2)).toMatchObject({ x: spot.x, y: spot.y });
    const { worst, allowed } = biggestJump((t) => d.frame(t), t2, t2 + 12_000);
    expect(worst).toBeLessThanOrEqual(allowed);
  });

  it("a slot-1 subagent leaves from slot 1, a slot-0 one from slot 0", () => {
    const a = agent("s1", "a", { arrivedAt: NOW - 90_000 });
    const b = agent("s1", "b", { arrivedAt: NOW - 80_000 });
    const m1 = step(null, [...sess, a, b], seats, NOW);
    const leavingB = { ...b, state: "leaving" as const, phase: "leaving" as const, leftAt: t2 };
    const m2 = step(m1, [...sess, a, leavingB], seats, t2);
    const s1 = stand(g.slot(0, 1));
    expect(m2.drives.get(b.key)!.frame(t2)).toMatchObject({ x: s1.x, y: s1.y });
    const leavingA = { ...a, state: "leaving" as const, phase: "leaving" as const, leftAt: t2 };
    const m3 = step(m1, [...sess, leavingA, b], seats, t2);
    const s0 = stand(g.slot(0, 0));
    expect(m3.drives.get(a.key)!.frame(t2)).toMatchObject({ x: s0.x, y: s0.y });
  });
});

describe("stable drives", () => {
  it("reuses the same drive objects while nothing about an agent changed", () => {
    const kid = agent("s1", "k1", { arrivedAt: NOW - 1000 });
    const idle = agent("s2", null, { state: "idle", phase: "idle", idleSince: NOW - 100 });
    const seats = { s1: 0, s2: 2 };
    const list = [agent("s1", null), idle, kid];
    const m1 = step(null, list, seats, NOW);
    const m2 = step(m1, list, seats, NOW + 1000);
    expect(m2.drives.get(kid.key)).toBe(m1.drives.get(kid.key));
    expect(m2.drives.get(idle.key)).toBe(m1.drives.get(idle.key));
  });
});

describe("coffee spots", () => {
  it("gives no trip to agents beyond the last coffee spot; they stay seated", () => {
    const n = COFFEE_SPOTS + 2;
    const ids = Array.from({ length: n }, (_, i) => `s${String(i).padStart(2, "0")}`);
    const seats = Object.fromEntries(ids.map((id, i) => [id, i]));
    const idles = ids.map((id) =>
      agent(id, null, { state: "idle", phase: "idle", idleSince: NOW }),
    );
    const t = updateTrips(new Map(), idles, seats, NOW);
    expect(t.size).toBe(COFFEE_SPOTS);
    expect(new Set([...t.values()].map((x) => x.spot)).size).toBe(COFFEE_SPOTS);
    expect(Math.max(...[...t.values()].map((x) => x.spot))).toBe(COFFEE_SPOTS - 1);
  });
});

describe("waiting parents after a reload", () => {
  it("keeps every cycle start whichever spot arrival order gave the agent", () => {
    const wait = (id: string) =>
      agent(id, null, {
        state: "waiting-on-subagents",
        waitingOn: ["a"],
        openTools: { a: { startedAt: NOW - 30_000, isSubagent: true } },
      });
    const A = wait("sA");
    const B = wait("sB");
    const seats = { sA: 0, sB: 2 };
    const g = geometryFor(layoutOffice(3, view));
    // live: B was seen first (spot 0), A second; reload: empty prev, key order (A spot 0)
    const live = updateTrips(updateTrips(new Map(), [B], seats, NOW), [A, B], seats, NOW);
    const reload = updateTrips(new Map(), [A, B], seats, NOW);
    expect(live.get(A.key)!.spot).not.toBe(reload.get(A.key)!.spot);
    expect(live.get(B.key)!.spot).not.toBe(reload.get(B.key)!.spot);
    const starts = (a: Agent, trips: Map<string, Trip>, desk: number) => {
      const c = {
        geo: g,
        desk,
        spot: trips.get(a.key)!.spot,
        seatPose: "seated-typing" as const,
        seed: a.key,
      };
      const since = trips.get(a.key)!.since;
      const out: number[] = [];
      let prev = "seated";
      for (let t = 0; t < 400_000; t += 25) {
        const phase = waitTrip(c, since, null, since + t).phase;
        if (prev === "seated" && phase !== "seated") out.push(t);
        prev = phase;
      }
      return out;
    };
    for (const [a, desk] of [
      [A, 0],
      [B, 2],
    ] as const) {
      const s = starts(a, live, desk);
      expect(s.length).toBeGreaterThan(3);
      expect(starts(a, reload, desk)).toEqual(s);
    }
  });
});

describe("runLoop", () => {
  type Timer = { id: number; cb: () => void; ms: number };
  const sched = () => {
    const calls = { raf: 0, caf: [] as number[], cleared: [] as number[] };
    const frames: (() => void)[] = [];
    const timers: Timer[] = [];
    let nextTimer = 0;
    return {
      calls,
      frames,
      timers,
      raf: (cb: () => void) => {
        calls.raf++;
        frames.push(cb);
        return calls.raf;
      },
      caf: (id: number) => calls.caf.push(id),
      setTimeout: (cb: () => void, ms: number) => {
        const id = ++nextTimer;
        timers.push({ id, cb, ms });
        return id as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout: (id: ReturnType<typeof setTimeout>) => {
        calls.cleared.push(id as unknown as number);
      },
    };
  };
  const drive = (settledAt: number, next: (t: number) => number | null = () => null): Drive => ({
    deskZ: null,
    frame: () => ({}) as Frame,
    settled: (t) => t >= settledAt,
    nextChange: next,
  });

  it("schedules another frame only while the drive is not settled", () => {
    const s = sched();
    const seen: number[] = [];
    runLoop(
      drive(100),
      () => 50,
      (t) => seen.push(t),
      s,
    );
    expect(seen).toEqual([50]);
    expect(s.calls.raf).toBe(1);
    const s2 = sched();
    runLoop(
      drive(100),
      () => 150,
      () => {},
      s2,
    );
    expect(s2.calls.raf).toBe(0);
    expect(s2.timers).toHaveLength(0);
  });

  it("stops scheduling once the drive settles and cancels the pending frame on cleanup", () => {
    const s = sched();
    let now = 0;
    const stop = runLoop(
      drive(100),
      () => now,
      () => {},
      s,
    );
    now = 120;
    s.frames.pop()!();
    expect(s.frames).toHaveLength(0);
    expect(s.calls.raf).toBe(1);
    stop();
    expect(s.calls.caf).toHaveLength(1);
  });

  it("arms a timer at nextChange when settled, restarts the frame loop when it fires", () => {
    const s = sched();
    let now = 1000;
    const seen: number[] = [];
    // settled until 5000, then it moves until 6000
    const d: Drive = {
      deskZ: null,
      frame: () => ({}) as Frame,
      settled: (t) => t < 5000 || t >= 6000,
      nextChange: (t) => (t < 5000 ? 5000 : null),
    };
    runLoop(
      d,
      () => now,
      (t) => seen.push(t),
      s,
    );
    expect(s.calls.raf).toBe(0);
    expect(s.timers).toHaveLength(1);
    expect(s.timers[0].ms).toBe(4001);
    now = 5001;
    s.timers[0].cb();
    expect(seen).toEqual([1000, 5001]);
    expect(s.calls.raf).toBe(1);
    now = 6100;
    s.frames.pop()!();
    expect(s.timers).toHaveLength(1);
    expect(s.calls.raf).toBe(1);
  });

  it("re-arms for the remainder when the timer fires early", () => {
    const s = sched();
    let now = 0;
    runLoop(
      drive(0, (t) => (t < 1000 ? 1000 : null)),
      () => now,
      () => {},
      s,
    );
    now = 990;
    s.timers[0].cb();
    expect(s.timers).toHaveLength(2);
    expect(s.timers[1].ms).toBe(11);
  });

  it("never re-arms in a tight loop when nextChange is not in the future", () => {
    const s = sched();
    runLoop(
      drive(0, (t) => t - 500),
      () => 1000,
      () => {},
      s,
    );
    expect(s.timers).toHaveLength(1);
    expect(s.timers[0].ms).toBeGreaterThanOrEqual(16);
  });

  it("cleanup cancels both the timer and the frame", () => {
    const s = sched();
    const stop = runLoop(
      drive(0, () => 9000),
      () => 0,
      () => {},
      s,
    );
    stop();
    expect(s.calls.cleared).toEqual([1]);
    expect(s.calls.caf).toHaveLength(1);
  });
});
