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

/**
 * Send the verification email. Composes a plain-text + HTML message
 * with the verify link.
 */
export async function sendVerificationEmail(
  email: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = await createVerificationToken(userId);
  const link = `${siteOrigin()}/verify-email?token=${encodeURIComponent(token)}`;

  const text = [
    `Welcome to pdfcraft ai.`,
    ``,
    `Click the link below to verify your email address. The link is`,
    `valid for 24 hours.`,
    ``,
    link,
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
  <p>Click the button below to verify your email address. The link is valid for 24 hours.</p>
  <p><a class="btn" href="${link}">Verify email</a></p>
  <p class="muted">Or paste this link into your browser:<br><span class="link">${link}</span></p>
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
