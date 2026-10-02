import type { Agent, AttentionTrigger, OfficeState } from "./machine";
import { DESK_HEIGHT, DESK_WIDTH, RIG_HEIGHT, RIG_WIDTH } from "./CharacterRig";
import type { OfficeLayout } from "./iso";
import { pickShirt, type ShirtChoice } from "./identity";
import { CELL } from "./pixel";
import { roomShell, SEAT_AT, type Point } from "./room";
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
  lit: boolean;
  ring: boolean;
  bubble: boolean;
};

// Mirrors the "State to look" matrix in DESIGN.md. Attention is never one cue alone (8B).
export function lookFor(state: AgentState): Look {
  return {
    pose: poseForState(state),
    place: state === "waiting-on-subagents" ? "coffee" : "seat",
    lit: state === "working",
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

export const SLOTS_PER_DESK = 2;
/** Queued subagents drawn near the door; the rest only count toward the parent's "+N". */
export const QUEUE_VISIBLE = 4;

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
  /** Top-left of the desk sprite. */
  desk(index: number): Point;
  /** Foot point (bottom center of the rig) of the seated agent at a desk. */
  seat(index: number): Point;
  slot(desk: number, index: number): Point;
  coffeeSpot(i: number): Point;
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
    const d = layout.desks[i];
    return { x: d.x - DESK_WIDTH / 2, y: d.y - (DESK_HEIGHT * 3) / 4 };
  };
  return {
    door: shell.door,
    coffee: shell.coffee,
    desk: deskPoint,
    seat: (i) => {
      const top = deskPoint(i);
      return {
        x: top.x + SEAT_AT[0] * CELL + RIG_WIDTH / 2,
        y: top.y + SEAT_AT[1] * CELL + RIG_HEIGHT,
      };
    },
    slot: (desk, index) => {
      const d = layout.desks[desk];
      return { x: d.x + (index === 0 ? SLOT_X[0] : SLOT_X[1]), y: d.y + 62 };
    },
    coffeeSpot: shell.coffeeSpot,
    queueSpot: shell.queueSpot,
  };
}
