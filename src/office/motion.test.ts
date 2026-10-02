import { describe, expect, it } from "vite-plus/test";
import { COFFEE_DWELL_MS, IDLE_BEFORE_TRIP_MS, RETURN_CAP_MS, WALK_SPEED } from "./choreo";
import { layoutOffice } from "./iso";
import { agentKey, type Agent } from "./machine";
import {
  frameZ,
  legacyPose,
  overlayFoot,
  overlayPoints,
  planMotion,
  runLoop,
  updateTrips,
  type Drive,
  type Frame,
  type Motion,
  type MotionInput,
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

  it("a waiting parent stays at the coffee station without moving until it resumes", () => {
    const parent = agent("s1", null, { state: "waiting-on-subagents" });
    const m = planMotion(input([parent, agent("s2", null)], seats, { now: NOW }));
    const drive = m.drives.get(parent.key)!;
    expect(drive.settled(NOW + 60_000)).toBe(true);
    expect(drive.frame(NOW + 60_000).pose).toBe("standing-mug");
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
    const a = overlayPoints({ x: 100, y: 200 }, 1, 44);
    const b = overlayPoints({ x: 130, y: 210 }, 1, 44);
    expect(b.hit.left - a.hit.left).toBe(30);
    expect(b.hit.top - a.hit.top).toBe(10);
    expect(b.tag.left - a.tag.left).toBe(30);
    expect(overlayPoints({ x: 100, y: 200 }, 2, 44).hit.left).toBe(200);
  });

  it("keeps seated hit centers at least 24px apart between neighbouring desks", () => {
    const layout = layoutOffice(4, view);
    const g = geometryFor(layout);
    const centers = [0, 1, 2, 3].map((i) => overlayPoints(g.seat(i), layout.scale, 24).hit);
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++)
        expect(
          Math.hypot(centers[i].left - centers[j].left, centers[i].top - centers[j].top),
        ).toBeGreaterThanOrEqual(24);
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

describe("runLoop", () => {
  const sched = () => {
    const calls = { raf: 0, caf: [] as number[] };
    return {
      calls,
      raf: (cb: () => void) => {
        calls.raf++;
        void cb;
        return calls.raf;
      },
      caf: (id: number) => calls.caf.push(id),
    };
  };
  const drive = (settledAt: number): Drive => ({
    deskZ: null,
    frame: () => ({}) as Frame,
    settled: (t) => t >= settledAt,
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
  });

  it("stops scheduling once the drive settles and cancels the pending frame on cleanup", () => {
    const s = sched();
    let now = 0;
    const cbs: (() => void)[] = [];
    const stop = runLoop(
      drive(100),
      () => now,
      () => {},
      {
        raf: (cb) => {
          cbs.push(cb);
          return s.raf(cb);
        },
        caf: s.caf,
      },
    );
    now = 120;
    cbs.pop()!();
    expect(cbs).toHaveLength(0);
    expect(s.calls.raf).toBe(1);
    stop();
    expect(s.calls.caf).toHaveLength(1);
  });
});
