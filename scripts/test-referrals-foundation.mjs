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
// Section H: lib/referrals/writers.ts — Phase E write-side helpers
// ---------------------------------------------------------------------------

const WRITERS = path.join(ROOT, "lib/referrals/writers.ts");
assert(fs.existsSync(WRITERS), "H1: lib/referrals/writers.ts exists");
if (fs.existsSync(WRITERS)) {
  const writersSrc = fs.readFileSync(WRITERS, "utf8");

  // Public surface — all three writers + error class.
  assert(
    /export\s+async\s+function\s+recordReferralSignup\b/.test(writersSrc),
    "H2: recordReferralSignup is exported async",
  );
  assert(
    /export\s+async\s+function\s+grantReferrerReward\b/.test(writersSrc),
    "H3: grantReferrerReward is exported async",
  );
  assert(
    /export\s+async\s+function\s+grantReferredReward\b/.test(writersSrc),
    "H4: grantReferredReward is exported async",
  );
  assert(
    /export\s+class\s+ReferralWriteError\s+extends\s+Error\b/.test(writersSrc),
    "H5: ReferralWriteError class is exported",
  );

  // Flag-gate guard: ALL THREE writers must check isReferralsEnabled
  // before any DB work. Without this, flag-off prod could write into
  // referral_signups via a misconfigured caller.
  for (const fn of [
    "recordReferralSignup",
    "grantReferrerReward",
    "grantReferredReward",
  ]) {
    // Match the function body and look for isReferralsEnabled guard
    // before any db.insert / db.update call.
    const bodyMatch = writersSrc.match(
      new RegExp(
        `export async function ${fn}\\b[\\s\\S]*?\\n\\}\\n`,
      ),
    );
    assert(
      bodyMatch !== null,
      `H6.${fn}: extracted function body for flag-gate check`,
    );
    if (bodyMatch) {
      const body = bodyMatch[0];
      assert(
        /if\s*\(\s*!isReferralsEnabled\(\)\s*\)\s*\{\s*\n?\s*return null/.test(
          body,
        ) || body.includes("return updateRewardSide"),
        `H7.${fn}: function checks !isReferralsEnabled() and returns null when off (or delegates to a flag-gated helper)`,
      );
    }
  }

  // Self-referral guard: catches the case where an attacker passes
  // their own userId as both referrer and referred (would otherwise
  // pass UNIQUE check + appear in admin viewer).
  assert(
    /referrerUserId\s*===\s*referredUserId/.test(writersSrc),
    "H8: writers reject self-referrals (referrerUserId === referredUserId)",
  );
  assert(
    /SELF_REFERRAL/.test(writersSrc),
    "H9: writers throw ReferralWriteError with code SELF_REFERRAL on self-attribution",
  );

  // Race-condition handling on the INSERT path. If two requests for
  // the same referredUserId hit the writer simultaneously, one INSERT
  // succeeds and the other catches ER_DUP_ENTRY. The catch path must
  // re-read and return the winning row's id, not throw.
  assert(
    /Duplicate entry|ER_DUP_ENTRY/.test(writersSrc),
    "H10: writers catch MySQL duplicate-key errors on the INSERT race path",
  );

  // Idempotency on the reward-grant path. Already-rewarded rows
  // must no-op rather than overwriting the timestamp.
  assert(
    /alreadySet|already-rewarded|isNotNull|IS NULL/i.test(writersSrc),
    "H11: reward-grant path checks for already-rewarded state (idempotency)",
  );

  // The shared updateRewardSide helper writes both reward sides via
  // the side parameter. Pin the discriminated update so a refactor
  // that flattens the function doesn't drop the IS NULL re-check
  // inside the WHERE clause.
  assert(
    /side\s*===\s*"referrer"/.test(writersSrc),
    "H12: shared write path branches on side === 'referrer'",
  );
  // IS NULL re-check inside UPDATE prevents lost-update on race
  // between SELECT and UPDATE.
  assert(
    /isNull\(\s*schema\.referralSignups\.referrerRewardedAt\s*\)/.test(
      writersSrc,
    ),
    "H13: UPDATE re-checks IS NULL on referrerRewardedAt (race-safe idempotency)",
  );
  assert(
    /isNull\(\s*schema\.referralSignups\.referredRewardedAt\s*\)/.test(
      writersSrc,
    ),
    "H14: UPDATE re-checks IS NULL on referredRewardedAt (race-safe idempotency)",
  );

  // Writers do NOT touch credit_ledger directly. The reward-grant
  // caller is responsible for that via grantCredits(); this module
  // only marks milestone columns + stores the ledger id for audit.
  // If the writers ever start importing from lib/payments/ledger,
  // it's a bug — credit grants need transactional wrapping that's
  // the caller's responsibility, not ours.
  assert(
    !/from\s+["']@\/lib\/payments\/ledger["']/.test(writersSrc),
    "H15: writers don't import lib/payments/ledger directly (transactional wrapping is the caller's job)",
  );
}

// ---------------------------------------------------------------------------
// Section G: /app/refer user-facing page (PENDING §3e Phase E, 2026-05-05)
// ---------------------------------------------------------------------------

const REFER_PAGE = path.join(ROOT, "app/app/refer/page.tsx");
const REFER_BUTTONS = path.join(ROOT, "app/app/refer/ReferralCopyButtons.tsx");

assert(fs.existsSync(REFER_PAGE), "G1: app/app/refer/page.tsx exists");
assert(
  fs.existsSync(REFER_BUTTONS),
  "G2: app/app/refer/ReferralCopyButtons.tsx exists",
);

if (fs.existsSync(REFER_PAGE)) {
  const referSrc = fs.readFileSync(REFER_PAGE, "utf8");

  assert(
    /export\s+default\s+async\s+function\s+ReferPage/.test(referSrc),
    "G3: ReferPage is the default export",
  );
  assert(
    /export\s+const\s+dynamic\s*=\s*"force-dynamic"/.test(referSrc),
    "G4: dynamic = force-dynamic (lazy-creates code on first visit; per-user)",
  );
  assert(
    /export\s+const\s+runtime\s*=\s*"nodejs"/.test(referSrc),
    "G5: runtime = nodejs (mysql2 driver requires Node)",
  );

  // Auth gate before any DB work
  assert(
    /const\s+session\s*=\s*await\s+auth\(\)/.test(referSrc),
    "G6: page awaits auth() before reading or writing referral data",
  );
  assert(
    /redirect\(\s*"\/login\?callbackUrl=%2Fapp%2Frefer"/.test(referSrc),
    "G7: page redirects to /login with callbackUrl preserving the destination",
  );

  // Helper usage — confirms the page actually wires through to the
  // foundation library, not a separate inline implementation that
  // could drift from the schema.
  assert(
    /getOrCreateReferralCode\s*\(\s*userId\s*\)/.test(referSrc),
    "G8: page calls getOrCreateReferralCode(userId)",
  );
  assert(
    /loadReferrerStats\s*\(\s*userId\s*\)/.test(referSrc),
    "G9: page calls loadReferrerStats(userId)",
  );
  assert(
    /isReferralsEnabled\s*\(\s*\)/.test(referSrc),
    "G10: page checks isReferralsEnabled() to branch enabled/staging copy",
  );

  // Honest staging copy when flag is OFF — without this users see
  // confident "you'll get credits" copy that won't actually pay out
  // until Phase E lands the writers.
  assert(
    /Beta|staging|testing|retroactive/i.test(referSrc),
    "G11: page surfaces honest 'beta / not yet auto-granting' copy when flag is off",
  );

  // Defensive try/catch around the DB read — page should degrade to a
  // graceful error card rather than 500.
  assert(
    /try\s*\{[\s\S]*?getOrCreateReferralCode/.test(referSrc),
    "G12: getOrCreateReferralCode is wrapped in try/catch for prod robustness",
  );

  // Referral URL format. Must match what the (future) signup-flow
  // attribution writer parses out of the request URL. If page shows
  // ?refcode= but the writer reads ?ref=, attributions silently
  // fail.
  assert(
    /\?ref=\$\{code\}/.test(referSrc),
    "G13: shareable URL uses ?ref=<code> query param",
  );
}

if (fs.existsSync(REFER_BUTTONS)) {
  const buttonsSrc = fs.readFileSync(REFER_BUTTONS, "utf8");

  // Client component — required because clipboard API needs window.
  assert(
    /^"use client"/m.test(buttonsSrc),
    "G14: ReferralCopyButtons is a client component",
  );
  assert(
    /navigator\.clipboard\.writeText/.test(buttonsSrc),
    "G15: copy buttons use navigator.clipboard (modern, secure-context API)",
  );
  // Two buttons — code and full URL. Some users want one, some the
  // other; both pin in one regex so a refactor that drops either
  // catches.
  assert(
    /Copy code/.test(buttonsSrc),
    "G16: 'Copy code' button is present",
  );
  assert(
    /Copy share link/.test(buttonsSrc),
    "G17: 'Copy share link' button is present",
  );
}

// ---------------------------------------------------------------------------
// Section I: lib/referrals/cookie.ts — attribution cookie helper
// ---------------------------------------------------------------------------

const COOKIE = path.join(ROOT, "lib/referrals/cookie.ts");
assert(fs.existsSync(COOKIE), "I1: lib/referrals/cookie.ts exists");
if (fs.existsSync(COOKIE)) {
  const cookieSrc = fs.readFileSync(COOKIE, "utf8");

  assert(
    /export\s+const\s+REFERRAL_COOKIE_NAME\s*=\s*"pdfcraft_ref"/.test(
      cookieSrc,
    ),
    "I2: cookie name is 'pdfcraft_ref' (load-bearing — auth.ts reads this)",
  );
  assert(
    /export\s+function\s+isValidReferralCode\b/.test(cookieSrc),
    "I3: isValidReferralCode is exported (alphabet + length validation)",
  );
  assert(
    /export\s+function\s+setReferralCookie\b/.test(cookieSrc),
    "I4: setReferralCookie is exported",
  );
  assert(
    /export\s+function\s+readReferralCookie\b/.test(cookieSrc),
    "I5: readReferralCookie is exported",
  );
  assert(
    /export\s+function\s+clearReferralCookie\b/.test(cookieSrc),
    "I6: clearReferralCookie is exported",
  );

  // Validation must use the canonical alphabet from codes.ts so
  // a code-format change automatically invalidates old cookies.
  assert(
    /import\s*\{[^}]*REFERRAL_CODE_ALPHABET[^}]*\}\s*from\s*["']\.\/codes["']/.test(
      cookieSrc,
    ),
    "I7: cookie helper imports REFERRAL_CODE_ALPHABET from ./codes (single source of truth)",
  );

  // Cookie attributes — security-relevant, pin them so a refactor
  // doesn't accidentally drop httpOnly or sameSite.
  assert(
    /httpOnly:\s*true/.test(cookieSrc),
    "I8: cookie is httpOnly (XSS exfiltration guard)",
  );
  assert(
    /sameSite:\s*"lax"/.test(cookieSrc),
    "I9: cookie has sameSite=lax (allows cross-site share-link landing while blocking some CSRF)",
  );
  assert(
    /secure:\s*process\.env\.NODE_ENV\s*===\s*"production"/.test(cookieSrc),
    "I10: cookie is secure in production (allows http://localhost dev)",
  );
  // 30-day TTL: long-tail attribution. Anything shorter loses
  // the share-it-today-they-sign-up-next-week scenario.
  assert(
    /30\s*\*\s*24\s*\*\s*60\s*\*\s*60/.test(cookieSrc),
    "I11: cookie maxAge = 30 days",
  );

  // Read path validates value before returning. Without this, a
  // tampered cookie value goes straight into the SELECT query.
  assert(
    /readReferralCookie[\s\S]*?isValidReferralCode\(c\.value\)/.test(
      cookieSrc,
    ),
    "I12: readReferralCookie re-validates the cookie value (tamper guard)",
  );
}

// ---------------------------------------------------------------------------
// Section J: auth.ts events.signIn wire-up
// ---------------------------------------------------------------------------

const AUTH = path.join(ROOT, "auth.ts");
assert(fs.existsSync(AUTH), "J1: auth.ts exists");
if (fs.existsSync(AUTH)) {
  const authSrc = fs.readFileSync(AUTH, "utf8");

  // Imports — all three referral helpers must be wired in.
  assert(
    /lookupReferralCode/.test(authSrc),
    "J2: auth.ts imports lookupReferralCode",
  );
  assert(
    /recordReferralSignup/.test(authSrc),
    "J3: auth.ts imports recordReferralSignup",
  );
  assert(
    /readReferralCookie/.test(authSrc),
    "J4: auth.ts imports readReferralCookie",
  );
  assert(
    /clearReferralCookie/.test(authSrc),
    "J5: auth.ts imports clearReferralCookie",
  );

  // events.signIn handler — the wire point. Must check isNewUser
  // before doing referral work (existing-user signin shouldn't
  // re-attribute). Updated 2026-05-08 to accept the OAuth email-
  // verified expansion: handler now also takes `account` + `profile`
  // for the Google email_verified stamp (test-oauth-email-verified
  // pins those). Either shape is acceptable here — what J6 cares
  // about is that user + isNewUser remain in the destructure.
  assert(
    /async\s+signIn\(\s*\{[^}]*\buser\b[^}]*\bisNewUser\b[^}]*\}\s*\)/.test(
      authSrc,
    ),
    "J6: events.signIn destructures user and isNewUser",
  );
  // The grantSignupBonus block already returns early on !isNewUser;
  // verify the guard is structurally present somewhere in the
  // handler body.
  assert(
    /if\s*\(\s*!isNewUser\s*\)\s*return/.test(authSrc),
    "J7: events.signIn returns early when !isNewUser",
  );

  // Self-attribution guard at the call site. UNIQUE catches it
  // server-side too, but checking here avoids a useless DB write
  // attempt + ReferralWriteError throw.
  assert(
    /codeRow\.userId\s*!==\s*id/.test(authSrc),
    "J8: signIn handler skips self-referral (codeRow.userId !== id)",
  );

  // recordReferralSignup is called with the right shape — pin
  // each field so a refactor that renames doesn't silently break
  // attribution.
  assert(
    /referrerUserId:\s*codeRow\.userId/.test(authSrc),
    "J9: signIn passes referrerUserId from looked-up code",
  );
  assert(
    /referredUserId:\s*id/.test(authSrc),
    "J10: signIn passes referredUserId from the new user.id",
  );
  assert(
    /code:\s*refCode/.test(authSrc),
    "J11: signIn passes the validated cookie code through",
  );

  // Cookie clear must always run (even on miss) so a stale invalid
  // cookie doesn't sit around. Pin the unconditional clear.
  assert(
    /clearReferralCookie\(\)/.test(authSrc),
    "J12: signIn calls clearReferralCookie() to prevent stale-cookie retries",
  );

  // Errors must be caught — failing the sign-in here would lock
  // users out of accounts they just created (same rationale as
  // grantSignupBonus error handling).
  assert(
    /try\s*\{\s*\n[\s\S]*?const\s+refCode\s*=\s*readReferralCookie/.test(
      authSrc,
    ),
    "J13: referral attribution is wrapped in try/catch (don't block sign-in on failure)",
  );
}

// ---------------------------------------------------------------------------
// Section K: app/register/page.tsx — referral param + conditional copy
// ---------------------------------------------------------------------------
//
// 2026-05-05 fix: cookies().set() throws "Cookies can only be modified
// in a Server Action or Route Handler" when called from a server-
// component render path (verified via prod 500 on commit a9e006f).
// The cookie write moved to middleware.ts; this page now only reads
// the param to vary the copy.

const REGISTER = path.join(ROOT, "app/register/page.tsx");
assert(fs.existsSync(REGISTER), "K1: app/register/page.tsx exists");
if (fs.existsSync(REGISTER)) {
  const registerSrc = fs.readFileSync(REGISTER, "utf8");

  assert(
    /export\s+const\s+dynamic\s*=\s*"force-dynamic"/.test(registerSrc),
    "K2: register page is force-dynamic (reads searchParams)",
  );
  assert(
    /searchParams\.ref|searchParams:\s*SearchParams/.test(registerSrc),
    "K3: page reads searchParams.ref",
  );
  assert(
    /isValidReferralCode\(refRaw\)/.test(registerSrc),
    "K4: page validates the ref code (used for conditional subtitle copy)",
  );
  // Page MUST NOT call setReferralCookie — it would throw at render
  // time. Cookie write is in middleware. Filter out comment-mentions
  // by stripping line comments before checking.
  const registerSrcStripped = registerSrc
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
  assert(
    !/setReferralCookie\s*\(/.test(registerSrcStripped),
    "K5: page does NOT call setReferralCookie (forbidden in render — moved to middleware)",
  );
}

// ---------------------------------------------------------------------------
// Section L: middleware.ts — cookie write + auth-gate re-implementation
// ---------------------------------------------------------------------------

const MIDDLEWARE = path.join(ROOT, "middleware.ts");
assert(fs.existsSync(MIDDLEWARE), "L1: middleware.ts exists");
if (fs.existsSync(MIDDLEWARE)) {
  const mwSrc = fs.readFileSync(MIDDLEWARE, "utf8");

  // Edge-safe alphabet copy. Must match REFERRAL_CODE_ALPHABET in
  // codes.ts EXACTLY — pin both via this guard.
  const codesSrcMatch = fs
    .readFileSync(CODES, "utf8")
    .match(/REFERRAL_CODE_ALPHABET\s*=\s*"([^"]+)"/);
  const codesAlpha = codesSrcMatch ? codesSrcMatch[1] : "";
  const mwAlphaMatch = mwSrc.match(
    /REFERRAL_CODE_ALPHABET_EDGE\s*=\s*"([^"]+)"/,
  );
  const mwAlpha = mwAlphaMatch ? mwAlphaMatch[1] : "";
  assert(
    codesAlpha.length > 0 && mwAlpha === codesAlpha,
    `L2: middleware alphabet matches codes.ts (codes='${codesAlpha}', mw='${mwAlpha}')`,
  );

  // Cookie name must match what auth.ts reads.
  assert(
    /REFERRAL_COOKIE_NAME_EDGE\s*=\s*"pdfcraft_ref"/.test(mwSrc),
    "L3: middleware uses cookie name 'pdfcraft_ref' (matches auth.ts reader)",
  );

  // Cookie attributes — security-relevant.
  assert(
    /httpOnly:\s*true/.test(mwSrc),
    "L4: middleware sets httpOnly=true on the cookie",
  );
  assert(
    /sameSite:\s*"lax"/.test(mwSrc),
    "L5: middleware sets sameSite=lax",
  );
  assert(
    /secure:\s*process\.env\.NODE_ENV\s*===\s*"production"/.test(mwSrc),
    "L6: middleware sets secure=production-only",
  );
  assert(
    /30\s*\*\s*24\s*\*\s*60\s*\*\s*60/.test(mwSrc),
    "L7: middleware sets maxAge=30 days",
  );

  // Auth gates — re-implementation must mirror authConfig.authorized
  // because wrapping replaces it.
  assert(
    /isAppRoute\s*=\s*pathname\s*===\s*"\/app"\s*\|\|\s*pathname\.startsWith\("\/app\/"\)/.test(
      mwSrc,
    ),
    "L8: middleware re-implements /app/* gate from authConfig.authorized",
  );
  assert(
    /AUTH_PAGES_EDGE\s*=\s*\[[^\]]*"\/login"[^\]]*"\/register"[^\]]*"\/signup"[^\]]*"\/forgot-password"\]/.test(
      mwSrc,
    ),
    "L9: middleware lists same auth pages as authConfig (login/register/signup/forgot-password)",
  );
  assert(
    /pathname\.startsWith\("\/reset-password\/"\)/.test(mwSrc),
    "L10: middleware handles /reset-password/* dynamic children (matches authConfig)",
  );

  // callbackUrl preservation when redirecting unauthenticated /app/*
  // users to /login. Mirrors the same UX as the rest of the auth
  // funnel (which preserves callbackUrl per Task #49).
  assert(
    /callbackUrl/.test(mwSrc),
    "L11: middleware preserves callbackUrl when redirecting unauthenticated /app/* requests",
  );

  // Cookie set is /register-specific.
  assert(
    /pathname\s*===\s*"\/register"/.test(mwSrc),
    "L12: cookie set is gated to pathname === '/register'",
  );

  // Wrapped auth() pattern — using `export default auth((req) => ...)`.
  assert(
    /export\s+default\s+auth\s*\(/.test(mwSrc),
    "L13: middleware uses wrapped auth(fn) pattern (replaces authConfig.authorized)",
  );
}

// ---------------------------------------------------------------------------
// Section M: lib/referrals/rewards.ts — reward-trigger orchestration
// ---------------------------------------------------------------------------

const REWARDS = path.join(ROOT, "lib/referrals/rewards.ts");
assert(fs.existsSync(REWARDS), "M1: lib/referrals/rewards.ts exists");
if (fs.existsSync(REWARDS)) {
  const rewardsSrc = fs.readFileSync(REWARDS, "utf8");

  // Public surface
  assert(
    /export\s+const\s+REFERRED_REWARD_CREDITS\s*=\s*25/.test(rewardsSrc),
    "M2: REFERRED_REWARD_CREDITS = 25 (matches /app/refer page copy)",
  );
  assert(
    /export\s+const\s+REFERRER_REWARD_CREDITS\s*=\s*25/.test(rewardsSrc),
    "M3: REFERRER_REWARD_CREDITS = 25 (matches /app/refer page copy)",
  );
  assert(
    /export\s+async\s+function\s+triggerReferredReward\b/.test(rewardsSrc),
    "M4: triggerReferredReward is exported async",
  );
  assert(
    /export\s+async\s+function\s+triggerReferrerReward\b/.test(rewardsSrc),
    "M5: triggerReferrerReward is exported async",
  );

  // Flag-gate: both triggers must check isReferralsEnabled.
  assert(
    /triggerReferredReward[\s\S]*?if\s*\(\s*!isReferralsEnabled\(\)\s*\)\s*\{[\s\S]*?return null/.test(
      rewardsSrc,
    ),
    "M6: triggerReferredReward checks !isReferralsEnabled() and returns null",
  );
  assert(
    /triggerReferrerReward[\s\S]*?if\s*\(\s*!isReferralsEnabled\(\)\s*\)\s*\{[\s\S]*?return null/.test(
      rewardsSrc,
    ),
    "M7: triggerReferrerReward checks !isReferralsEnabled() and returns null",
  );

  // Idempotency: both already-rewarded checks pin
  assert(
    /signup\.referredRewardedAt\s*!==\s*null/.test(rewardsSrc),
    "M8: triggerReferredReward checks already-rewarded state (idempotency at orchestration layer)",
  );
  assert(
    /signup\.referrerRewardedAt\s*!==\s*null/.test(rewardsSrc),
    "M9: triggerReferrerReward checks already-rewarded state",
  );

  // Idempotency keys — must be signup-specific so re-trigger of the
  // same signup gets the same key → grantCredits dedupes.
  assert(
    /referral_referred:\$\{signup\.id\}/.test(rewardsSrc),
    "M10: referred reward idempotencyKey = referral_referred:<signupId>",
  );
  assert(
    /referral_referrer:\$\{signup\.id\}/.test(rewardsSrc),
    "M11: referrer reward idempotencyKey = referral_referrer:<signupId>",
  );

  // Reasons — must be distinct from purchase/bonus/promo to keep
  // /admin/credits and /app/credits humanizable.
  assert(
    /reason:\s*"referral_referred"/.test(rewardsSrc),
    "M12: referred reward uses reason='referral_referred'",
  );
  assert(
    /reason:\s*"referral_referrer"/.test(rewardsSrc),
    "M13: referrer reward uses reason='referral_referrer'",
  );

  // Both writers called via the canonical lib/referrals/writers
  // module (not duplicated inline).
  assert(
    /grantReferrerReward\(/.test(rewardsSrc),
    "M14: rewards.ts calls grantReferrerReward from writers.ts",
  );
  assert(
    /grantReferredReward\(/.test(rewardsSrc),
    "M15: rewards.ts calls grantReferredReward from writers.ts",
  );
  assert(
    /from\s+["']\.\/writers["']/.test(rewardsSrc),
    "M16: rewards.ts imports writers from ./writers",
  );

  // grantCredits import — couples the credit ledger as the source
  // of truth for "where the credits actually live".
  assert(
    /grantCredits/.test(rewardsSrc) &&
      /from\s+["']@\/lib\/payments\/ledger["']/.test(rewardsSrc),
    "M17: rewards.ts imports grantCredits from lib/payments/ledger",
  );

  // Dedupe-path ledger lookup (when grantCredits returns
  // {applied:false, reason:'duplicate'}, we still need to mark the
  // signup row — look up the original ledger via idempotencyKey).
  assert(
    /idempotencyKey,\s*idempotencyKey/.test(rewardsSrc) ||
      /eq\(\s*schema\.creditLedger\.idempotencyKey,\s*idempotencyKey\s*\)/.test(
        rewardsSrc,
      ),
    "M18: dedupe path looks up existing ledger row by idempotencyKey to populate creditLedgerId on the signup",
  );
}

// ---------------------------------------------------------------------------
// Section N: verify-email + payment-captured wire-ups
// ---------------------------------------------------------------------------

const VERIFY = path.join(ROOT, "app/verify-email/page.tsx");
assert(fs.existsSync(VERIFY), "N1: app/verify-email/page.tsx exists");
if (fs.existsSync(VERIFY)) {
  const verifySrc = fs.readFileSync(VERIFY, "utf8");

  assert(
    /import\s*\{[^}]*triggerReferredReward[^}]*\}\s*from\s*["']@\/lib\/referrals\/rewards["']/.test(
      verifySrc,
    ),
    "N2: verify-email page imports triggerReferredReward",
  );
  // Must be inside the if(result.ok) branch so we only fire on
  // successful verification.
  assert(
    /if\s*\(\s*result\.ok\s*\)\s*\{[\s\S]*?triggerReferredReward\s*\(\s*result\.userId\s*\)/.test(
      verifySrc,
    ),
    "N3: triggerReferredReward fires only on successful verification (inside if(result.ok))",
  );
  // try/catch wrapping — a referral-grant failure must not break
  // the verify UX.
  assert(
    /try\s*\{[\s\S]*?triggerReferredReward[\s\S]*?\}\s*catch/.test(verifySrc),
    "N4: triggerReferredReward call is wrapped in try/catch (don't break verify on grant failure)",
  );
  assert(
    /verify_email_referral_grant_failed/.test(verifySrc),
    "N5: structured-log key on referral-grant failure for ops visibility",
  );
}

const LEDGER = path.join(ROOT, "lib/payments/ledger.ts");
assert(fs.existsSync(LEDGER), "N6: lib/payments/ledger.ts exists");
if (fs.existsSync(LEDGER)) {
  const ledgerSrc = fs.readFileSync(LEDGER, "utf8");

  assert(
    /triggerReferrerReward/.test(ledgerSrc),
    "N7: ledger.ts wires triggerReferrerReward in handleCaptured",
  );
  // Must be inside handleCaptured (after the credit grants, before
  // the return). We don't assert exact placement but pin the import
  // shape — dynamic import keeps the module-load cycle clean (the
  // rewards module imports from ./writers which imports from
  // db/client; ledger.ts also imports db/client so the cycle is
  // statically resolvable, but dynamic import keeps the dependency
  // explicit at the call site).
  assert(
    /await\s+import\(\s*["']@\/lib\/referrals\/rewards["']\s*\)/.test(
      ledgerSrc,
    ),
    "N8: handleCaptured uses dynamic import for referrals/rewards (avoids module cycle)",
  );
  assert(
    /payment_captured_referral_grant_failed/.test(ledgerSrc),
    "N9: structured-log key on referrer-grant failure",
  );
  // try/catch wrapping — a referral-grant failure mid-webhook must
  // not throw because that would cause the provider to retry the
  // capture event and potentially double-grant the buyer's credits.
  assert(
    /try\s*\{[\s\S]*?triggerReferrerReward[\s\S]*?\}\s*catch/.test(ledgerSrc),
    "N10: referrer-reward call is wrapped in try/catch (don't break webhook ack on grant failure)",
  );
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
