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

  test("anonymous users get no favourites UI (registered-only feature)", async ({ page }) => {
    await page.goto("/tools");
    // Wait for the client grid to render, then assert no star / Favourites UI.
    await expect(page.locator('a[href="/tool/merge"]').first()).toBeVisible();
    await expect(page.locator("button.tool-star")).toHaveCount(0);
    await expect(page.locator("h2", { hasText: "Favourites" })).toHaveCount(0);
  });

  test("slash key focuses the search box", async ({ page }) => {
    await page.goto("/tools");
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("/");
    await expect(page.locator('input[aria-label="Search tools"]')).toBeFocused();
  });

  test("the category jump-bar stays visible while scrolling (no condense flicker)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/tools");
    const jumpbar = page.locator("nav.tools-jumpbar");
    await expect(jumpbar).toBeVisible();
    // Scroll down past the header; the jump-bar must remain visible (not condensed away).
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(400);
    await expect(jumpbar).toBeVisible();
    // And no condensed-state class should exist anywhere.
    await expect(page.locator(".tools-sticky--condensed")).toHaveCount(0);
  });

  test("categories collapse by default on a narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tools");
    // First section (Organize) stays open; a later one collapses.
    const convert = page.locator("#tool-group-btn-Convert");
    await expect(convert).toHaveAttribute("aria-expanded", "false");
  });
});
