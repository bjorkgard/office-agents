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
  VISUAL_QUERY,
  writeFixtureSet,
} from "./support.ts";

export type Status = "PASS" | "FAIL" | "SKIPPED" | "INCONCLUSIVE";
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
  return anyFailed(verdicts) ? 1 : 0;
}

// ---- perf -----------------------------------------------------------------------------

/** Budgets from the phase 6 decisions: p95 frame ms by agent count, and row-change style recalc ms. */
export const FRAME_BUDGET_MS: Record<number, number> = { 12: 20, 24: 33 };
export const RECALC_BUDGET_MS = 16;
/** A row-change median above the budget but within this is INCONCLUSIVE (exit 0); above it is FAIL. */
export const RECALC_INCONCLUSIVE_MS = 17.5;
/** How long after the new agents rendered an UpdateLayoutTree still counts as the entrance ease, not idle. */
export const EASE_MS = 700;
/** A passing median above this share of the budget is flagged as marginal. */
const MARGINAL_RATIO = 0.9;
const STEADY_MS = 5_000;
/** How long after the new agents rendered the traced row-change window stays open. */
const ROW_TRACE_TAIL_MS = 1_500;
/** How long to wait for Chromium to flush the trace after Tracing.end, and after an abort in cleanup. */
const TRACE_FLUSH_MS = 10_000;
const TRACE_ABORT_FLUSH_MS = 2_000;
/** Plain idle before each row write: the gate measures a settled page (D8), not one fresh off load. */
const ROW_SETTLE_MS = 5_000;
const REPEATS = 6;
const TRACE_CATEGORIES =
  "devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing";
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

export type TraceEvent = {
  name?: string;
  ph?: string;
  ts?: number;
  dur?: number;
  args?: { elementCount?: number };
};

/**
 * Largest single UpdateLayoutTree (style recalc) complete event, in ms, from the `row-write` mark until
 * windowMs after it. Null without the mark or without such an event, which must never read as a pass.
 */
export function worstRecalc(events: TraceEvent[], windowMs: number): number | null {
  return worstRecalcEvent(events, windowMs)?.durMs ?? null;
}

/** worstRecalc's event, with its start offset from the `row-write` mark, both in ms, and its element count if traced. */
export function worstRecalcEvent(
  events: TraceEvent[],
  windowMs: number,
): { durMs: number; offsetMs: number; elementCount: number | null } | null {
  const mark = events.find((e) => e.name === "row-write" && typeof e.ts === "number");
  if (!mark) return null;
  const from = mark.ts!;
  const to = from + windowMs * 1000;
  let worst: { dur: number; ts: number; elementCount: number | null } | null = null;
  for (const e of events) {
    if (e.name !== "UpdateLayoutTree" || e.ph !== "X") continue;
    if (typeof e.ts !== "number" || typeof e.dur !== "number") continue;
    if (e.ts < from || e.ts > to) continue;
    if (worst === null || e.dur > worst.dur) {
      const count = e.args?.elementCount;
      worst = { dur: e.dur, ts: e.ts, elementCount: typeof count === "number" ? count : null };
    }
  }
  return worst === null
    ? null
    : {
        durMs: worst.dur / 1000,
        offsetMs: (worst.ts - from) / 1000,
        elementCount: worst.elementCount,
      };
}

export type RecalcPhase = "mount" | "ease" | "idle";

/** Which part of the row change a recalc at offsetMs after the write belongs to, given when the agents appeared. */
export function classifyPhase(offsetMs: number, appearedMs: number): RecalcPhase {
  if (offsetMs < appearedMs) return "mount";
  return offsetMs < appearedMs + EASE_MS ? "ease" : "idle";
}

/** True when any verdict is FAIL: the one status that makes the runner exit 1. */
export function anyFailed(verdicts: Verdict[]): boolean {
  return verdicts.some((v) => v.status === "FAIL");
}

/** worstRecalc, but null when Chromium reported that the trace lost data: a partial trace must never read as a pass. */
export function tracedWorstMs(
  events: TraceEvent[],
  windowMs: number,
  dataLossOccurred: boolean,
): number | null {
  return dataLossOccurred ? null : worstRecalc(events, windowMs);
}

export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export type RowRepeat = { appearedMs: number | null; worstMs: number | null };

/**
 * The runs the gate takes its median over: the first (warm-up) run is dropped only when it is higher than
 * the median of the others, so a slow first run cannot decide the verdict but a fast one is never hidden.
 */
export function settleRuns(worsts: number[]): { kept: number[]; dropped: boolean } {
  if (worsts.length < 2) return { kept: worsts, dropped: false };
  const dropped = worsts[0]! > medianOf(worsts.slice(1))!;
  return { kept: dropped ? worsts.slice(1) : worsts, dropped };
}

/**
 * Row-change verdict: the median across repeats (warm-up per settleRuns) of the worst single style recalc event.
 * PASS <= budget, INCONCLUSIVE up to RECALC_INCONCLUSIVE_MS, FAIL above.
 */
export function rowChangeVerdict(repeats: RowRepeat[]): Verdict {
  const fmt = (v: number | null) => (v === null ? "n/a" : v.toFixed(1));
  const worst = repeats.map((r) => fmt(r.worstMs)).join("/");
  const appeared = repeats.map((r) => r.appearedMs ?? "never").join("/");
  const info = `row appeared ${appeared} ms after write`;
  if (repeats.length === 0) {
    return { status: "FAIL", measured: "row-change style recalc: no repeats measured" };
  }
  if (repeats.some((r) => r.appearedMs === null)) {
    return {
      status: "FAIL",
      measured: `row-change style recalc: new agents never appeared within ${ROW_APPEAR_MS} ms in a repeat (worst events ${worst} ms; ${info})`,
    };
  }
  const worsts = repeats.map((r) => r.worstMs);
  if (worsts.some((w) => w === null)) {
    return {
      status: "FAIL",
      measured: `row-change style recalc: no style recalc event traced in a repeat (worst events ${worst} ms; ${info})`,
    };
  }
  const { kept, dropped } = settleRuns(worsts as number[]);
  const median = medianOf(kept)!;
  const status =
    median <= RECALC_BUDGET_MS
      ? "PASS"
      : median <= RECALC_INCONCLUSIVE_MS
        ? "INCONCLUSIVE"
        : "FAIL";
  const warmup =
    repeats.length < 2
      ? ""
      : dropped
        ? `; warm-up run 1 dropped (higher than the median of runs 2-${repeats.length})`
        : "; warm-up run 1 kept";
  const marginal =
    status === "PASS" && median > MARGINAL_RATIO * RECALC_BUDGET_MS
      ? "; marginal: within 10% of the budget"
      : "";
  return {
    status,
    measured: `row-change style recalc median worst event ${median.toFixed(1)} ms (budget ${RECALC_BUDGET_MS} ms; repeats ${worst} ms; ${info}${warmup}${marginal})`,
  };
}

/** A row repeat plus the animation probe of an `--ab` run: idle `document.getAnimations().length`, or why not. */
export type AbRepeat = RowRepeat & { idleAnimations: number | null; probeError: string | null };
/** One arm of the animations A/B: median worst recalc and median idle animation count, null where unmeasured. */
export type AbArm = { medianMs: number | null; animations: number | null; error: string | null };

export function abArm(runs: AbRepeat[]): AbArm {
  const worsts = runs.map((r) => r.worstMs);
  const counts = runs.map((r) => r.idleAnimations);
  return {
    medianMs:
      worsts.length === 0 || worsts.some((w) => w === null) ? null : medianOf(worsts as number[]),
    animations:
      counts.length === 0 || counts.some((c) => c === null) ? null : medianOf(counts as number[]),
    error: runs.find((r) => r.probeError !== null)?.probeError ?? null,
  };
}

/** Animated minus frozen, in ms and in animation count; null when either arm lacks a measurement. */
export function abDelta(arms: {
  animated: AbArm;
  frozen: AbArm;
}): { deltaMs: number; deltaAnimations: number } | null {
  const { animated, frozen } = arms;
  if (
    animated.medianMs === null ||
    frozen.medianMs === null ||
    animated.animations === null ||
    frozen.animations === null
  ) {
    return null;
  }
  return {
    deltaMs: animated.medianMs - frozen.medianMs,
    deltaAnimations: animated.animations - frozen.animations,
  };
}

/** The `--ab` delta line: informational PASS, or FAIL naming the probe error or the missing data. */
export function abVerdict(arms: { animated: AbArm; frozen: AbArm }): Verdict {
  const delta = abDelta(arms);
  const { animated, frozen } = arms;
  if (delta === null) {
    const why =
      animated.error ?? frozen.error ?? "no median worst event or animation count in an arm";
    return { status: "FAIL", measured: `animations A/B: no delta measured (${why})` };
  }
  const sign = delta.deltaMs >= 0 ? "+" : "";
  return {
    status: "PASS",
    measured: `animations A/B: with animations ${animated.medianMs!.toFixed(1)} ms, ${animated.animations} animations; without ${frozen.medianMs!.toFixed(1)} ms, ${frozen.animations} animations; delta ${sign}${delta.deltaMs.toFixed(1)} ms, ${delta.deltaAnimations} animations`,
  };
}

type Sample = { frames: number[] };

/** Frame deltas (rAF) over a window. */
async function sampleWindow(page: import("@playwright/test").Page, ms: number): Promise<Sample> {
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
  return { frames };
}

type OfficePage = {
  page: import("@playwright/test").Page;
  cdp: import("@playwright/test").CDPSession;
  root: string;
  files: ReturnType<typeof agentFixtureSet>;
};

/**
 * One fresh office with `agents` fixture agents (the fixture set also holds `extra` more, for a later write)
 * in its own page, loaded until all agents render; cleans up in reverse order however `fn` ends.
 */
async function withOfficePage<T>(
  agents: number,
  extra: number,
  headed: boolean,
  info: { chrome: string },
  fn: (ctx: OfficePage) => Promise<T>,
): Promise<T> {
  const root = makeRunRoot();
  tempDirs.add(root);
  let office: Office | null = null;
  try {
    const files = agentFixtureSet(agents + extra);
    writeFixtureSet(root, files.slice(0, agents), { anchorNow: Date.now() });
    office = await startOffice({ root });
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch({ headless: !headed });
    try {
      info.chrome = browser.version();
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const cdp = await page.context().newCDPSession(page);
      await page.goto(office.url);
      await page.waitForFunction(
        (n) => document.querySelectorAll(".agent[data-state]").length >= n,
        agents,
        { timeout: SMOKE_MS },
      );
      return await fn({ page, cdp, root, files });
    } finally {
      await browser.close();
    }
  } finally {
    office?.stop();
    removeRoot(root);
    tempDirs.delete(root);
  }
}

/** One fresh office at `agents` in its own page, steady frame sample only. */
function frameSample(agents: number, headed: boolean, info: { chrome: string }): Promise<Sample> {
  return withOfficePage(agents, 0, headed, info, ({ page }) => sampleWindow(page, STEADY_MS));
}

/** One fresh office at `agents`, idle ROW_SETTLE_MS, then one traced row write. */
function rowRepeat(
  agents: number,
  headed: boolean,
  info: { chrome: string },
  label: string,
  ab: { frozen: boolean } | null = null,
): Promise<AbRepeat> {
  return withOfficePage(agents, DESKS_PER_ROW, headed, info, async ({ page, cdp, root, files }) => {
    if (ab?.frozen) {
      await page.addStyleTag({
        content: "*{animation:none!important;transition:none!important}",
      });
    }
    await new Promise((r) => setTimeout(r, ROW_SETTLE_MS));
    let idleAnimations: number | null = null;
    let probeError: string | null = null;
    if (ab) {
      try {
        idleAnimations = await page.evaluate(() => document.getAnimations().length);
      } catch (e) {
        probeError = e instanceof Error ? e.message : String(e);
      }
    }
    // Row growth: the feed finds new files on a tree walk. Trace only this phase. The gate is the worst single
    // UpdateLayoutTree after the row-write mark.
    const target = agents + DESKS_PER_ROW;
    const events: TraceEvent[] = [];
    const onData = (e: { value: TraceEvent[] }) => void events.push(...e.value);
    cdp.on("Tracing.dataCollected", onData);
    const complete = new Promise<boolean>((r) =>
      cdp.once("Tracing.tracingComplete", (e: { dataLossOccurred?: boolean }) =>
        r(e.dataLossOccurred === true),
      ),
    );
    let tracing = false;
    try {
      await cdp.send("Tracing.start", {
        categories: TRACE_CATEGORIES,
        transferMode: "ReportEvents",
      });
      tracing = true;
      await page.evaluate(() => performance.mark("row-write"));
      const wroteAt = Date.now();
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
      if (appeared) await new Promise((r) => setTimeout(r, ROW_TRACE_TAIL_MS));
      tracing = false;
      await cdp.send("Tracing.end");
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("tracingComplete timeout")), TRACE_FLUSH_MS);
      });
      let dataLost: boolean;
      try {
        dataLost = await Promise.race([complete, timeout]);
      } finally {
        clearTimeout(timer);
      }
      if (dataLost) console.log(`  ${agents} agents ${label}: the trace lost data, repeat failed`);
      const worstMs =
        appearedMs === null
          ? null
          : tracedWorstMs(events, appearedMs + ROW_TRACE_TAIL_MS, dataLost);
      const worstEvent =
        worstMs === null ? null : worstRecalcEvent(events, appearedMs! + ROW_TRACE_TAIL_MS);
      const at =
        worstEvent === null || appearedMs === null
          ? ""
          : ` at +${worstEvent.offsetMs.toFixed(0)} ms after the write, phase ${classifyPhase(worstEvent.offsetMs, appearedMs)}, elements ${worstEvent.elementCount ?? "n/a"}`;
      const probe = ab ? `, idle animations ${idleAnimations ?? `n/a (${probeError})`}` : "";
      console.log(
        `  ${agents} agents ${label}: worst event ${worstMs === null ? "n/a" : worstMs.toFixed(1)} ms${at}, row appeared ${appearedMs ?? "never"} ms${probe}`,
      );
      return { appearedMs, worstMs, idleAnimations, probeError };
    } finally {
      if (tracing) {
        await cdp.send("Tracing.end").catch(() => {});
        await Promise.race([complete, new Promise((r) => setTimeout(r, TRACE_ABORT_FLUSH_MS))]);
      }
      cdp.off("Tracing.dataCollected", onData);
    }
  });
}

/** The two perf verdicts for one agent count: p95 frame of the steady sample, then the row-change recalc. */
export function perfVerdicts(
  agents: number,
  steady: Sample | null,
  repeats: RowRepeat[],
): Verdict[] {
  return [
    steady === null || steady.frames.length === 0
      ? { status: "FAIL", measured: "p95 frame: no frames measured" }
      : budgetVerdict(
          `p95 frame, ${steady.frames.length} frames`,
          p95(steady.frames),
          FRAME_BUDGET_MS[agents]!,
        ),
    rowChangeVerdict(repeats),
  ];
}

async function perfAt(
  agents: number,
  headed: boolean,
  info: { chrome: string },
  ab: boolean,
): Promise<Verdict[]> {
  let steady: Sample | null = null;
  if (!shuttingDown) {
    try {
      steady = await frameSample(agents, headed, info);
    } catch (e) {
      console.log(
        `  ${agents} agents frame sample: failed, ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  const runRepeats = async (frozen: boolean): Promise<AbRepeat[]> => {
    const out: AbRepeat[] = [];
    const tag = frozen ? "animations off " : "";
    for (let i = 1; i <= REPEATS; i++) {
      if (shuttingDown) break;
      try {
        out.push(
          await rowRepeat(agents, headed, info, `${tag}repeat ${i}`, ab ? { frozen } : null),
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.log(`  ${agents} agents ${tag}repeat ${i}: failed, ${message}`);
        out.push({ appearedMs: null, worstMs: null, idleAnimations: null, probeError: message });
      }
    }
    return out;
  };
  const repeats = await runRepeats(false);
  const verdicts = perfVerdicts(agents, steady, repeats);
  if (ab && !shuttingDown) {
    const frozen = await runRepeats(true);
    verdicts.push(abVerdict({ animated: abArm(repeats), frozen: abArm(frozen) }));
  }
  return verdicts;
}

async function perf(ab: boolean): Promise<number> {
  const headed = process.env.PERF_HEADED === "1";
  console.log(
    `perf mode ${headed ? "headed" : "headless"}, machine ${cpus()[0]?.model ?? "unknown"} (${platform()} ${release()})`,
  );
  const info = { chrome: "unknown" };
  const all: Verdict[] = [];
  for (const agents of PERF_AGENTS) {
    const verdicts = await perfAt(agents, headed, info, ab);
    if (shuttingDown) return 130;
    for (const v of verdicts) {
      console.log(`${v.status} ${agents} agents, ${v.measured}`);
      all.push(v);
    }
  }
  const inconclusive = all.filter((v) => v.status === "INCONCLUSIVE").length;
  if (inconclusive > 0) console.log(`${inconclusive} INCONCLUSIVE (exit 0)`);
  console.log(`chrome ${info.chrome}`);
  return anyFailed(all) ? 1 : 0;
}

// ---- hero -----------------------------------------------------------------------------

export const HERO_PATH = join(import.meta.dirname, "..", "docs", "hero.png");
/** Agents in the core fixture scene (e2e/office.spec.ts @visual). */
const HERO_AGENTS = 4;
const HERO_QUERY = VISUAL_QUERY;

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
    (sub === "perf"
      ? perf(process.argv.includes("--ab"))
      : sub === "hero"
        ? hero().then(() => 0)
        : criteria()
    ).then(
      (code) => process.exit(code),
      (e: unknown) => {
        console.error(e instanceof Error ? e.message : "release failed");
        process.exit(1);
      },
    );
  } else {
    console.error("usage: node e2e/release.ts criteria|perf [--ab]|hero");
    process.exit(2);
  }
}
