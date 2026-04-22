// app/admin/page.tsx — Overview dashboard. The "is the business healthy
// right now?" landing page. Everything here is a SUMMARY; the detail
// pages linked from the nav provide the breakdown.
//
// Contract (from docs/roadmap/ADMIN_PAGES_CATALOG.md §1):
//   - 30d net revenue, 30d AI cost, 30d infra cost, 30d refund reserve,
//     30d breakage, net margin bps
//   - 30d green vs red days (gross-margin status from ai_daily_margin)
//   - 30d signups + fleet total
//
// Never-surface list is enforced by getOverviewSummary() not pulling
// per-provider or per-op data — that lives on /admin/costs where the
// query is already admin-scoped.

import Link from "next/link";
import { getOverviewSummary } from "@/lib/admin/queries";
import {
  bpsToPercent,
  formatCount,
  microsToCompactUsd,
  microsToUsd,
} from "@/lib/admin/format";
import { ErrorBanner, StatCard } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminOverviewPage() {
  const { data, error } = await getOverviewSummary();
  const greenRatio =
    data.last30dGreenDays + data.last30dRedDays > 0
      ? data.last30dGreenDays / (data.last30dGreenDays + data.last30dRedDays)
      : 0;

  return (
    <div>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Overview</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Business health at a glance — past 30 days.
        </p>
      </header>

      {error ? (
        <ErrorBanner message={`Overview query failed: ${error}`} />
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Net revenue (30d)"
          value={microsToCompactUsd(data.last30dNetRevenueMicros)}
          hint={`Gross ${microsToCompactUsd(data.last30dGrossChargeMicros)} − fee ${microsToCompactUsd(data.last30dProcessorFeeMicros)} − tax ${microsToCompactUsd(data.last30dTaxCollectedMicros)}`}
        />
        <StatCard
          label="AI cost (30d)"
          value={microsToCompactUsd(data.last30dAiCostMicros)}
          hint={`${formatCount(data.last30dCallCount)} calls`}
        />
        <StatCard
          label="Infra + reserve (30d)"
          value={microsToCompactUsd(
            data.last30dInfraCostMicros + data.last30dRefundReserveMicros
          )}
          hint={`Infra ${microsToCompactUsd(data.last30dInfraCostMicros)} + reserve ${microsToCompactUsd(data.last30dRefundReserveMicros)}`}
        />
        <StatCard
          label="Net margin (30d)"
          value={bpsToPercent(data.netMarginBps, { showSign: true })}
          hint={`Breakage credit ${microsToCompactUsd(data.last30dBreakageMicros)}`}
          tone={data.netMarginBps >= 0 ? "good" : "bad"}
        />
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Green days (30d)"
          value={`${data.last30dGreenDays} / ${data.last30dGreenDays + data.last30dRedDays}`}
          hint={`${Math.round(greenRatio * 100)}% green`}
          tone={greenRatio >= 0.9 ? "good" : greenRatio >= 0.6 ? "warn" : "bad"}
        />
        <StatCard
          label="Signups (30d)"
          value={formatCount(data.last30dSignups)}
          hint={`Fleet total ${formatCount(data.totalUsers)}`}
        />
        <StatCard
          label="Call volume (30d)"
          value={formatCount(data.last30dCallCount)}
          hint={`Unit cost ≈ ${data.last30dCallCount > 0 ? microsToUsd(Math.round(data.last30dAiCostMicros / data.last30dCallCount)) : "—"}`}
        />
      </section>

      <section className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Jump to detail</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn btn-sm" href="/admin/revenue">
            Revenue breakdown
          </Link>
          <Link className="btn btn-sm" href="/admin/costs">
            Cost waterfall
          </Link>
          <Link className="btn btn-sm" href="/admin/margin">
            Margin history
          </Link>
          <Link className="btn btn-sm" href="/admin/users">
            User P&amp;L
          </Link>
          <Link className="btn btn-sm" href="/admin/ops">
            Operation health
          </Link>
          <Link className="btn btn-sm" href="/admin/providers">
            Provider health
          </Link>
          <Link className="btn btn-sm" href="/admin/alarms">
            Alarms
          </Link>
        </div>
      </section>
    </div>
  );
}
