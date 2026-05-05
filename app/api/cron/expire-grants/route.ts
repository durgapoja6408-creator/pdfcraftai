// /api/cron/expire-grants — nightly signup-grant expiry sweeper.
//
// Plan ref: docs/PRICING_AND_TELEMETRY_PLAN.md §8 layer 6.
//
// What this does
//   Scans credit_ledger for signup-grant rows where expires_at < NOW
//   AND the user still has a positive balance (i.e. the grant hasn't
//   already been spent). For each match, writes a debit row with
//   reason="signup_bonus_expired" and idempotency_key=
//   `signup_bonus_expired:${ledgerId}` so re-running the job is safe.
//   Net effect: the user's wallet is debited by exactly the amount
//   that was granted (clamped to current balance — never goes negative).
//
// Trigger
//   GET /api/cron/expire-grants?secret=<CRON_SECRET>
//   - Header `x-cron-secret: <CRON_SECRET>` also accepted.
//   - Returns 401 if secret missing/wrong.
//   - Returns 200 + { expired: N, debitedMicros: 0 } on success.
//
// Wire to cron
//   cron-job.org (recommended) — free, EU-hosted, sub-minute reliability.
//     URL:    https://pdfcraftai.com/api/cron/expire-grants?secret=<CRON_SECRET>
//     Method: GET
//     Schedule: 0 3 * * *  (daily at 03:00 UTC = 08:30 IST)
//   Hostinger panel cron — also works but coarser scheduling:
//     0 3 * * * curl -sS -H "x-cron-secret: $CRON_SECRET" \
//                    https://pdfcraftai.com/api/cron/expire-grants
//
// Idempotency + safety
//   - Idempotency key per ledger row → re-running on the same day
//     is a no-op (the second debit attempt finds the existing key
//     and returns { applied: false, reason: "duplicate" }).
//   - Debit clamped to user's current balance — if a user spent the
//     grant before expiry, we debit 0 (the grant was used; nothing
//     to claw back).
//   - Errors per-row don't abort the sweep; failures are logged +
//     counted in the response so cron monitoring can alert.
//
// Why not lazy expiry on read
//   Considered subtracting expired rows inline in getBalance() to
//   avoid the cron requirement entirely. Rejected: every balance
//   read would scan credit_ledger for the user's expired rows, which
//   amplifies the read-side cost on a query that fires on every page
//   load. The nightly sweep is O(grants/day) instead of O(reads/day)
//   — much cheaper at our scale.

import "server-only";

import type { NextRequest } from "next/server";
import { and, eq, gt, isNotNull, lte, sql } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { grantCredits } from "@/lib/payments/ledger";
// 2026-05-04 (PENDING §2b application-level escalation) — page the
// operator when per-row errors accumulate during a sweep. Single-row
// errors aren't cascading failures (severity "warn", not "alarm")
// because the sweep continues, but they shouldn't go unseen — a
// recurring per-row error is a sign of either a schema drift or a
// stuck row in credit_ledger. Helper is graceful no-op without env var.
import { sendSlackAlert } from "@/lib/ops/slack-alert";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

/**
 * Verify the request carries the configured CRON_SECRET. Accepts the
 * secret via either `?secret=` query param (convenient for cron-job.org
 * URL fields) or `x-cron-secret:` header (more secure — secret stays
 * out of access logs).
 *
 * Returns true when the secret is present + matches.
 */
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < 16) {
    // Fail-closed if CRON_SECRET is unset or trivially short. This
    // prevents accidentally exposing the endpoint when env vars are
    // misconfigured. Set CRON_SECRET to a 32+ char random string in
    // Hostinger panel before scheduling the cron.
    return false;
  }
  const header = req.headers.get("x-cron-secret");
  if (header && header === expected) return true;
  const url = new URL(req.url);
  const qs = url.searchParams.get("secret");
  if (qs && qs === expected) return true;
  return false;
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!isAuthorized(req)) {
    return json(401, { error: "auth_required" });
  }

  // Find all signup_bonus ledger rows that:
  //   1. have expires_at set (not NULL)
  //   2. expires_at <= NOW
  //   3. delta > 0 (only debit positive grants — refunds and prior
  //      expirations have negative or zero delta)
  // Also need to filter out rows we've already expired — handled via
  // idempotency_key on the debit insert (duplicate = skip).
  const expiredRows = await db
    .select({
      id: schema.creditLedger.id,
      userId: schema.creditLedger.userId,
      delta: schema.creditLedger.delta,
      expiresAt: schema.creditLedger.expiresAt,
    })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.reason, "signup_bonus"),
        isNotNull(schema.creditLedger.expiresAt),
        lte(schema.creditLedger.expiresAt, sql`NOW(3)`),
        gt(schema.creditLedger.delta, 0),
      ),
    );

  let expired = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  for (const row of expiredRows) {
    try {
      // Read user's current balance to clamp the debit. If the user
      // spent the grant already, we debit 0 (no claw-back from
      // legitimately-spent credits).
      const [bal] = await db
        .select({ balance: schema.credits.balance })
        .from(schema.credits)
        .where(eq(schema.credits.userId, row.userId))
        .limit(1);
      const currentBalance = bal?.balance ?? 0;
      const debitAmount = Math.min(row.delta, currentBalance);

      if (debitAmount <= 0) {
        // User spent the grant before expiry; nothing to claw back.
        // Still record the expiry attempt as "applied" for audit so
        // the next run skips this row.
        const result = await grantCredits({
          userId: row.userId,
          delta: 0,
          reason: "signup_bonus_expired_noop",
          note: `Signup bonus ${row.id} expired but balance was 0 — no debit`,
          idempotencyKey: `signup_bonus_expired:${row.id}`,
        });
        // grantCredits returns { applied: false, reason: "zero_delta" }
        // for delta=0; we count that as "skipped" (already-spent grants).
        if (!result.applied && result.reason === "duplicate") {
          // Already processed in a prior cron run.
          skipped++;
        } else {
          skipped++;
        }
        continue;
      }

      const result = await grantCredits({
        userId: row.userId,
        delta: -debitAmount,
        reason: "signup_bonus_expired",
        note: `Expired signup bonus from ledger ${row.id} (expired ${row.expiresAt?.toISOString() ?? "unknown"})`,
        idempotencyKey: `signup_bonus_expired:${row.id}`,
      });

      if (result.applied) {
        expired++;
      } else if (result.reason === "duplicate") {
        skipped++;
      } else {
        // zero_delta — defensive; shouldn't reach since debitAmount > 0.
        skipped++;
      }
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errorDetails.push(`row ${row.id}: ${msg}`);
      console.error(`[expire-grants] error processing ${row.id}:`, err);
      // Continue — single-row errors don't abort the sweep.
    }
  }

  // Log structured summary for ops review.
  console.log(
    JSON.stringify({
      event: "expire_grants_run",
      examined: expiredRows.length,
      expired,
      skipped,
      errors,
      ts: new Date().toISOString(),
    }),
  );

  // §2b — application-level escalation. Fire when per-row errors
  // accumulate; severity "warn" because single rows that fail don't
  // cascade (the sweep continues), but a recurring pattern needs eyes
  // on it. Helper is graceful no-op without env var.
  if (errors > 0) {
    const legacyOverride = process.env.AI_SPEND_ALERT_SLACK_URL || undefined;
    await sendSlackAlert(
      {
        severity: "warn",
        title: `Cron expire-grants: ${errors} per-row error(s)`,
        body:
          `Sweep examined ${expiredRows.length} row(s); ${errors} threw ` +
          `errors mid-process. Other rows completed normally (expired=` +
          `${expired}, skipped=${skipped}). Investigate stderr.log for ` +
          `the failing row IDs; recurring failures usually mean a ` +
          `credit_ledger schema drift or a stuck row.`,
        context: {
          examined: expiredRows.length,
          expired,
          skipped,
          errors,
          firstError: errorDetails[0]?.slice(0, 200) ?? null,
        },
      },
      legacyOverride ? { urlOverride: legacyOverride } : undefined,
    );
  }

  return json(200, {
    examined: expiredRows.length,
    expired,
    skipped,
    errors,
    ...(errorDetails.length > 0 && { errorDetails }),
  });
}
