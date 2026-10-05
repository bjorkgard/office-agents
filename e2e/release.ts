/**
 * Release scoreboard runner: `node e2e/release.ts criteria|perf|hero`. Not a Playwright scenario, because
 * the live smoke reads the real transcript root and `global-setup.ts` needs a fixed file count.
 * Output is one summary line per criterion; page text (which can carry session names) is never
 * printed, only counts and timings.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { cpus, platform, release, userInfo } from "node:os";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DESKS_PER_ROW } from "../shared/tuning.ts";
import {
  agentFixtureSet,
  coreFixtureSet,
  isRealDirectory,
  isRunRoot,
  removeRoot,
  writeFixtureSet,
} from "./support.ts";

export type Status = "PASS" | "FAIL" | "SKIPPED";
export type Verdict = { status: Status; measured: string };
export type Observation = {
  /** Ms from page load to the first `.agent[data-state]`; null when none appeared. */
  agentMs: number | null;
  /** What went wrong first, if anything: a refused/unavailable/display-error banner or a page error. */
  failure: "banner" | "page-error" | null;
};

export const PASS_MS = 10_000;
export const SMOKE_MS = 30_000;

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

/** The pure smoke rule (eng E-D2): PASS <= 10 s; FAIL on trouble or a 10-30 s render; else SKIPPED. */
export function decide(obs: Observation): Verdict {
  if (obs.failure === "banner") return { status: "FAIL", measured: "error banner shown" };
  if (obs.failure === "page-error") return { status: "FAIL", measured: "page error" };
  if (obs.agentMs === null || obs.agentMs > SMOKE_MS) {
    return { status: "SKIPPED", measured: `no agent within ${seconds(SMOKE_MS)}` };
  }
  const measured = `first agent at ${seconds(obs.agentMs)}`;
  return { status: obs.agentMs <= PASS_MS ? "PASS" : "FAIL", measured };
}

/** A root a runner may hand to the dev server as a fixture root: a real temp run dir, never a symlink. */
export function assertTempRoot(path: string): string {
  if (!isRunRoot(path) || !isRealDirectory(path)) {
    throw new Error("refusing a root that is not a temp run directory");
  }
  return path;
}

export function makeRunRoot(): string {
  return mkdtempSync(join(tmpdir(), "office-e2e-run-"));
}

// ---- child processes ------------------------------------------------------------------

const groups = new Set<number>();
const STOP_MS = 15_000;

function killGroups(signal: NodeJS.Signals): void {
  for (const pid of groups) {
    try {
      process.kill(-pid, signal);
    } catch {
      // already gone
    }
  }
}

const tempDirs = new Set<string>();

/** The wrapper (`vp exec`) can exit before the process it started, so wait on the whole group. */
function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** SIGINT, not SIGTERM: Playwright only stops its webServer children on SIGINT. Waits for it, then kills what is left and removes temp dirs. */
let shuttingDown = false;

async function shutdown(): Promise<void> {
  shuttingDown = true;
  killGroups("SIGINT");
  const deadline = Date.now() + STOP_MS;
  while (Date.now() < deadline && [...groups].some(groupAlive)) {
    await new Promise((r) => setTimeout(r, 100));
  }
  killGroups("SIGKILL");
  for (const dir of tempDirs) removeRoot(dir);
}

/** Only the CLI entry registers these, so importing this module has no process-wide effect. */
function installSignalHandlers(): void {
  process.on("exit", () => {
    killGroups("SIGTERM");
    for (const dir of tempDirs) removeRoot(dir);
  });
  for (const [signal, code] of [
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const) {
    process.on(signal, () => {
      if (shuttingDown) return;
      void shutdown().then(() => process.exit(code));
    });
  }
}

/** Own process group, so killing it also takes `vp`'s children. */
function spawnGroup(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  stdio: "ignore" | "pipe-stderr",
): ChildProcess {
  const child = spawn(command, args, {
    detached: true,
    env,
    stdio: stdio === "ignore" ? "ignore" : ["ignore", "ignore", "pipe"],
  });
  if (child.pid !== undefined) groups.add(child.pid);
  return child;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

export type Office = { url: string; stop: () => void };

const READY_MS = 60_000;

/** The dev server's env: feed root/cache from the guarded root only, and a private hook dir so it never writes the real hook.json. */
export function officeEnv(root: string | null, hookDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.OFFICE_E2E_ROOT;
  delete env.OFFICE_E2E_CACHE;
  if (root !== null) env.OFFICE_E2E_ROOT = assertTempRoot(root);
  env.OFFICE_HOOK_DIR = hookDir;
  return env;
}

/** Starts `vp dev` on loopback; `root` null reads the real transcript root, else a guarded temp root. */
export async function startOffice(opts: { root: string | null }): Promise<Office> {
  const hookDir = mkdtempSync(join(tmpdir(), "office-e2e-hook-"));
  tempDirs.add(hookDir);
  const dropHookDir = () => {
    tempDirs.delete(hookDir);
    removeRoot(hookDir);
  };
  let env: NodeJS.ProcessEnv;
  try {
    env = officeEnv(opts.root, hookDir);
  } catch (err) {
    dropHookDir();
    throw err;
  }
  const port = await freePort();
  const child = spawnGroup(
    "vp",
    ["dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    env,
    "pipe-stderr",
  );
  let lastErr = "";
  child.stderr?.on("data", (d: Buffer) => {
    const line = d.toString().trim().split("\n").pop();
    if (line) lastErr = line;
  });
  let exited = false;
  child.on("exit", () => (exited = true));
  const url = `http://127.0.0.1:${port}`;
  const stop = () => {
    if (child.pid !== undefined && !exited) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
    dropHookDir();
  };
  const deadline = Date.now() + READY_MS;
  while (Date.now() < deadline) {
    if (exited) break;
    try {
      if ((await fetch(`${url}/__office/status`)).ok) return { url, stop };
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  stop();
  throw new Error(`dev server did not start: ${lastErr || "no output"}`);
}

// ---- criteria -------------------------------------------------------------------------

const TROUBLE = [/^Refused:/, /^Feed unavailable/, /^Display error/];

/** Loads the page and watches for the first agent; reads only counts and the banner's kind. */
async function smoke(url: string): Promise<Observation> {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let pageError = false;
    page.on("pageerror", () => (pageError = true));
    const start = Date.now();
    await page.goto(url, { waitUntil: "commit" });
    while (Date.now() - start <= SMOKE_MS) {
      if (pageError) return { agentMs: null, failure: "page-error" };
      const banner = await page
        .getByRole("status")
        .first()
        .textContent({ timeout: 500 })
        .catch(() => null);
      if (banner !== null && TROUBLE.some((re) => re.test(banner.trim()))) {
        return { agentMs: null, failure: "banner" };
      }
      if ((await page.locator(".agent[data-state]").count()) > 0) {
        return { agentMs: Date.now() - start, failure: null };
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return { agentMs: null, failure: null };
  } finally {
    await browser.close();
  }
}

/** Rows 2 to 4: each lists the spec titles it needs; a title that did not run counts as failed. */
export const ROWS: { n: number; specs: string[] }[] = [
  { n: 2, specs: ["a subagent walks in, sits down and leaves on handoff"] },
  {
    n: 3,
    specs: [
      "an open tool call past the timer waves",
      "age offset fires R1: a tool call past the timer waves",
    ],
  },
  {
    n: 4,
    specs: [
      "twelve agents fill three rows, four chips and a +N",
      "a narrow window shows every chip, wrapped",
    ],
  },
];

type JsonSpec = {
  title: string;
  ok: boolean;
  tests?: { results?: { status?: string }[] }[];
};
type JsonSuite = { specs?: JsonSpec[]; suites?: JsonSuite[] };

/** `ok` is also true for a skipped test, so a spec counts only when it ran and every result passed. */
function specPassed(spec: JsonSpec): boolean {
  if (!spec.ok) return false;
  const results = (spec.tests ?? []).flatMap((t) => t.results ?? []);
  return results.length > 0 && results.every((r) => r.status === "passed");
}

/** Spec title -> ok, from a Playwright JSON report. */
export function specResults(report: JsonSuite): Map<string, boolean> {
  const out = new Map<string, boolean>();
  const walk = (s: JsonSuite) => {
    for (const spec of s.specs ?? [])
      out.set(spec.title, (out.get(spec.title) ?? true) && specPassed(spec));
    for (const child of s.suites ?? []) walk(child);
  };
  walk(report);
  return out;
}

export function rowVerdict(specs: string[], results: Map<string, boolean>): Verdict {
  const passed = specs.filter((t) => results.get(t) === true).length;
  return {
    status: passed === specs.length ? "PASS" : "FAIL",
    measured: `${passed} of ${specs.length} specs passed`,
  };
}

async function runPlaywright(): Promise<Map<string, boolean>> {
  const dir = mkdtempSync(join(tmpdir(), "office-criteria-"));
  const base = makeRunRoot();
  tempDirs.add(dir).add(base);
  const file = join(dir, "report.json");
  try {
    const child = spawnGroup(
      "vp",
      [
        "exec",
        "playwright",
        "test",
        "--project=core",
        "--project=live",
        "--project=twelve",
        "--reporter=json",
      ],
      { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: file, OFFICE_E2E_BASE: base },
      "ignore",
    );
    await new Promise((r) => child.on("exit", r));
    // The `vp exec` wrapper can exit before Playwright does; the report is complete only after both.
    while (child.pid !== undefined && groupAlive(child.pid)) {
      await new Promise((r) => setTimeout(r, 100));
    }
    try {
      return specResults(JSON.parse(readFileSync(file, "utf8")) as JsonSuite);
    } catch {
      return new Map();
    }
  } finally {
    removeRoot(dir);
    removeRoot(base);
    tempDirs.delete(dir);
    tempDirs.delete(base);
  }
}

const line = (n: number, v: Verdict): string =>
  `${v.status} criterion ${n}, measured ${v.measured}`;

async function criteria(): Promise<number> {
  const verdicts: Verdict[] = [];
  const office = await startOffice({ root: null });
  try {
    verdicts.push(decide(await smoke(office.url)));
  } finally {
    office.stop();
  }
  if (shuttingDown) return 130;
  console.log(line(1, verdicts[0]!));
  const results = await runPlaywright();
  if (shuttingDown) return 130;
  for (const row of ROWS) {
    const v = rowVerdict(row.specs, results);
    verdicts.push(v);
    console.log(line(row.n, v));
  }
  return verdicts.some((v) => v.status === "FAIL") ? 1 : 0;
}

// ---- perf -----------------------------------------------------------------------------

/** Budgets from the phase 6 decisions: p95 frame ms by agent count, and row-change style recalc ms. */
export const FRAME_BUDGET_MS: Record<number, number> = { 12: 20, 24: 33 };
export const RECALC_BUDGET_MS = 16;
const STEADY_MS = 5_000;
const CHUNK_MS = 100;
const TAIL_MS = 1_000;
const ROW_APPEAR_MS = 15_000;
const PERF_AGENTS = [12, 24] as const;

/** Nearest-rank 95th percentile; null for zero frames, which must never read as a pass. */
export function p95(frames: number[]): number | null {
  if (frames.length === 0) return null;
  const sorted = [...frames].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1]!;
}

export function budgetVerdict(label: string, ms: number | null, budget: number): Verdict {
  if (ms === null) return { status: "FAIL", measured: `${label}: no frames measured` };
  return {
    status: ms <= budget ? "PASS" : "FAIL",
    measured: `${label} ${ms.toFixed(1)} ms (budget ${budget} ms)`,
  };
}

/** Row-change recalc from consecutive style-recalc chunks: the largest chunk minus the median (the ambient). */
export function burstRecalc(chunks: number[]): {
  burstMs: number;
  maxMs: number;
  medianMs: number;
  maxIndex: number;
} | null {
  if (chunks.length === 0) return null;
  const sorted = [...chunks].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  const medianMs = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const maxMs = sorted[sorted.length - 1]!;
  return {
    burstMs: Math.max(0, maxMs - medianMs),
    maxMs,
    medianMs,
    maxIndex: chunks.indexOf(maxMs),
  };
}

/** Row-change verdict on the burst figure; it only counts once the new agents rendered. */
export function rowChangeVerdict(m: {
  appearedMs: number | null;
  recalcMs: number;
  chunkCount: number;
}): Verdict {
  if (m.appearedMs === null) {
    return {
      status: "FAIL",
      measured: `row-change style recalc: new agents never appeared within ${ROW_APPEAR_MS} ms`,
    };
  }
  const v = budgetVerdict(
    "row-change style recalc",
    m.chunkCount === 0 ? null : m.recalcMs,
    RECALC_BUDGET_MS,
  );
  return {
    status: v.status,
    measured: `${v.measured}, row appeared ${m.appearedMs} ms after write`,
  };
}

type Sample = { frames: number[]; recalcMs: number };

async function readRecalcMs(cdp: import("@playwright/test").CDPSession): Promise<number> {
  const { metrics } = await cdp.send("Performance.getMetrics");
  return (metrics.find((m) => m.name === "RecalcStyleDuration")?.value ?? 0) * 1000;
}

/** Frame deltas (rAF) over a window, plus the style recalc time Chromium spent in it (CDP Performance). */
async function sampleWindow(
  page: import("@playwright/test").Page,
  cdp: import("@playwright/test").CDPSession,
  ms: number,
): Promise<Sample> {
  const before = await readRecalcMs(cdp);
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __run: boolean };
    w.__frames = [];
    w.__run = true;
    let last = performance.now();
    const tick = (t: number) => {
      w.__frames.push(t - last);
      last = t;
      if (w.__run) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await new Promise((r) => setTimeout(r, ms));
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __run: boolean };
    w.__run = false;
    return w.__frames.slice(1);
  });
  return { frames, recalcMs: (await readRecalcMs(cdp)) - before };
}

async function perfAt(
  agents: number,
  headed: boolean,
  info: { chrome: string },
): Promise<Verdict[]> {
  const root = makeRunRoot();
  tempDirs.add(root);
  let office: Office | null = null;
  try {
    const files = agentFixtureSet(agents + DESKS_PER_ROW);
    writeFixtureSet(root, files.slice(0, agents), { anchorNow: Date.now() });
    office = await startOffice({ root });
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch({ headless: !headed });
    try {
      info.chrome = browser.version();
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Performance.enable");
      await page.goto(office.url);
      await page.waitForFunction(
        (n) => document.querySelectorAll(".agent[data-state]").length >= n,
        agents,
        { timeout: SMOKE_MS },
      );
      const steady = await sampleWindow(page, cdp, STEADY_MS);
      // Row growth: the feed finds new files on a tree walk. Sample recalc in CHUNK_MS chunks from before the
      // write until TAIL_MS after the new row rendered; the burst is the largest chunk over the median chunk.
      const target = agents + DESKS_PER_ROW;
      const chunks: { at: number; ms: number }[] = [];
      let sampling = true;
      const wroteAt = Date.now();
      const sampler = (async () => {
        let prev = await readRecalcMs(cdp);
        while (sampling) {
          await new Promise((r) => setTimeout(r, CHUNK_MS));
          const cur = await readRecalcMs(cdp);
          chunks.push({ at: Date.now() - wroteAt, ms: cur - prev });
          prev = cur;
        }
      })();
      writeFixtureSet(root, files.slice(agents), { anchorNow: wroteAt });
      const appeared = await page
        .waitForFunction(
          (n) => document.querySelectorAll(".agent[data-state]").length >= n,
          target,
          { timeout: ROW_APPEAR_MS, polling: 20 },
        )
        .then(() => true)
        .catch(() => false);
      const appearedMs = appeared ? Date.now() - wroteAt : null;
      if (appeared) await new Promise((r) => setTimeout(r, TAIL_MS));
      sampling = false;
      await sampler;
      const burst = burstRecalc(chunks.map((c) => c.ms));
      console.log(
        `  ${agents} agents row appeared ${appearedMs ?? "never"} ms after write; ${chunks.length} chunks of ${CHUNK_MS} ms: ` +
          (burst === null
            ? "n/a"
            : `max ${burst.maxMs.toFixed(1)} ms (chunk ending ${chunks[burst.maxIndex]!.at} ms after write), median ${burst.medianMs.toFixed(1)} ms, burst ${burst.burstMs.toFixed(1)} ms`),
      );
      return [
        budgetVerdict(
          `p95 frame, ${steady.frames.length} frames`,
          p95(steady.frames),
          FRAME_BUDGET_MS[agents]!,
        ),
        rowChangeVerdict({
          appearedMs,
          recalcMs: burst?.burstMs ?? 0,
          chunkCount: chunks.length,
        }),
      ];
    } finally {
      await browser.close();
    }
  } finally {
    office?.stop();
    removeRoot(root);
    tempDirs.delete(root);
  }
}

async function perf(): Promise<number> {
  const headed = process.env.PERF_HEADED === "1";
  console.log(
    `perf mode ${headed ? "headed" : "headless"}, machine ${cpus()[0]?.model ?? "unknown"} (${platform()} ${release()})`,
  );
  const info = { chrome: "unknown" };
  let failed = false;
  for (const agents of PERF_AGENTS) {
    const verdicts = await perfAt(agents, headed, info);
    if (shuttingDown) return 130;
    for (const v of verdicts) {
      console.log(`${v.status} ${agents} agents, ${v.measured}`);
      if (v.status === "FAIL") failed = true;
    }
  }
  console.log(`chrome ${info.chrome}`);
  return failed ? 1 : 0;
}

// ---- hero -----------------------------------------------------------------------------

export const HERO_PATH = join(import.meta.dirname, "..", "docs", "hero.png");
/** Agents in the core fixture scene (e2e/office.spec.ts @visual). */
const HERO_AGENTS = 4;
const HERO_QUERY = "/?hour=14&seed=e2e&scene=afternoon";

/** Playwright looks for browsers under $HOME; find them via the account's home so a different HOME still works. */
function pinBrowserCache(): void {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return;
  const home = userInfo().homedir;
  process.env.PLAYWRIGHT_BROWSERS_PATH =
    platform() === "darwin"
      ? join(home, "Library", "Caches", "ms-playwright")
      : join(home, ".cache", "ms-playwright");
}

/** README screenshot from the core fixture set, served from a guarded temp root; never the real transcript root. */
export async function hero(root: string = makeRunRoot(), out: string = HERO_PATH): Promise<void> {
  assertTempRoot(root);
  tempDirs.add(root);
  let office: Office | null = null;
  try {
    writeFixtureSet(root, coreFixtureSet(), { anchorNow: Date.now() });
    office = await startOffice({ root });
    pinBrowserCache();
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 720 },
        reducedMotion: "reduce",
      });
      await page.goto(office.url + HERO_QUERY);
      // The core scene draws four agents (e2e/office.spec.ts @visual); the feed's first scan can
      // deliver them one by one, so wait for all of them before the picture is taken.
      await page.waitForFunction(
        (n) => document.querySelectorAll(".agent[data-state]").length >= n,
        HERO_AGENTS,
        { timeout: SMOKE_MS },
      );
      await page.evaluate(() => document.fonts.ready);
      mkdirSync(dirname(out), { recursive: true });
      await page.screenshot({ path: out });
    } finally {
      await browser.close();
    }
  } finally {
    office?.stop();
    removeRoot(root);
    tempDirs.delete(root);
  }
}

if (import.meta.filename === process.argv[1]) {
  const sub = process.argv[2];
  if (sub === "criteria" || sub === "perf" || sub === "hero") {
    installSignalHandlers();
    (sub === "perf" ? perf() : sub === "hero" ? hero().then(() => 0) : criteria()).then(
      (code) => process.exit(code),
      (e: unknown) => {
        console.error(e instanceof Error ? e.message : "release failed");
        process.exit(1);
      },
    );
  } else {
    console.error("usage: node e2e/release.ts criteria|perf|hero");
    process.exit(2);
  }
}
