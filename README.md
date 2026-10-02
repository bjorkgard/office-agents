# Office Agents

A local web app that shows your running Claude Code agents and subagents as people in an isometric office.

> **Status: early development.** The live office works in `vp dev`: the feed, the scene and the top bar are built. Some of the behavior below is still planned; progress is tracked in the roadmap.

Run it with `vp dev` and open the page. Every recently active Claude Code session appears as a character sitting at a computer (only macOS is exercised at first). Agents of the same project wear the same shirt color, and each gets a generated name and gender that stay the same across reloads.

- **Working:** the character types at the desk, and the screen glows.
- **Subagents:** they walk in and hand paper to and from the parent agent.
- **Waiting for subagents:** the character takes a coffee break.
- **Needs you:** the character waves and a speech bubble appears. A chip in the top bar, a tab title count `(N)` and a dot on the tab icon show who is waiting. At first this is a heuristic (the last message ends with a question mark, or a tool call has no result for a while), so it can wave falsely or miss a request. The hooks adapter on the roadmap makes it exact.
- **Done:** a subagent walks out when its result returns. A top-level agent stays at its desk, idle, and walks out after a quiet period.

**What each banner means** (middle of the top bar):

- **Connecting...:** the page is waiting for the first data from the feed.
- **No active Claude Code sessions:** the feed works, but no session has been active recently. The desks stay empty.
- **Reconnecting...:** the connection dropped. The last scene stays on screen unchanged while the page retries.
- **Refused: open this page from localhost:** the feed answered 403. It checks every request's Host header and remote address and serves only loopback ones, so a page opened through a LAN address, another hostname, or from another machine is refused. Open the page at `http://localhost:<port>` on the machine that runs `vp dev`.
- **Feed unavailable, retrying:** the feed is not answering. This shows on a built page (`vp build`) that has no feed, when the feed plugin failed to load (404 on `/__office/events`), or when the feed refuses with 503 (too many clients). The page retries on a timer.
- **Display error: reload the page:** the scene hit an error while drawing. The top bar stays up. The details are in the browser console. Reload the page.

Where to look: the `vp dev` terminal prints a feed log line, and `GET /__office/status` returns the feed state as JSON. Bad or invalid feed events are skipped and counted, with one dev warning per kind in the browser console.

The feed reads the transcripts Claude Code already writes in `~/.claude/projects`. Those can contain file contents and secrets, so the feed runs inside the Vite dev server and is meant to refuse any request when the dev server is not bound to localhost (for example with `vp dev --host`).

Design and review notes: [docs/designs/office-agents-isometric-office.md](docs/designs/office-agents-isometric-office.md). Visual rules: [DESIGN.md](DESIGN.md). Build order: [BUILD_TODO.md](BUILD_TODO.md). Phase 0 art check: [docs/designs/phase-0-sprite-notes.md](docs/designs/phase-0-sprite-notes.md). Third-party notices: [NOTICE](NOTICE). Deferred ideas: [TODOS.md](TODOS.md).

## Roadmap

- [x] Design doc, engineering review and design review
- [x] Check CC0 sprite packs for poses and a clean shirt color band (none fit; characters and props will be drawn)
- [x] Draw characters and props as isometric pixel sprites (BUILD_TODO 4.0)
- [x] Recolor shirts by project with a CSS variable (BUILD_TODO 4.3)
- [x] Event types and transcript normalizer
- [x] Feed plugin: tail transcripts, stream to the browser, refuse non-localhost hosts
- [x] State machine and seeded identity (name, gender, project color)
- [x] Office scene: desks, characters, top bar, status banner
- [x] Subagent walk-in and paper handoff
- [x] Wave, speech bubble and tab title count
- [x] Reduced motion, keyboard and screen reader support
- [ ] End-to-end test with a fixture transcript
- [ ] Hooks adapter for exact attention signals

### Roadmap rules

- Tick a checkbox when the work is done.
- Add a new checkbox when we get a new idea.

## Development

This project uses [Vite+](https://viteplus.dev/guide/); install its global `vp` CLI first. Then run `vp install` and `vp dev`. Run `vp check` before committing. `vp test` runs the Vitest suite. In dev only, open `/?art` to see the character and prop style sheet (poses, desk, appearance variants, a 12-agent row at 50%); the sheet is not part of the production build. Open `/?demo` to watch a scripted tour without real sessions (arrivals, work, a wave, a subagent trip, an idle coffee break); `/?demo=12` and `/?demo=24` show a crowded room. The demo feed is dev only and is not part of the production build.
