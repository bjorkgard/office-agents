# TODOS

## Feed

### Hooks adapter for exact attention and subagent lifecycle

**What:** Consent-gated Claude Code hooks (Notification, PermissionRequest, SubagentStart/Stop) that POST to the loopback feed as a second adapter behind `shared/events.ts`.

**Why:** Replaces the slice 1 heuristics (trailing "?" and tool-call timer, markers `gstack-shortcut(dec-R1)` and `gstack-shortcut(dec-R2)`) with exact signals, so the wave never fires falsely and never misses a permission prompt.

**Context:** Slice 1 reads `~/.claude/projects/**/*.jsonl` only. Pros: no false waves, resolves both shortcut markers. Cons: edits `~/.claude/settings.json`, adds an installer, a token-checked 127.0.0.1 endpoint and a hook script (about 3 files); sessions started before install stay silent. The normalized event interface already exists, so this is an added adapter; start from `shared/events.ts`. Ideas only from pixel-agents (`../pixel-agents/CLAUDE.md:30,284`), no code copied without license attribution (MIT).

**Effort:** L (human ~1.5 days / CC ~1h)
**Priority:** P2
**Depends on:** Slice 1 shipped

### Event guard hardening before the first producer

**What:** In `shared/events.ts`, add a `parseAgentEvent` that returns a fresh object holding only the declared fields (including the nested `tool`),. The normalizer (BUILD_TODO 2.1) must build each event field by field, never spread raw transcript JSON.

**Why:** The guard ignores extra fields and returns the original object, so a spread transcript entry would carry assistant text past the guard, against the file's "no transcript text" rule. Neither is reachable today (no producer exists).

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

## Completed
