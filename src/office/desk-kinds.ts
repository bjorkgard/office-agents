// Desk kinds: <DESK_KINDS/> two desks of one size and one monitor, told apart by their props.
// The rectangles are in cells inside the desk sprite; the paper (V2), the screen overlay (V3)
// and the device (V4) read them, so no prop pixel may land in screen, paperSlot or deviceSlot.
import type { Grid } from "./pixel";
import { DESK, DESK_DIM } from "./sprites";

export type Rect = { x: number; y: number; w: number; h: number };
type Stamp = { name: string; rect: Rect; rows: Grid };

export type DeskKind = {
  id: "tidy" | "cluttered";
  lit: Grid;
  dim: Grid;
  /** The monitor face's bounding box; the face itself is a parallelogram inside it. */
  screen: Rect;
  /** Bare desk top where a sheet of paper lies. */
  paperSlot: Rect;
  /** Bare desk top where a laptop or tablet could lie. */
  deviceSlot: Rect;
  /** Where each prop sits. */
  props: readonly { name: string; rect: Rect }[];
};

// Same cell on both kinds, so one rectangle serves them all. The slots are the largest bare
// top-surface rectangles the base art leaves (paper 6x7, device 12x5); paper and devices are
// drawn smaller and skewed to fit them.
const SCREEN: Rect = { x: 19, y: 9, w: 19, h: 20 };
const PAPER_SLOT: Rect = { x: 12, y: 24, w: 6, h: 7 };
const DEVICE_SLOT: Rect = { x: 45, y: 38, w: 12, h: 5 };

const stamp = (name: string, x: number, y: number, rows: Grid): Stamp => ({
  name,
  rect: { x, y, w: rows[0].length, h: rows.length },
  rows,
});

// Paints the props over a base desk; '.' in a stamp leaves the desk showing.
function paint(base: Grid, stamps: readonly Stamp[]): Grid {
  const out = base.map((row) => row.split(""));
  for (const { rect, rows } of stamps)
    rows.forEach((row, j) =>
      row.split("").forEach((c, i) => {
        if (c !== ".") out[rect.y + j][rect.x + i] = c;
      }),
    );
  return out.map((row) => row.join(""));
}

const LAMP = stamp("lamp", 5, 20, [
  "..==gg.",
  ".=gggg8",
  ".8888..",
  "...mm..",
  "...mm..",
  "...~m..",
  "...mm..",
  "..mmmm.",
  ".7mmmm7",
  "..7777.",
]);

const BOOKS = stamp("books", 36, 40, [
  "..%%eeee9",
  "..9999999",
  ".=gggggg8",
  ".88888888",
  "6mmmmmmm7",
  "666666666",
]);
const NOTE_A = stamp("sticky note", 46, 35, ["fff", "fff", "fff"]);
const NOTE_B = stamp("sticky note", 49, 35, ["lll", "lll", "lll"]);
const HEADPHONES_PROP = stamp("headphones", 32, 35, [
  ".=ggg=.",
  "=g888g=",
  "gg...gg",
  "88...88",
  "88...88",
]);

function kind(id: DeskKind["id"], stamps: readonly Stamp[]): DeskKind {
  return {
    id,
    lit: paint(DESK, stamps),
    dim: paint(DESK_DIM, stamps),
    screen: SCREEN,
    paperSlot: PAPER_SLOT,
    deviceSlot: DEVICE_SLOT,
    props: stamps.map(({ name, rect }) => ({ name, rect })),
  };
}

export const DESK_KINDS: readonly [DeskKind, DeskKind] = [
  kind("tidy", [LAMP]),
  kind("cluttered", [BOOKS, NOTE_A, NOTE_B, HEADPHONES_PROP]),
];

/** The kind at a desk index: alternates, never random, so a desk keeps its look. */
export const deskKindFor = (index: number): DeskKind => DESK_KINDS[index % DESK_KINDS.length];
