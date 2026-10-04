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
