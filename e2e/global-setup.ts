import type { FullConfig } from "@playwright/test";
import { removeRunRoot } from "./support.ts";

const READY_TIMEOUT_MS = 30_000;

async function trackedCount(url: string): Promise<number | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return ((await res.json()) as { filesTracked: number }).filesTracked;
  } catch {
    return null;
  }
}

/** Waits until each server's tailer tracks exactly its scenario's fixture count. */
export default async function globalSetup(config: FullConfig): Promise<() => Promise<void>> {
  const base = process.env.OFFICE_E2E_BASE;
  try {
    for (const project of config.projects) {
      const { port, expected } = project.metadata as { port: number; expected: number };
      const url = `http://localhost:${port}/__office/status`;
      const deadline = Date.now() + READY_TIMEOUT_MS;
      let seen: number | null = null;
      while (Date.now() < deadline) {
        seen = await trackedCount(url);
        if (seen === expected) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      if (seen !== expected) {
        throw new Error(
          `e2e project ${project.name}: tracked ${String(seen)} files, expected ${expected} (${url})`,
        );
      }
    }
  } catch (e) {
    if (base) removeRunRoot(base);
    throw e;
  }
  return async () => {
    if (base) removeRunRoot(base);
  };
}
