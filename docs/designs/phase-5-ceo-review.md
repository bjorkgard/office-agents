# Phase 5 CEO review: end-to-end tests (T7 / T13 / R4)

Branch: `feat/phase-5-end-to-end` | Mode: SELECTIVE EXPANSION | Date: 2026-10-03
Plan under review: BUILD_TODO.md "Phase 5" (5.1, 5.2, 5.3) plus design doc R4, T7, T13 in `docs/designs/office-agents-isometric-office.md` (settled; not reopened here).

## 0A. Premise

Real problem: unit tests prove event-to-state logic, nothing proves the browser renders the state or that tailer -> SSE -> client wiring works (R4). Do-nothing cost: wiring and a11y regressions ship unseen; Phase 6 success criteria stay manual. The plan solves the pain directly.

## 0B. Existing code leverage

| Need                 | Already exists                                                                                                                       | Gap                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Fixture transcripts  | `server/fixtures/*.jsonl` (sync-flow, async-flow, top-live, sub-live, ...) and `server/sanitize-fixtures.ts` recorder                | BUILD_TODO 5.1 says "record a fixture"; reuse these first, record only if a case is missing |
| Transcript-root seam | `createFeed({ root })` (`server/feed-plugin.ts:681`, default `~/.claude/projects`)                                                   | `vite.config.ts` calls `officeFeed()` with no options, so no env path reaches it            |
| Clock seam           | `createFeed({ now })`                                                                                                                | Not wired to the Vite plugin or the client; fixtures carry fixed 2026-10-02 timestamps      |
| `TUNING` override    | `shared/tuning.ts` constants (STALE_MS, ATTENTION_STALE_MS, DESKS_PER_ROW, DESK_CAP) read by `machine.ts` and `feed-plugin.ts`       | No override mechanism; server and client must read the same value (eng decision E4)         |
| DOM hooks            | `data-state`, `data-shirt`, `data-pose`, `data-waving`, `data-agent`, `data-bubble`, `data-testid=scene`, `role=status`, `aria-live` | None known for chips (check in 5.3)                                                         |
| Refusal              | `isLoopbackRequest` (Host hostname AND socket remote), 403 in `handle()`                                                             | A browser cannot send a non-loopback Host header                                            |

## 0C. Dream state

```
CURRENT                         THIS PLAN                        12-MONTH IDEAL
unit tests only          --->   Playwright E2E on fixtures --->  E2E in CI on every PR, 12-agent
manual visual check             (core + T13 cases)               load check, hooks-adapter fixtures
```

## Audit findings (evidence)

1. Vitest's default include matches `**/*.spec.ts`. `vite.config.ts` has no `test` block, so `vp test` will pick up `e2e/office.spec.ts` and crash on Playwright imports. Needs an exclude (blocker, single obvious remedy).
2. Fixtures use timestamps from 2026-10-02. Without a clock seam or time shifting, replayed agents are stale or expired the moment the page loads (blocker, several remedies; see D2).
3. The refused-host case cannot be driven from a browser (Host header is fixed by the browser). The 403 is already unit-tested in `server/feed-plugin.test.ts`; the UI banner for a 403 needs the E2E (route stub or API-level request).
4. The feed plugin has `apply: "serve"`; E2E must run against the dev server, not `vp preview`.
5. No `.github/`; no CI exists today.
6. `playwright` is not installed; browser download is a one-time cost on first run.

## Mode provenance

Actual question answer (D1): SELECTIVE EXPANSION chosen over the recommended HOLD SCOPE. Application: hold scope on approved R4/T7/T13, cherry-pick extras one at a time; accepted items govern later sections, rejected ones go to NOT in scope.

## Decision ledger

| ID and owner                 | Contract and evidence                                                                                                       | Current                        | Proposed                                                                                                              | Status                                                                         | Exact approval and scope                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| R4/T7/T13, design doc        | Playwright E2E replaying fixture; `data-state`, refused host, empty fixture; reduced motion, recolor, title/chips, keyboard | Approved scope (5.1, 5.2, 5.3) | unchanged                                                                                                             | approved                                                                       | Design doc R4 answer B; T13                                                  |
| D1 mode                      | Preamble mode question                                                                                                      | none                           | SELECTIVE EXPANSION                                                                                                   | approved                                                                       | D1 answer: SELECTIVE EXPANSION (user overrode the HOLD SCOPE recommendation) |
| D2 fixture clock             | Audit finding 2                                                                                                             | none                           | Shift fixture timestamps to now at test setup into a temp transcript root, gaps preserved; no production clock change | approved                                                                       | D2 answer A                                                                  |
| D3 E4 wave + handoff E2E     | BUILD_TODO 6.1; `data-waving`, `data-path`                                                                                  | none                           | Two specs in 5.2: wave on attention, subagent walk-in/handoff                                                         | approved                                                                       | D3 answer Add to scope                                                       |
| D4 E5 failure artifacts      | Playwright config                                                                                                           | none                           | trace retain-on-failure, screenshot only-on-failure, gitignore output                                                 | approved                                                                       | D4 answer Add to scope                                                       |
| D5 E2 12-agent fixture       | BUILD_TODO 6.1, T13 chip overflow                                                                                           | none                           | 12-session fixture, one load spec, reused by chip-scroll case                                                         | approved                                                                       | D5 answer Add to scope                                                       |
| D6 E1 CI job                 | No `.github/`                                                                                                               | none                           | GitHub Actions: `vp check`, `vp test`, E2E                                                                            | approved                                                                       | D6 answer Add to scope (user overrode the Defer recommendation)              |
| D7 E3 screenshot baseline    | `?hour=`, `?seed=`, `?scene=`                                                                                               | none                           | One deterministic scene screenshot compare                                                                            | approved                                                                       | D7 answer Add to scope (user overrode the Skip recommendation)               |
| Q1 vitest exclude            | Audit finding 1                                                                                                             | none                           | Exclude `e2e/**` from `vp test`                                                                                       | pending (single obvious remedy; confirm in review)                             | none                                                                         |
| Q2 refused-host mechanism    | Audit finding 3                                                                                                             | none                           | API-level request with a non-loopback Host for the 403, `page.route` 403 stub for the UI banner                       | closed: superseded by eng R3 (route stub only; Vite rejects a fake Host first) | eng D4 answer A                                                              |
| Q3 TUNING override mechanism | `shared/tuning.ts`, E4 server/client agreement                                                                              | none                           | one env-driven override read by both server and client                                                                | closed: no override, age offsets instead                                       | eng D3 answer A (R2)                                                         |

## Accepted scope (added to approved R4/T7/T13)

- Fixture clock shift helper (D2), temp transcript root via `officeFeed({ root })` driven by env.
- Wave and subagent walk-in/handoff specs (D3).
- Trace and screenshot on failure (D4).
- 12-session fixture and load spec, reused for chip overflow (D5).
- GitHub Actions workflow (D6).
- Screenshot baseline spec (D7). Review must make it safe: pinned scene, platform-suffixed baselines, Linux baseline produced where CI runs.

## NOT in scope

None rejected or deferred this session. All five proposals accepted.

## 0I. Temporal interrogation

```
HOUR 1 (foundations):    Playwright install + browser download; config webServer env (root, TUNING); vitest exclude.
HOUR 2-3 (core logic):   Fixture shift helper, temp root lifecycle (global setup/teardown); core specs.
HOUR 4-5 (integration):  Refused/empty/banner cases; T13 keyboard, reduced motion, recolor, chips; 12-agent fixture.
HOUR 6+ (polish/tests):  Screenshot baseline on CI platform, workflow, flake runs (repeat-each).
```

Surprises the implementer will hit: vitest picks up `*.spec.ts`; `playwright.config` webServer needs its own port and `reuseExistingServer`; reduced motion needs `emulateMedia`; the feed plugin only runs in `serve`; screenshot baselines are per platform.

Effort: human ~3 days / CC ~2h for the whole phase.

## Spec review (1 reviewer run, score 6/10) and amendments

Verified by reading `server/feed-plugin.ts:441,476`: tracked files are filtered by `now() - stat.mtimeMs`, so D2 (approved, answer A) is refined, not reversed: the setup helper shifts the JSONL timestamps to now AND sets file mtimes with `fs.utimes`. The client machine reads event timestamps against its own clock, so shifted content covers it; no client clock change.

Applied (same approved scope):

- 12-session fixture mix: attention (waiting on question), subagent sync and async, working, idle, finished. It must cover every `data-state` value the office renders; the implementer lists them from `machine.ts`.
- Fixture location (amended by eng D1 structure answer B): reuse `server/fixtures/*` and generate the 12-agent fixture at run time in `e2e/support.ts`; no committed `e2e/fixtures/` files, say so in the PR.
- Empty-fixture banner case and the 403 banner case are both required in 5.2.
- Harness rules: `workers: 1` (shared dev server and temp root), temp root removed in teardown even on failure, dedicated port with `reuseExistingServer: false`.
- Chips already carry `.top-bar-chip`; no production hook is needed unless 5.3 proves otherwise.
- `vite.config.ts` gets a plugin option read from env (production-file change, allowed by BUILD_TODO 5.1 "transcript-root seam").
- D7 safety: pinned `?hour=`, `?seed=`, `?scene=`, fixed viewport, reduced motion on, baselines platform-suffixed and produced on the CI platform; `--repeat-each=5` with zero flakes before merge; quarantine (skip with TODO) if flaky.
- D6 CI: Node and `vp` setup, Playwright browser cache, upload trace/report artifacts on failure, Linux baseline generation step.
- Q1-Q3 remain pending as implementation choices; recommended: exclude `e2e/**` in `vite.config.ts` test block; 403 via API request with Host header plus `page.route` stub for the banner; one env var for TUNING read by plugin and injected to the client through Vite `define`.

## Review decisions after document approval

| ID and owner              | Contract and evidence                      | Current | Proposed                                                                                                 | Status                                 | Exact approval and scope                         |
| ------------------------- | ------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------ |
| D8 docs                   | 0H document approval                       | none    | approve plan + CEO summary                                                                               | approved                               | D8 answer: Approve and continue (documents only) |
| D9 Section 1 isolation    | Audit A1                                   | none    | One Playwright project per scenario, each with own webServer, port, temp root, env (TUNING shape for Q3) | approved                               | D9 answer: Project per scenario                  |
| D10 Section 4 live append | C3, supports D3, R4                        | none    | `appendFixtureLines` helper plus live specs through the real tailer                                      | approved                               | D10 answer: Add helper + live specs              |
| D11 Section 6 Q1          | Vitest default include matches `*.spec.ts` | none    | `test.exclude` of `e2e/**` in `vite.config.ts`                                                           | approved                               | D11 answer: Exclude e2e/** in config             |
| D12 Section 8 TODO        | F1 failure context                         | none    | TODOS.md "Phase 5 review follow-ups" entry (S, P3)                                                       | approved                               | D12 answer: Add to TODOS.md                      |
| Q2 refused-host mechanism | Audit 3                                    | none    | API request with non-loopback Host for the 403; `page.route` 403 stub for the banner                     | closed by eng D4 (R3): route stub only | eng D4 answer A                                  |
| Q3 TUNING mechanism       | E4 server/client agreement                 | none    | none: age offsets replace the override                                                                   | closed by eng D3 (R2)                  | eng D3 answer A                                  |

## Section findings

1. Architecture: A1 isolation (resolved D9), A2 snapshot-only replay (resolved D10). Diagram under Section 1 in chat; summary below.
2. Error and rescue: B1 first-scan race (CRITICAL until built: readiness waits on `/__office/status` tracked count, auto-retry assertions only), B2 shift helper fails loudly on malformed lines, B3 teardown in finally.
3. Security: 4 threats, 0 High. Pin Actions, `permissions: contents: read`, fixtures through the sanitizer or generated.
4. Data flow: C1 single global shift anchor (max timestamp over all files), C2 per-scenario age offset for stale scenarios, C3 live frames (resolved D10).
5. Code quality: pure shift helper in `e2e/support/` with a unit test; palette imported from `src/office/palette.ts`; 12-agent fixture generated from existing templates; projects built from one table.
6. Tests: full diagram in chat; flakiness rules (no fixed sleeps, `--repeat-each=5`, quarantine rule); Q1 resolved D11.
7. Performance: E2E under 2 min; 5 dev servers start; cache Playwright browser in CI.
8. Observability: F1 deferred to TODOS.md (D12). `stdout: "pipe"` on every webServer.
9. Deployment: no runtime deploy; rollback is revert; CI needs Node and `vp` setup, `timeout-minutes`, `concurrency`, browser cache, manual update-baselines job for Linux.
10. Trajectory: reversibility 5/5; debt: baseline maintenance, per-platform baselines, fixture drift; D6 and D7 coupled and coherent.
11. Design: SKIPPED (no UI scope).

## NOT in scope

Deferred: E2E failure context attachments (TODOS.md, D12). Rejected: none.

## What already exists

`server/fixtures/*` and `server/sanitize-fixtures.ts` (reused), `createFeed({ root, now })` (root seam reused), `isLoopbackRequest` and its unit test, `data-*` hooks in Scene and Character, `?hour=` `?seed=` `?scene=` dev overrides, `palette.ts`, `titleFor`, `.top-bar-chip`.

## Dream state delta

After Phase 5: E2E proves tailer to DOM for core flows, live transitions, a11y and a 12-agent room on every PR, with CI. Remaining distance to the 12-month ideal: live-session smoke (6.1 manual), hooks-adapter fixtures, richer failure diagnostics (TODO F1).

## Error and Rescue Registry

| Codepath     | Failure                           | Class              | Rescued     | Action                                        | User sees                   |
| ------------ | --------------------------------- | ------------------ | ----------- | --------------------------------------------- | --------------------------- |
| shiftFixture | malformed line, no ts, zero files | BadFixture         | Y (planned) | throw with file:line                          | setup error                 |
| shiftFixture | utimes fails                      | EACCES             | Y (planned) | rethrow with path                             | setup error                 |
| webServer    | port in use                       | webServer timeout  | Y           | dedicated ports, no reuse                     | Playwright error names port |
| webServer    | first scan not done               | race               | N, CRITICAL | readiness on status tracked count, auto-retry | flaky empty room otherwise  |
| browser      | not installed                     | missing executable | Y           | README + CI step                              | actionable message          |
| teardown     | crash leaves temp root            | leak               | Y (planned) | try/finally, mkdtemp                          | none                        |

## Failure Modes Registry

| Codepath        | Failure mode              | Rescued                          | Test            | User sees      | Logged             |
| --------------- | ------------------------- | -------------------------------- | --------------- | -------------- | ------------------ |
| shift helper    | malformed fixture         | Y                                | unit            | loud           | Y                  |
| first scan race | empty room at load        | N                                | E2E readiness   | Silent (flaky) | N: CRITICAL GAP B1 |
| live append     | tailer misses append      | Y                                | E2E live        | assertion fail | trace              |
| refused host    | non-loopback served       | Y                                | API spec        | 403            | plugin log         |
| SSE drop        | reconnect banner          | Y                                | E2E route abort | banner         | status             |
| screenshot      | cross-OS drift            | Y (platform-suffixed, CI-pinned) | repeat-each     | diff image     | CI artifact        |
| CI              | vp or browser setup fails | Y                                | first runs      | red CI         | Actions log        |
| teardown        | temp root leak            | Y                                | none            | Silent         | N                  |

Critical gaps: 1 (B1), remedy specified, closed when T3 lands.

## Diagrams

System architecture, data flow with shadow paths, test coverage map: shown in chat for Sections 1, 4, 6. Error flow: see Registry. Deployment sequence: CI job order `install -> vp check -> vp test -> playwright install (cached) -> e2e projects -> upload artifacts`. Rollback: revert PR; delete env var use; nothing else changes. Stale diagram audit: no ASCII diagrams in files this plan touches (`vite.config.ts`, `package.json`, `.gitignore`, `TODOS.md`, README roadmap).

## Implementation Tasks

- [ ] **T1 (P1, human: ~3h / CC: ~20min)** Harness: Playwright dep, `playwright.config.ts` projects table, env seam in `vite.config.ts`, `test.exclude`, `.gitignore`, trace and screenshot on failure. Surfaced by: D9, D11, D4, 0B. Files: `package.json`, `playwright.config.ts`, `vite.config.ts`, `.gitignore`. Verify: `vp test` unaffected; `vp run e2e` starts N servers.
- [ ] **T2 (P1, human: ~3h / CC: ~15min)** Fixture shift, live-append helper and unit test (global anchor, age offset, utimes, loud failures). Surfaced by: D2, D10, C1, C2, B2. Files: `e2e/support/fixtures.ts`, `e2e/support/fixtures.test.ts`. Verify: `vp test`.
- [ ] **T3 (P1, human: ~1h / CC: ~10min)** Readiness on `/__office/status` tracked count; teardown in finally. Surfaced by: Section 2 B1, B3. Files: `playwright.config.ts`, `e2e/support/*`. Verify: `--repeat-each=5` has zero empty-room failures.
- [ ] **T4 (P1, human: ~3h / CC: ~15min)** Core specs: `data-state` per agent, refused host, empty fixture banner, 403 banner. Surfaced by: R4, T7, Q2 pending. Files: `e2e/office.spec.ts`. Verify: specs pass.
- [ ] **T5 (P2, human: ~2h / CC: ~10min)** Live specs: wave on attention, subagent walk-in and handoff. Surfaced by: D3, D10. Files: `e2e/office.spec.ts`. Verify: specs pass.
- [ ] **T6 (P2, human: ~4h / CC: ~20min)** 12-agent fixture generator and load spec. Surfaced by: D5. Files: `e2e/fixtures/*`, `e2e/office.spec.ts`. Verify: 12 agents render in 3 rows.
- [ ] **T7 (P2, human: ~1 day / CC: ~45min)** T13 cases: reduced motion, recolor (palette import), title and chip order, keyboard order and tag, focus after leave, chip scroll. Surfaced by: T13. Files: `e2e/office.spec.ts`. Verify: all pass.
- [ ] **T8 (P2, human: ~4h / CC: ~30min)** Screenshot baseline: pinned `?hour/?seed/?scene`, fixed viewport, reduced motion, platform-suffixed baselines, `--repeat-each=5`, quarantine rule. Surfaced by: D7. Files: `e2e/office.spec.ts`, `e2e/__screenshots__/*`. Verify: five identical repeats.
- [ ] **T9 (P2, human: ~3h / CC: ~15min)** CI workflow with pins, cache, artifacts, update-baselines job. Surfaced by: D6, Section 9. Files: `.github/workflows/ci.yml`. Verify: two green runs.
- [ ] **T10 (P3, human: ~30min / CC: ~5min)** README note: `playwright install`, `vp run e2e`. Surfaced by: Section 10. Files: `README.md`. Verify: fresh clone follows it.

Q2 and Q3 are closed by the eng review (R3, R2). The eng review's task list below supersedes this list where they differ.

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                         |
  | System Audit         | vitest picks up spec files, fixtures stale, |
  |                      | root seam exists, no CI                     |
  | Step 0               | SELECTIVE EXPANSION; D2 shift; 5 extras     |
  | Section 1  (Arch)    | 2 issues found                              |
  | Section 2  (Errors)  | 6 error paths mapped, 3 GAPS                |
  | Section 3  (Security)| 4 issues found, 0 High severity             |
  | Section 4  (Data/UX) | 7 edge cases mapped, 3 unhandled            |
  | Section 5  (Quality) | 3 issues found                              |
  | Section 6  (Tests)   | Diagram produced, 2 gaps                    |
  | Section 7  (Perf)    | 0 issues found                              |
  | Section 8  (Observ)  | 1 gap found                                 |
  | Section 9  (Deploy)  | 4 risks flagged                             |
  | Section 10 (Future)  | Reversibility: 5/5, debt items: 3           |
  | Section 11 (Design)  | SKIPPED (no UI scope)                       |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (1 item)                            |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 6 rows, 1 CRITICAL GAP                      |
  | Failure modes        | 8 total, 1 CRITICAL GAP                     |
  | TODOS.md updates     | 1 item proposed, 1 added                    |
  | Scope proposals      | 5 proposed, 5 accepted (EXP + SEL)          |
  | CEO plan             | written                                     |
  | Outside voice        | codex disabled (no completed review)        |
  | Lake Score           | N/A (no scored questions)                   |
  | Diagrams produced    | 6 (arch, data flow, test map, error, deploy, rollback) |
  | Stale diagrams found | 0                                           |
  | Unresolved decisions | 2 (Q2, Q3)                                  |
  +====================================================================+
```

Approval readiness: PASS. Checked rows R4/T7/T13 (design doc), D1, D2, D3, D4, D5, D6, D7, D8, D9, D10, D11, D12 against their answer references; Q2 and Q3 stay unresolved and out of accepted work.

## Eng review (/plan-eng-review, 2026-10-03)

Target: this plan (docs/designs/phase-5-ceo-review.md), branch feat/phase-5-end-to-end. Report file: this file.

### Scope Challenge record

feature answers: none proposed (feature list settled by CEO review D1-D12); structure: B Smaller arrangement (answer to eng D1); accepted scope: same features, contracts and approved fixes as the CEO review, with committed 12-agent fixtures replaced by run-time generation from `server/fixtures`, one `e2e/support.ts` plus `e2e/support.test.ts`, README note folded into the BUILD_TODO.md edit; pending remedies: F1, F2, Q2. Result: scope accepted as-is (arrangement only).

### Scope Challenge findings

1. [P1] (confidence: 9/10) node_modules/.vite optimizer cache: two concurrent cold `vp dev` servers log `ENOTEMPTY: directory not empty, rename '.../node_modules/.vite/deps_temp_ce54797d' -> '.../node_modules/.vite/deps'` (bounded probe this review). The approved D9 starts one webServer per scenario at once. Pending.
2. [P2] (confidence: 8/10) src/office/machine.ts:13 `export const TUNING = { staleMs, toolTimerMs: 10 * 1000, idleLeaveMs: 5 * 60 * 1000, arrivingMs: 1500, ... }`. D2's per-scenario age offset (approved after R4) already makes every timer fire without waiting, so the BUILD_TODO 5.1 "TUNING override" (Q3) would add a production seam only tests use. Reopens approved 5.1 wording. Pending.
3. [P3] (confidence: 9/10) server/feed-plugin.ts:746 default root `join(homedir(), ".claude", "projects")`; the probe's cold start scanned 33 real files. Every E2E server must pass a root. Implementation note for T1 (config throws when the env root is missing).
4. [P3] (confidence: 7/10) Vite listens on `[::1]:5173` on this machine and a probe to 127.0.0.1 was refused. Use `http://localhost:<port>` as baseURL and webServer url. `isLoopbackAddress` accepts ::1 (feed-plugin.ts:63). Implementation note.
5. [P3] (confidence: 8/10) `node_modules/.bin/vp` exists and Node is v24.21.0: CI needs `npm ci` then `npx vp`, Node pinned to 24, no extra setup action. Implementation note.

Dispositions: 1 pending (decision below), 2 pending (decision below), 3-5 accepted as implementation notes inside approved T1/T9 (no behavior change).

### Eng decision ledger

#### R1: Dev server cache isolation (finding 1)

Finding: 1, P1, confidence 9/10, node_modules/.vite concurrent optimizer collision, reviewer: plan-eng-review.
Plan baseline: CEO D9 approved one Playwright project per scenario, each with its own webServer, port, temp root and env (answer: Project per scenario). Nothing approved about the optimizer cache.
Runtime evidence: two `vp dev --force` servers started together logged `ENOTEMPTY ... rename deps_temp_ce54797d -> deps` (probe, this review). Behavior with a warm cache and dynamic imports unknown.
Comparison grid:

| Commitment                                       | Source / approval           | Current                    | A per-server cacheDir      | B pre-warm once                | C spawn servers from a fixture           |
| ------------------------------------------------ | --------------------------- | -------------------------- | -------------------------- | ------------------------------ | ---------------------------------------- |
| Scenario isolation (own server, port, root, env) | CEO D9 approved             | approved                   | unchanged                  | unchanged                      | unchanged (realized in code, not config) |
| Optimizer cache                                  | this choice                 | shared, collides           | own dir per server via env | shared, warmed first           | shared, servers start one after another  |
| vite.config.ts change                            | CEO D11 + env seam approved | root option + test.exclude | plus `cacheDir` from env   | none extra                     | none extra                               |
| Startup                                          | this choice                 | all at once                | all at once, each cold     | one warm run, then all at once | sequential per spec file                 |
| Fixture clock shift                              | CEO D2 approved             | approved                   | unchanged                  | unchanged                      | unchanged                                |
| TUNING override                                  | F2, pending                 | pending                    | pending                    | pending                        | pending                                  |
| Refused-host method                              | Q2, pending                 | pending                    | pending                    | pending                        | pending                                  |

Question D2:
D2 — R1: How do parallel E2E dev servers avoid corrupting the shared Vite cache?
Project/branch/task: office-agents, feat/phase-5-end-to-end, plan docs/designs/phase-5-ceo-review.md, finding 1.
ELI10: Each scenario starts its own dev server. Vite keeps pre-built dependencies in one folder, node_modules/.vite. When two cold servers write it at once, one crashes with ENOTEMPTY (I reproduced it). In the suite that means random startup failures, the worst kind of flake because nothing in the app is wrong.
Stakes if we pick wrong: a first run on CI (cold cache) fails randomly or loads a half-built page.
Recommendation: A because Vite's own `cacheDir` gives every server a private folder with one line in vite.config.ts, and it fits the explicit-over-clever preference.
Note: options differ in kind, not coverage — no completeness score.
Pending remedies not decided here: F2 TUNING override, Q2 refused-host method.
Pros / cons:
A) Own cacheDir per server (recommended)
✅ Removes the shared-folder race by construction, works on cold CI, one config line plus an env var; effort S (human ~1h / CC ~5min)
❌ Each server re-optimizes dependencies on its own, adding a few seconds of CPU at startup
B) Pre-warm the cache once
✅ No vite.config.ts change, one extra startup step; effort S (human ~1h / CC ~5min)
❌ A dependency Vite discovers later, for example on the ?art page, can still trigger a parallel re-optimize and the race returns
C) Spawn servers from a test fixture, one at a time
✅ No race and no config change, ports chosen at run time; effort M (human ~3h / CC ~20min)
❌ Replaces Playwright's webServer with about 40 lines of process management and departs from how D9 was described
Net: A fixes the race at its cause with the least code; B leaves a gap, C costs more for the same result.
Header: Cache isolation
Options:
A) Own cacheDir per server (recommended)
Effort S, risk low. Each webServer gets `cacheDir` from an env var pointing into its own temp folder; scenario isolation, D2 shift and pending F2/Q2 unchanged. ✅ Removes the race by construction on cold CI. ❌ Each server re-optimizes on its own, a few seconds of CPU.
B) Pre-warm the cache once
Effort S, risk medium. A global setup starts one dev server to fill node_modules/.vite, then all servers share it; no config change. ✅ No vite.config.ts change. ❌ Late-discovered dependencies can still race.
C) Spawn servers from a test fixture
Effort M, risk low. A worker fixture starts each scenario's server in turn with a free port; D9 isolation kept in code, no webServer config. ✅ No race, no config change. ❌ About 40 lines of process management to maintain.

State: approved
Actual answer: A) Own cacheDir per server (recommended), eng D2 answer.
Accepted scope: vite.config.ts reads a cache directory from an env var and passes it as `cacheDir`; each Playwright webServer sets it to its own temp folder. Scenario isolation, D2 shift, F2 and Q2 unchanged.
History: none

#### R2: TUNING override (finding 2)

Finding: 2, P2, confidence 8/10, src/office/machine.ts:13-33 and BUILD_TODO.md 5.1, reviewer: plan-eng-review.
Plan baseline: BUILD_TODO 5.1 (design R4/T7, settled) says "add a TUNING override and transcript-root seam so the test needs no long waits". CEO review left Q3 (mechanism) pending and approved D2 (timestamp shift with per-scenario age offset, answer A) afterwards.
Runtime evidence: `machine.ts` TUNING is a plain exported object: staleMs, attentionStaleMs, episodeHoldMs 60s, toolTimerMs 10s, idleLeaveMs 5min, arrivingMs 1.5s, leavingMs 4s, subagentLeavingMs 20s. Time rules after an event compare `now` with event timestamps, so a shifted age offset should fire them at once; unverified until the first spec (T4) proves it.
Comparison grid:

| Commitment                                   | Source / approval | Current            | A replace with age offsets               | B keep override                                         |
| -------------------------------------------- | ----------------- | ------------------ | ---------------------------------------- | ------------------------------------------------------- |
| Specs need no long waits                     | R4 / 5.1 approved | required           | met by D2 age offsets                    | met by shortened timers                                 |
| Fixture clock shift with age offset          | CEO D2 approved   | approved           | unchanged, now also drives timers        | unchanged                                               |
| Production seam for tests                    | 5.1 wording       | one per Q3 pending | none                                     | env var read by plugin plus Vite define into the client |
| Files touched                                | this choice       | none yet           | no shared/tuning.ts or machine.ts change | shared/tuning.ts, vite.config.ts, machine.ts            |
| Real-time timers (arriving 1.5s, leaving 4s) | existing          | real time          | real time at defaults                    | shortened                                               |
| Cache isolation                              | R1 approved       | approved           | unchanged                                | unchanged                                               |
| Refused-host method                          | Q2, pending       | pending            | pending                                  | pending                                                 |

Question D3:
D3 — R2: Replace the planned TUNING override with timestamp age offsets?
Project/branch/task: office-agents, feat/phase-5-end-to-end, plan docs/designs/phase-5-ceo-review.md, finding 2 (reopens BUILD_TODO 5.1 wording).
ELI10: The plan promised a switch that shortens the app's timers so tests do not wait minutes. But the fixture helper already approved can stamp events as 11 seconds, 6 minutes or 31 minutes old, which makes the same timers fire right away without touching app code. Two ways to skip waiting means one is extra.
Stakes if we pick wrong: keeping the switch adds a production seam used only by tests and a second thing that must stay in sync between server and client; dropping it assumes the age offsets fire every rule, which the first spec proves.
Recommendation: A because it removes a test-only production seam (explicit over clever) and new evidence shows the approved D2 helper already covers the need.
Note: options differ in kind, not coverage — no completeness score.
Pending remedies not decided here: Q2 refused-host method.
Pros / cons:
A) Replace with age offsets (recommended)
✅ No change to shared/tuning.ts or machine.ts, closes pending Q3, one mechanism for every timer; effort S (human ~30min / CC ~5min)
❌ Departs from the 5.1 wording, and a timer that is not driven by event timestamps would force a later override anyway
B) Keep the approved override
✅ Matches BUILD_TODO 5.1 literally and shortens real-time timers too; effort M (human ~3h / CC ~20min)
❌ Adds an env var plus Vite define and touches shared/tuning.ts and machine.ts for tests only
Net: A drops a test-only seam at the cost of trusting the age offsets; B keeps the original wording at the cost of extra production code.
Header: TUNING override
Options:
A) Replace with age offsets (recommended)
Effort S, risk low. Timers fire through the approved D2 per-scenario age offset; no production TUNING seam, Q3 closes. ✅ No change to shared/tuning.ts or machine.ts. ❌ Departs from 5.1 wording; a timer not driven by timestamps would need an override later.
B) Keep the approved override
Effort M, risk medium. Add an env var read by the plugin and injected into the client through Vite define; shortens timers. ✅ Matches 5.1 literally. ❌ Test-only production seam kept in sync across server and client.

State: approved
Actual answer: A) Replace with age offsets (recommended), eng D3 answer.
Accepted scope: no TUNING override and no change to shared/tuning.ts or machine.ts; every timer-driven spec uses the D2 per-scenario age offset (event timestamps set to now minus the offset). CEO Q3 is closed by this answer. Real-time timers (arriving 1.5s, leaving 4s) run at their defaults. First spec (T4) must prove the offsets fire R1, R2 and expiry; if one does not, reopen with that evidence.
History: BUILD_TODO 5.1 wording "add a TUNING override" superseded by this answer.

#### R3: Refused-host E2E method (CEO Q2; finding A1)

Finding: A1, P2, confidence 9/10, server/feed-plugin.ts:798-803 and Vite server.allowedHosts, reviewer: plan-eng-review.
Plan baseline: R4/BUILD_TODO 5.2 approve a "refused-host" E2E case. CEO Q2 proposed an API request with a non-loopback Host plus a `page.route` stub; unresolved.
Runtime evidence: probe this review: `curl -H "Host: evil.example:5303" http://[::1]:5303/__office/status` returned 403 with Vite's own text `Blocked request. This host ("evil.example") is not allowed.`; the office plugin's 403 body never appeared. Loopback Host returned 200. So a non-loopback Host test exercises Vite, not `isLoopbackRequest`. The plugin check is unit-tested in server/feed-plugin.test.ts; the refused banner is unit-tested in feed-client.test.ts and topbar.test.tsx.
Comparison grid:

| Commitment                              | Source / approval               | Current   | A route stub only                             | B route stub plus real non-loopback socket spec | C unit coverage only |
| --------------------------------------- | ------------------------------- | --------- | --------------------------------------------- | ----------------------------------------------- | -------------------- |
| Browser shows the refused banner on 403 | 5.2 approved                    | required  | one E2E via `page.route` on events and status | same as A                                       | none in E2E          |
| Plugin refuses a non-loopback request   | R3/D6 (design) unit test exists | unit only | unit only, unchanged                          | plus E2E over a real non-loopback interface     | unit only            |
| Network dependency                      | this choice                     | none      | none                                          | needs a non-loopback interface on the runner    | none                 |
| Files / effort                          | this choice                     | none      | spec only, S                                  | spec plus a server on 0.0.0.0, M                | none                 |
| Cache isolation, TUNING                 | R1, R2 approved                 | approved  | unchanged                                     | unchanged                                       | unchanged            |

Question D4:
D4 — R3: How should the refused-host E2E case be built?
Project/branch/task: office-agents, feat/phase-5-end-to-end, plan docs/designs/phase-5-ceo-review.md, finding A1 (settles CEO Q2).
ELI10: The plan wants an E2E for the refused-host case. I tried the obvious way, sending a request with a fake Host name. Vite itself rejects that with its own 403 before our feed plugin runs, so such a test would check Vite, not our guard. The banner the user sees is the part only a browser test can prove.
Stakes if we pick wrong: a test that passes for the wrong reason gives false confidence; a brittle network test makes the suite flaky on machines without a second network interface.
Recommendation: A because it proves the user-visible banner in a real browser and leaves the guard itself to the existing unit test (explicit over clever, and no network dependence).
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Route stub for the banner, unit test keeps the guard (recommended)
✅ Proves the real 403-to-banner path in Chromium with no network dependence; effort S (human ~1h / CC ~10min)
❌ Does not exercise the plugin's own refusal through a real socket in the E2E
B) Route stub plus a real non-loopback socket spec
✅ Also proves the plugin refuses a real non-loopback client end to end; effort M (human ~4h / CC ~25min)
❌ Needs a non-loopback interface and a server on 0.0.0.0, brittle on VPNs and sandboxed runners
C) Unit coverage only, drop the E2E case
✅ Nothing to maintain, unit tests already cover guard and banner
❌ Removes a case the approved plan explicitly lists and leaves the browser banner untested
Net: A tests what the user sees and nothing more; B adds a real-socket check at the cost of flakiness; C drops an approved case.
Header: Refused-host test
Options:
A) Route stub for the banner (recommended)
Effort S, risk low. One E2E stubs 403 on the events and status URLs and asserts the refused banner; the plugin's 403 stays covered by server/feed-plugin.test.ts. ✅ Real browser banner proof, no network dependence. ❌ No real-socket proof of the plugin refusal in E2E.
B) Route stub plus real socket spec
Effort M, risk medium. A plus a spec that starts a server on 0.0.0.0 and requests it through a non-loopback interface address. ✅ Proves the plugin refuses a real non-loopback client. ❌ Needs a non-loopback interface, brittle on VPNs and sandboxed runners.
C) Unit coverage only
Effort S, risk medium. Drop the refused-host E2E case. ✅ Nothing to maintain. ❌ Removes an approved case; browser banner untested.

State: approved
Actual answer: A) Route stub for the banner (recommended), eng D4 answer.
Accepted scope: one E2E in the core project stubs a 403 on `/__office/events` and `/__office/status` with `page.route` and asserts the refused banner text; the plugin's non-loopback refusal stays covered by server/feed-plugin.test.ts; no non-loopback socket spec and no API-level Host test. CEO Q2 is closed by this answer.
History: CEO Q2 proposed an API request with a non-loopback Host; superseded by the probe above.

#### R4: Regression cover for default dev and test behavior (finding 6, Iron Rule)

Finding: 6, P2, confidence 7/10, vite.config.ts:8-34 and server/feed-plugin.ts:746, reviewer: plan-eng-review.
Plan baseline: approved T1 changes vite.config.ts three ways: `test.exclude` of `e2e/**` (CEO D11), a transcript-root option from env (5.1), a `cacheDir` from env (eng R1). No regression coverage for the unchanged defaults is approved.
Runtime evidence: `officeFeed()` is called with no options today (vite.config.ts:34) and defaults to `join(homedir(), ".claude", "projects")` (feed-plugin.ts:746); the cold-start probe scanned 33 real files that way. `vp test` currently has no test block. Behavior of the edited config is not yet observed.
Comparison grid:

| Commitment                                     | Source / approval     | Current  | A unit-test the env mapping                             | B manual check in T1  | C none                |
| ---------------------------------------------- | --------------------- | -------- | ------------------------------------------------------- | --------------------- | --------------------- |
| Env unset keeps default root, default cacheDir | existing behavior     | holds    | asserted by a unit test                                 | checked once by hand  | unchecked             |
| Env set selects root and cacheDir              | 5.1 + eng R1 approved | planned  | asserted by the same unit test                          | seen only through E2E | seen only through E2E |
| Existing unit tests still run (e2e excluded)   | CEO D11 approved      | planned  | T1 verify: `vp test` count equals before                | same                  | same                  |
| Where it lives                                 | this choice           | none     | e2e/support.ts (approved file) plus e2e/support.test.ts | none                  | none                  |
| Cache isolation, TUNING, refused-host          | R1, R2, R3 approved   | approved | unchanged                                               | unchanged             | unchanged             |

Question D5:
D5 — R4: Add a regression test for the default dev behavior the config change touches?
Project/branch/task: office-agents, feat/phase-5-end-to-end, plan docs/designs/phase-5-ceo-review.md, finding 6.
ELI10: To run the E2E, vite.config.ts will start reading two environment variables (where to find transcripts, where to keep Vite's cache). If someone runs plain `vp dev` with neither set, it must behave exactly as today, scanning your real Claude sessions. A mistake here would not fail any current test.
Stakes if we pick wrong: a typo that makes the default root empty would show an empty office for every normal user, and only a person looking at the screen would notice.
Recommendation: A because the check is one tiny pure function with a unit test, no browser needed, and it protects the one thing every non-E2E user depends on.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Unit-test the env mapping (recommended)
✅ Asserts unset env returns no overrides, set env returns root and cacheDir, partial env works; fast, in the existing vp test run; effort S (human ~45min / CC ~5min)
❌ Adds a small exported function that vite.config.ts imports from e2e/support.ts
B) Manual check during T1 only
✅ No extra code
❌ Nothing catches a later edit to the config that breaks the default
C) No regression cover
✅ Smallest diff
❌ Violates the rule that behavior at risk needs coverage; defaults can silently regress
Net: A pins the defaults for the price of one small function and test; B and C leave the common path unguarded.
Header: Default-behavior test
Options:
A) Unit-test the env mapping (recommended)
Effort S, risk low. A pure `officeEnv(env)` in e2e/support.ts returns `{}` for empty env and `{root, cacheDir}` when set; tested in e2e/support.test.ts under `vp test`; T1 verifies the unit test count is unchanged. ✅ Pins the defaults. ❌ One small export imported by vite.config.ts.
B) Manual check in T1 only
Effort S, risk medium. Run `vp dev` once with no env and confirm the real sessions appear. ✅ No extra code. ❌ No guard against later edits.
C) No regression cover
Effort S, risk high. ✅ Smallest diff. ❌ Defaults can silently regress.

State: approved
Actual answer: A) Unit-test the env mapping (recommended), eng D5 answer.
Accepted scope: a pure `officeEnv(env)` exported from e2e/support.ts, imported by vite.config.ts, returns `{}` for an empty env and `{ root, cacheDir }` when the env is set (each key independent); tested in e2e/support.test.ts under `vp test`; T1 verifies the existing unit test count is unchanged after the `e2e/**` exclude. No other new tests approved here.
History: none

### Eng review: Sections 1 to 4

**Section 1, Architecture.** Confirmed approved: per-scenario servers (CEO D9), cacheDir per server (R1), no TUNING seam (R2).

```
 playwright test (workers: 1)
   |- project core | live | twelve | stale | empty | visual   (one table in playwright.config.ts)
   |    each: webServer `vp dev --port 52xx --strictPort`  env OFFICE_E2E_ROOT, OFFICE_E2E_CACHE
   |    vite.config.ts: officeFeed({root}) + cacheDir  <- officeEnv(process.env) in e2e/support.ts
   |    ports avoid 5173 (a dev server may already own it)
   |- globalSetup: mkdtemp root per project, shiftFixture(anchor = max ts, ageOffset) + utimes
   |- chromium -> http://localhost:52xx  (Vite binds ::1)  -> EventSource /__office/events
   '- afterAll: remove temp roots even on failure
 tailer (1 s scan) -> SSE snapshot + live frames -> feed-client -> machine -> Scene DOM
```

1. [P2] (confidence: 9/10) server/feed-plugin.ts:798-803, probe: a non-loopback Host gets Vite's own 403 before the office guard, so an API-level Host test checks Vite. Disposition: accepted, R3 (eng D4 answer A).
2. [P3] (confidence: 8/10) BUILD_TODO.md 5.2 and 5.3 name one `e2e/office.spec.ts` for about 15 specs across 6 projects. Disposition: accepted as note: tag specs (`@core`, `@live`, `@twelve`, `@stale`, `@empty`, `@visual`) and give each project a `grep`; keep the approved file name.
3. [P3] (confidence: 9/10) `[::1]:5173` is already held by a running dev server on this machine. Disposition: accepted as note: E2E ports start at 5201, all with `--strictPort`, `reuseExistingServer: false`.

Distribution: CI uses `npm ci`, Node 24, `npx playwright install --with-deps chromium` cached by Playwright version, `permissions: contents: read`, `timeout-minutes`, `concurrency`. Production failure considered: cold CI cache plus parallel servers (R1). Rollback: revert the PR; the env seam is inert when unset (R4 pins that).
Dispositions: 1 accepted (R3), 2 and 3 accepted as implementation notes.

**Section 2, Code quality.**

1. [P3] (confidence: 8/10) `server/sanitize-fixtures.ts:22` `hashId` and `:141` main-guard: the 12-agent generator can import `hashId` for session ids safely (the CLI only runs under the guard). No new shared helper; reuse, not extraction. `src/office/palette.ts` is imported for the recolor check. Disposition: accepted as note.
2. [P3] (confidence: 7/10) `vite.config.ts` will import `officeEnv` from `e2e/support.ts` (R4), so a config file depends on the e2e folder. Acceptable: both are Node-side and the function is pure with no Playwright import. Keep `e2e/support.ts` free of `@playwright/test` imports so `vp test` can load it. Disposition: accepted as note.

No shared-code extraction proposed; rubric needs two verified callers and there is one. Touched-file diagrams: none stale.

**Section 3, Tests.** Framework: Vitest through Vite+ (CLAUDE.md names `vp test`, no Testing section); Playwright is new (approved in R4/T7).

```
CODE PATHS (existing, reused)                         E2E FLOWS (planned)
[+] server/feed-plugin.ts                             [+] core project
  |- isLoopbackRequest / 403   [★★★ TESTED] feed-plugin.test.ts   |- data-state per agent        [→E2E] [GAP -> T4]
  |- tailer scan + SSE         [★★★ TESTED] feed-plugin.test.ts   |- empty fixture banner        [→E2E] [GAP -> T4]
[+] src/office/feed-client.ts                                      |- refused banner (route stub) [→E2E] [GAP -> T4, R3]
  |- refused/reconnecting      [★★★ TESTED] feed-client.test.ts   [+] live project
[+] src/office/topbar-logic.ts + TopBar.tsx                        |- append -> arriving -> working [→E2E] [GAP -> T5]
  |- visibleChips +N, titleFor [★★★ TESTED] topbar.test.tsx       |- wave via R1 age offset        [→E2E] [GAP -> T5]
[+] src/office/Scene.tsx                                           |- subagent walk-in / handoff    [→E2E] [GAP -> T5]
  |- lostFocus focus return    [★★  TESTED] scene-model.test.ts   |- agent leaves -> focus kept    [→E2E] [GAP -> T7]
  |- reducedMotion             [★★  TESTED] Scene.test.tsx        [+] twelve project
[+] src/office/Character.tsx                                       |- 12 render in 3 rows, +N chips [→E2E] [GAP -> T6]
  |- data-state / data-shirt   [★★  TESTED] Scene.test.tsx        [+] stale project
[+] e2e/support.ts (new)                                           |- age offset 31 min -> leaves   [→E2E] [GAP -> T5/T7]
  |- shiftFixture, officeEnv   [GAP -> T2 unit]                   [+] visual project
                                                                   '- scene screenshot             [→E2E] [GAP -> T8]
COVERAGE: existing paths 6/6 tested | planned E2E flows 0/13 until built | new unit paths 0/2 until T2
GAPS: 15 (13 E2E, 2 unit); each carried by an approved task
```

1. [P2] (confidence: 9/10) BUILD_TODO.md:129 asks for "chip scroll-into-view when many chips overflow", but src/office/topbar-logic.ts:75-84 caps the normal layout at `MAX_VISIBLE_CHIPS = 4` and folds the rest into a "+N" `<li>` (DESIGN.md:249 agrees), and the narrow layout wraps every chip; nothing scrolls (`grep scrollIntoView` finds none). Factual correction, no behavior change: the T13 case asserts 4 chip buttons plus "+N" with `aria-label` "and N more waiting" in the normal layout, and all chips wrapped at under 800x500. Disposition: accepted as correction.
2. [P3] (confidence: 8/10) src/office/Character.tsx:203 `data-state={displayed}` follows `useDisplayedState`, which waits for a loop end or `SWAP_TIMEOUT_MS = 900` (src/office/poses.ts:33,65) in animated mode. Specs must use auto-retrying assertions; reduced motion shows the state at once. Disposition: accepted as note (already the plan's rule).
3. [P2] (confidence: 7/10) Iron Rule: vite.config.ts changes put the unset-env default at risk. Disposition: accepted, R4 (eng D5 answer A).

Value cards (one per critical path or edge case) are in the Test Plan artifact. Tests made obsolete: none. No new optional verification depth proposed; approved cases only.

**Section 4, Performance.**

1. [P3] (confidence: 5/10, medium: verify) Six dev servers with six private caches each re-optimize on a cold start. Cost unknown: measure startup in T1. If total startup exceeds 30 s, merge scenarios whose fixtures can coexist. Medium confidence, verify this is actually an issue. Disposition: accepted as verification note.
2. Memory and caching: temp roots are small (fixtures about 12 KB, 12-agent set generated in memory); no unbounded structures. Blocking calls: none without a timeout (Playwright defaults, `webServer.timeout` set).

Suppressed findings (confidence 3-4): none.

Approval readiness: PASS. Checked CEO rows D1-D12 (answers in the CEO review), eng D1 structure B, R1 (eng D2 answer A), R2 (eng D3 answer A), R3 (eng D4 answer A), R4 (eng D5 answer A). Findings eng 3-5, A2, A3, Q-notes, Section 3 findings 1-2 and the performance note are implementation notes or factual corrections inside approved scope and approve no new behavior.

### NOT in scope

Deferred: E2E failure context attachments (TODOS.md, CEO D12). Rejected: a real non-loopback socket E2E (eng R3 option B), a TUNING override (eng R2 option B), pre-warming the Vite cache (R1 option B), spawning servers from a fixture (R1 option C). No new TODO proposed by the eng review.

### What already exists

`server/fixtures/*`, `server/sanitize-fixtures.ts` (`hashId`, main-guarded, reused by the generator), `createFeed({ root })` and `officeFeed(options)` (root seam reused; `...options` spread keeps defaults), `isLoopbackRequest` unit test, `feed-client.test.ts` and `topbar.test.tsx` (refused, empty, chips), `data-*` hooks in Character and Scene, `src/office/palette.ts` (recolor), `?hour/?seed/?scene` dev overrides, `.top-bar-chip`, `titleFor`, Vite `cacheDir` and `--strictPort`. Rebuilt: nothing. New: `e2e/support.ts`, `e2e/support.test.ts`, `e2e/office.spec.ts`, `playwright.config.ts`, CI workflow.

### Failure modes

| Codepath             | Failure                    | Test                                     | Handling              | User sees                  | Critical gap  |
| -------------------- | -------------------------- | ---------------------------------------- | --------------------- | -------------------------- | ------------- |
| parallel dev servers | cache rename collision     | `--repeat-each=5` on cold cache          | private cacheDir (R1) | none                       | no            |
| first tailer scan    | room empty at load         | readiness on status count + auto-retry   | T3                    | assertion fails with trace | no            |
| shiftFixture         | malformed or missing files | unit (T2)                                | throws with file:line | setup error                | no            |
| officeEnv default    | wrong default root         | unit (R4)                                | pure function         | n/a                        | no            |
| refused banner       | 403 not mapped             | E2E route stub (R3)                      | banner                | refused text               | no            |
| live append          | tailer misses a frame      | live specs (T5)                          | 1 s scan, auto-retry  | assertion fails with trace | no            |
| screenshot           | platform drift             | platform-suffixed baselines, repeat-each | CI-pinned Linux       | diff image                 | no            |
| teardown             | temp root leak             | none                                     | try/finally           | silent disk litter         | no (harmless) |

Critical gaps: 0.

### Worktree parallelization strategy

| Step                             | Modules touched        | Depends on       |
| -------------------------------- | ---------------------- | ---------------- |
| T2 support helpers and unit test | e2e/                   | none             |
| T1 harness config                | repo root config, e2e/ | T2 (`officeEnv`) |
| T3 readiness and teardown        | e2e/, repo root config | T1               |
| T4-T8 specs                      | e2e/                   | T1, T2, T3       |
| T9 CI workflow                   | .github/               | T1               |
| T10 docs note                    | repo root docs         | none             |

Lane A: T2 -> T1 -> T3 -> T4 -> T5 -> T6 -> T7 -> T8 (shared e2e/ and config, sequential). Lane B: T9 after T1, T10 any time (disjoint modules). Execution order: finish T1, launch Lane B (T9) beside the specs, merge both, then run the full suite on CI. Conflict flags: T1 and T3 both touch `playwright.config.ts`; keep them in Lane A.

## Implementation Tasks (eng review; supersedes the CEO list where different)

- [ ] **T1 (P1, human: ~3h / CC: ~20min)** Harness: add Playwright, `playwright.config.ts` projects table (ports 5201+, `--strictPort`, `reuseExistingServer: false`, `stdout: "pipe"`, baseURL `http://localhost:<port>`), `vite.config.ts` uses `officeEnv(process.env)` for root and `cacheDir`, `test.exclude` of `e2e/**`, `.gitignore` for test-results and playwright-report, trace and screenshot on failure. Surfaced by: R1, R4, CEO D4/D11, findings 3 to 5. Files: `package.json`, `package-lock.json`, `playwright.config.ts`, `vite.config.ts`, `.gitignore`. Verify: `vp test` count equals the count before the change; `vp dev` with no env still shows real sessions; E2E starts all projects on a cold cache with no ENOTEMPTY.
- [ ] **T2 (P1, human: ~3h / CC: ~15min)** `e2e/support.ts`: `shiftFixture` (global max-timestamp anchor, age offset, utimes, loud failures), `appendFixtureLines`, run-time 12-agent generator (reuse `hashId`), `officeEnv`; no `@playwright/test` import. Plus `e2e/support.test.ts`. Surfaced by: CEO D2/D5/D10, R4, Section 2. Files: `e2e/support.ts`, `e2e/support.test.ts`. Verify: `vp test`.
- [ ] **T3 (P1, human: ~1h / CC: ~10min)** Readiness waits on `/__office/status` tracked count; teardown in finally. Surfaced by: CEO Section 2 B1/B3. Files: `playwright.config.ts`, `e2e/support.ts`. Verify: `--repeat-each=5` with zero empty-room failures.
- [ ] **T4 (P1, human: ~3h / CC: ~15min)** Core specs: `data-state` per agent (auto-retry), empty-fixture banner, refused banner via `page.route` 403 on events and status; first spec proves age offsets fire R1, R2 and expiry. Surfaced by: R4/T7, R2, R3. Files: `e2e/office.spec.ts`. Verify: specs pass; if an offset does not fire a rule, reopen R2 with that evidence.
- [ ] **T5 (P2, human: ~2h / CC: ~10min)** Live specs: append to arriving then working, wave, subagent walk-in and handoff, stale-leave at 31 min. Surfaced by: CEO D3/D10. Files: `e2e/office.spec.ts`. Verify: specs pass.
- [ ] **T6 (P2, human: ~3h / CC: ~15min)** 12-agent spec on the generated fixture: 12 render in 3 rows, chips cap at 4 plus "+N". Surfaced by: CEO D5, finding Test 1. Files: `e2e/office.spec.ts`. Verify: spec passes.
- [ ] **T7 (P2, human: ~1 day / CC: ~45min)** T13 cases: reduced motion, recolor via `src/office/palette.ts`, title and chip order, keyboard order and tag on focus, focus after the focused agent leaves, chip overflow as "+N" and wrap (not scroll). Surfaced by: T13, Section 3 finding 1. Files: `e2e/office.spec.ts`. Verify: all pass.
- [ ] **T8 (P2, human: ~4h / CC: ~30min)** Screenshot baseline with pinned `?hour/?seed/?scene`, fixed viewport, reduced motion, platform-suffixed baselines, `--repeat-each=5`, quarantine rule. Surfaced by: CEO D7. Files: `e2e/office.spec.ts`, `e2e/__screenshots__/*`. Verify: five identical repeats on the CI platform.
- [ ] **T9 (P2, human: ~3h / CC: ~15min)** CI workflow: Node 24, `npm ci`, `npx vp check`, `npx vp test`, cached `playwright install --with-deps chromium`, E2E, artifacts on failure, update-baselines job, `permissions: contents: read`, `timeout-minutes`, `concurrency`. Surfaced by: CEO D6, Section 1. Files: `.github/workflows/ci.yml`. Verify: two green runs.
- [ ] **T10 (P3, human: ~30min / CC: ~5min)** Add the `playwright install` and `vp run e2e` note to the BUILD_TODO.md edit Phase 5 already makes; tick 5.1 to 5.3. Surfaced by: eng D1 structure B. Files: `BUILD_TODO.md`. Verify: a fresh clone follows it.

### Unresolved decisions

None in this review. Eng R2 and R3 closed the CEO review's open Q3 and Q2. Remaining risk, not a decision: T4 must prove the age offsets fire every timer rule.

## Eng completion summary

- Step 0: Scope Challenge: scope accepted as-is (arrangement B only, no feature cuts)
- Architecture Review: 3 issues found
- Code Quality Review: 2 issues found
- Test Review: diagram produced, 3 gaps identified (15 planned-test gaps carried by approved tasks)
- Performance Review: 1 issue found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 items proposed
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: codex, disabled (`codex_reviews=disabled`), no completed review
- Parallelization: 2 lanes, 1 parallel (T9, T10) / 1 sequential (Lane A)
- Lake Score: N/A (no scored questions)

## GSTACK REVIEW REPORT

| Review         | Trigger                        | Why                             | Runs | Status                                                                      | Findings                            |
| -------------- | ------------------------------ | ------------------------------- | ---- | --------------------------------------------------------------------------- | ----------------------------------- |
| CEO Review     | `/plan-ceo-review`             | Scope & strategy                | 1    | ISSUES OPEN (2026-10-03, logged unresolved 2; both closed by eng R2 and R3) | 5 proposals, 5 accepted, 0 deferred |
| Outside Review | codex plan review (default-on) | Independent 2nd opinion         | 0    | disabled                                                                    | no completed external review        |
| Eng Review     | `/plan-eng-review`             | Architecture & tests (required) | 1    | ISSUES OPEN (not persisted until logged)                                    | 9 issues, 0 critical gaps           |
| Design Review  | `/plan-design-review`          | UI/UX gaps                      | 0    | —                                                                           | —                                   |
| DX Review      | `/plan-devex-review`           | Developer experience gaps       | 0    | —                                                                           | —                                   |

**OUTSIDE COVERAGE:** codex, plan review, disabled (`codex_reviews=disabled`) for both CEO and eng runs; no findings; no native fallback run.
**VERDICT:** No review is CLEAR. Eng review ran: 9 issues found (3 architecture, 2 code quality, 3 test, 1 performance), 4 resolved by answers (R1 to R4), the rest accepted as notes or corrections, 0 unresolved; the log still records `issues_open` because findings exist. Run `/ship` only after T1 to T9 land; T4 must prove the age offsets fire R1, R2 and expiry.

**UNRESOLVED DECISIONS:**

- - 2 unresolved from prior reviews
