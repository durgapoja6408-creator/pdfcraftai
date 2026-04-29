// tests/e2e/homepage.spec.ts
//
// Smoke test: the homepage loads, the tool grid renders, and a click
// on a tool card navigates to that tool's page. Cheap canary that
// catches catastrophic regressions (build broken, hydration error,
// route table broken) before any deeper test runs.

import { test, expect } from "@playwright/test";

test.describe("/ — homepage", () => {
  test("renders the hero, tool grid, and navigates to a tool", async ({
    page,
  }) => {
    await page.goto("/");
    // Hero — match on the canonical product line. If a CSS regression
    // hides the hero, this fails fast.
    await expect(
      page.getByText(/every pdf tool you need/i).first(),
    ).toBeVisible();

    // Tool grid — ToolsShowcase renders cards inside group sections.
    // Match a known-stable tool name; "Merge PDFs" has shipped since
    // Build 2 Wave 9 (2026-04-27) and isn't getting renamed.
    const mergeCard = page.getByRole("link", { name: /merge pdfs/i }).first();
    await expect(mergeCard).toBeVisible();

    // Navigation works — clicking the card lands on /tool/merge.
    await mergeCard.click();
    await expect(page).toHaveURL(/\/tool\/merge/);
  });

  test("no console errors on initial render", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(String(err)));
    await page.goto("/");
    // Settle — give analytics/SW/etc. time to throw if they're going to.
    await page.waitForLoadState("networkidle");
    // Filter out known-noisy warnings that aren't real bugs.
    // Playwright's WebKit emits a benign "Cookie X is rejected" line
    // for cross-site analytics cookies — those aren't our problem.
    const realErrors = errors.filter(
      (e) => !/cookie.*rejected|preload.*not used/i.test(e),
    );
    expect(realErrors, "console errors on /").toEqual([]);
  });
});
