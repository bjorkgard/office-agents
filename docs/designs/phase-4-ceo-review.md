# Phase 4 (Office UI): CEO review, SELECTIVE EXPANSION

Branch: `feat/phase-4-office-ui` (from `main` at 0f8b670) | Date: 2026-10-02 | Reviewer: /plan-ceo-review
Plan under review: `BUILD_TODO.md` "Phase 4: Office UI" (open: 4.1, 4.2, 4.4 to 4.12, 4.14; done: 4.0a, 4.0b, 4.3, 4.13) with design doc `docs/designs/office-agents-isometric-office.md` (rows 1A..8C, DT1..DT13, R1..R9 stay settled and are not reopened) and `DESIGN.md`.
Review depth: implementation-ready (task level). Mode: SELECTIVE EXPANSION (user choice at D1; recommendation was the same).

## System audit (2026-10-02)

- `src/App.tsx` is an `<h1>`. Every Phase 4 file is new: `iso.ts`, `useOffice.ts`, `Scene.tsx`, `Character.tsx` (about 4 files plus tests; machine, identity, poses, sprites, props, ArtSheet already exist).
- Reusable: `machine.ts` (`createOffice`, `applyEvent`, `tick`, `TUNING`), `identity.ts` (no consumer, TODOS "Wire identity.ts or drop it"), `poses.ts` (`poseForState`, `nextDisplayed`, `shirtVars`, no production caller for the first two), `sprites.ts`/`props.ts`/`CharacterRig.tsx`, `ArtSheet.tsx` (dev scene reference), feed at `server/feed-plugin.ts` (SSE `snapshot`, deltas, `gone`).
- Open TODOS that land in Phase 4: M8 displayed-state hook (P1), M9 `placeBubbles` (P1, needs 4.1), "Wire identity.ts or drop it" (P2), M10 profiling (stays deferred in TODOS.md, belongs with 4.4; not in the amended scope). Deferred and staying deferred: paper hover-text (P3, privacy), attention chime (P4).
- Learnings applied: `shared-limits-across-tsconfigs` (client must not import `server/`; limits come from `shared/`), `art-test-raw-reads` (edits to DESIGN.md, main.tsx, ArtSheet must rerun `art.test.ts`).
- Recent churn: package.json, DESIGN.md, main.tsx. No stashes. No design-doc handoff note found.
- Landscape check: skipped (Aside not probed this run). The landscape was covered in the design doc "Prior Art" and the Phase 0 and character-art reviews. Proceeding on in-repo evidence.

## Taste calibration

- Follow: `machine.ts` (pure, every function takes `now`, no timers) and `shared/tuning.ts` (one definition for shared limits).
- Follow: `poses.ts` `nextDisplayed` (pure swap rule, hook is a thin shell).
- Avoid: reading wall-clock inside render code; all time enters through `now`.

## Decision ledger

| ID and owner  | Contract and evidence                                                                                                                                                                                                                                                       | Current                            | Proposed                                                                     | Status   | Exact approval and scope                                                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P4-MODE (0E)  | Mode. Evidence: about 4 to 9 new files, first user-visible capability on a settled design.                                                                                                                                                                                  | recommendation SELECTIVE EXPANSION | SELECTIVE EXPANSION                                                          | approved | D1 answer "SELECTIVE EXPANSION (recommended)". Mode only.                                                                                                                                  |
| P4-BASE (0A)  | `BUILD_TODO.md` 4.1, 4.2, 4.4 to 4.12, 4.14 as written, from design rows DT1 to DT13 and R1 to R9.                                                                                                                                                                          | 12 open tasks                      | unchanged                                                                    | approved | Approved in earlier design and eng reviews. Not reopened.                                                                                                                                  |
| P4-ADD-1 (0G) | Verifying 4.4 to 4.12 needs a live session with real timing (10 s tool timer, 1.5 s arrival). No scripted source exists; 5.1 adds a fixture only for Playwright.                                                                                                            | no scripted feed                   | dev-only `?demo` scripted event player feeding `useOffice`                   | approved | D2 answer "Add to this plan's scope". Dev-only (`import.meta.env.DEV`), `demo.ts` + `demo.test.ts` + `main.tsx` branch.                                                                    |
| P4-ADD-2 (0G) | TODOS P2 "Wire identity.ts or drop it": `identity.ts` has no consumer; tags (4.6) and shirt choice (4.4) need a name and color. (Round 1 correction: only `poses.ts` exports `shirtFor` now; the duplicate-name claim in TODOS.md is stale, so there is nothing to rename.) | not in Phase 4                     | wire `identity.ts` (`identityFor`, `pickShirt`) in 4.4/4.6                   | approved | D3 answer "Add to this plan's scope". Consume `identity.ts` in 4.4/4.6, (rename dropped, stale premise).                                                                                   |
| P4-ADD-3 (0G) | TODOS P1 M8: `nextDisplayed` and `poseForState` have no production caller; state changes would cut poses mid-stride.                                                                                                                                                        | not in Phase 4                     | `Character.tsx` displayed-state hook using `nextDisplayed`                   | approved | D4 answer "Add to this plan's scope". Hook in `Character.tsx` + tests.                                                                                                                     |
| P4-ADD-4 (0G) | TODOS P1 M9: bubbles and 24 px hit areas must hold at 50% scale with 12 agents.                                                                                                                                                                                             | not in Phase 4                     | `placeBubbles` in `iso.ts` plus `iso.test.ts`                                | approved | D5 answer "Add to this plan's scope". `placeBubbles` + `iso.test.ts` in 4.1/4.6.                                                                                                           |
| P4-ADD-5 (0G) | Tab title `(N) Agent Office` ships in 4.7; a hidden tab still shows no color cue.                                                                                                                                                                                           | title count only                   | favicon attention dot while N > 0                                            | approved | D6 answer "Add to this plan's scope". Static dot, same N as the title, in 4.7.                                                                                                             |
| P4-ADD-6 (0G) | DESIGN.md mood: evening room. Static room between events reads dead when nothing is happening (the empty and quiet cases are common).                                                                                                                                       | static between states              | ambient life: coffee steam, plant sway, clock tick; off under reduced motion | approved | D7 answer "Add to this plan's scope" (recommendation was Defer; the user chose Add). CSS-only ambient loops (coffee steam, plant sway, clock tick) in 4.4, off under reduced motion (4.8). |

## Answered: P4-ADD-1 (D2)

Answer: "Add to this plan's scope (recommended)". Accepted: dev-only `?demo` scripted event player.

## Answered: P4-ADD-2 (D3)

Answer: "Add to this plan's scope (recommended)". Accepted: wire `identity.ts` into 4.4/4.6. (Round 1: the rename part was a stale premise and is dropped as a no-op.)

## Answered: P4-ADD-3 (D4)

Answer: "Add to this plan's scope (recommended)". Accepted: displayed-state hook in `Character.tsx`.

## Answered: P4-ADD-4 (D5)

Answer: "Add to this plan's scope (recommended)". Accepted: `placeBubbles` and `iso.test.ts`.

## Answered: P4-ADD-5 (D6)

Answer: "Add to this plan's scope (recommended)". Accepted: static favicon dot in 4.7.

## Answered: P4-ADD-6 (D7)

Answer: "Add to this plan's scope" (user override of the Defer recommendation). Accepted: ambient life, reduced-motion aware.

## Amended Phase 4 scope (working plan, after Step 0)

Base: `BUILD_TODO.md` 4.1, 4.2, 4.4 to 4.12, 4.14 as written (unchanged). Accepted additions, each folded into the item that owns the file:

| Item                        | Addition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Files                                                                                                                                     | Verify                                                                                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1                         | `placeBubbles` pure layout (P4-ADD-4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `src/office/iso.ts`, `src/office/iso.test.ts`                                                                                             | tests for 0, 1, 2, 3 overlapping bubbles; hit-area (character and bubble) centers at least 24 px apart (Euclidean) at scale 0.5 with 12 agents, as TODOS M9 states                                                                                                  |
| 4.4                         | Consume `identity.ts` for name (`identityFor`) and shirt (`pickShirt(projectPath, held)`) (P4-ADD-2). Inputs: `projectPath` arrives only on `agent_started` and `Agent` stores `projectId` (machine.ts:38), so 4.2/4.4 must carry `projectPath` per project; one shirt per distinct project (not per agent): projects ordered by their earliest active agent `arrivedAt`, then `projectId`; each project calls `pickShirt(projectPath, held)` with `held` = shirts of earlier projects, and all agents of a project share the result, so a parent and its subagent match and a reload replay yields the same colors | `src/office/Scene.tsx`, `src/office/Character.tsx`                                                                                        | same agent shows the same name after reload; colors are deterministic for a given active set and order; `vp check` passes                                                                                                                                           |
| 4.4                         | Displayed-state hook calling `nextDisplayed` (P4-ADD-3, P4-FIX-3): timing in a pure controller with injected clock, hook only wires events                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | pure controller module (name decided at build), `src/office/Character.tsx` + test                                                         | swap waits for loop end, forced at `SWAP_TIMEOUT_MS`, immediate under reduced motion, current pose on tab return                                                                                                                                                    |
| after 4.10 (new step 4.10a) | Ambient loops: coffee steam, plant sway on existing props, wall clock tick; new `CLOCK` and `STEAM` grids; clock is decorative at a fixed pace, never real time (P4-ADD-6, P4-FIX-4)                                                                                                                                                                                                                                                                                                                                                                                                                                | `src/office/props.ts`, Scene styles, `DESIGN.md` (Motion: add ambient loops to the named loop exception; Open items: clock now specified) | none under `prefers-reduced-motion`; does not change `data-state` of any agent; `art.test.ts` rerun and passes (it reads DESIGN.md)                                                                                                                                 |
| 4.7                         | Static favicon dot while waiting count N > 0, same N as tab title (P4-ADD-5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `src/office/Scene.tsx` or a small helper + test of the pure rule                                                                          | dot on when N > 0, off at 0; no blink                                                                                                                                                                                                                               |
| 4.4 to 4.12                 | Dev-only `?demo` scripted event player (P4-ADD-1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `src/office/demo.ts`, `src/office/demo.test.ts`, `src/main.tsx`                                                                           | `useOffice` takes an event source (default SSE; demo passes a scripted source), so no fork of the hook; `vp dev` at `?demo` shows arrive, work, wave, subagent handoff; a built `dist/` has no `__OFFICE_DEMO__` literal (grep; the marker is a const in `demo.ts`) |

Constraints carried: client code does not import `server/` (limits come from `shared/`); edits to DESIGN.md, main.tsx or ArtSheet rerun `art.test.ts`; wall-clock enters only through `now`.

## Spec review round 1 (2026-10-02, refuter agent a46631bc04f1c5841, FAIL 6/10)

Verified by me against code: finding 4 (only `poses.ts:37` exports `shirtFor`), 1 and 6 (`identityFor(sessionId)`, `pickShirt(projectPath, held)` at identity.ts:27/43), 9 (no jsdom or happy-dom in node_modules; tests use `renderToStaticMarkup`). Not run: finding 3 replay (code reading only).

Applied as factual corrections, no new behavior: finding 4 (rename dropped), 5 (M10 stays deferred), 6 (inputs and deterministic `held` order stated), 7 (Euclidean center distance as TODOS M9 states, elements named), 8 (event-source seam and dist grep check stated). BUILD_TODO.md:5 "DT1..DT9" label is stale (design doc goes to DT13); wording only, pending, owner: next editor of BUILD_TODO.md.

| ID and owner     | Contract and evidence                                                                                                                                                                                                                     | Current                         | Proposed                                                                             | Status   | Exact approval and scope                                                                                                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P4-FIX-1 (Sec 1) | Finding 1+2. `identityFor(sessionId)` ignores `agentId`, and subagents share the parent's sessionId, so every subagent tag shows the parent's name (4.6). TODOS "identityFor covers only 24 identities" says decide in Phase 4.           | name keyed by session           | key by agent key (`sessionId:agentId`); repeats beyond 24 concurrent agents accepted | approved | D8 answer "Seed from agent key". Call site passes `agentKey(sessionId, agentId)` (machine.ts:70, joins with `\u0000`) to `identityFor`; repeats past 24 concurrent agents accepted.                                                        |
| P4-FIX-2 (Sec 4) | Finding 3. BUILD_TODO.md:89 drops snapshot events older than `STALE_MS` (30 min), but attention agents live `ATTENTION_STALE_MS` (4 h, machine.ts:17) and the server window is 4 h. A question asked 1 h ago would vanish after a reload. | drop all older than `STALE_MS`  | attention events stay replayable up to `ATTENTION_STALE_MS`                          | approved | D9 answer "Keep attention agents on replay". Outcome: a waiting agent survives reload up to `ATTENTION_STALE_MS`; a stale non-attention agent does not appear. Mechanism superseded by P4-FIX-5 (D12). Amends the 4.2 Phase 4 replay note. |
| P4-FIX-3 (Sec 6) | Finding 9. No DOM test environment (no jsdom/happy-dom); the approved M8 hook test needs `animationiteration`, timers and `visibilitychange`.                                                                                             | hook test unspecified           | see D10                                                                              | approved | D10 answer "Pure controller plus thin hook". Swap timing (loop end, 900 ms force, reduced motion, tab return) lives in a pure function with an injected clock, unit tested; `Character.tsx` only wires events; no new devDependency.       |
| P4-FIX-4 (Sec 5) | Findings 10+11. No clock or steam prop exists in `props.ts` (DOOR, COUNTER, COFFEE__, PLANT__, PAPER); the coffee station is placed in 4.10 and reduced motion lands in 4.8.                                                              | ambient in 4.4, art unspecified | see D11                                                                              | approved | D11 answer "All three, after 4.10, with new props". `CLOCK` and `STEAM` grids in `props.ts`, plant sway on existing props; placed after 4.10; clock is decorative at a fixed pace, never real time; `art.test.ts` rerun.                   |

## Answered: P4-FIX-1 (D8)

Answer: "Seed from agent key (recommended)".

## Answered: P4-FIX-2 (D9)

Answer: "Keep attention agents on replay (recommended)".

## Answered: P4-FIX-3 (D10)

Answer: "Pure controller plus thin hook (recommended)".

## Answered: P4-FIX-4 (D11)

Answer: "All three, after 4.10, with new props".

## Amended by round 1 decisions

- 4.2: reload replays every snapshot event in snapshot order (already sorted by ts) as `applyEvent(state, ev, ev.ts)`, because `applyEvent` itself ticks at the `now` it is given (machine.ts:271) and a real `now` would expire a 1 h old start before its later events arrive; then one `tick(now)` and removes `leaving` agents outright; no separate event-age filter. Tests: 1 h old question kept, 1 h old tool call dropped, 1 h old working agent keeps shirt, parent link and `arrivedAt` (P4-FIX-2 outcome, P4-FIX-5 mechanism, D9 and D12).
- 4.4/4.6: name seeded from `agentKey(sessionId, agentId)`; repeats past 24 concurrent agents accepted (P4-FIX-1, D8).
- 4.4: pose-swap timing is a pure controller (injected clock); no new devDependency (P4-FIX-3, D10).
- New step 4.10a: ambient life with new `CLOCK` and `STEAM` props, after 4.10 and 4.8 (P4-FIX-4, D11).

## Spec review round 2 (2026-10-02, refuter agent a123e6017fb996fa4, FAIL 6/10)

Verified by me: `agentKey` joins with `\u0000` (machine.ts:70); `expired` rule in `pass` is two-tier by `lastEventAt` and state (machine.ts:315-320); DESIGN.md:185 lists loops "walk, typing, wave" only.

Applied as factual corrections, no new behavior: stale rename text removed; shirt rule restated per project (matches 3.2 "among active projects"); `agentKey` used instead of a `sessionId:agentId` string; demo grep literal named (`__OFFICE_DEMO__`); DESIGN.md Motion amendment and `art.test.ts` rerun added to the ambient step (a dependent-text fix to the D7/D11 approval, not a scope change).

| ID and owner     | Contract and evidence                                                                                                                                                                                                                                                                                                                                                                                                                   | Current                                                          | Proposed                                                                                                                                                                                                         | Status   | Exact approval and scope                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P4-FIX-5 (Sec 4) | Reopens D9's mechanism only (outcome unchanged: waiting agents survive reload). A per-event drop of snapshot events older than `STALE_MS` also drops the `agent_started` of a long-running agent (feed-plugin.ts:599, 656 keeps one per live agent). `projectPath` and `parentAgentId` exist only on that event (events.ts:31-32), so a session started 1 h ago comes back with a gray shirt, no parent link and a shifted `arrivedAt`. | drop events older than `STALE_MS` unless agent ends in attention | replay every snapshot event as `applyEvent(state, ev, ev.ts)` in snapshot order, then one `tick(now)` so the machine's own expiry decides (30 min / 4 h by `lastEventAt`), then remove `leaving` agents outright | approved | D12 answer "Replay all, then tick". Supersedes the mechanism in P4-FIX-2 (outcome unchanged). Apply every snapshot event as `applyEvent(state, ev, ev.ts)` in snapshot order (round 3 pin: a real `now` per event would expire the start event), then one `tick(now)` so the machine's two-tier expiry decides, remove `leaving` agents outright (no walk-out); test adds an hour-old working agent that keeps its shirt, parent link and `arrivedAt`. |

## Answered: P4-FIX-5 (D12)

Answer: "Replay all, then tick (recommended)".

## Spec review round 3 (final, 2026-10-02, refuter agent a0db754f0d9391fbe, FAIL 7/10)

Verified by me: `applyEvent` ends with `tick(s, now, true)` (machine.ts:271), so replaying with a real `now` per event expires a 1 h old start event before its later events arrive. Reviewer ran machine.ts in memory (no files) and confirmed: parent kept and `arrivedAt` = now - 1 h only with `applyEvent(s, ev, ev.ts)` then one `tick(now)`.

Applied as pins of D12's mechanism, no change to what D12 decided: replay order and clock stated in 4.2 above. BUILD_TODO.md lines 88-89 still carry the old per-event rule; pending edit, owner: implementer of 4.2 (replace the "snapshot events older than STALE_MS" clause with the D12 mechanism). Noted, not acted on: a shirt can change on screen when an earlier project leaves (DESIGN.md has no stability rule; open question for the build); 4.10a reads "after 4.10" and "after 4.10 and 4.8", harmless since 4.8 precedes 4.10.

Spec review stops here (3 launches reached). Latest reviewer grade 7/10, FAIL; both of its issues are applied in text and were not re-reviewed.

## Section 1: Architecture (2026-10-02)

Findings: S1-1 client keeps the server `seats` map (snapshot `seats`, `seat` frames, drop on top-level `gone`); server sends `seat` before the first event (feed-plugin.ts:754-757). S1-2 `DESKS_PER_ROW = 4` is private to `server/feed-plugin.ts:44`; `iso.ts` needs it. No findings: SPOF is the dev-server feed only; rollback is a branch revert.

| ID and owner       | Contract and evidence                                                                                                                                                                                                         | Current                 | Proposed                                     | Status   | Exact approval and scope                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P4-S1-1 (4.1, 4.2) | Client holds `seats` (sessionId to desk); snapshot replaces it, `seat` sets it, top-level `gone` deletes it; a missing seat is a test case (agent shown at first free desk, no crash). Evidence: feed-plugin.ts:754-757, 821. | unspecified             | state in 4.1/4.2                             | pending  | Dependent text of base tasks 4.1/4.2 and DESIGN.md "Scene rules" (seats survive reload); owner: 4.2 implementer.                                         |
| P4-S1-2 (4.1)      | `DESKS_PER_ROW` shared by server seat rule and client layout; learning `shared-limits-across-tsconfigs`.                                                                                                                      | server-private constant | move to `shared/tuning.ts`, import from both | approved | D14 answer "Move to shared/tuning.ts". `DESKS_PER_ROW` exported from `shared/tuning.ts`; feed-plugin.ts and `iso.ts` import it; feed-plugin tests rerun. |

## Answered: P4-S1-2 (D14)

Answer: "Move to shared/tuning.ts (recommended)".

## Section 2: Error & Rescue map (2026-10-02)

```
 CODEPATH               | WHAT CAN GO WRONG                          | CLASS
 -----------------------|--------------------------------------------|--------------------------
 useOffice connect      | HTTP 403 (non-loopback host)               | EventSource error, CLOSED, no status visible
                        | 503 too many clients (MAX_SSE_CLIENTS 8)   | same
                        | network drop / dev server restart          | EventSource error, CONNECTING (auto retry)
 frame parse            | data line not JSON                         | SyntaxError
                        | unknown frame `type`                       | unknown shape
                        | event fails parseAgentEvent                | invalid event
 machine                | applyEvent / tick throws                   | TypeError etc (bug)
 snapshot replay        | empty snapshot, or only stale agents       | empty
 render                 | out-of-range shirt index                   | dev warning, gray (4.3 done)
 favicon / title        | document.head unavailable (test/SSR)       | guarded no-op
 demo source            | n/a in production                          | dev only

 CLASS                  | RESCUED? | RESCUE ACTION                              | USER SEES
 -----------------------|----------|--------------------------------------------|----------------------
 CLOSED after error     | N <- GAP | none specified; DESIGN says "after retries bar shows refused" but EventSource does not retry a non-2xx | blank or stale room
 CONNECTING             | Y        | browser retries; bar "Reconnecting", scene dimmed, last state kept | banner
 SyntaxError / unknown  | N <- GAP | unspecified                                | silent stale or crash
 invalid event          | N <- GAP | unspecified (parseAgentEvent exists in shared/) | silent
 machine throw          | N <- GAP | no boundary                                | white screen
 empty snapshot         | Y        | "No active Claude Code sessions" (R5)      | banner
```

- **CRITICAL GAP, S2-1.** `EventSource` fires one undifferentiated `error`; after a non-2xx it goes CLOSED and never retries, and the page cannot read the status. The R5 banner ("refused") and the DESIGN table ("after retries") cannot be built as written. `/__office/status` is loopback-guarded too, so a probe returns 403 exactly when the feed refuses.
- **CRITICAL GAP, S2-2.** No rescue is specified for a bad frame, an invalid event, or a thrown machine step. A thrown `applyEvent` inside a React state update blanks the whole page.
- No catch-all: name `SyntaxError` for the JSON parse; validate with `parseAgentEvent`.

| ID and owner       | Contract and evidence                                                                                                           | Current                                     | Proposed                                                                                                                                                                                                         | Status   | Exact approval and scope                                                                                                                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P4-S2-1 (4.2, 4.7) | Classify the connection. Evidence: R5 (D8 answer), DESIGN.md Interaction states, EventSource semantics (R5 notes "not probed"). | refused vs reconnecting not distinguishable | on `error`: if `readyState` is CONNECTING show Reconnecting; if CLOSED `fetch('/__office/status')`: 403 shows Refused, other shows "Feed unavailable" with a retry timer that reopens                            | approved | D15 answer "EventSource plus status probe". CONNECTING shows Reconnecting and keeps the last scene dimmed; CLOSED fetches `/__office/status`: 403 shows Refused, other shows "Feed unavailable" and a timer reopens the stream; tests with fake EventSource and fetch cover 403, 503, drop and recovery.                                   |
| P4-S2-2 (4.2, 4.4) | Rescue for bad frame, invalid event and machine throw. Evidence: `parseAgentEvent` (shared/events.ts:159).                      | none                                        | `try/catch (SyntaxError)` on JSON parse and `parseAgentEvent` on every event, skip and count (dev `console.warn` once per kind); error boundary around Scene shows "Display error, reload" and keeps the top bar | approved | D16 answer "Skip and count, plus an error boundary". JSON `SyntaxError` caught and skipped; `parseAgentEvent` on every snapshot and delta event, invalid skipped and counted, dev `console.warn` once per kind; error boundary around Scene shows "Display error, reload" and keeps the top bar; tests: bad JSON, bad event, forced throw. |

## Answered: P4-S2-1 (D15)

Answer: "EventSource plus status probe (recommended)".

## Answered: P4-S2-2 (D16)

Answer: "Skip and count, plus an error boundary (recommended)".

## Section 3: Security & threat model (2026-10-02)

- New attack surface: none server-side (no new endpoints; feed stays loopback-only). Client renders ids, timestamps, and a project label derived from `projectPath`/`projectId` (directory names, attacker-influenceable: a hostile repo folder name).
- Input validation: events pass `parseAgentEvent` (D16); MAX_STRING_LENGTH 512 bounds any string. Markup: React escapes text; no `dangerouslySetInnerHTML` planned.
- Secrets: none. Dependencies: none added (D10 avoided happy-dom). Data classification: no transcript text (principle 4); paths can contain a username and stay on the local screen. Audit logging: not applicable.
- Demo: DEV-only, grep check for `__OFFICE_DEMO__` in `dist/` (approved).

| Threat                                                                                                     | Likelihood | Impact | Mitigated by plan?                                                 |
| ---------------------------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------ |
| Hostile folder name: 512-char label overflows tag/chip, bidi control characters reorder text, markup shown | Low        | Low    | Escaping yes; length and control characters not specified (S3-1)   |
| LAN client reaches feed                                                                                    | Low        | Med    | Yes (R3, learning host-header guard; loopback socket check exists) |
| Demo script ships in a production build                                                                    | Low        | Low    | Yes (DEV gate + dist grep)                                         |

| ID and owner       | Contract and evidence                                                                                                                                                                                          | Current   | Proposed                                                                                                                                                                                                             | Status   | Exact approval and scope                                                                                                                                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P4-S3-1 (4.6, 4.7) | Project label in tags, chips and the aria-live text comes from a directory name. No length or control-character rule. Evidence: MAX_STRING_LENGTH 512 (shared/events.ts:55), tag and chip widths at 50% scale. | raw label | one pure `projectLabel(path)`: basename, strip control and bidi override characters, truncate to 24 code points with an ellipsis; used by tag, chip, aria-live; unit test with 5 KB, bidi and `<img onerror>` inputs | approved | D17 answer "One sanitizing label function". `projectLabel(path)` in `src/office/label.ts`: basename, strip control and bidi override characters, 24 code points plus ellipsis; used by tag, chip and aria-live; test with 5 KB, bidi and `<img onerror>` inputs. |

## Answered: P4-S3-1 (D17)

Answer: "One sanitizing label function (recommended)".

## Section 4: Data flow and interaction edge cases (2026-10-02)

Async ordering: shared state = `OfficeState` + connection status, single writer through one reducer; ops: SSE message, 1 s tick, reconnect snapshot, status probe result. Violating order: probe(403) resolves after the reopen succeeded, banner says Refused over a live scene. Mechanism: an attempt id; a probe result applies only if its id is current. Test: pause the probe promise, reopen, release, assert banner (and the opposite order). StrictMode double-mount (main.tsx): effect cleanup closes the stream and clears timers; remount test. Both are dependent text of D15 and base 4.2, no new decision. Laptop wake: verified `applyEvent` revives a leaving or expired agent as a new arrival (machine.ts:117), so a long gap yields a short walk-out/walk-in, accepted.

| ID and owner       | Contract and evidence                                                                                                                                                                                                                                                                                                                                | Current     | Proposed                                                                             | Status   | Exact approval and scope                                                                                                                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P4-S4-1 (4.7, 4.9) | Interaction rules: chip click on a departed agent is a no-op; chips with equal `waitingSince` order by agent key; when the focused character leaves, focus moves to the office container (`tabIndex=-1`, labelled) so keyboard users are not dropped to the page body. Evidence: DESIGN.md Accessibility and Top bar sections specify none of these. | unspecified | add the three rules with unit tests (order) and the 4.9 keyboard walkthrough (focus) | approved | D18 answer "Add all three rules". Chip click on a departed agent is a no-op; chips with equal `waitingSince` order by agent key; when the focused character leaves, focus moves to the labelled office container (`tabIndex=-1`); order and no-op unit tests plus a 4.9 walkthrough step. |

## Answered: P4-S4-1 (D18)

Answer: "Add all three rules (recommended)".

## Section 5: Code quality (2026-10-02)

- Reuse ladder: `Character.tsx` wraps existing `CharacterRig.tsx` and `sprites.ts`/`props.ts` (ArtSheet already renders them at 100% and 50%); do not re-implement. One clock: a single `useNow` source for `tick` and the per-minute label, no scattered intervals. UI numbers (24 px hit area, 50% floor, 800x500, 60 s label tick, probe timer) in one constants block next to `iso.ts`, not inline.
- Naming: avoid a second `TUNING`; client UI constants named `LAYOUT`.
- Complexity: `Scene.tsx` as scoped in 4.4 and 4.7 carries room layer, overlay, top bar, banner, chips, aria-live region, tab title and favicon, ambient: well past 5 branches, one file, one test file.

| ID and owner       | Contract and evidence                                                                                                                                                                                          | Current          | Proposed                                                                                    | Status   | Exact approval and scope                                                                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P4-S5-1 (4.4, 4.7) | BUILD_TODO 4.7 "Files: `src/office/Scene.tsx`" puts the whole top bar there. Room (iso layers, characters, ambient) and chrome (bar, banner, chips, live region, title, favicon) change for different reasons. | all in Scene.tsx | room in `Scene.tsx`; chrome in `TopBar.tsx` plus `useDocumentChrome.ts` (title and favicon) | approved | D19 answer "Split room and chrome". `Scene.tsx` (room), `TopBar.tsx` (bar, banner, chips, live region), `useDocumentChrome.ts` (title, favicon dot); each with its own test; 4.7's file list changes accordingly. |

## Answered: P4-S5-1 (D19)

Answer: "Split room and chrome (recommended)".

## Section 6: Test review (2026-10-02)

Environment fact (verified): vitest runs in node, tests use `renderToStaticMarkup`, no DOM library (D10). So: pure logic and static markup in unit tests; real clicks, focus, animation in Phase 5 Playwright (5.2, 5.3).

```
 NEW THING                       | TYPE        | HAPPY                  | FAILURE                    | EDGE
 iso.ts layout/scale             | unit        | 4 per row, rows grow   | below 800x500 message      | 0, 1, 12, 24 agents; 50% floor
 placeBubbles (D5)               | unit        | 1 bubble               | 2, 3 overlapping           | 24px at 0.5, 12 agents
 useOffice reducer + replay      | unit        | snapshot then deltas   | bad JSON/event (D16)       | 1h question kept, 1h tool dropped, 1h working keeps shirt (D12)
 connection (D15)                | unit, fakes | open, event            | 403, 503, drop, stale probe| StrictMode remount
 swap controller (D10)           | unit        | loop end swap          | 900ms force                | reduced motion, tab return
 identity wiring (D8)            | unit        | same name after reload | -                          | subagent differs from parent
 shirt per project (4.4)         | unit        | one per project        | 9th project stripe         | order by arrivedAt, replay-stable
 projectLabel (D17)              | unit        | basename               | 5KB/bidi/markup            | empty path
 chips/title/favicon rule        | unit        | longest first, (N)     | -                          | tie-break (D18), N=0
 aria-live once per episode      | unit        | one announce           | flapping timer             | episode hold 60s
 Scene/TopBar markup             | static HTML | data-state, data-shirt | banner variants            | empty, refused, reconnecting
 keyboard order, focus, tag      | E2E (5.3)   | waiting first          | focused agent leaves (D18) | -
 reduced motion                  | E2E (5.3)   | fade, static hand      | -                          | -
 ambient (D7/D11)                | art.test    | props grids valid      | off in reduced motion      | no effect on data-state
 demo (D2)                       | unit        | script yields states   | not in dist                | -
```

- Flakiness: all unit tests take an injected `now`; no real timers. Ambition: 2am test = `?demo` with 12 agents, reload, kill and restart the dev server; hostile QA = 5 KB label, 10k event burst, malformed frames; chaos = laptop sleep (now jumps 2 h).
- **GAP (verification), S6-1.** 4.11 verify says the attention cue is "distinguishable in grayscale and against all 8 shirt colors". Computed here (luminance contrast of `--accent` #b388ff vs shirt): orange 1.18, sky 1.15, green 1.28, vermillion 1.45, purple 1.15, blue 1.95, yellow 2.01, light gray 2.38. By luminance the violet ring alone is not separable from several shirts in grayscale. The ring sits on the floor under the agent, and the bubble plus raised arm repeat the cue, so the claim only holds if those are non-color signals; nothing tests that.

| ID and owner   | Contract and evidence                                                                                                                                                                    | Current             | Proposed | Status   | Exact approval and scope                                                                                                                                                                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P4-S6-1 (4.11) | Verify method for "distinguishable in grayscale and against all 8 shirts". Evidence: contrast numbers above; art.test.ts already tests accent vs background (4.5) but not ring vs shirt. | manual wording only | see D20  | approved | D20 answer "Prove redundancy and contrast". Static-markup test: every attention render has ring, bubble and raised-hand pose; art-style test: ring vs floor contrast at least 3; one grayscale `?demo` screenshot of 12 agents. Hue separation from shirts is not claimed (measured luminance contrast 1.15 to 2.38). |

## Answered: P4-S6-1 (D20)

Answer: "Prove redundancy and contrast (recommended)".

## Section 7: Performance (2026-10-02)

- Memory: `OfficeState` bounded by agents (24 order of magnitude) plus `returned` (RETURNED_CAP 2000). Server ring SNAPSHOT_CAP 2000 events.
- **S7-1 (estimate, not measured).** `applyEvent` calls `structuredClone(state)` per event (machine.ts:183). Reload replays up to 2000 events: 2000 clones of a state that may hold hundreds of `returned` entries. Estimated tens to hundreds of ms of main-thread time on reload. Basis: clone count times state size; no timing was taken.
- **S7-2.** `tick` clones the whole state every call (machine.ts:352) and returns a new object each second even when nothing changed, so React re-renders every character each second. Basis: code reading; `pass` knows `changed` but `tick` does not expose it.
- Slow paths: reload replay (S7-1), 1 Hz tick re-render (S7-2), 24 agents of pixel-grid SVG with CSS animations (unmeasured; M10 profiling stays in TODOS.md, not added).
- Caching: none needed. Connections: 1 EventSource per tab; server cap 8 (dev).

| ID and owner  | Contract and evidence                                                                  | Current                              | Proposed                                                                                                                                                                                                           | Status   | Exact approval and scope                                                                                                                                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P4-S7-1 (4.2) | Avoid redundant cloning and re-render in the hot paths. Evidence: machine.ts:183, 352. | clone per event, new object per tick | `applyEvents(state, events, now)` clones once and applies in order; `tick` returns the same object when nothing changed; equivalence proven against sequential `applyEvent` using the existing seeded D5 sequences | approved | D21 answer "Bulk replay and no-op tick". `applyEvents(state, events, now)` in `machine.ts` clones once; `tick` returns the same object when nothing changed; proof: bulk equals sequential `applyEvent` on the D5 seeded sequences, plus a tick identity test; `useOffice` uses both. |

## Answered: P4-S7-1 (D21)

Answer: "Bulk replay and no-op tick (recommended)".

## Section 8: Observability (2026-10-02)

No new findings. Visible: banner states (D15), skipped-frame counters and dev warn once per kind (D16), `data-state`/`data-shirt` on characters, feed `/__office/status` JSON. A failed feed plugin load gives 404 on `/__office/events`, which D15 classifies as "Feed unavailable". Task (docs, owner 6.2): README lines saying what each banner means and where to look (terminal log line, `/__office/status`). SELECTIVE addition: counters appear on `?demo` for the bad-frame cases only if the demo script includes them; not proposed as scope.

## Section 9: Deployment and rollout (2026-10-02)

Dev tool via `vp dev`; no migration, no deploy, no feature flag. `vp build` output has no feed (plugin is dev-only), so a built page shows "Feed unavailable"; acceptable and documented by the banner. Rollback: revert the merge commit (minutes, no data). Pre-merge checklist: `vp check`, `vp test` (includes art.test.ts after DESIGN.md/props edits), `vp build` then grep `dist/` for `__OFFICE_DEMO__`, `vp dev` live session within seconds. No findings.

## Section 10: Long-term trajectory (2026-10-02)

Reversibility 4/5 (new UI files; the only shared-surface changes are `DESKS_PER_ROW` to `shared/tuning.ts`, `applyEvents`/`tick` identity in `machine.ts`, DESIGN.md Motion). Debt: M10 profiling (24 agents, Safari 50% hit area) stays in TODOS.md; shortcut markers dec-R1 and dec-R2 wait for the hooks adapter; unit tests cannot click or focus (D10), so interaction depends on Phase 5. Path: the `useOffice(source)` seam lets Phase 5.1 reuse `demo.ts` events as the Playwright fixture source and the hooks adapter swap in without touching the UI. SELECTIVE retrospective: no rejected expansion is load-bearing; ambient (D7/D11) is the one with real new cost (props, DESIGN.md, step 4.10a). 1-year question: names `useOffice`, `Scene`, `TopBar`, `Character` are obvious.

## Section 11: Design and UX (2026-10-02)

Interaction states: DESIGN.md Interaction states table covers loading, empty, error, success, partial. Order seen: room (dim until connected), top bar status, waiting chips and bubbles (loudest first: wave plus violet ring, then monitor glow, then shirt). Accessibility: contrast and 24 px targets specified; DESIGN.md:48 already guarantees accent hue at least 59 degrees from every shirt hue and "never color alone" (so D20's luminance numbers add the grayscale angle, they do not contradict it). Responsive: phone and touch out of scope by design (R3); minimum 800x500 with "Make this window wider". Slop risk low: anchored on the approved mockup, no hero or card grid. 30-minute touches already accepted: favicon dot, ambient life, `?demo`.

- **S11-1 (gap).** DESIGN.md and 4.1 say "scale to fit with a 50% floor, minimum 800x500" but not what happens once more rows exist than fit at 50% (24 agents is 6 rows; the success criterion is 12 agents). Nothing says whether the room scrolls, clips, or shows a message.

```
 USER FLOW
 load -> "Connecting..." (room dim) -> snapshot -> [0 agents: "No active Claude Code sessions"]
                                              \-> agents walk in -> sit, type (monitor lit)
 working -> wait 10s tool / question -> wave + ring + bubble + chip + (N) title + favicon dot
 chip click / focus -> tag + pulse; answer given -> state returns -> chip leaves
 drop -> "Reconnecting" (dim, last scene) -> snapshot replace -> resume
 403 -> "Refused"; other close -> "Feed unavailable" (timer reopen)
 rows exceed 50% floor -> ??? (S11-1)
```

| ID and owner   | Contract and evidence                                                                                             | Current     | Proposed                                                                                                             | Status   | Exact approval and scope                                                                                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P4-S11-1 (4.1) | Behavior beyond the 50% scale floor. Evidence: 4.1 text, DESIGN.md Scene rules (new rows grow toward the viewer). | unspecified | room scrolls vertically in its own region, top bar pinned, scale stays at the 50% floor; `?demo` has a 24-agent case | approved | D22 answer "Scroll the room, top bar pinned". Scale stays at the 50% floor; the room region scrolls vertically; top bar and chips stay pinned; chip click scrolls the agent into view; `?demo` gets a 24-agent case. |

## Answered: P4-S11-1 (D22)

Answer: "Scroll the room, top bar pinned (recommended)".

## Outside voice and TODO choices

Outside voice: DISABLED (`codex_reviews=disabled`, Codex preflight returned `disabled`; disabled outcome recorded in the review log). No native replacement run, no coverage claimed. Spec review (3 refuter rounds) is a different step and does not count as outside coverage.

TODO proposals remaining: none. M8, M9 and "Wire identity.ts" are now in scope (D3, D4, D5); the 24-identities TODO is decided by D8 (repeats accepted). Paper hover-text, chime and M10 profiling are unchanged in TODOS.md.

## Approval readiness

Approval readiness: PASS. Checked rows and references: P4-MODE (D1), P4-BASE (earlier reviews), P4-ADD-1..6 (D2 to D7), P4-FIX-1..5 (D8 to D12), approval of documents (D13), P4-S1-2 (D14), P4-S2-1 (D15), P4-S2-2 (D16), P4-S3-1 (D17), P4-S4-1 (D18), P4-S5-1 (D19), P4-S6-1 (D20), P4-S7-1 (D21), P4-S11-1 (D22). P4-S1-1 is dependent text of base tasks 4.1/4.2 and DESIGN.md "seats survive reload" (no new behavior). No row is unresolved, declined or deferred.

## NOT in scope

Deferred (already in TODOS.md, unchanged by this review): paper hover-text with redaction (P3, privacy), opt-in attention chime (P4), M10 profiling of 12 and 24 agents in Chrome and Safari (belongs with 4.4), hooks adapter for exact attention. Rejected: none. Not here because they belong to later phases: Playwright and fixture (5.1 to 5.3), success criteria pass and housekeeping (6.x).

## What already exists

`machine.ts` (`applyEvent`, `tick`, `TUNING`), `identity.ts` (`identityFor`, `pickShirt`), `poses.ts` (`poseForState`, `nextDisplayed`, `shirtVars`), `sprites.ts`, `props.ts`, `CharacterRig.tsx`, `ArtSheet.tsx`, `shared/events.ts` (`parseAgentEvent`), `shared/tuning.ts`, `server/feed-plugin.ts` (snapshot, seats, `gone`, `/__office/status`), `parseAgentEvent`. All reused; new code is the glue (`useOffice`, `iso.ts`, `Scene`, `Character`, `TopBar`) plus the accepted additions. Nothing rebuilt.

## Dream state delta

```
 CURRENT                    THIS PLAN                           12-MONTH IDEAL
 feed + machine + art  ---> live isometric office, waves,  ---> hooks adapter for exact attention,
 kit, App = <h1>            chips, keyboard, reduced motion,     click-to-focus, chime, paper text,
                            demo source, bounded failures        packaging beyond vp dev
```

This plan delivers the whole visible core. Left for the ideal: exact attention (hooks), packaging, and the interaction depth that needs real DOM tests.

## Error & Rescue Registry (implementation-ready)

| Codepath            | Failure                 | Class                         | Rescued? | Rescue action                                                               | User sees               |
| ------------------- | ----------------------- | ----------------------------- | -------- | --------------------------------------------------------------------------- | ----------------------- |
| `useOffice` connect | non-2xx / closed        | EventSource error, CLOSED     | Y (D15)  | probe `/__office/status`; 403 Refused, other Feed unavailable, timer reopen | banner                  |
| `useOffice` connect | dropped link            | EventSource error, CONNECTING | Y        | browser retry; last scene dimmed                                            | "Reconnecting"          |
| frame parse         | not JSON                | `SyntaxError`                 | Y (D16)  | skip, count, dev warn once                                                  | nothing wrong visible   |
| event validate      | wrong shape             | `parseAgentEvent` null        | Y (D16)  | skip, count, dev warn once                                                  | same                    |
| machine step        | bug throws              | `Error`                       | Y (D16)  | error boundary, top bar kept                                                | "Display error, reload" |
| stale probe         | resolves after reopen   | ordering                      | Y (S4)   | attempt id ignores it                                                       | correct banner          |
| document chrome     | `document.head` missing | guarded no-op                 | Y        | skip                                                                        | n/a                     |

## Failure Modes Registry

```
 CODEPATH            | FAILURE MODE                   | RESCUED? | TEST? | USER SEES?        | LOGGED?
 --------------------|--------------------------------|----------|-------|-------------------|--------
 connection          | 403                            | Y        | Y     | Refused           | dev warn
 connection          | 503 too many clients           | Y        | Y     | Feed unavailable  | dev warn
 connection          | drop then recover              | Y        | Y     | Reconnecting      | n/a
 connection          | stale probe after recovery     | Y        | Y     | correct banner    | n/a
 frame/event         | bad JSON, invalid event        | Y        | Y     | nothing broken    | counter
 machine             | throws                         | Y        | Y     | Display error     | console error
 replay              | long-running agent start old   | Y        | Y     | same shirt/parent | n/a
 replay              | waiting agent older than 30min | Y        | Y     | still waiting     | n/a
 seats               | seat missing for a session     | Y        | Y     | first free desk   | n/a
 layout              | rows beyond 50% floor          | Y        | Y     | scrolls           | n/a
 focus               | focused agent leaves           | Y        | E2E   | focus on office   | n/a
 attention cue       | regresses to color only        | Y        | Y     | ring+bubble+hand  | n/a
 demo                | ships in dist                  | Y        | grep  | n/a               | n/a
 interaction depth   | click/focus untestable in unit | partial  | E2E 5.3 | n/a             | n/a
```

No row has RESCUED=N, TEST=N and a silent result. Critical gaps found and resolved: S2-1, S2-2.

## Scope Expansion Decisions

Accepted: `?demo` feed (D2), identity wiring (D3), pose-swap hook (D4), `placeBubbles` (D5), favicon dot (D6), ambient life (D7, shaped by D11). Deferred: none. Skipped: none. Full record: `~/.gstack/projects/office-agents/ceo-plans/2026-10-02-phase-4-office-ui.md`.

## Diagrams

1. System architecture: Section 1 diagram above.
2. Data flow with shadow paths:

```
 INPUT (SSE data line) -> VALIDATE (JSON.parse, parseAgentEvent) -> TRANSFORM (applyEvents / tick) -> STATE (reducer) -> OUTPUT (Scene, TopBar, title, favicon, aria-live)
   nil/empty: empty snapshot -> "No active Claude Code sessions"
   wrong type/too long: skipped + counted (D16), strings bounded (512), label bounded (D17)
   exception: error boundary (D16)
   conflict/dup: dedupe by machine (returned map, episode ids)
   stale/partial: replay then tick (D12); missing seat -> first free desk
```

3. State machine: unchanged from machine.ts (arriving, working, waiting-on-subagents, idle, attention, leaving); connection state:

```
 connecting --open--> live --error(CONNECTING)--> reconnecting --open--> live
     |                  |
     +--error(CLOSED)---+--> probe: 403 -> refused (timer reopen) | other -> unavailable (timer reopen)
 invalid transitions: a probe result from an older attempt is ignored (attempt id)
```

4. Error flow: Error & Rescue Registry above.
5. Deployment sequence: none (dev tool): branch, PR, `vp check`, `vp test`, `vp build` + dist grep, merge.
6. Rollback: revert the merge commit; no data, no config.

## Stale Diagram Audit

Files this plan touches with ASCII diagrams: `DESIGN.md` (Motion list, to be amended), `docs/designs/office-agents-isometric-office.md` (not edited), `BUILD_TODO.md` (4.2 replay note and "DT1..DT9" label, to be corrected). `server/feed-plugin.ts` header wire-format comment stays accurate. No other diagrams.

## Implementation Tasks

Synthesized from this review's findings. Run with Claude Code or Codex; checkbox as you ship. Base items 4.5 to 4.12 and 4.14 stay as written in BUILD_TODO.md and are not repeated.

- [ ] **T1 (P1, human: ~1 day / CC: ~45min)** — layout — shared desk constant, `iso.ts`, `placeBubbles`, overflow scroll
  - Surfaced by: Section 1 (S1-2, D14), D5, Section 11 (S11-1, D22)
  - Files: `shared/tuning.ts`, `server/feed-plugin.ts`, `src/office/iso.ts`, `src/office/iso.test.ts`
  - Verify: `vp test` (feed-plugin tests pass; layout, 50% floor, 800x500, bubbles 0 to 3 overlaps, 24 px at 0.5 with 12 agents); `?demo` 24-agent case scrolls
- [ ] **T2 (P1, human: ~3h / CC: ~20min)** — machine — `applyEvents` and identity-stable `tick`
  - Surfaced by: Section 7 (S7-1, D21)
  - Files: `src/office/machine.ts`, `src/office/machine.test.ts`
  - Verify: `vp test`: bulk equals sequential on the 1,000 seeded D5 sequences; `tick` returns the same object when nothing changed
- [ ] **T3 (P1, human: ~1.5 day / CC: ~1h)** — feed client — `useOffice(source)`, connection classification, validation, seats, replay, StrictMode cleanup
  - Surfaced by: Section 2 (S2-1, S2-2, D15, D16), Section 4, D9, D12, S1-1
  - Files: `src/office/useOffice.ts`, `src/office/useOffice.test.ts`, `src/office/ErrorBoundary.tsx`
  - Verify: fake EventSource and fetch tests for 403, 503, drop, recovery, stale probe (both orders with controlled release), bad JSON, bad event, forced throw, 1 h question kept / 1 h tool call dropped / 1 h working agent keeps shirt and parent, remount; missing seat
- [ ] **T4 (P1, human: ~3h / CC: ~20min)** — identity — wire names and per-project shirts, `projectLabel`
  - Surfaced by: D3, D8, D17, round 1 findings 1 and 6
  - Files: `src/office/label.ts`, `src/office/label.test.ts`, call sites in Scene/Character
  - Verify: `vp test`: subagent name differs from parent; shirt per project in fixed order; label with 5 KB, bidi, `<img onerror>`
- [ ] **T5 (P1, human: ~1.5 day / CC: ~1h)** — room — `Scene.tsx`, `Character.tsx`, pure swap controller, attention redundancy test
  - Surfaced by: D4, D10, D19, D20; BUILD_TODO 4.4
  - Files: `src/office/Scene.tsx`, `src/office/Character.tsx`, swap controller module, tests, art-style ring contrast test
  - Verify: `vp test`; `vp dev` with a live session shows a seated agent with `data-state`; attention render always has ring, bubble, raised hand; ring vs floor contrast at least 3; grayscale `?demo` screenshot of 12 agents
- [ ] **T6 (P2, human: ~1 day / CC: ~45min)** — chrome — `TopBar.tsx`, `useDocumentChrome.ts`, chips, banner, aria-live, favicon dot, edge rules
  - Surfaced by: D6, D15, D18, D19; BUILD_TODO 4.7, 4.9
  - Files: `src/office/TopBar.tsx`, `src/office/useDocumentChrome.ts`, tests
  - Verify: `vp test`: chip order with tie-break, departed-agent click no-op, title and dot rule at N=0 and N>0; keyboard walkthrough including focus after the focused agent leaves
- [ ] **T7 (P2, human: ~3h / CC: ~15min)** — dev tooling — `?demo` scripted source
  - Surfaced by: D2
  - Files: `src/office/demo.ts`, `src/office/demo.test.ts`, `src/main.tsx`
  - Verify: `vp test`; `vp dev` at `?demo` shows arrive, work, wave, handoff and a 24-agent case; `vp build` then no `__OFFICE_DEMO__` in `dist/`; `art.test.ts` passes after the main.tsx edit
- [ ] **T8 (P2, human: ~1 day / CC: ~30min)** — ambient — step 4.10a
  - Surfaced by: D7, D11, round 2 finding Consistency 4
  - Files: `src/office/props.ts`, Scene styles, `DESIGN.md` (Motion, Open items)
  - Verify: `vp test` including `art.test.ts` and `props.test.ts`; ambient off under `prefers-reduced-motion`; no change to any agent `data-state`
- [ ] **T9 (P3, human: ~1h / CC: ~10min)** — docs — housekeeping
  - Surfaced by: spec review rounds 1 to 3, Section 8
  - Files: `BUILD_TODO.md` (4.2 replay note per D12, "DT1..DT9" label, step list for T-items), `TODOS.md` (mark M8, M9, identity wiring done when merged), `README.md` (what each banner means)
  - Verify: read-through; BUILD_TODO 4.2 note matches D12

Task JSONL artifact: written below under the Step 0 storage policy (permitted).

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW: COMPLETION SUMMARY                    |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                         |
  | System Audit         | App.tsx stub; machine, identity, poses,     |
  |                      | art kit, feed ready; 4 TODOS land here      |
  | Step 0               | 6 cherry-picks accepted (D2 to D7), 5 spec  |
  |                      | fixes (D8 to D12), docs approved (D13)      |
  | Section 1  (Arch)    | 2 issues found                              |
  | Section 2  (Errors)  | 11 error paths mapped, 4 GAPS (all closed)  |
  | Section 3  (Security)| 1 issue found, 0 High severity              |
  | Section 4  (Data/UX) | 9 edge cases mapped, 3 unhandled (closed)   |
  | Section 5  (Quality) | 1 issue found                               |
  | Section 6  (Tests)   | Diagram produced, 1 gap (closed)            |
  | Section 7  (Perf)    | 2 issues found                              |
  | Section 8  (Observ)  | 0 gaps found                                |
  | Section 9  (Deploy)  | 0 risks flagged                             |
  | Section 10 (Future)  | Reversibility: 4/5, debt items: 4           |
  | Section 11 (Design)  | 1 issue                                     |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (4 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 7 rows, 0 GAPS                              |
  | Failure modes        | 14 total, 0 critical gaps                   |
  | TODOS.md updates     | 0 items proposed (task T9 edits wording)    |
  | Scope proposals      | 6 proposed, 6 accepted                      |
  | CEO plan             | written                                     |
  | Outside voice        | disabled (codex_reviews=disabled)           |
  | Lake Score           | N/A (no scored questions)                   |
  | Diagrams produced    | 6 (arch, data flow, state, error, deploy,   |
  |                      | rollback)                                   |
  | Stale diagrams found | 3 (DESIGN.md Motion, BUILD_TODO 4.2, label) |
  | Unresolved decisions | 0                                           |
  +====================================================================+
```

## Eng review (/plan-eng-review, 2026-10-02)

Fixed target: this plan, `docs/designs/phase-4-ceo-review.md` (amended Phase 4 scope after the CEO review). Report file: this file; the CEO report below is replaced by the combined report at the end. Branch `feat/phase-4-office-ui`. Test framework: Vitest via `vite-plus/test`, node environment, `vp test` (CLAUDE.md).

### Scope Challenge (A, B, C)

Reuse: complete (machine, identity, poses, CharacterRig (memo), parseAgentEvent, shared/tuning, feed). No new infrastructure pattern; EventSource, React error boundary and `useReducer` are Layer 1 platform features, no search needed. Complexity: about 31 files (about 20 new, 11 edited; estimate) and 5+ new components or hooks, so the gate tripped. TODOS: M8, M9, identity wiring absorbed; M10 stays deferred. Distribution: none.

Scope record: feature answers: none proposed (feature list settled in the CEO review); structure: A "Original arrangement (recommended)", eng D1; accepted scope: T1 to T9 file layout as written (iso, useOffice, label, swap controller, Scene, Character, TopBar, useDocumentChrome, ErrorBoundary, demo); pending remedies: none. Scope Challenge result: scope accepted as-is. Scope Challenge findings: No issues found.

### Section 1: Architecture (eng review)

Findings: E1 [P2] (confidence 8/10) machine.ts:133 `waitingSince: now` for a tool-timer wait is the detecting tick; after D12 replay it is reload time. E2 [P2] (confidence 8/10) machine.ts:132-133 episode id `${a.key}#${s.episodeSeq}` resets with each replayed state. Factual correction: CEO D21 `applyEvents(state, events, now)` conflicts with D12 (each replayed event uses its own `ts` as the clock); the bulk API takes a per-event clock (`applyEvents(state, events, now, { replay: true })` applies `applyEvent(s, ev, ev.ts)` semantics, then the caller ticks once). No behavior change, no question.

## Decision ledger

### R1: waitingSince for a tool-timer wait

Finding: E1, P2, confidence 8/10, src/office/machine.ts:133 (`waitingSince: now`) with the R1 caller in `pass` (`enterAttention(s, a, "tool", now)`); reviewer: plan-eng-review.
Plan baseline: R1 tool timer (a non-subagent tool call without a result for `toolTimerMs` = 10 s waves, design doc R1); D12 replay (reload replays every event, then one `tick(now)`). The wait start for a tool wait is not specified.
Runtime evidence: for a question wait, `enterAttention` receives the event clock (correct). For a tool wait it receives the tick time. Replay probe not run; derived by reading machine.ts:129-133 and the `pass` R1 branch.
Comparison grid:

| Commitment                                 | Source/approval | Current                           | A Deterministic start                                                    | B Keep detection time          |
| ------------------------------------------ | --------------- | --------------------------------- | ------------------------------------------------------------------------ | ------------------------------ |
| R1 fires 10 s after the tool starts        | approved (R1)   | yes                               | yes                                                                      | yes                            |
| `waitingSince` of a tool wait              | pending         | tick time at detection            | earliest overdue tool `startedAt + toolTimerMs`                          | tick time at detection         |
| Live behavior                              | pending         | within 1 s of the 10 s mark       | identical to the second                                                  | within 1 s of the 10 s mark    |
| After reload, an hour-old stuck tool shows | pending         | "just now" and last in chip order | about 1 h, correct chip order                                            | "just now", last in chip order |
| Question waits                             | approved        | event clock                       | unchanged                                                                | unchanged                      |
| Tests                                      | pending         | none                              | replay test: stuck tool 1 h old keeps its wait; live tick test unchanged | none                           |
| Files                                      | pending         | none                              | `machine.ts`, `machine.test.ts`                                          | none                           |

Question D2:
D2 — R1: when does a stuck-tool wait start?
Project/branch/task: office-agents, feat/phase-4-office-ui, Section 1 finding E1.
ELI10: When a tool call hangs, the agent waves and a chip shows how long it has waited. The machine stamps the start of that wait with the moment the clock tick noticed the problem. Live, that is within a second of the 10 s mark. After a page reload the tick runs once over history, so a tool that has hung for an hour is stamped "just now": its chip shows no wait and sorts last, hiding your longest-waiting agent.
Stakes if we pick wrong: after every reload or reconnect, the longest-waiting stuck agent looks like the newest and sorts to the bottom of the waiting list.
Recommendation: A because it makes wait time depend only on event timestamps, so replay and live agree (explicit over clever, tests required).
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Start at the tool's start plus 10 s (recommended)
✅ Reload shows the true wait and the right chip order; live behavior is unchanged to the second.
❌ Small change to a settled, tested module (machine.ts) with one new replay test.
B) Keep the detection time
✅ No change to machine.ts.
❌ Longest-wait-first and the wait label are wrong after any reload or reconnect.
Net: correct waits after reload for a few lines in machine.ts.
Header: Wait start
Options:
A) Start at the tool's start plus 10 s (recommended)
Effort S (human: ~1h / CC: ~10min), risk low. In `pass`, pass the earliest overdue tool's `startedAt + TUNING.toolTimerMs` to `enterAttention` as `waitingSince`; add a replay test (stuck tool 1 h old keeps about 1 h) and keep the existing R1 tick tests passing. ✅ True wait after reload and reconnect. ✅ Live timing identical to the second. ❌ Touches finished machine.ts.
B) Keep the detection time
Effort S (zero extra), risk medium. No change. ✅ No machine edit. ✅ No new test. ❌ Wrong wait and chip order after reload.

State: approved
Actual answer: A) Start at the tool's start plus 10 s (recommended), eng D2
Accepted scope: in `pass`, `enterAttention` for a tool wait receives the earliest overdue tool's `startedAt + TUNING.toolTimerMs` as `waitingSince`; replay test (stuck tool 1 h old keeps about 1 h) added; existing R1 tick tests (machine.test.ts:101-105, 234-238, 303) unchanged and passing. Question waits unchanged. Correction found in Test review (eng): the seeded D5 oracle asserts `waitingSince` equals the entry `now` for every fresh episode (machine.test.ts:466); for tool-triggered entries the oracle expects the earliest overdue tool's `startedAt + toolTimerMs` instead, and keeps every other invariant (one id per episode, hold window, exit time). No guarantee is weakened: it replaces the old contract with the approved one.
History: none

### R2: identity of an announced attention episode

Finding: E2, P2, confidence 8/10, src/office/machine.ts:132-133 (`id: ${a.key}#${s.episodeSeq}`, `episodeSeq` starts at 0 in `createOffice`); reviewer: plan-eng-review.
Plan baseline: DESIGN.md Accessibility and CEO D18/4.9: "Hidden `aria-live=polite` region announces once per attention episode"; "The state machine assigns the episode id so a flapping timer cannot spam announcements." Reconnect behavior not specified.
Runtime evidence: ids are per-state sequence numbers; a replay builds a fresh state (D12), so the same episode gets a new id. Probe not run; derived by reading machine.ts:59-67, 128-133.
Comparison grid:

| Commitment                             | Source/approval        | Current                          | A Announce by agent and wait start                                                                   | B Keep machine episode id        |
| -------------------------------------- | ---------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------- |
| One announcement per attention episode | approved (DESIGN, 4.9) | by `episode.id`                  | by `agentKey@waitingSince`                                                                           | by `episode.id`                  |
| Flapping timer cannot spam             | approved               | yes (episode hold 60 s)          | yes (hold keeps `waitingSince`)                                                                      | yes                              |
| After reconnect or reload              | pending                | every waiting agent re-announced | already-announced episodes stay silent within the page session                                       | every waiting agent re-announced |
| Depends on D2                          | approved               | n/a                              | yes (`waitingSince` is now deterministic)                                                            | n/a                              |
| Tests                                  | pending                | none                             | announcer pure function: replayed episode silent, new episode announced, same key new wait announced | none                             |
| Files                                  | pending                | none                             | announcer module or `TopBar.tsx` helper plus test                                                    | none                             |

Question D3:
D3 — R2: when is a waiting agent announced again?
Project/branch/task: office-agents, feat/phase-4-office-ui, Section 1 finding E2.
ELI10: The screen-reader line says "Maya, office-agents, asking you" once per waiting episode. The machine's episode number restarts whenever the page rebuilds state from the server (reload, dev-server restart, laptop wake). So every agent still waiting gets announced again, a burst of repeats for a screen-reader user. Identifying an episode by the agent and the moment its wait began lets the page stay quiet about waits it already announced.
Stakes if we pick wrong: a screen-reader user hears every waiting agent re-announced after each reconnect.
Recommendation: A because it keeps the approved once-per-episode promise across reconnects using data D2 now makes stable (explicit over clever).
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Announce by agent and wait start (recommended)
✅ No repeat announcements after reload-in-session reconnects; new waits still announce.
❌ A page reload (new JS session) still re-announces once; only in-session reconnects are quiet.
B) Keep the machine episode id
✅ No new code.
❌ Repeats every waiting agent after each reconnect, which breaks "once per episode".
Net: keep the once-per-episode promise across reconnects for a small pure function.
Header: Announce key
Options:
A) Announce by agent and wait start (recommended)
Effort S (human: ~1h / CC: ~10min), risk low. The announcer keeps a set of `agentKey@waitingSince` strings for the page session and announces only unseen ones; pure function with unit tests (replayed episode silent, new wait announced, same agent with a new wait announced). ✅ Quiet reconnects. ✅ Uses D2's stable wait start. ❌ A full page reload re-announces once.
B) Keep the machine episode id
Effort S (zero extra), risk medium. No change. ✅ Nothing to build. ❌ Repeat announcements after every reconnect.

State: approved
Actual answer: A) Announce by agent and wait start (recommended), eng D3
Accepted scope: announcer keeps a page-session set of `agentKey@waitingSince` strings and announces only unseen ones; pure function with unit tests (replayed episode silent, new wait announced, same agent with a new wait announced). Depends on R1 (D2).
History: none

### Section 2: Code quality (eng review)

Findings: Q1 [P2] (confidence 7/10) three consumers each need a derived, ordered view of the agents (desk order and focus order for Scene, waiting chips for TopBar, announcer list, title count); BUILD_TODO.md 4.9 "Focus order: waiting first, then by desk" and 4.7 "waiting chips longest first" plus D18 tie-break would be implemented separately. Proposed callers (assumptions, none exist yet): Scene, TopBar, announcer, useDocumentChrome. Q2 [P2] (confidence 8/10) `useOffice` as scoped (CEO D15, D16, D12, D18, StrictMode cleanup) carries more than 10 branches: connect, onerror CONNECTING vs CLOSED, probe 403 vs other, reopen timer, attempt id, JSON parse, validate, snapshot, delta, seat, gone, unmount. Checked, no issue: error handling (D16), edge cases (D17 label, D18), diagram accuracy (feed-plugin.ts header stays accurate; DESIGN.md Motion amended by T8).

### R3: shared selector for ordered agent views

Finding: Q1, P2, confidence 7/10, BUILD_TODO.md 4.7 and 4.9 (proposed callers; assumption stated); reviewer: plan-eng-review.
Plan baseline: 4.7 chips longest wait first; 4.9 focus order waiting first then by desk; CEO D18 equal waits order by agent key; D8 name and D3 announcer key; no module owns the ordering.
Runtime evidence: none (no consumers exist). Shared-code rubric: callers are proposed, labeled as assumptions; no first-party source yet.
Comparison grid:

| Commitment                          | Source/approval     | Current                                 | A One selector module                          | B Each component sorts |
| ----------------------------------- | ------------------- | --------------------------------------- | ---------------------------------------------- | ---------------------- |
| Chip order, tie-break by key        | approved (4.7, D18) | per component                           | one function, one test table                   | in TopBar              |
| Focus order waiting-first then desk | approved (4.9)      | per component                           | same selector                                  | in Scene               |
| Announcer list                      | approved (D3)       | per component                           | same selector (waiting set)                    | in announcer           |
| Title count N and favicon rule      | approved (4.7, D6)  | per component                           | same selector (count)                          | in useDocumentChrome   |
| Files                               | pending             | none                                    | `src/office/selectors.ts`, `selectors.test.ts` | none                   |
| Estimated lines                     | pending             | about 3 sorts and 2 counts (60 to 90)   | about 50 to 70 plus tests                      | about 60 to 90         |
| Drift risk                          | pending             | chip order and focus order can disagree | one definition                                 | high                   |

Question D4:
D4 — R3: where does agent ordering live?
Project/branch/task: office-agents, feat/phase-4-office-ui, Section 2 finding Q1.
ELI10: The top bar lists waiting agents longest first, the keyboard walks agents waiting first then by desk, the screen reader announces waiting agents, and the tab title counts them. All four need the same sorted list of agents. If each component sorts on its own, the chip order, the tab order and the count can disagree after the next change.
Stakes if we pick wrong: the chip you click and the character the keyboard focuses fall out of sync, with no test that notices.
Recommendation: A because one pure function with a table test pins every ordering rule once (DRY, tests required).
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) One selector module (recommended)
✅ Chips, focus order, announcer and count share one definition and one test table.
❌ One more file (selectors.ts and its test), and the callers are still plan assumptions until built.
B) Each component sorts
✅ No extra file; each component is self-contained.
❌ Three or four copies of the order rules that can drift apart.
Net: one tested ordering vs. several private copies.
Header: Agent ordering
Options:
A) One selector module (recommended)
Effort S (human: ~2h / CC: ~15min), risk low. `selectors.ts` exports pure functions over (OfficeState, seats, projects): desk order, waiting chip order (longest first, tie-break by key), focus order, waiting count; table-driven test. ✅ One definition. ✅ Matches D10 pure-module pattern. ❌ One more file.
B) Each component sorts
Effort S (zero extra), risk medium. ✅ No new file. ✅ Self-contained components. ❌ Rules duplicated across Scene, TopBar, announcer, document chrome.

State: approved
Actual answer: A) One selector module (recommended), eng D4
Accepted scope: `src/office/selectors.ts` and `selectors.test.ts`: pure functions over (OfficeState, seats, projects) for desk order, waiting chip order (longest first, tie-break by key), focus order (waiting first, then desk) and waiting count; table-driven test; Scene, TopBar, announcer and useDocumentChrome call it.
History: none

### R4: separate the feed client from the React hook

Finding: Q2, P2, confidence 8/10, BUILD_TODO.md 4.2 ("`useOffice` connects, applies the snapshot, then deltas, runs the machine, handles reconnect") plus CEO D12, D15, D16 and the StrictMode cleanup; reviewer: plan-eng-review.
Plan baseline: 4.2 puts connection, validation, seats, replay and reducer in `useOffice`; CEO D10 set the precedent "pure controller plus thin hook" for the swap hook; D15 requires tests with fake EventSource and fetch.
Runtime evidence: none (file does not exist). Testing constraint verified: no DOM test environment (vite.config.ts has none; learning no-dom-test-env).
Comparison grid:

| Commitment                                                                | Source/approval | Current              | A Client module plus thin hook                                               | B Everything in the hook                                 |
| ------------------------------------------------------------------------- | --------------- | -------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| Behavior (D12 replay, D15 connection, D16 validation, StrictMode cleanup) | approved        | in `useOffice.ts`    | same behavior in `feed-client.ts`                                            | same behavior in `useOffice.ts`                          |
| Fake EventSource/fetch tests (D15)                                        | approved        | via hook             | direct unit tests of the client with injected `EventSource`, `fetch`, timers | require rendering the hook, which has no DOM environment |
| Hook                                                                      | pending         | one large hook       | about 30 lines: owns reducer and effect cleanup                              | the whole thing                                          |
| Branch count in one function                                              | pending         | more than 10         | client about 10, hook under 5                                                | more than 10                                             |
| Files                                                                     | pending         | `useOffice.ts`, test | `feed-client.ts`, `feed-client.test.ts`, `useOffice.ts`                      | `useOffice.ts`, test                                     |
| Demo source seam (D2 CEO)                                                 | approved        | `useOffice(source)`  | the client takes the same source seam                                        | same                                                     |

Question D5:
D5 — R4: where does the connection logic live?
Project/branch/task: office-agents, feat/phase-4-office-ui, Section 2 finding Q2.
ELI10: The hook that talks to the server must open the stream, tell a refusal from a dropped link, ignore a stale probe, skip bad data, replay history, and clean up when React remounts. Written inside one React hook that is more than ten branches, and the repo has no way to run React hooks in tests. Putting the connection logic in a plain module that takes the browser pieces as parameters lets the tests you already approved run directly, and leaves the hook as thin glue.
Stakes if we pick wrong: the most failure-prone code in Phase 4 sits in a hook that cannot be unit tested here, so its ordering and cleanup rules would be proven only by slow end-to-end runs.
Recommendation: A because it applies the pure-module pattern you approved for the swap hook (D10) to the riskiest code, at the cost of two files (explicit over clever, tests required).
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Client module plus thin hook (recommended)
✅ The approved D15 and D16 tests run directly against the client with fake EventSource, fetch and timers.
❌ Two more files (feed-client.ts and its test) and one more seam to learn.
B) Everything in the hook
✅ One file; matches the 4.2 wording.
❌ Needs a DOM test environment to unit test, which D10 chose not to add; over ten branches in one function.
Net: unit-testable connection logic for two files vs. one untestable hook.
Header: Feed client
Options:
A) Client module plus thin hook (recommended)
Effort S (human: ~2h / CC: ~15min), risk low. `feed-client.ts` takes injected `EventSource`, `fetch` and timer functions plus a source seam, exposes subscribe-style callbacks; `useOffice.ts` owns the reducer and effect cleanup only. Same behavior as D12, D15, D16 and the StrictMode cleanup. ✅ Direct unit tests of every D15 order. ✅ Hook under 5 branches. ❌ Two more files.
B) Everything in the hook
Effort S (zero extra), risk medium. ✅ One file. ✅ Matches BUILD_TODO 4.2 wording. ❌ Not unit testable without a DOM environment; more than 10 branches.

State: approved
Actual answer: A) Client module plus thin hook (recommended), eng D5
Accepted scope: `src/office/feed-client.ts` and `feed-client.test.ts`: injected `EventSource`, `fetch` and timers plus the source seam; implements CEO D12 replay, D15 connection classification with attempt id, D16 validation and the StrictMode cleanup contract; `useOffice.ts` is the thin hook (reducer and effect cleanup only).
History: none

### Section 3: Test review (eng review)

Baseline run: `vp test` passes, 9 files and 379 tests (verified 10:01). Framework: Vitest via `vite-plus/test`, node environment, no DOM library; specs use `renderToStaticMarkup`. Existing coverage relevant here: machine.test.ts 41 tests including the 1,000-sequence seeded oracle, identity.test.ts 11, art.test.ts 59, props.test.ts 11, css.test.ts and tokens.test.ts.

```
CODE PATHS (existing)                                  USER FLOWS (all proposed)
[+] src/office/machine.ts                              [+] Live session appears        -> demo + live check (T5/T7)
  |- applyEvent/tick, R1/R2, episodes [★★★ TESTED]     [+] Arrive, work, wave, handoff -> [→E2E] 5.2 + ?demo
  |- NEW applyEvents bulk (D21)       [PLANNED ★★★]    [+] Chip click / keyboard focus -> [→E2E] 5.3 (+ focus-after-leave, scroll-into-view)
  |- NEW tick identity (D21)          [PLANNED ★★]     [+] Reduced motion              -> [→E2E] 5.3 + css raw test
  |- NEW tool waitingSince (D2)       [PLANNED ★★★]    [+] Reload with waiting agent   -> unit (feed-client replay) + ?demo
[+] src/office/identity.ts [★★ TESTED]                 [+] Refused / reconnecting      -> unit with fakes; [→E2E] 5.2 refused host
  |- NEW agentKey seeding (D8)        [PLANNED ★★]     [+] Empty room                  -> static markup + [→E2E] 5.2 empty fixture
[+] NEW feed-client.ts (R4)           [PLANNED ★★★]    [+] 24 agents scroll            -> ?demo 24 case + [→E2E] gap (see below)
  |- 403, 503, drop, stale probe both orders, bad JSON, bad event, remount
[+] NEW selectors.ts (R3), label.ts (D17), announcer (R2), iso.ts + placeBubbles, swap controller (D10)   [PLANNED ★★★ each]
[+] NEW Scene/Character/TopBar markup (static)   [PLANNED ★★]   data-state, data-shirt, banners, attention ring+bubble+hand
[+] NEW useDocumentChrome: pure title/dot rule [PLANNED ★★]    DOM favicon swap itself: [GAP, E2E-optional]
[+] props.ts CLOCK/STEAM + DESIGN.md Motion   [art.test + css raw test, PLANNED ★★★]

COVERAGE (plan-level): existing tested 4 modules | planned-with-test 12 new units | explicit gaps: 2
QUALITY of existing: ★★★ machine, art; ★★ identity | GAPS: favicon DOM swap; demo-in-dist guard is a manual grep (T7 verify)
```

Carried forward as required proof of approved behavior (no new question): update the seeded D5 oracle for tool waits (see R1); 5.3 gains two cases for approved D18 (focus after the focused agent leaves) and D22 (chip click scrolls the agent into view); css raw test proves ambient is off under `prefers-reduced-motion` (D7); full `vp test` after DESIGN.md, props.ts and main.tsx edits (learning art-test-raw-reads); wait labels update once per minute and omit time when unknown (4.7, DESIGN partial row) as a case in the selectors table. IRON RULE: existing behavior at risk is machine.ts; existing 41 tests plus the oracle are the regression coverage, and its approved contract changes (R1) are named above. New policies or optional verification depth proposed: none, so no test decision is pending.

Tests made obsolete by this plan: none. LLM/eval scope: none (no prompt files; CLAUDE.md lists none).

### Section 4: Performance (eng review)

Measured with a temporary test file (removed): `renderToStaticMarkup` of `CharacterRig` gives 785 to 867 elements and about 40 KB per pose; `PixelDesk` gives 1,517 elements and about 78 KB. A seated agent is about 2,350 elements; 12 agents about 28,000 (about 1.4 MB), 24 agents about 57,000 (about 2.8 MB). CEO Section 7 had this unmeasured. Other checks: no database or N+1; memory bounded by agents; caching not needed; slowest paths are the first mount of the room, scroll repaint (D22) and reload replay (D21 addresses cloning).

Findings: P1 [P2] (confidence 9/10, measured) `src/office/CharacterRig.tsx:169` `PixelDesk` re-emits the same 1,517 elements for every agent; at the 12-agent success criterion (BUILD_TODO 6.1) that is about 28,000 SVG elements before scroll repaint (D22) and CSS animation. Chrome and Safari timing is unmeasured (M10 stays deferred).

### R5: render the desk once and reuse it

Finding: P1, P2, confidence 9/10, src/office/CharacterRig.tsx:169 (`export const PixelDesk = memo(function PixelDesk({ lit = true }`); reviewer: plan-eng-review.
Plan baseline: 4.0b props approved and drawn; 4.4 places one desk per agent; DESIGN.md "monitors glow only while the agent is working" (lit and dim variants); BUILD_TODO 6.1 "12 agents on screen hold up".
Runtime evidence: desk 1,517 elements, 77,841 bytes of markup; character 785 to 867 elements (probe above). Browser frame time unknown.
Comparison grid:

| Commitment                                                 | Source/approval   | Current                      | A Shared desk symbol                                                              | B Measure first                    | C Accept       |
| ---------------------------------------------------------- | ----------------- | ---------------------------- | --------------------------------------------------------------------------------- | ---------------------------------- | -------------- |
| Desk art unchanged (pixels, palette)                       | approved (4.0b)   | per-agent copy               | same art, drawn once per variant                                                  | per-agent copy                     | per-agent copy |
| Lit and dim monitor states                                 | approved (DESIGN) | `lit` prop                   | two shared symbols (lit, dim)                                                     | `lit` prop                         | `lit` prop     |
| Elements at 12 agents                                      | pending           | about 28,000                 | about 10,100                                                                      | about 28,000 until measured        | about 28,000   |
| Elements at 24 agents                                      | pending           | about 57,000                 | about 20,200                                                                      | about 57,000                       | about 57,000   |
| Character art and pose swap (D10)                          | approved          | per-agent rig                | unchanged                                                                         | unchanged                          | unchanged      |
| CSS variable theming (`--shirt`, `--hair` on the rig root) | approved (4.3)    | on root                      | unchanged for characters; desk uses fixed tokens                                  | unchanged                          | unchanged      |
| Tests                                                      | pending           | art.test renders `PixelDesk` | art.test still passes; markup test: one desk definition and one `<use>` per agent | a 12-agent timing probe in `?demo` | none           |
| Files                                                      | pending           | none                         | `CharacterRig.tsx` (PixelDesk), `art.test.ts` case                                | none                               | none           |

Question D6:
D6 — R5: how many times is the desk drawn?
Project/branch/task: office-agents, feat/phase-4-office-ui, Section 4 finding P1 (measured).
ELI10: Every agent sits at an identical desk, and today each desk is drawn as its own pile of 1,517 tiny shapes. I counted: a character is about 840 shapes, so a seated agent is about 2,350. With 12 agents (the success target) that is roughly 28,000 shapes, and 57,000 with 24. Drawing the desk once and pointing each agent at that drawing cuts the total by about 64%, with the art looking identical.
Stakes if we pick wrong: the room may stutter on first load, when scrolling past the 50% floor, or in Safari, and you would find out only when a real 12-agent session runs.
Recommendation: A because it removes the largest duplicated cost with no visual change, and tests keep the art identical (explicit over clever, smallest clear diff).
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Draw the desk once and reuse it (recommended)
✅ About 64% fewer shapes at 12 agents (28,000 to 10,100); same pixels; lit and dim stay.
❌ Edits the finished CharacterRig.tsx; shared drawings need a check in Safari and in the art sheet.
B) Measure first
✅ No change to the finished art code; real numbers before committing.
❌ Needs a timing probe and may only confirm what 28,000 shapes already suggest, delaying the fix to after 4.4.
C) Accept as is
✅ No change and no new test.
❌ Largest duplicated cost ships; the 12-agent criterion rests on hope.
Net: a small, tested change to remove duplicated drawing vs. shipping and hoping.
Header: Desk drawing
Options:
A) Draw the desk once and reuse it (recommended)
Effort S (human: ~3h / CC: ~20min), risk low. `PixelDesk` renders its two variants (lit, dim) once into shared SVG `<defs>`/symbols and each agent places a `<use>`; `art.test.ts` keeps passing and gains a markup case (one definition per variant, one `<use>` per desk); check in `?art` and `?demo` with 12 agents in Chrome and Safari. ✅ About 64% fewer elements at 12 agents. ✅ Identical art. ❌ Touches finished CharacterRig.tsx.
B) Measure first
Effort S (human: ~2h / CC: ~15min), risk medium. A 12 and 24 agent `?demo` timing probe at 4.4 before any change. ✅ Data before a change. ❌ Delays the fix; adds a timing probe.
C) Accept as is
Effort S (zero extra), risk medium. ✅ No change. ✅ No new test. ❌ About 28,000 shapes at 12 agents.

State: approved
Actual answer: A) Draw the desk once and reuse it (recommended), eng D6
Accepted scope: `PixelDesk` renders its lit and dim variants once into shared SVG defs/symbols and each agent places a `<use>`; art unchanged; `art.test.ts` keeps passing and gains a markup case (one definition per variant, one `<use>` per desk); checked in `?art` and `?demo` with 12 agents in Chrome and Safari. Characters unchanged.
History: none

### Outside voice (eng review)

Disabled (`codex_reviews=disabled`); disabled outcome recorded in the review log. No challenge prompt, no CLI call, no native replacement.

### R6: TODO, share character drawings after the desk

Finding: follow-up to P1 (measured), reviewer: plan-eng-review. Considered once; no prior disposition.
Plan baseline: R5 approved shares the desk only; characters stay per-agent (approved 4.0b, D10).
Runtime evidence: a character is 785 to 867 elements (probe). At 12 agents characters are about 10,100 elements after R5; no timing data.
Comparison grid:

| Commitment                                            | Source/approval     | Current       | A Add TODO                              | B Skip      | C Build now               |
| ----------------------------------------------------- | ------------------- | ------------- | --------------------------------------- | ----------- | ------------------------- |
| Desk shared (R5)                                      | approved            | in scope      | unchanged                               | unchanged   | unchanged                 |
| Characters shared via symbols per pose and hair style | pending             | not planned   | TODOS.md item, P3, gated on M10 timings | not tracked | in this PR                |
| Pose swap and `--shirt` theming                       | approved (D10, 4.3) | per-agent rig | unchanged until the TODO is picked up   | unchanged   | would change with this PR |
| Files                                                 | pending             | none          | `TODOS.md`                              | none        | `CharacterRig.tsx`, tests |

Question D7:
D7 — R6: track sharing character drawings as a TODO?
Project/branch/task: office-agents, feat/phase-4-office-ui, final planning decisions.
ELI10: After the desk is drawn once, the characters are still about 840 shapes each, roughly 10,000 shapes at 12 agents. They could be shared the same way, but that touches pose swapping and shirt colors, which are approved and finished. Only real timing in Chrome and Safari (the deferred M10 profiling) will say whether it is needed.
Stakes if we pick wrong: the idea is forgotten if timings later show jank, or it distracts this PR with risky art-code changes.
Recommendation: A because it costs one TODOS.md entry, tied to the existing M10 timing item, and keeps this PR focused (right-sized diff).
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Add to TODOS.md (recommended)
✅ The follow-up is recorded with its trigger (M10 timings) and the measured numbers.
❌ One more backlog item that may never be needed.
B) Skip
✅ No backlog growth.
❌ The measured numbers and the idea live only in this review file.
C) Build it now in this PR
✅ Largest element-count reduction, about 10,000 fewer shapes at 12 agents.
❌ Changes finished pose and shirt code before any timing says it is needed.
Net: record the idea with its trigger vs. dropping it or risking the art code now.
Header: Share characters
Options:
A) Add to TODOS.md (recommended)
Effort S (human: ~10min / CC: ~2min), risk low. One P3 entry "Share character drawings via symbols", depends on the M10 timing result, with the measured counts. ✅ Recorded with its trigger. ❌ One more backlog item.
B) Skip
Effort S (zero extra), risk low. ✅ No backlog growth. ❌ Idea and numbers only in this file.
C) Build it now in this PR
Effort M (human: ~1 day / CC: ~45min), risk medium. Share character poses via symbols, keep `--shirt` theming and pose swap working. ✅ About 10,000 fewer shapes at 12 agents. ❌ Touches finished, approved art code without timings.

State: approved
Actual answer: A) Add to TODOS.md (recommended), eng D7
Accepted scope: one P3 entry "Share character drawings via symbols" in TODOS.md under Office, depends on M9 and the M10 timings, with the measured element counts. No code change.
History: none

Approval readiness: PASS. Checked rows and actual answers: eng D1 (structure, original arrangement), R1 (D2), R2 (D3), R3 (D4), R4 (D5), R5 (D6), R6 (D7). Every CEO-review row used here (D2 to D22) is cited by its own answer. The oracle update and the 5.3 extra cases are required proof of approved behavior (R1, CEO D18, D22, D7), not new choices. No row is unresolved, declined or deferred.

### Eng review outputs

#### NOT in scope (eng review)

Deferred: sharing character drawings via symbols (R6, TODOS.md P3, gated on M10 timings); M10 profiling itself (existing TODO); persisting announced waits across a full page reload (D3 limitation, one repeat announcement accepted); an automated dist guard for `__OFFICE_DEMO__` (stays a manual grep in T7). Rejected: none.

#### What already exists (eng review)

Reused as is: `machine.ts` (two additive changes, R1 and D21), `identity.ts`, `poses.ts`, `CharacterRig.tsx` (characters unchanged; `PixelDesk` reworked by R5), `parseAgentEvent`, `shared/tuning.ts`, the feed and `/__office/status`. No shared-code extraction beyond `selectors.ts` (R3), whose callers are proposed (Scene, TopBar, announcer, document chrome); nothing existing is duplicated or rebuilt.

#### Diagrams (eng review)

System architecture, data flow with shadow paths, connection state machine, error flow, deploy and rollback are in the CEO review sections above and are unchanged except: `useOffice` is split into `feed-client.ts` (connection, validation, replay) and a thin hook, and the desk is drawn once.

```
 SSE/probe/timers (injected) -> feed-client.ts --callbacks--> useOffice (reducer, cleanup)
      replay: applyEvents(state, events, per-event clock = ev.ts) -> one tick(now) -> drop leaving
 state -> selectors.ts (desk order, chips, focus order, waiting count) -> Scene | TopBar | announcer | useDocumentChrome
 announcer: agentKey@waitingSince, page-session set
 tool wait: waitingSince = earliest overdue startedAt + toolTimerMs (R1)
 room markup: one shared desk definition (lit, dim) + one <use> per desk (R5)
```

#### Failure modes (eng review)

```
CODEPATH            | FAILURE MODE                          | TEST? | ERROR HANDLING | USER SEES
--------------------|---------------------------------------|-------|----------------|-------------------------
machine waitingSince| reload misdates a stuck-tool wait     | Y     | fixed (R1)     | true wait, correct order
announcer           | reconnect re-announces all waits      | Y     | fixed (R2)     | quiet reconnect
selectors           | chip order and focus order disagree   | Y     | fixed (R3)     | consistent order
feed-client         | stale probe, bad frame, 403, 503      | Y     | D15, D16, R4   | correct banner
Scene render        | 28k to 57k SVG elements               | partial (timings deferred) | R5 | smooth, unmeasured in Safari
favicon swap        | DOM swap untested in node             | N     | guarded no-op  | dot may not update (not silent: title count remains)
```

No row has no test, no handling and a silent result: 0 critical gaps.

#### Worktree parallelization strategy

| Step                                        | Modules touched                      | Depends on                        |
| ------------------------------------------- | ------------------------------------ | --------------------------------- |
| Shared desk constant (CEO T1 part)          | shared/, server/                     | —                                 |
| machine changes (R1, D21) and oracle update | src/office (machine files)           | —                                 |
| Desk once (R5)                              | src/office (CharacterRig, art tests) | —                                 |
| selectors, announcer (R3, R2)               | src/office                           | machine changes                   |
| feed-client and thin hook (R4)              | src/office                           | machine changes                   |
| Scene, Character, TopBar, chrome, demo      | src/office                           | selectors, feed-client, desk once |
| Docs housekeeping                           | docs/, BUILD_TODO, TODOS, README     | —                                 |

Lane A: machine changes -> selectors/announcer + feed-client -> Scene/Character/TopBar/chrome/demo (src/office, sequential). Lane B: shared desk constant (shared/, server/). Lane C: desk once (src/office/CharacterRig files, `art.test.ts`). Lane D: docs. Execution order: launch A, B, C, D together; merge B, C, D; A finishes last. Conflict flags: A and C both live under src/office but touch disjoint files except `art.test.ts` read by edits to main.tsx, DESIGN.md and props.ts (T7, T8): sequence C before those edits, and rerun the full `vp test`.

#### Implementation Tasks (eng review)

Adds to the CEO review T1 to T9 above; where noted it amends them.

- [ ] **E1 (P1, human: ~3h / CC: ~20min)** — machine — tool wait start, per-event-clock `applyEvents`, identity-stable `tick`, oracle update
  - Surfaced by: Section 1 E1 (R1/D2); CEO D21 signature correction
  - Files: `src/office/machine.ts`, `src/office/machine.test.ts`
  - Verify: `vp test`: replay of a 1 h old stuck tool keeps about 1 h; oracle (machine.test.ts:466) expects `startedAt + toolTimerMs` for tool entries and still holds every other invariant over 1,000 sequences; bulk equals sequential; `tick` returns the same object when nothing changed
- [ ] **E2 (P1, human: ~2h / CC: ~15min)** — selectors and announcer (amends CEO T6)
  - Surfaced by: Section 1 E2 (R2/D3), Section 2 Q1 (R3/D4)
  - Files: `src/office/selectors.ts`, `src/office/selectors.test.ts`, announcer helper and test
  - Verify: `vp test`: table covers chip order with tie-break by key, focus order, waiting count, unknown wait time omitted; announcer silent for a replayed episode, announces a new wait and the same agent's new wait
- [ ] **E3 (P1, human: ~2h / CC: ~15min)** — feed client (amends CEO T3)
  - Surfaced by: Section 2 Q2 (R4/D5)
  - Files: `src/office/feed-client.ts`, `src/office/feed-client.test.ts`, `src/office/useOffice.ts`
  - Verify: `vp test` with injected `EventSource`, `fetch`, timers: 403, 503, drop, recovery, stale probe in both orders with controlled release, bad JSON, bad event, remount cleanup; hook has under 5 branches
- [ ] **E4 (P2, human: ~3h / CC: ~20min)** — art — draw the desk once
  - Surfaced by: Section 4 P1 (R5/D6)
  - Files: `src/office/CharacterRig.tsx`, `src/office/art.test.ts`
  - Verify: `vp test` (art.test.ts passes, new markup case: one definition per variant and one `<use>` per desk); `?art` and `?demo` look identical; check 12 agents in Chrome and Safari
- [ ] **E5 (P3, human: ~30min / CC: ~5min)** — docs (amends CEO T9)
  - Surfaced by: Test review, R6
  - Files: `BUILD_TODO.md` (5.3 gains focus-after-leave and chip scroll-into-view cases), `TODOS.md` (done in this review: share-characters entry)
  - Verify: read-through; 5.3 text lists both new E2E cases

#### Unresolved decisions

None in this review.

#### Completion summary

```
- Step 0: Scope Challenge — scope accepted as-is (structure: original arrangement, eng D1)
- Architecture Review: 2 issues found (E1, E2), both resolved
- Code Quality Review: 2 issues found (Q1, Q2), both resolved
- Test Review: diagram produced, 2 gaps identified (favicon DOM swap; demo-in-dist guard is manual), no decision pending
- Performance Review: 1 issue found (P1 measured), resolved
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 1 item proposed to user (added)
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: codex, disabled (codex_reviews=disabled), no native replacement
- Parallelization: 4 lanes, 3 parallel / 1 sequential
- Lake Score: N/A (all questions differed in kind)
```

## Design review (/plan-design-review, 2026-10-02)

Fixed target: this plan, calibrated against `DESIGN.md` and `src/index.css`. Initial design rating 7/10. Mockup evidence: `~/.gstack/projects/office-agents/designs/office-states-20261002/empty-refused.png` (a state reference, not a direction choice; shows the contradiction "Feed refused" plus "No active Claude Code sessions"). Correction to CEO D22: DESIGN.md:179 already specifies scroll below 50% with the bar pinned; same outcome, no change.

### Design decision ledger

| ID   | Pass | Gap (evidence)                                                                                  | Approved fix                                                                                                                                                                                                                                                                                | Status                      | Answer                                                                               |
| ---- | ---- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------ |
| DR1  | 1    | `+N` chip has no defined behavior (DESIGN.md Top bar)                                           | `+N` is plain text with accessible name "and N more waiting"; hidden agents stay in focus order and the room; no popover, no wrap                                                                                                                                                           | approved                    | design D2 "Plain count, not a button"                                                |
| DR2  | 2    | Six messages compete for one status line; mockup showed Refused plus No active sessions         | pure `statusLine(conn, errorBoundary, agentCount)`; priority Display error, Refused, Feed unavailable, Reconnecting, Connecting, No active sessions; "No active sessions" only when connected; unit test of every pair                                                                      | approved                    | design D3 "Fixed priority, one line"                                                 |
| DR3  | 2    | Only Reconnecting has a color and wording; Refused, Feed unavailable, Display error unspecified | `--warn` for Reconnecting, Refused, Feed unavailable, Display error; `--text-muted` for Connecting and No active sessions; wording "Reconnecting...", "Refused: open this page from localhost", "Feed unavailable, retrying", "Display error: reload the page"; 14px bar text; no new token | approved                    | design D4 "One amber family, words carry severity"                                   |
| DR4  | 2    | Empty room gives a fact but no next step on first run                                           | bar keeps "No active Claude Code sessions"; a centered `--text-muted` 14px hint "Start Claude Code in a project and its agent walks in." in the unscaled overlay, only when connected with 0 agents, removed when the first agent arrives                                                   | approved                    | design D5 "Add one muted hint line in the room"                                      |
| DR5  | 4    | `--screen-glow` is defined but unused (index.css:8, DESIGN.md:27); "glow" invites a halo        | the lit screen cells are the glow (no halo); delete `--screen-glow` from DESIGN.md and index.css; reword Scene rules to "lit screen cells"; token and art tests rerun                                                                                                                       | approved                    | design D6 "Lit screen is the glow; retire the token"                                 |
| DR6  | 5    | `public/favicon.svg` is the Vite bolt in off-token `#863bff`; the dot (CEO D6) needs hex        | replace with a small app icon in two SVGs (plain, and with a dot) using only token hex values, dot = the `--accent` value; drift test against DESIGN.md                                                                                                                                     | approved                    | design D7 "Draw a small app icon from tokens, with a drift test"                     |
| DR7  | 5    | New `CLOCK` and `STEAM` props need colors (CEO D7/D11)                                          | reuse existing tokens: clock `--metal` frame, `--bubble-fill` face, `--plastic` hands; steam `--outline` cells at the existing 35% overlay; no new token rows                                                                                                                               | approved                    | design D8 "Reuse existing tokens only"                                               |
| DR8  | 6    | "Make this window wider" below 800x500 may hide the whole page (DESIGN.md Layout)               | below 800x500 only the room area shows "Make this window larger"; top bar, status line, chips and tab title stay; `+N` absorbs overflow; markup test at both sizes                                                                                                                          | approved                    | design D9 "Keep the top bar, replace only the room"                                  |
| DR9  | 6    | No page landmarks or announced status changes (DESIGN.md Accessibility)                         | `<header>` holds the page `h1` "Agent Office", status line and chips; `<main aria-label="Office">` holds the room; status line `role="status"` (polite); waiting-agent live region unchanged; static-markup test                                                                            | approved                    | design D10 "Native landmarks plus a polite status line"                              |
| DR10 | 7    | Wait time format undefined across bubble, chip and aria text                                    | `formatWait(ms)` in `selectors.ts`: "<1m", "12m", "1h 5m", "4h+"; unknown time omitted; table test                                                                                                                                                                                          | approved                    | design D11 "One short format everywhere"                                             |
| DR11 | 6    | Outside voice: with the room hidden (DR8) chips hidden behind `+N` (DR1) are unreachable        | amends DR1 and DR8: below 800x500 the chip row wraps to extra rows and shows every waiting chip, no `+N`; normal layout keeps DR1; markup test at 799x499 with 14 chips                                                                                                                     | approved (reopened DR1/DR8) | design D14 "In the narrow state, chips wrap to extra rows"                           |
| DR12 | 4    | Outside voice: ambient loops have no attention budget (CEO D7/D11)                              | keep ambient as accepted; add to 4.10a verify: `?demo` 12-agent screenshot with ambient on and one waving agent, the wave must read first, also under reduced motion; failure means slow or dim the loops                                                                                   | approved                    | design D15 "Add the check, keep ambient as accepted"                                 |
| DR13 | 2    | Outside voice: a chip does not help find the right terminal (click-to-focus stays out of scope) | built in this PR: the tag (hover, focus, waving) gains a second line with the last two path segments (sanitized and capped like `projectLabel`) and a 6-character session id; accessible name includes both; chips unchanged; hostile-path unit test; no terminal integration               | approved                    | design D16 "Build it now in this PR" then D17 "Detail line in the tag, not on chips" |

Approval readiness (design): PASS. Every DR row cites its own answer (design D2 to D11, D14 to D17); the mockup update (D12) and scope choices approve no remedy. DESIGN.md token mappings are recorded only where an answer approved them.

### Pass scores

| Pass                           | Before   | After    | Remaining gap                                                             |
| ------------------------------ | -------- | -------- | ------------------------------------------------------------------------- |
| 1 Information Architecture     | 9        | 10       | none                                                                      |
| 2 Interaction States           | 7        | 10       | none                                                                      |
| 3 Journey and Emotional Arc    | 9        | 9        | none found; storyboard added below (a 10 would need real-use observation) |
| 4 AI Slop Risk                 | 8        | 10       | none; hard rejections 0                                                   |
| 5 Design System Alignment      | 8        | 10       | none                                                                      |
| 6 Responsive and Accessibility | 7        | 10       | none; phone and touch out of scope by design                              |
| 7 Unresolved Decisions         | unscored | unscored | 1 resolved (DR10), 0 deferred                                             |

Overall design score (lowest rated pass): 7/10 before, 9/10 after.

### Interaction state additions (from DR2, DR3, DR4, DR8)

```
 FEATURE          | LOADING          | EMPTY                              | ERROR                             | SUCCESS | PARTIAL
 Status line      | "Connecting..." muted | "No active Claude Code sessions" muted, only if connected | amber: Reconnecting... | Refused: open this page from localhost | Feed unavailable, retrying | Display error: reload the page | (none shown) | unknown time omitted
 Room hint        | none             | "Start Claude Code in a project and its agent walks in." | none | removed on first arrival | n/a
 Narrow window    | n/a              | n/a                                | room area: "Make this window larger", bar stays | normal | n/a
```

### User journey storyboard

Steps 1 to 10 as rendered in the review: open, empty room, first agent walks in, glance while working, agent needs you (wave, ring, bubble, chip, title count, favicon dot), click chip or tab in, answer and relief, server blip (Reconnecting, scene dim), hard failure (worded amber message), reload mid-wait (same names, colors, waits). 5 seconds: dim evening room with one anchor. 5 minutes: quiet glance cadence. 5 years: stable names, stable map.

### Approved Mockups

| Screen/Section                  | Mockup Path                                                                                      | Direction                                                    | Notes                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Room, working states            | /Users/nathanael/Code/office-agents/docs/designs/mockup-room-variant-a.jpg                       | Variant A (approved 2026-10-01)                              | DESIGN.md Open items gaps stay tasks 4.14                                                                                                   |
| Refused state (reference)       | /Users/nathanael/.gstack/projects/office-agents/designs/office-states-20261002/refused-v2.png    | Single amber status line, no empty-state claim, no wall text | Generated reference only: its desk layout (2 plus 4) and monospace bar font are NOT spec; the user did not choose among variants (no board) |
| Refused plus empty (superseded) | /Users/nathanael/.gstack/projects/office-agents/designs/office-states-20261002/empty-refused.png | Shows the contradiction fixed by DR2                         | Do not copy                                                                                                                                 |

### NOT in scope (design)

High-contrast / forced-colors styling, light theme (DESIGN.md: dark only), phone and touch layouts (loopback feed, R3), an error color token (DR3 chose none), a `+N` popover (DR1), a halo glow (DR5), outside design voices (not run this review).

### What already exists (design)

DESIGN.md (tokens, state-to-look, motion, bubbles, hit areas, Layout), `index.css` tokens and `:focus-visible` accent ring, `ArtSheet` 12-agent row, `--warn`, `--text-muted`, art palette tokens reused by the new props.

### TODOS.md updates (design)

None proposed: every gap was decided and moved into tasks.

### Implementation Tasks (design review)

- [ ] **X1 (P1, human: ~2h / CC: ~15min)** — status line — `statusLine()` with priority, wording, amber/muted colors, empty hint, `role="status"` (DR2, DR3, DR4, DR9)
  - Files: `src/office/selectors.ts` or `statusLine.ts`, `src/office/TopBar.tsx`, tests, `DESIGN.md` (Top bar, Interaction states)
  - Verify: `vp test`: every pair of conditions picks the documented line; hint only when connected and empty; static markup has `role="status"`
- [ ] **X2 (P2, human: ~1h / CC: ~10min)** — chips — plain `+N` text, `formatWait` (DR1, DR10)
  - Files: `src/office/TopBar.tsx`, `src/office/selectors.ts`, tests
  - Verify: `vp test`: format table ("<1m", "12m", "1h 5m", "4h+"), `+N` has accessible name and is not a button
- [ ] **X3 (P2, human: ~2h / CC: ~15min)** — layout — landmarks and narrow window (DR8, DR9)
  - Files: `src/office/Scene.tsx`, `src/office/TopBar.tsx`, `src/App.tsx`, tests, `DESIGN.md` (Layout, Accessibility)
  - Verify: static markup at 799x499 and 800x500 keeps header; `h1`, `header`, `main[aria-label=Office]` present
- [ ] **X4 (P2, human: ~30min / CC: ~5min)** — tokens — retire `--screen-glow` (DR5)
  - Files: `DESIGN.md`, `src/index.css`, `src/tokens.test.ts` if it lists it
  - Verify: full `vp test` (art.test.ts reads DESIGN.md) passes; grep finds no `screen-glow`
- [ ] **X5 (P2, human: ~2h / CC: ~15min)** — favicon — app icon pair and drift test (DR6; amends CEO T6)
  - Files: `public/favicon.svg`, `public/favicon-attention.svg`, `src/office/useDocumentChrome.ts`, test
  - Verify: `vp test`: every hex in both SVGs is a DESIGN.md token value, dot equals `--accent`; look at 16px
- [ ] **X6 (P3, human: ~30min / CC: ~5min)** — ambient art — token-only clock and steam (DR7; amends CEO T8)
  - Files: `src/office/props.ts`
  - Verify: `vp test` (art and props tests) passes with no new token rows

Task JSONL is written to `~/.gstack/projects/office-agents/tasks-design-review-*.jsonl`.

### Completion summary (design)

```
  | System Audit         | DESIGN.md present (235 lines), full UI scope          |
  | Step 0               | 7/10, all 7 dimensions                                |
  | Pass 1 (Info Arch)   | 9/10 -> 10/10                                         |
  | Pass 2 (States)      | 7/10 -> 10/10                                         |
  | Pass 3 (Journey)     | 9/10 -> 9/10                                          |
  | Pass 4 (AI Slop)     | 8/10 -> 10/10                                         |
  | Pass 5 (Design Sys)  | 8/10 -> 10/10                                         |
  | Pass 6 (Responsive)  | 7/10 -> 10/10                                         |
  | Pass 7 (Decisions)  | 1 resolved, 0 deferred                                |
  | NOT in scope         | written (6 items)                                     |
  | What already exists  | written                                               |
  | TODOS.md updates     | 0 items proposed                                      |
  | Approved Mockups     | 2 generated, 0 chosen by vote (state references)      |
  | Decisions made       | 13 added to plan (10 + 3 from the outside voice)     |
  | Decisions deferred   | 0                                                     |
  | Overall design score | 7/10 -> 9/10 (outside voice: 3 more decisions)        |
```

### Outside design voice (Codex, read-only, 2026-10-02)

Requested by the user ("Run outside review"). Codex ran with its hard-rule, litmus and classifier prompt over this plan and DESIGN.md; the Claude subagent voice was not run (single-model result). Classification: APP UI. Hard rejection raised: #2 weak brand ("Agent Office" placeholder); disputed, see below.

```
DESIGN OUTSIDE VOICES - LITMUS SCORECARD (Codex only)
 1 Brand unmistakable in first screen?  NO   (placeholder name; I disagree: open item in DESIGN.md, room is the brand)
 2 One strong visual anchor?            YES
 3 Scannable by headlines only?         NO   (disputed: app UI, no headlines by design)
 4 Each section one job?                YES
 5 Cards actually necessary?            NO   (none used)
 6 Motion improves hierarchy?           YES  (ambient needs restraint)
 7 Premium without decorative shadows?  YES
```

| #   | Finding                                                 | Disposition                                                                                                                             |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Chip click does not lead to the right terminal          | Scope disagreement kept (click-to-focus is NOT in scope in the design doc); user chose to build a discreet identification instead: DR13 |
| 2   | `+N` plus hidden room leaves waiting agents unreachable | Confirmed against DR1 and DR8; reopened; DR11                                                                                           |
| 3   | Placeholder product name, add a descriptor              | Not adopted: name is a tracked open item in DESIGN.md, a tagline adds text; no change (noted, user can raise it)                        |
| 4   | Ambient loops have no attention budget                  | Check added, scope kept: DR12                                                                                                           |

### Additional tasks from the outside voice

- [ ] **X7 (P2, human: ~2h / CC: ~15min)** — tag detail line (DR13): second line with last two path segments and 6-char session id, sanitized and capped, in the accessible name
  - Files: `src/office/label.ts`, `src/office/Character.tsx` or tag component, tests, `DESIGN.md` (Identity tag)
  - Verify: `vp test` with hostile paths and a 5 KB path; session id is 6 characters of the id only (no transcript text)
- [ ] **X3 amended (DR11):** narrow state wraps all waiting chips (no `+N`); markup test at 799x499 with 14 chips
- [ ] **X6/T8 amended (DR12):** 4.10a verify gains the 12-agent wave-first screenshot with ambient on and under reduced motion

## Eng review, run 2 (/plan-eng-review, 2026-10-02, after the design review)

Fixed target: this plan. Prior eng answers D1 to D7 stand. Baseline `vp test`: 9 files, 379 tests pass. Scope Challenge: reuse complete; gate tripped again (about 36 files after DR1 to DR13), resolved by exact prior answer eng D1 "Original arrangement" (new files are each covered by their own approved decisions); no cuts; scope accepted as-is. Scope Challenge findings: No issues found.

### Section 1 (run 2): Architecture

Finding E3 [P2] (confidence 8/10): CEO D15 and design DR2/DR9 rely on "timer reopen" (lines in the error registry and connection state machine) with no interval, backoff or ceiling. Server cap `MAX_SSE_CLIENTS = 8` (server/feed-plugin.ts:45). Dependent text, no question: `placeBubbles` and its tests use the real two-line tag height from DR13; the narrow-state chip wrap (DR11) needs a bar `max-height` with internal scroll so the bar cannot fill a 500px-high window (P3 note on X3).

### R7: reopen cadence after a closed feed

Finding: E3, P2, confidence 8/10, CEO D15 accepted scope ("a timer reopens the stream"); reviewer: plan-eng-review.
Plan baseline: D15 approved the probe and "a timer reopens the stream"; cadence unspecified. Design DR9 bounds status announcements "by the reopen timer's cadence".
Runtime evidence: none (feed-client.ts does not exist). Server cap 8 verified at feed-plugin.ts:45; browser EventSource retries drops itself (CONNECTING) and never retries a non-2xx.
Comparison grid:

| Commitment                                 | Source/approval | Current             | A Backoff 2 s to 30 s                                                         | B Fixed 5 s    | C Decide at build |
| ------------------------------------------ | --------------- | ------------------- | ----------------------------------------------------------------------------- | -------------- | ----------------- |
| Probe, classify, timer reopen after CLOSED | approved (D15)  | yes                 | yes                                                                           | yes            | yes               |
| Reopen interval                            | pending         | unspecified         | 2 s, 4 s, 8 s, 16 s, then 30 s ceiling; resets after a stream stays open 10 s | 5 s always     | unspecified       |
| Time to recover after a dev-server restart | pending         | unknown             | about 2 to 6 s typical                                                        | up to 5 s      | unknown           |
| Status announcements per minute while down | pending         | unbounded by design | at most about 2 once at the ceiling                                           | about 12       | unknown           |
| Constants                                  | pending         | none                | named in `feed-client.ts`, injected timers in tests                           | named          | none              |
| Tests                                      | pending         | none                | fake timers: sequence, ceiling, reset after 10 s open                         | fixed interval | none              |

Question D8:
D8 — R7: how often does the page retry a closed feed?
Project/branch/task: office-agents, feat/phase-4-office-ui, eng run 2, Section 1 finding E3.
ELI10: When the feed is refused or unavailable, the page retries on a timer, but no one chose how often. Retrying every second would hammer the dev server (it accepts only 8 viewers) and make the screen reader announce a status flip over and over. Retrying every minute would leave you looking at "Feed unavailable" long after the server is back. A short delay that grows to a ceiling handles both.
Stakes if we pick wrong: a restart leaves the page stuck for a minute, or a down server gets a retry storm and a chatty status line.
Recommendation: A because it recovers in seconds after a normal restart, stays quiet when the server is really down, and is a few lines with fake timers to test (explicit over clever).
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Backoff from 2 s up to a 30 s ceiling (recommended)
✅ Typical restart recovers in 2 to 6 s; a long outage settles at one try per 30 s; announcements stay rare.
❌ Slightly more code than a fixed timer: a counter and a reset rule.
B) Fixed 5 s retry
✅ Simplest possible rule.
❌ About 12 tries and status changes per minute during a long outage; every try is a request to a server that may be down.
C) Decide at build
✅ No planning cost.
❌ Unchosen constants that set how loud the status line is for screen-reader users.
Net: a few extra lines for quick recovery and a quiet outage.
Header: Retry cadence
Options:
A) Backoff from 2 s up to a 30 s ceiling (recommended)
Effort S (human: ~1h / CC: ~10min), risk low. Named constants in `feed-client.ts`: delays 2, 4, 8, 16, then 30 s; the counter resets after a stream stays open 10 s; fake-timer tests for the sequence, the ceiling and the reset. ✅ Fast recovery, quiet outage. ❌ A counter and a reset rule.
B) Fixed 5 s retry
Effort S (human: ~30min / CC: ~5min), risk medium. One constant. ✅ Simplest. ❌ About 12 retries per minute while down.
C) Decide at build
Effort S (zero extra), risk medium. ✅ No planning cost. ❌ Loudness of the status line left to chance.

State: approved
Actual answer: A) Backoff from 2 s up to a 30 s ceiling (recommended), eng run 2 D8
Accepted scope: named constants in `feed-client.ts`: reopen delays 2, 4, 8, 16, then 30 s; the counter resets after a stream stays open 10 s; fake-timer tests for the sequence, the ceiling and the reset. Applies after a CLOSED stream (Refused or Feed unavailable); browser-handled CONNECTING retries unchanged.
History: none

### Sections 2 to 4 (run 2)

Code quality: Q3 `statusLine()` lives in its own `src/office/statusLine.ts` (task X1 said "selectors.ts or statusLine.ts"; `selectors.ts` stays about agent views, R3): correction, no behavior change. Q4 the DR13 tag detail reuses the `label.ts` sanitizer through one `pathTail(path)` next to `projectLabel`, so labels and details share one definition: dependent text of D17 and DR13. Favicon: `useDocumentChrome` swaps the `<link rel="icon">` href between the two SVGs; whether Safari repaints a changed favicon is unverified, so X5 verify gains a Safari look (the DOM swap itself stays the known untested gap). Test review: the amended coverage diagram gains rows, no gap needing a decision: status pair table (X1), `formatWait` table (X2), narrow markup at 799x499 with 14 chips and 800x500 (X3), landmarks (X3), favicon hex drift (X5), tag detail with a hostile path (X7), reopen backoff sequence, ceiling and reset (R7); `--screen-glow` has no test reference (grep verified), full `vp test` after DESIGN.md edits. Performance: no issues (one extra text node per tag, `formatWait` once a minute, chip wrap relayout is trivial).

Approval readiness (eng run 2): PASS. R7 cites eng run 2 D8; every earlier row keeps its own answer reference; the design rows DR1 to DR13 are cited by their design answers.

### Eng run 2 outputs

NOT in scope: unchanged from run 1 plus bar `max-height` tuning beyond a note on X3. What already exists: unchanged. Failure modes: retry storm and chatty status line now covered (R7), 0 critical gaps. Parallelization: unchanged (4 lanes); X-tasks sit in Lane A after E1 to E3.

- [ ] **E6 (P2, human: ~1h / CC: ~10min)** — feed client — reopen backoff (R7): 2, 4, 8, 16, 30 s ceiling, reset after 10 s open
  - Surfaced by: run 2 Section 1 E3
  - Files: `src/office/feed-client.ts`, `src/office/feed-client.test.ts`
  - Verify: `vp test` with fake timers: the delay sequence, the 30 s ceiling and the reset after a stream stays open 10 s
- Amendments (no new task): X1 uses `src/office/statusLine.ts`; X3 adds a bar `max-height` with internal scroll in the narrow state; X5 verify adds a Safari favicon look; X7 and `placeBubbles` tests use the two-line tag height; D17 `pathTail` shares the `label.ts` sanitizer.

Completion summary (run 2): Scope Challenge accepted as-is; Architecture 1 issue (resolved); Code Quality 2 corrections (no decision); Test Review 0 new gaps; Performance 0; TODOS 0 proposed; failure modes 0 critical gaps; unresolved 0; outside voice disabled (`codex_reviews=disabled`; the design-phase outside voice that did run is recorded separately); parallelization 4 lanes; Lake Score N/A.

## GSTACK REVIEW REPORT

| Review         | Trigger                                                                 | Why                             | Runs | Status                                                       | Findings                                                                                                  |
| -------------- | ----------------------------------------------------------------------- | ------------------------------- | ---- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| CEO Review     | `/plan-ceo-review`                                                      | Scope & strategy                | 1    | CLEAR                                                        | 6 proposals, 6 accepted, 0 deferred                                                                       |
| Outside Review | codex: design phase completed on request; CEO, eng (both runs) disabled | Independent 2nd opinion         | 5    | completed (design), disabled (CEO, eng)                      | design phase: 4 findings, all dispositioned; no completed external review of scope or engineering         |
| Eng Review     | `/plan-eng-review`                                                      | Architecture & tests (required) | 2    | ISSUES OPEN (run 2; history entry written after this report) | run 2: 3 issues (1 decision, 2 corrections), 0 critical gaps; run 1: 7 issues; all resolved, none pending |
| Design Review  | `/plan-design-review`                                                   | UI/UX gaps                      | 1    | CLEAR                                                        | score: 7/10 -> 9/10, 13 decisions                                                                         |
| DX Review      | `/plan-devex-review`                                                    | Developer experience gaps       | 0    | not run                                                      | n/a                                                                                                       |

**OUTSIDE COVERAGE:** codex, phase design, completed once (4 findings, single provider); disabled for CEO and both eng runs (`codex_reviews=disabled`). No native replacement. In-host refuter rounds in the CEO review are not outside coverage.

**VERDICT:** CEO + DESIGN CLEARED. Eng review (2 runs) found 10 issues in total and all are resolved; its log status stays ISSUES OPEN because the rule counts mapped work, so the readiness dashboard reads NOT CLEARED with nothing pending. All relevant reviews complete.

NO UNRESOLVED DECISIONS
