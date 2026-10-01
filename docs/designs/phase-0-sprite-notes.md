# Phase 0: sprite pack check

Date: 2026-10-01. Branch: phase-0-sprite-check. Plan: `BUILD_TODO.md` Phase 0 (steps 0.1, 0.1a, 0.1b, 0.1c). Files were downloaded to a scratch directory, inspected, and not committed.

## Verdict

**No single CC0 pack passes.** Decision (user, 2026-10-01): **all characters and props are drawn in one consistent style (route 2 below); no third-party sprites are used.** Nothing was copied to `src/assets/office/` (step 0.1d is not applicable). Consequences to carry into Phase 4: recolor is by variable or fill, not by pixel key-color swap, which differs from decision 4B (canvas key-color swap of a pack's shirt band) and needs an explicit amendment when the first character is built; the 12-agent scale check must be redone on the drawn sprite size.

## Candidates

| Pack                                                                                                     | License (source)                        | Poses                                                                                                          | Directions         | Props     | Verdict                                                                                   |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------ | --------- | ----------------------------------------------------------------------------------------- |
| [COZY ASSETS modular male kit](https://klimmos.itch.io/cozy-assets-male-isometric-modular-character-kit) | Paid ($10); page forbids redistributing | idle, walk, sit (8 frames each)                                                                                | 4                  | none      | **Rejected**: not CC0, cannot be committed to a repo; clothing is layers, not recolorable |
| [Hormelz 8 Directional 2D Businessman](https://hormelz.itch.io/8-directional-2d-businessman-character)   | CC0 v1.0 (itch.io page)                 | 20 animations; used here: Walk (12 frames), Idle, Talking, Carrying. **No sit, no typing, no wave, no coffee** | 8 (`dir1`..`dir8`) | none      | **Usable for walk, idle, carrying only**                                                  |
| [Kenney Furniture Kit 2.0](https://kenney.nl/assets/furniture-kit)                                       | CC0 (`License.txt` in the zip, read)    | none (props only)                                                                                              | 4 (NE, NW, SE, SW) | see below | **Usable for props**, style mismatch                                                      |

## Measured facts (from the downloaded files)

- Hormelz frame size 256x256, but the figure itself is **31x59 px** (bounding box of the idle frame). Sheet sizes: Idle 1280x1280, Walk 1024x768, Talking 1536x1536, Carrying 1280x1280. Download sizes: Walk 130 KB, Idle 165 KB, Talking 279 KB, Carrying 233 KB (810 KB for the four).
- Hormelz idle frame has 44 distinct colors. The shirt is a 3-shade teal ramp (hue 158 to 206) in a clean torso band.
- Kenney zip is 4.9 MB; 702 PNGs under `Isometric/`, each in 4 facings. Sizes seen: desk 116x122, computerScreen 46x55, chairDesk 60x78. The preview is flat, bright, low-poly render, not pixel art.

## 0.1a Furniture check (Kenney Furniture Kit)

| Prop needed                 | In kit?                   | File stem                                                            |
| --------------------------- | ------------------------- | -------------------------------------------------------------------- |
| desk                        | yes                       | `desk`, `deskCorner`                                                 |
| monitor                     | yes                       | `computerScreen`, plus `computerKeyboard`, `computerMouse`, `laptop` |
| office chair                | yes                       | `chairDesk`                                                          |
| coffee station              | partial                   | `kitchenCoffeeMachine` on `kitchenCabinet` / `kitchenBar`            |
| door                        | yes                       | `doorway`, `doorwayFront`, `doorwayOpen`, `wallDoorway`              |
| paper                       | **no** (closest: `books`) | needs vector fallback                                                |
| plants, shelf, window, wall | yes                       | `pottedPlant`, `plantSmall1-3`, `bookcaseOpen`, `wallWindow`, `wall` |

Style: Kenney props are smooth and bright, the approved mockup (variant A) is pixel art in a dim evening palette. They would need darkening and probably pixelation to match; not tried.

## 0.1b Recolor dry-run (Hormelz idle frame)

Throwaway script (`dryrun.py`, kept in scratch, not committed). Method: select pixels with hue 140 to 215, saturation above 0.5, value above 0.38, inside the torso band (18% to 62% of figure height), then set hue to the target and scale value. Result: [phase-0-recolor-sheet.png](phase-0-recolor-sheet.png), 9 variants (8 palette colors plus an orange stripe).

- 324 pixels swapped in every variant, which is the whole shirt.
- No visible bleed into skin, hair, trousers or shoes in any variant (checked by eye on the 10x sheet).
- Caveats, unverified: the heuristic used a torso-band rule, so a pack without that clean region would fail; the light blue-gray outline pixels on the shirt stay unchanged; this is one frame (idle, dir1), not all frames and directions; the stripe is a simple row pattern, not a designed one.

## 0.1c Facing and scale check

- Facing: Hormelz has 8 directions, Kenney 4. The isometric room needs only the 4 diagonals, so both cover it. The sprite for walking in all four diagonals exists in Hormelz (Walk dir files `dir1..dir8`, 8 PNGs).
- Scale: [phase-0-scale-50.png](phase-0-scale-50.png) shows 12 recolored figures at 50% (about 15x29 px) beside 12px text. They stay distinguishable as separate people by shirt color, but are small; facial details and the held paper would not be readable. 12 agents is the target (success criterion), so this passes only if the scene itself is drawn at or above the native size.

## Gaps against the required pose list

| Pose needed             | Hormelz                                | Fallback                           |
| ----------------------- | -------------------------------------- | ---------------------------------- |
| sit at desk             | no                                     | vector or other art                |
| typing                  | no                                     | vector or other art                |
| wave (raised arm)       | no                                     | vector or other art                |
| coffee break            | no (Idle at a prop could stand in)     | idle plus coffee prop              |
| walk                    | yes                                    | none                               |
| hold or hand over paper | partial (`Carrying`, `PickUp`, `Pull`) | adapt, plus a paper prop in vector |
| idle                    | yes                                    | none                               |

Three of the poses that matter most (sit and type for "working", wave for "needs you") are missing. Those states are most of what the office shows.

## Decision (made)

Route 2 chosen. Options were:

Which route for characters:

1. **Hybrid:** Hormelz for walk, idle and carrying; vector (flat, drawn in code or SVG) for sit, type and wave; Kenney props darkened to fit. Two art styles must be reconciled.
2. **All vector characters and props:** one consistent look, most work, no third-party license beyond the sprite-free route.
3. **Keep searching** for a CC0 pack with sit, type and wave poses (not found in this search).

## Sources

Pack pages linked above; Kenney license text read from `License.txt` inside `kenney_furniture-kit.zip`; Hormelz license from its itch.io page.
