/** Thin WebAudio wrapper: a soft two-note tone, no asset. Silent whenever audio is blocked. */

let ctx: AudioContext | null = null;

/** Create the context on first call; call only from a user click so it may start. */
export function unlockChime(): Promise<boolean> {
  try {
    if (!ctx) {
      const Ctor = typeof window === "undefined" ? undefined : window.AudioContext;
      if (!Ctor) return Promise.resolve(false);
      ctx = new Ctor();
    }
    const c = ctx;
    return c.resume().then(
      () => c.state === "running",
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * Two short sine notes at low gain. A context the browser suspended since the unlock gets one resume()
 * try first. Resolves false when nothing could play (no context, or it will not run).
 */
export async function playChime(): Promise<boolean> {
  try {
    const c = ctx;
    if (!c) return false;
    if (c.state !== "running") {
      await c.resume();
      // resume() changes the state; read it as the full union so TS does not keep the narrowing above.
      if ((c.state as AudioContextState) !== "running") return false;
    }
    const t = c.currentTime;
    [660, 880].forEach((hz, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      const at = t + i * 0.18;
      osc.type = "sine";
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.08, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      osc.connect(gain).connect(c.destination);
      osc.start(at);
      osc.stop(at + 0.32);
    });
    return true;
  } catch {
    // Blocked or unsupported audio stays silent.
    return false;
  }
}
