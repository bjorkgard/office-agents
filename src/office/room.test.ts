import { describe, expect, it } from "vite-plus/test";
import { DESKS_PER_ROW } from "../../shared/tuning";
import { CELL } from "./pixel";
import { COFFEE_STATION, DISPENSER, DOOR, PROPS, propSize } from "./props";
import { FLOOR_MARGIN, MIN_HEIGHT, MIN_WIDTH, TILE_W, layoutOffice } from "./iso";
import { stand } from "./choreo";
import { QUEUE_VISIBLE, STANDING_FOOT, geometryFor } from "./scene-model";
import { RIG_HEIGHT, RIG_WIDTH } from "./CharacterRig";
import {
  BASEBOARD_HEIGHT,
  COFFEE_SPOTS,
  DOOR_AT,
  QUEUE_GAP,
  WALL_LAYOUT,
  WATER_ALONG,
  WALL_SKEW,
  WINDOW_COLS,
  WINDOW_LIFT,
  WINDOW_ROWS,
  WINDOW_SPOTS,
  deskFootprint,
  roomShell,
  wallPropRect,
  type Point,
  type Rect,
} from "./room";

const view = { width: 1024, height: 768 };
const counts = [1, 4, 8, 12, 24];

const inside = (poly: Point[], p: Point) => {
  // Convex polygon, any winding: p is on the same side of every edge.
  const sides = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  });
  return sides.every((v) => v >= -1e-6) || sides.every((v) => v <= 1e-6);
};
const overlap = (a: Rect, b: Rect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const within = (r: Rect, p: Point) =>
  p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;

describe("roomShell", () => {
  it.each(counts)("keeps the floor around every desk's ground footprint at %i agents", (n) => {
    const layout = layoutOffice(n, view);
    const { floor } = roomShell(layout);
    expect(floor).toHaveLength(4);
    for (const d of layout.desks) {
      const f = deskFootprint(d);
      for (const p of [
        { x: f.left, y: f.bottom },
        { x: f.right, y: f.bottom },
        { x: (f.left + f.right) / 2, y: f.bottom },
      ])
        expect(inside(floor, p)).toBe(true);
    }
  });

  it.each(counts)("keeps every desk and the shell inside the room box at %i agents", (n) => {
    const layout = layoutOffice(n, view);
    const shell = roomShell(layout);
    // Anchored room px: the padded room box starts at the bounds' corner, less the slack.
    const pad = (layout.width - (layout.bounds.maxX - layout.bounds.minX)) / 2;
    const x0 = layout.bounds.minX - pad;
    const y0 = layout.bounds.minY - pad;
    for (const p of [...shell.floor, ...shell.leftWall, ...shell.rightWall]) {
      expect(p.x).toBeGreaterThanOrEqual(x0);
      expect(p.x).toBeLessThanOrEqual(x0 + layout.width);
      expect(p.y).toBeGreaterThanOrEqual(y0);
      expect(p.y).toBeLessThanOrEqual(y0 + layout.height);
    }
    for (const d of layout.desks) {
      const f = deskFootprint(d);
      expect(f.left).toBeGreaterThanOrEqual(x0);
      expect(f.right).toBeLessThanOrEqual(x0 + layout.width);
      expect(f.top).toBeGreaterThanOrEqual(y0);
      expect(f.bottom).toBeLessThanOrEqual(y0 + layout.height);
    }
  });

  it.each(counts)("never overlaps two desk footprints at %i agents", (n) => {
    const rects = layoutOffice(n, view).desks.map(deskFootprint);
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i], rects[j])).toBe(false);
  });

  it("leaves a gap between neighbouring desks and the chair clear behind each", () => {
    const rects = layoutOffice(12, view).desks.map(deskFootprint);
    const gap = (a: Rect, b: Rect) =>
      Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++)
        expect(gap(rects[i], rects[j])).toBeGreaterThanOrEqual(8);
  });

  it.each(counts)("puts the walls behind the back row at %i agents", (n) => {
    const layout = layoutOffice(n, view);
    const shell = roomShell(layout);
    const backTop = Math.min(
      ...layout.desks.slice(0, DESKS_PER_ROW).map((d) => deskFootprint(d).bottom),
    );
    // The back corner of the floor, where the walls meet, is above the back row's feet.
    expect(shell.floor[0].y).toBeLessThan(backTop);
    expect(shell.leftWall[2].y).toBeCloseTo(shell.leftWall[1].y - shell.wallHeight);
    expect(shell.rightWall[2].y).toBeCloseTo(shell.rightWall[1].y - shell.wallHeight);
    // Both walls meet at the back corner.
    expect(shell.leftWall[1]).toEqual(shell.rightWall[0]);
  });

  it.each(counts)(
    "stands the door and coffee station on their walls, off the desks, at %i agents",
    (n) => {
      const layout = layoutOffice(n, view);
      const shell = roomShell(layout);
      const [top, right, , left] = shell.floor;
      const onLine = (a: Point, b: Point, p: Point) =>
        Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) < 1e-6 &&
        p.x >= Math.min(a.x, b.x) &&
        p.x <= Math.max(a.x, b.x);
      expect(onLine(left, top, shell.door)).toBe(true);
      expect(onLine(top, right, shell.coffee)).toBe(true);
      const desks = layout.desks.map(deskFootprint);
      for (const f of desks) {
        expect(within(f, shell.door)).toBe(false);
        expect(within(f, shell.coffee)).toBe(false);
        // The door's and station's bounding boxes miss every desk column footprint.
        expect(overlap(f, wallPropRect("DOOR", shell.door))).toBe(false);
        expect(overlap(f, wallPropRect("COFFEE_STATION", shell.coffee))).toBe(false);
      }
      expect(shell.door.x).toBeLessThan(
        Math.min(...layout.desks.slice(0, DESKS_PER_ROW).map((d) => d.x)),
      );
      expect(shell.coffee.x).toBeGreaterThan(layout.desks[0].x);
    },
  );

  it("keeps door and coffee fixed against the back desk when a row is added", () => {
    const a = layoutOffice(4, view);
    const b = layoutOffice(12, view);
    const sa = roomShell(a);
    const sb = roomShell(b);
    expect(sb.door.x - b.desks[0].x).toBeCloseTo(sa.door.x - a.desks[0].x);
    expect(sb.door.y - b.desks[0].y).toBeCloseTo(sa.door.y - a.desks[0].y);
    expect(sb.coffee.x - b.desks[0].x).toBeCloseTo(sa.coffee.x - a.desks[0].x);
    expect(sb.coffee.y - b.desks[0].y).toBeCloseTo(sa.coffee.y - a.desks[0].y);
  });

  it("keeps queue and coffee-break spots on the floor", () => {
    const shell = roomShell(layoutOffice(12, view));
    for (let i = 0; i < 4; i++) {
      expect(inside(shell.floor, shell.queueSpot(i))).toBe(true);
      expect(inside(shell.floor, shell.coffeeSpot(i))).toBe(true);
    }
    expect(inside(shell.floor, shell.plantTall)).toBe(true);
    expect(inside(shell.floor, shell.plantBush)).toBe(true);
  });

  // A standing figure at a floor spot: 40 px wide, head to feet.
  const figure = (p: Point): Rect => ({
    left: p.x - 20,
    right: p.x + 20,
    top: p.y - STANDING_FOOT,
    bottom: p.y,
  });

  it.each(counts)("keeps door queue spots and the +N button off every desk at %i desks", (n) => {
    const layout = layoutOffice(n, view);
    const shell = roomShell(layout);
    const g = geometryFor(layout);
    const desks = layout.desks.map(deskFootprint);
    const seated = layout.desks.map((_, i) => {
      const s = g.seat(i);
      return {
        left: s.x - RIG_WIDTH / 2,
        right: s.x + RIG_WIDTH / 2,
        top: s.y - RIG_HEIGHT,
        bottom: s.y,
      };
    });
    for (let i = 0; i <= QUEUE_VISIBLE; i++) {
      const f = figure(shell.queueSpot(i));
      for (const r of [...desks, ...seated]) expect(overlap(f, r)).toBe(false);
    }
  });

  it.each(counts)("keeps coffee-break spots off every desk and on the floor at %i desks", (n) => {
    const layout = layoutOffice(n, view);
    const shell = roomShell(layout);
    const desks = layout.desks.map(deskFootprint);
    for (let i = 0; i < 30; i++) {
      const spot = shell.coffeeSpot(i);
      expect(inside(shell.floor, spot)).toBe(true);
      for (const r of desks) expect(overlap(figure(spot), r)).toBe(false);
    }
  });

  it("spreads the coffee spots so no two figures stack", () => {
    const shell = roomShell(layoutOffice(4, view));
    for (let i = 0; i < COFFEE_SPOTS; i++)
      for (let j = i + 1; j < COFFEE_SPOTS; j++) {
        const a = shell.coffeeSpot(i);
        const b = shell.coffeeSpot(j);
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(40);
      }
  });

  it.each(counts)("keeps water spots off every desk and on the floor at %i desks", (n) => {
    const layout = layoutOffice(n, view);
    const shell = roomShell(layout);
    const desks = layout.desks.map(deskFootprint);
    for (let i = 0; i < 30; i++) {
      const spot = shell.waterSpot(i);
      expect(inside(shell.floor, spot)).toBe(true);
      for (const r of desks) expect(overlap(figure(spot), r)).toBe(false);
    }
  });

  it("clamps the water spot index to the water table, which is as long as the coffee one", () => {
    const shell = roomShell(layoutOffice(4, view));
    expect(WATER_ALONG).toHaveLength(COFFEE_SPOTS);
    expect(shell.waterSpot(WATER_ALONG.length + 7)).toEqual(
      shell.waterSpot(WATER_ALONG.length - 1),
    );
  });

  it("keeps every spot of both stations at least a figure width from every other", () => {
    const shell = roomShell(layoutOffice(4, view));
    const all = [
      ...Array.from({ length: COFFEE_SPOTS }, (_, i) => shell.coffeeSpot(i)),
      ...Array.from({ length: COFFEE_SPOTS }, (_, i) => shell.waterSpot(i)),
    ];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        expect(
          Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y),
          `${i} vs ${j}`,
        ).toBeGreaterThanOrEqual(40);
  });

  it("slopes both wall bases at the tile slope and tiles half the floor", () => {
    const shell = roomShell(layoutOffice(8, view));
    const [top, right, , left] = shell.floor;
    expect((left.y - top.y) / (top.x - left.x)).toBeCloseTo(WALL_SKEW);
    expect((right.y - top.y) / (right.x - top.x)).toBeCloseTo(WALL_SKEW);
    expect(shell.floorTiles.length).toBeGreaterThan(10);
    for (const t of shell.floorTiles) for (const p of t) expect(inside(shell.floor, p)).toBe(true);
  });

  it("is the same shell for the minimum window", () => {
    expect(
      roomShell(layoutOffice(12, { width: MIN_WIDTH, height: MIN_HEIGHT })).floor,
    ).toHaveLength(4);
    const l = layoutOffice(0, view);
    expect(roomShell(l).floor).toHaveLength(4);
  });

  // The door and counter are drawn for their wall (door rises to the right on the back-left
  // wall, counter falls to the right on the back-right wall): their bases follow the baseboard.
  it.each(counts)("sits the door's base on the back-left baseboard at %i agents", (n) => {
    const shell = roomShell(layoutOffice(n, view));
    const r = wallPropRect("DOOR", shell.door);
    for (let col = 0; col < DOOR[0].length; col++) {
      let last = -1;
      for (let row = 0; row < DOOR.length; row++) if (DOOR[row][col] !== ".") last = row;
      const x = r.left + (col + 0.5) * CELL;
      const wallY = shell.door.y - (x - shell.door.x) * WALL_SKEW;
      expect(Math.abs(r.top + (last + 1) * CELL - wallY)).toBeLessThanOrEqual(BASEBOARD_HEIGHT / 3);
    }
  });

  // Value: the open door's light fans out from the gap (a constant-width patch read as a doormat).
  it.each(counts)("fans the door light out from the gap onto the floor at %i agents", (n) => {
    const shell = roomShell(layoutOffice(n, view));
    const { near, far } = shell.doorLight;
    expect(near).toHaveLength(4);
    expect(far).toHaveLength(4);
    for (const p of [...near, ...far]) expect(inside(shell.floor, p)).toBe(true);
    // Wall-side edge: near sits on the wall line through the door, far starts where near ends.
    const [top, , , left] = shell.floor;
    const wallSide = (p: Point) =>
      Math.abs((top.x - left.x) * (p.y - left.y) - (top.y - left.y) * (p.x - left.x));
    expect(wallSide(near[0])).toBeLessThan(1e-6);
    expect(wallSide(near[1])).toBeLessThan(1e-6);
    expect(wallSide(far[0])).toBeGreaterThan(1e-6);
    // Distance from the wall line grows: far is strictly farther and wider than near.
    expect(wallSide(far[2])).toBeGreaterThan(wallSide(near[2]));
    const width = (q: Point[]) => Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y);
    const outer = (q: Point[]) => Math.hypot(q[2].x - q[3].x, q[2].y - q[3].y);
    expect(outer(near)).toBeGreaterThan(width(near));
    expect(outer(far)).toBeGreaterThan(outer(near));
    expect(far[0]).toEqual(near[3]);
    expect(far[1]).toEqual(near[2]);
    // Clear of the door (the wall line itself is its foot): no sampled point of either quad lands on an opaque door cell.
    const box = wallPropRect("DOOR", shell.door);
    const opaque = (p: Point) => {
      const col = Math.floor((p.x - box.left) / CELL);
      const row = Math.floor((p.y - box.top) / CELL);
      return DOOR[row]?.[col] !== undefined && DOOR[row][col] !== ".";
    };
    for (const q of [near, far])
      for (let i = 0; i <= 8; i++)
        for (let j = 1; j <= 8; j++) {
          const lerp = (a: Point, b: Point, t: number) => ({
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
          });
          const p = lerp(lerp(q[0], q[1], i / 8), lerp(q[3], q[2], i / 8), j / 8);
          expect(opaque(p), `${q === near ? "near" : "far"} ${i},${j}`).toBe(false);
        }
  });

  it.each(counts)(
    "sits the coffee station's back foot on the back-right baseboard at %i agents",
    (n) => {
      const shell = roomShell(layoutOffice(n, view));
      const r = wallPropRect("COFFEE_STATION", shell.coffee);
      // The counter's right end face meets the wall at its last drawn column.
      const col = COFFEE_STATION[0].length - 2;
      let last = -1;
      for (let row = 0; row < COFFEE_STATION.length; row++)
        if (COFFEE_STATION[row][col] !== ".") last = row;
      const x = r.left + (col + 0.5) * CELL;
      const wallY = shell.coffee.y + (x - shell.coffee.x) * WALL_SKEW;
      expect(Math.abs(r.top + (last + 1) * CELL - wallY)).toBeLessThanOrEqual(BASEBOARD_HEIGHT / 3);
    },
  );

  it.each(counts)(
    "stands the dispenser on the back-right wall, off the desks, at %i agents",
    (n) => {
      const layout = layoutOffice(n, view);
      const shell = roomShell(layout);
      const [top, right] = shell.floor;
      const slope = (right.y - top.y) / (right.x - top.x);
      expect(shell.dispenser.y - top.y).toBeCloseTo((shell.dispenser.x - top.x) * slope);
      expect(shell.dispenser.x).toBeGreaterThan(shell.coffee.x);
      const r = wallPropRect("DISPENSER", shell.dispenser);
      for (const d of layout.desks.map(deskFootprint)) expect(overlap(d, r)).toBe(false);
      expect(overlap(r, wallPropRect("COFFEE_STATION", shell.coffee))).toBe(false);
    },
  );

  it.each(counts)("sits the dispenser's base on the back-right baseboard at %i agents", (n) => {
    const shell = roomShell(layoutOffice(n, view));
    const r = wallPropRect("DISPENSER", shell.dispenser);
    for (let col = 0; col < DISPENSER[0].length; col++) {
      let last = -1;
      for (let row = 0; row < DISPENSER.length; row++) if (DISPENSER[row][col] !== ".") last = row;
      if (last < 0) continue;
      const x = r.left + (col + 0.5) * CELL;
      const wallY = shell.dispenser.y + (x - shell.dispenser.x) * WALL_SKEW;
      expect(Math.abs(r.top + (last + 1) * CELL - wallY)).toBeLessThanOrEqual(BASEBOARD_HEIGHT);
    }
  });

  it.each(counts)("keeps every plant's pot inside the floor at %i agents", (n) => {
    const shell = roomShell(layoutOffice(n, view));
    for (const [at, width] of [
      [shell.plantTall, 32],
      [shell.plantBush, 36],
    ] as const)
      for (const dx of [-width / 2, 0, width / 2])
        expect(inside(shell.floor, { x: at.x + dx, y: at.y })).toBe(true);
  });

  it.each(counts)(
    "keeps the plants' boxes off the door and the coffee station at %i agents",
    (n) => {
      const shell = roomShell(layoutOffice(n, view));
      const box = (name: "PLANT_TALL" | "PLANT_BUSH", at: Point): Rect => {
        const { width, height } = propSize(name);
        return {
          left: at.x - width / 2,
          right: at.x + width / 2,
          top: at.y - height,
          bottom: at.y,
        };
      };
      expect(overlap(box("PLANT_TALL", shell.plantTall), wallPropRect("DOOR", shell.door))).toBe(
        false,
      );
      for (const r of [
        wallPropRect("COFFEE_STATION", shell.coffee),
        wallPropRect("DISPENSER", shell.dispenser),
        wallPropRect("DOOR", shell.door),
        box("PLANT_TALL", shell.plantTall),
      ])
        expect(overlap(box("PLANT_BUSH", shell.plantBush), r)).toBe(false);
    },
  );
});

describe("WALL_LAYOUT", () => {
  type Item = (typeof WALL_LAYOUT)[number];
  const clash = (a: Item, b: Item) => a.from < b.to && b.from < a.to;
  // Pairs allowed to overlap (order-free). Spots stand in front of the stations, and the two
  // spot lines interleave on separate lines of floor (room.ts).
  const allowed: [string, string][] = [
    ["coffee spots", "coffee station"],
    ["coffee spots", "dispenser"],
    ["coffee spots", "water spots"],
    ["water spots", "coffee station"],
    ["water spots", "dispenser"],
    ["door queue", "door"],
  ];
  const isAllowed = (a: Item, b: Item) =>
    allowed.some(([x, y]) => (a.name === x && b.name === y) || (a.name === y && b.name === x));
  /** Every same-wall pair, whatever the lane, that overlaps and is not allowed. */
  const overlaps = (table: readonly Item[]) => {
    const bad: string[] = [];
    table.forEach((a, i) =>
      table.slice(i + 1).forEach((b) => {
        if (a.wall === b.wall && clash(a, b) && !isAllowed(a, b))
          bad.push(`${a.name} vs ${b.name}`);
      }),
    );
    return bad;
  };
  const moved = (name: string, along: number) =>
    WALL_LAYOUT.map((i) => {
      if (i.name !== name) return i;
      const half = (i.to - i.from) / 2;
      return { ...i, from: along - half, to: along + half };
    });

  it("lists the door, clock, both stations, both plants, both spot lines, the windows and the left-wall dressing", () => {
    expect(WALL_LAYOUT.map((i) => i.name).sort()).toEqual(
      [
        "bookshelf",
        "bush plant",
        "clock",
        "coffee spots",
        "coffee station",
        "dispenser",
        "door",
        "door queue",
        "picture a",
        "picture b",
        "tall plant",
        "water spots",
        "window left 1",
        "window right 1",
      ].sort(),
    );
  });

  it("hangs at most 4 windows, all in the wall lane, and allowlists none of them", () => {
    const windows = WALL_LAYOUT.filter((i) => i.name.startsWith("window"));
    expect(windows.length).toBeGreaterThan(0);
    expect(windows.length).toBeLessThanOrEqual(4);
    expect(windows.map((w) => w.name)).toEqual(WINDOW_SPOTS.map((w) => w.name));
    for (const w of windows) expect(w.lane).toBe("wall");
    for (const name of allowed.flat()) expect(name).not.toMatch(/^window/);
    expect(allowed).toHaveLength(6);
  });

  it("lists the door queue's 4 visible spots as a standing stretch on the left wall", () => {
    const q = WALL_LAYOUT.find((i) => i.name === "door queue")!;
    expect([q.wall, q.lane]).toEqual(["left", "stand"]);
    expect(q.from).toBeCloseTo(DOOR_AT - (QUEUE_VISIBLE - 1) * QUEUE_GAP);
    expect(q.to).toBeCloseTo(DOOR_AT);
    // A window moved onto the queue is reported (the queue is no longer invisible to the table).
    expect(overlaps(moved("window left 1", 0.15))).toContain("door queue vs window left 1");
  });

  it("reports a window moved into the door, the tall plant or the clock", () => {
    expect(overlaps(moved("window left 1", DOOR_AT))).toContain("door vs window left 1");
    expect(overlaps(moved("window left 1", 0.7))).toContain("tall plant vs window left 1");
    expect(overlaps(moved("window left 1", -0.6))).toContain("bush plant vs window left 1");
    expect(overlaps(moved("window right 1", 0.9))).toContain("clock vs window right 1");
    expect(overlaps(moved("window right 1", 2.2))).toContain("coffee station vs window right 1");
  });

  it("has no allowlist entry for the bush plant", () => {
    expect(allowed.flat()).not.toContain("bush plant");
  });

  it("gives every item a stretch of wall that starts before it ends", () => {
    for (const i of WALL_LAYOUT) expect(i.from, i.name).toBeLessThan(i.to);
  });

  it("overlaps no two items on a wall, whatever the lane, bar the allowlist", () => {
    expect(overlaps(WALL_LAYOUT)).toEqual([]);
  });

  it("reports the bush plant moved into the door", () => {
    expect(overlaps(moved("bush plant", DOOR_AT))).toContain("door vs bush plant");
  });

  it("reports the dispenser moved into the coffee station", () => {
    expect(overlaps(moved("dispenser", 2.2))).toContain("coffee station vs dispenser");
  });

  it("reports the clock moved into the dispenser", () => {
    const at = WALL_LAYOUT.find((i) => i.name === "dispenser")!;
    expect(overlaps(moved("clock", (at.from + at.to) / 2))).toContain("clock vs dispenser");
  });

  it("reports the clock moved into the coffee station", () => {
    expect(overlaps(moved("clock", 2.2))).toContain("clock vs coffee station");
  });
});

describe("wall dressing", () => {
  const rowsOf = (n: number) => layoutOffice(n * DESKS_PER_ROW, view);
  const names = (n: number) => roomShell(rowsOf(n)).wallDecor.map((d) => d.name);
  const all = ["bookshelf", "picture a", "picture b"];

  it("draws nothing on the one-row wall, the shelf from two rows, the pictures from three", () => {
    expect(names(1)).toEqual([]);
    expect(names(2)).toEqual(["bookshelf"]);
    for (const n of [3, 4, 5, 6]) expect(names(n)).toEqual(all);
    expect(roomShell(layoutOffice(0, view)).wallDecor).toEqual([]);
  });

  it("lists each in the wall lane of the left wall, past the window, none allowlisted", () => {
    const win = WALL_LAYOUT.find((i) => i.name === "window left 1")!;
    for (const name of all) {
      const i = WALL_LAYOUT.find((x) => x.name === name)!;
      expect([i.wall, i.lane], name).toEqual(["left", "wall"]);
      expect(i.from, name).toBeGreaterThanOrEqual(win.to);
    }
  });

  it("measures the shelf into the free span at two rows (frontY - window edge)", () => {
    const win = WALL_LAYOUT.find((i) => i.name === "window left 1")!;
    const shelf = WALL_LAYOUT.find((i) => i.name === "bookshelf")!;
    const frontY = 2 - 1 + FLOOR_MARGIN.frontLeft;
    expect(frontY - win.to).toBeGreaterThan(0.3);
    expect(frontY - win.to).toBeLessThan(0.4);
    expect(shelf.to).toBeLessThanOrEqual(frontY);
    expect(propSize("BOOKSHELF").width / (TILE_W / 2)).toBeCloseTo(shelf.to - shelf.from);
  });

  it("keeps every item where it was, against the back desk, for rows 2 to 6", () => {
    const ref = rowsOf(6);
    const refDecor = roomShell(ref).wallDecor;
    expect(refDecor).toHaveLength(3);
    for (let n = 2; n <= 6; n++) {
      const layout = rowsOf(n);
      for (const d of roomShell(layout).wallDecor) {
        const r = refDecor.find((x) => x.name === d.name)!;
        expect(d.base.x - layout.desks[0].x, `${d.name} ${n}`).toBeCloseTo(
          r.base.x - ref.desks[0].x,
        );
        expect(d.base.y - layout.desks[0].y, `${d.name} ${n}`).toBeCloseTo(
          r.base.y - ref.desks[0].y,
        );
      }
    }
  });

  // The grids shear at 1 row per 2 columns; the wall base climbs 160/296 px per px, so the staircase
  // sits within one cell of the line (the door and windows do the same): allow that cell.
  it("hangs every drawn cell of each item inside the left wall, to within one cell", () => {
    const shell = roomShell(rowsOf(6));
    for (const d of shell.wallDecor) {
      const r = wallPropRect(d.prop, d.base);
      PROPS[d.prop].forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          if (row[x] === ".") continue;
          const p = { x: r.left + (x + 0.5) * CELL, y: r.top + (y - 0.5) * CELL };
          expect(inside(shell.leftWall, p), `${d.name} ${x},${y}`).toBe(true);
        }
      });
    }
  });
});

describe("windows", () => {
  const wallOf = (shell: ReturnType<typeof roomShell>, wall: "left" | "right") =>
    wall === "left" ? shell.leftWall : shell.rightWall;
  const boxOf = (c: Point): Rect => ({
    left: c.x - (WINDOW_COLS * CELL) / 2,
    right: c.x + (WINDOW_COLS * CELL) / 2,
    top: c.y - (WINDOW_ROWS * CELL) / 2,
    bottom: c.y + (WINDOW_ROWS * CELL) / 2,
  });

  it("hangs only the right-wall window at one row, the left-wall one once the wall lengthens", () => {
    const names = (n: number) => roomShell(layoutOffice(n, view)).windows.map((w) => w.name);
    expect(names(4)).toEqual(["window right 1"]);
    for (const n of [8, 12, 16, 20, 24])
      expect(names(n)).toEqual(["window left 1", "window right 1"]);
    expect(names(0)).toEqual(["window right 1"]);
  });

  it("keeps every window where it was, against the back desk, for rows 1 to 6", () => {
    const ref = layoutOffice(8, view);
    const refWindows = roomShell(ref).windows;
    expect(refWindows).toHaveLength(2);
    for (let rows = 1; rows <= 6; rows++) {
      const layout = layoutOffice(rows * 4, view);
      for (const w of roomShell(layout).windows) {
        const r = refWindows.find((x) => x.name === w.name)!;
        expect(w.center.x - layout.desks[0].x, `${w.name} ${rows}`).toBeCloseTo(
          r.center.x - ref.desks[0].x,
        );
        expect(w.center.y - layout.desks[0].y, `${w.name} ${rows}`).toBeCloseTo(
          r.center.y - ref.desks[0].y,
        );
      }
    }
  });

  it.each(counts)(
    "hangs each window inside its wall, WINDOW_LIFT above the wall base, at %i agents",
    (n) => {
      const shell = roomShell(layoutOffice(n, view));
      for (const w of shell.windows) {
        const wall = wallOf(shell, w.wall);
        const b = boxOf(w.center);
        for (const p of [
          { x: b.left, y: b.top },
          { x: b.right, y: b.top },
          { x: b.left, y: b.bottom },
          { x: b.right, y: b.bottom },
        ])
          expect(inside(wall, p), `${w.name} corner ${p.x},${p.y}`).toBe(true);
        const [top, right, , left] = shell.floor;
        const [a, c] = w.wall === "left" ? [left, top] : [top, right];
        const baseY = a.y + ((w.center.x - a.x) * (c.y - a.y)) / (c.x - a.x);
        expect(baseY - w.center.y).toBeCloseTo(WINDOW_LIFT);
      }
    },
  );

  it.each(counts)(
    "keeps every window off the door, clock, stations, plants and each other at %i agents",
    (n) => {
      const shell = roomShell(layoutOffice(n, view));
      const box = (name: "PLANT_TALL" | "PLANT_BUSH", at: Point): Rect => {
        const { width, height } = propSize(name);
        return {
          left: at.x - width / 2,
          right: at.x + width / 2,
          top: at.y - height,
          bottom: at.y,
        };
      };
      const clock = propSize("CLOCK");
      const others: Rect[] = [
        wallPropRect("DOOR", shell.door),
        wallPropRect("COFFEE_STATION", shell.coffee),
        wallPropRect("DISPENSER", shell.dispenser),
        box("PLANT_TALL", shell.plantTall),
        box("PLANT_BUSH", shell.plantBush),
        {
          left: shell.clock.x - clock.width / 2,
          right: shell.clock.x + clock.width / 2,
          top: shell.clock.y - clock.height / 2,
          bottom: shell.clock.y + clock.height / 2,
        },
      ];
      shell.windows.forEach((w, i) => {
        for (const r of others) expect(overlap(boxOf(w.center), r), w.name).toBe(false);
        for (const o of shell.windows.slice(i + 1))
          expect(overlap(boxOf(w.center), boxOf(o.center)), `${w.name} vs ${o.name}`).toBe(false);
      });
    },
  );

  // Standing figures (40 px wide, head to feet) at every queue, coffee and water spot, and the
  // "+N" mark's spot: none overlaps any window box (min gap in px reported on failure).
  it.each(counts)("keeps every window off every standing spot and figure box at %i agents", (n) => {
    const shell = roomShell(layoutOffice(n, view));
    const spots: [string, Point][] = [];
    // A queued figure is drawn on its standing-foot point (motion.ts stand(): 6 px above the spot).
    for (let i = 0; i <= QUEUE_VISIBLE; i++) spots.push([`queue ${i}`, stand(shell.queueSpot(i))]);
    for (let i = 0; i < COFFEE_SPOTS; i++) {
      spots.push([`coffee ${i}`, shell.coffeeSpot(i)], [`water ${i}`, shell.waterSpot(i)]);
    }
    for (const w of shell.windows)
      for (const [name, p] of spots) {
        const fig: Rect = {
          left: p.x - 20,
          right: p.x + 20,
          top: p.y - STANDING_FOOT,
          bottom: p.y,
        };
        expect(overlap(boxOf(w.center), fig), `${w.name} vs ${name}`).toBe(false);
        expect(within(boxOf(w.center), p), `${w.name} spot ${name}`).toBe(false);
      }
  });

  it.each(counts)("lays each floor light patch on the floor, just inside it, at %i agents", (n) => {
    const layout = layoutOffice(n, view);
    const shell = roomShell(layout);
    for (const w of shell.windows) {
      expect(w.patch.length, w.name).toBeGreaterThanOrEqual(2);
      for (const pane of w.patch) {
        expect(pane, w.name).toHaveLength(4);
        for (const p of pane) expect(inside(shell.floor, p), `${w.name} ${p.x},${p.y}`).toBe(true);
        // A parallelogram: opposite edges equal.
        expect(pane[1].x - pane[0].x).toBeCloseTo(pane[2].x - pane[3].x);
        expect(pane[1].y - pane[0].y).toBeCloseTo(pane[2].y - pane[3].y);
        // Along the wall: the edge slopes like the wall base.
        expect(Math.abs((pane[1].y - pane[0].y) / (pane[1].x - pane[0].x))).toBeCloseTo(WALL_SKEW);
      }
    }
  });

  it.each(counts)("keeps the patches out of every desk's ground strip at %i agents", (n) => {
    const layout = layoutOffice(n, view);
    const shell = roomShell(layout);
    for (const d of layout.desks) {
      const f = deskFootprint(d);
      const strip: Rect = { left: f.left, right: f.right, top: f.bottom - 12, bottom: f.bottom };
      for (const w of shell.windows)
        for (const pane of w.patch)
          for (const p of pane) expect(within(strip, p), `${w.name} ${p.x},${p.y}`).toBe(false);
    }
  });

  it("sits the patch along its window's stretch of wall", () => {
    const shell = roomShell(layoutOffice(8, view));
    for (const w of shell.windows) {
      const xs = w.patch.flat().map((p) => p.x);
      // The patch stays within the window's width on screen, give or take the depth into the room.
      const depth = 0.7 * (TILE_W / 2);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(w.center.x - WINDOW_COLS - depth);
      expect(Math.max(...xs)).toBeLessThanOrEqual(w.center.x + WINDOW_COLS + depth);
    }
  });
});
