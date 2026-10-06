# TODOS

Sorted by priority (P1 first), then availability (unblocked first), then effort (S before M). IDs `T01`..`T47` are stable handles: a new entry takes the number above the highest ever issued (T47), never a gap left by an archived entry, and nothing is renumbered. `V#` ids and M9 in Depends-on lines name items shipped earlier (V1 to V9 in v0.3.0.0); see ARCHIVE.md. M10 is still open as T02. Ids are not in numeric order inside a section because the sort rule decides placement. Archived entries keep their T-id in the heading.

## P1 available (3)

### T02 M10: browser pass for row growth and the eased fit

**Area:** Office life (make the room feel alive) / Office life follow-ups from the 0.3.0.0 /ship review (2026-10-03)

**What:** In Chrome and Safari at 12 and 24 agents, write down frame timings, Recalculate Style cost of a row change, Safari hit area at 50% scale, and tag, bubble and hit-area alignment during the ease. Record the numbers in DESIGN.md.

**Why:** The plan requires the numbers before row growth is called done; nobody measured them (the /ship run accepted this risk).

**Context:** Overlay positions use registered `--fit-*` custom properties, transitioned in `scene.css` (`.scene-overlay`). Also check the 5 s test timeouts under load, and the D4 style-sheet passes (24-agent room, grayscale, shadows-off) in `?art`.

**Effort:** S (human ~1h)
**Priority:** P1
**Depends on:** None

### T05 Key sessions by filename, not record sessionId, for resumed sessions

**Area:** Feed hardening

**What:** Resumed sessions may carry a different `sessionId` in their records than the file name.

**Why:** Two files could collapse into one agent, or one agent split across two.

**Context:** Verify against real transcripts first (see T03).

**Evidence (2026-10-06, T03 census of the real transcript root):** `sessionId` differs from the file name in 0 of 182 files, so the resume premise was not reproduced locally (3 resumes seen, so resume is only partly verified). The owner may close this.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P1
**Depends on:** None

### T04 Row-change style recalc at 24 agents over budget (2026-10-05)

**Area:** Office life (make the room feel alive) / Office life follow-ups from the 0.3.0.0 /ship review (2026-10-03)

**What:** Find what a settled 24-agent row insertion restyles and cut it. At 12 agents the large miss is fixed (the 12-agent gate is unstable near the line, with one failing run in four, and has no owner yet): the inherited `--scale` property is gone and the worst style-recalc event went from an old burst figure of about 48 ms to a median worst event of 14.7 to 17.3 ms over four runs (different metrics, budget 16 ms). The 12-agent gate sits on the 16 ms line and can flip between runs: medians 14.9, 14.7, 15.6 and 17.3 ms, the last with repeats 17.3/14.8/22.2 ms. At 24 agents the settled median is still 19.1, 19.5, 19.3 and 22.6 ms (headless Chrome, M1 Max, `vp run perf`, 4 runs; fourth run repeats 19.6/22.6/34.2 ms). The fourth run overlapped with other work on the machine (review agents and an e2e run just before it), so it is noisier. The per-repeat line now prints the worst event's offset after the write; comparing it with the printed 'row appeared' time, in that run the worst 12-agent events fell within 50 ms of the new row appearing, while the 24-agent ones fell 17 to 280 ms before it, so at the time the 24-agent cost looked untied to one step (superseded, see the 2026-10-05 gate note below). The cause was unknown then.

2026-10-05, after the decor changes: 12 agents now sits at the 16 ms line (15.8 to 16.1 ms vs 13.7 to 14.6 ms before, 3 runs each), 24 agents is unchanged (19.7 to 21.2 ms vs 19.8 to 21.4 ms). A `RoomDecor` memo was tried the same day and gave no gain (reverted).

2026-10-05, new gate (6 repeats, 3 runs): 12 agents PASS with medians 14.6, 13.5 and 15.1 ms (the last marginal); 24 agents FAIL with medians 21.3, 20.6 and 18.9 ms. `perf --ab` showed animations are not the cost: animations off was 4.3 to 6.2 ms slower in every run (24 agents: 19.4 to 19.9 ms on, 24.1 to 24.8 ms off), with a confound, since `animation: none` also removes walk-in and desk-pop and so changes the mount workload. The worst 24-agent event is the insertion's own mount recalc in all 6 repeats of each run; it restyles about 9.6k elements at both 12 and 24 agents (a fresh page restyles about 3.2k) and was detected about 270 ms late by polling, which explains the earlier "events before the row appeared".

**Why:** Decision D8 of phase-6-finish: a missed budget is a dated entry, not a release block. p95 frame time passes (16.7 to 16.8 ms against 20 and 33 ms).

**Exit rule (2026-10-05 perf review, D8-A):** if the 24-agent median is still above 16 ms after the trace attribution and a `contain: layout style` probe, record the measured median and cause in DESIGN.md as a dated exception (24-agent budget = measured median + 10%), keep 12 agents at 16 ms. Numbers and method are in DESIGN.md "Performance". Next step: invalidation-tracking trace (what invalidates ~9.6k elements on row add). Safari is not measured.

**Effort:** M
**Priority:** P1
**Depends on:** None

## P2 available (5)

### T07 Hook rate windows break on a backward clock step

**Area:** Review follow-ups from the 0.8.0.0 ship (2026-10-06)

**What:** `hookAdmit` in `server/hook-route.ts` (`at - total.start >= HOOK_WINDOW_MS`, `at - w.start >= HOOK_WINDOW_MS`) uses the wall clock. After a backward step (NTP, laptop wake) `at - start` is negative, the windows never reset, and every hook event including `needs_attention` is dropped with a 204 until the clock catches up. Reset a window when `at < start` or use a monotonic clock; do the same in the attention windows and the `hookLogged` throttle.

**Why:** Adversarial finding at the 0.8.0.0 /ship (D4 skipped). The same logic existed in `feed-plugin.ts` before the hook route split, so it predates this release; the new attention budget copies it.

**Effort:** S
**Priority:** P2
**Depends on:** None

### T10 Compensate for a dropped oversized tool_result line

**Area:** Feed hardening

**What:** A tool_result line over READ_CAP_BYTES is dropped, so its tool end and handoff never arrive.

**Why:** The agent keeps showing a running tool or an open handoff.

**Context:** Needs a compensating event or size data from real transcripts. Found in the Phase 2-3 /ship review.

**Evidence (2026-10-06, T03 census of the real transcript root):** the longest line is 890298 bytes against the 4 MiB read cap (4194304 bytes), and 0 lines are over the cap. The owner may close this.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P2
**Depends on:** None

### T06 Validate id format in parseAgentEvent

**Area:** Feed hardening

**What:** Reject ids that do not match a conservative pattern (length and character set).

**Why:** Ids flow into keys, logs and the DOM later; today any non-empty string passes.

**Context:** Add after the id formats of real transcripts are confirmed (see T03).

**Evidence (2026-10-06, T03 census of the real transcript root):** all 2719 ids seen are 17 characters of `[A-Za-z0-9_-]`, with 0 outside that set. The owner may close this.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P2
**Depends on:** None

### T08 Door opens for only some live arrivals (arrivedAt is the transcript time)

**Area:** Office life (make the room feel alive) / Decor follow-ups (2026-10-05)

**What:** Time a subagent's arrival from when the page receives its first event, not from the transcript line's timestamp, so the door-ajar window and the walk-in start on screen.

**Why:** Found at /ship (2026-10-05). `applyOwned` uses `Math.min(event.ts, now)` as the clock for live events (`src/office/machine.ts:296`), so `arrivedAt` is the line's ts. A subagent's transcript is a new file that the server finds on its 5 s tree walk (`server/feed-plugin.ts:30`, `:677`), so the event reaches the page 0 to 5 s late. The 1.2 s door window (`DOOR_TUNING.ARRIVE_OPEN_MS`, `paper.ts`) is then already over at first paint, and the walk-in starts partway along its path. Measured in the e2e walk-in fixture: arrivedAt 2800 ms before first render, door never open; in `?demo` (events stamped at send time) the door opens every time. Estimated from that lag spread, about a quarter of live arrivals show the door; a reload mid-arrival never does.

**Context:** Proposed fix (debugger report, `.claude/scratch/office-decor/reports/debugger-17.md`): at `machine.ts:141` pass `now` (receive time) to `arrive` for `arrivedAt`, keep `lastEventAt` and tool clocks on the event clock; replays already pass `min(ts, now)` as `now`. Fixes the door, the mid-path walk-in and the paper timing together. Risks: machine tests that expect a live `arrivedAt` to equal ts, subagent ordering by arrivedAt (`choreo.ts:153`, `scene-model.ts:190`), and an old file found late on a live walk would now walk in at receipt time. Re-verify with `vp test`, the e2e walk-in and reduced-motion specs and a `[data-door]` observer run. Also check whether the hooks adapter reports subagents sooner.

**Effort:** M
**Priority:** P2
**Depends on:** None

### T09 Feed performance pass

**Area:** Feed hardening

**What:** Serial lstat of stale files every 5 s; per-second poll of idle files; cold start blocks the first scan; batch SSE writes; ring uses Array.shift and has no global cap; structuredClone per event and a clone in tick when nothing changed.

**Why:** None bites at a handful of sessions; each grows with transcript count.

**Context:** Measure with a few hundred files before changing anything. Files: `server/feed-plugin.ts`, `src/office/machine.ts`.

**First step (deferred from the 2026-10-05 perf review, X4):** write a fixture generator (300+ transcript files) and a timing script for cold start, the 5 s stale-file lstat walk and the per-second idle poll. Do it after the two P1 perf items (T02, T04) land.

**Effort:** M (human ~1 day / CC ~30min)
**Priority:** P2
**Depends on:** None

## P2 blocked (1)

### T11 Make the hooks attention mapping exact, then retire the heuristics

**Area:** Hooks adapter follow-ups (2026-10-04)

**What:** Run the interactive hook probe (a real `claude` session with `--settings <temp file>` and a logging hook that records field names and ids only) to learn which hook events fire for a permission prompt, an `AskUserQuestion` and an idle wait, and whether `matcher: ""` and `async: true` behave as assumed. Then fix the `HOOK_EVENTS` table in `server/hooks-adapter.ts`, make the episode id independent of the hook name if two hooks fire for one prompt, and decide whether the `dec-R1` and `dec-R2` heuristics in `src/office/machine.ts` can be suppressed for agents with exact signals.

**Why:** The mapping for `PermissionRequest` and `Notification` types is tolerant but unverified; a headless `claude -p` run fires neither, and the agent-driven interactive probe was denied by the auto-mode classifier. The subagent mapping is verified (the hook `agent_id` equals the `agent-<id>.jsonl` id).

**Context:** `.claude/scratch/todo-burndown/FINDINGS.md` ("Hook probe") has the facts and the exact probe command. Both hooks firing for one prompt would announce twice (episode id includes the hook name).

**Effort:** S (human ~30min / CC ~20min)
**Priority:** P2
**Depends on:** The user running the probe

## P3 available (23)

### T12 Perf deadlines are unmeasured (2026-10-06)

**Area:** Office life (make the room feel alive) / Office life follow-ups from the 0.3.0.0 /ship review (2026-10-03)

**What:** Measure real `perf --ab` repeat and total durations and set `PERF_REPEAT_DEADLINE_MS` (120 s) and `PERF_TOTAL_DEADLINE_MS` (30 min) from them. A repeat that times out now closes its own browser and stops further repeats at that size.

**Why:** Both values are estimates, not measurements.

**Context:** In `e2e/release.ts` (`withDeadline`). Report: `.claude/scratch/todo-burndown-2/reports/builder-02.md`.

**Effort:** S
**Priority:** P3
**Depends on:** None

### T13 Review polish from the 0.7.0.0 ship (2026-10-05)

**Area:** Office life (make the room feel alive) / Decor follow-ups (2026-10-05)

**What:** Informational items the /ship reviews raised and the user skipped, still open after the burndown: `DISPENSER_SHADOW`, `COFFEE_SHADOW` and `BOOKSHELF_SHADOW` are exported only for `art.test.ts`; `PixelShadow` could reuse `pathOf`; the ArtSheet Legibility row is on `--bar` instead of `--bg`; random schedules without `ctx.resume` or null ctx.

**Why:** None is a defect; each makes the code or tests a little clearer.

**Context:** Also from the adversarial passes (all low, unreachable today): `doorOpenFor` returns CLOSED with `nextChange: null` after `MAX_RUNS` (64) runs, about 150 s of unbroken door traffic, which would lose a timer wake; `subagentDoorAt` and `subagentPath` use different fallbacks if a leaver ever had `leftAt === null` (`machine.ts:220` always sets it); `PixelDecor` keys its runs cache by the raw variant; a leaver whose `leftAt` is in the future adds no door window and no wake; the `decorDay` cache can be stale for up to a day after a timezone change; module caches go stale under Vite HMR in dev. Simplification advisories to weigh against these: drop `MAX_RUNS` or the ended-window skip, drop the cache layers, build `DOOR_AJAR` rows with `Array.from`, one `DecorProp` type. Also: the e2e visual baseline pins `decor=0` but not the door state (check the 4-agent fixture has no live-stamped subagent). Leaf-level memoizing of the decor components shipped; the 12-agent row-change recalc sits at the 16 ms line (T04, `Row-change style recalc`).

**Effort:** S
**Priority:** P3
**Depends on:** None

### T14 parentAgentId is null for first-level subagents

**Area:** Feed hardening

**What:** Since batch A the normalizer fills `parentAgentId` only for nested subagents (a subagent launching a subagent). A top-level parent has no agentId, so first-level subagents still get null. Also the parent lookup in `server/feed-plugin.ts` (`stateFor`) ignores projectId, and a launcher whose path sorts after its child returns null.

**Why:** The machine and UI cannot draw a parent link from the event alone; they rely on handoffs.

**Context:** Decide what `parentAgentId` means for a top-level parent (its session id?) before changing `shared/events.ts`, or fill it from the hooks adapter. Real nested subagents unseen in the sanitized sample.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P3
**Depends on:** None

### T15 Batch B2 leftovers (2026-10-04)

**Area:** Feed hardening

**What:** (1) A unix socket swapped in for a transcript is not refused at once: on macOS opening it fails with errno -102, which takes the transient-retry path for up to 5 scans before denial (`server/feed-plugin.ts:329`). (2) A same-size in-place rewrite is not detected as rotation (split from T16) (the head is re-read only when the file grew). (3) No test checks that the read handle is closed on every reject path. (4) `needs_attention` now clears `openTools` and `waiting` in the ring (`feed-plugin.ts:729`), latent until the hooks adapter emits it; and a resumed asker's question `done` leaves the snapshot.

**Why:** Informational findings from the round-1 refuter pass; none blocks.

**Context:** Linux errno for a socket open is ENXIO, untested. Ring eviction scans all agents when full of askers (O(N), fine at the 2000 cap).

**Effort:** S
**Priority:** P3
**Depends on:** None

### T17 Demo mode for the README and first run

**Area:** Demo mode

**What:** `?demo` already exists (`src/office/demo.ts`, `src/main.tsx:41`) but is dev only and scripted. What is missing is a fixture replay for the live feed: play recorded transcript fixtures through the real feed source so the office can be shown from a production build without real Claude Code sessions.

**Why:** Deferred from phase-6-finish (decision D5); the README picture comes from `vp run hero` with a temporary feed instead.

**Context:** The demo module is excluded from `dist/` on purpose (marker `__OFFICE_DEMO__`), so a production replay needs its own path.

**Effort:** S
**Priority:** P3
**Depends on:** None

### T18 Installer `isOurs` exact path and settings re-check (2026-10-06)

**Area:** Hooks adapter follow-ups (2026-10-04)

**What:** (1) `isOurs` in `hooks/install.mjs` now matches only this checkout's unresolved script path, so `--apply` no longer replaces an entry left by a moved or deleted checkout, and an entry written through a symlinked checkout path is not removed by `--remove`: decide whether to compare resolved paths. (2) The settings re-check before `renameSync` runs only when the file existed at read time; if it was absent then, a file another tool creates meanwhile is overwritten.

**Why:** Both are edge cases of the exact-path change and the concurrent-writer guard from the burndown.

**Context:** Report: `.claude/scratch/todo-burndown-2/reports/builder-06.md`.

**Effort:** S
**Priority:** P3
**Depends on:** None

### T20 sanitize-fixtures salt claim is unverified (2026-10-06)

**Area:** Hooks adapter follow-ups (2026-10-04)

**What:** Check that the committed fixtures really are the output of the library default (empty salt), as the `server/sanitize-fixtures.ts` header now states. The CLI still rejects an explicit `--salt ""`, so it cannot regenerate them.

**Why:** The header claim was written from a code read, not from a regeneration run.

**Context:** The new test in `server/normalize.test.ts` ("committed empty-salt = library default") checks the default, not the committed files. Report: `.claude/scratch/todo-burndown-2/reports/builder-01.md`.

**Effort:** S
**Priority:** P3
**Depends on:** None

### T21 TopBar wait clock test is weak (2026-10-06)

**Area:** Hooks adapter follow-ups (2026-10-04)

**What:** Strengthen the TopBar "wait clock" test: it only proves TopBar renders the `now` it is given, not that `App` and `TopBar` share one clock.

**Why:** The two clocks were merged (15 s in App) but nothing would fail if TopBar grew its own again.

**Context:** `src/office/topbar.test.tsx`; `src/App.tsx` passes `now`. Report: `.claude/scratch/todo-burndown-2/reports/builder-03.md`.

**Effort:** S
**Priority:** P3
**Depends on:** None

### T22 More review findings from the 0.8.0.0 ship (second pass, 2026-10-06)

**Area:** Review follow-ups from the 0.8.0.0 ship (2026-10-06)

**What:** Informational findings from the second /ship pass, skipped by the user's choice (D3). (3) `hooks/office-hook.mjs` `readInfo` checks `isFile` and size but not the owner of `hook.json`, so a `hook.json` in an attacker-owned `~/.office-agents` is still read: add a `uid` check and a test (the owner check today is only on the feed's write side). (4) `server/hook-discovery.ts` `removeDiscovery`: the read and the `rmSync` are separate, so a newer dev server's file written in between can be removed by an older server's cleanup; `O_NONBLOCK` is a no-op on Windows. (6) `server/feed-plugin.ts:1216` hard-codes the reachable bind addresses that `hookHost()` in `hook-discovery.ts` also encodes: export one predicate. `src/office/props.ts:388` contact-shadow comment omits the shelf. (7) `useChime.ts` reads the stored preference once and has no `storage` listener, so two tabs disagree until reload.

**Why:** None is a defect in released behaviour; items 1 to 3 are the most worth doing first.

**Context:** Simplification advisories also raised: remove the `HOOK_*` re-export block in `server/feed-plugin.ts:73` by importing from `hook-route.ts` in the tests, and one limiter helper instead of the attention ternaries in `hookAdmit`.

**Effort:** S
**Priority:** P3
**Depends on:** None

### T34 identityFor covers only 24 identities

**Area:** Feed hardening

**What:** `src/office/identity.ts` `identityFor` has 24 identities.

**Why:** The 25th concurrent agent reuses an identity, so two desks look the same.

**Context:** Decide in Phase 4 whether to extend or accept repeats.

**Effort:** S (human ~1h / CC ~10min)
**Priority:** P3
**Depends on:** None (BUILD_TODO 4.4 is done; decision D8 in `docs/designs/phase-4-ceo-review.md` accepted repeats past 24 agents, so decide whether to archive this as accepted)

### T46 Chime follow-ups from the /ship review of v0.9.1.0 (2026-10-06)

**Area:** Office

**What:** Four chime items the review raised and the user skipped. (1) `playChime` can still sound after the user turned the chime off, when a pending `resume()` lands on their click: `notify` in `useChime.ts` calls `playChime`, which awaits `resume()` and then schedules the oscillators without re-checking the generation in `chime-audio.ts`. (2) Advisories: seven exported `CHIME_*` constants have no consumer outside their module, `ChimeGlyph` is exported only for a test, the glyph test copies the SVG path strings (so it is coupled to the implementation), and `useChime` builds wrapper lambdas only to get a stable identity. (3) A click while an unlock is pending restarts the unlock instead of turning the chime off. (4) An unlock result that arrives after the 1.5 s timeout is discarded.

**Why:** None is reproducible in normal use; (1) is the only one that can make a sound the user just asked to stop.

**Context:** Files: `src/office/useChime.ts`, `src/office/chime-audio.ts`, `src/office/TopBar.tsx` and their tests. For (1), re-check the generation after the `await` before scheduling. Audio and Safari were not tried in a real browser by any tool.

**Effort:** S
**Priority:** P3
**Depends on:** None

### T47 Census and normalizer follow-ups from the /ship review of v0.9.2.0 (2026-10-06)

**Area:** Feed hardening

**What:** Skipped review items from the v0.9.2.0 /ship (0 critical, 19 informational after the PR review fixes), all in `server/census-transcripts.ts`, `server/normalize.ts` and their tests. Normalizer: the `otherTools` map in `normalize.ts` (Bash and Monitor ids only) shares MAP_CAP (2000) with its own entries, so a background task that outlives 2000 later tool calls is counted as an orphan again; the eviction test does not assert that effect, and nameless tool_use and notification-before-tool_use have no test. Census: add a top-level catch in `main()` so a crash prints one fixed line, not a stack trace with paths; count skipped symlinks and files that fail mid-read (their mismatch and id checks are dropped, so the T05/T06/T10 numbers are a lower bound); drop or count an unterminated last line when a session is live; rename `maxLineChars` (it holds bytes); move READ_CAP_BYTES out of `feed-plugin.ts`; hoist `isRealDir`; tidy `enumKey`. Census tests missing: no trailing newline, CRLF and blank lines; non-object JSON records; `remove` operation and status-less notifications; a root that is a file (the CLI already exits 2, probed); explicit timeouts on the large-line tests; `process.execPath` instead of bare `node`. Also add a one-line comment on why `otherTools` is a Map.

**Why:** Keeps the drift counter and the census honest after a Claude Code format change, and keeps the census output exactly counts-only on every error path.

**Context:** Findings came from five specialist reviewers, a red-team pass and the native adversarial pass of the v0.9.2.0 ship, which the user chose to skip rather than start another review cycle. The 55 orphans left in the census all have a tool-use id that is not in the same file (0 of 55), so they are probably cross-file or compaction cases (inferred, not checked).

**Effort:** S (human ~3h / CC ~30min)
**Priority:** P3
**Depends on:** None

### T23 Paper label review follow-ups (v0.9.0.0 ship, 2026-10-06)

**Area:** Office

**What:** Informational findings from the three /ship review passes and the adversarial pass, skipped by the user's choice. Behaviour and robustness: (1) a late or repeated `out` re-stores a kind for a child that already returned or never appeared (`src/office/machine.ts:366` `if (event.subagentKind)`; guard with `key in s.returned`, prune on `unresolved` expiry), and `replay()` leaves `office.kinds` entries for deleted agents (`src/office/feed-client.ts:135`); (2) every launch with an agent type outside Explore, Plan and general-purpose, roster names included, bumps `unmapped_subagent_type`, which `server/feed-plugin.ts:1076` sums into one log line (count known built-ins and roster names separately or not at all); (3) one unknown `subagentKind` value drops the whole `out` handoff in an older browser bundle (`shared/events.ts:112`; coerce to `other` if server and client ever ship apart); (4) `evictOldest` still walks up to the cap per call (`src/office/machine.ts:252`; a Map would make it O(1)); `fold` sorts and allocates per render (`src/office/paper.ts:117`). Code shape: `PaperSub.key` is optional only for old tests (`src/office/paper.ts:40`; builder 09 reported making it required but the file still says `key?: string`); `sheetKinds` in `Scene.tsx:572` holds the label, not the kinds (rename `sheetLabel`); the paper-slot midpoint could be a helper in the desk-kinds module; `KINDS_CAP` is an alias of `RETURNED_CAP` (reviewers disagree whether to keep it). Tests: no e2e that the label hides again on mouse-leave or blur (`e2e/office.spec.ts:528`), the stacking spec starts a second session after the 30 s sheet timer began (`:541`), no e2e for two different kinds or for the target going away when the sheet is taken (`:618`), `Scene.test.tsx:755` and `:733` are coupled to the formula and a sampled time window, no a11y case with a live paper (`Scene.a11y.test.tsx:32`), no test that a kind-less relaunch keeps or clears an earlier kind (`machine.test.ts:1276`), no test for focus recovery when a focused `.paper-hit` unmounts, and the click e2e cannot fail on a handler because `App.tsx:86` passes no `onSelect`.

**Why:** None is a defect in shipped behaviour; each makes the code or its tests a little safer. Items (1) and (2) are the ones worth doing first.

**Context:** Reports and the review log are in the /ship run of 2026-10-06 (branch `feat/paper-hover-text`); the plan is `docs/designs/paper-hover-text-ceo-review.md`. Already documented in DESIGN.md "Paper label limits" and not repeated here: the reload and sync-launch labels read "Subagent", the label is only reachable while the sheet lies.

**Effort:** M
**Priority:** P3
**Depends on:** None

### T24 Reload-stable breaks and spot assignment

**Area:** Office life (make the room feel alive) / Office life follow-ups from the 0.3.0.0 /ship review (2026-10-03)

**What:** A tool result resets `openTools[*].startedAt` (`machine.ts:252`) and coffee spots go out in key order on reload (`motion.ts:141`), so a reload can land mid-wait on a different break point. Record a stable `waitSince` on the agent and pick spots in that order.

**Why:** The design promises that a reload resumes the same schedule.

**Context:** Cosmetic and rare. Also: a very old transcript timestamp fills up to about 100,000 plan cycles inside render and stops breaks past the 30-day clamp (`motion.ts:93`, `breaks.ts:88`).

**Effort:** M
**Priority:** P3
**Depends on:** None

### T25 Clock and room robustness

**Area:** Office life (make the room feel alive) / Office life follow-ups from the 0.3.0.0 /ship review (2026-10-03)

**What:** After a backward wall-clock step, `stepRowHold` keeps extra rows (`scene-model.ts:132`) and `desk-pop` stays on (`Scene.tsx:213`): reset `since` when `now < since`. A subagent first seen at `DESK_CAP` stays queued for life (`choreo.ts:159`), the desk clamp draws an out-of-range desk on the last desk (`scene-model.ts:153`), and seat indexes above 24 still grow the room (`scene-model.ts:86`). Cap `?seed` length in `main.tsx` (DEV only). Fix the stale `assignWorkDesks` doc, "rooms never grow" (`choreo.ts:135`).

**Why:** Edge cases and doc drift from the final /ship review passes.

**Context:** Also in this group: resize rebuilds geometry and restarts every character loop (`Scene.tsx:214`, key the geometry on rows only), the scene height snaps while content eases on shrink (`Scene.tsx:446`), the desk paper blinks if a new span starts mid-fade (`DeskLayer.tsx:111`), and `@property`-less browsers snap the overlay while the room eases (`scene.css:19`).

**Effort:** M
**Priority:** P3
**Depends on:** None

### T26 Stronger tests for the office-life items

**Area:** Office life (make the room feel alive) / Office life follow-ups from the 0.3.0.0 /ship review (2026-10-03)

**What:** Slat geometry test is presence-only (`decor.test.ts:539`), overflow test does not assert standing and queue slots (`Scene.test.tsx:546`), loose `+1` match (`Scene.test.tsx:145`), tautological counter (`motion.test.ts:451`), DST tests skip under UTC, heavy Scene renders risk the 5 s timeout, and Scene's `layout.box`, desk pop-in and the rAF loop wiring have no direct test. A browser test for the `Character` loop would close the last two.

**Why:** Several tests would still pass if the thing they name broke.

**Context:** Repo-wide sweep: run /test-audit. `overlayPoints` is now a test oracle only (`motion.ts`); test `overlayCalc` output directly.

**Effort:** M
**Priority:** P3
**Depends on:** None

### T27 Per-tool-kind screen content (follow-up to V3)

**Area:** Office life (make the room feel alive) / Deferred from the Office life CEO review (2026-10-02)

**What:** Screens show what the agent is doing (read, edit, shell, search) instead of one generic animation.

**Why:** A glance tells reading from editing from running a shell.

**Context:** `shared/events.ts` carries only a tool id and `isSubagent`, by the privacy rule. Needs a closed enum kind (read, edit, shell, search, other) mapped in `server/normalize.ts` from the tool name (the raw name never leaves the server; see "Fixture id salt and tool-name allowlist" in ARCHIVE.md), the `parseAgentEvent` spec, fixtures, a leak test, and four screen variants in the V3 overlay. The hooks adapter could supply the kind instead.

**Effort:** M (human ~1 day / CC ~40min)
**Priority:** P3
**Depends on:** V3

### T28 Idle fillers at the desk (follow-up to V5)

**Area:** Office life (make the room feel alive) / Deferred from the Office life CEO review (2026-10-02)

**What:** A waiting parent seated between breaks stretches, looks around, sips from the mug or checks a phone.

**Why:** The seated parent keeps moving between coffee trips.

**Context:** 2 to 4 new seated frames drawn by hand in `src/office/sprites.ts` (the grid generator is not in the repo), wired through `poses.ts`, `swap.ts`, `loopOf` in `Character.tsx` and `art.test.ts`. The sip filler can reuse the V7 drink prop.

**Effort:** M (human ~1 day / CC ~45min)
**Priority:** P3
**Depends on:** V5, V7

### T29 Render cost: per-frame setState, idle tick clone, overlay ref churn

**Area:** Phase 4 review follow-ups

**What:** Every SSE frame and every skipped frame sets state and renders the scene. `tick` in `src/office/machine.ts` clones the whole state on idle ticks. `bindOverlay` in `Scene.tsx` returns a new ref callback each render.

**Why:** Churn grows with agent count and event bursts; measured scale (12 agents, about 28k SVG elements) is acceptable today.

**Context:** Coalesce frames per animation frame, run a cheap "anything due" check before cloning, cache ref callbacks. Deferred by the user in the Phase 4 /ship review.

**Effort:** M (human ~4h / CC ~30min)
**Priority:** P3
**Depends on:** None

### T30 Hooks adapter leftovers

**Area:** Hooks adapter follow-ups (2026-10-04)

**What:** (1) A hook payload over 256 KB (a huge `PermissionRequest` `tool_input`) is dropped whole, so that attention signal is lost; a reused pid sends the token to whatever listens on that port. (2) Installer: a failed rename leaves a `.<name>.<pid>.tmp` with the full settings; two runs in the same millisecond overwrite each other's backup; rename breaks hard links; apply then remove normalises the user's empty event arrays away; `echo /x/office-hook.mjs` counts as ours. (3) Hook discovery: both dev servers (5173 and 5199) use the default `~/.office-agents` dir, so the last writer wins; after SIGKILL a stale `hook.json` stays (the script checks the pid). (4) The `returnedSeen` ring set is never cleared, so a relaunched child with the same agent id would be dropped. (5) Machine: live and replay can still differ on hold-check versus tick timing and on a repeated `episodeId` after an idle exit; only the latest exact episode id per agent is remembered; the clamp accepts `waitingSince: 1`; an upgrade can reorder the attention list by since-time. (6) Not tested: a Windows host, real hook arrival latency.

**Why:** Informational findings from the step 6 refuter passes; none blocks.

**Context:** Reports in `.claude/scratch/todo-burndown/reports/refuter-17.md`, `-21.md`, `-26.md`, `-28.md`, `-31.md`, `-33.md`.

**Effort:** M
**Priority:** P3
**Depends on:** None

### T31 Feed plugin: split the hook route and tighten small spots

**Area:** Pre-landing review follow-ups (2026-10-04, /ship cycle 1)

**What:** `server/feed-plugin.ts` is still past 1,200 lines (the hook route moved to `server/hook-route.ts`). The `Req.on` type was widened to `(event: string, cb: (arg: Buffer) => void)` (`:849`): use overloads for `close`, `data`, `end`, `error`. `hookSessions` evicts by insertion order, not recency (`:1014`): delete before set. `replaced()` re-opens, reads and hashes the file head on every scan for every grown file (`:556`): skip unless size shrank or the inode changed, or read the head on the same handle. `hookSessionCount` and several `HOOK_*` exports exist only for tests. The SIGINT handler re-raises unconditionally (`:1237`); verified fine for `vp dev` (refuter-21) but would double-run other plain listeners. `hooks/install.mjs:225` writes the settings temp file without `O_EXCL`/`O_NOFOLLOW` (needs write access to `~/.claude`, low impact).

**Why:** Maintainability, performance and security informational findings; none is a defect today.

**Context:** Advisory simplifications also listed: drop the redundant `chmodSync(tmp, 0o600)` in `server/hook-discovery.ts`, share one `reject(code)` closure in `readHookBody`, validate the root before `mkdtempSync` in `e2e/release.ts` `startOffice`.

**Effort:** M
**Priority:** P3
**Depends on:** None

### T32 Final review pass leftovers (2026-10-04)

**Area:** Pre-landing review follow-ups (2026-10-04, /ship cycle 1)

**What:** (1) A child handed back and later resumed (the normalizer's `state.resumes`) stays in `returnedSeen`, so its hook `needs_attention` and `agent_started` are dropped for good (`server/feed-plugin.ts` `ingestHook`): delete the key when a `handoff out` for that child arrives. (2) `hooks/office-hook.mjs` trusts `hook.json` without an owner or mode check and accepts any integer port: require owner equals the current uid, no group or other bits, and a port in 1024 to 65535. (3) `keyOf` and `episodeIdOf` join ids with `\u0000` and `idOf` accepts NUL in ids, so a token holder can collide session `a\0b` with session `a` plus agent `b`: reject NUL or length-prefix the key. (4) `hooks/install.mjs` rewrites settings through `JSON.parse`/`stringify`: duplicate keys and integers above 2^53 are lost and formatting is normalised without a warning. (5) One `node` process per hook event with a 400 ms deadline: a burst of many subagents costs CPU and events past the deadline vanish. (6) A hook-created top-level agent for a session the tailer has not read gets no seat. (7) `src/office/identity.ts:41` `pickShirt` and DESIGN.md (shirt sections, "unknown project: neutral gray") still say project although shirts are per session; `setOwn` is defined twice (`machine.ts` and `scene-model.ts`); `parentOf` in `server/feed-plugin.ts:475` scans every tracked file's launches linearly per subagent file.

**Why:** Informational findings from the last /ship review pass, skipped by the user's choice (/ship D5).

**Context:** Items 1, 3 and 6 are red-team or adversarial findings read from code, not reproduced end to end.

**Effort:** M
**Priority:** P3
**Depends on:** None

### T33 Small review findings from the 0.8.0.0 ship

**Area:** Review follow-ups from the 0.8.0.0 ship (2026-10-06)

**What:** Informational findings skipped at /ship (D3, D4), each with a file reference. (1) `server/hook-route.ts:88` `sessions` map is shared with the caller and evicts oldest at 1,000, so rotating session ids resets a per-session window (bounded by the overall caps); `:78` `hookAdmit` threads an `attention` flag through four ternaries (extract one limiter and instantiate it twice); `:12` header comment. (2) `server/feed-plugin.ts:71` the re-export block for the `HOOK_*` constants is a compatibility shim for tests only; `:1224` and `:450`, `:1155`, `:1253` still log raw `String(e)` instead of `loggable(e.name)`; the tracked-file cap check runs before the `lstat` and window filter, so slots go to arbitrary files and the warning can overstate drops; no test for the cap warning re-arming. (3) `server/hook-route.ts` accepts an empty `hookToken` as valid (treat `""` as disabled); a non-loopback bind warns but still publishes the token. (4) `server/sanitize-fixtures.ts` `parseCliArgs` treats unknown flags (`--help`, `--slat`) as paths. (5) `hooks/install.mjs`: `--apply` from a second or moved checkout adds a second entry, so every hook event fires twice (strip entries with the `office-hook.mjs` basename on apply and warn); a `.tmp` file can be left if the re-check read throws. (6) `src/office/props.ts:502` `decorVariantGrid` shift is fractional if `DECOR_VARIANTS` does not divide 6: use `Math.floor` or assert; `ErrorBoundary.tsx:3` has a doubled `(D16)`; `chime-logic.ts:3` module comment sits after the import. (8) The directory-at-`hook.json` test (`server/hook-discovery.test.ts:115`) would still pass without the `isFile` guard; the FIFO test is what covers that guard.

**Why:** None is a release blocker; each was rated informational by the seven reviewers and the adversarial pass.

**Context:** Reports in `.claude/scratch/todo-burndown-2/reports/`. Chime findings were folded into the archived T01 (Chime control: design review).

**Effort:** M
**Priority:** P3
**Depends on:** None

## P3 blocked (4)

### T35 Share character drawings via symbols

**Area:** Office

**What:** Draw each character pose once per hair style as a shared SVG symbol and place it with `<use>`, as the desk is after the Phase 4 eng review (R5).

**Why:** Measured 2026-10-02: one character is 785 to 867 DOM elements (about 40 KB); after the desk is shared, 12 agents are still about 10,000 elements and 24 agents about 20,000.

**Context:** Only worth doing if M10 timings (12 and 24 agents in Chrome and Safari) show jank. Must keep pose swap (`nextDisplayed`, D10) and `--shirt`/`--shirt-stripe`/`--hair`/`--skin` theming working: custom properties set on the `<use>` element inherit into the shared tree. Start from `src/office/CharacterRig.tsx`.

**Effort:** M (human ~1 day / CC ~45min)
**Priority:** P3
**Depends on:** Bubble layout and hit-area spacing (M9) and T02 (M10 profiling timings)

### T36 Frame cost and caches in the break and paper code

**Area:** Office life (make the room feel alive) / Office life follow-ups from the 0.3.0.0 /ship review (2026-10-03)

**What:** Cache per-cycle trip segments so a waiting parent builds its timeline once per frame (`choreo.ts:381`), evict one plan instead of clearing all (`breaks.ts:112`), group subagents by session once (`paper.ts:139`), and memoize `DeskLayer` and `RoomShell` (`Scene.tsx:300`).

**Why:** Avoids garbage and re-render work with 24 waiting parents; unmeasured, so do it only if M10 shows pressure.

**Context:** `settled` also keeps a rAF loop for the first 2 s of idle (`motion.ts:183`); `nextChange` already knows the wake time. The 2026-10-05 measurement shows p95 frame passes at both sizes (16.7 to 16.8 ms) and the miss is style recalc, so these caches have no measured pressure yet. Memoizing `RoomDecor` was measured on 2026-10-05 and gave no gain, so it was removed from the cache list.

**Effort:** M
**Priority:** P3
**Depends on:** T04 Row-change style recalc at 24 agents over budget (2026-10-05); T02 M10 browser pass (the M10 timings gate this)

### T37 Hooks adapter: ring, machine and hook semantics to align

**Area:** Pre-landing review follow-ups (2026-10-04, /ship cycle 1)

**What:** (1) DONE in the PR review fixes: a hook `SubagentStop` `done` now walks the child out in the machine. (2) The ring clears `openTools` and the sync-launch wait marker on `needs_attention` (`server/feed-plugin.ts:749`) while the machine's `enterExact` does not: clear them only for the heuristic question `done`. (3) Hook-only agents have no tailer file, so nothing retires them from the ring (`server/feed-plugin.ts:1034`): add a TTL or ignore hook events for sessions the tailer does not track. (4) `PermissionRequest` and `Notification(permission_prompt)` hash different episode ids (hook name is in the hash), so both firing would supersede and re-announce; part of "Make the hooks attention mapping exact".

**Why:** Red-team findings from the /ship review; each is a live-versus-replay or lifecycle gap, none reproduced end to end.

**Context:** See `.claude/scratch/todo-burndown/DECISIONS.md` D35 to D37 for the rules the machine and ring already share.

**Effort:** M
**Priority:** P3
**Depends on:** The user's interactive hook probe

### T38 Adversarial review leftovers (2026-10-04)

**Area:** Pre-landing review follow-ups (2026-10-04, /ship cycle 1)

**What:** (1) `hooks/install.mjs` writes `async: true` and a `node '<path>'` command resolved through PATH: if Claude Code is started from a GUI with a minimal PATH, every hook event exits 127; consider the absolute `process.execPath` (or document it). Whether `async` is honoured is unverified (the probe). (7) The installer is a read-modify-write on `~/.claude/settings.json` (another writer between read and rename loses its update) and `.bak-<stamp>` backups accumulate unpruned with a full copy of the settings. (8) The 400 ms script deadline covers node cold start, stdin and the round trip; a dropped `needs_attention` leaves no trace on either side: add a server-side counter of received hooks per minute. Item numbers are from the original list; (2) to (6) are done.

**Why:** Native adversarial review (/ship Step 11). Its top finding (late transcript activity erasing a live exact attention because the guard compares the receipt clock) was refuted: `applyOwned` uses `clock = Math.min(event.ts, now)` in live and replay and `src/office/machine.test.ts` covers needs_attention@10000 followed by a tool start@9900.

**Context:** All skipped by the user's choice (/ship D4).

**Effort:** M
**Priority:** P3
**Depends on:** The user's interactive hook probe (items 1 and 8)

## P4 available (6)

### T39 Paper label dismiss (2026-10-06)

**Area:** Office

**What:** The paper label cannot be dismissed with Escape (WCAG 1.4.13); revisit if a keyboard user needs it.

**Why:** Eng review R2 chose a CSS-only reveal like `.hit:hover + .tag` in `scene.css`; design review issue 10 documented the deviation in DESIGN.md instead of fixing it. Touch is out of scope (DESIGN.md Accessibility; design issue 8), so the earlier iOS Safari tap check is dropped.

**Pros:** Closes the one accessibility gap. **Cons:** Needs JS state for a label the name tags do without.

**Context:** Plan: `docs/designs/paper-hover-text-ceo-review.md` (R2, R3, design issue 10). Revisit together with the name tags, not alone.

**Effort:** S (human ~1h / CC ~10min)
**Priority:** P4
**Depends on:** None (the paper label shipped in v0.9.0.0)

### T40 Desk status light

**Area:** Office life (make the room feel alive) / Deferred from the Office life CEO review (2026-10-02)

**What:** A small lit dot on each desk: amber while the agent waits, green while it works, off when idle.

**Why:** Waiting is visible at a glance at 50% scale, where tags and bubbles are small.

**Context:** A fourth waiting cue next to ring, bubble and tag wave (DESIGN 8B), so check it adds value. Draw it as a CSS overlay beside the V3 screen overlay, positioned from the desk-kind table. Token colors only; the green may need a new art token. Steady, not pulsing, under reduced motion.

**Effort:** S (human ~3h / CC ~20min)
**Priority:** P4
**Depends on:** V6, V3

### T41 Decor variety and the 1-row room

**Area:** Office life (make the room feel alive) / Decor follow-ups (2026-10-05)

**What:** (1) The 3 decor palette variants are one color rotation of the same shapes; they could differ in shape (book heights, picture layout). (2) The 1-row room has no bookshelf or pictures because its left wall is too short.

**Why:** More daily variety and a less bare 1-row room.

**Context:** Shipped in the office-decor branch (D4: left wall past the window, shelf from 2 rows, pictures from 3 rows). Keep tokens only, no text, and the decor tier below shirts (DESIGN.md "Visual weight order").

**Effort:** S
**Priority:** P4
**Depends on:** None

### T42 Category label on the subagent's character (2026-10-06)

**Area:** Office

**What:** Show the paper's closed-enum category (from `subagent_type`) as a small label near the subagent's own tag.

**Why:** Deferred at the paper-hover-text CEO review (D6): makes the label glanceable without hovering a small paper.

**Context:** Needs overlap nudging against tags, bubbles and queue marks and a design pass (DESIGN "Visual weight order"). Do it only after the paper label ships and people miss it.

**Effort:** M
**Priority:** P4
**Depends on:** None (the paper label shipped in v0.9.0.0)

### T43 Paper tray count on desks

**Area:** Office life (make the room feel alive) / Deferred from the Office life CEO review (2026-10-02)

**What:** A tray on each desk fills with up to 3 sheets as the session's subagents return.

**Why:** A persistent sign of how much finished subagent work a parent got back.

**Context:** New per-session counter in `src/office/machine.ts`, rebuilt from the snapshot replay so a reload keeps it; the tray slot is one more entry in the V6 desk-kind table. Check resumed sessions and resets so the count cannot disagree with reality.

**Effort:** M (human ~1 day / CC ~40min)
**Priority:** P4
**Depends on:** V2, V6

### T44 Floor robot patrol

**Area:** Office life (make the room feel alive) / Deferred from the Office life CEO review (2026-10-02)

**What:** A small pixel robot slides along a seeded lane in the aisle, parked under reduced motion.

**Why:** Ambient motion when every agent is still.

**Context:** CSS-only motion so no animation loop runs. The lane must stay clear of desks (`deskFootprint` in `room.ts`), and the free aisle changes as V9 adds rows, so decide the lane after V9. Stack by feet like floor props (`floorProp` in `Scene.tsx`).

**Context:** Built and deferred 2026-10-05 at design gate 6A. A 10x7-cell robot (the only size that stays clear of every `deskFootprint` along the front-right floor edge at rows 1 to 6, per the eng review probe) reads as a ~12x9 px grey box at 50% and a grey rectangle at 100%. Options when revisited: a bigger robot needs a lane that is not on the front-right margin (for example a deliberately designed aisle), a different silhouette, or a different ambient creature. Build reports: `.claude/scratch/office-decor/reports/builder-05.md`.

**Context:** The robot dock (X2) was deferred with it.

**Effort:** M (human ~1 day / CC ~40min)
**Priority:** P4
**Depends on:** V9

## P4 blocked (1)

### T45 Dev perf HUD in ?art (2026-10-05)

**Area:** Office life (make the room feel alive) / Office life follow-ups from the 0.3.0.0 /ship review (2026-10-03)

**What:** DEV-only overlay in `?art` showing the last row-change recalc ms and the live DOM element count.

**Why:** Live feedback while tuning containment, and for the M10 Safari pass.

**Context:** Deferred from the 2026-10-05 perf review (X5); the trace attribution in `e2e/release.ts perf` gives the numbers first.

**Effort:** S
**Priority:** P4
**Depends on:** T04 Row-change style recalc at 24 agents over budget (2026-10-05); T02 M10 browser pass (the M10 timings gate this)
