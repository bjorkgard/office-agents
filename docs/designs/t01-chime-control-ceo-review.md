# CEO plan review: T01 chime control (design review and DESIGN.md entry)

Branch: `design/t01-chime-control-review` (off main 381b013) | Mode: SELECTIVE EXPANSION | Date: 2026-10-06
Source: TODOS.md T01. Files read: `src/office/TopBar.tsx`, `useChime.ts`, `chime-logic.ts`, `chime-audio.ts`, `src/index.css` (`.top-bar-chime`), `DESIGN.md`, `useChime.test.ts`, `topbar.test.tsx`, `playwright.config.ts`. Nothing was run in a browser; audio and blocked state remain unmeasured until X3 ships.

## Decision ledger

| ID / owner        | Contract and evidence                                                                                                                     | Current               | Proposed                                                                                          | Status                                                          | Approval and scope                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| D1 mode           | Review posture                                                                                                                            | none                  | SELECTIVE EXPANSION                                                                               | approved                                                        | user answer to D1 (mode question)                                                                     |
| D2 X1 / Sec 4     | Cross-tab preference sync; `useChime.ts` has no `storage` listener                                                                        | none                  | `storage` event listener on `CHIME_KEY`                                                           | approved: Add                                                   | user answer to D2; scope = listener, its state rules, tests                                           |
| D3 X2 / Sec 5     | `chime-audio.ts:11` reads only `window.AudioContext`                                                                                      | unprefixed only       | `AudioContext ?? webkitAudioContext`                                                              | approved: Add                                                   | user answer to D3; scope = fallback and one test                                                      |
| D4 X3 / Sec 6     | Audio and blocked state never run in a browser; overlap at 800 px only estimated                                                          | none                  | Playwright check of off, blocked, on, off; measured chime-vs-chips overlap at 800 px with 4 chips | approved: Add                                                   | user answer to D4; scope = e2e spec, no CI config change beyond the spec                              |
| D5 S2-1 / Sec 11  | Stored "on" starts blocked; first click retries unlock and chimes (`useChime.ts:55`, `nextEnabled`)                                       | blocked click enables | unchanged; record the two-click mute in DESIGN.md                                                 | approved: Keep, document                                        | user answer to D5; scope = no state-machine change, DESIGN.md text only                               |
| D6 S11-1 / Sec 11 | `TopBar.tsx:101` `aria-pressed={status !== "off"}` is true while blocked (silent)                                                         | pressed in blocked    | remove `aria-pressed`; accessible name carries 3 states                                           | approved: Drop                                                  | user answer to D6; scope = TopBar attr, `topbar.test.tsx:249`, `e2e/office.spec.ts:228` locator check |
| B1 baseline       | T01 "What/Why" findings (glyph, chip look, tone constants, tests, DESIGN.md entry)                                                        | as listed in T01      | fix each                                                                                          | accepted as T01's own scope (TODOS.md T01), not a new expansion | TODOS.md T01 text                                                                                     |
| B2 baseline       | T01 deferred findings: hover hides warn cue, no `flex-shrink: 0`, double unlock, `shouldChime` future-dated `waitingSince`, missing tests | as listed             | fix or test each (see Section 1-6)                                                                | accepted as T01 scope                                           | TODOS.md T01 text                                                                                     |

Approval readiness: PASS for D1 to D6 (each cites its actual answer above). B1 and B2 are T01's written scope, not separate approvals.

## Scope decisions (CEO summary)

Accepted (added to plan): cross-tab sync (D2), `webkitAudioContext` fallback (D3), real-browser Playwright check (D4).
Decided without scope change: blocked click stays "enable" (D5), `aria-pressed` dropped (D6).
Deferred to TODOS.md: none. Skipped: none.

## Section findings

Review depth: implementation-ready (small change, files known).

### 1. Architecture

```
 TopBar.tsx ──useChime()──► createChime() (closure state) ──► chime-audio.ts (module ctx)
     │                         │  enabled / unlocked / unlockFailed / lastChimeAt
     │                         ├──► chime-logic.ts (pure: status, label, nextEnabled, shouldChime)
     │                         └──► localStorage "agent-office.chime"
     └─ runAnnouncer ──notify(announced)──┘
 NEW: window "storage" event ──► createChime (D2)
```

States: `off` ↔ `on` (unlocked) and `blocked` (enabled, not unlocked). Invalid transition guarded today only by `if (!enabled) return` in the unlock `.then` (`useChime.ts:63`).

- **WARNING (double unlock):** off then on while the first unlock is pending: the first `.then` sees `enabled === true` again and applies its result; two unlocks run, two chimes play, and a stale timeout `false` can set `unlockFailed` over a newer success. Mechanism fix: a generation counter bumped on every toggle and storage-driven change; an unlock result applies only if its generation is current. (B2; `useChime.ts:64`, `:84`)
- **WARNING (new coupling, D2):** the `storage` handler is a second writer of `enabled`. It must bump the generation and reset `unlocked`/`unlockFailed`. A remote "on" lands as `blocked` (an AudioContext needs this tab's own click), a remote "off" lands as `off`. Own-tab writes do not fire `storage`, so no echo loop.
- **NOTE:** two open tabs that are both unlocked each chime for the same wait. Cross-tab sync does not change that. Not in scope; recorded as a known behaviour in DESIGN.md.
- Rollback: revert the branch; no data migration, the stored value format ("on"/"off") is unchanged.

### 2. Error and rescue map

```
CODEPATH                 | WHAT CAN GO WRONG                | RESCUED? | USER SEES         | TEST?
-------------------------|----------------------------------|----------|-------------------|------------------
unlockChime              | no AudioContext (and no webkit)  | Y false  | "Chime: click"    | NEW (D3)
                         | resume() rejects                 | Y false  | "Chime: click"    | NEW
                         | resume() never settles           | Y 1.5 s  | "Chime: click"    | exists (useChime)
                         | resumes but state != running     | Y false  | "Chime: click"    | NEW
playChime                | ctx missing                      | Y false  | blocked on next   | NEW
                         | suspended, resume fails          | Y false  | blocked, click    | exists (mocked)
                         | createOscillator throws          | Y false  | blocked, click    | NEW
readPref/writePref       | storage throws                   | Y        | not persisted     | exists
storage event (D2)       | key removed (null)               | Y off    | "Chime off"       | NEW
                         | event for another key            | Y ignore | none              | NEW
```

No catch-all gap: each catch returns a typed `false`. **NOTE:** `playChime`'s `catch` swallows without a log; acceptable for a UI nicety, and the user-visible result is the blocked state, not silence.

### 3. Security and threat model

No new endpoint, input, secret or dependency. The `storage` event payload is a string compared with `"on"` only (`parseChimePref`), so an unexpected value reads as off. Another origin cannot write this origin's storage. Likelihood Low, impact Low. No issues found.

### 4. Data flow and interaction edge cases

Async ordering (invariant: at most one live unlock, and a result applies only to the generation that started it):

```
 op A: toggle on (gen 1) ──unlock pending───────────────► resolves true  ─► DROP (gen 3 now)
 op B: toggle off (gen 2)  ──────────────────────────────┐
 op C: toggle on  (gen 3)  ──unlock pending──► resolves ─► APPLY
```

Both completion orders (A first, C first) must end with exactly one chime and `unlocked` equal to C's result. Regression test uses controlled pause/release points on the mocked `unlockChime`.

| INTERACTION   | EDGE CASE                          | HANDLED? | HOW?                                                                                                                         |
| ------------- | ---------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| click         | double-click during pending unlock | partly   | generation counter, second click turns off (new)                                                                             |
| click         | toggle off while unlock pending    | partly   | late result dropped (new test)                                                                                               |
| storage event | remote on while this tab off       | new      | status becomes blocked, no sound until click                                                                                 |
| storage event | remote off while unlock pending    | new      | generation bump drops the pending result                                                                                     |
| notify        | future-dated `waitingSince`        | OK, keep | `since >= loadedAt` stays: a browser clock ahead of the server must not silence real waits; add a test that pins this choice |
| notify        | two waits inside 5 s               | OK       | `CHIME_MIN_GAP_MS`; no test inside `createChime.notify` (new test)                                                           |
| layout        | 4 chips at 800 px                  | gap      | `flex-shrink: 0` on the chime (not yet measured; D4 measures it)                                                             |

### 5. Code quality

- Tone literals (`660, 880, 0.18, 0.02, 0.3, 0.08, 0.0001, 0.32`, `chime-audio.ts:29`): name them as exported constants (`CHIME_NOTES_HZ`, `NOTE_GAP_S`, `PEAK_GAIN`, ...) in `chime-audio.ts`. Same file owns the tone, so no new module.
- `useCallback` wrappers (`useChime.ts:98`): `toggle` and `notify` do not use `this`, so return `chime.toggle` and `chime.notify` directly. Simplification only.
- `runAnnouncer`: small advisory in T01; not touched here (lives in `topbar-logic.ts`, not read in depth). Left as is.
- Duplicated behaviour: `.top-bar-chime` repeats padding, border radius, font and cursor from `.top-bar-chip`. Share them through a common class or grouped selector, so a token change moves both. Complexity: `createChime.toggle` stays under 5 branches.

### 6. Test review

```
NEW / CHANGED ITEM                         | TYPE        | TEST
-------------------------------------------|-------------|-------------------------------------------
chime-audio.ts (unlock, play, fallback)    | unit (fake AudioContext, vi.resetModules) | NEW file chime-audio.test.ts
createChime double toggle + stale unlock   | unit, controlled promises | NEW in useChime.test.ts
toggle off while unlock pending            | unit        | NEW
notify 5 s window inside createChime       | unit        | NEW
storage event: on / off / null / other key | unit        | NEW
shouldChime future-dated waitingSince      | unit        | NEW in chime-logic.test.ts
aria-pressed removed, label per status     | unit        | CHANGE topbar.test.tsx:249
glyph per status (distinct blocked glyph)  | unit (SSR html) | NEW in topbar.test.tsx
off / blocked / on / off in a browser      | E2E         | NEW spec (D4)
unlock that never settles in a browser     | E2E (stubbed resume) | NEW spec (D4)
800 px, 4 chips: chime vs chips overlap    | E2E (measure bounding boxes) | NEW spec (D4)
```

Flakiness risk: headless Chromium audio policy. The E2E spec asserts the visible text and boxes, never audible output, and stubs `AudioContext.prototype.resume` where it needs a deterministic failure. 2 a.m. test: stored "on", reload, click, state reaches "Chime on", click, "Chime off" persists after reload. Hostile test: ten rapid clicks end in a consistent state with one live unlock.

### 7. Performance

One extra `storage` listener; no render-path change. SVG glyph is three tiny inline paths. No issues found.

### 8. Observability

User-visible state is the observability: text plus glyph. No log or metric added; `playChime` failure shows as the blocked state. Debuggability gap: none that a console log would fix for an opt-in toggle. No issues found.

### 9. Deployment and rollout

Static client change, no migration, no flag. Stored value format unchanged, so old and new builds read each other's preference. Post-ship check: load with stored "on", see "Chime: click", click, hear the tone, reload, mute. Rollback: revert the commit.

### 10. Long-term trajectory

- Debt removed: bare literals, untested audio wrapper, two-writer risk guarded by a generation counter. Debt added: one E2E spec that touches audio policy (watch for CI flake).
- Reversibility 5/5. A later "per-agent sound" or volume setting would reuse the named tone constants and the generation guard.
- Retrospective: D2 to D4 fit the baseline; none of the rejected-or-deferred items exist, so nothing was left load-bearing.

### 11. Design and UX

```
 off ──click──► (unlock pending) ──ok──► on (plays tone) ──click──► off
  ▲                                │fail/timeout                      │
  └──────── click (after failed) ◄─ blocked ◄─ reload with stored on ─┘
```

| STATE   | LOOK                                                                                               | TEXT         | NAME                                |
| ------- | -------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------- |
| off     | muted border, speaker with slash glyph                                                             | Chime off    | Chime off                           |
| on      | `--text` colour, speaker with waves glyph, border stays muted so it does not read as an agent chip | Chime on     | Chime on                            |
| blocked | `--warn` border and text, speaker with "!" glyph, warn kept on hover                               | Chime: click | Chime: click, click to enable sound |

- Glyphs: monochrome inline SVG using `currentColor`, aria-hidden, three distinct shapes (replaces the platform emoji). Graphic contrast: muted 6.27 on `--bar`, warn well above 3:1 (DESIGN.md token table).
- Chip look: the on state no longer uses `--accent`; hover uses a state-specific rule so blocked keeps its warn cue.
- Width: `flex-shrink: 0` on the control; measured at 800 px with 4 chips in the E2E spec. Narrow mode (`data-narrow`) wraps chips and keeps the control at the far right.
- Touch target: padding gives about 28 px height; DESIGN.md Accessibility section has the project minimum, to be checked while writing the entry (not verified here).
- DESIGN.md: add a "Chime toggle" entry under Components, replacing the parenthetical in the Top bar entry. It records: three states, glyphs, colours, the D5 two-click mute, the unlock timeout, the 5 s window, tabs (D2), supported browsers (D3), and "audio never auto-plays".
- Consider `/plan-design-review` is not needed (single control); run `/design-review` on the live page after implementation.

## NOT in scope

- Deferred: none.
- Rejected: none beyond D5 options B and C (not chosen, no TODO).
- Not touched: `runAnnouncer`, per-agent sounds, volume setting, cross-tab "only one tab chimes" (named as a known behaviour in Section 1).

## What already exists

`.top-bar-chip` styling (reused through a shared selector), `--warn`/`--accent`/`--text-muted` tokens, `chimeStatus`/`chimeLabel`/`nextEnabled`/`shouldChime` (kept), `createChime` test harness with a mocked audio module (extended), Playwright scenarios in `playwright.config.ts` (a scenario with multiple waiting agents is to be chosen at build; the `twelve` and `core` fixture sets are candidates, not checked).

## Dream state delta

Today: emoji glyph, chip-like look, racy unlock, unreviewed. After: a reviewed, accessible, tested control with a DESIGN.md entry. Remaining toward the 12-month ideal: one-tab-chimes-only coordination, volume, and per-agent tones (not pursued).

## Failure modes registry

```
CODEPATH            | FAILURE MODE                    | RESCUED? | TEST? | USER SEES?       | LOGGED?
--------------------|---------------------------------|----------|-------|------------------|--------
unlock              | stale result after off/on       | Y (new)  | Y new | one chime        | N
unlock              | no AudioContext                 | Y        | Y new | Chime: click     | N
playChime           | ctx suspended again             | Y        | Y     | Chime: click     | N
storage event       | key removed / other key         | Y (new)  | Y new | off / unchanged  | N
layout              | chime overlaps chips at 800 px  | Y (new)  | Y new | no overlap       | N
```

No critical gap after the planned work (no row with RESCUED=N, TEST=N and a silent result).

## Stale diagram audit

No ASCII diagrams in the touched source files. The DESIGN.md Top bar entry is a text description and is replaced by the new entry.

## Implementation tasks

- [ ] **T1 (P1, human ~1h / CC ~10min)** chime-audio: name the tone constants, add the `webkitAudioContext` fallback, add `chime-audio.test.ts`. Surfaced by: Sec 5, D3. Files: `src/office/chime-audio.ts`, `src/office/chime-audio.test.ts`. Verify: `vp test src/office/chime-audio.test.ts`.
- [ ] **T2 (P1, human ~2h / CC ~15min)** useChime: generation counter for unlocks, `storage` listener, drop `useCallback` wrappers, tests for double toggle, off-while-pending, late unlock, 5 s window, storage cases. Surfaced by: Sec 1, 4, D2. Files: `src/office/useChime.ts`, `src/office/useChime.test.ts`. Verify: `vp test src/office/useChime.test.ts`.
- [ ] **T3 (P1, human ~1h / CC ~10min)** chime-logic: pin the future-dated `waitingSince` choice with a test and a one-line comment. Surfaced by: Sec 4. Files: `src/office/chime-logic.ts`, `src/office/chime-logic.test.ts`. Verify: `vp test src/office/chime-logic.test.ts`.
- [ ] **T4 (P1, human ~2h / CC ~15min)** TopBar and CSS: monochrome SVG glyphs per status, remove `aria-pressed`, shared control styles with the chip, on state without `--accent`, per-state hover keeping the warn cue, `flex-shrink: 0`. Surfaced by: Sec 11, D6, B1/B2. Files: `src/office/TopBar.tsx`, `src/index.css`, `src/office/topbar.test.tsx`, `e2e/office.spec.ts` (locator at line 228 if it relies on the pressed state). Verify: `vp test`, `vp check`.
- [ ] **T5 (P1, human ~3h / CC ~20min)** Playwright spec for off, blocked, on, off, stubbed never-resolving unlock, and a measured 800 px / 4 chips layout. Surfaced by: Sec 6, D4. Files: `e2e/` new spec, scenario choice in `playwright.config.ts` only if no existing fixture has 4 waiting agents. Verify: the repo's e2e run command (check `package.json` scripts).
- [ ] **T6 (P2, human ~1h / CC ~10min)** DESIGN.md: "Chime toggle" entry (see Section 11 list), update Principle 3 and Top bar references, then mark T01 done in TODOS.md (archive per ARCHIVE.md rules). Surfaced by: T01 What. Files: `DESIGN.md`, `TODOS.md`, `ARCHIVE.md`. Verify: `vp check --fix` then `vp check` (it formats markdown too).

Ratios assumed: tests about 50x, features about 30x, docs about 10x.

## GSTACK REVIEW REPORT

| Review                         | Runs | Status                                                       | Findings                                                                                                                                                 |
| ------------------------------ | ---- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CEO review (this run)          | 1    | issues_open: coverage gaps only, no open decisions           | 2 WARNING (double unlock, second writer of `enabled`), 6 smaller (glyph, chip look, hover cue, `flex-shrink`, tone literals, test gaps), 0 critical gaps |
| Spec review loop (0H subagent) | 0    | not run                                                      | not run this session                                                                                                                                     |
| Outside voice                  | 0    | not run (no Codex preflight or native fallback was executed) | missing coverage, not a clean review                                                                                                                     |
| Eng review, Design review      | 0    | not run                                                      | not run                                                                                                                                                  |

VERDICT: plan is ready for implementation; the independent reviews above did not run. Nothing here was implemented or executed; browser claims (overlap at 800 px, blocked-state behaviour) are unmeasured until T5.

NO UNRESOLVED DECISIONS
