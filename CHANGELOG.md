# Changelog

## [0.0.3.0] - 2026-10-01

### Added

- Every office character and prop is now drawn: isometric pixel people with eight shirt colors (plain and striped), five hairstyles, three skin tones and headphones, in six poses (typing, idle, raised hand, walking, carrying a paper, coffee break), plus desks, a coffee station and six other props.
- A style gate sheet at `/?art` (development only) that shows every frame and prop at once, flags weak color contrast, and has a grayscale check. It is left out of the production build.
- Each agent gets a stable look from its id, so the same agent always sits as the same person.
- Tests that keep the palette in step with `DESIGN.md` and check contrast, the poses, the looks and the sprite data.

### Changed

- `DESIGN.md` now holds the art rules: the palette with checked contrast, the look of each agent state, outline and shading rules, floor ring and hit area sizes, layer order and reduced-motion behavior.
- The roadmap, build checklist and art plan now describe hand-drawn pixel sprites instead of a vector character, and split the art gate into two steps.

## [0.0.2.0] - 2026-10-01

### Added

- A written design system (`DESIGN.md`): the evening color palette with checked contrast, eight project shirt colors, type, spacing, motion, and the rules for the door, coffee station, attention cue and subagent slots.
- A step-by-step build checklist (`BUILD_TODO.md`) that turns the design and review notes into ordered work with a way to check each step.
- Reviews of the Phase 0 art plan (scope, engineering) and a record of the sprite pack check, including a recolor test and a 12-character legibility check.
- An approved look for the office room, chosen from three generated mockups.
- A `NOTICE` file listing the third-party packs that were inspected and why none is used.

### Changed

- The art plan: no free sprite pack has sit, typing and wave poses, so characters and props will be drawn in one consistent style. The roadmap and design notes say so.
- The design notes now place the door on the back wall at the left, the coffee station at the right, and give each desk two standing slots for subagents.
- `.gstack/` is ignored so tool state is not committed.

## [0.0.1.0] - 2026-10-01

### Added

- The README now explains what Office Agents will be: an isometric office that shows your Claude Code agents and subagents as people at desks, with what each state looks like and where the data comes from.
- A short roadmap checklist in the README, with a rule to tick items when they are done and add new ones when new ideas come up.
- A status note saying the app is in early development and the README describes planned behavior.
- A first `VERSION` file and this changelog.

### Changed

- The README replaces the Vite template text and now points to the design notes and the deferred-ideas list.
- Setup notes say to install the `vp` CLI first and to run `vp check` before committing; `vp test` fails until the first test file exists.
