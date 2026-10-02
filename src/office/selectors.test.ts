import { describe, expect, it } from "vite-plus/test";
import { agentKey, createOffice, type Agent, type OfficeState } from "./machine";
import {
  announceNew,
  deskOrder,
  focusOrder,
  waitingChips,
  waitingCount,
  type Seats,
} from "./selectors";
import type { AgentState } from "./poses";

type Spec = { session: string; state: AgentState; since?: number | null };

function office(specs: Spec[]): OfficeState {
  const s = createOffice();
  for (const { session, state, since } of specs) {
    const key = agentKey(session, null);
    s.agents[key] = {
      key,
      sessionId: session,
      agentId: null,
      state,
      episode:
        state === "attention" && since !== null
          ? { id: `${key}#1`, waitingSince: since ?? 0, exitedAt: null }
          : null,
    } as Agent;
  }
  return s;
}

const sessionsOf = (agents: Agent[]) => agents.map((a) => a.sessionId);

describe("waitingChips", () => {
  const cases: { name: string; specs: Spec[]; want: string[] }[] = [
    {
      name: "longest wait (oldest start) first",
      specs: [
        { session: "a", state: "attention", since: 300 },
        { session: "b", state: "attention", since: 100 },
        { session: "c", state: "attention", since: 200 },
      ],
      want: ["b", "c", "a"],
    },
    {
      name: "equal waits tie-break by key",
      specs: [
        { session: "z", state: "attention", since: 100 },
        { session: "m", state: "attention", since: 100 },
        { session: "a", state: "attention", since: 100 },
      ],
      want: ["a", "m", "z"],
    },
    {
      name: "unknown wait last, by key",
      specs: [
        { session: "a", state: "attention", since: null },
        { session: "c", state: "attention", since: 500 },
        { session: "b", state: "attention", since: null },
      ],
      want: ["c", "a", "b"],
    },
    {
      name: "non-waiting agents are not chips",
      specs: [
        { session: "a", state: "working" },
        { session: "b", state: "attention", since: 1 },
        { session: "c", state: "leaving" },
      ],
      want: ["b"],
    },
  ];
  for (const c of cases) {
    it(c.name, () => {
      expect(sessionsOf(waitingChips(office(c.specs)).map((x) => x.agent))).toEqual(c.want);
    });
  }

  it("omits the wait time when unknown", () => {
    const chips = waitingChips(office([{ session: "a", state: "attention", since: null }]));
    expect(chips[0].waitingSince).toBeNull();
  });
});

describe("focusOrder and deskOrder", () => {
  const seats: Seats = { a: 3, b: 0, c: 1, d: 2 };
  const specs: Spec[] = [
    { session: "a", state: "attention", since: 10 },
    { session: "b", state: "working" },
    { session: "c", state: "attention", since: 5 },
    { session: "d", state: "idle" },
    { session: "gone", state: "leaving" },
    { session: "noseat", state: "working" },
  ];
  it("waiting first (longest first), then by desk, missing seat last", () => {
    expect(sessionsOf(focusOrder(office(specs), seats))).toEqual(["c", "a", "b", "d", "noseat"]);
  });
  it("desk order ignores waiting and leaving", () => {
    expect(sessionsOf(deskOrder(office(specs), seats))).toEqual(["b", "c", "d", "a", "noseat"]);
  });
});

describe("waitingCount", () => {
  it("counts only attention agents", () => {
    const s = office([
      { session: "a", state: "attention", since: 1 },
      { session: "b", state: "attention", since: null },
      { session: "c", state: "working" },
      { session: "d", state: "waiting-on-subagents" },
    ]);
    expect(waitingCount(s)).toBe(2);
    expect(waitingCount(createOffice())).toBe(0);
  });
});

describe("announceNew", () => {
  const wait = (since: number) => office([{ session: "a", state: "attention", since }]);

  it("announces a new wait once", () => {
    const first = announceNew(wait(100), new Set());
    expect(sessionsOf(first.announce)).toEqual(["a"]);
    expect(announceNew(wait(100), first.seen).announce).toEqual([]);
  });

  it("is silent for a replayed episode (new episode id, same agent and wait start)", () => {
    const first = announceNew(wait(100), new Set());
    const replayed = wait(100);
    replayed.agents[agentKey("a", null)].episode!.id = "other#7";
    expect(announceNew(replayed, first.seen).announce).toEqual([]);
  });

  it("announces the same agent's new wait", () => {
    const first = announceNew(wait(100), new Set());
    expect(sessionsOf(announceNew(wait(200), first.seen).announce)).toEqual(["a"]);
  });

  it("does not mutate the seen set it was given", () => {
    const seen = new Set<string>();
    announceNew(wait(100), seen);
    expect(seen.size).toBe(0);
  });
});
