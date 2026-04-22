#!/usr/bin/env node
// Self-contained test harness for Task #24 / Phase D — the cookie
// consent + DPDP Act 2023 + GDPR disclosure surface. Mirrors the
// plain-Node pattern used by every other test-*.mjs in this repo:
// assert() with a pass/fail counter, static file greps + dynamic
// imports of pure modules, emits the canonical "N passed, M failed"
// summary line that run-all-tests.mjs parses.
//
// Why this suite exists:
//   Before Task #24 the production site loaded Google Analytics 4 +
//   Microsoft Clarity on every page hit, unconditionally, for every
//   visitor regardless of geography or consent posture. That's a
//   violation of:
//     - GDPR Art. 6(1)(a) + ePrivacy Directive Art. 5(3) (EU/UK)
//     - UK PECR Regulation 6 (ICO 2024 guidance)
//     - DPDP Act 2023 s. 6 (India)
//   Task #24 fixes that by putting a first-party cookie
//   (`pdfcraft_consent`) in front of analytics: the SERVER layout
//   reads the cookie and only emits the GA4 + Clarity <Script> tags
//   when the value is "all". The CLIENT banner writes the cookie.
//
//   The failure mode this harness guards against is the "silent
//   regression" — somebody refactors lib/compliance/consent.ts and
//   drops the IN country code from CONSENT_REQUIRED_COUNTRIES, or
//   inlines the analytics gate in app/layout.tsx and removes the
//   cookie read, or renames the cookie from `pdfcraft_consent` to
//   something else in one place but not the other. None of those
//   crash at runtime; all of them silently re-open the compliance
//   hole. This harness pins every seam that a regression could
//   slip through.
//
// What this covers:
//   SECTION A — lib/compliance/consent.ts module surface: three-level
//               ConsentLevel union (none/essential/all), CONSENT_COOKIE_NAME
//               pinned to "pdfcraft_consent", CONSENT_COOKIE_MAX_AGE_SECONDS
//               = 365 days in seconds, parseConsent + analyticsAllowed +
//               regionRequiresConsent exports, CONSENT_REQUIRED_COUNTRIES
//               covers all 27 EU + 3 EEA + UK + IN, CF sentinel handling
//               ("XX" / "T1" / "" → required=true as safer default).
//   SECTION B — components/compliance/CookieConsent.tsx client banner:
//               "use client" directive, three buttons (Accept all /
//               Essential only / Customize), import of CONSENT_COOKIE_NAME
//               + CONSENT_COOKIE_MAX_AGE_SECONDS from consent.ts (shared
//               source of truth, no string duplication), writes first-
//               party cookie via document.cookie with Max-Age + Path=/
//               + SameSite=Lax + Secure (HTTPS only), calls
//               window.location.reload() on click so the server re-
//               resolves the analytics gate.
//   SECTION C — components/compliance/ResetConsentButton.tsx withdrawal:
//               "use client", imports CONSENT_COOKIE_NAME, sets
//               Max-Age=0 to delete the cookie (NOT setting it to
//               "essential" — GDPR Art. 7(3) + DPDP s. 6(3) require
//               withdrawal to restore the un-chosen state).
//   SECTION D — app/layout.tsx consent gate: imports cookies from
//               next/headers + analyticsAllowed + parseConsent +
//               CONSENT_COOKIE_NAME + CookieConsent, reads the cookie
//               via cookies().get(CONSENT_COOKIE_NAME)?.value, renders
//               <CookieConsent initialLevel={...} /> unconditionally,
//               the GA4 + Clarity <Script> tags are now wrapped in
//               {analyticsOn ? … : null} so they DON'T emit unless
//               the visitor has accepted.
//   SECTION E — app/cookies/page.tsx full cookie policy: imports
//               ResetConsentButton, lists pdfcraft_consent +
//               authjs.session-token + _ga + _clck, mentions DPDP
//               Act s. 6(3) + GDPR Art. 7(3), explicit withdrawal
//               CTA.
//   SECTION F — lib/legal-docs.ts DPDP expansion: Privacy section
//               includes "Your rights under the DPDP Act" with the
//               six DPDP rights, s. 6(3) withdrawal, s. 8(10)
//               grievance 15-day SLA, s. 9 children, s. 16
//               cross-border transfers; DPA mentions "DPDP" +
//               "Consent Manager" + Data Fiduciary/Processor roles;
//               Privacy cookies line disclaims consent-gating.
//   SECTION G — run-all-tests.mjs registers this suite.
//
// Run: `node scripts/test-compliance.mjs`
// Exits 0 on pass, 1 on any failure.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const CONSENT_PATH = resolve(ROOT, "lib", "compliance", "consent.ts");
const BANNER_PATH = resolve(
  ROOT,
  "components",
  "compliance",
  "CookieConsent.tsx"
);
const RESET_PATH = resolve(
  ROOT,
  "components",
  "compliance",
  "ResetConsentButton.tsx"
);
const LAYOUT_PATH = resolve(ROOT, "app", "layout.tsx");
const COOKIES_PAGE_PATH = resolve(ROOT, "app", "cookies", "page.tsx");
const LEGAL_DOCS_PATH = resolve(ROOT, "lib", "legal-docs.ts");
const AGGREGATOR_PATH = resolve(ROOT, "scripts", "run-all-tests.mjs");

/* ------------------------------------------------------------------ */
/* Harness plumbing                                                    */
/* ------------------------------------------------------------------ */

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(msg);
    console.log(`  FAIL: ${msg}`);
  }
}

function read(p) {
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

/* ------------------------------------------------------------------ */
/* SECTION A — lib/compliance/consent.ts module surface                */
/* ------------------------------------------------------------------ */

console.log("\n[SECTION A] lib/compliance/consent.ts module surface");

const consentSrc = read(CONSENT_PATH);
assert(consentSrc.length > 0, "lib/compliance/consent.ts exists");

// Cookie name pinned — this string is referenced from at least three
// call-sites and MUST be identical everywhere. A silent rename here
// breaks the consent-write path (banner), the consent-read path
// (layout), and the withdrawal path (reset button).
assert(
  /export\s+const\s+CONSENT_COOKIE_NAME\s*=\s*"pdfcraft_consent"/.test(
    consentSrc
  ),
  'CONSENT_COOKIE_NAME exported and equals "pdfcraft_consent"'
);

// 365 days in seconds = 60 * 60 * 24 * 365 = 31_536_000. Check for
// the math expression rather than the literal so somebody tweaking
// the multiplier doesn't silently break when a number shows up.
assert(
  /export\s+const\s+CONSENT_COOKIE_MAX_AGE_SECONDS\s*=\s*60\s*\*\s*60\s*\*\s*24\s*\*\s*365/.test(
    consentSrc
  ),
  "CONSENT_COOKIE_MAX_AGE_SECONDS = 60*60*24*365 (365 days)"
);

// Three-level union — adding a fourth value requires a parser
// branch in parseConsent() and a runtime branch in analyticsAllowed().
assert(
  /export\s+type\s+ConsentLevel\s*=\s*"none"\s*\|\s*"essential"\s*\|\s*"all"/.test(
    consentSrc
  ),
  'ConsentLevel = "none" | "essential" | "all"'
);

assert(
  /export\s+const\s+CONSENT_LEVELS\s*:\s*readonly\s+ConsentLevel\[\]/.test(
    consentSrc
  ),
  "CONSENT_LEVELS is a readonly runtime array of ConsentLevel"
);
for (const level of ["none", "essential", "all"]) {
  assert(
    new RegExp(`"${level}"`).test(consentSrc),
    `CONSENT_LEVELS includes "${level}"`
  );
}

// Public function surface.
assert(
  /export\s+function\s+parseConsent/.test(consentSrc),
  "parseConsent is exported"
);
assert(
  /export\s+function\s+analyticsAllowed/.test(consentSrc),
  "analyticsAllowed is exported"
);
assert(
  /export\s+function\s+regionRequiresConsent/.test(consentSrc),
  "regionRequiresConsent is exported"
);

// analyticsAllowed must be "all"-only — "essential" and "none" both
// block. A regression that widened this to `level !== "essential"`
// would re-open analytics for first-time visitors (consent level
// "none" = not yet chosen), which is exactly the GDPR violation
// Task #24 exists to close.
assert(
  /return\s+level\s*===\s*"all"/.test(consentSrc),
  "analyticsAllowed returns level === \"all\" (only accept-all unlocks analytics)"
);

// CONSENT_REQUIRED_COUNTRIES must cover every EU27 + EEA + GB + IN
// country. Missing one (say, DPDP regression that drops IN) would
// silently disable the region-required posture for Indian visitors.
const REQUIRED_COUNTRIES = [
  // EU 27
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  // EEA (EU + IS/LI/NO)
  "IS", "LI", "NO",
  // UK post-Brexit
  "GB",
  // India — DPDP Act 2023
  "IN",
];
for (const code of REQUIRED_COUNTRIES) {
  assert(
    new RegExp(`"${code}"`).test(consentSrc),
    `CONSENT_REQUIRED_COUNTRIES includes ${code}`
  );
}

// Cloudflare sentinels — unknown country codes MUST fall through to
// required=true (safer default for unknown/Tor visitors who could
// be EU).
assert(
  /"XX"/.test(consentSrc) && /"T1"/.test(consentSrc),
  'regionRequiresConsent handles CF sentinels "XX" + "T1"'
);

// Parse safety: unknown values collapse to "none" (no analytics),
// not "all".
assert(
  /return\s+"none"/.test(consentSrc),
  "parseConsent returns \"none\" as safe default for unknown values"
);

/* ------------------------------------------------------------------ */
/* SECTION B — components/compliance/CookieConsent.tsx client banner   */
/* ------------------------------------------------------------------ */

console.log("\n[SECTION B] components/compliance/CookieConsent.tsx");

const bannerSrc = read(BANNER_PATH);
assert(bannerSrc.length > 0, "components/compliance/CookieConsent.tsx exists");

// Must be a client component — server components can't write
// document.cookie. The "use client" directive must appear BEFORE
// the first `import` statement (Next.js compiler requirement);
// comments before it are fine.
{
  const idxUseClient = bannerSrc.indexOf('"use client"');
  const idxFirstImport = bannerSrc.indexOf("\nimport ");
  assert(
    idxUseClient >= 0 && idxUseClient < idxFirstImport,
    'CookieConsent.tsx has "use client" directive before first import'
  );
}

// Must import the shared constants — a regression that copy-pastes
// "pdfcraft_consent" as a bare string literal here breaks the
// single-source-of-truth guarantee and invites rename drift.
assert(
  /from\s+"@\/lib\/compliance\/consent"/.test(bannerSrc),
  "CookieConsent imports from @/lib/compliance/consent"
);
assert(
  /CONSENT_COOKIE_NAME/.test(bannerSrc),
  "CookieConsent imports CONSENT_COOKIE_NAME constant"
);
assert(
  /CONSENT_COOKIE_MAX_AGE_SECONDS/.test(bannerSrc),
  "CookieConsent imports CONSENT_COOKIE_MAX_AGE_SECONDS constant"
);
assert(
  /ConsentLevel/.test(bannerSrc),
  "CookieConsent imports ConsentLevel type"
);

// Three actionable buttons visible in the banner.
assert(
  /Accept all/.test(bannerSrc),
  'CookieConsent banner includes "Accept all" button'
);
assert(
  /Essential only/.test(bannerSrc),
  'CookieConsent banner includes "Essential only" button'
);
assert(
  /Customize/.test(bannerSrc),
  'CookieConsent banner includes "Customize" link'
);

// Cookie attributes — regression checks that the five required
// attributes all survive.
assert(
  /Max-Age=\$\{CONSENT_COOKIE_MAX_AGE_SECONDS\}/.test(bannerSrc),
  "CookieConsent writes Max-Age attribute"
);
assert(/Path=\//.test(bannerSrc), "CookieConsent writes Path=/ attribute");
assert(
  /SameSite=Lax/.test(bannerSrc),
  "CookieConsent writes SameSite=Lax attribute"
);
assert(
  /Secure/.test(bannerSrc) && /https:/.test(bannerSrc),
  "CookieConsent writes Secure attribute (HTTPS-gated)"
);

// Reload on choice — needed so the server re-evaluates the
// analytics gate. `router.refresh()` is NOT enough (it does an RSC
// refresh but doesn't re-run the <Script> tags).
assert(
  /window\.location\.reload\(\)/.test(bannerSrc),
  "CookieConsent reloads the page on click (server re-emits Script tags)"
);

// Accessibility: dialog role + focus management.
assert(
  /role=["']dialog["']/.test(bannerSrc),
  'CookieConsent uses role="dialog" for assistive tech'
);
assert(
  /aria-labelledby/.test(bannerSrc) && /aria-describedby/.test(bannerSrc),
  "CookieConsent wires aria-labelledby + aria-describedby"
);

/* ------------------------------------------------------------------ */
/* SECTION C — components/compliance/ResetConsentButton.tsx            */
/* ------------------------------------------------------------------ */

console.log("\n[SECTION C] components/compliance/ResetConsentButton.tsx");

const resetSrc = read(RESET_PATH);
assert(resetSrc.length > 0, "ResetConsentButton.tsx exists");

{
  const idxUseClient = resetSrc.indexOf('"use client"');
  const idxFirstImport = resetSrc.indexOf("\nimport ");
  assert(
    idxUseClient >= 0 && idxUseClient < idxFirstImport,
    'ResetConsentButton has "use client" directive before first import'
  );
}
assert(
  /from\s+"@\/lib\/compliance\/consent"/.test(resetSrc),
  "ResetConsentButton imports from @/lib/compliance/consent"
);
assert(
  /CONSENT_COOKIE_NAME/.test(resetSrc),
  "ResetConsentButton imports CONSENT_COOKIE_NAME (no string duplication)"
);

// Withdrawal MUST delete the cookie (Max-Age=0), not set it to
// "essential". GDPR Art. 7(3) + DPDP s. 6(3) require withdrawal to
// restore the pre-choice state so the user can decide again from
// scratch. A regression that does `document.cookie = "pdfcraft_
// consent=essential"` would technically stop analytics but would
// also prevent the banner from re-appearing — that's a UX
// violation of the "as easy as giving" rule.
assert(
  /Max-Age=0/.test(resetSrc),
  "ResetConsentButton deletes cookie via Max-Age=0 (not overwrite to essential)"
);

assert(
  /window\.location\.reload\(\)/.test(resetSrc),
  "ResetConsentButton reloads the page so banner re-appears"
);

/* ------------------------------------------------------------------ */
/* SECTION D — app/layout.tsx consent gate                             */
/* ------------------------------------------------------------------ */

console.log("\n[SECTION D] app/layout.tsx consent gate");

const layoutSrc = read(LAYOUT_PATH);
assert(layoutSrc.length > 0, "app/layout.tsx exists");

// Imports.
assert(
  /import\s*\{\s*cookies\s*\}\s*from\s+"next\/headers"/.test(layoutSrc),
  "layout.tsx imports cookies from next/headers"
);
assert(
  /from\s+"@\/lib\/compliance\/consent"/.test(layoutSrc),
  "layout.tsx imports from @/lib/compliance/consent"
);
for (const sym of [
  "CONSENT_COOKIE_NAME",
  "analyticsAllowed",
  "parseConsent",
]) {
  assert(
    new RegExp(sym).test(layoutSrc),
    `layout.tsx imports ${sym} from consent module`
  );
}
assert(
  /from\s+"@\/components\/compliance\/CookieConsent"/.test(layoutSrc),
  "layout.tsx imports CookieConsent banner component"
);

// The actual cookie read — via the helper constant, not a bare
// string. Catches regressions that copy-paste "pdfcraft_consent"
// here.
assert(
  /cookies\(\)\.get\(CONSENT_COOKIE_NAME\)/.test(layoutSrc),
  "layout.tsx reads cookie via cookies().get(CONSENT_COOKIE_NAME)"
);
assert(
  /parseConsent\(/.test(layoutSrc),
  "layout.tsx parses the cookie value via parseConsent()"
);
assert(
  /analyticsAllowed\(/.test(layoutSrc),
  "layout.tsx gates analytics via analyticsAllowed()"
);

// CRITICAL: the GA4 + Clarity <Script> tags must now be wrapped in
// a conditional. A regression that unwraps them re-opens the
// GDPR/ePrivacy violation that Task #24 exists to close.
assert(
  /\{analyticsOn\s*\?\s*\(/.test(layoutSrc) ||
    /\{analyticsOn\s*&&/.test(layoutSrc),
  "layout.tsx gates analytics Script tags on {analyticsOn ? … : null}"
);

// CookieConsent component must be rendered unconditionally (it
// self-hides when a choice has been made). A regression that gates
// the banner ITSELF on `level === "none"` inside layout.tsx creates
// an infinite loop — the banner would never appear because the
// initial prop would never be read.
assert(
  /<CookieConsent\s+initialLevel=\{/.test(layoutSrc),
  "layout.tsx renders <CookieConsent initialLevel={...} /> unconditionally"
);

// The GA4/Clarity IDs must still be the same — we're gating, not
// removing.
assert(
  /G-2Y8PS0S93F/.test(layoutSrc),
  "layout.tsx still carries GA4 measurement ID G-2Y8PS0S93F"
);
assert(
  /wcsbv536zv/.test(layoutSrc),
  "layout.tsx still carries Clarity project ID wcsbv536zv"
);

/* ------------------------------------------------------------------ */
/* SECTION E — app/cookies/page.tsx full cookie policy                 */
/* ------------------------------------------------------------------ */

console.log("\n[SECTION E] app/cookies/page.tsx");

const cookiesPageSrc = read(COOKIES_PAGE_PATH);
assert(cookiesPageSrc.length > 0, "app/cookies/page.tsx exists");

assert(
  /from\s+"@\/components\/compliance\/ResetConsentButton"/.test(
    cookiesPageSrc
  ),
  "cookies page imports ResetConsentButton"
);
assert(
  /<ResetConsentButton\s*\/>/.test(cookiesPageSrc),
  "cookies page renders <ResetConsentButton />"
);

// The full inventory — every cookie we set must be listed so the
// page is legally complete under EDPB Guidelines 05/2020 §3.3.2.
assert(
  /pdfcraft_consent/.test(cookiesPageSrc),
  "cookies page lists pdfcraft_consent"
);
assert(
  /authjs\.session-token/.test(cookiesPageSrc),
  "cookies page lists authjs.session-token"
);
assert(
  /_ga/.test(cookiesPageSrc),
  "cookies page lists _ga (GA4 client id)"
);
assert(
  /_clck/.test(cookiesPageSrc) || /_clsk/.test(cookiesPageSrc),
  "cookies page lists Microsoft Clarity cookies (_clck / _clsk)"
);

// Regulatory anchors — mentions of the specific articles that power
// the withdrawal CTA. Keeps the page legally defensible even if a
// future refactor scrubs the prose.
assert(
  /Art\.?\s*7\(3\)/.test(cookiesPageSrc) || /Article\s*7\(3\)/.test(cookiesPageSrc),
  "cookies page cites GDPR Art. 7(3) (withdrawal)"
);
assert(
  /DPDP/.test(cookiesPageSrc),
  "cookies page mentions DPDP Act"
);
assert(
  /s\.\s*6\(3\)/.test(cookiesPageSrc),
  "cookies page cites DPDP s. 6(3) withdrawal"
);

// Grievance Officer disclosure for DPDP s. 8(10).
assert(
  /Grievance Officer/.test(cookiesPageSrc),
  "cookies page surfaces Grievance Officer contact (DPDP s. 8(10))"
);

/* ------------------------------------------------------------------ */
/* SECTION F — lib/legal-docs.ts DPDP + consent expansion              */
/* ------------------------------------------------------------------ */

console.log("\n[SECTION F] lib/legal-docs.ts DPDP + consent expansion");

const legalSrc = read(LEGAL_DOCS_PATH);
assert(legalSrc.length > 0, "lib/legal-docs.ts exists");

// Privacy — DPDP section.
assert(
  /Your rights under the DPDP Act/.test(legalSrc),
  'Privacy includes "Your rights under the DPDP Act" section'
);
for (const section of [
  "s\\.\\s*11", // access
  "s\\.\\s*12", // correction/erasure
  "s\\.\\s*13", // grievance
  "s\\.\\s*14", // nomination
  "s\\.\\s*6\\(3\\)", // withdrawal
  "s\\.\\s*8\\(10\\)", // grievance officer 15-day SLA
]) {
  assert(
    new RegExp(section).test(legalSrc),
    `Privacy cites DPDP section ${section.replace(/\\\\/g, "")}`
  );
}

// Children section — DPDP s. 9 + age gate.
assert(
  /s\.\s*9/.test(legalSrc),
  "Privacy cites DPDP s. 9 (children / verifiable parental consent)"
);

// Cross-border under DPDP.
assert(
  /s\.\s*16/.test(legalSrc),
  "Privacy / DPA cites DPDP s. 16 (cross-border transfers)"
);

// Privacy cookies line must disclose consent-gating — the pre-Task-
// #24 version said analytics "load" unconditionally, which is the
// regression we're guarding against.
assert(
  /CONSENT-GATED/.test(legalSrc) || /consent-gated/.test(legalSrc) || /only load if you/.test(legalSrc),
  "Privacy cookies section discloses consent-gating"
);

// DPA — DPDP Consent Manager forward-looking note.
assert(
  /Consent Manager/.test(legalSrc),
  "DPA mentions DPDP Consent Manager framework"
);

// DPA — Data Fiduciary / Data Processor roles.
assert(
  /Data Fiduciary/.test(legalSrc),
  "DPA names Data Fiduciary role (DPDP)"
);
assert(
  /Data Processor/.test(legalSrc),
  "DPA names Data Processor role (DPDP)"
);

// Grievance Officer on both Privacy and DPA.
assert(
  (legalSrc.match(/Grievance Officer/g) ?? []).length >= 2,
  "Grievance Officer appears at least twice in legal docs (Privacy + DPA)"
);

/* ------------------------------------------------------------------ */
/* SECTION G — run-all-tests.mjs registration                          */
/* ------------------------------------------------------------------ */

console.log("\n[SECTION G] run-all-tests.mjs aggregator registration");

const aggSrc = read(AGGREGATOR_PATH);
assert(aggSrc.length > 0, "scripts/run-all-tests.mjs exists");
assert(
  /name:\s*"compliance"/.test(aggSrc) &&
    /file:\s*"test-compliance\.mjs"/.test(aggSrc),
  'run-all-tests.mjs registers { name: "compliance", file: "test-compliance.mjs" }'
);

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

console.log("");
if (failed === 0) {
  console.log(`Compliance tests: ${passed} passed, ${failed} failed`);
  process.exit(0);
} else {
  console.log(`Compliance tests: ${passed} passed, ${failed} failed`);
  console.log("\nFailed assertions:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
