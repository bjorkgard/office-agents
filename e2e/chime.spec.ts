/// <reference lib="dom" />
/**
 * End-to-end specs for the attention chime control in a real browser: the blocked / on / off
 * cycle, an unlock that never settles, and the control's fit beside four waiting chips at 800 px.
 * Nothing here asserts audible output.
 */
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { attachFeedStatus } from "./feed-status.ts";

const expect = baseExpect.configure({ timeout: 20_000 });

test.afterEach(({ request }, info) => attachFeedStatus(request, info));

// Must match CHIME_KEY in src/office/chime-logic.ts.
const CHIME_KEY = "agent-office.chime";

// Must exceed the 1.5 s unlock timeout (UNLOCK_TIMEOUT_MS in src/office/useChime.ts). A pending and a
// failed unlock both read "blocked", so sleeping past the timeout is the only way to wait it out.
const UNLOCK_TIMEOUT_WAIT_MS = 1700;

const chimeButton = (page: Page) => page.locator("button.top-bar-chime");

/** Seeds a stored "on" on the first load only, so a later reload keeps what the page wrote. */
async function openWithStoredOn(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, "on");
  }, CHIME_KEY);
  await page.goto("/");
  await expect(page.getByTestId("scene")).toBeVisible();
}

test(
  "a stored on starts blocked, then cycles on and off and persists",
  { tag: "@core" },
  async ({ page }) => {
    await openWithStoredOn(page);
    await expect(chimeButton(page)).toContainText("Chime: click");
    await expect(chimeButton(page)).toHaveAttribute("data-status", "blocked");

    await chimeButton(page).click();
    await expect(chimeButton(page)).toContainText("Chime on");
    await expect(chimeButton(page)).toHaveAttribute("data-status", "on");

    await chimeButton(page).click();
    await expect(chimeButton(page)).toContainText("Chime off");
    expect(await page.evaluate((key) => localStorage.getItem(key), CHIME_KEY)).toBe("off");

    await page.reload();
    await expect(page.getByTestId("scene")).toBeVisible();
    await expect(chimeButton(page)).toContainText("Chime off");
  },
);

test("an unlock that never settles falls back to blocked", { tag: "@core" }, async ({ page }) => {
  await page.addInitScript(() => {
    AudioContext.prototype.resume = () => new Promise<void>(() => {});
  });
  await openWithStoredOn(page);
  await expect(chimeButton(page)).toContainText("Chime: click");

  await chimeButton(page).click();
  // The unlock gives up after 1.5 s (UNLOCK_TIMEOUT_MS); wait it out, then the failed state
  // makes the next click turn the chime off. Without the timeout the unlock stays pending,
  // the second click would start another unlock, and "Chime off" would never appear.
  await page.waitForTimeout(UNLOCK_TIMEOUT_WAIT_MS);
  await expect(chimeButton(page)).toHaveAttribute("data-status", "blocked");

  await chimeButton(page).click();
  await expect(chimeButton(page)).toContainText("Chime off");
  expect(await page.evaluate((key) => localStorage.getItem(key), CHIME_KEY)).toBe("off");
});

test(
  "a storage event from another tab turns an on chime off",
  { tag: "@core" },
  async ({ page }) => {
    await openWithStoredOn(page);
    await chimeButton(page).click();
    await expect(chimeButton(page)).toContainText("Chime on");

    await page.evaluate((key) => {
      window.dispatchEvent(
        new StorageEvent("storage", { key, newValue: "off", storageArea: localStorage }),
      );
    }, CHIME_KEY);
    await expect(chimeButton(page)).toContainText("Chime off");
  },
);

test("a storage event from sessionStorage is ignored", { tag: "@core" }, async ({ page }) => {
  await openWithStoredOn(page);
  await chimeButton(page).click();
  await expect(chimeButton(page)).toContainText("Chime on");

  await page.evaluate((key) => {
    window.dispatchEvent(
      new StorageEvent("storage", { key, newValue: "off", storageArea: sessionStorage }),
    );
  }, CHIME_KEY);
  await expect(chimeButton(page)).toContainText("Chime on");
});

test(
  "at 800x500 the chime does not overlap four waiting chips",
  { tag: "@twelve" },
  async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 500 });
    await openWithStoredOn(page);
    const chips = page.locator("button.top-bar-chip");
    await expect(chips).toHaveCount(4);
    const chime = await chimeButton(page).boundingBox();
    expect(chime).not.toBeNull();
    for (const box of await Promise.all((await chips.all()).map((c) => c.boundingBox()))) {
      expect(box).not.toBeNull();
      const overlaps =
        box!.x < chime!.x + chime!.width &&
        chime!.x < box!.x + box!.width &&
        box!.y < chime!.y + chime!.height &&
        chime!.y < box!.y + box!.height;
      expect(overlaps, `chip ${JSON.stringify(box)} vs chime ${JSON.stringify(chime)}`).toBe(false);
    }
  },
);
