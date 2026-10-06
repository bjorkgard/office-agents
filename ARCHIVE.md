# ARCHIVE

Done TODOS moved out of TODOS.md on 2026-10-04. Verified in code before moving.

## Done items

### Event guard hardening before the first producer (DONE: parseAgentEvent in shared/events.ts)

**What:** In `shared/events.ts`, add a `parseAgentEvent` that returns a fresh object holding only the declared fields (including the nested `tool`). The normalizer (BUILD_TODO 2.1) must build each event field by field, never spread raw transcript JSON.

**Why:** The guard ignores extra fields and returns the original object, so a spread transcript entry would carry assistant text past the guard, against the file's "no transcript text" rule. It is not reachable today (no producer exists).

**Context:** Found in the Phase 1 /ship adversarial review, confirmed by the red-team pass; deferred by the user because fixing it would have hit the three-cycle review cap. Extra fields are ignored by design (approved contract P1-S1-1), so the copy function is additive. Also decide then whether empty-string ids and negative or fractional `ts` should be rejected (skipped in Phase 1).

**Effort:** S (human ~1h / CC ~10min)
**Priority:** P1
**Depends on:** Land before BUILD_TODO 2.1 emits its first event

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

### Wire identity.ts or drop it

**Status:** DONE in Phase 4 (`label.ts` `agentIdentity` consumes it).

**What:** `src/office/identity.ts` has no consumer yet and exports `shirtFor`, the same name as the one in `poses.ts`.

**Why:** An unused module drifts, and two functions with one name invite a wrong import.

**Context:** Connect it in Phase 4 (name tags and shirt choice) or rename one of the two.

**Effort:** S (human ~1h / CC ~10min)
**Priority:** P2
**Depends on:** BUILD_TODO 4.4

### Client ignores `gone` frames for subagents, and drops the seat on a transcript reset (DONE: gone removes the agent in `feed-client.ts`; server resend of `seat` after `onReset` stays open)

**What:** `src/office/feed-client.ts` (`gone` handling, ~179) only deletes the seat of a top-level session. A `gone` frame with an `agentId` is ignored, and a truncated transcript (`onReset`) deletes the client seat while the server keeps it.

**Why:** Ghost agents linger until the stale timeout (30 min, 4 h in attention). After a reset the replayed agent stays unseated at the door until the stream reconnects. A fresh snapshot shows a different office than the live view.

**Context:** Found in the Phase 4 /ship review (red-team). Deferred by the user because it touches the D12 replay contract. Fix by removing or leaving the matching agent on `gone`, and have the server resend `seat` after `onReset`.

**Effort:** M (human ~4h / CC ~30min)
**Priority:** P2
**Depends on:** None

_Open remainder moved back to TODOS.md: "Server resends `seat` after a transcript reset"._

### Queue overflow button does nothing and waiting agents past it are unreachable (DONE: button now a non-interactive `role="status"`; unreachable waiting agent and stable render order stay open)

**What:** The `+N` button in `src/office/Scene.tsx` (~531) is a focusable button with no handler, and a waiting agent past `QUEUE_VISIBLE` has no `.hit` button, so its top-bar chip does nothing when clicked.

**Why:** Keyboard and screen reader users cannot reach the agent that needs them.

**Context:** Render the count as a non-interactive status element, and make `pulse()` in `src/App.tsx` fall back to a visible target when the wrapper is missing. Also consider a stable render order so focus survives an attention reorder.

**Effort:** S (human ~2h / CC ~20min)
**Priority:** P3
**Depends on:** None

_Open remainder moved back to TODOS.md: "Waiting agent past QUEUE_VISIBLE is unreachable"._

### Per-line try/catch around the normalizer in emit()

**What:** The emit() catch drops a whole batch when the normalizer throws on one line.

**Why:** One bad line should cost one line, not every event in the batch.

**Context:** Wrap each line's normalizer call in its own try/catch. Found in the Phase 2-3 /ship review.

**Effort:** S (human ~1h / CC ~10min)
**Priority:** P2
**Depends on:** None

**Completed:** todo-burndown batch A (2026-10-04, uncommitted). Tests: server/normalize.test.ts, server/feed-plugin.test.ts.

### Trust the filename session id, not the record body

**What:** `server/normalize.ts` (~273) reads sessionId from each record; use the transcript's filename as the session id instead.

**Why:** A crafted record can claim another session and spoof its agent.

**Context:** Local files only today, so low risk; matters once other adapters feed the same events.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P2
**Depends on:** None

**Completed:** todo-burndown batch A (2026-10-04, uncommitted). Tests: server/normalize.test.ts, server/feed-plugin.test.ts.

### Map every tool_result's toolUseResult, not one per record

**What:** `onUser` reads a single `toolUseResult` for a record that may hold several `tool_result` blocks.

**Why:** Parallel sub-agent results in one record would all use the first result's agentId and status.

**Context:** Check real transcripts for the multi-result shape.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P2
**Depends on:** Verify the normalizer against real transcripts

**Completed:** todo-burndown batch A (2026-10-04, uncommitted). Tests: server/normalize.test.ts, server/feed-plugin.test.ts.

### Origin and X-Forwarded-* check, sanitized Host in the refusal log

**What:** In `server/feed-plugin.ts` (~524) also refuse requests with a foreign Origin or X-Forwarded-* headers, and strip control characters from the logged Host.

**Why:** The loopback guard checks Host and socket only; the refusal log prints the raw Host header.

**Context:** Found in the Phase 2-3 /ship review.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P2
**Depends on:** None

**Completed:** todo-burndown batch B1 (2026-10-04, uncommitted). Tests in server/feed-plugin.test.ts. Left open: `Forwarded:` (RFC 7239) and `X-Real-IP` are still allowed.

### SSE heartbeat

**What:** Send a comment frame (`: ping`) every ~15 s on /__office/events.

**Why:** Idle proxies and browsers close a silent stream, and a dead client is only noticed on the next write.

**Context:** Doubles as a dead-client probe.

**Effort:** S (human ~1h / CC ~10min)
**Priority:** P3
**Depends on:** None

**Completed:** todo-burndown batch B1 (2026-10-04, uncommitted). Tests in server/feed-plugin.test.ts. Left open: `Forwarded:` (RFC 7239) and `X-Real-IP` are still allowed.

### Close the leaf-file symlink TOCTOU

**What:** Open transcript files with O_NOFOLLOW and fstat the handle instead of lstat-then-open.

**Why:** A file swapped for a symlink between the lstat and the open would be followed.

**Context:** Directories are already not followed; this is the leaf file only. Needs a TailerIo change.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P2
**Depends on:** None

**Completed:** todo-burndown batch B2 (2026-10-04, uncommitted). Tests in server/feed-plugin.test.ts and server/normalize.test.ts.

### Fixture id salt and tool-name allowlist

**What:** Salt the id hashes in `server/sanitize-fixtures.ts` per run and restrict tool names to a known list.

**Why:** Unsalted short-input hashes can be reversed by guessing, and a custom tool name can identify a person or project.

**Context:** Found in the Phase 2-3 /ship review.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P2
**Depends on:** None

**Completed:** todo-burndown batch B2 (2026-10-04, uncommitted). Tests in server/feed-plugin.test.ts and server/normalize.test.ts.

### Detect file rotation by more than size

**What:** `server/feed-plugin.ts` detects a replaced file only when its size shrinks.

**Why:** A rotated file that grows past the old offset is read from the wrong place.

**Context:** Compare inode and a hash of the first bytes as well; re-read from 0 on change.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P2
**Depends on:** None

**Completed:** todo-burndown batch B2 (2026-10-04, uncommitted). Tests in server/feed-plugin.test.ts and server/normalize.test.ts.

### Open transcripts without blocking on FIFOs

**What:** Open with `O_NOFOLLOW` and reject non-regular files (FIFO) before reading.

**Why:** A FIFO named `*.jsonl` would hang the read; a leaf symlink swap is a TOCTOU gap (see the leaf symlink item).

**Context:** Pair with the leaf symlink item.

**Effort:** S (human ~2h / CC ~15min)
**Priority:** P2
**Depends on:** None

**Completed:** todo-burndown batch B2 (2026-10-04, uncommitted). Tests in server/feed-plugin.test.ts and server/normalize.test.ts.

### Keep question-attention agents in the snapshot ring

**What:** Retain the `done` event of an agent waiting on a question beyond the recent window.

**Why:** A late client may not see a waiting agent that was quiet while others were busy.

**Context:** Ring retention is per agent today (`createSnapshotRing`).

**Effort:** S (human ~1h / CC ~15min)
**Priority:** P2
**Depends on:** None

**Completed:** todo-burndown batch B2 (2026-10-04, uncommitted). Tests in server/feed-plugin.test.ts and server/normalize.test.ts.

### Accessibility of the scene root and tags

**What:** Give the scene root a `role` so its label is exposed, and `aria-hidden` on the `.tag` divs (each hit button already names the agent).

**Why:** Screen readers ignore `aria-label` on a plain div and may read each agent twice (`Scene.tsx:439`).

**Context:** From the design specialist in the final review pass; not run through a screen reader.

**Effort:** S
**Priority:** P2
**Depends on:** None

**Completed:** todo-burndown step 5 (2026-10-04). Tests: src/office/machine.test.ts, src/office/Scene.a11y.test.tsx, server/feed-plugin.test.ts. Not run through a screen reader. machine.ts keeps plain objects; `openTools` and `unresolved` use own-key writes (`setOwn`) and `Object.hasOwn` reads.

### Use Map or Object.create(null) for id-keyed objects in the machine

**What:** `src/office/machine.ts` keys plain objects by transcript ids (`agents`, `returned`, `openTools`, `unresolved`).

**Why:** An id such as `__proto__` or `constructor` can collide with prototype members.

**Context:** Ids pass the string guard only, not a charset check.

**Effort:** S (human ~1h / CC ~15min)
**Priority:** P2
**Depends on:** None

**Completed:** todo-burndown step 5 (2026-10-04). Tests: src/office/machine.test.ts, src/office/Scene.a11y.test.tsx, server/feed-plugin.test.ts. Not run through a screen reader. machine.ts keeps plain objects; `openTools` and `unresolved` use own-key writes (`setOwn`) and `Object.hasOwn` reads.

### Server resends `seat` after a transcript reset

**What:** After `onReset` (truncated transcript) the server keeps the seat but the client deletes it, so the replayed agent stays unseated at the door until the stream reconnects. Have the server resend `seat` after `onReset`.

**Why:** A fresh snapshot shows a different office than the live view.

**Context:** Split from "Client ignores `gone` frames for subagents" (client half DONE, see ARCHIVE.md). Touches the D12 replay contract; found in the Phase 4 /ship review.

**Effort:** S (human ~2h / CC ~20min)
**Priority:** P2
**Depends on:** None

**Completed:** todo-burndown step 5 (2026-10-04). Tests: src/office/machine.test.ts, src/office/Scene.a11y.test.tsx, server/feed-plugin.test.ts. Not run through a screen reader. machine.ts keeps plain objects; `openTools` and `unresolved` use own-key writes (`setOwn`) and `Object.hasOwn` reads.

### Replay clocks every event at its own `ts` with no future cap

**What:** `src/office/machine.ts:205` passes `e.ts` as the clock during replay. One far-future `ts` expires every other agent in the snapshot, and the agent with the future `ts` never expires.

**Why:** Clock skew or an odd transcript line can blank the office on reconnect. The live path and the handoff-back branch already use `Math.min(ts, now)`.

**Context:** Use `Math.min(e.ts, now)` in `applyEvents` replay and optionally clamp in the server normalizer. Add a test with a future-dated event.

**Effort:** S (human ~1h / CC ~10min)
**Priority:** P2
**Depends on:** None

**Completed:** todo-burndown step 5 (2026-10-04). Tests: src/office/machine.test.ts, src/office/Scene.a11y.test.tsx, server/feed-plugin.test.ts. Not run through a screen reader. machine.ts keeps plain objects; `openTools` and `unresolved` use own-key writes (`setOwn`) and `Object.hasOwn` reads.

### Hooks adapter for exact attention and subagent lifecycle

**What:** Consent-gated Claude Code hooks (Notification, PermissionRequest, SubagentStart/Stop) that POST to the loopback feed as a second adapter behind `shared/events.ts`.

**Why:** Replaces the slice 1 heuristics (trailing "?" and tool-call timer, markers `gstack-shortcut(dec-R1)` and `gstack-shortcut(dec-R2)`) with exact signals, so the wave never fires falsely and never misses a permission prompt.

**Context:** Slice 1 reads `~/.claude/projects/**/*.jsonl` only. Pros: no false waves, resolves both shortcut markers. Cons: edits `~/.claude/settings.json`, adds an installer, a token-checked 127.0.0.1 endpoint and a hook script (about 3 files); sessions started before install stay silent. The normalized event interface already exists, so this is an added adapter; start from `shared/events.ts`. Ideas only from pixel-agents (`../pixel-agents/CLAUDE.md:30,284`), no code copied without license attribution (MIT).

**Effort:** L (human ~1.5 days / CC ~1h)
**Priority:** P2
**Depends on:** Slice 1 shipped

**Completed:** todo-burndown step 6 (2026-10-04). Server: `server/hooks-adapter.ts`, `server/hook-discovery.ts`, `POST /__office/hook` in `server/feed-plugin.ts`. Claude side: `hooks/office-hook.mjs`, `hooks/install.mjs` (print-only by default, nothing writes `~/.claude/settings.json` unless the user runs `--apply`). Machine: exact `needs_attention` in `src/office/machine.ts`. Remaining work is in the new items "Make the hooks attention mapping exact" and "Hooks adapter leftovers".

### T03 Verify the normalizer against real transcripts (DONE 2026-10-06: census script and first real-data numbers; resume only partly verified)

**Status:** DONE. Census script `server/census-transcripts.ts` (run `vp run census`, counts only). The `killed` task-notification status was fixed through the shared constant (77411df). Orphan counter noise from non-agent background completions was fixed (a95a62c). Agent-message hand-backs were classified redundant (0 of 1199 uncovered, D3 unchanged). Real-root run (one machine, Claude Code 2.1.128 to 2.1.288): 182 files, 1284 subagent files, 0 session id mismatches, 2719 agent ids all 17 characters, 0 outside the conservative character set, longest line 890298 bytes against the 4194304 byte read cap with 0 lines over, notification statuses completed 588 / failed 45 / killed 2 (enqueue only), 1203 agent-message enqueues, drift bad_shape 1 / orphan_completion 55 / unmapped_subagent_type 533. Only 3 SendMessage resumes were seen, so resume is only partly verified. T05, T10 and T06 depended on this and now carry the evidence in TODOS.md.

**What:** Run server/sanitize-fixtures.ts on a few real Claude Code transcripts (sync, async, resume) and check the output events against the committed fixtures.

**Why:** The fixtures are hand-built from a described shape; a real-file drift would go unseen until a user hits it.

**Context:** Found in the Phase 2-3 /ship review. Keep the leak check green on every new fixture.

**Effort:** S (human ~1h / CC ~15min)
**Priority:** P1
**Depends on:** None

## Completed in v0.3.0.0

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

### Door ajar frame on arrivals and departures (DONE: office-decor branch)

**Status:** DONE (2026-10-05): `DOOR_AJAR` and `doorOpen` in `src/office/`, with a floor light wedge; closed under reduced motion.

**Priority:** P4

### Wall dressing: bookshelf and picture-only posters (DONE: office-decor branch)

**Status:** DONE (2026-10-05): bookshelf and two pictures on the left wall past the window, with a date-varied palette; no text.

**Priority:** P4

### Paper hover-text with redaction (DONE in v0.9.0.0 as a closed-enum kind label, no text)

**Status:** DONE in v0.9.0.0 (`shared/events.ts`, `server/normalize.ts`, `src/office/{machine,paper,Scene}.ts(x)`, `scene.css`). Verified in code and with `vp test`, `vp run e2e` and a browser check before moving.

**What was asked:** Hover or click a handoff paper to read the subagent description and a truncated result summary, with redaction.

**What shipped instead:** Free text was rejected in the CEO review (it would reverse DESIGN Principle 4 and redaction cannot be proven complete). The paper now shows a closed-enum kind (Explore, Plan, General, Subagent) derived server-side from `subagent_type`; no description or prompt reaches the browser. Plan and decisions: `docs/designs/paper-hover-text-ceo-review.md`.

### T16 Feed server hardening: truncation detection

**What:** In `server/feed-plugin.ts`: truncation is detected only as `size < offset` (see "Detect file rotation by more than size").

**Why:** A same-size or regrown rewrite of a transcript goes unnoticed.

**Context:** Split from the Phase 4 umbrella item; session identity, Origin check and heartbeat are DONE (the earlier entries in this file).

**Effort:** S (human ~2h / CC ~20min)
**Priority:** P3
**Depends on:** None

**Status:** DONE, partial (moved 2026-10-06 as T16). Rotation is now detected by inode and head hash in `replaced()` (`server/feed-plugin.ts:638`); the same-size in-place rewrite gap stays open as T15 item 2 ("Batch B2 leftovers"). Verified by code read only.

### T19 Playwright e2e was not run for the burndown (2026-10-06)

**What:** Run `vp run e2e` once on the burndown branch before merge.

**Why:** The burndown changed `server/feed-plugin.ts` (hook route split), `src/office/TopBar.tsx`, `src/App.tsx` and `e2e/release.ts`; only unit tests (`vp test`, 1546 passed at brief 16) and `vp check` ran.

**Context:** Report: `.claude/scratch/todo-burndown-2/reports/builder-08.md` (SKIPPED).

**Effort:** S
**Priority:** P3
**Depends on:** None

**Status:** DONE (moved 2026-10-06 as T19). `vp run e2e` on main at v0.9.0.0, run in this /ship session on 2026-10-06 (all projects: core, live, twelve, stale, empty, visual): 31 passed (3.0m), exit 0. The original request (run on the burndown branch) is moot since that branch merged.

### T01 Chime control: design review and DESIGN.md entry (2026-10-06)

**Area:** Office

**What:** Review the top-bar chime toggle (speaker glyph, visible state text, blocked state) against the design system and add a DESIGN.md entry for it. A chime stored as "on" before the first click still needs two clicks to turn off (the first click retries the audio unlock).

**Why:** The control shipped in the burndown without a design review; DESIGN.md only has a short descriptive mention (Principle 3 and the Top bar entry), not a reviewed chime entry. Findings from the second /ship pass to fold in: the on state and hover copy the `.top-bar-chip` look so the toggle can read as an agent chip (`index.css:157`); the speaker glyph is a full-colour platform emoji that ignores the token colours and is the same loud-speaker in the blocked state (`TopBar.tsx:107`; use a monochrome SVG with `currentColor` and a distinct blocked glyph); the tone constants are bare literals (`chime-audio.ts:29`); `chime-audio.ts` has no test of its own (every test mocks it) and toggling off while an unlock is pending is untested.

**Context:** Files: `src/office/TopBar.tsx`, `src/index.css` (`.top-bar-chime`), `src/office/chime-logic.ts` (`nextEnabled`), `src/office/useChime.ts`. Audio and the real browser blocked state were never exercised in a browser. Reports: `.claude/scratch/todo-burndown-2/reports/builder-09.md`, `-13.md`, `-15.md`. Deferred at /ship (plan-completion gate, 2026-10-06) with the design-review findings to fold in: `aria-pressed` is true in the blocked state while no sound will play (`TopBar.tsx:101`); `.top-bar-chime:hover` hides the warn cue in the blocked state (`index.css:165`); the button has no `flex-shrink: 0` and the chips list can overlap it at the 800 px minimum with 4 chips (`index.css:143`, estimated, not measured); an unlock still pending when the user toggles off and on again can leave two unlocks running (`useChime.ts:64`, `:84`); no `webkitAudioContext` fallback and no cross-tab sync of the stored preference; `shouldChime` trusts a future-dated `waitingSince` (`chime-logic.ts`); tests missing for the 5 s window inside `createChime.notify` (`useChime.test.ts`) and for a late unlock after turning off. `runAnnouncer` and the `useCallback` wrappers in `useChime.ts:98` are small simplification advisories.

**Effort:** S
**Priority:** P1
**Depends on:** None

**Status:** DONE (moved 2026-10-06 as T01). Reviewed in `docs/designs/t01-chime-control-ceo-review.md` (D1 to D6); the DESIGN.md entry is "Chime toggle" under Components. Code: monochrome SVG glyph, no `aria-pressed`, `webkitAudioContext` fallback, cross-tab `storage` sync, `flex-shrink: 0`. Verification is in the task reports (`.claude/scratch/t01-chime-control/reports/`).
