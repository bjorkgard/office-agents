import { describe, expect, it, vi } from "vite-plus/test";
import { hash } from "./appearance";
import {
  BREAK_MAX_MS,
  BREAK_MIN_MS,
  COOLDOWN_MAX_MS,
  COOLDOWN_MIN_MS,
  breakCooldownMs,
  breakDwellMs,
  breakPlan,
  pickDrink,
} from "./breaks";

const counter = vi.hoisted(() => ({ hashCalls: 0, seeds: [] as string[] }));
vi.mock("./appearance", async (importOriginal) => {
  const real = await importOriginal<typeof import("./appearance")>();
  return {
    ...real,
    hash: (seed: string) => {
      counter.hashCalls++;
      counter.seeds.push(seed);
      return real.hash(seed);
    },
  };
});

describe("break schedule", () => {
  it("draws every dwell and cooldown inside its range, for 1000 seeds", () => {
    let lowD = Infinity;
    let highD = 0;
    for (let i = 0; i < 1000; i++) {
      const d = breakDwellMs(`agent-${i}`, i % 7);
      const c = breakCooldownMs(`agent-${i}`, i % 7);
      expect(d).toBeGreaterThanOrEqual(BREAK_MIN_MS);
      expect(d).toBeLessThanOrEqual(BREAK_MAX_MS);
      expect(c).toBeGreaterThanOrEqual(COOLDOWN_MIN_MS);
      expect(c).toBeLessThanOrEqual(COOLDOWN_MAX_MS);
      lowD = Math.min(lowD, d);
      highD = Math.max(highD, d);
    }
    // the draw really spreads over the range
    expect(lowD).toBeLessThan(BREAK_MIN_MS + 1500);
    expect(highD).toBeGreaterThan(BREAK_MAX_MS - 1500);
  });

  it("is deterministic for the same key and walk, and differs between agents", () => {
    const a = breakPlan("s1:main", 1000);
    const again = breakPlan("s1:main", 1000);
    for (let i = 0; i < 20; i++) {
      expect(again.start(i)).toBe(a.start(i));
      expect(again.dwellMs(i)).toBe(a.dwellMs(i));
    }
    const other = breakPlan("s2:main", 1000);
    const same = Array.from({ length: 10 }, (_, i) => a.dwellMs(i) === other.dwellMs(i));
    expect(same.every(Boolean)).toBe(false);
    expect(Array.from({ length: 10 }, (_, i) => a.start(i))).not.toEqual(
      Array.from({ length: 10 }, (_, i) => other.start(i)),
    );
  });

  it("uses a namespaced seed, not the appearance hash of the bare key", () => {
    const key = "s1:main";
    expect(breakDwellMs(key, 0)).not.toBe(
      BREAK_MIN_MS + Math.floor((hash(key) / 0x1_0000_0000) * (BREAK_MAX_MS - BREAK_MIN_MS + 1)),
    );
    const dwell = Array.from({ length: 12 }, (_, i) => breakDwellMs(key, i));
    const bare = Array.from(
      { length: 12 },
      (_, i) =>
        BREAK_MIN_MS +
        Math.floor((hash(`${key}:${i}`) / 0x1_0000_0000) * (BREAK_MAX_MS - BREAK_MIN_MS + 1)),
    );
    expect(dwell).not.toEqual(bare);
  });

  it("has strictly increasing boundaries and each cycle spans walks, dwell and cooldown", () => {
    const walk = 800;
    const p = breakPlan("grow:1", walk);
    expect(p.start(0)).toBe(0);
    for (let i = 0; i < 50; i++) {
      expect(p.start(i + 1)).toBeGreaterThan(p.start(i));
      expect(p.start(i + 1) - p.start(i)).toBe(2 * walk + p.dwellMs(i) + p.cooldownMs(i));
    }
  });

  it("locates the running cycle at a boundary and just before it", () => {
    const p = breakPlan("loc:1", 500);
    const s2 = p.start(2);
    expect(p.locate(s2)).toEqual({ cycle: 2, start: s2 });
    expect(p.locate(s2 - 1).cycle).toBe(1);
    expect(p.locate(-5)).toEqual({ cycle: 0, start: 0 });
  });

  it("builds a plan to cycle N with at most 3 hashes per cycle (dwell, cooldown, drink), one cycle of lookahead", () => {
    const N = 1000;
    const p = breakPlan("work:1", 650);
    counter.hashCalls = 0;
    p.start(N);
    expect(counter.hashCalls).toBeGreaterThan(0);
    expect(counter.hashCalls).toBeLessThanOrEqual(3 * (N + 1));
  });

  it("finishes bounded for an infinite or absurd elapsed time", () => {
    const p = breakPlan("bound:1", 600);
    for (const e of [Infinity, 1e15]) {
      const { cycle, start } = p.locate(e);
      expect(Number.isFinite(start), `${e}`).toBe(true);
      expect(cycle, `${e}`).toBeLessThan(10_000_000);
    }
  });

  it("gives an early key the same plan after 300 other keys evict it from the cache", () => {
    const first = breakPlan("evict:early", 640);
    const [start, dwell] = [first.start(5), first.dwellMs(5)];
    for (let i = 0; i < 300; i++) breakPlan(`evict:other-${i}`, 640).start(1);
    const again = breakPlan("evict:early", 640);
    expect(again).not.toBe(first);
    expect(again.start(5)).toBe(start);
    expect(again.dwellMs(5)).toBe(dwell);
  });

  it("does no new hashing for repeated or far lookups once warmed", () => {
    const p = breakPlan("far:1", 700);
    const far = p.start(1000) + 10;
    expect(p.locate(far).cycle).toBe(1000);
    counter.hashCalls = 0;
    for (let i = 0; i < 2000; i++) {
      expect(p.locate(far - (i % 10)).cycle).toBe(1000);
      p.dwellMs(1000);
      p.cooldownMs(500);
      p.start(1000);
    }
    expect(counter.hashCalls).toBe(0);
  });

  it("computes only the cycles first needed when a lookup moves forward", () => {
    const p = breakPlan("fwd:1", 700);
    p.start(10);
    counter.hashCalls = 0;
    p.start(12);
    expect(counter.hashCalls).toBe(3 * 2);
  });

  it("shares the module cache: a second lookup of the same key and walk hashes nothing", () => {
    const first = breakPlan("shared:1", 900);
    first.start(300);
    counter.hashCalls = 0;
    const second = breakPlan("shared:1", 900);
    expect(second).toBe(first);
    expect(second.start(300)).toBe(first.start(300));
    expect(second.locate(second.start(250) + 1).cycle).toBe(250);
    expect(counter.hashCalls).toBe(0);
  });

  it("varies dwell and cooldown from cycle to cycle, inside their ranges", () => {
    const key = "vary:1";
    const dwell = Array.from({ length: 20 }, (_, i) => breakDwellMs(key, i));
    const cool = Array.from({ length: 20 }, (_, i) => breakCooldownMs(key, i));
    expect(new Set(dwell).size).toBeGreaterThan(1);
    expect(new Set(cool).size).toBeGreaterThan(1);
    for (const d of dwell) {
      expect(d).toBeGreaterThanOrEqual(BREAK_MIN_MS);
      expect(d).toBeLessThanOrEqual(BREAK_MAX_MS);
    }
    for (const c of cool) {
      expect(c).toBeGreaterThanOrEqual(COOLDOWN_MIN_MS);
      expect(c).toBeLessThanOrEqual(COOLDOWN_MAX_MS);
    }
  });

  it("puts the cycle index in the seed: two cycles of one key differ", () => {
    const p = breakPlan("cycle:1", 500);
    expect(breakDwellMs("cycle:1", 0)).not.toBe(breakDwellMs("cycle:1", 1));
    expect(breakCooldownMs("cycle:1", 0)).not.toBe(breakCooldownMs("cycle:1", 1));
    expect(p.dwellMs(0)).not.toBe(p.dwellMs(1));
  });
});

describe("drink choice", () => {
  it("picks coffee 60% and water 40% of the time, over 2000 fixed seeds", () => {
    let coffee = 0;
    for (let i = 0; i < 2000; i++) if (pickDrink(`agent-${i}`, i % 9) === "coffee") coffee++;
    expect(coffee / 2000).toBeGreaterThan(0.56);
    expect(coffee / 2000).toBeLessThan(0.64);
  });

  it("is deterministic and varies from one cycle to the next", () => {
    const run = () => Array.from({ length: 40 }, (_, c) => pickDrink("s1:main", c));
    expect(run()).toEqual(run());
    expect(new Set(run())).toEqual(new Set(["coffee", "water"]));
  });

  it("draws from a namespaced seed, never the bare key the look hash uses", () => {
    counter.seeds.length = 0;
    pickDrink("s1:main", 3);
    expect(counter.seeds).toEqual(["drink:s1:main:3"]);
    // not the look hash of the key: over many keys the drink is not a function of hash(key)
    let same = 0;
    for (let i = 0; i < 400; i++) {
      const key = `agent-${i}`;
      const look = hash(key) / 0x1_0000_0000 < 0.6 ? "coffee" : "water";
      if (pickDrink(key, 0) === look) same++;
    }
    expect(same / 400).toBeLessThan(0.75);
  });
});
