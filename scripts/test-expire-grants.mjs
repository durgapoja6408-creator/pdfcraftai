#!/usr/bin/env node
/**
 * 2026-05-03 Day 5.5 layer 6 (plan §8) — expire-grants cron contract.
 *
 * Static-parse guard for /api/cron/expire-grants — the nightly sweeper
 * that debits expired signup_bonus rows from credit_ledger so the
 * "valid 7 days" promise is enforced.
 *
 * Output line conforms to the aggregator regex
 * `${name}: ${pass} passed, ${fail} failed`.
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

const ROUTE = path.join(ROOT, "app", "api", "cron", "expire-grants", "route.ts");
const routeSrc = fs.existsSync(ROUTE) ? fs.readFileSync(ROUTE, "utf8") : "";

// ============================================================================
// Section A — Endpoint surface
// ============================================================================

assert(fs.existsSync(ROUTE), "A1: /api/cron/expire-grants/route.ts exists");
assert(/export\s+async\s+function\s+GET/m.test(routeSrc), "A2: GET handler exported");
assert(routeSrc.includes('import "server-only"'), "A3: server-only guard");

// ============================================================================
// Section B — Auth (CRON_SECRET)
// ============================================================================

assert(/CRON_SECRET/.test(routeSrc), "B1: env var name CRON_SECRET");
assert(
  /expected\.length\s*<\s*16/.test(routeSrc),
  "B2: fail-closed if secret missing or trivially short (<16 chars)"
);
assert(
  /x-cron-secret/.test(routeSrc),
  "B3: accepts secret via x-cron-secret header"
);
// 2026-05-12 SEV-1 audit fix: B4 was originally an existence
// assertion ("accepts secret via ?secret="). The query-string
// fallback was removed because query-string secrets end up in
// CDN + access logs. B4 inverted to a non-existence assertion to
// lock the closed gate in place. cron-job.org / Hostinger cron
// MUST send the secret via the `x-cron-secret:` header now.
assert(
  !/searchParams\.get\("secret"\)/.test(routeSrc),
  "B4: rejects ?secret= query param (header-only — query-string secrets leak to access logs)"
);
assert(
  routeSrc.includes('error: "auth_required"'),
  "B5: 401 on missing/wrong secret"
);

// ============================================================================
// Section C — Query correctness
// ============================================================================

assert(
  /eq\(schema\.creditLedger\.reason,\s*"signup_bonus"\)/.test(routeSrc),
  "C1: filters reason = 'signup_bonus'"
);
assert(
  /isNotNull\(schema\.creditLedger\.expiresAt\)/.test(routeSrc),
  "C2: filters expires_at IS NOT NULL"
);
assert(
  /lte\(schema\.creditLedger\.expiresAt,\s*sql`NOW\(3\)`\)/.test(routeSrc),
  "C3: filters expires_at <= NOW(3)"
);
assert(
  /gt\(schema\.creditLedger\.delta,\s*0\)/.test(routeSrc),
  "C4: filters delta > 0 (only positive grants)"
);

// ============================================================================
// Section D — Idempotency + safety
// ============================================================================

assert(
  /idempotencyKey:\s*`signup_bonus_expired:\$\{row\.id\}`/.test(routeSrc),
  "D1: idempotency key per ledger row (re-run safe)"
);
assert(
  /Math\.min\(row\.delta,\s*currentBalance\)/.test(routeSrc),
  "D2: debit clamped to current balance (no negative)"
);
assert(
  /reason:\s*"signup_bonus_expired"/.test(routeSrc),
  "D3: debit ledger row tagged with expired reason"
);
assert(
  /reason:\s*"signup_bonus_expired_noop"/.test(routeSrc),
  "D4: noop variant when balance was already 0 (audit trail)"
);

// ============================================================================
// Section E — Per-row error handling
// ============================================================================

assert(
  /try\s*\{[\s\S]*?\}\s*catch/.test(routeSrc),
  "E1: per-row try/catch (single failures don't abort sweep)"
);
assert(
  /errors\+\+/.test(routeSrc),
  "E2: error counter for ops monitoring"
);
assert(
  /event:\s*"expire_grants_run"/.test(routeSrc),
  "E3: structured stdout log for ops review"
);

// ============================================================================
// Section F — Response shape
// ============================================================================

assert(
  /examined:\s*expiredRows\.length/.test(routeSrc),
  "F1: response includes examined count"
);
assert(
  /expired,\s*\n\s*skipped,\s*\n\s*errors,/.test(routeSrc),
  "F2: response includes expired + skipped + errors counters"
);

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(`expire-grants: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
