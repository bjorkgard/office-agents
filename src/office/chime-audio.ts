/** Thin WebAudio wrapper: a soft two-note tone, no asset. Silent whenever audio is blocked. */

/** Note pitches in Hz, played in order. */
export const CHIME_NOTES_HZ = [660, 880] as const;
/** Seconds between note starts. */
export const CHIME_NOTE_GAP_S = 0.18;
/** Peak gain; low so the tone stays soft. */
export const CHIME_PEAK_GAIN = 0.08;
/** Gain the decay ends at (exponential ramps cannot reach 0). */
export const CHIME_FLOOR_GAIN = 0.0001;
/** Seconds to ramp up to the peak. */
export const CHIME_ATTACK_S = 0.02;
/** Seconds from note start until the decay reaches the floor. */
export const CHIME_DECAY_S = 0.3;
/** Seconds from note start until the oscillator stops. */
export const CHIME_STOP_S = 0.32;

let ctx: AudioContext | null = null;

/** Create the context on first call; call only from a user click so it may start. */
export function unlockChime(): Promise<boolean> {
  try {
    if (!ctx) {
      const Ctor =
        typeof window === "undefined"
          ? undefined
          : (window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!Ctor) return Promise.resolve(false);
      ctx = new Ctor();
    }
    const c = ctx;
    return Promise.resolve(c.resume()).then(
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
    CHIME_NOTES_HZ.forEach((hz, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      const at = t + i * CHIME_NOTE_GAP_S;
      osc.type = "sine";
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(CHIME_PEAK_GAIN, at + CHIME_ATTACK_S);
      gain.gain.exponentialRampToValueAtTime(CHIME_FLOOR_GAIN, at + CHIME_DECAY_S);
      osc.connect(gain).connect(c.destination);
      osc.start(at);
      osc.stop(at + CHIME_STOP_S);
    });
    return true;
  } catch {
    // Blocked or unsupported audio stays silent.
    return false;
  }
}
