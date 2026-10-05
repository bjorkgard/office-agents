# TODOS

## Feed

## Office

### Paper hover-text with redaction

**What:** Hover or click a handoff paper to read the subagent description and a truncated result summary.

**Why:** Makes the paper carry real data, the main differentiator from existing agent-office visualizers.

**Context:** Deferred from slice 1 (D2). Pros: strongest "whoa" beyond the animation. Cons: privacy surface, needs redaction, truncation and a tooltip layer. Subagent `.meta.json` holds `description`; prompt text is in the first record of `agent-*.jsonl`. Start with description only. Prompts can contain file contents and secrets, so decide redaction before showing anything.

**Effort:** M (human ~1 day / CC ~30min)
**Priority:** P3
**Depends on:** Slice 1 handoff animation

### Opt-in attention chime

**What:** Soft chime when a new agent starts waiting, toggled by a speaker control in the top bar, off by default.

**Why:** Reaches you while the office tab is hidden or you are not looking at the screen.

**Context:** Deferred from the design review (D6). Tab-title count `(N) Agent Office` ships first. Pros: audible attention without staring. Cons: adds a control; browsers block audio until one user click. Reuse the aria-live waiting event as the trigger.

**Effort:** S (human ~3h / CC ~20min)
**Priority:** P4
**Depends on:** Attention list (top bar) and tab-title count

### Share character drawings via symbols

**What:** Draw each character pose once per hair style as a shared SVG symbol and place it with `<use>`, as the desk is after the Phase 4 eng review (R5).

**Why:** Measured 2026-10-02: one character is 785 to 867 DOM elements (about 40 KB); after the desk is shared, 12 agents are still about 10,000 elements and 24 agents about 20,000.

**Context:** Only worth doing if M10 timings (12 and 24 agents in Chrome and Safari) show jank. Must keep pose swap (`nextDisplayed`, D10) and `--shirt`/`--shirt-stripe`/`--hair`/`--skin` theming working: custom properties set on the `<use>` element inherit into the shared tree. Start from `src/office/CharacterRig.tsx`.

**Effort:** M (human ~1 day / CC ~45min)
**Priority:** P3
**Depends on:** Bubble layout and hit-area spacing (M9) and the M10 profiling timings

## Office life (make the room feel alive)

The nine office-life updates V1 to V9 shipped in v0.3.0.0 (see ARCHIVE.md). What remains is below.

### Office life follow-ups from the 0.3.0.0 /ship review (2026-10-03)

Skipped by the user at ship time; each is informational and has a file reference.

#### M10: browser pass for row growth and the eased fit

**What:** In Chrome and Safari at 12 and 24 agents, write down frame timings, Recalculate Style cost of a row change, Safari hit area at 50% scale, and tag, bubble and hit-area alignment during the ease. Record the numbers in DESIGN.md.

**Why:** The plan requires the numbers before row growth is called done; nobody measured them (the /ship run accepted this risk).

**Context:** Overlay positions use registered `--fit-*` custom properties, transitioned in `scene.css` (`.scene-overlay`). Also check the 5 s test timeouts under load, and the D4 style-sheet passes (24-agent room, grayscale, shadows-off) in `?art`.

**Effort:** S (human ~1h)
**Priority:** P1
**Depends on:** None

#### Row-change style recalc at 24 agents over budget (2026-10-05)

**What:** Find what a settled 24-agent row insertion restyles and cut it. At 12 agents the large miss is fixed (the 12-agent gate is unstable near the line, with one failing run in four, and has no owner yet): the inherited `--scale` property is gone and the worst style-recalc event went from an old burst figure of about 48 ms to a median worst event of 14.7 to 17.3 ms over four runs (different metrics, budget 16 ms). The 12-agent gate sits on the 16 ms line and can flip between runs: medians 14.9, 14.7, 15.6 and 17.3 ms, the last with repeats 17.3/14.8/22.2 ms. At 24 agents the settled median is still 19.1, 19.5, 19.3 and 22.6 ms (headless Chrome, M1 Max, `vp run perf`, 4 runs; fourth run repeats 19.6/22.6/34.2 ms). The fourth run overlapped with other work on the machine (review agents and an e2e run just before it), so it is noisier. The per-repeat line now prints the worst event's offset after the write; comparing it with the printed 'row appeared' time, in that run the worst 12-agent events fell within 50 ms of the new row appearing, while the 24-agent ones fell 17 to 280 ms before it, so at the time the 24-agent cost looked untied to one step (superseded, see the 2026-10-05 gate note below). The cause was unknown then.

2026-10-05, after the decor changes: 12 agents now sits at the 16 ms line (15.8 to 16.1 ms vs 13.7 to 14.6 ms before, 3 runs each), 24 agents is unchanged (19.7 to 21.2 ms vs 19.8 to 21.4 ms). A `RoomDecor` memo was tried the same day and gave no gain (reverted).

2026-10-05, new gate (6 repeats, 3 runs): 12 agents PASS with medians 14.6, 13.5 and 15.1 ms (the last marginal); 24 agents FAIL with medians 21.3, 20.6 and 18.9 ms. `perf --ab` showed animations are not the cost: animations off was 4.3 to 6.2 ms slower in every run (24 agents: 19.4 to 19.9 ms on, 24.1 to 24.8 ms off), with a confound, since `animation: none` also removes walk-in and desk-pop and so changes the mount workload. The worst 24-agent event is the insertion's own mount recalc in all 6 repeats of each run; it restyles about 9.6k elements at both 12 and 24 agents (a fresh page restyles about 3.2k) and was detected about 270 ms late by polling, which explains the earlier "events before the row appeared".

**Why:** Decision D8 of phase-6-finish: a missed budget is a dated entry, not a release block. p95 frame time passes (16.7 to 16.8 ms against 20 and 33 ms).

**Exit rule (2026-10-05 perf review, D8-A):** if the 24-agent median is still above 16 ms after the trace attribution and a `contain: layout style` probe, record the measured median and cause in DESIGN.md as a dated exception (24-agent budget = measured median + 10%), keep 12 agents at 16 ms. Numbers and method are in DESIGN.md "Performance". Next step: invalidation-tracking trace (what invalidates ~9.6k elements on row add). Safari is not measured.

**Effort:** M
**Priority:** P1
**Depends on:** None

#### Dev perf HUD in ?art (2026-10-05)

**What:** DEV-only overlay in `?art` showing the last row-change recalc ms and the live DOM element count.

**Why:** Live feedback while tuning containment, and for the M10 Safari pass.

**Context:** Deferred from the 2026-10-05 perf review (X5); the trace attribution in `e2e/release.ts perf` gives the numbers first.

**Effort:** S
**Priority:** P4
**Depends on:** Row-change style recalc at 24 agents over budget (2026-10-05)

#### Perf runner deadline for `perf --ab`

**What:** Add a total and per-repeat deadline to the perf runner so a hung page cannot stall `perf --ab`.

**Why:** `perf --ab` runs about 24 sequential browser sessions, so a single hang can stall it for 20+ minutes in the worst case.

**Context:** Deferred from the 2026-10-05 /ship review.

**Effort:** S
**Priority:** P3
**Depends on:** None

#### Strict mode for INCONCLUSIVE perf verdicts

**What:** Add an opt-in strict mode that exits with a distinct code when a perf verdict is INCONCLUSIVE.

**Why:** INCONCLUSIVE exits 0 today (approved gate design), which a CI calling `perf` would read as a pass.

**Context:** Deferred from the 2026-10-05 /ship review. No workflow calls `perf` today, so this only matters once one does.

**Effort:** S
**Priority:** P3
**Depends on:** None

#### Frame cost and caches in the break and paper code

**What:** Cache per-cycle trip segments so a waiting parent builds its timeline once per frame (`choreo.ts:381`), evict one plan instead of clearing all (`breaks.ts:112`), group subagents by session once (`paper.ts:139`), and memoize `DeskLayer` and `RoomShell` (`Scene.tsx:300`).

**Why:** Avoids garbage and re-render work with 24 waiting parents; unmeasured, so do it only if M10 shows pressure.

**Context:** `settled` also keeps a rAF loop for the first 2 s of idle (`motion.ts:183`); `nextChange` already knows the wake time. The 2026-10-05 measurement shows p95 frame passes at both sizes (16.7 to 16.8 ms) and the miss is style recalc, so these caches have no measured pressure yet. Memoizing `RoomDecor` was measured on 2026-10-05 and gave no gain, so it was removed from the cache list.

**Effort:** M
**Priority:** P3
**Depends on:** Row-change style recalc at 24 agents over budget (2026-10-05)

#### Reload-stable breaks and spot assignment

**What:** A tool result resets `openTools[*].startedAt` (`machine.ts:252`) and coffee spots go out in key order on reload (`motion.ts:141`), so a reload can land mid-wait on a different break point. Record a stable `waitSince` on the agent and pick spots in that order.

**Why:** The design promises that a reload resumes the same schedule.

**Context:** Cosmetic and rare. Also: a very old transcript timestamp fills up to about 100,000 plan cycles inside render and stops breaks past the 30-day clamp (`motion.ts:93`, `breaks.ts:88`).

**Effort:** M
**Priority:** P3
**Depends on:** None

#### Clock and room robustness

**What:** After a backward wall-clock step, `stepRowHold` keeps extra rows (`scene-model.ts:132`) and `desk-pop` stays on (`Scene.tsx:213`): reset `since` when `now < since`. A subagent first seen at `DESK_CAP` stays queued for life (`choreo.ts:159`), the desk clamp draws an out-of-range desk on the last desk (`scene-model.ts:153`), and seat indexes above 24 still grow the room (`scene-model.ts:86`). Cap `?seed` length in `main.tsx` (DEV only). Fix the stale `assignWorkDesks` doc, "rooms never grow" (`choreo.ts:135`).

**Why:** Edge cases and doc drift from the final /ship review passes.

**Context:** Also in this group: resize rebuilds geometry and restarts every character loop (`Scene.tsx:214`, key the geometry on rows only), the scene height snaps while content eases on shrink (`Scene.tsx:446`), the desk paper blinks if a new span starts mid-fade (`DeskLayer.tsx:111`), and `@property`-less browsers snap the overlay while the room eases (`scene.css:19`).

**Effort:** M
**Priority:** P3
**Depends on:** None

#### Stronger tests for the office-life items

**What:** Slat geometry test is presence-only (`decor.test.ts:539`), overflow test does not assert standing and queue slots (`Scene.test.tsx:546`), loose `+1` match (`Scene.test.tsx:145`), tautological counter (`motion.test.ts:451`), DST tests skip under UTC, heavy Scene renders risk the 5 s timeout, and Scene's `layout.box`, desk pop-in and the rAF loop wiring have no direct test. A browser test for the `Character` loop would close the last two.

**Why:** Several tests would still pass if the thing they name broke.

**Context:** Repo-wide sweep: run /test-audit. `overlayPoints` is now a test oracle only (`motion.ts`); test `overlayCalc` output directly.

**Effort:** M
**Priority:** P3
**Depends on:** None

### Deferred from the Office life CEO review (2026-10-02)

#### Per-tool-kind screen content (follow-up to V3)

**What:** Screens show what the agent is doing (read, edit, shell, search) instead of one generic animation.

**Why:** A glance tells reading from editing from running a shell.

**Context:** `shared/events.ts` carries only a tool id and `isSubagent`, by the privacy rule. Needs a closed enum kind (read, edit, shell, search, other) mapped in `server/normalize.ts` from the tool name (the raw name never leaves the server; see "Fixture id salt and tool-name allowlist"), the `parseAgentEvent` spec, fixtures, a leak test, and four screen variants in the V3 overlay. The hooks adapter could supply the kind instead.

**Effort:** M (human ~1 day / CC ~40min)
**Priority:** P3
**Depends on:** V3

#### Idle fillers at the desk (follow-up to V5)

**What:** A waiting parent seated between breaks stretches, looks around, sips from the mug or checks a phone.

**Why:** The seated parent keeps moving between coffee trips.

**Context:** 2 to 4 new seated frames drawn by hand in `src/office/sprites.ts` (the grid generator is not in the repo), wired through `poses.ts`, `swap.ts`, `loopOf` in `Character.tsx` and `art.test.ts`. The sip filler can reuse the V7 drink prop.

**Effort:** M (human ~1 day / CC ~45min)
**Priority:** P3
**Depends on:** V5, V7

#### Desk status light

**What:** A small lit dot on each desk: amber while the agent waits, green while it works, off when idle.

**Why:** Waiting is visible at a glance at 50% scale, where tags and bubbles are small.

**Context:** A fourth waiting cue next to ring, bubble and tag wave (DESIGN 8B), so check it adds value. Draw it as a CSS overlay beside the V3 screen overlay, positioned from the desk-kind table. Token colors only; the green may need a new art token. Steady, not pulsing, under reduced motion.

**Effort:** S (human ~3h / CC ~20min)
**Priority:** P4
**Depends on:** V6, V3

#### Paper tray count on desks

**What:** A tray on each desk fills with up to 3 sheets as the session's subagents return.

**Why:** A persistent sign of how much finished subagent work a parent got back.

**Context:** New per-session counter in `src/office/machine.ts`, rebuilt from the snapshot replay so a reload keeps it; the tray slot is one more entry in the V6 desk-kind table. Check resumed sessions and resets so the count cannot disagree with reality.

**Effort:** M (human ~1 day / CC ~40min)
**Priority:** P4
**Depends on:** V2, V6

#### Floor robot patrol

**What:** A small pixel robot slides along a seeded lane in the aisle, parked under reduced motion.

**Why:** Ambient motion when every agent is still.

**Context:** CSS-only motion so no animation loop runs. The lane must stay clear of desks (`deskFootprint` in `room.ts`), and the free aisle changes as V9 adds rows, so decide the lane after V9. Stack by feet like floor props (`floorProp` in `Scene.tsx`).

**Context:** Built and deferred 2026-10-05 at design gate 6A. A 10x7-cell robot (the only size that stays clear of every `deskFootprint` along the front-right floor edge at rows 1 to 6, per the eng review probe) reads as a ~12x9 px grey box at 50% and a grey rectangle at 100%. Options when revisited: a bigger robot needs a lane that is not on the front-right margin (for example a deliberately designed aisle), a different silhouette, or a different ambient creature. Build reports: `.claude/scratch/office-decor/reports/builder-05.md`.

**Context:** The robot dock (X2) was deferred with it.

**Effort:** M (human ~1 day / CC ~40min)
**Priority:** P4
**Depends on:** V9

### Decor follow-ups (2026-10-05)

#### Decor variety and the 1-row room

**What:** (1) The 3 decor palette variants are one color rotation of the same shapes; they could differ in shape (book heights, picture layout). (2) The 1-row room has no bookshelf or pictures because its left wall is too short.

**Why:** More daily variety and a less bare 1-row room.

**Context:** Shipped in the office-decor branch (D4: left wall past the window, shelf from 2 rows, pictures from 3 rows). Keep tokens only, no text, and the decor tier below shirts (DESIGN.md "Visual weight order").

**Effort:** S
**Priority:** P4
**Depends on:** None

#### Door opens for only some live arrivals (arrivedAt is the transcript time)

**What:** Time a subagent's arrival from when the page receives its first event, not from the transcript line's timestamp, so the door-ajar window and the walk-in start on screen.

**Why:** Found at /ship (2026-10-05). `applyOwned` uses `Math.min(event.ts, now)` as the clock for live events (`src/office/machine.ts:296`), so `arrivedAt` is the line's ts. A subagent's transcript is a new file that the server finds on its 5 s tree walk (`server/feed-plugin.ts:30`, `:677`), so the event reaches the page 0 to 5 s late. The 1.2 s door window (`DOOR_TUNING.ARRIVE_OPEN_MS`, `paper.ts`) is then already over at first paint, and the walk-in starts partway along its path. Measured in the e2e walk-in fixture: arrivedAt 2800 ms before first render, door never open; in `?demo` (events stamped at send time) the door opens every time. Estimated from that lag spread, about a quarter of live arrivals show the door; a reload mid-arrival never does.

**Context:** Proposed fix (debugger report, `.claude/scratch/office-decor/reports/debugger-17.md`): at `machine.ts:141` pass `now` (receive time) to `arrive` for `arrivedAt`, keep `lastEventAt` and tool clocks on the event clock; replays already pass `min(ts, now)` as `now`. Fixes the door, the mid-path walk-in and the paper timing together. Risks: machine tests that expect a live `arrivedAt` to equal ts, subagent ordering by arrivedAt (`choreo.ts:153`, `scene-model.ts:190`), and an old file found late on a live walk would now walk in at receipt time. Re-verify with `vp test`, the e2e walk-in and reduced-motion specs and a `[data-door]` observer run. Also check whether the hooks adapter reports subagents sooner.

**Effort:** M
**Priority:** P2
**Depends on:** None

#### Review polish from the 0.7.0.0 ship (2026-10-05)

**What:** Informational items the /ship reviews raised and the user skipped: stale or opaque comments (`props.ts:373` shadow paragraph, `ArtSheet.tsx:644`, `room.ts:253` "parallelogram", `paper.ts` "decision 2B" and "D3" references and the skip-rule invariant); unused exports (`DISPENSER_SHADOW`, `COFFEE_SHADOW`, `BOOKSHELF_SHADOW`, `PICTURE_LIFT`, `DECOR_VARIANTS` outside tests); `PixelShadow` could reuse `pathOf`; `decorVariantGrid` hardcodes `% 3` and `v * 2` instead of deriving them from `DECOR_VARIANTS`; ArtSheet Legibility row is on `--bar` instead of `--bg`, and DESIGN.md's decor sentence should name the Legibility row; a `PROP_SHADOW_AT` placement test; reset the seed override in `decor.test.ts` `afterEach`; test pins for the `MAX_RUNS` boundary and the `GAP_MS` edge in `paper.test.ts` and a softer "verbatim" oracle comment; random schedules without `ctx.resume` or null ctx.

**Why:** None is a defect; each makes the code or tests a little clearer.

**Context:** Also from the adversarial passes (all low, unreachable today): `doorOpenFor` returns CLOSED with `nextChange: null` after `MAX_RUNS` (64) runs, about 150 s of unbroken door traffic, which would lose a timer wake; `subagentDoorAt` and `subagentPath` use different fallbacks if a leaver ever had `leftAt === null` (`machine.ts:220` always sets it); `PixelDecor` keys its runs cache by the raw variant; a leaver whose `leftAt` is in the future adds no door window and no wake; the `decorDay` cache can be stale for up to a day after a timezone change; module caches go stale under Vite HMR in dev. Simplification advisories to weigh against these: drop `MAX_RUNS` or the ended-window skip, drop the cache layers, build `DOOR_AJAR` rows with `Array.from`, one `DecorProp` type. Also: the e2e visual baseline pins `decor=0` but not the door state (check the 4-agent fixture has no live-stamped subagent). Leaf-level memoizing of the decor components shipped; the 12-agent row-change recalc sits at the 16 ms line (`Row-change style recalc` entry above).

**Effort:** S
**Priority:** P3
**Depends on:** None

## Feed hardening

### Verify the normalizer against real transcripts

**What:** Run server/sanitize-fixtures.ts on a few real Claude Code transcripts (sync, async, resume) and check the output events against the committed fixtures.

**Why:** The fixtures are hand-built from a described shape; a real-file drift would go unseen until a user hits it.

**Context:** Found in the Phase 2-3 /ship review. Keep the leak check green on every new fixture.

**Effort:** S (human ~1h / CC ~15min)
**Priority:** P1
**Depends on:** None

### Compensate for a dropped oversized tool_result line

**What:** A tool_result line over READ_CAP_BYTES is dropped, so its tool end and handoff never arrive.

**Why:** The agent keeps showing a running tool or an open handoff.

**Context:** Needs a compensating event or size data from real transcripts. Found in the Phase 2-3 /ship review.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P2
**Depends on:** Verify the normalizer against real transcripts

### Validate id format in parseAgentEvent

**What:** Reject ids that do not match a conservative pattern (length and character set).

**Why:** Ids flow into keys, logs and the DOM later; today any non-empty string passes.

**Context:** Add after the id formats of real transcripts are confirmed (see the real-transcript item).

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P2
**Depends on:** None

### Feed performance pass

**What:** Serial lstat of stale files every 5 s; per-second poll of idle files; cold start blocks the first scan; batch SSE writes; ring uses Array.shift and has no global cap; structuredClone per event and a clone in tick when nothing changed.

**Why:** None bites at a handful of sessions; each grows with transcript count.

**Context:** Measure with a few hundred files before changing anything. Files: `server/feed-plugin.ts`, `src/office/machine.ts`.

**First step (deferred from the 2026-10-05 perf review, X4):** write a fixture generator (300+ transcript files) and a timing script for cold start, the 5 s stale-file lstat walk and the per-second idle poll. Do it after the two P1 perf items land.

**Effort:** M (human ~1 day / CC ~30min)
**Priority:** P2
**Depends on:** None

### parentAgentId is null for first-level subagents

**What:** Since batch A the normalizer fills `parentAgentId` only for nested subagents (a subagent launching a subagent). A top-level parent has no agentId, so first-level subagents still get null. Also the parent lookup in `server/feed-plugin.ts` (`stateFor`) ignores projectId, and a launcher whose path sorts after its child returns null.

**Why:** The machine and UI cannot draw a parent link from the event alone; they rely on handoffs.

**Context:** Decide what `parentAgentId` means for a top-level parent (its session id?) before changing `shared/events.ts`, or fill it from the hooks adapter. Real nested subagents unseen in the sanitized sample.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P3
**Depends on:** None

### Key sessions by filename, not record sessionId, for resumed sessions

**What:** Resumed sessions may carry a different `sessionId` in their records than the file name.

**Why:** Two files could collapse into one agent, or one agent split across two.

**Context:** Verify against real transcripts first (see the real-transcript item).

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P1
**Depends on:** Verify the normalizer against real transcripts

### identityFor covers only 24 identities

**What:** `src/office/identity.ts` `identityFor` has 24 identities.

**Why:** The 25th concurrent agent reuses an identity, so two desks look the same.

**Context:** Decide in Phase 4 whether to extend or accept repeats.

**Effort:** S (human ~1h / CC ~10min)
**Priority:** P3
**Depends on:** BUILD_TODO 4.4

### Batch B2 leftovers (2026-10-04)

**What:** (1) A unix socket swapped in for a transcript is not refused at once: on macOS opening it fails with errno -102, which takes the transient-retry path for up to 5 scans before denial (`server/feed-plugin.ts:329`). (2) A same-size in-place rewrite is not detected as rotation (the head is re-read only when the file grew). (3) No test checks that the read handle is closed on every reject path. (4) `server/sanitize-fixtures.ts`: the CLI rejects an empty salt, so committed unsalted fixtures reproduce only via the library; `--salt` is only recognised as the first argument. (5) `needs_attention` now clears `openTools` and `waiting` in the ring (`feed-plugin.ts:729`), latent until the hooks adapter emits it; and a resumed asker's question `done` leaves the snapshot.

**Why:** Informational findings from the round-1 refuter pass; none blocks.

**Context:** Linux errno for a socket open is ENXIO, untested. Ring eviction scans all agents when full of askers (O(N), fine at the 2000 cap).

**Effort:** S
**Priority:** P3
**Depends on:** None

## Phase 4 review follow-ups

### Feed server hardening: truncation detection and tracked-file cap

**What:** In `server/feed-plugin.ts`: truncation is detected only as `size < offset` (see "Detect file rotation by more than size"), and there is no cap on tracked files. Also refuse `Forwarded:` (RFC 7239) and `X-Real-IP` like X-Forwarded-*.

**Why:** A hostile or odd file set can grow memory and scan time without bound.

**Context:** Split from the Phase 4 umbrella item; session identity, Origin check and heartbeat are DONE (see ARCHIVE.md).

**Effort:** S (human ~2h / CC ~20min)
**Priority:** P3
**Depends on:** None

### Render cost: per-frame setState, idle tick clone, overlay ref churn

**What:** Every SSE frame and every skipped frame sets state and renders the scene. `tick` in `src/office/machine.ts` clones the whole state on idle ticks. `bindOverlay` in `Scene.tsx` returns a new ref callback each render.

**Why:** Churn grows with agent count and event bursts; measured scale (12 agents, about 28k SVG elements) is acceptable today.

**Context:** Coalesce frames per animation frame, run a cheap "anything due" check before cloning, cache ref callbacks. Deferred by the user in the Phase 4 /ship review.

**Effort:** M (human ~4h / CC ~30min)
**Priority:** P3
**Depends on:** None

### Small simplifications left in Phase 4 files

**What:** `ReportingBoundary` subclass in `src/App.tsx` (give `ErrorBoundary` an `onError` prop instead), `viewportOf` in `app-logic.ts`, `nextAnnouncement` in `topbar-logic.ts`, the repeated render calls in `src/main.tsx`, and two clocks (15 s in App, 60 s in TopBar) that can show different wait times.

**Why:** Less code and one source of truth for the wait label.

**Context:** Advisory items from the Phase 4 /ship review, skipped by the user.

**Effort:** S (human ~2h / CC ~20min)
**Priority:** P3
**Depends on:** None

## Demo mode

### Demo mode for the README and first run

**What:** `?demo` already exists (`src/office/demo.ts`, `src/main.tsx:41`) but is dev only and scripted. What is missing is a fixture replay for the live feed: play recorded transcript fixtures through the real feed source so the office can be shown from a production build without real Claude Code sessions.

**Why:** Deferred from phase-6-finish (decision D5); the README picture comes from `vp run hero` with a temporary feed instead.

**Context:** The demo module is excluded from `dist/` on purpose (marker `__OFFICE_DEMO__`), so a production replay needs its own path.

**Effort:** S
**Priority:** P3
**Depends on:** None

## Hooks adapter follow-ups (2026-10-04)

### Make the hooks attention mapping exact, then retire the heuristics

**What:** Run the interactive hook probe (a real `claude` session with `--settings <temp file>` and a logging hook that records field names and ids only) to learn which hook events fire for a permission prompt, an `AskUserQuestion` and an idle wait, and whether `matcher: ""` and `async: true` behave as assumed. Then fix the `HOOK_EVENTS` table in `server/hooks-adapter.ts`, make the episode id independent of the hook name if two hooks fire for one prompt, and decide whether the `dec-R1` and `dec-R2` heuristics in `src/office/machine.ts` can be suppressed for agents with exact signals.

**Why:** The mapping for `PermissionRequest` and `Notification` types is tolerant but unverified; a headless `claude -p` run fires neither, and the agent-driven interactive probe was denied by the auto-mode classifier. The subagent mapping is verified (the hook `agent_id` equals the `agent-<id>.jsonl` id).

**Context:** `.claude/scratch/todo-burndown/FINDINGS.md` ("Hook probe") has the facts and the exact probe command. Both hooks firing for one prompt would announce twice (episode id includes the hook name).

**Effort:** S (human ~30min / CC ~20min)
**Priority:** P2
**Depends on:** The user running the probe

### Hooks adapter leftovers

**What:** (1) A hook payload over 256 KB (a huge `PermissionRequest` `tool_input`) is dropped whole, so that attention signal is lost; a reused pid sends the token to whatever listens on that port. (2) Installer: a failed rename leaves a `.<name>.<pid>.tmp` with the full settings; two runs in the same millisecond overwrite each other's backup; rename breaks hard links; apply then remove normalises the user's empty event arrays away; `echo /x/office-hook.mjs` counts as ours. (3) Hook discovery: both dev servers (5173 and 5199) use the default `~/.office-agents` dir, so the last writer wins; after SIGKILL a stale `hook.json` stays (the script checks the pid). (4) The `returnedSeen` ring set is never cleared, so a relaunched child with the same agent id would be dropped. (5) Machine: live and replay can still differ on hold-check versus tick timing and on a repeated `episodeId` after an idle exit; only the latest exact episode id per agent is remembered; the clamp accepts `waitingSince: 1`; an upgrade can reorder the attention list by since-time. (6) Not tested: a Windows host, real hook arrival latency.

**Why:** Informational findings from the step 6 refuter passes; none blocks.

**Context:** Reports in `.claude/scratch/todo-burndown/reports/refuter-17.md`, `-21.md`, `-26.md`, `-28.md`, `-31.md`, `-33.md`.

**Effort:** M
**Priority:** P3
**Depends on:** None

## Pre-landing review follow-ups (2026-10-04, /ship cycle 1)

### Hooks adapter: ring, machine and hook semantics to align

**What:** (1) DONE in the PR review fixes: a hook `SubagentStop` `done` now walks the child out in the machine. (2) The ring clears `openTools` and the sync-launch wait marker on `needs_attention` (`server/feed-plugin.ts:749`) while the machine's `enterExact` does not: clear them only for the heuristic question `done`. (3) Hook-only agents have no tailer file, so nothing retires them from the ring (`server/feed-plugin.ts:1034`): add a TTL or ignore hook events for sessions the tailer does not track. (4) `PermissionRequest` and `Notification(permission_prompt)` hash different episode ids (hook name is in the hash), so both firing would supersede and re-announce; part of "Make the hooks attention mapping exact".

**Why:** Red-team findings from the /ship review; each is a live-versus-replay or lifecycle gap, none reproduced end to end.

**Context:** See `.claude/scratch/todo-burndown/DECISIONS.md` D35 to D37 for the rules the machine and ring already share.

**Effort:** M
**Priority:** P3
**Depends on:** The user's interactive hook probe

### Feed plugin: split the hook route and tighten small spots

**What:** `server/feed-plugin.ts` is past 1,200 lines: move the hook route (`handleHook`, `readHookBody`, `hookAdmit`, `ingestHook`) into `server/hook-route.ts` like `hooks-adapter.ts` and `hook-discovery.ts`. The `Req.on` type was widened to `(event: string, cb: (arg: Buffer) => void)` (`:849`): use overloads for `close`, `data`, `end`, `error`. `hookSessions` evicts by insertion order, not recency (`:1014`): delete before set. `replaced()` re-opens, reads and hashes the file head on every scan for every grown file (`:556`): skip unless size shrank or the inode changed, or read the head on the same handle. `hookSessionCount` and several `HOOK_*` exports exist only for tests. The SIGINT handler re-raises unconditionally (`:1237`); verified fine for `vp dev` (refuter-21) but would double-run other plain listeners. `hooks/install.mjs:225` writes the settings temp file without `O_EXCL`/`O_NOFOLLOW` (needs write access to `~/.claude`, low impact).

**Why:** Maintainability, performance and security informational findings; none is a defect today.

**Context:** Advisory simplifications also listed: drop the redundant `chmodSync(tmp, 0o600)` in `server/hook-discovery.ts`, share one `reject(code)` closure in `readHookBody`, validate the root before `mkdtempSync` in `e2e/release.ts` `startOffice`.

**Effort:** M
**Priority:** P3
**Depends on:** None

### sanitize-fixtures CLI usability

**What:** `server/sanitize-fixtures.ts:179`: the default became a random per-run salt, so the committed fixtures can only be reproduced through the library function; an empty `OFFICE_FIXTURE_SALT` exits 2 with only the usage message; `--salt` is only recognised as the first argument. Document which salt regenerates the committed fixtures, treat an empty env var as unset, and parse flags anywhere.

**Why:** api-contract findings from the /ship review.

**Context:** Related to "Batch B2 leftovers" item 4.

**Effort:** S
**Priority:** P3
**Depends on:** None

### Review cycle 2 leftovers (2026-10-04)

**What:** (1) `server/feed-plugin.ts:7` header says every SSE frame is a `data:` JSON line; add the `: ping` comment frame and the token-gated `POST /__office/hook` route. (2) `server/feed-plugin.ts:58` the `HOOK_ROUTE` export sits between the body-cap comment and its constants; move it. (3) `hooks/office-hook.mjs:30` `MAX_VALUE = 512` is tied to `MAX_STRING_LENGTH` by a comment only: assert it in `hooks/office-hook.test.ts` (and that `ALLOWED` covers what `server/hooks-adapter.ts` reads). (4) `hooks/office-hook.test.ts:252` the `::1` host test has no skip guard for hosts without IPv6 loopback. (5) `hooks/install.mjs:80` `isOurs` matches any command whose script argument is named `office-hook.mjs` at any path, so `--remove` also removes another checkout's entry; the README says "only our entries": match this checkout's path or say so. (6) `hooks/install.mjs:236` no re-check before `renameSync` if another tool wrote the settings file meanwhile. (7) `server/hook-discovery.ts:86` `removeDiscovery` reads `hook.json` with a blocking `readFileSync` (a planted FIFO would hang SIGINT cleanup); harden like `readInfo` in the script. (8) `server/feed-plugin.ts:1041` events over the 20/s per-session or 100/s total window are dropped, so a burst could lose the one `needs_attention`: exempt it or reserve a budget.

**Why:** Informational findings from the second /ship review pass; none blocks, all were skipped by the user's choice.

**Context:** The first pass's findings are in "Pre-landing review follow-ups" above.

**Effort:** S
**Priority:** P3
**Depends on:** None

### Adversarial review leftovers (2026-10-04)

**What:** (1) `hooks/install.mjs` writes `async: true` and a `node '<path>'` command resolved through PATH: if Claude Code is started from a GUI with a minimal PATH, every hook event exits 127; consider the absolute `process.execPath` (or document it). Whether `async` is honoured is unverified (the probe). (2) `server/hook-discovery.ts` `hookHost` maps a specific non-loopback `--host` to `127.0.0.1`, where nothing listens, with no diagnostic: log one warning at publish time when the bind address is neither loopback nor wildcard; Vite middleware mode (no `httpServer`) also skips publishing silently. (3) `writeDiscovery` `chmodSync(dir, 0o700)` on a pre-existing `OFFICE_HOOK_DIR` changes a shared directory's mode and never checks ownership. (4) The 408 timer in `readHookBody` survives a client abort before `end` (clear it on `close`). (5) `readHookBody`'s `end` handler wraps `ingestHook` in the same try/catch as `JSON.parse`, so a bug in `ring.add` or `send` is logged as an unparseable payload and the ring and SSE clients can diverge: parse in its own try. (6) The per-file normalizer failure log writes `String(e)` (`server/feed-plugin.ts` ~416): log only `e.name`/code or route through `loggable()`. (7) The installer is a read-modify-write on `~/.claude/settings.json` (another writer between read and rename loses its update) and `.bak-<stamp>` backups accumulate unpruned with a full copy of the settings. (8) The 400 ms script deadline covers node cold start, stdin and the round trip; a dropped `needs_attention` leaves no trace on either side: add a server-side counter of received hooks per minute.

**Why:** Native adversarial review (/ship Step 11). Its top finding (late transcript activity erasing a live exact attention because the guard compares the receipt clock) was refuted: `applyOwned` uses `clock = Math.min(event.ts, now)` in live and replay and `src/office/machine.test.ts` covers needs_attention@10000 followed by a tool start@9900.

**Context:** All skipped by the user's choice (/ship D4).

**Effort:** M
**Priority:** P3
**Depends on:** The user's interactive hook probe (items 1 and 8)

### Final review pass leftovers (2026-10-04)

**What:** (1) A child handed back and later resumed (the normalizer's `state.resumes`) stays in `returnedSeen`, so its hook `needs_attention` and `agent_started` are dropped for good (`server/feed-plugin.ts` `ingestHook`): delete the key when a `handoff out` for that child arrives. (2) `hooks/office-hook.mjs` trusts `hook.json` without an owner or mode check and accepts any integer port: require owner equals the current uid, no group or other bits, and a port in 1024 to 65535. (3) `keyOf` and `episodeIdOf` join ids with `\u0000` and `idOf` accepts NUL in ids, so a token holder can collide session `a\0b` with session `a` plus agent `b`: reject NUL or length-prefix the key. (4) `hooks/install.mjs` rewrites settings through `JSON.parse`/`stringify`: duplicate keys and integers above 2^53 are lost and formatting is normalised without a warning. (5) One `node` process per hook event with a 400 ms deadline: a burst of many subagents costs CPU and events past the deadline vanish. (6) A hook-created top-level agent for a session the tailer has not read gets no seat. (7) `src/office/identity.ts:41` `pickShirt` and DESIGN.md (shirt sections, "unknown project: neutral gray") still say project although shirts are per session; `setOwn` is defined twice (`machine.ts` and `scene-model.ts`); `parentOf` in `server/feed-plugin.ts:475` scans every tracked file's launches linearly per subagent file.

**Why:** Informational findings from the last /ship review pass, skipped by the user's choice (/ship D5).

**Context:** Items 1, 3 and 6 are red-team or adversarial findings read from code, not reproduced end to end.

**Effort:** M
**Priority:** P3
**Depends on:** None
