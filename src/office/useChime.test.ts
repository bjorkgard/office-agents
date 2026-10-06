import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { agentKey, type Agent } from "./machine";

const audio = vi.hoisted(() => ({
  unlock: vi.fn<() => Promise<boolean>>(),
  play: vi.fn<() => Promise<boolean>>(),
}));
vi.mock("./chime-audio", () => ({ unlockChime: audio.unlock, playChime: audio.play }));

import { createChime, UNLOCK_TIMEOUT_MS } from "./useChime";

const store = new Map<string, string>();
const flush = () => new Promise((r) => setTimeout(r, 0));

function waiting(since: number): Agent {
  return {
    key: agentKey("s", null),
    sessionId: "s",
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
    episode: { id: `s#${since}`, waitingSince: since, exitedAt: null },
  };
}

beforeEach(() => {
  store.clear();
  audio.unlock.mockReset();
  audio.play.mockReset();
  audio.play.mockResolvedValue(true);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
});

describe("createChime", () => {
  it("a stored on whose unlock fails ends off, stored off, on the second click", async () => {
    store.set("agent-office.chime", "on");
    audio.unlock.mockResolvedValue(false);
    const c = createChime(() => 1000);
    expect(c.status()).toBe("blocked");
    c.toggle();
    await flush();
    expect(c.status()).toBe("blocked");
    expect(store.get("agent-office.chime")).toBe("on");
    c.toggle();
    expect(c.status()).toBe("off");
    expect(store.get("agent-office.chime")).toBe("off");
  });
  it("an unlock that succeeds goes on and chimes once; the next click is one click off", async () => {
    audio.unlock.mockResolvedValue(true);
    const c = createChime(() => 1000);
    c.toggle();
    await flush();
    expect(c.status()).toBe("on");
    expect(store.get("agent-office.chime")).toBe("on");
    expect(audio.play).toHaveBeenCalledTimes(1);
    c.toggle();
    expect(c.status()).toBe("off");
    expect(store.get("agent-office.chime")).toBe("off");
  });
  it("a stored on that unlocks on the first click turns off on the second", async () => {
    store.set("agent-office.chime", "on");
    audio.unlock.mockResolvedValue(true);
    const c = createChime(() => 1000);
    c.toggle();
    await flush();
    c.toggle();
    expect(c.status()).toBe("off");
  });
  it("notify chimes for a new wait only while on and unlocked", async () => {
    audio.unlock.mockResolvedValue(true);
    let t = 1000;
    const c = createChime(() => t);
    t = 2000;
    c.notify([waiting(1500)]);
    expect(audio.play).not.toHaveBeenCalled();
    c.toggle();
    await flush();
    audio.play.mockClear();
    t = 9000;
    c.notify([waiting(8500)]);
    expect(audio.play).toHaveBeenCalledTimes(1);
    c.toggle();
    audio.play.mockClear();
    t = 20000;
    c.notify([waiting(19500)]);
    expect(audio.play).not.toHaveBeenCalled();
  });
  it("a chime that cannot play goes back to blocked, and the next click retries the unlock", async () => {
    audio.unlock.mockResolvedValue(true);
    const c = createChime(() => 1000);
    c.toggle();
    await flush();
    expect(c.status()).toBe("on");
    audio.play.mockClear();
    audio.play.mockResolvedValue(false);
    c.notify([waiting(2000)]);
    await flush();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(c.status()).toBe("blocked");
    expect(store.get("agent-office.chime")).toBe("on");
    audio.unlock.mockClear();
    c.toggle();
    expect(audio.unlock).toHaveBeenCalledTimes(1);
    expect(c.status()).toBe("blocked");
    await flush();
    expect(c.status()).toBe("on");
  });
  it("an unlock that never settles counts as failed, so the next click turns the chime off", async () => {
    vi.useFakeTimers();
    try {
      store.set("agent-office.chime", "on");
      audio.unlock.mockReturnValue(new Promise<boolean>(() => {}));
      const c = createChime(() => 1000);
      c.toggle();
      await vi.advanceTimersByTimeAsync(UNLOCK_TIMEOUT_MS);
      expect(c.status()).toBe("blocked");
      c.toggle();
      expect(c.status()).toBe("off");
      expect(store.get("agent-office.chime")).toBe("off");
    } finally {
      vi.useRealTimers();
    }
  });
  // Value: protects=chime works with blocked storage (private mode, policy); fails_when=a storage throw escapes createChime or toggle; why_new=readPref/writePref catch paths had no test; seam=none
  it("blocked localStorage reads as off and a toggle still works in memory without throwing", async () => {
    const boom = () => {
      throw new Error("denied");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom });
    audio.unlock.mockResolvedValue(true);
    const c = createChime(() => 1000);
    expect(c.status()).toBe("off");
    expect(() => c.toggle()).not.toThrow();
    await flush();
    expect(c.status()).toBe("on");
    expect(() => c.toggle()).not.toThrow();
    expect(c.status()).toBe("off");
  });
});
