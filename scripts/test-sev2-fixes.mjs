#!/usr/bin/env node
// scripts/test-sev2-fixes.mjs
//
// 2026-05-12 — CI pins for the SEV-2 polish-tier audit fixes.

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const report = [];
function check(label, predicate) {
  const ok = !!predicate;
  if (ok) pass++; else fail++;
  report.push({ label, ok });
}

// ─── A: og:image on 8 affected pages ───
// Pages that set their own openGraph block must include DEFAULT_OG_IMAGES
// (root layout's default isn't inherited when child sets openGraph).
const OG_PAGES = [
  "app/privacy/page.tsx",
  "app/terms/page.tsx",
  "app/refund-policy/page.tsx",
  "app/cancellation-policy/page.tsx",
  "app/dpa/page.tsx",
  "app/help/page.tsx",
  "app/blog/page.tsx",
  "app/pricing/page.tsx",
];
for (const path of OG_PAGES) {
  const src = readFileSync(path, "utf8");
  check(
    `A.${path}: imports DEFAULT_OG_IMAGES`,
    /import\s*\{\s*DEFAULT_OG_IMAGES\s*\}\s*from\s*"@\/lib\/og-defaults"/.test(src)
  );
  check(
    `A.${path}: openGraph block includes images: DEFAULT_OG_IMAGES`,
    /openGraph:\s*\{[\s\S]*?images:\s*DEFAULT_OG_IMAGES/.test(src)
  );
}

// ─── B: helper itself ───
const OG_HELPER = readFileSync("lib/og-defaults.ts", "utf8");
check("B1: DEFAULT_OG_IMAGES exports array with /og.png", /url:\s*"\/og\.png"/.test(OG_HELPER));
check("B2: alt text present", /alt:/.test(OG_HELPER));

const PAGE_META = readFileSync("lib/page-metadata.ts", "utf8");
check(
  "B3: pageMetadata helper also injects DEFAULT_OG_IMAGES (for helper-using pages)",
  /images:\s*DEFAULT_OG_IMAGES/.test(PAGE_META)
);

// ─── C: cookie banner a11y role fix ───
const COOKIE = readFileSync("components/compliance/CookieConsent.tsx", "utf8");
check(
  'C1: cookie banner uses role="region" not role="dialog" with aria-modal=false',
  /role="region"/.test(COOKIE) && /aria-live="polite"/.test(COOKIE)
);
check(
  "C2: cookie banner does NOT keep the old aria-modal=false dialog combo",
  // Strip comments first so the audit-fix rationale (which quotes the
  // old form for clarity) doesn't false-positive the check.
  (() => {
    const stripped = COOKIE.replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/[^\n]*/gm, "");
    return !/role="dialog"\s+aria-modal="false"/.test(stripped);
  })()
);

// ─── D: session maxAge + updateAge ───
const AUTH_CONFIG = readFileSync("auth.config.ts", "utf8");
check(
  "D1: session.maxAge set (14 days)",
  /maxAge:\s*14\s*\*\s*24\s*\*\s*60\s*\*\s*60/.test(AUTH_CONFIG)
);
check(
  "D2: session.updateAge set (1 day sliding refresh)",
  /updateAge:\s*24\s*\*\s*60\s*\*\s*60/.test(AUTH_CONFIG)
);

// ─── E: buildResetUrl host-header hardening ───
const FORGOT = readFileSync("app/api/auth/forgot-password/route.ts", "utf8");
check(
  "E1: host-derived fallback restricted to localhost regex",
  /\^https\?:\\\/\\\/\(localhost\|127\\\.0\\\.0\\\.1\|0\\\.0\\\.0\\\.0\)/.test(FORGOT)
);
check(
  "E2: non-localhost host emits relative URL with warning",
  /emitting relative URL to avoid Host-header spoof/.test(FORGOT)
);

// ─── F: /api/health AI gating ───
const HEALTH = readFileSync("app/api/health/route.ts", "utf8");
check(
  "F1: /api/health gates AI detail behind x-cron-secret header",
  /req\.headers\.get\("x-cron-secret"\)/.test(HEALTH)
);
check(
  "F2: anonymous callers see only { configured: boolean }",
  /authorized\s*\?\s*aiFull\s*:\s*\{\s*configured:\s*aiFull\.configured\s*\}/.test(HEALTH)
);

// ─── G: SMTP boot-time warning ───
const SMTP = readFileSync("lib/auth/smtp.ts", "utf8");
check(
  "G1: emits one-time startup warning when SMTP_PASS missing",
  /SMTP_PASS is unset or empty at boot/.test(SMTP)
);
check(
  "G2: warning suppressed in NODE_ENV=test",
  /NODE_ENV !== "test"/.test(SMTP)
);

console.log("sev2-fixes:");
for (const r of report) console.log(`  ${r.ok ? "✓" : "✗"} ${r.label}`);
console.log(`sev2-fixes: ${pass} passed, ${fail} failed (of ${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
