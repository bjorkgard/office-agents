/**
 * Wall decor logic: the clock's hands from the real local time, drawn as pixel cells on the
 * clock face and sheared onto the back-right wall like the counter; and the wall windows, their
 * scenes (dim sky, matched to the real local hour) and their pixel art. Pure, `now` is passed in.
 */
import { hash } from "./appearance";
import type { GLASS } from "./palette";
import type { Grid, Run } from "./pixel";
import { DECOR_VARIANTS } from "./props";
import { WALL_SKEW, WINDOW_COLS, WINDOW_FLAT_ROWS, WINDOW_ROWS } from "./room";

/** The clock face is a flat CLOCK_FACE square of cells, sheared down to the right by whole cells. */
export const CLOCK_FACE = 12;
/** Rows the shear adds each side of the flat face, so the sheared grid is CLOCK_FACE + 2 * this. */
export const CLOCK_SHEAR = Math.round((CLOCK_FACE / 2) * WALL_SKEW);
export const CLOCK_ROWS = CLOCK_FACE + 2 * CLOCK_SHEAR;
/** Hand length in cells from the centre. The minute hand reaches the hour marks. */
export const HOUR_LENGTH = 2;
export const MINUTE_LENGTH = 3;
/** Hands are blocks of this many cells square, so every line is at least 2 cells wide. */
export const HAND_WIDTH = 2;

export type ClockCell = { x: number; y: number };
export type ClockAngles = { hour: number; minute: number; second: number };

/** Rows a flat column `x` drops when sheared onto the wall (right wall: down to the right). */
export function clockShear(x: number): number {
  return Math.round((x - (CLOCK_FACE - 1) / 2) * WALL_SKEW) + CLOCK_SHEAR;
}

/**
 * Hand angles in degrees clockwise from 12, from the local time of `now` (epoch ms). The minute
 * and hour hands move on whole minutes; the second angle is for syncing the CSS second hand.
 * A non-finite `now` reads as 12:00:00.
 */
export function clockHands(now: number): ClockAngles {
  const d = new Date(now);
  if (Number.isNaN(d.getTime())) return { hour: 0, minute: 0, second: 0 };
  const h = d.getHours() % 12;
  const m = d.getMinutes();
  return { hour: h * 30 + m * 0.5, minute: m * 6, second: d.getSeconds() * 6 };
}

/** The 2x2 blocks along a hand of `length` cells from the face centre, flat face cells. */
function hand(angle: number, length: number): ClockCell[] {
  const c = CLOCK_FACE / 2;
  const rad = (angle * Math.PI) / 180;
  const cells = new Map<string, ClockCell>();
  for (let t = 0; t <= length; t += 0.5) {
    const px = Math.round(c + Math.sin(rad) * t) - HAND_WIDTH / 2;
    const py = Math.round(c - Math.cos(rad) * t) - HAND_WIDTH / 2;
    for (let dx = 0; dx < HAND_WIDTH; dx++)
      for (let dy = 0; dy < HAND_WIDTH; dy++)
        cells.set(`${px + dx},${py + dy}`, { x: px + dx, y: py + dy });
  }
  return [...cells.values()];
}

/** Hour and minute hand cells (with the centre pivot) in the sheared clock grid. */
export function clockHandCells(now: number): ClockCell[] {
  const a = clockHands(now);
  const all = new Map<string, ClockCell>();
  for (const cell of [...hand(a.hour, HOUR_LENGTH), ...hand(a.minute, MINUTE_LENGTH)]) {
    const y = cell.y + clockShear(cell.x);
    all.set(`${cell.x},${y}`, { x: cell.x, y });
  }
  return [...all.values()];
}

// Windows. A window is drawn flat, WINDOW_COLS x WINDOW_FLAT_ROWS cells, then sheared onto its wall
// at the wall slope: a column pair rises (left wall) or drops (right wall) one row, like the door
// and the counter. Layers back to front: sky, clouds (move), skyline, weather (moves), then the
// blinds, mullion and frame. Frame cells are the shared legend (wood and deep wood; deep --metal only in the blinds); sky cells
// are the scene's legend (glass tokens). Nothing here is brighter than --plastic (palette.ts).

export const WINDOW_SCENE_IDS = ["dusk", "night", "rain", "snow", "overcast", "afternoon"] as const;
export type WindowSceneId = (typeof WINDOW_SCENE_IDS)[number];
export type GlassToken = keyof typeof GLASS;
type Wall = "left" | "right";

export type WindowScene = {
  id: WindowSceneId;
  /** Legend cells (a b d sky bands top to bottom, j skyline, n lit window, r cloud, t weather). */
  legend: Readonly<Record<string, GlassToken>>;
  /** The glass the floor patch takes its tint from: the horizon band. */
  light: GlassToken;
  /** How many skyline windows are lit. */
  lit: number;
  cloud: GlassToken | null;
  weather: "rain" | "snow" | null;
};

const band = (
  id: WindowSceneId,
  cloud: GlassToken | null,
  weather: WindowScene["weather"],
  lit: number,
): WindowScene => {
  const legend: Record<string, GlassToken> = {
    a: `--glass-${id}-1` as GlassToken,
    b: `--glass-${id}-2` as GlassToken,
    d: `--glass-${id}-3` as GlassToken,
    j: "--glass-skyline",
  };
  if (lit > 0) legend.n = "--glass-lit";
  if (cloud) legend.r = cloud;
  if (weather) legend.t = weather === "rain" ? "--glass-rain" : "--glass-snow";
  return { id, legend, light: legend.d, lit, cloud, weather };
};

export const WINDOW_SCENES: Record<WindowSceneId, WindowScene> = {
  dusk: band("dusk", "--glass-cloud-dusk", null, 4),
  night: band("night", null, null, 8),
  rain: band("rain", null, "rain", 3),
  snow: band("snow", null, "snow", 0),
  overcast: band("overcast", "--glass-cloud", null, 0),
  afternoon: band("afternoon", "--glass-cloud-warm", null, 0),
};

/** A scene by id; an unknown id (or none) is dusk. */
export function windowScene(id: string): WindowScene {
  return (WINDOW_SCENE_IDS as readonly string[]).includes(id)
    ? WINDOW_SCENES[id as WindowSceneId]
    : WINDOW_SCENES.dusk;
}

// Hours 21 to 5 are night, 17 to 20 dusk, and 6 to 16 draw a seeded weather: late-afternoon light,
// overcast or rain, plus snow in the winter months (November to March, from the date key).
const NIGHT_HOURS = new Set([21, 22, 23, 0, 1, 2, 3, 4, 5]);
const DUSK_HOURS = new Set([17, 18, 19, 20]);
const WEATHER = ["afternoon", "afternoon", "overcast", "overcast", "rain"] as const;
const WINTER_WEATHER = ["afternoon", "overcast", "overcast", "rain", "snow", "snow"] as const;

/**
 * The scene for a local date key ("YYYY-MM-DD") and hour 0 to 23. Pure and stable within a (date,
 * hour); the weather comes from a namespaced hash of both, so a reload shows the same scene and
 * another day another one. An hour that is not 0 to 23 reads as dusk.
 */
export function sceneFor(date: string, hour: number, salt = ""): WindowSceneId {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return "dusk";
  if (NIGHT_HOURS.has(hour)) return "night";
  if (DUSK_HOURS.has(hour)) return "dusk";
  const month = Number(date.slice(5, 7));
  const pool = month >= 11 || (month >= 1 && month <= 3) ? WINTER_WEATHER : WEATHER;
  return pool[
    hash(salt === "" ? `window:${date}:${hour}` : `window:${date}:${hour}:${salt}`) % pool.length
  ];
}

/** The local calendar date of `now` (epoch ms) as "YYYY-MM-DD"; "" for a non-finite `now`. */
export function localDateKey(now: number): string {
  const d = new Date(now);
  if (Number.isNaN(d.getTime())) return "";
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** The scene at `now`, from its local date and hour; an unusable `now` reads as dusk. */
export function sceneAt(now: number): WindowSceneId {
  const d = new Date(now);
  if (Number.isNaN(d.getTime())) return "dusk";
  return sceneFor(localDateKey(now), hourOverride ?? d.getHours(), seedOverride);
}

/** An hour from a `?hour=` value: a whole 0 to 23, else null (ignored). */
export function parseHourParam(text: string | null): number | null {
  if (text === null || !/^\d{1,2}$/.test(text)) return null;
  const n = Number(text);
  return n <= 23 ? n : null;
}

// Dev-only (main.tsx, import.meta.env.DEV only): ?scene=<id> pins every window to one scene,
// ?hour=<0-23> forces the hour the scene is picked for (not the clock), ?seed=<text> salts the
// weather's variant seed.
let sceneOverride: string | null = null;
let hourOverride: number | null = null;
let seedOverride = "";
export function setSceneOverride(id: string | null): void {
  sceneOverride = id;
}
export function setHourOverride(hour: number | null): void {
  hourOverride = hour;
}
export function setSeedOverride(text: string): void {
  seedOverride = text;
  decorDay = null;
}

/**
 * The bookshelf and picture color variant, 0 to 2, for a local date key. Pure; its own namespaced
 * hash, so it is not tied to the window's weather.
 */
export function decorVariantFor(date: string, salt = ""): number {
  return hash(`decor:${date}:${salt}`) % DECOR_VARIANTS;
}

/** A variant from a `?decor=` value: exactly 0, 1 or 2, else null (ignored). */
export function parseDecorParam(text: string | null): number | null {
  return text !== null && /^[0-2]$/.test(text) ? Number(text) : null;
}

// Dev-only (main.tsx): ?decor=<0-2> pins the decor variant; anything else is ignored.
let decorOverride: number | null = null;
export function setDecorOverride(n: number | null): void {
  decorOverride = n !== null && Number.isInteger(n) && n >= 0 && n < DECOR_VARIANTS ? n : null;
}

// The last local day the variant was computed for: [from, to) in epoch ms, so a render inside the
// same day is two comparisons, not a Date and a hash.
let decorDay: { from: number; to: number; variant: number } | null = null;

/** The decor variant at `now`: the dev override if valid, else the local date's (cached per local day). */
export function decorVariantAt(now: number): number {
  if (decorOverride !== null) return decorOverride;
  if (decorDay && now >= decorDay.from && now < decorDay.to) return decorDay.variant;
  const variant = decorVariantFor(localDateKey(now), seedOverride);
  const d = new Date(now);
  if (!Number.isNaN(d.getTime())) {
    decorDay = {
      from: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
      to: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(),
      variant,
    };
  }
  return variant;
}

/** The dev overrides in force, for the style sheet; empty when none is set. */
export function activeOverrides(): string[] {
  return [
    ...(sceneOverride !== null ? [`scene=${sceneOverride}`] : []),
    ...(hourOverride !== null ? [`hour=${hourOverride}`] : []),
    ...(decorOverride !== null ? [`decor=${decorOverride}`] : []),
    ...(seedOverride !== "" ? [`seed=${seedOverride}`] : []),
  ];
}

/** The scene id to draw at `now`: the dev override if one is set, else the hour's scene. */
export function activeSceneId(now: number): string {
  return sceneOverride ?? sceneAt(now);
}

/** Rows a flat column `x` rises (left wall) or drops (right wall) when sheared onto the wall. */
export function windowShear(wall: Wall, x: number): number {
  return wall === "right" ? Math.floor(x / 2) : WINDOW_COLS / 2 - 1 - Math.floor(x / 2);
}

// Flat-window geometry, in cells. Frame 2 thick, one mullion 2 thick, two panes of 12, glass rows
// 2 to 33, blind slats 2 tall with 2 between, the skyline in 2-wide units. Everything is
// pair-aligned in x so the shear keeps every line at least 2 cells wide.
const GLASS_TOP = 2;
const GLASS_BOTTOM = WINDOW_FLAT_ROWS - 3;
const PANES = [
  [2, 13],
  [16, 27],
] as const;
const BANDS = [
  ["a", GLASS_TOP, 13],
  ["b", 14, 23],
  ["d", 24, GLASS_BOTTOM],
] as const;
const SLATS = [2, 6, 10] as const;
// Skyline buildings: x, width, height in cells (flat, bottom on the last glass row).
const BUILDINGS = [
  [2, 4, 10],
  [6, 4, 16],
  [10, 6, 8],
  [16, 4, 12],
  [20, 4, 18],
  [24, 4, 10],
] as const;
// Lit 2x2 windows (x, top row), in the order they come on; on even rows like the rain.
const LIT = [
  [6, 22],
  [22, 20],
  [4, 28],
  [18, 28],
  [8, 28],
  [20, 26],
  [24, 30],
  [12, 30],
  [22, 30],
  [26, 26],
] as const;

type Cell = { x: number; y: number; c: string };
const rect = (cells: Cell[], c: string, x0: number, y0: number, x1: number, y1: number) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push({ x, y, c });
};

// Moving layers are drawn in the flat window's coordinates and sheared with the sky, so every step
// is a lattice move: tiles sit on even x and even y (the shear pairs columns, the slats, panes and
// glass edges sit on even rows), and a step is 2 cells down (rain, snow) or 2 cells across and 1 row
// along the wall slope (clouds). Then no clip leaves a 1-wide or 1-tall sliver at any step.

/** Clouds drift one tile, WINDOW_COLS cells, along the wall slope: 2 cells and 1 row a step. */
export const CLOUD_PERIOD = WINDOW_COLS;
export const RAIN_PERIOD = 12;
export const SNOW_PERIOD = 16;

const tile = (rows: number, cols: number, put: (set: (x: number, y: number) => void) => void) => {
  const g = Array.from({ length: rows }, () => Array<string>(cols).fill("."));
  put((x, y) => {
    g[y][x] = "r";
  });
  return g.map((r) => r.join(""));
};
const blocks = (
  set: (x: number, y: number) => void,
  x: number,
  y: number,
  w: number,
  h: number,
) => {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) set(x + dx, y + dy);
};
/** Two clouds in the flat window: stacked 2-row slabs, 6, 10 and 8 wide. */
export const CLOUD_TILE: Grid = tile(WINDOW_FLAT_ROWS, WINDOW_COLS, (set) => {
  for (const [x, y] of [
    [4, 14],
    [18, 24],
  ])
    for (const [dx, dy, w] of [
      [2, 0, 6],
      [0, 2, 10],
      [2, 4, 8],
    ])
      blocks(set, x + dx, y + dy, w, 2);
});
/** Rain streaks, 2 wide and 4 tall, repeated down the window every RAIN_PERIOD rows. */
export const RAIN_TILE: Grid = tile(RAIN_PERIOD, WINDOW_COLS, (set) => {
  for (const [x, y] of [
    [4, 0],
    [10, 6],
    [16, 2],
    [22, 8],
    [26, 4],
  ])
    blocks(set, x, y, 2, 4);
});
/** Snow flakes, 2x2, repeated down the window every SNOW_PERIOD rows. */
export const SNOW_TILE: Grid = tile(SNOW_PERIOD, WINDOW_COLS, (set) => {
  for (const [x, y] of [
    [4, 2],
    [10, 8],
    [16, 4],
    [22, 10],
    [26, 6],
    [6, 12],
    [24, 14],
  ])
    blocks(set, x, y, 2, 2);
});

/** Horizontal runs of same-char cells, one run per row stretch. */
function runsOf(cells: Cell[]): Run[] {
  const sorted = [...cells].sort((a, b) => a.y - b.y || a.x - b.x);
  const runs: Run[] = [];
  for (const { x, y, c } of sorted) {
    const last = runs[runs.length - 1];
    if (last && last.y === y && last.c === c && last.x + last.w === x) last.w++;
    else runs.push({ x, y, w: 1, c });
  }
  return runs;
}

const sheared = (cells: Cell[], wall: Wall): Cell[] =>
  cells.map((c) => ({ x: c.x, y: c.y + windowShear(wall, c.x), c: c.c }));

export type WindowArt = {
  cols: number;
  rows: number;
  /** The static art as a grid: sky, skyline, then blinds, mullion and frame. */
  grid: Grid;
  sky: Run[];
  skyline: Run[];
  over: Run[];
  /** The open panes: where clouds and weather show. */
  glass: Run[];
  /** One tile either side of the window, to drift by one period; empty without clouds. */
  cloud: Run[];
  /** Weather streaks, sheared like the sky, from one period above the window down; empty without weather. */
  weather: Run[];
};

const artCache = new Map<string, WindowArt>();

/** The pixel art of a window of `scene` on `wall`. Pure; cached per scene and wall. */
export function windowArt(scene: WindowScene, wall: Wall): WindowArt {
  const key = `${scene.id}:${wall}`;
  const hit = artCache.get(key);
  if (hit) return hit;

  const sky: Cell[] = [];
  const glass: Cell[] = [];
  for (const [x0, x1] of PANES) {
    for (const [c, y0, y1] of BANDS) rect(sky, c, x0, y0, x1, y1);
    rect(glass, "a", x0, GLASS_TOP, x1, GLASS_BOTTOM);
  }
  const skyline: Cell[] = [];
  for (const [x, w, h] of BUILDINGS)
    rect(skyline, "j", x, GLASS_BOTTOM + 1 - h, x + w - 1, GLASS_BOTTOM);
  for (const [x, y] of LIT.slice(0, scene.lit)) rect(skyline, "n", x, y, x + 1, y + 1);
  const over: Cell[] = [];
  for (const [x0, x1] of PANES) for (const y of SLATS) rect(over, "7", x0, y, x1, y + 1);
  rect(over, "w", 14, GLASS_TOP, 15, GLASS_BOTTOM);
  rect(over, ":", 0, 0, WINDOW_COLS - 1, 1);
  rect(over, ":", 0, 2, 1, WINDOW_FLAT_ROWS - 1);
  rect(over, "w", WINDOW_COLS - 2, 2, WINDOW_COLS - 1, WINDOW_FLAT_ROWS - 3);
  rect(over, "w", 2, WINDOW_FLAT_ROWS - 2, WINDOW_COLS - 1, WINDOW_FLAT_ROWS - 1);

  const canvas = Array.from({ length: WINDOW_ROWS }, () => Array<string>(WINDOW_COLS).fill("."));
  for (const layer of [sky, skyline, over])
    for (const { x, y, c } of sheared(layer, wall)) canvas[y][x] = c;

  const cloud: Cell[] = [];
  if (scene.cloud)
    for (const shift of [-CLOUD_PERIOD, 0])
      CLOUD_TILE.forEach((row, y) =>
        row.split("").forEach((ch, x) => {
          if (ch !== ".") cloud.push({ x: x + shift, y, c: "r" });
        }),
      );
  const weather: Cell[] = [];
  if (scene.weather) {
    const [period, source] =
      scene.weather === "rain" ? [RAIN_PERIOD, RAIN_TILE] : [SNOW_PERIOD, SNOW_TILE];
    for (let top = -period; top < WINDOW_FLAT_ROWS; top += period)
      source.forEach((row, y) =>
        row.split("").forEach((ch, x) => {
          if (ch !== ".") weather.push({ x, y: top + y, c: "t" });
        }),
      );
  }

  const art: WindowArt = {
    cols: WINDOW_COLS,
    rows: WINDOW_ROWS,
    grid: canvas.map((r) => r.join("")),
    sky: runsOf(sheared(sky, wall)),
    skyline: runsOf(sheared(skyline, wall)),
    over: runsOf(sheared(over, wall)),
    glass: runsOf(sheared(glass, wall)),
    cloud: runsOf(sheared(cloud, wall)),
    weather: runsOf(sheared(weather, wall)),
  };
  artCache.set(key, art);
  return art;
}
