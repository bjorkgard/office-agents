# Character art and recolor: merged build order

Merges the three task lists from [character-art-ceo-review.md](character-art-ceo-review.md): CEO T1-T8, eng ET1-ET10, design DR1-DR6. Build from this list, not the three originals. Decisions are in the review file; where an old task text conflicts with a later decision, the later decision wins (listed under "Superseded text").

Roadmap boxes after M1: "Draw characters and props as a pose rig" (BUILD_TODO 4.0, done after M7) and "Recolor shirts by project with a CSS variable" (BUILD_TODO 4.3, done after M4 and M6).

## Old id to merged id

| Merged | Replaces                                                                       | Note                                                |
| ------ | ------------------------------------------------------------------------------ | --------------------------------------------------- |
| M1     | CEO T6, T7; ET5, ET10; DR3 (CEO-review wording part)                           | one docs pass, no `DESIGN.md`                       |
| M2     | CEO T2 (doc part); ET1 (doc part); DR1; DR2; DR3 (Motion part); ET7 (doc part) | the only task that edits `DESIGN.md` until the gate |
| M3     | CEO T2 (code part); ET1 (code part)                                            | `palette.ts` and its tests                          |
| M4     | CEO T5; ET2; ET8 (pure part)                                                   | `poses.ts`, `shirtVars`, `nextDisplayed`            |
| M5     | CEO T1; DR4; ET4 (basic sheet); ET7 (scene and sheet `--scale`)                | style gate, needs your approval                     |
| M6     | CEO T3; ET3 (bulk); ET7 (rig strokes)                                          | bulk rig, props, looks                              |
| M7     | CEO T4; ET4 (rest); DR5                                                        | full `/art` sheet, prod exclusion                   |
| M8     | ET8 (component part)                                                           | `Character.tsx` stride swap                         |
| M9     | ET9                                                                            | `iso.ts` bubbles and hit spacing                    |
| M10    | CEO T8; ET6; DR6                                                               | profiling and Safari checks                         |

## Tasks (in order)

- [ ] **M1 (P2, human ~1.5h / CC ~12min)** — docs — README split into two boxes, each naming its BUILD_TODO step; reword 5.3, DT3, T13 and the recolor failure row to assert `data-shirt` plus computed shirt fill; split 4.0 into 4.0a (gate: seated-typing, raised hand, walking-with-paper, one full desk, basic `/art`) and 4.0b; replace the `<pattern>` stripe note with overlay shapes; remove "restart from rest" and the `non-scaling-stroke` instruction from the review file
  - Files: `README.md`, `BUILD_TODO.md`, `docs/designs/office-agents-isometric-office.md`, `docs/designs/character-art-ceo-review.md`
  - Verify: grep finds no "pixel probe", "key-color swap", "non-scaling-stroke" instruction, "restart from rest" or `<pattern>` stripe instruction outside history notes
- [ ] **M2 (P1, human ~5h / CC ~45min)** — design — one `DESIGN.md` pass: Art palette table (skin 3, hair 4, trousers, shoes, wood, metal, outline, stripe counterpart per shirt, bubble fill and a darker muted token pair) with contrast values; visual weight order; state-to-look matrix; two-tone shading with fixed top-left light; outline rule (1 screen px via `calc(1px / var(--scale))`, dark parts only, checked against touching colors); scaled floor ring (2px via variable) plus separate focus rectangle; 24x24 hit area; reduced-motion destinations and 600ms fade; desk layer order and bubble nudge rule; Motion timings (walk 800ms, typing 400ms, wave 1200ms then hold, linear or ease-in-out for loops, interrupt rule); remove the bubble difference from the gaps list; leave a "Character geometry" table stub filled at M5
  - Files: `DESIGN.md`
  - Verify: every text pair at least 4.5:1, every graphic token at least 3:1 on `#161a24`; matrix covers all six states
- [ ] **M3 (P1, human ~2h / CC ~15min)** — palette — `palette.ts` (8 shirt colors, stripe counterparts, art tokens, bubble pair), `identity.ts` imports it; tests in `art.test.ts`: contrast at least 3:1, and a drift test comparing every hex with the DESIGN.md tables
  - Files: `src/office/palette.ts`, `src/office/identity.ts`, `src/office/art.test.ts`
  - Verify: `vp test`; changing one hex in either file fails the drift test
- [ ] **M4 (P1, human ~3h / CC ~25min)** — poses — pose table and `poseForState` for the six states, `shirtVars(index, stripe)` emitting `--shirt` and `--shirt-stripe`, gray fallback with dev warning, pure `nextDisplayed(state, loopRunning, reducedMotion, elapsed)` (event, immediate, 900ms timeout)
  - Files: `src/office/poses.ts`, `src/office/art.test.ts`
  - Verify: cases for all six states, indexes 0-7, stripe, 8 and nil, and the three swap paths
- [ ] **M5 (P1, human ~3h / CC ~30min) — STYLE GATE** — `CharacterRig` with three poses at the 60 px starting height, overlay stripe, gradient shadow outside the mirror group, strokes via `--scale`; scene and `ArtSheet` set `--scale`; basic `/art` (dev gate, `?art`, dynamic import) showing the three poses and one desk at 100% and 50% beside the mockup and variant B; static-markup render test (`data-shirt`, `--shirt`, `--shirt-stripe`, gray fallback, stroke uses the variable)
  - Files: `src/office/CharacterRig.tsx`, `src/office/ArtSheet.tsx`, `src/main.tsx`, `src/office/art.test.ts`, `DESIGN.md` (fill the geometry table only)
  - Verify: you approve the side-by-side; else fall back to hand-drawn pixel frames (4A); geometry table committed before M6
- [ ] **M6 (P1, human ~1d / CC ~40min)** — rig — remaining poses (sit, wave, carry, coffee, idle) in two authored views mirrored for the others, props (desk, monitor, chair, door, coffee station, plants, paper), seeded looks (2 hair sets, 3 skin tones, 4 hair colors) in `identity.ts`
  - Files: `src/office/CharacterRig.tsx`, `src/office/props.tsx`, `src/office/identity.ts`, `src/office/art.test.ts`
  - Verify: appearance seed test; render test still passes; no hard-coded colors outside `palette.ts`
- [ ] **M7 (P2, human ~3h / CC ~25min)** — tooling — full `/art`: every pose and shirt plus stripe, 12-agent row at 50% with one waving agent (must read first), outlined-contour contrast against touching colors, two adjacent waving agents, grayscale pass; production build excludes the sheet
  - Files: `src/office/ArtSheet.tsx`
  - Verify: `vp build` then grep dist for "ArtSheet" returns nothing; sheet shows each case
- [ ] **M8 (P2, human ~2h / CC ~15min)** — motion — `Character` displayed-state hook using `nextDisplayed` (`animationiteration`, reduced-motion immediate, 900ms timeout)
  - Files: `src/office/Character.tsx`
  - Verify: toggling reduced motion shows the new pose at once; background tab returns to the current pose
- [ ] **M9 (P2, human ~2h / CC ~15min)** — layout — `placeBubbles` (longer wait on top, 8px shifts, max 2, then hide) and hit-area spacing with `iso.test.ts`
  - Files: `src/office/iso.ts`, `src/office/iso.test.ts`
  - Verify: tests for 0, 1, 2, 3 overlapping bubbles; hit-area centers at least 24 px apart at scale 0.5 for 12 agents
- [ ] **M10 (P2, human ~2h / CC ~20min)** — verify — profile animated SVG at 12 and 24 agents (Chrome, Safari, shadows included); Safari check of the `--scale` stroke path and the 24x24 hit areas at 50%
  - Files: to be determined
  - Verify: frame times and findings recorded in the 4.4 notes

## Order and lanes

| Step   | Depends on                                | Files owned                                    |
| ------ | ----------------------------------------- | ---------------------------------------------- |
| M1     | none                                      | docs/, README, BUILD_TODO                      |
| M2     | none                                      | `DESIGN.md`                                    |
| M9     | none (needs `iso.ts` from BUILD_TODO 4.1) | `iso.ts`, `iso.test.ts`                        |
| M3     | M2                                        | `palette.ts`, `identity.ts`                    |
| M4     | M3                                        | `poses.ts`                                     |
| M5     | M4, you approve                           | `CharacterRig.tsx`, `ArtSheet.tsx`, `main.tsx` |
| M6, M7 | M5                                        | `src/office/`                                  |
| M8     | M4, scene (BUILD_TODO 4.4)                | `Character.tsx`                                |
| M10    | M6, 4.4                                   | none                                           |

Lane A: M1. Lane B: M2 → M3 → M4 → M5 → M6 → M7 → M8. Lane C: M9. Launch A, B and C together (disjoint files), merge, then M10. `DESIGN.md` is owned by M2, with one later edit at M5 (the geometry table).

## Superseded text (do not follow)

- CEO review Temporal interrogation: stripe as an SVG `<pattern>` (now overlay shapes, eng R2).
- CEO review Section 4: "animations restart from rest" (now finish the stride, design D12, eng R7).
- Design D7 and D8: `vector-effect: non-scaling-stroke` (now the `--scale` variable, eng-2 R6).
- Design doc DT3, T13 and BUILD_TODO 5.3: canvas pixel probe (now `data-shirt` plus computed fill).
- CEO T5 "recolor.ts" file idea: folded into `poses.ts` (`shirtVars`), no `recolor.ts`.
