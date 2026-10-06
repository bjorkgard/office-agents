# Office Agents

A local web app that shows your running Claude Code agents and subagents as people in an isometric office.

![The office with a few agents at their desks](docs/hero.png)

> **Status: early development.** The live office works in `vp dev`. Only macOS is exercised so far.

## What it does

Every recently active Claude Code session appears as a character at a desk. Each session gets its own shirt color and a generated name that stay the same across reloads.

- **Working:** the character types and the screen shows scrolling lines.
- **Subagents:** they walk in, take a sheet of paper from the parent's desk, sit at an empty desk and work. When done they hand the paper back and walk out.
- **Waiting for subagents:** the character stays put and takes short drink breaks.
- **Needs you:** the character waves and a speech bubble appears. The top bar, the tab title `(N)` and the tab icon show who is waiting. An optional chime (off by default) can announce it.
- **Done:** a subagent leaves when its result returns. A top-level agent stays idle, then leaves after a quiet period.

The room is alive too: a wall clock, windows that follow the local hour and weather, and rows of desks that grow to 24 as subagents need them. All of it is decoration and never changes an agent's state.

The feed reads the transcripts Claude Code already writes in `~/.claude/projects`. They can contain file contents and secrets, so the feed runs inside the Vite dev server and refuses any request that is not from localhost. Do not run it with `vp dev --host`.

## Install

Requirements: Node.js and the global [Vite+](https://viteplus.dev/guide/) CLI (`vp`).

```sh
git clone https://github.com/bjorkgard/office-agents.git
cd office-agents
vp install
vp dev
```

Open the printed `http://localhost:<port>` URL. Run Claude Code in other terminals and their sessions appear as people.

To try it without real sessions, open `/?demo` (or `/?demo=12`, `/?demo=24` for a crowded room).

### Exact attention signals (optional)

By default the office guesses who is waiting from the transcripts. Claude Code hooks make it exact. Nothing is installed unless you ask.

```sh
node hooks/install.mjs            # print the hooks snippet, write nothing
node hooks/install.mjs --apply    # merge into ~/.claude/settings.json (backup first)
node hooks/install.mjs --remove   # remove this checkout's entries
```

The hook sends only IDs, event names and paths to the dev server on loopback, never message or transcript contents. Details are in [docs/reference.md](docs/reference.md).

## Contributing

1. Fork and clone, then run `vp install`.
2. Make your change on a branch.
3. Run `vp check` (format, lint, types) and `vp test` before committing.
4. For UI or feed changes, run the end-to-end tests: `npx playwright install chromium` once, then `vp run e2e`. Free ports 5201 to 5206 first. The tests use temporary transcript folders and never read your real `~/.claude/projects`.
5. Open a pull request. CI runs `vp check`, `vp test` and the E2E suite.

Useful dev-only pages: `/?art` shows the sprite style sheet, `/?demo` runs a scripted tour.

Where to look next:

- [docs/reference.md](docs/reference.md): banners, debug hooks, release checks and test details
- [DESIGN.md](DESIGN.md): visual rules
- [TODOS.md](TODOS.md): deferred ideas, a good place to find work
- [BUILD_TODO.md](BUILD_TODO.md): build order
- [CHANGELOG.md](CHANGELOG.md) and [NOTICE](NOTICE): history and third-party notices
