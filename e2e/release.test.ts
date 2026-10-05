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
  officeEnv,
  p95,
  RECALC_BUDGET_MS,
  ROWS,
  burstRecalc,
  rowChangeVerdict,
  rowVerdict,
  specResults,
  startOffice,
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

describe("rowChangeVerdict", () => {
  it("fails with the reason when the new agents never rendered", () => {
    const v = rowChangeVerdict({ appearedMs: null, recalcMs: 0, chunkCount: 30 });
    expect(v.status).toBe("FAIL");
    expect(v.measured).toContain("never appeared");
  });

  it("judges the burst figure against the budget once the row appeared", () => {
    const ok = rowChangeVerdict({ appearedMs: 4300, recalcMs: 16, chunkCount: 30 });
    expect(ok.status).toBe("PASS");
    expect(ok.measured).toContain("4300");
    expect(rowChangeVerdict({ appearedMs: 4300, recalcMs: 17, chunkCount: 30 }).status).toBe(
      "FAIL",
    );
  });

  it("fails when the window measured no frames", () => {
    expect(rowChangeVerdict({ appearedMs: 100, recalcMs: 1, chunkCount: 0 }).status).toBe("FAIL");
  });
});
