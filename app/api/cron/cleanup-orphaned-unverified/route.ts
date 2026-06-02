// /api/cron/cleanup-orphaned-unverified — daily cleanup of
// abandoned-unverified user rows (PENDING gap, 2026-05-07).
//
// Why this cron exists
// --------------------
// Users who sign up but never click the verification link (or
// never type the OTP) accumulate as orphan rows: email_verified
// IS NULL forever. Two problems:
//
//   1. Email squatting: their email occupies the UNIQUE constraint
//      on users.email + users.email_normalized. A genuine future
//      user who tries to sign up with the same email gets the
//      no-enumeration "couldn't create account" error and has no
//      recovery path other than support tickets.
//
//   2. Cleanup hygiene: pre-launch test accounts (created during
//      development) accumulate in prod with email_verified=NULL,
//      polluting analytics.
//
// What this deletes
// -----------------
// Users matching ALL of:
//   - email_verified IS NULL (never confirmed control of email)
//   - created_at < NOW() - INTERVAL N DAYS
//     (default N=30, configurable via ORPHAN_CLEANUP_DAYS)
//   - id NOT IN (SELECT user_id FROM credit_ledger)
//     (defense — never delete an account that has financial
//     activity, even if email is technically unverified)
//
// FK CASCADE on users.id deletes child rows: accounts (OAuth),
// sessions, verification_tokens, verification_codes,
// password_reset_tokens, credits (singleton), api_keys, ai_usage,
// files, ai_outputs, etc.
//
// Auth: same CRON_SECRET pattern as the other cron routes.
// Idempotent — re-running just deletes 0 rows on the second pass
// because the previous pass already cleaned them.

import { db, schema } from "@/db/client";
import { and, isNull, lt, notInArray, sql } from "drizzle-orm";

import { sendSlackAlert } from "@/lib/ops/slack-alert";
import { timingSafeStrEqual } from "@/lib/auth/timing-safe-equal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseDays(): number {
  const raw = process.env.ORPHAN_CLEANUP_DAYS;
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < 7 || n > 365) {
    return 30; // safe default
  }
  return Math.floor(n);
}

export async function GET(req: Request): Promise<Response> {
  // Auth: same CRON_SECRET shape as other crons
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return json(500, {
      error: "cron_secret_not_configured",
      detail: "CRON_SECRET env var must be set on the host.",
    });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (!timingSafeStrEqual(auth, `Bearer ${expectedSecret}`)) {
    return json(401, { error: "unauthorized" });
  }

  const days = parseDays();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    // 1. Find candidate user-ids: unverified + older than cutoff
    const candidates = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          isNull(schema.users.emailVerified),
          lt(schema.users.createdAt, cutoff),
        ),
      );

    if (candidates.length === 0) {
      return json(200, {
        ok: true,
        deleted: 0,
        cutoff: cutoff.toISOString(),
        days,
      });
    }

    const candidateIds = candidates.map((r) => r.id);

    // 2. Of those, find which have any credit_ledger activity
    //    (including signup_bonus grants — yes, even those count;
    //    we don't want to silently delete accounts that received
    //    bonus credits even if they later never verified). FK
    //    cascade would clean them anyway, but the audit trail
    //    matters for any future financial reconciliation.
    const withFinancialActivity = await db
      .selectDistinct({ userId: schema.creditLedger.userId })
      .from(schema.creditLedger)
      .where(
        sql`${schema.creditLedger.userId} IN (${sql.join(
          candidateIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    const protectedIds = new Set(
      withFinancialActivity.map((r) => r.userId),
    );

    const toDelete = candidateIds.filter((id) => !protectedIds.has(id));
    if (toDelete.length === 0) {
      return json(200, {
        ok: true,
        deleted: 0,
        candidates: candidateIds.length,
        protected: protectedIds.size,
        cutoff: cutoff.toISOString(),
        days,
      });
    }

    // 3. Delete. FK CASCADE handles all children.
    const before = toDelete.length;
    await db.delete(schema.users).where(
      sql`${schema.users.id} IN (${sql.join(
        toDelete.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );

    // Slack alert at non-trivial volumes — gives ops a heads-up
    // if the cleanup ever spikes (could indicate registration
    // flow regressed and stopped sending verification emails)
    if (before >= 50) {
      try {
        await sendSlackAlert({
          severity: "info",
          title: `Orphaned-unverified cleanup ran: ${before} users deleted`,
          body: `Cutoff: ${cutoff.toISOString()} (${days}d). Candidates: ${candidates.length}. Protected (financial activity): ${protectedIds.size}. Deleted: ${before}.`,
        });
      } catch (slackErr) {
        // Slack failure doesn't fail the cron; log and continue
        console.error(
          JSON.stringify({
            event: "cleanup_slack_alert_failed",
            error: slackErr instanceof Error ? slackErr.message : String(slackErr),
            ts: new Date().toISOString(),
          }),
        );
      }
    }

    return json(200, {
      ok: true,
      deleted: before,
      candidates: candidates.length,
      protected: protectedIds.size,
      cutoff: cutoff.toISOString(),
      days,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "cleanup_orphaned_unverified_failed",
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }),
    );
    return json(500, { error: "internal" });
  }
}
