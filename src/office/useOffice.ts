import { useEffect, useState } from "react";
import {
  createFeedClient,
  initialFeedState,
  type EventSourceLike,
  type FeedDeps,
  type FeedState,
} from "./feed-client";

/** Thin glue over the feed client (R4): the logic and its tests live in feed-client.ts. */

const browserDeps = (): FeedDeps => ({
  createSource: (url) => new EventSource(url) as EventSourceLike,
  fetch: (url) => fetch(url),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
  warn: (message) => {
    if (import.meta.env.DEV) console.warn(message);
  },
});

/** Starts a client and returns its cleanup; StrictMode runs this, cleans up and runs it again. */
export function startOffice(deps: FeedDeps, onChange: (s: FeedState) => void): () => void {
  const client = createFeedClient(deps, onChange);
  client.start();
  return () => client.stop();
}

/** `deps` is the demo source seam: pass fakes to replace the browser's EventSource and timers. */
export function useOffice(deps: FeedDeps = browserDeps()): FeedState {
  const [state, setState] = useState(initialFeedState);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is a fixed seam, not reactive input
  useEffect(() => startOffice(deps, setState), []);
  return state;
}
