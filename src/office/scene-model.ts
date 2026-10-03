import { DESK_CAP, DESKS_PER_ROW } from "../../shared/tuning";
import type { Agent, AttentionTrigger, OfficeState } from "./machine";
import { DESK_HEIGHT, DESK_WIDTH, RIG_HEIGHT, RIG_WIDTH } from "./CharacterRig";
import type { OfficeLayout } from "./iso";
import { pickShirt, type ShirtChoice } from "./identity";
import { CELL } from "./pixel";
import { QUEUE_SPOTS, roomShell, SEAT_AT, type Point } from "./room";
import { poseForState, type AgentState, type Pose } from "./poses";
import { byKey, type Seats } from "./selectors";

/**
 * Pure scene model: what each state looks like, where things stand, who is in a subagent
 * slot or the door queue, bubble text, and stable shirts. No DOM, no React, no clock.
 */

export type { Point };

export type Look = {
  pose: Pose;
  /** Where the agent stands once settled: its desk seat or the coffee station. */
  place: "seat" | "coffee";
  /** The monitor: live (animated) while working, still (steady, half lit) while waiting, else off. */
  screen: "off" | "still" | "live";
  ring: boolean;
  bubble: boolean;
};

// Mirrors the "State to look" matrix in DESIGN.md. Attention is never one cue alone (8B).
export function lookFor(state: AgentState): Look {
  return {
    pose: poseForState(state),
    place: state === "waiting-on-subagents" ? "coffee" : "seat",
    screen: state === "working" ? "live" : state === "waiting-on-subagents" ? "still" : "off",
    ring: state === "attention",
    bubble: state === "attention",
  };
}

export const bubbleText = (trigger: AttentionTrigger | undefined): string =>
  trigger === "tool" ? "Stuck?" : "Asking you";

/**
 * Shirts per project, kept while the project stays active so a shirt never changes under a
 * running agent; new projects take a shirt no active project holds. Unknown paths get none.
 */
export function assignShirts(
  prev: Record<string, ShirtChoice>,
  projects: Record<string, string>,
  active: readonly string[],
): Record<string, ShirtChoice> {
  const next: Record<string, ShirtChoice> = {};
  const ids = active.filter((id) => id in projects);
  for (const id of ids) if (prev[id]) next[id] = prev[id];
  for (const id of ids) {
    if (!next[id]) next[id] = pickShirt(projects[id], Object.values(next));
  }
  return next;
}

/** Highest seat of a present agent plus one (a leaver keeps its seat while it walks out). */
export function deskCountFor(office: OfficeState, seats: Seats): number {
  let count = 0;
  for (const a of Object.values(office.agents)) {
    const desk = seats[a.sessionId];
    if (desk !== undefined) count = Math.max(count, desk + 1);
  }
  return count;
}

/**
 * Desks the room needs (whole rows), counted the way `assignWorkDesks` will fill
 * them. `present` are the seats of agents in the office, `occupied` EVERY seat-table desk (a
 * departed session keeps its seat for hours), `held` the desks present subagents already hold
 * (leavers too, while they walk out), `needed` the subagents still wanting a desk. The count is the
 * smallest one that covers the highest present seat, the highest held desk and gives every needed
 * subagent a desk that is neither occupied nor held. DESK_CAP limits only that growth for new
 * subagents: the base (seats, held desks) is never reduced, however high the seat table runs.
 */
export function deskDemand(
  present: readonly number[],
  occupied: readonly number[],
  held: readonly number[],
  needed: number,
): number {
  const taken = new Set([...occupied, ...held]);
  const base = Math.max(0, ...present.map((d) => d + 1), ...held.map((d) => d + 1));
  const free = (n: number) => n - [...taken].filter((d) => d < n).length;
  let n = base;
  while (n < DESK_CAP && free(n) < needed) n++;
  return Math.ceil(n / DESKS_PER_ROW) * DESKS_PER_ROW;
}

/** `deskDemand` for a scene: what planMotion will do with these agents, seats and held desks. */
export function sceneDemand(
  agents: readonly Agent[],
  seats: Seats,
  prevDesks: ReadonlyMap<string, number | null>,
): number {
  const occupied = Object.values(seats);
  const seatSet = new Set(occupied);
  const held = new Set<number>();
  let needed = 0;
  for (const a of agents) {
    if (a.agentId === null || seats[a.sessionId] === undefined) continue;
    const had = prevDesks.get(a.key);
    if (typeof had === "number" && !seatSet.has(had)) held.add(had);
    else if (had !== null && a.phase !== "leaving") needed++;
  }
  const present = agents.flatMap((a) => seats[a.sessionId] ?? []);
  return deskDemand(present, occupied, [...held], needed);
}

/** Rows drawn, how long lower demand has lasted, and the rows subagents alone are holding (0: none). */
export type RowHold = { rows: number; since: number; held: number };

/** How long extra rows stay after the subagents that needed them are gone. */
export const HOLD_MS = 60_000;

/**
 * Rows grow at once and shrink only after HOLD_MS of continuously lower demand. Only the rows above
 * the sessions' own are held: when sessions leave their rows go at once, as before. A clock that
 * runs backwards counts as no time passed.
 */
export function stepRowHold(
  prev: RowHold | null,
  sessionRows: number,
  demandRows: number,
  now: number,
): RowHold {
  const want = demandRows > sessionRows ? demandRows : 0;
  let { held, since } = prev ?? { held: 0, since: now };
  if (want >= held || Math.max(0, now - since) >= HOLD_MS) {
    held = want;
    since = now;
  }
  return { rows: Math.max(sessionRows, held), since, held };
}

/** How long a new desk keeps its pop-in class: --dur-base, so a re-render mid-pop does not cut it. */
export const DESK_POP_MS = 240;

/** Desks that did not exist in the previous render (none on the first render, null). */
export function newDeskIndexes(prevCount: number | null, nextCount: number): number[] {
  if (prevCount === null) return [];
  return Array.from({ length: Math.max(0, nextCount - prevCount) }, (_, i) => prevCount + i);
}

/**
 * The desk at an index, clamped into the room. Normally the demand rule keeps held desks in range,
 * but the clamp does run when a leaver's desk was taken by a seat and the room shrank.
 */
const deskIn = (layout: OfficeLayout, desk: number) =>
  layout.desks[Math.max(0, Math.min(desk, layout.desks.length - 1))];

/** Stacking value of a desk: its figure sorts behind it when seated. */
export const deskZ = (layout: OfficeLayout, desk: number): number =>
  Math.round(deskIn(layout, desk).y + 30);

export const SLOTS_PER_DESK = 2;
/** Queued subagents drawn near the door; the rest only count toward the parent's "+N". */
export const QUEUE_VISIBLE = QUEUE_SPOTS;

export type SubagentPlan = {
  slot: Map<string, { desk: number; index: number }>;
  /** Waiting near the door, in arrival order. */
  queue: string[];
  /** Parent session id to how many of its subagents wait in the queue. */
  overflow: Map<string, number>;
};

/** Two standing slots per desk (8C); extras and subagents of an unseated session queue. */
export function planSubagents(agents: readonly Agent[], seats: Readonly<Record<string, number>>) {
  const plan: SubagentPlan = { slot: new Map(), queue: [], overflow: new Map() };
  const used = new Map<string, number>();
  const kids = agents
    .filter((a) => a.agentId !== null && a.state !== "leaving")
    .sort((a, b) => a.arrivedAt - b.arrivedAt || byKey(a, b));
  for (const k of kids) {
    const desk = seats[k.sessionId];
    const taken = used.get(k.sessionId) ?? 0;
    if (desk !== undefined && taken < SLOTS_PER_DESK) {
      plan.slot.set(k.key, { desk, index: taken });
      used.set(k.sessionId, taken + 1);
    } else {
      plan.queue.push(k.key);
      if (desk !== undefined)
        plan.overflow.set(k.sessionId, (plan.overflow.get(k.sessionId) ?? 0) + 1);
    }
  }
  return plan;
}

/** Overlay tag size, in screen px: the chars are a monospace-ish estimate, the height is padding plus a line. */
export const TAG_H = 24;
export const tagWidth = (name: string, project: string, extra: number): number =>
  (name.length + 1 + project.length + (extra > 0 ? 4 : 0)) * 7 + 16;

/** Foot point to the rig's top-left: seated frames end at the chair base, standing at the soles. */
export const SEATED_FOOT = RIG_HEIGHT;
export const STANDING_FOOT = 90;

/** Subagent standing spots beside a desk, px from its center: clear of the seat at its left. */
const SLOT_X = [4, 56] as const;

export type Geometry = {
  door: Point;
  coffee: Point;
  dispenser: Point;
  /** Top-left of the desk sprite. */
  desk(index: number): Point;
  /** Foot point (bottom center of the rig) of the seated agent at a desk. */
  seat(index: number): Point;
  slot(desk: number, index: number): Point;
  coffeeSpot(i: number): Point;
  waterSpot(i: number): Point;
  queueSpot(i: number): Point;
};

/**
 * Door and coffee station stand on the back walls (room.ts), anchored to the back desk, so a
 * new row never moves them. Points are unscaled room px; door and coffee are bottom-center
 * anchors.
 */
export function geometryFor(layout: OfficeLayout): Geometry {
  const shell = roomShell(layout);
  const deskPoint = (i: number): Point => {
    const d = deskIn(layout, i);
    return { x: d.x - DESK_WIDTH / 2, y: d.y - (DESK_HEIGHT * 3) / 4 };
  };
  return {
    door: shell.door,
    coffee: shell.coffee,
    dispenser: shell.dispenser,
    desk: deskPoint,
    seat: (i) => {
      const top = deskPoint(i);
      return {
        x: top.x + SEAT_AT[0] * CELL + RIG_WIDTH / 2,
        y: top.y + SEAT_AT[1] * CELL + RIG_HEIGHT,
      };
    },
    slot: (desk, index) => {
      const d = deskIn(layout, desk);
      return { x: d.x + (index === 0 ? SLOT_X[0] : SLOT_X[1]), y: d.y + 62 };
    },
    coffeeSpot: shell.coffeeSpot,
    waterSpot: shell.waterSpot,
    queueSpot: shell.queueSpot,
  };
}

/** True when the focused element was removed from the page and focus fell back to the body. */
export function lostFocus(
  last: { isConnected: boolean } | null,
  active: unknown,
  body: unknown,
): boolean {
  return last !== null && !last.isConnected && (active === null || active === body);
}
