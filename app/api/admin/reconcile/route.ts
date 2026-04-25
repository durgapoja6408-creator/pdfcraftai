// app/api/admin/reconcile/route.ts — admin-triggered reconciliation.
//
// Same `runReconciliation()` the nightly cron calls, but auth-gated by
// admin session instead of by CRON_SECRET. Used by /admin/reconcile to
// give operators on-demand visibility into the reverse-sweep behavior
// shipped in Task #24, without exposing the cron secret to anything
// browser-facing.
//
// Why a separate route:
// - The cron route's auth is "header carries the right secret" — fine
//   for unattended hits but inappropriate for human operators (we'd
//   end up plumbing the secret into the admin page, which broadens
//   the blast radius of any session-cookie or XSS leak).
// - The admin layout already gates /admin/* via requireAdmin(). Mirror
//   that for the API surface so the same admin session covers both
//   the page render and the action it triggers.
//
// Lookback / sweep budget defaults match the cron. An optional
// `?lookbackHours=N` query param lets operators widen the forward-sweep
// window for diagnosis (e.g. backfill after an outage); the reverse
// sweep's age window is fixed in reconcile.ts.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { runReconciliation } from "@/lib/payments/reconcile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Match the cron's headroom — a worst-case full sweep can take a minute
// or two against Razorpay's paginated /payments + reverse-sweep
// fetchPaymentStatus calls. Hostinger caps at 300s regardless.
export const maxDuration = 300;

export async function POST(req: Request) {
  // notFound() inside requireAdmin throws — non-admins never reach the
  // body of this handler.
  await requireAdmin();

  // Optional widened lookback for diagnostic runs.
  const url = new URL(req.url);
  const lookbackParam = url.searchParams.get("lookbackHours");
  const lookbackHours = lookbackParam ? Math.max(1, Math.min(168, parseInt(lookbackParam, 10) || 48)) : undefined;

  try {
    const report = await runReconciliation(lookbackHours ? { lookbackHours } : {});
    return NextResponse.json({ ok: true, report }, { status: 200 });
  } catch (err) {
    console.error("[admin-reconcile] run failed:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

// GET intentionally not implemented — reconciliation is a write
// operation (it can grant credits via synthesized capture events) and
// shouldn't be triggerable by a casual browser visit. POST + admin
// session is the right shape.
