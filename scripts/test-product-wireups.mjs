#!/usr/bin/env node
// scripts/test-product-wireups.mjs
//
// 2026-05-12 — pins two product wire-ups shipped today:
//
//   Item 5 (§6d A/B testing) — HOMEPAGE_HERO_CTA flag added to
//   FEATURE_FLAGS + first deterministic-percent variant render on
//   the homepage. Anonymous traffic gets control; logged-in users
//   bucket by HOMEPAGE_HERO_CTA_PERCENT env var (default 0%).
//
//   Item 6 (§6c per-user negative feedback auto-routing) — the
//   wire was already present at lib/ai/router.ts L310. This guard
//   pins the call so a future refactor doesn't accidentally remove
//   it (the bias machinery has unit tests but no integration pin
//   on the actual router callsite).
//
// Pure static-parse.

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const report = [];
function check(label, predicate) {
  const ok = !!predicate;
  if (ok) pass++; else fail++;
  report.push({ label, ok });
}

// ─── Item 5: HOMEPAGE_HERO_CTA variant ───
const FLAGS = readFileSync("lib/flags.ts", "utf8");
const HOME = readFileSync("app/page.tsx", "utf8");

check(
  "I5.A1: HOMEPAGE_HERO_CTA defined in FEATURE_FLAGS",
  /HOMEPAGE_HERO_CTA:\s*"homepage_hero_cta"/.test(FLAGS)
);
check(
  "I5.A2: flag has §6d / 2026-05-12 rationale comment",
  // Rationale comment precedes the HOMEPAGE_HERO_CTA literal (it's
  // the JSDoc block above the property), so anchor on §6d appearing
  // anywhere within ~1500 chars BEFORE the HOMEPAGE_HERO_CTA literal.
  (() => {
    const idx = FLAGS.indexOf("HOMEPAGE_HERO_CTA:");
    if (idx < 0) return false;
    const before = FLAGS.slice(Math.max(0, idx - 1500), idx);
    return /§6d/.test(before);
  })()
);
check(
  "I5.B1: homepage imports isFeatureEnabled + FEATURE_FLAGS",
  /import\s*\{[^}]*isFeatureEnabled[^}]*FEATURE_FLAGS[^}]*\}\s*from\s*"@\/lib\/flags"/.test(HOME)
);
check(
  "I5.B2: homepage is async (auth() requires it)",
  /export default async function HomePage\(\)/.test(HOME)
);
check(
  "I5.B3: heroVariantB derived from isFeatureEnabled(HOMEPAGE_HERO_CTA)",
  /heroVariantB\s*=\s*isFeatureEnabled\(\s*FEATURE_FLAGS\.HOMEPAGE_HERO_CTA/.test(HOME)
);
check(
  "I5.B4: variant B href points to /compare",
  /heroVariantB\s*\?\s*[\s\S]{0,200}?href="\/compare"/.test(HOME)
);
check(
  "I5.B5: variant A (control) href stays at /tools",
  /\)\s*:\s*\(\s*<Link href="\/tools"/.test(HOME)
);
check(
  "I5.B6: variant B label is 'Pick a tool in 30 seconds'",
  /Pick a tool in 30 seconds/.test(HOME)
);
check(
  "I5.B7: variant A label is 'Try it now — no signup'",
  /Try it now — no signup/.test(HOME)
);

// ─── Item 6: §6c auto-routing wire pinned in router.ts ───
const ROUTER = readFileSync("lib/ai/router.ts", "utf8");

check(
  "I6.A1: router imports applyQualityBiasIfEnabled",
  /import\s*\{\s*applyQualityBiasIfEnabled\s*\}\s*from\s*"\.\/quality-signal"/.test(ROUTER)
);
check(
  "I6.A2: router calls applyQualityBiasIfEnabled(baseLadder, userId)",
  /applyQualityBiasIfEnabled\(\s*baseLadder,\s*opts\.userId\s*\)/.test(ROUTER)
);
check(
  "I6.A3: result is assigned to a `ladder` const (used downstream)",
  /const ladder\s*=\s*await applyQualityBiasIfEnabled/.test(ROUTER)
);

// ─── Activation guidance ───
// These two assertions document the activation gates in the codebase
// rather than asserting they're flipped. They check that the operator
// guidance is present so future contributors understand how to enable.
check(
  "I5.C1: flag rationale documents default-0% + flip-to-measure",
  /Default state:[\s\S]{0,500}?Founder flips/.test(FLAGS)
);
check(
  "I6.C1: quality-signal autoRouteEnabled reads QUALITY_SIGNAL_AUTO_ROUTE_ENABLED",
  (() => {
    const QS = readFileSync("lib/ai/quality-signal.ts", "utf8");
    return /QUALITY_SIGNAL_AUTO_ROUTE_ENABLED/.test(QS);
  })()
);

console.log("product-wireups:");
for (const r of report) console.log(`  ${r.ok ? "✓" : "✗"} ${r.label}`);
console.log(`product-wireups: ${pass} passed, ${fail} failed (of ${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
