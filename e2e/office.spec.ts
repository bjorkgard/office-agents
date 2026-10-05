/// <reference lib="dom" />
/**
 * End-to-end specs for the office, one Playwright project per scenario (playwright.config.ts):
 * @core (static fixture), @live (a root the specs append to), @twelve (12 sessions), @stale
 * (every line 45 minutes old), @empty (no files), @visual (screenshot).
 *
 * Timer rules never wait in real time: the specs age the transcript lines instead (no TUNING
 * override, eng R2). The first three specs prove the age offsets fire R1, expiry and R2.
 */
import { expect as baseExpect, test, type Locator, type Page } from "@playwright/test";
import { join } from "node:path";
import { SHIRTS } from "../src/office/palette.ts";
import { titleFor } from "../src/office/useDocumentChrome.ts";
import { hashId } from "../server/sanitize-fixtures.ts";
import { attachFeedStatus } from "./feed-status.ts";
import { appendLive, coreSessions, liveLine, type LiveLine } from "./support.ts";

// A new file is found by the tree walk (5 s). R1 on the fixture fires once the clock reaches the
// open tool call's age (its line is stamped past the 10 s timer), not from a wait in the spec.
const expect = baseExpect.configure({ timeout: 20_000 });

test.afterEach(({ request }, info) => attachFeedStatus(request, info));

const sessions = coreSessions();
const liveRoot = () => join(process.env.OFFICE_E2E_BASE!, "live", "root");

/** The agent wrapper (`data-agent` is "session NUL agentId"; xpath keeps the NUL intact). */
const wrapper = (page: Page, session: string, agentId: string | null = null): Locator =>
  page.locator(`xpath=//*[@data-agent="${session}\u0000${agentId ?? ""}"]`);
const hit = (page: Page, session: string, agentId: string | null = null): Locator =>
  wrapper(page, session, agentId).locator("button.hit");

const nameOf = async (loc: Locator): Promise<string> =>
  ((await loc.getAttribute("aria-label")) ?? "").split(",")[0]!;

const STATE_RE = /waiting for you$/;

/** A fresh session id per test run and repeat, so appended files never collide. */
const sessionFor = (info: { title: string; repeatEachIndex: number; retry: number }, tag = "") =>
  hashId(`live:${info.title}:${tag}:${info.repeatEachIndex}:${info.retry}`);

const sessionPath = (session: string, project = "-fixture-live") => `${project}/${session}.jsonl`;
const subPath = (session: string, agentId: string, project = "-fixture-live") =>
  `${project}/${session}/subagents/agent-${agentId}.jsonl`;

/** user, a tool call and its result: the session reads as working with nothing open. */
const workingLines = (session: string, toolId: string, ageMs = 0, cwd?: string): string[] =>
  (
    [
      { type: "user", ageMs: ageMs + 2000 },
      { type: "tool_use", id: toolId, ageMs: ageMs + 1000 },
      { type: "tool_result", id: toolId, ageMs },
    ] satisfies LiveLine[]
  ).map((l) => liveLine(session, l, { cwd }));

async function openLive(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("scene")).toBeVisible();
  await expect(page.locator(".top-bar-status")).toHaveCount(0);
}

/**
 * Marks the agents already drawn and records the first one drawn after (states and poses, and
 * whether it ever walked: `data-path`). Character has no key, so this is how a spec finds it.
 */
async function watchNewAgent(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll(".agent")) el.setAttribute("data-e2e-old", "");
    const rec = { states: [] as string[], poses: [] as string[], sawPath: false };
    (window as unknown as { __rec: typeof rec }).__rec = rec;
    let mine: HTMLElement | null = null;
    const look = () => {
      if (!mine) {
        mine = document.querySelector<HTMLElement>(".agent:not([data-e2e-old])");
        mine?.setAttribute("data-e2e-mine", "");
      }
      if (!mine) return;
      const state = mine.dataset.state ?? "";
      if (rec.states.at(-1) !== state) rec.states.push(state);
      const pose = mine.dataset.pose ?? "";
      if (rec.poses.at(-1) !== pose) rec.poses.push(pose);
      if (mine.hasAttribute("data-path")) rec.sawPath = true;
    };
    new MutationObserver(look).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state", "data-pose", "data-path"],
    });
    look();
  });
}

const mine = (page: Page): Locator => page.locator(".agent[data-e2e-mine]");
const history = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __rec: { states: string[]; poses: string[]; sawPath: boolean } })
        .__rec,
  );

/** Starts a working session and waits until it is drawn; `watch` records its walk-in. */
async function startWorking(
  page: Page,
  session: string,
  toolId: string,
  opts: { watch?: boolean; project?: string; cwd?: string; ageMs?: number } = {},
): Promise<void> {
  if (opts.watch !== false) await watchNewAgent(page);
  appendLive(
    liveRoot(),
    sessionPath(session, opts.project),
    workingLines(session, toolId, opts.ageMs ?? 0, opts.cwd),
  );
  await expect(hit(page, session)).toHaveAttribute("aria-label", /working$/);
}

// ---- first specs: the age offsets fire R1, expiry and R2 -----------------------------------

test(
  "age offset fires R1: a tool call past the timer waves",
  { tag: "@core" },
  async ({ page }) => {
    await page.goto("/");
    await expect(hit(page, sessions.live)).toHaveAttribute("aria-label", STATE_RE);
    await expect(wrapper(page, sessions.live).locator(".bubble")).toContainText("Stuck?");
    await expect(wrapper(page, sessions.live).locator(".tag")).toHaveAttribute("data-waving", "");
  },
);

test(
  "age offset fires expiry: silent working agents leave, waiting ones stay",
  { tag: "@stale" },
  async ({ page }) => {
    await page.goto("/");
    await expect(hit(page, sessions.question)).toHaveAttribute("aria-label", STATE_RE);
    await expect(hit(page, sessions.async)).toHaveAttribute("aria-label", STATE_RE);
    // The same fixture is drawn in @core, with the tool call waving and the subagent working.
    await expect(wrapper(page, sessions.live)).toHaveCount(0);
    await expect(page.locator(`[data-agent^="${sessions.syncParent}"]`)).toHaveCount(0);
    await expect(page.locator("button.hit")).toHaveCount(2);
    // Both waited since 45 minutes before the anchor, and the label only grows ("45m", "1h 2m").
    const waits = (await page.locator(".top-bar-chip").allTextContents()).map((t) => {
      const m = /in project (?:(\d+)h )?(\d+)m$/.exec(t);
      return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : -1;
    });
    expect(waits).toHaveLength(2);
    for (const w of waits) expect(w).toBeGreaterThanOrEqual(45);
    await expect(page).toHaveTitle(titleFor(2));
  },
);

test(
  "age offset fires R2: a session idle for 6 minutes walks out",
  { tag: "@live" },
  async ({ page }, info) => {
    const old = sessionFor(info, "old");
    const fresh = sessionFor(info, "fresh");
    await openLive(page);
    await startWorking(page, old, hashId(`${old}:t`), { watch: false });
    await startWorking(page, fresh, hashId(`${fresh}:t`), { watch: false });
    const done = (s: string, ageMs: number) =>
      liveLine(s, { type: "end_turn", text: "done", ageMs });
    appendLive(liveRoot(), sessionPath(fresh), [done(fresh, 0)]);
    appendLive(liveRoot(), sessionPath(old), [done(old, 6 * 60 * 1000)]);
    // The control stays (idle is not expiry), the aged one is gone.
    await expect(hit(page, fresh)).toHaveAttribute("aria-label", /idle$/);
    await expect(wrapper(page, old)).toHaveCount(0);
  },
);

// ---- core ----------------------------------------------------------------------------------

test("each agent shows its state", { tag: "@core" }, async ({ page }) => {
  await page.goto("/");
  for (const s of [sessions.question, sessions.async, sessions.live]) {
    await expect(hit(page, s)).toHaveAttribute("aria-label", STATE_RE);
  }
  // The subagent has no parent file in this set, so its wrapper is the only one of its session.
  await expect(page.locator(`[data-agent^="${sessions.syncParent}"] button.hit`)).toHaveAttribute(
    "aria-label",
    /working$/,
  );
  // Character `data-state` lags the machine by up to 900 ms: only auto-retrying checks.
  await expect(page.locator('.agent[data-state="attention"]')).toHaveCount(3);
  await expect(page.locator('.agent[data-state="working"]')).toHaveCount(1);
});

test(
  "tab title counts waiting agents and chips list the longest wait first",
  { tag: "@core" },
  async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(titleFor(3));
    const names = [
      await nameOf(hit(page, sessions.async)),
      await nameOf(hit(page, sessions.question)),
      await nameOf(hit(page, sessions.live)),
    ];
    const chips = page.locator(".top-bar-chip");
    await expect(chips).toHaveCount(3);
    for (const [i, name] of names.entries()) {
      await expect(chips.nth(i)).toHaveText(new RegExp(`^${name} in project`));
    }
  },
);

test(
  "keyboard: chips first, then waiting agents, then the rest; the tag shows on focus",
  {
    tag: "@core",
  },
  async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(titleFor(3));
    const waiting = [sessions.async, sessions.question, sessions.live];
    const names = [];
    for (const s of waiting) names.push(await nameOf(hit(page, s)));
    const sub = page.locator(`[data-agent^="${sessions.syncParent}"]`);
    await expect(sub.locator(".tag")).toHaveCSS("opacity", "0");

    const active = page.locator(":focus");
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Tab");
      await expect(active).toHaveClass(/top-bar-chip/);
      await expect(active).toHaveText(new RegExp(`^${names[i]} in project`));
    }
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Tab");
      await expect(active).toHaveAttribute(
        "aria-label",
        new RegExp(`^${names[i]}, .*waiting for you$`),
      );
    }
    await page.keyboard.press("Tab");
    await expect(active).toHaveAttribute("aria-label", /working$/);
    await expect(page.locator(":focus + .tag")).toHaveCSS("opacity", "1");
  },
);

test(
  "shirts follow the project: the name matches the painted fill",
  { tag: "@core" },
  async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".agent")).toHaveCount(4);
    const painted = () =>
      page.locator(".agent").evaluateAll((els) =>
        els.map((el) => {
          const rect = el.querySelector("svg rect[fill='var(--shirt)']");
          return {
            name: (el as HTMLElement).dataset.shirt,
            fill: rect ? getComputedStyle(rect).fill : null,
          };
        }),
      );
    const rgb = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    const expected = Object.fromEntries(SHIRTS.map((s) => [s.name, rgb(s.value)]));
    for (const { name, fill } of await painted()) {
      expect(Object.keys(expected)).toContain(name);
      expect(fill).toBe(expected[name!]);
    }
  },
);

test("reduced motion: states shown at once", { tag: "@core" }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(hit(page, sessions.live)).toHaveAttribute("aria-label", STATE_RE);
  await expect(page.locator(".agent")).toHaveCount(4);
  // Same commit as the label, so no wait for a pose swap to settle.
  await expect(page.locator('.agent[data-state="attention"]')).toHaveCount(3);
});

test("a refused feed shows the localhost banner", { tag: "@core" }, async ({ page }) => {
  await page.route("**/__office/events", (route) => route.fulfill({ status: 403, body: "" }));
  await page.route("**/__office/status", (route) => route.fulfill({ status: 403, body: "" }));
  await page.goto("/");
  await expect(
    page.getByRole("status").filter({ hasText: "Refused: open this page from localhost" }),
  ).toBeVisible();
});

// ---- empty ---------------------------------------------------------------------------------

test("an empty project says there are no sessions", { tag: "@empty" }, async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("No active Claude Code sessions");
  await expect(page.locator(".agent")).toHaveCount(0);
});

// ---- live ----------------------------------------------------------------------------------

test("a new session takes its seat and works", { tag: "@live" }, async ({ page }, info) => {
  const session = sessionFor(info);
  await openLive(page);
  // "arriving" is never on screen for a transcript session: the same batch's working event ends
  // it before the first paint, so there is no walk-in (only subagents walk, see below).
  await startWorking(page, session, hashId(`${session}:t`));
  await expect(mine(page)).toHaveAttribute("data-state", "working");
  await expect(mine(page)).toHaveAttribute("data-pose", "seated-typing");
  const { states, sawPath } = await history(page);
  expect(states).toEqual(["working"]);
  expect(sawPath).toBe(false);
});

test("an open tool call past the timer waves", { tag: "@live" }, async ({ page }, info) => {
  const session = sessionFor(info);
  await openLive(page);
  await startWorking(page, session, hashId(`${session}:t`));
  await expect(mine(page)).toHaveAttribute("data-state", "working");
  // A call that started 11 s ago: R1 fires on arrival, no 10 s wait.
  const stuck = hashId(`${session}:stuck`);
  appendLive(liveRoot(), sessionPath(session), [
    liveLine(session, { type: "tool_use", id: stuck, name: "Bash", ageMs: 11_000 }),
  ]);
  await expect(hit(page, session)).toHaveAttribute("aria-label", STATE_RE);
  await expect(wrapper(page, session).locator(".bubble")).toContainText("Stuck?");
  await expect(wrapper(page, session).locator(".tag")).toHaveAttribute("data-waving", "");
  await expect(mine(page)).toHaveAttribute("data-state", "attention");
  // The wave ends when the call returns.
  appendLive(liveRoot(), sessionPath(session), [
    liveLine(session, { type: "tool_result", id: stuck, ageMs: 0 }),
  ]);
  await expect(hit(page, session)).toHaveAttribute("aria-label", /working$/);
  await expect(mine(page)).toHaveAttribute("data-state", "working");
});

test(
  "a subagent walks in, sits down and leaves on handoff",
  { tag: "@live" },
  async ({ page }, info) => {
    test.setTimeout(90_000); // the subagent's walk-out takes up to 20 s
    const parent = sessionFor(info);
    const child = hashId(`${parent}:child`);
    const launch = hashId(`${parent}:launch`);
    await openLive(page);
    await startWorking(page, parent, hashId(`${parent}:t`), { watch: false });
    // A sync launch: the parent waits on its subagent.
    appendLive(liveRoot(), sessionPath(parent), [
      liveLine(parent, {
        type: "tool_use",
        id: launch,
        name: "Agent",
        input: { run_in_background: false },
        ageMs: 0,
      }),
    ]);
    await expect(hit(page, parent)).toHaveAttribute("aria-label", /waiting on subagents$/);

    // Stamped ahead, like the new session above, so the walk-in is clocked at receipt.
    await watchNewAgent(page);
    const sub = (l: LiveLine) => liveLine(parent, l, { agentId: child });
    const toolId = hashId(`${child}:t`);
    appendLive(liveRoot(), subPath(parent, child), [
      sub({ type: "user", ageMs: -1000 }),
      sub({ type: "tool_use", id: toolId, ageMs: -2000 }),
      sub({ type: "tool_result", id: toolId, ageMs: -3000 }),
    ]);
    await expect(hit(page, parent, child)).toHaveAttribute("aria-label", /working$/);
    await expect(mine(page)).toHaveAttribute("data-state", "working");
    // Settled: the walk is over (`data-path` stays while a drive exists). It sits at a free desk,
    // or stands beside its parent's when earlier specs left none free, so either pose passes.
    await expect(mine(page)).toHaveAttribute("data-pose", /^(seated|standing)/);
    expect((await history(page)).sawPath).toBe(true);

    // The launch returns: the child leaves, the parent works again.
    appendLive(liveRoot(), sessionPath(parent), [
      liveLine(parent, {
        type: "tool_result",
        id: launch,
        result: { status: "completed", agentId: child },
        ageMs: 0,
      }),
    ]);
    await expect(hit(page, parent)).toHaveAttribute("aria-label", /working$/);
    await expect(wrapper(page, parent, child)).toHaveCount(0);
    await expect(mine(page)).toHaveAttribute("data-state", "leaving");
    await expect(mine(page)).toHaveCount(0, { timeout: 40_000 });
  },
);

test(
  "an agent leaves when its transcript stops (45 minutes)",
  { tag: "@live" },
  async ({ page }, info) => {
    const session = sessionFor(info);
    await page.clock.install();
    await openLive(page);
    await startWorking(page, session, hashId(`${session}:t`));
    // 45 minutes of silence: past STALE_MS, so the next tick expires the agent.
    await page.clock.fastForward("45:00");
    await expect(wrapper(page, session)).toHaveCount(0);
    await expect(mine(page)).toHaveAttribute("data-state", "leaving");
    await expect(mine(page)).toHaveCount(0);
  },
);

test(
  "focus stays in the scene when the focused agent leaves",
  { tag: "@live" },
  async ({ page }, info) => {
    const session = sessionFor(info);
    await page.clock.install();
    await openLive(page);
    await startWorking(page, session, hashId(`${session}:t`));
    await hit(page, session).focus();
    await expect(hit(page, session)).toBeFocused();
    await page.clock.fastForward("45:00");
    await expect(wrapper(page, session)).toHaveCount(0);
    await expect(page.getByTestId("scene")).toBeFocused();
  },
);

test(
  "a second project gets its own shirt, and every name matches its fill",
  { tag: "@live" },
  async ({ page }, info) => {
    const session = sessionFor(info);
    await openLive(page);
    await startWorking(page, session, hashId(`${session}:t`), {
      project: "-fixture-recolor",
      cwd: "/fixture/recolor",
    });
    const rgb = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    const expected = Object.fromEntries(SHIRTS.map((s) => [s.name, rgb(s.value)]));
    const painted = await page.locator(".agent").evaluateAll((els) =>
      els.map((el) => {
        const rect = el.querySelector("svg rect[fill='var(--shirt)']");
        return {
          name: (el as HTMLElement).dataset.shirt!,
          fill: rect ? getComputedStyle(rect).fill : null,
        };
      }),
    );
    for (const { name, fill } of painted) expect(fill).toBe(expected[name]);
    expect(new Set(painted.map((p) => p.name)).size).toBeGreaterThanOrEqual(2);
  },
);

test(
  "reduced motion: a subagent never walks and sits down at once",
  { tag: "@live" },
  async ({ page }, info) => {
    const parent = sessionFor(info);
    const child = hashId(`${parent}:child`);
    const launch = hashId(`${parent}:launch`);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openLive(page);
    await startWorking(page, parent, hashId(`${parent}:t`), { watch: false });
    appendLive(liveRoot(), sessionPath(parent), [
      liveLine(parent, {
        type: "tool_use",
        id: launch,
        name: "Agent",
        input: { run_in_background: false },
        ageMs: 0,
      }),
    ]);
    await expect(hit(page, parent)).toHaveAttribute("aria-label", /waiting on subagents$/);

    // The same flow as the motion spec above, where `data-path` is seen: here it never is.
    await watchNewAgent(page);
    const sub = (l: LiveLine) => liveLine(parent, l, { agentId: child });
    const toolId = hashId(`${child}:t`);
    appendLive(liveRoot(), subPath(parent, child), [
      sub({ type: "user", ageMs: -1000 }),
      sub({ type: "tool_use", id: toolId, ageMs: -2000 }),
      sub({ type: "tool_result", id: toolId, ageMs: -3000 }),
    ]);
    await expect(hit(page, parent, child)).toHaveAttribute("aria-label", /working$/);
    await expect(mine(page)).toHaveAttribute("data-state", "working");
    await expect(mine(page)).toHaveAttribute("data-pose", /^(seated|standing)/);
    // Retrying checks: the pose is settled and no walk is under way, then the observer's record.
    await expect(page.locator(".agent[data-path]")).toHaveCount(0);
    await expect(mine(page)).toHaveAttribute("data-pose", /^(seated|standing)/);
    expect((await history(page)).sawPath).toBe(false);
  },
);

// ---- twelve --------------------------------------------------------------------------------

test("twelve agents fill three rows, four chips and a +N", { tag: "@twelve" }, async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".agent")).toHaveCount(12);
  const scene = page.getByTestId("scene");
  await expect(scene).toHaveAttribute("data-rows", "3");
  await expect(scene).toHaveAttribute("data-desks", "12");
  // Nine wait once R1 has fired on the three stuck tool calls: four chips and "+5".
  await expect(page).toHaveTitle(titleFor(9));
  await expect(page.locator(".top-bar-chip")).toHaveCount(4);
  const more = page.locator(".top-bar-more");
  await expect(more).toHaveText("+5");
  await expect(more).toHaveAttribute("aria-label", "and 5 more waiting");
});

test("a narrow window shows every chip, wrapped", { tag: "@twelve" }, async ({ page }) => {
  await page.setViewportSize({ width: 790, height: 480 });
  await page.goto("/");
  await expect(page).toHaveTitle(titleFor(9));
  const chips = page.locator(".top-bar-chip");
  await expect(chips).toHaveCount(9);
  await expect(page.locator(".top-bar-more")).toHaveCount(0);
  await expect(page.locator(".top-bar[data-narrow]")).toHaveCount(1);
  const tops = await chips.evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().top)),
  );
  expect(new Set(tops).size).toBeGreaterThan(1);
});

// ---- visual --------------------------------------------------------------------------------

// The darwin baseline in e2e/__screenshots__ is generated locally; the Linux baselines come from
// the CI update-baselines job. Live text (clock hands, the top bar's wait labels, bubbles) is masked.
test("the office scene looks as designed", { tag: "@visual" }, async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?hour=14&seed=e2e&scene=afternoon");
  // The scene sits in an overflow-y container: a classic scrollbar (macOS with a mouse attached)
  // would shrink the shot by 15px, an overlay scrollbar (trackpad only) would not. Hide it so the
  // baseline does not depend on the OS scrollbar setting.
  await page.addStyleTag({ content: "* { scrollbar-width: none !important; }" });
  await expect(page.locator(".agent")).toHaveCount(4);
  await expect(page).toHaveTitle(titleFor(3));
  await expect(page.locator('.agent[data-state="attention"]')).toHaveCount(3);
  await expect(page.getByTestId("scene")).toHaveScreenshot("office-scene.png", {
    animations: "disabled",
    mask: [
      page.locator(".bubble"),
      page.locator("header.top-bar"),
      page.locator(".clock-second").locator(".."),
    ],
  });
});
