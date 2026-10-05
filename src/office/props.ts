import { CELL, type Grid } from "./pixel";

// The grids below are the source of truth and are edited by hand; the one-off generator that
// first drew them is not part of the repo.
// Room props as pixel grids at 2 px per cell, same legend as the figures (pixel.ts).
// Isometric 2:1 like the desk; light from the top left.

// Door in the back-left wall (the wall rises to the right): wood leaf, lit frame, metal handle. 20x60 cells.
export const DOOR: Grid = [
  "....................",
  "..................66",
  "................::66",
  "..............::WW66",
  "............::WWWw66",
  "..........::WWWwww66",
  "........::WWWwwwww66",
  "......::WWWwwwwwww66",
  "....::WWwwwwwwwwww66",
  "..::WWwwwwwwwwwWww66",
  "::WWwwwwwwwwwW6Www66",
  "::wwwwwwwwwW66WWww66",
  "::wwwwwwWW66WWWWww66",
  "::wwwwWWW6WWWWWWww66",
  "::wwWWW6WWWWWWWWww66",
  "::wwW6WWWWWWWWWWww66",
  "::wwW6WWWWWWWWWWww66",
  "::wwW6WWWWWWWWWWww66",
  "::wwW6WWWWWWWWWWww66",
  "::wwW6WWWWWWWWWWww66",
  "::wwW6WWWWWWWWWWww66",
  "::wwW6WWWWWWWWWWww66",
  "::wwW6WWWWWWWWWWww66",
  "::wwW6WWWWWWWWWWww66",
  "::wwW6WWWWWWWW:Www66",
  "::wwW6WWWWWW::WWww66",
  "::wwW6WWWW::WWwwww66",
  "::wwW6WW::WWwwwwww66",
  "::wwW6::Wwwwwwwwww66",
  "::wwW:Wwwwwwwwwwww66",
  "::wwWwwwwwwwwwwWww66",
  "::wwwwwwwwwwwW6Www66",
  "::wwwwwwwwwW66WWww66",
  "::wwwwwwWW66WW~mww66",
  "::wwwwWWW6WWWWmmww66",
  "::wwWWW6WWWWWWW7ww66",
  "::wwW6WWWWWWWWWWww66",
  "::wwW6WWWWWWWWWWww66",
  "::wwW6WWWWWWWWWWww66",
  "::wwW6WWWWWWWWWWww66",
  "::wwW6WWWWWWWWWWww66",
  "::wwW6WWWWWWWWWWww66",
  "::wwW6WWWWWWWWWWww66",
  "::wwW6WWWWWWWWWWww66",
  "::wwW6WWWWWWWWWWww66",
  "::wwW6WWWWWWWWWWww66",
  "::wwW6WWWWWWWW:Www66",
  "::wwW6WWWWWW::WWww66",
  "::wwW6WWWW::WWwwww66",
  "::wwW6WW::WWwwwwww66",
  "::wwW6::Wwwwwwwwww77",
  "::wwW:Wwwwwwwwww77..",
  "::wwWwwwwwwwww77....",
  "::wwwwwwwwww77......",
  "::wwwwwwww77........",
  "::wwwwww77..........",
  "::wwww77............",
  "::ww77..............",
  "::77................",
  "77..................",
];

// The door ajar, same frame and anchor as DOOR: dark gap (deep plastic), the leaf swung in on the right with its handle. Shown while a subagent comes or goes (paper.ts doorOpen); not in PROPS (RoomDecor draws it). 20x60 cells.
export const DOOR_AJAR: Grid = [
  "....................",
  "..................66",
  "................WW66",
  "..............WWWW66",
  "............WWWWWW66",
  "..........WWWWWWww66",
  "........WWWWWWWWww66",
  "......WWWWWWxxWWww66",
  "....WWWWWWxxxxWWww66",
  "..wwWWWWxxxxxxWWww66",
  "::wwWWxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxmmww66",
  "::wwxxxxxxxxxxmmww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww66",
  "::wwxxxxxxxxxxWWww77",
  "::wwxxxxxxxxxxWW7777",
  "::wwxxxxxxxxxx7777..",
  "::wwxxxxxxxx7777....",
  "::wwxxxxxx7777......",
  "::wwxxxx7777........",
  "::wwxx7777..........",
  "::ww7777............",
  "::7777..............",
  "7777................",
  "77..................",
];

// Counter along the back-right wall: wood top, plastic cabinet doors, metal handles. 47x45 cells.
export const COUNTER: Grid = [
  "...............................................",
  "...............................................",
  "...............................................",
  "...............................................",
  "............::.................................",
  "...........:wwww...............................",
  "........:::wwwwwww.............................",
  ".......:wwwwwwwwwwww...........................",
  "....:::wwwwwwwwwwwwwww.........................",
  "...:wwwwwwwwwwwwwwwwwwww.......................",
  ".::wwwwwwwwwwwwwwwwwwwwwww.....................",
  ".Wg:wwwwwwwwwwwwwwwwwwwwwwww...................",
  ".gWWW::wwwwwwwwwwwwwwwwwwwwwww.................",
  ".ggggWg:wwwwwwwwwwwwwwwwwwwwwwww...............",
  ".gggggWWW::wwwwwwwwwwwwwwwwwwwwwww.............",
  ".gg==ggggWg:wwwwwwwwwwwwwwwwwwwwwwww...........",
  ".gg8g==gggWWW::wwwwwwwwwwwwwwwwwwwwwww.........",
  ".gg8ggg==ggggWg:wwwwwwwwwwwwwwwwwwwwwwww.......",
  ".gg8ggggg==gggWWW::wwwwwwwwwwwwwwwwwwwwwww.....",
  ".gg8ggggggg==ggggWg:wwwwwwwwwwwwwwwwwwwwwwww...",
  ".gg8ggggggggg==gggWWW::wwwwwwwwwwwwwwwwwwwwwww.",
  ".gg8ggggggggggg==ggggWg:wwwwwwwwwwwwwwwwwwww8W.",
  ".gg8gggggggggggg8x=gggWWW::wwwwwwwwwwwwwwwWWW8.",
  ".gg8gggggggggggg8x8==ggggWg:wwwwwwwwwwww8W8888.",
  ".gg8gggggggggggg8x8gg==gggWWW::wwwwwwwWWW88888.",
  ".gg8ggggggggggg~8x8gggg==ggggWg:wwww8W88888888.",
  ".gg8ggggggggggg~8x8gggggg==gggWWW:WWW888888888.",
  ".xggggggggggggg~8x8~ggggggg==ggggW888888888888.",
  ".gxxxggggggggggg8x8~ggggggggg==gg8888888888888.",
  "...ggxgggggggggg8x8~ggggggggggg=g8888888888888.",
  ".....gxxxggggggg8x8gggggggggggg8g8888888888888.",
  ".......ggxgggggg8x8gggggggggggg8g8888888888888.",
  ".........gxxxggg8x8gggggggggggg8g8888888888888.",
  "...........ggxgggx8gggggggggggg8g8888888888888.",
  ".............gxxxgggggggggggggg8g8888888888888.",
  "...............ggxggggggggggggg8g8888888888888.",
  ".................gxxxgggggggggg8g8888888888888.",
  "...................ggxggggggggg8g888888888888x.",
  ".....................gxxxgggggg8g888888888xxx8.",
  ".......................ggxggggg8g88888888x88...",
  ".........................gxxxgg8g88888xxx8.....",
  "...........................ggxggg8888x88.......",
  ".............................gxxx8xxx8.........",
  "...............................ggx88...........",
  ".................................8.............",
];

// Coffee machine: plastic body, metal tank, lit button, a cup under the spout. 20x26 cells.
export const COFFEE_MACHINE: Grid = [
  "..........~.........",
  "........~~~~~.......",
  "......~~~~~~~~~.....",
  "....==mm~~~~~~~~~...",
  "..====mmmm~~~~~77...",
  "======mmmmmm~7777...",
  "gg======mmmm77777==.",
  "gggg======mm777==88.",
  "gggggg======7==8888.",
  "ggggg~g!=====888888.",
  "ggggggggcg=88888888.",
  "gggggggggg888888888.",
  "ggx7gggggg888888888.",
  "ggx777gggg888888888.",
  "ggxxx777gg888888888.",
  "ggxxxxx7xg888888888.",
  "ggxx~mxxxg888888888.",
  "ggxxmMxxxg888888888.",
  "ggxxMMxxxg888888888.",
  "gg7gxxxxxg888888888.",
  "ggg777xxxg888888888.",
  "..gggg7gxg888888888.",
  "....ggg77g8888888...",
  "......gggg88888.....",
  "........gg888.......",
  "..........8.........",
];

// Counter with the machine and paper cups on top, as placed in the room. 47x61 cells.
export const COFFEE_STATION: Grid = [
  "...............................................",
  "...............................................",
  "...............................................",
  "...............................................",
  "...............................................",
  "...............................................",
  "...............................................",
  "...............................................",
  "...............................................",
  "...............................................",
  ".................................~.............",
  "...............................~~~~~...........",
  ".............................~~~~~~~~~.........",
  "...........................==mm~~~~~~~~~.......",
  ".........................====mmmm~~~~~77.......",
  ".......................======mmmmmm~7777.......",
  ".......................gg======mmmm77777==.....",
  ".......................gggg======mm777==88.....",
  ".......................gggggg======7==8888.....",
  ".......................ggggg~g!=====888888.....",
  "............::.........ggggggggcg=88888888.....",
  "...........:wwww.......gggggggggg888888888.....",
  "........:::wwwwwww.....ggx7gggggg888888888.....",
  ".......:wwwwwwwwwwww...ggx777gggg888888888.....",
  "....:::wwwwwwwwwwwwwww.ggxxx777gg888888888.....",
  "...:wwwwwwwwwwwwwwwwwwwggxxxxx7xg888888888.....",
  ".::wwwwwwwwwfffwwwwwwwwggxx~mxxxg888888888.....",
  ".Wg:wwwwwwwwfFfwwwwwwwwggxxmMxxxg888888888.....",
  ".gWWW::wwwwwfFfwwwwwwwwggxxMMxxxg888888888.....",
  ".ggggWg:wwwwFFFwfffwwwwgg7gxxxxxg888888888.....",
  ".gggggWWW::wwwwwfFfwwwwggg777xxxg888888888.....",
  ".gg==ggggWg:wwwwFFFwwwwwwgggg7gxg888888888.....",
  ".gg8g==gggWWW::wwwwwwwwwwwwggg77g8888888.......",
  ".gg8ggg==ggggWg:wwwwwwwwwwwwwgggg88888ww.......",
  ".gg8ggggg==gggWWW::wwwwwwwwwwwwgg888wwwwww.....",
  ".gg8ggggggg==ggggWg:wwwwwwwwwwwww8wwwwwwwwww...",
  ".gg8ggggggggg==gggWWW::wwwwwwwwwwwwwwwwwwwwwww.",
  ".gg8ggggggggggg==ggggWg:wwwwwwwwwwwwwwwwwwww8W.",
  ".gg8gggggggggggg8x=gggWWW::wwwwwwwwwwwwwwwWWW8.",
  ".gg8gggggggggggg8x8==ggggWg:wwwwwwwwwwww8W8888.",
  ".gg8gggggggggggg8x8gg==gggWWW::wwwwwwwWWW88888.",
  ".gg8ggggggggggg~8x8gggg==ggggWg:wwww8W88888888.",
  ".gg8ggggggggggg~8x8gggggg==gggWWW:WWW888888888.",
  ".xggggggggggggg~8x8~ggggggg==ggggW888888888888.",
  ".gxxxggggggggggg8x8~ggggggggg==gg8888888888888.",
  "...ggxgggggggggg8x8~ggggggggggg=g8888888888888.",
  ".....gxxxggggggg8x8gggggggggggg8g8888888888888.",
  ".......ggxgggggg8x8gggggggggggg8g8888888888888.",
  ".........gxxxggg8x8gggggggggggg8g8888888888888.",
  "...........ggxgggx8gggggggggggg8g8888888888888.",
  ".............gxxxgggggggggggggg8g8888888888888.",
  "...............ggxggggggggggggg8g8888888888888.",
  ".................gxxxgggggggggg8g8888888888888.",
  "...................ggxggggggggg8g888888888888x.",
  ".....................gxxxgggggg8g888888888xxx8.",
  ".......................ggxggggg8g88888888x88...",
  ".........................gxxxgg8g88888xxx8.....",
  "...........................ggxggg8888x88.......",
  ".............................gxxx8xxx8.........",
  "...............................ggx88...........",
  ".................................8.............",
];

// Floor plant in a plastic pot, tall leaves. 16x22 cells.
export const PLANT_TALL: Grid = [
  "....%...........",
  "....%e......e...",
  ".....ee....eE...",
  "..e...eE..eE....",
  "..ee..eE.eE.....",
  "...ee.eEeE....e.",
  ".%..eeeEeE...eE.",
  ".%e..eeEE...eE..",
  "..ee.%eEe..eE...",
  "...eeeeE9eeE....",
  "....%ee9eEE.....",
  ".....e9e9E......",
  "......999.......",
  "...=ggggggggG...",
  "..=g66666666g8..",
  "..=gggggggggG8..",
  "...=gggggggG8...",
  "...=gggggggG8...",
  "...=gggggggG8...",
  "....=ggggggG....",
  "....=ggggggG....",
  ".....888888.....",
];

// Floor plant in a plastic pot, round bush. 18x17 cells.
export const PLANT_BUSH: Grid = [
  "......%%ee........",
  "....%%eeeeEe......",
  "...%eeeeeeeeEE....",
  "..%eeEeeeeEeeeE...",
  "..eeeeeEeeeeeEE9..",
  ".%eeEeeeeeEeeeE9..",
  ".eeeeeeEeeeeEEE9..",
  ".eeEeeeeeeEeeE99..",
  "..eeeeEeeeEEE99...",
  "..9eEeeeEEE9999...",
  "...99EEE99999.....",
  "....=gggggggG.....",
  "...=g6666666g8....",
  "...=ggggggggG8....",
  "....=gggggggG.....",
  "....=gggggggG.....",
  ".....8888888......",
];

// Water dispenser against the back-right wall: a tall jug with a water-surface line, a meniscus and
// one refraction band, over a lit cabinet top face and a drip tray, sheared down to the right by
// whole cells at the wall slope like the counter (a column pair drops a row for every two across).
// The jug column's bottom is at the middle column. 16x36 cells.
export const DISPENSER: Grid = [
  "................",
  "................",
  "................",
  "......==........",
  "....!!==gg......",
  "..!!!!GGgg......",
  "..!!!!GGGG......",
  "..!!!!!!GGCC....",
  "..!!cc!!!!CC....",
  "..!!cccc!!!!....",
  "..!!cccccc!!!!..",
  "..!!ccccccCC!!..",
  "..!!!!ccccCC88..",
  "..!!!!!!ccCC88..",
  "..!!cc!!!!CC88..",
  "..==cccc!!!!88..",
  "====ggcccc!!88..",
  "====ggggccCC88..",
  "======ggggCC88..",
  "==gg====gggg88..",
  "==gg~~====gg88..",
  "==gg~~gg====88..",
  "~~ggmmgggg====..",
  "~~~~mmgggg~~==GG",
  "~~~~~~gggg~~ggGG",
  "~~mm~~~~ggmmggGG",
  "88mmmm~~~~mmggGG",
  "8888mmmm~~~~ggGG",
  "888888mmmm~~~~GG",
  "..888888mmmm~~~~",
  "....888888mmmm~~",
  "......888888mm77",
  "........88888877",
  "..........888888",
  "............8888",
  "..............88",
];

// Two bubbles in the jug; CSS steps them up and fades them (.gurgle). 4x4 cells.
export const GURGLE: Grid = ["!!..", "!!..", "..!!", "..!!"];

// Contact shadows on the floor under the dispenser and the counter: the figure ground shadow's
// '_' cells (drawn at SHADOW_OPACITY under the prop), a flat band sheared at the wall slope, 2 cells
// across to a row down, 2 cells thick at the ends and 3 between. Not in PROPS: the room and the
// dev sheet draw them with PixelShadow, at PROP_SHADOW_AT cells from the prop's top-left.
/**
 * A shadow band of `rows` x `cols` '_' cells: column x holds `thick(x)` cells from row `top(x)` down
 * (a flat band at the wall slope, one row per two columns, 2 cells thick).
 */
const shadowBand = (
  rows: number,
  cols: number,
  top: (x: number) => number,
  thick: (x: number) => number = () => 2,
): Grid =>
  Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x) => (y >= top(x) && y < top(x) + thick(x) ? "_" : ".")).join(
      "",
    ),
  );
// Descending bands (the right wall's slope), 3 thick between the 2-thick ends.
const descending = (rows: number, cols: number): Grid =>
  shadowBand(
    rows,
    cols,
    (x) => Math.floor(x / 2),
    (x) => (x >= 4 && x < cols - 4 ? 3 : 2),
  );
export const DISPENSER_SHADOW: Grid = descending(9, 16);
export const COFFEE_SHADOW: Grid = descending(18, 34);

// Left-wall dressing, drawn flat then sheared onto the wall like the window (decor.ts windowShear):
// column x rises by cols/2 - 1 - floor(x / 2) rows less than column 0, so the base climbs one row
// per two columns to the right. Every flat feature is pair-aligned (even start, even width and
// height) so the shear leaves no run under 2 cells. Light top left: the top and left of a frame are
// the lit wood, the right and bottom the deep wood.
function shearedLeft(flat: string[][]): Grid {
  const cols = flat[0].length;
  const rise = cols / 2 - 1;
  const out = Array.from({ length: flat.length + rise }, () => Array<string>(cols).fill("."));
  flat.forEach((row, y) =>
    row.forEach((c, x) => {
      if (c !== ".") out[y + rise - Math.floor(x / 2)][x] = c;
    }),
  );
  return out.map((row) => row.join(""));
}

function framed(cols: number, rows: number, fill: string): string[][] {
  const g = Array.from({ length: rows }, () => Array<string>(cols).fill(fill));
  const paint = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g[y][x] = c;
  };
  paint(0, 2, 2, rows - 2, ":");
  paint(cols - 2, 2, cols, rows - 2, "6");
  paint(0, 0, cols, 2, ":");
  paint(0, rows - 2, cols, rows, "6");
  return g;
}

// Bookshelf, 20x39 cells (a flat 20x30 frame sheared 9 rows): wood frame, three shelves of books
// against a shaded back panel. Books are 2-cell-wide bars of a given token and height (even cells),
// standing on their board; null is a gap. The runs are irregular on purpose: no repeat of the same
// width and color with a period of 3 or less across 4 books (art.test.ts), nothing that reads as
// lettering.
export const BOOKSHELF_BOOKS: readonly (readonly ([string, number] | null)[])[] = [
  [["e", 8], ["m", 6], ["p", 8], null, ["c", 4], ["o", 6], ["g", 8], ["E", 4]],
  [["P", 6], ["o", 8], null, ["e", 6], ["g", 4], ["c", 8], ["m", 4], ["p", 6]],
  [["M", 6], ["c", 4], ["e", 6], ["o", 4], null, ["p", 6], ["g", 4], ["m", 6]],
];
// Interior row spans (top, bottom exclusive) of the three shelves, between the boards.
const SHELF_SPANS = [
  [2, 10],
  [12, 20],
  [22, 28],
] as const;
export const BOOKSHELF: Grid = (() => {
  const g = framed(20, 30, "W");
  for (const y of [10, 20]) for (let x = 2; x < 18; x++) g[y][x] = g[y + 1][x] = "w";
  BOOKSHELF_BOOKS.forEach((books, i) => {
    const bottom = SHELF_SPANS[i][1];
    books.forEach((book, k) => {
      if (!book) return;
      const [c, h] = book;
      for (let y = bottom - h; y < bottom; y++) g[y][2 + k * 2] = g[y][3 + k * 2] = c;
    });
  });
  return shearedLeft(g);
})();

// Two small abstract pictures, a wood frame round 2 or 3 flat blocks of art tokens. 14x22 and 12x19.
const picture = (
  cols: number,
  rows: number,
  blocks: [number, number, number, number, string][],
) => {
  const g = framed(cols, rows, "w");
  for (const [x0, y0, x1, y1, c] of blocks)
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g[y][x] = c;
  return shearedLeft(g);
};
export const PICTURE_A: Grid = picture(14, 16, [
  [2, 2, 8, 14, "c"],
  [8, 2, 12, 8, "o"],
  [8, 8, 12, 14, "g"],
]);
export const PICTURE_B: Grid = picture(12, 14, [
  [2, 2, 10, 8, "e"],
  [2, 8, 6, 12, "p"],
  [6, 8, 10, 12, "m"],
]);

// Date variants (decor.ts decorVariantFor): the same grids with their art colors rotated through
// the six art tokens, a letter and its shaded capital together. A rotation is a permutation, so
// equal cells stay equal and different ones stay different: shapes, runs and rhythm do not change.
const ART_LETTERS = "cogemp";
const variantCache = new Map<string, Grid>();
export function decorVariantGrid(
  name: "BOOKSHELF" | "PICTURE_A" | "PICTURE_B",
  variant: number,
): Grid {
  // Any non-integer reads as 0, the rest wrap into 0..2 (the DECOR_VARIANTS in decor.ts).
  const v = Number.isInteger(variant) ? ((variant % 3) + 3) % 3 : 0;
  const key = `${name}:${v}`;
  let grid = variantCache.get(key);
  if (!grid) {
    const shift = (v * 2) % ART_LETTERS.length;
    const map = (c: string) => {
      const i = ART_LETTERS.indexOf(c.toLowerCase());
      if (i < 0) return c;
      const to = ART_LETTERS[(i + shift) % ART_LETTERS.length];
      return c === c.toLowerCase() ? to : to.toUpperCase();
    };
    grid = PROPS[name].map((row) => [...row].map(map).join(""));
    variantCache.set(key, grid);
  }
  return grid;
}

// The shelf's contact shadow: '_' cells, a flat band rising to the right with the left wall's base
// (one row per two columns, 2 cells thick), starting at the shelf's base row.
export const BOOKSHELF_SHADOW: Grid = shadowBand(11, 20, (x) => 9 - Math.floor(x / 2));

/** The contact shadow grid under each wall prop that has one, and where it sits from the prop's top-left. */
export const SHADOWS = {
  DISPENSER: DISPENSER_SHADOW,
  COFFEE_STATION: COFFEE_SHADOW,
  BOOKSHELF: BOOKSHELF_SHADOW,
} as const;
export const PROP_SHADOW_AT = {
  DISPENSER: [0, 29],
  COFFEE_STATION: [0, 45],
  BOOKSHELF: [0, 39],
} as const;

// The sheet a subagent carries and hands over. 7x10 cells.
export const PAPER: Grid = [
  "fffff..",
  "fFFFfff",
  "fffffff",
  "fFFFFFf",
  "fffffff",
  "fFFFFff",
  "fffffff",
  "fFFFfff",
  "fffffff",
  ".FFFFFF",
];

// The sheet as it lies on a desk: PAPER drawn smaller and skewed to the desk-top slope (a column
// pair drops a row for every two across), two-cell text lines. Fits desk-kinds paperSlot. 6x7 cells.
export const PAPER_DESK: Grid = [
  "ff....",
  "ffff..",
  "ffffff",
  "fFFFFf",
  "fFFFFf",
  "..ffff",
  "....ff",
];

// A subagent's own devices, as they lie on its desk: skewed to the desk-top slope (a row drop for
// every two cells across), no line under two cells. Each has a lit screen (working), a half-lit
// one (waiting on subagents, the plain screen blue) and a dark one. They fit desk-kinds deviceSlot.
// Laptop: a three-row lid over a two-row metal base, 12x5 cells. Tablet: a bare slab, 8x3 cells.
// Every line is two cells thick both ways, bar the two end columns of a row, which are the slope.
const device = (rows: Grid, screen: string): Grid => rows.map((r) => r.replaceAll("S", screen));
const LAPTOP: Grid = [
  "SSSSSS......",
  "..SSSSSS....",
  "....SSSSSS..",
  "..mmmmmmmm..",
  "....mmmmmmmm",
];
const TABLET: Grid = ["SSSS....", "..SSSS..", "....SSSS"];
export const LAPTOP_LIT: Grid = device(LAPTOP, "!");
export const LAPTOP_HALF: Grid = device(LAPTOP, "c");
export const LAPTOP_DARK: Grid = device(LAPTOP, "7");
export const TABLET_LIT: Grid = device(TABLET, "!");
export const TABLET_HALF: Grid = device(TABLET, "c");
export const TABLET_DARK: Grid = device(TABLET, "7");

// Wall clock face with its hour marks, drawn flat 12x12 then sheared down to the right by whole
// cells at the wall slope (decor.ts, so it matches the counter and door). The hands are drawn
// over it by RoomDecor from the real time. 12x18 cells.
export const CLOCK: Grid = [
  "............",
  "............",
  "..l.l.......",
  ".lwlwll.....",
  "llwwfwwl....",
  "lwfffllwl...",
  "lwlffllfwl..",
  "lwllfffffwl.",
  ".wflfffffwl.",
  ".lwffffflfw.",
  ".lwfffffllwl",
  "..lwfllfflwl",
  "...lwllfffwl",
  "....lwwfwwll",
  ".....llwlwl.",
  ".......l.l..",
  "............",
  "............",
];

// Steam wisp over the coffee machine, light plastic, drifts up under CSS. 8x10 cells.
export const STEAM: Grid = [
  "..=.....",
  ".==.....",
  ".=......",
  "..==....",
  "...=....",
  "..==....",
  ".==.....",
  ".=......",
  "..=.....",
  "........",
];

export const PROPS = {
  DOOR,
  COUNTER,
  COFFEE_MACHINE,
  COFFEE_STATION,
  PLANT_TALL,
  PLANT_BUSH,
  PAPER,
  PAPER_DESK,
  CLOCK,
  STEAM,
  DISPENSER,
  GURGLE,
  BOOKSHELF,
  PICTURE_A,
  PICTURE_B,
  LAPTOP_LIT,
  LAPTOP_HALF,
  LAPTOP_DARK,
  TABLET_LIT,
  TABLET_HALF,
  TABLET_DARK,
} as const;
export type PropName = keyof typeof PROPS;

// Drawn size in px; PixelProp in CharacterRig.tsx renders the grid.
export function propSize(name: PropName) {
  return { width: PROPS[name][0].length * CELL, height: PROPS[name].length * CELL };
}
