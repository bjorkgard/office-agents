// TopBar props: `state` is the FeedState from useOffice (office, seats, projects, connection, failure).
// `now` is the shared wait clock (ms). `displayError` is true once the error boundary has caught; `onPulse(key)` pulses that agent's character.
// Chips show the longest wait first; a click on a departed or no-longer-waiting agent is a no-op.
import { useEffect, useRef, useState } from "react";
import { chimeLabel, chimeText, type ChimeStatus } from "./chime-logic";
import type { FeedState } from "./feed-client";
import { agentIdentity, projectLabel } from "./label";
import { waitingChips, type WaitingChip } from "./selectors";
import { useChime } from "./useChime";
import {
  chipClickTarget,
  runAnnouncer,
  statusLine,
  statusTone,
  visibleChips,
  waitLabel,
  type Announcement,
} from "./topbar-logic";

function chipText(c: WaitingChip, projects: Record<string, string>): string {
  const id = agentIdentity(c.agent.sessionId, c.agent.agentId);
  const path = projects[c.agent.projectId];
  return `${id.name}${path ? ` in ${projectLabel(path)}` : ""}`;
}

/** Speaker glyph per chime status: slash when off, waves when on, exclamation when blocked. */
export function ChimeGlyph({ status }: { status: ChimeStatus }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 6h2.5L8 3v10L4.5 10H2z" />
      {status === "off" && <path d="M11 6l4 4M15 6l-4 4" />}
      {status === "on" && <path d="M11 6c1 1 1 3 0 4M13 4c2 2.5 2 5.5 0 8" />}
      {status === "blocked" && <path d="M12.5 5v3.5M12.5 11v.5" />}
    </svg>
  );
}

export function TopBar({
  state,
  displayError,
  narrow = false,
  now,
  onPulse,
}: {
  state: FeedState;
  displayError: boolean;
  /** Below 800x500 every chip wraps into extra rows (DR11); otherwise extra chips fold into "+N". */
  narrow?: boolean;
  /** The app's one wait clock, shared with the scene bubbles so both show the same wait. */
  now: number;
  onPulse: (key: string) => void;
}) {
  const seen = useRef<ReadonlySet<string>>(new Set());
  const [announcement, setAnnouncement] = useState<Announcement>({ text: "", seq: 0 });
  const announcementRef = useRef(announcement);
  const chime = useChime();
  const { notify } = chime;
  useEffect(() => {
    const r = runAnnouncer(
      state.office,
      state.projects,
      seen.current,
      announcementRef.current,
      notify,
    );
    seen.current = r.seen;
    if (r.announcement === announcementRef.current) return;
    announcementRef.current = r.announcement;
    setAnnouncement(r.announcement);
  }, [state.office, state.projects, notify]);

  const failed = displayError || state.failure !== null;
  const line = statusLine(state.connection, failed);
  const tone = statusTone(state.connection, failed);
  const { shown, hidden } = visibleChips(waitingChips(state.office), narrow);

  return (
    <header className="top-bar" data-narrow={narrow ? "" : undefined}>
      <h1 className="visually-hidden">Agent Office</h1>
      {line && (
        <span className="top-bar-status" data-tone={tone} role="status">
          {line}
        </span>
      )}
      <ul className="top-bar-chips">
        {shown.map((c) => {
          const wait = waitLabel(c.waitingSince, now);
          return (
            <li key={c.key}>
              <button
                type="button"
                className="top-bar-chip"
                onClick={() => {
                  const target = chipClickTarget(state.office, c.key);
                  if (target) onPulse(target);
                }}
              >
                {chipText(c, state.projects)}
                {wait ? ` ${wait}` : ""}
              </button>
            </li>
          );
        })}
        {hidden > 0 && (
          <li className="top-bar-more" aria-label={`and ${hidden} more waiting`}>
            +{hidden}
          </li>
        )}
      </ul>
      <button
        type="button"
        className="top-bar-chime"
        aria-label={chimeLabel(chime.status)}
        data-status={chime.status}
        onClick={chime.toggle}
      >
        <ChimeGlyph status={chime.status} /> {chimeText(chime.status)}
      </button>
      <div aria-live="polite" className="visually-hidden">
        <span key={announcement.seq}>{announcement.text}</span>
      </div>
    </header>
  );
}
