# BUILD_TODO

Step-by-step build order for slice 1, derived from the design doc, eng review, eng re-review and design review in [docs/designs/office-agents-isometric-office.md](docs/designs/office-agents-isometric-office.md). Work top to bottom. Tick a box when the step is done and its **Verify** line passes. Deferred ideas stay in [TODOS.md](TODOS.md); the high-level roadmap stays in [README.md](README.md).

Task ids (T1..T14, DT1..DT13) point to the design doc. Decision ids (R1..R9, 1A..7B, 8A..8C) are already approved; do not reopen them while building.

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

- [x] **1.1 Event types and tsconfig (T1).** Add `shared/events.ts` with `AgentEvent` (`agent_started`, `working`, `waiting_on_subagents`, `needs_attention`, `handoff`, `done`). Carry raw facts only: `tool` (phase, id, isSubagent) on `working`, `endsWithQuestion` on `done`. `needs_attention` (with `waitingSince` and `episodeId`) is for exact adapters; the machine owns the episode id (P1-S1-1, T12). Add `server/` and `shared/` to the tsconfig includes.
  - Files: `shared/events.ts`, `tsconfig.node.json`, `tsconfig.app.json`
  - Verify: `vp check` type-checks `server/` and `shared/`.
- [x] **1.2 Font dependency and notice (T14 / R9).** Include the OFL-1.1 licence text in `NOTICE`, not only the package name. Add `@fontsource/ibm-plex-sans`, import weights 400 and 600, system fallback in the font stack.
  - Files: `package.json`, `NOTICE`
  - Verify: no network font request in the browser.
- [x] **1.3 DESIGN.md and tokens (DT1 / 5A).** `DESIGN.md` is written (2026-10-01) and the tokens are in `src/index.css` `:root`; the Vite template styles are removed. DESIGN.md holds: evening palette, 13px tags, 14px top bar, 4.5:1 contrast, 4px spacing scale, one ease-out curve, 3 durations, font package name.
  - Files: `DESIGN.md`, `src/index.css`, `src/App.css` (deleted)
  - Verify: no hard-coded colors outside tokens.
- [x] **1.4 Apply doc amendments (T8).** Reword the Success Criteria line about wave+bubble (design doc, "Success Criteria") to the heuristic-attention wording.
  - Files: `docs/designs/office-agents-isometric-office.md`
  - Verify: wording matches "Accepted amendments".

## Phase 2: Feed (server). Can run in parallel with Phase 3 after 1.1

Amended by the phase 2 and 3 review (`docs/designs/phase-2-3-ceo-review.md`, decisions D1 to D12 and E1 to E5). Those decisions are settled; do not reopen them while building.

- [x] **2.1 Normalizer (T2, amended by D3, D7, D8, D12, E1, E3).** `normalize(state, line) -> AgentEvent[]`, stateful per file (launch ids, dedupe set, last assistant text, `finishedAtFirstSight` flag). Isolate Claude Code's file layout here. Events are built field by field through `parseAgentEvent`; no transcript text reaches an `AgentEvent`. Done on top-level assistant `stop_reason: end_turn` (E1); `endsWithQuestion` from that message's last text block, one shared trailing-`?` predicate; `system/turn_duration` ignored; a subagent file's `end_turn` is not a `done`. Sync launch (`run_in_background: false`, result `completed`) sends the parent to `waiting_on_subagents` and emits handoff out (D7). Background launch (flag absent or true, result `async_launched`) emits handoff out only. Completion is a sync `completed` result, or a `<task-notification>` `enqueue` line (tags `task-id`, `tool-use-id`, `status` only; `completed` and `failed` both emit handoff back and the subagent leaves; dedupe `task-id` + `tool-use-id`; accept only an `Agent` launch or a `SendMessage` to a known agent seen in the same file) (D3). `agent_started` is synthesized from the first parsed line of an unseen session or agent. Cold start (E3): at first sight of a file whose last record is `end_turn`, a subagent file emits nothing, a top-level file emits `agent_started` plus `done` only when its last text ends with a question. Unknown types return no event; known types with a bad shape bump a per-reason drift counter, logged rate-limited and shown at `GET /__office/status` (D12). `normalizeBatch` is used for the first read of a file.
  - Files: `server/normalize.ts`, `server/normalize.test.ts`
  - Verify: `vp test`; async launch, `failed`, SendMessage resume, duplicate copies, cold-start skip and `x?` are covered; malformed or unknown line yields no event and bumps the counter. Fixtures are synthetic pending a check against a real transcript.
- [x] **2.1b Guard hardening (D2, D11).** `parseAgentEvent` returns a fresh object with declared fields only; `isAgentEvent` is `parseAgentEvent(value) !== null`; empty-string ids rejected (`agentId` may be null); `ts` and `waitingSince` non-negative safe integers; Phase 1 tests updated; TODOS.md entry marked done.
  - Files: `shared/events.ts`, `shared/events.test.ts`, `TODOS.md`
  - Verify: `vp test`; empty `sessionId` and `ts: -5` rejected; a spread transcript entry does not carry text through.
- [x] **2.1c Fixtures (D4).** Allowlist sanitizer builds committed `.jsonl` fixtures under `server/fixtures/` (line type, role, block types, tool names, hashed ids, timestamps, `stop_reason`, `status`, `isAsync`, notification tags; text becomes `x` or `x?`). A case in `normalize.test.ts` scans fixtures for non-allowlisted strings and home paths. The fixtures are synthetic until compared with a real transcript.
  - Files: `server/sanitize-fixtures.ts`, `server/fixtures/*`, `server/normalize.test.ts`
  - Verify: `vp test`; leak scan finds no non-allowlisted text or home path.
- [x] **2.1d Shared limits (E2, E4).** `shared/tuning.ts` exports `STALE_MS` (30 min) and `ATTENTION_STALE_MS` (4 h); the machine `TUNING` spreads them and the server window imports them.
  - Files: `shared/tuning.ts`, `src/office/machine.ts`, `server/feed-plugin.ts`
  - Verify: `vp test`; the machine uses the shared values.
- [x] **2.2 Feed plugin core (T3, amended by D9, D12, E2, E3).** Vite `configureServer` plugin, skipped when `mode === "test"`. Tree walk every 5 s, active-set stat every 1 s, within a window of `ATTENTION_STALE_MS` by mtime; per-file byte offsets, buffer to last `\n`; single-flight scan; SSE at `/__office/events` with frames `{type:"snapshot",events,seats}`, `{type:"event",event}`, `{type:"seat",sessionId,desk}`, `{type:"gone",sessionId,agentId}`; atomic snapshot-then-subscribe. Configurable transcript root and clock, `scanOnce()`. Truncation reset, EACCES skip with one log line, oversize-line window doubles to a cap then drift++, symlinks not followed, ENOENT as the agent leaving, client and server close cleanup, startup failure logs and disables the feed. `GET /__office/status` (files tracked, drift by reason, last scan ms, SSE client count).
  - Files: `server/feed-plugin.ts`, `server/feed-plugin.test.ts`, `vite.config.ts`
  - Verify: `vp test` (split line, deleted file, pause/release ordering, truncation, EACCES, oversize, close cleanup, symlink).
- [x] **2.3 Loopback guard (R3 / R5, amended by D10).** HTTP 403 unless both the `Host` hostname and `req.socket.remoteAddress` are loopback (`localhost`, `127.0.0.1`, `::1`; `::ffff:127.x` for the socket), one-line reason, no data, one log line. The status endpoint uses the same guard.
  - Files: `server/feed-plugin.ts`, `server/feed-plugin.test.ts`
  - Verify: `vp test` matrix test (done).
  - Done 2026-10-02: live LAN check run, all pass (`.gstack/qa-reports/ship-functional/report.md`).
- [x] **2.4 Seat table (T10 / R8).** Server-side session-id to desk map, new agents seated beside their project, table included in every snapshot.
  - Files: `server/feed-plugin.ts`, `server/feed-plugin.test.ts`
  - Verify: desk kept after an earlier agent leaves; same-project neighbor; snapshot carries the table.

## Phase 3: Pure logic (client)

- [x] **3.1 State machine (T4 / T12, amended by D7, D8, E2, E4).** States: arriving, working, waiting-on-subagents, idle, attention, leaving. Single exported `TUNING` object. The machine owns the attention episode id and `waitingSince`; `needs_attention` is for exact adapters. Hold-down (D8): re-entry into attention within `TUNING.episodeHoldMs` (60 s) keeps `episodeId` and `waitingSince`, so a flap announces once. Two-tier expiry (E2): `TUNING.staleMs` (30 min) removes silent arriving, working and waiting-on-subagents agents (not while an unresolved subagent launch exists), `TUNING.attentionStaleMs` (4 h) removes silent attention; a new event re-arrives an expired agent. A background launch (D7) does not send the parent to waiting-on-subagents. Markers `gstack-shortcut(dec-R1)` at the tool-call timer and `gstack-shortcut(dec-R2)` at the trailing-`?` check.
  - Files: `src/office/machine.ts`, `src/office/machine.test.ts`
  - Verify: `vp test`; markers present; hold-down, each expiry and the seeded invariant test (D5: fixed seed, 1,000 sequences of 50 events) pass.
- [x] **3.2 Identity and palette (T5 / DT3 pure part / 6A).** Seeded name and gender from session id. 8 color-blind-checked shirt colors, stripe from the 9th project, collision avoidance among active projects.
  - Files: `src/office/identity.ts`, `src/office/identity.test.ts`
  - Verify: same session gives same name; 16 projects give 16 distinct (color, stripe) pairs; stable across reloads.

## Phase 4: Office UI (needs Phase 0, 2.2, 3.x)

- [x] **4.0a Style gate (Phase 0 route).** Draw, in one consistent flat style, three poses (seated typing, raised hand, walking with paper) and one full desk, shown in the room at 100% and 50% beside `docs/designs/mockup-room-variant-a.jpg` and variant B, with a basic `?art` sheet (dev only). Record the "Character geometry" table in `DESIGN.md` as the exit criterion. Design doc rows 4A and 4B already reflect this route (amended 2026-10-01). Draw at a size that stays readable at the 50% scale floor.
  - Verify: you approve the side-by-side; else fall back to hand-drawn pixel frames. Geometry table committed before 4.0b.
  - Done 2026-10-01: iso pixel sprites replaced the vector rig; user approved.
- [x] **4.0b Rest of the rig.** Remaining poses (sit, wave, carry paper, coffee, idle) in 2 authored views mirrored for the other facings; props desk, monitor, chair, door, coffee station, plants and paper; seeded appearance variants; full `?art` sheet (dev only).
  - Verify: contact sheet of all poses at 100% and 50%; 12 characters side by side at 50% stay distinguishable.
  - Done 2026-10-01: poses, props, appearance seeds and the full `?art` sheet.
- [x] **4.1 Iso projection and layout (DT8 / 2A / 6D).** Depth = x+y, 4 desks per row, rows added when full, scale to fit with a 50% floor, minimum 800x500 with "Make this window larger".
  - Files: `src/office/iso.ts`
- [x] **4.2 SSE hook (T6).** `useOffice` connects, applies the snapshot, then deltas, runs the machine, handles reconnect.
  - Files: `src/office/useOffice.ts`
  - Note (Phase 2-3 review): replay each snapshot event through `applyEvent` with its own `ts` (the machine uses min(ts, now)), and handle `gone` frames by dropping that agent.
  - Note (Phase 4 replay, D12): replay every snapshot event in snapshot order as `applyEvent(state, ev, ev.ts)` (a real `now` per event would expire the start event), then one `tick(now)` so the machine's two-tier expiry decides (30 min / 4 h by `lastEventAt`), then remove `leaving` agents outright (no walk-out). No separate event-age filter. Tests: 1 h old question kept, 1 h old tool call dropped, 1 h old working agent keeps shirt, parent link and `arrivedAt`.
- [x] **4.3 Recolor (DT3 / 4B, amended: Phase 0 chose all-drawn art).** Recolor by CSS variable on drawn characters (decision 4B already says so): `shirtVars(index, stripe)` sets `--shirt` and `--shirt-stripe`; the stripe is palette cells filled with `var(--shirt-stripe)`. Gray fallback and a dev warning for an out-of-range index.
  - Files: `src/office/poses.ts`
  - Done 2026-10-01: `shirtVars` and `--shirt`/`--shirt-stripe` on pixel cells.
- [x] **4.4 Scene and Character (T6 / T11).** Scaled sprite layer plus unscaled overlay for tags, bubbles and focus rings. Character exposes `data-state` and `data-shirt`. Desk, typing, glowing screen only while working.
  - Files: `src/office/Scene.tsx`, `src/office/Character.tsx`
  - Verify: `vp dev` with a live session shows a seated agent with `data-state`.
- [x] **4.5 Subagent walk-in and paper handoff.** Subagent: door, parent's desk (paper), an empty desk, then back to the parent (paper) and out the door; idle agents take a coffee trip; slots only as the fallback. Walking is an rAF loop (no CSS transitions); reduced motion = no walking, fade/appear.
- [x] **4.6 Wave, bubble, tags (DT5 / 1A / 2B).** Tag on hover, focus or waving. Bubble "Asking you" or "Stuck?" plus wait time, no transcript text.
- [x] **4.7 Top bar (DT4 / 1B / 3A / R5).** Status banner (refused, reconnecting, no active sessions), waiting chips longest first, chip click pulses the character, tab title `(N) Agent Office`. Wait labels update once per minute.
  - Files: `src/office/Scene.tsx`
- [x] **4.8 Reduced motion (DT6 / 6B).** Fade instead of walk, highlight handoff, no typing or bobbing, static raised hand.
- [x] **4.9 Keyboard and screen reader (DT7 / 6C).** Focus order: waiting first, then by desk. Hidden `aria-live=polite` region announces once per episode. Chips are buttons. Focus ring uses the accent token.
  - Verify: keyboard-only walkthrough announces correctly.
- [x] **4.10 Layout of door and coffee (design review 8A, DT10).** Door on the back wall at the left, coffee station on the back wall at the right, outside the desk grid; new rows grow toward the viewer.
  - Verify: adding a row does not move the door or coffee station.
- [x] **4.11 Attention cue (design review 8B, DT11).** Raised-arm pose, bubble and an accent ring under the waving agent; keep the accent hue away from the nearest shirt colors.
  - Verify: distinguishable in grayscale and against all 8 shirt colors.
- [x] **4.12 Subagent slots (design review 8C, DT12).** Two standing slots per desk, overflow queue near the door, "+N" on the parent's tag.
  - Verify: 3 subagents on one parent show 2 standing and "+1"; no overlap.
- [x] **4.13 Mockups (DT13).** Done: variant A approved and committed as `docs/designs/mockup-room-variant-a.jpg` (see `DESIGN.md` Open items for the four gaps to resolve while building).
- [x] **4.14 Mockup gaps (DESIGN.md Open items).** Resolve the four gaps seen in approved mockup A: monitors lit only while working, the waving agent's shirt not close to the accent ring, no text posters, and subagents standing in a reserved slot.
  - Verify: each gap is closed in the built scene or in a recorded decision.

## Phase 4b: Office life (branch `feat/office-life`)

Plan and decisions: `docs/designs/office-life-ceo-review.md` (settled; do not reopen while building). Follow-ups and deferred items stay in [TODOS.md](TODOS.md), "Office life".

- [x] **4b.1 Wall clock, windows and floor light.** Real local time on the clock; hour-matched window scenes (`sceneFor`), Glass tokens, floor light patch. Verify: `vp test`; `?art` sheet shows each scene; `?hour=` and `?scene=` overrides (dev only).
- [x] **4b.2 Desk kinds, working screens, paper and devices.** Tidy and cluttered desks alternate by index; working screen lines; desk paper from timestamps; subagent laptop or tablet. Files: `src/office/desk-kinds.ts`, `paper.ts`, `devices.ts`, `DeskLayer.tsx`.
- [x] **4b.3 Drink breaks.** Waiting parents take random, reload-stable breaks to the coffee machine or the water dispenser. Files: `src/office/breaks.ts`, `choreo.ts`.
- [x] **4b.4 Row growth.** Rows grow on demand up to `DESK_CAP` (24 desks) and shrink after about a minute; the room eases to its new fit. Files: `shared/tuning.ts`, `src/office/iso.ts`, `scene-model.ts`.
- [x] **4b.5 Debug hooks.** `data-*` attributes and dev-only `?scene=`, `?hour=`, `?seed=`; see DESIGN.md "Debug hooks". Files: `src/main.tsx`, `src/office/debug-hooks.test.tsx`.

## Phase 5: End to end (T7 / T13 / R4)

- [x] **5.1 Playwright and fixture.** Implemented in the working tree. Add Playwright as a devDependency, add a per-scenario server and transcript-root seam so the test needs no long waits. No `TUNING` override: fixture timestamps are shifted with per-scenario age offsets instead, and fixtures are generated at run time (no committed `e2e/fixtures/`).
  - Files: `package.json`, `playwright.config.ts`, `e2e/support.ts`
- [x] **5.2 Core E2E.** Implemented in the working tree. Asserts `data-state` per agent, plus refused-host and empty-fixture banner cases.
  - Files: `e2e/office.spec.ts`
- [x] **5.3 Extended E2E (T13).** Implemented in the working tree. Reduced motion, recolor check of `data-shirt` plus the computed shirt fill, tab title and chip order, keyboard order and tag on focus, focus after the focused agent leaves, chip case: +N overflow and narrow wrap (not scroll).
  - Verify: all E2E cases pass.
  - Note: first run `npx playwright install chromium`, then run E2E with `vp run e2e`.
  - Note: CI skips @visual until the Linux baseline from the `update-baselines` job is committed to `e2e/__screenshots__`, then remove `--grep-invert @visual` in ci.yml.

## Phase 6: Finish

- [ ] **6.1 Success criteria pass.** Tooling shipped in 0.5.0.0: `vp run criteria` (PASS, FAIL or SKIPPED per criterion), `vp run perf` and `vp run hero`, all in `e2e/release.ts`. Perf numbers are in DESIGN.md "Performance". Left: record a real-session `vp run criteria` run in docs/success-criteria.md ("Evidence" section) and the Safari perf pass.
- [x] **6.2 Housekeeping.** README roadmap ticked, `CHANGELOG.md` and `VERSION` at 0.5.0.0, `package.json` at 0.5.0.
- [x] **6.3 Next.** Phase 7 below; the row-change recalc miss is in [TODOS.md](TODOS.md) ("Row-change style recalc at 24 agents over budget (2026-10-05)"). The 24-agent miss is open; the 12-agent median is near the 16 ms line and failed the gate once in four runs (17.3 ms), so that gate is unstable until the metric or margin is tuned.

## Phase 7: Hooks adapter

- [x] **7.1 Hooks adapter.** Consent-gated Claude Code hooks as a second adapter behind `shared/events.ts` (`server/hooks-adapter.ts`, `server/hook-discovery.ts`, `POST /__office/hook`, `hooks/office-hook.mjs`, `hooks/install.mjs`). The two heuristic markers `gstack-shortcut(dec-R1)` and `gstack-shortcut(dec-R2)` stay as the fallback; an exact signal wins when the hooks supply one. Which Notification types fire for a permission prompt is still unverified; follow-ups are in [TODOS.md](TODOS.md) "Hooks adapter follow-ups".

---

## Parallel lanes (optional)

- Lane A: 1.1, 2.1, 2.2, 2.3, 2.4 (`shared/`, `server/`).
- Lane B: 0.1 (docs only), then 3.1 and 3.2 after 1.1.
- Merge, then Phase 4, then Phase 5. Phases 1.2 and 5.1 both touch `package.json`; do them in order.
