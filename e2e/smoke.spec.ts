import { expect, test } from "@playwright/test";

test(
  "boots and shows the scene",
  { tag: ["@core", "@live", "@twelve", "@stale", "@empty", "@visual"] },
  async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("scene")).toBeVisible();
  },
);
