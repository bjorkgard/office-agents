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

### Chime control: design review and DESIGN.md entry (2026-10-06)

**What:** Review the top-bar chime toggle (speaker glyph, visible state text, blocked state) against the design system and add a DESIGN.md entry for it. A chime stored as "on" before the first click still needs two clicks to turn off (the first click retries the audio unlock).

**Why:** The control shipped in the burndown without a design review; DESIGN.md only has a short descriptive mention (Principle 3 and the Top bar entry), not a reviewed chime entry. Findings from the second /ship pass to fold in: the on state and hover copy the `.top-bar-chip` look so the toggle can read as an agent chip (`index.css:157`); the speaker glyph is a full-colour platform emoji that ignores the token colours and is the same loud-speaker in the blocked state (`TopBar.tsx:107`; use a monochrome SVG with `currentColor` and a distinct blocked glyph); the status stays "Chime on" after the audio context is suspended later, so chimes are dropped silently (`useChime.ts:76`, `chime-audio.ts:31`); the tone constants are bare literals (`chime-audio.ts:29`); `chime-audio.ts` has no test of its own (every test mocks it) and toggling off while an unlock is pending is untested.

**Context:** Files: `src/office/TopBar.tsx`, `src/index.css` (`.top-bar-chime`), `src/office/chime-logic.ts` (`nextEnabled`), `src/office/useChime.ts`. Audio and the real browser blocked state were never exercised in a browser. Reports: `.claude/scratch/todo-burndown-2/reports/builder-09.md`, `-13.md`, `-15.md`. Deferred at /ship (plan-completion gate, 2026-10-06) with the design-review findings to fold in: `aria-pressed` is true in the blocked state while no sound will play (`TopBar.tsx:101`); `aria-label` replaces the visible text, so the name does not contain the label (`TopBar.tsx:102`, WCAG 2.5.3); `.top-bar-chime:hover` hides the warn cue in the blocked state (`index.css:165`); the button has no `flex-shrink: 0` and the chips list can overlap it at the 800 px minimum with 4 chips (`index.css:143`, estimated, not measured); an unlock still pending when the user toggles off and on again can leave two unlocks running (`useChime.ts:64`, `:84`); `playChime` drops chimes silently if the audio context is later suspended and nothing retries `resume()` (`chime-audio.ts:31`); no `webkitAudioContext` fallback and no cross-tab sync of the stored preference; `shouldChime` trusts a future-dated `waitingSince` (`chime-logic.ts`); tests missing for the 5 s window inside `createChime.notify` (`useChime.test.ts`) and for a late unlock after turning off. `runAnnouncer` and the `useCallback` wrappers in `useChime.ts:98` are small simplification advisories.

**Effort:** S
**Priority:** P1
**Depends on:** None

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

#### Perf deadlines are unmeasured (2026-10-06)

**What:** Measure real `perf --ab` repeat and total durations and set `PERF_REPEAT_DEADLINE_MS` (120 s) and `PERF_TOTAL_DEADLINE_MS` (30 min) from them. A repeat that times out abandons its browser rather than cancelling it, so it lives until process exit.

**Why:** Both values are estimates, not measurements, and an abandoned browser can distort the runs that follow.

**Context:** In `e2e/release.ts` (`withDeadline`). Cancelling the page or browser on a deadline needs a handle passed into the repeat. Report: `.claude/scratch/todo-burndown-2/reports/builder-02.md`.

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

**What:** Informational items the /ship reviews raised and the user skipped, still open after the burndown: `DISPENSER_SHADOW`, `COFFEE_SHADOW` and `BOOKSHELF_SHADOW` are exported only for `art.test.ts`; `PixelShadow` could reuse `pathOf`; the ArtSheet Legibility row is on `--bar` instead of `--bg`; random schedules without `ctx.resume` or null ctx.

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

**What:** (1) A unix socket swapped in for a transcript is not refused at once: on macOS opening it fails with errno -102, which takes the transient-retry path for up to 5 scans before denial (`server/feed-plugin.ts:329`). (2) A same-size in-place rewrite is not detected as rotation (the head is re-read only when the file grew). (3) No test checks that the read handle is closed on every reject path. (4) `needs_attention` now clears `openTools` and `waiting` in the ring (`feed-plugin.ts:729`), latent until the hooks adapter emits it; and a resumed asker's question `done` leaves the snapshot.

**Why:** Informational findings from the round-1 refuter pass; none blocks.

**Context:** Linux errno for a socket open is ENXIO, untested. Ring eviction scans all agents when full of askers (O(N), fine at the 2000 cap).

**Effort:** S
**Priority:** P3
**Depends on:** None

## Phase 4 review follow-ups

### Feed server hardening: truncation detection

**What:** In `server/feed-plugin.ts`: truncation is detected only as `size < offset` (see "Detect file rotation by more than size").

**Why:** A same-size or regrown rewrite of a transcript goes unnoticed.

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

### Installer `isOurs` exact path and settings re-check (2026-10-06)

**What:** (1) `isOurs` in `hooks/install.mjs` now matches only this checkout's unresolved script path, so `--apply` no longer replaces an entry left by a moved or deleted checkout, and an entry written through a symlinked checkout path is not removed by `--remove`: decide whether to compare resolved paths. (2) The settings re-check before `renameSync` runs only when the file existed at read time; if it was absent then, a file another tool creates meanwhile is overwritten.

**Why:** Both are edge cases of the exact-path change and the concurrent-writer guard from the burndown.

**Context:** Report: `.claude/scratch/todo-burndown-2/reports/builder-06.md`.

**Effort:** S
**Priority:** P3
**Depends on:** None

### Playwright e2e was not run for the burndown (2026-10-06)

**What:** Run `vp run e2e` once on the burndown branch before merge.

**Why:** The burndown changed `server/feed-plugin.ts` (hook route split), `src/office/TopBar.tsx`, `src/App.tsx` and `e2e/release.ts`; only unit tests (`vp test`, 1546 passed at brief 16) and `vp check` ran.

**Context:** Report: `.claude/scratch/todo-burndown-2/reports/builder-08.md` (SKIPPED).

**Effort:** S
**Priority:** P3
**Depends on:** None

### sanitize-fixtures salt claim is unverified (2026-10-06)

**What:** Check that the committed fixtures really are the output of the library default (empty salt), as the `server/sanitize-fixtures.ts` header now states. The CLI still rejects an explicit `--salt ""`, so it cannot regenerate them.

**Why:** The header claim was written from a code read, not from a regeneration run.

**Context:** The new test in `server/normalize.test.ts` ("committed empty-salt = library default") checks the default, not the committed files. Report: `.claude/scratch/todo-burndown-2/reports/builder-01.md`.

**Effort:** S
**Priority:** P3
**Depends on:** None

### TopBar wait clock test is weak (2026-10-06)

**What:** Strengthen the TopBar "wait clock" test: it only proves TopBar renders the `now` it is given, not that `App` and `TopBar` share one clock.

**Why:** The two clocks were merged (15 s in App) but nothing would fail if TopBar grew its own again.

**Context:** `src/office/topbar.test.tsx`; `src/App.tsx` passes `now`. Report: `.claude/scratch/todo-burndown-2/reports/builder-03.md`.

**Effort:** S
**Priority:** P3
**Depends on:** None

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

**What:** `server/feed-plugin.ts` is still past 1,200 lines (the hook route moved to `server/hook-route.ts`). The `Req.on` type was widened to `(event: string, cb: (arg: Buffer) => void)` (`:849`): use overloads for `close`, `data`, `end`, `error`. `hookSessions` evicts by insertion order, not recency (`:1014`): delete before set. `replaced()` re-opens, reads and hashes the file head on every scan for every grown file (`:556`): skip unless size shrank or the inode changed, or read the head on the same handle. `hookSessionCount` and several `HOOK_*` exports exist only for tests. The SIGINT handler re-raises unconditionally (`:1237`); verified fine for `vp dev` (refuter-21) but would double-run other plain listeners. `hooks/install.mjs:225` writes the settings temp file without `O_EXCL`/`O_NOFOLLOW` (needs write access to `~/.claude`, low impact).

**Why:** Maintainability, performance and security informational findings; none is a defect today.

**Context:** Advisory simplifications also listed: drop the redundant `chmodSync(tmp, 0o600)` in `server/hook-discovery.ts`, share one `reject(code)` closure in `readHookBody`, validate the root before `mkdtempSync` in `e2e/release.ts` `startOffice`.

**Effort:** M
**Priority:** P3
**Depends on:** None

### Adversarial review leftovers (2026-10-04)

**What:** (1) `hooks/install.mjs` writes `async: true` and a `node '<path>'` command resolved through PATH: if Claude Code is started from a GUI with a minimal PATH, every hook event exits 127; consider the absolute `process.execPath` (or document it). Whether `async` is honoured is unverified (the probe). (7) The installer is a read-modify-write on `~/.claude/settings.json` (another writer between read and rename loses its update) and `.bak-<stamp>` backups accumulate unpruned with a full copy of the settings. (8) The 400 ms script deadline covers node cold start, stdin and the round trip; a dropped `needs_attention` leaves no trace on either side: add a server-side counter of received hooks per minute. Item numbers are from the original list; (2) to (6) are done.

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

## Review follow-ups from the 0.8.0.0 ship (2026-10-06)

### Hook rate windows break on a backward clock step

**What:** `hookAdmit` in `server/hook-route.ts` (`at - total.start >= HOOK_WINDOW_MS`, `at - w.start >= HOOK_WINDOW_MS`) uses the wall clock. After a backward step (NTP, laptop wake) `at - start` is negative, the windows never reset, and every hook event including `needs_attention` is dropped with a 204 until the clock catches up. Reset a window when `at < start` or use a monotonic clock; do the same in the attention windows and the `hookLogged` throttle.

**Why:** Adversarial finding at the 0.8.0.0 /ship (D4 skipped). The same logic existed in `feed-plugin.ts` before the hook route split, so it predates this release; the new attention budget copies it.

**Effort:** S
**Priority:** P2
**Depends on:** None

### Small review findings from the 0.8.0.0 ship

**What:** Informational findings skipped at /ship (D3, D4), each with a file reference. (1) `server/hook-route.ts:88` `sessions` map is shared with the caller and evicts oldest at 1,000, so rotating session ids resets a per-session window (bounded by the overall caps); `:78` `hookAdmit` threads an `attention` flag through four ternaries (extract one limiter and instantiate it twice); `:12` header comment. (2) `server/feed-plugin.ts:71` the re-export block for the `HOOK_*` constants is a compatibility shim for tests only; `:1224` and `:450`, `:1155`, `:1253` still log raw `String(e)` instead of `loggable(e.name)`; the tracked-file cap check runs before the `lstat` and window filter, so slots go to arbitrary files and the warning can overstate drops; no test for the cap warning re-arming. (3) `server/hook-route.ts` accepts an empty `hookToken` as valid (treat `""` as disabled); a non-loopback bind warns but still publishes the token. (4) `server/sanitize-fixtures.ts` `parseCliArgs` treats unknown flags (`--help`, `--slat`) as paths. (5) `hooks/install.mjs`: `--apply` from a second or moved checkout adds a second entry, so every hook event fires twice (strip entries with the `office-hook.mjs` basename on apply and warn); a `.tmp` file can be left if the re-check read throws. (6) `src/office/props.ts:502` `decorVariantGrid` shift is fractional if `DECOR_VARIANTS` does not divide 6: use `Math.floor` or assert; `ErrorBoundary.tsx:3` has a doubled `(D16)`; `chime-logic.ts:3` module comment sits after the import. (7) `e2e/release.ts:901` a repeat that hits its deadline is abandoned, so its browser keeps running and can skew later repeats: close it on the deadline or mark later repeats INCONCLUSIVE. (8) The directory-at-`hook.json` test (`server/hook-discovery.test.ts:115`) would still pass without the `isFile` guard; the FIFO test is what covers that guard.

**Why:** None is a release blocker; each was rated informational by the seven reviewers and the adversarial pass.

**Context:** Reports in `.claude/scratch/todo-burndown-2/reports/`. Chime findings are in "Chime control: design review and DESIGN.md entry".

**Effort:** M
**Priority:** P3
**Depends on:** None

### More review findings from the 0.8.0.0 ship (second pass, 2026-10-06)

**What:** Informational findings from the second /ship pass, skipped by the user's choice (D3). (1) `hooks/install.mjs:237`: the new post-write recheck calls `readFileSync(target)` without a try/catch, so a settings file that vanishes or turns unreadable mid-install throws a raw ENOENT/EACCES and leaves the `.tmp` file; when the file was absent at read time (`before === null`) there is no recheck, so a settings file created meanwhile is overwritten (turn any read error into a `Refusal`, unlink in a `finally`, create with an exclusive link or O_EXCL). (2) `hooks/install.mjs:79`: `--apply` from a second or moved checkout leaves the old checkout's `office-hook.mjs` entry, so every hook event runs the script twice; strip entries with the `office-hook.mjs` basename on apply and warn. (3) `hooks/office-hook.mjs` `readInfo` checks `isFile` and size but not the owner of `hook.json`, so a `hook.json` in an attacker-owned `~/.office-agents` is still read: add a `uid` check and a test (the owner check today is only on the feed's write side). (4) `server/hook-discovery.ts` `removeDiscovery`: the read and the `rmSync` are separate, so a newer dev server's file written in between can be removed by an older server's cleanup; `O_NONBLOCK` is a no-op on Windows. (5) `e2e/release.ts`: after the total deadline `perf()` ends in `process.exit(code)` without the `shutdown()` the signal handler uses, so an abandoned Chrome or vite child may be left. (6) `server/feed-plugin.ts:1216` hard-codes the reachable bind addresses that `hookHost()` in `hook-discovery.ts` also encodes: export one predicate. `src/office/props.ts:388` contact-shadow comment omits the shelf. (7) `useChime.ts` reads the stored preference once and has no `storage` listener, so two tabs disagree until reload.

**Why:** None is a defect in released behaviour; items 1 to 3 are the most worth doing first.

**Context:** Simplification advisories also raised: remove the `HOOK_*` re-export block in `server/feed-plugin.ts:73` by importing from `hook-route.ts` in the tests, and one limiter helper instead of the attention ternaries in `hookAdmit`.

**Effort:** S
**Priority:** P3
**Depends on:** None
