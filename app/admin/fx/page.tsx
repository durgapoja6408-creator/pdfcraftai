// app/admin/fx/page.tsx — FX snapshot.
//
// Contract: one row per ledger entry where `fx_rate_used IS NOT NULL`
// — i.e. the row went through a USD<>INR conversion at capture time.
// Today that's exclusively the Razorpay (IN) rail; Paddle (USD) rows
// have NULL fx_rate_used because no conversion happened.
//
// Why a dedicated page instead of a column on /admin/revenue?
// -----------------------------------------------------------
// FX slippage (the difference between the rate we quoted the customer
// and the benchmark mid-market rate at capture) drifts silently.
// Revenue looks fine, margin looks fine, but we're slowly leaking
// money on a stale rate feed. Surfacing it here lets the operator
// spot "today's daily slippage is 3x yesterday's" before it
// compounds into a real loss — same reasoning as why refund-rate
// gets its own page.
//
// Legacy rows (pre-Task #15) carry fx_rate_used = NULL. This page
// silently excludes them via `isNotNull(fxRateUsed)` — that's the
// honest thing to do: we don't have the data, so we don't pretend
// the conversion happened at USD_TO_INR_RATE.

import { getFxSnapshot } from "@/lib/admin/queries";
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

function formatRate(r: number | null): string {
  if (r === null) return "—";
  // 2 decimals is enough for USD/INR (~83.xx) and matches how Razorpay
  // surfaces rates on their vendor UI. Negative rates are nonsensical
  // but we pass through rather than lie.
  return r.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function slippageTone(slippageMicros: number): "good" | "warn" | "bad" | undefined {
  // Negative slippage = we took a loss. Anything worse than -$5 over
  // the window crosses into "look at it"; worse than -$50 is "fix the
  // feed now". These thresholds are round numbers for v1 — tune once
  // we have real volume on the IN rail.
  if (slippageMicros <= -50_000_000) return "bad";
  if (slippageMicros <= -5_000_000) return "warn";
  // Positive slippage (we beat the benchmark) is fine but unremarkable
  // — don't paint it green; it'll flip red when markets move.
  return undefined;
}

export default async function AdminFxPage({
  searchParams,
}: {
  searchParams?: { days?: string };
}) {
  const days = clampDays(searchParams?.days);
  const { data, error } = await getFxSnapshot({ days });

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>FX</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Past {days} days. Source: credit_ledger rows with fx_rate_used
          populated (Razorpay / IN rail). USD-only rows are excluded.
        </p>
        <div style={{ marginTop: 12 }}>
          <DayPicker current={days} base="/admin/fx" />
        </div>
      </header>

      {error ? (
        <ErrorBanner message={`FX query failed: ${error}`} />
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Converted transactions"
          value={formatCount(data.txCount)}
          hint="fx_rate_used IS NOT NULL"
        />
        <StatCard
          label="Total slippage"
          value={microsToCompactUsd(data.totalSlippageMicros)}
          hint="vs mid-market benchmark"
          tone={slippageTone(data.totalSlippageMicros)}
        />
        <StatCard
          label="Per-tx slippage"
          value={
            data.txCount > 0
              ? microsToUsd(Math.round(data.totalSlippageMicros / data.txCount))
              : "—"
          }
          hint="Mean across window"
        />
      </section>

      <section style={{ marginBottom: 24 }}>
        <SectionTitle>Daily</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th align="right">Txns</Th>
                <Th align="right">Slippage</Th>
                <Th align="right">Avg rate</Th>
              </tr>
            </thead>
            <tbody>
              {data.daily.length === 0 ? (
                <tr>
                  <Td colSpan={4} align="center">
                    No FX conversions in window.
                  </Td>
                </tr>
              ) : (
                data.daily.map((row) => (
                  <tr key={row.date}>
                    <Td>{formatUtcDate(row.date)}</Td>
                    <Td align="right" mono>
                      {formatCount(row.txCount)}
                    </Td>
                    <Td align="right" mono>
                      {microsToUsd(row.slippageMicros)}
                    </Td>
                    <Td align="right" mono>
                      {formatRate(row.rateAvg)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionTitle>By currency</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Currency</Th>
                <Th align="right">Txns</Th>
                <Th align="right">Slippage</Th>
                <Th align="right">Avg rate</Th>
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
                    <Td align="right" mono>
                      {formatCount(row.txCount)}
                    </Td>
                    <Td align="right" mono>
                      {microsToUsd(row.slippageMicros)}
                    </Td>
                    <Td align="right" mono>
                      {formatRate(row.rateAvg)}
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
