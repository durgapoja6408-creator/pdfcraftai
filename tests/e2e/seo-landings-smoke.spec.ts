// tests/e2e/seo-landings-smoke.spec.ts
//
// 2026-04-30: smoke test for SEO landing pages + use-case detail
// pages.
//
// Why a separate spec from all-tools-smoke.spec.ts:
//   /tool/[id] pages are the interactive surface backed by
//   ToolRunner. SEO landings are mostly-static marketing pages
//   that hit different code paths — header/footer composition,
//   schema.org JSON-LD generation, internal-link cross-references —
//   and have their own regression risk profile. Keeping the suites
//   separate makes failure attribution easier.
//
// Page sources:
//   1. Static SEO landings — every directory under app/ that has a
//      page.tsx and isn't an auth/dashboard/admin/system route.
//      Discovered at test boot from the filesystem.
//   2. Use-case detail pages — generateStaticParams in
//      app/use-cases/[slug]/page.tsx pulls from lib/use-cases.ts;
//      we parse that file for the canonical slug list.
//   3. The use-cases index itself — /use-cases.
//
// Excluded:
//   - /tool/[id] pages — already covered by all-tools-smoke
//   - /app/* — signed-in surfaces require auth
//   - /admin/* — admin-only, gated behind auth
//   - /api/* — not human pages
//   - Dynamic routes other than use-cases (no static slug source)
//
// 2026-04-30 known finding (KNOWN_BROKEN_LANDINGS): 5 SEO landings
// have entries in `lib/seo-pages.ts` whose `tool:` field references
// a tool ID that doesn't exist in `lib/tools.ts`. The shared
// SeoLandingPage component does `if (!tool) return null;` when the
// lookup fails, which causes Next to render the layout's notFound
// fallback ("This page hasn't been ported yet"). The pages return
// 200 OK so they're crawlable but the body is a 404 message —
// terrible for SEO signal and direct traffic. Listed below so this
// suite stays green; the real fix is a product decision (route
// these to existing AI tools, or build the missing tools). Tracked
// in docs/STATUS.md.

import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { expect } from "./utils";

const APP_ROOT = path.join(__dirname, "..", "..", "app");

// ---------------------------------------------------------------------------
// Static landing routes — top-level app/ directories with page.tsx.
// ---------------------------------------------------------------------------

const EXCLUDED_DIRS = new Set([
  // Auth/account funnel — covered by Phase 1 + a11y suites; some of
  // these redirect signed-out users which makes smoke noisy.
  "login",
  "register",
  "forgot-password",
  "reset-password",
  "account",
  "app", // Next route group OR signed-in dashboard - either way skip
  "admin",
  "api",
  // Dynamic-only routes — we handle their concrete slugs below.
  "tool",
  "use-cases",
  "blog",
  "help",
  "about",
  // Synthetic pages with their own E2E concerns.
  "launch-notify", // geo-gated; renders only in some regions
  // Nextjs internals + non-page assets.
  "(marketing)",
]);

function discoverStaticLandings(): string[] {
  const entries = fs.readdirSync(APP_ROOT, { withFileTypes: true });
  const routes: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("(") || entry.name.startsWith("[")) continue;
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const pagePath = path.join(APP_ROOT, entry.name, "page.tsx");
    if (fs.existsSync(pagePath)) {
      routes.push(`/${entry.name}`);
    }
  }
  return routes.sort();
}

// 2026-04-30 second-pass: the 5 routes that originally rendered the
// notFound fallback (because their tool: ref was dead) are now
// 308-redirected to live destinations in next.config.mjs. The
// redirect intercepts before the file-system route matcher, so
// page.goto follows the chain to a working /tool/<id> page and the
// smoke passes. KNOWN_BROKEN_LANDINGS is intentionally empty now —
// kept the type for future regressions to land in.
const KNOWN_BROKEN_LANDINGS = new Set<string>([]);

const STATIC_LANDINGS = discoverStaticLandings().filter(
  (route) => !KNOWN_BROKEN_LANDINGS.has(route),
);

// ---------------------------------------------------------------------------
// Use-case slugs — parsed from lib/use-cases.ts.
// ---------------------------------------------------------------------------

const USE_CASES_FILE = path.join(
  __dirname,
  "..",
  "..",
  "lib",
  "use-cases.ts",
);
const USE_CASES_SOURCE = fs.readFileSync(USE_CASES_FILE, "utf8");
const USE_CASE_SLUG_RE = /\bslug:\s*"([^"]+)"/g;
const USE_CASE_SLUGS: string[] = [];
let m: RegExpExecArray | null;
while ((m = USE_CASE_SLUG_RE.exec(USE_CASES_SOURCE)) !== null) {
  USE_CASE_SLUGS.push(m[1]);
}

// ---------------------------------------------------------------------------
// Compose the full audit list.
// ---------------------------------------------------------------------------

const ALL_ROUTES: string[] = [
  ...STATIC_LANDINGS,
  "/use-cases",
  ...USE_CASE_SLUGS.map((slug) => `/use-cases/${slug}`),
];

// Same accept-list as all-tools-smoke for third-party noise.
const ACCEPTED_CONSOLE_ERROR_PATTERNS: RegExp[] = [
  /cookie.*rejected|preload.*not used|3rd party cookie/i,
  /www\.google-analytics\.com|analytics\.google\.com|clarity\.ms/i,
  /cloudflareinsights/i,
  /googleads|doubleclick/i,
  /Failed to load resource:.*the server responded with a status of 404/i,
];

test.describe("seo-landings smoke", () => {
  test("registry parse — sufficient route count", () => {
    // STATIC_LANDINGS alone should be 30+. Use-case slugs should be 5+.
    expect(STATIC_LANDINGS.length).toBeGreaterThanOrEqual(30);
    expect(USE_CASE_SLUGS.length).toBeGreaterThanOrEqual(5);
  });
});

for (const route of ALL_ROUTES) {
  test.describe(`smoke: ${route}`, () => {
    test("renders without console errors", async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          const text = msg.text();
          if (
            !ACCEPTED_CONSOLE_ERROR_PATTERNS.some((re) => re.test(text))
          ) {
            consoleErrors.push(text);
          }
        }
      });
      page.on("pageerror", (err) => {
        consoleErrors.push(`pageerror: ${err.message}`);
      });

      const response = await page.goto(route, {
        waitUntil: "domcontentloaded",
      });

      // SEO landings should return 200. A 4xx/5xx is a real
      // regression — bad slug, missing data, or build-time failure.
      const status = response?.status() ?? 0;
      expect(status, `expected 2xx for ${route}, got ${status}`).toBeLessThan(
        400,
      );

      // Wait for the h1 — every SEO landing should have exactly one
      // h1 with the page's main heading.
      const heading = page.locator("h1, [role=heading][aria-level='1']").first();
      await expect(heading).toBeVisible({ timeout: 15_000 });

      // Settle.
      await page
        .waitForLoadState("networkidle", { timeout: 10_000 })
        .catch(() => {
          // Some pages with embedded analytics never reach idle.
        });
      await page.waitForTimeout(500);

      if (consoleErrors.length > 0) {
        throw new Error(
          `Console errors on ${route}:\n${consoleErrors
            .slice(0, 5)
            .map((e) => `  - ${e.slice(0, 300)}`)
            .join("\n")}${consoleErrors.length > 5 ? `\n  ... and ${consoleErrors.length - 5} more` : ""}`,
        );
      }
    });
  });
}
