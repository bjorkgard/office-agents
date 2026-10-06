import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { agentKey, type Agent } from "./machine";

const audio = vi.hoisted(() => ({
  unlock: vi.fn<() => Promise<boolean>>(),
  play: vi.fn<() => Promise<boolean>>(),
}));
vi.mock("./chime-audio", () => ({ unlockChime: audio.unlock, playChime: audio.play }));

import { CHIME_KEY, CHIME_MIN_GAP_MS } from "./chime-logic";
import { createChime, UNLOCK_TIMEOUT_MS } from "./useChime";

const store = new Map<string, string>();
const flush = () => new Promise((r) => setTimeout(r, 0));

function deferred() {
  let resolve!: (ok: boolean) => void;
  const promise = new Promise<boolean>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

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
  describe("overlapping unlocks and storage events", () => {
    // A toggle while an unlock is pending retries it, so two unlocks overlap; only the latest may apply.
    for (const staleFirst of [true, false]) {
      it(`two overlapping unlocks apply only the latest result (${staleFirst ? "stale" : "latest"} settles first)`, async () => {
        const first = deferred();
        const second = deferred();
        audio.unlock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const c = createChime(() => 1000);
        c.toggle();
        c.toggle();
        expect(audio.unlock).toHaveBeenCalledTimes(2);
        const settle = staleFirst
          ? [() => first.resolve(false), () => second.resolve(true)]
          : [() => second.resolve(true), () => first.resolve(false)];
        for (const run of settle) {
          run();
          await flush();
        }
        expect(c.status()).toBe("on");
        expect(audio.play).toHaveBeenCalledTimes(1);
        // The stale false must not have marked a failure: one click turns it off.
        c.toggle();
        expect(c.status()).toBe("off");
      });
      it(`off then on while the first unlock is pending ignores the stale one (${staleFirst ? "stale" : "latest"} settles first)`, async () => {
        const first = deferred();
        const second = deferred();
        audio.unlock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const c = createChime(() => 1000);
        c.toggle();
        c.onStorage({ key: CHIME_KEY, newValue: "off" });
        expect(c.status()).toBe("off");
        c.toggle();
        const settle = staleFirst
          ? [() => first.resolve(true), () => second.resolve(false)]
          : [() => second.resolve(false), () => first.resolve(true)];
        for (const run of settle) {
          run();
          await flush();
        }
        expect(c.status()).toBe("blocked");
        expect(audio.play).not.toHaveBeenCalled();
        // The latest result failed, so the next click turns the chime off.
        c.toggle();
        expect(c.status()).toBe("off");
      });
    }
    it("a remote off while an unlock is pending stays off when the unlock lands late", async () => {
      const pending = deferred();
      audio.unlock.mockReturnValue(pending.promise);
      const c = createChime(() => 1000);
      c.toggle();
      c.onStorage({ key: CHIME_KEY, newValue: "off" });
      pending.resolve(true);
      await flush();
      expect(c.status()).toBe("off");
      expect(audio.play).not.toHaveBeenCalled();
    });
    it("a stale failed play cannot revert a fresh successful unlock", async () => {
      audio.unlock.mockResolvedValue(true);
      const c = createChime(() => 1000);
      c.toggle();
      await flush();
      expect(c.status()).toBe("on");
      const oldPlay = deferred();
      audio.play.mockReturnValueOnce(oldPlay.promise);
      c.notify([waiting(2000)]);
      c.toggle();
      expect(c.status()).toBe("off");
      c.toggle();
      await flush();
      expect(c.status()).toBe("on");
      oldPlay.resolve(false);
      await flush();
      expect(c.status()).toBe("on");
    });
    it("notify chimes at most once inside the minimum gap", async () => {
      audio.unlock.mockResolvedValue(true);
      let t = 1000;
      const c = createChime(() => t);
      c.toggle();
      await flush();
      audio.play.mockClear();
      t = 2000;
      c.notify([waiting(1500)]);
      t = 2000 + CHIME_MIN_GAP_MS - 1;
      c.notify([waiting(6500)]);
      expect(audio.play).toHaveBeenCalledTimes(1);
      t = 2000 + CHIME_MIN_GAP_MS;
      c.notify([waiting(6900)]);
      expect(audio.play).toHaveBeenCalledTimes(2);
    });
    it("a remote on lands blocked and a click then unlocks it", async () => {
      audio.unlock.mockResolvedValue(true);
      const c = createChime(() => 1000);
      const seen = vi.fn();
      c.subscribe(seen);
      c.onStorage({ key: CHIME_KEY, newValue: "on" });
      expect(c.status()).toBe("blocked");
      expect(seen).toHaveBeenCalledTimes(1);
      c.toggle();
      await flush();
      expect(c.status()).toBe("on");
    });
    it("a remote on resets an unlocked or failed tab to blocked", async () => {
      audio.unlock.mockResolvedValue(true);
      const c = createChime(() => 1000);
      c.toggle();
      await flush();
      expect(c.status()).toBe("on");
      c.onStorage({ key: CHIME_KEY, newValue: "on" });
      expect(c.status()).toBe("blocked");
      audio.unlock.mockResolvedValue(false);
      c.toggle();
      await flush();
      c.onStorage({ key: CHIME_KEY, newValue: "on" });
      // unlockFailed was cleared, so a click retries instead of turning off.
      c.toggle();
      expect(c.status()).toBe("blocked");
    });
    it("a remote off, or a removed key, turns an on chime off", async () => {
      audio.unlock.mockResolvedValue(true);
      const c = createChime(() => 1000);
      c.toggle();
      await flush();
      c.onStorage({ key: CHIME_KEY, newValue: "off" });
      expect(c.status()).toBe("off");
      c.toggle();
      await flush();
      expect(c.status()).toBe("on");
      c.onStorage({ key: CHIME_KEY, newValue: null });
      expect(c.status()).toBe("off");
    });
    it("localStorage.clear() (a null key) turns an on chime off", async () => {
      audio.unlock.mockResolvedValue(true);
      const c = createChime(() => 1000);
      c.toggle();
      await flush();
      expect(c.status()).toBe("on");
      c.onStorage({ key: null, newValue: null });
      expect(c.status()).toBe("off");
    });
    it("a garbage stored value from another tab lands off", async () => {
      audio.unlock.mockResolvedValue(true);
      const c = createChime(() => 1000);
      c.toggle();
      await flush();
      c.onStorage({ key: CHIME_KEY, newValue: "garbage" });
      expect(c.status()).toBe("off");
    });
    it("dispose drops a pending unlock result", async () => {
      const pending = deferred();
      audio.unlock.mockReturnValue(pending.promise);
      const c = createChime(() => 1000);
      c.toggle();
      c.dispose();
      pending.resolve(true);
      await flush();
      expect(audio.play).not.toHaveBeenCalled();
      expect(c.status()).toBe("blocked");
    });
    it("a storage event for another key is ignored", async () => {
      audio.unlock.mockResolvedValue(true);
      const c = createChime(() => 1000);
      c.toggle();
      await flush();
      const seen = vi.fn();
      c.subscribe(seen);
      c.onStorage({ key: "other", newValue: "off" });
      expect(c.status()).toBe("on");
      expect(seen).not.toHaveBeenCalled();
    });
  });
});
