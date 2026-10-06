import type { Connection } from "./feed-client";
import { agentIdentity, projectLabel } from "./label";
import type { Agent, OfficeState } from "./machine";
import { announceNew } from "./selectors";

/** Pure rules behind TopBar, kept out of the component file for fast refresh. */

export const MINUTE_MS = 60 * 1000;

/** Status banner text, highest priority first (DR2); null when the feed is live. */
export function statusLine(conn: Connection, displayError: boolean): string | null {
  if (displayError) return "Display error: reload the page";
  switch (conn) {
    case "refused":
      return "Refused: open this page from localhost";
    case "unavailable":
      return "Feed unavailable, retrying";
    case "reconnecting":
      return "Reconnecting...";
    case "connecting":
      return "Connecting...";
    case "no-sessions":
      return "No active Claude Code sessions";
    default:
      return null;
  }
}

/** Color family of the status line (DR3): amber for trouble, muted for waiting and empty. */
export function statusTone(conn: Connection, displayError: boolean): "warn" | "muted" | null {
  if (statusLine(conn, displayError) === null) return null;
  if (displayError) return "warn";
  return conn === "connecting" || conn === "no-sessions" ? "muted" : "warn";
}

/** Live-region content; `seq` changes on every announcement so a repeat is read again. */
export type Announcement = { text: string; seq: number };

/** Spoken text for agents that started waiting, per DESIGN.md Accessibility. */
export function announcementText(
  agents: readonly Agent[],
  projects: Readonly<Record<string, string>>,
): string {
  return agents
    .map((a) => {
      const path = projects[a.projectId];
      const parts = [agentIdentity(a.sessionId, a.agentId).name];
      if (path) parts.push(projectLabel(path));
      parts.push(a.attention?.trigger === "tool" ? "may be stuck" : "asking you");
      return parts.join(", ");
    })
    .join(". ");
}

/** Wait label in whole minutes, so it changes only on minute boundaries; null when unknown. */
export function waitLabel(waitingSince: number | null, now: number): string | null {
  if (waitingSince === null) return null;
  const m = Math.max(0, Math.floor((now - waitingSince) / MINUTE_MS));
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Key to pulse for a chip click, or null when the agent has left or stopped waiting (D18). */
export function chipClickTarget(office: OfficeState, key: string): string | null {
  const a = office.agents[key];
  return a && a.state === "attention" ? key : null;
}

/** Most chips shown in the normal layout; the rest collapse into plain "+N" text (DR1). */
export const MAX_VISIBLE_CHIPS = 4;

/** DR11: the narrow state shows every waiting chip (wrapped), the normal state caps at DR1. */
export function visibleChips<T>(
  chips: readonly T[],
  narrow: boolean,
): { shown: T[]; hidden: number } {
  if (narrow || chips.length <= MAX_VISIBLE_CHIPS) return { shown: [...chips], hidden: 0 };
  return { shown: chips.slice(0, MAX_VISIBLE_CHIPS), hidden: chips.length - MAX_VISIBLE_CHIPS };
}

/** One step of the announcer: advances the seen set and, for a new wait, the live-region seq; `announced` feeds the chime. */
export function stepAnnouncer(
  office: OfficeState,
  projects: Readonly<Record<string, string>>,
  seen: ReadonlySet<string>,
  prev: Announcement,
): { seen: ReadonlySet<string>; announcement: Announcement; announced: Agent[] } {
  const r = announceNew(office, seen);
  if (r.announce.length === 0) return { seen: r.seen, announcement: prev, announced: [] };
  return {
    seen: r.seen,
    announced: r.announce,
    announcement: { text: announcementText(r.announce, projects), seq: prev.seq + 1 },
  };
}

/** The announcer effect's body: one step, plus a `notify` call when new waits were announced. */
export function runAnnouncer(
  office: OfficeState,
  projects: Readonly<Record<string, string>>,
  seen: ReadonlySet<string>,
  prev: Announcement,
  notify: (announced: Agent[]) => void,
): ReturnType<typeof stepAnnouncer> {
  const r = stepAnnouncer(office, projects, seen, prev);
  if (r.announced.length > 0) notify(r.announced);
  return r;
}
