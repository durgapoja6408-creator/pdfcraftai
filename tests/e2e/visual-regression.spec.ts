// tests/e2e/visual-regression.spec.ts
//
// Phase 4 (2026-04-30): visual-regression snapshots for high-traffic
// pages. Catches CSS regressions (a stylesheet edit accidentally
// hides the hero, breaks the tool grid layout, etc.) that the
// homepage smoke + a11y tests would still pass.
//
// How Playwright snapshot tests work:
//   - First run produces baseline images in tests/e2e/visual-
//     regression.spec.ts-snapshots/
//   - Subsequent runs diff against those baselines
//   - If diff > 0.2% pixels, test fails; the failure includes a
//     side-by-side diff image saved under test-results/
//
// Updating baselines (deliberate UX change):
//   npx playwright test visual-regression --update-snapshots
//   git add tests/e2e/visual-regression.spec.ts-snapshots
//   git commit -m "ui: bump visual-regression baselines for the
//                  hero redesign"
//
// Why we test only Chromium:
//   Visual rendering differences across Chromium/Firefox/WebKit are
//   real but mostly aesthetic (font hinting, antialiasing, scrollbar
//   width). Testing 3 engines × 7 pages = 21 baselines × every CSS
//   change = noise. We pin Chromium-only because that catches the
//   bulk of regressions and avoids browser-quirk false positives.
//
// First-time setup:
//   npx playwright test visual-regression
//   # Will fail with "no baseline" — Playwright generates them.
//   # Inspect the generated images in *-snapshots/ before committing.

import { test, expect } from "@playwright/test";

// Pages where a visual regression would meaningfully hurt the user.
// We don't snapshot every page (96+ tools); we pick the ones where
// users land first or that exercise unique components.
const SNAPSHOT_TARGETS: Array<{ path: string; label: string }> = [
  { path: "/", label: "homepage" },
  { path: "/tools", label: "tools-index" },
  { path: "/pricing", label: "pricing" },
  { path: "/merge-pdf", label: "seo-landing-merge" },
  // Tool runner shells (not the interactive part — that's the
  // Playwright spec's job. This snapshot covers the chrome around
  // the tool: header, longform, FAQ, related tools.)
  { path: "/tool/merge", label: "tool-merge" },
  { path: "/tool/highlight-pdf", label: "tool-highlight" },
];

// We only run visual snapshots on Chromium. Firefox/WebKit produce
// font-rendering and scrollbar deltas that aren't real regressions.
test.describe("visual regression (chromium only)", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "visual snapshots are pinned to chromium for stability",
  );

  for (const target of SNAPSHOT_TARGETS) {
    test(`${target.label} (${target.path}) matches baseline`, async ({
      page,
    }) => {
      await page.goto(target.path);
      // Wait for images, fonts, and (if any) hero animations to settle.
      await page.waitForLoadState("networkidle");
      // Disable animations so a baseline isn't taken mid-transition.
      await page.addStyleTag({
        content: `
          *, *::before, *::after {
            animation-duration: 0s !important;
            animation-delay: 0s !important;
            transition-duration: 0s !important;
            transition-delay: 0s !important;
          }
        `,
      });

      // Full-page screenshot. The threshold is generous (0.2% pixel
      // delta tolerated) to absorb sub-pixel font-rendering noise
      // without missing real regressions.
      await expect(page).toHaveScreenshot(`${target.label}.png`, {
        fullPage: true,
        // Ratio of pixels that may differ. 0.002 = 0.2% — typical
        // anti-aliasing noise stays under this.
        maxDiffPixelRatio: 0.002,
        // Mask elements that are intentionally non-deterministic:
        //   - the "uptime" line on /admin/deploy (skipped here, but if
        //     we ever snapshot admin pages, mask it)
        //   - timestamps, ad-rotation widgets, etc.
        // Add masks here as needed.
      });
    });
  }
});
