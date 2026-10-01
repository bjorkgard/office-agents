# Office Agents

A local web app that shows your running Claude Code agents and subagents as people in an isometric office.

Run it with `vp dev` and open the page. Every Claude Code session appears as a character sitting at a computer. Agents of the same project wear the same shirt color, and each gets a random name and gender.

- **Working:** the character types at the desk, and the screen glows.
- **Subagents:** they walk in and hand paper to and from the parent agent.
- **Waiting for subagents:** the character takes a coffee break.
- **Needs you:** the character waves and a speech bubble appears. A chip in the top bar and a tab title count `(N)` show who is waiting.
- **Done:** the character walks out of the office.

The feed reads the transcripts Claude Code already writes in `~/.claude/projects`. It runs inside the Vite dev server and only serves on localhost.

Design and review notes: [docs/designs/office-agents-isometric-office.md](docs/designs/office-agents-isometric-office.md). Deferred ideas: [TODOS.md](TODOS.md).

## Roadmap

- [x] Design doc, engineering review and design review
- [ ] Check the CC0 sprite pack for poses and a clean shirt color band
- [ ] Event types and transcript normalizer
- [ ] Feed plugin: tail transcripts and stream to the browser
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

This project uses Vite+. Run `vp install`, then `vp dev`. Run `vp check` and `vp test` before committing.
