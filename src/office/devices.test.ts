import { describe, expect, it } from "vite-plus/test";
import { hash } from "./appearance";
import { DESK_KINDS, type Rect } from "./desk-kinds";
import { DEVICES, deviceFor, deviceProp, deviceRect, type Device } from "./devices";
import { PROPS } from "./props";
import { DESK, DESK_DIM } from "./sprites";

// Top surface of the base desk, by the same independent rule as desk-kinds.test.ts.
const isTop = (x: number, y: number) => DESK[y][x] === "w" && y <= 40 + (61 - x) * 0.45;
const LOOKS = ["lit", "half", "dark"] as const;
const keys = Array.from({ length: 200 }, (_, i) => `session-${i}:agent-${i}`);
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const mask = (device: Device) =>
  new Set(
    PROPS[deviceProp(device, "lit")].flatMap((row, y) =>
      row.split("").flatMap((c, x) => (c === "." ? [] : [`${x},${y}`])),
    ),
  );

// Cells that are one tall in their column, unless a real stair-step end: the same colour continues
// one row down within 2 columns to the right, or one row up within 2 to the left (slope runs
// down-right), AND the row run the cell belongs to is 2 or more cells thick somewhere (so a
// one-row line on the slope, one tall in every column, is caught).
const thinCells = (grid: readonly string[]) => {
  const bad: string[] = [];
  const at = (x: number, y: number) => grid[y]?.[x];
  const tall = (x: number, y: number) => at(x, y - 1) === at(x, y) || at(x, y + 1) === at(x, y);
  const thickRun = (x: number, y: number) => {
    const c = at(x, y);
    let a = x;
    while (at(a - 1, y) === c) a--;
    let b = x;
    while (at(b + 1, y) === c) b++;
    for (let i = a; i <= b; i++) if (tall(i, y)) return true;
    return false;
  };
  for (let y = 0; y < grid.length; y++)
    for (let x = 0; x < grid[y].length; x++) {
      const c = grid[y][x];
      if (c === "." || tall(x, y)) continue;
      const step =
        at(x + 1, y + 1) === c ||
        at(x + 2, y + 1) === c ||
        at(x - 1, y - 1) === c ||
        at(x - 2, y - 1) === c;
      if (!step || !thickRun(x, y)) bad.push(`${x},${y}`);
    }
  return bad;
};

describe("deviceFor", () => {
  it("is deterministic, and both devices occur over 200 keys", () => {
    for (const k of keys) expect(deviceFor(k)).toBe(deviceFor(k));
    const seen = new Set(keys.map(deviceFor));
    expect([...seen].sort()).toEqual(["laptop", "tablet"]);
  });

  it("splits 200 keys sanely", () => {
    const laptops = keys.filter((k) => deviceFor(k) === "laptop").length;
    expect(laptops).toBeGreaterThan(60);
    expect(laptops).toBeLessThan(140);
  });

  it("is namespaced: not the bare appearance hash of the key", () => {
    const bare = (k: string): Device => (hash(k) % 2 === 0 ? "laptop" : "tablet");
    const same = keys.filter((k) => deviceFor(k) === bare(k)).length;
    expect(same).toBeGreaterThan(0);
    expect(same).toBeLessThan(keys.length);
    for (const k of keys.slice(0, 20))
      expect(deviceFor(k)).toBe(hash(`device:${k}`) % 2 === 0 ? "laptop" : "tablet");
  });
});

describe("device art", () => {
  it("has lit, half and dark grids for both devices, named as props", () => {
    for (const d of DEVICES)
      for (const l of LOOKS) {
        const grid = PROPS[deviceProp(d, l)];
        expect(grid.length).toBeGreaterThan(0);
        for (const row of grid) expect(row).toHaveLength(grid[0].length);
      }
  });

  it("keeps the three variants on one silhouette", () => {
    for (const d of DEVICES) {
      const m = (l: (typeof LOOKS)[number]) =>
        PROPS[deviceProp(d, l)].map((r) => r.replace(/[^.]/g, "#")).join("|");
      expect(m("half")).toBe(m("lit"));
      expect(m("dark")).toBe(m("lit"));
    }
  });

  it("differs between the variants only on the screen cells", () => {
    for (const d of DEVICES) {
      const lit = PROPS[deviceProp(d, "lit")];
      const half = PROPS[deviceProp(d, "half")];
      const dark = PROPS[deviceProp(d, "dark")];
      // The screen cells are where lit and dark differ; every other cell is one colour in all three.
      const screen = new Set<string>();
      lit.forEach((row, y) =>
        row.split("").forEach((c, x) => {
          if (c !== dark[y][x]) screen.add(`${x},${y}`);
        }),
      );
      expect(screen.size, d).toBeGreaterThan(0);
      lit.forEach((row, y) =>
        row.split("").forEach((c, x) => {
          if (screen.has(`${x},${y}`)) return;
          expect(half[y][x], `${d} half ${x},${y}`).toBe(c);
          expect(dark[y][x], `${d} dark ${x},${y}`).toBe(c);
        }),
      );
      expect(half.join(""), d).not.toBe(lit.join(""));
      expect(half.join(""), d).not.toBe(dark.join(""));
    }
  });

  it("lies inside deviceSlot, on top-surface cells, in both desk kinds and light states", () => {
    for (const k of DESK_KINDS)
      for (const d of DEVICES) {
        const r = deviceRect(k, d);
        expect(r.x).toBeGreaterThanOrEqual(k.deviceSlot.x);
        expect(r.y).toBeGreaterThanOrEqual(k.deviceSlot.y);
        expect(r.x + r.w).toBeLessThanOrEqual(k.deviceSlot.x + k.deviceSlot.w);
        expect(r.y + r.h).toBeLessThanOrEqual(k.deviceSlot.y + k.deviceSlot.h);
        for (const l of LOOKS)
          PROPS[deviceProp(d, l)].forEach((row, j) =>
            row.split("").forEach((c, i) => {
              if (c === ".") return;
              const [x, y] = [r.x + i, r.y + j];
              expect(isTop(x, y), `${k.id} ${d} ${l} ${x},${y}`).toBe(true);
              expect(k.lit[y][x]).toBe(DESK[y][x]);
              expect(k.dim[y][x]).toBe(DESK_DIM[y][x]);
            }),
          );
      }
  });

  it("keeps clear of the paper slot and the monitor face", () => {
    for (const k of DESK_KINDS)
      for (const d of DEVICES) {
        expect(overlap(deviceRect(k, d), k.paperSlot)).toBe(false);
        expect(overlap(deviceRect(k, d), k.screen)).toBe(false);
      }
  });

  it("draws every line at least 2 cells across", () => {
    for (const d of DEVICES)
      for (const l of LOOKS) {
        const grid = PROPS[deviceProp(d, l)];
        for (const row of grid)
          for (const run of row.split(".").filter(Boolean))
            expect(run.length, `${d} ${l} ${row}`).toBeGreaterThanOrEqual(2);
      }
  });

  it("draws every line at least 2 cells thick down a column, bar the slope's stair-step ends", () => {
    for (const d of DEVICES)
      for (const l of LOOKS) expect(thinCells(PROPS[deviceProp(d, l)]), `${d} ${l}`).toEqual([]);
  });

  it("catches thin vertical lines, and lets real stair-step ends through", () => {
    const laptop = ["SSSSSS......", "..SSSSSS....", "....SSSSSS..", "..mmmmmmmm..", "....mmmmmmmm"];
    expect(thinCells(laptop)).toEqual([]);
    expect(thinCells(["SSSS....", "..SSSS..", "....SSSS"])).toEqual([]);
    expect(thinCells(["SSSS"]).length).toBeGreaterThan(0);
    // A one-row line down the slope is one tall in every column: caught, though each cell steps.
    expect(thinCells(["SS....", "..SS..", "....SS"]).length).toBeGreaterThan(0);
    expect(thinCells(["SSSS....", "........", "....SSSS"]).length).toBeGreaterThan(0);
    const kk = [...laptop];
    kk[4] = "..kk" + kk[4].slice(4);
    expect(thinCells(kk).length).toBeGreaterThan(0);
    expect(thinCells(["SSSSSS......", "..SSSSSS....", "....SSSSSS.."]).length).toEqual(0);
    expect(
      thinCells(["SSSSSS......", "............", "..mmmmmmmm..", "....mmmmmmmm"]).length,
    ).toBeGreaterThan(0);
    expect(
      thinCells(["SSSSSS......", "..SSSSSS....", "....SSSSSS..", "..mmmmmmmm.."]).length,
    ).toBeGreaterThan(0);
  });

  it("tells the laptop from the tablet by silhouette", () => {
    const [a, b] = [mask("laptop"), mask("tablet")];
    const w = (m: Set<string>) => Math.max(...[...m].map((s) => Number(s.split(",")[0]))) + 1;
    const h = (m: Set<string>) => Math.max(...[...m].map((s) => Number(s.split(",")[1]))) + 1;
    const differing =
      [...a].filter((c) => !b.has(c)).length + [...b].filter((c) => !a.has(c)).length;
    expect(differing).toBeGreaterThanOrEqual(12);
    expect([w(a), h(a)]).not.toEqual([w(b), h(b)]);
    expect(Math.abs(w(a) - w(b)) + Math.abs(h(a) - h(b))).toBeGreaterThanOrEqual(2);
  });
});
