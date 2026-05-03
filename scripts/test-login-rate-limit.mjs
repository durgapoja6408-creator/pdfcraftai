#!/usr/bin/env node
/**
 * 2026-05-03 Day 1.5a Phase C (plan §8a) — login rate limit contract.
 *
 * Static-parse guard for:
 *   1. db/migrations/0020_failed_login_attempts.sql
 *   2. db/schema/auth.ts:failedLoginAttempts
 *   3. lib/auth/login-rate-limit.ts — checkLockout / recordFailure /
 *      clearFailures / gcExpired
 *   4. auth.ts authorize() wire-in (lockout check before bcrypt,
 *      record failure on bad path, clear on success)
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

const MIGRATION = path.join(ROOT, "db", "migrations", "0020_failed_login_attempts.sql");
const SCHEMA = path.join(ROOT, "db", "schema", "auth.ts");
const HELPER = path.join(ROOT, "lib", "auth", "login-rate-limit.ts");
const AUTH = path.join(ROOT, "auth.ts");

const migrationSrc = fs.readFileSync(MIGRATION, "utf8");
const schemaSrc = fs.readFileSync(SCHEMA, "utf8");
const helperSrc = fs.readFileSync(HELPER, "utf8");
const authSrc = fs.readFileSync(AUTH, "utf8");

// ============================================================================
// Section A — Migration
// ============================================================================

assert(migrationSrc.includes("CREATE TABLE `failed_login_attempts`"), "A1: table created");
assert(/`email_normalized`\s+varchar\(254\)\s+NOT NULL/.test(migrationSrc), "A2: email_normalized column");
assert(/`ip`\s+varchar\(45\)/.test(migrationSrc), "A3: IPv6-safe ip column");
assert(/`attempted_at`\s+timestamp\(3\)/.test(migrationSrc), "A4: attempted_at column");
assert(/CREATE INDEX `failed_login_attempts_email_idx`/.test(migrationSrc), "A5: email+time index");
assert(/CREATE INDEX `failed_login_attempts_ip_idx`/.test(migrationSrc), "A6: ip+time index");
assert(/CREATE INDEX `failed_login_attempts_gc_idx`/.test(migrationSrc), "A7: GC index");

// ============================================================================
// Section B — Drizzle schema parity
// ============================================================================

assert(/export const failedLoginAttempts = mysqlTable/.test(schemaSrc), "B1: failedLoginAttempts exported");
assert(/emailNormalized:\s*varchar\("email_normalized"/.test(schemaSrc), "B2: emailNormalized column");
assert(/ip:\s*varchar\("ip"/.test(schemaSrc), "B3: ip column");
assert(/attemptedAt:\s*timestamp\("attempted_at"/.test(schemaSrc), "B4: attemptedAt column");

// ============================================================================
// Section C — Helper surface
// ============================================================================

assert(/export\s+async\s+function\s+checkLockout/.test(helperSrc), "C1: checkLockout exported");
assert(/export\s+async\s+function\s+recordFailure/.test(helperSrc), "C2: recordFailure exported");
assert(/export\s+async\s+function\s+clearFailures/.test(helperSrc), "C3: clearFailures exported");
assert(/export\s+async\s+function\s+gcExpired/.test(helperSrc), "C4: gcExpired exported");
assert(/DEFAULT_MAX_FAILURES\s*=\s*5/.test(helperSrc), "C5: default max failures = 5");
assert(/DEFAULT_WINDOW_MINUTES\s*=\s*15/.test(helperSrc), "C6: default window = 15 min");
assert(/DEFAULT_LOCKOUT_MINUTES\s*=\s*30/.test(helperSrc), "C7: default lockout = 30 min");
assert(/LOGIN_MAX_FAILURES/.test(helperSrc), "C8: env override for max failures");
assert(/LOGIN_WINDOW_MINUTES/.test(helperSrc), "C9: env override for window");
assert(/LOGIN_LOCKOUT_MINUTES/.test(helperSrc), "C10: env override for lockout");

// ============================================================================
// Section D — auth.ts authorize() wire-in
// ============================================================================

assert(authSrc.includes("checkLockout"), "D1: imports checkLockout");
assert(authSrc.includes("recordFailure"), "D2: imports recordFailure");
assert(authSrc.includes("clearFailures"), "D3: imports clearFailures");
assert(authSrc.includes("normalizeEmail"), "D4: imports normalizeEmail (for lockout key)");

// Lockout check fires BEFORE bcrypt.compare.
const lockoutIdx = authSrc.indexOf("checkLockout(");
const bcryptIdx = authSrc.indexOf("bcrypt.compare(");
assert(
  lockoutIdx > 0 && bcryptIdx > 0 && lockoutIdx < bcryptIdx,
  "D5: checkLockout fires before bcrypt.compare (saves CPU on locked accounts)",
);

// Record failure on user-not-found path.
const userNotFoundBlock = authSrc.match(
  /if\s*\(!user[\s\S]*?recordFailure\(normalizedEmail,\s*clientIp\)/,
);
assert(userNotFoundBlock, "D6: failures recorded on user-not-found path (anti-enumeration)");

// Record failure on wrong-password path.
const wrongPwBlock = authSrc.match(
  /if\s*\(!ok\)\s*\{[\s\S]*?recordFailure\(normalizedEmail,\s*clientIp\)/,
);
assert(wrongPwBlock, "D7: failures recorded on wrong-password path");

// Clear failures on success.
assert(
  /clearFailures\(normalizedEmail\)/.test(authSrc),
  "D8: clearFailures called after successful authorize",
);

// Lockout returns null (matches wrong-password response — anti-enumeration).
assert(
  /if\s*\(lockout\.locked\)\s*\{[\s\S]*?return\s+null/.test(authSrc),
  "D9: locked state returns null (no enumeration via response shape)",
);

// Structured log on lockout for /admin/abuse-signals.
assert(
  /event:\s*"credentials_lockout"/.test(authSrc),
  "D10: structured log on lockout for ops review",
);

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(`login-rate-limit: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
