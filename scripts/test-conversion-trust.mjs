#!/usr/bin/env node
/**
 * test-conversion-trust.mjs (#155-158, 2026-06-08): contract guard for the
 * P1 conversion/trust + P2 cookie work.
 *
 * Static-parse only. Pins:
 *   A  Funnel: CheckoutButton fires credits_purchased + subscription_started.
 *   B  Public stats: cached, never-throws, test-excluded, floor-gated.
 *   C  TrustSection: honest (product facts always; live numbers floor-gated)
 *      and mounted on the homepage.
 *   D  Cookie banner: collapses to a pill on scroll WITHOUT auto-consenting,
 *      and the Accept/Reject parity is untouched.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
let passed = 0, failed = 0;
const failures = [];
const assert = (c, m) => { if (c) passed++; else { failed++; failures.push(m); } };
const read = (r) => fs.readFileSync(path.join(ROOT, r), "utf8");
const exists = (r) => fs.existsSync(path.join(ROOT, r));

// ── A — funnel events in the checkout button ────────────────────────
{
  const src = read("components/billing/CheckoutButton.tsx");
  assert(/from "@\/lib\/analytics"/.test(src), "A: imports the analytics track()");
  assert(/CREDIT_PACKS/.test(src) && /USD_TO_INR_RATE/.test(src), "A: looks up pack price from the catalog");
  assert(/event:\s*"credits_purchased"/.test(src), "A: fires credits_purchased");
  assert(/package_id:\s*analytics\.packageId/.test(src) && /price_inr:\s*analytics\.priceInr/.test(src), "A: credits_purchased carries package_id + price_inr");
  assert(/event:\s*"subscription_started"/.test(src), "A: fires subscription_started on the redirect path");
  // The purchase event must fire at the success handler, not on click.
  assert(/handler:\s*\(\)\s*=>\s*{[\s\S]*credits_purchased/.test(src), "A: credits_purchased fires inside the Razorpay success handler");
}

// ── B — public stats helper ─────────────────────────────────────────
{
  const rel = "lib/public-stats.ts";
  assert(exists(rel), `B: ${rel} exists`);
  const src = read(rel);
  assert(/^import "server-only";/m.test(src), "B: server-only");
  assert(/export const getPublicStats/.test(src), "B: exports getPublicStats");
  assert(/unstable_cache/.test(src), "B: cached (homepage stays static-friendly)");
  assert(/export const PUBLIC_STATS_FLOOR/.test(src), "B: exposes a credibility floor");
  assert(/showLive/.test(src) && />=\s*PUBLIC_STATS_FLOOR/.test(src), "B: live numbers gated behind the floor");
  // Never throw — marketing must render even if the DB hiccups.
  assert(/try\s*{[\s\S]*}\s*catch/.test(src), "B: compute() wraps the query in try/catch");
  assert(/documentsProcessed:\s*0[\s\S]*aiOpsRun:\s*0[\s\S]*showLive:\s*false|return\s*{\s*documentsProcessed:\s*0/.test(src), "B: error fallback returns safe zeros + showLive:false");
  // Test/admin traffic excluded.
  assert(/EXCLUDE_FALLBACK|PUBLIC_STATS_EXCLUDE_USER_IDS/.test(src), "B: excludes test/admin user ids");
  assert(/6b303c3b-ddfd-48fc-9162-2556d077fece/.test(src), "B: documented non-admin test id in the exclude fallback");
}

// ── C — trust section, honest + mounted ─────────────────────────────
{
  const rel = "components/landing/TrustSection.tsx";
  assert(exists(rel), `C: ${rel} exists`);
  const src = read(rel);
  assert(/export async function TrustSection/.test(src), "C: async server component");
  assert(/await getPublicStats\(\)/.test(src), "C: reads the cached stats");
  // Product facts always render; live numbers only when showLive.
  assert(/TOOL_STATS\.total/.test(src) && /TOOL_STATS\.free/.test(src), "C: shows real product facts (tool counts)");
  assert(/stats\.showLive\s*\?/.test(src), "C: live usage numbers are conditional on showLive");
  assert(/documentsProcessed\.toLocaleString|aiOpsRun\.toLocaleString/.test(src), "C: live tiles use the real numbers when shown");
  assert(/\/changelog/.test(src), "C: links to the changelog (transparency)");
  assert(/one person|in public|in the open/i.test(src), "C: honest solo/transparency framing");
  // Mounted on the homepage.
  const page = read("app/page.tsx");
  assert(/import { TrustSection }/.test(page) && /<TrustSection \/>/.test(page), "C: TrustSection mounted on the homepage");
}

// ── D — cookie banner collapse-on-scroll (no auto-consent) ───────────
{
  const src = read("components/compliance/CookieConsent.tsx");
  assert(/const \[minimized, setMinimized\]/.test(src), "D: has a minimized state");
  assert(/addEventListener\("scroll"/.test(src), "D: collapses on scroll");
  assert(/scrollY > \d+/.test(src), "D: uses a scroll threshold");
  assert(/if \(minimized\) {/.test(src), "D: renders a compact pill when minimized");
  assert(/Open cookie settings|Cookie settings/.test(src), "D: the pill re-opens the banner");
  // CRITICAL: minimizing must NOT write a consent cookie (no dark pattern).
  const scrollBlock = src.slice(src.indexOf('addEventListener("scroll"') - 400, src.indexOf('addEventListener("scroll"') + 200);
  assert(!/writeConsentCookie|onChoose\(/.test(scrollBlock), "D: scroll-collapse never auto-sets consent");
  // Accept/Reject still present (parity guard owns the styling check).
  assert(/Accept all/.test(src) && /Reject all/.test(src), "D: Accept all + Reject all still rendered");
}

console.log("");
if (failed === 0) {
  console.log(`PASS — ${passed} assertions`);
  console.log(`${passed} passed, 0 failed`);
  process.exit(0);
} else {
  console.error(`FAIL — ${failed} assertion(s):`);
  for (const m of failures) console.error(`  ${m}`);
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
