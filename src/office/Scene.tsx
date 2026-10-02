// Scene: <Scene office seats projects viewport now [onSelect] [failure] [clock]/> renders the whole room.
// Mount it once: it owns the shared desk drawing (R5) and the ErrorBoundary-bound `failure` rethrow (D16).
// Props come straight from useOffice (office, seats, projects, failure); Character.tsx is internal to it.
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import "./scene.css";
import { Character } from "./Character";
import { DeskDefs, PixelProp, SharedDesk } from "./CharacterRig";
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
  overlayFoot,
  overlayPoints,
  planMotion,
  TORSO,
  type CacheEntry,
  type Frame,
  type SubMemory,
  type Trip,
} from "./motion";
import { ART } from "./palette";
import type { AgentState } from "./poses";
import { propSize, type PropName } from "./props";
import { roomShell, wallPropRect, type RoomShell as RoomShellGeometry } from "./room";
import {
  assignShirts,
  deskCountFor,
  bubbleText,
  geometryFor,
  lookFor,
  QUEUE_VISIBLE,
  SEATED_FOOT,
  STANDING_FOOT,
  TAG_H,
  tagWidth,
  type Point,
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
    keys.every((k) => b[k]?.index === a[k].index && b[k]?.stripe === a[k].stripe)
  );
}

type Placed = {
  agent: Agent;
  home: Point;
  deskZ: number | null;
  desk: number | null;
  atWorkDesk: boolean;
};

/** The door and the counter are drawn for their wall: upright, base anchor on the wall (room.ts). */
function wallProp(at: Point, name: "DOOR" | "COFFEE_STATION", zIndex: number): CSSProperties {
  const r = wallPropRect(name, at);
  return { left: r.left, top: r.top, zIndex };
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

const ROOM_VARS = ART as unknown as CSSProperties;

/** The lowest layer: floor with a tile pattern, two back walls and their baseboards. */
function RoomShell({
  shell,
  width,
  height,
}: {
  shell: RoomShellGeometry;
  width: number;
  height: number;
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
  const [shirts, setShirts] = useState<Record<string, ShirtChoice>>({});
  // Work desks and coffee trips outlive a render: a subagent keeps its desk, a trip its start.
  // Committed after each render (effect below), so a render only ever reads the last commit.
  const [memory] = useState(() => ({
    desks: new Map<string, number | null>(),
    trips: new Map<string, Trip>(),
    subs: new Map<string, SubMemory>(),
    cache: new Map<string, CacheEntry>(),
    overlay: new Map<string, { hit?: HTMLElement | null; tag?: HTMLElement | null }>(),
    scale: 1,
    hit: 0,
  }));
  const agents = Object.values(office.agents);
  // Stable between renders unless the room changes, so drives (built on this geometry) are too.
  const deskCount = deskCountFor(office, seats);
  const layout = useMemo(
    () => layoutOffice(deskCount, { width: viewport.width, height: viewport.height }),
    [deskCount, viewport.width, viewport.height],
  );
  const g = useMemo(() => geometryFor(layout), [layout]);
  const { scale } = layout;
  const shell = useMemo(() => roomShell(layout), [layout]);
  const t = (clock ?? Date.now)();

  const active = [...new Set(agents.filter((a) => a.state !== "leaving").map((a) => a.projectId))];
  const nextShirts = assignShirts(shirts, projects, [...active].sort());
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
      const z = Math.round(layout.desks[desk].y + 30);
      placed.set(a.key, { agent: a, home: g.seat(desk), deskZ: z, desk, atWorkDesk: false });
    } else if (a.agentId !== null && work !== undefined) {
      const z = Math.round(layout.desks[work].y + 30);
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
  const handoff = new Set(
    agents
      .filter((a) => a.agentId !== null && (a.state === "arriving" || a.state === "leaving"))
      .map((a) => a.sessionId),
  );

  // The overlay of a walker follows its foot point frame by frame (no React render per frame).
  const hit = Math.max(HIT_MIN, 40 * scale);
  useEffect(() => {
    memory.desks = motion.desks;
    memory.trips = motion.trips;
    memory.subs = motion.subs;
    memory.cache = motion.cache;
    memory.scale = scale;
    memory.hit = hit;
    // Overlay nodes of departed agents are gone (their refs reset to null): forget them.
    const here = new Set(agents.map((a) => a.key));
    for (const key of memory.overlay.keys()) if (!here.has(key)) memory.overlay.delete(key);
  });
  const onFrame = useCallback(
    (key: string, f: Frame) => {
      const els = memory.overlay.get(key);
      if (!els) return;
      const at = overlayPoints(overlayFoot(f), memory.scale, memory.hit);
      if (els.hit) {
        els.hit.style.left = `${at.hit.left}px`;
        els.hit.style.top = `${at.hit.top}px`;
      }
      if (els.tag) {
        els.tag.style.left = `${at.tag.left}px`;
        els.tag.style.top = `${at.tag.top}px`;
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
      x: fixed.x * scale - BUBBLE_W / 2,
      y: (fixed.y - SEATED_FOOT) * scale - BUBBLE_H - 8,
      width: BUBBLE_W,
      height: BUBBLE_H,
      waitingMs: a.episode ? now - a.episode.waitingSince : 0,
    }));
  // A bubble must not cover another agent's tag or figure (head to feet).
  const obstacles: BubbleObstacle[] = entries.flatMap(({ a, p, foot }) => {
    const f = frameOf(a.key);
    const seated = f ? f.rest && !f.standing : p.deskZ !== null;
    const top = (foot.y - (seated ? SEATED_FOOT - 10 : STANDING_FOOT)) * scale;
    const cx = foot.x * scale;
    const cy = (foot.y - TORSO) * scale;
    const extra = plan.overflow.get(a.sessionId) ?? 0;
    const width = tagWidth(seenName(a), projectOf(a), a.agentId === null ? extra : 0);
    return [
      { owner: a.key, x: cx - 20 * scale, y: top, width: 40 * scale, height: foot.y * scale - top },
      { owner: a.key, x: cx - width / 2, y: cy + hit / 2 + 4, width, height: TAG_H },
    ];
  });
  const bubbles = new Map(placeBubbles(boxes, obstacles).map((b) => [b.id, b]));
  const hidden = queue.length - QUEUE_VISIBLE;
  const more = g.queueSpot(QUEUE_VISIBLE);

  return (
    <div
      className="scene"
      data-testid="scene"
      style={{ width: layout.width * scale, height: layout.scrollHeight }}
    >
      <ThrowFailure failure={failure} />
      <DeskDefs />
      <div
        className="scene-scaled"
        style={
          {
            width: layout.width,
            height: layout.height,
            transform: `scale(${scale})`,
            "--scale": scale,
          } as CSSProperties
        }
      >
        <RoomShell shell={shell} width={layout.width} height={layout.height} />
        <div style={wallProp(g.door, "DOOR", 1)}>
          <PixelProp name="DOOR" />
        </div>
        <div style={hungProp(shell.clock, "CLOCK", 1)}>
          <PixelProp name="CLOCK" />
          <i className="clock-hand" />
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
            left: wallPropRect("COFFEE_STATION", g.coffee).left + 58,
            top: wallPropRect("COFFEE_STATION", g.coffee).top,
            zIndex: 3,
          }}
        >
          <PixelProp name="STEAM" />
        </div>
        <div style={wallProp(g.coffee, "COFFEE_STATION", 2)}>
          <PixelProp name="COFFEE_STATION" />
        </div>
        {layout.desks.map((d, i) => {
          const tl = g.desk(i);
          const z = Math.round(d.y + 30);
          const who = occupant.get(i);
          const sitter = who ?? worker.get(i);
          return (
            <div key={`desk-${i}`} data-desk={i} style={{ left: tl.x, top: tl.y, zIndex: z }}>
              <SharedDesk lit={sitter ? lookFor(sitter.state).lit : false} />
              {who && handoff.has(who.sessionId) && (
                <div
                  className="paper-glow"
                  data-handoff
                  style={{ position: "absolute", left: 40, top: 28 }}
                >
                  <PixelProp name="PAPER" />
                </div>
              )}
            </div>
          );
        })}
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
          const shirt = nextShirts[a.projectId] ?? null;
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
      <div className="scene-overlay">
        {entries.map(({ a, foot }) => {
          const at = overlayPoints(foot, scale, hit);
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
                aria-label={`${name}, ${project}, ${STATE_LABEL[a.state]}`}
                ref={bindOverlay(a.key, "hit")}
                style={{ left: at.hit.left, top: at.hit.top, width: hit, height: hit }}
                onClick={() => onSelect?.(a.key)}
              />
              <div
                className="tag"
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
                    left: placedBubble.x,
                    top: placedBubble.y,
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
          <button
            type="button"
            className="queue-more"
            data-queue-more
            aria-label={`and ${hidden} more waiting`}
            style={{ left: more.x * scale, top: more.y * scale }}
          >
            +{hidden}
          </button>
        )}
      </div>
    </div>
  );
}
