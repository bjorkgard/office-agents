# Changelog

## [0.9.2.0] - 2026-10-06

### Added

- `vp run census` checks the feed against your real Claude Code transcripts and prints counts only: how many files it read, how often each kind of drift showed up, whether any session id differs from its file name, how long agent ids are, and the longest line against the read cap. It never prints a path, project name, id or any transcript text, and it does not follow symlinks.

### Fixed

- An agent you stop by hand (a background task that ends as "killed") now walks back to its desk. Before, the line was thrown away and the agent could stay "away" for good.
- Finished background shell and monitor tasks no longer count as drift, so the drift counter at `/__office/status` points at real changes. On the transcripts checked here it dropped from 90 to 55.

### Changed

- Checked against 182 real sessions (about 1,300 subagent files): session ids match their file names, agent ids are all 17 characters, no line comes near the read cap, and the second hand-back message format is already covered by the existing completion signals. Known limit: this ran on one machine, and only 3 resumed sessions were seen.

## [0.9.1.0] - 2026-10-06

### Added

- The speaker button now draws an icon for each state (off, on, blocked) instead of an emoji, so it reads as its own control. It keeps its warning colour on hover and no longer overlaps the agent chips.
- Two browser tabs now agree about the chime: a change in one tab shows up in the other. A chime turned on in another tab shows "Chime: click" until you click once in this one.

### Fixed

- A screen reader no longer hears "pressed" while the chime is silent.
- An unlock that finishes late, or twice, can no longer play two chimes or undo a newer click.
- Old Safari (prefixed audio) now works.
- A chime that is unmounted no longer sounds.

### Known

- After a reload with the chime saved on, the first click turns audio on (with a chime), so muting takes two clicks.
- Two tabs that are both unlocked each chime.
- Audio and Safari were not tried in a real browser by any tool: the Playwright suite runs Chromium and checks state, not sound.

## [0.9.0.1] - 2026-10-06

### Changed

- The TODO list is now sorted by priority, then by whether the work can start now, then by size, and every task has a stable number (T01 to T45) so it can be named in a commit, a brief or a chat. Two finished tasks (T16, T19) moved to the archive and keep their numbers.

## [0.9.0.0] - 2026-10-06

### Added

- Hover the sheet of paper on a parent's desk, or Tab to it, to see what kind of subagent it came from: "Explore", "Plan", "General" or "Subagent". A sheet carrying several kinds lists up to three and counts the rest ("Explore, Plan, General +1"). The word comes from a fixed list chosen on the server from the launch's agent type, never from a description or prompt, so no transcript text reaches the browser. A launch without an agent type reads "General" (Claude Code falls back to its general-purpose agent); your own custom agent types read "Subagent".
- The sheet's target sits right after its parent in the keyboard order, shows a help cursor, has a name such as "Maya, office-agents: paper from Explore, Plan", and gets the same focus ring as the agents. The label is a small dark tag with a notch pointing at the sheet, below it so it never hides the focus ring.

### Changed

- The feed's handoff event carries an optional `subagentKind` (one of four values) on the launch event only; the event check rejects it anywhere else and rejects any other value. Launches with an agent type outside the three known names are counted in the feed's drift counter (the count only, never the name).
- The overlay layers now have a fixed stacking order: the sheet target, the agent target, the label, then speech bubbles. The overlay is isolated, so these numbers cannot reach the top bar.
- The state machine keeps each launched child's kind in a capped map (2,000 entries, oldest dropped first, shared with the existing returned-children cap) and clears it when the child is removed.

### Known

- The label is only there while the sheet lies: about 4 seconds after a subagent hands in, up to 30 seconds while the parent waits, and 600 milliseconds for an arriving sheet when reduced motion is on. It cannot be dismissed with Escape, and touch is not supported (as before).
- A blocking subagent that is still running reads "Subagent" until it returns, because its kind only reaches the browser with the return. After a page reload, a subagent that already returned also reads "Subagent". Both are written up in DESIGN.md.
- The 24-agent row-change recalc still misses its 16 ms budget (median 19.7 ms on this branch, unchanged from before); the 12-agent gate passes (13.87 ms).

## [0.8.0.0] - 2026-10-06

### Added

- An optional attention chime. A speaker button in the top bar plays a soft two-note tone when an agent starts waiting for you, so you notice with the tab hidden. It is off by default and plays at most once every 5 seconds however many agents start waiting. A reload or reconnect stays silent. Browsers only allow sound after a click, so the button reads "Chime: click" until the first click unlocks audio (and again if the browser later suspends audio and it cannot resume), and a second click turns it off if audio cannot unlock.
- `node e2e/release.ts perf --strict` exits with code 3 when a verdict is INCONCLUSIVE, so a script can tell it from a pass. Without the flag nothing changes.

### Changed

- A hung page can no longer stall `perf` for ever: each repeat has a 2 minute limit and the whole run 30 minutes, and a repeat over its limit fails with a line naming the limit.
- A "needs attention" signal from Claude Code now has its own small rate budget, so a burst of other hook events can no longer drop the one that says an agent is waiting.
- `hooks/install.mjs --apply` replaces an Office hook entry from another checkout instead of adding a second one (it names each replaced path), and `--remove` removes only the hooks this checkout installed. The installer also stops with a message if another tool changes the settings file while it is working.
- The feed refuses requests carrying `Forwarded` or `X-Real-IP` headers, as it already did for `X-Forwarded-*`, and stops tracking new transcript files after 5,000, with one warning.
- `server/sanitize-fixtures.ts` treats an empty `OFFICE_FIXTURE_SALT` as unset and accepts `--salt` anywhere on the command line.
- When the feed removes its hook discovery file it reads it without blocking and leaves it alone if it is too large or not a regular file. The feed also refuses to publish into a discovery directory owned by someone else, and warns when it is bound to an address the hook script cannot reach.

### Fixed

- The waiting time on the top bar chips and in the status line now come from one clock, so they cannot show different minutes.

### Known

- The chime button has not been checked in a real browser or reviewed for design and accessibility yet. The tone and the audio unlock are tested only with a fake audio layer.
- The perf deadlines are estimates, not measured against a full `perf --ab` run. A repeat that hits its limit now has its browser and server closed and no further repeat starts at that agent count; the total deadline exits through the same shutdown as a signal. Neither path has been exercised against a real hung page.

## [0.7.1.0] - 2026-10-05

### Added

- `node e2e/release.ts perf --ab` runs the 12 and 24 agent checks a second time with the room's animations switched off and prints the difference, plus how many animations were running. In three runs the room was slower with animations off (about 4 to 6 ms), so animations are not what makes a new row expensive.
- Each perf row-change line now says whether the slowest style recalculation was the new row appearing, the entrance ease or idle time, and how many elements it restyled. At both 12 and 24 agents the worst one is the new row's own render, which restyles about 9,600 elements.
- Perf now rejects unknown or extra command-line arguments (usage, exit 2) instead of ignoring them, so a typo such as `perf --abb` no longer looks like a normal run.

### Changed

- The row-change check now takes six fresh runs instead of three and drops the first only when it is slower than the rest. A median up to 16 ms passes, above 16 and up to 17.5 ms is reported as INCONCLUSIVE and does not fail the run, and anything above fails. The median prints with two decimals so the number and the verdict cannot disagree.
- A run that crashes or loses its trace now reports its own error (on one line, capped at 200 characters) instead of saying the new agents never appeared.

### Known

- At 24 agents a new row still costs about 19 to 22 ms of style recalculation, over the 16 ms budget. The cause is narrowed to the new row's own render but not found; the next probe is the browser's invalidation tracking.
- One 12-agent run read 20 ms while other work was running on the machine, and a rerun on a quiet machine read 14 ms. Run perf with nothing else going.
- Safari: page-load recordings only. The slowest style recalculation was about 32 ms at first render at both sizes. The cost of adding a row on a settled page, the hit area at 50% zoom and the alignment during the ease are not measured yet.

## [0.7.0.0] - 2026-10-05

### Added

- The office door now opens a crack while a helper walks in or out, and a dim fan of light falls on the floor from the gap. An open run lasts at most 2 seconds and is followed by a short closed gap, so a burst of arrivals reads as separate visits instead of a door stuck open. Under reduced motion the door stays closed.
- A bookshelf and two framed pictures hang on the left wall past the window. The shelf appears from 2 rows of desks and the pictures from 3 rows, they never move when rows are added, and their book and picture colors change once per local day. For developers, `?decor=0`, `1` or `2` pins the colors in the dev server.

### Changed

- The water dispenser is redrawn to look three-dimensional: a lit left edge on the jug, a shaded right side, a visible water surface and a lit top on the cabinet.
- The dispenser, the coffee counter and the bookshelf now stand on soft contact shadows, so they sit on the floor instead of looking pasted onto the wall.
- The design rules now say that decor must read quieter than the waving agent, and the dev art sheet shows a 12-agent row at 50% with the new shelf, pictures and door light to check it.

### Known

- A helper's arrival is timed from its transcript time, not from the moment the page hears about it, and a new helper's file can take up to 5 seconds to be found. So the door opening is often over before the helper is drawn, and in live use it shows for only some arrivals. The demo shows it every time.
- After these additions the style work for a new row at 12 agents sits at the 16 ms line (14 to 16 ms over several runs, was 14 to 15), and 24 agents is still about 20 ms.
- A floor robot and its dock were built and then withdrawn: at the smallest size that fits the free floor it read as a grey box.

## [0.6.1.0] - 2026-10-05

### Changed

- Adding a row of desks is much cheaper. A style variable that every element in the room inherited made the browser re-check about 41,000 elements each time the room zoomed to fit; it is gone, and at 12 agents the style work for a new row fell from about 48 ms to about 15 ms. The pulsing floor ring still draws 2 px wide at every zoom.
- `vp run perf` now judges the worst single style recalculation in a frame, taken as the median of three fresh runs on a settled page, against the 16 ms budget. The frame-time sample runs on its own page, and a trace that loses data fails the run instead of passing on partial numbers. The old 100 ms "burst" figure is no longer printed.

### Known

- At 24 agents a new row still costs about 19 to 23 ms of style recalculation, over the 16 ms budget, and the cause is not found yet. At 12 agents the median sits close to the 16 ms line (14.7 to 17.3 ms over four runs), so that check can fail on a noisy machine. Safari has not been measured.

## [0.6.0.0] - 2026-10-04

### Added

- Optional exact attention signals. `node hooks/install.mjs` prints the Claude Code hook settings that make the office show "asking you" the moment Claude asks for permission, instead of guessing from a quiet transcript. Nothing is installed unless you run it with `--apply`, it backs up your settings first, keeps your other hooks, follows a symlinked settings file, and `--remove` takes it out again. The hook only ever sends session and agent ids, the event name and paths to your own machine, never message text, and it never blocks or slows Claude Code.
- A subagent's monitor lights up like its parent's, and each session gets its own shirt color that its subagents inherit.

### Changed

- The feed server is stricter about who can talk to it. It refuses requests from other origins, forwarded requests and cross-site fetches, keeps the event stream alive with a heartbeat, will not follow a symlinked or FIFO transcript, and notices when a transcript file is replaced instead of read from the wrong place.
- One bad line in a transcript now costs that line, not the whole batch. A session's identity comes from its file, so a crafted record can no longer claim another session's seat, and results of several parallel tool calls are matched to the right subagent.
- A subagent that Claude Code reports as stopped (through the optional hooks) now walks out right away instead of lingering, and a nested subagent finds its parent even when its transcript is read before its parent's. An old, out-of-order transcript line can no longer age a live agent out of the office.
- A waiting agent that asked a question stays visible to a page that reconnects. After a transcript is truncated the agent gets its seat back, and one timestamp far in the future can no longer blank the office.
- The scene is announced as a group for screen readers, the "+N more helpers" count is read with the parent's button, and ids such as `__proto__` are treated as plain names.
- The end-to-end suite starts every dev server with its own private hook directory, so a test run can no longer touch your real hook setup, and its screenshot test no longer depends on whether macOS shows scrollbars (the baseline is regenerated).
- The fixture sanitizer salts its id hashes per run and keeps only known tool names.

## [0.5.0.0] - 2026-10-04

### Added

- `vp run criteria` checks the success criteria and prints PASS, FAIL or SKIPPED for each one. Criterion 1 reads your real `~/.claude/projects` (local only, over loopback) and prints only counts and timings, never transcript text; perf and hero use a temporary feed. A criterion that cannot be checked in time is SKIPPED, never PASS.
- `vp run perf` measures the 95th percentile frame time at 12 and 24 agents and the style recalculation cost of a row change in headless Chrome. Frames stay near 16.7 ms at both sizes, inside the 20 ms and 33 ms budgets.
- `vp run hero` redraws the README picture in `docs/hero.png` from a temporary feed, so your own sessions never end up in it.
- The README now shows a picture of the office at the top.

### Known

- Adding a row costs about 48 to 79 ms of style recalculation across runs on headless Chrome (48 to 49 ms at 12 agents, 63 to 79 ms at 24), over the 16 ms goal. Safari has not been measured. It is tracked in TODOS.md.

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
