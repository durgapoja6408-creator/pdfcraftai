// app/admin/revenue/page.tsx — Revenue breakdown.
//
// Contract: daily revenue (gross/net/tax/fee), by processor, by
// billing currency. Read from credit_ledger — the source-of-truth
// table populated by the Paddle (and later Razorpay) webhook handlers.

import { getRevenueBreakdown } from "@/lib/admin/queries";
import {
  formatCount,
  formatUtcDate,
  microsToCompactUsd,
  microsToUsd,
} from "@/lib/admin/format";
import {
  DayPicker,
  ErrorBanner,
  SectionTitle,
  StatCard,
  Td,
  Th,
  clampDays,
  tableStyle,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminRevenuePage({
  searchParams,
}: {
  searchParams?: { days?: string };
}) {
  const days = clampDays(searchParams?.days);
  const { data, error } = await getRevenueBreakdown({ days });

  const totalGross = data.daily.reduce((s, r) => s + r.grossMicros, 0);
  const totalNet = data.daily.reduce((s, r) => s + r.netMicros, 0);
  const totalFee = data.daily.reduce((s, r) => s + r.feeMicros, 0);
  const totalTax = data.daily.reduce((s, r) => s + r.taxMicros, 0);
  const totalTx = data.daily.reduce((s, r) => s + r.txCount, 0);

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Revenue</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Past {days} days. Source: credit_ledger.
        </p>
        <div style={{ marginTop: 12 }}>
          <DayPicker current={days} base="/admin/revenue" />
        </div>
      </header>

      {error ? (
        <ErrorBanner message={`Revenue query failed: ${error}`} />
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard label="Gross charge" value={microsToCompactUsd(totalGross)} />
        <StatCard label="Processor fee" value={microsToCompactUsd(totalFee)} />
        <StatCard label="Tax collected" value={microsToCompactUsd(totalTax)} />
        <StatCard label="Net revenue" value={microsToCompactUsd(totalNet)} />
        <StatCard label="Transactions" value={formatCount(totalTx)} />
      </section>

      <section style={{ marginBottom: 24 }}>
        <SectionTitle>Daily</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th align="right">Gross</Th>
                <Th align="right">Fee</Th>
                <Th align="right">Tax</Th>
                <Th align="right">Net</Th>
                <Th align="right">Txns</Th>
              </tr>
            </thead>
            <tbody>
              {data.daily.length === 0 ? (
                <tr>
                  <Td colSpan={6} align="center">
                    No transactions in window.
                  </Td>
                </tr>
              ) : (
                data.daily.map((row) => (
                  <tr key={row.date}>
                    <Td>{formatUtcDate(row.date)}</Td>
                    <Td align="right" mono>{microsToUsd(row.grossMicros)}</Td>
                    <Td align="right" mono>{microsToUsd(row.feeMicros)}</Td>
                    <Td align="right" mono>{microsToUsd(row.taxMicros)}</Td>
                    <Td align="right" mono>{microsToUsd(row.netMicros)}</Td>
                    <Td align="right" mono>{formatCount(row.txCount)}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <SectionTitle>By processor</SectionTitle>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Processor</Th>
                  <Th align="right">Net</Th>
                  <Th align="right">Txns</Th>
                </tr>
              </thead>
              <tbody>
                {data.byProvider.length === 0 ? (
                  <tr>
                    <Td colSpan={3} align="center">
                      —
                    </Td>
                  </tr>
                ) : (
                  data.byProvider.map((row) => (
                    <tr key={row.provider}>
                      <Td>{row.provider}</Td>
                      <Td align="right" mono>{microsToUsd(row.netMicros)}</Td>
                      <Td align="right" mono>{formatCount(row.txCount)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <SectionTitle>By billing currency</SectionTitle>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Currency</Th>
                  <Th align="right">Gross</Th>
                  <Th align="right">Net</Th>
                  <Th align="right">Txns</Th>
                </tr>
              </thead>
              <tbody>
                {data.byCurrency.length === 0 ? (
                  <tr>
                    <Td colSpan={4} align="center">
                      —
                    </Td>
                  </tr>
                ) : (
                  data.byCurrency.map((row) => (
                    <tr key={row.currency}>
                      <Td>{row.currency}</Td>
                      <Td align="right" mono>{microsToUsd(row.grossMicros)}</Td>
                      <Td align="right" mono>{microsToUsd(row.netMicros)}</Td>
                      <Td align="right" mono>{formatCount(row.txCount)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
