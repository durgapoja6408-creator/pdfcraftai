#!/usr/bin/env node
/**
 * test-post-deploy-verify.mjs (#147/#148, 2026-06-08): contract guard for the
 * one-click post-deploy verification system.
 *
 * Static-parse only. Pins the invariants that make the verifier TRUSTWORTHY:
 *
 *   A  Workflow triggers: one-click dispatch (+ inputs) + weekly cron.
 *   B  The health-gate — the whole point — waits for the new SHA to be live
 *      AND stable before testing (the documented deploy-window trap).
 *   C  It runs the prod-E2E suite and the AI leg is gated (cost control).
 *   D  It NEVER runs signup/payment MUTATIONS (those need the global test.env
 *      window) — so the verifier needs no prod-security weakening.
 *   E  Failure alert (Slack) gated on failure + webhook present.
 *   F  The refill route is cron-secret gated, env-scoped, idempotent, free.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(msg);
  }
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

// ──────────────────────────────────────────────────────────────────
// Workflow: .github/workflows/post-deploy-verify.yml
// ──────────────────────────────────────────────────────────────────
{
  const rel = ".github/workflows/post-deploy-verify.yml";
  assert(exists(rel), `${rel} must exist`);
  const wf = read(rel);

  // A — triggers
  assert(/workflow_dispatch:/.test(wf), "A: one-click workflow_dispatch");
  assert(/include_ai:/.test(wf), "A: include_ai input (AI leg toggle)");
  assert(/schedule:/.test(wf) && /cron:\s*"[^"]+"/.test(wf), "A: weekly cron schedule");
  assert(/concurrency:/.test(wf), "A: concurrency guard (no overlapping verifications)");

  // B — the health-gate (the reason this workflow exists)
  assert(/\/api\/health/.test(wf), "B: polls /api/health");
  assert(/EXPECT_SHA|EXPECT_SHA:|expected SHA/i.test(wf), "B: waits for an expected commit SHA");
  assert(/"commit":/.test(wf) || /commit=/.test(wf), "B: parses the deployed commit");
  assert(/uptimeSec|uptime/.test(wf), "B: checks process uptime (not a fresh-flapped worker)");
  assert(/stable/.test(wf) && /-ge 2|>= ?2|2 consecutive/.test(wf), "B: requires consecutive stable reads");
  assert(/::error::/.test(wf), "B: fails loudly if the deploy never lands");
  // The gate must run BEFORE the test suite.
  assert(
    wf.indexOf("Wait for the new build") < wf.indexOf("npm run test:prod-e2e"),
    "B: health-gate runs before the test suite",
  );

  // C — runs the suite, AI leg gated
  assert(/npm run test:prod-e2e/.test(wf), "C: runs the prod-E2E suite");
  assert(/PROD_E2E_AI_BUDGET_OK:/.test(wf), "C: wires the AI-budget ack");
  assert(
    /steps\.scope\.outputs\.ai == 'on'[\s\S]{0,80}PROD_E2E_AI_BUDGET_OK|PROD_E2E_AI_BUDGET_OK:\s*\$\{\{\s*steps\.scope\.outputs\.ai/.test(wf),
    "C: AI leg only when scope == on (cost control)",
  );
  assert(/PROD_E2E_TEST_EMAIL:/.test(wf) && /PROD_E2E_ADMIN_OK:/.test(wf), "C: auth + admin-read legs wired");

  // D — never runs signup/payment MUTATIONS (no global weakening needed)
  assert(!/PROD_E2E_PAYMENTS_OK/.test(wf), "D: does NOT inject PROD_E2E_PAYMENTS_OK (no checkout mutation)");
  assert(!/PROD_E2E_SIGNUP_OK/.test(wf), "D: does NOT inject PROD_E2E_SIGNUP_OK (no signup mutation)");

  // E — failure alert
  assert(/SLACK_WEBHOOK_URL:\s*\$\{\{\s*secrets\.SLACK_WEBHOOK_URL\s*\}\}/.test(wf), "E: job-level Slack env for the if: gate");
  assert(/if:\s*failure\(\)\s*&&\s*env\.SLACK_WEBHOOK_URL\s*!=\s*''/.test(wf), "E: alert gated on failure + configured webhook");
  assert(/upload-artifact@v4/.test(wf) && /retention-days:/.test(wf), "E: uploads the Playwright report with retention");
}

// ──────────────────────────────────────────────────────────────────
// Refill route: app/api/cron/refill-test-credits/route.ts
// ──────────────────────────────────────────────────────────────────
{
  const rel = "app/api/cron/refill-test-credits/route.ts";
  assert(exists(rel), `${rel} must exist`);
  const src = read(rel);

  assert(/^import "server-only";/m.test(src), "F: server-only");
  assert(/export const runtime = "nodejs"/.test(src), "F: nodejs runtime (DB + grantCredits)");
  assert(/export async function GET\(/.test(src), "F: GET handler");
  // Cron-secret gated, header-only, fail-closed.
  assert(/timingSafeStrEqual/.test(src), "F: constant-time secret compare");
  assert(/x-cron-secret/.test(src), "F: reads x-cron-secret header");
  assert(/expected\.length < 16/.test(src), "F: fails closed on unset/short CRON_SECRET");
  assert(!/searchParams\.get|nextUrl\.searchParams|[?&]secret=/.test(src), "F: no query-string secret read (logs leak)");
  // Env-scoped targets, no-op when unset — can never grant to an arbitrary user.
  assert(/E2E_REFILL_USER_IDS/.test(src), "F: targets from E2E_REFILL_USER_IDS");
  assert(/ids\.length === 0/.test(src) && /configured: false/.test(src), "F: no-op when no targets configured");
  // Only grants below the floor, via the idempotent helper, per-day key.
  assert(/balance >= floor/.test(src), "F: skips users already above the floor");
  assert(/grantCredits\(/.test(src), "F: uses the idempotent grantCredits helper");
  assert(/e2e_refill:\$\{userId\}:\$\{day\}/.test(src), "F: per-UTC-day idempotency key (≤ 1 refill/user/day)");
  assert(/reason:\s*"e2e_test_refill"/.test(src), "F: tagged ledger reason for auditability");
}

// ──────────────────────────────────────────────────────────────────
console.log("");
if (failed === 0) {
  console.log(`PASS — ${passed} assertions`);
  console.log(`${passed} passed, 0 failed`);
  process.exit(0);
} else {
  console.error(`FAIL — ${failed} assertion(s) failed:`);
  for (const m of failures) console.error(`  ${m}`);
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
