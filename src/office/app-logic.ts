import { MIN_HEIGHT, MIN_WIDTH, type Viewport } from "./iso";

/** Pure rules behind App, kept out of the component file for fast refresh. */

export const TOO_SMALL_NOTICE = "Make this window larger";

/** True below 800x500 (DR8); the room is replaced by the notice, the top bar stays. */
export function isTooSmall(viewport: Viewport): boolean {
  return viewport.width < MIN_WIDTH || viewport.height < MIN_HEIGHT;
}

/**
 * The scene's React key: it changes each time the room comes back from the narrow notice, so
 * the boundary remounts as a new instance. `wasNarrow` and `narrow` are the previous and
 * current too-small flags.
 */
export function nextSceneKey(key: number, wasNarrow: boolean, narrow: boolean): number {
  return wasNarrow && !narrow ? key + 1 : key;
}

/**
 * The "Display error" flag (D16) belongs to the scene key whose boundary caught. It reads false
 * under any other key, so a remount clears it without relying on unmount callbacks (StrictMode
 * calls componentWillUnmount right after componentDidCatch on a fresh boundary).
 */
export function displayErrorShown(caughtKey: number | null, sceneKey: number): boolean {
  return caughtKey === sceneKey;
}

/**
 * The character wrapper for an agent key. Compared as a plain attribute value: keys carry a
 * NUL char, which CSS.escape rewrites to U+FFFD, so a selector built from the key never matches.
 */
export function findAgentWrapper<T extends { getAttribute(name: string): string | null }>(
  elements: Iterable<T>,
  key: string,
): T | undefined {
  for (const el of elements) if (el.getAttribute("data-agent") === key) return el;
  return undefined;
}

/** The part of a hit button the pulse touches. */
export type PulseEl = {
  isConnected: boolean;
  offsetWidth: number;
  focus(): void;
  scrollIntoView?(options: ScrollIntoViewOptions): void;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

/**
 * Chip-click pulse: focus an agent's hit button and flag it with data-pulse for `ms`. Only one
 * button holds the flag, and a button that left the page is never touched again.
 */
export function pulser(
  hitOf: (key: string) => PulseEl | null | undefined,
  ms: number,
  timers: {
    set: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
    clear: (id: ReturnType<typeof setTimeout> | undefined) => void;
  } = {
    // Arrows, not bare references: a browser's setTimeout/clearTimeout throw "Illegal invocation"
    // when called as methods of this object.
    set: (fn, delay) => setTimeout(fn, delay),
    clear: (id) => clearTimeout(id),
  },
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pulsed: PulseEl | null = null;
  return {
    pulse: (key: string) => {
      const el = hitOf(key);
      if (!el) return;
      el.focus();
      el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      // One highlight at a time: the previous element would otherwise keep it when the timer resets.
      timers.clear(timer);
      if (pulsed?.isConnected) pulsed.removeAttribute("data-pulse");
      pulsed = el;
      // Force a reflow so re-clicking the same chip restarts the animation.
      void el.offsetWidth;
      el.setAttribute("data-pulse", "");
      timer = timers.set(() => {
        if (el.isConnected) el.removeAttribute("data-pulse");
      }, ms);
    },
    dispose: () => timers.clear(timer),
  };
}
