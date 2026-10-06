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
import { propSize, type PropName } from "./props";
import { FRAMES } from "./sprites";

export type Point = { x: number; y: number };
export type Rect = { left: number; top: number; right: number; bottom: number };

/** Floor tile pattern: edge length in grid steps (a shaded tile alternates with a bare one). */
export const FLOOR_TILE = 0.5;
export const BASEBOARD_HEIGHT = 10;

// Wall props, in grid steps along their wall (door: down the back-left wall from the back
// corner; coffee, dispenser and clock: along the back-right wall).
export const DOOR_AT = 0.3;
export const COFFEE_AT = 2.2;
export const DISPENSER_AT = 2.9;
export const CLOCK_AT = 0.9;
/** Clock center above the wall base, px. */
export const CLOCK_LIFT = 88;
// Floor plants stand just off a wall, inside the floor even with a single row of desks
// (the left wall is only 2 steps long then, so the tall plant sits close to the door). The bush
// fills the back corner behind the door queue: both stations' standing spots take the right wall.
export const PLANT_TALL_AT = { along: DOOR_AT + 0.4, off: 0.15 };
export const PLANT_BUSH_AT = { along: -0.8, off: 0.25 };
// Standing spots in front of the door and the coffee station, in grid steps off the wall. The
// door queue huddles against the left wall in the pocket between the desk grid's back-left
// desks (spots shifted toward the back corner, 15 px apart); coffee breakers stand in the aisle
// in front of the counter at COFFEE_ALONG (steps along the wall from the counter's anchor; chosen
// so no figure overlaps a desk, room.test.ts), COFFEE_SPOTS places in all. Agents beyond the
// last spot get none: they keep working or waiting seated (motion.ts).
// Each spot index has two standing places: coffeeSpot(i) at the coffee station and waterSpot(i)
// at the dispenser, the latter on a second line of floor nearer the wall (WATER_OFF, chosen so no
// figure stands within a figure width of another and none on a desk). An agent with a spot can therefore take either
// drink and never find the chosen station "full": no two agents share a place at either one.
export const QUEUE_OFF = 0.1;
export const QUEUE_GAP = 0.1;
/** Door queue places where a queued figure is drawn; the rest only count toward a "+N" mark. */
export const QUEUE_SPOTS = 4;
export const COFFEE_OFF = 0.45;
export const COFFEE_ALONG = [0, -0.3, -0.6, 0.3, 0.8, 1.1, 1.4, -0.9] as const;
export const COFFEE_SPOTS = COFFEE_ALONG.length;
export const WATER_OFF = 0.2;
export const WATER_ALONG = [0.1, -0.2, 0.4, 0.7, -0.7, -1, -1.3, -1.6] as const;

// Wall windows: a flat WINDOW_COLS x WINDOW_FLAT_ROWS cell drawing sheared onto its wall at the wall
// slope (a column pair rises or drops a row, decor.ts), so the box is WINDOW_ROWS tall. The box
// centre stands WINDOW_LIFT px above the wall base. Windows are placed in grid steps along their
// wall from the back corner, so adding rows never moves one; one is drawn only if the wall is long
// enough for it.
export const WINDOW_COLS = 30;
export const WINDOW_FLAT_ROWS = 36;
export const WINDOW_ROWS = WINDOW_FLAT_ROWS + WINDOW_COLS / 2 - 1;
export const WINDOW_LIFT = 80;
/** The light patch on the floor under a window: 2 panes along the wall by 2 deep, in grid steps. */
export const PATCH_OFF = [
  [0.15, 0.37],
  [0.41, 0.63],
] as const;
export const PATCH_GAP = 0.04;
/**
 * The light fan on the floor in front of the open door, in grid steps: half-width along the wall at
 * the gap, then the half-width and distance off the wall where the near tone ends and the far tone ends.
 */
export const DOOR_LIGHT = {
  gap: 0.2,
  near: { half: 0.28, off: 0.25 },
  far: { half: 0.4, off: 0.55 },
} as const;

export type WindowSpot = { name: string; wall: "left" | "right"; at: number };
/**
 * Left wall: one beyond the tall plant, drawn only once the wall is long enough (from two rows);
 * between the bush and the door there is no room, the door queue's figures stand there. Right wall:
 * between the back corner and the clock (past the clock the coffee and water spots take the floor).
 */
export const WINDOW_SPOTS: readonly WindowSpot[] = [
  { name: "window left 1", wall: "left", at: 1.25 },
  { name: "window right 1", wall: "right", at: 0.35 },
];

/**
 * Left-wall dressing past the window (design 7B): a bookshelf standing on the wall base and two
 * pictures hung PICTURE_LIFT px above it. `at` is the middle column's wall point, in grid steps
 * like WINDOW_SPOTS; each is drawn only if its whole stretch fits on the wall (at + half <= the
 * wall's front end), so the shelf shows from two rows and the pictures from three, and none
 * moves when rows are added.
 */
const PICTURE_LIFT = 56;
export type DecorSpot = {
  name: string;
  prop: "BOOKSHELF" | "PICTURE_A" | "PICTURE_B";
  at: number;
  lift: number;
};
export const DECOR_SPOTS: readonly DecorSpot[] = [
  { name: "bookshelf", prop: "BOOKSHELF", at: 1.625, lift: 0 },
  { name: "picture a", prop: "PICTURE_A", at: 1.915, lift: PICTURE_LIFT },
  { name: "picture b", prop: "PICTURE_B", at: 2.141, lift: PICTURE_LIFT },
];

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
  // The jug column's bottom at the middle column (props.ts DISPENSER; the base falls to the right).
  DISPENSER: { x: 8 * CELL, y: 33 * CELL },
  // Bottom edge at the middle column of the sheared frames (props.ts BOOKSHELF, PICTURE_A, PICTURE_B).
  BOOKSHELF: { x: 10 * CELL, y: 34 * CELL },
  PICTURE_A: { x: 7 * CELL, y: 19 * CELL },
  PICTURE_B: { x: 6 * CELL, y: 16 * CELL },
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

/**
 * Every wall or wall-adjacent item and the stretch of wall it covers, in grid steps along the
 * wall (room.test.ts checks no two items on one wall overlap, whatever the lane, bar an allowlist). `lane` separates what
 * hangs on or leans against the wall ("wall"), what stands on the floor beside it ("floor") and
 * where figures stand in front of it ("stand"). The left wall counts steps from the back corner
 * down the wall, the right wall from the back corner along it.
 */
export type WallItem = {
  name: string;
  wall: "left" | "right";
  lane: "wall" | "floor" | "stand";
  from: number;
  to: number;
};

/** Grid steps per px along either wall (a step spans TILE_W / 2 across the screen). */
const STEP_PX = TILE_W / 2;
/** A sprite's stretch along its wall, centered on `at` (or with its anchor at `at`). */
const span = (at: number, name: PropName, anchorX = propSize(name).width / 2) => ({
  from: at - anchorX / STEP_PX,
  to: at + (propSize(name).width - anchorX) / STEP_PX,
});

/** A window's stretch along its wall, centered on `at`. */
const windowSpan = (at: number) => ({
  from: at - (WINDOW_COLS * CELL) / 2 / STEP_PX,
  to: at + (WINDOW_COLS * CELL) / 2 / STEP_PX,
});

export const WALL_LAYOUT: readonly WallItem[] = [
  ...DECOR_SPOTS.map((d) => ({
    name: d.name,
    wall: "left" as const,
    lane: "wall" as const,
    ...span(d.at, d.prop),
  })),
  { name: "door", wall: "left", lane: "wall", ...span(DOOR_AT, "DOOR") },
  { name: "tall plant", wall: "left", lane: "floor", ...span(PLANT_TALL_AT.along, "PLANT_TALL") },
  { name: "clock", wall: "right", lane: "wall", ...span(CLOCK_AT, "CLOCK") },
  {
    name: "coffee station",
    wall: "right",
    lane: "wall",
    ...span(COFFEE_AT, "COFFEE_STATION", WALL_ANCHOR.COFFEE_STATION.x),
  },
  { name: "dispenser", wall: "right", lane: "wall", ...span(DISPENSER_AT, "DISPENSER") },
  { name: "bush plant", wall: "left", lane: "floor", ...span(PLANT_BUSH_AT.along, "PLANT_BUSH") },
  {
    name: "coffee spots",
    wall: "right",
    lane: "stand",
    from: COFFEE_AT + Math.min(...COFFEE_ALONG),
    to: COFFEE_AT + Math.max(...COFFEE_ALONG),
  },
  {
    name: "water spots",
    wall: "right",
    lane: "stand",
    from: DISPENSER_AT + Math.min(...WATER_ALONG),
    to: DISPENSER_AT + Math.max(...WATER_ALONG),
  },
  {
    name: "door queue",
    wall: "left",
    lane: "stand",
    from: DOOR_AT - (QUEUE_SPOTS - 1) * QUEUE_GAP,
    to: DOOR_AT,
  },
  ...WINDOW_SPOTS.map((w) => ({
    name: w.name,
    wall: w.wall,
    lane: "wall" as const,
    ...windowSpan(w.at),
  })),
];

/** A window hung on a back wall: its box centre and the panes of floor light under it. */
export type PlacedWindow = {
  name: string;
  wall: "left" | "right";
  center: Point;
  /** Parallelograms on the floor, each 4 points. */
  patch: Point[][];
};

/** A shelf or picture on the back-left wall: `base` is where its WALL_ANCHOR lands. */
export type PlacedDecor = { name: string; prop: DecorSpot["prop"]; base: Point };

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
  dispenser: Point;
  /** The floor wedge lit by the open door: a near and a far quad, 4 points each. */
  doorLight: { near: Point[]; far: Point[] };
  /** Center of the clock on the back-right wall. */
  clock: Point;
  plantTall: Point;
  plantBush: Point;
  windows: PlacedWindow[];
  /** Left-wall dressing that fits, each with the wall point its base anchor stands on. */
  wallDecor: PlacedDecor[];
  /** Floor spot `i` in front of the door (queue), the coffee station and the dispenser (breaks). */
  queueSpot: (i: number) => Point;
  coffeeSpot: (i: number) => Point;
  waterSpot: (i: number) => Point;
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

  const half = (WINDOW_COLS * CELL) / 2 / STEP_PX;
  const windows = WINDOW_SPOTS.filter(
    (w) => w.at + half <= (w.wall === "left" ? frontY : lastX),
  ).map((w): PlacedWindow => {
    const left = w.wall === "left";
    const base = left ? at(wallX, w.at) : at(w.at, wallY);
    const pane = (a0: number, a1: number, o0: number, o1: number) =>
      left
        ? [at(wallX + o0, a0), at(wallX + o0, a1), at(wallX + o1, a1), at(wallX + o1, a0)]
        : [at(a0, wallY + o0), at(a1, wallY + o0), at(a1, wallY + o1), at(a0, wallY + o1)];
    const patch = PATCH_OFF.flatMap(([o0, o1]) =>
      [
        [w.at - half, w.at - PATCH_GAP / 2],
        [w.at + PATCH_GAP / 2, w.at + half],
      ].map(([a0, a1]) => pane(a0, a1, o0, o1)),
    );
    return { name: w.name, wall: w.wall, center: { x: base.x, y: base.y - WINDOW_LIFT }, patch };
  });

  const wallDecor = DECOR_SPOTS.filter(
    (d) => d.at + propSize(d.prop).width / 2 / STEP_PX <= frontY,
  ).map((d): PlacedDecor => {
    const base = at(wallX, d.at);
    return { name: d.name, prop: d.prop, base: { x: base.x, y: base.y - d.lift } };
  });

  const coffee = at(COFFEE_AT, wallY);
  const dispenser = at(DISPENSER_AT, wallY);
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
    dispenser,
    doorLight: {
      near: [
        at(wallX, DOOR_AT - DOOR_LIGHT.gap),
        at(wallX, DOOR_AT + DOOR_LIGHT.gap),
        at(wallX + DOOR_LIGHT.near.off, DOOR_AT + DOOR_LIGHT.near.half),
        at(wallX + DOOR_LIGHT.near.off, DOOR_AT - DOOR_LIGHT.near.half),
      ],
      far: [
        at(wallX + DOOR_LIGHT.near.off, DOOR_AT - DOOR_LIGHT.near.half),
        at(wallX + DOOR_LIGHT.near.off, DOOR_AT + DOOR_LIGHT.near.half),
        at(wallX + DOOR_LIGHT.far.off, DOOR_AT + DOOR_LIGHT.far.half),
        at(wallX + DOOR_LIGHT.far.off, DOOR_AT - DOOR_LIGHT.far.half),
      ],
    },
    clock: { x: clockBase.x, y: clockBase.y - CLOCK_LIFT },
    plantTall: at(wallX + PLANT_TALL_AT.off, PLANT_TALL_AT.along),
    plantBush: at(wallX + PLANT_BUSH_AT.off, PLANT_BUSH_AT.along),
    windows,
    wallDecor,
    queueSpot: (i) => at(wallX + QUEUE_OFF, DOOR_AT - i * QUEUE_GAP),
    coffeeSpot: (i) =>
      at(COFFEE_AT + COFFEE_ALONG[Math.min(i, COFFEE_SPOTS - 1)], wallY + COFFEE_OFF),
    waterSpot: (i) =>
      at(DISPENSER_AT + WATER_ALONG[Math.min(i, WATER_ALONG.length - 1)], wallY + WATER_OFF),
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
