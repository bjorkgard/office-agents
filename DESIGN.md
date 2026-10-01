# DESIGN

Design system for Office Agents: a dim, evening-lit isometric office where Claude Code agents sit at desks. Calm utility UI around a scene that carries the personality. Source decisions are in [docs/designs/office-agents-isometric-office.md](docs/designs/office-agents-isometric-office.md) (ids like 5A, 4A are from there).

Status: tokens below are the contract. They are not yet in `src/index.css` (task DT1); the first implementer copies them to `:root` and removes the Vite template styles. Contrast ratios were computed with the WCAG 2.x relative-luminance formula, (L1+0.05)/(L2+0.05), against `--bg` unless a column says otherwise; recompute when any token changes. Color-blind safety of the shirt set comes from the published palette, not from a simulation run on this project.

## Principles

1. The room is the anchor. UI chrome stays quiet so a waving agent is the loudest thing on screen.
2. Attention is never color alone (8B). Pose, bubble and floor ring carry it; color only reinforces.
3. Calm by default. No sound, no camera movement, no neon (4C, 3A).
4. Nothing is read from transcripts into the UI: bubbles say "Asking you" or "Stuck?" plus wait time, never message text (2B).
5. A stable map. Desks, door and coffee station do not move once placed (8A).

## Color tokens

Dark only; there is no light theme (design doc, "NOT in scope").

| Token           | Value     | Use                                     | Contrast                  |
| --------------- | --------- | --------------------------------------- | ------------------------- |
| `--bg`          | `#161a24` | room backdrop, page                     | base                      |
| `--bar`         | `#1d2230` | pinned top bar                          | base                      |
| `--text`        | `#e8ebf2` | tags, bar text                          | 14.57 on bg, 13.29 on bar |
| `--text-muted`  | `#9aa3b8` | wait times, secondary                   | 6.88 on bg, 6.27 on bar   |
| `--accent`      | `#b388ff` | waving ring, focus ring, chip highlight | 6.53 on bg, 5.95 on bar   |
| `--warn`        | `#ffb454` | "Reconnecting" status text              | 9.86 on bg                |
| `--screen-glow` | `#8fd6ff` | monitor glow while working only         | decorative                |

Rules: text pairs must stay at or above 4.5:1. Graphics (rings, shirts, glow) must stay at or above 3:1 against `--bg`; blue (`#0072b2`) is 3.35 there and about 3.06 on `--bar`, so draw shirts on the room background only. No hard-coded colors outside this table.

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
- Walking, typing, wave and paper handoff use CSS transforms and transitions, never per-frame React state.
- `prefers-reduced-motion: reduce` (6B): agents fade in and out instead of walking; handoff becomes a highlight between desks; no typing or bobbing; the wave is a static raised hand with the bubble.

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

"Asking you" (final message ended with `?`) or "Stuck?" (tool-call timer), plus wait time (2B). Never any transcript text. 6px radius, `--text` on `--bar`.

### Character

Exposes `data-state` (arriving, working, waiting-on-subagents, idle, attention, leaving) and `data-shirt`. Focusable; keyboard order is waiting agents first, then by desk. Focus ring uses `--accent`.

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
- Chips are real buttons; characters are focusable; focus ring uses `--accent` at 2px with a 2px offset.
- Text contrast 4.5:1 minimum; graphics 3:1.
- Phone and touch layouts are out of scope (feed refuses non-loopback, R3).

## Open items

- Phase 0 is done: no single CC0 pack covers the needed poses, so characters and props are drawn in one consistent style (notes in `docs/designs/phase-0-sprite-notes.md`). Decisions 4A and 4B in the design doc assumed a sprite pack and were amended to the all-drawn route on 2026-10-01.
- Approved mockup: variant A of 2026-10-01, committed as [docs/designs/mockup-room-variant-a.jpg](docs/designs/mockup-room-variant-a.jpg) (re-encoded as JPEG from the generated 1536x1024 image; it was made with an AI image generator for this project, which is not reproducible). It is the visual reference for the room, with one deliberate difference: the mockup's floor ring and the waving agent's shirt are pink, while the accent token is now violet (`--accent`) so it cannot match a shirt. It shows: regular 2x4 desk grid, door back-left, coffee station back-right, waving agent with bubble, floor ring and name tag, a subagent handing a paper beside its parent, chips in the top bar.
- Gaps seen in the approved mockup (proposals, not decisions): (1) nearly every monitor glows, but the rule is glow only while working; (2) the waving agent's pink shirt and pink ring: the ring must use the violet accent and the shirt must come from the palette; (3) the mockup adds wall posters with text, a window, a clock and an "Online" status that DESIGN.md does not specify; (4) the subagent stands at the back row, not in a reserved slot beside its desk. Resolve each at build time or in a design review.
- Slop checks on A, from the picture: no hero, no card grid, no neon; the evening mood and one strong anchor (the room) hold. "Premium without decorative shadows" is not judged here.
- Brand name "Agent Office" is a placeholder.
