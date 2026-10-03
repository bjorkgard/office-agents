// Mirrors the "Art palette", "Project shirt palette" and "Glass tokens" tables in DESIGN.md.
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

/** The floor light patch under a window: its glass token at this opacity (the one glass opacity, DESIGN.md Glass tokens). */
export const FLOOR_LIGHT_OPACITY = 0.3;

// Window glass: the sky behind the wall windows, one object apart from ART so no glass colour
// reaches a character, desk or prop root. Every value is at most as bright as --plastic.
export const GLASS = {
  "--glass-dusk-1": "#2a2850",
  "--glass-dusk-2": "#64405e",
  "--glass-dusk-3": "#8a5640",
  "--glass-night-1": "#0f1328",
  "--glass-night-2": "#171d38",
  "--glass-night-3": "#222a4a",
  "--glass-rain-1": "#2c3442",
  "--glass-rain-2": "#394150",
  "--glass-rain-3": "#464f5e",
  "--glass-snow-1": "#38404f",
  "--glass-snow-2": "#464e60",
  "--glass-snow-3": "#545c70",
  "--glass-overcast-1": "#343a49",
  "--glass-overcast-2": "#3f4655",
  "--glass-overcast-3": "#4a5162",
  "--glass-afternoon-1": "#34506e",
  "--glass-afternoon-2": "#546482",
  "--glass-afternoon-3": "#7a5e3e",
  "--glass-skyline": "#10142a",
  "--glass-lit": "#726232",
  "--glass-cloud-dusk": "#6a4a66",
  "--glass-cloud-warm": "#6c5a58",
  "--glass-cloud": "#5a6276",
  "--glass-rain": "#5c687c",
  "--glass-snow": "#626879",
} as const;
