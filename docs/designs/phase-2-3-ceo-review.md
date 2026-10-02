# Phases 2 and 3 (Feed server, Pure logic): CEO review, SELECTIVE EXPANSION

Branch: `feat/phase-2-3` (from `main` at d0aeb03) | Date: 2026-10-02 | Reviewer: /plan-ceo-review
Plan under review: BUILD_TODO.md "Phase 2: Feed (server)" (2.1 to 2.4) and "Phase 3: Pure logic (client)" (3.1, 3.2), with the design doc `docs/designs/office-agents-isometric-office.md` (decisions R1..R9, 1A..8C stay settled and are not reopened) and `DESIGN.md`.
Review depth: implementation-ready (task level). Mode: SELECTIVE EXPANSION (user choice at D1; recommendation was the same).

## Decision ledger

| ID and owner | Contract and evidence                                                                                                                                                                                                                                                                                                                       | Current                                | Proposed                                                                            | Status   | Exact approval and scope                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------- | -------- | ------------------------------------------- |
| P23-MODE     | 0E mode. Evidence: about 9 new files, new capability on a settled design.                                                                                                                                                                                                                                                                   | recommendation SELECTIVE EXPANSION     | SELECTIVE EXPANSION                                                                 | approved | D1 answer "SELECTIVE EXPANSION". Mode only. |
| P23-BASE     | BUILD_TODO 2.1 to 2.4, 3.1, 3.2 as written, from design rows T2, T3, T10, T4, T12, T5, R1, R2, R3, R5, R8, 6A.                                                                                                                                                                                                                              | 6 tasks                                | unchanged                                                                           | approved | Approved in the eng and design reviews.     |
| P23-ADD-1    | TODOS.md P1 "Event guard hardening before the first producer": guard returns the original object, so a spread transcript entry would carry text past it. Depends: land before 2.1 emits.                                                                                                                                                    | not in Phase 2                         | add `parseAgentEvent` (fresh object, declared fields only) before 2.1               | approved | D2 answer "Add to scope".                   |
| P23-ADD-2    | Probe of 88 real `Agent` tool results (2026-10-02, keys only): 33 are `status: async_launched, isAsync: true` (result returns at launch, no `handback`); 55 are `status: completed` with `handback`. T2 says "completion is the parent tool_result with `toolUseResult.agentId`", which fires the walk-back at launch for 38% of subagents. | completion = any tool_result + agentId | completion only on `status: completed`; async completion from `<task-notification>` | approved | D3 answer "Add to scope".                   |
| P23-ADD-3    | Normalizer is the drift point (design Architecture 6) and was probed in one project. Real files have 19 line types and 70+ keys.                                                                                                                                                                                                            | hand-written fixtures                  | script-built, text-stripped fixtures from real transcripts                          | approved | D4 answer "Add to scope".                   |
| P23-ADD-4    | R1/R2 timers and episode ids make `machine.ts` the most stateful pure module; T4 verify is example tests only.                                                                                                                                                                                                                              | example tests                          | seeded random-sequence invariant test (one announce per episode, no stuck state)    | approved | D5 answer "Add to scope".                   |

## Evidence from the probe (keys only, no message text read)

- 1,311 transcript files. Top-level line types: attachment, assistant, user, queue-operation, custom-title, last-prompt, system, and more. `message.stop_reason`: `tool_use` 306, `end_turn` 36, none 418.
- Subagent tool is named `Agent` in current transcripts (88 uses in the 60 newest top-level files), not only `Task`.
- `queue-operation` lines carry `<task-notification>` (35 enqueue, 26 remove): the likely completion signal for async agents.
- Subagent files: `<session>/subagents/agent-<id>.jsonl` plus `agent-<id>.meta.json`, first line has `isSidechain`, `agentId`, `sessionId`.

## Ledger continued (spec review round 1, 2026-10-02)

| ID and owner | Contract and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Current                      | Proposed                                                                                                                                                                                                                                                                                                                                                                                                                          | Status     | Exact approval and scope                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------- |
| P23-ADD-2a   | Detail of D3 (same scope, no new behavior). Probe 2026-10-02: every `<task-notification>` carries `task-id`, `tool-use-id`, `status` (completed 59, failed 2), `output-file`, plus text-bearing `summary` and `result`. 33 of 33 `Agent` notifications have `task-id` equal to the async launch `agentId`; `tool-use-id` maps to the `Agent` tool_use. Lines appear as `enqueue` 35, `remove` 26, plus attachment and user copies. One `SendMessage` notification reuses an existing agentId (resumed agent). No Bash-task notification seen in 60 files.                                                                                                                       | completion = any tool_result | extract only `task-id`, `tool-use-id`, `status` by tag; count `enqueue` lines only; dedupe by `task-id` + `tool-use-id` (a SendMessage resume carries a new `tool-use-id`, so a second completion survives); accept only a `tool-use-id` that is an `Agent` launch, or a `SendMessage` to a known agent, seen in the same file; never keep `summary`/`result`                                                                     | approved   | Clarifies D3 answer "Add to scope"; no new scope.              |
| P23-ADD-3a   | Detail of D4. Reviewer: text stripping removes the trailing `?` that R2 reads. Fixture sanitizer must be an allowlist (keep line type, role, block types, tool names, ids hashed, timestamps, `stop_reason`, `status`, `isAsync`) and replace all text with a fixed placeholder, keeping one derived boolean for a trailing `?`.                                                                                                                                                                                                                                                                                                                                                | blocklist implied            | allowlist sanitizer; notification tags `task-id`, `tool-use-id`, `status` kept (ids hashed with the same function as `agentId`, `agent-<id>.jsonl` filenames and `.meta.json` names so links survive); `summary`, `result`, `output-file`, `note`, `usage` dropped; every other text replaced by `x`, or `x?` when the original ended in `?`, so the normalizer's R2 path (trailing char of the last assistant text) is exercised | approved   | Clarifies D4; no new scope.                                    |
| P23-ADD-4a   | Detail of D5. Define the checkable invariants: seed fixed in the test, 1,000 sequences of 50 events; (a) the machine's `episodeId` changes only on a new attention episode, (a) episodes follow P23-S1-2 (re-entry within `TUNING.episodeHoldMs` keeps the id and `waitingSince`), checked against a small reference model in the test; (b) after the last event plus `max(TUNING timers)` no agent is in `arriving`, `attention` holds only while an R1 or R2 trigger is unanswered, `waiting-on-subagents` holds only with an unresolved subagent launch, every other agent is `idle` or `leaving`; (c) states never leave the six listed. "One announce per episode" is (a). | one announce per episode     | invariants (a) to (c) above                                                                                                                                                                                                                                                                                                                                                                                                       | approved   | Clarifies D5; no new scope.                                    |
| P23-ADD-1b   | TODOS.md:23 left open: reject empty-string ids and negative or fractional `ts` in the guard? Reviewer flagged it as undecided by ADD-1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | accepts both                 | decide in Section 3 (input validation)                                                                                                                                                                                                                                                                                                                                                                                            | unresolved | pending (Section 3)                                            |
| P23-S1-1     | What the normalizer emits for `status: async_launched`, and whether the parent enters `waiting_on_subagents` for a background agent. Reviewer: parent must not go to coffee for an agent it is not waiting on. Design doc has no row for it.                                                                                                                                                                                                                                                                                                                                                                                                                                    | undefined                    | decide in Section 1 (also: a `failed` notification: treat as completion, agent leaves?)                                                                                                                                                                                                                                                                                                                                           | approved   | D7 answer "A: parent keeps working, any end leaves"            |
| P23-SCOPE-N  | Design doc line 376 excludes "teammates and background agents that run as their own sessions". Async `Agent` subagents write to `<session>/subagents/` and are not that category.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | ambiguous                    | one clarifying note in NOT in scope                                                                                                                                                                                                                                                                                                                                                                                               | approved   | D6 answer "Approve and continue" (documents and this row only) |
| P23-DOCS     | Reviewer: BUILD_TODO.md 2.1 and 3.1 still carry the old completion text and omit D2 to D5, so a builder would build the old behavior.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | stale                        | amend BUILD_TODO 2.1, 2.1b to 2.1d, 3.1 as an implementation task; normalizer becomes `(state, line) -> events`, stateful per file (launch ids, dedupe set); tailer mid-file start is a Section 4 case                                                                                                                                                                                                                            | approved   | D6 answer "Approve and continue" (documents and this row only) |
| P23-S1-2     | Reviewer round 3: design says "one announce per episode, none on timer flap" (design doc 741, 760, 791; DESIGN.md:224) but never defines when an episode ends, so a flap (timer fires, result arrives, next call times out) may or may not be one episode. ADD-4a(a) needs this.                                                                                                                                                                                                                                                                                                                                                                                                | undefined                    | decide in Section 1 (state machine)                                                                                                                                                                                                                                                                                                                                                                                               | approved   | D8 answer "B: hold-down window"                                |

## Spec review outcome

Three reviewer launches (cap reached). Round 3: no issue OPEN; all round-1 and round-2 items resolved or tied to a pending row. Reviewer score not reported numerically in rounds 2 and 3 (score unavailable). Remaining notes, carried as Reviewer Concerns: the sanitizer allowlist should also name `cwd` and `isSidechain` and share one trailing-`?` predicate with R2 (trailing whitespace and newline stripped); "count `enqueue` only" assumes every Agent completion has an enqueue line (35 enqueue, 26 remove observed, not verified per completion; Section 4 verifies); the CEO summary lists round 1 only (update below). Unresolved rows: P23-S1-1, P23-S1-2, P23-ADD-1b (decided in Sections 1 and 3), P23-SCOPE-N and P23-DOCS (decided at document approval).

## currentDecision (P23-S1-1)

Commitment comparison: Sync launch (`run_in_background: false`, result `completed`) keeps R-approved behavior in all options. Variable: background launch (flag absent, result `async_launched`, completion by notification) and `failed` notifications.

| Commitment                         | Source           | Current   | A (rec.)                                       | B                       | C                                        |
| ---------------------------------- | ---------------- | --------- | ---------------------------------------------- | ----------------------- | ---------------------------------------- |
| Handoff out at launch              | T2               | all       | all                                            | all                     | all                                      |
| Parent state while bg agent runs   | design 2A coffee | undefined | stays working or idle, no coffee               | coffee until completion | working, plus "+N" marker (8C)           |
| Completion (`completed`, `failed`) | P23-ADD-2a       | undefined | handoff back, subagent leaves on either status | same as A               | failed shows attention, completed leaves |

D7 answered A (P23-S1-1): sync launch (`run_in_background: false`) sends the parent to `waiting_on_subagents`; background launch (flag absent or true) emits only the out-handoff; `completed` and `failed` notifications both emit handoff back and the subagent leaves.

## currentDecision (P23-S1-2)

Commitment comparison: variable is the episode boundary (R1/R2 keep triggering attention; the machine owns `episodeId` and `waitingSince`, T12).

| Commitment                 | Source     | Current   | A: maximal run              | B (rec.): hold-down                                           | C: per trigger id                     |
| -------------------------- | ---------- | --------- | --------------------------- | ------------------------------------------------------------- | ------------------------------------- |
| New episode id             | design 741 | undefined | each entry into `attention` | entry after at least `TUNING.episodeHoldMs` outside attention | new R1 tool id or new `done` question |
| `waitingSince` on re-entry | T12        | undefined | reset                       | kept from first entry of the episode                          | reset per trigger                     |
| Tight flap loop spams aria | design 741 | spams     | spams                       | one announce                                                  | spams if each call has a new tool id  |

D8 answered B (P23-S1-2): re-entry into `attention` within `TUNING.episodeHoldMs` (default 60 s, tunable) of leaving it keeps the same `episodeId` and original `waitingSince`; otherwise a new episode.

## Section 2 findings (Error & Rescue)

Gaps in 2.2 (T3), all pending P23-S2-1: scan re-entrancy (setInterval overlap duplicates events), file truncation (size below offset), EACCES, oversize line or tail window landing mid-line (window doubles to a cap, then drift++), SSE client close cleanup, atomic snapshot-then-subscribe, timer and stream cleanup on server close or restart. Drift counter reader pending P23-S8-1 (Section 8).

## currentDecision (P23-S2-1)

Commitment comparison: variable is the tailer robustness set. Fixed in every option: T3 as approved (stat scan, per-file offsets, buffer to last newline, split line and ENOENT tests, SSE snapshot plus deltas, configurable root).

| Commitment                                                  | Source    | Current     | A (rec.): include all in 2.2    | B: include only top 3 | C: defer all |
| ----------------------------------------------------------- | --------- | ----------- | ------------------------------- | --------------------- | ------------ |
| Single-flight scan (chained, not overlapping)               | Section 2 | not in plan | yes, with controlled-pause test | yes                   | TODOS.md     |
| Atomic snapshot-then-subscribe                              | Section 2 | not in plan | yes, with test                  | yes                   | TODOS.md     |
| Truncation reset, EACCES skip+log, oversize line window cap | Section 2 | not in plan | yes, with tests                 | truncation only       | TODOS.md     |
| Client close and server close cleanup                       | Section 2 | not in plan | yes, with test                  | no                    | TODOS.md     |

D9 answered A (P23-S2-1): 2.2 includes single-flight scan, atomic snapshot-then-subscribe, truncation reset, EACCES skip with one log line, oversize-line window doubling to a cap then drift++, client close and server close cleanup, each with a test; plugin exposes `scanOnce()` plus injectable root and clock. Approval: D9 answer "A: include all four groups".

## Section 3 findings (Security)

| Threat                                                                                       | Likelihood | Impact                              | Mitigated by plan?                                               |
| -------------------------------------------------------------------------------------------- | ---------- | ----------------------------------- | ---------------------------------------------------------------- |
| LAN client sends `Host: localhost` to a `--host` dev server (R3 checks the Host header only) | Med        | High (all agent paths and activity) | NO, pending P23-S3-1                                             |
| DNS rebinding (attacker domain resolving to 127.0.0.1)                                       | Low        | High                                | Yes, Host check returns 403                                      |
| Transcript text reaching the browser                                                         | Med        | High                                | Yes with D2 (field-by-field, `parseAgentEvent`) and D4 leak test |
| Oversized or hostile ids (512-char bound)                                                    | Low        | Low                                 | Yes, guard bound                                                 |
| Symlinked transcript dir escaping the root                                                   | Low        | Med                                 | Partial: scan must not follow symlinks (add to 2.2 tests)        |
| Client-supplied paths                                                                        | none       | none                                | No client path input exists                                      |
| New dependencies                                                                             | none       | none                                | Phase 2/3 add none                                               |

## currentDecision (P23-S3-1)

Commitment comparison: variable is what the loopback guard checks. Fixed in every option: 403, one-line reason, no data, one log line (R3/R5); loopback names `localhost`, `127.0.0.1`, `::1`.

| Commitment                          | Source | Current         | A (rec.): Host and socket address    | B: Host only (as written) | C: A plus Origin                     |
| ----------------------------------- | ------ | --------------- | ------------------------------------ | ------------------------- | ------------------------------------ |
| Host header hostname loopback       | R3     | yes             | yes                                  | yes                       | yes                                  |
| `req.socket.remoteAddress` loopback | none   | not in plan     | yes (`::1`, `127.x`, `::ffff:127.x`) | no                        | yes                                  |
| Cross-origin `Origin` rejected      | none   | not in plan     | no                                   | no                        | yes, non-loopback Origin returns 403 |
| LAN `curl -H 'Host: localhost'`     | R3     | passes (bypass) | 403                                  | passes                    | 403                                  |

D10 answered A (P23-S3-1): 2.3 returns 403 unless both the Host hostname and `req.socket.remoteAddress` are loopback; test matrix as listed in the D10 option. Approval: D10 answer "A: Host and socket address". Stricter than R3's wording by one check; R3's loopback names and 403 behavior are unchanged.

## currentDecision (P23-ADD-1b)

Commitment comparison: variable is what `isAgentEvent` and `parseAgentEvent` reject beyond the Phase 1 contract (P1-S1-1: finite `ts`, strings at most 512 chars, extra fields ignored).

| Commitment                                                               | Source      | Current  | A (rec.): reject both                  | B: keep accepting | C: empty ids only    |
| ------------------------------------------------------------------------ | ----------- | -------- | -------------------------------------- | ----------------- | -------------------- |
| Empty-string `sessionId`, `projectId`, `toAgentId`, tool id, `episodeId` | TODOS.md:23 | accepted | rejected (`agentId: null` stays valid) | accepted          | rejected             |
| `ts`, `waitingSince` negative or fractional                              | TODOS.md:23 | accepted | rejected (non-negative safe integer)   | accepted          | accepted             |
| Phase 1 tests                                                            | P1-S1-1     | pass     | updated for the stricter rule          | unchanged         | updated for ids only |

D11 answered A (P23-ADD-1b): guard rejects empty-string ids (`agentId` may stay null) and requires `ts` and `waitingSince` to be non-negative safe integers; Phase 1 tests updated plus new cases. Approval: D11 answer "A: reject both".

## Sections 4 to 7 (no new decisions)

Section 4: data flow shadow paths and the async-order schedule are covered by D9; cold start synthesizes `agent_started` from the first parsed line of an unseen session or agent (`cwd`, `sessionId`, `agentId` are on every line); browser reconnect replaces state from a fresh snapshot (Phase 4 `useOffice` duty). Section 5: keep `feed-plugin.ts` one file with exported pure helpers (`isLoopbackRequest`, `assignSeat`, `createTailer`); table-driven `normalize.ts`; the trailing-`?` predicate lives in one place shared by normalizer and fixture script. Section 6: added test rows (fixture leak check, symlink not followed, D5 oracle). Section 7: tree walk every 5 s, active-set stat every 1 s.

## currentDecision (P23-S8-1)

Commitment comparison: variable is where drift becomes visible. Fixed: normalizer returns null and bumps a per-reason counter (T2 as approved).

| Commitment                                                                                                | Source    | Current     | A (rec.): status endpoint and log | B: log line only | C: counter unread |
| --------------------------------------------------------------------------------------------------------- | --------- | ----------- | --------------------------------- | ---------------- | ----------------- |
| One rate-limited log line when drift changes                                                              | none      | not in plan | yes                               | yes              | no                |
| `GET /__office/status` JSON (files tracked, drift by reason, last scan ms, SSE clients), loopback-guarded | none      | not in plan | yes                               | no               | no                |
| Reconstruct a bug from logs alone                                                                         | Section 8 | no          | yes                               | partly           | no                |

D12 answered A (P23-S8-1): 2.1/2.2 add a rate-limited drift log line and `GET /__office/status` (files tracked, drift by reason, last scan ms, SSE client count) behind the 2.3 loopback guard, with tests. Approval: D12 answer "A: log line plus status endpoint".

## Approval readiness

Approval readiness: PASS. Checked rows P23-MODE (D1), P23-BASE (design reviews), P23-ADD-1 (D2), P23-ADD-2 and 2a (D3), P23-ADD-3 and 3a (D4), P23-ADD-4 and 4a (D5, D8), P23-SCOPE-N and P23-DOCS (D6), P23-S1-1 (D7), P23-S1-2 (D8), P23-S2-1 (D9), P23-S3-1 (D10), P23-ADD-1b (D11), P23-S8-1 (D12) against their answers. Outside voice disabled. No other change is accepted. Approval is not implementation or verification: nothing below is built.

## Accepted scope (the working plan)

1. **2.1 Normalizer (T2, amended by D2, D3, D4, D7, D12).** `normalize(state, line) -> AgentEvent[]`, stateful per file (launch ids, dedupe set, last assistant text). Builds events field by field via `parseAgentEvent`. Sync launch (`run_in_background: false`, result `completed`) sends the parent to `waiting_on_subagents` and emits handoff out; background launch (flag absent or true, result `async_launched`) emits handoff out only. Completion: sync `completed` result, or a `<task-notification>` `enqueue` line (tags `task-id`, `tool-use-id`, `status` only; `completed` and `failed` both emit handoff back and the subagent leaves; dedupe `task-id` + `tool-use-id`; accept only an `Agent` launch or a `SendMessage` to a known agent seen in the same file). `agent_started` is synthesized from the first parsed line of an unseen session or agent (`cwd`, `sessionId`, `agentId`). `endsWithQuestion` from the trailing character of the last assistant text, trailing whitespace stripped, one shared predicate. Unknown types return no event; known types with a bad shape bump a per-reason drift counter.
2. **2.1b Guard hardening (D2, D11).** `parseAgentEvent` returns a fresh object with declared fields only; empty-string ids rejected (`agentId` may be null); `ts` and `waitingSince` non-negative safe integers; Phase 1 tests updated.
3. **2.1c Fixtures (D4).** Allowlist sanitizer script builds committed fixtures under `server/fixtures/` (line type, role, block types, tool names, hashed ids, timestamps, `stop_reason`, `status`, `isAsync`, notification tags `task-id`, `tool-use-id`, `status`; text becomes `x` or `x?`); a test scans fixtures for non-allowlisted strings and home paths.
4. **2.2 Feed plugin core (T3, amended by D9, D12).** As written, plus: single-flight scan, atomic snapshot-then-subscribe, truncation reset, EACCES skip with one log line, oversize-line window doubling to a cap then drift++, client and server close cleanup, `scanOnce()` with injectable root and clock, symlinks not followed, tree walk every 5 s and active-set stat every 1 s, startup failure logs and disables the feed. `GET /__office/status` (files tracked, drift by reason, last scan ms, SSE client count) and a rate-limited drift log line.
5. **2.3 Loopback guard (R3/R5, amended by D10).** 403 unless the Host hostname and `req.socket.remoteAddress` are both loopback; the status endpoint uses the same guard.
6. **2.4 Seat table (T10/R8).** As written.
7. **3.1 State machine (T4/T12, amended by D7, D8).** As written, plus `TUNING.episodeHoldMs` (default 60 s): re-entry into attention within the window keeps `episodeId` and `waitingSince`. Markers `gstack-shortcut(dec-R1)` and `gstack-shortcut(dec-R2)`. Seeded invariant test (D5): fixed seed, 1,000 sequences of 50 events, three invariants from P23-ADD-4a.
8. **3.2 Identity (T5/6A).** As written.
9. **Docs (P23-DOCS, P23-SCOPE-N).** Amend BUILD_TODO 2.1 and 3.1 and add 2.1b to 2.1c, reword T2 and the design doc architecture diagram, add the NOT in scope note that async `Agent` subagents are not "background agents that run as their own sessions", and remove the TODOS.md "Event guard hardening" entry when it lands.

## NOT in scope

Deferred (to TODOS.md): none this review.
Rejected: none.
Unchanged from the design doc and Phase 1: LAN viewing, hooks adapter (TODOS), paper hover text, packaging, Windows and Linux specifics, sound, click-to-focus. Also not here because they belong to later phases: Scene, Character, iso, useOffice (Phase 4), E2E (Phase 5), the Origin check offered as D10 option C, failed-agent attention (D7 option C), and any raw tool-input or message capture.

## What already exists

`shared/events.ts` (types, SPEC table, `isAgentEvent`) and its tests are extended, not replaced. `src/office/poses.ts` already maps states to poses, so state names must match its input. Vite's loopback CORS and `allowedHosts` defaults remain the first line of defense. `src/tokens.test.ts` and `art.test.ts` guard DESIGN.md; the new TUNING values add no CSS. Nothing exists in `server/`.

## Dream state delta

```
 CURRENT                    THIS PLAN                              12-MONTH IDEAL
 types and a guard,   --->  live feed with drift visibility,  ---> hooks adapter exact attention,
 no producer, no            stateful normalizer (sync, async),     transcript adapter as fallback,
 machine                    machine with flap-suppressed           one validated event stream,
                            attention, seeded identity             format drift caught in CI
```

## Review sections (summary, depth: implementation-ready)

1. Architecture: 2 findings (snapshot ring eviction resolved by cold-start synthesis; background flag is an inferred rule), 2 decisions (D7, D8).
2. Error and rescue: 13 paths mapped, 10 gaps, all covered by approved remedies (D9, D12, 2a).
3. Security: 7 threats, 1 High impact unmitigated (LAN Host spoof), decided D10; empty ids and bad `ts` decided D11.
4. Data flow: 11 cases mapped, 2 unhandled before D9 (ordering, re-entrancy), 1 handed to Phase 4 (reconnect replaces state).
5. Code quality: 2 notes (one file with exported pure helpers, table-driven normalizer, one trailing-`?` predicate).
6. Tests: diagram produced, 3 gaps (fixture leak check, symlink not followed, machine oracle), all covered by tasks.
7. Performance: 1 note (two scan cadences).
8. Observability: 1 gap (drift unread), decided D12.
9. Deployment: 1 risk (plugin startup must not crash `vp dev`), covered by D9.
10. Trajectory: reversibility 4/5, 3 debt items.
11. Design: SKIPPED (no UI scope).

### Error & Rescue Registry

| Codepath  | Failure                              | Class             | Rescued | Action                              | User sees                 |
| --------- | ------------------------------------ | ----------------- | ------- | ----------------------------------- | ------------------------- |
| normalize | malformed JSON                       | SyntaxError       | Y       | null, drift++ (reason), log, status | log line, status endpoint |
| normalize | known type, bad shape                | shape drift       | Y       | null, drift++ (reason)              | log line, status endpoint |
| normalize | completion with unknown id           | orphan completion | Y       | ignored, counted                    | nothing                   |
| normalize | enqueue and remove copies            | duplicate         | Y       | dedupe `task-id` + `tool-use-id`    | one walk-back             |
| tailer    | file deleted                         | ENOENT            | Y       | agent leaves                        | agent exits               |
| tailer    | file truncated                       | truncation        | Y       | offset and state reset              | agent re-synthesized      |
| tailer    | unreadable                           | EACCES            | Y       | skip, one log line                  | log line                  |
| tailer    | line larger than window              | oversize line     | Y       | window doubles to cap, then drift++ | status endpoint           |
| tailer    | overlapping scans                    | re-entrancy       | Y       | single-flight chain                 | no duplicates             |
| tailer    | root missing                         | ENOENT (root)     | Y       | empty snapshot, one log line        | banner "no sessions" (R5) |
| SSE       | client closes                        | EPIPE             | Y       | remove from client set              | nothing                   |
| SSE       | delta between snapshot and subscribe | ordering gap      | Y       | synchronous snapshot-then-subscribe | no lost events            |
| plugin    | server close or restart              | leaked timer      | Y       | clear timer and streams on close    | no double scans           |
| guard     | spoofed Host from LAN                | spoof             | Y       | 403 on socket address               | 403 plus reason           |

### Failure Modes Registry

| Codepath  | Failure mode                       | Rescued?  | Test?    | User sees?       | Logged? |
| --------- | ---------------------------------- | --------- | -------- | ---------------- | ------- |
| normalize | malformed or drifted line          | Y         | Y        | log, status      | Y       |
| normalize | async completion missed            | Y (drift) | Y        | log, status      | Y       |
| tailer    | truncation, EACCES, oversize       | Y         | Y        | log, status      | Y       |
| tailer    | overlapping scan                   | Y         | Y        | nothing wrong    | n/a     |
| SSE       | disconnect                         | Y (retry) | manual   | banner (Phase 4) | n/a     |
| SSE       | snapshot ordering                  | Y         | Y        | nothing wrong    | n/a     |
| guard     | LAN Host spoof                     | Y         | Y        | 403              | Y       |
| machine   | stuck attention or double announce | Y         | Y (fuzz) | one announce     | n/a     |
| identity  | color collision                    | Y         | Y        | distinct pairs   | n/a     |

0 critical gaps (every row rescued or visible; the only untested row, SSE disconnect, is visible and was approved manual-only in R5).

### Scope Expansion Decisions

Accepted: P23-ADD-1 (guard hardening), P23-ADD-2 (async completion), P23-ADD-3 (real-shape fixtures), P23-ADD-4 (machine invariant test). Deferred: none. Skipped: none.

### Diagrams

```
SYSTEM (new in bold dependencies):
 ~/.claude/projects ─1s/5s scan─▶ tailer(single-flight) ─▶ normalize(state,line) ─▶ parseAgentEvent
      ▲ not followed: symlinks                                   │ drift by reason ─▶ log + /__office/status
 loopback guard (Host AND socket) ─▶ /__office/events: snapshot + deltas (atomic) ◀── seat table (R8)
                                                  │
 shared/events.ts ───────────────────────────────┴──▶ src/office/machine.ts (pure, now, TUNING) ─ identity.ts

STATE MACHINE (machine.ts)                          invalid: leaving → anything but removal
 arriving ─first working/arrive timer─▶ working ◀────── tool end / new activity ──────┐
 working ─sync launch─▶ waiting-on-subagents ─handback─▶ working                       │
 working ─done, no ?─▶ idle ─idle timer (top-level)─▶ leaving                          │
 working ─R1 timer or done + ?─▶ attention ─(re-entry < episodeHoldMs keeps episodeId)─┘
 any ─ENOENT / subagent completed or failed─▶ leaving

DEPLOY / ROLLBACK: merge PR ─▶ `vp dev` ─▶ curl events + 403 check ─▶ if bad: git revert, no data migration.
```

### Stale Diagram Audit

One: the design doc architecture diagram (lines 391 to 403) shows `normalize.ts line ──▶ AgentEvent | null` and a Host-only loopback note. It is now stateful (`state, line ──▶ events`) with socket-address checking, and the snapshot is atomic. Fix is task T9.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above. Run with Claude Code or Codex; checkbox as you ship. Estimates assume tests ~50x, features ~30x, architecture ~5x.

- [ ] **T1 (P1, human: ~2h / CC: ~15min)** — shared — `parseAgentEvent` and stricter guard
  - Surfaced by: Step 0 D2, Section 3 D11
  - Files: `shared/events.ts`, `shared/events.test.ts`, `TODOS.md`
  - Verify: `vp test`; empty `sessionId` and `ts: -5` rejected; fresh-object test passes with a spread transcript entry
- [ ] **T2 (P1, human: ~3h / CC: ~20min)** — fixtures — allowlist sanitizer, fixtures and leak test
  - Surfaced by: Step 0 D4, spec review 3a
  - Files: `scripts/sanitize-fixtures.ts`, `server/fixtures/*`, `server/fixtures.test.ts`
  - Verify: `vp test`; leak scan finds no non-allowlisted text or home path
- [ ] **T3 (P1, human: ~5h / CC: ~30min)** — server — stateful normalizer
  - Surfaced by: Step 0 D3, Section 1 D7, Section 8 D12, P23-ADD-2a
  - Files: `server/normalize.ts`, `server/normalize.test.ts`
  - Verify: `vp test`; async launch, failed, SendMessage resume, duplicate copies, cold-start synthesis, `x?` all covered
- [ ] **T4 (P1, human: ~1 day / CC: ~1h)** — server — feed plugin with robustness and status endpoint
  - Surfaced by: Section 2 D9, Section 4, Section 7, Section 8 D12
  - Files: `server/feed-plugin.ts`, `server/feed-plugin.test.ts`, `vite.config.ts`
  - Verify: `vp test` pause/release ordering test, truncation, EACCES, oversize, close cleanup, symlink; `curl` events and status
- [ ] **T5 (P1, human: ~1h / CC: ~10min)** — server — loopback guard (Host and socket)
  - Surfaced by: Section 3 D10
  - Files: `server/feed-plugin.ts`, `server/feed-plugin.test.ts`
  - Verify: matrix test; manual `vp dev --host` plus LAN curl with `Host: localhost` returns 403
- [ ] **T6 (P2, human: ~2h / CC: ~15min)** — server — seat table (2.4)
  - Surfaced by: BUILD_TODO 2.4
  - Files: `server/feed-plugin.ts`, `server/feed-plugin.test.ts`
  - Verify: desk kept after an earlier agent leaves; snapshot carries the table
- [ ] **T7 (P1, human: ~6h / CC: ~35min)** — office — state machine, hold-down and invariant test
  - Surfaced by: Section 1 D7, D8, Step 0 D5
  - Files: `src/office/machine.ts`, `src/office/machine.test.ts`
  - Verify: `vp test`; markers `gstack-shortcut(dec-R1)` and `(dec-R2)` present; hold-down and fuzz invariants pass
- [ ] **T8 (P2, human: ~2h / CC: ~15min)** — office — seeded identity
  - Surfaced by: BUILD_TODO 3.2
  - Files: `src/office/identity.ts`, `src/office/identity.test.ts`
  - Verify: `vp test`; 16 projects give 16 distinct pairs; stable across reloads
- [ ] **T9 (P3, human: ~30min / CC: ~5min)** — docs — amend BUILD_TODO, design doc and diagram
  - Surfaced by: P23-DOCS, P23-SCOPE-N, Stale Diagram Audit
  - Files: `BUILD_TODO.md`, `docs/designs/office-agents-isometric-office.md`
  - Verify: BUILD_TODO 2.1 and 3.1 mention D3, D7, D8; `vp check`

Order: T1, then lane A (T2, T3, T4, T5, T6; `feed-plugin.ts` is shared, so T4 to T6 run one after another) and lane B (T7, T8) in parallel after T1; T9 last.

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                         |
  | System Audit         | no server/ yet; 91 real Agent launches, 33 async |
  | Step 0               | SELECTIVE EXPANSION; D2 to D5 all added     |
  | Section 1  (Arch)    | 2 issues found, 2 decisions                 |
  | Section 2  (Errors)  | 13 error paths mapped, 10 GAPS (all remedied)|
  | Section 3  (Security)| 7 issues found, 1 High severity             |
  | Section 4  (Data/UX) | 11 edge cases mapped, 2 unhandled           |
  | Section 5  (Quality) | 2 issues found                              |
  | Section 6  (Tests)   | Diagram produced, 3 gaps                    |
  | Section 7  (Perf)    | 1 issue found                               |
  | Section 8  (Observ)  | 1 gap found                                 |
  | Section 9  (Deploy)  | 1 risk flagged                              |
  | Section 10 (Future)  | Reversibility: 4/5, debt items: 3           |
  | Section 11 (Design)  | SKIPPED (no UI scope)                       |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (5 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 14 rows, 0 CRITICAL GAPS after remedies     |
  | Failure modes        | 9 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 0 items proposed (1 removal in T1)          |
  | Scope proposals      | 4 proposed, 4 accepted                      |
  | CEO plan             | written (~/.gstack/projects/office-agents/ceo-plans/2026-10-02-phase-2-3-feed-logic.md) |
  | Outside voice        | codex disabled                              |
  | Lake Score           | N/A (no question scored for coverage)       |
  | Diagrams produced    | 4 (system, state machine, data flow, deploy/rollback) |
  | Stale diagrams found | 1                                           |
  | Unresolved decisions | 0                                           |
  +====================================================================+
```

## Eng review (/plan-eng-review, 2026-10-02)

Target (fixed): this plan, `docs/designs/phase-2-3-ceo-review.md`, tasks T1 to T9 for BUILD_TODO Phase 2 and Phase 3 on branch `feat/phase-2-3`. The CEO sections above are the unchanged original plan; CEO decisions D1 to D12 are inputs, not reopened here (eng decisions are numbered E-D1 onward in this block; chat labels D1 onward).

### Scope Challenge

Complexity: about 17 changed files (11 new, 6 edited), 5 new modules. Findings: S1 [P2] (confidence 9/10) `tsconfig.node.json:22` `"include": ["vite.config.ts", "shared", "server", "src/css.test.ts", "src/design-md.ts"]`, so T2's `scripts/sanitize-fixtures.ts` is not type-checked. S2 [P3] (confidence 6/10) fixtures should be `.jsonl` so `vp check --fix` (staged hook) does not reformat them. Search check unavailable (Aside not ready); in-repo evidence only. TODOS cross-reference: the P1 "Event guard hardening" entry is covered by T1; M8 and M9 are independent.

Scope record: feature answers: none proposed (CEO scope D1 to D12 stands); structure: Smaller arrangement (D1 answer "Smaller arrangement"); accepted scope: sanitizer at `server/sanitize-fixtures.ts`, fixtures leak check as a case in `normalize.test.ts`, no `scripts/` folder, no tsconfig edit, no `server/fixtures.test.ts`, fixtures stored as `.jsonl`; all other T1 to T9 content unchanged; pending remedies: none yet. Scope Challenge result: scope accepted as-is.

### Decision ledger (eng review)

#### E1: Which transcript record signals "turn ended" (`done`)

Finding: 1, P1, confidence 8/10, design doc line 143 ("`system` record, subtype `turn_duration`") and this plan "Accepted scope" item 1 (`endsWithQuestion` from the last assistant text), reviewer: plan-eng-review.
Plan baseline: R2 approved (CEO-era D5): wave only on a trailing "?"; no approved rule names the record that ends a turn. Original proposal cites `turn_duration`.
Runtime evidence: 400 newest files, system subtypes: `stop_hook_summary` 394, `turn_duration` 186, `informational` 8; the 60 newest top-level files have only `stop_hook_summary` (56). Assistant `stop_reason`: `end_turn` top-level 458 and sidechain 369, `stop_sequence` 17 and 15. Whether `end_turn` always precedes the turn's last user-visible text is unknown (not probed).
Comparison grid:

| Commitment                         | Current (plan)           | A: end_turn (rec.)                                 | B: turn_duration                        | C: either, deduped             |
| ---------------------------------- | ------------------------ | -------------------------------------------------- | --------------------------------------- | ------------------------------ |
| Record that emits `done`           | unspecified              | top-level assistant `stop_reason: end_turn`        | `system` subtype `turn_duration`        | first of either per turn       |
| Source of `endsWithQuestion`       | last assistant text (R2) | same message's last text block                     | carried from previous assistant (state) | A or B source                  |
| Extra normalizer state             | per-file (D3)            | none for this signal                               | last assistant text per file            | last text plus per-turn dedupe |
| Works where `turn_duration` absent | unknown                  | yes                                                | no                                      | yes                            |
| Fixtures (D4) must include         | unspecified              | end_turn assistant lines                           | turn_duration lines                     | both                           |
| Subagent file `end_turn`           | unspecified              | not a `done` (completion comes from parent, D3/D7) | same                                    | same                           |

Question D2:
D2 — Which transcript record ends a turn?
Project/branch/task: office-agents, feat/phase-2-3, Section 1, task T3 (normalizer).
ELI10: The office needs to know when an agent finished its turn so it can sit idle or ask for you. The design says to look for a "turn_duration" system line. In your newest transcripts that line is missing; only the assistant message that stops with "end_turn" is always there, and that same message holds the final text we check for a question mark.
Stakes if we pick wrong: for sessions started from the desktop app, no turn ever ends, so nobody goes idle and no question ever waves.
Recommendation: A because it is the one signal present in every flow and carries the question text in the same line, so no extra state.
Note: options differ in kind, not coverage — no completeness score.
Header: Turn-end signal
Options:
A) Assistant end_turn (recommended)
Top-level assistant record with `stop_reason: end_turn` emits `done`; `endsWithQuestion` from that message's last text block; `turn_duration` ignored; subagent `end_turn` is not a `done`; fixtures include end_turn lines. Effort S (human ~1h / CC ~10min), risk low, reuses the D3 stateful normalizer. ✅ Works in every observed flow. ✅ No cross-record text carrying. ❌ If a future version stops writing `stop_reason`, drift counter (D12) is the only alarm.
B) turn_duration only
Emit `done` on `system/turn_duration` and carry the previous assistant's last text for the question check. Effort S, risk high (absent in the 60 newest files), reuses nothing new. ✅ Matches the design's original evidence. ✅ Explicit turn boundary. ❌ Desktop and SDK sessions never end a turn.
C) Either record, deduped
Emit `done` on whichever arrives first per turn, dedupe by turn. Effort M (human ~3h / CC ~25min), risk medium (dedupe key unverified), no reuse. ✅ Survives either format change. ❌ Extra state, extra fixtures and a dedupe rule nobody has probed.

State: approved
Actual answer: A) Assistant end_turn (D2 answer)
Accepted scope: top-level assistant `stop_reason: end_turn` emits `done`; `endsWithQuestion` from that message's last text block (trailing whitespace stripped, one shared predicate); `system/turn_duration` ignored; a subagent file's `end_turn` is not a `done`; D4 fixtures include `end_turn` assistant lines. Amends T3 and the CEO accepted-scope item 1; no other change.
History: none

#### E2: When a silent agent leaves (machine liveness)

Finding: 2, P1, confidence 8/10, `shared/events.ts` (AgentEvent kinds: agent_started, working, waiting_on_subagents, needs_attention, handoff, done; no "left" kind) and this plan "Accepted scope" item 4 ("Handle ENOENT as the agent leaving"; transcript files are not deleted when a session ends), reviewer: plan-eng-review.
Plan baseline: R2 approved: a top-level agent "walks out after an idle timer since last activity" (value tuned at build time). Nothing approved for an agent whose session died while `working`, `waiting-on-subagents` or in `attention`. Server mtime window value: unspecified.
Runtime evidence: transcripts are never deleted by a session ending (1,311 files, 665 MB on this machine). Unknown: how often sessions die mid-tool (not probed).
Comparison grid:

| Commitment                                                   | Current (plan) | A: two-tier (rec.)                                                                                  | B: one expiry                 | C: attention never expires   |
| ------------------------------------------------------------ | -------------- | --------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------- |
| `idle` leaves                                                | R2 idle timer  | R2 idle timer (unchanged)                                                                           | R2 idle timer                 | R2 idle timer                |
| `arriving`, `working`, `waiting-on-subagents` with no events | never leave    | leave after `TUNING.staleMs` (30 min) of silence, except while an unresolved subagent launch exists | leave after `TUNING.staleMs`  | leave after `TUNING.staleMs` |
| `attention` with no events                                   | never leaves   | leaves after `TUNING.attentionStaleMs` (4 h)                                                        | leaves after `TUNING.staleMs` | never leaves                 |
| New event for an expired agent                               | unspecified    | agent re-arrives (new `agent_started`)                                                              | same                          | same                         |
| Server mtime window for tracked files                        | unspecified    | `attentionStaleMs` (4 h), active set stat every 1 s                                                 | `staleMs`                     | unbounded for attention      |
| Question or permission wait lost while user away             | n/a            | after 4 h only                                                                                      | after 30 min                  | never                        |
| Dead session shows a wave                                    | forever        | up to 4 h                                                                                           | up to 30 min                  | until the browser reloads    |

Question D3:
D3 — When does an agent that went silent leave the office?
Project/branch/task: office-agents, feat/phase-2-3, Section 1, tasks T4 (feed window) and T7 (machine).
ELI10: Sessions never delete their transcript, so the office cannot tell "finished" from "died" from "waiting for you". Today only an idle agent has a leave timer. A session that died mid-task would work or wave forever. A time-out fixes that, but the same time-out would also remove an agent that really is waiting for you while you are away.
Stakes if we pick wrong: ghosts that wave forever, or a real question that silently disappears while you are at lunch.
Recommendation: A because it keeps real waits visible for hours while clearing ghosts, and both limits are tunable.
Note: options differ in kind, not coverage — no completeness score.
Header: Silent agents
Options:
A) Two-tier expiry (recommended)
`TUNING.staleMs` (30 min) removes silent arriving, working and coffee agents; `TUNING.attentionStaleMs` (4 h) removes silent waving agents; a new event re-arrives them; the server window is 4 h by modification time; machine test covers each expiry. Effort S (human ~2h / CC ~15min), risk low, reuses `TUNING` and the fake clock. ✅ Real questions stay for 4 h, ghosts clear. ✅ One rule in the pure machine, easy to test. ❌ Two guessed numbers to calibrate; a wait longer than 4 h disappears.
B) One expiry for every state
`TUNING.staleMs` (30 min) removes every silent agent including waving ones; server window 30 min. Effort S, risk medium, reuses `TUNING`. ✅ Simplest rule, smallest window. ❌ A question you have not answered in 30 minutes vanishes, the exact case the wave exists for.
C) Waves never expire
Only non-waving silent agents expire; waving agents stay until the browser reloads. Effort S, risk medium, reuses `TUNING`. ✅ Never loses a real wait. ❌ Every killed mid-tool session waves until you reload the page.

State: approved
Actual answer: A) Two-tier expiry (D3 answer)
Accepted scope: `TUNING.staleMs` (30 min) expires silent `arriving`, `working` and `waiting-on-subagents` agents (not while an unresolved subagent launch exists); `TUNING.attentionStaleMs` (4 h) expires silent `attention`; a new event re-arrives an expired agent; the server tracks files modified within `attentionStaleMs` (active set stat every 1 s, tree walk every 5 s); machine tests cover each expiry. R2 idle timer unchanged. Amends T4 and T7.
History: none

#### E3: What cold start shows for sessions that already finished

Finding: 3, P1, confidence 8/10, this plan "Accepted scope" item 1 ("`agent_started` is synthesized from the first parsed line of an unseen session or agent") combined with E2's 4 h server window, reviewer: plan-eng-review.
Plan baseline: CEO D3/D4 approved synthesizing `agent_started` on first sight; design Performance finding 1 "derive state from the last bytes"; no approved rule says what a file that already finished produces. Window: 4 h (E2, D3 answer).
Runtime evidence: files modified in the last 4 h: 92 subagent files, 88 ending in assistant `end_turn`, 3 in a user record, 1 in an assistant record without a stop reason; 6 top-level files, 5 ending in `end_turn`, 1 in `tool_use`. Last record read from the final 400 KB of each file.
Comparison grid:

| Commitment                                                   | Current (plan)        | A: skip finished (rec.)                                 | B: short subagent window         | C: show all                   |
| ------------------------------------------------------------ | --------------------- | ------------------------------------------------------- | -------------------------------- | ----------------------------- |
| Subagent file whose last record is `end_turn`                | arrives (synthesized) | nothing emitted                                         | arrives unless older than 10 min | arrives (about 88 of 92 here) |
| Top-level file ending in `end_turn`, last text ends with "?" | arrives               | `agent_started` plus `done` (attention, expires per E2) | arrives                          | arrives                       |
| Top-level file ending in `end_turn`, no "?"                  | arrives (idle)        | nothing emitted                                         | arrives                          | arrives                       |
| Unfinished file (tool_use, user record)                      | arrives, working      | arrives, working                                        | arrives                          | arrives                       |
| Applies at                                                   | n/a                   | first sight of any file (cold start or newly seen file) | cold start only                  | n/a                           |
| Normalizer state                                             | per-file (D3)         | one `finishedAtFirstSight` flag per file                | window constant                  | none                          |

Question D4:
D4 — What should a cold start show for sessions that already finished?
Project/branch/task: office-agents, feat/phase-2-3, Section 1, tasks T3 (normalizer) and T4 (tailer window).
ELI10: When `vp dev` starts, it reads the last bytes of every recently touched transcript. With the 4 hour window from the last decision, that is 92 subagent files, and 88 of them already finished. Each would walk into the office, sit down and leave. A finished session that ended on a question is different: that one still needs you.
Stakes if we pick wrong: the first screen is a crowd of ghosts, or a session that asked you something is missing.
Recommendation: A because it keeps what is alive or waiting on you and drops what is already done.
Note: options differ in kind, not coverage — no completeness score.
Header: Cold start
Options:
A) Skip finished files (recommended)
At first sight of a file whose last record is `end_turn`: a subagent file emits nothing; a top-level file emits `agent_started` plus `done` only when its last text ends with a question; unfinished files arrive normally; fixtures and a test cover each case. Effort S (human ~2h / CC ~15min), risk low, reuses the D2 end_turn rule and per-file state. ✅ Cold start shows only live or waiting agents. ✅ One flag per file. ❌ A finished session that did not ask anything is invisible until its next activity.
B) Short window for subagent files
Subagent files only count if modified within 10 minutes; top-level files keep the 4 h window and everything arrives. Effort S, risk medium, no reuse. ✅ Easy to explain. ❌ Subagents that finished 5 minutes ago still appear as ghosts, and finished top-level sessions still sit at desks.
C) Show everything
Keep the plan as written: every tracked file arrives. Effort S (zero implementation), risk high, no reuse. ✅ No new rule. ❌ About 88 ghost subagents on the first screen, so the 12-agent success criterion fails at load.

State: approved
Actual answer: A) Skip finished files (D4 answer)
Accepted scope: at first sight of a file (cold start or newly seen), if its last record is `end_turn`: a subagent file emits nothing; a top-level file emits `agent_started` plus `done` only when its last text ends with a question; unfinished files arrive normally; one `finishedAtFirstSight` flag per file; fixtures and a test per case. Amends T3 and T4.
History: none

### Section 2 (Code quality) notes without decisions

`isAgentEvent` and the new `parseAgentEvent` (T1) both walk the SPEC table; implement `isAgentEvent` as `parseAgentEvent(value) !== null` so one code path exists (same behavior as the approved D2, not a new choice). The shared trailing-`?` predicate lives in `server/normalize.ts` and `server/sanitize-fixtures.ts` imports it (2 proposed callers, one destination, no new file). `feed-plugin.ts` stays one file with exported pure helpers (CEO Section 5). Register the plugin inside `lazyPlugins(() => [react(), officeFeed()])` in `vite.config.ts:33`.

#### E4: Where the cross-boundary stale limits live

Finding: 4, P1, confidence 8/10, E2 accepted scope ("the server tracks files modified within `attentionStaleMs`") and CEO item 7 (`TUNING` is one exported object in `src/office/machine.ts`), `tsconfig.node.json:22` (`"include": ["vite.config.ts", "shared", "server", ...]`), reviewer: plan-eng-review.
Plan baseline: `TUNING` lives in `src/office/machine.ts` (T4/T12 approved); server window value now equals `attentionStaleMs` (E2). Nothing approved says how `server/` gets that number.
Runtime evidence: `tsconfig.node.json` (module nodenext, lib ES2023, no DOM) does not include `src/office`; `tsconfig.app.json` includes `src` and `shared`. A server import of `src/office/machine.ts` would pull the client file into the node project.
Comparison grid:

| Commitment                                         | Current (plan)      | A: shared/tuning.ts (rec.)                        | B: server constant plus cross-check                  | C: duplicated literal   |
| -------------------------------------------------- | ------------------- | ------------------------------------------------- | ---------------------------------------------------- | ----------------------- |
| Where `STALE_MS`, `ATTENTION_STALE_MS` are defined | machine.ts `TUNING` | `shared/tuning.ts`; machine `TUNING` spreads them | `server/feed-plugin.ts`, machine keeps its own       | both files, same number |
| Server window source                               | unspecified         | imports `shared/tuning.ts`                        | own `FEED_WINDOW_MS` (4 h)                           | own literal             |
| Drift protection                                   | none                | single definition                                 | test imports machine.ts across the node/app boundary | none                    |
| New files                                          | 0                   | 1 (`shared/tuning.ts`, about 10 lines)            | 0                                                    | 0                       |
| Single exported `TUNING` object in machine.ts      | approved            | kept (spreads the shared values)                  | kept                                                 | kept                    |

Question D5:
D5 — Where do the shared time limits live?
Project/branch/task: office-agents, feat/phase-2-3, Section 2, tasks T4 (feed window) and T7 (machine).
ELI10: The client machine and the server tailer both need the same two numbers: how long an agent may stay silent. If each file keeps its own copy, they drift apart: the server could stop tracking a file while the machine still waits for it. The server must not import the client file, because the two folders are compiled by different TypeScript projects.
Stakes if we pick wrong: a waving agent disappears from a reloaded page while the old tab still shows it, or a config edit changes one side only.
Recommendation: A because a ten-line shared file is the standard boring fix and both configs already include `shared/`.
Note: options differ in kind, not coverage — no completeness score.
Header: Shared limits
Options:
A) Shared tuning file (recommended)
New `shared/tuning.ts` exporting `STALE_MS` and `ATTENTION_STALE_MS`; `machine.ts` `TUNING` spreads them; the server window imports them; a test asserts the machine uses the shared values. Effort S (human ~1h / CC ~10min), risk low, reuses `shared/` already in both tsconfigs. ✅ One definition, no drift. ✅ Respects the node/app boundary. ❌ One extra file (about 16 files in total).
B) Server constant plus cross-check
Server keeps `FEED_WINDOW_MS` (4 h); a test compares it with `TUNING.attentionStaleMs`. Effort S, risk medium (test imports across tsconfig projects), no reuse. ✅ No new file. ❌ The check lives in a test that has to import client code into the node project.
C) Duplicate the number
Write 4 h in both places with a comment. Effort S (zero extra implementation), risk medium, no reuse. ✅ Simplest. ❌ Nothing catches a one-sided edit.

State: approved
Actual answer: A) Shared tuning file (D5 answer)
Accepted scope: new `shared/tuning.ts` exporting `STALE_MS` and `ATTENTION_STALE_MS`; `machine.ts` `TUNING` spreads them (still one exported object); the server window imports them; a test asserts the machine uses the shared values. About 16 files in total. Amends T4 and T7.
History: none

### Section 3 (Test review): required proof carried forward

Approved behavior, tests required without a question: E1 (end_turn `done`, subagent end_turn not a `done`, `turn_duration` ignored), E2 (each expiry tier, re-arrival, no expiry with an unresolved subagent), E3 (finished subagent skipped, finished top-level with "?" shown, unfinished arrives), E4 (machine uses shared values), D12 (`/__office/status` counts and 403 from a non-loopback address). Fact correction: `shared/events.test.ts` has no case accepting an empty id or negative `ts`, so D11 changes no existing test.

#### E5: How to protect the existing dev server, build and tests from the new plugin

Finding: 5, P1, confidence 8/10, `vite.config.ts:33` (`plugins: lazyPlugins(() => [react()]),`) and plan item 4 (register the plugin in `vite.config.ts`), reviewer: plan-eng-review. IRON RULE regression risk.
Plan baseline: T4 verify says "`vp test`; `curl` events and status". No approved check that unrelated requests, `vp build` and `vp test` stay unchanged.
Runtime evidence: `vite.config.ts` is loaded by `vp dev`, `vp build`, `vp test` and `vp check`; 5 existing test files; no test starts a dev server. Behavior at risk: `/` and `/?art` (the Phase 0/1 art sheet), `/@vite/client`, `/src/main.tsx` passing through; a plugin import error breaking every command.
Behavior to preserve: every request outside `/__office/` is served exactly as before; `vp build` and `vp test` outputs are unaffected. Intended differences: `/__office/events` and `/__office/status` exist.
Comparison grid:

| Commitment                                    | Current (plan) | A: unit level                                | B: manual only       | C: unit plus real server (rec.)                                                  |
| --------------------------------------------- | -------------- | -------------------------------------------- | -------------------- | -------------------------------------------------------------------------------- |
| Plugin applies only in dev                    | untested       | test `apply === "serve"`                     | manual `vp build`    | same test plus `vp build` exit 0 in T4 verify                                    |
| Unrelated URLs pass through                   | untested       | fake req/res: `next()` once, nothing written | manual browser check | in-process Vite `createServer` (ephemeral port): `/` and `/?art` return 200 HTML |
| `/__office/status` and 403 over a real socket | unit only      | fake `remoteAddress`                         | `curl` by hand       | real request from loopback returns 200; fake non-loopback returns 403            |
| SSE first frame is a snapshot                 | unit only      | unit                                         | `curl -N` by hand    | real request reads one `data:` frame                                             |
| Effort (human / CC)                           | n/a            | ~1h / ~10min                                 | ~10min / ~2min       | ~4h / ~30min                                                                     |

Question D6:
D6 — How do we protect the existing dev server from the new plugin?
Project/branch/task: office-agents, feat/phase-2-3, Section 3, task T4 (plugin registration in vite.config.ts:33).
ELI10: Registering the feed plugin touches the one file every command loads: `vp dev`, `vp build`, `vp test`, `vp check`. A mistake there would break the art page you already see at `/?art`, or every test at once. Nothing currently checks that. The question is how hard to check.
Stakes if we pick wrong: the existing pages or the build quietly break while only the new feed is tested.
Recommendation: C because a real in-process server test also covers the middleware order and the socket-address guard that fake requests cannot.
Completeness: A=7/10, B=3/10, C=9/10
Header: Plugin regression
Options:
A) Unit-level checks
Test `apply === "serve"` and a fake request stack that passes unrelated URLs to `next()` once; `vp build` exit 0 in T4 verify. Effort S (human ~1h / CC ~10min), risk low, reuses the T4 test file. ✅ Fast, no ports. ✅ Catches a plugin that swallows requests. ❌ Cannot see real middleware order or real socket addresses.
B) Manual check only
Run `vp dev` and `vp build` by hand before merging. Effort S (human ~10min / CC ~2min), risk high, no reuse. ✅ No test code. ✅ Matches the T4 wording. ❌ Nothing catches the next regression; the art page is never checked automatically.
C) Unit checks plus a real in-process server test (recommended)
A, plus a Vite `createServer` test on an ephemeral port asserting `/` and `/?art` return 200, status returns 200 from loopback and 403 for a fake non-loopback address, and the events endpoint sends a snapshot frame. Effort M (human ~4h / CC ~30min), risk low, reuses the `scanOnce()` seam and fixtures. ✅ Proves ordering and the guard end to end. ✅ Guards the existing pages. ❌ Binds a local port in tests and adds a slower test.

State: approved
Actual answer: C) Unit checks plus a real in-process server test (D6 answer)
Accepted scope: test `apply === "serve"`; fake request stack passes unrelated URLs to `next()` once; `vp build` exit 0 in T4 verify; plus a Vite `createServer` test on an ephemeral port asserting `/` and `/?art` return 200, `/__office/status` returns 200 from loopback and 403 for a fake non-loopback address, and `/__office/events` sends a snapshot frame. Amends T4.
History: none

Approval readiness: PASS. Checked E1 (D2 answer "Assistant end_turn"), E2 (D3 answer "Two-tier expiry"), E3 (D4 answer "Skip finished files"), E4 (D5 answer "Shared tuning file"), E5 (D6 answer "Unit checks plus a real in-process server test"), and Scope Challenge structure (D1 answer "Smaller arrangement"). Outside voice disabled. No other change is accepted. Approval is not implementation or verification: nothing below is built.

### Section 4 (Performance) and Final planning decisions

Performance: 1 issue, P3, confidence 7/10: cold start reads the tail of every file in the 4 h window; bound it at 4 MB per file (window doubling from D9), sequential, one log line with total bytes and milliseconds. Active-set stat about 100 per second, ring and dedupe sets bounded, machine O(1) per event: no issue. TODOs: none proposed (calibrating staleMs, attentionStaleMs and episodeHoldMs is covered by R2's "tuned at build" and Phase 4 use). Outside voice: codex disabled (`codex_reviews=disabled`), logged; no native replacement run.

### Eng review outputs

#### NOT in scope

- Origin check, failed-agent attention, hooks adapter, paper hover text, LAN viewing: unchanged from the CEO plan (deferred or rejected there).
- A Playwright E2E for cold start, SSE reconnect and replace-not-merge on reconnect: Phase 5 (R4); this review adds only the in-process server test (E5).
- Calibrating the three guessed time limits: Phase 4 manual use.

#### What already exists

`shared/events.ts` and its 22 `isAgentEvent` cases are reused; `parseAgentEvent` is the core and `isAgentEvent` delegates to it (one code path). Vite's middleware stack, `createServer` and `apply: "serve"` provide the dev-only hook. `vite-plus/test` is the only test runner. `src/office/poses.ts` already maps states to poses. Nothing exists yet in `server/`, `shared/tuning.ts`, `machine.ts` or `identity.ts`.

#### Diagrams

```
COLD START (E1, E3)                       SILENT AGENT (E2, E4)
 tail 400 KB (cap 4 MB) of each file       shared/tuning.ts: STALE_MS 30 min, ATTENTION_STALE_MS 4 h
   | last record                            server window = ATTENTION_STALE_MS (mtime)
   +- subagent, end_turn --> nothing        machine: arriving|working|coffee -silent STALE_MS-> leaving
   +- top-level, end_turn, "?" --> started  machine: attention -silent ATTENTION_STALE_MS-> leaving
   |      + done(endsWithQuestion)          any new event --> re-arrives
   +- top-level, end_turn, no "?" --> nothing
   +- tool_use / user --> started, working  PLUGIN REGRESSION GUARD (E5)
 TURN END: top-level assistant end_turn      vite.config.ts --> officeFeed() { apply: "serve" }
   --> done(endsWithQuestion, same line)      non-/__office URL --> next() once, nothing written
                                              /__office/status loopback 200, non-loopback 403
```

#### Failure modes

| Codepath   | Failure                         | Test?            | Handled?                 | User sees                 |
| ---------- | ------------------------------- | ---------------- | ------------------------ | ------------------------- |
| normalize  | `end_turn` stops being written  | Y (drift reason) | log plus status endpoint | quiet office, diagnosable |
| cold start | 88 finished subagents arrive    | Y (E3)           | skipped at first sight   | clean first screen        |
| machine    | killed session waves forever    | Y (E2 expiry)    | leaves after 4 h         | wave clears               |
| shared     | server and machine limits drift | Y (E4)           | single definition        | consistent                |
| plugin     | swallows `/` or `/?art`         | Y (E5)           | next() pass-through      | art page still served     |
| plugin     | breaks `vp build`               | Y (E5 verify)    | `apply: "serve"`         | build unaffected          |

0 critical gaps (every row has a test and handling).

#### Worktree parallelization strategy

| Step                                                  | Modules touched         | Depends on |
| ----------------------------------------------------- | ----------------------- | ---------- |
| S1 events, tuning                                     | shared/                 | none       |
| S2 normalizer, sanitizer, fixtures                    | server/                 | S1         |
| S3 feed plugin, guard, seats, status, regression test | server/, vite.config.ts | S2         |
| S4 machine, identity                                  | src/office/             | S1         |

Lane A: S1, then S2, then S3 (shared/, server/). Lane B: S4 (src/office/), starts after S1 lands. Launch A; after S1 merges, start B in a worktree. Merge both. Conflict flag: `shared/tuning.ts` is written once in S1, then only read by S3 and S4.

#### Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above. They amend CEO tasks T1 to T9 (ids ET1 to ET7 avoid a clash). Estimates: tests ~50x, features ~30x, docs ~20x.

- [ ] **ET1 (P1, human: ~3h / CC: ~20min)** — server — end_turn `done` and cold-start skip in the normalizer
  - Surfaced by: Section 1 E1, E3
  - Files: `server/normalize.ts`, `server/normalize.test.ts`, `server/fixtures/*.jsonl`
  - Verify: `vp test`; `done` from top-level `end_turn`, subagent `end_turn` emits no `done`, `turn_duration` ignored; a finished subagent emits nothing at first sight; a finished top-level with "?" emits started plus done
- [ ] **ET2 (P1, human: ~3h / CC: ~20min)** — shared and office — shared tuning file and machine expiry tiers
  - Surfaced by: Section 1 E2, Section 2 E4
  - Files: `shared/tuning.ts`, `src/office/machine.ts`, `src/office/machine.test.ts`
  - Verify: `vp test`; each expiry tier, re-arrival, no expiry with an unresolved subagent; a test asserts `TUNING` uses the shared values
- [ ] **ET3 (P1, human: ~3h / CC: ~20min)** — server — tracked-file window from `ATTENTION_STALE_MS`, 4 MB cold-start cap, status endpoint tests
  - Surfaced by: Section 1 E2, Section 4 performance, CEO D12
  - Files: `server/feed-plugin.ts`, `server/feed-plugin.test.ts`
  - Verify: `vp test`; a file outside the window is not tracked; a line over the cap bumps drift; `/__office/status` returns 200 on loopback and 403 otherwise
- [ ] **ET4 (P1, human: ~4h / CC: ~30min)** — server — plugin regression tests (`apply: "serve"`, pass-through, real `createServer`)
  - Surfaced by: Section 3 E5 (IRON RULE)
  - Files: `server/feed-plugin.test.ts`, `vite.config.ts`
  - Verify: `vp test`; `/` and `/?art` return 200; the events endpoint sends a snapshot frame; `vp build` exits 0
- [ ] **ET5 (P2, human: ~1h / CC: ~10min)** — server — sanitizer under `server/`, leak check inside `normalize.test.ts`, fixtures as `.jsonl`
  - Surfaced by: Scope Challenge D1, S1, S2
  - Files: `server/sanitize-fixtures.ts`, `server/normalize.test.ts`
  - Verify: `vp check` type-checks the sanitizer; the leak check finds no non-allowlisted text
- [ ] **ET6 (P2, human: ~1h / CC: ~10min)** — shared — `isAgentEvent` delegates to `parseAgentEvent`
  - Surfaced by: Section 2 DRY note
  - Files: `shared/events.ts`, `shared/events.test.ts`
  - Verify: `vp test`; all 22 existing cases pass unchanged
- [ ] **ET7 (P3, human: ~30min / CC: ~5min)** — docs — record E1 to E5 in BUILD_TODO, correct stale evidence
  - Surfaced by: Section 1 E1 (design doc line 143 treats `turn_duration` as universal), Section 3 fact correction (D11 changes zero existing tests; the CEO option text said two)
  - Files: `BUILD_TODO.md`, `docs/designs/office-agents-isometric-office.md`
  - Verify: BUILD_TODO 2.1, 2.2 and 3.1 mention end_turn, cold-start skip and expiry tiers; `vp check`

#### Unresolved decisions

None in this review.

#### Suppressed findings (confidence 3 to 4, appendix)

- (confidence 4/10) An SSE heartbeat comment might be needed to detect dead clients behind proxies; unverified, loopback only, and `close` handling (D9) covers local use.
- (confidence 4/10) `stop_sequence` stop reasons (17 top-level) might be turn ends; unverified, the drift counter would show it.

#### Completion summary

- Step 0: Scope Challenge — scope accepted as-is (smaller arrangement, D1)
- Architecture Review: 3 issues found
- Code Quality Review: 2 issues found
- Test Review: diagram produced, 9 gaps identified (7 required-proof rows, 2 IRON RULE gaps)
- Performance Review: 1 issue found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 items proposed to user
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: codex, disabled
- Parallelization: 2 lanes, 1 parallel / 1 sequential
- Lake Score: 0/1 (D6 was the only coverage-scored choice; its best option was 9/10, no 10/10 option was offered)

## GSTACK REVIEW REPORT

| Review         | Trigger               | Why                             | Runs | Status                       | Findings                            |
| -------------- | --------------------- | ------------------------------- | ---- | ---------------------------- | ----------------------------------- |
| CEO Review     | `/plan-ceo-review`    | Scope & strategy                | 1    | CLEAR                        | 4 proposals, 4 accepted, 0 deferred |
| Outside Review | codex, plan review    | Independent 2nd opinion         | 2    | disabled                     | no completed external review        |
| Eng Review     | `/plan-eng-review`    | Architecture & tests (required) | 1    | ISSUES OPEN (not yet logged) | 15 issues mapped, 0 critical gaps   |
| Design Review  | `/plan-design-review` | UI/UX gaps                      | 0    | —                            | —                                   |
| DX Review      | `/plan-devex-review`  | Developer experience gaps       | 0    | —                            | —                                   |

**OUTSIDE COVERAGE:** codex, plan-review phase: disabled (`codex_reviews=disabled`) in both the CEO and eng reviews; no completed external review and no native replacement. The CEO spec reviewer (3 native runs) is spec review, not outside coverage.
**VERDICT:** CEO CLEARED. Eng review ISSUES OPEN (mapped work: 15 issues, all with approved remedies, 0 unresolved decisions); eng review required until tasks ET1 to ET7 land and a re-run is clean.

NO UNRESOLVED DECISIONS
