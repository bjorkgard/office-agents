# Office life: CEO plan review (working plan)

Branch: feat/office-life | Mode: SELECTIVE EXPANSION (chosen by user, D1) | Depth: implementation-ready
Source: TODOS.md "Office life (make the room feel alive)", V1 to V9 (user, 2026-10-02).

## Step 0 findings (evidence from the code, 2026-10-02)

- V9 is partly built: `assignWorkDesks` (`src/office/choreo.ts:145`) seats subagents at empty desks below `layout.desks.length`; rows always draw 4 desks (`layoutOffice`, `src/office/iso.ts:90`). Agents stand only when every drawn desk is taken. Missing: growing `deskCount` past the seats (`deskCountFor`, `src/office/scene-model.ts:59`). Adding a row changes `floorCorners`, so `origin` and `scale` change and the whole room jumps.
- Desk look contract is V6, not V9. V2 (paper slot, `Scene.tsx:443` hard-codes left 40, top 28), V3 (screen rect) and V4 (device slot) all need per-desk-kind geometry first.
- V3 tool-kind variation needs an event contract change: `shared/events.ts` carries tool id and `isSubagent` only; no kind. A kind must be a closed enum mapped in `server/normalize.ts` (raw tool names leak identity, see TODOS "Fixture id salt and tool-name allowlist").
- V8: `.clock-hand` (`src/office/scene.css:164`) is a 2x6px upright div on a 60s tick that starts at mount; the CLOCK grid (`src/office/props.ts:278`) has no hour marks or hands and no wall skew.
- V5: `waitTrip` (`choreo.ts:355`) dwells `Infinity`; trip `since` is first-sight `now` (`motion.ts:89`), so a reload restarts it. Idle fillers need new 32x48 frames, hand-authored (no generator in repo).
- V4: `SEAT_AT` comment says the arms reach under the desk edge, so device typing frames may look identical (UNVERIFIED, check in ArtSheet).

## Decision ledger

| ID and owner         | Contract and evidence                                                            | Current                                                  | Proposed                                                                                                   | Status      | Exact approval and scope                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 mode (Step 0)     | Mode menu                                                                        | none                                                     | SELECTIVE EXPANSION                                                                                        | approved    | D1 answer: SELECTIVE EXPANSION. Mode only, approves no change.                                                                                                                                                                                                                                                                                                                                             |
| S1 sequence (Step 0) | V6 defines desk geometry that V2, V3, V4 consume; V9 is independent and riskiest | TODOS suggested order V9, V2, V6, V3, V4, V5, V7, V8, V1 | V8, V6, V3, V2, V5, V7, V9, V4, V1                                                                         | approved    | D2 answer: Reorder (recommended option). Order only; approves no item scope.                                                                                                                                                                                                                                                                                                                               |
| S2 tool-kind (V3)    | `shared/events.ts` has no tool kind                                              | V3 varies by tool kind                                   | defer kind variation; V3 ships generic active-screen animation                                             | deferred    | D3 answer: Defer to TODOS.md (recommended option). Scope: tool-kind variation only; V3 animated screens stay in scope.                                                                                                                                                                                                                                                                                     |
| S3 idle fillers (V5) | new hand-drawn frames                                                            | V5 includes fillers                                      | defer fillers; V5 ships random short break and cooldown with existing poses                                | deferred    | D4 answer: Defer to TODOS.md (recommended option). Scope: idle fillers and their new frames only; short random break and cooldown stay in scope.                                                                                                                                                                                                                                                           |
| S5 growth model (V9) | `iso.ts:90`, `choreo.ts:145`                                                     | grow rows on demand                                      | A) grow rows on demand, delayed shrink                                                                     | approved    | D5 answer: Grow rows on demand with a delayed shrink (recommended option). Scope: V9 only; shrink delay value, cap and hysteresis tests decided in later sections.                                                                                                                                                                                                                                         |
| E1..E5 delight       | opt-in                                                                           | none                                                     | E1 desk status light: deferred; E2 floor light patch: added; E3 tray count, E4 robot vacuum, E5 door swing | in progress | E1: D6 answer, Defer to TODOS.md (recommended was Skip; user chose Defer). E2: D7 answer, Add (recommended option); scope: one tinted floor polygon per window, part of V1. E3: D8 answer, Defer to TODOS.md (recommended option); V2 fade-after-pickup stays in scope. E4: D9 answer, Defer to TODOS.md (recommended was Skip; user chose Defer). E5: D10 answer, Defer to TODOS.md (recommended option). |

## Answered: D2 (S1), option A Reorder

Commitment comparison: only the order of the nine items changes; scope of each item, tests and approvals are unchanged (all pending or fixed).

Question: D2 — S1: Build order for V1 to V9?
Header: Build order
A) Reorder: V8, V6, V3, V2, V5, V7, V9, V4, V1 (recommended)
Quick win and independent items first; V6 lands the desk-kind table before V2, V3 and V4 consume it; V9, the riskiest layout change, comes once nothing else is moving. Effort: S for the reorder itself; risk low; avoids building the paper and screen anchors twice.
B) Keep your order: V9, V2, V6, V3, V4, V5, V7, V8, V1
Matches your note and fixes the desk count first. Risk medium: V2 and V3 anchors must be re-done after V6, which your TODO already notes.

## Answered: D3 (S2), option A Defer

Commitment comparison:
Commitment | Source/approval | Current | A Defer | B Keep
V3 animated active screens | TODOS V3, order per D2 | in scope | in scope | in scope
V3 content varies by tool kind (read, edit, shell, search) | TODOS V3 Context | in scope | deferred to TODOS.md | in scope
`shared/events.ts` tool kind field, `server/normalize.ts` closed-enum map, fixtures, parseAgentEvent spec | pending | not planned | not built | built, privacy test added
Reduced-motion static lit screen | TODOS V3 | in scope | in scope | in scope

Question: D3 — S2: V3 content varies by tool kind. Defer it or keep it in this plan?
Header: V3 tool kind
A) Defer tool-kind variation to TODOS.md (recommended)
V3 still ships animated screens for every working desk (scrolling lines, cursor). Only per-kind variation waits. Effort S, risk low; no event contract change, no privacy surface.
B) Keep it in scope
Adds a tool kind to the event contract with a server-side closed enum (read, edit, shell, search, other), fixtures, a leak test and four screen variants. Effort M, risk medium; touches the Phase 2 and 3 server code.

## Answered: D4 (S3), option A Defer

Commitment comparison:
Commitment | Source/approval | Current | A Defer | B Keep
V5 waiting parent returns from coffee after a random 5 to 20 s, then waits at the desk | TODOS V5 | in scope | in scope | in scope
Random 20 to 60 s cooldown before the next break, seeded so tests are deterministic, `machine.ts` timer-free | TODOS V5 | in scope | in scope | in scope
Idle fillers at the desk (stretch, look around, sip mug, phone check) | TODOS V5 Context | in scope | deferred to TODOS.md | in scope
New seated frames in `src/office/sprites.ts`, pose wiring in `poses.ts`, `swap.ts`, `loopOf` in `Character.tsx`, `art.test.ts` | pending | not planned | not built | built
Seated pose during cooldown | pending | existing `seated-idle` / `seated-typing` | existing poses | new filler poses

Question: D4 — S3: V5 idle fillers at the desk. Defer them or keep them in this plan?
Header: V5 fillers
A) Defer idle fillers to TODOS.md (recommended)
The coffee break becomes short and random with a cooldown, using the poses that exist (seated idle, seated typing). Only the new stretch, look-around, sip and phone poses wait. Effort S, risk low; no new hand-drawn frames.
B) Keep fillers in scope
Draws 2 to 4 new seated frames by hand (the generator is not in the repo) and wires them through poses, the swap controller, `loopOf` and the art tests. Effort M extra, risk medium.

## Answered: D5 (S5), option A Grow rows

Commitment comparison:
Commitment | Source/approval | Current | A Grow rows | B Sit-slots | C Defer V9
No agent stands when a desk or seat can exist | TODOS V9 | subagents stand when no empty desk below `layout.desks.length` (`choreo.ts:145`) | yes, up to the room cap | yes for 2 per parent plus empty desks; overflow still queues standing at the door | no, current fallback stays
Where a subagent sits | pending | empty desk in the grid | extra desk in a new row | stool and laptop beside the parent's desk (`SLOT_X`, `scene-model.ts:112`) | unchanged
Room size follows agent count | TODOS V9 | rows follow highest session seat | rows follow seats plus subagents; grow at once, shrink after a delay (value decided in Section 7) | unchanged (seats only) | unchanged
Whole room rescales and shifts on a row change (`origin` and `scale`, `iso.ts:98`) | existing since the 5th session | yes, rarer | yes, more often, delay limits flicker | no | rare
Session seats stay stable | server seat table | yes | yes | yes | yes
New art | pending | none | none (desk sprite reused) | stool and laptop prop (overlaps V4) | none
Tests and DOM budget at 12 and 24 agents (M9, M10) | TODOS V9 | required | required | required for slots | none

Question: D5 — S5: How should V9 make every subagent sit?
Header: V9 approach
A) Grow rows on demand with a delayed shrink (recommended)
Desk count follows seats plus live subagents; a row appears at once and disappears only after a quiet delay. Effort L (human ~2 days / CC ~1.5h), risk medium: each row change rescales the room, as the 5th session already does.
B) Sit-slots beside the parent
Subagents sit on a stool with a laptop beside the parent's desk (2 per parent), plus empty desks; the room never grows, the queue at the door stays for overflow. Effort M (human ~1 day / CC ~45min), risk medium: seat geometry between neighbouring desks is unverified and some agents still stand when over the cap.
C) Defer V9 to TODOS.md
Subagents keep standing when no empty desk exists. Effort S, risk low; the "no agent stands" goal stays open.

## Answered: D6 (E1), option B Defer to TODOS.md

Commitment comparison:
Commitment | Source/approval | Current | A Add | B Defer | C Skip
Waiting agent cues: ring, bubble, tag wave (`Scene.tsx:455`, DESIGN 8B "never one cue alone") | accepted design | 3 cues | 3 cues plus a desk status light | 3 cues | 3 cues
Desk status light: small lit dot on every desk, `--accent` amber when the agent waits, steady and not pulsing under reduced motion | pending | none | added to the V6 desk kind table, drawn as a CSS overlay beside the V3 screen overlay | in TODOS.md | not built
DOM budget | M10 | no per-desk overlays | at most 1 element per desk (24 at 24 agents) | none | none
Tests | pending | none | `lookFor` status mapping tested, ArtSheet check | none | none

Question: D6 — E1: Add a desk status light that turns amber when the agent waits for you?
Header: Desk light
A) Add to this plan's scope
A small lit dot on each desk: amber while the agent waits, green while it works, off when idle. Effort S (human ~3h / CC ~20min), risk low; one overlay element per desk, token colors only.
B) Defer to TODOS.md
Same item written down for later; the plan ships without it. Effort S, risk low.
C) Skip
Not built, no TODO.

## Answered: D7 (E2), option A Add

Commitment comparison:
Commitment | Source/approval | Current | A Add | B Defer | C Skip
V1 windows with an outside scene (day, dusk, night, rain, snow, clouds, bird or plane) | TODOS V1, last in order per D2 | pending scope | in scope | in scope | in scope
Faint light patch on the floor under each window, tinted by the scene (warm day, cool night, dim rain) | TODOS V1 Context ("or add a faint light patch") | optional in TODOS | in scope, drawn from the window geometry in `room.ts` | in TODOS.md | not built
Characters stay unlit by the glass | TODOS V1 | fixed | fixed | fixed | fixed
Reduced motion: static patch | TODOS V1 | fixed | fixed | none | none
Extra elements | M10 | none | 1 polygon per window | none | none

Question: D7 — E2: Add a floor light patch under each window?
Header: Floor light
A) Add to this plan's scope (recommended)
One tinted polygon per window on the floor. Effort S (human ~2h / CC ~15min), risk low; gives depth to V1 and reuses the window geometry.
B) Defer to TODOS.md
Windows ship flat; the patch waits. Effort S, risk low.
C) Skip
Not built, no TODO.

## Answered: D8 (E3), option B Defer to TODOS.md

Commitment comparison:
Commitment | Source/approval | Current | A Add | B Defer | C Skip
V2 paper lies on the desk during the handoff, anchored per desk kind | TODOS V2, order per D2 | pending scope | in scope | in scope | in scope
Paper stays until the parent picks it up, then fades (TODOS V2 idea, "or is filed in a tray") | TODOS V2 Context | optional | fade only | fade only | fade only
Paper tray per desk showing how many subagent results were filed (0 to 3 sheets) | pending | none | added as a slot in the V6 desk kind table; count kept per session in `machine.ts` and rebuilt from the snapshot replay | in TODOS.md | not built
Count survives a reload | pending | none | needs the replay to carry handoffs (the snapshot ring does) | none | none
Tests | pending | none | machine count, replay, ArtSheet check | none | none

Question: D8 — E3: Add a paper tray that shows how many subagent results a session has filed?
Header: Paper tray
A) Add to this plan's scope
A tray on the desk holds 0 to 3 sheets; each returned subagent adds one. Effort M (human ~1 day / CC ~40min), risk medium: new per-session state in the machine and a replay check.
B) Defer to TODOS.md (recommended)
V2 ships with the paper fading after pickup; the tray waits. Effort S, risk low.
C) Skip
Not built, no TODO.

## Answered: D9 (E4), option B Defer to TODOS.md

Commitment comparison:
Commitment | Source/approval | Current | A Add | B Defer | C Skip
Room never looks dead when no agent moves | TODOS Office life goal | plants sway, steam rises, clock ticks (`scene.css:155`), plus V1, V8 | plus a small floor robot patrolling a seeded lane | same as current | same as current
Robot: new pixel prop, seeded patrol path through the free aisle, CSS-only motion so no animation loop runs (`runLoop` in `motion.ts:328` stops when settled), parked under reduced motion | pending | none | built | in TODOS.md | not built
Path clear of desks and walkers (floor is not routed around, `choreo.ts` header) | pending | n/a | needs a lane that no desk covers; the front aisle changes with rows (V9) | none | none
Stacking by feet like floor props (`floorProp`, `Scene.tsx:129`) | existing rule | n/a | reused | none | none
Tests | pending | none | prop size and lane clear of `deskFootprint` (`room.ts:179`) | none | none

Question: D9 — E4: Add a small floor robot that patrols the aisle?
Header: Floor robot
A) Add to this plan's scope
A pixel-art robot slides along a seeded lane with CSS motion, parked in reduced motion. Effort M (human ~1 day / CC ~40min), risk medium: the lane must stay clear of desks as rows grow with V9.
B) Defer to TODOS.md
Written down for later. Effort S, risk low.
C) Skip (recommended)
Not built, no TODO.

## Answered: D10 (E5), option B Defer to TODOS.md

Commitment comparison:
Commitment | Source/approval | Current | A Add | B Defer | C Skip
Arrivals and leavers walk from and to the door (`subagentPath`, `choreo.ts:272`; `DOOR` prop, `props.ts:9`) | accepted design | door always closed art | door shows an ajar frame while someone is passing | closed | closed
New `DOOR_AJAR` pixel grid, 20x60 cells, hand-drawn | pending | none | built, size matches `DOOR` and the wall anchor (`WALL_ANCHOR.DOOR`, `room.ts:64`) | in TODOS.md | not built
When the ajar frame shows | pending | n/a | pure `doorOpen(agents, now)` from `arrivedAt` and `leftAt` windows; the Scene re-renders on events and on a timer the frame loop already provides | none | none
Reduced motion | pending | n/a | ajar frame static for the same windows, no animation | none | none
Tests | pending | none | `doorOpen` windows, art size check in `art.test.ts` | none | none

Question: D10 — E5: Add a door that opens a crack when an agent arrives or leaves?
Header: Door swing
A) Add to this plan's scope
One extra hand-drawn door frame, shown while someone passes. Effort M (human ~1 day / CC ~40min), risk medium: the render has no per-frame tick at the door, so a timer or the existing loop must close it again.
B) Defer to TODOS.md (recommended)
Written down for later. Effort S, risk low.
C) Skip
Not built, no TODO.

## Ledger additions (review sections)

| ID and owner             | Contract and evidence                                                                                                                                                                                 | Current                                             | Proposed                                                                                                                                                                                                                | Status   | Exact approval and scope                                                                                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 anchor (Sec 1)        | `iso.ts:98` origin from left corner; `Scene.tsx:393` scaled container                                                                                                                                 | rows change moves every desk and rescales instantly | anchor room coordinates at the back corner; one CSS-transitioned container does translate and scale                                                                                                                     | approved | D12 answer: Anchor room coordinates and animate the fit (recommended option). Scope: iso origin rule, container transition, reduced motion none, iso and room test updates.                                                  |
| R6 prep refactor (Sec 5) | `Scene.tsx` 566 lines, 8 of 9 items edit it; `Scene.tsx:232,236,437` and `motion.ts:69` repeat `round(desk.y+30)`; `motion.ts:214` `standing` equals `choreo.ts:128` `stand`; `planMotion` ~105 lines | none                                                | behavior-preserving first task: extract RoomDecor (door, clock, plants, steam, coffee, later windows, dispenser) and DeskLayer from Scene; one `deskZ` helper; one `stand`; split `planMotion` into trips and subagents | approved | D13 answer: Add a prep refactor as the first task (recommended option). Scope: extract RoomDecor and DeskLayer, share `deskZ` and `stand`, split `planMotion`; no behavior change, existing tests untouched.                 |
| R7 M10 gate (Sec 6, 7)   | TODOS "Bubble layout and hit-area spacing (M9)": M10 profiling dropped; "Share character drawings via symbols": only if M10 shows jank                                                                | M10 open, no measurement                            | V9 exit gate: element-count budget test at 12 and 24 agents plus manual Chrome and Safari timings and Safari 50% hit area                                                                                               | approved | D14 answer: Gate V9 on a budget test and manual timings (recommended option). Scope: element-count test at 12 and 24 agents; Chrome and Safari timings and Safari 50% hit area before V9 ships; numbers written in this doc. |
| R2 wall slots (Sec 1)    | `room.ts:33-51`: clock 0.9, counter 2.2, bush 3.0, coffee spots to 3.6                                                                                                                                | no slot budget                                      | `WALL_LAYOUT` table plus no-overlap test; bush plant moves for the V7 dispenser                                                                                                                                         | approved | consequence of accepted V1, V7, V8 (baseline items); task, no separate choice                                                                                                                                                |
| R3 V5 anchor (Sec 1)     | `motion.ts:89` since = first sight; `machine.ts:52-55` openTools startedAt                                                                                                                            | reload restarts the break                           | since = earliest `waitingOn` startedAt, fallback first sight                                                                                                                                                            | approved | implementation detail of accepted V5; task                                                                                                                                                                                   |
| R4 fallbacks (Sec 2)     | drink station full, unknown scene                                                                                                                                                                     | none                                                | fall back to other station or seated; unknown scene to day                                                                                                                                                              | approved | required behavior of accepted V5, V7, V1; tasks                                                                                                                                                                              |
| R5 DESIGN.md (Sec 11)    | `DESIGN.md:186` ambient loops "never real time", clock "still" under reduced motion                                                                                                                   | contradicts V8 and V1                               | amend DESIGN.md: clock shows real time, minute update under reduced motion                                                                                                                                              | approved | your V8 text ("real local time") is the authority; task                                                                                                                                                                      |

## Scope after Step 0 (accepted, deferred, rejected)

Build order (D2): V8, V6, V3, V2, V5, V7, V9, V4, V1.

| Item                | Disposition                     | Answer   | What is in scope                                                                                                                                                                                        |
| ------------------- | ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V8 wall clock       | accepted (user's TODO)          | baseline | round face, hour marks, hour/minute/second hands skewed onto the right wall plane, real local time, reduced-motion minute update, ArtSheet check at 50% scale                                           |
| V6 two desk types   | accepted (user's TODO)          | baseline | two desk kinds assigned by seat index, per-desk props, shared symbols, one `DESK_KINDS` table (screen rect, paper slot, device slot); that table is a design consequence of D2, not a separate approval |
| V3 animated screens | accepted, narrowed              | D3       | every working desk animates (scrolling lines, cursor); idle screens dark or screensaver; reduced-motion static lit screen; tool-kind variation deferred                                                 |
| V2 paper on desk    | accepted (user's TODO)          | baseline | paper lands on the desk slot per kind, stays until the parent picks it up, then fades                                                                                                                   |
| V5 coffee break     | accepted, narrowed              | D4       | random 5 to 20 s break, 20 to 60 s cooldown, seeded, `machine.ts` timer-free; idle fillers deferred                                                                                                     |
| V7 water dispenser  | accepted (user's TODO)          | baseline | dispenser prop, seeded weighted coffee or water choice, drink pose and prop, queue spot, gurgle animation                                                                                               |
| V9 desks on demand  | accepted, approach chosen       | D5       | grow rows on demand, delayed shrink, cap and fallback; delay value, cap and tests decided in review sections                                                                                            |
| V4 subagent devices | accepted (user's TODO)          | baseline | laptop or tablet per subagent from a stable hash, depends on V3, V9 and V6                                                                                                                              |
| V1 windows          | accepted (user's TODO), plus E2 | D7       | random outside scene per load, reduced-motion static sky, floor light patch per window                                                                                                                  |

Deferred to TODOS.md (to be written in the TODOS step): V3 tool-kind variation (D3), V5 idle fillers (D4), E1 desk status light (D6), E3 paper tray count (D8), E4 floor robot (D9), E5 door swing (D10).
Rejected: none.

## Answered: D12 (R1), option A Anchor and animate

Commitment comparison:
Commitment | Source/approval | Current | A Anchor and animate | B Keep instant jump
V9 rows grow on demand, delayed shrink | D5 approved | accepted | accepted | accepted
Desk and character positions in room px when a row is added | `iso.ts:98` | all shift (origin from left corner) | unchanged: origin fixed at the back corner | all shift
Fit to viewport (scale, horizontal offset) | `iso.ts:114`, `Scene.tsx:393` | recomputed, applied at once | applied through one container transform with a CSS transition; none under reduced motion | applied at once
Walkers and drives rebuilt on layout change | `motion.ts:247` cache key `geo` | rebuilt every row change | geometry stays equal in room px, so drives are kept | rebuilt
Changes to `iso.ts` and `iso.test.ts`, `room.test.ts` origin expectations | pending | none | origin rule changes, tests updated | none
Row hold delay, cap, tests | D5 later sections | pending | pending | pending

Question: D12 — R1: How should the room look while a row appears or goes?
Header: Row change
A) Anchor room coordinates and animate the fit (recommended)
Desks keep their room positions; only the viewport fit moves, with a short CSS transition (none in reduced motion). Effort M (human ~1 day / CC ~45min), risk medium: changes the origin rule that iso tests lock.
B) Keep the instant jump
Every desk and character shifts and the room rescales at once on each row change, as for a 5th session today. Effort S, risk low.

## Answered: D13 (R6), option A Prep refactor first

Commitment comparison:
Commitment | Source/approval | Current | A Prep refactor first | B Build in place
Eight accepted items edit `Scene.tsx` | D2 order | one 566-line component | decor and desk layers in their own components, then items land in them | items land in `Scene.tsx`
`round(desk.y + 30)` in four places, `stand` and `standing` twice | `Scene.tsx:232,236,437`, `motion.ts:69,214`, `choreo.ts:128` | duplicated | one helper each | duplicated, new items copy them
`planMotion` (about 105 lines, more than 5 branches, `motion.ts:216`) | V5, V7, V9 add branches | one function | split into trips and subagents planning | one larger function
Behavior and tests | existing office tests (17 test files under `src/office`) | green | unchanged, run before and after, no new behavior | n/a
Effort and risk | pending | none | S to M (human ~4h / CC ~30min), low: pure moves | none now, higher merge and review cost per item

Question: D13 — R6: Do a behavior-preserving cleanup of Scene and motion before the items?
Header: Prep refactor
A) Add a prep refactor as the first task (recommended)
Move decor and desk drawing out of `Scene.tsx`, share one `deskZ` and one `stand`, split `planMotion`. No behavior change; existing tests must pass untouched. Effort S to M, risk low.
B) Build the items in place
Each item adds to `Scene.tsx` and `planMotion` as they are. Effort none now, but later items are larger and harder to review.

## Answered: D14 (R7), option A Gate V9

Commitment comparison:
Commitment | Source/approval | Current | A Gate with budget test and profiling | B Budget test only | C Leave M10 open
V9 rows on demand, V4 devices make 24 seated agents normal | D5, baseline V4 | accepted | accepted | accepted | accepted
Element-count budget test at 12 and 24 agents (`renderToStaticMarkup`, learning `svg-element-counts`) | pending | none | added, fails above a set ceiling | added | none
Manual timings at 12 and 24 agents, Chrome and Safari, plus Safari 50% hit area | TODOS M9 note | open | done before V9 ships, numbers written in the review doc | not done | open
Share-drawings-via-symbols TODO (only if jank) | TODOS | waits for M10 | decided from the measured timings | stays unmeasured | stays unmeasured
Effort and risk | pending | none | S (human ~3h / CC ~20min plus a manual pass), low | S, low | none

Question: D14 — R7: Make performance measurements the exit gate for V9?
Header: M10 gate
A) Gate V9 on a budget test and manual timings (recommended)
Add an element-count test at 12 and 24 agents and run the Chrome and Safari timings before V9 ships; write the numbers down. Effort S plus a short manual pass, risk low.
B) Add the budget test only
Automated count only; no browser timings. Effort S, risk low: counts do not show jank.
C) Leave M10 open
No new measurement. Effort none, risk: first jank report arrives after 24 agents become normal.

## Approval readiness

Approval readiness: PASS. Checked rows and their answers: M1 (D1), S1 (D2), S2 (D3), S3 (D4), S5 (D5), E1 (D6), E2 (D7), E3 (D8), E4 (D9), E5 (D10), docs (D11), R1 (D12), R6 (D13), R7 (D14). R2, R3, R4, R5 are consequences of baseline items you listed (V1, V5, V7, V8) and carry no extra scope. Declined or deferred changes are outside accepted work: S2, S3, E1, E3, E4, E5 (all deferred to TODOS.md, written). Open implementation values are not user decisions; each has an owner and a check (see Completion Summary).

## NOT in scope

Deferred (also written to TODOS.md "Deferred from the Office life CEO review"):

- V3 per-tool-kind screen content (D3): needs an event contract change and privacy review.
- V5 idle fillers (D4): new hand-drawn seated frames.
- E1 desk status light (D6): fourth waiting cue, low gain.
- E3 paper tray count (D8): new per-session machine state.
- E4 floor robot (D9): lane depends on V9 row growth.
- E5 door ajar frame (D10): new art plus a close timer.

Rejected: none.

## What already exists

| Need                               | Existing code                                                     | Reused?                                       |
| ---------------------------------- | ----------------------------------------------------------------- | --------------------------------------------- |
| seeded randomness                  | `hash` in `src/office/appearance.ts:11`                           | yes, for V1, V4, V5, V6, V7; no `Math.random` |
| pure timelines with injected clock | `timeline`, `tripSegs` in `src/office/choreo.ts`                  | yes, V5 and V7 are new segment lists          |
| shared desk drawing                | `DeskDefs`, `SharedDesk` in `src/office/CharacterRig.tsx:211`     | yes, V6 adds kinds                            |
| sticky subagent desks              | `assignWorkDesks` in `src/office/choreo.ts:145`                   | yes, V9 grows `deskCount`                     |
| wall prop anchors                  | `WALL_ANCHOR`, `wallPropRect` in `src/office/room.ts`             | yes, V1, V7, V8                               |
| wait start time                    | `openTools[id].startedAt`, `waitingOn` in `src/office/machine.ts` | yes, V5 anchor                                |
| visual check                       | `?art` sheet, `?demo` mode in `src/main.tsx`                      | yes, extended                                 |
| clock prop and CSS tick            | `CLOCK`, `.clock-hand`                                            | replaced by V8                                |

## Dream state delta

```
 CURRENT                    THIS PLAN (accepted scope)             12-MONTH IDEAL
 identical desks, static    desk kinds, live screens, real clock,   office that mirrors what each agent does
 screens, broken clock,     windows, water, short breaks, desks     (tool kind, exact attention via hooks),
 standing subagents         on demand; tool kind, fillers, tray     with deferred touches (tray, fillers,
                            deferred                                door, robot) added from a stable kit
```

This plan reaches the "room feels alive" half. The "room mirrors the work" half waits on the tool-kind and hooks-adapter items.

## Error & Rescue Registry (implementation-ready, client only)

| Codepath                           | What can go wrong                | Class        | Rescued?   | Rescue action                                         | User sees                 |
| ---------------------------------- | -------------------------------- | ------------ | ---------- | ----------------------------------------------------- | ------------------------- |
| `clockHands(now)` (V8)             | stale `now` after sleep          | stale time   | Y          | hour and minute hands derive from the 15 s `now` prop | correct within 15 s       |
| second hand CSS (V8)               | drift from mount                 | drift        | Y accepted | sub-second only, off under reduced motion             | fine                      |
| `sceneFor(seed, hour)` (V1)        | unknown override id              | unknown id   | Y after R4 | fall back to day                                      | day sky                   |
| `breakPlan(seed, since, now)` (V5) | empty key, NaN or future `since` | bad input    | Y          | clamp elapsed to 0, `hash("")` is valid               | seated parent             |
| `updateTrips` spot (V5, V7)        | spots exhausted                  | capacity     | Y          | stay seated (existing)                                | seated                    |
| `pickDrink` (V7)                   | chosen station full              | capacity     | Y after R4 | other station, else seated                            | seated or other station   |
| `rowsNeeded` + hold (V9)           | `now` goes back, above cap       | bad input    | Y          | age floored at 0, cap then door queue                 | no flicker, queue at door |
| `deskKindFor(seat)` (V6)           | index not integer                | bad input    | Y          | kind 0                                                | default desk              |
| Scene render                       | any throw                        | render error | Y          | `ErrorBoundary` shows "Display error"                 | whole display error       |

CRITICAL GAPS: 0 (R4 resolves the three that were open). No catch-all handlers are introduced.

## Failure Modes Registry

| Codepath       | Failure mode              | Rescued?  | Test?       | User sees               | Logged?    |
| -------------- | ------------------------- | --------- | ----------- | ----------------------- | ---------- |
| clock          | stale hands               | Y         | planned T1  | correct within 15 s     | n/a client |
| windows        | unknown scene             | Y         | planned T10 | day sky                 | n/a        |
| break schedule | reload restarts it        | Y (R3)    | planned T5  | continuous              | n/a        |
| drink choice   | station full              | Y (R4)    | planned T6  | other station or seated | n/a        |
| row growth     | burst flicker             | Y (hold)  | planned T7  | steady room             | n/a        |
| row growth     | 30 subagents over the cap | Y (queue) | planned T7  | door queue              | n/a        |
| desk kind      | missing kind              | Y         | planned T2  | default desk            | n/a        |
| screens        | reduced motion            | Y         | planned T3  | static lit              | n/a        |

No row has RESCUED=N, TEST=N and a silent user result: 0 CRITICAL GAPS. "Logged" is n/a: client-only visuals; `data-*` attributes (T11) make state readable.

## Scope Expansion Decisions

Full record in `~/.gstack/projects/office-agents/ceo-plans/2026-10-02-office-life.md`.

- Accepted: build order (D2); V9 grow rows (D5); E2 floor light patch (D7); D12 anchor; D13 prep refactor; D14 M10 gate.
- Deferred: V3 tool kind (D3), V5 fillers (D4), E1 (D6), E3 (D8), E4 (D9), E5 (D10).
- Skipped: none.

## Diagrams

1. System architecture: see Section 1 above (new pure modules `desk-kinds.ts`, `breaks.ts`, `decor.ts` (clock angles and windows, eng D1), the row rule in `scene-model.ts` (eng D1) feeding Scene, choreo, room, iso).
2. Data flow with shadow paths (V5 breaks):

```
 waitingOn startedAt --> since --> breakPlan(hash(key), since, now) --> tripSegs --> frame
   nil: first-sight now        empty: no trip           future/NaN: clamp 0
   spot >= COFFEE_SPOTS: stay seated        station full: other station, else seated
```

3. State machine (V9 row hold):

```
 STEADY(rows) --need>rows--> GROW(rows=need) --> STEADY
 STEADY --need<rows--> HOLDING(since) --need>=rows--> STEADY
 HOLDING --now-since>=HOLD_MS--> STEADY(rows=need)      rows = max(seatRows, held)
 invalid: rows < seatRows (prevented by the max)
```

4. Error flow: any throw in Scene goes to `ErrorBoundary` ("Display error"); input errors are clamped before use.
5. Deployment sequence: PR1 prep refactor, V8, V6; PR2 V3, V2; PR3 V5, V7; PR4 V9 + anchor + M10 numbers; PR5 V4, V1. Each PR carries its DESIGN.md and token changes.
6. Rollback: `git revert <item PR>`; no data or contract migration, so no ordering constraint except V4 after V9 and V6.

## Stale Diagram Audit

Comments and docs that become wrong:

- `src/office/choreo.ts:139-143` ("rooms never grow for work desks") and `src/office/motion.ts` Motion docs: stale after V9.
- `src/office/iso.ts:3-6` and `:97` ("a new row is added when the last is full"; bounds from full rows so desks never shift): stale after R1 anchor.
- `src/office/scene-model.ts:58` (`deskCountFor` doc): stale after V9.
- `DESIGN.md:186` ("never real time", clock "still" under reduced motion) and `DESIGN.md:146` (subagent "empty desk, else a slot"): amend (R5, V9).
- `src/office/props.ts:277` (clock grid comment, second hand): stale after V8.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above. Run with Claude Code or Codex; checkbox as you ship. Order follows D2.

- [ ] **T0 (P1, human: ~4h / CC: ~30min)** — Scene, motion — behavior-preserving prep refactor
  - Surfaced by: Section 5 (R6, D13): `Scene.tsx` 566 lines; `round(desk.y+30)` four copies; `stand` twice; `planMotion` ~105 lines.
  - Files: `src/office/Scene.tsx`, `src/office/motion.ts`, `src/office/choreo.ts`, new `RoomDecor.tsx`, `DeskLayer.tsx`
  - Verify: `vp check && vp test` unchanged and green.
- [ ] **T1 (P1, human: ~3h / CC: ~20min)** — wall layout and clock — `WALL_LAYOUT` table plus V8 real clock
  - Surfaced by: Section 1 (R2) wall slots collide; Section 2 clock stale; R5.
  - Files: `src/office/room.ts`, `src/office/props.ts`, new `src/office/decor.ts` (clock angles), `src/office/scene.css`, `DESIGN.md`, `ArtSheet.tsx`
  - Verify: no-overlap test on wall items; `clockHands` unit tests (12:00, 3:15:30, 23:59:59, DST); ArtSheet at 50% scale.
- [ ] **T2 (P1, human: ~1 day / CC: ~40min)** — V6 desk kinds — `DESK_KINDS` table, two kinds, per-desk props
  - Surfaced by: Step 0 S1 (D2): V6 is the contract V2, V3, V4 consume.
  - Files: new `src/office/desk-kinds.ts`, `src/office/sprites.ts`, `src/office/CharacterRig.tsx`, `src/office/room.ts`, `DESIGN.md`, `src/office/art.test.ts`
  - Verify: same seat gives same kind; both kinds' `deskFootprint` equal; screen, paper and device rects inside the desk and disjoint.
- [ ] **T3 (P1, human: ~1 day / CC: ~40min)** — V3 animated screens (generic)
  - Surfaced by: baseline V3, narrowed by D3.
  - Files: `src/office/Scene.tsx` (DeskLayer), `src/office/scene.css`, `src/office/desk-kinds.ts`
  - Verify: overlay count equals working agents (`renderToStaticMarkup`); static under reduced motion; ArtSheet.
- [ ] **T4 (P1, human: ~3h / CC: ~20min)** — V2 paper on the desk, fades after pickup
  - Surfaced by: Step 0 evidence `Scene.tsx:443-449` draws the paper at cell (20,14), on the monitor face.
  - Files: `src/office/desk-kinds.ts`, `src/office/Scene.tsx`, `src/office/scene.css`
  - Verify: paper rect inside desk-top cells of each kind; reduced-motion highlight kept (DESIGN.md:146).
- [ ] **T5 (P1, human: ~1 day / CC: ~30min)** — V5 short random break and cooldown
  - Surfaced by: Section 1 (R3), Section 2 (R4).
  - Files: new `src/office/breaks.ts`, `src/office/choreo.ts`, `src/office/motion.ts`, `src/office/choreo.test.ts`
  - Verify: dwell 5 to 20 s and cooldown 20 to 60 s over 1000 seeds; same `since` gives same plan after reload; `machine.ts` stays timer-free.
- [ ] **T6 (P2, human: ~1 day / CC: ~40min)** — V7 water dispenser, drink choice, bush plant moved
  - Surfaced by: Section 1 (R2) dispenser collides with bush plant and coffee spots; Section 2 (R4) station full.
  - Files: `src/office/props.ts`, `src/office/room.ts`, `src/office/breaks.ts`, `src/office/Scene.tsx`, `src/office/room.test.ts`
  - Verify: 60/40 within tolerance over fixed seeds; full station falls back; no figure overlaps a desk or the dispenser.
- [ ] **T7 (P1, human: ~3 days / CC: ~2h)** — V9 rows on demand, delayed shrink, anchored origin, cap
  - Surfaced by: D5, D12 (R1).
  - Files: `src/office/iso.ts`, `src/office/scene-model.ts` (includes `rowsNeeded` and hold, eng D1), `src/office/Scene.tsx`, `src/office/scene.css`, `iso.test.ts`, `room.test.ts`
  - Verify: `rowsNeeded` table tests; desk room coordinates unchanged when a row is added; hold expiry; cap then door queue; `demo.ts` scenario with N subagents: nobody stands up to the cap.
- [ ] **T8 (P1, human: ~3h / CC: ~20min plus manual)** — M10 gate for V9
  - Surfaced by: Sections 6 and 7 (R7, D14).
  - Files: new element-count test, this doc (numbers)
  - Verify: budget test green at 12 and 24 agents; Chrome and Safari timings and Safari 50% hit area written down before V9 merges.
- [ ] **T9 (P2, human: ~1 day / CC: ~45min)** — V4 subagent devices (laptop or tablet)
  - Surfaced by: baseline V4; Step 0 note the typing frame may look identical (verify in ArtSheet first).
  - Files: `src/office/desk-kinds.ts`, `src/office/sprites.ts`, `src/office/CharacterRig.tsx`
  - Verify: device from stable hash of agent key; same key same device across renders.
- [ ] **T10 (P3, human: ~1 day / CC: ~40min)** — V1 windows plus floor light patch, tokens
  - Surfaced by: baseline V1, E2 (D7); Section 11 tokens and 50% legibility.
  - Files: `src/office/decor.ts` (window scenes), `src/office/room.ts`, `src/office/palette.ts`, `DESIGN.md`, `src/office/scene.css`
  - Verify: scene pick deterministic by seed and hour; slots clear of door, clock, counter; static under reduced motion; `art.test.ts` token check.
- [ ] **T11 (P2, human: ~2h / CC: ~15min)** — debug hooks
  - Surfaced by: Section 8 gap.
  - Files: `src/office/Scene.tsx`, `src/main.tsx`, `ArtSheet.tsx`
  - Verify: `data-rows`, `data-desk-kind`, `data-screen`, `data-break`, `data-window-scene` present; `?art` scene, hour and seed overrides work in dev only.

Assumptions: ratios used (tests about 50x, features about 30x, architecture about 5x); T7 is largest because of the origin rule change.

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                         |
  | System Audit         | V9 half built; V6 is the desk contract;     |
  |                      | V3 needs event change (deferred); DESIGN.md |
  |                      | "never real time" conflicts with V8         |
  | Step 0               | D1 mode; D2 order; D3, D4 deferrals; D5 V9; |
  |                      | D6 to D10 expansions; D11 docs approved     |
  | Section 1  (Arch)    | 3 issues found                              |
  | Section 2  (Errors)  | 9 error paths mapped, 0 GAPS after R4       |
  | Section 3  (Security)| 0 issues found, 0 High severity             |
  | Section 4  (Data/UX) | 6 edge cases mapped, 0 unhandled after R4   |
  | Section 5  (Quality) | 3 issues found                              |
  | Section 6  (Tests)   | Diagram produced, 2 gaps (manual UI, M10)   |
  | Section 7  (Perf)    | 1 issue found                               |
  | Section 8  (Observ)  | 1 gap found                                 |
  | Section 9  (Deploy)  | 1 risk flagged                              |
  | Section 10 (Future)  | Reversibility: 4/5, debt items: 3           |
  | Section 11 (Design)  | 3 issues                                    |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (6 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 9 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 8 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 6 items written (all pre-answered deferrals)|
  | Scope proposals      | 7 proposed, 1 accepted (EXP + SEL)          |
  | CEO plan             | written                                     |
  | Outside voice        | codex: disabled (codex_reviews=disabled)    |
  | Lake Score           | N/A (no scored question offered a 10/10)    |
  | Diagrams produced    | 6 (architecture, data flow, state, error,   |
  |                      | deployment, rollback)                       |
  | Stale diagrams found | 5                                           |
  | Unresolved decisions | 0 (open values below)                       |
  +====================================================================+
```

### Unresolved Decisions

None. Open implementation values (non-blocking, each has an owner and a check): V9 shrink delay `HOLD_MS` and desk cap (builder, T7; decided with the M10 numbers, T8); `WALL_LAYOUT` slot positions (builder, T1; no-overlap test); break constants inside the approved 5 to 20 s and 20 to 60 s ranges (builder, T5); two desk designs and the prop set (builder, T2; ArtSheet review); sky and window token values and contrast (builder, T10; `/plan-design-review`).

## Eng review (2026-10-02): scope record

Target: this plan (fixed). Mode: FULL_REVIEW (scope accepted as-is; a smaller file arrangement is not a scope reduction).
Scope Challenge: feature answers: none asked (no cuts proposed); structure: B Smaller arrangement (eng D1 answer); accepted scope: all CEO-approved items unchanged; new files become desk-kinds.ts, breaks.ts, decor.ts (clock angles and window scenes), RoomDecor.tsx, DeskLayer.tsx; the row rule (`rowsNeeded` and hold) goes into scene-model.ts; pending remedies: none yet (later sections raise their own).
Counts (estimate): 5 new files after D1 (7 before), about 14 changed files, about 8 test files.

## Decision ledger

### R1: How the room fit changes when a row appears or goes (reopens CEO D12)

Finding: eng #1, P1, confidence 9/10, `src/office/motion.ts:357` and `src/office/Scene.tsx:393`, reviewer: eng review (Claude, same harness).
Plan baseline: CEO D12 answer "Anchor room coordinates and animate the fit": desks pinned at the back corner, one container transform eased by CSS, none in reduced motion, `iso.ts` origin rule and tests changed. Pop-in animation of a new desk is part of V9 (TODOS V9 Context) in every option below.
Runtime evidence: overlay hit, tag and bubble positions are screen px from the numeric scale (`overlayPoints`, `motion.ts:355-359`; `Scene.tsx:356-357`; `onFrame` writes `px` strings, `Scene.tsx:324-331`), outside the scaled layer. `iso.test.ts:95-96` locks `desks[0] === origin`. `keep()` rebuilds drives when `geo` changes (`motion.ts:247`); paths are timestamp-based, so a rebuilt drive continues from the same position (correctness is not at risk). Browser behavior of an eased fit with this overlay: unknown, not probed.
Comparison grid:

| Commitment                                                                                                                                                                                                                                                                                                                                                                                                                                     | Plan baseline (CEO D12) | A Shared CSS variables                                                                                                                 | B Anchor only, instant fit                        | C Keep origin rule, instant fit                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| V9 rows on demand, delayed shrink                                                                                                                                                                                                                                                                                                                                                                                                              | approved (D5)           | same                                                                                                                                   | same                                              | same                                             |
| New desk appears with a short pop-in                                                                                                                                                                                                                                                                                                                                                                                                           | in V9                   | same                                                                                                                                   | same                                              | same                                             |
| Room coordinates when a row is added                                                                                                                                                                                                                                                                                                                                                                                                           | anchored                | anchored                                                                                                                               | anchored                                          | unchanged (origin from left corner, `iso.ts:98`) |
| Fit change (scale and offset)                                                                                                                                                                                                                                                                                                                                                                                                                  | eased 300 ms            | eased 300 ms, driven by `--fit-*` variables registered with `@property`                                                                | instant                                           | instant                                          |
| Overlay hit, tag, bubble                                                                                                                                                                                                                                                                                                                                                                                                                       | not addressed           | positions become `calc(var(--scale) * Npx + var(--fit-x))`; `onFrame` and `overlayPoints` rewritten; bubbles placed at the final scale | unchanged (instant, in step with the scene)       | unchanged                                        |
| `iso.ts` origin rule, `iso.test.ts`, `room.test.ts`                                                                                                                                                                                                                                                                                                                                                                                            | changed                 | changed                                                                                                                                | changed                                           | unchanged                                        |
| Reduced motion                                                                                                                                                                                                                                                                                                                                                                                                                                 | no ease                 | no ease                                                                                                                                | n/a                                               | n/a                                              |
| Browser without `@property` (Firefox before 128)                                                                                                                                                                                                                                                                                                                                                                                               | n/a                     | falls back to instant                                                                                                                  | n/a                                               | n/a                                              |
| Extra proof                                                                                                                                                                                                                                                                                                                                                                                                                                    | none stated             | overlay stays on its character during the ease (manual pass in the T8 browser check) plus unit tests for the `calc` positions          | unit test: desks keep room px when a row is added | none                                             |
| Effort and risk                                                                                                                                                                                                                                                                                                                                                                                                                                | M, medium               | L (human ~2 days / CC ~1.5h), high: touches overlay, bubbles, `onFrame`                                                                | S to M (human ~0.5 day / CC ~30min), low          | S (human ~0 / CC ~10min), low                    |
| Question D2:                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D2 — R1: How should the room fit change when a row appears or goes?                                                                                                                                                                                                                                                                                                                                                                            |
| Project/branch/task: office-agents, feat/office-life, eng review Section 1, V9 (reopens CEO D12).                                                                                                                                                                                                                                                                                                                                              |
| ELI10: Your earlier choice was to pin desks and ease the room's zoom and position when a row appears. The review found that hit areas, name tags and speech bubbles are positioned in screen pixels from the number scale, outside the zoomed layer. If the room eases, they jump to the final spot at once and slide off their characters for about 300 ms. Fixing that means rewriting how the overlay is positioned, or giving up the ease. |
| Stakes if we pick wrong: Eased fit with a detached overlay looks broken; the full fix is the largest piece of V9; instant fit looks like a window resize.                                                                                                                                                                                                                                                                                      |
| Recommendation: C because it keeps the existing origin rule and tests, still pops the new desk in, and avoids a risky overlay rewrite for a polish effect; upgrade later if the browser pass says the jump hurts.                                                                                                                                                                                                                              |
| Note: options differ in kind, not coverage, so no completeness score.                                                                                                                                                                                                                                                                                                                                                                          |
| Pros / cons:                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| A) Drive both layers from shared CSS variables                                                                                                                                                                                                                                                                                                                                                                                                 |
| ✅ Room and overlay ease together, so the whole row change looks smooth, as your TODO wished.                                                                                                                                                                                                                                                                                                                                                  |
| ✅ Keeps desks pinned, so drives and memoized characters stay valid across rows.                                                                                                                                                                                                                                                                                                                                                               |
| ❌ Rewrites overlay positioning, bubbles and onFrame; needs @property; Firefox before 128 falls back to instant.                                                                                                                                                                                                                                                                                                                               |
| B) Anchor only, instant fit                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ✅ Overlay and scene change together in one frame, so nothing detaches.                                                                                                                                                                                                                                                                                                                                                                        |
| ✅ Small change; keeps desks pinned to the back corner.                                                                                                                                                                                                                                                                                                                                                                                        |
| ❌ Still changes the origin rule and tests, yet the screen still jumps, so it buys little.                                                                                                                                                                                                                                                                                                                                                     |
| C) Keep the origin rule, instant fit (recommended)                                                                                                                                                                                                                                                                                                                                                                                             |
| ✅ No change to iso.ts or its tests; the same behavior a 5th session has today.                                                                                                                                                                                                                                                                                                                                                                |
| ✅ A short pop-in on the new desk gives the "appears" feel your TODO asked for at almost no cost.                                                                                                                                                                                                                                                                                                                                              |
| ❌ Existing desks shift on screen at each row change; a later upgrade to A stays possible but costs the full L.                                                                                                                                                                                                                                                                                                                                |
| Net: smooth but large and risky, or small and safe with a visible jump.                                                                                                                                                                                                                                                                                                                                                                        |
| Header: Row change                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Options:                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| A) Drive both layers from shared CSS variables                                                                                                                                                                                                                                                                                                                                                                                                 |
| Overlay positions use calc with registered --fit variables so room and overlay ease together. Effort L (human ~2 days / CC ~1.5h), risk high.                                                                                                                                                                                                                                                                                                  |
| B) Anchor only, instant fit                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Desks keep room positions; the fit changes instantly. Effort S to M (human ~0.5 day / CC ~30min), risk low; limited benefit.                                                                                                                                                                                                                                                                                                                   |
| C) Keep the origin rule, instant fit (recommended)                                                                                                                                                                                                                                                                                                                                                                                             |
| No iso.ts change; new desk pops in; fit changes instantly. Effort S (human ~0 / CC ~10min), risk low.                                                                                                                                                                                                                                                                                                                                          |

State: approved
Actual answer: eng D2 answer: A) Drive both layers from shared CSS variables (the recommended option was C; user chose A)
Accepted scope: anchored room coordinates (CEO D12); fit eased 240 ms (`--dur-base`, set by design D7; originally 300 ms) via `--fit-*` variables registered with `@property`; overlay hit, tag and bubble positions rewritten to `calc(var(--scale) * Npx + var(--fit-x))` with `overlayPoints` and `onFrame` updated; bubbles placed at the final scale; no ease in reduced motion; instant fallback without `@property`; `iso.ts` origin rule and `iso.test.ts`, `room.test.ts` updated; required proof: unit tests for the `calc` positions and for desks keeping room px when a row is added, plus a manual browser check that the overlay stays on its character during the ease (added to the T8 pass).
History: CEO D12 approved "Anchor room coordinates and animate the fit" before the overlay dependency was known; reopened for concrete new risk (overlay desync); eng D2 confirmed A with the overlay fix.

### R2: How a seated waiting agent starts its next coffee break

Finding: eng #2, P1, confidence 9/10, `src/office/motion.ts:341` and `src/office/Character.tsx:174-188`, reviewer: eng review (Claude, same harness).
Plan baseline: CEO D4 and T5: V5 short random break (5 to 20 s) then 20 to 60 s cooldown then the next break, seeded, `machine.ts` timer-free. No mechanism for restarting after the agent settles.
Runtime evidence: `runLoop` stops when `drive.settled(t)` is true (`motion.ts:341`); the Character effect re-runs only when `drive`, `reducedMotion`, `deskZ`, `seed`, `clock` or `onFrame` change (`Character.tsx:188`); `keep()` returns the cached drive when `sig` is unchanged (`motion.ts:247`); the `now` tick (`App.tsx:54`) re-renders Scene but does not change the drive. Today `waitTrip` settles at `at-coffee` for the whole wait. Behavior with a seated, settled drive over a cooldown: not probed (no DOM test env).
Comparison grid:

| Commitment                                                                                                                                                                                                                                                                                                                                   | Plan baseline            | A `nextChange` wake                                                                                                             | B Never settle while waiting                                                             | C Rebuild drive each tick                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| V5 random break and cooldown, seeded                                                                                                                                                                                                                                                                                                         | approved (D4)            | same                                                                                                                            | same                                                                                     | same                                                                                          |
| `machine.ts` timer-free                                                                                                                                                                                                                                                                                                                      | approved                 | same                                                                                                                            | same                                                                                     | same                                                                                          |
| How the next motion starts                                                                                                                                                                                                                                                                                                                   | unspecified              | `Drive.nextChange(t)` returns the next ms the drive moves; `runLoop` arms a timer from the injected clock and restarts the loop | `settled` is false while waiting, so rAF runs about 60 times a second per waiting parent | `sig` includes a tick bucket so `keep()` rebuilds the drive every 15 s and the effect re-runs |
| Idle cost of a seated waiting parent                                                                                                                                                                                                                                                                                                         | none today               | one timer, no frame work                                                                                                        | rAF loop and `onFrame` writes at rest, forever                                           | one rebuild per 15 s tick; break start can be up to 15 s late                                 |
| Testable without DOM                                                                                                                                                                                                                                                                                                                         | n/a                      | yes: `nextChange` is pure, `runLoop` takes `sched`                                                                              | partly                                                                                   | partly                                                                                        |
| Files                                                                                                                                                                                                                                                                                                                                        | `choreo.ts`, `motion.ts` | add `Drive.nextChange`, extend `runLoop` and `sched` with `setTimeout`/`clearTimeout`, tests in `motion.test.ts`                | `motion.ts` only                                                                         | `motion.ts` only                                                                              |
| Effort and risk                                                                                                                                                                                                                                                                                                                              | n/a                      | S to M (human ~0.5 day / CC ~30min), low                                                                                        | S, medium: battery and frame cost at 8 waiting parents                                   | S, medium: late and uneven breaks                                                             |
| Question D3:                                                                                                                                                                                                                                                                                                                                 |
| D3 — R2: How should a seated waiting agent start its next coffee break?                                                                                                                                                                                                                                                                      |
| Project/branch/task: office-agents, feat/office-life, eng review Section 1, V5 and V7.                                                                                                                                                                                                                                                       |
| ELI10: An agent's walking animation stops when it has nowhere to go, and today nothing wakes it up again. That was fine when a waiting parent stayed at the coffee station. With V5 it returns to its desk, sits through a cooldown, and must start another break on its own, but the code that runs animations has no way to schedule that. |
| Stakes if we pick wrong: Without a wake-up, a parent takes one break and then sits forever; the wrong wake-up burns frames or starts breaks late.                                                                                                                                                                                            |
| Recommendation: A because a pure nextChange time plus one timer costs nothing while idle and can be tested with the injected clock, matching the existing runLoop design.                                                                                                                                                                    |
| Note: options differ in kind, not coverage, so no completeness score.                                                                                                                                                                                                                                                                        |
| Pros / cons:                                                                                                                                                                                                                                                                                                                                 |
| A) Add a nextChange wake-up to the drive (recommended)                                                                                                                                                                                                                                                                                       |
| ✅ One timer per waiting agent and no frame work at rest, so a settled agent still costs nothing.                                                                                                                                                                                                                                            |
| ✅ nextChange is a pure function of time, so tests can check the second and third break with fake clocks.                                                                                                                                                                                                                                    |
| ❌ Extends the Drive type and runLoop's scheduler interface, which are used by every driven agent.                                                                                                                                                                                                                                           |
| B) Keep the loop running while a parent waits                                                                                                                                                                                                                                                                                                |
| ✅ Smallest code change: settled just returns false during the wait.                                                                                                                                                                                                                                                                         |
| ✅ No new concept in the Drive type.                                                                                                                                                                                                                                                                                                         |
| ❌ A requestAnimationFrame loop and per-frame style writes run for every waiting parent for the whole wait, which may be hours.                                                                                                                                                                                                              |
| C) Rebuild the drive on each 15 s tick                                                                                                                                                                                                                                                                                                       |
| ✅ Reuses the existing now tick and cache signature, with no new type.                                                                                                                                                                                                                                                                       |
| ✅ Small diff in planMotion only.                                                                                                                                                                                                                                                                                                            |
| ❌ Breaks start up to 15 s late and on a shared rhythm, which looks synchronized instead of random.                                                                                                                                                                                                                                          |
| Net: an idle-free timer with a type change, a constant frame loop, or late and synchronized breaks.                                                                                                                                                                                                                                          |
| Header: Break wake-up                                                                                                                                                                                                                                                                                                                        |
| Options:                                                                                                                                                                                                                                                                                                                                     |
| A) Add a nextChange wake-up to the drive (recommended)                                                                                                                                                                                                                                                                                       |
| Drive.nextChange(t) names the next time the agent moves; runLoop arms a timer from the injected clock. Effort S to M (human ~0.5 day / CC ~30min), risk low.                                                                                                                                                                                 |
| B) Keep the loop running while a parent waits                                                                                                                                                                                                                                                                                                |
| settled stays false during a wait, so rAF runs per waiting parent. Effort S, risk medium.                                                                                                                                                                                                                                                    |
| C) Rebuild the drive on each 15 s tick                                                                                                                                                                                                                                                                                                       |
| The cache signature includes a tick bucket; breaks start up to 15 s late. Effort S, risk medium.                                                                                                                                                                                                                                             |

State: approved
Actual answer: eng D3 answer: A) Add a nextChange wake-up to the drive (recommended option)
Accepted scope: `Drive.nextChange(t)` (pure; the next time the drive moves, or null), `runLoop` arms a timer through an injected scheduler (`setTimeout`/`clearTimeout` added to `sched`) and restarts the frame loop, tests in `motion.test.ts` with fake clocks for the second and third break; applies to every driven agent; `machine.ts` stays timer-free.
History: new finding in eng Section 1; no earlier answer covers the restart mechanism (CEO D4 approved the behavior only).

### R3: Regression contract for the overlay rewrite and the row demand rule

Finding: eng #9, P1 (IRON RULE regression), confidence 9/10, `src/office/motion.ts:355-359`, `src/office/scene-model.ts:59-66`, `src/office/iso.test.ts:109`, `src/office/motion.test.ts:270`, reviewer: eng review (Claude, same harness).
Plan baseline: eng D2 accepted scope requires "unit tests for the `calc` positions and for desks keeping room px when a row is added"; CEO D5 approves rows following seats plus subagents. Neither states what must stay identical to today's behavior.
Runtime evidence: existing tests assert hit centers at least 24 px apart at scale 0.5 with 12 agents (`iso.test.ts:109`, `iso.test.ts:194`, `motion.test.ts:270`), bubbles never overlap (`iso.test.ts:188`), rows from seats (`iso.test.ts:53`) and `deskCountFor` (`scene-model.test.ts`). Whether they still hold after the rewrite: unknown.
Comparison grid:

| Commitment                                                                                                                                                                                                                                                                                                                                                                  | Plan baseline           | A Equivalence contract                                                                           | B Update existing tests only            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------- |
| Overlay hit and tag positions                                                                                                                                                                                                                                                                                                                                               | calc form approved (D2) | at fit offset 0 and any scale, new positions equal `overlayPoints` of today within 0.01 px       | not asserted                            |
| M9 spacing and bubble tests (24 px, no overlap)                                                                                                                                                                                                                                                                                                                             | existing, pass today    | kept and re-expressed through the new position function; they must pass unchanged in meaning     | edited until they pass                  |
| Rows with zero subagents                                                                                                                                                                                                                                                                                                                                                    | CEO D5                  | `rowsNeeded` equals today's rows from `deskCountFor` for every seat set up to 24 (property test) | not asserted                            |
| Seated layering, handoff, door and coffee fixed against back desk (`Scene.test.tsx:199`, `room.test.ts:125`)                                                                                                                                                                                                                                                                | existing                | pass untouched                                                                                   | pass untouched                          |
| New behavior tests (calc positions, desks keep px, hold)                                                                                                                                                                                                                                                                                                                    | approved (D2, D5)       | included                                                                                         | included                                |
| Effort and risk                                                                                                                                                                                                                                                                                                                                                             | n/a                     | S (human ~3h / CC ~20min), low                                                                   | S, higher chance of a silent regression |
| Question D4:                                                                                                                                                                                                                                                                                                                                                                |
| D4 — R3: What must stay identical after the overlay and row-demand changes?                                                                                                                                                                                                                                                                                                 |
| Project/branch/task: office-agents, feat/office-life, eng review Section 3, regression rule for V9 and the overlay rewrite.                                                                                                                                                                                                                                                 |
| ELI10: You approved rewriting how name tags, hit areas and bubbles are positioned, and letting the room grow for subagents. Those are working today, with tests that check they never overlap and stay 24 pixels apart. If the tests are edited to pass after the rewrite, a real regression could slip through. A stated contract keeps today's behavior as the reference. |
| Stakes if we pick wrong: Without a contract, a subtle shift in tags or rows can ship and nobody can say what was supposed to stay the same.                                                                                                                                                                                                                                 |
| Recommendation: A because the existing tests are the only specification of today's behavior, and a small equivalence test makes the rewrite provably safe.                                                                                                                                                                                                                  |
| Note: options differ in coverage.                                                                                                                                                                                                                                                                                                                                           |
| Completeness: A=9/10, B=5/10                                                                                                                                                                                                                                                                                                                                                |
| Pros / cons:                                                                                                                                                                                                                                                                                                                                                                |
| A) Equivalence contract (recommended) (human: ~3h / CC: ~20min)                                                                                                                                                                                                                                                                                                             |
| ✅ New positions are proven equal to today's numbers at any scale, so only the ease is new.                                                                                                                                                                                                                                                                                 |
| ✅ Rows with no subagents are proven identical to today's rule for every seat set up to 24.                                                                                                                                                                                                                                                                                 |
| ❌ Adds a property test and re-expresses the M9 tests, which costs a little time up front.                                                                                                                                                                                                                                                                                  |
| B) Update existing tests only (human: ~1h / CC: ~10min)                                                                                                                                                                                                                                                                                                                     |
| ✅ Least work: edit the broken tests and move on.                                                                                                                                                                                                                                                                                                                           |
| ✅ No new test files.                                                                                                                                                                                                                                                                                                                                                       |
| ❌ Edited tests can hide a real shift in tags, hit areas or rows, which is the regression this rule exists to catch.                                                                                                                                                                                                                                                        |
| Net: a provable no-change guarantee for today's behavior, or edited tests and trust.                                                                                                                                                                                                                                                                                        |
| Header: Regression                                                                                                                                                                                                                                                                                                                                                          |
| Options:                                                                                                                                                                                                                                                                                                                                                                    |
| A) Equivalence contract (recommended)                                                                                                                                                                                                                                                                                                                                       |
| New positions equal today's `overlayPoints` within 0.01 px at fit offset 0; M9 tests kept and re-expressed; `rowsNeeded` equals today's rows with zero subagents for seats up to 24. Effort S (human ~3h / CC ~20min), risk low.                                                                                                                                            |
| B) Update existing tests only                                                                                                                                                                                                                                                                                                                                               |
| Existing tests are edited until they pass; no equivalence assertions. Effort S (human ~1h / CC ~10min), risk medium.                                                                                                                                                                                                                                                        |

State: approved
Actual answer: eng D4 answer: A) Equivalence contract (recommended option)
Accepted scope: at fit offset 0 and any scale, new overlay hit and tag positions equal today's `overlayPoints` within 0.01 px; the M9 tests (`iso.test.ts:109,188,194`, `motion.test.ts:270`) are kept and re-expressed through the new position function without weakening them; `rowsNeeded` with zero subagents equals today's rows from `deskCountFor` for every seat set up to 24 (property test); seated layering, handoff, and "door and coffee fixed against back desk" tests (`Scene.test.tsx:199`, `room.test.ts:125`) pass untouched.
History: new finding in eng Section 3.

Approval readiness: PASS. Checked rows and their actual answers: D1 structure (eng D1, Smaller arrangement), R1 (eng D2, option A), R2 (eng D3, option A), R3 (eng D4, option A). CEO answers D1 to D14 stay as recorded above; R1 supersedes CEO D12 only for the fit mechanism (overlay now included). Every row has its own answer; no row is declined, deferred or unresolved. Implementation values noted below carry no extra approval: namespaced seeds, O(1) `breakPlan`, scoped `inherits`, `translateY` screens.

## Eng review: body (2026-10-02)

### Step 0: Scope Challenge

Scope accepted as-is; new files reduced from 7 to 5 (eng D1). No scope reductions.

### Architecture (4 findings)

1. [P1] (9/10) `src/office/motion.ts:357`, `src/office/Scene.tsx:393`: eased fit would detach the overlay. Disposition: resolved, eng D2 option A with overlay `calc` rewrite.
2. [P1] (9/10) `src/office/motion.ts:341`, `src/office/Character.tsx:188`: a settled drive never restarts, so V5's second break never starts. Disposition: resolved, eng D3 option A (`Drive.nextChange`).
3. [P2] (8/10) `src/office/choreo.ts:155`: sticky desks are index-based, so row hold uses highest held desk index plus one. Disposition: task T7 constraint with a test.
4. [P3] (7/10) `src/office/Scene.tsx:308`: hold state is committed in the post-render effect like `memory.desks`. Disposition: task T7 note.

### Code quality (5 findings)

1. `Scene.tsx:232,236,437`, `motion.ts:69`: four copies of `round(desk.y + 30)`. Accepted via CEO D13.
2. `motion.ts:214` equals `choreo.ts:128`. Accepted via CEO D13.
3. `Scene.tsx:447` hard-coded paper position. Accepted: T4.
4. `appearance.ts:11`, `Character.tsx:144`: break, device and drink must use namespaced seeds. Task E4.
5. New components take `reducedMotion` as a prop. Task note.

### Test review

Diagram in the Section 3 text above (27 gaps; 5 of 32 paths covered today). Test Plan artifact: `~/.gstack/projects/office-agents/nathanael-feat-office-life-eng-review-test-plan-20261002-205925.md`. R3 (eng D4) fixes the regression contract. Tests made obsolete: `motion.test.ts:232`, `choreo.test.ts` infinite-dwell cases, `Scene.test.tsx:181`, the clock grid in `props.test.ts`.

### Performance (3 findings)

1. [P2] (6/10, verify) registered `@property` with `inherits` would restyle about 20k elements per frame: transition the scaled layer's own `transform`; only the overlay container inherits `--fit-*`; check "Recalculate Style" at 24 agents in the T8 pass.
2. [P2] (8/10) `breakPlan` must be O(1) amortized per frame (cached cycle boundaries); test at 1000 cycles.
3. [P3] (7/10) screens animate `transform: translateY` in an `overflow: hidden` box, not `background-position`.

### NOT in scope

Same as the CEO review (V3 tool kind, V5 fillers, desk status light, paper tray, floor robot, door swing). Playwright coverage of overlay alignment stays a manual check in T8 until Phase 5.

### What already exists

`hash` (`appearance.ts:11`), `tripSegs` shared by `idleTrip` and `waitTrip` (`choreo.ts:301`), `runLoop` with an injected scheduler (`motion.ts:328`), `overlayPoints` (`motion.ts:355`, becomes the calc form), M9 tests as the regression reference. Nothing is rebuilt.

### Diagrams

```
 BEFORE (D2/D3)                          AFTER
 Scene --scale--> .scene-scaled          Scene --fit vars--> .scene-scaled (own transform transition)
 Scene --foot*scale--> overlay px                     \-----> .scene-overlay (calc(var(--scale)*Npx + var(--fit-x)))
 drive.settled -> loop stops forever     drive.settled -> loop stops; nextChange(t) arms a timer -> loop restarts
```

Inline diagrams to add or update: `iso.ts` header (anchored origin), `choreo.ts` header and `assignWorkDesks` comment ("rooms never grow"), `motion.ts` Motion docs.

### Failure modes

| Codepath           | Failure                                      | Test?                    | Error handling                        | User sees                 |
| ------------------ | -------------------------------------------- | ------------------------ | ------------------------------------- | ------------------------- |
| overlay `calc`     | `@property` unsupported (Firefox before 128) | planned (feature-detect) | instant fit                           | instant jump, no breakage |
| `nextChange` timer | tab hidden, timer throttled                  | planned (fake clock)     | loop restarts on fire from timestamps | late break, not stuck     |
| `breakPlan` cache  | very long wait                               | planned (1000 cycles)    | bounded cache, O(1) frame             | normal                    |
| `rowsNeeded`       | `now` goes back, over cap                    | planned                  | age floored at 0, door queue          | steady room               |
| Critical gaps: 0.  |

### Worktree parallelization strategy

Sequential implementation after T0, with one possible second lane.

| Step                         | Modules touched                                    | Depends on |
| ---------------------------- | -------------------------------------------------- | ---------- |
| T0 prep refactor             | src/office                                         | —          |
| T1, T2, T3, T4, T9 desk work | src/office (desk-kinds, sprites, Scene, DESIGN.md) | T0         |
| T5, T6 breaks                | src/office (choreo, motion, room)                  | T0, eng D3 |
| T7 rows and overlay          | src/office (iso, scene-model, motion, Scene)       | T0         |
| T10 windows                  | src/office (decor, palette), DESIGN.md             | T1         |

Lane A: T0, T2, T3, T4, T9 (Scene.tsx, sprites). Lane B: T5, T6 after T0 (choreo, room). T7 shares motion.ts and Scene.tsx with both, so it runs after Lane A and B merge; T10 shares DESIGN.md with T2, so it follows T2. Conflict flags: Scene.tsx, motion.ts, DESIGN.md. Realistic result: 2 lanes, 1 parallel pair (A and B), 4 sequential steps.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above. Run with Claude Code or Codex; checkbox as you ship. They add to the CEO tasks T0 to T11 above (file names there follow eng D1: `decor.ts` replaces `clock-face.ts` and `windows.ts`; `rowsNeeded` lives in `scene-model.ts`, no `rows.ts`).

- [ ] **E1 (P1, human: ~2 days / CC: ~1.5h)** — overlay and fit — `calc` overlay positions, `--fit-*` variables, anchored origin
  - Surfaced by: Architecture #1, eng D2.
  - Files: `src/office/iso.ts`, `src/office/motion.ts`, `src/office/Scene.tsx`, `src/office/scene.css`, `src/office/iso.test.ts`, `src/office/room.test.ts`
  - Verify: equivalence test within 0.01 px; desks keep room px when a row is added; manual overlay check in T8.
- [ ] **E2 (P1, human: ~0.5 day / CC: ~30min)** — drive loop — `Drive.nextChange` and timer in `runLoop`
  - Surfaced by: Architecture #2, eng D3.
  - Files: `src/office/motion.ts`, `src/office/Character.tsx`, `src/office/choreo.ts`, `src/office/motion.test.ts`
  - Verify: fake-clock test of the second and third break.
- [ ] **E3 (P1, human: ~3h / CC: ~20min)** — regression contract tests
  - Surfaced by: Test review, eng D4.
  - Files: `src/office/scene-model.test.ts`, `src/office/iso.test.ts`, `src/office/motion.test.ts`
  - Verify: property test: zero-subagent rows equal `deskCountFor` for seat sets up to 24; M9 tests pass re-expressed.
- [ ] **E4 (P2, human: ~1h / CC: ~10min)** — seeds and plan cost — namespaced seeds, O(1) `breakPlan`
  - Surfaced by: Code quality #4, Performance #2.
  - Files: `src/office/breaks.ts`, `src/office/choreo.test.ts`
  - Verify: break, device and appearance seeds differ; 1000-cycle frame cost test.
- [ ] **E5 (P2, human: ~1h / CC: ~10min)** — fit performance — scoped `inherits`, own-transform transition
  - Surfaced by: Performance #1.
  - Files: `src/office/scene.css`, `src/office/Scene.tsx`
  - Verify: "Recalculate Style" cost of a row change at 24 agents in the T8 browser pass.
- [ ] **E6 (P2, human: ~1h / CC: ~10min)** — retire or rewrite obsolete tests
  - Surfaced by: Test review (tests made obsolete).
  - Files: `src/office/motion.test.ts`, `src/office/choreo.test.ts`, `src/office/Scene.test.tsx`, `src/office/props.test.ts`
  - Verify: `vp test` green; no deleted behavior that V5 or V8 still requires.
- [ ] **E7 (P2, human: ~30min / CC: ~5min)** — plan hygiene — apply the eng D1 file arrangement to the CEO task list
  - Surfaced by: Scope Challenge, eng D1.
  - Files: this doc
  - Verify: tasks T1, T7, T10 name `decor.ts` and `scene-model.ts`.

Assumptions: tests about 50x, features about 30x, architecture about 5x.

## Completion summary

- Step 0: Scope Challenge — scope accepted as-is (structure: Smaller arrangement, eng D1)
- Architecture Review: 4 issues found
- Code Quality Review: 5 issues found
- Test Review: diagram produced, 27 gaps identified
- Performance Review: 3 issues found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 items proposed to user
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: codex, disabled (`codex_reviews=disabled`)
- Parallelization: 2 lanes, 1 parallel / 4 sequential
- Lake Score: N/A (no scored question offered a 10/10 option; D4 offered 9/10)

### Unresolved decisions

None.

### Suppressed findings (confidence below 5)

- Safari `<use>` plus CSS animation behavior (not applicable: V3 uses a div overlay).

## Eng review re-run (2026-10-02, after design review)

Target fixed: this plan. Mode: FULL_REVIEW (scope accepted as-is). Scope Challenge: structure answered by eng D1 (Smaller arrangement), reused; no new feature cuts. New files unchanged (5).

### R4: Where the window glass tokens live

Finding: eng re-run #4, P2, confidence 9/10, `src/office/art.test.ts:127-139` and `src/office/CharacterRig.tsx:58`, reviewer: eng review (Claude, same harness).
Plan baseline: design D6 (approved): dim scenes only; sky tokens are glass surfaces exempt from the 3:1 rule; frame uses `--metal` or `--wood`; day tone never brighter than `--plastic`. Where the tokens live is not stated.
Runtime evidence: `art.test.ts:127` builds `graphics = { ...ART }`, deletes only `--art-shade`, `--bubble-text` and `--bubble-muted`, and asserts every other entry is at least 3:1 on `--bg` (`:137-138`). `CharacterRig.tsx:58` spreads `ART` onto `STATIC_STYLE`, which every rig, desk and prop `<svg>` root uses (`:137,201,242,259`), and `Scene.tsx:134` spreads it onto the room shell. A glass token added to `ART` therefore fails the 3:1 test and is also written onto every character root. Whether a dozen extra variables per root is measurable: unknown (not probed).
Comparison grid:

| Commitment                                                                                                                                                                                                                                                                                                                                                                 | Plan baseline (design D6)       | A Separate GLASS palette                                                      | B Add to ART with an exemption list                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| Dim scenes only, glass exempt from 3:1, frame uses existing tokens, day tone at most `--plastic` luminance                                                                                                                                                                                                                                                                 | approved                        | same                                                                          | same                                                     |
| Where glass tokens are defined                                                                                                                                                                                                                                                                                                                                             | unstated                        | new `GLASS` object in `palette.ts`, applied only on the window element        | inside `ART`                                             |
| 3:1 loop in `art.test.ts`                                                                                                                                                                                                                                                                                                                                                  | unchanged                       | unchanged                                                                     | edited: exemption list grows by every glass token        |
| Variables written onto character, desk and prop roots                                                                                                                                                                                                                                                                                                                      | none today                      | none                                                                          | every glass token on every root                          |
| DESIGN.md                                                                                                                                                                                                                                                                                                                                                                  | glass tokens listed as surfaces | own table "Glass tokens" with luminance cap column                            | rows in the Art palette table with an exemption note     |
| Test for the cap                                                                                                                                                                                                                                                                                                                                                           | needed                          | each glass luminance at most `--plastic` luminance; frame tokens at least 3:1 | same, plus exemption bookkeeping                         |
| Effort and risk                                                                                                                                                                                                                                                                                                                                                            | n/a                             | S (human ~1h / CC ~10min), low                                                | S, low; larger per-root style cost and a weaker 3:1 test |
| Question D1:                                                                                                                                                                                                                                                                                                                                                               |
| D1 — R4: Where do the window glass colors live?                                                                                                                                                                                                                                                                                                                            |
| Project/branch/task: office-agents, feat/office-life, eng re-run Section 1, V1 glass tokens.                                                                                                                                                                                                                                                                               |
| ELI10: You approved dim window scenes whose sky colors are exempt from the "every art color is at least 3:1" rule. The color test checks every color in one big list, and that same list is copied onto every character and desk drawing. Dropping glass colors into it would break the test unless the test is edited, and copy a dozen unused colors onto every drawing. |
| Stakes if we pick wrong: A weaker contrast test and extra style on every drawing, or one more small palette to keep in sync.                                                                                                                                                                                                                                               |
| Recommendation: A because glass is a separate surface class with its own rule, so it should have its own palette and test.                                                                                                                                                                                                                                                 |
| Note: options differ in kind, not coverage, so no completeness score.                                                                                                                                                                                                                                                                                                      |
| Pros / cons:                                                                                                                                                                                                                                                                                                                                                               |
| A) Separate GLASS palette (recommended)                                                                                                                                                                                                                                                                                                                                    |
| ✅ The existing 3:1 test stays exactly as strict, and characters never receive window colors.                                                                                                                                                                                                                                                                              |
| ✅ The glass rule (at most --plastic luminance, frame 3:1) gets its own test and DESIGN.md table.                                                                                                                                                                                                                                                                          |
| ❌ One more palette object and table to keep in sync with DESIGN.md.                                                                                                                                                                                                                                                                                                       |
| B) Add glass tokens to ART with an exemption list                                                                                                                                                                                                                                                                                                                          |
| ✅ One palette, the same place as every other color.                                                                                                                                                                                                                                                                                                                       |
| ❌ Weakens the 3:1 test with a growing exemption list and writes unused colors onto every drawing.                                                                                                                                                                                                                                                                         |
| Net: a separate small palette with its own test, or one palette with exemptions.                                                                                                                                                                                                                                                                                           |
| Header: Glass tokens                                                                                                                                                                                                                                                                                                                                                       |
| Options:                                                                                                                                                                                                                                                                                                                                                                   |
| A) Separate GLASS palette (recommended)                                                                                                                                                                                                                                                                                                                                    |
| GLASS object in palette.ts used only by the window; own DESIGN.md table and luminance test; ART and its 3:1 test untouched. Effort S (human ~1h / CC ~10min), risk low.                                                                                                                                                                                                    |
| B) Add glass tokens to ART with an exemption list                                                                                                                                                                                                                                                                                                                          |
| Tokens in ART, named in the 3:1 test's exemption list. Effort S, risk low; weaker test and extra per-root style.                                                                                                                                                                                                                                                           |

State: approved
Actual answer: eng re-run D1 answer: A) Separate GLASS palette (recommended option)
Accepted scope: `GLASS` object in `src/office/palette.ts` used only by the window element; own "Glass tokens" table in DESIGN.md with a luminance-cap column; test: each glass color luminance at most `--plastic` luminance, frame tokens at least 3:1 on `--bg`; `ART` and the 3:1 loop in `art.test.ts` untouched; glass tokens are not written onto character, desk or prop roots.
History: new finding in the eng re-run.

## Eng re-run 3 (2026-10-02, plan unchanged since re-run 2)

Target fixed: this plan. Mode: FULL_REVIEW (scope accepted as-is; structure answered by eng D1). Evidence: `git status` shows no product code or DESIGN.md changes since re-run 2, so the architecture, test and performance findings and their answers (eng D2 to D4, re-run D1) still stand.

Findings (5, Code quality: plan accuracy), all factual corrections with no behavior change, applied now:

1. [P3] (9/10) CEO diagram line (`## Diagrams` item 1) named `clock-face.ts`, `rows.ts`, `windows.ts`; eng D1 replaced them. Corrected.
2. [P3] (9/10) CEO task T1 listed `clock-face.ts`. Corrected to `decor.ts`.
3. [P3] (9/10) CEO task T7 listed `rows.ts`. Corrected to `scene-model.ts`.
4. [P3] (9/10) CEO task T10 listed `windows.ts`. Corrected to `decor.ts`.
5. [P3] (9/10) Eng R1 accepted scope said 300 ms; design D7 set 240 ms (`--dur-base`). Corrected with the history noted.
   Eng task E7 (apply the D1 arrangement to the task list) is done by 1 to 4.

Approval readiness: PASS. No new remedy or choice; all answers cited above stand (eng D1, D2, D3, D4, re-run D1; design D3 to D10). Outside voice: `codex_reviews` disabled, disabled outcome logged. TODOS: none. Parallelization unchanged.

Completion summary (re-run 3): Step 0 scope accepted as-is; Architecture 0 issues; Code Quality 5 issues (all corrected); Test Review: no new gaps (33 total unchanged); Performance 0; Failure modes 0 critical gaps; Unresolved decisions 0; Outside voice disabled; Lake Score N/A.

## Design review (2026-10-02)

Initial design completeness 6/10 (Step 0); lowest rated pass 5/10. Outside voice: Codex completed (single-model; native subagent not run). Mockups: 2 generated, reference = Variant B's room look without text (D2). DESIGN.md calibration: all decisions below are accepted amendments to DESIGN.md and are tasks D1 to D9 below.

### Decisions made (design D2 to D10, each its own answer)

- **D2 mockup:** carry Variant B's room look (blinds, pane-shaped floor light, wall dressing) without headline text, trophy or "TOP AGENT" bubble. Wall dressing itself deferred to TODOS.md (D11).
- **D3 motion budget (Pass 1):** screens step slowly in one color pair, no blinking, idle screens stay dim (no screensaver; replaces V3's "or show a screensaver"); pass-fail check: at 24 agents, 50% scale, one waving agent is found first, also in grayscale. Visual weight order extended: 1 waving agent, 2 working screens, 3 shirts and skin, 4 clock, windows, floor patch, 5 steam, sway, weather, dispenser.
- **D4 waiting cue (Pass 2):** waiting-on-subagents shows a steady half-lit screen (still); idle stays dark; working is animated. Third screen brightness added to the state table with a contrast check.
- **D5 art style (Pass 4):** every new thing is a pixel grid at 2px cells with palette shading; motion in whole cells with `steps()`; no smooth vector (replaces the V1 "flat vector" note).
- **D6 window scenes (Pass 4, 5):** dim scenes only: dusk, night, rain, snow, overcast, dim late-afternoon "day" capped at `--plastic` luminance; sky tokens are declared glass surfaces exempt from the 3:1 rule; frame uses `--metal` or `--wood`; glass never relights characters.
- **D7 camera rule (Pass 5):** Principle 3 amended: the only camera move is the row-change fit, 240 ms (`--dur-base`) with `--ease`, none in reduced motion (replaces the 300 ms in eng D2); desk pop-in is opacity plus an 8px drop, no scaling.
- **D8 50% scale (Pass 6):** every line-like feature at least 2 cells (4px, 2px at 50%); devices differ by silhouette; `?art` sheet shows all new items at 100% and 50%, a populated 24-agent room, a grayscale pass and a shadows-off pass.
- **D9 reduced motion (Pass 6):** matrix in DESIGN.md: windows static; paper keeps the 600 ms highlight, pickup without travel; screens static lit; devices static; dispenser no gurgle; clock minute updates only, no second hand; rows instant; V5 trips stay off (parent stays seated).
- **D10 scene choice (Pass 7):** window scene follows the real hour (user chose B over the recommended per-load pick), within the dim set of D6.

### Accepted-requirement artifacts (no separate question)

State table (what the user sees):

| Feature        | Loading            | Empty                  | Error                                | Success                                             | Partial / reduced motion       |
| -------------- | ------------------ | ---------------------- | ------------------------------------ | --------------------------------------------------- | ------------------------------ |
| Clock          | shows time at once | ticks in an empty room | stale `now`: corrected within 15 s   | real local time                                     | minute updates, no second hand |
| Windows        | scene at load      | visible with no agents | unknown scene: dusk                  | hour-matched dim scene                              | static sky, no weather         |
| Screens        | dark               | dark                   | n/a                                  | working animated, waiting half-lit still, idle dark | static lit and half-lit        |
| Rows and desks | one row            | one row, 3 empty desks | over cap: standing at the door queue | new desk drops in, room eases 240 ms                | instant, no drop               |
| Breaks         | seated             | n/a                    | no spot: stays seated                | short break, back to desk                           | none (seated)                  |

Journey storyboard: step 1 (5 s) empty room alive (clock, dusk glass, steam); step 2 first agent arrives, screen lights; step 3 (5 min) subagents sit at desks, paper lands on the desk; step 4 waiting parent takes a short break and returns to a half-lit still screen; step 5 an agent waves and is found first; step 6 (5 yr) daily glance: alive, never loud.

### Pass scores

Pass 1 information hierarchy 6 to 9; Pass 2 states 6 to 9; Pass 3 journey 6 to 9; Pass 4 slop risk 5 to 9; Pass 5 design system 6 to 9; Pass 6 responsive and accessibility 5 to 9; Pass 7 unscored (8 decisions resolved, 0 deferred). Overall (lowest rated pass): 5/10 to 9/10.

### NOT in scope

Product name "Agent Office" is still a placeholder (existing DESIGN.md open item, Codex hard rejection; not part of this plan). Wall dressing (D11, deferred to TODOS.md). Phone and touch layouts (out of scope in DESIGN.md).

### What already exists

DESIGN.md token tables, `PixelProp` and the 2px grid, `--screen` and `--screen-glow` (defined, unused today; reuse for screens), `--metal`, `--plastic`, `--wood`, `--leaf`, the `?art` sheet, the approved mockup variant A of 2026-10-01.

### Approved Mockups

| Screen/Section                        | Mockup Path                                                                         | Direction                                                          | Notes                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Room with windows, clock, floor light | ~/.gstack/projects/office-agents/designs/office-life-windows-20261002/variant-B.png | Dim dusk glass with blinds, pane-shaped floor light, wall dressing | No text, trophy or bubble from the mockup; wall dressing deferred (D11); user gave "B" without a board rating |

### Implementation Tasks

Synthesized from this review's findings. They add to CEO tasks T0 to T11 and eng tasks E1 to E7.

- [ ] **D1 (P1, human: ~2h / CC: ~15min)** — screens — quiet stepped screens, half-lit waiting state, no screensaver
  - Surfaced by: Pass 1 (D3), Pass 2 (D4)
  - Files: `src/office/DeskLayer.tsx`, `src/office/scene.css`, `src/office/desk-kinds.ts`, `DESIGN.md`
  - Verify: one overlay per working desk, none for waiting or idle; half-lit still for waiting; 24-agent 50% grayscale check on `?art`.
- [ ] **D2 (P1, human: ~1h / CC: ~10min)** — DESIGN.md — amend Principle 3 and Motion: row-change fit 240 ms `--dur-base` with `--ease`, pop-in opacity plus 8px drop
  - Surfaced by: Pass 5 (D7)
  - Files: `DESIGN.md`, `src/office/scene.css`
  - Verify: eng E1 fit uses `--dur-base`; `art.test.ts` still green.
- [ ] **D3 (P1, human: ~1h / CC: ~10min)** — windows — dim scene set, glass tokens, hour-matched choice
  - Surfaced by: Pass 4, 5 (D6), Pass 7 (D10)
  - Files: `src/office/decor.ts`, `src/office/palette.ts`, `DESIGN.md`
  - Verify: hour-to-scene map unit test; glass tokens listed in DESIGN.md as surfaces; frame at 3:1; no scene brighter than `--plastic`.
- [ ] **D4 (P2, human: ~2h / CC: ~15min)** — style sheet — 100% and 50% sheet, 24-agent room, grayscale and shadows-off passes, size floor
  - Surfaced by: Pass 6 (D8)
  - Files: `src/office/ArtSheet.tsx`, `src/office/art.test.ts`
  - Verify: every new item present on the sheet; line features at least 2 cells.
- [ ] **D5 (P2, human: ~1h / CC: ~10min)** — DESIGN.md — reduced-motion matrix and state-table rows, real-time clock exception, subagent text for V9
  - Surfaced by: Pass 2, 5, 6 (D4, D9)
  - Files: `DESIGN.md`
  - Verify: each matrix row has a test in the matching item task.
- [ ] **D6 (P2, human: ~1h / CC: ~10min)** — art style — grid-authored clock hands, windows, devices; `steps()` motion
  - Surfaced by: Pass 4 (D5)
  - Files: `src/office/props.ts`, `src/office/decor.ts`, `src/office/scene.css`
  - Verify: no smooth vector shapes in new props; ArtSheet at 50%.

### Completion summary

```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | DESIGN.md exists, strict; UI scope: yes     |
  | Step 0               | 6/10; all 7 passes                          |
  | Pass 1  (Info Arch)  | 6/10 → 9/10 after fixes                     |
  | Pass 2  (States)     | 6/10 → 9/10 after fixes                     |
  | Pass 3  (Journey)    | 6/10 → 9/10 after fixes                     |
  | Pass 4  (AI Slop)    | 5/10 → 9/10 after fixes                     |
  | Pass 5  (Design Sys) | 6/10 → 9/10 after fixes                     |
  | Pass 6  (Responsive) | 5/10 → 9/10 after fixes                     |
  | Pass 7  (Decisions)  | 8 resolved, 0 deferred                      |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (3 items)                           |
  | What already exists  | written                                     |
  | TODOS.md updates     | 1 item proposed, added (D11)                |
  | Approved Mockups     | 2 generated, 1 approved (B, look only)      |
  | Decisions made       | 9 added to plan                             |
  | Decisions deferred   | 0                                           |
  | Overall design score | 5/10 → 9/10                                 |
  +====================================================================+
```

### Unresolved Decisions

None. Open implementation values (owner builder, each with a check): sky and glass token values and contrast (T10, `art.test.ts`); hour-to-scene map and the swap at an hour boundary (default: instant swap with no motion, checked on the `?art` sheet); half-lit screen brightness step (contrast check, D1).

### Eng re-run body

**Architecture (4 findings)**

1. [P2] (9/10) `scene-model.ts:27-35` `lit: state === "working"` and `Scene.tsx:442` `SharedDesk lit={...}` give two screen states; design D4 needs three. Disposition: accepted via design D4. Task F1: `Look.screen: "off" | "still" | "live"`; working draws the animated overlay, waiting draws the same overlay still at about half brightness, idle none.
2. [P2] (8/10) `App.tsx:54` ticks `now` every 15 s; the hour-matched scene (design D10) must be a pure function of (local date, hour) with a seeded variant, so a reload in the same hour shows the same scene. Disposition: accepted via design D10. Task F2.
3. [P2] (8/10) `Scene.tsx:183-191` `memory` holds the previous desk count for the pop-in (design D7); the first render and a reload replay must not pop, and reduced motion never pops. Disposition: accepted via design D7. Task F3.
4. [P2] (9/10) `art.test.ts:127-139`, `CharacterRig.tsx:58`: glass token placement. Disposition: resolved, eng re-run D1 option A (R4).

**Code quality (1 finding)** 5. [P3] (8/10) The 240 ms row-change duration comes from the CSS token `--dur-base`, never a JS number, so `E1` and DESIGN.md cannot drift. Disposition: accepted via design D7; task note on E1.

**Test review: delta to the earlier diagram (6 new gaps)**

```
[+] scene-model.ts lookFor -> screen state     [GAP] 3-state table (working live, waiting still, idle off)
[+] decor.ts sceneFor(date, hour)              [GAP] 24 hours covered, same date+hour same scene, no scene above --plastic luminance
[+] pop-in indexes (prev rows, next rows)      [GAP] first render none, growth lists only new desks, reduced motion none
[+] palette.ts GLASS                           [GAP] luminance cap and frame 3:1 (own test)
[+] DESIGN.md reduced-motion matrix (design D9)[GAP] one assertion per row (windows, paper, screens, devices, dispenser, clock, rows)
[+] ArtSheet 100% and 50% sheet (design D8)    [GAP] sheet lists every new item; line features at least 2 cells
COVERAGE: earlier 5/32 paths plus 0/6 new; GAPS: 33 total (4 [→E2E]); no new E2E beyond the manual T8 pass
```

Test Plan artifact: `~/.gstack/projects/office-agents/nathanael-feat-office-life-eng-review-test-plan-20261002-205925.md` gains the six rows above (Pending Decisions: none).

**Performance (0 findings).** Pop-in touches only new desks; hourly scene swap is one re-render of `RoomDecor`; glass tokens stay off character roots (R4).

**Outside voice:** `codex_reviews` is disabled for this caller: no outside process, no native replacement, disabled outcome logged.
**TODOS:** no new proposals.
**Failure modes:** none new with RESCUED=N and TEST=N and silent result: 0 critical gaps. Parallelization: unchanged (2 lanes, 1 parallel pair).

### Implementation Tasks (eng re-run)

- [ ] **F1 (P2, human: ~2h / CC: ~15min)** — screens — three-state `Look.screen`
  - Surfaced by: Architecture #1, design D4
  - Files: `src/office/scene-model.ts`, `src/office/Scene.tsx`, `src/office/scene-model.test.ts`
  - Verify: table test of three states; static under reduced motion.
- [ ] **F2 (P2, human: ~1h / CC: ~10min)** — windows — pure `sceneFor(date, hour)` with seeded variant
  - Surfaced by: Architecture #2, design D10
  - Files: `src/office/decor.ts`, `src/office/decor.test.ts`
  - Verify: 24 hours covered, stable within an hour, luminance cap.
- [ ] **F3 (P2, human: ~1h / CC: ~10min)** — rows — pop-in indexes from `memory` previous count
  - Surfaced by: Architecture #3, design D7
  - Files: `src/office/scene-model.ts`, `src/office/Scene.tsx`, `src/office/scene.css`
  - Verify: first render and reload no pop; growth pops only new desks; reduced motion none.
- [ ] **F4 (P2, human: ~1h / CC: ~10min)** — palette — `GLASS` palette and its test
  - Surfaced by: Architecture #4, eng re-run D1
  - Files: `src/office/palette.ts`, `DESIGN.md`, `src/office/art.test.ts`
  - Verify: luminance cap and frame 3:1 tests; `ART` loop unchanged.
- [ ] **F5 (P3, human: ~30min / CC: ~5min)** — fit duration — CSS `--dur-base` only
  - Surfaced by: Code quality #5, design D7
  - Files: `src/office/scene.css`, `src/office/Scene.tsx`
  - Verify: no numeric 240 or 300 in `Scene.tsx` for the fit.

### Completion summary (eng re-run)

- Step 0: Scope Challenge — scope accepted as-is (structure: Smaller arrangement, eng D1 reused)
- Architecture Review: 4 issues found
- Code Quality Review: 1 issue found
- Test Review: diagram produced, 6 gaps identified
- Performance Review: 0 issues found
- NOT in scope: unchanged
- What already exists: unchanged
- TODOS.md updates: 0 items proposed to user
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: codex, disabled (`codex_reviews=disabled`)
- Parallelization: 2 lanes, 1 parallel / 4 sequential
- Lake Score: N/A (no scored question)

## GSTACK REVIEW REPORT

| Review         | Trigger                                                              | Why                             | Runs | Status                                                                                      | Findings                                                   |
| -------------- | -------------------------------------------------------------------- | ------------------------------- | ---- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| CEO Review     | `/plan-ceo-review`                                                   | Scope & strategy                | 1    | CLEAR                                                                                       | 7 proposals, 1 accepted, 6 deferred                        |
| Outside Review | codex, `/plan-design-review`, `/plan-eng-review`, `/plan-ceo-review` | Independent 2nd opinion         | 5    | completed (design); disabled (CEO, eng x3)                                                  | design: 8 findings, 8 resolved; others no completed review |
| Eng Review     | `/plan-eng-review`                                                   | Architecture & tests (required) | 3    | ISSUES OPEN (5 plan-text corrections this run, all applied; logged right after this report) | 5 issues, 0 critical gaps                                  |
| Design Review  | `/plan-design-review`                                                | UI/UX gaps                      | 1    | CLEAR                                                                                       | score: 5/10 → 9/10, 9 decisions                            |
| DX Review      | `/plan-devex-review`                                                 | Developer experience gaps       | 0    | —                                                                                           | —                                                          |

**OUTSIDE COVERAGE:** codex, design phase, completed (single-model); codex, CEO and the three eng phases, disabled by `codex_reviews=disabled`.
**VERDICT:** CEO + DESIGN CLEARED. Eng review (3 runs) has 0 unresolved decisions and 0 critical gaps; this run's 5 plan-text corrections are applied, so the next run on this unchanged plan should record zero issues and clear.

NO UNRESOLVED DECISIONS
