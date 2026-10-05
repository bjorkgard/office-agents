// Scene: <Scene office seats projects viewport now [onSelect] [failure] [clock]/> renders the whole room.
// Mount it once: it owns the shared desk drawing (R5) and the ErrorBoundary-bound `failure` rethrow (D16).
// Props come straight from useOffice (office, seats, projects, failure); Character.tsx is internal to it.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import "./scene.css";
import { Character } from "./Character";
import { DeskDefs } from "./CharacterRig";
import { DeskLayer } from "./DeskLayer";
import { ThrowFailure } from "./ErrorBoundary";
import {
  HIT_MIN,
  layoutOffice,
  placeBubbles,
  type BubbleBox,
  type BubbleObstacle,
  type Viewport,
} from "./iso";
import { projectLabel, agentIdentity } from "./label";
import type { Agent, OfficeState } from "./machine";
import {
  overlayCalc,
  overlayFoot,
  planMotion,
  roomCalc,
  roomCalcAt,
  TORSO,
  type CacheEntry,
  type Frame,
  type SubMemory,
  type Trip,
} from "./motion";
import { DESKS_PER_ROW } from "../../shared/tuning";
import { activeSceneId, windowScene, type WindowScene } from "./decor";
import { ART, FLOOR_LIGHT_OPACITY, GLASS } from "./palette";
import type { AgentState } from "./poses";
import { armPaperTimer, paperOfParent } from "./paper";
import { RoomDecor } from "./RoomDecor";
import { roomShell, type RoomShell as RoomShellGeometry } from "./room";
import {
  assignShirts,
  shirtOf,
  DESK_POP_MS,
  deskCountFor,
  sceneDemand,
  deskZ,
  bubbleText,
  geometryFor,
  lookFor,
  lostFocus,
  newDeskIndexes,
  QUEUE_VISIBLE,
  SEATED_FOOT,
  stepRowHold,
  STANDING_FOOT,
  TAG_H,
  tagWidth,
  type Point,
  type RowHold,
} from "./scene-model";
import { deskOrder, focusOrder, type Seats } from "./selectors";
import { waitLabel } from "./topbar-logic";
import type { ShirtChoice } from "./identity";

export type SceneProps = {
  office: OfficeState;
  seats: Seats;
  /** projectId to project path. */
  projects: Record<string, string>;
  viewport: Viewport;
  /** Epoch ms for wait times in bubbles. */
  now: number;
  /** A machine failure from useOffice; thrown here so the ErrorBoundary shows "Display error". */
  failure?: Error | null;
  onSelect?: (key: string) => void;
  clock?: () => number;
};

const STATE_LABEL: Record<AgentState, string> = {
  arriving: "arriving",
  working: "working",
  "waiting-on-subagents": "waiting on subagents",
  idle: "idle",
  attention: "waiting for you",
  leaving: "leaving",
};

const BUBBLE_W = 112;
const BUBBLE_H = 32;

const subscribeMotion = (cb: () => void) => {
  const q = window.matchMedia("(prefers-reduced-motion: reduce)");
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

function sameShirts(a: Record<string, ShirtChoice>, b: Record<string, ShirtChoice>): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((k) => shirtOf(b, k)?.index === a[k].index && shirtOf(b, k)?.stripe === a[k].stripe)
  );
}

type Placed = {
  agent: Agent;
  home: Point;
  deskZ: number | null;
  desk: number | null;
  atWorkDesk: boolean;
};

const ROOM_VARS = ART as unknown as CSSProperties;

/** The lowest layer: floor with a tile pattern, two back walls and their baseboards. */
function RoomShell({
  shell,
  width,
  height,
  scene,
}: {
  shell: RoomShellGeometry;
  width: number;
  height: number;
  scene: WindowScene;
}) {
  const pts = (poly: Point[]) => poly.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <svg
      data-part="room-shell"
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
      style={{ left: 0, top: 0, zIndex: 0, overflow: "visible", ...ROOM_VARS }}
    >
      <polygon points={pts(shell.floor)} fill="var(--bar)" />
      {shell.floorTiles.map((t, i) => (
        <polygon key={i} points={pts(t)} fill="var(--art-shade)" opacity={0.18} />
      ))}
      <polygon points={pts(shell.leftWall)} fill="var(--plastic)" opacity={0.55} />
      <polygon points={pts(shell.rightWall)} fill="var(--plastic)" opacity={0.4} />
      <polygon points={pts(shell.leftBaseboard)} fill="var(--metal)" opacity={0.7} />
      <polygon points={pts(shell.rightBaseboard)} fill="var(--metal)" opacity={0.7} />
      {shell.windows.map((w) => (
        <g key={w.name} data-part="floor-light" data-window-scene={scene.id}>
          {w.patch.map((pane, i) => (
            <polygon
              key={i}
              points={pts(pane)}
              fill={GLASS[scene.light]}
              opacity={FLOOR_LIGHT_OPACITY}
            />
          ))}
        </g>
      ))}
      <polygon points={pts(shell.floor)} fill="none" stroke="var(--outline)" opacity={0.25} />
    </svg>
  );
}

export function Scene({
  office,
  seats,
  projects,
  viewport,
  now,
  failure = null,
  onSelect,
  clock,
}: SceneProps) {
  const reducedMotion = useReducedMotion();
  const [paperTick, setPaperTick] = useState(0);
  const [shirts, setShirts] = useState<Record<string, ShirtChoice>>({});
  // Work desks and coffee trips outlive a render: a subagent keeps its desk, a trip its start.
  // Committed after each render (effect below), so a render only ever reads the last commit.
  const [memory] = useState(() => ({
    desks: new Map<string, number | null>(),
    trips: new Map<string, Trip>(),
    subs: new Map<string, SubMemory>(),
    cache: new Map<string, CacheEntry>(),
    overlay: new Map<string, { hit?: HTMLElement | null; tag?: HTMLElement | null }>(),
    hit: 0,
    hold: null as RowHold | null,
    deskCount: null as number | null,
    popping: new Map<number, number>(),
  }));
  const agents = Object.values(office.agents);
  const t = (clock ?? Date.now)();
  // Rows follow the sessions, plus a free desk per subagent (the hold keeps extra rows a minute).
  const sessionRows = Math.max(1, Math.ceil(deskCountFor(office, seats) / DESKS_PER_ROW));
  const demand = sceneDemand(agents, seats, memory.desks);
  const hold = stepRowHold(memory.hold, sessionRows, Math.ceil(demand / DESKS_PER_ROW), t);
  // Stable between renders unless the room changes, so drives (built on this geometry) are too.
  const deskCount = hold.rows * DESKS_PER_ROW;
  // A new desk pops in; it keeps the class for the animation, so a re-render does not cut it.
  const fresh = new Set(newDeskIndexes(memory.deskCount, deskCount));
  for (const [i, since] of memory.popping) if (t - since < DESK_POP_MS) fresh.add(i);
  const layout = useMemo(
    () => layoutOffice(deskCount, { width: viewport.width, height: viewport.height }),
    [deskCount, viewport.width, viewport.height],
  );
  const g = useMemo(() => geometryFor(layout), [layout]);
  const { scale, fit } = layout;
  const shell = useMemo(() => roomShell(layout), [layout]);
  // The windows show the real local hour's scene (a stable object, so the windows redraw only when
  // it changes); `now` is a 15 s tick, far finer than an hour.
  const scene = windowScene(activeSceneId(now));

  const active = [...new Set(agents.filter((a) => a.state !== "leaving").map((a) => a.sessionId))];
  const nextShirts = assignShirts(shirts, [...active].sort());
  if (!sameShirts(shirts, nextShirts)) setShirts(nextShirts);

  const motion = planMotion({
    agents,
    seats,
    layout,
    geo: g,
    prevDesks: memory.desks,
    prevTrips: memory.trips,
    prevSubs: memory.subs,
    prevCache: memory.cache,
    reducedMotion,
    now: t,
  });
  const { plan, drives } = motion;
  // Subagents beyond the slots, and top-level agents with no seat, wait near the door.
  const unseated = agents
    .filter((a) => a.agentId === null && a.state !== "leaving" && seats[a.sessionId] === undefined)
    .map((a) => a.key);
  const queue = [...plan.queue, ...unseated];

  const placed = new Map<string, Placed>();
  for (const a of agents) {
    const desk = seats[a.sessionId];
    const work = motion.workDeskOf.get(a.key);
    if (a.agentId === null && desk !== undefined) {
      const z = deskZ(layout, desk);
      placed.set(a.key, { agent: a, home: g.seat(desk), deskZ: z, desk, atWorkDesk: false });
    } else if (a.agentId !== null && work !== undefined) {
      const z = deskZ(layout, work);
      placed.set(a.key, { agent: a, home: g.seat(work), deskZ: z, desk: work, atWorkDesk: true });
    } else if (a.agentId !== null) {
      const slot = plan.slot.get(a.key);
      if (slot)
        placed.set(a.key, {
          agent: a,
          home: g.slot(slot.desk, slot.index),
          deskZ: null,
          desk: slot.desk,
          atWorkDesk: false,
        });
      else if (drives.has(a.key))
        placed.set(a.key, {
          agent: a,
          home: g.slot(seats[a.sessionId], 0),
          deskZ: null,
          desk: seats[a.sessionId],
          atWorkDesk: false,
        });
    }
    const q = queue.indexOf(a.key);
    if (q >= 0 && q < QUEUE_VISIBLE)
      placed.set(a.key, {
        agent: a,
        home: g.queueSpot(q),
        deskZ: null,
        desk: null,
        atWorkDesk: false,
      });
  }

  // Where each agent is right now (a walker moves on between renders; its Character keeps the
  // overlay in step through onFrame).
  const frameOf = (key: string): Frame | null => drives.get(key)?.frame(t) ?? null;
  const footOf = (p: Placed): Point => {
    const f = frameOf(p.agent.key);
    return f ? overlayFoot(f) : p.home;
  };
  // Ring and bubble belong to the seat: an agent that needs you is there, or is hurrying back.
  const fixedFootOf = (p: Placed): Point =>
    p.agent.agentId === null && p.agent.state === "attention" && p.deskZ !== null
      ? p.home
      : footOf(p);

  const occupant = new Map<number, Agent>();
  for (const a of deskOrder(office, seats)) {
    const desk = seats[a.sessionId];
    if (a.agentId === null && desk !== undefined) occupant.set(desk, a);
  }
  const worker = new Map<number, Agent>();
  for (const a of agents) {
    const desk = motion.workDeskOf.get(a.key);
    if (desk !== undefined) worker.set(desk, a);
  }
  // The sheet of paper on each parent's desk (nextPaper: the first moment any of them changes).
  const paper = new Map(
    [...occupant].map(
      ([desk, parent]) => [desk, paperOfParent(parent, agents, motion, reducedMotion, t)] as const,
    ),
  );
  const nextPaper = Math.min(...[...paper.values()].map((p) => p.nextChange ?? Infinity));
  // One timer to the earliest change; a render replaces it. A timer that fires early still renders
  // (paperTick), and that render arms the next one.
  useEffect(
    () => armPaperTimer(nextPaper, clock ?? Date.now, () => setPaperTick((n) => n + 1)),
    [nextPaper, clock, paperTick],
  );

  // A focused hit button can leave the page (its agent left): keep focus in the scene.
  const sceneRef = useRef<HTMLDivElement>(null);
  const focused = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (lostFocus(focused.current, document.activeElement, document.body)) {
      focused.current = null;
      sceneRef.current?.focus();
    }
  });

  // The overlay of a walker follows its foot point frame by frame (no React render per frame).
  const hit = Math.max(HIT_MIN, 40 * scale);
  useEffect(() => {
    memory.desks = motion.desks;
    memory.trips = motion.trips;
    memory.subs = motion.subs;
    memory.cache = motion.cache;
    memory.hit = hit;
    memory.hold = hold;
    for (const i of fresh) if (!memory.popping.has(i)) memory.popping.set(i, t);
    for (const [i, since] of memory.popping)
      if (t - since >= DESK_POP_MS || i >= deskCount) memory.popping.delete(i);
    memory.deskCount = deskCount;
    // Overlay nodes of departed agents are gone (their refs reset to null): forget them.
    const here = new Set(agents.map((a) => a.key));
    for (const key of memory.overlay.keys()) if (!here.has(key)) memory.overlay.delete(key);
  });
  const onFrame = useCallback(
    (key: string, f: Frame) => {
      const els = memory.overlay.get(key);
      if (!els) return;
      const at = overlayCalc(overlayFoot(f), memory.hit);
      if (els.hit) {
        els.hit.style.left = at.hit.left;
        els.hit.style.top = at.hit.top;
      }
      if (els.tag) {
        els.tag.style.left = at.tag.left;
        els.tag.style.top = at.tag.top;
      }
    },
    [memory],
  );
  const bindOverlay = (key: string, part: "hit" | "tag") => (node: HTMLElement | null) => {
    const els = memory.overlay.get(key) ?? {};
    els[part] = node;
    memory.overlay.set(key, els);
  };

  const seenName = (a: Agent) => agentIdentity(a.sessionId, a.agentId).name;
  const projectOf = (a: Agent) => {
    const path = projects[a.projectId];
    return typeof path !== "string" ? "unknown" : projectLabel(path) || "unknown";
  };

  // Overlay entries in focus order: waiting agents first, then desk order.
  const entries = focusOrder(office, seats).flatMap((a) => {
    const p = placed.get(a.key);
    return p ? [{ a, p, foot: footOf(p), fixed: fixedFootOf(p) }] : [];
  });
  const boxes: BubbleBox[] = entries
    .filter(({ a }) => lookFor(a.state).bubble)
    .map(({ a, fixed }) => ({
      id: a.key,
      x: fixed.x * scale + fit.x - BUBBLE_W / 2,
      y: (fixed.y - SEATED_FOOT) * scale + fit.y - BUBBLE_H - 8,
      width: BUBBLE_W,
      height: BUBBLE_H,
      waitingMs: a.episode ? now - a.episode.waitingSince : 0,
    }));
  // A bubble must not cover another agent's tag or figure (head to feet).
  const obstacles: BubbleObstacle[] = entries.flatMap(({ a, p, foot }) => {
    const f = frameOf(a.key);
    const seated = f ? f.rest && !f.standing : p.deskZ !== null;
    const top = (foot.y - (seated ? SEATED_FOOT - 10 : STANDING_FOOT)) * scale + fit.y;
    const cx = foot.x * scale + fit.x;
    const cy = (foot.y - TORSO) * scale + fit.y;
    const extra = plan.overflow.get(a.sessionId) ?? 0;
    const width = tagWidth(seenName(a), projectOf(a), a.agentId === null ? extra : 0);
    return [
      {
        owner: a.key,
        x: cx - 20 * scale,
        y: top,
        width: 40 * scale,
        height: foot.y * scale + fit.y - top,
      },
      { owner: a.key, x: cx - width / 2, y: cy + hit / 2 + 4, width, height: TAG_H },
    ];
  });
  const bubbles = new Map(placeBubbles(boxes, obstacles).map((b) => [b.id, b]));
  // The numbers above feed the solver at the final fit; the bubble itself is placed through the same
  // calc() as its tag (the room point it hangs from, plus its own screen-px offset), so it eases too.
  const bubbleStyle = (key: string, fixed: Point, at: { x: number; y: number }) => {
    const box = boxes.find((b) => b.id === key)!;
    return roomCalcAt(
      { x: fixed.x, y: fixed.y - SEATED_FOOT },
      {
        x: Math.round((at.x - box.x - BUBBLE_W / 2) * 1000) / 1000,
        y: Math.round((at.y - box.y - BUBBLE_H - 8) * 1000) / 1000,
      },
    );
  };
  const hidden = queue.length - QUEUE_VISIBLE;
  const more = g.queueSpot(QUEUE_VISIBLE);

  return (
    <div
      className="scene"
      data-testid="scene"
      data-rows={layout.rows}
      data-desks={layout.desks.length}
      ref={sceneRef}
      tabIndex={-1}
      role="group"
      aria-label="Office"
      onFocus={(e) => {
        focused.current = e.target;
      }}
      onBlur={(e) => {
        if (e.target.isConnected) focused.current = null;
      }}
      style={{ height: layout.scrollHeight, ...ROOM_VARS }}
    >
      <ThrowFailure failure={failure} />
      <DeskDefs />
      <div
        className="scene-scaled"
        style={
          {
            width: layout.box.width,
            height: layout.box.height,
            transform: `translate(${fit.x}px, ${fit.y}px) scale(${scale})`,
            "--scale": scale,
          } as CSSProperties
        }
      >
        <RoomShell
          shell={shell}
          width={layout.box.width}
          height={layout.box.height}
          scene={scene}
        />
        <RoomDecor
          shell={shell}
          door={g.door}
          coffee={g.coffee}
          now={now}
          scene={scene}
          clock={clock}
        />
        <DeskLayer
          layout={layout}
          geo={g}
          occupant={occupant}
          worker={worker}
          paper={paper}
          fresh={fresh}
        />
        {entries
          .filter(({ a }) => lookFor(a.state).ring)
          .map(({ a, fixed }) => (
            <svg
              key={`ring-${a.key}`}
              data-ring={a.key}
              width={112}
              height={56}
              aria-hidden="true"
              focusable="false"
              style={{ left: fixed.x - 56, top: fixed.y - 34, zIndex: 1, overflow: "visible" }}
            >
              <ellipse
                cx={56}
                cy={28}
                rx={52}
                ry={26}
                fill="none"
                stroke="var(--accent)"
                style={{ strokeWidth: "calc(2px / var(--scale))" }}
              />
            </svg>
          ))}
        {agents.map((a) => {
          const p = placed.get(a.key);
          if (!p) return null;
          const shirt = shirtOf(nextShirts, a.sessionId) ?? null;
          return (
            <Character
              key={a.key}
              state={a.state}
              seed={a.key}
              shirt={shirt}
              isSubagent={a.agentId !== null}
              home={p.home}
              door={g.door}
              deskZ={p.deskZ}
              atWorkDesk={p.atWorkDesk}
              drive={drives.get(a.key) ?? null}
              onFrame={onFrame}
              reducedMotion={reducedMotion}
              clock={clock}
            />
          );
        })}
      </div>
      <div
        className="scene-overlay"
        style={
          {
            "--fit-s": fit.scale,
            "--fit-x": `${fit.x}px`,
            "--fit-y": `${fit.y}px`,
          } as CSSProperties
        }
      >
        {entries.map(({ a, foot, fixed }) => {
          const at = overlayCalc(foot, hit);
          const waiting = a.state === "attention";
          const extra = plan.overflow.get(a.sessionId) ?? 0;
          const name = seenName(a);
          const project = projectOf(a);
          const placedBubble = bubbles.get(a.key);
          return (
            <div key={a.key} data-agent={a.key}>
              <button
                type="button"
                className="hit"
                aria-label={`${name}, ${project}, ${STATE_LABEL[a.state]}${
                  a.agentId === null && extra > 0
                    ? `, ${extra} more ${extra === 1 ? "helper" : "helpers"}`
                    : ""
                }`}
                ref={bindOverlay(a.key, "hit")}
                style={{ left: at.hit.left, top: at.hit.top, width: hit, height: hit }}
                onClick={() => onSelect?.(a.key)}
              />
              <div
                className="tag"
                aria-hidden="true"
                data-waving={waiting ? "" : undefined}
                ref={bindOverlay(a.key, "tag")}
                style={{ left: at.tag.left, top: at.tag.top }}
              >
                <b>{name}</b> <span>{project}</span>
                {a.agentId === null && extra > 0 && <span data-overflow> +{extra}</span>}
              </div>
              {placedBubble && (
                <div
                  className="bubble"
                  data-bubble={a.key}
                  data-hidden={placedBubble.hidden ? "" : undefined}
                  aria-hidden="true"
                  style={{
                    ...bubbleStyle(a.key, fixed, placedBubble),
                    width: BUBBLE_W,
                    height: BUBBLE_H,
                    background: ART["--bubble-fill"],
                    color: ART["--bubble-text"],
                  }}
                >
                  <b>{bubbleText(a.attention?.trigger)}</b>{" "}
                  <span style={{ color: ART["--bubble-muted"] }}>
                    {waitLabel(a.episode?.waitingSince ?? null, now) ?? ""}
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {hidden > 0 && (
          <span
            className="queue-more"
            role="status"
            data-queue-more
            aria-label={`and ${hidden} more waiting`}
            style={roomCalc(more)}
          >
            +{hidden}
          </span>
        )}
      </div>
    </div>
  );
}
