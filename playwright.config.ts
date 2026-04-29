// playwright.config.ts
//
// Phase 1 E2E test config (2026-04-29).
//
// Goal: catch the defect classes that static-parse audits + Node tests
// can't see — actual user flows on real browsers, including Safari/
// WebKit (where mobile-keyboard occlusion + memory-pressure cache
// eviction live) and mobile viewports (where touch targets + scroll
// behavior diverge from desktop).
//
// What this config sets up:
//   - 3 browser engines: Chromium, Firefox, WebKit. Every spec runs
//     in all three by default. Skip a browser per-test with
//     `test.skip(({ browserName }) => browserName === 'webkit', ...)`.
//   - 1 mobile viewport (Mobile Safari emulation). Catches M12-class
//     bugs (keyboard occlusion, touch target size).
//   - Auto-boots `next dev` against localhost:3000 if not already
//     running. Reuses an existing dev server if one's up — speeds up
//     local iteration.
//   - Trace + screenshot + video on first retry. Off on success
//     (saves disk + time).
//   - Per-test 60s timeout — long enough for PDFium WASM load on
//     cold-cache, short enough that hangs surface fast.
//
// Running:
//   npm run test:e2e              — full suite, all 3 browsers + mobile
//   npm run test:e2e:ui           — interactive mode, single browser
//   npx playwright test merge     — only merge.spec.ts
//   npx playwright test --headed  — see the browser
//   npx playwright show-trace ... — open a saved trace for debugging
//
// First-time setup on a new machine:
//   npx playwright install
//   npx playwright install-deps   (Linux only — installs system libs)
//
// CI integration: deferred to Phase 6 (synthetic monitor). For now
// this config is local-only. When wired into CI, set CI=true env var
// to enable retries + GitHub reporter.

import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // 60s per test. PDFium WASM cold load is ~1-2s on first tool visit
  // and the M23 service worker means subsequent visits hit cache. The
  // ceiling is for outliers (slow CI runners, big fixture PDFs).
  timeout: 60_000,
  // Each `expect()` waits up to 10s for assertions to pass. Necessary
  // for canvas-render expectations where PDFium thumbnails arrive
  // after a deferred render pass.
  expect: { timeout: 10_000 },
  // Fail the build on `test.only` left in code.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Single-worker per browser locally so console output isn't
  // interleaved. CI can ramp this up if needed.
  workers: process.env.CI ? 4 : 1,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    // Capture traces only on retry — hugely faster on a green run,
    // still gives you everything you need when something fails.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Default ignoreHTTPSErrors=false. Local dev is HTTP, prod is HTTPS,
    // and we don't have any self-signed cert flows.
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      // Mobile Safari emulation — catches M12 (keyboard occluding
      // input), G11 (touch target size), and viewport-width
      // assumptions that desktop tests would never trip.
      name: "mobile-safari",
      use: { ...devices["iPhone 14"] },
    },
  ],

  // Boot Next.js dev server before the suite. `reuseExistingServer`
  // lets you keep `next dev` running in another terminal and just
  // run the tests against it — much faster iteration loop.
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
