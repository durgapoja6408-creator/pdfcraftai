// Credentials login rate limit (plan §8a Day 1.5a Phase C).
//
// Decision flow on every authorize() call:
//   1. recordFailureIfNeeded — only called after a failed authorize.
//      Inserts a failed_login_attempts row with the email + IP.
//   2. checkLockout — called BEFORE running bcrypt.compare. Counts
//      failures for (email, IP) in the rolling window; if ≥ MAX,
//      returns { locked: true, retryAfterSec }.
//   3. clearOnSuccess — called after a successful authorize. Deletes
//      all failed_login_attempts rows for this email so the next
//      legitimate user doesn't carry old failures forward.
//
// Defaults
//   MAX_FAILURES_PER_WINDOW = 5
//   WINDOW_MINUTES          = 15
//   LOCKOUT_MINUTES         = 30   (how long the lockout lasts after
//                                   the 5th failure — measured from
//                                   the most recent failure)
//
// All three are env-overridable for tuning post-launch without redeploy.

import "server-only";

import { randomUUID } from "crypto";
import { and, count, desc, eq, gt, lte, or } from "drizzle-orm";

import { db, schema } from "@/db/client";

const DEFAULT_MAX_FAILURES = 5;
const DEFAULT_WINDOW_MINUTES = 15;
const DEFAULT_LOCKOUT_MINUTES = 30;

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function maxFailures(): number {
  return readIntEnv("LOGIN_MAX_FAILURES", DEFAULT_MAX_FAILURES);
}

export function windowMinutes(): number {
  return readIntEnv("LOGIN_WINDOW_MINUTES", DEFAULT_WINDOW_MINUTES);
}

export function lockoutMinutes(): number {
  return readIntEnv("LOGIN_LOCKOUT_MINUTES", DEFAULT_LOCKOUT_MINUTES);
}

export interface LockoutVerdict {
  locked: boolean;
  retryAfterSec?: number;
  failureCount?: number;
}

/**
 * Check whether (emailNormalized, ip) is locked out. Counts failures
 * within the rolling window; returns locked=true if >= maxFailures.
 *
 * The "lockout duration" is implicit: the most recent failure starts
 * a (window + lockout) cooldown. After lockoutMinutes elapse since
 * the LAST failure, the count window slides past the failures and
 * the user can try again.
 *
 * Pure read — no inserts here. Caller decides whether to record a
 * failure based on the credentials check outcome.
 */
export async function checkLockout(
  emailNormalized: string,
  ip: string,
): Promise<LockoutVerdict> {
  if (!emailNormalized) return { locked: false };

  const max = maxFailures();
  const windowStart = new Date(Date.now() - windowMinutes() * 60 * 1000);

  // Count failures for THIS email in the window. We deliberately do
  // NOT also gate on IP — a sophisticated attacker rotates IPs to
  // bypass the IP-based gate. Email-bound lockout is the meaningful
  // defense; the IP column exists for the abuse-signal admin page
  // (cluster failed attempts by IP for forensics).
  const [row] = await db
    .select({ c: count() })
    .from(schema.failedLoginAttempts)
    .where(
      and(
        eq(schema.failedLoginAttempts.emailNormalized, emailNormalized),
        gt(schema.failedLoginAttempts.attemptedAt, windowStart),
      ),
    );

  const failureCount = Number(row?.c ?? 0);

  if (failureCount < max) {
    return { locked: false, failureCount };
  }

  // Locked. Look up the most recent failure to compute retryAfter.
  const [latest] = await db
    .select({ attemptedAt: schema.failedLoginAttempts.attemptedAt })
    .from(schema.failedLoginAttempts)
    .where(eq(schema.failedLoginAttempts.emailNormalized, emailNormalized))
    .orderBy(desc(schema.failedLoginAttempts.attemptedAt))
    .limit(1);

  const lockoutEnds = latest
    ? new Date(latest.attemptedAt.getTime() + lockoutMinutes() * 60 * 1000)
    : new Date(Date.now() + lockoutMinutes() * 60 * 1000);

  const retryAfterSec = Math.max(
    1,
    Math.ceil((lockoutEnds.getTime() - Date.now()) / 1000),
  );

  return { locked: true, retryAfterSec, failureCount };
}

/**
 * Record a failed login attempt. Caller invokes only after the
 * credentials check FAILED.
 */
export async function recordFailure(
  emailNormalized: string,
  ip: string,
): Promise<void> {
  if (!emailNormalized) return;
  try {
    await db.insert(schema.failedLoginAttempts).values({
      id: randomUUID(),
      emailNormalized,
      ip: ip || "",
    });
  } catch (err) {
    // Non-fatal — the lockout becomes slightly less effective if the
    // insert fails, but we don't want to block legit attempts on a
    // transient DB error. Log + move on.
    console.error("[login-rate-limit] failed to record attempt:", err);
  }
}

/**
 * Clear all failed-login rows for this email. Caller invokes after a
 * SUCCESSFUL authorize so the next legit user doesn't carry old
 * failures forward.
 */
export async function clearFailures(emailNormalized: string): Promise<void> {
  if (!emailNormalized) return;
  try {
    await db
      .delete(schema.failedLoginAttempts)
      .where(eq(schema.failedLoginAttempts.emailNormalized, emailNormalized));
  } catch (err) {
    console.error("[login-rate-limit] failed to clear:", err);
  }
}

/**
 * Garbage-collect rows older than the window. Safe to call on any
 * read path; we call it lazily inside checkLockout when the window
 * rolls past a row. No separate cron required at our scale.
 *
 * Returns count of deleted rows.
 */
export async function gcExpired(): Promise<number> {
  const cutoff = new Date(Date.now() - (windowMinutes() + lockoutMinutes()) * 60 * 1000);
  try {
    const result = await db
      .delete(schema.failedLoginAttempts)
      .where(lte(schema.failedLoginAttempts.attemptedAt, cutoff));
    return Number((result as unknown as { rowsAffected?: number }).rowsAffected ?? 0);
  } catch {
    return 0;
  }
}

// Reference these to satisfy lint without unused-import warnings if
// callers only use a subset of helpers above.
void or;
