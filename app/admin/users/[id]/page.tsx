// app/admin/users/[id]/page.tsx — Per-user detail.
//
// Contract: full user identity (unmasked email, name, signup, balance,
// lifetime net revenue, lifetime AI cost, lifetime call count), recent
// 50 credit ledger rows, recent 50 ai_usage rows. No free-text PII
// beyond what's already in users.name / users.email.
//
// This page is the ONLY place the unmasked email is shown. The list
// on /admin/users masks it. Do not accidentally add a "copy all
// emails" export; that belongs behind a separate explicit admin
// action (not shipped in Task #18).

import { notFound } from "next/navigation";
import { getUserDetail } from "@/lib/admin/queries";
import {
  bpsToPercent,
  formatBool,
  formatCount,
  formatUtcDate,
  formatUtcDateTime,
  microsToUsd,
} from "@/lib/admin/format";
import {
  ErrorBanner,
  SectionTitle,
  StatCard,
  Td,
  Th,
  tableStyle,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminUserDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { data, error } = await getUserDetail({ userId: params.id });

  if (!data.user && !error) {
    notFound();
  }

  const lifetimeMarginBps =
    data.lifetime.netRevenueMicros > 0
      ? Math.round(
          ((data.lifetime.netRevenueMicros - data.lifetime.aiCostMicros) /
            data.lifetime.netRevenueMicros) *
            10_000
        )
      : null;

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          {data.user?.email ?? "(unknown user)"}
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          {data.user?.name ? `${data.user.name} — ` : null}
          joined {data.user ? formatUtcDate(data.user.createdAt) : "—"} — id{" "}
          <code style={{ fontSize: 12 }}>{params.id}</code>
        </p>
      </header>

      {error ? <ErrorBanner message={`User query failed: ${error}`} /> : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Credit balance"
          value={formatCount(data.user?.balance ?? 0)}
        />
        <StatCard
          label="Lifetime net revenue"
          value={microsToUsd(data.lifetime.netRevenueMicros)}
        />
        <StatCard
          label="Lifetime AI cost"
          value={microsToUsd(data.lifetime.aiCostMicros)}
          hint={`${formatCount(data.lifetime.callCount)} calls`}
        />
        <StatCard
          label="Lifetime margin"
          value={
            lifetimeMarginBps !== null
              ? bpsToPercent(lifetimeMarginBps, { showSign: true })
              : "—"
          }
          tone={
            lifetimeMarginBps === null
              ? undefined
              : lifetimeMarginBps >= 3000
                ? "good"
                : lifetimeMarginBps >= 0
                  ? "warn"
                  : "bad"
          }
        />
      </section>

      <section style={{ marginBottom: 24 }}>
        <SectionTitle>Recent credit ledger</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Reason</Th>
                <Th align="right">Delta</Th>
                <Th>Processor</Th>
                <Th>Currency</Th>
                <Th align="right">Gross</Th>
                <Th align="right">Net</Th>
              </tr>
            </thead>
            <tbody>
              {data.recentLedger.length === 0 ? (
                <tr>
                  <Td colSpan={7} align="center">
                    No ledger entries.
                  </Td>
                </tr>
              ) : (
                data.recentLedger.map((row) => (
                  <tr key={row.id}>
                    <Td mono>{formatUtcDateTime(row.createdAt)}</Td>
                    <Td>{row.reason}</Td>
                    <Td align="right" mono>{formatCount(row.delta)}</Td>
                    <Td>{row.provider ?? "—"}</Td>
                    <Td>{row.billingCurrency ?? "—"}</Td>
                    <Td align="right" mono>
                      {row.grossChargeMicros !== null
                        ? microsToUsd(row.grossChargeMicros)
                        : "—"}
                    </Td>
                    <Td align="right" mono>
                      {row.netRevenueMicros !== null
                        ? microsToUsd(row.netRevenueMicros)
                        : "—"}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionTitle>Recent AI usage</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Operation</Th>
                <Th>Provider</Th>
                <Th align="right">Credits</Th>
                <Th align="right">AI cost</Th>
                <Th align="center">Success</Th>
              </tr>
            </thead>
            <tbody>
              {data.recentUsage.length === 0 ? (
                <tr>
                  <Td colSpan={6} align="center">
                    No AI usage.
                  </Td>
                </tr>
              ) : (
                data.recentUsage.map((row) => (
                  <tr key={row.id}>
                    <Td mono>{formatUtcDateTime(row.createdAt)}</Td>
                    <Td>{row.operation}</Td>
                    <Td>{row.providerId}</Td>
                    <Td align="right" mono>{formatCount(row.creditsSpent)}</Td>
                    <Td align="right" mono>
                      {row.costMicros !== null ? microsToUsd(row.costMicros) : "—"}
                    </Td>
                    <Td align="center">
                      {formatBool(row.success === 1)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
