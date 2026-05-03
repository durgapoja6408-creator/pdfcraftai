#!/usr/bin/env node
/**
 * 2026-05-02 Day 6 prep (plan §8 layer 6) — signup-bonus helper contract.
 *
 * Static-parse + cross-file invariant guard for:
 *   1. lib/payments/signup-bonus.ts:grantSignupBonus()
 *   2. lib/payments/ledger.ts:grantCredits() expiresAt threading
 *   3. db/schema/app.ts:creditLedger.expiresAt column
 *   4. db/migrations/0019_credit_ledger_expiry.sql
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

const SIGNUP = path.join(ROOT, "lib", "payments", "signup-bonus.ts");
const LEDGER = path.join(ROOT, "lib", "payments", "ledger.ts");
const SCHEMA = path.join(ROOT, "db", "schema", "app.ts");
const MIGRATION = path.join(ROOT, "db", "migrations", "0019_credit_ledger_expiry.sql");

const signupSrc = fs.readFileSync(SIGNUP, "utf8");
const ledgerSrc = fs.readFileSync(LEDGER, "utf8");
const schemaSrc = fs.readFileSync(SCHEMA, "utf8");
const migrationSrc = fs.readFileSync(MIGRATION, "utf8");

// ============================================================================
// Section A — grantSignupBonus surface
// ============================================================================

assert(
  /export\s+async\s+function\s+grantSignupBonus/m.test(signupSrc),
  "A1: grantSignupBonus exported"
);
assert(
  /export\s+function\s+isSignupGrantEnabled/m.test(signupSrc),
  "A2: isSignupGrantEnabled exported"
);
assert(
  /SIGNUP_GRANT_ENABLED/m.test(signupSrc),
  "A3: feature flag env var name"
);
assert(
  /SIGNUP_GRANT_CREDITS/m.test(signupSrc),
  "A4: credits env var override"
);
assert(
  /SIGNUP_GRANT_TTL_DAYS/m.test(signupSrc),
  "A5: TTL env var override"
);
assert(
  /DEFAULT_SIGNUP_GRANT_CREDITS\s*=\s*5/m.test(signupSrc),
  "A6: default credits = 5 (plan §2 path D)"
);
assert(
  /DEFAULT_SIGNUP_GRANT_TTL_DAYS\s*=\s*7/m.test(signupSrc),
  "A7: default TTL = 7 days (plan §8 layer 6)"
);

// ============================================================================
// Section B — Idempotency + safety
// ============================================================================

assert(
  /idempotencyKey:\s*`signup_bonus:\$\{userId\}`/m.test(signupSrc),
  "B1: idempotency key is signup_bonus:${userId} (one grant per user, ever)"
);
assert(
  /reason:\s*"signup_bonus"/m.test(signupSrc),
  "B2: ledger reason is 'signup_bonus'"
);
assert(
  signupSrc.includes("import \"server-only\""),
  "B3: server-only guard"
);
assert(
  /process\.env\.SIGNUP_GRANT_ENABLED\s*===\s*"true"/m.test(signupSrc),
  "B4: feature flag default-OFF (only 'true' enables)"
);

// ============================================================================
// Section C — grantCredits expiresAt threading
// ============================================================================

assert(
  /expiresAt\?:\s*Date/.test(ledgerSrc),
  "C1: GrantCreditsInput.expiresAt typed as optional Date"
);
assert(
  /expiresAt:\s*input\.expiresAt\s*\?\?\s*null/.test(ledgerSrc),
  "C2: grantCredits writes expiresAt to ledger row (?? null fallback)"
);

// ============================================================================
// Section D — Drizzle schema + migration parity
// ============================================================================

assert(
  /expiresAt:\s*timestamp\("expires_at"/.test(schemaSrc),
  "D1: schema declares expiresAt column"
);
assert(
  /expiresIdx:\s*index\("credit_ledger_expires_idx"\)\.on\(t\.expiresAt,\s*t\.delta\)/.test(
    schemaSrc
  ),
  "D2: schema declares (expires_at, delta) covering index"
);
assert(
  migrationSrc.includes("ADD COLUMN `expires_at` datetime(3) NULL"),
  "D3: migration adds expires_at column"
);
assert(
  migrationSrc.includes(
    "CREATE INDEX `credit_ledger_expires_idx` ON `credit_ledger` (`expires_at`, `delta`)"
  ),
  "D4: migration creates the covering index"
);
assert(
  !/\bNOT\s+NULL\b/i.test(
    migrationSrc.replace(/--[^\n]*/g, "")
  ),
  "D5: migration is additive (column nullable, no NOT NULL on existing cols)"
);

// ============================================================================
// Section E — Cross-file consistency
// ============================================================================

// signup-bonus.ts MUST import grantCredits.
assert(
  /import\s+\{\s*grantCredits\s*\}\s+from\s+"@\/lib\/payments\/ledger"/m.test(
    signupSrc
  ),
  "E1: signup-bonus.ts imports grantCredits"
);

// Calls grantCredits with expiresAt prop.
assert(
  /expiresAt,\s*\}/m.test(signupSrc),
  "E2: signup-bonus.ts passes expiresAt to grantCredits"
);

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(`signup-bonus: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
