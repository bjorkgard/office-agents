import { useState, type CSSProperties, type ReactNode } from "react";
import mockup from "../../docs/designs/mockup-room-variant-a.jpg";
import states from "./art-reference/updated-states.png";
import variantB from "./art-reference/variant-B.png";
import { appearanceFor, HAIR, SKIN } from "./appearance";
import {
  CharacterRig,
  DESK_HEIGHT,
  DESK_WIDTH,
  PixelDesk,
  PixelProp,
  RIG_HEIGHT,
  RIG_WIDTH,
  type CharacterRigProps,
} from "./CharacterRig";
import { ScreenOverlay } from "./DeskLayer";
import { DESK_KINDS, deskKindFor, type DeskKind } from "./desk-kinds";
import { DEVICES, deviceProp, deviceRect, type Device, type DeviceLook } from "./devices";
import { WINDOW_SCENE_IDS, activeOverrides, windowScene, type WindowSceneId } from "./decor";
import { layoutOffice } from "./iso";
import { DESK_CAP } from "../../shared/tuning";
import { Clock, WindowArt } from "./RoomDecor";
import { ART, FLOOR_LIGHT_OPACITY, GLASS, SHIRTS } from "./palette";
import { roomShell, WINDOW_COLS, WINDOW_ROWS } from "./room";
import { CELL } from "./pixel";
import { PROPS, propSize, type PropName } from "./props";
import { HAIRSTYLES, MUG_COL, SEAT_OFFSET, SOLE_ROW } from "./sprites";

const FRAMES: { label: string; props: CharacterRigProps }[] = [
  { label: "seated typing", props: { pose: "seated-typing", shirt: 0, stripe: false } },
  { label: "raised hand", props: { pose: "seated-raised-hand", shirt: 0, stripe: false } },
  { label: "walk A", props: { pose: "walking", shirt: 0, stripe: false, walkFrame: 0 } },
  { label: "walk B", props: { pose: "walking", shirt: 0, stripe: false, walkFrame: 1 } },
  {
    label: "walk, paper (handoff)",
    props: { pose: "walking", shirt: 0, stripe: false, carryPaper: true },
  },
  { label: "seated idle", props: { pose: "seated-idle", shirt: 0, stripe: false } },
  { label: "standing", props: { pose: "standing", shirt: 0, stripe: false } },
  { label: "coffee", props: { pose: "standing-mug", shirt: 0, stripe: false } },
  { label: "water", props: { pose: "standing-cup", shirt: 0, stripe: false } },
];

/** The clock tile's time, read once when the sheet loads. */
const SHEET_NOW = Date.now();
const PROP_NAMES = Object.keys(PROPS) as PropName[];

// Coffee break: the figure stands at the counter's right end, mirrored to face it,
// soles (frame row SOLE_ROW) on the counter's floor line.
const STATION = propSize("COFFEE_STATION");
const MUG_X = MUG_COL * CELL;
const MUG_Y = STATION.height - SOLE_ROW * CELL;
const BREAK_WIDTH = Math.max(STATION.width, MUG_X + RIG_WIDTH);

// Seated figure in front of the desk: SEAT_OFFSET puts the hands on the keyboard.
const SEAT_X = SEAT_OFFSET[0] * CELL;
const SEAT_Y = SEAT_OFFSET[1] * CELL;
const STATION_WIDTH = DESK_WIDTH - SEAT_X;
const STATION_HEIGHT = Math.max(DESK_HEIGHT, SEAT_Y + RIG_HEIGHT);

const SEATED_POSES = ["seated-typing", "seated-raised-hand", "seated-idle"] as const;
type SeatedPose = (typeof SEATED_POSES)[number];

function Workstation({
  pose,
  shirt = 0,
  stripe = true,
  seed,
}: {
  pose: SeatedPose;
  shirt?: number;
  stripe?: boolean;
  seed?: string;
}) {
  return (
    <div style={{ position: "relative", width: STATION_WIDTH, height: STATION_HEIGHT }}>
      <div style={{ position: "absolute", left: -SEAT_X, top: 0 }}>
        <PixelDesk lit={pose === "seated-typing"} />
      </div>
      <div style={{ position: "absolute", left: 0, top: SEAT_Y }}>
        <CharacterRig
          pose={pose}
          shirt={shirt}
          stripe={stripe}
          {...(seed && appearanceFor(seed))}
        />
      </div>
    </div>
  );
}

// A desk with its screen state: live is lit with the scrolling overlay, still is dim with the half overlay.
function ScreenDesk({ kind, screen }: { kind: DeskKind; screen: "off" | "still" | "live" }) {
  return (
    <div style={{ position: "relative", width: DESK_WIDTH, height: DESK_HEIGHT }}>
      <PixelDesk kind={kind} lit={screen === "live"} />
      {screen !== "off" && <ScreenOverlay kind={kind} screen={screen} />}
    </div>
  );
}

const SCREEN_STATES = ["off", "still", "live"] as const;

// A work desk as a subagent sees it: the monitor and the device both show the working state.
const DEVICE_LOOKS = ["dark", "half", "lit"] as const;
const DEVICE_SCREEN = { dark: "off", half: "still", lit: "live" } as const;
function DeviceDesk({ kind, device, look }: { kind: DeskKind; device: Device; look: DeviceLook }) {
  const r = deviceRect(kind, device);
  const screen = DEVICE_SCREEN[look];
  return (
    <div style={{ position: "relative", width: DESK_WIDTH, height: DESK_HEIGHT }}>
      <PixelDesk kind={kind} lit={screen === "live"} />
      {screen !== "off" && <ScreenOverlay kind={kind} screen={screen} />}
      <div style={{ position: "absolute", left: r.x * CELL, top: r.y * CELL }}>
        <PixelProp name={deviceProp(device, look)} />
      </div>
    </div>
  );
}

// 24 working desks and one raised hand at 50%: the attention check (design D3), in color and gray.
function DeskWall({ gray }: { gray: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "flex-end",
        filter: gray ? "grayscale(1)" : undefined,
      }}
    >
      {Array.from({ length: DESK_CAP }, (_, i) =>
        i === 11 ? (
          <Tile
            key={i}
            label="raised hand"
            scale={0.5}
            width={STATION_WIDTH}
            height={STATION_HEIGHT}
          >
            <Workstation pose="seated-raised-hand" seed="wall" />
          </Tile>
        ) : (
          <Tile key={i} label={`desk ${i}`} scale={0.5} width={DESK_WIDTH} height={DESK_HEIGHT}>
            <ScreenDesk kind={deskKindFor(i)} screen="live" />
          </Tile>
        ),
      )}
    </div>
  );
}

function CoffeeBreak() {
  return (
    <div style={{ position: "relative", width: BREAK_WIDTH, height: MUG_Y + RIG_HEIGHT }}>
      <PixelProp name="COFFEE_STATION" />
      <div style={{ position: "absolute", left: MUG_X, top: MUG_Y }}>
        <CharacterRig pose="standing-mug" shirt={1} stripe mirror />
      </div>
    </div>
  );
}

// A drawing at a given scale; the box takes the scaled size so rows wrap instead of overflowing.
function Tile({
  label,
  scale,
  width,
  height,
  children,
}: {
  label: string;
  scale: number;
  width: number;
  height: number;
  children: ReactNode;
}) {
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ width: width * scale, height: height * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", width, height }}>
          {children}
        </div>
      </div>
      <figcaption style={{ fontSize: 12 }}>{label}</figcaption>
    </figure>
  );
}

// One window of a scene on a wall, with the floor light patch under it, taken from a real room.
const SHEET_SHELL = roomShell(layoutOffice(8, { width: 1200, height: 800 }));
function WindowTile({
  id,
  wall,
  scale,
}: {
  id: WindowSceneId;
  wall: "left" | "right";
  scale: number;
}) {
  const scene = windowScene(id);
  const w = SHEET_SHELL.windows.find((x) => x.wall === wall)!;
  const flat = w.patch.flat();
  const halfW = (WINDOW_COLS * CELL) / 2;
  const halfH = (WINDOW_ROWS * CELL) / 2;
  const x0 = Math.min(w.center.x - halfW, ...flat.map((p) => p.x));
  const y0 = w.center.y - halfH;
  const width = Math.max(w.center.x + halfW, ...flat.map((p) => p.x)) - x0;
  const height = Math.max(w.center.y + halfH, ...flat.map((p) => p.y)) - y0;
  return (
    <Tile label={`window ${wall}, ${id}`} scale={scale} width={width} height={height}>
      <div style={{ position: "relative", width, height }}>
        <svg
          width={width}
          height={height}
          aria-hidden="true"
          focusable="false"
          style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
        >
          <g data-part="floor-light" data-window-scene={id} transform={`translate(${-x0} ${-y0})`}>
            {w.patch.map((pane, i) => (
              <polygon
                key={i}
                points={pane.map((p) => `${p.x},${p.y}`).join(" ")}
                fill={GLASS[scene.light]}
                opacity={FLOOR_LIGHT_OPACITY}
              />
            ))}
          </g>
        </svg>
        <WindowArt
          scene={scene}
          wall={wall}
          name={`sheet ${wall} ${id} ${scale}`}
          center={{ x: w.center.x - x0, y: w.center.y - y0 }}
        />
      </div>
    </Tile>
  );
}

function Row({ scale }: { scale: number }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 14 }}>{Math.round(scale * 100)}%</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-end" }}>
        {FRAMES.map(({ label, props }) => (
          <Tile key={label} label={label} scale={scale} width={RIG_WIDTH} height={RIG_HEIGHT}>
            <CharacterRig {...props} />
          </Tile>
        ))}
        {SEATED_POSES.map((pose) => (
          <Tile
            key={pose}
            label={`desk, ${pose}`}
            scale={scale}
            width={STATION_WIDTH}
            height={STATION_HEIGHT}
          >
            <Workstation pose={pose} />
          </Tile>
        ))}
        <Tile
          label="coffee station, standing-mug"
          scale={scale}
          width={BREAK_WIDTH}
          height={MUG_Y + RIG_HEIGHT}
        >
          <CoffeeBreak />
        </Tile>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-end" }}>
        <Tile label="clock, live hands" scale={scale} {...propSize("CLOCK")}>
          <div style={{ position: "relative" }}>
            <Clock now={SHEET_NOW} />
          </div>
        </Tile>
        {DESK_KINDS.flatMap((kind) =>
          [true, false].map((lit) => (
            <Tile
              key={`${kind.id}-${lit}`}
              label={`desk ${kind.id}, ${lit ? "lit" : "dim"}`}
              scale={scale}
              width={DESK_WIDTH}
              height={DESK_HEIGHT}
            >
              <PixelDesk kind={kind} lit={lit} />
            </Tile>
          )),
        )}
        {DESK_KINDS.flatMap((kind) =>
          SCREEN_STATES.map((screen) => (
            <Tile
              key={`${kind.id}-${screen}-screen`}
              label={`desk ${kind.id}, screen ${screen}`}
              scale={scale}
              width={DESK_WIDTH}
              height={DESK_HEIGHT}
            >
              <ScreenDesk kind={kind} screen={screen} />
            </Tile>
          )),
        )}
        {DEVICES.flatMap((device) =>
          DEVICE_LOOKS.map((look) => (
            <Tile
              key={`${device}-${look}-desk`}
              label={`desk tidy, ${device} ${look}`}
              scale={scale}
              width={DESK_WIDTH}
              height={DESK_HEIGHT}
            >
              <DeviceDesk kind={DESK_KINDS[0]} device={device} look={look} />
            </Tile>
          )),
        )}
        {PROP_NAMES.map((name) => (
          <Tile key={name} label={name.toLowerCase()} scale={scale} {...propSize(name)}>
            <PixelProp name={name} />
          </Tile>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-end" }}>
        {WINDOW_SCENE_IDS.flatMap((id) =>
          (["left", "right"] as const).map((wall) => (
            <WindowTile key={`${id}-${wall}`} id={id} wall={wall} scale={scale} />
          )),
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-end" }}>
        {HAIRSTYLES.map((style, i) => (
          <Tile
            key={style.name}
            label={style.name}
            scale={scale}
            width={RIG_WIDTH * 2}
            height={RIG_HEIGHT}
          >
            <div style={{ display: "flex" }}>
              {(["walking", "seated-typing"] as const).map((pose) => (
                <CharacterRig
                  key={pose}
                  pose={pose}
                  shirt={i}
                  stripe={i % 2 === 1}
                  hairStyle={i}
                  hair={HAIR[i % HAIR.length]}
                  skin={SKIN[i % SKIN.length]}
                />
              ))}
            </div>
          </Tile>
        ))}
      </div>
    </section>
  );
}

// (a) Every pose frame in each shirt color, plain and striped.
function ShirtGrid() {
  return (
    <section>
      <h2 style={{ fontSize: 14 }}>
        Every frame, {SHIRTS.length} shirts, plain then striped (100%)
      </h2>
      {FRAMES.map(({ label, props }) => (
        <div key={label} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12 }}>{label}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {[false, true].flatMap((stripe) =>
              SHIRTS.map((shirt, i) => (
                <CharacterRig key={`${shirt.name}${stripe}`} {...props} shirt={i} stripe={stripe} />
              )),
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

// (b) 12 agents at 50%: one raised hand among typing and idle, looks from appearanceFor.
const TWELVE: { pose: SeatedPose; shirt: number; stripe: boolean; seed: string }[] = Array.from(
  { length: 12 },
  (_, i) => ({
    pose: i === 5 ? "seated-raised-hand" : i % 4 === 3 ? "seated-idle" : "seated-typing",
    shirt: i % SHIRTS.length,
    stripe: i % 3 === 0 || i >= 8,
    seed: `agent-${i}`,
  }),
);

function AgentRow({
  agents,
  scale,
  label,
}: {
  agents: typeof TWELVE;
  scale: number;
  label: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 12 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
        {agents.map((a) => (
          <Tile
            key={a.seed}
            label={a.seed}
            scale={scale}
            width={STATION_WIDTH}
            height={STATION_HEIGHT}
          >
            <Workstation {...a} />
          </Tile>
        ))}
      </div>
    </div>
  );
}

// (c) Two neighbors both raising a hand.
const NEIGHBORS: typeof TWELVE = [
  { pose: "seated-typing", shirt: 2, stripe: false, seed: "agent-a" },
  { pose: "seated-raised-hand", shirt: 4, stripe: true, seed: "agent-b" },
  { pose: "seated-raised-hand", shirt: 6, stripe: false, seed: "agent-c" },
  { pose: "seated-typing", shirt: 0, stripe: true, seed: "agent-d" },
];

// WCAG 2.x relative luminance and contrast ratio.
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

const WEAK = 1.5;
const TOUCHING = [
  "--trousers",
  "--skin-1",
  "--skin-2",
  "--skin-3",
  "--hair-1",
  "--hair-2",
  "--hair-3",
  "--hair-4",
  "--plastic",
] as const;

// (d) Without strokes, silhouette separation is the shirt against the colors it touches.
function SilhouetteRow() {
  const cell: CSSProperties = { padding: "2px 6px", textAlign: "center", fontSize: 11 };
  return (
    <section>
      <h2 style={{ fontSize: 14 }}>
        Silhouette check: shirt against touching colors (WCAG ratio, ! = under {WEAK}:1)
      </h2>
      <table style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={cell}>shirt</th>
            <th style={cell}>on bg</th>
            {TOUCHING.map((t) => (
              <th key={t} style={cell}>
                {t.slice(2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SHIRTS.map((shirt, i) => (
            <tr key={shirt.name}>
              <td style={{ ...cell, textAlign: "left" }}>{shirt.name}</td>
              <td style={cell}>
                <div style={{ background: "var(--bubble-text)", display: "inline-block" }}>
                  <CharacterRig pose="standing" shirt={i} stripe={false} />
                </div>
                <div>{contrast(shirt.value, ART["--bubble-text"]).toFixed(2)}</div>
              </td>
              {TOUCHING.map((t) => {
                const ratio = contrast(shirt.value, ART[t]);
                const weak = ratio < WEAK;
                return (
                  <td
                    key={t}
                    data-weak={weak || undefined}
                    style={{ ...cell, outline: weak ? "2px solid var(--outline)" : undefined }}
                  >
                    <div style={{ display: "flex", height: 16, width: 48, margin: "0 auto" }}>
                      <div style={{ flex: 1, background: shirt.value }} />
                      <div style={{ flex: 1, background: `var(${t})` }} />
                    </div>
                    {ratio.toFixed(2)}
                    {weak ? " !" : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Cases() {
  return (
    <>
      <ShirtGrid />
      <section>
        <h2 style={{ fontSize: 14 }}>12 agents at 50%, one raised hand (must read first)</h2>
        <AgentRow agents={TWELVE} scale={0.5} label="12 agents" />
      </section>
      <section>
        <h2 style={{ fontSize: 14 }}>Two adjacent raised hands (100%)</h2>
        <AgentRow agents={NEIGHBORS} scale={1} label="neighbors" />
      </section>
      <SilhouetteRow />
    </>
  );
}

export default function ArtSheet() {
  const [gray, setGray] = useState(false);
  return (
    <main
      style={{
        ...(ART as unknown as CSSProperties),
        background: "var(--bubble-text)", // same value as --bg (DESIGN.md Art palette)
        color: "var(--outline)",
        minHeight: "100vh",
        padding: 24,
        boxSizing: "border-box",
        overflowX: "hidden",
      }}
    >
      <h1 style={{ fontSize: 16 }}>Style gate sheet (iso pixel frames)</h1>
      <p data-overrides style={{ fontSize: 12 }}>
        Dev overrides: {activeOverrides().join(", ") || "none"}
      </p>
      <label style={{ fontSize: 12 }}>
        <input type="checkbox" checked={gray} onChange={(e) => setGray(e.target.checked)} />{" "}
        grayscale pass (applies to the cases below)
      </label>
      <div style={{ filter: gray ? "grayscale(1)" : undefined, marginBottom: 24 }}>
        <Cases />
      </div>
      <section style={{ filter: "grayscale(1)", marginBottom: 24 }}>
        <h2 style={{ fontSize: 14 }}>Grayscale copy: the raised hand and shirts must still read</h2>
        <AgentRow agents={TWELVE} scale={0.5} label="12 agents, grayscale" />
      </section>
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14 }}>
          24 working desks and one raised hand at 50%: the hand must read first
        </h2>
        <DeskWall gray={false} />
        <h2 style={{ fontSize: 14 }}>Same wall in grayscale</h2>
        <DeskWall gray />
      </section>
      <Row scale={1} />
      <Row scale={0.5} />
      <Row scale={3} />
      <h2 style={{ fontSize: 14 }}>Mockup (variant A room)</h2>
      <img src={mockup} alt="Room mockup" style={{ maxWidth: "100%", width: 480 }} />
      <h2 style={{ fontSize: 14 }}>Variant B (character board, look target)</h2>
      <img
        src={variantB}
        alt="Character board variant B"
        style={{ maxWidth: "100%", width: 720 }}
      />
      <h2 style={{ fontSize: 14 }}>Approved states reference</h2>
      <img src={states} alt="Approved character states" style={{ maxWidth: "100%", width: 480 }} />
    </main>
  );
}
