import { useEffect, useState, useSyncExternalStore } from "react";
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
  // Bumped on every toggle, storage change and dispose(); an unlock result applies only to the generation that started it.
  let generation = 0;
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
      const mine = ++generation;
      writePref(enabled);
      if (!enabled) {
        unlocked = false;
        unlockFailed = false;
        emit();
        return;
      }
      emit();
      void unlockWithTimeout().then((ok) => {
        if (mine !== generation) return;
        unlocked = ok;
        unlockFailed = !ok;
        if (ok) void playChime();
        emit();
      });
    },
    /** Another tab changed the stored preference: "on" lands blocked (audio needs this tab's own click), anything else off. */
    onStorage(e: { key: string | null; newValue: string | null }) {
      if (e.key !== null && e.key !== CHIME_KEY) return;
      generation++;
      enabled = e.key === null ? false : parseChimePref(e.newValue);
      unlocked = false;
      unlockFailed = false;
      emit();
    },
    /** Unmount: drop any unlock still pending so it cannot chime or emit afterwards. */
    dispose() {
      generation++;
    },
    notify(announced: Agent[]) {
      if (!unlocked) return;
      const at = now();
      if (!shouldChime({ enabled, announced, loadedAt, now: at, lastChimeAt })) return;
      lastChimeAt = at;
      // A context the browser suspended again that will not resume: show "Chime: click" so a click retries.
      const g = generation;
      void playChime().then((played) => {
        if (g !== generation || played || !enabled || !unlocked) return;
        unlocked = false;
        unlockFailed = false;
        emit();
      });
    },
  };
}

/** Chime state for the top bar: `notify` takes newly announced waits, `toggle` is the click. Both are stable across renders. */
export function useChime(): {
  status: ChimeStatus;
  toggle: () => void;
  notify: (a: Agent[]) => void;
} {
  const [{ chime, toggle, notify }] = useState(() => {
    const chime = createChime();
    return {
      chime,
      toggle: () => chime.toggle(),
      notify: (a: Agent[]) => chime.notify(a),
    };
  });
  const status = useSyncExternalStore(chime.subscribe, chime.status, () => "off" as ChimeStatus);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== window.localStorage) return;
      chime.onStorage(e);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      chime.dispose();
    };
  }, [chime]);
  return { status, toggle, notify };
}
