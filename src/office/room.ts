/**
 * The room shell: floor, two back walls and their baseboards, plus where the wall props
 * and floor plants stand. Pure geometry in unscaled room px, no DOM, no React.
 * The back-left wall runs along the floor's left edge, the back-right wall along its right
 * edge. The door and the counter are drawn for their wall (the door's base rises to the right,
 * the counter's falls to the right at the same slope), so they stand upright, never skewed.
 */
import { DESKS_PER_ROW } from "../../shared/tuning";
import { DESK_HEIGHT, DESK_WIDTH, RIG_HEIGHT } from "./CharacterRig";
import {
  FLOOR_MARGIN,
  TILE_H,
  TILE_W,
  WALL_HEIGHT,
  floorCorners,
  project,
  type DeskPosition,
  type OfficeLayout,
} from "./iso";
import { CELL } from "./pixel";
import { propSize } from "./props";
import { FRAMES } from "./sprites";

export type Point = { x: number; y: number };
export type Rect = { left: number; top: number; right: number; bottom: number };

/** Floor tile pattern: edge length in grid steps (a shaded tile alternates with a bare one). */
export const FLOOR_TILE = 0.5;
export const BASEBOARD_HEIGHT = 10;

// Wall props, in grid steps along their wall (door: down the back-left wall from the back
// corner; coffee and clock: along the back-right wall).
export const DOOR_AT = 0.3;
export const COFFEE_AT = 2.2;
export const CLOCK_AT = 0.9;
/** Clock center above the wall base, px. */
export const CLOCK_LIFT = 88;
// Floor plants stand just off a wall, inside the floor even with a single row of desks
// (the left wall is only 2 steps long then, so the tall plant sits close to the door).
export const PLANT_TALL_AT = { along: DOOR_AT + 0.4, off: 0.15 };
export const PLANT_BUSH_AT = { along: COFFEE_AT + 0.8, off: 0.25 };
// Standing spots in front of the door and the coffee station, in grid steps off the wall. The
// door queue huddles against the left wall in the pocket between the desk grid's back-left
// desks (spots shifted toward the back corner, 15 px apart); coffee breakers stand in the aisle
// in front of the counter at COFFEE_ALONG (steps along the wall from the counter's anchor; chosen
// so no figure overlaps a desk, room.test.ts), COFFEE_SPOTS places in all. Agents beyond the
// last spot get none: they keep working or waiting seated (motion.ts).
export const QUEUE_OFF = 0.1;
export const QUEUE_GAP = 0.1;
export const COFFEE_OFF = 0.45;
export const COFFEE_ALONG = [0, -0.3, -0.6, 0.3, 0.8, 1.1, 1.4, -0.9] as const;
export const COFFEE_SPOTS = COFFEE_ALONG.length;

/** Screen slope of both walls' base lines (rise over run). */
export const WALL_SKEW = TILE_H / TILE_W;

/**
 * Where a wall prop's base meets its wall, in px from the sprite's top-left: the door's base
 * line (bottom edge of its columns) at the middle column, and the counter's back foot at its
 * right end face, 2 cells in from the edge, where the end face runs into the wall (the front
 * face's base sits `depth` px in front of the wall).
 */
export const WALL_ANCHOR = {
  DOOR: { x: 10 * CELL, y: 55 * CELL },
  COFFEE_STATION: { x: 30 * CELL, y: 47 * CELL },
} as const;

/** Box of a wall prop whose base anchor stands on the wall point `at`. */
export function wallPropRect(name: keyof typeof WALL_ANCHOR, at: Point): Rect {
  const { width, height } = propSize(name);
  const a = WALL_ANCHOR[name];
  return {
    left: at.x - a.x,
    top: at.y - a.y,
    right: at.x - a.x + width,
    bottom: at.y - a.y + height,
  };
}

export type RoomShell = {
  floor: Point[];
  /** The shaded half of the floor's checker pattern, one polygon per tile. */
  floorTiles: Point[][];
  leftWall: Point[];
  rightWall: Point[];
  leftBaseboard: Point[];
  rightBaseboard: Point[];
  wallHeight: number;
  /** Bottom-center anchors on a wall base, or floor spots for the plants. */
  door: Point;
  coffee: Point;
  /** Center of the clock on the back-right wall. */
  clock: Point;
  plantTall: Point;
  plantBush: Point;
  /** Floor spot `i` in front of the door (queue) and the coffee station (breaks). */
  queueSpot: (i: number) => Point;
  coffeeSpot: (i: number) => Point;
};

const lift = (pts: Point[], dy: number): Point[] => pts.map((p) => ({ x: p.x, y: p.y - dy }));

export function roomShell(layout: OfficeLayout): RoomShell {
  const m = FLOOR_MARGIN;
  const { origin } = layout;
  const at = (gx: number, gy: number): Point => {
    const p = project(gx, gy);
    return { x: p.x + origin.x, y: p.y + origin.y };
  };
  const wallX = -m.backLeft;
  const wallY = -m.backRight;
  const lastX = DESKS_PER_ROW - 1 + m.frontRight;
  const frontY = layout.rows - 1 + m.frontLeft;
  const c = floorCorners(layout.rows);
  const floor = [c.top, c.right, c.bottom, c.left].map((p) => ({
    x: p.x + origin.x,
    y: p.y + origin.y,
  }));

  const floorTiles: Point[][] = [];
  const nx = Math.ceil((lastX - wallX) / FLOOR_TILE);
  const ny = Math.ceil((frontY - wallY) / FLOOR_TILE);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      if ((i + j) % 2 === 0) continue;
      const x0 = wallX + i * FLOOR_TILE;
      const y0 = wallY + j * FLOOR_TILE;
      const x1 = Math.min(x0 + FLOOR_TILE, lastX);
      const y1 = Math.min(y0 + FLOOR_TILE, frontY);
      floorTiles.push([at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)]);
    }

  const top = floor[0];
  const right = floor[1];
  const left = floor[3];
  const leftBase = [left, top];
  const rightBase = [top, right];
  const wallPoly = (base: Point[]) => [...base, ...lift([...base].reverse(), WALL_HEIGHT)];
  const baseboard = (base: Point[]) => [...base, ...lift([...base].reverse(), BASEBOARD_HEIGHT)];

  const coffee = at(COFFEE_AT, wallY);
  const door = at(wallX, DOOR_AT);
  const clockBase = at(CLOCK_AT, wallY);
  return {
    floor,
    floorTiles,
    leftWall: wallPoly(leftBase),
    rightWall: wallPoly(rightBase),
    leftBaseboard: baseboard(leftBase),
    rightBaseboard: baseboard(rightBase),
    wallHeight: WALL_HEIGHT,
    door,
    coffee,
    clock: { x: clockBase.x, y: clockBase.y - CLOCK_LIFT },
    plantTall: at(wallX + PLANT_TALL_AT.off, PLANT_TALL_AT.along),
    plantBush: at(PLANT_BUSH_AT.along, wallY + PLANT_BUSH_AT.off),
    queueSpot: (i) => at(wallX + QUEUE_OFF, DOOR_AT - i * QUEUE_GAP),
    coffeeSpot: (i) =>
      at(COFFEE_AT + COFFEE_ALONG[Math.min(i, COFFEE_SPOTS - 1)], wallY + COFFEE_OFF),
  };
}

/**
 * Where the seated frame's top-left cell goes, relative to the desk sprite, in cells. The
 * worker sits at the desk's near-left end, clear of the desk top and the monitor that draw over
 * the body, so head and torso stay visible in every state (the arms reach under the desk edge).
 * Chair and body fit the desk's footprint, with 8 px to the desk two rows behind.
 */
export const SEAT_AT = [-16, 28] as const;

/** Leftmost drawn column of the seated frames, in cells (the frame box has empty margin). */
const SEATED_LEFT = Math.min(
  ...(["SEATED_TYPING", "SEATED_IDLE", "SEATED_RAISED"] as const).map((f) =>
    Math.min(...FRAMES[f].map((row) => row.search(/[^.]/)).filter((c) => c >= 0)),
  ),
);

/** What a seated desk covers: the desk sprite plus the chair and the seated rig. */
export function deskFootprint(d: DeskPosition): Rect {
  const top = d.y - (DESK_HEIGHT * 3) / 4;
  const left = d.x - DESK_WIDTH / 2;
  return {
    left: left + Math.min(0, (SEAT_AT[0] + SEATED_LEFT) * CELL),
    right: left + DESK_WIDTH,
    top,
    bottom: Math.max(top + DESK_HEIGHT, top + SEAT_AT[1] * CELL + RIG_HEIGHT),
  };
}
