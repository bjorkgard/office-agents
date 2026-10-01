# BUILD_TODO

Step-by-step build order for slice 1, derived from the design doc, eng review, eng re-review and design review in [docs/designs/office-agents-isometric-office.md](docs/designs/office-agents-isometric-office.md). Work top to bottom. Tick a box when the step is done and its **Verify** line passes. Deferred ideas stay in [TODOS.md](TODOS.md); the high-level roadmap stays in [README.md](README.md).

Task ids (T1..T14, DT1..DT9) point to the design doc. Decision ids (R1..R9, 1A..7B, 8A..8C) are already approved; do not reopen them while building.

**Always:** run `vp install` after pulling, `vp check` and `vp test` before each commit. Import tests from `vite-plus/test`. No enums (`erasableSyntaxOnly`); use string-literal unions. `machine.ts` takes `now`, never `setTimeout`.

---

## Phase 0: Gate the art (blocks Phase 4)

- [x] **0.1 Sprite pack check (T9 / DT2 / 7B).** Done 2026-10-01. Notes in `docs/designs/phase-0-sprite-notes.md`. Verdict: no single CC0 pack has sit, typing and wave poses, so all characters and props are drawn in one consistent style (decision 7B applied; design doc rows 4A and 4B amended).
  - Files: `docs/designs/phase-0-sprite-notes.md`, `NOTICE`
  - Verify: verdict and route recorded in the notes.
- [x] **0.1d Commit the assets (eng review R1).** Not applicable under the all-drawn route: no third-party sheets to copy. Drawn assets, when built, go in `src/assets/office/` (same rule).
  - Verify: `vp check` passes with the assets staged; sizes listed in the notes.
- [x] **0.1a Furniture check (CEO review X1).** In the same notes, list whether the pack ships desk, monitor, coffee station, door and paper sprites. Use the result to settle the open coffee-station and door placement (step 4.10).
  - Verify: notes list each prop as present or missing; missing props get the vector fallback.
- [x] **0.1b Recolor dry-run (CEO review X2).** Done on the Hormelz sprite, which is not used; redo on the drawn character in step 4.3. Throwaway script (not in `src/`) swaps the shirt band on one idle frame to all 8 palette colors plus the stripe variant; save a contact sheet PNG in `docs/designs/`.
  - Verify: no visible bleed into skin, hair or outline on any of the 9 variants.
- [x] **0.1c Facing and scale check (CEO review X3).** Done on the Hormelz sprite, which is not used; redo on the drawn sprite size in step 4.4. Record walk directions (or mirroring), native sprite height in px, and a screenshot of 12 sprites at 50% scale beside 12px text.
  - Verify: characters stay distinguishable at 50%; both walk directions exist or mirror cleanly.

## Phase 1: Foundations

- [ ] **1.1 Event types and tsconfig (T1).** Add `shared/events.ts` with `AgentEvent` (`agent_started`, `working`, `waiting_on_subagents`, `needs_attention`, `handoff`, `done`). Include `waitingSince` and an attention episode id (T12). Add `server/` and `shared/` to the tsconfig includes.
  - Files: `shared/events.ts`, `tsconfig.node.json`, `tsconfig.app.json`
  - Verify: `vp check` type-checks `server/` and `shared/`.
- [ ] **1.2 Font dependency and notice (T14 / R9).** Include the OFL-1.1 licence text in `NOTICE`, not only the package name. Add `@fontsource/ibm-plex-sans`, import weights 400 and 600, system fallback in the font stack.
  - Files: `package.json`, `NOTICE`
  - Verify: no network font request in the browser.
- [ ] **1.3 DESIGN.md and tokens (DT1 / 5A).** `DESIGN.md` is written (2026-10-01); still to do: replace the Vite template styles with `:root` variables. DESIGN.md holds: evening palette, 13px tags, 14px top bar, 4.5:1 contrast, 4px spacing scale, one ease-out curve, 3 durations, font package name.
  - Files: `DESIGN.md`, `src/index.css`, `src/App.css`
  - Verify: no hard-coded colors outside tokens.
- [ ] **1.4 Apply doc amendments (T8).** Reword the Success Criteria line about wave+bubble (design doc, "Success Criteria") to the heuristic-attention wording.
  - Files: `docs/designs/office-agents-isometric-office.md`
  - Verify: wording matches "Accepted amendments".

## Phase 2: Feed (server). Can run in parallel with Phase 3 after 1.1

- [ ] **2.1 Normalizer (T2).** Line to `AgentEvent | null` plus a drift counter. Isolate Claude Code's file layout here. Subagent completion is the parent `tool_result` with `toolUseResult.agentId`.
  - Files: `server/normalize.ts`, `server/normalize.test.ts`
  - Verify: `vp test`; malformed or unknown line returns `null` and bumps the counter.
- [ ] **2.2 Feed plugin core (T3).** Vite `configureServer` plugin: ~1 s stat scan inside an mtime window, per-file byte offsets, buffer to last `\n`, SSE at `/__office/events` with a bounded snapshot plus deltas. Configurable transcript root. Handle ENOENT as the agent leaving.
  - Files: `server/feed-plugin.ts`, `vite.config.ts`
  - Verify: tailer cases (split line, deleted file) pass in `vp test`.
- [ ] **2.3 Loopback guard (R3 / R5).** Non-loopback host (anything but `localhost`, `127.0.0.1`, `::1`): HTTP 403, one-line reason, no data, one log line.
  - Files: `server/feed-plugin.ts`, `server/feed-plugin.test.ts`
  - Verify: test asserts 403 on non-loopback and serving on loopback; manual `vp dev --host` returns 403.
- [ ] **2.4 Seat table (T10 / R8).** Server-side session-id to desk map, new agents seated beside their project, table included in every snapshot.
  - Files: `server/feed-plugin.ts`, `server/feed-plugin.test.ts`
  - Verify: desk kept after an earlier agent leaves; same-project neighbor; snapshot carries the table.

## Phase 3: Pure logic (client)

- [ ] **3.1 State machine (T4 / T12).** States: arriving, working, waiting-on-subagents, idle, attention, leaving. Single exported `TUNING` object. Attention episode id so flaps announce once. Add the markers `gstack-shortcut(dec-R1)` at the tool-call timer and `gstack-shortcut(dec-R2)` at the trailing-`?` check.
  - Files: `src/office/machine.ts`, `src/office/machine.test.ts`
  - Verify: `vp test`; markers present; one announce per episode.
- [ ] **3.2 Identity and palette (T5 / DT3 pure part / 6A).** Seeded name and gender from session id. 8 color-blind-checked shirt colors, stripe from the 9th project, collision avoidance among active projects.
  - Files: `src/office/identity.ts`, `src/office/identity.test.ts`
  - Verify: same session gives same name; 16 projects give 16 distinct (color, stripe) pairs; stable across reloads.

## Phase 4: Office UI (needs Phase 0, 2.2, 3.x)

- [ ] **4.0 Draw the art (Phase 0 route).** Draw, in one consistent flat style at 4 isometric facings: characters with poses sit, type, wave, walk, carry paper, coffee and idle; props desk, monitor, chair, door, coffee station, plants and paper. Design doc rows 4A and 4B already reflect this route (amended 2026-10-01). Draw at a size that stays readable at the 50% scale floor.
  - Verify: contact sheet of all poses at 100% and 50%; 12 characters side by side at 50% stay distinguishable.
- [ ] **4.1 Iso projection and layout (DT8 / 2A / 6D).** Depth = x+y, 4 desks per row, rows added when full, scale to fit with a 50% floor, minimum 800x500 with "Make this window wider".
  - Files: `src/office/iso.ts`
- [ ] **4.2 SSE hook (T6).** `useOffice` connects, applies the snapshot, then deltas, runs the machine, handles reconnect.
  - Files: `src/office/useOffice.ts`
- [ ] **4.3 Recolor (DT3 / 4B, amended: Phase 0 chose all-drawn art).** Recolor by variable or fill on drawn characters instead of a pixel key-color swap (decision 4B already says so). Cache the recolored result per project, built once on first sight.
  - Files: `src/office/recolor.ts`
- [ ] **4.4 Scene and Character (T6 / T11).** Scaled sprite layer plus unscaled overlay for tags, bubbles and focus rings. Character exposes `data-state` and `data-shirt`. Desk, typing, glowing screen only while working.
  - Files: `src/office/Scene.tsx`, `src/office/Character.tsx`
  - Verify: `vp dev` with a live session shows a seated agent with `data-state`.
- [ ] **4.5 Subagent walk-in and paper handoff.** Subagents stand beside the parent; paper moves out and back. CSS transforms, no per-frame React state.
- [ ] **4.6 Wave, bubble, tags (DT5 / 1A / 2B).** Tag on hover, focus or waving. Bubble "Asking you" or "Stuck?" plus wait time, no transcript text.
- [ ] **4.7 Top bar (DT4 / 1B / 3A / R5).** Status banner (refused, reconnecting, no active sessions), waiting chips longest first, chip click pulses the character, tab title `(N) Agent Office`. Wait labels update once per minute.
  - Files: `src/office/Scene.tsx`
- [ ] **4.8 Reduced motion (DT6 / 6B).** Fade instead of walk, highlight handoff, no typing or bobbing, static raised hand.
- [ ] **4.9 Keyboard and screen reader (DT7 / 6C).** Focus order: waiting first, then by desk. Hidden `aria-live=polite` region announces once per episode. Chips are buttons. Focus ring uses the accent token.
  - Verify: keyboard-only walkthrough announces correctly.
- [ ] **4.10 Layout of door and coffee (design review 8A, DT10).** Door on the back wall at the left, coffee station on the back wall at the right, outside the desk grid; new rows grow toward the viewer.
  - Verify: adding a row does not move the door or coffee station.
- [ ] **4.11 Attention cue (design review 8B, DT11).** Raised-arm pose, bubble and an accent ring under the waving agent; keep the accent hue away from the nearest shirt colors.
  - Verify: distinguishable in grayscale and against all 8 shirt colors.
- [ ] **4.12 Subagent slots (design review 8C, DT12).** Two standing slots per desk, overflow queue near the door, "+N" on the parent's tag.
  - Verify: 3 subagents on one parent show 2 standing and "+1"; no overlap.
- [x] **4.13 Mockups (DT13).** Done: variant A approved (see `DESIGN.md` Open items for the four gaps to resolve while building).
- [ ] **4.14 Mockup gaps (DESIGN.md Open items).** Resolve the four gaps seen in approved mockup A: monitors lit only while working, the waving agent's shirt not close to the accent ring, no text posters, and subagents standing in a reserved slot.
  - Verify: each gap is closed in the built scene or in a recorded decision.

## Phase 5: End to end (T7 / T13 / R4)

- [ ] **5.1 Playwright and fixture.** Add Playwright as a devDependency, record a fixture transcript under `e2e/fixtures/`, add a `TUNING` override and transcript-root seam so the test needs no long waits.
  - Files: `package.json`, `e2e/fixtures/*`
- [ ] **5.2 Core E2E.** Asserts `data-state` per agent, plus refused-host and empty-fixture banner cases.
  - Files: `e2e/office.spec.ts`
- [ ] **5.3 Extended E2E (T13).** Reduced motion, recolor pixel probe plus `data-shirt`, tab title and chip order, keyboard order and tag on focus.
  - Verify: all E2E cases pass.

## Phase 6: Finish

- [ ] **6.1 Success criteria pass.** Live session appears within seconds with no config; subagent walk-in and handoff visible; wave fires on a real attention request; 12 agents on screen hold up.
- [ ] **6.2 Housekeeping.** Tick the README roadmap items, update `CHANGELOG.md` and `VERSION`, move finished items out of this file.
- [ ] **6.3 Next.** Pick from [TODOS.md](TODOS.md): hooks adapter first (resolves both shortcut markers).

---

## Parallel lanes (optional)

- Lane A: 1.1, 2.1, 2.2, 2.3, 2.4 (`shared/`, `server/`).
- Lane B: 0.1 (docs only), then 3.1 and 3.2 after 1.1.
- Merge, then Phase 4, then Phase 5. Phases 1.2 and 5.1 both touch `package.json`; do them in order.
