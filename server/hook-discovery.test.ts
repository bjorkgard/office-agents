import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  HOOK_FILE,
  defaultHookDir,
  newHookToken,
  removeDiscovery,
  writeDiscovery,
} from "./hook-discovery.ts";

/** False where mkfifo is missing, so the FIFO test reports SKIPPED instead of passing empty. */
const hasMkfifo = spawnSync("mkfifo", ["-m", "600", "/dev/null/x"]).error === undefined;

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "office-hook-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("discovery file", () => {
  it("writes {port, token, host, pid} as 0600 in a 0700 directory", () => {
    const dir = join(tmp, "d");
    writeDiscovery(dir, { port: 5173, token: "tok" });
    const file = join(dir, HOOK_FILE);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
      port: 5173,
      token: "tok",
      host: "127.0.0.1",
      pid: process.pid,
    });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it("writes the host the server is bound to, and 127.0.0.1 for wildcard or odd addresses", () => {
    const hostFor = (address?: string) => {
      writeDiscovery(tmp, { port: 1, token: "t", address });
      return JSON.parse(readFileSync(join(tmp, HOOK_FILE), "utf8")).host;
    };
    expect(hostFor("::1")).toBe("::1");
    expect(hostFor("127.0.0.1")).toBe("127.0.0.1");
    expect(hostFor("::")).toBe("127.0.0.1");
    expect(hostFor("0.0.0.0")).toBe("127.0.0.1");
    expect(hostFor("evil.com")).toBe("127.0.0.1");
    expect(hostFor(undefined)).toBe("127.0.0.1");
  });

  it("tightens a pre-existing loose directory", () => {
    const dir = join(tmp, "loose");
    mkdirSync(dir, { mode: 0o755 });
    writeDiscovery(dir, { port: 1, token: "t" });
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it("refuses a pre-existing directory it does not own, without chmod", () => {
    const dir = join(tmp, "shared");
    mkdirSync(dir, { mode: 0o755 });
    const uid = vi.spyOn(process, "getuid").mockReturnValue((process.getuid?.() ?? 0) + 1);
    try {
      expect(() => writeDiscovery(dir, { port: 1, token: "t" })).toThrow(/not owned/);
    } finally {
      uid.mockRestore();
    }
    expect(statSync(dir).mode & 0o777).toBe(0o755);
    expect(existsSync(join(dir, HOOK_FILE))).toBe(false);
  });

  it("rewrites the file when the port changes and leaves no temp file", () => {
    writeDiscovery(tmp, { port: 1, token: "t" });
    writeDiscovery(tmp, { port: 2, token: "t" });
    expect(JSON.parse(readFileSync(join(tmp, HOOK_FILE), "utf8")).port).toBe(2);
    expect(existsSync(join(tmp, `${HOOK_FILE}.${process.pid}.tmp`))).toBe(false);
  });

  it("removes its own file, and only its own", () => {
    writeDiscovery(tmp, { port: 1, token: "mine" });
    removeDiscovery(tmp, "someone-else");
    expect(existsSync(join(tmp, HOOK_FILE))).toBe(true);
    removeDiscovery(tmp, "mine");
    expect(existsSync(join(tmp, HOOK_FILE))).toBe(false);
  });

  it("tolerates removal when there is no file or the file is garbage", () => {
    expect(() => removeDiscovery(tmp, "t")).not.toThrow();
    writeFileSync(join(tmp, HOOK_FILE), "not json");
    expect(() => removeDiscovery(tmp, "t")).not.toThrow();
  });

  // Value: protects=cleanup never reads an oversized hook.json planted by another process; fails_when=the INFO_CAP size check is dropped and the big file is parsed and removed; why_new=INFO_CAP branch was untested; seam=none
  it("leaves a hook.json larger than 64 KB untouched even when it holds our token", () => {
    const file = join(tmp, HOOK_FILE);
    const body = JSON.stringify({ token: "t", pad: "x".repeat(70 * 1024) });
    writeFileSync(file, body);
    removeDiscovery(tmp, "t");
    expect(readFileSync(file, "utf8")).toBe(body);
  });

  // Value: protects=cleanup ignores a non-regular hook.json such as a directory; fails_when=the isFile check is dropped and a non-file is read or removed; why_new=non-FIFO non-file branch untested; seam=none
  it("leaves a directory at the hook.json path in place without throwing", () => {
    const dirAtPath = join(tmp, HOOK_FILE);
    mkdirSync(dirAtPath);
    expect(() => removeDiscovery(tmp, "t")).not.toThrow();
    expect(lstatSync(dirAtPath).isDirectory()).toBe(true);
  });

  it.skipIf(!hasMkfifo)(
    "does not block on a FIFO hook.json and leaves it in place",
    () => {
      const fifo = join(tmp, HOOK_FILE);
      expect(spawnSync("mkfifo", [fifo]).status).toBe(0);
      // A child process, so a blocking read fails this test by timeout instead of hanging the run.
      const mod = join(dirname(fileURLToPath(import.meta.url)), "hook-discovery.ts");
      const r = spawnSync(
        process.execPath,
        [
          "-e",
          `import(${JSON.stringify(mod)}).then((m) => m.removeDiscovery(${JSON.stringify(tmp)}, "t"))`,
        ],
        { timeout: 3000 },
      );
      expect(r.error).toBeUndefined();
      expect(r.status).toBe(0);
      expect(lstatSync(fifo).isFIFO()).toBe(true);
    },
    10_000,
  );

  it("refuses a directory that is a symlink", () => {
    const real = join(tmp, "real");
    mkdirSync(real);
    const link = join(tmp, "link");
    symlinkSync(real, link);
    expect(() => writeDiscovery(link, { port: 1, token: "t" })).toThrow();
    expect(existsSync(join(real, HOOK_FILE))).toBe(false);
  });

  it("replaces a symlink planted at the temp path without touching its target", () => {
    const victim = join(tmp, "victim");
    writeFileSync(victim, "untouched");
    symlinkSync(victim, join(tmp, `${HOOK_FILE}.${process.pid}.tmp`));
    writeDiscovery(tmp, { port: 1, token: "secret-token" });
    expect(readFileSync(victim, "utf8")).toBe("untouched");
    const file = join(tmp, HOOK_FILE);
    expect(JSON.parse(readFileSync(file, "utf8")).token).toBe("secret-token");
    expect(lstatSync(file).isFile()).toBe(true);
    expect(existsSync(join(tmp, `${HOOK_FILE}.${process.pid}.tmp`))).toBe(false);
  });

  it("replaces a stale regular file left at the temp path by a crash", () => {
    writeFileSync(join(tmp, `${HOOK_FILE}.${process.pid}.tmp`), "stale");
    writeDiscovery(tmp, { port: 7, token: "t" });
    expect(JSON.parse(readFileSync(join(tmp, HOOK_FILE), "utf8")).port).toBe(7);
    expect(existsSync(join(tmp, `${HOOK_FILE}.${process.pid}.tmp`))).toBe(false);
  });

  it("exports the default directory name the hook script must agree with", () => {
    const saved = process.env.OFFICE_HOOK_DIR;
    delete process.env.OFFICE_HOOK_DIR;
    try {
      expect(basename(defaultHookDir())).toBe(".office-agents");
    } finally {
      if (saved !== undefined) process.env.OFFICE_HOOK_DIR = saved;
    }
  });

  it("makes a 64-hex-character token each time", () => {
    const a = newHookToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(newHookToken()).not.toBe(a);
  });
});
