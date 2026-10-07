# T06 Validate id format in parseAgentEvent: CEO review

Branch: `t06-validate-agent-event-id` (from main 1714f06, v0.9.3.1) | Mode: SELECTIVE EXPANSION | Depth: implementation-ready | Date: 2026-10-07

Source: TODOS.md T06. Review only; no code was changed.

## Premise

Ids reach keys, logs and the DOM (TODOS T06). Today any non-empty string up to 512 chars is an id (`shared/events.ts:78-80`, `parseField`). The T03 census found 2719 of 2719 agent, session and tool ids are 17-char (agent) `[A-Za-z0-9_-]`. Do-nothing cost: a future Claude Code id format change reaches keys, logs and the DOM unchecked.

Evidence vs inference:

- Evidence: guard spec `shared/events.ts:70-120`; census regex `server/census-transcripts.ts:44` (`CONSERVATIVE_ID`); `hooks-adapter.ts:101` returns `[]` on a rejected event with no signal; `normalize.ts:136` counts a rejected event as drift; `hook-route.ts:62-67` has a throttled `hookLog`.
- Evidence: `projectId` is a directory name (`feed-plugin.ts:418`, `hooks-adapter.ts:49`); the census never measured it.
- Inference: session and tool id lengths stay under 128 (UUID is 36); not measured, census has only an agent-id length histogram.

## Decision ledger

| ID / owner                                              | Contract and evidence                                                                                                                                          | Current                        | Proposed            | Status                                      | Approval                                        |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------- | ------------------------------------------- | ----------------------------------------------- |
| D1 / mode                                               | Review posture                                                                                                                                                 | none                           | SELECTIVE EXPANSION | approved                                    | user answer to D1                               |
| D4 / `shared/events.ts`                                 | `ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/` on agentId, parentAgentId, fromAgentId, toAgentId, sessionId, tool.id, episodeId. projectId stays any non-empty string | any non-empty string up to 512 | pattern above       | approved                                    | user answer to D4 ("Strict ids, lax projectId") |
| D2 / `shared/events.ts`, `server/census-transcripts.ts` | One exported `ID_PATTERN`; census imports it, drops its own `CONSERVATIVE_ID`                                                                                  | two copies possible            | one export          | approved                                    | user answer to D2 (Add)                         |
| D3 / `server/hooks-adapter.ts`, `server/hook-route.ts`  | A hook payload rejected by the guard is logged through the existing throttled `hookLog`, reason only, never the id value                                       | silent `[]`                    | logged reason       | approved (mechanism pending, see Section 2) | user answer to D3 (Add)                         |
| D5 / `server/census-transcripts.ts`                     | Census prints max id length per kind (agent, session, tool), counts only                                                                                       | agent-id histogram             | add `idMaxLength`   | approved                                    | user answer to D5 (Add)                         |

## Accepted scope

1. D4 core rule (above).
2. D2 shared `ID_PATTERN`.
3. D3 hook reject signal.
4. D5 census max id length. Run it once on the real transcript root before merging; if any max exceeds 128, stop and report, do not widen silently.

NOT in scope: strict `projectId` (unmeasured, would silently hide odd-named projects); changing `MAX_STRING_LENGTH`; any UI.

## Review sections

**1 Architecture.** One guard, two producers, no new component. Coupling added: census imports from `shared/` (justified, removes drift). Rollback: revert the commit, reversibility 5. No flag needed.

```
transcript line -> normalize.ts -----------\
                                            +-> parseAgentEvent (SPEC + ID_PATTERN) -> ring -> ws -> machine/DOM
hook POST -> hook-route -> hooks-adapter --/
   reject: normalize counts drift | hooks-adapter now reports reason -> hookLog (throttled)
census ----- imports ID_PATTERN ----- reports idMaxLength
```

**2 Error and rescue map.**

| Codepath                | What can go wrong                                  | Handled                                                                                        |
| ----------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `parseField` string id  | id has `.`, space, `/`, unicode, or over 128 chars | returns INVALID, event is null, normalize counts drift (existing)                              |
| `hookToEvents`          | same, from a hook payload                          | currently `[]` silently; **GAP**, D3 fixes: log reason through `hookLog`                       |
| `idOf` in hooks-adapter | accepts up to 512 chars                            | **GAP**: should use `ID_PATTERN` so the reject reason is "bad id" and not a later generic drop |

Pending mechanism (implementation owner decides, non-blocking): `hookToEvents` gets an optional `onReject(reason)` in its context, or returns a result object. Log text must carry the reason only, never an id value. Existing `parseAgentEvent` stays non-throwing (`try/catch` at `events.ts:167`).

**3 Security.** No new surface; input validation tightens at the one guard both producers use. Threat: hook payload with crafted ids (token-protected localhost route) containing path or markup characters; mitigated by D4 for all id fields except `projectId`. Residual: `projectId` can still carry any 512-char string into keys and logs (Low likelihood, Low impact; accepted via D4). No secrets, no new dependencies.

**4 Data flow.** INPUT -> parseField -> out. Shadow paths: nil (`undefined` field is INVALID unless optional), empty (`{1,128}` rejects), wrong type (INVALID), too long (129 rejected), unicode (rejected by ASCII class). Each is a test row in Section 6. No async ordering concern: the guard is a pure synchronous function.

**5 Code quality.** One regex constant and `id`/`nullableId` specs gain a `pattern`; keeps FieldSpec the single place. Duplication removed (census). No branching increase. Over-engineering risk: none; keep `ID_PATTERN` a plain RegExp.

**6 Tests.**

| Behavior                                                                                                  | Test                                                            | Wrong result it rejects                         |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| each id field rejects `.`, space, `/`, non-ASCII, empty, 129 chars                                        | `shared/events.test.ts` table over every id field in every kind | guard missing on one field (e.g. `fromAgentId`) |
| accepts 128 chars, 17-char agent id, UUID, `toolu_`-style id, 32-hex episodeId                            | same file                                                       | cap or class too tight                          |
| projectId accepts `-Users-x.y z`                                                                          | same file                                                       | D4 violated by over-strict projectId            |
| hook payload with bad `session_id` / `agent_id` returns `[]` and logs one reason, no id value in the line | `server/hooks-adapter.test.ts`, `server/hook-route.test.ts`     | silent drop; id leaked into log                 |
| flood of bad hook ids logs once per window                                                                | `hook-route.test.ts`                                            | log flood                                       |
| census reports `idMaxLength` per kind, counts only                                                        | `server/census-transcripts.test.ts`                             | D5 missing or printing values                   |
| census and guard share one pattern                                                                        | test imports `ID_PATTERN`                                       | drift                                           |

Risk to verify (UNKNOWN, builder must run `vp test` and `vp check`): existing fixtures in `server/*.test.ts`, `src/office/demo.test.ts`, `e2e/` may use ids outside the class (for example `sess:1`); fix fixtures, never relax the pattern. Hostile test: id of `a.b`, `../x`, `a b`, 129 `a`s through the real hook route.

**7 Performance.** One anchored regex per id field per event; no backtracking. Negligible.

**8 Observability.** D3 adds the missing hook-path signal; D5 adds the evidence number. Debuggability: a reject line names the reason and the field kind, not the value. Runbook: on "hook bad id" lines, run the census; compare `idMaxLength` and `idsFailingIdPattern` to the guard.

**9 Deployment.** Local developer tool, no migration. Rollout: ship with the tree. Post-deploy check: run the census on the real root, expect 0 non-conservative ids and all maxima at or below 128; open `?demo` and confirm agents appear (demo events pass the guard, `demo.test.ts:112`).

**10 Trajectory.** Debt: none added; `projectId` laxness is recorded debt, tracked as a follow-up only if a census ever measures it. Reversibility 5/5. Retrospective: D2, D3 and D5 were the right cherry-picks; each protects the silent-failure path T06 opens. 1-year question: obvious, one constant with a comment citing the census.

**11 Design.** SKIPPED (no UI scope).

## Outside voice

Not run. A second-model review of a one-regex change adds little; record as skipped, not passed.

## Approval readiness

PASS against D1, D2, D3, D4, D5. Open, non-blocking: D3 mechanism (implementation owner), fixture compatibility (UNKNOWN until `vp test` runs).

## Failure modes

| Failure                        | Test      | Handled                | User sees                  |
| ------------------------------ | --------- | ---------------------- | -------------------------- |
| Real session id over 128 chars | D5 census | stop and report        | nothing (caught pre-merge) |
| Fixture id outside class       | `vp test` | fix fixture            | nothing                    |
| Hook id rejected               | D3 test   | logged once per window | log line                   |
| projectId odd chars            | D4 test   | accepted by design     | agent appears              |

## GSTACK REVIEW REPORT

| Review        | Runs | Status  | Findings                                                                                                        |
| ------------- | ---- | ------- | --------------------------------------------------------------------------------------------------------------- |
| CEO Review    | 1    | clean   | 4 scope items accepted (D2, D3, D4, D5), 0 deferred, 0 skipped, 1 critical gap fixed in plan (silent hook drop) |
| Outside voice | 0    | skipped | not run                                                                                                         |

VERDICT: CEO review complete, approved scope ready to build on `t06-validate-agent-event-id`. Nothing was run or tested; fixture compatibility is unknown until `vp test`.

NO UNRESOLVED DECISIONS
