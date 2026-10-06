import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

type Osc = { type: string; frequency: { value: number }; start: ReturnType<typeof vi.fn> };

interface FakeOpts {
  state?: string;
  resumeState?: string;
  resumeRejects?: boolean;
  resumeReturnsUndefined?: boolean;
  oscThrows?: boolean;
}

function installCtx(key: "AudioContext" | "webkitAudioContext", opts: FakeOpts = {}) {
  const oscs: Osc[] = [];
  const param = () => ({
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    value: 0,
  });
  class FakeCtx {
    state = opts.state ?? "running";
    currentTime = 1;
    destination = {};
    resume = vi.fn(() => {
      if (opts.resumeRejects) return Promise.reject(new Error("blocked"));
      this.state = opts.resumeState ?? "running";
      if (opts.resumeReturnsUndefined) return undefined;
      return Promise.resolve();
    });
    createOscillator() {
      if (opts.oscThrows) throw new Error("no osc");
      const o: Osc & { connect: () => unknown; stop: () => void } = {
        type: "",
        frequency: { value: 0 },
        start: vi.fn(),
        stop: vi.fn(),
        connect: () => ({ connect: () => undefined }),
      };
      oscs.push(o);
      return o;
    }
    createGain() {
      return { gain: param(), connect: () => ({}) };
    }
  }
  vi.stubGlobal("window", { [key]: FakeCtx });
  return oscs;
}

async function load() {
  return import("./chime-audio");
}

describe("chime-audio", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("unlock is false without an AudioContext constructor", async () => {
    vi.stubGlobal("window", {});
    const { unlockChime } = await load();
    expect(await unlockChime()).toBe(false);
  });

  it("unlock is false when resume rejects", async () => {
    installCtx("AudioContext", { state: "suspended", resumeRejects: true });
    const { unlockChime } = await load();
    expect(await unlockChime()).toBe(false);
  });

  it("unlock is false when resume resolves but the context is not running", async () => {
    installCtx("AudioContext", { state: "suspended", resumeState: "suspended" });
    const { unlockChime } = await load();
    expect(await unlockChime()).toBe(false);
  });

  it("playChime is true when a suspended context runs after resume", async () => {
    installCtx("AudioContext", { state: "suspended", resumeState: "running" });
    const { unlockChime, playChime } = await load();
    await unlockChime();
    expect(await playChime()).toBe(true);
  });

  it("unlock is true when a legacy resume() returns undefined and the context runs", async () => {
    installCtx("webkitAudioContext", { resumeReturnsUndefined: true });
    const { unlockChime } = await load();
    expect(await unlockChime()).toBe(true);
  });

  it("playChime is false with no context", async () => {
    installCtx("AudioContext");
    const { playChime } = await load();
    expect(await playChime()).toBe(false);
  });

  it("playChime is false when a suspended context still does not run after resume", async () => {
    installCtx("AudioContext", { state: "suspended", resumeState: "suspended" });
    const { unlockChime, playChime } = await load();
    await unlockChime();
    expect(await playChime()).toBe(false);
  });

  it("playChime is false when createOscillator throws", async () => {
    installCtx("AudioContext", { oscThrows: true });
    const { unlockChime, playChime } = await load();
    await unlockChime();
    expect(await playChime()).toBe(false);
  });

  it("happy path schedules two oscillators at the named frequencies", async () => {
    const oscs = installCtx("AudioContext");
    const { unlockChime, playChime } = await load();
    expect(await unlockChime()).toBe(true);
    expect(await playChime()).toBe(true);
    expect(oscs.map((o) => o.frequency.value)).toEqual([660, 880]);
    expect(oscs.map((o) => o.type)).toEqual(["sine", "sine"]);
    expect(oscs[0].start).toHaveBeenCalledWith(1);
    expect(oscs[1].start).toHaveBeenCalledWith(1 + 0.18);
  });

  it("works with only the prefixed webkitAudioContext", async () => {
    const oscs = installCtx("webkitAudioContext");
    const { unlockChime, playChime } = await load();
    expect(await unlockChime()).toBe(true);
    expect(await playChime()).toBe(true);
    expect(oscs).toHaveLength(2);
  });
});
