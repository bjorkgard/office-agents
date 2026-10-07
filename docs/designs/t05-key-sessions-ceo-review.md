# T05: Key sessions by filename (CEO review, 2026-10-07)

Branch: `fix/t05-key-sessions-by-filename` | Mode: SELECTIVE EXPANSION | Depth: implementation-ready

## Premise check

T05 says resumed sessions may carry a `sessionId` that differs from the file name, so two files could collapse into one agent. The code already keys by file name:

- `server/feed-plugin.ts:419` and `:432` take `sessionId` from the file name or the session directory.
- `server/feed-plugin.ts:505` passes it into `createNormalizerState`.
- `server/normalize.ts:117` is `state.sessionId ?? asStr(rec.sessionId)`, so the path wins whenever it is set.
- T03 census (2026-10-06): 0 of 182 files carry a different `sessionId`; 3 resumes seen (partly verified).

Real gap: no test pins "record `sessionId` differs from the path, the path wins". A refactor of `buildCtx` could silently regress it.

## Decision ledger

| ID and owner              | Contract and evidence                                                                                                  | Current | Proposed                                                                                                                | Status                         | Exact approval and scope                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------- |
| D1 mode (Step 0E)         | review mode                                                                                                            | none    | SELECTIVE EXPANSION                                                                                                     | approved                       | user answer to D1, mode only                   |
| D2 drift counter (0G)     | `buildCtx` `normalize.ts:114`; `DriftReason` `normalize.ts:16`; `feed-plugin.ts:251` drift is `Record<string, number>` | none    | bump `session_id_mismatch` once per record whose own `sessionId` is a non-empty string different from `state.sessionId` | approved                       | user answer to D2: add to scope                |
| D3 census cross-file (0G) | `census-transcripts.ts:141`                                                                                            | none    | cross-file id collision counter                                                                                         | declined (Skip)                | user answer to D3                              |
| Core (HOLD check)         | T05 in TODOS.md                                                                                                        | open    | regression tests + TODO update                                                                                          | proposed, within HOLD baseline | covered by D1 scope; confirm at implementation |

## Accepted scope

1. Normalizer tests in `server/normalize.test.ts`:
   - path-set `sessionId` wins over a different record `sessionId`: emitted events carry the path id.
   - two states with different path ids over records sharing one record `sessionId` stay separate.
   - `session_id_mismatch` drift: counted once per differing record; not counted when equal, absent, empty or non-string; not counted when `state.sessionId` is null.
2. `server/normalize.ts`: add `"session_id_mismatch"` to `DriftReason`; bump it in `buildCtx` only when `state.sessionId !== null` and the record id is a non-empty string that differs.
3. One scanner-level test in `server/feed-plugin.test.ts`: a top-level file `A.jsonl` whose records say `sessionId: "B"` and a file `B.jsonl` yield two agents keyed A and B.
4. TODOS.md: update T05 with the code finding and the new drift counter; move to ARCHIVE.md when shipped.

## NOT in scope

- Cross-file collision counter in the census (D3, skipped: live keying already prevents collapse).
- Changing census mismatch semantics.
- Any change to path-derived ids.

## Review sections (findings)

1. Architecture: no new component. One guard in `buildCtx`, the single choke point for every record. OK.
   ```
   file path ──> Candidate.sessionId ──> createNormalizerState ──> buildCtx
                                                           record.sessionId ──(compare only)──> drift counter
   ```
2. Error and rescue: new code path cannot throw (string compare). Non-string or empty record id is ignored (`asStr`). No GAP. Log carries counts only, never the id (existing privacy rule in `feed-plugin.ts:371`).
3. Security: record ids are untrusted text; they are compared, never logged, keyed or used as a path. Mismatch is a counter. OK.
4. Edge cases: nil id (ignored), empty string (ignored), number (ignored), 600-char id (compare only), unicode (exact compare), subagent files (state has path id too). WARNING: a hostile or odd file with every record mismatched bumps the counter per record; bounded integer, acceptable.
5. Code quality: one added branch in `buildCtx`; stays under 5 branches. Update the `sessionId` doc comment at `normalize.ts:28` to mention the counter.
6. Tests: see Accepted scope 1 and 3. The 2am test is the scanner-level A/B test. Hostile-QA test is the mismatched-id fuzz row (empty, number, long). No chaos or load test needed.
7. Performance: one string compare per record. None.
8. Observability: the counter appears in the existing drift summary line. If the census later shows non-zero `sessionIdMismatches`, the live counter agrees. Add the reason to `docs/reference.md` drift list if one exists there (none found by grep; skip).
9. Deployment: server-only change, no wire or schema change (`drift` is `Record<string, number>`). Rollback: revert the PR. Patch release.
10. Trajectory: reversibility 5/5. Debt: none added; T05 closes. Retrospective: D3 skip is not load-bearing for D2.
11. Design: SKIPPED (no UI scope).

## Failure modes

| Codepath           | Failure                           | Test      | Handled                  | Visible    |
| ------------------ | --------------------------------- | --------- | ------------------------ | ---------- |
| `buildCtx` compare | record id differs                 | yes (new) | path wins, counter bumps | drift line |
| `buildCtx` compare | record id absent/empty/non-string | yes (new) | ignored                  | no         |
| scanner            | two files, one record id          | yes (new) | two agents               | no         |

No critical gaps.

## Outside voice

SKIPPED: not run this session (scope is one guard plus tests; no external reviewer was invoked).

## Temporal interrogation

Hour 1: read `buildCtx` and `normalize.test.ts` helpers. Hours 2-3: guard plus normalizer tests. Hours 4-5: scanner test in `feed-plugin.test.ts` (find the existing temp-root helper). Hour 6: `vp check`, `vp test`, TODOS.md/ARCHIVE.md, then `vp check --fix` (markdown is formatted too). Effort: human ~2h / CC ~15min.

## GSTACK REVIEW REPORT

| Review        | Runs | Status  | Findings                                                               |
| ------------- | ---- | ------- | ---------------------------------------------------------------------- |
| CEO review    | 1    | CLEAR   | premise mostly false; 1 expansion accepted, 1 skipped; 0 critical gaps |
| Outside voice | 0    | SKIPPED | not run                                                                |

VERDICT: CEO review cleared for implementation (mode SELECTIVE EXPANSION, scope: tests + `session_id_mismatch` drift + TODO closure).

NO UNRESOLVED DECISIONS
