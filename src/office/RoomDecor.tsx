// RoomDecor: <RoomDecor shell door coffee now scene [clock] [doorOpen]/> the door (ajar while `doorOpen`),
// clock, windows, bookshelf and pictures, plants, steam, coffee station and water dispenser, and the
// contact shadows under the shelf, counter and dispenser.
// Everything on the walls and floor that is not the room shell, the desks or the people.
import { Fragment, memo, useState, type CSSProperties, type ReactNode } from "react";
import { PixelProp } from "./CharacterRig";
import {
  CLOCK_ROWS,
  CLOCK_FACE,
  clockHandCells,
  clockHands,
  decorVariantAt,
  windowArt,
  type GlassToken,
  type WindowScene,
} from "./decor";
import { ART, FLOOR_LIGHT_OPACITY, GLASS } from "./palette";
import { CELL, CELLS, parseGrid, SHADOW_OPACITY, type Grid, type Run } from "./pixel";
import {
  DOOR_AJAR,
  decorVariantGrid,
  PROP_SHADOW_AT,
  propSize,
  SHADOWS,
  type PropName,
} from "./props";
import {
  WINDOW_COLS,
  WINDOW_ROWS,
  wallPropRect,
  type WALL_ANCHOR,
  type PlacedWindow,
  type RoomShell as RoomShellGeometry,
} from "./room";
import type { Point } from "./scene-model";

/** The door and the counter are drawn for their wall: upright, base anchor on the wall (room.ts). */
function wallProp(at: Point, name: keyof typeof WALL_ANCHOR, zIndex: number): CSSProperties {
  const r = wallPropRect(name, at);
  return { left: r.left, top: r.top, zIndex };
}

/** One grid's svg box: `data` are its data-* attributes; the children draw the cells. */
function GridSvg({
  grid,
  data,
  children,
}: {
  grid: Grid;
  data: Record<string, string | number>;
  children: ReactNode;
}) {
  return (
    <svg
      {...data}
      width={grid[0].length * CELL}
      height={grid.length * CELL}
      viewBox={`0 0 ${grid[0].length} ${grid.length}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", overflow: "visible" }}
    >
      {children}
    </svg>
  );
}

/** A grid's runs, parsed once per key (the decor grids never change after the first render). */
const runsCache = new Map<string, Run[]>();
function runsOfGrid(key: string, grid: Grid): Run[] {
  let runs = runsCache.get(key);
  if (!runs) {
    runs = parseGrid(grid);
    runsCache.set(key, runs);
  }
  return runs;
}

/** The door ajar (props.ts DOOR_AJAR): the same box and anchor as the PixelProp DOOR, so it swaps in place. */
export const PixelDoorAjar = memo(function PixelDoorAjar() {
  return (
    <GridSvg grid={DOOR_AJAR} data={{ "data-prop": "DOOR_AJAR" }}>
      <Layer runs={runsOfGrid("DOOR_AJAR", DOOR_AJAR)} legend={{}} />
    </GridSvg>
  );
});

/** The bookshelf or a picture in a date variant's colors (props.ts decorVariantGrid); the same box as the PixelProp. */
export const PixelDecor = memo(function PixelDecor({
  name,
  variant,
}: {
  name: "BOOKSHELF" | "PICTURE_A" | "PICTURE_B";
  variant: number;
}) {
  const grid = decorVariantGrid(name, variant);
  return (
    <GridSvg grid={grid} data={{ "data-prop": name, "data-decor-variant": variant }}>
      <Layer runs={runsOfGrid(`${name}:${variant}`, grid)} legend={{}} />
    </GridSvg>
  );
});

const shadowPaths = new Map<string, string>();

/** The contact shadow cells under a wall prop (props.ts SHADOWS): one path at the ground shadow's opacity. */
export const PixelShadow = memo(function PixelShadow({ name }: { name: keyof typeof SHADOWS }) {
  const grid = SHADOWS[name];
  let d = shadowPaths.get(name);
  if (d === undefined) {
    d = parseGrid(grid).map(runPath).join("");
    shadowPaths.set(name, d);
  }
  return (
    <GridSvg grid={grid} data={{ "data-shadow": name }}>
      <path d={d} fill="var(--art-shade)" opacity={SHADOW_OPACITY} />
    </GridSvg>
  );
});

/** The two flat tones of the floor fan the open door throws (props.ts doorLight): near at the floor light's opacity, far at half. */
export function DoorLight({
  doorLight,
  fill,
  origin = { x: 0, y: 0 },
  sceneId,
}: {
  doorLight: { near: Point[]; far: Point[] };
  fill: string;
  /** Subtracted from every point (the art sheet draws the fan in its own box). */
  origin?: Point;
  sceneId?: string;
}) {
  return (
    <>
      {(["near", "far"] as const).map((tone) => (
        <polygon
          key={tone}
          data-part="door-light"
          data-tone={tone}
          data-window-scene={sceneId}
          points={doorLight[tone].map((p) => `${p.x - origin.x},${p.y - origin.y}`).join(" ")}
          fill={fill}
          opacity={tone === "near" ? FLOOR_LIGHT_OPACITY : FLOOR_LIGHT_OPACITY / 2}
        />
      ))}
    </>
  );
}

/** A wall prop's shadow: under the prop (same wall point, lower z-index), on the floor in front of its base. */
function wallShadow(at: Point, name: keyof typeof SHADOWS): CSSProperties {
  const r = wallPropRect(name, at);
  const [dx, dy] = PROP_SHADOW_AT[name];
  return { left: r.left + dx * CELL, top: r.top + dy * CELL, zIndex: 1 };
}

/** A prop centered on `at`, hung on a wall (the clock). */
function hungProp(at: Point, name: PropName, zIndex: number): CSSProperties {
  const { width, height } = propSize(name);
  return { left: at.x - width / 2, top: at.y - height / 2, zIndex };
}

/** A prop standing on the floor, bottom center at `at`; it sorts by its feet like the desks. */
function floorProp(at: Point, name: PropName): CSSProperties {
  const { width, height } = propSize(name);
  return { left: at.x - width / 2, top: at.y - height, zIndex: Math.round(at.y) };
}

/** The clock face with its hands at the real local time of `now`; the dev style sheet draws it too. */
export function Clock({ now, clock }: { now: number; clock?: () => number }) {
  // The second hand's CSS loop starts at the real second once, at mount; later ticks leave it be.
  // Read the clock itself (the scene's injected one): `now` can be a 15 s tick old.
  const [secondDelay] = useState(() => -clockHands((clock ?? Date.now)()).second / 6);
  return (
    <>
      <PixelProp name="CLOCK" />
      <svg
        width={CLOCK_FACE * CELL}
        height={CLOCK_ROWS * CELL}
        viewBox={`0 0 ${CLOCK_FACE} ${CLOCK_ROWS}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
        focusable="false"
        style={{ position: "absolute", left: 0, top: 0 }}
      >
        {clockHandCells(now).map((c) => (
          <rect key={`${c.x},${c.y}`} x={c.x} y={c.y} width={1} height={1} fill="var(--outline)" />
        ))}
      </svg>
      <span className="clock-second">
        <i className="clock-hand" style={{ animationDelay: `${secondDelay}s` }} />
      </span>
    </>
  );
}

/** The frame cells' own tokens; a window root sets these and its scene's glass tokens, no others. */
const FRAME_VARS = {
  "--wood": ART["--wood"],
  "--metal": ART["--metal"],
  "--outline": ART["--outline"],
  "--art-shade": ART["--art-shade"],
};

/** One run as a path segment (a one-cell-tall rectangle). */
const runPath = (r: Run) => `M${r.x} ${r.y}h${r.w}v1h${-r.w}z`;
const pathOf = (runs: Run[]) => runs.map(runPath).join("");

/** A layer's runs as one path per fill (and per overlay), so a window stays a handful of elements. */
function Layer({ runs, legend }: { runs: Run[]; legend: WindowScene["legend"] }) {
  const fills = new Map<string, string>();
  const overlays = new Map<string, string>();
  for (const r of runs) {
    const glass = legend[r.c];
    const cell = CELLS[r.c];
    if (!glass && !cell) continue;
    const d = runPath(r);
    const fill = glass ? `var(${glass})` : cell.fill;
    fills.set(fill, (fills.get(fill) ?? "") + d);
    if (!glass && cell.overlay) {
      const key = `${cell.overlay}|${cell.opacity}`;
      overlays.set(key, (overlays.get(key) ?? "") + d);
    }
  }
  return (
    <>
      {[...fills].map(([fill, d]) => (
        <path key={fill} d={d} fill={fill} />
      ))}
      {[...overlays].map(([key, d]) => {
        const [fill, opacity] = key.split("|");
        return <path key={key} d={d} fill={fill} opacity={opacity} />;
      })}
    </>
  );
}

/**
 * One wall window of `scene`: sky, drifting clouds, skyline, rain or snow (both clipped to the open
 * panes), then blinds, mullion and frame. Memoized: it redraws only when the scene changes.
 */
export const WindowArt = memo(function WindowArt({
  scene,
  wall,
  name,
  center,
}: {
  scene: WindowScene;
  wall: "left" | "right";
  name: string;
  center: Point;
}) {
  const art = windowArt(scene, wall);
  const glass = Object.fromEntries(
    (Object.values(scene.legend) as GlassToken[]).map((t) => [t, GLASS[t]]),
  );
  const clip = `win-glass-${name.replaceAll(" ", "-")}`;
  const clipped = { clipPath: `url(#${clip})` };
  return (
    <svg
      data-window={name}
      data-window-scene={scene.id}
      data-wall={wall}
      width={WINDOW_COLS * CELL}
      height={WINDOW_ROWS * CELL}
      viewBox={`0 0 ${WINDOW_COLS} ${WINDOW_ROWS}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      style={
        {
          position: "absolute",
          left: center.x - (WINDOW_COLS * CELL) / 2,
          top: center.y - (WINDOW_ROWS * CELL) / 2,
          zIndex: 1,
          overflow: "visible",
          ...FRAME_VARS,
          ...glass,
        } as CSSProperties
      }
    >
      <defs>
        <clipPath id={clip}>
          <path d={pathOf(art.glass)} />
        </clipPath>
      </defs>
      <Layer runs={art.sky} legend={scene.legend} />
      {art.cloud.length > 0 && (
        <g {...clipped}>
          <g className={`win-cloud-${wall}`}>
            <Layer runs={art.cloud} legend={scene.legend} />
          </g>
        </g>
      )}
      <Layer runs={art.skyline} legend={scene.legend} />
      {art.weather.length > 0 && (
        <g {...clipped}>
          <g className={scene.weather === "rain" ? "win-rain" : "win-snow"}>
            <Layer runs={art.weather} legend={scene.legend} />
          </g>
        </g>
      )}
      <Layer runs={art.over} legend={scene.legend} />
    </svg>
  );
});

export function RoomDecor({
  shell,
  door,
  coffee,
  now,
  scene,
  clock,
  doorOpen = false,
}: {
  shell: RoomShellGeometry;
  door: Point;
  coffee: Point;
  now: number;
  scene: WindowScene;
  clock?: () => number;
  /** A subagent is coming or going: the door stands ajar (paper.ts doorOpen). */
  doorOpen?: boolean;
}) {
  const variant = decorVariantAt(now);
  return (
    <>
      {shell.windows.map((w: PlacedWindow) => (
        <WindowArt key={w.name} scene={scene} wall={w.wall} name={w.name} center={w.center} />
      ))}
      {shell.wallDecor.map((d) => (
        <Fragment key={d.name}>
          {d.prop === "BOOKSHELF" && (
            <div style={wallShadow(d.base, d.prop)}>
              <PixelShadow name={d.prop} />
            </div>
          )}
          <div style={wallProp(d.base, d.prop, 2)}>
            <PixelDecor name={d.prop} variant={variant} />
          </div>
        </Fragment>
      ))}
      <div data-door={doorOpen ? "open" : "closed"} style={wallProp(door, "DOOR", 1)}>
        {doorOpen ? <PixelDoorAjar /> : <PixelProp name="DOOR" />}
      </div>
      <div style={hungProp(shell.clock, "CLOCK", 1)}>
        <Clock now={now} clock={clock} />
      </div>
      <div className="sway" style={floorProp(shell.plantTall, "PLANT_TALL")}>
        <PixelProp name="PLANT_TALL" />
      </div>
      <div className="sway" style={floorProp(shell.plantBush, "PLANT_BUSH")}>
        <PixelProp name="PLANT_BUSH" />
      </div>
      <div
        className="steam"
        style={{
          left: wallPropRect("COFFEE_STATION", coffee).left + 58,
          top: wallPropRect("COFFEE_STATION", coffee).top,
          zIndex: 3,
        }}
      >
        <PixelProp name="STEAM" />
      </div>
      <div style={wallShadow(coffee, "COFFEE_STATION")}>
        <PixelShadow name="COFFEE_STATION" />
      </div>
      <div style={wallShadow(shell.dispenser, "DISPENSER")}>
        <PixelShadow name="DISPENSER" />
      </div>
      <div style={wallProp(coffee, "COFFEE_STATION", 2)}>
        <PixelProp name="COFFEE_STATION" />
      </div>
      <div style={wallProp(shell.dispenser, "DISPENSER", 2)}>
        <PixelProp name="DISPENSER" />
        <div className="gurgle" style={{ left: 6 * CELL, top: 4 * CELL }}>
          <PixelProp name="GURGLE" />
        </div>
      </div>
    </>
  );
}
