# Phase 1 (Foundations): CEO review, SELECTIVE EXPANSION

Branch: `phase-1` (from `main` at 3d3317d) | Date: 2026-10-01 | Reviewer: /plan-ceo-review
Plan under review: BUILD_TODO.md "Phase 1: Foundations" (steps 1.1 to 1.4), with the design doc `docs/designs/office-agents-isometric-office.md` (decisions R1..R9, 1A..8C stay settled and are not reopened) and `DESIGN.md`.
Review depth: implementation-ready (task level). Mode: SELECTIVE EXPANSION (user choice at D1; the recommendation was HOLD SCOPE).
Outside voice: disabled (`codex_reviews=disabled`), logged as skipped. No native replacement was run, by rule.

## Decision ledger

| ID and owner             | Contract and evidence                                                                                                                                                                                                                                         | Current                   | Proposed                                                                                                                                              | Status   | Exact approval and scope                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| P1-MODE, Step 0          | 0E mode. Evidence: about 8 changed files, 1 new dir, fix/foundation work.                                                                                                                                                                                     | recommendation HOLD SCOPE | SELECTIVE EXPANSION                                                                                                                                   | approved | D1 answer "SELECTIVE EXPANSION". Mode only; approves no change.                                                                   |
| P1-BASE, Step 0          | BUILD_TODO 1.1 to 1.4 as written, from design rows T1, T14, R9, DT1, 5A, T8, T12.                                                                                                                                                                             | 4 tasks                   | unchanged                                                                                                                                             | approved | Already approved in the eng and design reviews; reused, not re-asked.                                                             |
| P1-ADD-1, Step 0G        | `src/App.tsx` is the Vite template (hero image, counter, `/icons.svg`, imports `App.css`, `hero.png`, `react.svg`, `vite.svg`). Removing the template styles in 1.3 breaks it.                                                                                | App.tsx not in 1.3        | minimal placeholder App.tsx, delete unreferenced template assets                                                                                      | approved | D2 answer "Add to scope". Placeholder and removal of the template files only; the `?art` route in `src/main.tsx` stays untouched. |
| P1-ADD-2, Step 0G        | `AgentEvent` crosses the SSE boundary as JSON; types vanish at runtime.                                                                                                                                                                                       | types only                | `isAgentEvent` guard plus `shared/events.test.ts`                                                                                                     | approved | D3 answer "Add to scope". Pure function, no throw.                                                                                |
| P1-ADD-3, Step 0G        | 1.3 Verify "no hard-coded colors outside tokens" has no check. `art.test.ts` already compares `palette.ts` with DESIGN.md.                                                                                                                                    | manual                    | `src/tokens.test.ts` (CSS color tokens vs DESIGN.md "Color tokens" table, stray-hex scan of `src/**/*.css`)                                           | approved | D4 answer "Add to scope".                                                                                                         |
| P1-DELIGHT-1..4, Step 0G | Four 30-minute extras.                                                                                                                                                                                                                                        | none                      | (1) dark base and accent `:focus-visible`; (2) reduced-motion duration tokens; (3) page title `Agent Office`; (4) JSDoc contract table in `events.ts` | approved | D6 answer: all four selected. Each limited to its one line of scope.                                                              |
| P1-S1-1, Section 1       | R1 (tool-call timer), R2 (trailing "?"), T4 (machine is pure, takes `now`), T12 (episode id). The six listed kinds carry no tool start or end, no tool id, no question flag. T12 says the machine assigns the episode id while 1.1 says the event carries it. | six bare kinds            | raw facts in events, episode id and `waitingSince` owned by the machine                                                                               | approved | D5 answer "Raw facts in events". Exact shape below. 1.1 and T12 wording change with it.                                           |

Approval readiness: PASS. Checked rows P1-MODE, P1-BASE, P1-ADD-1, P1-ADD-2, P1-ADD-3, P1-DELIGHT-1..4, P1-S1-1 against D1 to D6 answers. No other change is accepted.

## Accepted scope (the working plan)

1. **1.1 Event types (T1/T12, amended by P1-S1-1).** `shared/events.ts` and `tsconfig` includes. See "AgentEvent contract".
2. **1.1+ Guard (P1-ADD-2).** `isAgentEvent(value: unknown): value is AgentEvent` and `shared/events.test.ts`.
3. **1.1+ Contract notes (P1-DELIGHT-4).** JSDoc in `events.ts`: producer, consumer, privacy note per kind.
4. **1.2 Font and notice (T14/R9).** `@fontsource/ibm-plex-sans` weights 400 and 600, full licence text in `NOTICE`, font imported once, as JS imports in `src/main.tsx` (`@fontsource/ibm-plex-sans/400.css` and `600.css`); `index.css` only names the stack, stack `"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif`.
5. **1.3 Tokens (DT1/5A).** `:root` variables from DESIGN.md: the 7 color tokens, spacing scale (4, 8, 12, 16, 24, 32), `--ease`, three durations, font stack, tag size 13px, top bar size 14px, line height 1.4, radii 4px and 6px. Delete the Vite template styles. Update the stale "Status" paragraph in DESIGN.md.
6. **1.3+ Template cleanup (P1-ADD-1).** Minimal `App.tsx` placeholder, delete `App.css` and unreferenced starter assets.
7. **1.3+ Base rules (P1-DELIGHT-1, -2).** `color-scheme: dark`, accent `:focus-visible`, selection color; under `prefers-reduced-motion: reduce`, `--dur-fast` and `--dur-base` become `0ms`, `--dur-slow` stays `600ms` (the approved fade).
8. **1.3+ Title (P1-DELIGHT-3).** `<title>Agent Office</title>` in `index.html`.
9. **1.3+ Token test (P1-ADD-3).** `src/tokens.test.ts`.
10. **1.4 Amendments (T8).** Reword the Success Criteria line "Wave+bubble fires on a real attention request." (design doc line 59 today; the amendments section still says line 50) as in "Accepted amendments" line 365; also reword T12 and the `BUILD_TODO.md` 1.1 and 3.1 lines to the P1-S1-1 contract.

### AgentEvent contract (P1-S1-1, exact scope)

All kinds share `sessionId: string`, `agentId: string | null` (null = the top-level session), `projectId: string`, `ts: number` (epoch ms). The six kinds stay: `agent_started`, `working`, `waiting_on_subagents`, `needs_attention`, `handoff`, `done`. Added fields:

- `working`: optional `tool: { phase: "start" | "end"; id: string; isSubagent: boolean }`. Feeds the R1 timer in `machine.ts`.
- `done`: `endsWithQuestion: boolean`. Feeds the R2 check. Never any message text (DESIGN principle 4).
- `needs_attention`: `waitingSince: number` and `episodeId: string`. Emitted only by exact adapters (the later hooks adapter). The machine derives its own episode id for heuristic attention and owns `waitingSince` in its state.
- `handoff`: `fromAgentId: string | null`, `toAgentId: string`, `direction: "out" | "back"`.
- `agent_started`: `projectPath: string`, `parentAgentId: string | null`.
- String fields are bounded in the guard (maximum 512 characters). `ts` must be a finite number. Extra fields are ignored. Unknown `kind` returns false (forward compatibility, counted by the caller).

Exact field names beyond the above are the builder's choice if they keep these facts and bounds; any addition that carries transcript text is out of contract.

## NOT in scope

Deferred (to TODOS.md): none this review.
Rejected: none.
Unchanged from the design doc: LAN viewing, hooks adapter, paper hover text, packaging, Windows or Linux specifics, sound (design doc "NOT in scope"). Also not in Phase 1 because they belong to later steps: the server (Phase 2), machine and identity (Phase 3), `Scene.tsx` (4.4), Playwright (5.1). A network-request automated check for the font (1.2 Verify) stays a manual `vp dev` check; no new verification was approved.

## What already exists

- `src/office/palette.ts` mirrors DESIGN.md art tokens and `src/office/art.test.ts` compares every hex. Art tokens are applied through a root style object in `CharacterRig.tsx`, not from `:root`, so `index.css` must not copy them (no third mirror).
- `src/main.tsx` imports `./index.css` and `./App.tsx`, and mounts `ArtSheet` for `?art`. Reused; only the two font import lines are added (Task T2).
- `tsconfig.json` references `tsconfig.app.json` and `tsconfig.node.json`; `tsc -b` in `build` covers both.
- Design doc text for T1, T12, T14, DT1, T8 and the Success Criteria amendment already exists; this phase implements it.

## Dream state delta

```
 CURRENT                       THIS PLAN                         12-MONTH IDEAL
 no shared contract,    --->   typed + guarded AgentEvent   ---> hooks adapter and transcript adapter
 template CSS and page         tokens in :root, self-hosted      both emit the same validated events;
                               font, token drift test            themed from one token file
```

## Review sections

### Section 1: Architecture

Current scope: mode SELECTIVE EXPANSION (D1, user choice). Accepted: P1-BASE, P1-ADD-1, P1-ADD-2, P1-ADD-3, P1-DELIGHT-1..4, P1-S1-1. Deferred: none. Rejected: none. Pending: none.

```
 shared/events.ts  (types + isAgentEvent, no imports)
     ▲                     ▲                       ▲
 server/normalize.ts   src/office/useOffice.ts   shared/events.test.ts
 (Phase 2 producer)    (Phase 4 consumer,         (this phase)
                        calls the guard)
                              │
                       src/office/machine.ts (Phase 3; pure; takes events + now)

 index.html ─ src/main.tsx (font imports) ─ src/index.css (tokens) ─ App.tsx (placeholder)
                                   ▲
                       src/tokens.test.ts reads index.css + DESIGN.md
```

Findings:

1. **CRITICAL GAP, resolved (P1-S1-1).** Contract could not carry R1 and R2 inputs. Applied above.
2. WARNING, no decision needed: `shared/` is compiled by both tsconfigs (node: `module nodenext`, no DOM; app: DOM, bundler). `events.ts` must have no imports and no Node or DOM types. `shared/events.test.ts` imports `vite-plus/test`; whether that type-checks under the node config (`types: ["node"]`, nodenext) is UNVERIFIED and is proven by T1's `tsc -b` step. Verify with `tsc -b` (`vp run build`) as well as `vp check`.
3. WARNING: `server/` does not exist yet, so the 1.1 Verify "type-checks `server/`" cannot be proven in Phase 1. Proof moves to 2.1 (first `server/` file). Phase 1 proves `shared/` only. No decision (this is a verification-ordering note on an approved task).
4. OK: dependency direction is one way (`shared` imports nothing). Rollback: `git revert` the branch, minutes.
5. Single point of failure: the `AgentEvent` shape. Mitigated by the guard and one source file.

### Section 2: Error and Rescue map

```
 CODEPATH                  | WHAT CAN GO WRONG                     | CLASS
 isAgentEvent(x)           | x null/undefined/non-object           | invalid shape (returns false)
                           | unknown kind                          | invalid shape (false, caller counts)
                           | missing/wrong-typed field, NaN ts      | invalid shape
                           | string over 512 chars                 | invalid shape
 main.tsx font import       | package not installed                 | Vite resolve error, build fails loudly
                           | woff2 request fails at runtime        | browser falls back to stack
 tokens.test.ts            | DESIGN.md table reformatted           | parse yields too few rows
                           | stray hex added to CSS                | assertion failure
 App.tsx placeholder       | deleted asset still imported          | tsc/build error, loud

 CLASS                     | RESCUED? | ACTION                              | USER SEES
 invalid shape             | Y        | return false, never throw           | caller drops event, bumps counter (2.1/4.2)
 resolve error             | Y        | fail the build                      | build error naming the module
 runtime font failure      | Y        | system-ui fallback in the stack     | different typeface, no breakage
 parse yields too few rows | Y        | test asserts minimum row count      | red test naming the table (never a vacuous pass)
 stray hex                 | Y        | test fails with file and value      | red test
```

No catch-all handlers. No gaps. Learning applied: [vp-check-sed-i-bsd] (a check that cannot fail passes vacuously), so `tokens.test.ts` must assert a minimum parsed row count and the builder must show the test failing once against a deliberately changed token (mutation check, using `perl -pi`, not BSD `sed -i`).

### Section 3: Security and threat model

- Attack surface: no endpoint, no new input path in this phase. The guard is the defense for Phase 2 and 4: input comes from transcript-derived JSON; bounded strings, finite numbers, no HTML rendering of those strings (React escapes). Likelihood Low, impact Low (loopback only, R3). Mitigated by the guard.
- Dependency risk: one new npm package, `@fontsource/ibm-plex-sans` (self-hosted fonts, no runtime network, OFL-1.1). Pin an exact or caret version, commit `package-lock.json`, after install, check `node_modules/@fontsource/ibm-plex-sans/package.json` has no `install`, `preinstall` or `postinstall` script. Likelihood Low, impact Medium, mitigated.
- Secrets, PII: none. Audit logging: none needed.
- No issues found beyond the above.

### Section 4: Data flow and interaction edge cases

```
 INPUT (SSE data: string) -> JSON.parse (caller, 4.2) -> isAgentEvent -> machine
   nil/empty string  -> parse error, caller drops + counts (4.2)
   wrong type        -> false
   too long          -> false
   partial/stale     -> out of scope here (2.2 tailer)
```

Edge cases for `isAgentEvent` (15): `null`, `undefined`, `[]`, `{}`, string, number; every kind with one missing required field; `ts` of `NaN`, `Infinity`, string; `tool.phase` not in the union; `endsWithQuestion` as string; 513-char `sessionId`; extra unknown field (accepted); unknown `kind` (rejected). Each becomes a test case (see Section 6). No UI interaction is added (the placeholder has none), so there is nothing to double-click. Async ordering: none (no shared mutable state, no awaits).

### Section 5: Code quality

- DRY: DESIGN.md color table, `palette.ts` (art only) and `index.css` (UI tokens only) are disjoint sets, so there is no third copy. The `Color tokens` table (7 tokens) is mirrored in `index.css` and checked by `tokens.test.ts`.
- Over-engineering: none. The guard is one function with a table of per-kind field checks; keep each branch under 5 conditions by driving it from a per-kind field spec table instead of a long `if` chain.
- Naming: `isAgentEvent` (TS predicate). No enums (`erasableSyntaxOnly`); string-literal unions.
- No issues found beyond the above.

### Section 6: Test review

```
 NEW THING                      | TEST                        | HAPPY             | FAILURE                         | EDGE
 isAgentEvent                   | shared/events.test.ts (unit)| one valid per kind| missing field per kind           | NaN/Infinity ts, 513-char id, extra field, unknown kind, null/[]
 tool and endsWithQuestion      | same file                   | start+end tool    | phase "x", flag as string        | isSubagent true/false
 CSS tokens vs DESIGN.md        | src/tokens.test.ts (unit)   | 7 tokens equal    | token value changed              | table reformat gives <7 rows; stray hex in src/**/*.css
 reduced-motion durations       | tokens.test.ts              | media block exists| --dur-slow must stay 600ms       | fast/base are 0ms
 font present                   | manual `vp dev` network tab | no font request to a network host | n/a                | system fallback renders
 tsconfig coverage              | `vp check` and `tsc -b`     | shared/ compiles in both projects | deliberate type error in shared/ fails both | n/a
 placeholder App                | `vp dev` + `?art` smoke     | page renders on dark bg | n/a                          | ?art still mounts
```

Test ambition: the 2 am test is `tokens.test.ts` failing when `--accent` is changed in either file; the hostile QA test is a token row with a trailing space or uppercase hex (normalize case); no chaos test applies. Pyramid: all unit, no E2E (Playwright is 5.1). Flakiness: none (pure, no time or network). No new unresolved test-method choice.

### Section 7: Performance

No issues found. Font CSS from `@fontsource` uses `font-display: swap` and `unicode-range` subsets, so the browser fetches only needed subsets; two weights only. No runtime cost in the guard (a handful of checks per SSE event).

### Section 8: Observability

- The guard returns a boolean and logs nothing; the drop counter lives in the callers (2.1 server counter exists; client counter arrives with 4.2). Existing follow-up in the design doc ("surface the counter") covers visibility. No new gap in Phase 1.
- Debuggability: a failing token test names the token, file and value (builder requirement).

### Section 9: Deployment and rollout

Local-only dev app. No migration, flag or deploy. Rollout order: land 1.1 first (contract), then tokens, then amendments. Rollback: `git revert`. Post-merge check: `vp install`, `vp check`, `vp test`, `vp dev` loads the placeholder and `?art` still renders. Old and new code never run together.

### Section 10: Long-term trajectory

- Debt: none introduced. Reversibility 4/5 overall; the `AgentEvent` shape is 3/5 (Phase 2 and 3 build on it), which is why P1-S1-1 was settled now.
- Path dependency: the `needs_attention` kind is reserved for exact adapters, so the later hooks adapter needs no contract change.
- 1-year question: obvious, given the JSDoc table (P1-DELIGHT-4).
- Retrospective on cherry-picks: all seven were accepted; none of the rejected ones exist. P1-ADD-1 was load-bearing for 1.3, P1-ADD-3 is what makes 1.3's verify real.

### Section 11: Design and UX

UI scope: yes (design system tokens, placeholder page). Information architecture: placeholder shows only a title on `--bg`; real hierarchy arrives in 4.x. Interaction state map: LOADING, EMPTY, ERROR, SUCCESS, PARTIAL are not applicable to the placeholder (no data); owned by 4.7 (status banner). DESIGN.md alignment: tokens equal the contract; dark only; 4.5:1 text pairs already computed. Accessibility: global accent `:focus-visible` (P1-DELIGHT-1) gives keyboard users a visible ring; contrast of `--accent` on `--bg` is 6.53. No new issue. A deeper review is not needed (design review ran earlier, decisions 1A to 8C).

## Error and Rescue registry

| Method or codepath     | Exception class   | Rescued | Action          | User impact                      |
| ---------------------- | ----------------- | ------- | --------------- | -------------------------------- |
| `isAgentEvent`         | invalid shape     | Y       | return false    | event dropped, counted by caller |
| `main.tsx` font import | resolve error     | Y       | build fails     | none (dev-time)                  |
| runtime font load      | network failure   | Y       | system fallback | different typeface               |
| `tokens.test.ts`       | table parse short | Y       | assert min rows | red test                         |
| `tokens.test.ts`       | stray hex         | Y       | assertion       | red test                         |

## Failure modes registry

| Codepath        | Failure mode            | Rescued? | Test?                             | User sees?    | Logged?            |
| --------------- | ----------------------- | -------- | --------------------------------- | ------------- | ------------------ |
| `isAgentEvent`  | malformed server JSON   | Y        | Y                                 | event dropped | counter in callers |
| tokens          | CSS and DESIGN.md drift | Y        | Y                                 | red test      | test output        |
| tokens          | test passes vacuously   | Y        | Y (min row count, mutation check) | n/a           | test output        |
| font            | package missing         | Y        | build                             | build error   | build output       |
| App placeholder | broken asset import     | Y        | `tsc -b`                          | build error   | build output       |

Critical gaps: 0.

## Diagrams

1. System architecture: Section 1.
2. Data flow with shadow paths: Section 4.
3. State machine: not applicable (no new stateful object; the machine is Phase 3).
4. Error flow: Section 2.
5. Deployment sequence: land 1.1, tokens and template cleanup, amendments; each commit passes `vp check` and `vp test`.
6. Rollback: `git revert <commit>` per step, or drop the branch.

Stale diagram audit: DESIGN.md "Status" paragraph says the tokens are "not yet in `src/index.css`" and will be after 1.3 (now stale once 1.3 lands; update included in scope item 5). `BUILD_TODO.md` 1.1 and 3.1 text describes the pre-P1-S1-1 contract (updated in scope item 10). The design doc ASCII diagram at "Diagrams" (`normalize.ts line ──▶ AgentEvent | null`) stays accurate.

## Implementation tasks

- [ ] **T1 (P1, human: ~2h / CC: ~15min)**: shared: events, guard, contract notes, tsconfig includes
  - Surfaced by: Section 1 finding 1 (P1-S1-1), P1-ADD-2, P1-DELIGHT-4
  - Files: `shared/events.ts`, `shared/events.test.ts`, `tsconfig.node.json` (add `shared` and `server`), `tsconfig.app.json` (add `shared`; `server/` is Node-only and is not compiled with the DOM config)
  - Verify: `vp test` picks up `shared/events.test.ts` (if the default glob does not, set `test.include` in `vite.config.ts` and say so); `vp test` (cases in Section 6), `vp check`, `vp run build` (`tsc -b`) pass; a deliberate type error in `shared/events.ts` fails both configs; no imports in `events.ts`.
- [ ] **T2 (P2, human: ~30min / CC: ~5min)**: deps: font and notice
  - Surfaced by: BUILD_TODO 1.2, Section 3 (dependency risk)
  - Files: `package.json`, `package-lock.json`, `NOTICE`, `src/main.tsx` (font import, the one place); `DESIGN.md` is owned by T3 only
  - Verify: NOTICE contains the OFL-1.1 licence text and the package name; `vp dev` Network tab shows no request to a non-localhost host for fonts; its `package.json` has no install, preinstall or postinstall script.
- [ ] **T3 (P1, human: ~2h / CC: ~15min)**: tokens, template cleanup, base rules, title
  - Surfaced by: BUILD_TODO 1.3, P1-ADD-1, P1-DELIGHT-1..3, Section 11
  - Files: `src/index.css`, `src/App.css` (delete), `src/App.tsx`, `src/assets/{hero.png,react.svg,vite.svg}` (delete if unreferenced), `public/icons.svg` (delete if unreferenced; grep first), `index.html`, `DESIGN.md` (Status paragraph)
  - Verify: `grep -nE '#[0-9a-fA-F]{3,8}' src/*.css` finds hex only inside the token block; `vp dev` shows the placeholder, `?art` still renders; `vp run build` passes.
- [ ] **T4 (P1, human: ~1h / CC: ~10min)**: test: token drift (amended by eng review D3 and D4, see "Eng review tasks")
  - Surfaced by: P1-ADD-3, Section 2 (vacuous-pass learning)
  - Files: `src/tokens.test.ts`
  - Verify: `vp test` green; then temporarily change `--accent` in `index.css` (use `perl -pi -e`) and see it fail; restore.
- [ ] **T5 (P3, human: ~30min / CC: ~5min)**: docs: amendments
  - Surfaced by: BUILD_TODO 1.4 (T8), P1-S1-1
  - Files: `docs/designs/office-agents-isometric-office.md` (Success Criteria line 59, T12 line 799, and the T8 Verify text at line 472 that still says "line 50"), `BUILD_TODO.md` (1.1 and 3.1 wording)
  - Verify: Success Criteria wording matches "Accepted amendments" line 365; T12, 1.1 and 3.1 agree on "machine owns the episode id; `needs_attention` is for exact adapters".

Order: T1, T2, T3, T4, T5. T1, T2 and T3 touch disjoint files (T2: `package.json`, `package-lock.json`, `NOTICE`, `main.tsx`; T3: `index.css`, `App.tsx`, `index.html`, `DESIGN.md`), so they can run in parallel lanes; never two agents on the same file.

## Completion summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                         |
  | System Audit         | App.tsx still template; font import and     |
  |                      | token home missing from 1.2/1.3 file lists; |
  |                      | .gitignore modified, .claude/ untracked in |
  |                      | the working tree (not Phase 1, untouched)               |
  | Step 0               | SELECTIVE; 7 proposals, all accepted        |
  | Section 1  (Arch)    | 5 issues found (1 critical, resolved)       |
  | Section 2  (Errors)  | 5 error paths mapped, 0 GAPS                |
  | Section 3  (Security)| 2 issues found, 0 High severity             |
  | Section 4  (Data/UX) | 15 edge cases mapped, 0 unhandled           |
  | Section 5  (Quality) | 1 issue found (guard structure)             |
  | Section 6  (Tests)   | Diagram produced, 0 gaps                    |
  | Section 7  (Perf)    | 0 issues found                              |
  | Section 8  (Observ)  | 0 gaps found                                |
  | Section 9  (Deploy)  | 0 risks flagged                             |
  | Section 10 (Future)  | Reversibility: 4/5, debt items: 0           |
  | Section 11 (Design)  | 0 issues                                    |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (0 deferred, 0 rejected)             |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 5 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 5 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 0 items proposed                            |
  | Scope proposals      | 7 proposed, 7 accepted                      |
  | CEO plan             | this file (single working plan and summary) |
  | Outside voice        | codex: disabled (skipped)                   |
  | Lake Score           | N/A (no coverage-scored questions)          |
  | Diagrams produced    | 4 (architecture, data flow, error, deploy)  |
  | Stale diagrams found | 2 text blocks (DESIGN.md Status, BUILD_TODO)|
  | Unresolved decisions | 0                                           |
  +====================================================================+
```

## Spec review

Two reviewer launches (refuter, read-only). Launch 1: 10 issues, score 7/10, all edited. Launch 2: 10 of 10 confirmed fixed, score 8/10, one new issue (T2 and T3 both listed `DESIGN.md`), also edited; that last edit was checked by the orchestrator, not re-reviewed. Two items were left as builder verification because nothing could prove them without running code: `vp test` default glob picking up `shared/`, and `vite-plus/test` type-checking under the node config.

---

# Eng review (/plan-eng-review), 2026-10-01

Target: this plan (T1 to T5 above). Outside voice: codex disabled, logged as skipped, no native replacement. Prior CEO decisions (P1-*) are settled and were not reopened. Process note: the pending-record save and Read-back that the review procedure asks for before each question was not done; the four answers below were recorded after the fact.

## Eng review decision ledger

| ID and owner               | Contract and evidence                                                                                                                     | Current              | Proposed                                  | Status   | Exact approval and scope                                                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-COMPLEX, Scope Challenge | About 19 files, 0 new classes; every file maps to an approved feature.                                                                    | original arrangement | smaller arrangement                       | approved | D1 answer "Confirm original". Arrangement only.                                                                                                                     |
| E-FMT, Section 1           | `vp check` exits red today on `.claude/launch.json` (untracked, 129 B) and on this plan doc (probe 2026-10-01).                           | red baseline         | format launch.json                        | approved | D2 answer "Format launch.json". Whitespace-only, that one file.                                                                                                     |
| E-PARSE, Section 2         | `art.test.ts:46-93` parses DESIGN.md tables (`hexes`, `tokenRows`, `cells`, `sectionRows`); `tokens.test.ts` is a proposed second caller. | one private copy     | `src/design-md.ts` imported by both tests | approved | D3 answer "Extract src/design-md.ts". Move only those helpers; art.test.ts behavior unchanged.                                                                      |
| E-FONT, Section 3          | R9 needs OFL text in NOTICE; `art.test.ts:428,446` check `main.tsx` only for colors.                                                      | manual checks        | 3 assertions in `tokens.test.ts`          | approved | D4 answer "Add three assertions": font imports in main.tsx, `SIL OPEN FONT LICENSE Version 1.1` in NOTICE, no `fonts.googleapis.com` in `index.html` or `main.tsx`. |

Approval readiness: PASS. Checked E-COMPLEX, E-FMT, E-PARSE, E-FONT against D1 to D4. Existing CEO rows P1-* are reused unchanged. No other change is accepted.

## Scope Challenge result

Scope accepted as-is (no scope reduction). Findings: complexity gate tripped at about 19 files (D1 confirmed). No TODO blocks this plan: `TODOS.md` items (hooks adapter, displayed-state hook, bubble layout, paper hover text, chime) all depend on later phases. Search check: no new architectural pattern (type guard, CSS tokens, fontsource are settled; a hand-written guard beats adding a schema library, no dependency). Web search was not run for these; in-distribution knowledge only. Distribution check: no new artifact.

## Section 1: Architecture

```
 shared/events.ts ──(types + guard, no imports)── used by:
     server/* (Phase 2, node config, nodenext)   src/office/* (Phase 3/4, app config, bundler)
 tsconfig.node.json  include: vite.config.ts + shared + server     (types: node)
 tsconfig.app.json   include: src + shared                         (lib: DOM)
 tsc -b  ->  both projects ; vp check -> lint + types + format ; vp test -> vitest default glob
```

1. [P2] (confidence: 9/10) `vp check` is red at baseline (see E-FMT). Resolved by D2.
2. [P2] (confidence: 8/10) `tsconfig.node.json:22` `"include": ["vite.config.ts"]` and `tsconfig.app.json:25` `"include": ["src"]`: `shared/` is compiled twice, once with `types: ["node"]` and once with `lib: DOM`. `events.ts` and its test must use neither Node nor DOM globals. Covered by T1 verify (`tsc -b`); no decision.
3. [P3] (confidence: 5/10, medium, verify) Whether `vp test` finds `shared/events.test.ts` with no `test.include` in `vite.config.ts` is unproven (the docs only show a custom `include`); existing run found 2 files, 124 tests under `src/`. T1 verify already says set `test.include` if it does not.

Failure scenario: skewed event shape between server and client is impossible here (same repo, one `shared/events.ts`). No other issue.

## Section 2: Code quality

1. [P2] (confidence: 8/10) `src/office/art.test.ts:46-93` hold the DESIGN.md table parser the planned `tokens.test.ts` also needs. Resolved by D3 (E-PARSE). Shared-code rubric: callers art.test.ts (existing) and tokens.test.ts (proposed, label: assumption); helper `src/design-md.ts` with `hexes`, `cells`, `sectionRows`, `tokenRows`; est. implementation lines removed ~35, added ~35, saved ~35 versus a duplicate copy; blast radius: one parser failing fails both tests loudly (heading-not-found errors already exist at `art.test.ts:84,86`).
2. [P3] (confidence: 6/10) Type and runtime field lists for each event kind can drift. T1 guidance (no new decision, inside the approved guard): type the per-kind spec table so a missing field is a compile error (for example one `Record<AgentEvent["kind"], FieldSpec>`), and keep each check under 5 branches.
3. Stale diagrams: none beyond those already listed in the CEO review (DESIGN.md Status paragraph, BUILD_TODO 1.1/3.1 wording).

## Section 3: Test review

```
CODE PATHS                                              USER FLOWS
[+] shared/events.ts (proposed)                         [+] Dev opens vp dev
  ├── isAgentEvent()                                      ├── [GAP→manual] placeholder renders on dark bg
  │   ├── [PLANNED ★★★] valid per kind (6)                └── [GAP→manual] ?art sheet still mounts
  │   ├── [PLANNED ★★★] missing field per kind
  │   ├── [PLANNED ★★★] NaN/Infinity ts, 513-char id      [+] Keyboard user
  │   └── [PLANNED ★★★] unknown kind, null, [], extra     └── [GAP→manual] accent focus ring visible
[+] src/index.css tokens (proposed)
  ├── [PLANNED ★★★] 7 color tokens = DESIGN.md           (UI flows left manual: no jsdom/Playwright
  ├── [PLANNED ★★★] stray hex, min row count               until 5.1; settled by R4 in the design doc)
  ├── [PLANNED ★★]  reduced-motion durations
  └── [PLANNED ★★]  font imports, OFL text, no CDN (D4)
[+] src/design-md.ts (D3)
  └── [EXISTING ★★★] via art.test.ts, 124 tests green today
[+] tsconfig includes
  └── [PLANNED] tsc -b and vp check on shared/ (both configs)

COVERAGE: 0/9 new paths tested yet (all proposed) | planned: 7 automated, 3 manual flows
GAPS: font/NOTICE (resolved D4), shared/ test discovery unproven (T1 verify)
```

Regression rule: existing behavior at risk is `art.test.ts` (124 tests) which reads `DESIGN.md?raw` and `main.tsx?raw`, and the `?art` sheet. Both are covered by rerunning `vp test` (existing exact coverage) plus a manual `?art` check; no new approval needed. E2E: none now (Playwright is 5.1). Eval: no LLM scope. Flakiness: none (pure, no time or network). Test value cards for new tests are in the QA test plan artifact. Tests made obsolete: none.

1. [P2] (confidence: 8/10) Font and licence wiring had no automated check. Resolved by D4 (E-FONT).
2. [P3] (confidence: 5/10, verify) `shared/**` discovery, same as Architecture 3.

## Section 4: Performance

No issues found. Guard cost is a few comparisons per SSE event; font CSS uses `unicode-range` subsets with `font-display: swap`; test files add under 1 second to a 1.4 s run (baseline measured: 124 tests, 1.42 s).

## NOT in scope

- Smaller arrangement of the 19 files (D1 chose the original).
- Excluding `.claude/` from formatting in `vite.config.ts` (D2 option B, not chosen; vite.config.ts is edited in 2.2).
- jsdom or Playwright component tests for the placeholder (settled by R4, arrives in 5.1).
- Schema library for the guard (no new dependency).

## What already exists

- `art.test.ts` parser and DESIGN.md drift pattern: reused through the D3 extraction.
- `?raw` imports of repo files in tests (`DESIGN.md?raw`, `main.tsx?raw`): the same technique serves `NOTICE?raw` and `index.html?raw` in D4.
- `vp test` (vitest, 124 tests, 2 files) and `vp check`: reused as the only test and lint gates.

## Failure modes

| Path            | Realistic failure           | Test                                   | Handling                    | User sees                         |
| --------------- | --------------------------- | -------------------------------------- | --------------------------- | --------------------------------- |
| isAgentEvent    | malformed JSON              | events.test.ts                         | false                       | event dropped, counter in callers |
| tokens.test     | DESIGN.md table reformatted | min row count, heading-not-found error | red test naming the heading | clear                             |
| font imports    | import removed              | tokens.test (D4)                       | red test                    | clear                             |
| NOTICE          | licence text missing        | tokens.test (D4)                       | red test                    | clear                             |
| shared/ compile | Node/DOM global used        | `tsc -b`                               | build error                 | clear                             |

Critical gaps: 0.

## Eng review tasks

- [ ] **T0 (P2, human: ~2min / CC: ~1min)**: tooling: format `.claude/launch.json`
  - Surfaced by: Section 1 finding 1 (E-FMT, D2)
  - Files: `.claude/launch.json` (untracked, local)
  - Verify: `vp check` exits 0 before and after T1 to T5.
- [ ] **T6 (P2, human: ~1h / CC: ~10min)**: test: extract the DESIGN.md parser
  - Surfaced by: Section 2 finding 1 (E-PARSE, D3)
  - Files: `src/design-md.ts`, `src/office/art.test.ts`
  - Verify: `vp test` still reports 124 passing tests in art.test.ts and props.test.ts; `art.test.ts` no longer defines `hexes`, `cells`, `sectionRows`, `tokenRows`.
- [ ] **T4 amended (P1)**: `src/tokens.test.ts` imports from `src/design-md.ts` (T6 first) and adds the three D4 assertions on `main.tsx?raw`, `NOTICE?raw`, `index.html?raw`. Surfaced by: Section 3 finding 1 (E-FONT, D4). Verify: `vp test`; mutation check for the licence and import assertions with `perl -pi -e`.
- [ ] **T1, T2, T3 verify addition**: `vp test` must keep all 124 existing tests passing (T2 edits `main.tsx` and T3 edits `DESIGN.md`, both read by `art.test.ts`), and `?art` must still render in `vp dev`.

Order and effort assumption (scaffolding ~100x, tests ~50x): T0 and T6 are small; T4 now depends on T2, T3 and T6.

## Worktree parallelization strategy

| Step                           | Modules touched                                                                | Depends on |
| ------------------------------ | ------------------------------------------------------------------------------ | ---------- |
| T0 format launch.json          | `.claude/`                                                                     | none       |
| T1 events and guard            | `shared/`, tsconfig (repo root)                                                | none       |
| T2 font and NOTICE             | repo root (`package.json`, `NOTICE`), `src/` (`main.tsx`)                      | none       |
| T3 tokens and template cleanup | `src/` (`index.css`, `App.tsx`, assets), repo root (`index.html`), `DESIGN.md` | none       |
| T6 extract parser              | `src/` (`design-md.ts`, `office/art.test.ts`)                                  | none       |
| T5 doc amendments              | `docs/`, `BUILD_TODO.md`                                                       | none       |
| T4 token and font test         | `src/` (`tokens.test.ts`)                                                      | T2, T3, T6 |

Lanes: A: T1; B: T2; C: T3; D: T6; E: T0 then T5. Then F: T4. Launch A to E together, merge, then F. Conflict flags: `src/` is shared by B, C, D, but the files are disjoint (`main.tsx`; `index.css`, `App.tsx`, `src/assets/*`; `design-md.ts`, `office/art.test.ts`), so no two lanes edit a file. `package.json` and `package-lock.json` are touched only by B; `DESIGN.md` only by C.

## Suppressed findings (confidence 3-4)

- (4/10) `vp test` default glob may miss `shared/`; the plan already has a fallback (`test.include`), so it is reported at 5/10 above rather than suppressed.

## Completion summary (eng review)

- Step 0: Scope Challenge: scope accepted as-is (complexity gate confirmed, D1)
- Architecture Review: 3 issues found
- Code Quality Review: 2 issues found
- Test Review: diagram produced, 2 gaps identified (1 resolved by D4, 1 verify step)
- Performance Review: 0 issues found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 items proposed to user
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: codex, disabled (skipped), no native replacement
- Parallelization: 6 lanes, 5 parallel / 1 sequential
- Lake Score: N/A (all four questions differ in kind)

## GSTACK REVIEW REPORT

| Review         | Trigger               | Why                             | Runs | Status                  | Findings                                                                 |
| -------------- | --------------------- | ------------------------------- | ---- | ----------------------- | ------------------------------------------------------------------------ |
| CEO Review     | `/plan-ceo-review`    | Scope & strategy                | 1    | CLEAR                   | 7 proposals, 7 accepted, 0 deferred                                      |
| Outside Review | codex, default-on     | Independent 2nd opinion         | 2    | skipped (disabled)      | no completed external review                                             |
| Eng Review     | `/plan-eng-review`    | Architecture & tests (required) | 1    | ISSUES OPEN             | 7 issues, 0 critical gaps; all resolved or mapped to tasks, 0 unresolved |
| Design Review  | `/plan-design-review` | UI/UX gaps                      | 0    | not run for this branch | earlier decisions 1A to 8C apply                                         |
| DX Review      | `/plan-devex-review`  | Developer experience gaps       | 0    | not run                 | none                                                                     |

**OUTSIDE COVERAGE:** codex, plan-review phase, disabled by `codex_reviews=disabled` in both the CEO and Eng reviews; no completed external review and no native replacement run.
**VERDICT:** CEO CLEARED. Eng review status is ISSUES OPEN only because it found 7 issues (the status rule counts resolved findings); every one is resolved by D1 to D4 or mapped to a task, so there are no open decisions. Not "CEO + ENG CLEARED"; run `/ship` review gates after building.

NO UNRESOLVED DECISIONS
