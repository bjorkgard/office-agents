import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import design from "../../DESIGN.md?raw";
import appearanceSrc from "./appearance.ts?raw";
import { appearanceFor, HAIR, SKIN } from "./appearance";
import ArtSheet from "./ArtSheet";
import artSheetSrc from "./ArtSheet.tsx?raw";
import { CharacterRig, PixelDesk, PixelProp } from "./CharacterRig";
import rigSrc from "./CharacterRig.tsx?raw";
import mainSrc from "../main.tsx?raw";
import { PROPS, type PropName } from "./props";
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
import { ART, SHIRTS } from "./palette";
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
const HEX = /`(#[0-9a-f]{6})`/g;

function hexes(row: string): string[] {
  return [...row.matchAll(HEX)].map((m) => m[1]);
}

function tokenRows(): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const token = /^\|\s*`(--[a-z0-9-]+)`\s*\|/.exec(row);
    const [value] = hexes(row);
    if (token && value) map.set(token[1], value);
  }
  return map;
}

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

function cells(row: string): string[] {
  return row
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}

// Table rows between two headings; a renamed heading fails with its name, not an empty table.
function sectionRows(source: string, from: string, to: string): string[] {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`DESIGN.md heading not found: "${from}"`);
  const end = source.indexOf(to, start);
  if (end < 0) throw new Error(`DESIGN.md heading not found after "${from}": "${to}"`);
  return source
    .slice(start, end)
    .split("\n")
    .filter((line) => line.startsWith("|"));
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

const tokens = tokenRows();
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

  it("has the seven figure frames", () => {
    expect(grids.map(([n]) => n).sort()).toEqual([
      "SEATED_IDLE",
      "SEATED_RAISED",
      "SEATED_TYPING",
      "STANDING",
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
  });

  it("renders the standing and coffee frames with the shirt variables", () => {
    for (const [pose, name] of [
      ["standing", "STANDING"],
      ["standing-mug", "STANDING_MUG"],
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
