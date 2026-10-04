import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import {
  coreFixtureSet,
  isRealDirectory,
  isRunRoot,
  makeTempRoot,
  removeRunRoot,
  twelveAgentFixtureSet,
  writeFixtureSet,
  type FixtureFile,
} from "./e2e/support.ts";

type Scenario = {
  name: string;
  port: number;
  files: () => FixtureFile[];
  /** How long before "now" the newest fixture line is, so the scenario's agents read as aged. */
  ageOffsetMs: number;
};

// 45 minutes: past STALE_MS (30 min) and inside ATTENTION_STALE_MS (4 h), so files stay tracked.
const STALE_AGE_MS = 45 * 60 * 1000;

const SCENARIOS: Scenario[] = [
  { name: "core", port: 5201, files: coreFixtureSet, ageOffsetMs: 0 },
  { name: "live", port: 5202, files: coreFixtureSet, ageOffsetMs: 0 },
  { name: "twelve", port: 5203, files: twelveAgentFixtureSet, ageOffsetMs: 0 },
  { name: "stale", port: 5204, files: coreFixtureSet, ageOffsetMs: STALE_AGE_MS },
  { name: "empty", port: 5205, files: () => [], ageOffsetMs: 0 },
  { name: "visual", port: 5206, files: coreFixtureSet, ageOffsetMs: 0 },
];

/**
 * One temp base for the whole run. The config is evaluated again in every worker, which
 * inherits this variable, so only the main process creates (and later removes) the base.
 */
function tempBase(): string {
  const existing = process.env.OFFICE_E2E_BASE;
  // An ambient value is only trusted when it looks like a run root this suite would have made.
  if (existing !== undefined && isRunRoot(existing) && isRealDirectory(existing)) return existing;
  const base = makeTempRoot("run");
  process.env.OFFICE_E2E_BASE = base;
  // Removes the roots even when a webServer fails to start and no teardown runs.
  process.on("exit", () => removeRunRoot(base));
  return base;
}

const base = tempBase();

function prepare(s: Scenario) {
  const root = join(base, s.name, "root");
  const cache = join(base, s.name, "cache");
  const hookDir = join(base, s.name, "hook");
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true });
    mkdirSync(cache, { recursive: true });
    mkdirSync(hookDir, { recursive: true });
    const files = s.files();
    if (files.length > 0)
      writeFixtureSet(root, files, { anchorNow: Date.now(), ageOffsetMs: s.ageOffsetMs });
    return { root, cache, hookDir, expected: files.length };
  }
  return { root, cache, hookDir, expected: s.files().length };
}

const prepared = SCENARIOS.map((s) => ({ s, ...prepare(s) }));

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{testFilePath}/{arg}{-projectName}{-snapshotSuffix}{ext}",
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: prepared.map(({ s, expected }) => ({
    name: s.name,
    grep: new RegExp(`@${s.name}\\b`),
    metadata: { port: s.port, expected },
    use: { baseURL: `http://localhost:${s.port}` },
  })),
  webServer: prepared.map(({ s, root, cache, hookDir }) => ({
    command: `vp dev --port ${s.port} --strictPort`,
    url: `http://localhost:${s.port}/__office/status`,
    reuseExistingServer: false,
    stdout: "pipe" as const,
    stderr: "pipe" as const,
    timeout: 120_000,
    // A per-run hook dir keeps the dev plugin off the real ~/.office-agents/hook.json.
    env: { OFFICE_E2E_ROOT: root, OFFICE_E2E_CACHE: cache, OFFICE_HOOK_DIR: hookDir },
  })),
});
