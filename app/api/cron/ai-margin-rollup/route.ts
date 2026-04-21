// Daily AI margin rollup cron endpoint — Phase A4, MASTER_PLAN §7 gate #7.
//
// Trigger: Hostinger cron hits this URL shortly after midnight UTC each day
// with the shared `x-cron-secret` header. Same auth pattern as
// /api/cron/reconcile-payments so ops only has to configure ONE secret.
//
//   hPanel → Advanced → Cron Jobs (UTC times):
//     15 0 * * *  curl -H "x-cron-secret: $CRON_SECRET" \
//                      https://pdfcraftai.com/api/cron/ai-margin-rollup
//
// (00:15 UTC gives the previous day 15 minutes of tail-latency headroom
// before we close the window.)
//
// Side effects:
//   1. Upserts one row per (date, provider_id, model, operation) slice
//      into `ai_daily_margin`. Idempotent — re-runs overwrite rather
//      than duplicate.
//   2. If any slice is red (margin_bps < floor_bps) AND
//      AI_SPEND_ALERT_SLACK_URL is configured, posts a Slack alert.
//   3. Runs the three Tier 3 detect-point alarms (margin drift,
//      primary-share drop, dark routing) and posts them to Slack when
//      anything fires. Alarms don't flip the green-streak because they
//      surface regressions BEFORE they breach the margin floor; we
//      still want an operator to see them the morning after they land.
//   4. If the day is all-green AND the resulting streak is >= 7 days
//      (gate-close signal), posts a celebration Slack message.
//
// Response: the full DailyRollupReport JSON for the benefit of the cron
// log + ops dashboards.

import { NextResponse } from "next/server";
import {
  runDailyRollup,
  postMarginAlertToSlack,
} from "@/lib/ai/margin-rollup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Aggregating a day's ai_usage is measured in seconds even on busy days
// (one indexed GROUP BY + one bulk upsert). Keep the cap generous for
// safety — matches the reconcile-payments route's budget.
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

  // Optional `?date=YYYY-MM-DD` for manual backfills. Absent = yesterday
  // UTC (the default in runDailyRollup).
  const url = new URL(req.url);
  const explicitDate = url.searchParams.get("date") ?? undefined;

  try {
    const report = await runDailyRollup({ targetDate: explicitDate });

    // Emit to Hostinger's Node.js logs so ops has a durable record even
    // if Slack isn't wired.
    console.log(
      "[ai-margin-rollup] report",
      JSON.stringify({
        date: report.date,
        sliceCount: report.sliceCount,
        greenCount: report.greenCount,
        redCount: report.redCount,
        allGreen: report.allGreen,
        greenStreakDays: report.greenStreakDays,
        alarmCount: report.alarms.length,
        alarmKinds: report.alarms.map((a) => a.kind),
      })
    );

    // Slack emitter is a no-op if the webhook isn't configured; never
    // throws. We post on (1) red slices, (2) any Tier 3 detect-point
    // alarms (margin drift / primary-share / dark routing), or
    // (3) streak-hits-7 (gate-close celebration).
    const shouldPost =
      report.redCount > 0 ||
      report.alarms.length > 0 ||
      (report.allGreen && report.greenStreakDays >= 7);
    if (shouldPost) {
      await postMarginAlertToSlack(report);
    }

    return NextResponse.json(report, { status: 200 });
  } catch (err) {
    console.error("[ai-margin-rollup] run failed:", err);
    return NextResponse.json(
      { error: "margin_rollup_failed" },
      { status: 500 }
    );
  }
}
