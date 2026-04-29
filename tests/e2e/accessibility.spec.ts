// tests/e2e/accessibility.spec.ts
//
// Phase 3 (2026-04-30): axe-core accessibility audit on representative
// pages. Catches WCAG 2.1 AA violations (color contrast, missing
// labels, ARIA misuse, keyboard navigation gaps) that the visual
// scrolls in tasks #114-118 + the basic smoke tests miss.
//
// Each test loads a page, runs axe-core, and asserts there are no
// "critical" or "serious" violations. "moderate" and "minor" issues
// are surfaced as console warnings but don't fail the build —
// fixing every minor issue chases diminishing returns; the critical
// + serious tier is what real users (especially screen-reader users)
// actually encounter.
//
// Pages covered:
//   /                    — homepage, the highest-traffic surface
//   /tools               — index of all tools
//   /tool/merge          — representative pdf-lib writable tool
//   /tool/highlight-pdf  — visual editor (canvas + custom controls)
//   /tool/pdf-fonts      — read-only inspector
//   /pricing             — funnel-critical
//   /merge-pdf           — SEO landing
//
// Note on cookie banner: AdSense + GA4 may inject elements that axe
// flags. The consent banner itself can have its own issues. We don't
// attempt to scrub these — they're third-party, and axe's reports
// for them are still useful signal.

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES_TO_AUDIT: Array<{ path: string; label: string }> = [
  { path: "/", label: "homepage" },
  { path: "/tools", label: "tools index" },
  { path: "/tool/merge", label: "merge tool" },
  { path: "/tool/highlight-pdf", label: "highlight tool (visual editor)" },
  { path: "/tool/pdf-fonts", label: "pdf-fonts inspector" },
  { path: "/pricing", label: "pricing" },
  { path: "/merge-pdf", label: "merge-pdf SEO landing" },
];

for (const page of PAGES_TO_AUDIT) {
  test.describe(`a11y: ${page.label} (${page.path})`, () => {
    test("no critical or serious axe violations", async ({ page: p }) => {
      await p.goto(page.path);
      // Settle — let analytics/SW/etc. render before scanning.
      await p.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page: p })
        // WCAG 2.1 AA is the practical floor for compliance. axe also
        // supports `best-practice` rules but those overlap with subjective
        // design choices; we stick to standards-based rules.
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        // Exclude known third-party widgets that we can't fix:
        //   - AdSense iframe (we don't control its DOM)
        //   - Google Analytics / Tag Manager (loaded but invisible)
        //   - Microsoft Clarity heatmap script
        .exclude("iframe[src*='googleads']")
        .exclude("iframe[src*='doubleclick']")
        .exclude("[data-clarity-mask]")
        .analyze();

      // Surface ALL violations as a console summary — useful for
      // triaging moderate/minor issues even when they don't fail the
      // test.
      if (results.violations.length > 0) {
        console.log(
          `\n${page.label}: ${results.violations.length} a11y violations`,
        );
        for (const v of results.violations) {
          console.log(
            `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? "" : "s"})`,
          );
        }
      }

      // Only critical + serious violations fail the build.
      const blockers = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      expect(
        blockers,
        `Critical/serious violations on ${page.path}:\n${JSON.stringify(
          blockers.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            helpUrl: v.helpUrl,
            nodeCount: v.nodes.length,
            sample: v.nodes.slice(0, 2).map((n) => ({
              html: n.html,
              target: n.target,
            })),
          })),
          null,
          2,
        )}`,
      ).toEqual([]);
    });
  });
}
