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

      {/* Categorized admin index. Operators landed here without a way
          to discover the 30+ admin sub-routes built since this page
          was last refreshed (referrals, feature-flags, quality-signals,
          dunning, contact-submissions, ai-feedback, etc. were all
          reachable only by typing URLs directly). Groups below mirror
          how the underlying tables relate, not how they got built. */}

      <ADMIN_GROUP
        title="Money & revenue"
        description="Per-period financials, fees, refunds, and reconciliation."
        links={[
          ["Revenue breakdown", "/admin/revenue"],
          ["Cost waterfall", "/admin/costs"],
          ["Margin history", "/admin/margin"],
          ["Transactions", "/admin/transactions"],
          ["Refunds", "/admin/refunds"],
          ["Chargebacks", "/admin/chargebacks"],
          ["Reconciliation", "/admin/reconcile"],
          ["Plans & SKUs", "/admin/plans"],
          ["Invoicing", "/admin/invoicing"],
          ["FX rates", "/admin/fx"],
          ["Tax", "/admin/tax"],
        ]}
      />

      <ADMIN_GROUP
        title="Customers"
        description="Per-user activity, credits, and inbound contacts."
        links={[
          ["User P&L", "/admin/users"],
          ["Credit ledger", "/admin/credits"],
          ["Contact submissions", "/admin/contact-submissions"],
          ["Organizations", "/admin/orgs"],
        ]}
      />

      <ADMIN_GROUP
        title="AI quality & tools"
        description="Provider routing, op-level performance, and quality signals from real users."
        links={[
          ["Operation health", "/admin/ops"],
          ["Provider health", "/admin/providers"],
          ["Router config", "/admin/router"],
          ["Tools catalog", "/admin/tools"],
          ["Prompts library", "/admin/prompts"],
          ["AI feedback (↑↓)", "/admin/ai-feedback"],
          ["Quality signals (per-user)", "/admin/quality-signals"],
        ]}
      />

      <ADMIN_GROUP
        title="Growth"
        description="Acquisition surface — promo codes and referral attribution."
        links={[
          ["Referrals", "/admin/referrals"],
          ["Promo codes", "/admin/promos"],
        ]}
      />

      <ADMIN_GROUP
        title="Trust & safety"
        description="Abuse layers, fraud signals, dunning posture, compliance posture."
        links={[
          ["Abuse signals", "/admin/abuse-signals"],
          ["Fraud", "/admin/fraud"],
          ["Dunning", "/admin/dunning"],
          ["Rate limits", "/admin/rate-limits"],
          ["Compliance", "/admin/compliance"],
        ]}
      />

      <ADMIN_GROUP
        title="System & operations"
        description="Live system health, alarms, deploys, logs."
        links={[
          ["Alarms", "/admin/alarms"],
          ["Logs", "/admin/logs"],
          ["Deploy state", "/admin/deploy"],
        ]}
      />

      <ADMIN_GROUP
        title="Operator config"
        description="Knobs operators flip without a code change. Feature flags drive percent rollouts via env vars."
        links={[["Feature flags", "/admin/feature-flags"]]}
      />
    </div>
  );
}

/**
 * Section wrapper for the admin index. Two-line header (title +
 * description) followed by a wrapping flex of pill-style links.
 * Inline-defined here rather than promoted to `components/admin/ui.tsx`
 * because this index is the only consumer; if a second page wants the
 * same layout, hoist then.
 */
function ADMIN_GROUP({
  title,
  description,
  links,
}: {
  title: string;
  description: string;
  links: Array<[label: string, href: string]>;
}) {
  return (
    <section className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div
        className="muted"
        style={{ fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}
      >
        {description}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {links.map(([label, href]) => (
          <Link key={href} className="btn btn-sm" href={href}>
            {label}
          </Link>
        ))}
      </div>
    </section>
  );
}
