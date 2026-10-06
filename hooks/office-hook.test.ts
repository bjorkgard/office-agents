import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, Server } from "node:http";
import { createServer as createTcpServer } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { HOOK_ROUTE } from "../server/feed-plugin.ts";
import { HOOK_FILE, defaultHookDir } from "../server/hook-discovery.ts";
import { MAX_STRING_LENGTH } from "../shared/events.ts";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "office-hook.mjs");
const DEFAULT_DIR = (() => {
  const saved = process.env.OFFICE_HOOK_DIR;
  delete process.env.OFFICE_HOOK_DIR;
  try {
    return defaultHookDir();
  } finally {
    if (saved !== undefined) process.env.OFFICE_HOOK_DIR = saved;
  }
})();
const ADAPTER = join(dirname(fileURLToPath(import.meta.url)), "..", "server", "hooks-adapter.ts");
const TOKEN = "tok-".padEnd(64, "x");

/** False on a host without an IPv6 loopback, where listening on ::1 fails. */
const hasIpv6Loopback = () =>
  new Promise<boolean>((resolve) => {
    const probe = createTcpServer();
    probe.once("error", () => resolve(false));
    probe.listen(0, "::1", () => probe.close(() => resolve(true)));
  });

const ipv6 = await hasIpv6Loopback();

type Seen = { headers: IncomingMessage["headers"]; url?: string; method?: string; body: string };

let dir: string;
let server: Server | null;
let seen: Seen[];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "office-hook-script-"));
  server = null;
  seen = [];
});
afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  rmSync(dir, { recursive: true, force: true });
});

/** A stand-in office. `answer` false = accept the connection and never reply. */
async function listen(answer = true, host = "127.0.0.1"): Promise<number> {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      seen.push({
        headers: req.headers,
        url: req.url,
        method: req.method,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      if (answer) res.writeHead(204).end();
    });
  });
  await new Promise<void>((r) => server!.listen(0, host, r));
  return (server.address() as AddressInfo).port;
}

function writeInfo(info: unknown): void {
  writeFileSync(join(dir, "hook.json"), typeof info === "string" ? info : JSON.stringify(info));
}

function runHook(stdin: string | Buffer): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
  ms: number;
}> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [SCRIPT], {
      env: { ...process.env, OFFICE_HOOK_DIR: dir },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.stdin.on("error", () => {});
    // Hard kill so a hung script cannot outlive the test; code is then null.
    const killer = setTimeout(() => child.kill("SIGKILL"), 4000);
    child.on("close", (code) => {
      clearTimeout(killer);
      resolve({ code, stdout, stderr, ms: Date.now() - t0 });
    });
    child.stdin.end(stdin);
  });
}

const payload = {
  hook_event_name: "Notification",
  session_id: "s1",
  agent_id: "a1",
  agent_type: "general",
  notification_type: "permission_prompt",
  tool_use_id: "tu1",
  cwd: "/work/proj",
  transcript_path: "/home/u/.claude/projects/p/s1.jsonl",
  message: "CANARY-MESSAGE",
  prompt: "CANARY-PROMPT",
  tool_input: { command: "CANARY-TOOL-INPUT" },
  last_assistant_message: "CANARY-LAST",
  extra: "CANARY-EXTRA",
};

describe("office-hook.mjs", () => {
  it("sends exactly the allowlisted fields with the token and no canaries", async () => {
    const port = await listen();
    writeInfo({ port, token: TOKEN, pid: process.pid });
    const r = await runHook(JSON.stringify(payload));
    expect(r).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(seen).toHaveLength(1);
    const s = seen[0];
    expect(s.method).toBe("POST");
    expect(s.url).toBe("/__office/hook");
    expect(s.headers["x-office-token"]).toBe(TOKEN);
    expect(s.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(s.body)).toEqual({
      hook_event_name: "Notification",
      session_id: "s1",
      agent_id: "a1",
      agent_type: "general",
      notification_type: "permission_prompt",
      tool_use_id: "tu1",
      cwd: "/work/proj",
      transcript_path: "/home/u/.claude/projects/p/s1.jsonl",
    });
    expect(s.body).not.toContain("CANARY");
  });

  it("drops non-string and oversized values", async () => {
    const port = await listen();
    writeInfo({ port, token: TOKEN, pid: process.pid });
    await runHook(
      JSON.stringify({
        hook_event_name: "Notification",
        session_id: { x: 1 },
        cwd: "c".repeat(5000),
      }),
    );
    expect(JSON.parse(seen[0].body)).toEqual({ hook_event_name: "Notification" });
  });

  it("keeps a 512-character value and drops a 513-character one (the adapter's limit)", async () => {
    const port = await listen();
    writeInfo({ port, token: TOKEN, pid: process.pid });
    await runHook(
      JSON.stringify({
        hook_event_name: "Notification",
        cwd: "c".repeat(512),
        session_id: "s".repeat(513),
      }),
    );
    expect(JSON.parse(seen[0].body)).toEqual({
      hook_event_name: "Notification",
      cwd: "c".repeat(512),
    });
  });

  it("keeps the script's value cap equal to the adapter's and its allowlist covering what the adapter reads", () => {
    const src = readFileSync(SCRIPT, "utf8");
    expect(Number(/const MAX_VALUE = (\d+);/.exec(src)?.[1])).toBe(MAX_STRING_LENGTH);
    const allowed = [
      ...(/const ALLOWED = \[([^\]]*)\]/.exec(src)?.[1] ?? "").matchAll(/"(\w+)"/g),
    ].map((m) => m[1]);
    const read = [...readFileSync(ADAPTER, "utf8").matchAll(/idOf\(p, "(\w+)"\)/g)].map(
      (m) => m[1],
    );
    expect(read.length).toBeGreaterThan(0);
    for (const key of read) expect(allowed).toContain(key);
  });

  it("exits 0 quickly and silently when the server is down", async () => {
    const port = await listen();
    await new Promise<void>((r) => server!.close(() => r()));
    writeInfo({ port, token: TOKEN, pid: process.pid });
    const r = await runHook(JSON.stringify(payload));
    expect(r).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(r.ms).toBeLessThan(2500);
  });

  it("sends nothing when the pid is not alive", async () => {
    const port = await listen();
    // A pid far above any real one; kill(pid, 0) throws ESRCH.
    writeInfo({ port, token: TOKEN, pid: 2 ** 30 });
    const r = await runHook(JSON.stringify(payload));
    expect(r).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(seen).toHaveLength(0);
  });

  it("exits 0 when hook.json is missing", async () => {
    const r = await runHook(JSON.stringify(payload));
    expect(r).toMatchObject({ code: 0, stdout: "", stderr: "" });
  });

  it("exits 0 when hook.json is garbled or has the wrong shape", async () => {
    const port = await listen();
    for (const info of [
      "{not json",
      JSON.stringify({ port: "x", token: 1, pid: process.pid }),
      "null",
    ]) {
      writeInfo(info);
      const r = await runHook(JSON.stringify(payload));
      expect(r).toMatchObject({ code: 0, stdout: "", stderr: "" });
    }
    expect(port).toBeGreaterThan(0);
    expect(seen).toHaveLength(0);
  });

  it("exits 0 and sends nothing on garbage stdin", async () => {
    const port = await listen();
    writeInfo({ port, token: TOKEN, pid: process.pid });
    for (const input of ["", "not json", "[1,2]", "null", "\u0000\u0001"]) {
      const r = await runHook(input);
      expect(r).toMatchObject({ code: 0, stdout: "", stderr: "" });
    }
    expect(seen).toHaveLength(0);
  });

  it("exits 0 on a 5 MB stdin without sending it", async () => {
    const port = await listen();
    writeInfo({ port, token: TOKEN, pid: process.pid });
    const big = JSON.stringify({ ...payload, message: "x".repeat(5 * 1024 * 1024) });
    const r = await runHook(big);
    expect(r).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(r.ms).toBeLessThan(2500);
    expect(seen).toHaveLength(0);
  });

  it("exits 0 by about 0.6 s when the server never answers", async () => {
    const port = await listen(false);
    writeInfo({ port, token: TOKEN, pid: process.pid });
    const r = await runHook(JSON.stringify(payload));
    expect(r).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(r.ms).toBeLessThan(2500);
  });

  it("pins the request target to 127.0.0.1", async () => {
    // A listener on 127.0.0.1 only; `localhost` may resolve to ::1 and miss it.
    const port = await listen();
    writeInfo({ port, token: TOKEN, pid: process.pid });
    const src = readFileSync(SCRIPT, "utf8");
    // The only hosts the script can ever use are these two literals.
    expect(src).toMatch(/info\.host === "::1" \? "::1" : "127\.0\.0\.1"/);
    expect(src).not.toMatch(/localhost/);
    expect(
      [...src.matchAll(/"([^"\s]*\.[^"\s]*)"/g)].map((m) => m[1]).filter((v) => /^[\d.]+$/.test(v)),
    ).toEqual(["127.0.0.1"]);
    const r = await runHook(JSON.stringify(payload));
    expect(r.code).toBe(0);
    expect(seen[0]?.headers.host).toBe(`127.0.0.1:${port}`);
  });

  it.skipIf(!ipv6)(
    "connects to the host in hook.json when it is exactly ::1 or 127.0.0.1",
    async () => {
      const v6 = await listen(true, "::1");
      writeInfo({ port: v6, token: TOKEN, pid: process.pid, host: "::1" });
      await runHook(JSON.stringify(payload));
      expect(seen).toHaveLength(1);
      expect(seen[0].headers.host).toBe(`[::1]:${v6}`);

      await new Promise<void>((r) => server!.close(() => r()));
      seen = [];
      const v4 = await listen(true, "127.0.0.1");
      writeInfo({ port: v4, token: TOKEN, pid: process.pid, host: "127.0.0.1" });
      await runHook(JSON.stringify(payload));
      expect(seen[0]?.headers.host).toBe(`127.0.0.1:${v4}`);
    },
  );

  it("ignores any other host value and uses 127.0.0.1", async () => {
    const port = await listen();
    for (const host of ["evil.com", "localhost", "::", "0.0.0.0", 0, { x: 1 }, null, ["::1"]]) {
      seen = [];
      writeInfo({ port, token: TOKEN, pid: process.pid, host });
      await runHook(JSON.stringify(payload));
      expect(seen[0]?.headers.host).toBe(`127.0.0.1:${port}`);
    }
  });

  it("agrees with the server on the file name, directory name and route", async () => {
    const src = readFileSync(SCRIPT, "utf8");
    expect(src).toContain(`join(homedir(), "${basename(DEFAULT_DIR)}")`);
    expect(src).toContain(`"${HOOK_FILE}"`);
    expect(src).toContain(`path: "${HOOK_ROUTE}"`);
  });

  it("skips a FIFO hook.json without blocking", async () => {
    const mk = spawnSync("mkfifo", [join(dir, "hook.json")]);
    if (mk.status !== 0) return;
    const r = await runHook(JSON.stringify(payload));
    expect(r).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(r.ms).toBeLessThan(2500);
  });

  it("skips a hook.json that is a symlink to /dev/zero without hanging", async () => {
    if (!existsSync("/dev/zero")) return;
    symlinkSync("/dev/zero", join(dir, "hook.json"));
    const r = await runHook(JSON.stringify(payload));
    expect(r).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(r.ms).toBeLessThan(2500);
  }, 10_000);

  it("skips a hook.json that is a directory", async () => {
    mkdirSync(join(dir, "hook.json"));
    const r = await runHook(JSON.stringify(payload));
    expect(r).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(r.ms).toBeLessThan(2500);
  }, 10_000);

  it("skips an oversized hook.json", async () => {
    const port = await listen();
    writeInfo(JSON.stringify({ port, token: TOKEN, pid: process.pid, pad: "x".repeat(70 * 1024) }));
    const r = await runHook(JSON.stringify(payload));
    expect(r).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(seen).toHaveLength(0);
  });

  it("exits 0 when stdin never closes", async () => {
    const port = await listen();
    writeInfo({ port, token: TOKEN, pid: process.pid });
    const r = await new Promise<{ code: number | null; ms: number }>((resolve) => {
      const t0 = Date.now();
      const child = spawn(process.execPath, [SCRIPT], {
        env: { ...process.env, OFFICE_HOOK_DIR: dir },
        stdio: ["pipe", "ignore", "ignore"],
      });
      child.on("close", (code) => resolve({ code, ms: Date.now() - t0 }));
    });
    expect(r.code).toBe(0);
    expect(r.ms).toBeLessThan(2500);
  });
});
