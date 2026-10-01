// Palette-indexed pixel grids. One character per cell, '.' is transparent.
// Every other character is a token color, optionally under a shade or light overlay:
// lowercase is the base color, uppercase the base under --art-shade, digits a deep
// shade, 'x' and 'q' ink (eyes, bezels), and the symbols the base under an --outline
// highlight. Shirt cells follow --shirt, hair and skin the rig's --hair and --skin.
// '_' is the ground shadow: plain --art-shade, faded by the group opacity of the shadow layer.
// Letters: s shirt, z stripe, k skin, h hair, p trousers, o shoes, w wood, m metal,
// g plastic, c screen, e leaf, f paper (bubble fill), l outline light.
// Digits 1-9,0 deep: s k h p o w m g e z. Symbols light: + s, ^ h, ; k, : w, ~ m, = g, ! c, % e.

export const CELL = 2;
export const FRAME_COLS = 32;
export const FRAME_ROWS = 48;
// Hair and headphone layers, drawn at the frame's head anchor.
export const LAYER_COLS = 20;
export const LAYER_ROWS = 16;

export const OVERLAY = { shade: 0.25, deep: 0.5, ink: 0.72, light: 0.35 } as const;
export const SHADOW_OPACITY = 0.35;

// The paper cell's fill; the rig hides it unless the agent carries a paper.
export const PAPER_FILL = "var(--bubble-fill)";

const BASE = {
  s: "var(--shirt)",
  z: "var(--shirt-stripe)",
  k: "var(--skin)",
  h: "var(--hair)",
  p: "var(--trousers)",
  o: "var(--shoes)",
  w: "var(--wood)",
  m: "var(--metal)",
  g: "var(--plastic)",
  c: "var(--screen)",
  e: "var(--leaf)",
  f: PAPER_FILL,
  l: "var(--outline)",
} as const;

type Base = keyof typeof BASE;
export type Cell = { fill: string; overlay?: string; opacity?: number };

const shade = (b: Base, opacity: number): Cell => ({
  fill: BASE[b],
  overlay: "var(--art-shade)",
  opacity,
});
const light = (b: Base): Cell => ({
  fill: BASE[b],
  overlay: "var(--outline)",
  opacity: OVERLAY.light,
});

const DEEP: Record<string, Base> = {
  "1": "s",
  "2": "k",
  "3": "h",
  "4": "p",
  "5": "o",
  "6": "w",
  "7": "m",
  "8": "g",
  "9": "e",
  "0": "z",
};
const LIGHT: Record<string, Base> = {
  "+": "s",
  "^": "h",
  ";": "k",
  ":": "w",
  "~": "m",
  "=": "g",
  "!": "c",
  "%": "e",
};

export const CELLS: Record<string, Cell> = {
  ...Object.fromEntries(
    (Object.keys(BASE) as Base[]).flatMap((b) => [
      [b, { fill: BASE[b] }],
      [b.toUpperCase(), shade(b, OVERLAY.shade)],
    ]),
  ),
  ...Object.fromEntries(Object.entries(DEEP).map(([c, b]) => [c, shade(b, OVERLAY.deep)])),
  ...Object.fromEntries(Object.entries(LIGHT).map(([c, b]) => [c, light(b)])),
  x: shade("g", OVERLAY.ink),
  q: shade("k", OVERLAY.ink),
  // Ground shadow, drawn under a group opacity.
  _: { fill: "var(--art-shade)" },
};

export type Grid = readonly string[];
export type Run = { x: number; y: number; w: number; c: string };

export function parseGrid(grid: Grid, dx = 0, dy = 0): Run[] {
  const runs: Run[] = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === c) end++;
      if (c !== "." && !(c in CELLS)) throw new Error(`unknown cell '${c}' at ${x},${y}`);
      if (c !== ".") runs.push({ x: x + dx, y: y + dy, w: end - x, c });
      x = end;
    }
  });
  return runs;
}
