# DESIGN

Design system for Office Agents: a dim, evening-lit isometric office where Claude Code agents sit at desks. Calm utility UI around a scene that carries the personality. Source decisions are in [docs/designs/office-agents-isometric-office.md](docs/designs/office-agents-isometric-office.md) (ids like 5A, 4A are from there).

Status: tokens below are the contract and are now in `src/index.css` `:root` (the Vite template styles are removed). Contrast ratios were computed with the WCAG 2.x relative-luminance formula, (L1+0.05)/(L2+0.05), against `--bg` unless a column says otherwise; recompute when any token changes. Color-blind safety of the shirt set comes from the published palette, not from a simulation run on this project.

## Principles

1. The room is the anchor. UI chrome stays quiet so a waving agent is the loudest thing on screen.
2. Attention is never color alone (8B). Pose, bubble and floor ring carry it; color only reinforces.
3. Calm by default. No sound, no camera movement, no neon (4C, 3A).
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

Seven colors from the Okabe-Ito color-blind-safe set plus light gray (replacing Okabe-Ito's black, which is invisible on the dark background), and a stripe pattern from the 9th active project (unique for up to 16). Unknown project: neutral gray shirt and tag "unknown".

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

Selection is pure and lives in `identity.ts`: hash the project path, avoid collisions among active projects. Phase 0 chose all-drawn art, so recolor is a variable or fill on the drawn shirt, not a pixel key-color swap; decision 4B was amended to this route on 2026-10-01 (design doc, decision table). Expose the index as `data-shirt` for tests.

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

| State                  | Location                           | Pose                 | Facing              | Held prop | Monitor | Bubble | Floor ring      |
| ---------------------- | ---------------------------------- | -------------------- | ------------------- | --------- | ------- | ------ | --------------- |
| `arriving`             | walks in from the door to the desk | `walking`            | direction of travel | none      | dim     | no     | no              |
| `working`              | at its desk, seated                | `seated-typing`      | monitor             | none      | lit     | no     | no              |
| `waiting-on-subagents` | standing at the coffee station     | `standing-mug`       | coffee station      | mug       | dim     | no     | no              |
| `idle`                 | at its desk, seated                | `seated-idle`        | monitor             | none      | dim     | no     | no              |
| `attention`            | at its desk, seated                | `seated-raised-hand` | monitor             | none      | dim     | yes    | yes, `--accent` |
| `leaving`              | walks from the desk to the door    | `walking`            | direction of travel | none      | dim     | no     | no              |

Idle means hands off the keyboard. A subagent is not a state: it stands in a reserved slot beside its parent's desk (8C); during a handoff it carries a paper (`walking` with paper) and the paper highlights at both desks. Its pose is a plain standing pose with arms down.

### Shading and light

Light comes from the screen top-left and is fixed. Shading is pixel cells with three steps: base, `--art-shade` at 25%, and `--art-shade` at 50% (72% for ink); lit edges use `--outline` at 35%. Shaded cells may sit on the silhouette edge. No gradients on characters. Shading is authored in the sprite grids inside the mirror group, so mirrored facings flip the light to the top-right of the sprite. This is accepted: shading is baked into the authored view, and mirroring flips it. The ground shadow is a 24 x 5 cell ellipse of `--art-shade` at 35% opacity, centered under the figure (pixel rows 42 to 46, columns 4 to 27 of the frame), outside the mirror group.

### Outline and separation

There are no 1 px stroke outlines on the pixel figures (the `calc(1px / var(--scale))` stroke rule does not apply to them). Dark parts (hair 1 and 4, trousers, shoes, wood) are separated from each other and from the shirt by palette steps and by sprite pixels: `--outline` highlight cells at 35% and light shoe soles. `--outline` is still a token: `#e1e6f2` is 13.92 on `--bg`, and each dark part reaches 3:1 against it (column above). Known weak pair: trousers against the orange, sky, green, vermillion and purple shirts is 1.3 to 2.2:1, so the waist relies on the shirt hem shape; judge it on the sheet. The attention floor ring below keeps its `calc(2px / var(--scale))` stroke.

### Floor ring, focus rectangle, hit area

- Attention ring: an isometric ellipse in the scaled layer, under the character, drawn above the floor and below the chair, `--accent`, stroke `calc(2px / var(--scale))`. It is not in the unscaled overlay.
- Keyboard focus is a separate rectangle in the unscaled overlay: `--accent`, 2px, 2px offset, around the hit area.
- Hit area: transparent, at least 24x24 screen px, centered on the torso, in the unscaled overlay. It carries hover, click, focus and the tag position. Accessible name: first name, project, state. Centers stay at least 24 px apart at scale 0.5 for 12 agents.

### Layer order and bubbles

Back to front per desk: floor ring, chair back, character body, desk top and monitor (a raised arm draws above the monitor), desk front edge, mug. Tags and bubbles are in the unscaled overlay on top. Overlapping bubbles: the longer-waiting agent stays on top; the other shifts up in 8px steps, at most 2 shifts, then hides behind its chip. The `?art` sheet (dev only) shows two waving agents side by side.

### Reduced motion destinations

Under `prefers-reduced-motion: reduce`, an agent appears instantly at its semantic place (desk, coffee station, or beside its parent) with a `--dur-slow` (600ms) opacity fade, and fades out on leaving. No walking, typing tap or bobbing. Attention is a static raised hand with ring and bubble. Paper handoff is a 600ms highlight on the paper at both desks; chip pulse is a static `--accent` outline.

### Character geometry

Filled at the style gate (task M5), committed before the rest of the rig is drawn. Heights are whole cells of 2 px, so 50% is whole pixels. Values come from the proportions of variant B. The TS grids are the source of truth and are edited by hand; the one-off generator that first drew them is not part of the repo.

| Measure         | Value                                                                                                                                                                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format          | Hand-drawn pixel frames: palette-indexed text grids in `src/office/sprites.ts`, drawn as SVG rects at 2 px per cell                                                                                                                                                                                             |
| Frame size      | 32 x 48 cells = 64 x 96 px; seated typing, seated raised hand and seated idle (back view, legs and lap shown; idle rests the near hand on the knee, hands off the keyboard), walking frames A and B, standing (arms down) and standing with mug (front view)                                                    |
| Standing height | 88 to 90 px (walking frame A rows 0 to 43 is 44 cells; walking frame B, standing and standing with mug rows 0 to 44 are 45 cells; hair tip row 0 for spiky, bun and afro, row 2 for side-part, row 3 for crop); head 13 cells with a 20 x 16 hair layer and headphones on top; the mug is held at rows 22 to 28 |
| Seated height   | 86 px (43 cells: tallest hair tip at row 5, chair base at row 47) for all three seated frames, seen from behind on a chair; the raised-hand frame's raised arm reaches row 6                                                                                                                                    |
| Views           | Two authored: front faces down-right, back faces up-right; the other two facings are mirrors                                                                                                                                                                                                                    |
| Hair            | At least 5 styles (spiky, crop, bun, afro, side-part), front and back layers over a bare head, color from `--hair`                                                                                                                                                                                              |
| Foot origin     | x 32 (frame center). Walking and standing: y 88 to 90 px, where the soles end (rows 43 and 44; standing frames row 44); seated: chair base at y 96 (row 47). Ground shadow 24 x 5 cells at cell (4, 42), outside the mirror group                                                                               |
| Desk            | One iso set, 62 x 61 cells = 124 x 122 px: wood top with bevel, drawers, monitor, keyboard, mug, plant; seated frame at cell (-8, 15) from the desk puts the hands on the keyboard                                                                                                                              |
| Colors          | Shirt cells `var(--shirt)`, stripe `var(--shirt-stripe)`; overlays of `--art-shade` (25, 50, 72%) and `--outline` (35%) give two-tone shading lit from the top left; all others from the Art palette                                                                                                            |
| Projection      | Isometric 2:1 for the desk and feet; figures in 3/4 view                                                                                                                                                                                                                                                        |

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
- Layout: top bar pinned, room below. Minimum window 800x500; narrower shows "Make this window wider". Room scales to fit, never below 50%; under that it scrolls and the bar stays pinned (6D).

## Motion

- One easing: `--ease: cubic-bezier(0.2, 0.8, 0.2, 1)` (ease-out).
- Three durations: `--dur-fast: 120ms` (hover, focus), `--dur-base: 240ms` (bubble in/out, chip pulse), `--dur-slow: 600ms` (fade in/out on arrive or leave).
- Loops (walk, typing, wave) use `linear` or `ease-in-out`, a named exception to the ease-out rule. Starting timings, tuned at the style gate: walk stride 800ms, typing tap 400ms, wave 1200ms then hold the raised pose. Walking speed is stride length over stride time.
- Interrupt rule: a state change mid-walk finishes the current stride to the foot-contact pose, keeps position, then switches. No restart from rest, no teleport. One authored motion per character at a time.
- Walking, typing, wave and paper handoff use CSS transforms and transitions, never per-frame React state.
- `prefers-reduced-motion: reduce` (6B): agents fade in and out (600ms) instead of walking; handoff becomes a highlight between desks; no typing or bobbing; the wave is a static raised hand with the bubble. Destinations: see "Reduced motion destinations".

## Scene rules

- Room: evening dim, monitors glow only while the agent is working, idle screens dim. No neon.
- Desks: 4 per row. New agent takes the first free desk, preferring one beside its project; seats come from the server seat table and survive reload (7A, R8). New rows grow toward the viewer.
- Door and coffee station (8A): fixed on the back wall, door at the left, coffee at the right, both outside the desk grid. Adding a row never moves them. Arrivals enter and leavers exit through the door; the coffee break (waiting on subagents) happens at the coffee station.
- Subagents (8C): each desk reserves two standing slots beside it. Extra subagents wait in a short queue near the door and enter as slots free; the parent's tag shows a small "+N".
- Identity tag (1A): first name and project, shown only on hover, keyboard focus, or while waving.

## Components

### Top bar (pinned)

Left: title "Agent Office" (placeholder name). Middle: status banner, one text line for refused (HTTP 403), reconnecting, or "No active Claude Code sessions" (R5). Right: waiting chips, longest wait first, each a real `<button>`: first name, project, wait time (omit time if unknown). Click pulses that character. Wait times update once per minute, not per frame. Many chips overflow with a "+N" chip; exact wording is tuned at build.

### Speech bubble

"Asking you" (final message ended with `?`) or "Stuck?" (tool-call timer), plus wait time (2B). Never any transcript text. 6px radius, `--bubble-fill` background, `--bubble-text` for the label, `--bubble-muted` for the wait time (Art palette). Overlap nudging: see "Layer order and bubbles".

### Character

Exposes `data-state` (arriving, working, waiting-on-subagents, idle, attention, leaving) and `data-shirt`. Focusable; keyboard order is waiting agents first, then by desk. Focus rectangle uses `--accent`.

## Interaction states

| Feature      | Loading                             | Empty                                                 | Error                                           | Success                            | Partial                                    |
| ------------ | ----------------------------------- | ----------------------------------------------------- | ----------------------------------------------- | ---------------------------------- | ------------------------------------------ |
| Scene        | desks dim, bar says "Connecting..." | desks empty and dim, "No active Claude Code sessions" | bar says refused (403, not localhost); room dim | agents seated, lit when working    | unknown project: gray shirt, tag "unknown" |
| Chips        | hidden                              | hidden                                                | hidden                                          | longest wait first                 | time unknown: omit time                    |
| Bubble       | n/a                                 | n/a                                                   | n/a                                             | "Asking you" or "Stuck?" plus time | time unknown: omit time                    |
| Tab title    | "Agent Office"                      | "Agent Office"                                        | "Agent Office"                                  | "(N) Agent Office"                 | n/a                                        |
| Reconnecting | bar: "Reconnecting"                 | keep last scene, dimmed                               | after retries bar shows refused                 | scene resumes                      | n/a                                        |

## Accessibility

- Hidden `aria-live="polite"` region announces once per attention episode, e.g. "Maya, office-agents, asking you". The state machine assigns the episode id so a flapping timer cannot spam announcements.
- Chips are real buttons; characters are focusable; the focus rectangle uses `--accent` at 2px with a 2px offset around the 24x24 hit area (see "Floor ring, focus rectangle, hit area").
- Text contrast 4.5:1 minimum; graphics 3:1.
- Phone and touch layouts are out of scope (feed refuses non-loopback, R3).

## Open items

- Phase 0 is done: no single CC0 pack covers the needed poses, so characters and props are drawn in one consistent style (notes in `docs/designs/phase-0-sprite-notes.md`). Decisions 4A and 4B in the design doc assumed a sprite pack and were amended to the all-drawn route on 2026-10-01.
- Approved mockup: variant A of 2026-10-01, committed as [docs/designs/mockup-room-variant-a.jpg](docs/designs/mockup-room-variant-a.jpg) (re-encoded as JPEG from the generated 1536x1024 image; it was made with an AI image generator for this project, which is not reproducible). It is the visual reference for the room, with one deliberate difference: the mockup's floor ring and the waving agent's shirt are pink, while the accent token is now violet (`--accent`) so it cannot match a shirt. It shows: regular 2x4 desk grid, door back-left, coffee station back-right, waving agent with bubble, floor ring and name tag, a subagent handing a paper beside its parent, chips in the top bar.
- Gaps seen in the approved mockup (proposals, not decisions): (1) nearly every monitor glows, but the rule is glow only while working; (2) the waving agent's pink shirt and pink ring: the ring must use the violet accent and the shirt must come from the palette; (3) the mockup adds wall posters with text, a window, a clock and an "Online" status that DESIGN.md does not specify; (4) the subagent stands at the back row, not in a reserved slot beside its desk. Resolve each at build time or in a design review.
- Slop checks on A, from the picture: no hero, no card grid, no neon; the evening mood and one strong anchor (the room) hold. "Premium without decorative shadows" is not judged here.
- Brand name "Agent Office" is a placeholder.
