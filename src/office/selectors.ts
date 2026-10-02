import type { Agent, OfficeState } from "./machine";

/**
 * Pure ordered views over the office state (E2, R3/D4). Chips, focus order, the announcer
 * and the tab title all read these, so the orders cannot drift apart.
 * `seats` maps sessionId to desk index (the server's seat map, D8).
 */

export type Seats = Readonly<Record<string, number>>;

export type WaitingChip = {
  key: string;
  agent: Agent;
  /** Epoch ms the wait began; null when unknown, and the chip then shows no wait time. */
  waitingSince: number | null;
};

/** Agents by key: the one tie-break every ordered view shares. */
export const byKey = (a: { key: string }, b: { key: string }) =>
  a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

/** A missing seat sorts after every seated agent. */
function deskOf(a: Agent, seats: Seats): number {
  return seats[a.sessionId] ?? Number.POSITIVE_INFINITY;
}

function byDesk(seats: Seats) {
  return (a: Agent, b: Agent) => {
    const da = deskOf(a, seats);
    const db = deskOf(b, seats);
    return da === db ? byKey(a, b) : da < db ? -1 : 1;
  };
}

function waitingAgents(state: OfficeState): Agent[] {
  return Object.values(state.agents).filter((a) => a.state === "attention");
}

/** Agents in desk order, ties by key; leaving agents are not seated. */
export function deskOrder(state: OfficeState, seats: Seats): Agent[] {
  return Object.values(state.agents)
    .filter((a) => a.state !== "leaving")
    .sort(byDesk(seats));
}

/** Waiting chips, longest wait first; equal waits by key (D18); unknown waits last. */
export function waitingChips(state: OfficeState): WaitingChip[] {
  return waitingAgents(state)
    .map((agent) => ({
      key: agent.key,
      agent,
      waitingSince: agent.episode?.waitingSince ?? null,
    }))
    .sort((a, b) => {
      if (a.waitingSince === b.waitingSince) return byKey(a.agent, b.agent);
      if (a.waitingSince === null) return 1;
      if (b.waitingSince === null) return -1;
      return a.waitingSince - b.waitingSince;
    });
}

/** Keyboard focus order: waiting agents first (chip order), then the rest by desk. */
export function focusOrder(state: OfficeState, seats: Seats): Agent[] {
  const waiting = waitingChips(state).map((c) => c.agent);
  const rest = deskOrder(state, seats).filter((a) => a.state !== "attention");
  return [...waiting, ...rest];
}

/** N in the tab title `(N) Agent Office`. */
export function waitingCount(state: OfficeState): number {
  return waitingAgents(state).length;
}

/** Id of one announced wait: the agent plus when its wait began (D3). */
export function announceKey(a: Agent): string | null {
  return a.episode ? `${a.key}@${a.episode.waitingSince}` : null;
}

/**
 * Announcer (D3): returns the agents whose wait has not been announced in this page
 * session, and the updated seen set. A replayed episode keeps its agent and wait start, so
 * it stays silent; a new wait, including the same agent's, announces.
 */
export function announceNew(
  state: OfficeState,
  seen: ReadonlySet<string>,
): { announce: Agent[]; seen: Set<string> } {
  const next = new Set(seen);
  const announce: Agent[] = [];
  for (const { agent } of waitingChips(state)) {
    const id = announceKey(agent);
    if (id === null || next.has(id)) continue;
    next.add(id);
    announce.push(agent);
  }
  return { announce, seen: next };
}
