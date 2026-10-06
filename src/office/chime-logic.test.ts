import { describe, expect, it } from "vite-plus/test";
import {
  CHIME_MIN_GAP_MS,
  chimeLabel,
  chimeStatus,
  chimeText,
  nextEnabled,
  parseChimePref,
  shouldChime,
} from "./chime-logic";
import { agentKey, type Agent } from "./machine";

function waiting(sessionId: string, since: number): Agent {
  return {
    key: agentKey(sessionId, null),
    sessionId,
    agentId: null,
    projectId: "p",
    parentAgentId: null,
    state: "attention",
    phase: "working",
    arrivedAt: 0,
    lastEventAt: since,
    idleSince: null,
    leftAt: null,
    openTools: {},
    unresolved: {},
    waitingOn: [],
    attention: { trigger: "question" },
    episode: { id: `${sessionId}#${since}`, waitingSince: since, exitedAt: null },
  };
}

const base = { enabled: true, loadedAt: 1000, now: 5000, lastChimeAt: null };

describe("chime preference", () => {
  it("is off by default and for any stored value but on", () => {
    expect(parseChimePref(null)).toBe(false);
    expect(parseChimePref("off")).toBe(false);
    expect(parseChimePref("garbage")).toBe(false);
    expect(parseChimePref("on")).toBe(true);
  });
  it("shows off, on, or blocked until a click unlocks audio", () => {
    expect(chimeStatus(false, false)).toBe("off");
    expect(chimeStatus(false, true)).toBe("off");
    expect(chimeStatus(true, false)).toBe("blocked");
    expect(chimeStatus(true, true)).toBe("on");
    expect(chimeText("blocked")).toBe("Chime: click");
    expect(chimeLabel("blocked")).toContain("click");
  });
  it("starts the accessible name with the visible text (label in name)", () => {
    for (const status of ["off", "on", "blocked"] as const) {
      expect(chimeLabel(status).startsWith(chimeText(status))).toBe(true);
    }
    expect(chimeLabel("blocked")).toBe("Chime: click, click to enable sound");
  });
  it("a click on a blocked control retries once, then turns off after a failed unlock", () => {
    expect(nextEnabled(true, "blocked", false)).toBe(true);
    expect(nextEnabled(true, "blocked", true)).toBe(false);
    expect(nextEnabled(true, "on", false)).toBe(false);
    expect(nextEnabled(false, "off", false)).toBe(true);
    expect(nextEnabled(false, "off", true)).toBe(true);
  });
});

describe("shouldChime", () => {
  it("is silent while off, even for a new wait", () => {
    expect(shouldChime({ ...base, enabled: false, announced: [waiting("a", 2000)] })).toBe(false);
  });
  it("fires for a wait that began after the page loaded", () => {
    expect(shouldChime({ ...base, announced: [waiting("a", 2000)] })).toBe(true);
  });
  it("stays silent for a replayed wait from before the page loaded", () => {
    expect(shouldChime({ ...base, announced: [waiting("a", 500), waiting("b", 999)] })).toBe(false);
  });
  it("still chimes for a waitingSince dated after now (clock skew)", () => {
    expect(shouldChime({ ...base, announced: [waiting("a", base.now + 60_000)] })).toBe(true);
  });
  it("is silent when nothing was announced", () => {
    expect(shouldChime({ ...base, announced: [] })).toBe(false);
  });
  it("a burst of agents is one decision, and the window then holds it back", () => {
    const burst = [waiting("a", 2000), waiting("b", 2000), waiting("c", 2100)];
    expect(shouldChime({ ...base, announced: burst })).toBe(true);
    const at = base.now;
    expect(
      shouldChime({
        ...base,
        now: at + CHIME_MIN_GAP_MS - 1,
        lastChimeAt: at,
        announced: [waiting("d", 6000)],
      }),
    ).toBe(false);
    expect(
      shouldChime({
        ...base,
        now: at + CHIME_MIN_GAP_MS,
        lastChimeAt: at,
        announced: [waiting("d", 6000)],
      }),
    ).toBe(true);
  });
});
