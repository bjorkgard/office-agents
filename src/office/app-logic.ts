import { MIN_HEIGHT, MIN_WIDTH, type Viewport } from "./iso";

/** Pure rules behind App, kept out of the component file for fast refresh. */

export const TOO_SMALL_NOTICE = "Make this window larger";

/** True below 800x500 (DR8); the room is replaced by the notice, the top bar stays. */
export function isTooSmall(viewport: Viewport): boolean {
  return viewport.width < MIN_WIDTH || viewport.height < MIN_HEIGHT;
}

/** Viewport excluding any classic scrollbar, so the room never overflows sideways. */
export function viewportOf(el: { clientWidth: number; clientHeight: number }): Viewport {
  return { width: el.clientWidth, height: el.clientHeight };
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
