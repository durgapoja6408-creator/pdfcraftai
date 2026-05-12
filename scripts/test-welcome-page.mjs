#!/usr/bin/env node
// scripts/test-welcome-page.mjs
//
// 2026-05-12 — CI guard for PENDING_WORK_ANALYSIS §7c (first-time
// user welcome page). Locks in the structural invariants so future
// refactors fail loudly if they regress the gap closure.
//
// Sections:
//   A — welcome page file exists + has the eight curated tools
//   B — cookie-keyed greeting variants (first-visit vs return)
//   C — MarkWelcomeSeen client component sets cookie correctly
//   D — verify-email post-success routes to /app/welcome (not
//       /app/dashboard) — the gap-closure assertion
//   E — defense-in-depth: page calls auth() and redirects no-session
//       to /login with callbackUrl
//
// Run via aggregator (scripts/run-all-tests.mjs).

import { readFileSync } from "node:fs";

const PAGE_PATH = "app/app/welcome/page.tsx";
const MARK_PATH = "app/app/welcome/MarkWelcomeSeen.tsx";
const CONSTANTS_PATH = "app/app/welcome/constants.ts";
const VERIFY_PATH = "app/verify-email/CodeEntryForm.tsx";
const DASHBOARD_PATH = "app/app/dashboard/page.tsx";

const PAGE = readFileSync(PAGE_PATH, "utf8");
const MARK = readFileSync(MARK_PATH, "utf8");
const CONSTANTS = readFileSync(CONSTANTS_PATH, "utf8");
const VERIFY = readFileSync(VERIFY_PATH, "utf8");
const DASHBOARD = readFileSync(DASHBOARD_PATH, "utf8");

let pass = 0;
let fail = 0;
const report = [];

function check(label, predicate) {
  const ok = !!predicate;
  if (ok) pass++;
  else fail++;
  report.push({ label, ok });
}

// ─── Section A: welcome page exists + has the eight curated tools ───
check("A1: welcome page file present", PAGE.length > 0);
check(
  "A2: WELCOME_TOOLS array exported / declared",
  /const WELCOME_TOOLS:\s*Array<\{/.test(PAGE)
);
// 2026-05-12 SEV-0 audit fix: pdf-to-word was renamed to pdf-to-text
// because the prior card was a bait-and-switch (clicked /pdf-to-word,
// landed on /tool/pdf-to-text which is a plain-text extractor, not a
// Word converter). Card now matches what the tool actually does. See
// page.tsx for the full rationale.
const expectedToolIds = [
  "merge",
  "ai-summarize",
  "split",
  "ai-translate",
  "pdf-to-text",
  "ai-chat",
  "unlock",
  "ai-sign",
];
for (const id of expectedToolIds) {
  check(`A3.${id}: tool "${id}" present`, new RegExp(`id:\\s*"${id}"`).test(PAGE));
}
check(
  "A4: page is a default-export React server component",
  /export default async function WelcomePage\(\)/.test(PAGE)
);
check(
  "A5: metadata robots:index=false (gated page, not search-indexed)",
  /robots:\s*\{\s*index:\s*false/.test(PAGE)
);
check(
  "A6: dynamic = 'force-dynamic' (auth state per request)",
  /export const dynamic\s*=\s*"force-dynamic"/.test(PAGE)
);
check(
  "A7: 'Continue to Dashboard' CTA present (explicit skip)",
  /Continue to Dashboard/.test(PAGE)
);
check(
  "A8: 'See all' tools link points to /tools (catalog)",
  /href="\/tools"/.test(PAGE)
);

// ─── Section B: cookie-keyed greeting variants ───
// WELCOME_SEEN_COOKIE lives in ./constants.ts (not page.tsx) because
// Next.js App Router restricts page exports. CI verifies the constant
// is defined in the constants module and imported into the page.
check(
  "B1a: WELCOME_SEEN_COOKIE defined in ./constants.ts as 'pcai_seen_welcome'",
  /export const WELCOME_SEEN_COOKIE\s*=\s*"pcai_seen_welcome"/.test(CONSTANTS)
);
check(
  "B1b: page imports WELCOME_SEEN_COOKIE from ./constants",
  /import\s*\{\s*WELCOME_SEEN_COOKIE\s*\}\s*from\s*"\.\/constants"/.test(PAGE)
);
check(
  "B1c: page.tsx does NOT re-export WELCOME_SEEN_COOKIE (next-page-exports guard)",
  !/export const WELCOME_SEEN_COOKIE/.test(PAGE)
);
check(
  "B2: page reads cookies() from next/headers",
  /import\s*\{\s*cookies\s*\}\s*from\s*"next\/headers"/.test(PAGE)
);
check(
  "B3: hasSeenBefore derived from cookie value === '1'",
  /cookieStore\.get\(WELCOME_SEEN_COOKIE\)\?\.value\s*===\s*"1"/.test(PAGE)
);
check(
  "B4: first-visit greeting uses 'Welcome, ' format",
  /`Welcome, \$\{firstName\}!`/.test(PAGE)
);
check(
  "B5: return-visit greeting uses 'Welcome back, ' format",
  /`Welcome back, \$\{firstName\}\.`/.test(PAGE)
);

// ─── Section C: MarkWelcomeSeen client component ───
check("C1: MarkWelcomeSeen file exists", MARK.length > 0);
check(
  "C2: declared 'use client'",
  /^"use client";/m.test(MARK)
);
check(
  "C3: imports useEffect from react",
  /import\s*\{\s*useEffect\s*\}\s*from\s*"react"/.test(MARK)
);
check(
  "C4: sets cookie with correct name 'pcai_seen_welcome=1'",
  /pcai_seen_welcome=1/.test(MARK)
);
check(
  "C5: cookie has 1-year max-age (31536000 seconds)",
  /max-age=31536000/.test(MARK)
);
check(
  "C6: cookie has path=/ (available site-wide)",
  /path=\//.test(MARK)
);
check(
  "C7: cookie has samesite=lax (default-but-explicit)",
  /samesite=lax/.test(MARK)
);
check(
  "C8: page imports MarkWelcomeSeen from local module",
  /import\s*\{\s*MarkWelcomeSeen\s*\}\s*from\s*"\.\/MarkWelcomeSeen"/.test(PAGE)
);
check(
  "C9: page renders <MarkWelcomeSeen /> for client-side cookie set",
  /<MarkWelcomeSeen\s*\/>/.test(PAGE)
);

// ─── Section D: verify-email post-success redirects to /app/welcome ───
check(
  "D1: verify-email pushes to /app/welcome (gap-closure assertion)",
  /router\.push\("\/app\/welcome"\)/.test(VERIFY)
);
check(
  "D2: verify-email does NOT push directly to /app/dashboard",
  !/router\.push\("\/app\/dashboard"\)/.test(VERIFY)
);
check(
  "D3: comment cites §7c rationale for the redirect change",
  /§7c/.test(VERIFY) || /PENDING_WORK_ANALYSIS/.test(VERIFY)
);

// ─── Section E: defense-in-depth ───
check(
  "E1: page imports auth from @/auth",
  /import\s*\{\s*auth\s*\}\s*from\s*"@\/auth"/.test(PAGE)
);
check(
  "E2: page imports redirect from next/navigation",
  /import\s*\{\s*redirect\s*\}\s*from\s*"next\/navigation"/.test(PAGE)
);
check(
  "E3: no-session redirects to /login with callbackUrl=/app/welcome",
  /redirect\("\/login\?callbackUrl=\/app\/welcome"\)/.test(PAGE)
);

// ─── Section F: dashboard re-engagement link ───
// Google OAuth users skip /verify-email and land directly on
// /app/dashboard, so they never trigger the post-verify redirect to
// /app/welcome. Without a dashboard CTA pointing at /app/welcome,
// OAuth-onboarded users have no surface that suggests the curated
// tool page exists. F1/F2 lock in the "Pick a tool" secondary CTA
// in the dashboard's "No files yet" empty state.
check(
  "F1: dashboard empty state links to /app/welcome",
  /href="\/app\/welcome"/.test(DASHBOARD)
);
check(
  "F2: dashboard empty state has 'Pick a tool' label on the link",
  /Pick a tool/.test(DASHBOARD)
);

// ─── Report ───
console.log("welcome-page:");
for (const r of report) {
  console.log(`  ${r.ok ? "✓" : "✗"} ${r.label}`);
}
const total = pass + fail;
console.log(`welcome-page: ${pass} passed, ${fail} failed (of ${total})`);
process.exit(fail === 0 ? 0 : 1);
