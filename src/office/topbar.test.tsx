import { describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Connection, FeedState } from "./feed-client";
import { TopBar } from "./TopBar";
import {
  announcementText,
  chipClickTarget,
  MINUTE_MS,
  MAX_VISIBLE_CHIPS,
  runAnnouncer,
  stepAnnouncer,
  visibleChips,
  statusLine,
  statusTone,
  waitLabel,
} from "./topbar-logic";
import { BASE_TITLE, faviconHref, titleFor } from "./useDocumentChrome";
import {
  displayErrorShown,
  isTooSmall,
  findAgentWrapper,
  nextSceneKey,
  TOO_SMALL_NOTICE,
} from "./app-logic";
import { agentKey, createOffice, type Agent } from "./machine";

function agent(sessionId: string): Agent {
  return {
    key: agentKey(sessionId, null),
    sessionId,
    agentId: null,
    projectId: "p",
    parentAgentId: null,
    state: "working",
    phase: "working",
    arrivedAt: 0,
    lastEventAt: 0,
    idleSince: null,
    leftAt: null,
    openTools: {},
    unresolved: {},
    waitingOn: [],
    attention: null,
    episode: null,
  };
}

const CONNECTIONS: Connection[] = [
  "connecting",
  "live",
  "reconnecting",
  "refused",
  "unavailable",
  "no-sessions",
];

describe("statusLine", () => {
  it("Display error wins over every connection, with the DR3 wording", () => {
    for (const c of CONNECTIONS) {
      expect(statusLine(c, true)).toBe("Display error: reload the page");
      expect(statusTone(c, true)).toBe("warn");
    }
  });
  it("words each connection per DR2 and DR3", () => {
    expect(statusLine("connecting", false)).toBe("Connecting...");
    expect(statusLine("reconnecting", false)).toBe("Reconnecting...");
    expect(statusLine("refused", false)).toBe("Refused: open this page from localhost");
    expect(statusLine("unavailable", false)).toBe("Feed unavailable, retrying");
    expect(statusLine("no-sessions", false)).toBe("No active Claude Code sessions");
    expect(statusLine("live", false)).toBeNull();
  });
  it("every pair of connections shows a different line", () => {
    for (const a of CONNECTIONS)
      for (const b of CONNECTIONS)
        if (a !== b && !(a === "live" && b === "live"))
          expect(statusLine(a, false)).not.toBe(statusLine(b, false));
  });
  it("uses muted for Connecting and No active sessions, warn for the rest", () => {
    expect(statusTone("connecting", false)).toBe("muted");
    expect(statusTone("no-sessions", false)).toBe("muted");
    for (const c of ["reconnecting", "refused", "unavailable"] as const)
      expect(statusTone(c, false)).toBe("warn");
    expect(statusTone("live", false)).toBeNull();
  });
});

describe("announcements", () => {
  it("reads name, project and trigger", () => {
    const a = { ...agent("s1"), attention: { trigger: "question" as const } };
    expect(announcementText([a], { p: "/work/atlas" })).toMatch(/^\w+, atlas, asking you$/);
    expect(announcementText([a], {})).toMatch(/^\w+, asking you$/);
  });
});

describe("TopBar", () => {
  const feed = (over: Partial<FeedState>): FeedState => ({
    office: createOffice(),
    seats: {},
    projects: {},
    connection: "live",
    skipped: { json: 0, frame: 0, event: 0 },
    failure: null,
    ...over,
  });
  const html = (state: FeedState, displayError = false) =>
    renderToStaticMarkup(
      <TopBar state={state} displayError={displayError} now={0} onPulse={() => {}} />,
    );

  it("shows Display error from state.failure alone", () => {
    expect(html(feed({ failure: new Error("x") }))).toContain("Display error: reload the page");
    expect(html(feed({}))).not.toContain("Display error");
  });
  it("shows Display error from the boundary flag", () => {
    expect(html(feed({}), true)).toContain("Display error: reload the page");
  });
  it("holds the page h1 in the header", () => {
    expect(html(feed({}))).toMatch(/<header[^>]*><h1[^>]*>Agent Office<\/h1>/);
  });
  it("marks the status tone", () => {
    expect(html(feed({ connection: "connecting" }))).toContain('data-tone="muted"');
    expect(html(feed({ connection: "refused" }))).toContain('data-tone="warn"');
  });
});

describe("TopBar wait clock", () => {
  const chip = (now: number) =>
    renderToStaticMarkup(
      <TopBar
        state={
          {
            office: officeOf(waitingAgent("s1", 1000)),
            seats: {},
            projects: {},
            connection: "live",
            skipped: { json: 0, frame: 0, event: 0 },
            failure: null,
          } as FeedState
        }
        displayError={false}
        now={now}
        onPulse={() => {}}
      />,
    );

  it("labels chips from the now it is given, the same clock the scene bubbles use", () => {
    expect(chip(1000 + 3 * MINUTE_MS)).toContain(" 3m</button>");
    expect(chip(1000 + 5 * MINUTE_MS)).toContain(" 5m</button>");
  });
});

describe("title and favicon", () => {
  it("shows the count only when N > 0", () => {
    expect(titleFor(0)).toBe(BASE_TITLE);
    expect(titleFor(3)).toBe("(3) Agent Office");
  });
  it("draws the dot only when N > 0", () => {
    expect(faviconHref(0)).not.toContain(encodeURIComponent("<circle"));
    expect(faviconHref(2)).toContain(encodeURIComponent("<circle"));
  });
});

describe("waitLabel", () => {
  it("is null when unknown", () => expect(waitLabel(null, 5)).toBeNull());
  it("changes only on minute boundaries", () => {
    const since = 1_000_000;
    expect(waitLabel(since, since + MINUTE_MS - 1)).toBe("<1m");
    expect(waitLabel(since, since + MINUTE_MS)).toBe("1m");
    expect(waitLabel(since, since + 2 * MINUTE_MS - 1)).toBe("1m");
    expect(waitLabel(since, since + 61 * MINUTE_MS)).toBe("1h 1m");
    expect(waitLabel(since, since - 5)).toBe("<1m");
  });
});

describe("chipClickTarget", () => {
  it("is a no-op for an agent that is no longer waiting", () => {
    const a = agent("s1");
    const office = { ...createOffice(), agents: { [a.key]: a } };
    expect(chipClickTarget(office, a.key)).toBeNull();
    const waiting = { ...a, state: "attention" as const };
    expect(chipClickTarget({ ...office, agents: { [a.key]: waiting } }, a.key)).toBe(a.key);
  });
  it("is a no-op for a departed agent", () => {
    expect(chipClickTarget(createOffice(), "gone")).toBeNull();
  });
});

const waitingAgent = (id: string, since: number): Agent => ({
  ...agent(id),
  state: "attention",
  attention: { trigger: "question" },
  episode: { id: `${id}#${since}`, waitingSince: since, exitedAt: null },
});
const officeOf = (...as: Agent[]) => ({
  ...createOffice(),
  agents: Object.fromEntries(as.map((a) => [a.key, a])),
});

describe("stepAnnouncer", () => {
  const first = { text: "", seq: 0 };
  it("announces a new wait, stays silent on a replay, re-announces the same agent's second wait", () => {
    const a = stepAnnouncer(officeOf(waitingAgent("s1", 100)), {}, new Set(), first);
    expect(a.announcement.seq).toBe(1);
    const replay = stepAnnouncer(officeOf(waitingAgent("s1", 100)), {}, a.seen, a.announcement);
    expect(replay.announcement).toBe(a.announcement);
    const again = stepAnnouncer(
      officeOf(waitingAgent("s1", 200)),
      {},
      replay.seen,
      replay.announcement,
    );
    expect(again.announcement.seq).toBe(2);
    expect(again.announcement.text).toBe(a.announcement.text);
  });
  it("reports the newly announced agents for the chime, none on a replay", () => {
    const a = stepAnnouncer(officeOf(waitingAgent("s1", 100)), {}, new Set(), first);
    expect(a.announced.map((x) => x.sessionId)).toEqual(["s1"]);
    const replay = stepAnnouncer(officeOf(waitingAgent("s1", 100)), {}, a.seen, a.announcement);
    expect(replay.announced).toEqual([]);
  });
});

describe("chime control", () => {
  it("runAnnouncer hands newly announced agents to notify, and nothing on a replay", () => {
    const notify = vi.fn<(a: Agent[]) => void>();
    const first = { text: "", seq: 0 };
    const a = runAnnouncer(officeOf(waitingAgent("s1", 100)), {}, new Set(), first, notify);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0].map((x) => x.sessionId)).toEqual(["s1"]);
    runAnnouncer(officeOf(waitingAgent("s1", 100)), {}, a.seen, a.announcement, notify);
    expect(notify).toHaveBeenCalledTimes(1);
  });
  it("renders a focusable button, off and unpressed by default", () => {
    const html = renderToStaticMarkup(
      <TopBar
        state={{
          office: createOffice(),
          seats: {},
          projects: {},
          connection: "live",
          skipped: { json: 0, frame: 0, event: 0 },
          failure: null,
        }}
        displayError={false}
        now={0}
        onPulse={() => {}}
      />,
    );
    expect(html).toMatch(/<button type="button" class="top-bar-chime" aria-pressed="false"/);
    expect(html).toContain('data-status="off"');
    expect(html).toContain("Chime off");
  });
});

describe("narrow window (DR8)", () => {
  it("is too small at 799x499 and 799x500 and 800x499, not at 800x500", () => {
    expect(isTooSmall({ width: 799, height: 499 })).toBe(true);
    expect(isTooSmall({ width: 799, height: 500 })).toBe(true);
    expect(isTooSmall({ width: 800, height: 499 })).toBe(true);
    expect(isTooSmall({ width: 800, height: 500 })).toBe(false);
  });
  it("words the notice", () => expect(TOO_SMALL_NOTICE).toBe("Make this window larger"));
});

describe("display error flag (D16)", () => {
  it("shows only for the scene boundary that caught", () => {
    expect(displayErrorShown(null, 0)).toBe(false);
    expect(displayErrorShown(0, 0)).toBe(true);
    expect(displayErrorShown(0, 1)).toBe(false);
  });

  it("bumps the scene key when the room returns from the narrow state, not otherwise", () => {
    expect(nextSceneKey(0, true, false)).toBe(1);
    expect(nextSceneKey(1, false, false)).toBe(1);
    expect(nextSceneKey(1, false, true)).toBe(1);
    expect(nextSceneKey(1, true, true)).toBe(1);
  });

  it("survives a catch followed at once by StrictMode's unmount of the new boundary", () => {
    let key = 0;
    let caught: number | null = null;
    // Wide: the boundary catches (componentDidCatch records the key it was rendered with).
    caught = key;
    // StrictMode double-invokes componentWillUnmount on the fresh boundary: nothing is recorded.
    expect(displayErrorShown(caught, key)).toBe(true);
    // Narrow then wide again: a new boundary under a new key, flag cleared until it catches.
    key = nextSceneKey(key, true, false);
    expect(displayErrorShown(caught, key)).toBe(false);
    caught = key;
    expect(displayErrorShown(caught, key)).toBe(true);
  });
});

describe("waiting chips (DR1, DR11)", () => {
  const many = Array.from({ length: 14 }, (_, i) => i);
  it("caps the normal layout and counts the rest", () => {
    const r = visibleChips(many, false);
    expect(r.shown).toHaveLength(MAX_VISIBLE_CHIPS);
    expect(r.hidden).toBe(14 - MAX_VISIBLE_CHIPS);
    expect(visibleChips(many.slice(0, MAX_VISIBLE_CHIPS), false).hidden).toBe(0);
  });
  it("shows every chip in the narrow state", () => {
    expect(visibleChips(many, true)).toEqual({ shown: many, hidden: 0 });
  });
  it("renders the cap, the +N text and the narrow marker", () => {
    const agents = many.map((i) => waitingAgent(`s${i}`, 100 + i));
    const state = {
      office: officeOf(...agents),
      seats: {},
      projects: {},
      connection: "live",
      skipped: { json: 0, frame: 0, event: 0 },
      failure: null,
    } as FeedState;
    const wide = renderToStaticMarkup(
      <TopBar state={state} displayError={false} now={0} onPulse={() => {}} />,
    );
    expect(wide.match(/top-bar-chip"/g)).toHaveLength(MAX_VISIBLE_CHIPS);
    expect(wide).toContain('aria-label="and 10 more waiting"');
    expect(wide).not.toContain("data-narrow");
    const narrow = renderToStaticMarkup(
      <TopBar state={state} displayError={false} narrow now={0} onPulse={() => {}} />,
    );
    expect(narrow.match(/top-bar-chip"/g)).toHaveLength(14);
    expect(narrow).not.toContain("top-bar-more");
    expect(narrow).toContain("data-narrow");
  });
});

describe("findAgentWrapper", () => {
  const el = (key: string) => ({ getAttribute: (n: string) => (n === "data-agent" ? key : null) });

  it("matches a key containing a NUL char by exact attribute value", () => {
    const key = "demo-session-1\u0000";
    const a = el("demo-session-1");
    const b = el(key);
    expect(findAgentWrapper([a, b], key)).toBe(b);
  });

  it("returns undefined when nothing matches", () => {
    expect(findAgentWrapper([el("a")], "b")).toBeUndefined();
  });
});
