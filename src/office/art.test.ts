import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import design from "../../DESIGN.md?raw";
import { cells, hexes, sectionRows, tokenRows } from "../design-md";
import appearanceSrc from "./appearance.ts?raw";
import { appearanceFor, HAIR, SKIN } from "./appearance";
import ArtSheet from "./ArtSheet";
import artSheetSrc from "./ArtSheet.tsx?raw";
import { DESK_KINDS } from "./desk-kinds";
import { CharacterRig, DeskDefs, PixelDesk, PixelProp, SharedDesk } from "./CharacterRig";
import rigSrc from "./CharacterRig.tsx?raw";
import mainSrc from "../main.tsx?raw";
import {
  BOOKSHELF,
  BOOKSHELF_BOOKS,
  BOOKSHELF_SHADOW,
  decorVariantGrid,
  COFFEE_SHADOW,
  DISPENSER,
  DISPENSER_SHADOW,
  DOOR,
  DOOR_AJAR,
  PICTURE_A,
  PICTURE_B,
  PROPS,
  type PropName,
} from "./props";
import {
  CELL,
  CELLS,
  FRAME_COLS,
  FRAME_ROWS,
  LAYER_COLS,
  LAYER_ROWS,
  PAPER_FILL,
  parseGrid,
} from "./pixel";
import pixel from "./pixel.ts?raw";
import { ART, GLASS, SHIRTS } from "./palette";
import decorSrc from "./decor.ts?raw";
import roomDecorSrc from "./RoomDecor.tsx?raw";
import { WINDOW_SCENE_IDS, decorVariantFor, windowScene } from "./decor";
import { RoomDecor } from "./RoomDecor";
import { layoutOffice } from "./iso";
import { roomShell } from "./room";
import {
  DESK,
  FRAME_VIEW,
  FRAMES,
  HAIRSTYLES,
  HEADPHONES,
  HEAD_ANCHOR,
  MUG_COL,
  SHADOW,
  SOLE_ROW,
} from "./sprites";
import sprites from "./sprites.ts?raw";
import { nextDisplayed, poseForState, shirtVars, type AgentState } from "./poses";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const rows = design.split("\n").filter((line) => line.startsWith("|"));

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const artRows = sectionRows(design, "## Art palette", "## Character art rules");

// Token rows of the Art, Shade and Bubble tables (not the Color tokens table).
function artTokens(): Map<string, { value: string; outline: string }> {
  const map = new Map<string, { value: string; outline: string }>();
  for (const row of artRows) {
    const c = cells(row);
    const token = /^`(--[a-z0-9-]+)`$/.exec(c[0]);
    const [value] = hexes(row);
    if (token && value) map.set(token[1], { value, outline: c.length === 5 ? c[4] : "" });
  }
  return map;
}

// Rows keyed by the Index column; fails on an index outside 0-7 or a duplicate.
function indexedRows(pattern: RegExp): string[][] {
  const out: string[][] = [];
  for (const row of rows) {
    const c = cells(row);
    if (!/^\d+$/.test(c[0]) || !pattern.test(row)) continue;
    const i = Number(c[0]);
    expect(i, `index ${c[0]}`).toBeGreaterThanOrEqual(0);
    expect(i, `index ${c[0]}`).toBeLessThanOrEqual(7);
    expect(out[i], `duplicate index ${i}`).toBeUndefined();
    out[i] = c;
  }
  return out;
}

const tokens = tokenRows(design);
const designArt = artTokens();
const BG = tokens.get("--bg")!;

describe("palette drift against DESIGN.md", () => {
  it("finds the background token", () => {
    expect(BG).toBe("#161a24");
  });

  it("has the same token set in palette.ts and the DESIGN.md art tables", () => {
    expect(Object.keys(ART).sort()).toEqual([...designArt.keys()].sort());
  });

  it("matches every art, shade, bubble and unknown-shirt token", () => {
    for (const [token, value] of Object.entries(ART)) {
      expect(designArt.get(token)?.value, token).toBe(value);
    }
  });

  it("matches the shirt palette table by index", () => {
    const table = indexedRows(/^\|\s*\d+\s*\|\s*[a-z ]+\s*\|\s*`#/);
    expect(table).toHaveLength(SHIRTS.length);
    SHIRTS.forEach((s, i) => {
      expect(table[i][1], `name ${i}`).toBe(s.name);
      expect(hexes(table[i].join("|")), s.name).toEqual([s.value]);
    });
  });

  it("matches the stripe counterpart table by index", () => {
    const table = indexedRows(/^\|\s*\d+\s*\|\s*`#/);
    expect(table).toHaveLength(SHIRTS.length);
    SHIRTS.forEach((s, i) => {
      expect(hexes(table[i].join("|")), s.name).toEqual([s.value, s.stripe]);
    });
  });
});

describe("art contrast", () => {
  const graphics: Record<string, string> = { ...ART };
  delete graphics["--art-shade"];
  delete graphics["--bubble-text"];
  delete graphics["--bubble-muted"];
  for (const s of SHIRTS) {
    graphics[`shirt ${s.name}`] = s.value;
    graphics[`stripe ${s.name}`] = s.stripe;
  }

  for (const [name, value] of Object.entries(graphics)) {
    it(`${name} is at least 3:1 on --bg`, () => {
      expect(contrast(value, BG)).toBeGreaterThanOrEqual(3);
    });
  }

  it("keeps each dark part at least 3:1 against --outline", () => {
    const dark = [...designArt].filter(([, d]) => /^\d+(\.\d+)?$/.test(d.outline));
    expect(dark.length).toBeGreaterThan(0);
    for (const [token, d] of dark) {
      expect(contrast(d.value, ART["--outline"]), token).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps every stripe at least 1.6:1 from its shirt", () => {
    for (const s of SHIRTS) {
      expect(contrast(s.stripe, s.value), s.name).toBeGreaterThanOrEqual(1.6);
    }
  });

  it("keeps text pairs at least 4.5:1", () => {
    const text = tokens.get("--text")!;
    expect(contrast(text, BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens.get("--text-muted")!, BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens.get("--accent")!, BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens.get("--warn")!, BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ART["--bubble-text"], ART["--bubble-fill"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ART["--bubble-muted"], ART["--bubble-fill"])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("poses", () => {
  it("maps all six states to their pose", () => {
    const expected: Record<AgentState, string> = {
      arriving: "walking",
      working: "seated-typing",
      "waiting-on-subagents": "standing-mug",
      idle: "seated-idle",
      attention: "seated-raised-hand",
      leaving: "walking",
    };
    for (const [state, pose] of Object.entries(expected)) {
      expect(poseForState(state as AgentState), state).toBe(pose);
    }
  });
});

describe("shirtVars", () => {
  it("emits shirt and stripe for indexes 0-7", () => {
    for (let i = 0; i < 8; i++) {
      expect(shirtVars(i, false)).toEqual({
        "--shirt": SHIRTS[i].value,
        "--shirt-stripe": SHIRTS[i].value,
      });
      expect(shirtVars(i, true)).toEqual({
        "--shirt": SHIRTS[i].value,
        "--shirt-stripe": SHIRTS[i].stripe,
      });
    }
  });

  it("falls back to gray and warns once for a real invalid index, not for nil", () => {
    for (const bad of [8, -1, 1.5, null, undefined]) {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(shirtVars(bad, true), String(bad)).toEqual({
        "--shirt": ART["--shirt-unknown"],
        "--shirt-stripe": ART["--shirt-unknown"],
      });
      expect(warn, String(bad)).toHaveBeenCalledTimes(bad == null ? 0 : 1);
      warn.mockRestore();
    }
  });

  // Value: production builds must stay silent but still show the gray fallback.
  it("gives the gray fallback without warning when DEV is false", () => {
    vi.stubEnv("DEV", false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(shirtVars(8, false)).toEqual({
      "--shirt": ART["--shirt-unknown"],
      "--shirt-stripe": ART["--shirt-unknown"],
    });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("nextDisplayed", () => {
  it("waits while a loop runs and neither event nor timeout fired", () => {
    expect(nextDisplayed("idle", true, false, 0)).toBeNull();
    expect(nextDisplayed("idle", true, false, 899)).toBeNull();
  });

  it("swaps on the animation event (loop no longer running)", () => {
    expect(nextDisplayed("working", false, false, 300)).toBe("working");
  });

  it("swaps immediately under reduced motion", () => {
    expect(nextDisplayed("attention", true, true, 0)).toBe("attention");
  });

  it("swaps at the 900ms timeout", () => {
    expect(nextDisplayed("leaving", true, false, 900)).toBe("leaving");
    expect(nextDisplayed("leaving", true, false, 1500)).toBe("leaving");
  });
});

describe("pixel sprites", () => {
  const grids = Object.entries(FRAMES);
  const known = new Set([".", ...Object.keys(CELLS)]);
  const checkCells = (name: string, grid: readonly string[]) => {
    for (const row of grid)
      for (const c of row) expect(known.has(c), `${name} cell '${c}'`).toBe(true);
  };

  it("has the eight figure frames", () => {
    expect(grids.map(([n]) => n).sort()).toEqual([
      "SEATED_IDLE",
      "SEATED_RAISED",
      "SEATED_TYPING",
      "STANDING",
      "STANDING_CUP",
      "STANDING_MUG",
      "WALK_A",
      "WALK_B",
    ]);
  });

  it("draws the seated frames from behind and the standing frames from the front", () => {
    expect(FRAME_VIEW).toEqual({
      SEATED_TYPING: "back",
      SEATED_RAISED: "back",
      SEATED_IDLE: "back",
      WALK_A: "front",
      WALK_B: "front",
      STANDING: "front",
      STANDING_MUG: "front",
      STANDING_CUP: "front",
    });
  });

  it("keeps the seated idle hands off the keyboard", () => {
    // The typing hands sit right of column 23 between rows 20 and 25.
    const hands = (name: "SEATED_TYPING" | "SEATED_IDLE") =>
      FRAMES[name]
        .slice(20, 26)
        .map((row) => row.slice(24))
        .join("");
    expect(hands("SEATED_TYPING")).toMatch(/[kK2]/);
    expect(hands("SEATED_IDLE")).not.toMatch(/[kK2]/);
  });

  it("holds a metal mug in the coffee frame and nothing in the standing frame", () => {
    expect(FRAMES.STANDING_MUG.join("")).toMatch(/m/);
    expect(FRAMES.STANDING.join("")).not.toMatch(/[mf]/);
  });

  it("holds a plain cup in the water frame, with no metal mug and no handle", () => {
    expect(FRAMES.STANDING_CUP).toHaveLength(FRAMES.STANDING_MUG.length);
    for (const [i, row] of FRAMES.STANDING_CUP.entries()) {
      expect(row).toHaveLength(FRAMES.STANDING_MUG[i].length);
    }
    expect(FRAMES.STANDING_CUP.join("")).not.toMatch(/[mM~7]/);
    // Same figure as the coffee frame: every cell left of the hand column matches.
    const left = (g: readonly string[]) => g.map((r) => r.slice(0, 24)).join("|");
    expect(left(FRAMES.STANDING_CUP)).toBe(left(FRAMES.STANDING_MUG));
    // the cup is the white-ish `l` cell (--outline), not the darker plastic cells
    expect(FRAMES.STANDING_CUP.join("")).not.toMatch(/[=g8]/);
    expect(FRAMES.STANDING_CUP.slice(22, 31).join("").replace(/[^l]/g, "").length).toBeGreaterThan(
      15,
    );
    expect(HEAD_ANCHOR.STANDING_CUP).toEqual(HEAD_ANCHOR.STANDING_MUG);
  });

  it("places the coffee figure by MUG_COL and SOLE_ROW as the grid draws it", () => {
    const grid = FRAMES.STANDING_MUG;
    // 44: last frame row with any cell, the soles (the frame is 48 rows tall).
    const lastDrawn = grid.reduce((last, row, i) => (/[^.]/.test(row) ? i : last), -1);
    expect(SOLE_ROW).toBe(lastDrawn);
    // 34: the mirrored figure starts here; its mug must land inside the coffee station.
    const isMug = (ch: string) => CELLS[ch]?.fill === "var(--metal)";
    const mugCols = grid.flatMap((row) =>
      row.split("").flatMap((ch, x) => (isMug(ch) ? [FRAME_COLS - 1 - x] : [])),
    );
    expect(mugCols.length).toBeGreaterThan(0);
    expect(MUG_COL + Math.max(...mugCols)).toBeLessThan(PROPS.COFFEE_STATION[0].length);
    expect(MUG_COL + Math.min(...mugCols)).toBeGreaterThanOrEqual(MUG_COL);
  });

  for (const [name, grid] of grids) {
    it(`${name} is ${FRAME_COLS}x${FRAME_ROWS} with only known cells`, () => {
      expect(FRAME_COLS).toBe(32);
      expect(FRAME_ROWS).toBe(48);
      expect(grid).toHaveLength(FRAME_ROWS);
      for (const row of grid) expect(row).toHaveLength(FRAME_COLS);
      checkCells(name, grid);
    });

    it(`${name} has dark shoes with a light sole below them`, () => {
      const shoe = grid.findIndex((row) => row.includes("5"));
      const sole = grid.findLastIndex((row) => row.includes("l"));
      expect(shoe, name).toBeGreaterThan(30);
      expect(sole, name).toBeGreaterThan(shoe);
    });
  }

  it("has at least five hairstyles, each with a front and a back layer", () => {
    expect(HAIRSTYLES.length).toBeGreaterThanOrEqual(5);
    expect(new Set(HAIRSTYLES.map((h) => h.name)).size).toBe(HAIRSTYLES.length);
    const drawn = new Set<string>();
    for (const style of HAIRSTYLES) {
      for (const view of ["front", "back"] as const) {
        const layer = style[view];
        expect(layer, `${style.name} ${view}`).toHaveLength(LAYER_ROWS);
        for (const row of layer) expect(row).toHaveLength(LAYER_COLS);
        expect(layer.join("")).toMatch(/h/);
        checkCells(`${style.name} ${view}`, layer);
        drawn.add(`${view}:${layer.join("")}`);
      }
    }
    expect(drawn.size).toBe(HAIRSTYLES.length * 2);
  });

  it("has headphone layers with cups and a band, and a shadow, of uniform width", () => {
    for (const view of ["front", "back"] as const) {
      const layer = HEADPHONES[view];
      expect(layer).toHaveLength(LAYER_ROWS);
      for (const row of layer) expect(row, view).toHaveLength(LAYER_COLS);
      checkCells(`headphones ${view}`, layer);
      expect(layer.join(""), view).toMatch(/g/);
      expect(layer.join(""), view).toMatch(/8/);
    }
    for (const row of SHADOW) expect(row).toHaveLength(SHADOW[0].length);
    expect(SHADOW[0].length).toBeLessThanOrEqual(FRAME_COLS);
    checkCells("shadow", SHADOW);
  });

  it("has a flattened shadow at least twice as wide as tall", () => {
    const width = Math.max(...SHADOW.map((r) => r.lastIndexOf("_") - r.indexOf("_") + 1));
    expect(width).toBeGreaterThanOrEqual(SHADOW.length * 2);
  });

  it("has a rectangular desk of known cells with a lit screen", () => {
    for (const row of DESK) expect(row).toHaveLength(DESK[0].length);
    checkCells("desk", DESK);
    expect(DESK.join("")).toMatch(/c/);
  });

  it("rejects an unknown cell", () => {
    expect(() => parseGrid(["?"])).toThrow(/unknown cell/);
  });

  it("merges horizontal runs of the same cell and applies the offset", () => {
    expect(parseGrid(["SSS.k"], 2, 3)).toEqual([
      { x: 2, y: 3, w: 3, c: "S" },
      { x: 6, y: 3, w: 1, c: "k" },
    ]);
  });

  it("maps every cell to a palette.ts token or a rig variable", () => {
    const names = new Set([...Object.keys(ART), "--shirt", "--shirt-stripe", "--hair", "--skin"]);
    const v = (s: string) => /^var\((--[a-z0-9-]+)\)$/.exec(s)![1];
    for (const cell of Object.values(CELLS)) {
      expect(names.has(v(cell.fill)), cell.fill).toBe(true);
      if (cell.overlay) expect(names.has(v(cell.overlay)), cell.overlay).toBe(true);
    }
  });

  it("has no hex literals in the sprite sources", () => {
    expect(sprites).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(pixel).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("has no hex literals in the appearance, rig, sheet and entry sources", () => {
    for (const [name, src] of Object.entries({
      appearance: appearanceSrc,
      rig: rigSrc,
      sheet: artSheetSrc,
      main: mainSrc,
    }))
      expect(src, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  // Value: a color slipped in as rgb(), hsl() or a CSS name would dodge the hex check.
  it("has no rgb(), hsl() or named colors in the string literals of the art sources", () => {
    const strip = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\w])\/\/.*$/gm, "$1");
    const literals = (src: string) =>
      [...strip(src).matchAll(/"([^"\\\n]*)"|'([^'\\\n]*)'|`([^`\\]*)`/g)].map(
        (m) => m[1] ?? m[2] ?? m[3],
      );
    expect(literals('a "rgb(1,2,3)" // "x"').join("|")).toBe("rgb(1,2,3)");
    for (const [name, src] of Object.entries({
      sprites,
      pixel,
      appearance: appearanceSrc,
      rig: rigSrc,
      sheet: artSheetSrc,
      main: mainSrc,
    }))
      for (const text of literals(src)) {
        expect(text, `${name}: ${text}`).not.toMatch(/\b(rgba?|hsla?)\(/);
        expect(text, `${name}: ${text}`).not.toMatch(/\b(red|blue|black|white|gray|grey)\b/);
      }
  });

  it("keeps shirt and stripe cells out of the props", () => {
    for (const [name, grid] of Object.entries(PROPS))
      for (const row of grid) expect(row, name).not.toMatch(/[sz]/);
  });

  it("reaches all 60 hairstyle, hair and skin combinations over 2000 seeds", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const a = appearanceFor(`agent-${i}`);
      seen.add(`${a.hairStyle}|${a.hair}|${a.skin}`);
    }
    expect(seen.size).toBe(HAIRSTYLES.length * HAIR.length * SKIN.length);
  });

  // Value: seeds are agent ids from outside, so odd ones must still give a drawable look.
  it("gives valid tokens for empty, emoji and 10k-character seeds", () => {
    for (const seed of ["", "\u{1F600}\u{1F468}\u200D\u{1F4BB}", "x".repeat(10_000)]) {
      const a = appearanceFor(seed);
      expect(Number.isInteger(a.hairStyle), seed.slice(0, 8)).toBe(true);
      expect(a.hairStyle).toBeGreaterThanOrEqual(0);
      expect(a.hairStyle).toBeLessThan(HAIRSTYLES.length);
      expect(HAIR).toContain(a.hair);
      expect(SKIN).toContain(a.skin);
    }
  });
});

describe("DESIGN.md sections", () => {
  // Value: a renamed heading must fail with its name instead of an empty table.
  it("reports a missing heading by name", () => {
    expect(() => sectionRows(design, "## No such heading", "## Art palette")).toThrow(
      /heading not found: "## No such heading"/,
    );
    expect(() => sectionRows(design, "## Art palette", "## No such end")).toThrow(
      /heading not found after "## Art palette"/,
    );
  });
});

describe("self-contained roots", () => {
  const used = (html: string) => [...html.matchAll(/var\((--[a-z0-9-]+)(,?)/g)];
  const declared = (html: string) =>
    new Set([...html.matchAll(/(?:style="|;)(--[a-z0-9-]+):/g)].map((m) => m[1]));

  // Value: the rig must draw correctly outside ArtSheet, so every var() it uses is set on its root.
  it("provides every var(--x) in the markup from the root style, without a wrapper", () => {
    const html: Record<string, string> = {
      desk: renderToStaticMarkup(createElement(PixelDesk, {})),
      deskDim: renderToStaticMarkup(createElement(PixelDesk, { lit: false })),
      rig: renderToStaticMarkup(
        createElement(CharacterRig, { pose: "walking", shirt: 0, stripe: true, carryPaper: true }),
      ),
    };
    for (const pose of [
      "seated-typing",
      "seated-raised-hand",
      "seated-idle",
      "standing-mug",
      "standing-cup",
    ] as const)
      html[pose] = renderToStaticMarkup(
        createElement(CharacterRig, { pose, shirt: 1, stripe: false }),
      );
    for (const name of Object.keys(PROPS) as PropName[])
      html[name] = renderToStaticMarkup(createElement(PixelProp, { name }));
    for (const [name, markup] of Object.entries(html)) {
      const set = declared(markup);
      expect(used(markup).length, name).toBeGreaterThan(0);
      for (const [, token, fallback] of used(markup))
        expect(set.has(token) || fallback === ",", `${name}: ${token}`).toBe(true);
    }
  });

  // Value: 12 agents must not re-emit the 1,500-element desk each (phase 4 R5).
  it("draws each desk kind and light state once and reuses it with one <use> per desk", () => {
    const defs = renderToStaticMarkup(createElement(DeskDefs));
    for (const id of ["tidy", "cluttered"])
      for (const light of ["lit", "dim"])
        expect(defs.match(new RegExp(`id="desk-${id}-${light}"`, "g"))).toHaveLength(1);
    expect(defs.match(/<g id=/g)).toHaveLength(4);
    expect(defs).toContain("var(--screen)");
    const desks = [true, true, false].map((lit) =>
      renderToStaticMarkup(createElement(SharedDesk, { kind: DESK_KINDS[0], lit })),
    );
    for (const html of desks) {
      expect(html.match(/<use /g)).toHaveLength(1);
      expect(html).not.toContain("<rect");
      expect(html).toMatch(/^<svg[^>]*aria-hidden="true"/);
      expect(html).toContain("--screen:");
    }
    expect(desks[0]).toContain('href="#desk-tidy-lit"');
    expect(desks[2]).toContain('href="#desk-tidy-dim"');
  });

  it("declares every palette token on each root", () => {
    const rig = renderToStaticMarkup(
      createElement(CharacterRig, { pose: "standing", shirt: 0, stripe: false }),
    );
    for (const [token, value] of Object.entries(ART)) expect(rig).toContain(`${token}:${value}`);
  });

  it("marks the svg roots decorative", () => {
    for (const el of [
      createElement(CharacterRig, { pose: "standing", shirt: 0, stripe: false }),
      createElement(PixelDesk, {}),
      createElement(PixelProp, { name: "DOOR" }),
    ]) {
      const html = renderToStaticMarkup(el);
      expect(html).toMatch(/^<svg[^>]*aria-hidden="true"/);
      expect(html).toMatch(/^<svg[^>]*focusable="false"/);
    }
  });
});

describe("dispenser and contact shadows", () => {
  const known = new Set([".", ...Object.keys(CELLS)]);
  const grids = { DISPENSER, DISPENSER_SHADOW, COFFEE_SHADOW };

  // Value: WALL_ANCHOR.DISPENSER and the room's rect checks depend on the 16x36 frame and the jug column.
  it("keeps the DISPENSER frame, known cells and the jug column bottom at the middle column", () => {
    expect(DISPENSER).toHaveLength(36);
    for (const row of DISPENSER) {
      expect(row).toHaveLength(16);
      for (const c of row) expect(known.has(c), `cell '${c}'`).toBe(true);
      expect(row).not.toMatch(/[sz]/);
    }
    let bottom = -1;
    DISPENSER.forEach((row, y) => {
      if (row[8] !== ".") bottom = y;
    });
    expect(bottom + 1).toBe(33);
  });

  // Value: the style rule is 2 cells minimum, and a 1-cell run in either direction breaks it.
  it("has no horizontal or vertical run of one cell", () => {
    for (const [name, grid] of Object.entries(grids)) {
      for (const [y, row] of grid.entries())
        for (const m of row.matchAll(/([^.])\1*/g))
          expect(m[0].length, `${name} row ${y} col ${m.index}`).toBeGreaterThanOrEqual(2);
      for (let x = 0; x < grid[0].length; x++) {
        const col = grid.map((row) => row[x]).join("");
        for (const m of col.matchAll(/([^.])\1*/g))
          expect(m[0].length, `${name} col ${x} row ${m.index}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  // Value: a contact shadow is plain ground-shadow cells (the shared '_' token, no new color), sheared at the wall slope.
  it("draws the shadows in '_' only, rectangular, one row down per two columns across", () => {
    for (const [name, grid] of Object.entries({ DISPENSER_SHADOW, COFFEE_SHADOW })) {
      for (const row of grid) {
        expect(row, name).toHaveLength(grid[0].length);
        expect(row, name).toMatch(/^\.*_+\.*$/);
      }
      const first = (y: number) => grid[y].indexOf("_");
      expect(first(grid.length - 1), name).toBeGreaterThan(first(0));
      const last = grid[0].length - 1;
      const topAt = (x: number) => grid.findIndex((r) => r[x] === "_");
      expect(topAt(last) - topAt(0), name).toBe(Math.floor(last / 2));
    }
    expect(DISPENSER_SHADOW[0]).toHaveLength(DISPENSER[0].length);
  });

  it("keeps the shadows out of PROPS' room list but on the dev sheet at 100% and 50%", () => {
    const html = renderToStaticMarkup(createElement(ArtSheet));
    for (const name of ["DISPENSER", "COFFEE_STATION"])
      expect(html.match(new RegExp(`data-shadow="${name}"`, "g")), name).toHaveLength(2);
  });

  it("renders the dispenser and shadows in the room under the props", () => {
    const shell = roomShell(layoutOffice(6, { width: 1200, height: 800 }));
    const html = renderToStaticMarkup(
      createElement(RoomDecor, {
        shell,
        door: { x: 0, y: 0 },
        coffee: shell.coffee,
        now: 0,
        scene: windowScene("dusk"),
      }),
    );
    expect(html.indexOf('data-shadow="COFFEE_STATION"')).toBeLessThan(
      html.indexOf('data-prop="COFFEE_STATION"'),
    );
    expect(html.indexOf('data-shadow="DISPENSER"')).toBeLessThan(
      html.indexOf('data-prop="DISPENSER"'),
    );
  });
});

describe("door ajar", () => {
  const known = new Set([".", ...Object.keys(CELLS)]);

  // Value: it swaps in for DOOR at the same anchor, so the frame must match.
  it("is DOOR's 20x60 frame of known cells, art tokens only", () => {
    expect(DOOR_AJAR).toHaveLength(DOOR.length);
    for (const row of DOOR_AJAR) {
      expect(row).toHaveLength(DOOR[0].length);
      for (const c of row) expect(known.has(c), `cell '${c}'`).toBe(true);
    }
    expect(DOOR_AJAR).not.toEqual(DOOR);
  });

  // Value: the style rule is 2 cells minimum in either direction.
  it("has no horizontal or vertical run of one cell", () => {
    for (const [y, row] of DOOR_AJAR.entries())
      for (const m of row.matchAll(/([^.])\1*/g))
        expect(m[0].length, `row ${y} col ${m.index}`).toBeGreaterThanOrEqual(2);
    for (let x = 0; x < DOOR_AJAR[0].length; x++) {
      const col = DOOR_AJAR.map((row) => row[x]).join("");
      for (const m of col.matchAll(/([^.])\1*/g))
        expect(m[0].length, `col ${x} row ${m.index}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("renders in the room only while open, in the door's place", () => {
    const shell = roomShell(layoutOffice(6, { width: 1200, height: 800 }));
    const html = (open: boolean) =>
      renderToStaticMarkup(
        createElement(RoomDecor, {
          shell,
          door: shell.door,
          coffee: shell.coffee,
          now: 0,
          scene: windowScene("dusk"),
          doorOpen: open,
        }),
      );
    expect(html(false)).toContain('data-prop="DOOR"');
    expect(html(false)).not.toContain('data-prop="DOOR_AJAR"');
    expect(html(true)).toContain('data-prop="DOOR_AJAR"');
    expect(html(true)).not.toContain('data-prop="DOOR"');
    expect(html(true)).toContain('data-door="open"');
    expect(html(false)).toContain('data-door="closed"');
  });
});

describe("wall dressing", () => {
  const known = new Set([".", ...Object.keys(CELLS)]);
  const grids = { BOOKSHELF, PICTURE_A, PICTURE_B, BOOKSHELF_SHADOW };
  // Cells that belong to figures, not furniture: shirt, stripe, skin, hair.
  const rig = /[szkh12340]/;

  // Value: the width budget and the wall anchors (room.ts WALL_ANCHOR) depend on these frames.
  it("sizes the shelf 20x39 and the pictures 14x22 and 12x19, known cells, no figure colors", () => {
    expect([BOOKSHELF[0].length, BOOKSHELF.length]).toEqual([20, 39]);
    expect([PICTURE_A[0].length, PICTURE_A.length]).toEqual([14, 22]);
    expect([PICTURE_B[0].length, PICTURE_B.length]).toEqual([12, 19]);
    for (const [name, grid] of Object.entries(grids))
      for (const row of grid) {
        expect(row, name).toHaveLength(grid[0].length);
        for (const c of row) expect(known.has(c), `${name} cell '${c}'`).toBe(true);
        if (name !== "BOOKSHELF_SHADOW") expect(row, name).not.toMatch(rig);
      }
    expect(PROPS.BOOKSHELF).toBe(BOOKSHELF);
  });

  // Value: the style rule is 2 cells minimum in either direction.
  it("has no horizontal or vertical run of one cell", () => {
    for (const [name, grid] of Object.entries(grids)) {
      for (const [y, row] of grid.entries())
        for (const m of row.matchAll(/([^.])\1*/g))
          expect(m[0].length, `${name} row ${y} col ${m.index}`).toBeGreaterThanOrEqual(2);
      for (let x = 0; x < grid[0].length; x++) {
        const col = grid.map((row) => row[x]).join("");
        for (const m of col.matchAll(/([^.])\1*/g))
          expect(m[0].length, `${name} col ${x} row ${m.index}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  // Value: DESIGN 7B: books are an irregular row, never a repeating pattern that reads as a texture.
  it("keeps every shelf's books free of a repeat with period 3 or less over 4+ books", () => {
    const repeats = (seq: string[]) => {
      for (let p = 1; p <= 3; p++) {
        const len = Math.max(4, 2 * p);
        for (let i = 0; i + len <= seq.length; i++)
          if (seq.slice(i, i + len - p).every((b, k) => b === seq[i + k + p])) return true;
      }
      return false;
    };
    const key = (b: readonly [string, number] | null) => (b ? `${b[0]}${b[1]}` : "-");
    expect(BOOKSHELF_BOOKS.length).toBeGreaterThanOrEqual(3);
    for (const row of BOOKSHELF_BOOKS)
      expect(repeats(row.map(key)), row.map(key).join(" ")).toBe(false);
    expect(repeats(BOOKSHELF_BOOKS.flatMap((r) => r.map(key)))).toBe(false);
    // The checker itself catches a period-2 and a period-3 run.
    expect(repeats(["a8", "b6", "a8", "b6"])).toBe(true);
    expect(repeats(["a8", "b6", "c4", "a8", "b6", "c4"])).toBe(true);
    // Every book is a 2-cell-wide bar from a known token.
    for (const [c, h] of BOOKSHELF_BOOKS.flat().filter((b) => b !== null)) {
      expect(known.has(c), c).toBe(true);
      expect(h % 2).toBe(0);
    }
  });

  // Value: DESIGN Principle 4: no text-like shapes; three or more equal 2-cell dashes in a row read as lines of text.
  it("has no run of three alternating 2-cell segments in the pictures or the shelf's books", () => {
    const dashes = (line: string) => {
      const segs = [...line.matchAll(/(.)\1*/g)].map((m) => [m[1], m[0].length] as const);
      for (let i = 0; i + 2 < segs.length; i++) {
        const [a, b, c] = segs.slice(i, i + 3);
        if (a[1] === 2 && b[1] === 2 && c[1] === 2 && a[0] === c[0] && a[0] !== b[0]) return true;
      }
      return false;
    };
    expect(dashes("..cc..cc..")).toBe(true);
    for (const [name, grid] of Object.entries({ PICTURE_A, PICTURE_B })) {
      for (const [y, row] of grid.entries()) expect(dashes(row), `${name} row ${y}`).toBe(false);
      for (let x = 0; x < grid[0].length; x++)
        expect(dashes(grid.map((r) => r[x]).join("")), `${name} col ${x}`).toBe(false);
    }
  });

  // Value: a picture is a frame around 2 or 3 flat blocks, not a scene.
  it("frames each picture in wood around 2 or 3 flat color blocks", () => {
    for (const [name, grid] of Object.entries({ PICTURE_A, PICTURE_B })) {
      const flat = grid.join("");
      const blocks = new Set(flat.replace(/[.w:6]/g, "").match(/./g));
      expect(blocks.size, name).toBeGreaterThanOrEqual(2);
      expect(blocks.size, name).toBeLessThanOrEqual(3);
      expect(flat, name).toMatch(/[w:6]/);
    }
  });

  // Value: the shadow is the shared '_' token, rising to the right with the left wall's base.
  it("draws the shelf shadow in '_' only, rising one row per two columns", () => {
    for (const row of BOOKSHELF_SHADOW) expect(row).toMatch(/^\.*_+\.*$/);
    expect(BOOKSHELF_SHADOW[0]).toHaveLength(BOOKSHELF[0].length);
    const topAt = (x: number) => BOOKSHELF_SHADOW.findIndex((r) => r[x] === "_");
    const last = BOOKSHELF_SHADOW[0].length - 1;
    expect(topAt(0) - topAt(last)).toBe(Math.floor(last / 2));
  });

  // Value: D2.3r: the decor's colors vary by date, but only colors: every variant keeps the base
  // grid's size and shapes and passes the same style rules.
  describe("date variants", () => {
    const names = ["BOOKSHELF", "PICTURE_A", "PICTURE_B"] as const;
    const base = { BOOKSHELF, PICTURE_A, PICTURE_B };
    const shape = (g: readonly string[]) => g.map((r) => r.replace(/[^.]/g, "#"));

    it("has variant 0 equal to the base grid and the other two different", () => {
      for (const n of names) {
        expect(decorVariantGrid(n, 0), n).toEqual(base[n]);
        expect(decorVariantGrid(n, 1), n).not.toEqual(base[n]);
        expect(decorVariantGrid(n, 2), n).not.toEqual(decorVariantGrid(n, 1));
      }
    });

    // Value: protects=a bad variant (NaN, negative, fractional, huge) draws a valid grid and is never cached under its own key; fails_when=decorVariantGrid indexes or caches by the raw value; why_new=only 0..2 were exercised; seam=none
    it("normalizes an invalid variant instead of drawing undefined cells", () => {
      for (const n of names) {
        for (const [bad, as] of [
          [Number.NaN, 0],
          [-1, 2],
          [3, 0],
          [4, 1],
          [1.5, 0],
          [Number.POSITIVE_INFINITY, 0],
        ] as const) {
          const grid = decorVariantGrid(n, bad);
          expect(grid, `${n} ${bad}`).toEqual(decorVariantGrid(n, as));
          for (const row of grid)
            for (const c of row) expect(known.has(c), `${n} ${bad} '${c}'`).toBe(true);
        }
      }
    });

    it("keeps size, shape, known cells and the 2-cell rule in every variant", () => {
      for (const n of names)
        for (const v of [0, 1, 2]) {
          const grid = decorVariantGrid(n, v);
          expect(shape(grid), `${n} ${v}`).toEqual(shape(base[n]));
          for (const [y, row] of grid.entries()) {
            expect(row, `${n} ${v}`).not.toMatch(rig);
            for (const c of row) expect(known.has(c), `${n} ${v} '${c}'`).toBe(true);
            for (const m of row.matchAll(/([^.])\1*/g))
              expect(m[0].length, `${n} ${v} row ${y}`).toBeGreaterThanOrEqual(2);
          }
          for (let x = 0; x < grid[0].length; x++)
            for (const m of grid
              .map((r) => r[x])
              .join("")
              .matchAll(/([^.])\1*/g))
              expect(m[0].length, `${n} ${v} col ${x}`).toBeGreaterThanOrEqual(2);
        }
    });

    it("keeps the shelf's books free of a short repeat and the pictures at 2 or 3 blocks", () => {
      for (const v of [1, 2]) {
        const shelf = decorVariantGrid("BOOKSHELF", v);
        // Same-letter structure is what the rhythm rule reads: a recolor must not merge two books.
        const sameStructure = (a: readonly string[], b: readonly string[]) =>
          a.every((row, y) =>
            row
              .split("")
              .every((c, x) =>
                row.split("").every((d, x2) => (c === d) === (b[y][x] === b[y][x2])),
              ),
          );
        expect(sameStructure(BOOKSHELF, shelf), `shelf ${v}`).toBe(true);
        for (const n of ["PICTURE_A", "PICTURE_B"] as const) {
          const blocks = new Set(
            decorVariantGrid(n, v)
              .join("")
              .replace(/[.w:6]/g, "")
              .match(/./g),
          );
          expect([2, 3], `${n} ${v}`).toContain(blocks.size);
        }
      }
    });

    it("draws the variant for a given day in the room", () => {
      const shell = roomShell(layoutOffice(12, { width: 1200, height: 800 }));
      const day = (n: number) => new Date(2026, 2, n, 12).getTime();
      // The wall dressing only: the clock hands move with the hour.
      const html = (now: number) =>
        (
          renderToStaticMarkup(
            createElement(RoomDecor, {
              shell,
              door: shell.door,
              coffee: shell.coffee,
              now,
              scene: windowScene("dusk"),
            }),
          ).match(/<svg data-prop="(?:BOOKSHELF|PICTURE_[AB])".*?<\/svg>/g) ?? []
        ).join("");
      const days = Array.from({ length: 30 }, (_, i) => i + 1);
      const a = days[0];
      const b = days.find(
        (d) =>
          decorVariantFor(`2026-03-${String(d).padStart(2, "0")}`) !==
          decorVariantFor("2026-03-01"),
      )!;
      expect(html(day(a))).toContain("data-decor-variant");
      expect(html(day(a))).toBe(html(day(a) + 3600_000));
      expect(html(day(a))).not.toBe(html(day(b)));
    });

    it("shows the three variants of the shelf and pictures on the dev sheet", () => {
      const sheet = renderToStaticMarkup(createElement(ArtSheet));
      for (const v of [0, 1, 2]) expect(sheet).toContain(`data-decor-variant="${v}"`);
    });
  });

  it("renders in the room from three rows, shadow first, and on the dev sheet", () => {
    const shell = roomShell(layoutOffice(12, { width: 1200, height: 800 }));
    const html = renderToStaticMarkup(
      createElement(RoomDecor, {
        shell,
        door: shell.door,
        coffee: shell.coffee,
        now: 0,
        scene: windowScene("dusk"),
      }),
    );
    for (const name of ["BOOKSHELF", "PICTURE_A", "PICTURE_B"])
      expect(html.match(new RegExp(`data-prop="${name}"`, "g")), name).toHaveLength(1);
    expect(html.indexOf('data-shadow="BOOKSHELF"')).toBeLessThan(
      html.indexOf('data-prop="BOOKSHELF"'),
    );
    const sheet = renderToStaticMarkup(createElement(ArtSheet));
    for (const name of ["BOOKSHELF", "PICTURE_A", "PICTURE_B"])
      expect(
        sheet.match(new RegExp(`data-prop="${name}"`, "g"))!.length,
        name,
      ).toBeGreaterThanOrEqual(2);
    expect(sheet.match(/data-shadow="BOOKSHELF"/g)).toHaveLength(2);
  });
});

describe("legibility row", () => {
  // Value: DESIGN 1A: the 12-agent 50% sheet is the decor gate; it must stay on the dev sheet.
  it("shows the 12-agent legibility row on the dev sheet", () => {
    expect(renderToStaticMarkup(createElement(ArtSheet))).toContain("data-legibility");
  });

  // Value: the door light wedge tile must show both flat tones of the fan.
  it("draws the door light wedge as a near and a far tone", () => {
    const html = renderToStaticMarkup(createElement(ArtSheet));
    expect(html).toContain('data-part="door-light" data-tone="near"');
    expect(html).toContain('data-part="door-light" data-tone="far"');
  });
});

describe("ArtSheet", () => {
  // Value: the dev sheet is the style gate; it must render and show every frame and prop.
  it("renders every frame and prop without throwing", () => {
    const html = renderToStaticMarkup(createElement(ArtSheet));
    for (const name of Object.keys(FRAMES)) expect(html, name).toContain(`data-frame="${name}"`);
    for (const name of Object.keys(PROPS)) expect(html, name).toContain(`data-prop="${name}"`);
  });
});

describe("CharacterRig", () => {
  const render = (props: Parameters<typeof CharacterRig>[0]) =>
    renderToStaticMarkup(createElement(CharacterRig, props));

  it("carries data-shirt and the shirt variables on the root", () => {
    const html = render({ pose: "seated-typing", shirt: 2, stripe: true });
    expect(html).toMatch(/^<svg[^>]*data-shirt="green"/);
    expect(html).toContain("--shirt:#009e73");
    expect(html).toContain("--shirt-stripe:#66c5ab");
  });

  it("falls back to gray for an invalid shirt", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const html = render({ pose: "walking", shirt: 8, stripe: true });
    expect(html).toContain('data-shirt="unknown"');
    expect(html).toContain(`--shirt:${ART["--shirt-unknown"]}`);
    expect(html).toContain(`--shirt-stripe:${ART["--shirt-unknown"]}`);
    warn.mockRestore();
  });

  it("draws shirt cells with the shirt variable and crisp edges", () => {
    for (const pose of [
      "seated-typing",
      "seated-raised-hand",
      "seated-idle",
      "walking",
      "standing",
      "standing-mug",
      "standing-cup",
    ] as const) {
      const html = render({ pose, shirt: 0, stripe: true });
      expect(html, pose).toContain('fill="var(--shirt)"');
      expect(html, pose).toContain('fill="var(--shirt-stripe)"');
      expect(html, pose).toContain('shape-rendering="crispEdges"');
      expect(html, pose).not.toMatch(/fill="#/);
    }
  });

  it("overlays shade cells with --art-shade and light cells with --outline", () => {
    const html = render({ pose: "walking", shirt: 0, stripe: false });
    expect(html).toContain('fill="var(--art-shade)"');
    expect(html).toContain('fill="var(--outline)" opacity="0.35"');
  });

  it("carries a paper only when asked (arriving and leaving hold nothing)", () => {
    const withPaper = render({ pose: "walking", shirt: 0, stripe: false, carryPaper: true });
    const byDefault = render({ pose: "walking", shirt: 0, stripe: false });
    expect(withPaper).toContain(`fill="${PAPER_FILL}"`);
    expect(byDefault).not.toContain(`fill="${PAPER_FILL}"`);
  });

  it("keeps the shadow outside the mirror group", () => {
    const html = render({ pose: "walking", shirt: 0, stripe: false, mirror: true });
    expect(html).toContain("scale(-1 1)");
    expect(html).toContain('data-part="shadow"');
    expect(html.indexOf('data-part="shadow"')).toBeLessThan(html.indexOf("scale(-1 1)"));
  });

  it("maps each pose to its frame", () => {
    const frame = (props: Parameters<typeof CharacterRig>[0]) =>
      /data-frame="([A-Z_]+)"/.exec(render(props))![1];
    const base = { shirt: 0, stripe: false } as const;
    expect(frame({ ...base, pose: "seated-typing" })).toBe("SEATED_TYPING");
    expect(frame({ ...base, pose: "seated-raised-hand" })).toBe("SEATED_RAISED");
    expect(frame({ ...base, pose: "walking", walkFrame: 0 })).toBe("WALK_A");
    expect(frame({ ...base, pose: "walking", walkFrame: 1 })).toBe("WALK_B");
    expect(frame({ ...base, pose: "seated-idle" })).toBe("SEATED_IDLE");
    expect(frame({ ...base, pose: "standing" })).toBe("STANDING");
    expect(frame({ ...base, pose: "standing-mug" })).toBe("STANDING_MUG");
    expect(frame({ ...base, pose: "standing-cup" })).toBe("STANDING_CUP");
  });

  it("draws both walking frames under a stride when walking, and only one at rest", () => {
    const base = { shirt: 0, stripe: false } as const;
    const walking = render({ ...base, pose: "walking", stride: true });
    expect(walking).toContain('data-part="walk-a"');
    expect(walking).toContain('data-part="walk-b"');
    for (const pose of [
      "standing",
      "standing-mug",
      "standing-cup",
      "seated-idle",
      "seated-typing",
    ] as const) {
      const still = render({ ...base, pose, stride: true });
      expect(still, pose).not.toContain('data-part="walk-');
    }
    expect(render({ ...base, pose: "walking" })).not.toContain('data-part="walk-');
  });

  it("gives the two walking frames different legs", () => {
    const legs = (g: readonly string[]) => g.slice(32).join("|");
    expect(legs(FRAMES.WALK_A)).not.toBe(legs(FRAMES.WALK_B));
  });

  it("renders the standing and coffee frames with the shirt variables", () => {
    for (const [pose, name] of [
      ["standing", "STANDING"],
      ["standing-mug", "STANDING_MUG"],
      ["standing-cup", "STANDING_CUP"],
    ] as const) {
      const html = render({ pose, shirt: 4, stripe: true });
      expect(html, pose).toMatch(new RegExp(`^<svg[^>]*data-frame="${name}"`));
      expect(html, pose).toContain(`data-pose="${pose}"`);
      expect(html, pose).toContain("--shirt:#0072b2");
      expect(html, pose).toContain("--shirt-stripe:#66aad1");
      expect(html, pose).toContain('fill="var(--shirt)"');
      expect(html, pose).not.toMatch(/fill="#/);
    }
  });

  it("shows a lap and legs under the seated frames", () => {
    for (const name of ["SEATED_TYPING", "SEATED_RAISED", "SEATED_IDLE"] as const) {
      const rows = FRAMES[name];
      const trousers = rows.filter((r) => /[pP4]/.test(r)).length;
      expect(trousers, name).toBeGreaterThanOrEqual(8);
      expect(rows.join(""), name).toMatch(/5/);
    }
  });

  // The rect markup of one layer grid at an anchor, as the rig renders it.
  const layerRects = (grid: readonly string[], [hx, hy]: readonly [number, number]) =>
    parseGrid(grid, hx, hy).map(
      (r) =>
        `<rect x="${r.x * CELL}" y="${r.y * CELL}" width="${r.w * CELL}" height="${CELL}" fill="${CELLS[r.c].fill}"></rect>`,
    );

  it("draws each hair style's rects at HEAD_ANCHOR for both views", () => {
    for (const [pose, frame] of [
      ["walking", "WALK_A"],
      ["seated-typing", "SEATED_TYPING"],
    ] as const) {
      const view = FRAME_VIEW[frame];
      const htmls = [0, 1].map((hairStyle) => render({ pose, shirt: 0, stripe: false, hairStyle }));
      const expected = [0, 1].map((i) => layerRects(HAIRSTYLES[i][view], HEAD_ANCHOR[frame]));
      expected.forEach((rects, i) => {
        expect(rects.length, `${frame} ${i}`).toBeGreaterThan(0);
        for (const rect of rects) expect(htmls[i], `${frame} ${i} ${rect}`).toContain(rect);
      });
      const only0 = expected[0].filter((r) => !expected[1].includes(r));
      expect(only0.length, frame).toBeGreaterThan(0);
      for (const rect of only0) expect(htmls[1], `${frame} ${rect}`).not.toContain(rect);
    }
  });

  it("draws the headphones at HEAD_ANCHOR for a seated and a standing frame", () => {
    for (const [pose, frame] of [
      ["seated-typing", "SEATED_TYPING"],
      ["standing", "STANDING"],
    ] as const) {
      const html = render({ pose, shirt: 0, stripe: false });
      const rects = layerRects(HEADPHONES[FRAME_VIEW[frame]], HEAD_ANCHOR[frame]);
      expect(rects.length, frame).toBeGreaterThan(0);
      expect(
        rects.some((r) => r.includes('fill="var(--plastic)"')),
        frame,
      ).toBe(true);
      for (const rect of rects) expect(html, `${frame} ${rect}`).toContain(rect);
    }
  });

  it("falls back to the default hair and skin for a bogus token", () => {
    const html = render({
      pose: "walking",
      shirt: 0,
      stripe: false,
      hair: "--bogus" as never,
      skin: "--evil" as never,
    });
    expect(html).toContain("--hair:var(--hair-1)");
    expect(html).toContain("--skin:var(--skin-2)");
    expect(html).not.toContain("--bogus");
    expect(html).not.toContain("--evil");
  });

  it("switches the hair layer with hairStyle", () => {
    const seen = new Set<string>();
    HAIRSTYLES.forEach((style, i) => {
      const html = render({ pose: "walking", shirt: 0, stripe: false, hairStyle: i });
      expect(html).toContain(`data-hair-style="${style.name}"`);
      seen.add(html);
    });
    expect(seen.size).toBe(HAIRSTYLES.length);
  });

  it("wraps hairStyle and falls back to style 0 for non-integers", () => {
    const style = (hairStyle: number) =>
      /data-hair-style="([a-z-]+)"/.exec(
        render({ pose: "walking", shirt: 0, stripe: false, hairStyle }),
      )![1];
    expect(style(-1)).toBe(HAIRSTYLES[HAIRSTYLES.length - 1].name);
    expect(style(HAIRSTYLES.length)).toBe(HAIRSTYLES[0].name);
    for (const bad of [1.5, NaN, Infinity]) expect(style(bad)).toBe(HAIRSTYLES[0].name);
  });

  it("sets --hair and --skin from the palette token props", () => {
    const html = render({
      pose: "walking",
      shirt: 0,
      stripe: false,
      hair: "--hair-3",
      skin: "--skin-3",
    });
    expect(html).toContain("--hair:var(--hair-3)");
    expect(html).toContain("--skin:var(--skin-3)");
    expect(html).toContain('fill="var(--hair)"');
    expect(html).toContain('fill="var(--skin)"');
  });
});

describe("GLASS palette", () => {
  const glassRows = sectionRows(design, "## Glass tokens", "## Typography");
  const header = glassRows[0];
  const capText = /cap (\d\.\d{4})/.exec(header)?.[1];
  const designGlass = new Map<string, { value: string; lum: string }>();
  for (const row of glassRows) {
    const c = cells(row);
    const token = /^`(--[a-z0-9-]+)`$/.exec(c[0]);
    const [value] = hexes(row);
    if (token && value) designGlass.set(token[1], { value, lum: c[c.length - 1] });
  }
  const cap = luminance(ART["--plastic"]);

  it("states the --plastic luminance cap in the table header", () => {
    expect(capText).toBeDefined();
    expect(Number(capText)).toBeCloseTo(cap, 4);
  });

  it("has the same token set in palette.ts and the DESIGN.md Glass tokens table", () => {
    expect(Object.keys(GLASS).sort()).toEqual([...designGlass.keys()].sort());
  });

  it("matches every glass hex and its luminance column", () => {
    for (const [token, value] of Object.entries(GLASS)) {
      const row = designGlass.get(token)!;
      expect(row.value, token).toBe(value);
      expect(Number(row.lum), token).toBeCloseTo(luminance(value), 4);
    }
  });

  it("keeps every glass colour at most as bright as --plastic", () => {
    for (const [token, value] of Object.entries(GLASS))
      expect(luminance(value), token).toBeLessThanOrEqual(cap);
    for (const row of designGlass.values())
      expect(Number(row.lum)).toBeLessThanOrEqual(Number(capText));
  });

  it("keeps the frame colours (--wood, --metal) at least 3:1 on --bg", () => {
    for (const t of ["--wood", "--metal"] as const)
      expect(contrast(ART[t], BG), t).toBeGreaterThanOrEqual(3);
  });

  it("is not in ART and not written onto a character, desk or prop root", () => {
    for (const token of Object.keys(GLASS)) expect(ART, token).not.toHaveProperty([token]);
    const roots = [
      renderToStaticMarkup(
        createElement(CharacterRig, { pose: "standing", shirt: 0, stripe: false }),
      ),
      renderToStaticMarkup(createElement(PixelDesk, {})),
      ...(Object.keys(PROPS) as PropName[]).map((name) =>
        renderToStaticMarkup(createElement(PixelProp, { name })),
      ),
    ];
    for (const html of roots) expect(html).not.toContain("--glass");
  });

  it("has no hex literals in the decor and room decor sources", () => {
    expect(decorSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(roomDecorSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("shows every scene on a left-wall and a right-wall window in the dev sheet, at 100% and 50%", () => {
    const html = renderToStaticMarkup(createElement(ArtSheet));
    for (const id of WINDOW_SCENE_IDS)
      for (const wall of ["left", "right"] as const) {
        const n = html.match(new RegExp(`data-window-scene="${id}"[^>]*data-wall="${wall}"`, "g"));
        expect(n?.length, `${id} ${wall}`).toBeGreaterThanOrEqual(2);
      }
    expect(html).toContain('data-part="floor-light"');
  });
});
