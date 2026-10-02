import { describe, expect, it } from "vite-plus/test";
import { SWAP_TIMEOUT_MS } from "./poses";
import { createSwap, isLooping, resolveSwap, retarget } from "./swap";

describe("swap controller (D10)", () => {
  it("starts settled on the first state", () => {
    expect(createSwap("working", 0)).toEqual({ displayed: "working", target: "working", since: 0 });
  });

  it("keeps a running loop until its stride ends", () => {
    const s = retarget(createSwap("working", 0), "attention", 100);
    expect(s.displayed).toBe("working");
    const held = resolveSwap(s, { loopRunning: true, reducedMotion: false, now: 400 });
    expect(held.displayed).toBe("working");
    const done = resolveSwap(s, { loopRunning: false, reducedMotion: false, now: 400 });
    expect(done.displayed).toBe("attention");
  });

  it("forces the swap after SWAP_TIMEOUT_MS even if the loop never ends", () => {
    const s = retarget(createSwap("arriving", 0), "working", 1000);
    const at = (now: number) =>
      resolveSwap(s, { loopRunning: true, reducedMotion: false, now }).displayed;
    expect(at(1000 + SWAP_TIMEOUT_MS - 1)).toBe("arriving");
    expect(at(1000 + SWAP_TIMEOUT_MS)).toBe("working");
  });

  it("swaps at once under reduced motion", () => {
    const s = retarget(createSwap("working", 0), "idle", 5);
    expect(resolveSwap(s, { loopRunning: true, reducedMotion: true, now: 5 }).displayed).toBe(
      "idle",
    );
  });

  it("swaps at once when the shown pose has no loop", () => {
    expect(isLooping("idle")).toBe(false);
    const s = retarget(createSwap("idle", 0), "working", 5);
    const out = resolveSwap(s, { loopRunning: isLooping("idle"), reducedMotion: false, now: 5 });
    expect(out.displayed).toBe("working");
  });

  it("goes straight to the latest target, never an intermediate one", () => {
    let s = retarget(createSwap("working", 0), "attention", 100);
    s = retarget(s, "idle", 200);
    s = retarget(s, "leaving", 300);
    const out = resolveSwap(s, { loopRunning: false, reducedMotion: false, now: 350 });
    expect(out.displayed).toBe("leaving");
  });

  it("returns to the current pose after a background tab", () => {
    // Timers and animation events were throttled for 10 minutes: one resolve lands on the latest target.
    let s = retarget(createSwap("working", 0), "attention", 100);
    s = retarget(s, "idle", 200);
    const out = resolveSwap(s, { loopRunning: true, reducedMotion: false, now: 600_000 });
    expect(out).toEqual({ displayed: "idle", target: "idle", since: 200 });
  });

  it("a state change back to the shown pose cancels the pending swap", () => {
    let s = retarget(createSwap("working", 0), "attention", 100);
    s = retarget(s, "working", 200);
    expect(resolveSwap(s, { loopRunning: false, reducedMotion: false, now: 250 }).displayed).toBe(
      "working",
    );
    expect(s.target).toBe("working");
  });

  it("does not restart the clock when the same target repeats", () => {
    const s = retarget(createSwap("working", 0), "attention", 100);
    expect(retarget(s, "attention", 500)).toBe(s);
  });
});
