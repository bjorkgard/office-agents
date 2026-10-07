# Hook probe

Settles which Claude Code hooks fire for a permission prompt, an `AskUserQuestion`, and an idle
wait. The probe logs ids and key names only (no messages, prompts, tool input, cwd or paths) to
`~/.office-agents/probe.log`. It touches no real settings file.

1. Print the setup: `node hooks/probe.mjs`. It writes a temp settings file and prints the exact
   `claude --settings <file>` command. Check that `node` is on the PATH Claude Code uses
   (`which node`); if it is not, the hooks silently never run.
2. Launch Claude Code with that printed command, in a scratch directory.
3. Trigger a Bash permission prompt (ask Claude to run a command that needs approval). Leave the
   prompt unanswered for 20 s, then answer it.
4. Ask Claude to ask you a question (it will use `AskUserQuestion`). Leave it unanswered for
   20 s, then answer it.
5. Leave Claude idle at the prompt for 90 s, then exit.
6. Run `node hooks/probe.mjs --summary` and paste the output. It lists per event the count and
   the `notification_type` values seen, and ends with `pair shares tool_use_id: yes/no/unknown`
   (a PermissionRequest and a Notification in one session within 5 s sharing a `tool_use_id`).

The log appends: delete `~/.office-agents/probe.log` BEFORE each run (and afterwards to reset). Remove the probe once the mapping is settled.
