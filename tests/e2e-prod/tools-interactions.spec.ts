// tests/e2e-prod/tools-interactions.spec.ts
//
// /tools findability v3 (2026-06-05) — client-interaction checks for the
// new Recently-used / Favourites / search-URL / keyboard / mobile-collapse
// behaviour. Read-only: touches localStorage + the URL only (no DB writes,
// no credit spend, no secrets). Safe on every prod-e2e cadence.
import { test, expect } from "@playwright/test";

test.describe("tools catalog interactions", () => {
  test("search reflects in the URL and filters the grid", async ({ page }) => {
    await page.goto("/tools");
    const search = page.locator('input[aria-label="Search tools"]');
    await search.fill("merge");
    await expect(page).toHaveURL(/[?&]q=merge/);
    await expect(page.locator('a[href="/tool/merge"]').first()).toBeVisible();
  });

  test("filter reflects in the URL", async ({ page }) => {
    await page.goto("/tools");
    await page.getByRole("button", { name: "ai", exact: true }).click();
    await expect(page).toHaveURL(/[?&]filter=ai/);
  });

  test("a search-state URL restores on load (shareable)", async ({ page }) => {
    await page.goto("/tools?q=rotate");
    await expect(page.locator('input[aria-label="Search tools"]')).toHaveValue("rotate");
    await expect(page.locator('a[href="/tool/rotate"]').first()).toBeVisible();
  });

  test("favouriting a tool persists across reload", async ({ page }) => {
    await page.goto("/tools");
    const star = page.locator("button.tool-star").first();
    await expect(star).toBeVisible();
    await star.click();
    await expect(star).toHaveClass(/is-on/);
    await page.reload();
    await expect(page.locator("h2", { hasText: "Favourites" })).toBeVisible();
  });

  test("slash key focuses the search box", async ({ page }) => {
    await page.goto("/tools");
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("/");
    await expect(page.locator('input[aria-label="Search tools"]')).toBeFocused();
  });

  test("categories collapse by default on a narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tools");
    // First section (Organize) stays open; a later one collapses.
    const convert = page.locator("#tool-group-btn-Convert");
    await expect(convert).toHaveAttribute("aria-expanded", "false");
  });
});
