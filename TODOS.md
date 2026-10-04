# TODOS

## Feed

### Hooks adapter for exact attention and subagent lifecycle

**What:** Consent-gated Claude Code hooks (Notification, PermissionRequest, SubagentStart/Stop) that POST to the loopback feed as a second adapter behind `shared/events.ts`.

**Why:** Replaces the slice 1 heuristics (trailing "?" and tool-call timer, markers `gstack-shortcut(dec-R1)` and `gstack-shortcut(dec-R2)`) with exact signals, so the wave never fires falsely and never misses a permission prompt.

**Context:** Slice 1 reads `~/.claude/projects/**/*.jsonl` only. Pros: no false waves, resolves both shortcut markers. Cons: edits `~/.claude/settings.json`, adds an installer, a token-checked 127.0.0.1 endpoint and a hook script (about 3 files); sessions started before install stay silent. The normalized event interface already exists, so this is an added adapter; start from `shared/events.ts`. Ideas only from pixel-agents (`../pixel-agents/CLAUDE.md:30,284`), no code copied without license attribution (MIT).

**Effort:** L (human ~1.5 days / CC ~1h)
**Priority:** P2
**Depends on:** Slice 1 shipped

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

#### Row-change style recalc over budget (2026-10-04)

**What:** Adding a row costs 48 to 49 ms of style recalculation at 12 agents and 63 to 79 ms at 24 on headless Chrome (M1 Max, `vp run perf`, 4 runs), against the 16 ms budget. Find what the registered `--fit-*` transition invalidates and cut it.

**Why:** Decision D8 of phase-6-finish: a missed budget is a dated entry, not a release block. p95 frame time passes (16.7 ms against 20 and 33 ms).

**Context:** Numbers are in DESIGN.md "Performance". Safari is not measured. This unblocks "Frame cost and caches in the break and paper code" below, which was gated on this measurement; start there.

**Effort:** M
**Priority:** P1
**Depends on:** None

#### Frame cost and caches in the break and paper code

**What:** Cache per-cycle trip segments so a waiting parent builds its timeline once per frame (`choreo.ts:381`), evict one plan instead of clearing all (`breaks.ts:112`), group subagents by session once (`paper.ts:139`), and memoize `DeskLayer`, `RoomDecor` and `RoomShell` (`Scene.tsx:300`).

**Why:** Avoids garbage and re-render work with 24 waiting parents; unmeasured, so do it only if M10 shows pressure.

**Context:** `settled` also keeps a rAF loop for the first 2 s of idle (`motion.ts:183`); `nextChange` already knows the wake time.

**Effort:** M
**Priority:** P3
**Depends on:** Row-change style recalc over budget (measured 2026-10-04: pressure found)

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

**Effort:** M (human ~1 day / CC ~40min)
**Priority:** P4
**Depends on:** V9

#### Door ajar frame on arrivals and departures

**What:** A second hand-drawn door frame shows while a subagent comes in or goes out.

**Why:** Arrivals and departures visibly use the door.

**Context:** New `DOOR_AJAR` grid, 20x60 cells, sized like `DOOR` and anchored at `WALL_ANCHOR.DOOR`. A pure `doorOpen(agents, now)` from `arrivedAt` and `leftAt` windows. Scene renders on events and a 15 s tick only, so a timer or the existing frame loop must close the door again. Static under reduced motion.

**Effort:** M (human ~1 day / CC ~40min)
**Priority:** P4
**Depends on:** None

#### Wall dressing: bookshelf and picture-only posters

**What:** A bookshelf and framed wall pictures, as in the picked mockup variant B (`~/.gstack/projects/office-agents/designs/office-life-windows-20261002/variant-B.png`).

**Why:** Makes the room feel lived in.

**Context:** From the design review (2026-10-02). No text anywhere in the room (DESIGN.md Principle 4), so posters are abstract pictures. The right wall is crowded (clock, counter, dispenser, windows), so place by the `WALL_LAYOUT` table and its no-overlap test. Pixel grid at 2px cells, existing tokens only, at least 2 cells for line features, check at 50% on the `?art` sheet.

**Effort:** M (human ~1 day / CC ~40min)
**Priority:** P4
**Depends on:** WALL_LAYOUT table (CEO T1), V1

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

### Simplify the flush() projectId handling

**What:** `server/feed-plugin.ts` flush(): simplify the projectId handling.

**Why:** Behavior is correct; the code is harder to read than it needs to be.

**Context:** Found in the Phase 2-3 /ship review; deliberately left alone there.

**Effort:** S (human ~30min / CC ~10min)
**Priority:** P3
**Depends on:** None

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

### Anchor the task-notification match in the normalizer

**What:** `onQueueOperation` in `server/normalize.ts` tests whether the content includes the task-notification tag anywhere.

**Why:** Any queued text that merely contains the tag is treated as a completion notice.

**Context:** Require the tag at the start of the content.

**Effort:** S (human ~1h / CC ~10min)
**Priority:** P3
**Depends on:** None

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

### Waiting agent past QUEUE_VISIBLE is unreachable

**What:** A waiting agent past `QUEUE_VISIBLE` in `src/office/Scene.tsx` has no `.hit` button, so its top-bar chip does nothing when clicked. Make `pulse()` in `src/App.tsx` fall back to a visible target when the wrapper is missing, and consider a stable render order so focus survives an attention reorder.

**Why:** Keyboard and screen reader users cannot reach the agent that needs them.

**Context:** Split from "Queue overflow button does nothing" (the `+N` button half is DONE, see ARCHIVE.md).

**Effort:** S (human ~1h / CC ~15min)
**Priority:** P3
**Depends on:** None

### Render cost: per-frame setState, idle tick clone, overlay ref churn

**What:** Every SSE frame and every skipped frame sets state and renders the scene. `tick` in `src/office/machine.ts` clones the whole state on idle ticks. `bindOverlay` in `Scene.tsx` returns a new ref callback each render.

**Why:** Churn grows with agent count and event bursts; measured scale (12 agents, about 28k SVG elements) is acceptable today.

**Context:** Coalesce frames per animation frame, run a cheap "anything due" check before cloning, cache ref callbacks. Deferred by the user in the Phase 4 /ship review.

**Effort:** M (human ~4h / CC ~30min)
**Priority:** P3
**Depends on:** None

### Share MAX_DESKS between server and client and cap the layout

**What:** `MAX_DESKS = 256` lives only in `src/office/feed-client.ts`. The server seat table has no cap, and layouts above about 48 desks overflow the viewport at the minimum scale.

**Why:** The 257th concurrent session is seated on the server but dropped on the client. A realistic cap is far below 256.

**Context:** Move the constant to `shared/tuning.ts`, cap `assignSeat`, derive the value from what fits at `MIN_SCALE`.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P3
**Depends on:** None

### Small simplifications left in Phase 4 files

**What:** `ReportingBoundary` subclass in `src/App.tsx` (give `ErrorBoundary` an `onError` prop instead), `viewportOf` in `app-logic.ts`, `nextAnnouncement` in `topbar-logic.ts`, the repeated render calls in `src/main.tsx`, and two clocks (15 s in App, 60 s in TopBar) that can show different wait times.

**Why:** Less code and one source of truth for the wait label.

**Context:** Advisory items from the Phase 4 /ship review, skipped by the user.

**Effort:** S (human ~2h / CC ~20min)
**Priority:** P3
**Depends on:** None

## Phase 5 review follow-ups

### E2E failure context: attach feed status and server log

**What:** On a failed E2E spec, attach the `/__office/status` JSON and the dev server's plugin log lines to the test result.

**Why:** An empty room has several causes (root wrong, tailer saw nothing, refused host). The trace and screenshot do not show which one; status and log do.

**Context:** Phase 5 review (docs/designs/phase-5-ceo-review.md, D12). Each Playwright project runs its own webServer with `stdout: "pipe"`; add an `afterEach` that fetches the project's status URL and calls `testInfo.attach` when the test failed. Source of the log lines: `[office] ...` from `server/feed-plugin.ts`.

**Effort:** S (human ~1h / CC ~10min)
**Priority:** P3
**Depends on:** Phase 5 E2E harness (5.1, 5.2)

## Demo mode

### Demo mode for the README and first run

**What:** `?demo` already exists (`src/office/demo.ts`, `src/main.tsx:41`) but is dev only and scripted. What is missing is a fixture replay for the live feed: play recorded transcript fixtures through the real feed source so the office can be shown from a production build without real Claude Code sessions.

**Why:** Deferred from phase-6-finish (decision D5); the README picture comes from `vp run hero` with a temporary feed instead.

**Context:** The demo module is excluded from `dist/` on purpose (marker `__OFFICE_DEMO__`), so a production replay needs its own path.

**Effort:** S
**Priority:** P3
**Depends on:** None
