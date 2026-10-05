import { mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  assertTempRoot,
  budgetVerdict,
  decide,
  hero,
  makeRunRoot,
  medianOf,
  officeEnv,
  p95,
  RECALC_BUDGET_MS,
  ROWS,
  burstRecalc,
  rowChangeVerdict,
  rowVerdict,
  specResults,
  startOffice,
  worstRecalc,
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

describe("burstRecalc", () => {
  it("is the largest chunk minus the median chunk", () => {
    const r = burstRecalc([5, 5, 5, 70, 5, 5, 5]);
    expect(r?.burstMs).toBe(65);
    expect(r?.maxMs).toBe(70);
    expect(r?.medianMs).toBe(5);
    expect(r?.maxIndex).toBe(3);
  });

  it("is zero for a flat series", () => {
    expect(burstRecalc([4, 4, 4, 4])?.burstMs).toBe(0);
  });

  it("returns null for no chunks, which must never read as a pass", () => {
    expect(burstRecalc([])).toBeNull();
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

describe("rowChangeVerdict", () => {
  const rep = (worstMs: number | null, appearedMs: number | null = 4300) => ({
    appearedMs,
    worstMs,
  });

  it("passes at a median of exactly the budget", () => {
    const v = rowChangeVerdict([rep(10), rep(16), rep(30)], [50, 60, 70]);
    expect(v.status).toBe("PASS");
  });

  it("fails just over the budget", () => {
    expect(rowChangeVerdict([rep(10), rep(16.1), rep(16.1)], [1, 2, 3]).status).toBe("FAIL");
  });

  it("is the median, so one outlier repeat does not decide", () => {
    expect(rowChangeVerdict([rep(5), rep(6), rep(90)], [1, 2, 3]).status).toBe("PASS");
  });

  it("fails when any repeat never saw the new agents, naming the reason", () => {
    const v = rowChangeVerdict([rep(5), rep(5, null), rep(5)], [1, 2, 3]);
    expect(v.status).toBe("FAIL");
    expect(v.measured).toContain("never appeared");
  });

  it("fails when any repeat has no worst event", () => {
    expect(rowChangeVerdict([rep(5), rep(null), rep(5)], [1, 2, 3]).status).toBe("FAIL");
  });

  it("fails with no repeats", () => {
    expect(rowChangeVerdict([], []).status).toBe("FAIL");
  });

  it("reports every repeat value, the old burst figure and the appeared times", () => {
    const v = rowChangeVerdict(
      [rep(11.2, 4100), rep(12.4, 4200), rep(13.6, 4300)],
      [55.5, 44.4, null],
    );
    for (const s of [
      "11.2",
      "12.4",
      "13.6",
      "12.4 ms",
      "55.5",
      "44.4",
      "old burst method",
      "4100",
      "4200",
      "4300",
    ]) {
      expect(v.measured).toContain(s);
    }
  });
});
