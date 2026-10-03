import { describe, expect, it } from "vite-plus/test";
import { DESK_KINDS, deskKindFor, type Rect } from "./desk-kinds";
import { parseGrid } from "./pixel";
import { DESK, DESK_DIM } from "./sprites";

// Top surface of the base desk, by rule: plain top wood 'w' above the front-right edge, a line
// from the right corner (61,40) down-left; below it 'w' is a highlight on the right face.
// Bevel ':', the left face ('6' '8' 'x'), the right face and every prop char are not top.
const isTop = (x: number, y: number) => DESK[y][x] === "w" && y <= 40 + (61 - x) * 0.45;
const cellsOf = (r: Rect) => {
  const out: [number, number][] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push([x, y]);
  return out;
};
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inRect = (r: Rect, x: number, y: number) =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

describe("desk kinds", () => {
  it("assigns a kind by index, stably, and both kinds occur", () => {
    for (let i = 0; i < 12; i++) expect(deskKindFor(i)).toBe(deskKindFor(i));
    const seen = new Set(Array.from({ length: 12 }, (_, i) => deskKindFor(i).id));
    expect(seen.size).toBe(DESK_KINDS.length);
    expect(DESK_KINDS).toHaveLength(2);
  });

  it("draws every kind and light state at the desk's size", () => {
    for (const k of DESK_KINDS)
      for (const grid of [k.lit, k.dim]) {
        expect(grid).toHaveLength(DESK.length);
        for (const row of grid) expect(row).toHaveLength(DESK[0].length);
      }
  });

  it("draws only known cells", () => {
    for (const k of DESK_KINDS)
      for (const grid of [k.lit, k.dim]) expect(() => parseGrid(grid)).not.toThrow();
  });

  it("differs between lit and dim only on the monitor face, never the bezel", () => {
    for (const k of DESK_KINDS) {
      let x0 = Infinity,
        y0 = Infinity,
        x1 = -1,
        y1 = -1;
      k.lit.forEach((row, y) =>
        row.split("").forEach((c, x) => {
          if (c === k.dim[y][x]) return;
          expect(inRect(k.screen, x, y), `${k.id} ${x},${y}`).toBe(true);
          [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
        }),
      );
      expect(k.screen).toEqual({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
      for (const [x, y] of cellsOf({ x: 18, y: 7, w: 23, h: 22 }))
        if (!inRect(k.screen, x, y) && "8x".includes(DESK[y][x]))
          expect(k.lit[y][x], `bezel ${k.id} ${x},${y}`).toBe(k.dim[y][x]);
    }
  });

  it("keeps screen, paper and device slots inside the desk and apart", () => {
    for (const k of DESK_KINDS) {
      const slots = [k.screen, k.paperSlot, k.deviceSlot];
      for (const r of slots) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(DESK[0].length);
        expect(r.y + r.h).toBeLessThanOrEqual(DESK.length);
      }
      expect(overlap(k.screen, k.paperSlot)).toBe(false);
      expect(overlap(k.screen, k.deviceSlot)).toBe(false);
      expect(overlap(k.paperSlot, k.deviceSlot)).toBe(false);
    }
  });

  it("sizes the slots for a small paper and a device", () => {
    for (const k of DESK_KINDS) {
      expect(k.paperSlot.w).toBeGreaterThanOrEqual(5);
      expect(k.paperSlot.h).toBeGreaterThanOrEqual(7);
      expect(k.deviceSlot.w).toBeGreaterThanOrEqual(8);
      expect(k.deviceSlot.h).toBeGreaterThanOrEqual(5);
    }
  });

  it("keeps the headphone band at least 2 cells thick", () => {
    const hp = DESK_KINDS[1].props.find((p) => p.name === "headphones")!;
    const rows = DESK_KINDS[1].lit.slice(hp.rect.y, hp.rect.y + hp.rect.h);
    for (const col of [2, 3, 4]) {
      const filled = rows.filter(
        (r, j) => r[hp.rect.x + col] !== DESK[hp.rect.y + j][hp.rect.x + col],
      );
      expect(filled.length, `col ${col}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps both slots on top-surface cells only, untouched by any prop", () => {
    for (const k of DESK_KINDS)
      for (const r of [k.paperSlot, k.deviceSlot])
        for (const [x, y] of cellsOf(r)) {
          expect(isTop(x, y), `${k.id} ${x},${y} is not top surface`).toBe(true);
          expect(k.lit[y][x], `${k.id} ${x},${y} lit`).toBe(DESK[y][x]);
          expect(k.dim[y][x], `${k.id} ${x},${y} dim`).toBe(DESK_DIM[y][x]);
        }
  });

  it("puts every prop outside the slots and the screen, and the kinds apart", () => {
    const [a, b] = DESK_KINDS;
    const differing: [number, number][] = [];
    a.lit.forEach((row, y) =>
      row.split("").forEach((c, x) => {
        if (c !== b.lit[y][x]) differing.push([x, y]);
      }),
    );
    expect(differing.length).toBeGreaterThan(0);
    for (const k of DESK_KINDS) {
      expect(k.props.length).toBeGreaterThan(0);
      for (const p of k.props)
        for (const r of [k.screen, k.paperSlot, k.deviceSlot])
          expect(overlap(p.rect, r), `${k.id} ${p.name}`).toBe(false);
    }
    for (const [x, y] of differing)
      for (const r of [a.screen, a.paperSlot, a.deviceSlot])
        expect(inRect(r, x, y), `${x},${y}`).toBe(false);
  });
});
