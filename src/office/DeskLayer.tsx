// DeskLayer: <DeskLayer layout geo occupant worker paper fresh/> the desks, their screens following whoever sits there.
// A subagent at a work desk also has its own laptop or tablet, and its monitor follows its state like a parent's.
// New desks pop in (fresh). A subagent's paper lies on its parent's desk (paper), fading in and out.
import type { CSSProperties } from "react";
import { PixelProp, SharedDesk } from "./CharacterRig";
import { deskKindFor, type DeskKind } from "./desk-kinds";
import { deviceFor, deviceProp, deviceRect, type DeviceLook } from "./devices";
import type { OfficeLayout } from "./iso";
import type { Agent } from "./machine";
import type { Paper } from "./paper";
import { CELL } from "./pixel";
import { deskZ, lookFor, type Geometry, type Look } from "./scene-model";

/** Thickness of a screen line, in cells (design D5: never thinner than two). */
export const SCREEN_BAND_CELLS = 2;
/** One pattern repeat, in cells: a band of glow, then screen blue. The loop scrolls one repeat. */
export const SCREEN_PERIOD_CELLS = 8;
// The monitor face is a parallelogram 10 cells tall that falls one cell for every two across.
const FACE_ROWS = 10;
const FACE_SLOPE_DEG = (Math.atan(1 / 2) * 180) / Math.PI;

/** The glowing monitor face over a desk: live scrolls whole cells, still holds half lit. */
export function ScreenOverlay({ kind, screen }: { kind: DeskKind; screen: "still" | "live" }) {
  const { x, y, w } = kind.screen;
  const band = SCREEN_BAND_CELLS * CELL;
  const period = SCREEN_PERIOD_CELLS * CELL;
  const style = {
    left: x * CELL,
    top: y * CELL,
    width: w * CELL,
    height: FACE_ROWS * CELL,
    transform: `skewY(${FACE_SLOPE_DEG}deg)`,
    "--screen-period": `${period}px`,
  } as CSSProperties;
  return (
    <div
      className={screen === "live" ? "screen-overlay screen-live" : "screen-overlay"}
      data-screen-overlay
      style={style}
    >
      <div
        className="screen-pattern"
        style={{
          height: FACE_ROWS * CELL + period,
          backgroundImage: `repeating-linear-gradient(to bottom, var(--screen-glow) 0 ${band}px, var(--screen) ${band}px ${period}px)`,
        }}
      />
    </div>
  );
}

export function DeskLayer({
  layout,
  geo,
  occupant,
  worker,
  paper,
  fresh,
}: {
  layout: OfficeLayout;
  geo: Geometry;
  /** The top-level agent seated at each desk. */
  occupant: ReadonlyMap<number, Agent>;
  /** The subagent working at each empty desk. */
  worker: ReadonlyMap<number, Agent>;
  /** The sheet on each parent's desk. */
  paper: ReadonlyMap<number, Paper>;
  /** Desks that did not exist in the previous render. */
  fresh: ReadonlySet<number>;
}) {
  return (
    <>
      {layout.desks.map((_, i) => {
        const tl = geo.desk(i);
        const who = occupant.get(i);
        const sitter = who ?? worker.get(i);
        const state: Look["screen"] = sitter ? lookFor(sitter.state).screen : "off";
        const sub = !who && worker.get(i);
        const screen = state;
        const device = sub ? deviceFor(sub.key) : undefined;
        const deviceLook: DeviceLook =
          state === "live" ? "lit" : state === "still" ? "half" : "dark";
        const kind = deskKindFor(i);
        return (
          <div
            key={`desk-${i}`}
            className={fresh.has(i) ? "desk-pop" : undefined}
            data-desk={i}
            style={{ left: tl.x, top: tl.y, zIndex: deskZ(layout, i) }}
            data-screen={screen}
            data-device={device}
            data-desk-kind={kind.id}
          >
            <SharedDesk kind={kind} lit={screen === "live"} />
            {screen !== "off" && <ScreenOverlay kind={kind} screen={screen} />}
            {device && (
              <div
                className="desk-device"
                style={{
                  left: deviceRect(kind, device).x * CELL,
                  top: deviceRect(kind, device).y * CELL,
                }}
              >
                <PixelProp name={deviceProp(device, deviceLook)} />
              </div>
            )}
            {(paper.get(i)?.visible || paper.get(i)?.fading) && (
              <div
                className="paper-desk"
                data-paper
                data-fading={paper.get(i)?.visible ? undefined : ""}
                style={{ left: kind.paperSlot.x * CELL, top: kind.paperSlot.y * CELL }}
              >
                <PixelProp name="PAPER_DESK" />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
