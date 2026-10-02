import { parseAgentEvent, type AgentEvent } from "../../shared/events";
import { applyEvents, createOffice, tick, type OfficeState } from "./machine";

/**
 * Feed client (E3, R4, D12, D15, D16): the connection logic behind `useOffice`, with the
 * browser pieces (EventSource, fetch, timers, clock) injected so tests drive it directly.
 * One writer: every change goes through `set`, which hands the hook a new immutable state.
 */

export const EVENTS_URL = "/__office/events";
export const STATUS_URL = "/__office/status";

/** R7: reopen delays after a closed stream; the last one repeats. */
export const REOPEN_DELAYS_MS = [2000, 4000, 8000, 16000, 30000];
/** R7: a stream open this long resets the reopen delay. */
export const STABLE_OPEN_MS = 10 * 1000;
export const TICK_MS = 1000;

export type Connection =
  | "connecting"
  | "live"
  | "reconnecting"
  | "refused"
  | "unavailable"
  | "no-sessions";

export type FeedState = {
  office: OfficeState;
  /** sessionId to desk, as assigned by the server (S1-1). May lack a session. */
  seats: Record<string, number>;
  /** projectId to projectPath, from agent_started events (shirt and label input). */
  projects: Record<string, string>;
  connection: Connection;
  /** Frames and events skipped as invalid (D16), by kind. */
  skipped: { json: number; frame: number; event: number };
  /** A machine throw, returned as data; Scene rethrows it inside the error boundary (D16). */
  failure: Error | null;
};

export const initialFeedState = (): FeedState => ({
  office: createOffice(),
  seats: seatMap(),
  projects: projectMap(),
  connection: "connecting",
  skipped: { json: 0, frame: 0, event: 0 },
  failure: null,
});

export type EventSourceLike = {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onerror: (() => void) | null;
  close(): void;
};

export type FeedDeps = {
  createSource(url: string): EventSourceLike;
  fetch(url: string): Promise<{ status: number }>;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
  /** Test seam for a machine failure. */
  apply?: typeof applyEvents;
  /** Dev warning, once per skip kind. */
  warn?: (message: string) => void;
};

const CLOSED = 2;

export type FeedClient = {
  start(): void;
  stop(): void;
  getState(): FeedState;
};

export function createFeedClient(deps: FeedDeps, onChange: (s: FeedState) => void): FeedClient {
  const apply = deps.apply ?? applyEvents;
  let link: Exclude<Connection, "no-sessions"> = "connecting";
  let state = initialFeedState();
  let source: EventSourceLike | null = null;
  let attempt = 0;
  let stopped = true;
  /** True once this connection's snapshot arrived; only then can the room be called empty. */
  let synced = false;
  let failures = 0;
  const handles = { reopen: null as unknown, stable: null as unknown, tick: null as unknown };
  const warned = new Set<string>();

  function set(patch: Partial<FeedState>, nextLink = link) {
    link = nextLink;
    const next = { ...state, ...patch };
    const empty = Object.keys(next.office.agents).length === 0;
    next.connection = link === "live" && synced && empty ? "no-sessions" : link;
    state = next;
    onChange(state);
  }

  function skip(kind: keyof FeedState["skipped"], what: string) {
    set({ skipped: { ...state.skipped, [kind]: state.skipped[kind] + 1 } });
    if (!warned.has(kind)) {
      warned.add(kind);
      deps.warn?.(`office feed: skipped ${what} (further ${kind} skips are counted, not logged)`);
    }
  }

  function clear(key: keyof typeof handles) {
    if (handles[key] !== null) deps.clearTimeout(handles[key]);
    handles[key] = null;
  }

  function fail(error: unknown) {
    shutdown();
    set({ failure: error instanceof Error ? error : new Error(String(error)) }, "unavailable");
  }

  /** Runs a machine step; a throw stops the client and is surfaced, not swallowed (D16). */
  function guarded(step: () => Partial<FeedState> | null) {
    try {
      const patch = step();
      if (patch) set(patch);
    } catch (error) {
      fail(error);
    }
  }

  function rememberProjects(events: AgentEvent[], into: Record<string, string>) {
    for (const e of events) if (e.kind === "agent_started") into[e.projectId] = e.projectPath;
  }

  /** D12: replay with each event's own clock, one tick at `now`, then drop leaving agents. */
  function replay(events: AgentEvent[], now: number): OfficeState {
    const office = tick(apply(createOffice(), events, now, { replay: true }), now);
    for (const [key, agent] of Object.entries(office.agents)) {
      if (agent.phase === "leaving") delete office.agents[key];
    }
    return office;
  }

  function parseEvents(raw: unknown[]): AgentEvent[] {
    const events: AgentEvent[] = [];
    for (const item of raw) {
      const event = parseAgentEvent(item);
      if (event) events.push(event);
      else skip("event", "an invalid event");
    }
    return events;
  }

  function onFrame(frame: Record<string, unknown>) {
    switch (frame.type) {
      case "snapshot": {
        if (!Array.isArray(frame.events)) return skip("frame", "a snapshot without events");
        const events = parseEvents(frame.events);
        const seats = validSeats(frame.seats);
        const projects = projectMap();
        rememberProjects(events, projects);
        synced = true;
        guarded(() => ({ office: replay(events, deps.now()), seats, projects }));
        return;
      }
      case "event": {
        const event = parseAgentEvent(frame.event);
        if (!event) return skip("event", "an invalid event");
        guarded(() => {
          const projects = projectMap(state.projects);
          rememberProjects([event], projects);
          return { office: apply(state.office, [event], deps.now()), projects };
        });
        return;
      }
      case "seat": {
        if (typeof frame.sessionId !== "string" || !isDesk(frame.desk)) {
          return skip("frame", "a malformed seat");
        }
        const seats = seatMap(state.seats);
        seats[frame.sessionId] = frame.desk;
        set({ seats });
        return;
      }
      case "gone": {
        if (typeof frame.sessionId !== "string") return skip("frame", "a malformed gone");
        if (frame.agentId === null && frame.sessionId in state.seats) {
          const seats = seatMap(state.seats);
          delete seats[frame.sessionId];
          set({ seats });
        }
        return;
      }
      default:
        skip("frame", "an unknown frame");
    }
  }

  function onMessage(data: string) {
    let frame: unknown;
    try {
      frame = JSON.parse(data);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return skip("json", "a frame that is not JSON");
    }
    if (typeof frame !== "object" || frame === null || Array.isArray(frame)) {
      return skip("frame", "a frame that is not an object");
    }
    onFrame(frame as Record<string, unknown>);
  }

  function open() {
    const mine = ++attempt;
    const es = deps.createSource(EVENTS_URL);
    source = es;
    const current = () => !stopped && mine === attempt;
    es.onopen = () => {
      if (!current()) return;
      synced = false;
      clear("stable");
      handles.stable = deps.setTimeout(() => {
        handles.stable = null;
        failures = 0;
      }, STABLE_OPEN_MS);
      set({}, "live");
    };
    es.onmessage = (e) => {
      if (current()) onMessage(e.data);
    };
    es.onerror = () => {
      if (!current()) return;
      clear("stable");
      if (es.readyState !== CLOSED) return set({}, "reconnecting");
      es.close();
      closedStream(mine);
    };
  }

  /** CLOSED: the browser will not retry. Probe for the reason, and reopen on a timer (D15, R7). */
  function closedStream(mine: number) {
    set({}, "reconnecting");
    const delay = REOPEN_DELAYS_MS[Math.min(failures, REOPEN_DELAYS_MS.length - 1)];
    failures += 1;
    clear("reopen");
    handles.reopen = deps.setTimeout(() => {
      handles.reopen = null;
      open();
    }, delay);
    const verdict = (status: number | null) => {
      if (stopped || mine !== attempt) return;
      set({}, status === 403 ? "refused" : "unavailable");
    };
    deps.fetch(STATUS_URL).then(
      (res) => verdict(res.status),
      () => verdict(null),
    );
  }

  function loop() {
    handles.tick = deps.setTimeout(() => {
      guarded(() => {
        const office = tick(state.office, deps.now());
        return office === state.office ? null : { office };
      });
      if (!stopped) loop();
    }, TICK_MS);
  }

  function shutdown() {
    stopped = true;
    attempt += 1;
    source?.close();
    source = null;
    clear("reopen");
    clear("stable");
    clear("tick");
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      open();
      loop();
    },
    stop: shutdown,
    getState: () => state,
  };
}

/** Seats a client accepts: a huge desk index would size the room and freeze the tab. */
const MAX_DESKS = 256;

function isDesk(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < MAX_DESKS;
}

/** Null-prototype copy, so a project id like "constructor" cannot collide with Object.prototype. */
function projectMap(from: Record<string, string> = {}): Record<string, string> {
  return Object.assign(Object.create(null) as Record<string, string>, from);
}

/** Null-prototype copy, so a session id like "constructor" cannot collide with Object.prototype. */
function seatMap(from: Record<string, number> = {}): Record<string, number> {
  return Object.assign(Object.create(null) as Record<string, number>, from);
}

function validSeats(value: unknown): Record<string, number> {
  const seats = seatMap();
  if (typeof value !== "object" || value === null || Array.isArray(value)) return seats;
  for (const [id, desk] of Object.entries(value)) if (isDesk(desk)) seats[id] = desk;
  return seats;
}
