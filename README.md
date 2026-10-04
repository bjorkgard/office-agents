# Office Agents

A local web app that shows your running Claude Code agents and subagents as people in an isometric office.

![The office with a few agents at their desks](docs/hero.png)

> **Status: early development.** The live office works in `vp dev`: the feed, the scene and the top bar are built. Some of the behavior below is still planned; progress is tracked in the roadmap.

Run it with `vp dev` and open the page. Every recently active Claude Code session appears as a character sitting at a computer (only macOS is exercised at first). Agents of the same project wear the same shirt color, and each gets a generated name and gender that stay the same across reloads.

- **Working:** the character types at the desk, and the screen shows scrolling lines. A waiting agent's screen stays half lit; every other screen is dark.
- **Subagents:** they walk in, take a sheet of paper from the parent's desk (it fades when the work is done), then sit at an empty desk and work on their own laptop or tablet. When done they hand the paper back and walk out.
- **Waiting for subagents:** the character stays at the desk and takes short, random drink breaks, to the coffee machine or the water dispenser. The schedule is the same after a reload.
- **Needs you:** the character waves and a speech bubble appears. A chip in the top bar, a tab title count `(N)` and a dot on the tab icon show who is waiting. At first this is a heuristic (the last message ends with a question mark, or a tool call has no result for a while), so it can wave falsely or miss a request. The hooks adapter on the roadmap makes it exact.
- **Done:** a subagent walks out when its result returns. A top-level agent stays at its desk, idle, and walks out after a quiet period.

The room itself is alive too. Four desks per row, in two alternating layouts (tidy and cluttered); a row is added when subagents need desks (up to 24 desks) and goes about a minute after the demand drops, with the whole room easing to its new size. The wall clock shows the real local time. Windows on the back walls show a night, dusk, overcast, rain, snow or late-afternoon view that follows the local hour, with a patch of light on the floor. All of it is decoration: it never changes an agent's state, and with reduced motion it stands still.

**What each banner means** (middle of the top bar):

- **Connecting...:** the page is waiting for the first data from the feed.
- **No active Claude Code sessions:** the feed works, but no session has been active recently. The desks stay empty.
- **Reconnecting...:** the connection dropped. The last scene stays on screen unchanged while the page retries.
- **Refused: open this page from localhost:** the feed answered 403. It checks every request's Host header and remote address and serves only loopback ones, so a page opened through a LAN address, another hostname, or from another machine is refused. Open the page at `http://localhost:<port>` on the machine that runs `vp dev`.
- **Feed unavailable, retrying:** the feed is not answering. This shows on a built page (`vp build`) that has no feed, when the feed plugin failed to load (404 on `/__office/events`), or when the feed refuses with 503 (too many clients). The page retries on a timer.
- **Display error: reload the page:** the scene hit an error while drawing. The top bar stays up. The details are in the browser console. Reload the page.

Where to look: the `vp dev` terminal prints a feed log line, and `GET /__office/status` returns the feed state as JSON. Bad or invalid feed events are skipped and counted, with one dev warning per kind in the browser console.

The feed reads the transcripts Claude Code already writes in `~/.claude/projects`. Those can contain file contents and secrets, so the feed runs inside the Vite dev server and is meant to refuse any request when the dev server is not bound to localhost (for example with `vp dev --host`).

Design and review notes: [docs/designs/office-agents-isometric-office.md](docs/designs/office-agents-isometric-office.md); office-life plan: [docs/designs/office-life-ceo-review.md](docs/designs/office-life-ceo-review.md). Visual rules: [DESIGN.md](DESIGN.md). Build order: [BUILD_TODO.md](BUILD_TODO.md). Phase 0 art check: [docs/designs/phase-0-sprite-notes.md](docs/designs/phase-0-sprite-notes.md). Third-party notices: [NOTICE](NOTICE). Deferred ideas: [TODOS.md](TODOS.md).

## Roadmap

- [x] Design doc, engineering review and design review
- [x] Check CC0 sprite packs for poses and a clean shirt color band (none fit; characters and props will be drawn)
- [x] Draw characters and props as isometric pixel sprites (BUILD_TODO 4.0)
- [x] Recolor shirts by project with a CSS variable (BUILD_TODO 4.3)
- [x] Event types and transcript normalizer
- [x] Feed plugin: tail transcripts, stream to the browser, refuse non-localhost hosts
- [x] State machine and seeded identity (name, gender, project color)
- [x] Office scene: desks, characters, top bar, status banner
- [x] Subagent walk-in and paper handoff
- [x] Wave, speech bubble and tab title count
- [x] Reduced motion, keyboard and screen reader support
- [x] Office life: wall clock, hour-matched windows and floor light, two desk kinds, working screens, desk paper, subagent laptops and tablets, drink breaks (coffee and water dispenser), rows that grow to 24 desks, debug hooks
- [x] End-to-end test with fixture transcripts (Playwright, `vp run e2e`)
- [x] Release checks: success criteria, frame budget and README picture (`vp run criteria`, `vp run perf`, `vp run hero`)
- [ ] Hooks adapter for exact attention signals (BUILD_TODO Phase 7)

The release checks live in `e2e/release.ts`. `vp run criteria` runs the success criteria and prints PASS, FAIL or SKIPPED for each. `vp run perf` measures frame times at 12 and 24 agents and the style cost of a row change in headless Chrome. `vp run hero` redraws `docs/hero.png`. `perf` and `hero` use a temporary feed root and never read your real `~/.claude/projects`. Criterion 1 of `criteria` is the exception: its live smoke reads your real `~/.claude/projects` (local only, over loopback), and prints only counts and timings, never transcript text.

### Roadmap rules

- Tick a checkbox when the work is done.
- Add a new checkbox when we get a new idea.

## Development

This project uses [Vite+](https://viteplus.dev/guide/); install its global `vp` CLI first. Then run `vp install` and `vp dev`. Run `vp check` before committing. `vp test` runs the Vitest suite. In dev only, open `/?art` to see the character and prop style sheet (poses, desk, appearance variants, a 12-agent row at 50%); the sheet is not part of the production build. Open `/?demo` to watch a scripted tour without real sessions (arrivals, work, a wave, a subagent trip, an idle coffee break); `/?demo=12` and `/?demo=24` show a crowded room. The demo feed is dev only and is not part of the production build. Also dev only: `?scene=<id>` pins every window to one scene (dusk, night, rain, snow, overcast, afternoon), `?hour=<0-23>` forces the hour the window scene is chosen for, and `?seed=<text>` salts its weather variant. The scene exposes its state as `data-*` attributes for tests and bug reports (`data-rows`, `data-desks`, `data-desk-kind`, `data-screen`, `data-device`, `data-break`, `data-drink`, `data-window-scene`); see DESIGN.md, "Debug hooks".

End-to-end tests use Playwright and live in `e2e/`. Install the browser once with `npx playwright install chromium`, then run `vp run e2e`. Each scenario (core, live, twelve, stale, empty, visual) starts its own `vp dev` on ports 5201 to 5206 (`--strictPort`, so free those ports first) with a temporary transcript folder generated at run time, so the tests never read your real `~/.claude/projects` and do not disturb a dev server on port 5173. The feed folder and build cache come from the `OFFICE_E2E_ROOT` and `OFFICE_E2E_CACHE` environment variables, which only the test harness sets. `vp test` skips the `e2e/*.spec.ts` browser specs and runs the helper tests. The GitHub Actions workflow (`.github/workflows/ci.yml`) runs `vp check`, `vp test` and the E2E suite on every push and pull request; the `@visual` screenshot case is skipped in CI until the Linux baseline from the manual `update-baselines` job is committed to `e2e/__screenshots__`.
