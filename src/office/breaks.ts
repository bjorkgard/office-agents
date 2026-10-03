import { hash } from "./appearance";

/**
 * The coffee-break schedule of a parent waiting on subagents, pure and reload-stable. Every cycle
 * is: walk to the coffee station or the water dispenser (pickDrink), stay a random BREAK_MIN_MS..BREAK_MAX_MS, walk back, sit a
 * random COOLDOWN_MIN_MS..COOLDOWN_MAX_MS, repeat. The randomness is only `hash` of a namespaced
 * seed (never the bare agent key, which the look hash already uses, never Math.random), so the
 * same agent and the same wait start always give the same plan.
 */

export const BREAK_MIN_MS = 5000;
export const BREAK_MAX_MS = 20000;
export const COOLDOWN_MIN_MS = 20000;
export const COOLDOWN_MAX_MS = 60000;
/** Elapsed time past this is treated as this, which bounds the cycles ever computed per plan. */
const MAX_ELAPSED_MS = 30 * 24 * 3600 * 1000;
const MAX_PLANS = 256;

const span = (seed: string, min: number, max: number) =>
  min + Math.floor((hash(seed) / 0x1_0000_0000) * (max - min + 1));

/** Time at the coffee station in cycle `cycle` of `key`'s plan. */
export const breakDwellMs = (key: string, cycle: number) =>
  span(`break:${key}:${cycle}:dwell`, BREAK_MIN_MS, BREAK_MAX_MS);

/** Time seated after cycle `cycle` of `key`'s plan, before the next break starts. */
export const breakCooldownMs = (key: string, cycle: number) =>
  span(`break:${key}:${cycle}:cooldown`, COOLDOWN_MIN_MS, COOLDOWN_MAX_MS);

export type Drink = "coffee" | "water";
/** Share of breaks that take coffee; the rest take water. */
export const COFFEE_SHARE = 0.6;

/**
 * The drink of break `cycle` of `key` (a waiting parent's cycle index, or an idle trip's start
 * time): coffee 60%, water 40%, from a namespaced seed so it is not tied to the look hash.
 */
export const pickDrink = (key: string, cycle: number): Drink =>
  hash(`drink:${key}:${cycle}`) / 0x1_0000_0000 < COFFEE_SHARE ? "coffee" : "water";

export type BreakPlan = {
  /** Elapsed ms since the wait began at which cycle `cycle` starts (the agent leaves its seat). */
  start(cycle: number): number;
  dwellMs(cycle: number): number;
  cooldownMs(cycle: number): number;
  /** The drink of cycle `cycle` (pickDrink), whose walk the cycle is timed with. */
  drink(cycle: number): Drink;
  /** The cycle running at `elapsed` and when it started. */
  locate(elapsed: number): { cycle: number; start: number };
};

function makePlan(key: string, coffeeWalkMs: number, waterWalkMs: number): BreakPlan {
  // starts[i] is cycle i's start; filled lazily and only ever appended, so a lookup is a binary
  // search and, as time moves forward, amortized O(1) new cycles per call.
  const starts = [0];
  const dwell: number[] = [];
  const cool: number[] = [];
  const drinks: Drink[] = [];
  const fill = (cycle: number) => {
    while (starts.length <= cycle + 1) {
      const i = starts.length - 1;
      dwell[i] = breakDwellMs(key, i);
      cool[i] = breakCooldownMs(key, i);
      drinks[i] = pickDrink(key, i);
      const walkMs = drinks[i] === "water" ? waterWalkMs : coffeeWalkMs;
      starts.push(starts[i] + 2 * walkMs + dwell[i] + cool[i]);
    }
  };
  return {
    start(cycle) {
      fill(cycle);
      return starts[cycle];
    },
    dwellMs(cycle) {
      fill(cycle);
      return dwell[cycle];
    },
    cooldownMs(cycle) {
      fill(cycle);
      return cool[cycle];
    },
    drink(cycle) {
      fill(cycle);
      return drinks[cycle];
    },
    locate(elapsed) {
      const e = Math.min(Math.max(0, elapsed), MAX_ELAPSED_MS);
      while (starts[starts.length - 1] <= e) fill(starts.length - 1);
      let lo = 0;
      let hi = starts.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (starts[mid] <= e) lo = mid;
        else hi = mid;
      }
      return { cycle: lo, start: starts[lo] };
    },
  };
}

const plans = new Map<string, BreakPlan>();

/**
 * The plan of agent `key` for one-way walks of `coffeeWalkMs` and `waterWalkMs` (a cycle is timed
 * with its own drink's walk, so its seated cooldown is exactly the random one). Cached per (key,
 * both walks), so the cycle boundaries are computed once however many frames ask.
 */
export function breakPlan(
  key: string,
  coffeeWalkMs: number,
  waterWalkMs = coffeeWalkMs,
): BreakPlan {
  const id = `${key}|${coffeeWalkMs}|${waterWalkMs}`;
  let plan = plans.get(id);
  if (!plan) {
    if (plans.size >= MAX_PLANS) plans.clear();
    plan = makePlan(key, coffeeWalkMs, waterWalkMs);
    plans.set(id, plan);
  }
  return plan;
}
