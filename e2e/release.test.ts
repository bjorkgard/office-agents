import { mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  AB_PREFIX,
  abArm,
  abDelta,
  abSkippedLine,
  abVerdict,
  anyFailed,
  assertTempRoot,
  budgetVerdict,
  classifyPhase,
  decide,
  EASE_MS,
  FRAME_BUDGET_MS,
  hero,
  makeRunRoot,
  medianOf,
  oneLine,
  officeEnv,
  p95,
  parseArgs,
  perfVerdicts,
  RECALC_BUDGET_MS,
  type RowRepeat,
  ROWS,
  rowChangeVerdict,
  rowVerdict,
  settleRuns,
  specResults,
  startOffice,
  tracedWorstMs,
  worstRecalc,
  worstRecalcEvent,
} from "./release.ts";
import { agentFixtureSet, removeRoot, twelveAgentFixtureSet } from "./support.ts";

describe("decide", () => {
  it("passes an agent inside 10 s, boundary included", () => {
    expect(decide({ agentMs: 2300, failure: null })).toEqual({
      status: "PASS",
      measured: "first agent at 2.3 s",
    });
    expect(decide({ agentMs: 10_000, failure: null }).status).toBe("PASS");
  });

  it("fails an agent that first renders between 10 s and 30 s", () => {
    expect(decide({ agentMs: 10_001, failure: null }).status).toBe("FAIL");
    expect(decide({ agentMs: 30_000, failure: null }).status).toBe("FAIL");
  });

  it("fails on a banner or a page error, even with an agent", () => {
    expect(decide({ agentMs: null, failure: "banner" }).status).toBe("FAIL");
    expect(decide({ agentMs: 1000, failure: "page-error" }).status).toBe("FAIL");
  });

  it("skips when nothing renders within 30 s", () => {
    expect(decide({ agentMs: null, failure: null })).toEqual({
      status: "SKIPPED",
      measured: "no agent within 30.0 s",
    });
    expect(decide({ agentMs: 30_001, failure: null }).status).toBe("SKIPPED");
  });
});

describe("criteria rows", () => {
  it("passes only when every mapped spec ran and passed", () => {
    const row = ROWS[0]!;
    expect(rowVerdict(row.specs, new Map(row.specs.map((t) => [t, true]))).status).toBe("PASS");
    expect(rowVerdict(row.specs, new Map(row.specs.map((t) => [t, false]))).status).toBe("FAIL");
  });

  it("fails a row whose spec was removed", () => {
    const row = ROWS[1]!;
    const results = new Map([[row.specs[0]!, true]]);
    expect(rowVerdict(row.specs, results)).toEqual({
      status: "FAIL",
      measured: "1 of 2 specs passed",
    });
  });

  it("does not count a skipped spec as passed, though Playwright reports ok", () => {
    const spec = (title: string, status: string) => ({
      title,
      ok: true,
      tests: [{ results: [{ status }] }],
    });
    const report = { specs: [spec("ran", "passed"), spec("skipped", "skipped")] };
    expect(specResults(report)).toEqual(
      new Map([
        ["ran", true],
        ["skipped", false],
      ]),
    );
  });

  it("does not count a spec with no tests array as passed", () => {
    expect(specResults({ specs: [{ title: "bare", ok: true }] })).toEqual(
      new Map([["bare", false]]),
    );
  });

  it("reads nested suites and ands repeated titles", () => {
    const ran = { results: [{ status: "passed" }] };
    const report = {
      suites: [
        {
          specs: [{ title: "a", ok: true, tests: [ran] }],
          suites: [{ specs: [{ title: "b", ok: false }] }],
        },
        { specs: [{ title: "a", ok: false }] },
      ],
    };
    expect(specResults(report)).toEqual(
      new Map([
        ["a", false],
        ["b", false],
      ]),
    );
  });
});

describe("temp root guard", () => {
  const made: string[] = [];
  afterEach(() => {
    for (const p of made.splice(0)) removeRoot(p);
  });

  it("accepts a fresh temp run root", () => {
    const root = makeRunRoot();
    made.push(root);
    expect(assertTempRoot(root)).toBe(root);
  });

  it("refuses paths that are not temp run roots", () => {
    expect(() => assertTempRoot(join(process.env.HOME ?? "/", ".claude", "projects"))).toThrow();
    expect(() => assertTempRoot("")).toThrow();
    expect(() => assertTempRoot(tmpdir())).toThrow();
  });

  it("refuses a symlink named like a run root", () => {
    const target = makeRunRoot();
    made.push(target);
    const link = join(tmpdir(), `office-e2e-run-link-${process.pid}-${Date.now()}`);
    symlinkSync(target, link);
    made.push(link);
    expect(() => assertTempRoot(link)).toThrow();
  });

  it("hero refuses a non-temp root before writing or spawning", async () => {
    const notRoot = join(tmpdir(), "office-not-a-run-root");
    made.push(notRoot);
    mkdirSync(notRoot, { recursive: true });
    await expect(hero(notRoot, join(notRoot, "x.png"))).rejects.toThrow("refusing");
    expect(readdirSync(notRoot)).toEqual([]);
  });

  it("startOffice refuses a non-temp root before spawning", async () => {
    const notRoot = join(tmpdir(), "office-not-a-run-root");
    made.push(notRoot);
    mkdirSync(notRoot, { recursive: true });
    await expect(startOffice({ root: notRoot })).rejects.toThrow("refusing");
  });
});

describe("officeEnv", () => {
  it("gives every server its own hook dir, outside the home dir", () => {
    const a = officeEnv(null, join(tmpdir(), "office-e2e-hook-a"));
    const b = officeEnv(null, join(tmpdir(), "office-e2e-hook-b"));
    expect(a.OFFICE_HOOK_DIR).toBe(join(tmpdir(), "office-e2e-hook-a"));
    expect(a.OFFICE_HOOK_DIR).not.toBe(b.OFFICE_HOOK_DIR);
    expect(a.OFFICE_HOOK_DIR?.startsWith(homedir())).toBe(false);
  });

  it("overrides an inherited OFFICE_HOOK_DIR and drops inherited feed vars", () => {
    process.env.OFFICE_HOOK_DIR = "/inherited";
    process.env.OFFICE_E2E_CACHE = "/inherited-cache";
    try {
      const env = officeEnv(null, "/h");
      expect(env.OFFICE_HOOK_DIR).toBe("/h");
      expect(env.OFFICE_E2E_ROOT).toBeUndefined();
      expect(env.OFFICE_E2E_CACHE).toBeUndefined();
    } finally {
      delete process.env.OFFICE_HOOK_DIR;
      delete process.env.OFFICE_E2E_CACHE;
    }
  });
});

describe("p95", () => {
  it("is the nearest-rank 95th percentile, order independent", () => {
    const frames = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(p95(frames)).toBe(95);
    expect(p95([...frames].reverse())).toBe(95);
    expect(p95([16.7])).toBe(16.7);
  });

  it("is null for zero frames", () => {
    expect(p95([])).toBeNull();
  });
});

describe("budgetVerdict", () => {
  it("passes at the budget and fails above it", () => {
    expect(budgetVerdict("p95 frame", 20, 20).status).toBe("PASS");
    expect(budgetVerdict("p95 frame", 20.1, 20).status).toBe("FAIL");
  });

  it("judges the raw row-change recalc against the 16 ms budget", () => {
    expect(budgetVerdict("row-change style recalc", 16, RECALC_BUDGET_MS).status).toBe("PASS");
    expect(budgetVerdict("row-change style recalc", 17, RECALC_BUDGET_MS).status).toBe("FAIL");
  });

  it("fails when nothing was measured", () => {
    const v = budgetVerdict("p95 frame", null, 20);
    expect(v.status).toBe("FAIL");
    expect(v.measured).toContain("no frames");
  });
});

describe("agentFixtureSet", () => {
  it("makes distinct sessions for any count, and 12 equals the twelve set", () => {
    expect(agentFixtureSet(24).length).toBe(24);
    expect(new Set(agentFixtureSet(24).map((f) => f.path)).size).toBe(24);
    expect(agentFixtureSet(12)).toEqual(twelveAgentFixtureSet());
  });
});

describe("worstRecalc", () => {
  const mark = { name: "row-write", ph: "R", ts: 1_000_000 };
  const layout = (ts: number, dur: number, ph = "X", name = "UpdateLayoutTree") => ({
    name,
    ph,
    ts,
    dur,
  });

  it("returns the longest UpdateLayoutTree in the window, in ms", () => {
    const events = [
      mark,
      layout(1_000_100, 4_000),
      layout(1_200_000, 12_500),
      layout(1_300_000, 900),
    ];
    expect(worstRecalc(events, 1500)).toBe(12.5);
  });

  it("ignores events before the mark, after the window, other names and non-X phases", () => {
    const events = [
      mark,
      layout(999_999, 90_000),
      layout(1_000_000 + 1_500_001, 80_000),
      layout(1_100_000, 70_000, "X", "Layout"),
      layout(1_100_000, 60_000, "B"),
      layout(1_100_000, 3_000),
    ];
    expect(worstRecalc(events, 1500)).toBe(3);
  });

  it("includes events exactly at the mark and at the window end", () => {
    expect(worstRecalc([mark, layout(1_000_000, 2_000), layout(2_500_000, 5_000)], 1500)).toBe(5);
  });

  it("returns null with no mark, which must never read as a pass", () => {
    expect(worstRecalc([layout(1_100_000, 5_000)], 1500)).toBeNull();
  });

  it("returns null with no qualifying event", () => {
    expect(worstRecalc([mark, layout(1_100_000, 5_000, "X", "Layout")], 1500)).toBeNull();
  });
});

describe("worstRecalcEvent", () => {
  const mark = { name: "row-write", ph: "R", ts: 1_000_000 };
  const layout = (ts: number, dur: number) => ({ name: "UpdateLayoutTree", ph: "X", ts, dur });

  it("returns the duration and the offset from the mark of the worst event, in ms", () => {
    const events = [mark, layout(1_100_000, 4_000), layout(1_250_000, 12_500)];
    expect(worstRecalcEvent(events, 1500)).toEqual({
      durMs: 12.5,
      offsetMs: 250,
      elementCount: null,
    });
  });

  it("agrees with worstRecalc and is null where it is", () => {
    const events = [mark, layout(1_100_000, 4_000)];
    expect(worstRecalcEvent(events, 1500)!.durMs).toBe(worstRecalc(events, 1500));
    expect(worstRecalcEvent([layout(1_100_000, 4_000)], 1500)).toBeNull();
  });
});

describe("worstRecalcEvent elementCount", () => {
  const mark = { name: "row-write", ph: "R", ts: 1_000_000 };

  it("carries args.elementCount of the worst event, null when absent", () => {
    const withCount = {
      name: "UpdateLayoutTree",
      ph: "X",
      ts: 1_100_000,
      dur: 9_000,
      args: { elementCount: 812 },
    };
    const small = {
      name: "UpdateLayoutTree",
      ph: "X",
      ts: 1_200_000,
      dur: 1_000,
      args: { elementCount: 5 },
    };
    expect(worstRecalcEvent([mark, small, withCount], 1500)!.elementCount).toBe(812);
    expect(worstRecalcEvent([mark, { ...withCount, args: {} }], 1500)!.elementCount).toBeNull();
    expect(
      worstRecalcEvent([mark, { ...withCount, args: undefined }], 1500)!.elementCount,
    ).toBeNull();
  });
});

describe("classifyPhase", () => {
  it("is mount before the agents appeared, ease for EASE_MS after, idle beyond", () => {
    expect(classifyPhase(0, 4300)).toBe("mount");
    expect(classifyPhase(4299.9, 4300)).toBe("mount");
    expect(classifyPhase(4300, 4300)).toBe("ease");
    expect(classifyPhase(4300 + EASE_MS - 0.1, 4300)).toBe("ease");
    expect(classifyPhase(4300 + EASE_MS, 4300)).toBe("idle");
    expect(classifyPhase(4300 + 2 * EASE_MS, 4300)).toBe("idle");
  });
});

describe("tracedWorstMs", () => {
  const events = [
    { name: "row-write", ph: "R", ts: 1_000_000 },
    { name: "UpdateLayoutTree", ph: "X", ts: 1_100_000, dur: 7_000 },
  ];

  it("is the worst recalc when the trace kept all its data", () => {
    expect(tracedWorstMs(events, 1500, false)).toBe(7);
  });

  it("is null when the trace lost data, however good the events look", () => {
    expect(tracedWorstMs(events, 1500, true)).toBeNull();
  });
});

describe("medianOf", () => {
  it("takes the middle of an odd count", () => {
    expect(medianOf([9, 1, 5])).toBe(5);
  });

  it("averages the middle two of an even count", () => {
    expect(medianOf([4, 1, 3, 2])).toBe(2.5);
  });

  it("returns null for no values", () => {
    expect(medianOf([])).toBeNull();
  });
});

describe("settleRuns", () => {
  it("keeps nothing and drops nothing for no runs or one run", () => {
    expect(settleRuns([])).toEqual({ kept: [], dropped: false });
    expect(settleRuns([9])).toEqual({ kept: [9], dropped: false });
  });

  it("drops a first run higher than the median of the rest", () => {
    expect(settleRuns([9, 5])).toEqual({ kept: [5], dropped: true });
  });

  it("keeps a first run equal to the median of the rest", () => {
    expect(settleRuns([5, 5, 7])).toEqual({ kept: [5, 5, 7], dropped: false });
  });
});

describe("parseArgs", () => {
  it("accepts a bare subcommand, and --ab only for perf", () => {
    expect(parseArgs(["perf"])).toEqual({ sub: "perf", ab: false });
    expect(parseArgs(["perf", "--ab"])).toEqual({ sub: "perf", ab: true });
    expect(parseArgs(["criteria"])).toEqual({ sub: "criteria", ab: false });
    expect(parseArgs(["hero"])).toEqual({ sub: "hero", ab: false });
  });

  it("rejects --ab on another subcommand, extra or misspelled arguments, and unknown subcommands", () => {
    expect(parseArgs(["criteria", "--ab"])).toBeNull();
    expect(parseArgs(["perf", "--abb"])).toBeNull();
    expect(parseArgs(["perf", "--ab", "--ab"])).toBeNull();
    expect(parseArgs([])).toBeNull();
    expect(parseArgs(["bogus"])).toBeNull();
  });
});

describe("rowChangeVerdict", () => {
  const rep = (worstMs: number | null, appearedMs: number | null = 4300) => ({
    appearedMs,
    worstMs,
  });

  it("passes at a median of exactly the budget", () => {
    const v = rowChangeVerdict([rep(10), rep(16), rep(30)]);
    expect(v.status).toBe("PASS");
  });

  it("is inconclusive just over the budget", () => {
    expect(rowChangeVerdict([rep(10), rep(16.1), rep(16.1)]).status).toBe("INCONCLUSIVE");
  });

  it("is the median, so one outlier repeat does not decide", () => {
    expect(rowChangeVerdict([rep(5), rep(6), rep(90)]).status).toBe("PASS");
  });

  it("fails when any repeat never saw the new agents, naming the reason", () => {
    const v = rowChangeVerdict([rep(5), rep(5, null), rep(5)]);
    expect(v.status).toBe("FAIL");
    expect(v.measured).toContain("never appeared");
  });

  it("still says never appeared for a null repeat without runError", () => {
    const v = rowChangeVerdict([rep(5), { appearedMs: null, worstMs: null, runError: null }]);
    expect(v.measured).toContain("never appeared");
    expect(v.measured).not.toContain("repeat failed");
  });

  it("fails when any repeat has no worst event", () => {
    expect(rowChangeVerdict([rep(5), rep(null), rep(5)]).status).toBe("FAIL");
  });

  it("fails with no repeats", () => {
    expect(rowChangeVerdict([]).status).toBe("FAIL");
  });

  it("mentions neither warm-up nor dropped with a single repeat", () => {
    const v = rowChangeVerdict([rep(10)]);
    expect(v.status).toBe("PASS");
    expect(v.measured).not.toContain("warm-up");
    expect(v.measured).not.toContain("dropped");
  });

  it("flags a pass within 10% of the budget as marginal, and nothing else", () => {
    const rep3 = (m: number) => rowChangeVerdict([rep(m), rep(m), rep(m)]);
    expect(rep3(14.5).status).toBe("PASS");
    expect(rep3(14.5).measured).toContain("marginal: within 10% of the budget");
    expect(rep3(16).measured).toContain("marginal: within 10% of the budget");
    expect(rep3(14.4).measured).not.toContain("marginal");
    expect(rep3(5).measured).not.toContain("marginal");
    expect(rep3(16.1).status).toBe("INCONCLUSIVE");
    expect(rep3(16.1).measured).not.toContain("marginal");
  });

  describe("six runs", () => {
    const six = (ms: number[]) => rowChangeVerdict(ms.map((m) => rep(m)));

    it("bands the median: 16 PASS, 16.01 and 17.5 INCONCLUSIVE, 17.51 FAIL", () => {
      const all = (m: number) => six([m, m, m, m, m, m]);
      expect(all(16).status).toBe("PASS");
      expect(all(16.01).status).toBe("INCONCLUSIVE");
      expect(all(17.5).status).toBe("INCONCLUSIVE");
      expect(all(17.51).status).toBe("FAIL");
      expect(all(17.5).measured).not.toContain("marginal");
    });

    it("prints the median with 2 decimals so text near the band edge matches the status", () => {
      const v = six([16.04, 16.04, 16.04, 16.04, 16.04, 16.04]);
      expect(v.status).toBe("INCONCLUSIVE");
      expect(v.measured).toContain("16.04");
    });

    it("reports a thrown repeat as repeat failed, not as never appeared", () => {
      const reps: RowRepeat[] = [5, 5, 5, 5, 5, 5].map((m) => rep(m));
      reps[2] = { appearedMs: null, worstMs: null, runError: "page crashed" };
      const v = rowChangeVerdict(reps);
      expect(v.status).toBe("FAIL");
      expect(v.measured).toContain("repeat failed: page crashed");
      expect(v.measured).not.toContain("never appeared");
    });

    it("fails with null data in any run, with a reason", () => {
      const v = rowChangeVerdict([rep(5), rep(5), rep(null), rep(5), rep(5), rep(5)]);
      expect(v.status).toBe("FAIL");
      expect(v.measured).toContain("no style recalc event traced");
    });

    it("fails when only the first of six runs has no worst event", () => {
      const v = rowChangeVerdict([rep(null), rep(5), rep(5), rep(5), rep(5), rep(5)]);
      expect(v.status).toBe("FAIL");
      expect(v.measured).toContain("no style recalc event traced");
    });

    it("drops a first run higher than the median of runs 2-6, median of the remaining 5", () => {
      // runs 2-6 median 10; first 50 is higher so dropped; median of [10,10,10,12,14] = 10
      const v = six([50, 10, 12, 10, 14, 10]);
      expect(v.status).toBe("PASS");
      expect(v.measured).toContain("median worst event 10.00 ms");
      expect(v.measured).toContain(
        "warm-up run 1 dropped (50.0 ms, higher than the median of runs 2-6)",
      );
      expect(v.measured).toContain("50.0/10.0/12.0/10.0/14.0/10.0");
    });

    it("keeps the first run when it is not higher, median of all 6", () => {
      // runs 2-6 median 10; first 10 is not greater than that, so it is kept; all 6 sorted [3,10,10,10,12,20] median 10
      const v = six([10, 20, 10, 12, 10, 3]);
      expect(v.measured).toContain("warm-up run 1 kept");
      expect(v.measured).toContain("median worst event 10.00 ms");
      // a low first run is kept (median here stays 18; the next test pins a case where it moves)
      const low = six([1, 18, 18, 18, 18, 18]).measured;
      expect(low).toContain("warm-up run 1 kept");
      expect(low).toContain("median worst event 18.00 ms");
      // first equal to the median of the rest is kept
      expect(six([10, 10, 10, 10, 10, 10]).measured).toContain("warm-up run 1 kept");
    });

    it("pins the median of a kept low first run: all six runs count", () => {
      // sorted [2,18,18,20,20,20] median 19; dropping the 2 would give 20
      const v = six([2, 18, 18, 20, 20, 20]);
      expect(v.measured).toContain("median worst event 19.00 ms");
      expect(v.measured).toContain("warm-up run 1 kept");
    });

    it("lets the dropped warm-up change the verdict", () => {
      // kept would give median (17+17)/2 = 17 -> INCONCLUSIVE; dropped gives 14 -> PASS
      expect(six([30, 14, 14, 14, 20, 20]).status).toBe("PASS");
      expect(six([15, 17, 17, 17, 17, 17]).status).toBe("INCONCLUSIVE");
    });
  });

  it("reports every repeat value and the appeared times", () => {
    const v = rowChangeVerdict([rep(11.2, 4100), rep(12.4, 4200), rep(13.6, 4300)]);
    for (const s of ["11.2", "12.4", "13.6", "12.40 ms", "4100", "4200", "4300"]) {
      expect(v.measured).toContain(s);
    }
  });
});

describe("oneLine", () => {
  it("collapses whitespace and newlines to single spaces", () => {
    expect(oneLine("a\n  b\t\tc\r\nd")).toBe("a b c d");
  });

  it("caps at 200 characters", () => {
    expect(oneLine("x".repeat(500))).toHaveLength(200);
    expect(oneLine("short")).toBe("short");
  });
});

describe("anyFailed", () => {
  const v = (status: "PASS" | "FAIL" | "SKIPPED" | "INCONCLUSIVE") => ({ status, measured: "" });

  it("is true only for FAIL; PASS, SKIPPED and INCONCLUSIVE are not failures", () => {
    expect(anyFailed([v("PASS"), v("SKIPPED"), v("INCONCLUSIVE")])).toBe(false);
    expect(anyFailed([v("PASS"), v("FAIL")])).toBe(true);
    expect(anyFailed([v("INCONCLUSIVE"), v("FAIL")])).toBe(true);
    expect(anyFailed([])).toBe(false);
  });
});

describe("abDelta and abVerdict", () => {
  const arm = (
    medianMs: number | null,
    animations: number | null,
    error: string | null = null,
    noWorst = 0,
    total = 3,
  ) => ({
    medianMs,
    animations,
    error,
    noWorst,
    total,
  });

  it("is animated minus frozen, by named arm, so swapped columns flip the sign", () => {
    expect(abDelta({ animated: arm(18, 40), frozen: arm(12, 0) })).toEqual({
      deltaMs: 6,
      deltaAnimations: 40,
    });
    expect(abDelta({ animated: arm(12, 0), frozen: arm(18, 40) })).toEqual({
      deltaMs: -6,
      deltaAnimations: -40,
    });
  });

  it("is null when either arm lacks data", () => {
    expect(abDelta({ animated: arm(null, 3), frozen: arm(12, 0) })).toBeNull();
    expect(abDelta({ animated: arm(12, 3), frozen: arm(12, null) })).toBeNull();
    expect(abDelta({ animated: arm(12, 3), frozen: arm(null, 0) })).toBeNull();
    expect(abDelta({ animated: arm(12, null), frozen: arm(12, 0) })).toBeNull();
  });

  it("reports the animated error before the frozen error", () => {
    const v = abVerdict({
      animated: arm(null, null, "probe failed: a"),
      frozen: arm(null, null, "repeat failed: b"),
    });
    expect(v.measured).toContain("probe failed: a");
    expect(v.measured).not.toContain("repeat failed: b");
  });

  it("names the arm and how many repeats had no worst event", () => {
    const v = abVerdict({ animated: arm(12, 3), frozen: arm(null, 0, null, 2, 6) });
    expect(v.status).toBe("SKIPPED");
    expect(v.measured).toContain("without animations: 2 of 6 repeats had no worst event");
    expect(v.measured).not.toContain("with animations:");
    const a = abVerdict({ animated: arm(null, 3, null, 1, 6), frozen: arm(null, 0, null, 2, 6) });
    expect(a.measured).toContain("with animations: 1 of 6 repeats had no worst event");
    const e = abVerdict({
      animated: arm(null, 3, null, 1, 6),
      frozen: arm(12, 0, "probe failed: x"),
    });
    expect(e.measured).toContain("probe failed: x");
    expect(e.measured).not.toContain("had no worst event");
  });

  it("prints a PASS delta line with both medians and counts", () => {
    const v = abVerdict({ animated: arm(18, 40), frozen: arm(12, 0) });
    expect(v.status).toBe("PASS");
    expect(v.measured).toContain("with animations 18.0 ms, 40 animations");
    expect(v.measured).toContain("without 12.0 ms, 0 animations");
    expect(v.measured).toContain("delta +6.0 ms");
  });

  it("prints a negative delta without a doubled sign", () => {
    const v = abVerdict({ animated: arm(12, 40), frozen: arm(18, 0) });
    expect(v.measured).toContain("delta -6.0 ms");
    expect(v.measured).not.toContain("+-");
  });

  it("is SKIPPED with the probe error when getAnimations is unavailable", () => {
    const v = abVerdict({
      animated: arm(18, 40),
      frozen: arm(12, null, "getAnimations is not a function"),
    });
    expect(v.status).toBe("SKIPPED");
    expect(v.measured).toContain("animations A/B: not measured (");
    expect(v.measured).toContain("getAnimations is not a function");
  });

  it("is SKIPPED with a reason when timing data is missing", () => {
    const v = abVerdict({ animated: arm(null, 3), frozen: arm(12, 0) });
    expect(v.status).toBe("SKIPPED");
    expect(v.measured).toBe("animations A/B: not measured (no median worst event in an arm)");
  });

  it("says the animation count is missing when only the count is missing", () => {
    const v = abVerdict({ animated: arm(12, 3), frozen: arm(12, null) });
    expect(v.status).toBe("SKIPPED");
    expect(v.measured).toBe("animations A/B: not measured (no animation count in an arm)");
  });

  it("notes animations still running in the frozen arm without changing the status", () => {
    const v = abVerdict({ animated: arm(18, 40), frozen: arm(12, 2) });
    expect(v.status).toBe("PASS");
    expect(v.measured).toContain("; frozen arm still had 2 animations");
    expect(abVerdict({ animated: arm(18, 40), frozen: arm(12, 0) }).measured).not.toContain(
      "frozen arm still had",
    );
  });

  it("prints idle animation counts rounded", () => {
    const v = abVerdict({ animated: arm(18, 40.5), frozen: arm(12, 0) });
    expect(v.measured).toContain("41 animations");
    expect(v.measured).not.toContain("40.5");
  });
});

describe("abSkippedLine", () => {
  const v = (status: "PASS" | "FAIL" | "SKIPPED" | "INCONCLUSIVE") => ({ status, measured: "" });

  it("counts SKIPPED verdicts only when --ab is set", () => {
    const ab = { status: "SKIPPED" as const, measured: "animations A/B: not measured (x)" };
    const all = [v("PASS"), ab, ab];
    expect(abSkippedLine(all, true)).toBe("2 SKIPPED (A/B not measured)");
    expect(abSkippedLine(all, false)).toBeNull();
    expect(abSkippedLine([v("SKIPPED"), ab], true)).toBe("1 SKIPPED (A/B not measured)");
    expect(abSkippedLine([v("SKIPPED")], true)).toBeNull();
    expect(abSkippedLine([v("PASS"), v("INCONCLUSIVE")], true)).toBeNull();
  });

  it("counts a SKIPPED verdict built by abVerdict itself", () => {
    const skipped = abVerdict({
      animated: { medianMs: 1, animations: null, error: null, noWorst: 0, total: 3 },
      frozen: { medianMs: 1, animations: 0, error: null, noWorst: 0, total: 3 },
    });
    expect(skipped.status).toBe("SKIPPED");
    expect(skipped.measured.startsWith(AB_PREFIX)).toBe(true);
    expect(abSkippedLine([skipped], true)).toBe("1 SKIPPED (A/B not measured)");
  });
});

describe("abArm", () => {
  const run = (
    worstMs: number | null,
    idleAnimations: number | null,
    probeError: string | null = null,
    runError: string | null = null,
  ) => ({
    appearedMs: 4000,
    worstMs,
    idleAnimations,
    probeError,
    runError,
  });

  it("takes the median worst and median idle animation count", () => {
    const a = abArm([run(10, 4), run(30, 6), run(20, 5)]);
    expect(a).toEqual({ medianMs: 20, animations: 5, error: null, noWorst: 0, total: 3 });
  });

  it("carries a probe error and nulls the count", () => {
    const a = abArm([run(10, null, "boom"), run(11, 3)]);
    expect(a.animations).toBeNull();
    expect(a.error).toBe("probe failed: boom");
  });

  it("says repeat failed, not probe, for a thrown repeat, and the verdict is SKIPPED", () => {
    const thrown = run(null, null, null, "page crashed");
    const a = abArm([thrown]);
    expect(a.error).toBe("repeat failed: page crashed");
    const v = abVerdict({ animated: abArm([run(10, 3)]), frozen: a });
    expect(v.status).toBe("SKIPPED");
    expect(v.measured).toContain("repeat failed: page crashed");
    expect(v.measured).not.toContain("probe");
  });

  it("reports the probe error when one arm has both a probe error and a thrown repeat", () => {
    const a = abArm([run(10, null, "boom"), run(null, null, null, "page crashed")]);
    expect(a.error).toBe("probe failed: boom");
  });

  it("nulls the median when a run has no worst event or no runs exist", () => {
    expect(abArm([run(null, 1)]).medianMs).toBeNull();
    expect(abArm([]).medianMs).toBeNull();
  });

  it("nulls both medians for a mixed set, with no error", () => {
    const a = abArm([run(null, null), run(5, 2), run(7, null)]);
    expect(a.medianMs).toBeNull();
    expect(a.animations).toBeNull();
    expect(a.error).toBeNull();
  });

  it("counts the repeats that had no worst event", () => {
    const a = abArm([run(null, 1), run(5, 1), run(null, 1)]);
    expect(a.noWorst).toBe(2);
    expect(a.total).toBe(3);
  });
});

// Value: protects=perf verdicts never pass when the steady sample is missing or a repeat threw;
//   fails_when=the no-frames guard is dropped, the p95 budget is ignored, or a thrown repeat stops failing the row;
//   why_new=perfAt assembled these inline behind live-browser code, so nothing ran them;
//   seam=perfVerdicts (non-test callers: 1, via perfAt)
describe("perfVerdicts", () => {
  const good = { appearedMs: 4000, worstMs: 5 };

  it("fails the frame verdict when there is no steady sample or no frames", () => {
    for (const steady of [null, { frames: [] }]) {
      const v = perfVerdicts(12, steady, [good, good, good]);
      expect(v[0]).toEqual({ status: "FAIL", measured: "p95 frame: no frames measured" });
    }
  });

  it("checks the p95 frame against the budget for the agent count, row verdict second", () => {
    const budget = FRAME_BUDGET_MS[12]!;
    const under = perfVerdicts(12, { frames: [budget - 1, budget - 1] }, [good]);
    const over = perfVerdicts(12, { frames: [budget + 1, budget + 1] }, [good]);
    expect(under).toHaveLength(2);
    expect(under[0]!.status).toBe("PASS");
    expect(over[0]!.status).toBe("FAIL");
    expect(under[1]!.measured).toContain("row-change style recalc");
  });

  it("fails the row verdict when a repeat threw and was recorded as all null", () => {
    const thrown = { appearedMs: null, worstMs: null };
    const v = perfVerdicts(12, { frames: [10] }, [good, thrown, good]);
    expect(v[0]!.status).toBe("PASS");
    expect(v[1]!.status).toBe("FAIL");
  });
});
