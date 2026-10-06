import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { ErrorBoundary, ThrowFailure } from "./ErrorBoundary";
import type { EventSourceLike, FeedDeps, FeedState } from "./feed-client";
import { initialFeedState } from "./feed-client";
import { startOffice, useOffice } from "./useOffice";

const hookState = vi.hoisted(() => ({ forced: null as unknown }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: ((init: unknown) =>
      hookState.forced ? [hookState.forced, () => {}] : actual.useState(init as never)) as never,
  };
});

function fakes() {
  const sources: (EventSourceLike & { closed: boolean })[] = [];
  const timers = new Set<number>();
  let id = 0;
  const deps: FeedDeps = {
    createSource: () => {
      const s = {
        readyState: 0,
        closed: false,
        onopen: null,
        onmessage: null,
        onerror: null,
        close() {
          s.closed = true;
        },
      };
      sources.push(s);
      return s;
    },
    fetch: () => Promise.resolve({ status: 503 }),
    setTimeout: () => {
      timers.add(++id);
      return id;
    },
    clearTimeout: (h) => {
      timers.delete(h as number);
    },
    now: () => 0,
  };
  return { deps, sources, timers };
}

describe("useOffice glue", () => {
  it("starts connecting with an empty office", () => {
    const s = initialFeedState();
    expect(s.connection).toBe("connecting");
    expect(s.office.agents).toEqual({});
    expect(s.failure).toBeNull();
  });

  it("StrictMode mount, cleanup, mount leaves one open stream and no stray timers", () => {
    const f = fakes();
    const states: FeedState[] = [];
    const cleanup1 = startOffice(f.deps, (s) => states.push(s));
    cleanup1();
    expect(f.sources[0].closed).toBe(true);
    expect(f.timers.size).toBe(0);
    const cleanup2 = startOffice(f.deps, (s) => states.push(s));
    expect(f.sources.filter((s) => !s.closed)).toHaveLength(1);
    cleanup2();
    expect(f.sources.every((s) => s.closed)).toBe(true);
    expect(f.timers.size).toBe(0);
  });
});

describe("ErrorBoundary (D16)", () => {
  it("renders children when nothing failed", () => {
    expect(renderToStaticMarkup(<ErrorBoundary>ok</ErrorBoundary>)).toBe("ok");
  });

  it("a thrown error becomes derived failed state, and the fallback says Display error", () => {
    expect(ErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    const boundary = new ErrorBoundary({ children: "ok" });
    boundary.state = { failed: true };
    const html = renderToStaticMarkup(<>{boundary.render()}</>);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Display error");
  });
});

describe("ErrorBoundary onError", () => {
  it("logs and tells the parent when a render error is caught", () => {
    const onError = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    new ErrorBoundary({ children: "ok", onError }).componentDidCatch(new Error("x"));
    expect(onError).toHaveBeenCalledTimes(1);
    log.mockRestore();
    // onError is optional.
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      new ErrorBoundary({ children: "ok" }).componentDidCatch(new Error("x")),
    ).not.toThrow();
    vi.restoreAllMocks();
  });
});

describe("failure as data (D16, DR2)", () => {
  it("useOffice returns a machine failure instead of throwing", () => {
    const failure = new Error("machine broke");
    hookState.forced = { ...initialFeedState(), failure };
    const seen: { state: FeedState | null } = { state: null };
    function Probe() {
      const state = useOffice(fakes().deps);
      seen.state = state;
      return null;
    }
    try {
      expect(() => renderToStaticMarkup(<Probe />)).not.toThrow();
    } finally {
      hookState.forced = null;
    }
    expect(seen.state?.failure).toBe(failure);
  });

  it("ThrowFailure throws the failure for the boundary, and renders nothing without one", () => {
    const failure = new Error("machine broke");
    expect(() => ThrowFailure({ failure })).toThrow(failure);
    expect(ThrowFailure({ failure: null })).toBeNull();
    expect(renderToStaticMarkup(<span>sibling</span>)).toBe("<span>sibling</span>");
  });
});
