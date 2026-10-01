# Office Agents

A local web app that shows your running Claude Code agents and subagents as people in an isometric office.

> **Status: early development.** The design is done and the app is not built yet. Everything below describes the planned behavior; progress is tracked in the roadmap.

Run it with `vp dev` and open the page. Every recently active Claude Code session appears as a character sitting at a computer (only macOS is exercised at first). Agents of the same project wear the same shirt color, and each gets a generated name and gender that stay the same across reloads.

- **Working:** the character types at the desk, and the screen glows.
- **Subagents:** they walk in and hand paper to and from the parent agent.
- **Waiting for subagents:** the character takes a coffee break.
- **Needs you:** the character waves and a speech bubble appears. A chip in the top bar and a tab title count `(N)` show who is waiting. At first this is a heuristic (the last message ends with a question mark, or a tool call has no result for a while), so it can wave falsely or miss a request. The hooks adapter on the roadmap makes it exact.
- **Done:** a subagent walks out when its result returns. A top-level agent stays at its desk, idle, and walks out after a quiet period.

The feed reads the transcripts Claude Code already writes in `~/.claude/projects`. Those can contain file contents and secrets, so the feed runs inside the Vite dev server and is meant to refuse any request when the dev server is not bound to localhost (for example with `vp dev --host`).

Design and review notes: [docs/designs/office-agents-isometric-office.md](docs/designs/office-agents-isometric-office.md). Deferred ideas: [TODOS.md](TODOS.md).

## Roadmap

- [x] Design doc, engineering review and design review
- [ ] Choose a CC0 sprite pack and check it for poses and a clean shirt color band
- [ ] Event types and transcript normalizer
- [ ] Feed plugin: tail transcripts, stream to the browser, refuse non-localhost hosts
- [ ] State machine and seeded identity (name, gender, project color)
- [ ] Office scene: desks, characters, top bar, status banner
- [ ] Subagent walk-in and paper handoff
- [ ] Wave, speech bubble and tab title count
- [ ] Reduced motion, keyboard and screen reader support
- [ ] End-to-end test with a fixture transcript
- [ ] Hooks adapter for exact attention signals

### Roadmap rules

- Tick a checkbox when the work is done.
- Add a new checkbox when we get a new idea.

## Development

This project uses [Vite+](https://viteplus.dev/guide/); install its global `vp` CLI first. Then run `vp install` and `vp dev`. Run `vp check` before committing. `vp test` fails until the first test file exists.
