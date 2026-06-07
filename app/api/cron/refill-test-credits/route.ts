// /api/cron/refill-test-credits — keep the E2E test account(s) topped up.
//
// WHY
//   The post-deploy + weekly AI verification runs spend test credits
//   (~65/run). Rather than have a human remember to buy credits when the
//   test account runs dry — which would silently break the AI leg — this
//   cron tops the configured test identities back up to a floor. It's FREE
//   (a ledger grant, not a purchase); the only real spend is the AI API on
//   the verification runs themselves.
//
// SCOPE / SAFETY
//   - Only refills the user-IDs listed in `E2E_REFILL_USER_IDS` (comma-sep).
//     Unset -> the route is a NO-OP. It can NEVER grant to an arbitrary user.
//   - Header `x-cron-secret: <CRON_SECRET>` REQUIRED (same gate as the other
//     cron routes; header-only, never query-string — those leak to logs).
//     Fails closed if CRON_SECRET is unset/short.
//   - Idempotency key is bucketed per UTC-day, so the grant happens AT MOST
//     once per user per day no matter how often the route is hit.
//   - Only grants when balance < floor; if a user is already above the floor
//     it's skipped (no grant, no key consumed).
//
// TRIGGER (wire alongside the existing crons — no GitHub secret needed):
//   cron-job.org (recommended):
//     URL:    https://pdfcraftai.com/api/cron/refill-test-credits
//     Method: GET
//     Header: x-cron-secret: <CRON_SECRET>
//     Schedule: 0 1 * * *   (daily 01:00 UTC = 06:30 IST, before the runs)
//
// CONFIG (env, all optional except the user-IDs):
//   E2E_REFILL_USER_IDS       comma-separated user-IDs to keep topped up
//   E2E_REFILL_FLOOR_CREDITS  refill when balance < this (default 100)
//   E2E_REFILL_TARGET_CREDITS top up to this (default 500)

import "server-only";

import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { grantCredits } from "@/lib/payments/ledger";
import { timingSafeStrEqual } from "@/lib/auth/timing-safe-equal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  // Fail closed if the secret is unset or trivially short.
  if (!expected || expected.length < 16) return false;
  const header = req.headers.get("x-cron-secret");
  return Boolean(header && timingSafeStrEqual(header, expected));
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!isAuthorized(req)) {
    return json(401, { error: "auth_required" });
  }

  const ids = (process.env.E2E_REFILL_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // No configured targets -> deliberate no-op. The route never invents users.
  if (ids.length === 0) {
    return json(200, { configured: false, checked: 0, refilled: [], note: "E2E_REFILL_USER_IDS unset — no-op" });
  }

  const floor = parseIntEnv("E2E_REFILL_FLOOR_CREDITS", 100);
  const target = parseIntEnv("E2E_REFILL_TARGET_CREDITS", 500);
  const day = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD

  const refilled: Array<{ userId: string; from: number; to: number }> = [];
  const skipped: Array<{ userId: string; balance: number; reason: string }> = [];
  let errors = 0;
  const errorDetails: string[] = [];

  for (const userId of ids) {
    try {
      const [row] = await db
        .select({ balance: schema.credits.balance })
        .from(schema.credits)
        .where(eq(schema.credits.userId, userId))
        .limit(1);
      const balance = row?.balance ?? 0;

      if (balance >= floor) {
        skipped.push({ userId, balance, reason: "above_floor" });
        continue;
      }

      const delta = target - balance;
      if (delta <= 0) {
        skipped.push({ userId, balance, reason: "no_delta" });
        continue;
      }

      const result = await grantCredits({
        userId,
        delta,
        reason: "e2e_test_refill",
        note: `Auto top-up of E2E test account to ${target} (was ${balance})`,
        // Per-day key -> at most one refill per user per UTC day.
        idempotencyKey: `e2e_refill:${userId}:${day}`,
      });

      if (result.applied) {
        refilled.push({ userId, from: balance, to: result.newBalance });
      } else {
        // Already refilled today (duplicate) or zero_delta — not an error.
        skipped.push({ userId, balance, reason: result.reason ?? "not_applied" });
      }
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errorDetails.push(`${userId}: ${msg}`);
      console.error(`[refill-test-credits] error for ${userId}:`, err);
      // Continue — one bad id never aborts the others.
    }
  }

  console.log(
    JSON.stringify({
      event: "refill_test_credits_run",
      checked: ids.length,
      refilled: refilled.length,
      skipped: skipped.length,
      errors,
      floor,
      target,
      ts: new Date().toISOString(),
    }),
  );

  return json(200, {
    configured: true,
    checked: ids.length,
    floor,
    target,
    refilled,
    skipped,
    errors,
    ...(errorDetails.length > 0 && { errorDetails }),
  });
}
