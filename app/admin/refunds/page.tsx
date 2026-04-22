// app/admin/refunds/page.tsx — Refunds overview.
//
// Contract: refund volume, refund rate (bps against captured gross),
// daily/provider breakdowns, and the most recent 50 refund rows with
// click-through to the per-user page. Source: credit_ledger rows where
// `reason = 'refund'`.
//
// Why one page and not merged into /admin/revenue?
// ------------------------------------------------
// Refund rate is a distinct ops metric — operators watch it separately
// because a 0.5%→1% refund-rate swing doesn't move gross revenue much
// but signals a product / processor / fraud issue that needs acting on.
// Giving it its own surface means an alarm on refund-rate can link
// directly here instead of the operator landing on Revenue and
// scanning for the number.
//
// Refund-rate denominator choice: captured gross (not net). Card-scheme
// dashboards quote rates against gross, so parity with what the
// operator already sees on the Paddle/Razorpay vendor UIs wins over
// "net-revenue-relative" which would be mathematically cleaner but
// harder to cross-check.

import Link from "next/link";
import { getRefundsSummary } from "@/lib/admin/queries";
import {
  bpsToPercent,
  formatCount,
  formatRelative,
  formatUtcDate,
  maskEmail,
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

// Refund-rate tone thresholds (bps). Card schemes warn merchants at
// ~75 bps (0.75%) and trigger programs at ~100 bps (1%); we paint
// anything over 50 bps as warn and over 100 bps as bad so the operator
// reacts before the processor does.
const REFUND_RATE_WARN_BPS = 50;
const REFUND_RATE_BAD_BPS = 100;

function refundRateTone(bps: number): "good" | "warn" | "bad" | undefined {
  if (bps >= REFUND_RATE_BAD_BPS) return "bad";
  if (bps >= REFUND_RATE_WARN_BPS) return "warn";
  // 0 bps is "good" in the sense of "no money is leaking" but we don't
  // paint it green because a fresh window with no refunds is the
  // expected baseline — green would make the default state look like
  // an achievement.
  return undefined;
}

export default async function AdminRefundsPage({
  searchParams,
}: {
  searchParams?: { days?: string };
}) {
  const days = clampDays(searchParams?.days);
  const { data, error } = await getRefundsSummary({ days, limit: 50 });

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Refunds</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Past {days} days. Source: credit_ledger rows with reason =
          &quot;refund&quot;. Refund rate computed against captured gross in
          the same window.
        </p>
        <div style={{ marginTop: 12 }}>
          <DayPicker current={days} base="/admin/refunds" />
        </div>
      </header>

      {error ? (
        <ErrorBanner message={`Refunds query failed: ${error}`} />
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Refund count"
          value={formatCount(data.refundCount)}
        />
        <StatCard
          label="Refunded (gross)"
          value={microsToCompactUsd(Math.abs(data.refundedGrossMicros))}
          hint="Customer-facing amount"
        />
        <StatCard
          label="Refunded (net)"
          value={microsToCompactUsd(Math.abs(data.refundedNetMicros))}
          hint="Our reversed net revenue"
        />
        <StatCard
          label="Refund rate"
          value={bpsToPercent(data.refundRateBps, { showSign: false })}
          hint="|refund gross| / captured gross"
          tone={refundRateTone(data.refundRateBps)}
        />
        <StatCard
          label="Captured gross"
          value={microsToCompactUsd(data.capturedGrossMicros)}
          hint="Denominator"
        />
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
          <SectionTitle>Daily</SectionTitle>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th align="right">Count</Th>
                  <Th align="right">Refunded (net)</Th>
                </tr>
              </thead>
              <tbody>
                {data.daily.length === 0 ? (
                  <tr>
                    <Td colSpan={3} align="center">
                      No refunds in window.
                    </Td>
                  </tr>
                ) : (
                  data.daily.map((row) => (
                    <tr key={row.date}>
                      <Td>{formatUtcDate(row.date)}</Td>
                      <Td align="right" mono>
                        {formatCount(row.count)}
                      </Td>
                      <Td align="right" mono>
                        {microsToUsd(row.refundedMicros)}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <SectionTitle>By processor</SectionTitle>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Processor</Th>
                  <Th align="right">Count</Th>
                  <Th align="right">Refunded (net)</Th>
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
                      <Td align="right" mono>
                        {formatCount(row.count)}
                      </Td>
                      <Td align="right" mono>
                        {microsToUsd(row.refundedMicros)}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>Recent refunds (up to 50)</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>User</Th>
                <Th>Processor</Th>
                <Th>Currency</Th>
                <Th align="right">Gross</Th>
                <Th align="right">Fee</Th>
                <Th align="right">Tax</Th>
                <Th align="right">Net</Th>
                <Th>Note</Th>
              </tr>
            </thead>
            <tbody>
              {data.recent.length === 0 ? (
                <tr>
                  <Td colSpan={9} align="center">
                    No refund rows in window.
                  </Td>
                </tr>
              ) : (
                data.recent.map((row) => (
                  <tr key={row.id}>
                    <Td mono>{formatRelative(row.createdAt)}</Td>
                    <Td>
                      <Link
                        href={`/admin/users/${row.userId}`}
                        style={{ color: "inherit" }}
                      >
                        {maskEmail(row.userEmail)}
                      </Link>
                    </Td>
                    <Td>{row.provider ?? "—"}</Td>
                    <Td>{row.billingCurrency ?? "—"}</Td>
                    <Td align="right" mono>
                      {microsToUsd(row.grossChargeMicros)}
                    </Td>
                    <Td align="right" mono>
                      {microsToUsd(row.processorFeeMicros)}
                    </Td>
                    <Td align="right" mono>
                      {microsToUsd(row.taxCollectedMicros)}
                    </Td>
                    <Td align="right" mono>
                      {microsToUsd(row.netRevenueMicros)}
                    </Td>
                    <Td>{row.note ?? "—"}</Td>
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
