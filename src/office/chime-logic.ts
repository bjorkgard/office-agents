import type { Agent } from "./machine";

/** Pure rules for the opt-in attention chime; the tone itself lives in chime-audio.ts. */

/** localStorage key and the only stored value that means on. */
export const CHIME_KEY = "agent-office.chime";

/** One chime at most per this window, so agents waiting together sound once. */
export const CHIME_MIN_GAP_MS = 5000;

/** What the speaker control shows: off, on and audible, or on but waiting for a click. */
export type ChimeStatus = "off" | "on" | "blocked";

/** The toggle is off unless the stored value says otherwise (default off). */
export function parseChimePref(raw: string | null): boolean {
  return raw === "on";
}

/** Status of the control: a stored "on" stays "blocked" until a click unlocks audio. */
export function chimeStatus(enabled: boolean, unlocked: boolean): ChimeStatus {
  if (!enabled) return "off";
  return unlocked ? "on" : "blocked";
}

/** Accessible name; the pressed state carries on/off, the name carries the blocked case. */
export function chimeLabel(status: ChimeStatus): string {
  return status === "blocked" ? "Attention chime (click to enable sound)" : "Attention chime";
}

/** Short visible state next to the speaker glyph. */
export function chimeText(status: ChimeStatus): string {
  return status === "off" ? "Chime off" : status === "on" ? "Chime on" : "Chime: click";
}

/**
 * Next enabled value for a click. A blocked "on" retries the unlock once; after that
 * attempt failed (`unlockFailed`) the click turns the chime off, so audio that cannot
 * start never traps the control. A click on an audible "on" always turns it off.
 */
export function nextEnabled(enabled: boolean, status: ChimeStatus, unlockFailed: boolean): boolean {
  return status === "blocked" && !unlockFailed ? true : !enabled;
}

/**
 * Whether newly announced waits should chime now. Waits that began before this page
 * loaded are a replay (initial load or reconnect) and stay silent; the rest sound once
 * per window however many agents started waiting.
 */
export function shouldChime(input: {
  enabled: boolean;
  announced: readonly Agent[];
  loadedAt: number;
  now: number;
  lastChimeAt: number | null;
}): boolean {
  if (!input.enabled) return false;
  if (input.lastChimeAt !== null && input.now - input.lastChimeAt < CHIME_MIN_GAP_MS) return false;
  return input.announced.some((a) => {
    const since = a.episode?.waitingSince;
    return typeof since === "number" && since >= input.loadedAt;
  });
}
