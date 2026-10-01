import { memo, useMemo, type CSSProperties } from "react";
import { HAIR, SKIN } from "./appearance";
import { ART } from "./palette";
import {
  CELL,
  CELLS,
  FRAME_COLS,
  FRAME_ROWS,
  PAPER_FILL,
  SHADOW_OPACITY,
  parseGrid,
  type Grid,
  type Run,
} from "./pixel";
import { shirtFor, shirtVars, type Pose } from "./poses";
import { PROPS, propSize, type PropName } from "./props";
import {
  DESK,
  DESK_DIM,
  FRAME_VIEW,
  FRAMES,
  HAIRSTYLES,
  HEADPHONES,
  HEAD_ANCHOR,
  SHADOW,
  SHADOW_AT,
  type FrameName,
} from "./sprites";

// 32x48 cells at 2 px: a 64x96 box, foot origin (32, 96). See "Character geometry" in DESIGN.md.
export const RIG_WIDTH = FRAME_COLS * CELL;
export const RIG_HEIGHT = FRAME_ROWS * CELL;

// Every state pose, plus the plain standing pose of a subagent beside its parent's desk.
export type RigPose = Pose | "standing";
export type HairToken = Extract<keyof typeof ART, `--hair-${string}`>;
export type SkinToken = Extract<keyof typeof ART, `--skin-${string}`>;

export type CharacterRigProps = {
  pose: RigPose;
  shirt: number | null | undefined;
  stripe: boolean;
  carryPaper?: boolean;
  mirror?: boolean;
  walkFrame?: 0 | 1;
  // Index into HAIRSTYLES; any integer seed works, it wraps.
  hairStyle?: number;
  hair?: HairToken;
  skin?: SkinToken;
};

// Every art token as a style object, so each root resolves its own var(--x) without a wrapper.
// palette.ts stays the only place with hex values.
const ART_VARS = ART as unknown as CSSProperties;
// palette.ts is the single theming point, so every token is hard-set here.
const STATIC_STYLE: CSSProperties = { overflow: "visible", ...ART_VARS };

// Parsed runs per grid and offset: the grids never change, so each is parsed once.
const RUNS = new WeakMap<Grid, Map<string, Run[]>>();

function runsFor(grid: Grid, dx: number, dy: number): Run[] {
  let byOffset = RUNS.get(grid);
  if (!byOffset) RUNS.set(grid, (byOffset = new Map()));
  const key = `${dx},${dy}`;
  let runs = byOffset.get(key);
  if (!runs) byOffset.set(key, (runs = parseGrid(grid, dx, dy)));
  return runs;
}

const Cells = memo(function Cells({
  grid,
  dx = 0,
  dy = 0,
  skip,
}: {
  grid: Grid;
  dx?: number;
  dy?: number;
  skip?: string;
}) {
  return (
    <g shapeRendering="crispEdges">
      {runsFor(grid, dx, dy)
        .filter((r) => CELLS[r.c].fill !== skip)
        .map((r) => {
          const cell = CELLS[r.c];
          const box = { x: r.x * CELL, y: r.y * CELL, width: r.w * CELL, height: CELL };
          return (
            <g key={`${r.x},${r.y}`}>
              <rect {...box} fill={cell.fill} />
              {cell.overlay && <rect {...box} fill={cell.overlay} opacity={cell.opacity} />}
            </g>
          );
        })}
    </g>
  );
});

function frameFor(pose: RigPose, walkFrame: 0 | 1): FrameName {
  if (pose === "seated-typing") return "SEATED_TYPING";
  if (pose === "seated-raised-hand") return "SEATED_RAISED";
  if (pose === "seated-idle") return "SEATED_IDLE";
  if (pose === "standing") return "STANDING";
  if (pose === "standing-mug") return "STANDING_MUG";
  return walkFrame === 0 ? "WALK_A" : "WALK_B";
}

function hairStyleFor(index: number) {
  const n = HAIRSTYLES.length;
  return HAIRSTYLES[Number.isInteger(index) ? ((index % n) + n) % n : 0];
}

export const CharacterRig = memo(function CharacterRig({
  pose,
  shirt,
  stripe,
  carryPaper = false,
  mirror = false,
  walkFrame = 0,
  hairStyle = 0,
  hair: hairProp = "--hair-1",
  skin: skinProp = "--skin-2",
}: CharacterRigProps) {
  const hair = HAIR.includes(hairProp) ? hairProp : "--hair-1";
  const skin = SKIN.includes(skinProp) ? skinProp : "--skin-2";
  const known = shirtFor(shirt);
  const frame = frameFor(pose, walkFrame);
  const view = FRAME_VIEW[frame];
  const [hx, hy] = HEAD_ANCHOR[frame];
  const style = hairStyleFor(hairStyle);
  const rootStyle = useMemo(
    () => ({
      ...STATIC_STYLE,
      ...shirtVars(shirt, stripe),
      "--hair": `var(${hair})`,
      "--skin": `var(${skin})`,
    }),
    [shirt, stripe, hair, skin],
  );
  return (
    <svg
      data-shirt={known ? known.name : "unknown"}
      data-pose={pose}
      data-frame={frame}
      data-hair-style={style.name}
      width={RIG_WIDTH}
      height={RIG_HEIGHT}
      viewBox={`0 0 ${RIG_WIDTH} ${RIG_HEIGHT}`}
      aria-hidden="true"
      focusable="false"
      style={rootStyle}
    >
      <g data-part="shadow" opacity={SHADOW_OPACITY}>
        <Cells grid={SHADOW} dx={SHADOW_AT[0]} dy={SHADOW_AT[1]} />
      </g>
      <g transform={mirror ? `translate(${RIG_WIDTH} 0) scale(-1 1)` : undefined}>
        <Cells grid={FRAMES[frame]} skip={carryPaper ? undefined : PAPER_FILL} />
        <Cells grid={style[view]} dx={hx} dy={hy} />
        <Cells grid={HEADPHONES[view]} dx={hx} dy={hy} />
      </g>
    </svg>
  );
});

export const DESK_WIDTH = DESK[0].length * CELL;
export const DESK_HEIGHT = DESK.length * CELL;

// The monitor is lit only while the agent works (DESIGN.md "State to look").
export const PixelDesk = memo(function PixelDesk({ lit = true }: { lit?: boolean }) {
  return (
    <svg
      width={DESK_WIDTH}
      height={DESK_HEIGHT}
      viewBox={`0 0 ${DESK_WIDTH} ${DESK_HEIGHT}`}
      aria-hidden="true"
      focusable="false"
      style={STATIC_STYLE}
    >
      <Cells grid={lit ? DESK : DESK_DIM} />
    </svg>
  );
});

export const PixelProp = memo(function PixelProp({ name }: { name: PropName }) {
  const { width, height } = propSize(name);
  return (
    <svg
      data-prop={name}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
      style={STATIC_STYLE}
    >
      <Cells grid={PROPS[name]} />
    </svg>
  );
});
