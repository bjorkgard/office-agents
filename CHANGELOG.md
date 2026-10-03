# Changelog

## [0.4.0.0] - 2026-10-04

### Added

- A browser test suite now checks the real office end to end. It replays recorded Claude sessions, watches each agent change state in Chromium, and covers the wave on a waiting question, a subagent walking in and out, agents leaving after a quiet spell, the empty and refused banners, a 12-agent room with a "+N" chip, reduced motion, shirt colors, the tab title, keyboard order and focus, and one screenshot of the scene. Run it with `vp run e2e` (install the browser once with `npx playwright install chromium`).
- A GitHub Actions workflow runs the checks, the unit tests and the browser suite on every push and pull request. A manual job produces the Linux screenshot baseline.
- Each test scenario starts its own dev server on ports 5201 to 5206 with its own transcript folder and its own build cache, so scenarios cannot disturb each other or a dev server already running on port 5173.

### Changed

- `vp test` skips the browser specs under `e2e/` and still runs the helper tests.
- The feed folder and the build cache can be set with `OFFICE_E2E_ROOT` and `OFFICE_E2E_CACHE`; with neither set, `vp dev` reads your real Claude sessions as before.

## [0.3.0.0] - 2026-10-03

### Added

- The room feels alive. The wall clock now shows the real local time, and the windows show a night, dusk, rain, snow, overcast or afternoon view that follows the hour, with clouds, rain or snow drifting past and a faint patch of light on the floor.
- Desks come in two layouts, and every working agent's monitor shows scrolling lines. A waiting agent's screen stays half lit and an idle agent's screen goes dark, so you can read the room at a glance.
- When a parent hands work to a subagent, a sheet of paper appears on its desk and fades away when the work is done. Subagents work on a laptop or a tablet.
- A waiting parent takes short, random breaks, now to a coffee machine or a new water dispenser (the drink changes the mug it carries), then goes back to its desk and takes another break later. Reloading the page keeps the same schedule.
- The room grows a row when many subagents run at once, up to 24 desks. Extra helpers stand beside their parent or queue at the door, and the room eases to its new size and shrinks again after about a minute.
- Debug hooks for tests and bug reports: `data-rows`, `data-desks`, `data-desk-kind`, `data-screen`, `data-device`, `data-break`, `data-drink` and `data-window-scene`, plus development-only `?scene=`, `?hour=` and `?seed=` overrides, shown on the `?art` style sheet.

### Changed

- Name tags, hit areas and speech bubbles now ease with the room when it resizes instead of jumping.
- The style sheet at `?art` shows every new item at full and half size, including a 24-desk wall.

### Fixed

- The clock's second hand and the screen stripes now use the right colours (their colour variables were not defined where they were drawn).
- A long timer for the desk paper can no longer fire immediately and re-render the room in a loop after a wall-clock change.

## [0.2.0.0] - 2026-10-02

### Added

- The office now comes alive. Run the app and your Claude Code agents walk in through the door, sit at desks, type while they work, and raise a hand and wave when one needs you. A speech bubble shows how long it has been waiting, and a name tag shows the agent and its project. Subagents appear as small helpers beside their parent.
- A top bar with a live connection status, a count of agents waiting on you, and a chip for each waiting agent. Clicking a chip focuses that agent and pulses it. The browser tab title shows how many agents need you, and the tab icon gets a dot.
- The page reads the agent feed over a live connection, replays recent history when it reconnects, and shows a clear message when the feed is unavailable or the window is too small.
- Keyboard and screen reader support: every agent that needs you is a button, changes are announced politely, and reduced motion turns movement off while keeping every cue visible.
- A demo office at `/?demo` (development only) so you can see the scene without running real sessions.
- Ambient life in the room: steam from the coffee station, a ticking wall clock and swaying plants.

### Changed

- The desk row width is now one shared setting used by both the feed server and the page, so seats always match.
- Idle agents' pose changes wait for the current animation to finish, so characters no longer snap mid-motion.
- An agent that asked a question stays visible for up to four hours, and old tool calls expire after thirty minutes.

### Fixed

- A project or agent id named like a built-in object member (such as `constructor`) can no longer break the office.
- A single feed frame with an absurd desk number is skipped instead of freezing the tab.
- After a fatal feed error the top bar now says the feed is unavailable instead of claiming it is live.

## [0.1.0.0] - 2026-10-01

### Added

- A shared definition of the events the office will listen to (agent started, working, waiting on subagents, needs attention, handoff, done), with a checker that rejects malformed or oversized events instead of letting them reach the office.
- The app now loads IBM Plex Sans from the project itself, so the page makes no font requests to other sites. The font's licence text is included in `NOTICE`.
- The page now uses the evening palette, spacing, timing and type sizes from `DESIGN.md`, with a visible violet focus ring for keyboard users and shorter animation timings when reduced motion is on.
- Tests that keep the page styles, the font setup and the licence notice in step with `DESIGN.md`, plus tests for the event checker.

### Changed

- The starter Vite page is replaced by a plain "Agent Office" placeholder, and the browser tab is now titled "Agent Office". The unused starter images and styles are gone.
- The build checklist and design doc now describe the attention signal as a heuristic and say the office, not the event feed, decides when an attention episode starts and ends.

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
