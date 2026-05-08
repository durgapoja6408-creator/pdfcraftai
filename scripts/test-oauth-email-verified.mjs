#!/usr/bin/env node
/**
 * 2026-05-08 — OAuth email-verified stamp regression guard.
 *
 * Background: the Phase F-3 verification gate (`assertEmailVerified`
 * in lib/auth/email-verification.ts) checks `users.emailVerified
 * !== null` and throws EmailNotVerifiedError when EMAIL_VERIFICATION_
 * GATE=on. The Credentials provider sets emailVerified via the OTP
 * flow. Google OAuth had no equivalent step — DrizzleAdapter inserts
 * the user row but leaves emailVerified NULL, so when the gate flag
 * flips on every Google user is locked out of every /api/ai/* route.
 *
 * The fix in auth.ts events.signIn relies on Google's own
 * `email_verified` claim from the OAuth profile. Google verifies
 * email ownership during the flow itself — they wouldn't return a
 * token for an unverified email. Stamp emailVerified=NOW() on first
 * OAuth sign-in.
 *
 * What this guard catches:
 *   - signIn handler reverted to ignoring `account` / `profile`
 *     parameters (would silently break Google verification stamp)
 *   - Provider check loosened beyond "google" (e.g. accepting any
 *     account.provider — would let Credentials sign-ins skip OTP)
 *   - email_verified claim check dropped (would auto-verify Google
 *     accounts where Google itself says the email is unverified —
 *     rare for Workspace, but still wrong)
 *   - IS NULL filter dropped from the UPDATE (would clobber the
 *     original verification timestamp for users who verified via
 *     OTP first)
 *   - Error path missing — a DB hiccup MUST log and continue, not
 *     block sign-in (locking users out of their own account is
 *     worse than a delayed gate stamp)
 *
 * Pure static parse. Sub-second. Output line conforms to the
 * aggregator regex.
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

const AUTH_PATH = path.join(ROOT, "auth.ts");
const VERIFY_PATH = path.join(ROOT, "lib/auth/email-verification.ts");

assert(fs.existsSync(AUTH_PATH), `auth.ts missing at ${AUTH_PATH}`);
assert(
  fs.existsSync(VERIFY_PATH),
  `lib/auth/email-verification.ts missing at ${VERIFY_PATH}`,
);

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
  console.log(`oauth-email-verified: ${passed} passed, ${failed} failed`);
  process.exit(1);
}

const AUTH_SRC = fs.readFileSync(AUTH_PATH, "utf8");
const VERIFY_SRC = fs.readFileSync(VERIFY_PATH, "utf8");

// ---------------------------------------------------------------------
// Section A — signIn handler accepts the params it needs.
// ---------------------------------------------------------------------

assert(
  /async\s+signIn\(\{\s*user\s*,\s*account\s*,\s*profile\s*,\s*isNewUser\s*\}\)/.test(
    AUTH_SRC,
  ),
  "signIn handler must destructure { user, account, profile, isNewUser }. " +
    "Without `account` it can't tell which provider the sign-in is from; " +
    "without `profile` it can't read Google's email_verified claim.",
);

// ---------------------------------------------------------------------
// Section B — provider check is "google" specifically.
// ---------------------------------------------------------------------

assert(
  /account\?\.provider\s*===\s*"google"/.test(AUTH_SRC),
  "Provider check must be `account?.provider === \"google\"`. Loosening " +
    "this to e.g. `account?.provider != null` would auto-verify " +
    "Credentials sign-ins, skipping the OTP flow that the Phase F-3 " +
    "verification gate is supposed to enforce.",
);

// Negative — must NOT accept any provider blindly.
assert(
  !/account\?\.provider\s*\)\s*\{[\s\S]{0,200}emailVerified:\s*new Date/.test(
    AUTH_SRC,
  ),
  "Found a path that sets emailVerified without checking provider === " +
    "'google'. This would auto-verify Credentials sign-ins, defeating " +
    "the OTP flow.",
);

// ---------------------------------------------------------------------
// Section C — Google's email_verified claim must be checked.
// ---------------------------------------------------------------------
//
// Google sometimes returns email_verified: false for Workspace
// accounts in the middle of admin transitions, or for emails the
// user hasn't confirmed via Google's own flow. Trusting only the
// presence of an OAuth token without the email_verified claim would
// mark such accounts as verified — wrong.

assert(
  /\.email_verified\s*===\s*true/.test(AUTH_SRC),
  "Must check `(profile as ...).email_verified === true` — strict " +
    "equality on `true`, not just truthy. Google's claim is a boolean " +
    "in the JWT; truthy-only would accept the string 'true' or " +
    "anything non-falsy if the type ever drifts.",
);

// ---------------------------------------------------------------------
// Section D — UPDATE is idempotent via IS NULL filter.
// ---------------------------------------------------------------------
//
// Re-firing the UPDATE on every sign-in is functionally fine but the
// IS NULL filter is the cleanest way to (a) save a write, and (b)
// preserve the original verification timestamp if a user verified
// via OTP first and then linked Google. Without IS NULL, every
// sign-in would clobber the original timestamp — historically
// surprising for any audit trail.

assert(
  /isNull\(\s*schema\.users\.emailVerified\s*\)/.test(AUTH_SRC),
  "UPDATE must filter on `isNull(schema.users.emailVerified)`. Without " +
    "this, every sign-in clobbers the verification timestamp — " +
    "surprising for audit trails, and wastes a write per signin.",
);

assert(
  /\.update\(\s*schema\.users\s*\)\s*\.set\(\s*\{\s*emailVerified:\s*new Date\(\)\s*\}\s*\)\s*\.where\(\s*and\(/.test(
    AUTH_SRC,
  ),
  "UPDATE shape must be `db.update(schema.users).set({ emailVerified: " +
    "new Date() }).where(and(...))` with both userId AND isNull(...) " +
    "clauses combined via `and()`.",
);

assert(
  /eq\(\s*schema\.users\.id\s*,\s*id\s*\)/.test(AUTH_SRC),
  "UPDATE must scope by `eq(schema.users.id, id)`. Without it the " +
    "UPDATE would mark every NULL-emailVerified row in the table — " +
    "catastrophic. The id comes from `user?.id` validated above.",
);

// ---------------------------------------------------------------------
// Section E — error path is non-blocking.
// ---------------------------------------------------------------------

assert(
  /try\s*\{[\s\S]*?await\s+db[\s\S]*?\.update\(\s*schema\.users\s*\)[\s\S]*?\}\s*catch\s*\(\s*err\s*\)\s*\{[\s\S]*?console\.error\([\s\S]*?markEmailVerified[\s\S]*?\)\s*;[\s\S]*?\}/.test(
    AUTH_SRC,
  ),
  "UPDATE must be inside a try/catch that logs the error and continues. " +
    "A thrown DB error during signIn locks the user out of their own " +
    "account — worse than a delayed gate stamp the user can fix on the " +
    "next request.",
);

// ---------------------------------------------------------------------
// Section F — verification gate still references the column we're stamping.
// ---------------------------------------------------------------------
//
// If the gate's column reference were renamed but auth.ts wasn't
// updated, the OAuth stamp would land in the wrong column and the
// gate would still block. Pin the gate's read path against this fix.

assert(
  /emailVerified:\s*schema\.users\.emailVerified/.test(VERIFY_SRC),
  "The gate (assertEmailVerified) must still SELECT " +
    "`emailVerified: schema.users.emailVerified`. If this column was " +
    "renamed, the OAuth stamp would land in a stale column and the " +
    "gate would block every Google user.",
);

assert(
  /row\.emailVerified\s*===\s*null/.test(VERIFY_SRC),
  "The gate must still gate on `row.emailVerified === null`. If the " +
    "check changes (e.g. compares to a string) the OAuth Date stamp " +
    "wouldn't satisfy it.",
);

// ---------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
}

console.log(`oauth-email-verified: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
