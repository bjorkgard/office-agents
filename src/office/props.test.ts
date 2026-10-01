import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { appearanceFor } from "./appearance";
import appearanceSource from "./appearance.ts?raw";
import { PixelDesk, PixelProp } from "./CharacterRig";
import { ART } from "./palette";
import { CELL, CELLS } from "./pixel";
import { PROPS, type PropName } from "./props";
import props from "./props.ts?raw";
import { DESK, DESK_DIM, HAIRSTYLES } from "./sprites";

const known = new Set([".", ...Object.keys(CELLS)]);
const names = Object.keys(PROPS) as PropName[];

describe("prop sprites", () => {
  it("has the door, coffee station, two plants and the paper", () => {
    expect(names.sort()).toEqual(
      [
        "COFFEE_MACHINE",
        "COFFEE_STATION",
        "COUNTER",
        "DOOR",
        "PAPER",
        "PLANT_BUSH",
        "PLANT_TALL",
      ].sort(),
    );
  });

  for (const name of names) {
    it(`${name} has uniform rows of known cells`, () => {
      const grid = PROPS[name];
      expect(grid.length, name).toBeGreaterThan(0);
      for (const row of grid) expect(row, name).toHaveLength(grid[0].length);
      for (const row of grid)
        for (const c of row) expect(known.has(c), `${name} cell '${c}'`).toBe(true);
      expect(grid.join("").replaceAll(".", "").length, name).toBeGreaterThan(0);
    });
  }

  it("draws each prop from its material tokens", () => {
    const has = (name: PropName, re: RegExp) => expect(PROPS[name].join(""), name).toMatch(re);
    has("DOOR", /w/);
    has("DOOR", /[m~7]/);
    has("COUNTER", /[wg]/);
    has("COFFEE_MACHINE", /[m~7]/);
    has("COFFEE_STATION", /[m~7]/);
    has("PLANT_TALL", /e/);
    has("PLANT_BUSH", /e/);
    has("PLANT_TALL", /g/);
    has("PLANT_BUSH", /g/);
    has("PAPER", /f/);
    expect(PROPS.PLANT_TALL.join("")).not.toBe(PROPS.PLANT_BUSH.join(""));
  });

  it("has no hex literals in the prop source", () => {
    expect(props).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("has a dim desk the same size as the lit desk, without screen cells", () => {
    expect(DESK_DIM).toHaveLength(DESK.length);
    for (const row of DESK_DIM) expect(row).toHaveLength(DESK[0].length);
    for (const row of DESK_DIM) for (const c of row) expect(known.has(c), `'${c}'`).toBe(true);
    expect(DESK.join("")).toMatch(/[c!C]/);
    expect(DESK_DIM.join("")).not.toMatch(/[c!C]/);
  });
});

describe("PixelProp", () => {
  for (const name of names) {
    it(`renders ${name} at 2 px per cell from palette variables`, () => {
      const html = renderToStaticMarkup(createElement(PixelProp, { name }));
      const grid = PROPS[name];
      expect(html).toMatch(new RegExp(`^<svg[^>]*data-prop="${name}"`));
      expect(html).toContain(`width="${grid[0].length * CELL}"`);
      expect(html).toContain(`height="${grid.length * CELL}"`);
      expect(html).toContain('shape-rendering="crispEdges"');
      expect(html).toMatch(/fill="var\(--/);
      expect(html).not.toMatch(/fill="#/);
    });
  }

  it("dims the desk monitor when not lit", () => {
    const lit = renderToStaticMarkup(createElement(PixelDesk));
    const dim = renderToStaticMarkup(createElement(PixelDesk, { lit: false }));
    expect(lit).toContain("var(--screen)");
    expect(dim).not.toContain("var(--screen)");
  });
});

describe("appearanceFor", () => {
  const seeds = Array.from({ length: 200 }, (_, i) => `session-${i}`);

  it("gives the same look for the same seed", () => {
    for (const seed of ["", "a", "7f3c-session", ...seeds.slice(0, 20)]) {
      expect(appearanceFor(seed), seed).toEqual(appearanceFor(seed));
    }
  });

  it("returns valid hairstyle indexes and palette tokens", () => {
    for (const seed of seeds) {
      const look = appearanceFor(seed);
      expect(Number.isInteger(look.hairStyle), seed).toBe(true);
      expect(look.hairStyle).toBeGreaterThanOrEqual(0);
      expect(look.hairStyle).toBeLessThan(HAIRSTYLES.length);
      expect(look.hair, seed).toMatch(/^--hair-[1-4]$/);
      expect(look.skin, seed).toMatch(/^--skin-[1-3]$/);
      expect(look.hair in ART, seed).toBe(true);
      expect(look.skin in ART, seed).toBe(true);
    }
  });

  it("spreads 200 seeds across every style, hair color and skin tone", () => {
    const looks = seeds.map(appearanceFor);
    expect(new Set(looks.map((l) => l.hairStyle)).size).toBe(HAIRSTYLES.length);
    expect(new Set(looks.map((l) => l.hair)).size).toBe(4);
    expect(new Set(looks.map((l) => l.skin)).size).toBe(3);
    // No value takes more than half of the seeds.
    for (const key of ["hairStyle", "hair", "skin"] as const) {
      const counts = new Map<unknown, number>();
      for (const l of looks) counts.set(l[key], (counts.get(l[key]) ?? 0) + 1);
      expect(Math.max(...counts.values()), key).toBeLessThan(100);
    }
  });

  it("is pure: no Math.random", () => {
    const random = vi.spyOn(Math, "random");
    appearanceFor("x");
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
    expect(appearanceSource).not.toMatch(/Math\.random/);
  });
});
