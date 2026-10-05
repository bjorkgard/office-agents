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
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  HOOK_FILE,
  defaultHookDir,
  newHookToken,
  removeDiscovery,
  writeDiscovery,
} from "./hook-discovery.ts";

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
