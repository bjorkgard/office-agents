# Success criteria (v1)

Source: `docs/designs/office-agents-isometric-office.md` (Success Criteria), BUILD_TODO 6.1.
Run the scoreboard by hand with `vp run criteria`; it prints one line per criterion:
`PASS|FAIL|SKIPPED criterion N, measured X`. Exit code is 1 on any FAIL, else 0. Nothing in CI
runs it (the live smoke reads real transcripts). Runner: `e2e/release.ts`.

| #   | Criterion                                                                                               | Spec                                                                                                                                                           | Pass line                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `vp dev` shows a live session from an existing transcript within seconds, no config                     | Live smoke in `e2e/release.ts` on the real transcript root (fixture proxy: "a new session takes its seat and works", `@live`)                                  | PASS: an agent renders within 10 s of page load. FAIL: refused, unavailable or display-error banner, a page error, or first agent at 10 to 30 s. SKIPPED: nothing renders within 30 s (no session, or none active). |
| 2   | A subagent shows a visible walk-in and paper handoff                                                    | "a subagent walks in, sits down and leaves on handoff" (`@live`, `e2e/office.spec.ts`)                                                                         | Spec passes.                                                                                                                                                                                                        |
| 3   | Wave and bubble fire on a heuristic attention signal (trailing "?" or an open tool call past the timer) | "an open tool call past the timer waves" (`@live`) and "age offset fires R1: a tool call past the timer waves" (`@core`)                                       | Both specs pass.                                                                                                                                                                                                    |
| 4   | Holds up with 12 agents                                                                                 | "twelve agents fill three rows, four chips and a +N" and "a narrow window shows every chip, wrapped" (`@twelve`); perf budget M10 is measured by `vp run perf` | Both specs pass. Perf: the row-change budget currently FAILs (see DESIGN.md "Performance").                                                                                                                         |

A row for criteria 2 to 4 fails when any mapped spec fails or did not run, so removing or
renaming a spec turns its row red. Live smoke output only ever contains counts and timings, never
transcript or page text.

## Evidence

not yet recorded
