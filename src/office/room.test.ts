import { describe, expect, it } from "vite-plus/test";
import { DESKS_PER_ROW } from "../../shared/tuning";
import { CELL } from "./pixel";
import { COFFEE_STATION, DOOR, propSize } from "./props";
import { MIN_HEIGHT, MIN_WIDTH, layoutOffice } from "./iso";
import { QUEUE_VISIBLE, STANDING_FOOT, geometryFor } from "./scene-model";
import { RIG_HEIGHT, RIG_WIDTH } from "./CharacterRig";
import {
  BASEBOARD_HEIGHT,
  COFFEE_SPOTS,
  WALL_SKEW,
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
    for (const p of [...shell.floor, ...shell.leftWall, ...shell.rightWall]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(layout.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(layout.height);
    }
    for (const d of layout.desks) {
      const f = deskFootprint(d);
      expect(f.left).toBeGreaterThanOrEqual(0);
      expect(f.right).toBeLessThanOrEqual(layout.width);
      expect(f.top).toBeGreaterThanOrEqual(0);
      expect(f.bottom).toBeLessThanOrEqual(layout.height);
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
      expect(
        overlap(box("PLANT_BUSH", shell.plantBush), wallPropRect("COFFEE_STATION", shell.coffee)),
      ).toBe(false);
    },
  );
});
