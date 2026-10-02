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
