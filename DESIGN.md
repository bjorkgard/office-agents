# DESIGN

Design system for Office Agents: a dim, evening-lit isometric office where Claude Code agents sit at desks. Calm utility UI around a scene that carries the personality. Source decisions are in [docs/designs/office-agents-isometric-office.md](docs/designs/office-agents-isometric-office.md) (ids like 5A, 4A are from there).

Status: tokens below are the contract and are now in `src/index.css` `:root` (the Vite template styles are removed). Contrast ratios were computed with the WCAG 2.x relative-luminance formula, (L1+0.05)/(L2+0.05), against `--bg` unless a column says otherwise; recompute when any token changes. Color-blind safety of the shirt set comes from the published palette, not from a simulation run on this project.

## Principles

1. The room is the anchor. UI chrome stays quiet so a waving agent is the loudest thing on screen.
2. Attention is never color alone (8B). Pose, bubble and floor ring carry it; color only reinforces.
3. Calm by default. No sound, no neon (4C, 3A), and no camera movement except one: when the fit changes (a row is added or removed, or the window is resized) the whole room eases to its new fit over `--dur-base` (240ms) with `--ease`, and not at all under `prefers-reduced-motion: reduce`.
4. Nothing is read from transcripts into the UI: bubbles say "Asking you" or "Stuck?" plus wait time, never message text (2B).
5. A stable map. Desks, door and coffee station do not move once placed (8A).

## Color tokens

Dark only; there is no light theme (design doc, "NOT in scope").

| Token           | Value     | Use                                          | Contrast                  |
| --------------- | --------- | -------------------------------------------- | ------------------------- |
| `--bg`          | `#161a24` | room backdrop, page                          | base                      |
| `--bar`         | `#1d2230` | pinned top bar                               | base                      |
| `--text`        | `#e8ebf2` | tags, bar text                               | 14.57 on bg, 13.29 on bar |
| `--text-muted`  | `#9aa3b8` | wait times, secondary                        | 6.88 on bg, 6.27 on bar   |
| `--accent`      | `#b388ff` | waving ring, focus rectangle, chip highlight | 6.53 on bg, 5.95 on bar   |
| `--warn`        | `#ffb454` | "Reconnecting" status text                   | 9.86 on bg                |
| `--screen-glow` | `#8fd6ff` | monitor glow while working only              | decorative                |

Rules: text pairs must stay at or above 4.5:1. Graphics (rings, shirts, glow) must stay at or above 3:1 against `--bg`; blue (`#0072b2`) is 3.35 there and about 3.06 on `--bar`, so draw shirts on the room background only. No hard-coded colors outside these tables (color tokens, shirt palette, art palette).

## Project shirt palette (6A)

Seven colors from the Okabe-Ito color-blind-safe set plus light gray (replacing Okabe-Ito's black, which is invisible on the dark background), and a stripe pattern from the 9th active session (unique for up to 16). Shirts are per session, not per project; a subagent shares its parent's session id and so wears the parent's shirt. Unknown project: neutral gray shirt and tag "unknown".

| Index | Name       | Value     | Contrast on bg |
| ----- | ---------- | --------- | -------------- |
| 0     | orange     | `#e69f00` | 7.72           |
| 1     | sky        | `#56b4e9` | 7.54           |
| 2     | green      | `#009e73` | 5.08           |
| 3     | yellow     | `#f0e442` | 13.15          |
| 4     | blue       | `#0072b2` | 3.35           |
| 5     | vermillion | `#d55e00` | 4.50           |
| 6     | purple     | `#cc79a7` | 5.68           |
| 7     | light gray | `#f2f2f2` | 15.54          |

Selection is pure and lives in `identity.ts`: hash the session id, avoid collisions among active sessions (kept while the session stays active). Phase 0 chose all-drawn art, so recolor is a variable or fill on the drawn shirt, not a pixel key-color swap; decision 4B was amended to this route on 2026-10-01 (design doc, decision table). Expose the index as `data-shirt` for tests.

Accent separation (8B): `--accent` (violet, hue about 262°) sits at least 59° away from every shirt hue (nearest: sky and blue at 202°, purple at 327°), so no project shirt matches it. Even so, the accent never relies on hue alone: it appears as a ring on the floor under the agent plus the raised-arm pose and the bubble. Verify in grayscale and against all 8 shirts before ship (task DT11). If the ring is ever confused with a shirt, change the accent, not the shirt palette.

## Art palette

Colors for the drawn characters and props (all-drawn route, `docs/designs/character-art-ceo-review.md`). `src/office/palette.ts` mirrors these tables and a drift test compares every hex, so keep one table row per token with the hex in backticks. Contrast is WCAG 2.x relative luminance against `--bg` (`#161a24`) unless a column says otherwise. Every graphic token is at least 3:1; every text pair at least 4.5:1.

| Token             | Value     | Use                                        | Contrast on bg | Outline contrast |
| ----------------- | --------- | ------------------------------------------ | -------------- | ---------------- |
| `--skin-1`        | `#f0d2b8` | skin, light                                | 12.11          | no outline       |
| `--skin-2`        | `#c9a283` | skin, medium                               | 7.44           | no outline       |
| `--skin-3`        | `#9b7960` | skin, deep                                 | 4.39           | no outline       |
| `--hair-1`        | `#8c7258` | hair, brown                                | 3.86           | 3.60             |
| `--hair-2`        | `#cdb98f` | hair, blond                                | 9.05           | no outline       |
| `--hair-3`        | `#b9bfcc` | hair, gray                                 | 9.43           | no outline       |
| `--hair-4`        | `#a07a6a` | hair, auburn                               | 4.54           | 3.06             |
| `--trousers`      | `#5f6f94` | trousers                                   | 3.47           | 4.01             |
| `--shoes`         | `#807670` | shoes                                      | 3.93           | 3.54             |
| `--wood`          | `#8f6a48` | desk, chair, door                          | 3.58           | 3.89             |
| `--metal`         | `#8c96aa` | monitor frame, coffee station, mug         | 5.85           | no outline       |
| `--plastic`       | `#626879` | headphones, chair, keyboard, monitor bezel | 3.13           | 4.45             |
| `--screen`        | `#4f8fe0` | lit monitor screen                         | 5.25           | no outline       |
| `--leaf`          | `#5f9e4a` | desk plant                                 | 5.36           | no outline       |
| `--outline`       | `#e1e6f2` | highlight overlay (35%) on pixel cells     | 13.92          | base             |
| `--shirt-unknown` | `#8a8f9c` | neutral gray shirt, unknown project        | 5.38           | no outline       |

Shirt stripe counterparts: one per shirt color, used by the overlay stripe bands (`--shirt-stripe`). Lighter than the shirt for indexes 2, 4, 5, 6; darker for 0, 1, 3, 7, so every stripe stays at least 1.6:1 from its own shirt and 3:1 from `--bg`.

| Index | Shirt     | Stripe    | Stripe contrast on bg | Stripe vs shirt |
| ----- | --------- | --------- | --------------------- | --------------- |
| 0     | `#e69f00` | `#936a0e` | 3.57                  | 2.16            |
| 1     | `#56b4e9` | `#3c769a` | 3.52                  | 2.14            |
| 2     | `#009e73` | `#66c5ab` | 8.40                  | 1.65            |
| 3     | `#f0e442` | `#999336` | 5.45                  | 2.41            |
| 4     | `#0072b2` | `#66aad1` | 6.82                  | 2.03            |
| 5     | `#d55e00` | `#e69e66` | 7.82                  | 1.74            |
| 6     | `#cc79a7` | `#e0afca` | 9.24                  | 1.63            |
| 7     | `#f2f2f2` | `#9a9ca0` | 6.33                  | 2.46            |

Shade and bubble tokens:

| Token            | Value     | Use                                                                   | Contrast                 |
| ---------------- | --------- | --------------------------------------------------------------------- | ------------------------ |
| `--art-shade`    | `#000000` | shade overlay on pixel cells at 25%, 50% or 72%, ground shadow at 35% | not a surface, see rules |
| `--bubble-fill`  | `#e8ebf2` | bubble background (same value as `--text`)                            | 14.57 on bg              |
| `--bubble-text`  | `#161a24` | "Asking you" / "Stuck?" (same value as `--bg`)                        | 14.57 on bubble fill     |
| `--bubble-muted` | `#454d63` | wait time inside the bubble, darker muted pair                        | 7.05 on bubble fill      |

Rules:

- Skin and hair tokens are less saturated than every chromatic shirt (HSV saturation at most 0.38 against 0.41 for the least saturated, purple; light gray and the unknown shirt are neutral by design). Light gray (`#f2f2f2`) is 1.28:1 against `--skin-1`, so the head never relies on that boundary; the visual weight order below covers it.
- Known weak pairs on skin: hair 4 against `--skin-2` is 1.64:1 and `--outline` against `--skin-2` is 1.87:1, so a medium-skin head with auburn hair relies on the hair shape; judge it on the sheet.
- Hair 1 and 4, trousers, shoes and wood are the dark parts. They have no stroke outline: they are separated from their neighbors by palette steps and by sprite pixels (light `--outline` highlight cells, light shoe soles).
- Shade: three overlay steps of `--art-shade` over the base fill, 25% (uppercase cells), 50% (digit cells) and 72% (ink cells for eyes and bezels), as in `OVERLAY` in `src/office/pixel.ts`; a 35% `--outline` highlight marks lit edges. Contrast of the base on `--bg` is the table above and is at least 3:1 for every token (lowest: plastic 3.13, blue shirt 3.35, orange stripe 3.57).
- Shaded cells (25%) on `--bg`, computed by blending the token with black: shirts orange 4.49, sky 4.40, green 3.13, yellow 7.30, blue 2.22, vermillion 2.81, purple 3.43, light gray 8.58, unknown 3.27. Stripes 0 to 7: 2.33, 2.31, 4.86, 3.31, 4.05, 4.57, 5.27, 3.78. Skin 1 to 3: 6.79, 4.37, 2.76. Hair 1 to 4: 2.49, 5.20, 5.37, 2.85. Dark parts: trousers 2.27, shoes 2.53, wood 2.34, plastic 2.10; metal 3.54, screen 3.19, leaf 3.28.
- Deep-shaded cells (50%) on `--bg`: only yellow 3.50, light gray 4.00 and skin 1 3.29 reach 3:1; every other deep step is 1.40 to 2.71 (blue shirt 1.43, trousers 1.48, plastic 1.40). Ink cells (72%) are 1.03 to 1.79 and are interior detail only.
- Weak spots: the shaded blue, vermillion and stripe 0 and 1 shirt cells, shaded skin 3, hair 1 and 4, trousers, shoes, wood and plastic, and every deep step on a dark part, are below 3:1 on `--bg`. Shaded cells may sit on the silhouette edge. The rule that remains true: the BASE (unshaded) fill of each token is at least 3:1 on `--bg`, and the figure silhouette relies on base cells plus the ground shadow, so a shaded edge is read against the base cells and the shadow, not alone against `--bg`. Judge dark parts on the sheet.

## Character art rules

### Visual weight order

Loudest first: waving pose with the violet floor ring, then monitor glow while working, then shirt, then skin and hair. The `?art` sheet (dev only) shows a 12-agent row at 50% with one waving agent, and that agent must read first.

### State to look

Facing is the authored view toward the named target (two views authored, two mirrored).

| State                  | Location                                                                                                                                    | Pose                                                                                  | Facing                               | Held prop                         | Monitor | Bubble | Floor ring      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------- | ------- | ------ | --------------- |
| `arriving`             | walks in from the door to the desk                                                                                                          | `walking`                                                                             | direction of travel                  | none                              | dim     | no     | no              |
| `working`              | at its desk, seated                                                                                                                         | `seated-typing`                                                                       | monitor                              | none                              | live    | no     | no              |
| `waiting-on-subagents` | seated at its desk with short drink breaks (5 to 20 s at a station, every 20 to 60 s; coffee or water, picked 60/40 per break)              | `seated-idle` (`standing-mug` at the coffee station, `standing-cup` at the dispenser) | monitor (the station at the station) | mug or paper cup (at the station) | still   | no     | no              |
| `idle`                 | at its desk, seated; after 2 s a drink trip (walks to the coffee station or the water dispenser, 8 s with the mug or paper cup, walks back) | `seated-idle` (`standing-mug` at the coffee station, `standing-cup` at the dispenser) | monitor                              | none (mug or cup at the station)  | dim     | no     | no              |
| `attention`            | at its desk, seated                                                                                                                         | `seated-raised-hand`                                                                  | monitor                              | none                              | dim     | yes    | yes, `--accent` |
| `leaving`              | walks from the desk to the door                                                                                                             | `walking`                                                                             | direction of travel                  | none                              | dim     | no     | no              |

Monitor: `live` is the animated screen (working only); `still` is a steady half-lit screen with no motion, shown while waiting on subagents whether the parent is seated or at the coffee station (the screen follows agent state only); `dim` is a dark screen. Empty desks are dim. A subagent working at an empty desk gets the same monitor behavior as a parent (live when working, still when waiting on subagents, dim otherwise); its own laptop or tablet, lit when working, half-lit when waiting on subagents, dark otherwise, stays as a static marker, never animated.

Idle means hands off the keyboard. A subagent is not a state: it enters through the door, walks to its PARENT's desk and receives the paper (`walking` with paper), then walks to an EMPTY desk and sits and works there. When it is done it walks back to the parent's desk, hands the paper over, and walks out through the door. The paper lies on the PARENT's desk (never on the monitor), in the desk's paper slot: from the moment a subagent arrives until it takes the sheet, and again from a leaver's handover until the parent has had it at least 4 s (longer while the parent waits on subagents, never past 30 s). It fades over `--dur-slow` when its end is time-driven (taken, or the hold runs out while the parent waits); if the parent stops waiting after the hold has passed, it disappears at once. A subagent still queued at the door has no sheet of its own; its sheet follows the real walk (a leaver's follows where it stands, including from the door queue). Every row draws all four desks, so a lone session always has empty desks to give. Only when no desk is empty does it stand in one of the two reserved slots beside its parent's desk (8C, a plain standing pose with arms down). A subagent keeps its desk until a session takes it; then it walks on to another empty desk or a slot, never jumping.

### Shading and light

Light comes from the screen top-left and is fixed. Shading is pixel cells with three steps: base, `--art-shade` at 25%, and `--art-shade` at 50% (72% for ink); lit edges use `--outline` at 35%. Shaded cells may sit on the silhouette edge. No gradients on characters. Shading is authored in the sprite grids inside the mirror group, so mirrored facings flip the light to the top-right of the sprite. This is accepted: shading is baked into the authored view, and mirroring flips it. The ground shadow is a 24 x 5 cell ellipse of `--art-shade` at 35% opacity, centered under the figure (pixel rows 42 to 46, columns 4 to 27 of the frame), outside the mirror group.

### Outline and separation

There are no 1 px stroke outlines on the pixel figures (the earlier 1 screen px outline stroke rule does not apply to them, and no `--scale` variable exists any more). Dark parts (hair 1 and 4, trousers, shoes, wood) are separated from each other and from the shirt by palette steps and by sprite pixels: `--outline` highlight cells at 35% and light shoe soles. `--outline` is still a token: `#e1e6f2` is 13.92 on `--bg`, and each dark part reaches 3:1 against it (column above). Known weak pair: trousers against the orange, sky, green, vermillion and purple shirts is 1.3 to 2.2:1, so the waist relies on the shirt hem shape; judge it on the sheet. The attention floor ring below draws its stroke through `ringStroke(scale)` (2 screen px).

### Floor ring, focus rectangle, hit area

- Attention ring: an isometric ellipse in the scaled layer, under the character, drawn above the floor and below the chair, `--accent`, stroke `ringStroke(scale)` in `src/office/iso.ts` (2 / scale in scene px, so 2 screen px at every scale; no inherited CSS variable). It is not in the unscaled overlay.
- Keyboard focus is a separate rectangle in the unscaled overlay: `--accent`, 2px, 2px offset, around the hit area.
- Hit area: transparent, at least 24x24 screen px, centered on the torso, in the unscaled overlay. It carries hover, click, focus and the tag position. Accessible name: first name, project, state. Centers stay at least 24 px apart at scale 0.5 for 12 agents.

### Layer order and bubbles

The room shell (floor with a shaded checker, two back walls, baseboards; palette tokens only, no text) is the lowest layer, under every prop and desk. Back to front per desk: floor ring, chair back, character body, desk top and monitor (a raised arm draws above the monitor), desk front edge, mug. Tags and bubbles are in the unscaled overlay on top. Overlapping bubbles: the longer-waiting agent stays on top; the other shifts up in 8px steps, at most 2 shifts, then hides behind its chip. A bubble also never covers another agent's tag or figure (head to feet): it takes the same shifts, then hides. The one exception is the single longest-waiting bubble in the room, which never shifts or hides for an obstacle (it may sit over a neighbour's tag); the obstacle rule applies only to the others. The `?art` sheet (dev only) shows two waving agents side by side.

### Reduced motion destinations

Under `prefers-reduced-motion: reduce`, an agent appears instantly at its semantic place (desk, coffee station, or, for a subagent, its empty desk, else, only beyond the 24-desk cap, a slot beside its parent) with a `--dur-slow` (600ms) opacity fade, and fades out on leaving. No walking, typing tap or bobbing. Attention is a static raised hand with ring and bubble. Paper handoff: nobody walks, so the sheet follows state alone, with a `--dur-slow` (600ms) opacity fade and no travel: it lies for one handover time (600ms) from a placed subagent's arrival, and from a leaver's departure for the same hold as above (4 s, longer while the parent waits, never past 30 s); a queued subagent has none; chip pulse is a static `--accent` outline. A new desk appears with no fade or drop, and any fit change (a row change or a window resize) refits the room at once (no ease). Devices are static pixel art and look the same under reduced motion. Windows are static: the clouds stand still, the rain and snow are not drawn (the sky, skyline and floor light stay), and the scene still changes at the hour boundary.

### Character geometry

Filled at the style gate (task M5), committed before the rest of the rig is drawn. Heights are whole cells of 2 px, so 50% is whole pixels. Values come from the proportions of variant B. The TS grids are the source of truth and are edited by hand; the one-off generator that first drew them is not part of the repo.

| Measure         | Value                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Format          | Hand-drawn pixel frames: palette-indexed text grids in `src/office/sprites.ts`, drawn as SVG rects at 2 px per cell                                                                                                                                                                                                                                                                        |
| Frame size      | 32 x 48 cells = 64 x 96 px; seated typing, seated raised hand and seated idle (back view, legs and lap shown; idle rests the near hand on the knee, hands off the keyboard), walking frames A and B, standing (arms down), standing with mug and standing with paper cup (front view; the cup frame is the mug frame with the mug replaced by a plain white-ish cup, no handle, same size) |
| Standing height | 88 to 90 px (walking frame A rows 0 to 43 is 44 cells; walking frame B, standing, standing with mug and standing with cup rows 0 to 44 are 45 cells; hair tip row 0 for spiky, bun and afro, row 2 for side-part, row 3 for crop); head 13 cells with a 20 x 16 hair layer and headphones on top; the mug or cup is held at rows 22 to 28                                                  |
| Seated height   | 86 px (43 cells: tallest hair tip at row 5, chair base at row 47) for all three seated frames, seen from behind on a chair; the raised-hand frame's raised arm reaches row 6                                                                                                                                                                                                               |
| Views           | Two authored: front faces down-right, back faces up-right; the other two facings are mirrors                                                                                                                                                                                                                                                                                               |
| Hair            | At least 5 styles (spiky, crop, bun, afro, side-part), front and back layers over a bare head, color from `--hair`                                                                                                                                                                                                                                                                         |
| Foot origin     | x 32 (frame center). Walking and standing: y 88 to 90 px, where the soles end (rows 43 and 44; standing frames row 44); seated: chair base at y 96 (row 47). Ground shadow 24 x 5 cells at cell (4, 42), outside the mirror group                                                                                                                                                          |
| Desk            | One iso set, 62 x 61 cells = 124 x 122 px: wood top with bevel, drawers, monitor, keyboard, mug, plant; two kinds of the same size and monitor, a tidy one (adds a lamp) and a cluttered one (books, sticky notes, headphones), alternating by desk index (`src/office/desk-kinds.ts`); seated frame at cell (-8, 15) from the desk puts the hands on the keyboard                         |
| Colors          | Shirt cells `var(--shirt)`, stripe `var(--shirt-stripe)`; overlays of `--art-shade` (25, 50, 72%) and `--outline` (35%) give two-tone shading lit from the top left; all others from the Art palette                                                                                                                                                                                       |
| Projection      | Isometric 2:1 for the desk and feet; figures in 3/4 view                                                                                                                                                                                                                                                                                                                                   |

## Glass tokens

Colors for the wall windows (`docs/designs/office-life-ceo-review.md`, design D6, eng re-run D1/F4). Kept apart from the Art palette: `src/office/palette.ts` exports them as `GLASS`, a separate object, and a drift test compares every hex with this table, so keep one row per token with the hex in backticks. A glass token is set only on a window's own svg root, never on a character, desk or prop root, and it is not an art token (the art tables and the 3:1 art rules do not apply to it). The sky is a glass surface: it is exempt from the 3:1 rule against `--bg`. Instead every glass color is at most as bright as `--plastic`, by WCAG 2.x relative luminance (the cap, 0.1388, is `--plastic` `#626879`), so the scene outside is never brighter than the room's plastic and never relights a character. The frame is drawn in `--wood` and its light variant from the Art palette (at least 3:1 on `--bg`, 3.58 for `--wood`); deep metal (`#464b55`, 1.99 on `--bg`) appears only in the blind slats, which are not the frame.

| Token                 | Value     | Use                                                               | Luminance (cap 0.1388) |
| --------------------- | --------- | ----------------------------------------------------------------- | ---------------------- |
| `--glass-dusk-1`      | `#2a2850` | dusk sky, top band                                                | 0.0259                 |
| `--glass-dusk-2`      | `#64405e` | dusk sky, middle band                                             | 0.0718                 |
| `--glass-dusk-3`      | `#8a5640` | dusk sky, horizon band (also the dusk floor light)                | 0.1243                 |
| `--glass-night-1`     | `#0f1328` | night sky, top band                                               | 0.0072                 |
| `--glass-night-2`     | `#171d38` | night sky, middle band                                            | 0.0135                 |
| `--glass-night-3`     | `#222a4a` | night sky, horizon band (also the night floor light)              | 0.0249                 |
| `--glass-rain-1`      | `#2c3442` | rain sky, top band                                                | 0.0338                 |
| `--glass-rain-2`      | `#394150` | rain sky, middle band                                             | 0.0523                 |
| `--glass-rain-3`      | `#464f5e` | rain sky, horizon band (also the rain floor light)                | 0.0770                 |
| `--glass-snow-1`      | `#38404f` | snow sky, top band                                                | 0.0507                 |
| `--glass-snow-2`      | `#464e60` | snow sky, middle band                                             | 0.0760                 |
| `--glass-snow-3`      | `#545c70` | snow sky, horizon band (also the snow floor light)                | 0.1071                 |
| `--glass-overcast-1`  | `#343a49` | overcast sky, top band                                            | 0.0424                 |
| `--glass-overcast-2`  | `#3f4655` | overcast sky, middle band                                         | 0.0609                 |
| `--glass-overcast-3`  | `#4a5162` | overcast sky, horizon band (also the overcast floor light)        | 0.0822                 |
| `--glass-afternoon-1` | `#34506e` | late-afternoon sky, top band                                      | 0.0759                 |
| `--glass-afternoon-2` | `#546482` | late-afternoon sky, middle band                                   | 0.1261                 |
| `--glass-afternoon-3` | `#7a5e3e` | late-afternoon sky, horizon band (also the afternoon floor light) | 0.1249                 |
| `--glass-skyline`     | `#10142a` | city silhouette, every scene                                      | 0.0078                 |
| `--glass-lit`         | `#726232` | lit windows in the silhouette (dusk, night, rain)                 | 0.1254                 |
| `--glass-cloud-dusk`  | `#6a4a66` | dusk clouds                                                       | 0.0892                 |
| `--glass-cloud-warm`  | `#6c5a58` | late-afternoon clouds                                             | 0.1121                 |
| `--glass-cloud`       | `#5a6276` | overcast clouds                                                   | 0.1222                 |
| `--glass-rain`        | `#5c687c` | rain streaks                                                      | 0.1363                 |
| `--glass-snow`        | `#626879` | snow flakes                                                       | 0.1388                 |

Rules: bands run top to bottom, the lowest ("3") is the horizon band, and it also tints the floor light patch of that scene. Lit windows, clouds, rain and snow are drawn only for the scenes named in the use column. A glass token is a flat fill (no gradient, no opacity, no overlay), with one exception: the floor light patch draws its horizon glass at `FLOOR_LIGHT_OPACITY` (30%, `src/office/palette.ts`), the only glass opacity.

## Typography

- UI font: IBM Plex Sans, bundled with `@fontsource/ibm-plex-sans` (OFL-1.1), weights 400 and 600 only, no network request (R9).
- Stack: `"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif`.
- Name tags and bubbles: 13px, 600 weight for the first name, 400 for project and time.
- Top bar: 14px.
- Tags and bubbles stay a fixed 12px minimum on screen and are never scaled with the room (6D). They live in an unscaled overlay layer.
- Line height 1.4. No uppercase transforms, no letter-spacing tricks.

## Spacing, shape, depth

- Spacing scale in 4px steps: 4, 8, 12, 16, 24, 32. Use no other values.
- Radius: 4px for chips, 6px for bubbles. No cards. No nested boxes.
- Shadows: soft offset shadows under characters and furniture inside the scene only. None on UI chrome.
- Layout: top bar pinned, room below. Minimum window 800x500; narrower replaces only the room with "Make this window larger"; the top bar, status line and chips stay, and the chips wrap to extra rows with no "+N" (DR8, DR11). Room scales to fit, never below 50%; under that it scrolls and the bar stays pinned (6D).

## Motion

- One easing: `--ease: cubic-bezier(0.2, 0.8, 0.2, 1)` (ease-out).
- Three durations: `--dur-fast: 120ms` (hover, focus), `--dur-base: 240ms` (bubble in/out, chip pulse), `--dur-slow: 600ms` (fade in/out on arrive or leave).
- Loops (walk, typing, wave) use `linear` or `ease-in-out`, a named exception to the ease-out rule. Starting timings, tuned at the style gate: walk stride 800ms, typing tap 400ms, wave 1200ms then hold the raised pose. Walking speed is stride length over stride time: `choreo.ts` sets STRIDE_LENGTH 160px and STRIDE_MS = STRIDE_LENGTH / WALK_SPEED (800ms at 200px/s). A walker draws both walking frames and a CSS `steps(1)` loop shows WALK_A for the first half stride and WALK_B for the second, with the bob in phase; pauses and rest use non-walking poses.
- Ambient loops (named exception, same as the loops above): coffee steam (3s ease-in-out, fades up over the machine), water dispenser gurgle (2.4s in 4 steps of whole 2 px cells: two bubbles rise in the jug and fade), plant sway (4s ease-in-out alternate, plus or minus 1.5 degrees), wall clock second hand (60s in 60 steps, synced to the real second at mount), monitor screens (working only: lines of `--screen-glow` on `--screen`, one color pair, 2 cells thick, stepping whole 2 px cells, one step every 600ms, a CSS overlay over the monitor face and not part of the shared desk drawing; the waiting-on-subagents screen is the same overlay at 40% opacity, static). Window weather (named exception, same as the loops above, all CSS only and in whole 2 px cells): rain (streaks 2 cells wide and 4 tall falling straight down, 2.7s in 6 steps of 2 cells, one step per 450ms), snow (2 by 2 cell flakes falling straight down, 8s in 8 steps of 2 cells, one step per second) and cloud drift (120s in 15 steps, one step per 8s, each 2 cells across and 1 row along the wall slope, so a cloud follows the wall; a very slow drift; none of the three steps faster than once per 450ms, so the waving agent stays the loudest motion), each clipped to the open panes and behind the blinds. They are decorative at a fixed pace, never change an agent's `data-state`, and are all off under `prefers-reduced-motion: reduce` (steam hidden, gurgle hidden, plants still, clock second hand absent, a working screen shows the same lines still at full opacity, windows static: clouds still, rain and snow not drawn, the sky and skyline stay). One exception to "never real time": the wall clock shows the real local time (hour and minute hands recomputed from `now`, skewed onto the wall plane as pixel cells). Under reduced motion it updates by the minute only: no second hand, no sweep.
- Desk pop-in: a desk that did not exist in the previous render fades in and drops 8px into place over `--dur-base` (240ms) with `--ease`, no scaling. Nothing pops on the first render or a reload. Under `prefers-reduced-motion: reduce` the desk simply appears.
- Camera exception (the only one, Principle 3): the fit eases on any fit change (a row change, and a window resize too) over `--dur-base` (240ms) with `--ease`, no other duration. The scaled room layer eases by a plain CSS transform transition; the unscaled overlay (hit areas, tags, queue mark) eases through registered custom properties (`--fit-s`, `--fit-x`, `--fit-y`) with the same duration and easing, so overlay and room stay together. Speech bubbles are placed at the final fit and may trail the ease by up to 240ms. A browser without registered custom properties snaps the overlay instead of easing it; positions stay correct. Nothing eases on the first render. Under `prefers-reduced-motion: reduce` the fit changes at once.
- Interrupt rule: a state change mid-walk finishes the current stride to the foot-contact pose, keeps position, then switches. No restart from rest, no teleport. One authored motion per character at a time.
- Walking is a requestAnimationFrame loop that writes position, stacking and opacity straight to the element (no CSS transitions, no per-frame React state); the loop stops once the agent is settled, and a settled agent that will move again (a waiting parent between coffee breaks) is woken by one timer set for its next change, so the loop restarts without polling. A waiting parent's break lengths and gaps are random but fixed by its key and the start of its wait, so a reload shows the same breaks. Paths are straight legs at a fixed walking speed (`choreo.ts`). Typing and wave are CSS keyframes; the desk paper is a CSS fade, shown and hidden from timestamps (`paper.ts`), with one timer in `Scene` re-rendering at the next change.
- `prefers-reduced-motion: reduce` (6B): agents fade in and out (600ms) instead of walking; handoff becomes a highlight between desks; no typing or bobbing; the wave is a static raised hand with the bubble. Destinations: see "Reduced motion destinations".

## Scene rules

- Room: evening dim, monitors (a subagent's too) animate only while the agent is working, a waiting-on-subagents monitor holds a steady half glow, and every other screen (idle, arriving, leaving, attention, empty desks) is dark. No screensaver, no neon.
- Devices (V4): a subagent sitting at a work desk works on its own laptop or tablet, picked by a stable hash of "device:" plus its agent key (same agent, same device, never random); parents show no device, and a subagent's monitor follows its state the same as a parent's. The device lies on the bare desk top inside the desk's device slot (12x5 cells, on the other side of the desk from the paper slot, clear of the monitor face), skewed to the desk-top slope, 2 px cells, art tokens only, no line under two cells thick, across or down (the two end columns of a sheared row excepted). Silhouettes differ: the laptop is a 12x5 three-row lid over a two-row base, the tablet a bare 8x3 slab. The screen is static pixel art in three variants of one grid: lit (`--screen` with its light overlay) while working, half-lit (plain `--screen`) while waiting on subagents, dark (deep metal) otherwise. Nothing on a device animates, so reduced motion changes nothing for it.
- Desks: 4 per row, and every row draws all four (unseated ones are empty with a dim monitor). Rows grow on demand: a row appears at once when the sessions or their subagents need a desk (every subagent takes a free desk, gaps below the highest seat first; seats of sessions that have left still count as taken, and so do the desks of subagents that are walking out), and a row that only subagents needed goes after 60 s of lower demand, counted from the last moment it was needed and held while a subagent still sits in it (checked on the 15 s tick, so 60 to 75 s in practice); rows that sessions need go as soon as the sessions leave. The room stops growing at 24 desks. Two desk kinds (tidy, cluttered) alternate by desk index, never random, so a desk keeps its look; the monitor, paper and device areas stay free of props. New agent takes the first free desk, preferring one beside its project (behind this rule, rows are added so a subagent finds a free desk, until the 24-desk cap); seats come from the server seat table and survive reload (7A, R8). New rows grow toward the viewer. The map is anchored: room coordinates are fixed at the back corner (desk 0), so a new row never moves a desk, the door, the coffee station or the dispenser in the room; only the room's bounds grow (to the left and down) and the fit (scale and offsets, including the centering and the top offset) changes. Adding a row therefore slides and rescales the whole picture together rather than shifting anything inside it.
- Door, coffee station and water dispenser (8A): fixed on the back walls, door at the left, coffee station and the dispenser beside it at the right, all outside the desk grid. Adding a row never moves them. Arrivals enter and leavers exit through the door; the break (a waiting parent's short breaks, 5 to 20 s every 20 to 60 s, and an idle agent's trip) takes coffee at the coffee station or water at the dispenser, picked per break at random 60/40 from a seed of the agent's key and the cycle (or the idle start), so a reload shows the same choice. An agent has one sticky spot index out of 8 and each index has two places, one in front of each station, so any drink is free for any agent that has a spot and no two agents share a place; an agent past the eighth stays seated. The bush plant stands in the back corner behind the door queue.
- Subagents (8C, replaced as the main route by the walk to an empty desk above): each desk reserves two standing slots beside it, used only as the fallback beyond the 24-desk cap, when no desk is empty. Extra subagents wait in a short queue near the door and enter as slots free; the parent's tag shows a small "+N". Only the first 4 queued agents are drawn; a "+N" mark by the door counts the rest. It is not interactive (a click does nothing), and agents beyond the visible queue are reachable only through their waiting chip in the top bar.
- Windows (V1): up to 4 on the back walls, 2 today. One window on the back-right wall between the back corner and the clock, at any row count, and one on the back-left wall beyond the tall plant, drawn only once the wall is long enough for it (from two rows), so a single row has only the right window. There is none between the bush plant and the door: the door queue's four figures stand there (`WALL_LAYOUT` lists the queue's four spots as a standing stretch, and a test checks no window box overlaps any queue, coffee or water spot or its figure box). Windows are anchored in grid steps from the back corner like the door and the clock, so adding a row never moves one, and none overlaps a wall item or a standing spot (`WALL_LAYOUT`; the allowlist has no window entry). A window is a 30 by 36 cell pixel drawing (2 px cells) sheared onto its wall at the wall slope (the left wall rises to the right like the door, the right wall falls like the counter and the clock), with a wood frame 2 cells thick, one mullion, two panes of stepped sky bands, a city skyline, and three blind slats; every line is at least 2 cells thick in every frame as drawn, including the moving clouds, rain and snow (they are drawn in the window's own flat cells, on even columns and rows, and sheared with the sky, so every step stays on the pair lattice; a test composites every scene, both walls and every animation step, and rejects any 1-wide or 1-tall cell with no exception). Glass colors are the Glass tokens above only, and the scene is dim: nothing outside is brighter than `--plastic`, and the glass never relights a character. Scenes (the whole dim set, no bird or plane): dusk, night, rain, snow, overcast and afternoon (a dim late-afternoon day).
- Hour-matched windows: the scene follows the real local hour of `now`, as a pure `sceneFor(date, hour)`: night from 21:00 to 05:59, dusk from 17:00 to 20:59, and by day (06:00 to 16:59) a weather picked by a namespaced hash of `"window:" + local date + ":" + hour` (late-afternoon light, overcast or rain, plus snow from November to March), never `Math.random`. A reload in the same date and hour shows the same scene; another day usually another. The scene changes at the hour boundary only, as an instant swap with no transition. An unknown scene id draws dusk. Dev only: `?scene=<id>` (any id above, read in `main.tsx` under `import.meta.env.DEV`) pins every window to one scene; the `?art` sheet shows each scene on a left-wall and a right-wall window at 100% and 50% with its floor light.
- Floor light: under each window a patch of light on the floor, two panes along the wall by two deep, drawn as parallelograms on the floor plane just inside the floor, tinted with the scene's horizon glass at 30% opacity. It is static, sits in the room shell layer under every desk, ring and character, and never moves.
- Identity tag (1A): first name and project, shown only on hover, keyboard focus, or while waving.

### Debug hooks

State is readable from the DOM (attributes only, no behavior change). Scene root: `data-rows`, `data-desks`. Each desk div: `data-desk`, `data-desk-kind` (`tidy` or `cluttered`), `data-screen`, `data-device`, `data-handoff`. Each character: `data-state`, `data-shirt`, `data-pose`, `data-path`, and on a trip `data-break` (`seated`, `to-coffee`, `at-coffee`, `back`) and `data-drink` (`coffee` or `water`), absent otherwise. Windows: `data-window-scene`. Dev-only URL overrides (`import.meta.env.DEV`, invalid values ignored): `?scene=<id>` pins the window scene, `?hour=<0-23>` forces the hour the window scene is chosen for (not the clock), `?seed=<text>` salts the weather variant seed, `?art` shows the style sheet (which lists the active overrides), `?demo` runs the demo feed.

## Components

### Top bar (pinned)

Left: title "Agent Office" (placeholder name). Middle: status banner, one text line for refused (HTTP 403), reconnecting, or "No active Claude Code sessions" (R5). Right: waiting chips, longest wait first, each a real `<button>`: first name, project, wait time (omit time if unknown). Click pulses that character. Wait times update once per minute, not per frame. Many chips overflow with a "+N" chip; exact wording is tuned at build.

### Speech bubble

"Asking you" (final message ended with `?`) or "Stuck?" (tool-call timer), plus wait time (2B). Never any transcript text. 6px radius, `--bubble-fill` background, `--bubble-text` for the label, `--bubble-muted` for the wait time (Art palette). Overlap nudging: see "Layer order and bubbles".

### Character

Exposes `data-state` (arriving, working, waiting-on-subagents, idle, attention, leaving) and `data-shirt`. Focusable; keyboard order is waiting agents first, then by desk. Focus rectangle uses `--accent`.

## Interaction states

| Feature      | Loading                  | Empty                                         | Error                                                 | Success                            | Partial                                    |
| ------------ | ------------------------ | --------------------------------------------- | ----------------------------------------------------- | ---------------------------------- | ------------------------------------------ |
| Scene        | bar says "Connecting..." | desks empty, "No active Claude Code sessions" | bar says refused (403, not localhost); room as before | agents seated, lit when working    | unknown project: gray shirt, tag "unknown" |
| Chips        | hidden                   | hidden                                        | hidden                                                | longest wait first                 | time unknown: omit time                    |
| Bubble       | n/a                      | n/a                                           | n/a                                                   | "Asking you" or "Stuck?" plus time | time unknown: omit time                    |
| Tab title    | "Agent Office"           | "Agent Office"                                | "Agent Office"                                        | "(N) Agent Office"                 | n/a                                        |
| Reconnecting | bar: "Reconnecting"      | keep last scene as is                         | after retries bar shows refused                       | scene resumes                      | n/a                                        |

## Accessibility

- Hidden `aria-live="polite"` region announces once per attention episode, e.g. "Maya, office-agents, asking you". The state machine assigns the episode id so a flapping timer cannot spam announcements.
- Chips are real buttons; characters are focusable; the focus rectangle uses `--accent` at 2px with a 2px offset around the 24x24 hit area (see "Floor ring, focus rectangle, hit area").
- Text contrast 4.5:1 minimum; graphics 3:1.
- Phone and touch layouts are out of scope (feed refuses non-loopback, R3).

## Performance

Measured with `vp run perf` on headless Chrome 153.0.8010.12 and an Apple M1 Max. Method: `e2e/release.ts` starts a temporary feed with 12 and with 24 agents. Frame time is the 95th percentile (p95) of requestAnimationFrame deltas, sampled on its own fixture page. Row-change recalc is the worst single style-recalculation event (`UpdateLayoutTree`) while one row of 4 agents is added, taken as the median of 3 repeats and compared with 16 ms (one frame). Each repeat waits 5 s idle on a settled page before the write, because a row written right after page load costs about 4.5 ms at 24 agents and 17.5 to 29.8 ms after 5 s idle (in diagnostic runs). The old figure (largest 100 ms chunk minus the median chunk, called "burst") was the gate through 2026-10-04 and was replaced on 2026-10-05; the table keeps its numbers as dated history. It was replaced because it compares a sum over about 6 frames with a 1-frame budget and it was unreliable: the 2026-10-05 baseline run before the fix gave 57.3 ms and 20.1 ms in the same run.

Cause and fix: the unregistered custom property `--scale` was set inline on `.scene-scaled` and inherited, so each fit change restyled about 41,000 elements at 12 agents. The ring stroke is now computed in JS (`ringStroke(scale)` in `src/office/iso.ts`) and `--scale` is gone. The registered `--fit-*` transition and the desk-pop animation were tested and did not matter. Earlier design docs (`docs/designs/character-art-ceo-review.md` D7 and D8) mention `--scale` strokes, which no longer exist; `docs/designs/character-art-merged-tasks.md` and `docs/designs/office-life-ceo-review.md` also still describe `--scale`. The pending Safari item M10 should check the JS `ringStroke` path now.

| Agents | p95 frame (budget)            | Old: burst, 2026-10-04 (before the fix) | New: worst event, median of 3, 2026-10-05 (after the fix)                                                                   |
| ------ | ----------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 12     | 16.7 to 16.8 ms (20 ms), PASS | 48.1 to 49.4 ms, FAIL                   | 14.9, 14.7, 15.6 and 17.3 ms in four runs (the 17.3 ms run had repeats 17.3, 14.8 and 22.2 ms), FAIL in the fourth          |
| 24     | 16.7 to 16.8 ms (33 ms), PASS | 63 to 79 ms, FAIL                       | 19.1, 19.5, 19.3 and 22.6 ms in four runs (single repeats 18.6 to 34.2 ms; fourth run repeats 19.6, 22.6 and 34.2 ms), FAIL |

The 12-agent gate sits on the 16 ms line and can flip between runs: three medians were 0.4 to 1.3 ms under the budget and the fourth was 1.3 ms over. A single 12-agent repeat reached 22.2 ms. The fourth run overlapped with other work on the machine (review agents and an e2e run just before it), so it is noisier. The per-repeat line now prints the worst event's offset after the write; comparing it with the printed 'row appeared' time, in that run the worst 12-agent events fell within 50 ms of the new row appearing, while the 24-agent ones fell 17 to 280 ms before it, so the 24-agent cost is not yet tied to one step. The 24-agent miss has no known cause and is tracked in TODOS.md "Row-change style recalc at 24 agents over budget (2026-10-05)". Safari: not measured (pending; M10 in TODOS.md still needs the Safari pass).

## Open items

- Phase 0 is done: no single CC0 pack covers the needed poses, so characters and props are drawn in one consistent style (notes in `docs/designs/phase-0-sprite-notes.md`). Decisions 4A and 4B in the design doc assumed a sprite pack and were amended to the all-drawn route on 2026-10-01.
- Approved mockup: variant A of 2026-10-01, committed as [docs/designs/mockup-room-variant-a.jpg](docs/designs/mockup-room-variant-a.jpg) (re-encoded as JPEG from the generated 1536x1024 image; it was made with an AI image generator for this project, which is not reproducible). It is the visual reference for the room, with one deliberate difference: the mockup's floor ring and the waving agent's shirt are pink, while the accent token is now violet (`--accent`) so it cannot match a shirt. It shows: regular 2x4 desk grid, door back-left, coffee station back-right, waving agent with bubble, floor ring and name tag, a subagent handing a paper beside its parent, chips in the top bar.
- Gaps seen in the approved mockup (proposals, not decisions): (1) nearly every monitor glows, but the rule is glow only while working; (2) the waving agent's pink shirt and pink ring: the ring must use the violet accent and the shirt must come from the palette; (3) the mockup adds wall posters with text, a window, a clock and an "Online" status that DESIGN.md does not specify (the clock is now specified: Motion, ambient loops; the rest is not); (4) the subagent stands at the back row, not in a reserved slot beside its desk. Resolve each at build time or in a design review.
- The window look is the approved mockup variant B of 2026-10-02 (`~/.gstack/projects/office-agents/designs/office-life-windows-20261002/variant-B.png`: dim dusk glass, city silhouette, blinds, pane-shaped light on the floor), not committed to the repo. It also shows wall posters, a shelf, a bulletin board, a trophy and text, none of which are specified here (no wall dressing, no text, no trophy). Window art is drawn here as hand-set pixel grids at the wall slope; the mockup's windows are a visual reference only.
- Slop checks on A, from the picture: no hero, no card grid, no neon; the evening mood and one strong anchor (the room) hold. "Premium without decorative shadows" is not judged here.
- Brand name "Agent Office" is a placeholder.
