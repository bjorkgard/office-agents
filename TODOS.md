# TODOS

## Feed

### Hooks adapter for exact attention and subagent lifecycle

**What:** Consent-gated Claude Code hooks (Notification, PermissionRequest, SubagentStart/Stop) that POST to the loopback feed as a second adapter behind `shared/events.ts`.

**Why:** Replaces the slice 1 heuristics (trailing "?" and tool-call timer, markers `gstack-shortcut(dec-R1)` and `gstack-shortcut(dec-R2)`) with exact signals, so the wave never fires falsely and never misses a permission prompt.

**Context:** Slice 1 reads `~/.claude/projects/**/*.jsonl` only. Pros: no false waves, resolves both shortcut markers. Cons: edits `~/.claude/settings.json`, adds an installer, a token-checked 127.0.0.1 endpoint and a hook script (about 3 files); sessions started before install stay silent. The normalized event interface already exists, so this is an added adapter; start from `shared/events.ts`. Ideas only from pixel-agents (`../pixel-agents/CLAUDE.md:30,284`), no code copied without license attribution (MIT).

**Effort:** L (human ~1.5 days / CC ~1h)
**Priority:** P2
**Depends on:** Slice 1 shipped

### Event guard hardening before the first producer (DONE: parseAgentEvent in shared/events.ts)

**What:** In `shared/events.ts`, add a `parseAgentEvent` that returns a fresh object holding only the declared fields (including the nested `tool`). The normalizer (BUILD_TODO 2.1) must build each event field by field, never spread raw transcript JSON.

**Why:** The guard ignores extra fields and returns the original object, so a spread transcript entry would carry assistant text past the guard, against the file's "no transcript text" rule. It is not reachable today (no producer exists).

**Context:** Found in the Phase 1 /ship adversarial review, confirmed by the red-team pass; deferred by the user because fixing it would have hit the three-cycle review cap. Extra fields are ignored by design (approved contract P1-S1-1), so the copy function is additive. Also decide then whether empty-string ids and negative or fractional `ts` should be rejected (skipped in Phase 1).

**Effort:** S (human ~1h / CC ~10min)
**Priority:** P1
**Depends on:** Land before BUILD_TODO 2.1 emits its first event

## Office

### Displayed-state hook for characters (M8)

**Status:** DONE in Phase 4 (`src/office/Character.tsx`, `swap.ts`).

**What:** Add `src/office/Character.tsx`, a hook that swaps the displayed pose only when the current animation loop ends, using `nextDisplayed` from `poses.ts`.

**Why:** Without it, state changes cut poses off mid-motion, and `nextDisplayed` and `poseForState` have no production caller yet.

**Context:** Deferred from plan: docs/designs/character-art-merged-tasks.md (M8). The pure swap logic and its 900ms timeout exist and are tested. Needs the reduced-motion path (new pose at once) and a background-tab return to the current pose.

**Effort:** M (human ~1 day / CC ~30min)
**Priority:** P1
**Depends on:** None

### Bubble layout and hit-area spacing (M9)

**Status:** DONE in Phase 4 (`placeBubbles` in `src/office/iso.ts`); M10 profiling stays open.

**What:** Add `src/office/iso.ts` with `placeBubbles` and `iso.test.ts`.

**Why:** Overlapping speech bubbles and 24px hit areas need to hold at 50% scale with 12 agents.

**Context:** Deferred from plan: docs/designs/character-art-merged-tasks.md (M9). Tests needed for 0, 1, 2 and 3 overlapping bubbles, and hit-area centers at least 24px apart at scale 0.5. M10 profiling (12 and 24 agents in Chrome and Safari, Safari 50% hit area) was dropped from the art PR and belongs with scene step 4.4.

**Effort:** M (human ~1 day / CC ~30min)
**Priority:** P1
**Depends on:** BUILD_TODO 4.1

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

Nine visual updates from the user, 2026-10-02. Goal: the room should never look dead. Order after the CEO review (docs/designs/office-life-ceo-review.md, 2026-10-02): V8, V6, V3, V2, V5, V7, V9, V4, V1, behind a behavior-preserving prep refactor of `Scene.tsx` and `planMotion`. V6 comes first among the desk items because it defines the desk-kind table (screen rect, paper slot, device slot) that V2, V3 and V4 consume; V9 anchors room coordinates so a new row does not move desks, and ships only with the M10 measurements.

### Office life follow-ups from the 0.3.0.0 /ship review (2026-10-03)

Skipped by the user at ship time; each is informational and has a file reference.

#### M10: browser pass for row growth and the eased fit

**What:** In Chrome and Safari at 12 and 24 agents, write down frame timings, Recalculate Style cost of a row change, Safari hit area at 50% scale, and tag, bubble and hit-area alignment during the ease. Record the numbers in DESIGN.md.

**Why:** The plan requires the numbers before row growth is called done; nobody measured them (the /ship run accepted this risk).

**Context:** Overlay positions use registered `--fit-*` custom properties, transitioned in `scene.css` (`.scene-overlay`). Also check the 5 s test timeouts under load, and the D4 style-sheet passes (24-agent room, grayscale, shadows-off) in `?art`.

**Effort:** S (human ~1h)
**Priority:** P1
**Depends on:** None

#### Frame cost and caches in the break and paper code

**What:** Cache per-cycle trip segments so a waiting parent builds its timeline once per frame (`choreo.ts:381`), evict one plan instead of clearing all (`breaks.ts:112`), group subagents by session once (`paper.ts:139`), and memoize `DeskLayer`, `RoomDecor` and `RoomShell` (`Scene.tsx:300`).

**Why:** Avoids garbage and re-render work with 24 waiting parents; unmeasured, so do it only if M10 shows pressure.

**Context:** `settled` also keeps a rAF loop for the first 2 s of idle (`motion.ts:183`); `nextChange` already knows the wake time.

**Effort:** M
**Priority:** P3
**Depends on:** M10 browser pass

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

#### Accessibility of the scene root and tags

**What:** Give the scene root a `role` so its label is exposed, and `aria-hidden` on the `.tag` divs (each hit button already names the agent).

**Why:** Screen readers ignore `aria-label` on a plain div and may read each agent twice (`Scene.tsx:439`).

**Context:** From the design specialist in the final review pass; not run through a screen reader.

**Effort:** S
**Priority:** P2
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

### Per-line try/catch around the normalizer in emit()

**What:** The emit() catch drops a whole batch when the normalizer throws on one line.

**Why:** One bad line should cost one line, not every event in the batch.

**Context:** Wrap each line's normalizer call in its own try/catch. Found in the Phase 2-3 /ship review.

**Effort:** S (human ~1h / CC ~10min)
**Priority:** P2
**Depends on:** None

### Simplify the flush() projectId handling

**What:** `server/feed-plugin.ts` flush(): simplify the projectId handling.

**Why:** Behavior is correct; the code is harder to read than it needs to be.

**Context:** Found in the Phase 2-3 /ship review; deliberately left alone there.

**Effort:** S (human ~30min / CC ~10min)
**Priority:** P3
**Depends on:** None

### Trust the filename session id, not the record body

**What:** `server/normalize.ts` (~273) reads sessionId from each record; use the transcript's filename as the session id instead.

**Why:** A crafted record can claim another session and spoof its agent.

**Context:** Local files only today, so low risk; matters once other adapters feed the same events.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P2
**Depends on:** None

### Validate id format in parseAgentEvent

**What:** Reject ids that do not match a conservative pattern (length and character set).

**Why:** Ids flow into keys, logs and the DOM later; today any non-empty string passes.

**Context:** Add after the id formats of real transcripts are confirmed (see the real-transcript item).

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P2
**Depends on:** None

### Origin and X-Forwarded-* check, sanitized Host in the refusal log

**What:** In `server/feed-plugin.ts` (~524) also refuse requests with a foreign Origin or X-Forwarded-* headers, and strip control characters from the logged Host.

**Why:** The loopback guard checks Host and socket only; the refusal log prints the raw Host header.

**Context:** Found in the Phase 2-3 /ship review.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P2
**Depends on:** None

### Close the leaf-file symlink TOCTOU

**What:** Open transcript files with O_NOFOLLOW and fstat the handle instead of lstat-then-open.

**Why:** A file swapped for a symlink between the lstat and the open would be followed.

**Context:** Directories are already not followed; this is the leaf file only. Needs a TailerIo change.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P2
**Depends on:** None

### Fixture id salt and tool-name allowlist

**What:** Salt the id hashes in `server/sanitize-fixtures.ts` per run and restrict tool names to a known list.

**Why:** Unsalted short-input hashes can be reversed by guessing, and a custom tool name can identify a person or project.

**Context:** Found in the Phase 2-3 /ship review.

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

### parentAgentId is always null

**What:** The normalizer always emits `parentAgentId: null` for agent_started.

**Why:** The machine and UI cannot draw a parent link from the event alone; they rely on handoffs.

**Context:** Fill it from the Agent tool launch (launch id to the subagent file) or the hooks adapter.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P2
**Depends on:** None

### Wire identity.ts or drop it

**Status:** DONE in Phase 4 (`label.ts` `agentIdentity` consumes it).

**What:** `src/office/identity.ts` has no consumer yet and exports `shirtFor`, the same name as the one in `poses.ts`.

**Why:** An unused module drifts, and two functions with one name invite a wrong import.

**Context:** Connect it in Phase 4 (name tags and shirt choice) or rename one of the two.

**Effort:** S (human ~1h / CC ~10min)
**Priority:** P2
**Depends on:** BUILD_TODO 4.4

### Detect file rotation by more than size

**What:** `server/feed-plugin.ts` detects a replaced file only when its size shrinks.

**Why:** A rotated file that grows past the old offset is read from the wrong place.

**Context:** Compare inode and a hash of the first bytes as well; re-read from 0 on change.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P2
**Depends on:** None

### Open transcripts without blocking on FIFOs

**What:** Open with `O_NOFOLLOW` and reject non-regular files (FIFO) before reading.

**Why:** A FIFO named `*.jsonl` would hang the read; a leaf symlink swap is a TOCTOU gap (see the leaf symlink item).

**Context:** Pair with the leaf symlink item.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P2
**Depends on:** None

### Keep question-attention agents in the snapshot ring

**What:** Retain the `done` event of an agent waiting on a question beyond the recent window.

**Why:** A late client may not see a waiting agent that was quiet while others were busy.

**Context:** Ring retention is per agent today (`createSnapshotRing`).

**Effort:** S (human ~1h / CC ~15min)
**Priority:** P2
**Depends on:** None

### Key sessions by filename, not record sessionId, for resumed sessions

**What:** Resumed sessions may carry a different `sessionId` in their records than the file name.

**Why:** Two files could collapse into one agent, or one agent split across two.

**Context:** Verify against real transcripts first (see the real-transcript item).

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P1
**Depends on:** Verify the normalizer against real transcripts

### Use Map or Object.create(null) for id-keyed objects in the machine

**What:** `src/office/machine.ts` keys plain objects by transcript ids (`agents`, `returned`, `openTools`, `unresolved`).

**Why:** An id such as `__proto__` or `constructor` can collide with prototype members.

**Context:** Ids pass the string guard only, not a charset check.

**Effort:** S (human ~1h / CC ~15min)
**Priority:** P2
**Depends on:** None

### SSE heartbeat

**What:** Send a comment frame (`: ping`) every ~15 s on /__office/events.

**Why:** Idle proxies and browsers close a silent stream, and a dead client is only noticed on the next write.

**Context:** Doubles as a dead-client probe.

**Effort:** S (human ~1h / CC ~10min)
**Priority:** P3
**Depends on:** None

### Anchor the task-notification match in the normalizer

**What:** `onQueueOperation` in `server/normalize.ts` tests whether the content includes the task-notification tag anywhere.

**Why:** Any queued text that merely contains the tag is treated as a completion notice.

**Context:** Require the tag at the start of the content.

**Effort:** S (human ~1h / CC ~10min)
**Priority:** P3
**Depends on:** None

### Map every tool_result's toolUseResult, not one per record

**What:** `onUser` reads a single `toolUseResult` for a record that may hold several `tool_result` blocks.

**Why:** Parallel sub-agent results in one record would all use the first result's agentId and status.

**Context:** Check real transcripts for the multi-result shape.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P2
**Depends on:** Verify the normalizer against real transcripts

### identityFor covers only 24 identities

**What:** `src/office/identity.ts` `identityFor` has 24 identities.

**Why:** The 25th concurrent agent reuses an identity, so two desks look the same.

**Context:** Decide in Phase 4 whether to extend or accept repeats.

**Effort:** S (human ~1h / CC ~10min)
**Priority:** P3
**Depends on:** BUILD_TODO 4.4

## Phase 4 review follow-ups

### Client ignores `gone` frames for subagents, and drops the seat on a transcript reset (DONE: gone removes the agent in `feed-client.ts`; server resend of `seat` after `onReset` stays open)

**What:** `src/office/feed-client.ts` (`gone` handling, ~179) only deletes the seat of a top-level session. A `gone` frame with an `agentId` is ignored, and a truncated transcript (`onReset`) deletes the client seat while the server keeps it.

**Why:** Ghost agents linger until the stale timeout (30 min, 4 h in attention). After a reset the replayed agent stays unseated at the door until the stream reconnects. A fresh snapshot shows a different office than the live view.

**Context:** Found in the Phase 4 /ship review (red-team). Deferred by the user because it touches the D12 replay contract. Fix by removing or leaving the matching agent on `gone`, and have the server resend `seat` after `onReset`.

**Effort:** M (human ~4h / CC ~30min)
**Priority:** P2
**Depends on:** None

### Replay clocks every event at its own `ts` with no future cap

**What:** `src/office/machine.ts:205` passes `e.ts` as the clock during replay. One far-future `ts` expires every other agent in the snapshot, and the agent with the future `ts` never expires.

**Why:** Clock skew or an odd transcript line can blank the office on reconnect. The live path and the handoff-back branch already use `Math.min(ts, now)`.

**Context:** Use `Math.min(e.ts, now)` in `applyEvents` replay and optionally clamp in the server normalizer. Add a test with a future-dated event.

**Effort:** S (human ~1h / CC ~10min)
**Priority:** P2
**Depends on:** None

### Feed server hardening (session identity, origin check, heartbeat)

**What:** In `server/feed-plugin.ts` and `server/normalize.ts`: (1) the session id comes from transcript content while release and forget use the file name, so a resumed or mislabelled file can release a live session's seat and ring; (2) the SSE endpoint checks only Host and the socket, so any web page can open all 8 SSE slots; (3) there is no SSE heartbeat, so half-open connections hold a slot; (4) truncation is detected only as `size < offset`; (5) there is no cap on tracked files.

**Why:** Wrong seats and history for live sessions, and a 503 for the real UI from a hostile page.

**Context:** Found in the Phase 4 /ship adversarial review; all items sit in the Phase 2 and 3 server code, not this diff. Check `Sec-Fetch-Site` and `Origin` first.

**Effort:** M (human ~1 day / CC ~1h)
**Priority:** P2
**Depends on:** None

### Queue overflow button does nothing and waiting agents past it are unreachable (DONE: button now a non-interactive `role="status"`; unreachable waiting agent and stable render order stay open)

**What:** The `+N` button in `src/office/Scene.tsx` (~531) is a focusable button with no handler, and a waiting agent past `QUEUE_VISIBLE` has no `.hit` button, so its top-bar chip does nothing when clicked.

**Why:** Keyboard and screen reader users cannot reach the agent that needs them.

**Context:** Render the count as a non-interactive status element, and make `pulse()` in `src/App.tsx` fall back to a visible target when the wrapper is missing. Also consider a stable render order so focus survives an attention reorder.

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

## Completed

### V1: Windows with a random outside world

**What:** Windows on the walls showing a random outside scene per session (day, dusk, night, rain, snow, clouds, a passing bird or plane).

**Why:** Gives the room a sense of place and time passing even when no agent moves.

**Context:** Idea: pick the scene once per load, then let it change slowly; optionally follow the real local time of day, with a manual override in the dev style sheet. Draw the scene inside the window clip path so it stays flat vector like the rest. Respect `prefers-reduced-motion` (static sky, no rain). Keep the glass light off the characters, or add a faint light patch on the floor for depth.

**Effort:** M (human ~1 day / CC ~40min)
**Priority:** P3
**Depends on:** None
**Completed:** v0.3.0.0 (2026-10-03)

### V2: Handoff paper lands on the desk, not the screen

**What:** When a subagent leaves the paper, it ends up lying on the desk surface, not on the monitor.

**Why:** The paper currently reads as pasted on the screen; the desk is where a physical handoff would rest.

**Context:** Re-anchor the paper end position to a desk-top slot (per desk type, see V6) and draw it in desk perspective. Idea: the paper stays visible until the parent agent picks it up, then fades or is filed in a tray.

**Effort:** S (human ~3h / CC ~20min)
**Priority:** P1
**Depends on:** None (re-check anchor after V6 and V9)
**Completed:** v0.3.0.0 (2026-10-03)

### V3: Animate every active screen

**What:** Every screen on an active (working) desk shows animation: scrolling code lines, a blinking cursor, a spinner or test bars. Idle screens go dark or show a screensaver.

**Why:** A lit, moving screen is the strongest "someone is working here" cue.

**Context:** Idea: vary the content by tool kind (read, edit, shell, search) so a glance shows what the agent is doing. Use CSS animations on shared symbols, not per-frame JS, to stay inside the DOM budget (see "Share character drawings via symbols"). Reduced-motion path: a static lit screen.

**Effort:** M (human ~1 day / CC ~40min)
**Priority:** P1
**Depends on:** None
**Completed:** v0.3.0.0 (2026-10-03)

### V4: Visible subagent typing on varied devices

**What:** Subagents show a typing pose on their own device: laptop, tablet or desktop monitor, chosen per agent.

**Why:** Parent and subagent are told apart at a glance, and the room gets variety.

**Context:** Idea: parent agents keep the full desk monitor; subagents get a laptop or iPad-style tablet (propped or flat) so the extra desks V9 spawns stay small. Needs a typing pose variant for each device (hands position differs for a tablet). Device is picked from a stable hash of the agent id so it never flips between renders. Screens animate per V3.

**Effort:** M (human ~1 day / CC ~45min)
**Priority:** P2
**Depends on:** V3, V9
**Completed:** v0.3.0.0 (2026-10-03)

### V5: Parent agent coffee break is short and random

**What:** A waiting parent agent walks to the coffee station only for a random 5 to 20 seconds, then returns to the desk and keeps waiting there (idle at the desk, not stuck at the machine).

**Why:** Today waiting reads as endless coffee drinking, which looks wrong when a subagent runs for minutes.

**Context:** Idea: after the return, a cooldown (random 20 to 60s) before the next break, and idle fillers at the desk in between (stretch, look around, sip a mug already on the desk, phone check). Keep the random source seedable so tests are deterministic, and keep `machine.ts` free of timers (`now` is passed in). Break choice also feeds V7.

**Effort:** M (human ~1 day / CC ~30min)
**Priority:** P1
**Depends on:** None
**Completed:** v0.3.0.0 (2026-10-03)

### V6: Two desk types with different props

**What:** Two desk designs (for example a tidy desk with plant and lamp, and a cluttered desk with mug, books and sticky notes), assigned per seat.

**Why:** Identical desks make the room look generated.

**Context:** Idea: add small per-desk personality props (plant, photo frame, figurine, headphones). Assign by seat index, not random per render, so desks do not change on re-layout. Draw as shared symbols (desk is already shared, R5). Must leave a clear desk-top slot for the paper (V2) and a spot for the device (V4).

**Effort:** M (human ~1 day / CC ~40min)
**Priority:** P2
**Depends on:** None
**Completed:** v0.3.0.0 (2026-10-03)

### V7: Water dispenser and random coffee or water choice

**What:** Add a water dispenser to the office. When an agent takes a break, pick coffee or water at random (weighted, for example 60/40), with a matching walk, drink pose and prop (mug or paper cup).

**Why:** Variety in breaks; one extra prop makes the pantry corner feel real.

**Context:** Idea: a small queue spot at each station so two agents do not stack on one tile, and a short gurgle bubble animation on the dispenser. Place it next to the coffee station (placement settled in step 4.10). Seedable random for tests.

**Effort:** M (human ~1 day / CC ~40min)
**Priority:** P2
**Depends on:** V5
**Completed:** v0.3.0.0 (2026-10-03)

### V8: Wall clock that looks like a clock

**What:** Fix the wall clock: it is off perspective and shows nothing. Draw a round face with hour marks, hands and a second hand, skewed onto the wall plane, showing the real local time.

**Why:** A broken-looking prop undermines the whole scene; a ticking clock is cheap, constant life.

**Context:** Idea: draw the face flat in a group, then apply the wall plane transform so the perspective matches the other wall items; update hands once per second (or once per minute with a smooth second hand via CSS). Reduced-motion: update once per minute, no sweep. Add to the dev style sheet for a visual check at 50% scale.

**Effort:** S (human ~3h / CC ~20min)
**Priority:** P1
**Depends on:** None
**Completed:** v0.3.0.0 (2026-10-03)

### V9: Every subagent gets a desk; spawn desks on demand

**What:** No agent stands. When subagents arrive and no desk is free, add desks (and move the layout) so each one sits; remove extra desks when subagents finish.

**Why:** Standing agents look like a bug and break the "everyone is working" read.

**Context:** Idea: grow the room in rows or a second cluster, with a smooth desk-appear animation (drop in, or slide in with a light pop) and a cap with a graceful fallback (for example shrink the scene scale, then add a second room row) so 24 agents still fit. Desk count follows live agent count with a short hysteresis so desks do not flicker in and out. Check hit-area spacing (M9) and the DOM budget at 12 and 24 agents (M10).

**Effort:** L (human ~2 days / CC ~1.5h)
**Priority:** P1
**Depends on:** Bubble layout and hit-area spacing (M9)
**Completed:** v0.3.0.0 (2026-10-03)
