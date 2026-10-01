// Mirrors the "Art palette" and "Project shirt palette" tables in DESIGN.md.
// art.test.ts compares every hex here with DESIGN.md.

export const SHIRTS = [
  { name: "orange", value: "#e69f00", stripe: "#936a0e" },
  { name: "sky", value: "#56b4e9", stripe: "#3c769a" },
  { name: "green", value: "#009e73", stripe: "#66c5ab" },
  { name: "yellow", value: "#f0e442", stripe: "#999336" },
  { name: "blue", value: "#0072b2", stripe: "#66aad1" },
  { name: "vermillion", value: "#d55e00", stripe: "#e69e66" },
  { name: "purple", value: "#cc79a7", stripe: "#e0afca" },
  { name: "light gray", value: "#f2f2f2", stripe: "#9a9ca0" },
] as const;

export const ART = {
  "--skin-1": "#f0d2b8",
  "--skin-2": "#c9a283",
  "--skin-3": "#9b7960",
  "--hair-1": "#8c7258",
  "--hair-2": "#cdb98f",
  "--hair-3": "#b9bfcc",
  "--hair-4": "#a07a6a",
  "--trousers": "#5f6f94",
  "--shoes": "#807670",
  "--wood": "#8f6a48",
  "--metal": "#8c96aa",
  "--plastic": "#626879",
  "--screen": "#4f8fe0",
  "--leaf": "#5f9e4a",
  "--outline": "#e1e6f2",
  "--shirt-unknown": "#8a8f9c",
  "--art-shade": "#000000",
  "--bubble-fill": "#e8ebf2",
  "--bubble-text": "#161a24",
  "--bubble-muted": "#454d63",
} as const;
