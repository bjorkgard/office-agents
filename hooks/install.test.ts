import { spawnSync } from "node:child_process";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const HOOKS_DIR = dirname(fileURLToPath(import.meta.url));
const INSTALL = join(HOOKS_DIR, "install.mjs");
const EVENTS = ["PermissionRequest", "Notification", "SubagentStart", "SubagentStop"];

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "office-hook-install-"));
  file = join(dir, "settings.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function install(...args: string[]) {
  // HOME points into the temp dir so a missing --settings can never reach the real one.
  const r = spawnSync(process.execPath, [INSTALL, ...args], {
    encoding: "utf8",
    env: { ...process.env, HOME: dir, USERPROFILE: dir },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}
const read = () => JSON.parse(readFileSync(file, "utf8"));
const backups = () => readdirSync(dir).filter((f) => f.includes(".bak-"));
const ours = (cmd: string) => cmd.includes("office-hook.mjs");
const ourCount = (settings: {
  hooks?: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
}) =>
  Object.values(settings.hooks ?? {}).reduce(
    (n, groups) => n + groups.flatMap((g) => g.hooks).filter((h) => ours(h.command)).length,
    0,
  );

const other = {
  theme: "dark",
  hooks: {
    Notification: [{ matcher: "x", hooks: [{ type: "command", command: "echo mine" }] }],
    Stop: [{ matcher: "", hooks: [{ type: "command", command: "echo stop" }] }],
  },
};

describe("install.mjs print mode", () => {
  it("prints the snippet and writes nothing", () => {
    writeFileSync(file, '{"a":1}');
    const past = new Date(2020, 0, 1);
    utimesSync(file, past, past);
    const before = statSync(file).mtimeMs;
    const r = install("--settings", file);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("UNVERIFIED");
    expect(r.stdout).toContain("/hooks");
    expect(r.stdout).toContain("office-hook.mjs");
    expect(statSync(file).mtimeMs).toBe(before);
    expect(readFileSync(file, "utf8")).toBe('{"a":1}');
    expect(readdirSync(dir)).toEqual(["settings.json"]);
  });

  it("says the hook runs the script from this checkout, with its path", () => {
    const r = install("--settings", file);
    const line = r.stdout.split("\n").find((l) => l.includes("from this repository checkout"));
    expect(line).toContain(join(HOOKS_DIR, "office-hook.mjs"));
    expect(line).toContain("moving or deleting");
    expect(line).toContain("runs on every hook event");
  });

  it("prints a parseable hooks snippet with all four events", () => {
    const out = install("--settings", file).stdout;
    const json = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
    expect(Object.keys(json.hooks)).toEqual(EVENTS);
    const h = json.hooks.Notification[0];
    expect(h.matcher).toBe("");
    expect(h.hooks[0]).toMatchObject({ type: "command", timeout: 2, async: true });
    expect(h.hooks[0].command).toMatch(/^node '.*office-hook\.mjs'$/);
  });
});

describe("install.mjs --apply", () => {
  it("creates a missing file without a backup", () => {
    const r = install("--apply", "--settings", file);
    expect(r.code).toBe(0);
    expect(Object.keys(read().hooks)).toEqual(EVENTS);
    expect(backups()).toEqual([]);
  });

  it("says the hook runs from this checkout after applying", () => {
    const r = install("--apply", "--settings", file);
    expect(r.stdout).toContain("from this repository checkout");
    expect(r.stdout).toContain(join(HOOKS_DIR, "office-hook.mjs"));
  });

  it("refuses when the settings directory does not exist, creating nothing", () => {
    const missing = join(dir, "no-such-dir");
    const r = install("--apply", "--settings", join(missing, "settings.json"));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(missing);
    expect(r.stderr).not.toContain("ENOENT");
    expect(readdirSync(dir)).toEqual([]);
  });

  it("keeps other keys and hooks, and backs up the old bytes", () => {
    const orig = JSON.stringify(other, null, 1);
    writeFileSync(file, orig);
    expect(install("--apply", "--settings", file).code).toBe(0);
    const s = read();
    expect(s.theme).toBe("dark");
    expect(s.hooks.Stop).toEqual(other.hooks.Stop);
    expect(s.hooks.Notification[0]).toEqual(other.hooks.Notification[0]);
    expect(s.hooks.Notification).toHaveLength(2);
    expect(ourCount(s)).toBe(4);
    const b = backups();
    expect(b).toHaveLength(1);
    expect(readFileSync(join(dir, b[0]), "utf8")).toBe(orig);
  });

  it("is idempotent", () => {
    writeFileSync(file, JSON.stringify(other));
    install("--apply", "--settings", file);
    const once = readFileSync(file, "utf8");
    expect(install("--apply", "--settings", file).code).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(once);
    expect(ourCount(read())).toBe(4);
  });

  it("leaves no temp file behind", () => {
    install("--apply", "--settings", file);
    expect(readdirSync(dir)).toEqual(["settings.json"]);
  });

  it("--dry-run prints the result and writes nothing", () => {
    writeFileSync(file, JSON.stringify(other));
    const r = install("--apply", "--dry-run", "--settings", file);
    expect(r.code).toBe(0);
    expect(ourCount(JSON.parse(r.stdout))).toBe(4);
    expect(readFileSync(file, "utf8")).toBe(JSON.stringify(other));
    expect(readdirSync(dir)).toEqual(["settings.json"]);
  });

  it("quotes a script path with spaces and quotes", () => {
    // Copy the scripts under a path with a space and an apostrophe.
    const odd = join(realpathSync(dir), "my dir's");
    mkdirSync(odd);
    for (const f of ["install.mjs", "office-hook.mjs"]) {
      writeFileSync(join(odd, f), readFileSync(join(HOOKS_DIR, f)));
    }
    const r = spawnSync(
      process.execPath,
      [join(odd, "install.mjs"), "--apply", "--settings", file],
      {
        encoding: "utf8",
      },
    );
    expect(r.status).toBe(0);
    const cmd = read().hooks.Notification[0].hooks[0].command as string;
    expect(cmd).toBe(`node '${join(odd, "office-hook.mjs").replaceAll("'", `'\\''`)}'`);
    // The shell sees exactly one argument, the real path.
    const echoed = spawnSync("sh", ["-c", cmd.replace(/^node /, "printf %s ")], {
      encoding: "utf8",
    });
    expect(echoed.stdout).toBe(join(odd, "office-hook.mjs"));
  });
});

describe("install.mjs symlinked settings", () => {
  for (const mode of ["--apply", "--remove"]) {
    it(`${mode} keeps the symlink, updates the target and preserves its mode`, () => {
      const real = join(dir, "real.json");
      writeFileSync(real, JSON.stringify(mode === "--apply" ? other : { theme: "x" }));
      if (mode === "--remove") install("--apply", "--settings", real);
      chmodSync(real, 0o640);
      const before = readFileSync(real, "utf8");
      symlinkSync(real, file);
      const r = install(mode, "--settings", file);
      expect(r.code).toBe(0);
      expect(lstatSync(file).isSymbolicLink()).toBe(true);
      expect(readFileSync(real, "utf8")).not.toBe(before);
      expect(ourCount(JSON.parse(readFileSync(real, "utf8")))).toBe(mode === "--apply" ? 4 : 0);
      expect(statSync(real).mode & 0o777).toBe(0o640);
      expect(backups().length).toBeGreaterThanOrEqual(1);
      expect(readdirSync(dir).some((f) => f.includes(".bak-") && f.startsWith("settings"))).toBe(
        false,
      );
      expect(readdirSync(dir).some((f) => f.endsWith(".tmp"))).toBe(false);
    });
  }

  it("refuses a dangling symlink and changes nothing", () => {
    symlinkSync(join(dir, "missing.json"), file);
    for (const mode of ["--apply", "--remove"]) {
      const r = install(mode, "--settings", file);
      expect(r.code).toBe(1);
      expect(lstatSync(file).isSymbolicLink()).toBe(true);
    }
    expect(readdirSync(dir)).toEqual(["settings.json"]);
  });

  it("gives a new file mode 0600", () => {
    install("--apply", "--settings", file);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });
});

describe("install.mjs --remove", () => {
  it("leaves the user's own empty hooks and empty event arrays alone", () => {
    const mine = { theme: "dark", hooks: { Stop: [], SubagentStart: [] } };
    writeFileSync(file, JSON.stringify(mine));
    expect(install("--remove", "--settings", file).code).toBe(0);
    expect(read()).toEqual(mine);
    const empty = { hooks: {} };
    writeFileSync(file, JSON.stringify(empty));
    expect(install("--remove", "--settings", file).code).toBe(0);
    expect(read()).toEqual(empty);
  });

  it("removes only our entries, with a backup", () => {
    writeFileSync(file, JSON.stringify(other));
    install("--apply", "--settings", file);
    const applied = readFileSync(file, "utf8");
    const r = install("--remove", "--settings", file);
    expect(r.code).toBe(0);
    expect(read()).toEqual(other);
    expect(backups().some((b) => readFileSync(join(dir, b), "utf8") === applied)).toBe(true);
  });

  it("drops an emptied hooks key and is a no-op when nothing is ours", () => {
    install("--apply", "--settings", file);
    install("--remove", "--settings", file);
    expect(read()).toEqual({});
    expect(install("--remove", "--settings", file).code).toBe(0);
    expect(read()).toEqual({});
  });

  it("keeps look-alike commands and removes ours by this checkout's exact script path", () => {
    const script = join(HOOKS_DIR, "office-hook.mjs");
    const lookalikes = [
      `node ${script}.orig`,
      `node ${script}x`,
      `node ${join(HOOKS_DIR, "not-office-hook.mjs")}`,
      "echo office-hook.mjs",
      "node /plain/office-hook.mjs",
      "node C:\\\\x\\\\office-hook.mjs",
    ];
    const mine = [
      `node '${script.replaceAll("'", `'\\''`)}'`,
      `node "${script}"`,
      `node ${script}`,
    ];
    const cmds = [...lookalikes, ...mine];
    const settings = {
      hooks: {
        Notification: cmds.map((command) => ({
          matcher: "",
          hooks: [{ type: "command", command }],
        })),
      },
    };
    writeFileSync(file, JSON.stringify(settings));
    expect(install("--remove", "--settings", file).code).toBe(0);
    const left = read().hooks.Notification.map(
      (g: { hooks: Array<{ command: string }> }) => g.hooks[0].command,
    );
    expect(left).toEqual(lookalikes);
  });

  const otherCheckout = () => {
    const copy = join(realpathSync(dir), "other-checkout");
    mkdirSync(copy);
    for (const f of ["install.mjs", "office-hook.mjs"]) {
      writeFileSync(join(copy, f), readFileSync(join(HOOKS_DIR, f)));
    }
    const applied = spawnSync(
      process.execPath,
      [join(copy, "install.mjs"), "--apply", "--settings", file],
      { encoding: "utf8" },
    );
    expect(applied.status).toBe(0);
    return copy;
  };

  it("--apply replaces another checkout's entry instead of adding a second one", () => {
    const copy = otherCheckout();
    const r = install("--apply", "--settings", file);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(join(copy, "office-hook.mjs"));
    const left = read();
    expect(ourCount(left)).toBe(4);
    for (const groups of Object.values(left.hooks) as Array<
      Array<{ hooks: Array<{ command: string }> }>
    >) {
      expect(JSON.stringify(groups)).not.toContain(copy);
    }
  });

  it("--remove leaves another checkout's entry in place", () => {
    const copy = otherCheckout();
    expect(install("--remove", "--settings", file).code).toBe(0);
    const left = read();
    expect(ourCount(left)).toBe(4);
    for (const groups of Object.values(left.hooks) as Array<
      Array<{ hooks: Array<{ command: string }> }>
    >) {
      expect(groups[0].hooks[0].command).toContain(copy);
    }
  });

  it("--dry-run changes nothing", () => {
    install("--apply", "--settings", file);
    const applied = readFileSync(file, "utf8");
    const r = install("--remove", "--dry-run", "--settings", file);
    expect(ourCount(JSON.parse(r.stdout))).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(applied);
  });
});

describe("install.mjs concurrent writer", () => {
  it("bails out without renaming when the settings file changes before the swap", async () => {
    const { run } = await import("./install.mjs");
    writeFileSync(file, JSON.stringify(other));
    const theirs = JSON.stringify({ theme: "theirs" });
    // "Backup:" is printed after the read and before the swap: the other tool writes here.
    const out = (line: string) => {
      if (line.startsWith("Backup:")) writeFileSync(file, theirs);
    };
    expect(() => run(["--apply", "--settings", file], out)).toThrow(/changed/);
    expect(readFileSync(file, "utf8")).toBe(theirs);
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("refuses without overwriting a settings file created while installing", async () => {
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    const theirs = JSON.stringify({ theme: "theirs" });
    vi.resetModules();
    vi.doMock("node:fs", () => ({
      ...actual,
      // The other tool creates the file right after our temp file is written.
      writeFileSync: (p: string, ...rest: unknown[]) => {
        (actual.writeFileSync as (...a: unknown[]) => void)(p, ...rest);
        if (String(p).endsWith(".tmp")) actual.writeFileSync(file, theirs);
      },
    }));
    try {
      const { run } = await import("./install.mjs");
      expect(() => run(["--apply", "--settings", file], () => {})).toThrow(/created while/);
      expect(readFileSync(file, "utf8")).toBe(theirs);
      expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    } finally {
      vi.doUnmock("node:fs");
      vi.resetModules();
    }
  });

  it("refuses, and leaves no temp file, when the settings file vanishes before the swap", async () => {
    const { run } = await import("./install.mjs");
    writeFileSync(file, JSON.stringify(other));
    const out = (line: string) => {
      if (line.startsWith("Backup:")) rmSync(file);
    };
    expect(() => run(["--apply", "--settings", file], out)).toThrow(/changed/);
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
});

describe("install.mjs refusals", () => {
  for (const mode of ["--apply", "--remove"]) {
    it(`${mode} refuses invalid JSON and leaves the bytes identical`, () => {
      const bad = "{ not json,,";
      writeFileSync(file, bad);
      const r = install(mode, "--settings", file);
      expect(r.code).not.toBe(0);
      expect(r.stderr).toContain("not valid JSON");
      expect(readFileSync(file, "utf8")).toBe(bad);
      expect(readdirSync(dir)).toEqual(["settings.json"]);
    });

    for (const [name, content] of [
      ["hooks not an object", '{"hooks":[]}'],
      ["event not an array", '{"hooks":{"Notification":{}}}'],
      ["group without hooks array", '{"hooks":{"Notification":[{"matcher":""}]}}'],
      ["top level array", "[]"],
    ] as const) {
      it(`${mode} refuses shape: ${name}`, () => {
        writeFileSync(file, content);
        const r = install(mode, "--settings", file);
        expect(r.code).not.toBe(0);
        expect(readFileSync(file, "utf8")).toBe(content);
        expect(readdirSync(dir)).toEqual(["settings.json"]);
      });
    }
  }

  it("refuses --settings with no value or another flag, exit 1", () => {
    for (const args of [["--settings"], ["--settings", "--apply"], ["--apply", "--settings"]]) {
      const r = install(...args);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("--settings needs a path");
      expect(r.stdout).toBe("");
    }
    expect(readdirSync(dir)).toEqual([]);
  });

  it("rejects unknown arguments and --apply with --remove", () => {
    expect(install("--bogus").code).not.toBe(0);
    expect(install("--apply", "--remove", "--settings", file).code).not.toBe(0);
  });
});
