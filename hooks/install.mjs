#!/usr/bin/env node
/**
 * Installer for the Office Agents Claude Code hooks. Prints by default and writes nothing.
 *   node hooks/install.mjs                       print the snippet and how to apply it
 *   node hooks/install.mjs --apply               merge into the settings file
 *   node hooks/install.mjs --remove              remove only our entries
 *   --settings <path>   settings file (default ~/.claude/settings.json)
 *   --dry-run           with --apply/--remove: print the resulting JSON, write nothing
 */
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const EVENTS = ["PermissionRequest", "Notification", "SubagentStart", "SubagentStop"];
export const SCRIPT_NAME = "office-hook.mjs";

class Refusal extends Error {}

/** POSIX single-quote quoting: safe for spaces and quotes in the path. */
export const shellQuote = (s) => `'${s.replaceAll("'", `'\\''`)}'`;

export function ourCommand(scriptPath) {
  return `node ${shellQuote(scriptPath)}`;
}

export function ourEntry(scriptPath) {
  return {
    matcher: "",
    hooks: [{ type: "command", command: ourCommand(scriptPath), timeout: 2, async: true }],
  };
}

/** Splits a shell command into words, honouring single quotes, double quotes and backslashes. */
function shellWords(cmd) {
  const words = [];
  let cur = "";
  let inWord = false;
  let q = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q === "'") {
      if (c === "'") q = null;
      else cur += c;
    } else if (q === '"') {
      if (c === '"') q = null;
      else if (c === "\\" && i + 1 < cmd.length) cur += cmd[++i];
      else cur += c;
    } else if (c === "'" || c === '"') {
      q = c;
      inWord = true;
    } else if (c === "\\" && i + 1 < cmd.length) {
      cur += cmd[++i];
      inWord = true;
    } else if (/\s/.test(c)) {
      if (inWord) words.push(cur);
      cur = "";
      inWord = false;
    } else {
      cur += c;
      inWord = true;
    }
  }
  if (inWord) words.push(cur);
  return words;
}

/** True when a hook command runs our script (final path segment of an argument is exactly its name). */
function isOurs(h) {
  if (typeof h?.command !== "string") return false;
  return shellWords(h.command).some(
    (w) => w.split(/[\\/]/).pop() === SCRIPT_NAME && w !== SCRIPT_NAME,
  );
}

/** One line for the user: the installed command points into this checkout, not a copy. */
const checkoutNote = (scriptPath) =>
  `The hook runs ${scriptPath} from this repository checkout: moving or deleting the checkout disables it, and any change to that script runs on every hook event.`;

export function snippet(scriptPath) {
  return { hooks: Object.fromEntries(EVENTS.map((e) => [e, [ourEntry(scriptPath)]])) };
}

const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

function checkShape(settings) {
  if (!isObj(settings)) throw new Refusal("settings file is not a JSON object");
  if (settings.hooks === undefined) return;
  if (!isObj(settings.hooks)) throw new Refusal("`hooks` is not an object");
  for (const [event, groups] of Object.entries(settings.hooks)) {
    if (!Array.isArray(groups)) throw new Refusal(`hooks.${event} is not an array`);
    for (const g of groups) {
      if (!isObj(g) || !Array.isArray(g.hooks)) {
        throw new Refusal(`hooks.${event} has an entry of unexpected shape`);
      }
    }
  }
}

/** Pure merge: returns a new settings object with our entries added (idempotent) or removed. */
export function transform(settings, mode, scriptPath) {
  checkShape(settings);
  const out = { ...settings };
  const hooks = { ...(settings.hooks ?? {}) };
  let emptiedByUs = false;
  for (const event of EVENTS) {
    const groups = hooks[event] ?? [];
    // Remove only touches events where one of our hooks is present.
    if (mode === "remove" && !groups.some((g) => g.hooks.some(isOurs))) continue;
    // Strip our hook objects everywhere; drop groups that held only ours.
    const kept = [];
    for (const g of groups) {
      const rest = g.hooks.filter((h) => !isOurs(h));
      if (rest.length === g.hooks.length) kept.push(g);
      else if (rest.length > 0) kept.push({ ...g, hooks: rest });
    }
    const next = mode === "apply" ? [...kept, ourEntry(scriptPath)] : kept;
    if (next.length > 0) hooks[event] = next;
    else {
      delete hooks[event];
      emptiedByUs = true;
    }
  }
  if (Object.keys(hooks).length > 0) out.hooks = hooks;
  else if (settings.hooks !== undefined && emptiedByUs) delete out.hooks;
  return out;
}

function isDirectory(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function parseArgs(argv) {
  const opts = { apply: false, remove: false, dryRun: false, settings: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") opts.apply = true;
    else if (a === "--remove") opts.remove = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--settings") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Refusal("--settings needs a path");
      opts.settings = value;
    } else throw new Refusal(`unknown argument: ${a}`);
  }
  if (opts.apply && opts.remove) throw new Refusal("use --apply or --remove, not both");
  return opts;
}

export function run(argv, out = (s) => process.stdout.write(`${s}\n`)) {
  const opts = parseArgs(argv);
  const scriptPath = join(dirname(fileURLToPath(import.meta.url)), SCRIPT_NAME);
  const settingsPath = opts.settings ?? join(homedir(), ".claude", "settings.json");

  if (!opts.apply && !opts.remove) {
    out(`Add this to ${settingsPath} (merge it into any existing "hooks" key):`);
    out("");
    out(JSON.stringify(snippet(scriptPath), null, 2));
    out("");
    out("Or let the installer merge it (backs up the file first):");
    out(`  node ${shellQuote(join(dirname(scriptPath), "install.mjs"))} --apply`);
    out("Remove later with --remove. Add --dry-run to preview. Nothing was written.");
    out("");
    out("Notes:");
    out(`- ${checkoutNote(scriptPath)}`);
    out("- Which Notification types fire for a permission prompt or an agent question is");
    out("  UNVERIFIED. The mapping lives in server/hooks-adapter.ts.");
    out("- After changing hooks, check /hooks in Claude Code to confirm they are active.");
    return;
  }

  const mode = opts.apply ? "apply" : "remove";
  let before = null;
  let settings = {};
  let target = settingsPath;
  let fileMode = 0o600;
  let present = true;
  try {
    lstatSync(settingsPath);
  } catch {
    present = false;
  }
  if (present) {
    // Work on the real file so a symlinked settings file stays a symlink.
    try {
      target = realpathSync(settingsPath);
    } catch {
      throw new Refusal(`${settingsPath} is a dangling symlink; nothing changed`);
    }
    fileMode = statSync(target).mode & 0o777;
    before = readFileSync(target);
    try {
      settings = JSON.parse(before.toString("utf8"));
    } catch {
      throw new Refusal(`${settingsPath} is not valid JSON; nothing changed`);
    }
  } else if (mode === "remove") {
    out(`${settingsPath} does not exist; nothing to remove.`);
    return;
  } else if (!isDirectory(dirname(settingsPath))) {
    throw new Refusal(
      `settings directory ${dirname(settingsPath)} does not exist; nothing created`,
    );
  }
  const result = transform(settings, mode, scriptPath);
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (opts.dryRun) {
    out(text.trimEnd());
    return;
  }
  if (before !== null) {
    const backup = `${target}.bak-${stamp()}`;
    copyFileSync(target, backup);
    out(`Backup: ${backup}`);
  }
  const tmp = join(dirname(target), `.${basename(target)}.${process.pid}.tmp`);
  writeFileSync(tmp, text, { mode: fileMode });
  chmodSync(tmp, fileMode);
  renameSync(tmp, target);
  out(`${mode === "apply" ? "Installed into" : "Removed from"} ${settingsPath}`);
  if (mode === "apply") out(checkoutNote(scriptPath));
  out("Check /hooks in Claude Code to confirm. Which Notification types fire is UNVERIFIED.");
}

// realpath: a symlinked path (macOS /var -> /private/var) must still count as the entry point.
const entry = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === entry) {
  try {
    run(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${e instanceof Refusal ? e.message : `error: ${String(e)}`}\n`);
    process.exit(1);
  }
}
