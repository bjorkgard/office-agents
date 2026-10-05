/**
 * Isometric projection and room layout. Pure: no DOM, no React.
 * Desks fill 4 per row (shared with the server's seat rule); a new row is added when the
 * last is full and grows toward the viewer. Room px are anchored to desk (0, 0), so adding a
 * row moves nothing in room px: the bounds grow (to the left and down) and the fit (scale
 * plus offsets) is what changes. The room scales to fit down to a 50% floor,
 * then scrolls vertically (D22). Below 800x500 the layout stays at the minimum size and
 * reports `needsWider`.
 */
import { DESKS_PER_ROW } from "../../shared/tuning";

/**
 * Screen size of one grid step's diamond, in unscaled px. Neighbouring desk sprites sit one
 * half step apart (TILE_W / 2 across, TILE_H / 2 down), so TILE_W / 2 must exceed the desk
 * footprint width and TILE_H the footprint height; room.test.ts checks they do not overlap.
 */
export const TILE_W = 296;
export const TILE_H = 160;

export const MIN_WIDTH = 800;
export const MIN_HEIGHT = 500;
export const MIN_SCALE = 0.5;
/** Smallest hit-area edge and center spacing, in screen px. */
export const HIT_MIN = 24;

/** Attention-ring stroke width in scene px, so it draws 2 screen px at `scale`. */
export function ringStroke(scale: number): number {
  // A JS value, not an inherited CSS var: --scale restyled ~41k elements per fit change.
  return 2 / (Number.isNaN(scale) ? MIN_SCALE : Math.max(MIN_SCALE, scale));
}

// Slack around the room shell, unscaled.
const PAD_TOP = 16;
const PAD_SIDE = 16;
const PAD_BOTTOM = 16;

/**
 * How far the floor edge sits from the outermost desk centers, in grid steps, per edge.
 * The back edges carry the walls, so the back-right one also leaves the aisle in front of
 * the coffee station.
 */
export const FLOOR_MARGIN = { backLeft: 0.9, backRight: 1.2, frontRight: 0.8, frontLeft: 0.8 };
/** Wall height above the floor edge, unscaled px; the door is 120 tall. */
export const WALL_HEIGHT = 156;

/**
 * Room px of desk (0, 0): where a one-row room puts it, so one-row coordinates are what they
 * always were. Fixed from here on, so extra rows extend the room left and down instead.
 */
const ANCHOR = (() => {
  const c = floorCorners(1);
  return { x: PAD_SIDE - c.left.x, y: PAD_TOP - (c.top.y - WALL_HEIGHT) };
})();

export const BUBBLE_STEP = 8;
export const BUBBLE_MAX_SHIFTS = 2;

export type Viewport = { width: number; height: number };
export type FloorCorners = { top: Pt; right: Pt; bottom: Pt; left: Pt };
type Pt = { x: number; y: number };
export type DeskPosition = { col: number; row: number; x: number; y: number; depth: number };
/** Room px extents of the floor and walls; they only ever grow when a row is added. */
export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
/** Room px to screen px: screen = room * scale + (x, y), in the scene box. */
export type Fit = { scale: number; x: number; y: number };
export type OfficeLayout = {
  rows: number;
  desks: DeskPosition[];
  /** Where grid cell (0, 0)'s desk center lands in room px: fixed, whatever the rows. */
  origin: { x: number; y: number };
  bounds: Bounds;
  fit: Fit;
  /** Layer and shell box at room (0, 0): ends where the padded bounds end, so none of it overhangs. */
  box: { width: number; height: number };
  /** Padded size of the bounds, unscaled. */
  width: number;
  height: number;
  scale: number;
  /** Room height on screen at `scale`; the scroll region's content height. */
  scrollHeight: number;
  scrolls: boolean;
  needsWider: boolean;
};

/** Grid (x = column, y = row) to screen; depth is x+y (larger draws in front). */
export function project(x: number, y: number): { x: number; y: number; depth: number } {
  return { x: ((x - y) * TILE_W) / 2, y: ((x + y) * TILE_H) / 2, depth: x + y };
}

/** Floor diamond corners in room px relative to desk (0, 0)'s center. */
export function floorCorners(rows: number): FloorCorners {
  const m = FLOOR_MARGIN;
  const last = DESKS_PER_ROW - 1 + m.frontRight;
  const front = rows - 1 + m.frontLeft;
  const at = (x: number, y: number) => {
    const p = project(x, y);
    return { x: p.x, y: p.y };
  };
  return {
    top: at(-m.backLeft, -m.backRight),
    right: at(last, -m.backRight),
    bottom: at(last, front),
    left: at(-m.backLeft, front),
  };
}

export function deskCell(index: number): { col: number; row: number } {
  return { col: index % DESKS_PER_ROW, row: Math.floor(index / DESKS_PER_ROW) };
}

/**
 * Lays out the rows `deskCount` (highest seated desk index + 1) needs, in a viewport: rows *
 * DESKS_PER_ROW desks, at least one row.
 */
export function layoutOffice(deskCount: number, viewport: Viewport): OfficeLayout {
  const count = Math.max(0, Math.floor(deskCount));
  const rows = Math.max(1, Math.ceil(count / DESKS_PER_ROW));
  const needsWider = viewport.width < MIN_WIDTH || viewport.height < MIN_HEIGHT;
  const vw = Math.max(viewport.width, MIN_WIDTH);
  const vh = Math.max(viewport.height, MIN_HEIGHT);

  // Bounds come from the floor and walls of the full rows; desks sit at fixed room px.
  const origin = ANCHOR;
  const c = floorCorners(rows);
  const bounds: Bounds = {
    minX: c.left.x + origin.x,
    maxX: c.right.x + origin.x,
    minY: c.top.y - WALL_HEIGHT + origin.y,
    maxY: c.bottom.y + origin.y,
  };
  const width = bounds.maxX - bounds.minX + PAD_SIDE * 2;
  const height = bounds.maxY - bounds.minY + PAD_TOP + PAD_BOTTOM;

  // Every row draws all its desks; the unseated ones are empty (and free work desks).
  const desks = Array.from({ length: rows * DESKS_PER_ROW }, (_, i): DeskPosition => {
    const { col, row } = deskCell(i);
    const p = project(col, row);
    return { col, row, x: p.x + origin.x, y: p.y + origin.y, depth: p.depth };
  });

  const scale = Math.max(MIN_SCALE, Math.min(1, vw / width, vh / height));
  const scrollHeight = height * scale;
  return {
    rows,
    desks,
    origin,
    bounds,
    fit: fitFor(bounds, scale, viewport),
    box: { width: bounds.maxX + PAD_SIDE, height: bounds.maxY + PAD_BOTTOM },
    width,
    height,
    scale,
    scrollHeight,
    scrolls: scrollHeight > vh,
    needsWider,
  };
}

/**
 * The fit that puts the padded bounds on screen: the room's left edge (plus its slack) at the
 * centering margin, its top (plus slack) at the top of the scene box. Same spot the room had
 * when its origin followed its size, so screen = room * scale + offset.
 */
export function fitFor(bounds: Bounds, scale: number, viewport: Viewport): Fit {
  const width = bounds.maxX - bounds.minX + PAD_SIDE * 2;
  const margin = Math.max(0, (viewport.width - width * scale) / 2);
  return {
    scale,
    x: margin + (PAD_SIDE - bounds.minX) * scale,
    y: (PAD_TOP - bounds.minY) * scale,
  };
}

export type BubbleBox = {
  id: string;
  /** Top-left, unscaled overlay px. */
  x: number;
  y: number;
  width: number;
  height: number;
  waitingMs: number;
};
/** Something a bubble must not cover: another agent's tag or head, in the same px as the boxes. */
export type BubbleObstacle = { owner: string; x: number; y: number; width: number; height: number };
export type PlacedBubble = { id: string; x: number; y: number; shift: number; hidden: boolean };

const overlaps = (a: Omit<BubbleBox, "id" | "waitingMs">, b: Omit<BubbleBox, "id" | "waitingMs">) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Overlapping bubbles: the longer-waiting one stays on top and in place; each other one
 * shifts up in 8px steps until it overlaps no visible bubble, at most 2 shifts, then hides
 * behind its chip. Every bubble but the longest-waiting one also never covers an obstacle owned
 * by another agent: it takes the same shifts, then hides. The longest-waiting bubble overall
 * ignores obstacles, so the one who has waited most is always shown. Output keeps input order.
 */
export function placeBubbles(
  bubbles: BubbleBox[],
  obstacles: BubbleObstacle[] = [],
): PlacedBubble[] {
  const ranked = bubbles
    .map((b, i) => ({ b, i }))
    .sort((p, q) => q.b.waitingMs - p.b.waitingMs || p.i - q.i);
  const shown: BubbleBox[] = [];
  const placed = new Map<string, PlacedBubble>();
  for (const [rank, { b }] of ranked.entries()) {
    let shift = 0;
    let at = b;
    while (shift <= BUBBLE_MAX_SHIFTS) {
      at = { ...b, y: b.y - shift * BUBBLE_STEP };
      if (
        !shown.some((o) => overlaps(at, o)) &&
        (rank === 0 || !obstacles.some((o) => o.owner !== b.id && overlaps(at, o)))
      )
        break;
      shift++;
    }
    if (shift > BUBBLE_MAX_SHIFTS) {
      placed.set(b.id, { id: b.id, x: b.x, y: b.y, shift: 0, hidden: true });
      continue;
    }
    shown.push(at);
    placed.set(b.id, { id: b.id, x: at.x, y: at.y, shift, hidden: false });
  }
  return bubbles.map((b) => placed.get(b.id)!);
}
