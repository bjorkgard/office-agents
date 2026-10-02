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

**What:** Add `src/office/Character.tsx`, a hook that swaps the displayed pose only when the current animation loop ends, using `nextDisplayed` from `poses.ts`.

**Why:** Without it, state changes cut poses off mid-motion, and `nextDisplayed` and `poseForState` have no production caller yet.

**Context:** Deferred from plan: docs/designs/character-art-merged-tasks.md (M8). The pure swap logic and its 900ms timeout exist and are tested. Needs the reduced-motion path (new pose at once) and a background-tab return to the current pose.

**Effort:** M (human ~1 day / CC ~30min)
**Priority:** P1
**Depends on:** None

### Bubble layout and hit-area spacing (M9)

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

## Completed
