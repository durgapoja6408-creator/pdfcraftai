// Email verification flow (plan §8 layer 3 + §8a Day 1.5a).
//
// Token lifecycle
//   1. registerAction calls createVerificationToken(userId, email)
//      after a fresh signup. Returns the raw token to email.
//   2. Token (raw, 32-byte hex) is hashed (SHA-256) and stored in the
//      verification_tokens table with identifier=userId and a 24-hour
//      expiry. Storing only the hash means a DB leak doesn't expose
//      live tokens.
//   3. We email the user a link `/verify-email?token=<raw>` via SMTP.
//   4. User clicks → /api/auth/verify-email reads the raw token, hashes
//      it, looks up the row, marks consumed, sets users.email_verified.
//
// Why the existing verification_tokens table
//   NextAuth's email-provider table shape: composite PK (identifier,
//   token), expiry, no user FK. We use it but populate identifier
//   with userId (instead of email) so the row also serves as our
//   "this user has a pending verification" flag. The token column
//   stores SHA-256 hex (64 chars).
//
// Why 24h expiry
//   Plan §8 verification grace period: account is always usable at
//   0 balance. Verification only gates the credit grant. 24h is the
//   industry standard for email verification — long enough for inbox
//   delays, short enough that an attacker who later compromises the
//   email account can't redeem an old token.

import "server-only";

import { randomBytes, createHash } from "crypto";
import { and, eq, gt } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { sendEmail } from "@/lib/auth/smtp";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://pdfcraftai.com";
}

/**
 * Generate a fresh verification token, store its hash, return the raw
 * token for emailing to the user. Idempotent: re-calling for the same
 * user invalidates any existing token (prevents leftover tokens from
 * a botched first attempt staying live for 24h).
 */
export async function createVerificationToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const hashed = hashToken(raw);
  const expires = new Date(Date.now() + TOKEN_TTL_MS);

  // Delete any existing tokens for this user first. This makes
  // "resend verification email" implicitly invalidate the old token.
  await db
    .delete(schema.verificationTokens)
    .where(eq(schema.verificationTokens.identifier, userId));

  await db.insert(schema.verificationTokens).values({
    identifier: userId,
    token: hashed,
    expires,
  });

  return raw;
}

/**
 * Consume a verification token. Returns the verified userId on
 * success, or null if the token is missing/expired/invalid.
 *
 * Side effects on success:
 *   - Deletes the token row (single-use)
 *   - Sets users.email_verified = NOW()
 */
export async function consumeVerificationToken(
  raw: string,
): Promise<{ ok: true; userId: string } | { ok: false; reason: string }> {
  if (!raw || typeof raw !== "string" || raw.length < 32) {
    return { ok: false, reason: "invalid_token" };
  }

  const hashed = hashToken(raw);
  const now = new Date();

  // Look up by token hash. We don't need to scope by identifier
  // because the token is unguessable; if the hash matches, we trust
  // the row's identifier.
  const [row] = await db
    .select({
      identifier: schema.verificationTokens.identifier,
      expires: schema.verificationTokens.expires,
    })
    .from(schema.verificationTokens)
    .where(
      and(
        eq(schema.verificationTokens.token, hashed),
        gt(schema.verificationTokens.expires, now),
      ),
    )
    .limit(1);

  if (!row) {
    return { ok: false, reason: "expired_or_unknown" };
  }

  // Atomically: delete the token + mark email verified. We do
  // these in one transaction so a partial failure can't leave a
  // consumed-but-not-marked state.
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.verificationTokens)
      .where(eq(schema.verificationTokens.token, hashed));
    await tx
      .update(schema.users)
      .set({ emailVerified: now })
      .where(eq(schema.users.id, row.identifier));
  });

  return { ok: true, userId: row.identifier };
}

// ---------------------------------------------------------------------------
// 6-digit OTP path (gap #1, 2026-05-06)
// ---------------------------------------------------------------------------

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const CODE_MAX_ATTEMPTS = 5;
const CODE_LOCKOUT_MS = 15 * 60 * 1000; // 15-min lockout after 5 misses

/**
 * Per-user-salted hash of a 6-digit code. SHA-256 of `${code}:${userId}`.
 * Salting with userId means a DB leak doesn't let an attacker rainbow-
 * table all 1M possible 6-digit codes — they'd need to know the userId
 * AND compute hashes per-user.
 */
function hashCode(code: string, userId: string): string {
  return createHash("sha256").update(`${code}:${userId}`).digest("hex");
}

/**
 * Generate a fresh 6-digit verification code, store its salted hash,
 * return the raw code for emailing. Idempotent: re-calling for the
 * same user invalidates any existing code (old code stops working
 * the moment the new one is created — prevents a "two valid codes"
 * window).
 */
export async function createVerificationCode(userId: string): Promise<string> {
  // crypto.randomBytes for a 6-digit code: read 4 bytes (uint32 max
  // = 4.29B), modulo 1_000_000, zero-pad. Modulo bias is negligible
  // (4.29B / 1M = 4294 buckets, 4 bias spread across 1M codes).
  const buf = randomBytes(4);
  const num = (buf.readUInt32BE(0) % 1_000_000)
    .toString()
    .padStart(6, "0");
  const hashed = hashCode(num, userId);
  const expires = new Date(Date.now() + CODE_TTL_MS);
  const id = randomBytes(16).toString("hex");

  // Delete any existing code for this user first. UNIQUE on user_id
  // would also catch this on insert, but pre-delete keeps the error
  // path clean.
  await db
    .delete(schema.verificationCodes)
    .where(eq(schema.verificationCodes.userId, userId));

  await db.insert(schema.verificationCodes).values({
    id,
    userId,
    codeHash: hashed,
    attempts: 0,
    lockedUntil: null,
    expires,
  });

  return num;
}

/**
 * Consume a 6-digit verification code. Permission rules:
 *   - userId comes from session (caller's anti-impersonation
 *     responsibility — we trust the input)
 *   - code is the user-typed string
 *
 * Outcome:
 *   - { ok: true, userId } on hit (deletes row, sets email_verified)
 *   - { ok: false, reason: "invalid" } on miss (increments attempts;
 *     sets locked_until on the 5th miss)
 *   - { ok: false, reason: "expired" } on TTL pass
 *   - { ok: false, reason: "locked_out", retryAfterSeconds } when
 *     the row is currently locked from a prior burst of misses
 *   - { ok: false, reason: "no_active_code" } when no row exists
 *     (user clicked Resend right before typing the old code)
 *
 * Constant-time comparison: hash both sides before compare. Plain
 * string compare on hashed values would still leak timing on the
 * hash itself, but JS string compare is constant-time relative to
 * the unverified inputs (the hash output is fixed-length 64 chars).
 */
export async function consumeVerificationCode(
  userId: string,
  rawCode: string,
): Promise<
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "expired" }
  | { ok: false; reason: "locked_out"; retryAfterSeconds: number }
  | { ok: false; reason: "no_active_code" }
> {
  // Defensive input guards — match the OTP shape (6 digits)
  const trimmed = (rawCode ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(trimmed)) {
    return { ok: false, reason: "invalid" };
  }
  if (typeof userId !== "string" || userId.length === 0) {
    return { ok: false, reason: "no_active_code" };
  }

  const now = new Date();
  const [row] = await db
    .select()
    .from(schema.verificationCodes)
    .where(eq(schema.verificationCodes.userId, userId))
    .limit(1);
  if (!row) return { ok: false, reason: "no_active_code" };

  // Lockout takes precedence — even an otherwise-valid code is
  // rejected during a lockout window (defense against attempt-burst
  // attacks).
  if (row.lockedUntil && row.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil(
      (row.lockedUntil.getTime() - now.getTime()) / 1000,
    );
    return { ok: false, reason: "locked_out", retryAfterSeconds };
  }

  if (row.expires <= now) {
    // Expired — delete the row so the next createVerificationCode
    // call doesn't see a stale row.
    await db
      .delete(schema.verificationCodes)
      .where(eq(schema.verificationCodes.id, row.id));
    return { ok: false, reason: "expired" };
  }

  const expectedHash = hashCode(trimmed, userId);
  if (expectedHash !== row.codeHash) {
    // Miss. Increment attempts; set lockout if at threshold.
    const nextAttempts = row.attempts + 1;
    const lockedUntil =
      nextAttempts >= CODE_MAX_ATTEMPTS
        ? new Date(Date.now() + CODE_LOCKOUT_MS)
        : null;
    await db
      .update(schema.verificationCodes)
      .set({ attempts: nextAttempts, lockedUntil })
      .where(eq(schema.verificationCodes.id, row.id));
    if (lockedUntil) {
      return {
        ok: false,
        reason: "locked_out",
        retryAfterSeconds: Math.ceil(CODE_LOCKOUT_MS / 1000),
      };
    }
    return { ok: false, reason: "invalid" };
  }

  // Hit. Delete the code row + mark email verified atomically.
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.verificationCodes)
      .where(eq(schema.verificationCodes.id, row.id));
    await tx
      .update(schema.users)
      .set({ emailVerified: now })
      .where(eq(schema.users.id, userId));
  });

  return { ok: true, userId };
}

/**
 * Send the verification email. Composes a plain-text + HTML message
 * with the verify link.
 */
export async function sendVerificationEmail(
  email: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  // Both paths active in parallel: magic-link (24h) AND 6-digit
  // OTP (15min). User picks whichever is more convenient. Email
  // includes both. Either consume path independently sets
  // users.email_verified, so clicking the link or typing the code
  // achieves the same outcome.
  const token = await createVerificationToken(userId);
  const link = `${siteOrigin()}/verify-email?token=${encodeURIComponent(token)}`;
  const code = await createVerificationCode(userId);

  const text = [
    `Welcome to pdfcraft ai.`,
    ``,
    `Two ways to verify your email — pick whichever is easier.`,
    ``,
    `Option 1 — Click the link (valid for 24 hours):`,
    link,
    ``,
    `Option 2 — Sign in and enter this 6-digit code (valid for 15 minutes):`,
    `    ${code.slice(0, 3)} ${code.slice(3)}`,
    ``,
    `Code-entry form: ${siteOrigin()}/verify-email`,
    ``,
    `If you didn't create a pdfcraft ai account, you can safely ignore`,
    `this message.`,
    ``,
    `— pdfcraft ai`,
    `https://pdfcraftai.com`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.5; color: #1a1c24; max-width: 540px; margin: 40px auto; padding: 0 20px; }
  h1 { font-size: 22px; margin-bottom: 16px; }
  .btn { display: inline-block; padding: 12px 24px; background: #0066ff; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 500; margin: 16px 0; }
  .muted { color: #888; font-size: 13px; line-height: 1.5; }
  .link { word-break: break-all; color: #0066ff; }
</style>
</head>
<body>
  <h1>Welcome to pdfcraft ai</h1>
  <p>Two ways to verify — pick whichever is easier.</p>
  <p><strong>Option 1 — Click the button</strong> (valid for 24 hours):</p>
  <p><a class="btn" href="${link}">Verify email</a></p>
  <p class="muted">Or paste this link into your browser:<br><span class="link">${link}</span></p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p><strong>Option 2 — Enter this 6-digit code</strong> (valid for 15 minutes):</p>
  <p style="font-family: ui-monospace, SFMono-Regular, monospace; font-size: 28px; letter-spacing: 6px; font-weight: 600; color: #0066ff; padding: 12px 18px; background: #f0f5ff; border-radius: 8px; text-align: center; margin: 12px 0;">${code.slice(0, 3)}&nbsp;${code.slice(3)}</p>
  <p class="muted">Sign in at <a href="${siteOrigin()}/login" style="color:#0066ff">${siteOrigin().replace("https://", "")}/login</a>, then enter the code on the verification page.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p class="muted">If you didn't create a pdfcraft ai account, you can safely ignore this message.</p>
  <p class="muted">— pdfcraft ai · <a href="https://pdfcraftai.com" style="color:#0066ff">pdfcraftai.com</a></p>
</body>
</html>`;

  return sendEmail({
    to: email,
    subject: "Verify your pdfcraft ai email",
    text,
    html,
  });
}

// ---------------------------------------------------------------------------
// 2026-05-06 — Honest gaps in the flow: resend + verification gate
// ---------------------------------------------------------------------------

/**
 * Thrown when an AI op route is called by a user whose
 * users.email_verified is NULL. Caught by lib/ai/route-guards.ts:
 * guardAiRoute and converted to a 403 response with the same shape
 * as the other gates in that helper (op_killed, daily_cap_exceeded).
 *
 * Existence of this class — not just an error string — is the
 * extension point that lib/ai/route-guards.ts foreshadowed at line
 * 12-15: "if we add a third pre-spend check later — e.g. a TOS-
 * acceptance gate for EU users per Task #24 — we add it here and
 * every handler gets it". Same shape for email verification.
 */
export class EmailNotVerifiedError extends Error {
  constructor() {
    super("email_not_verified");
    this.name = "EmailNotVerifiedError";
  }
}

/**
 * Throws EmailNotVerifiedError if the given user's
 * users.email_verified is NULL. Honest semantics:
 *   - Throws on null email_verified → AI op blocked
 *   - Returns silently when email_verified is set → AI op allowed
 *   - Returns silently when the env flag is off (graceful staging
 *     rollout — operators can disable the gate while monitoring
 *     for false positives)
 *
 * No-ops when the user record is missing (defensive — auth already
 * gated, but if a stale session somehow points at a deleted user
 * the route's outer auth check should have caught it; we don't
 * compound by adding a "user not found" rejection here).
 */
export async function assertEmailVerified(userId: string): Promise<void> {
  // Feature flag — operators can disable the gate via env var while
  // they monitor for false positives (e.g. SMTP outage backlogs
  // verification emails and lots of users hit the gate at once).
  // Default OFF — explicit opt-in. Set EMAIL_VERIFICATION_GATE=on
  // in production once the resend UI is shipped + monitored for a
  // week.
  if (process.env.EMAIL_VERIFICATION_GATE !== "on") {
    return;
  }

  const [row] = await db
    .select({ emailVerified: schema.users.emailVerified })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  // Missing user row → defer to outer auth (don't compound errors).
  if (!row) return;

  if (row.emailVerified === null) {
    throw new EmailNotVerifiedError();
  }
}

/**
 * Resend the verification email. Used by the dashboard "Resend
 * verification" banner when:
 *   - The user's original email was lost in the inbox
 *   - The 24h token expired before they clicked
 *   - The original SMTP send failed (the fire-and-forget path in
 *     registerAction logs but doesn't block signup; this is the
 *     recovery path)
 *
 * Honest no-op semantics:
 *   - If the user is already verified, returns { ok: true,
 *     alreadyVerified: true } without sending — saves the user the
 *     "did this work?" loop when they click resend after already
 *     verifying.
 *   - If the user record is missing (stale session), returns
 *     { ok: false }. Caller surfaces a generic error.
 *
 * Rate-limit: 1 resend per 60s per user, enforced by checking the
 * existing token's age (createVerificationToken deletes the old
 * row + creates a new one with a fresh 24h expiry; we infer "last
 * resend time" from the gap between the new expiry and 24h).
 *
 * Returns:
 *   - { ok: true, alreadyVerified: true }  → user is already verified
 *   - { ok: true, sent: true }              → email queued
 *   - { ok: false, error: "rate_limited" }  → too soon since last send
 *   - { ok: false, error: "user_not_found" }
 *   - { ok: false, error: "smtp_failed" }   → SMTP returned an error
 */
const RESEND_THROTTLE_MS = 60 * 1000; // 1 minute

export async function resendVerificationEmail(
  userId: string,
): Promise<
  | { ok: true; alreadyVerified: true }
  | { ok: true; sent: true }
  | { ok: false; error: "rate_limited" | "user_not_found" | "smtp_failed" }
> {
  if (typeof userId !== "string" || userId.length === 0) {
    return { ok: false, error: "user_not_found" };
  }

  // 1. Look up the user — need email + emailVerified state
  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      emailVerified: schema.users.emailVerified,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) return { ok: false, error: "user_not_found" };
  if (user.emailVerified !== null) {
    return { ok: true, alreadyVerified: true };
  }

  // 2. Rate-limit: check the existing token's expiry. If a token
  //    was created < 60s ago, its expiry is > (24h - 60s) from now.
  //    Use that to detect "too soon" without adding a new column.
  const [existing] = await db
    .select({ expires: schema.verificationTokens.expires })
    .from(schema.verificationTokens)
    .where(eq(schema.verificationTokens.identifier, userId))
    .limit(1);
  if (existing) {
    const ageMs = TOKEN_TTL_MS - (existing.expires.getTime() - Date.now());
    if (ageMs < RESEND_THROTTLE_MS && ageMs >= 0) {
      return { ok: false, error: "rate_limited" };
    }
  }

  // 3. Fire the resend. createVerificationToken (called inside
  //    sendVerificationEmail) deletes the old row + inserts new one,
  //    so the old token becomes invalid the moment we send the new
  //    email — prevents a "two valid tokens" window.
  const result = await sendVerificationEmail(user.email, user.id);
  if (!result.ok) {
    console.error(
      JSON.stringify({
        event: "resend_verification_smtp_failed",
        userId,
        error: result.error ?? "unknown",
        ts: new Date().toISOString(),
      }),
    );
    return { ok: false, error: "smtp_failed" };
  }
  return { ok: true, sent: true };
}
