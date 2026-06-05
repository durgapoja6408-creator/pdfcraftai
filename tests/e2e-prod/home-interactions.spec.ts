// tests/e2e-prod/home-interactions.spec.ts
//
// Homepage UI/UX changes (2026-06-05): showcase collapsed by default +
// "Browse all" CTA, accurate eyebrow, removed-API copy. Read-only, no secrets.
import { test, expect } from "@playwright/test";

test.describe("homepage", () => {
  test("hero renders with a single h1", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toContainText("Every PDF tool you need");
  });

  test("showcase is collapsed by default (first group open, rest closed)", async ({ page }) => {
    await page.goto("/");
    // First (AI) group open; a later free group collapsed.
    await expect(page.locator("#home-group-btn-ai-understand")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#home-group-btn-Organize")).toHaveAttribute("aria-expanded", "false");
  });

  test("'Browse all tools' CTA links to /tools", async ({ page }) => {
    await page.goto("/");
    const cta = page.getByRole("link", { name: /Browse all \d+ tools/ });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/tools");
  });

  test("eyebrow is accurate (no stale 'SIXTEEN'), and no removed-API copy", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).not.toContainText("SIXTEEN");
    await expect(page.locator("body")).toContainText("ONE WORKSPACE");
    await expect(page.locator("body")).not.toContainText("REST API");
  });
});
