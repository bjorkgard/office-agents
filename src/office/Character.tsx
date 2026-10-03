import {
  memo,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { appearanceFor } from "./appearance";
import { CharacterRig, type RigPose } from "./CharacterRig";
import { STRIDE_MS } from "./choreo";
import type { ShirtChoice } from "./identity";
import { TUNING } from "./machine";
import { SWAP_TIMEOUT_MS, shirtFor, type AgentState } from "./poses";
import {
  frameZ,
  legacyPose,
  restPose,
  runLoop,
  syncTripAttrs,
  type Drive,
  type Frame,
} from "./motion";
import { SEATED_FOOT, STANDING_FOOT, type Point } from "./scene-model";
import { createSwap, isLooping, resolveSwap, retarget } from "./swap";

export type CharacterProps = {
  /** The machine's latest state; the pose shown follows it through the swap controller. */
  state: AgentState;
  /** Seeds hairstyle, hair and skin: pass the agent key. */
  seed: string;
  shirt: ShirtChoice | null;
  isSubagent: boolean;
  /** Foot point where the agent settles: the desk seat, a subagent slot or a queue spot. */
  home: Point;
  door: Point;
  /** Stacking value of its desk, or null when the agent stands away from a desk. */
  deskZ: number | null;
  /** A subagent that sits at an empty desk (home is that seat). */
  atWorkDesk?: boolean;
  /**
   * Walks the agent (choreo.ts): while it is not settled, an animation loop writes position,
   * stacking and opacity straight to the element, and `onFrame` hears every frame so the overlay
   * can follow. Ignored in reduced motion; null for agents that only stand at `home`.
   */
  drive?: Drive | null;
  onFrame?: (seed: string, frame: Frame) => void;
  reducedMotion: boolean;
  /** Epoch ms; injected so tests and demo mode control time. */
  clock?: () => number;
};

/** D10: the pose shown follows `state` through the pure swap controller; the hook only wires events. */
function useDisplayedState(
  state: AgentState,
  reducedMotion: boolean,
  clock: () => number,
): [AgentState, () => void] {
  const [swap, setSwap] = useState(() => createSwap(state, clock()));
  const settle = useCallback(
    (loopRunning: boolean) => {
      const now = clock();
      setSwap((s) => resolveSwap(s, { loopRunning, reducedMotion, now }));
    },
    [clock, reducedMotion],
  );

  // Derived during render (no effect): retarget to the latest state, then swap if allowed.
  const now = clock();
  const next = resolveSwap(retarget(swap, state, now), {
    loopRunning: isLooping(swap.displayed),
    reducedMotion,
    now,
  });
  if (next !== swap) setSwap(next);

  const pending = swap.displayed !== swap.target;
  useEffect(() => {
    if (!pending) return;
    const wait = Math.max(0, SWAP_TIMEOUT_MS - (clock() - swap.since));
    const timer = setTimeout(() => settle(true), wait);
    // Timers and animation events stall in a background tab: settle on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") settle(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pending, swap.since, settle, clock]);

  // animationiteration: the stride or tap just reached its rest frame.
  const onLoopEnd = useCallback(() => settle(false), [settle]);
  return [swap.displayed, onLoopEnd];
}

const loopOf = (pose: RigPose) =>
  pose === "walking"
    ? "walk"
    : pose === "seated-typing"
      ? "tap"
      : pose === "seated-raised-hand"
        ? "wave"
        : "";

/** What a React render must repeat: the parts of a frame that are not written per frame. */
const lookKey = (f: Frame) => `${f.pose}|${f.mirror}|${f.carryPaper}|${f.rest}|${f.standing}`;

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** Scene builds fresh `home` and `door` objects every render; compare them by value. */
function sameProps(a: CharacterProps, b: CharacterProps): boolean {
  const { home: ha, door: da, ...ra } = a;
  const { home: hb, door: db, ...rb } = b;
  const keys = Object.keys(ra) as (keyof typeof ra)[];
  return (
    samePoint(ha, hb) &&
    samePoint(da, db) &&
    keys.length === Object.keys(rb).length &&
    keys.every((k) => Object.is(ra[k], rb[k]))
  );
}

export const Character = memo(function Character({
  state,
  seed,
  shirt,
  isSubagent,
  home,
  door,
  deskZ,
  atWorkDesk = false,
  drive = null,
  onFrame,
  reducedMotion,
  clock = Date.now,
}: CharacterProps) {
  const [displayed, onLoopEnd] = useDisplayedState(state, reducedMotion, clock);
  const el = useRef<HTMLDivElement>(null);
  const shown = useRef("");
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const driven = drive !== null && !reducedMotion;
  const frame = driven ? drive.frame(clock()) : null;
  const sits = deskZ !== null && (!isSubagent || atWorkDesk);
  const pose = frame
    ? frame.rest
      ? restPose(displayed, frame.standing)
      : frame.pose
    : legacyPose(displayed, { seated: sits, subagent: isSubagent, reducedMotion });
  const looks = appearanceFor(seed);
  const key = frame ? lookKey(frame) : "";
  useEffect(() => {
    shown.current = key;
  });

  // One coordinate convention: the agent sits on its standing foot, the rig hangs STANDING_FOOT above.
  const shift = sits ? STANDING_FOOT - SEATED_FOOT : 0;
  const at = frame ? { x: frame.x, y: frame.y } : { x: home.x, y: home.y + shift };
  // Seated: behind its desk, but a raised arm draws above the monitor. Else by foot depth.
  const z = frame
    ? frameZ(frame, deskZ, displayed === "attention")
    : sits && deskZ !== null
      ? deskZ + (displayed === "attention" ? 1 : -1)
      : Math.round(home.y);
  const known = shirtFor(shirt ? shirt.index : null);
  const style = {
    transform: `translate(${at.x}px, ${at.y}px)`,
    zIndex: z,
    ...(frame && frame.opacity < 1 ? { opacity: frame.opacity } : {}),
    "--x": `${at.x}px`,
    "--y": `${at.y}px`,
    "--door-x": `${door.x}px`,
    "--door-y": `${door.y + 36 + shift}px`,
    "--arrive-ms": `${TUNING.arrivingMs}ms`,
    "--leave-ms": `${TUNING.leavingMs}ms`,
    "--stride-ms": `${STRIDE_MS}ms`,
  } as CSSProperties;

  // The animation loop: only while the drive has somewhere to go; a settled agent costs nothing.
  useEffect(() => {
    const node = el.current;
    if (!drive || reducedMotion || !node) return;
    return runLoop(drive, clock, (t) => {
      const f = drive.frame(t);
      node.style.transform = `translate(${f.x}px, ${f.y}px)`;
      node.style.zIndex = String(frameZ(f, deskZ, node.dataset.state === "attention"));
      node.style.opacity = f.opacity < 1 ? String(f.opacity) : "";
      syncTripAttrs(node, f);
      onFrame?.(seed, f);
      if (lookKey(f) !== shown.current) {
        shown.current = lookKey(f);
        rerender();
      }
    });
  }, [drive, reducedMotion, deskZ, seed, clock, onFrame]);

  return (
    <div
      ref={el}
      className="agent"
      data-state={displayed}
      data-shirt={known ? known.name : "unknown"}
      data-pose={pose}
      data-path={driven ? "" : undefined}
      data-break={frame?.phase}
      data-drink={frame?.drink}
      style={style}
      onAnimationIteration={onLoopEnd}
    >
      <div className="rig" data-loop={loopOf(pose)} style={{ left: -32, top: -STANDING_FOOT }}>
        <CharacterRig
          pose={pose}
          shirt={shirt ? shirt.index : null}
          stripe={shirt ? shirt.stripe : false}
          carryPaper={
            frame
              ? frame.carryPaper
              : isSubagent && (displayed === "arriving" || displayed === "leaving")
          }
          stride
          mirror={frame ? frame.mirror : displayed === "leaving"}
          hairStyle={looks.hairStyle}
          hair={looks.hair}
          skin={looks.skin}
        />
      </div>
    </div>
  );
}, sameProps);
