// TopBar props: `state` is the FeedState from useOffice (office, seats, projects, connection, failure).
// `displayError` is true once the error boundary has caught; `onPulse(key)` pulses that agent's character.
// Chips show the longest wait first; a click on a departed or no-longer-waiting agent is a no-op.
import { useEffect, useRef, useState } from "react";
import type { FeedState } from "./feed-client";
import { agentIdentity, projectLabel } from "./label";
import { waitingChips, type WaitingChip } from "./selectors";
import {
  chipClickTarget,
  MINUTE_MS,
  stepAnnouncer,
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

export function TopBar({
  state,
  displayError,
  narrow = false,
  onPulse,
}: {
  state: FeedState;
  displayError: boolean;
  /** Below 800x500 every chip wraps into extra rows (DR11); otherwise extra chips fold into "+N". */
  narrow?: boolean;
  onPulse: (key: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => clearInterval(id);
  }, []);

  const seen = useRef<ReadonlySet<string>>(new Set());
  const [announcement, setAnnouncement] = useState<Announcement>({ text: "", seq: 0 });
  const announcementRef = useRef(announcement);
  useEffect(() => {
    const r = stepAnnouncer(state.office, state.projects, seen.current, announcementRef.current);
    seen.current = r.seen;
    if (r.announcement === announcementRef.current) return;
    announcementRef.current = r.announcement;
    setAnnouncement(r.announcement);
  }, [state.office, state.projects]);

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
      <div aria-live="polite" className="visually-hidden">
        <span key={announcement.seq}>{announcement.text}</span>
      </div>
    </header>
  );
}
