/**
 * Discovery file for the hook script (step 6, D18c): `<dir>/hook.json` = {port, token, host, pid},
 * mode 0600 inside a 0700 dir. Written by the dev plugin while it listens, removed when it stops.
 */
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const HOOK_FILE = "hook.json";

/** OFFICE_HOOK_DIR wins so tests and sandboxes never touch the real home. */
export function defaultHookDir(): string {
  return process.env.OFFICE_HOOK_DIR || join(homedir(), ".office-agents");
}

export const newHookToken = (): string => randomBytes(32).toString("hex");

/**
 * The loopback literal the hook script connects to: where the server really listens. A wildcard
 * bind (or anything unexpected) is reachable on 127.0.0.1. Never a hostname.
 */
export const hookHost = (address: string | undefined): "127.0.0.1" | "::1" =>
  address === "::1" ? "::1" : "127.0.0.1";

export function writeDiscovery(
  dir: string,
  info: { port: number; token: string; address?: string },
): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  // A planted symlink must not redirect the token to another directory.
  const st = lstatSync(dir);
  if (st.isSymbolicLink()) throw new Error("hook dir is a symlink");
  // A pre-existing directory owned by someone else is neither tightened nor trusted with the token.
  if (process.getuid !== undefined && st.uid !== process.getuid()) {
    throw new Error("hook dir is not owned by this user");
  }
  chmodSync(dir, 0o700);
  const file = join(dir, HOOK_FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  // Created exclusively and never through a symlink: a planted temp path fails the write
  // instead of sending the token to wherever it points.
  const open = () =>
    openSync(
      tmp,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
  let fd: number;
  try {
    fd = open();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    // Left by a crash with the same pid. unlink removes a symlink itself, never its target.
    unlinkSync(tmp);
    fd = open();
  }
  try {
    writeFileSync(
      fd,
      JSON.stringify({
        port: info.port,
        token: info.token,
        host: hookHost(info.address),
        pid: process.pid,
      }),
    );
  } finally {
    closeSync(fd);
  }
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
}

const INFO_CAP = 64 * 1024;

/** Removes the file only when it still holds this token, so a newer dev server's file stays. */
export function removeDiscovery(dir: string, token: string): void {
  const file = join(dir, HOOK_FILE);
  try {
    // O_NONBLOCK so a planted FIFO (no writer) cannot hang the SIGINT cleanup; only a small
    // regular file is ever read.
    const fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK);
    let text: string;
    try {
      const st = fstatSync(fd);
      if (!st.isFile() || st.size > INFO_CAP) return;
      text = readFileSync(fd, "utf8");
    } finally {
      closeSync(fd);
    }
    if ((JSON.parse(text) as { token?: unknown }).token !== token) return;
    rmSync(file, { force: true });
  } catch {
    // absent or unreadable: nothing of ours to remove
  }
}
