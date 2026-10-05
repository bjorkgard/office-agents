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

// Vitest blanks css imports (even ?raw) and the app tsconfig has no node types, so read the file
// through the runtime's own fs.
// @ts-expect-error node:fs has no types in the app project
const { readFileSync } = (await import("node:fs")) as {
  readFileSync: (url: URL, enc: string) => string;
};
const sceneCss = readFileSync(new URL("./scene.css", import.meta.url), "utf8");
const indexCss = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const known = new Set([".", ...Object.keys(CELLS)]);
const names = Object.keys(PROPS) as PropName[];

describe("prop sprites", () => {
  it("has the door, coffee station, dispenser, two plants, the paper, a clock, steam and a gurgle, two devices and the left-wall bookshelf and pictures", () => {
    expect(names.sort()).toEqual(
      [
        "BOOKSHELF",
        "CLOCK",
        "COFFEE_MACHINE",
        "COFFEE_STATION",
        "COUNTER",
        "DISPENSER",
        "DOOR",
        "GURGLE",
        "LAPTOP_DARK",
        "LAPTOP_HALF",
        "LAPTOP_LIT",
        "PAPER",
        "PAPER_DESK",
        "PICTURE_A",
        "PICTURE_B",
        "PLANT_BUSH",
        "PLANT_TALL",
        "STEAM",
        "TABLET_DARK",
        "TABLET_HALF",
        "TABLET_LIT",
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

  it("draws the clock face and the steam wisp in the light plastic and outline tokens", () => {
    expect(PROPS.CLOCK.join("")).toMatch(/[l]/);
    expect(PROPS.STEAM.join("")).toMatch(/=/);
    expect(PROPS.CLOCK).toHaveLength(18);
    for (const row of PROPS.CLOCK) expect(row).toHaveLength(12);
    expect(PROPS.STEAM).toHaveLength(10);
    for (const row of PROPS.STEAM) expect(row).toHaveLength(8);
  });

  it("draws the water dispenser from plastic, metal and screen tokens, 16 cells wide", () => {
    const grid = PROPS.DISPENSER;
    expect(grid.join("")).toMatch(/g/);
    expect(grid.join("")).toMatch(/[m~]/);
    expect(grid.join("")).toMatch(/c/);
    expect(grid[0]).toHaveLength(16);
    expect(grid).toHaveLength(36);
    expect(PROPS.GURGLE).toHaveLength(4);
    for (const row of PROPS.GURGLE) expect(row).toHaveLength(4);
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

describe("ambient loops", () => {
  const reduced = sceneCss.slice(sceneCss.indexOf("@media (prefers-reduced-motion: reduce)"));

  it("defines steam, sway, tick and gurgle loops outside the reduced-motion block", () => {
    const base = sceneCss.slice(0, sceneCss.indexOf("@media (prefers-reduced-motion: reduce)"));
    for (const cls of [".steam", ".sway", ".clock-hand", ".gurgle"])
      expect(base, cls).toMatch(new RegExp(`\\${cls}\\s*\\{[^}]*animation:`));
  });

  it("turns every ambient loop off under prefers-reduced-motion", () => {
    for (const cls of [".steam", ".sway", ".clock-hand", ".gurgle"])
      expect(reduced, cls).toMatch(new RegExp(`\\${cls}\\s*\\{[^}]*animation:\\s*none`));
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

describe("walking stride css", () => {
  it("alternates the two walking frames with a steps(1) animation", () => {
    for (const part of ["walk-a", "walk-b"]) {
      expect(sceneCss).toMatch(
        new RegExp(
          `\\.rig \\[data-part="${part}"\\] \\{[^}]*animation: step-[ab][^;}]*steps\\(1\\)`,
        ),
      );
    }
    expect(sceneCss).toMatch(/@keyframes step-a/);
    expect(sceneCss).toMatch(/@keyframes step-b/);
  });
});

describe("chip pulse css", () => {
  it("has no colored glow, and a static outline under reduced motion", () => {
    expect(indexCss).not.toMatch(/drop-shadow/);
    expect(indexCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.hit\[data-pulse\] \{[^}]*animation: none;[^}]*outline: 2px solid var\(--accent\);[^}]*outline-offset: 2px/,
    );
  });
});

describe("chip-click pulse", () => {
  it("targets the hit button (a real box), not the boxless agent wrapper", () => {
    expect(indexCss).toMatch(/\.hit\[data-pulse\]\s*\{[^}]*animation:/);
    expect(indexCss).not.toMatch(/\[data-agent\]\[data-pulse\]/);
    expect(indexCss).toMatch(/\.hit\[data-pulse\]\s*\{[^}]*outline:\s*2px solid var\(--accent\)/);
  });
});
