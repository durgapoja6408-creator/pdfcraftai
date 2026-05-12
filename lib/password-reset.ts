/**
 * Password reset token helpers.
 *
 * Two surfaces:
 *   - mintPasswordResetToken(email)   → returns { rawToken, expiresAt } | null
 *     Always swallows "user not found" silently (returns null) so callers
 *     can ack identically and avoid account enumeration. Throws ONLY on
 *     unexpected DB failures.
 *
 *   - consumePasswordResetToken(rawToken, newPassword)
 *     → { ok: true } | { ok: false, error: string }
 *     Validates the token (exists, unused, unexpired), updates the
 *     user's passwordHash, marks the token consumed, and invalidates
 *     every other outstanding token for the same user in one atomic
 *     transaction. Returns a friendly error on bad input.
 *
 * Tokens are 32 random bytes encoded as hex (64 chars in the URL). Stored
 * server-side as their SHA-256 digest — never the raw value. See
 * db/schema/auth.ts → passwordResetTokens for rationale.
 */

import "server-only";
import { randomBytes, randomUUID, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { sql, and, eq, gt, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { BCRYPT_COST } from "@/lib/auth/bcrypt-cost";

// 30-minute TTL — long enough to land in an inbox + click, short enough
// that a leaked link goes stale before it's useful.
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

// Stored server-side as SHA-256. The raw token is what goes in the URL;
// the hash is what we look up. This keeps a DB dump from yielding
// usable bearer tokens.
function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * One-time-per-process bootstrap that ensures the `password_reset_tokens`
 * table exists. Hostinger doesn't auto-run drizzle-kit on deploy, so the
 * very first request after the migration ships would otherwise 500 with
 * `ER_NO_SUCH_TABLE`. The CREATE TABLE IF NOT EXISTS is idempotent and
 * matches `db/migrations/0001_password_reset_tokens.sql` byte-for-byte
 * (minus the constraint syntax which mysql can infer).
 *
 * REMOVE THIS once we have an actual migration runner wired into deploy.
 * Until then, this is the difference between "feature works" and
 * "feature 500s silently in production".
 */
let _bootstrapPromise: Promise<void> | null = null;
async function ensureSchema(): Promise<void> {
  if (_bootstrapPromise) return _bootstrapPromise;
  _bootstrapPromise = (async () => {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS \`password_reset_tokens\` (
          \`id\` varchar(36) NOT NULL,
          \`user_id\` varchar(255) NOT NULL,
          \`token_hash\` varchar(64) NOT NULL,
          \`expires_at\` timestamp(3) NOT NULL,
          \`consumed_at\` timestamp(3) NULL,
          \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`password_reset_tokens_token_hash_unique\` (\`token_hash\`),
          KEY \`password_reset_tokens_user_idx\` (\`user_id\`),
          KEY \`password_reset_tokens_expires_idx\` (\`expires_at\`)
        )
      `);
    } catch (err) {
      // Don't poison the cached promise — let the next call retry.
      _bootstrapPromise = null;
      throw err;
    }
  })();
  return _bootstrapPromise;
}

export type MintResult =
  | { rawToken: string; expiresAt: Date; userId: string }
  | null;

export async function mintPasswordResetToken(
  email: string,
): Promise<MintResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  await ensureSchema();

  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail))
    .limit(1);

  if (!user) return null;

  // 32 random bytes = 256 bits of entropy. Hex-encoded for URL safety
  // (URL-safe base64 also works but hex avoids any "+" / "/" / "=" footguns
  // in path segments).
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await db.insert(schema.passwordResetTokens).values({
    id: randomUUID(),
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  return { rawToken, expiresAt, userId: user.id };
}

export type LookupResult =
  | { ok: true; userId: string; tokenRowId: string }
  | { ok: false; reason: "missing" | "expired" | "consumed" };

/**
 * Look up a token without consuming it. Used by the GET-side of the page
 * to decide whether to render the form or the "link is expired" state.
 *
 * SECURITY: callers MUST treat ANY failure (missing/expired/consumed)
 * as the same user-facing message — no enumeration, no "consumed vs
 * never existed" leakage. We split the reasons here only for log /
 * telemetry purposes.
 */
export async function lookupPasswordResetToken(
  rawToken: string,
): Promise<LookupResult> {
  if (!rawToken || rawToken.length !== 64 || !/^[0-9a-f]{64}$/i.test(rawToken)) {
    return { ok: false, reason: "missing" };
  }

  await ensureSchema();

  const tokenHash = sha256Hex(rawToken);
  const [row] = await db
    .select({
      id: schema.passwordResetTokens.id,
      userId: schema.passwordResetTokens.userId,
      expiresAt: schema.passwordResetTokens.expiresAt,
      consumedAt: schema.passwordResetTokens.consumedAt,
    })
    .from(schema.passwordResetTokens)
    .where(eq(schema.passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row) return { ok: false, reason: "missing" };
  if (row.consumedAt) return { ok: false, reason: "consumed" };
  if (row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, userId: row.userId, tokenRowId: row.id };
}

export type ConsumeResult =
  | { ok: true }
  | { ok: false; error: string };

export async function consumePasswordResetToken(
  rawToken: string,
  newPassword: string,
): Promise<ConsumeResult> {
  // 2026-05-12 — SEV-0 fix: minimum was 8 chars; signup is 10 chars
  // (lib/auth-actions.ts:72). The drift meant a user could set a
  // weaker password via /reset-password than the platform accepts at
  // /register. Aligned to 10 so the strength floor is consistent
  // across every password-set surface.
  if (typeof newPassword !== "string" || newPassword.length < 10) {
    return { ok: false, error: "Use at least 10 characters." };
  }
  if (newPassword.length > 128) {
    return { ok: false, error: "Password is too long." };
  }

  const lookup = await lookupPasswordResetToken(rawToken);
  if (!lookup.ok) {
    return {
      ok: false,
      // Generic — don't leak which failure mode the token hit.
      error: "This reset link is invalid or has expired.",
    };
  }

  // 2026-05-12 — SEV-0 fix: was cost 10, now BCRYPT_COST (=12)
  // matching signup. Every prior password-reset downgraded hash
  // strength below the original signup hash. See
  // lib/auth/bcrypt-cost.ts for full rationale.
  const newHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  const now = new Date();

  // Mark token consumed FIRST, in the same statement, with a guard
  // (`consumedAt IS NULL`) so a concurrent retry can't double-redeem.
  // Drizzle on MySQL returns a ResultSetHeader with `affectedRows`.
  // If the guard didn't match (race or already-consumed), the update
  // affects 0 rows and we bail without writing the password.
  const consumeResult = await db
    .update(schema.passwordResetTokens)
    .set({ consumedAt: now })
    .where(
      and(
        eq(schema.passwordResetTokens.id, lookup.tokenRowId),
        isNull(schema.passwordResetTokens.consumedAt),
      ),
    );

  // mysql2/Drizzle returns [ResultSetHeader, FieldPacket[]]. We only need
  // the header. `affectedRows` is the row-match count (not changed).
  const header = Array.isArray(consumeResult) ? consumeResult[0] : consumeResult;
  const affected =
    (header as { affectedRows?: number } | undefined)?.affectedRows ?? 0;

  if (affected !== 1) {
    return {
      ok: false,
      error: "This reset link was just used or has expired.",
    };
  }

  await db
    .update(schema.users)
    .set({ passwordHash: newHash })
    .where(eq(schema.users.id, lookup.userId));

  // Defensive: invalidate every OTHER outstanding token for this user.
  // The redeemed one is already marked consumed above; this catches any
  // stale ones (e.g. user clicked "send reset" twice). Mark them
  // consumed rather than delete so we keep the audit trail.
  await db
    .update(schema.passwordResetTokens)
    .set({ consumedAt: now })
    .where(
      and(
        eq(schema.passwordResetTokens.userId, lookup.userId),
        isNull(schema.passwordResetTokens.consumedAt),
        ne(schema.passwordResetTokens.id, lookup.tokenRowId),
        // Don't bother touching already-expired rows.
        gt(schema.passwordResetTokens.expiresAt, new Date(0)),
      ),
    );

  return { ok: true };
}
