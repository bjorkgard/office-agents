import { useCallback, useState, useSyncExternalStore } from "react";
import { playChime, unlockChime } from "./chime-audio";
import {
  CHIME_KEY,
  chimeStatus,
  nextEnabled,
  parseChimePref,
  shouldChime,
  type ChimeStatus,
} from "./chime-logic";
import type { Agent } from "./machine";

/** An unlock that has not settled by now counts as failed, so a hung resume() cannot trap the control. */
export const UNLOCK_TIMEOUT_MS = 1500;

function unlockWithTimeout(): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), UNLOCK_TIMEOUT_MS);
    void unlockChime().then((ok) => {
      clearTimeout(timer);
      resolve(ok);
    });
  });
}

function readPref(): boolean {
  try {
    return parseChimePref(localStorage.getItem(CHIME_KEY));
  } catch {
    return false;
  }
}

function writePref(on: boolean): void {
  try {
    localStorage.setItem(CHIME_KEY, on ? "on" : "off");
  } catch {
    // Storage may be blocked; the toggle just will not persist.
  }
}

/**
 * Chime state outside React so the click rules are testable without a DOM. A stored "on"
 * starts blocked; the first click retries the unlock, and if that fails the next click
 * turns the chime off (stored off too). A click while audio is running turns it off at once.
 */
export function createChime(now: () => number = Date.now) {
  let enabled = readPref();
  let unlocked = false;
  let unlockFailed = false;
  let lastChimeAt: number | null = null;
  const loadedAt = now();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  return {
    status: (): ChimeStatus => chimeStatus(enabled, unlocked),
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    toggle() {
      enabled = nextEnabled(enabled, chimeStatus(enabled, unlocked), unlockFailed);
      writePref(enabled);
      if (!enabled) {
        unlocked = false;
        unlockFailed = false;
        emit();
        return;
      }
      emit();
      void unlockWithTimeout().then((ok) => {
        if (!enabled) return;
        unlocked = ok;
        unlockFailed = !ok;
        if (ok) playChime();
        emit();
      });
    },
    notify(announced: Agent[]) {
      if (!unlocked) return;
      const at = now();
      if (!shouldChime({ enabled, announced, loadedAt, now: at, lastChimeAt })) return;
      lastChimeAt = at;
      playChime();
    },
  };
}

/** Chime state for the top bar: `notify` takes newly announced waits, `toggle` is the click. */
export function useChime(): {
  status: ChimeStatus;
  toggle: () => void;
  notify: (a: Agent[]) => void;
} {
  const [chime] = useState(() => createChime());
  const status = useSyncExternalStore(chime.subscribe, chime.status, () => "off" as ChimeStatus);
  const toggle = useCallback(() => chime.toggle(), [chime]);
  const notify = useCallback((a: Agent[]) => chime.notify(a), [chime]);
  return { status, toggle, notify };
}
