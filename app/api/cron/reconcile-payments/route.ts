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
    return NextResponse.json(
      { error: "reconciliation_failed" },
      { status: 500 }
    );
  }
}
