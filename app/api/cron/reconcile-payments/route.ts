// Nightly reconciliation cron endpoint.
//
// Trigger: Hostinger cron hits this URL once a day with a shared secret.
//   hPanel → Advanced → Cron Jobs:
//     0 3 * * *  curl -H "x-cron-secret: $CRON_SECRET" https://pdfcraftai.com/api/cron/reconcile-payments
//
// Auth: CRON_SECRET env var must match the `x-cron-secret` header. Anyone
// without the secret gets 401 — not 404, because a 404 would hide the
// endpoint from legitimate ops dashboards that check for it.

import { NextResponse } from "next/server";
import { runReconciliation } from "@/lib/payments/reconcile";
// 2026-05-04 (PENDING §2b application-level escalation) — page the
// operator when the reconcile cron throws. Graceful no-op without
// env var; activates when SLACK_OPS_WEBHOOK_URL or legacy
// AI_SPEND_ALERT_SLACK_URL is set.
import { sendSlackAlert } from "@/lib/ops/slack-alert";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Cursor-paginated provider /transactions scans across a 30-day window
// can take a minute at our volume; give ourselves headroom. Hostinger's
// Node hosting caps responses at 300s regardless.
export const maxDuration = 300;

export async function POST(req: Request) {
  return runCron(req);
}

// Also respond to GET so curl-based cron scripts don't need -X POST.
export async function GET(req: Request) {
  return runCron(req);
}

async function runCron(req: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }

  const provided = req.headers.get("x-cron-secret");
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const report = await runReconciliation();
    // Emit to Hostinger's Node.js logs so ops has a durable record even
    // if no alerting is wired up yet.
    console.log("[reconcile] report", JSON.stringify(report));
    return NextResponse.json(report, { status: 200 });
  } catch (err) {
    console.error("[reconcile] run failed:", err);
    // §2b — application-level escalation. Reconciliation failures
    // are higher-severity than ai-margin-rollup because they may
    // indicate a webhook+reconcile drift (PENDING §11a class) where
    // payments aren't being audited. Operator should drop everything
    // and look.
    const detail = err instanceof Error ? err.message : String(err);
    const legacyOverride = process.env.AI_SPEND_ALERT_SLACK_URL || undefined;
    await sendSlackAlert(
      {
        severity: "alarm",
        title: "Cron reconcile-payments failed",
        body:
          "Nightly payment reconciliation threw an exception. Until " +
          "the next successful run, recent payments may not be audited " +
          "against provider webhooks. Check Hostinger nodejs/stderr.log " +
          "for the stack trace and inspect /admin/chargebacks for any " +
          "stuck disputes.",
        context: {
          error: detail.slice(0, 200),
        },
      },
      legacyOverride ? { urlOverride: legacyOverride } : undefined,
    );
    return NextResponse.json(
      { error: "reconciliation_failed" },
      { status: 500 }
    );
  }
}
