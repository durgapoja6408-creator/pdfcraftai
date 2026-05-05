#!/usr/bin/env node
/**
 * 2026-05-05 — Referrals foundation guard (PENDING §3e).
 *
 * Locks invariants that the storage + helper layer for the referral
 * program depends on. Catches the same class of regressions that the
 * feature-flags / quality-signal / dunning guards catch:
 *
 *   - Migration 0024 drops or modifies a column the schema reads
 *   - Drizzle schema diverges from migration column types
 *   - Helper module loses its public surface (rename / accidental
 *     internal-only)
 *   - Code generator alphabet shrinks below safe namespace size
 *   - Admin viewer drops the read-only constraint (e.g. someone adds a
 *     POST handler that writes back)
 *
 * Pure static parse — no DB, no runtime. Sub-second.
 *
 * Output line conforms to aggregator regex:
 *   `${name}: ${pass} passed, ${fail} failed`.
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

const MIGRATION = path.join(ROOT, "db/migrations/0024_referrals.sql");
const SCHEMA = path.join(ROOT, "db/schema/app.ts");
const CODES = path.join(ROOT, "lib/referrals/codes.ts");
const QUERIES = path.join(ROOT, "lib/referrals/queries.ts");
const ADMIN_PAGE = path.join(ROOT, "app/admin/referrals/page.tsx");

// ---------------------------------------------------------------------------
// Section A: migration shape
// ---------------------------------------------------------------------------

assert(fs.existsSync(MIGRATION), "A1: migration 0024_referrals.sql exists");
const migrationSrc = fs.readFileSync(MIGRATION, "utf8");

// Strip SQL line comments + block comments so DROP/MODIFY guards don't
// false-positive on commentary.
function stripSqlComments(src) {
  return src
    .replace(/^\s*--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}
const migrationExec = stripSqlComments(migrationSrc);

assert(
  /CREATE TABLE\s+`referral_codes`/.test(migrationExec),
  "A2: migration creates referral_codes table",
);
assert(
  /CREATE TABLE\s+`referral_signups`/.test(migrationExec),
  "A3: migration creates referral_signups table",
);
assert(
  /UNIQUE\s*\(\s*`user_id`\s*\)/.test(migrationExec),
  "A4: referral_codes has UNIQUE(user_id) — one code per user",
);
assert(
  /UNIQUE\s*\(\s*`code`\s*\)/.test(migrationExec),
  "A5: referral_codes has UNIQUE(code) — codes don't collide across users",
);
assert(
  /UNIQUE\s*\(\s*`referred_user_id`\s*\)/.test(migrationExec),
  "A6: referral_signups has UNIQUE(referred_user_id) — first-touch attribution",
);
assert(
  /CREATE INDEX\s+`referral_signups_referrer_created_idx`/.test(migrationExec),
  "A7: leaderboard index (referrer_user_id, created_at) exists",
);
assert(
  /CREATE INDEX\s+`referral_signups_created_idx`/.test(migrationExec),
  "A8: chronological index (created_at) exists",
);

// Reward state is on the signup row itself (not a separate table).
for (const col of [
  "referrer_rewarded_at",
  "referred_rewarded_at",
  "referrer_credit_ledger_id",
  "referred_credit_ledger_id",
]) {
  assert(
    new RegExp(`\`${col}\``).test(migrationExec),
    `A9.${col}: referral_signups has \`${col}\` column`,
  );
}

// Defensive: no DROP / MODIFY / CHANGE in executable SQL. Additive only.
for (const verb of ["DROP TABLE", "DROP COLUMN", "MODIFY", "CHANGE"]) {
  assert(
    !new RegExp(`\\b${verb}\\b`).test(migrationExec),
    `A10.${verb.replace(/\s/g, "_")}: migration has no ${verb} (additive-only)`,
  );
}

// ---------------------------------------------------------------------------
// Section B: Drizzle schema parity with migration
// ---------------------------------------------------------------------------

assert(fs.existsSync(SCHEMA), "B1: db/schema/app.ts exists");
const schemaSrc = fs.readFileSync(SCHEMA, "utf8");

assert(
  /export\s+const\s+referralCodes\s*=\s*mysqlTable\(\s*"referral_codes"/.test(
    schemaSrc,
  ),
  "B2: referralCodes is exported from app.ts",
);
assert(
  /export\s+const\s+referralSignups\s*=\s*mysqlTable\(\s*"referral_signups"/.test(
    schemaSrc,
  ),
  "B3: referralSignups is exported from app.ts",
);

// Each table block: extract from the export keyword to the next export
// (or end-of-file) so per-column regex can scope correctly. Cheap
// boundary detection: from `export const referralCodes` through the
// next `export const ` or end of file.
function extractBlock(src, exportName) {
  const start = src.indexOf(`export const ${exportName}`);
  if (start === -1) return null;
  const after = src.slice(start);
  const nextExport = after.indexOf("\nexport const ", 1);
  return nextExport === -1 ? after : after.slice(0, nextExport);
}

const codesBlock = extractBlock(schemaSrc, "referralCodes");
assert(codesBlock !== null, "B4: extracted referralCodes block");
if (codesBlock) {
  assert(
    /id:\s*varchar\("id",\s*\{\s*length:\s*36\s*\}\)\.primaryKey\(\)/.test(
      codesBlock,
    ),
    "B5: referralCodes.id is varchar(36) primaryKey",
  );
  assert(
    /userId:\s*varchar\("user_id",\s*\{\s*length:\s*255\s*\}\)\.notNull\(\)/.test(
      codesBlock,
    ),
    "B6: referralCodes.userId is varchar(255) notNull",
  );
  assert(
    /code:\s*varchar\("code",\s*\{\s*length:\s*16\s*\}\)\.notNull\(\)/.test(
      codesBlock,
    ),
    "B7: referralCodes.code is varchar(16) notNull",
  );
  assert(
    /uniqueIndex\("referral_codes_user_id_unique"\)/.test(codesBlock),
    "B8: referralCodes has user_id_unique index",
  );
  assert(
    /uniqueIndex\("referral_codes_code_unique"\)/.test(codesBlock),
    "B9: referralCodes has code_unique index",
  );
}

const signupsBlock = extractBlock(schemaSrc, "referralSignups");
assert(signupsBlock !== null, "B10: extracted referralSignups block");
if (signupsBlock) {
  for (const col of [
    "referrerUserId",
    "referredUserId",
    "code",
    "referrerRewardedAt",
    "referredRewardedAt",
    "referrerCreditLedgerId",
    "referredCreditLedgerId",
  ]) {
    assert(
      new RegExp(`${col}:`).test(signupsBlock),
      `B11.${col}: referralSignups has ${col} field`,
    );
  }
  assert(
    /uniqueIndex\(\s*\n?\s*"referral_signups_referred_user_id_unique"/.test(
      signupsBlock,
    ),
    "B12: referralSignups has referred_user_id_unique index",
  );
  assert(
    /index\("referral_signups_referrer_created_idx"\)/.test(signupsBlock),
    "B13: referralSignups has referrer_created composite index",
  );
}

// ---------------------------------------------------------------------------
// Section C: codes.ts public surface
// ---------------------------------------------------------------------------

assert(fs.existsSync(CODES), "C1: lib/referrals/codes.ts exists");
const codesSrc = fs.readFileSync(CODES, "utf8");

assert(
  /export\s+const\s+REFERRAL_CODE_ALPHABET\s*=/.test(codesSrc),
  "C2: REFERRAL_CODE_ALPHABET is exported",
);
assert(
  /export\s+const\s+REFERRAL_CODE_LENGTH\s*=\s*7\b/.test(codesSrc),
  "C3: REFERRAL_CODE_LENGTH is 7",
);
assert(
  /export\s+function\s+generateReferralCode\b/.test(codesSrc),
  "C4: generateReferralCode is exported",
);
assert(
  /export\s+async\s+function\s+getOrCreateReferralCode\b/.test(codesSrc),
  "C5: getOrCreateReferralCode is exported",
);
assert(
  /export\s+async\s+function\s+lookupReferralCode\b/.test(codesSrc),
  "C6: lookupReferralCode is exported",
);

// Alphabet must exclude visually ambiguous chars 0/O/1/I/L. If anyone
// re-introduces them, this catches it.
const alphabetMatch = codesSrc.match(
  /REFERRAL_CODE_ALPHABET\s*=\s*"([^"]+)"/,
);
assert(
  alphabetMatch !== null,
  "C7: alphabet is a quoted string literal",
);
if (alphabetMatch) {
  const alpha = alphabetMatch[1];
  for (const banned of ["0", "O", "1", "I", "L"]) {
    assert(
      !alpha.includes(banned),
      `C8.${banned}: alphabet excludes visually ambiguous "${banned}"`,
    );
  }
  // Also pin the size — a future shrink to <30 chars × 7 = <22B
  // namespace would dramatically increase collision risk.
  assert(
    alpha.length >= 30,
    `C9: alphabet has at least 30 chars (got ${alpha.length})`,
  );
}

// Codes are uppercased on lookup (helper accepts mixed-case input).
assert(
  /\.toUpperCase\(\)/.test(codesSrc),
  "C10: lookupReferralCode upper-cases input for case-insensitive match",
);

// Retry loop with collision tolerance — must catch DUP_ENTRY.
assert(
  /Duplicate entry|ER_DUP_ENTRY/.test(codesSrc),
  "C11: collision retry path catches MySQL duplicate-key errors",
);

// ---------------------------------------------------------------------------
// Section D: queries.ts public surface
// ---------------------------------------------------------------------------

assert(fs.existsSync(QUERIES), "D1: lib/referrals/queries.ts exists");
const queriesSrc = fs.readFileSync(QUERIES, "utf8");

assert(
  /export\s+(?:async\s+)?function\s+listRecentReferralSignups\b/.test(
    queriesSrc,
  ),
  "D2: listRecentReferralSignups is exported",
);
assert(
  /export\s+(?:async\s+)?function\s+loadReferrerStats\b/.test(queriesSrc),
  "D3: loadReferrerStats is exported",
);
assert(
  /export\s+(?:async\s+)?function\s+loadAdminReferralStats\b/.test(queriesSrc),
  "D4: loadAdminReferralStats is exported",
);
assert(
  /export\s+function\s+isReferralsEnabled\b/.test(queriesSrc),
  "D5: isReferralsEnabled is exported",
);

// Env-flag check has the right name. If someone renames the env var
// silently, the admin page header would lie to operators.
assert(
  /process\.env\.REFERRALS_ENABLED/.test(queriesSrc),
  "D6: isReferralsEnabled reads process.env.REFERRALS_ENABLED",
);

// Only writes go through Phase E wiring; this module is read-only
// today. Pin: no `db.insert(...)` / `db.update(...)` / `db.delete(...)`.
for (const verb of [
  "db\\.insert\\(\\s*schema\\.referralSignups",
  "db\\.update\\(\\s*schema\\.referralSignups",
  "db\\.delete\\(\\s*schema\\.referralSignups",
]) {
  assert(
    !new RegExp(verb).test(queriesSrc),
    `D7.${verb}: queries.ts is read-only (no ${verb.replace(/\\\\/g, "")})`,
  );
}

// ---------------------------------------------------------------------------
// Section E: admin page is a Next.js Page (no foreign exports)
// ---------------------------------------------------------------------------

assert(fs.existsSync(ADMIN_PAGE), "E1: app/admin/referrals/page.tsx exists");
const pageSrc = fs.readFileSync(ADMIN_PAGE, "utf8");

assert(
  /export\s+default\s+async\s+function\s+AdminReferralsPage/.test(pageSrc),
  "E2: AdminReferralsPage is the default export",
);
assert(
  /export\s+const\s+dynamic\s*=\s*"force-dynamic"/.test(pageSrc),
  "E3: dynamic = force-dynamic (read-side queries depend on per-request data)",
);
assert(
  /export\s+const\s+runtime\s*=\s*"nodejs"/.test(pageSrc),
  "E4: runtime = nodejs (mysql2 driver requires Node, not Edge)",
);
assert(
  /requireAdmin\(\)/.test(pageSrc),
  "E5: page calls requireAdmin() before rendering",
);

// No write surface on the admin page — it's strictly observational.
assert(
  !/(form\s+action|action="\/api|method="post"|method="POST")/.test(pageSrc),
  "E6: page has no form action / POST surface (read-only invariant)",
);

// ---------------------------------------------------------------------------
// Section F: dynamic execution — generateReferralCode produces valid codes
// ---------------------------------------------------------------------------

// TS-strip-and-eval pattern (mirrors test-feature-flags-foundation.mjs).
// We only need the alphabet, length, and the generator function — all
// pure, all DB-free.
const alphaConstMatch = codesSrc.match(
  /export\s+const\s+REFERRAL_CODE_ALPHABET\s*=\s*"([^"]+)";/,
);
const lengthConstMatch = codesSrc.match(
  /export\s+const\s+REFERRAL_CODE_LENGTH\s*=\s*(\d+);/,
);
const generatorMatch = codesSrc.match(
  /export function generateReferralCode\(\):\s*string\s*\{([\s\S]*?)\n\}/,
);

assert(alphaConstMatch !== null, "F1: extracted alphabet const for dynamic eval");
assert(lengthConstMatch !== null, "F2: extracted length const for dynamic eval");
assert(generatorMatch !== null, "F3: extracted generator function body");

if (alphaConstMatch && lengthConstMatch && generatorMatch) {
  const alpha = alphaConstMatch[1];
  const len = parseInt(lengthConstMatch[1], 10);
  const body = generatorMatch[1];
  // Compile to JS via new Function (TS body has no types after extract).
  let generator;
  try {
    generator = new Function(
      "REFERRAL_CODE_ALPHABET",
      "REFERRAL_CODE_LENGTH",
      `${body}\nreturn out;`,
    );
  } catch (err) {
    failed++;
    failures.push(
      `F4: failed to compile generator body: ${err instanceof Error ? err.message : err}`,
    );
  }
  if (generator) {
    // Generate 200 codes; verify length, alphabet membership, and
    // diversity (first-char distribution should NOT collapse to one
    // character — that would mean the RNG broke).
    const samples = [];
    for (let i = 0; i < 200; i++) {
      try {
        samples.push(generator(alpha, len));
      } catch (err) {
        failed++;
        failures.push(
          `F5: generator threw at iter ${i}: ${err instanceof Error ? err.message : err}`,
        );
        break;
      }
    }
    assert(samples.length === 200, "F6: generated 200 samples without throw");
    assert(
      samples.every((s) => s.length === len),
      `F7: every sample has length ${len}`,
    );
    assert(
      samples.every((s) => [...s].every((c) => alpha.includes(c))),
      "F8: every sample uses only alphabet characters",
    );
    const firstChars = new Set(samples.map((s) => s[0]));
    assert(
      firstChars.size >= 5,
      `F9: first-char distribution has variety (got ${firstChars.size} distinct, want >= 5)`,
    );
    // Codes are random — the chance of any two of 200 codes colliding
    // in a 31^7 ≈ 27.5B namespace is ~7e-7. If the test sees a
    // collision, something's wrong with the RNG, not flake.
    const unique = new Set(samples);
    assert(
      unique.size === samples.length,
      `F10: 200 samples are pairwise unique (got ${unique.size}/200 unique)`,
    );
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(`referrals-foundation: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
