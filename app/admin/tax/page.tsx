// app/admin/tax/page.tsx — Tax snapshot.
//
// Contract: aggregated `tax_collected_micros` / `tax_remittable_micros`
// from credit_ledger, broken down by treatment (mor / forward / rcm /
// unknown), currency, and day. Source: credit_ledger rows with
// tax_collected_micros populated.
//
// Treatment meanings (from lib/payments/tax.ts and the schema comment
// on credit_ledger.tax_treatment):
//
//   - "mor" (Merchant-of-Record): Paddle collects + remits on our
//     behalf. INVARIANT: tax_remittable_micros = 0. The "kept" column
//     for MoR rows equals the full collected amount because from OUR
//     books nothing is owed to a tax authority — Paddle invoices the
//     customer on their own name. (We still see `tax_collected_micros`
//     populated because it's the tax Paddle computed on the sale;
//     storing it lets us reconcile against Paddle's vendor reports.)
//
//   - "forward": we collected tax and owe it to the authority (Razorpay
//     IN rail: 18% IGST forwarded to GST Council). INVARIANT:
//     tax_remittable_micros = tax_collected_micros. Kept = 0.
//
//   - "rcm" (reverse-charge mechanism): B2B Indian buyer self-assesses;
//     we don't collect. Both columns should be 0.
//
//   - "unknown"/NULL: legacy rows pre-Task #15 schema. Shown for
//     completeness with a visible "unknown" bucket.
//
// Why a dedicated page:
// ---------------------
// This is the primary input to the CA's GSTR-1 / GSTR-3B filing, and
// the operator-side view of "are we over-collecting under MoR or
// under-remitting under forward". Task #23 sprouts a CSV export.

import { getTaxSnapshot } from "@/lib/admin/queries";
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

// Short human-readable labels for each treatment code, so the table
// reads "Merchant-of-Record" instead of "mor" at a glance. Unknown
// codes fall through to their raw string value.
const TREATMENT_LABELS: Record<string, string> = {
  mor: "Merchant-of-Record",
  forward: "Forward-to-authority",
  rcm: "Reverse-charge",
  unknown: "Unknown (legacy)",
};

function labelForTreatment(t: string): string {
  return TREATMENT_LABELS[t] ?? t;
}

export default async function AdminTaxPage({
  searchParams,
}: {
  searchParams?: { days?: string };
}) {
  const days = clampDays(searchParams?.days);
  const { data, error } = await getTaxSnapshot({ days });

  // Compute a soft invariant check so an operator can see at a glance
  // whether a MoR row has accidentally been marked remittable > 0
  // (would indicate a bug in the adapter populating credit_ledger).
  // We surface this as a banner rather than blocking, because the page
  // should still render for ops diagnosis.
  const morRow = data.byTreatment.find((r) => r.treatment === "mor");
  const morInvariantViolated = morRow != null && morRow.remittableMicros !== 0;

  const forwardRow = data.byTreatment.find((r) => r.treatment === "forward");
  const forwardInvariantViolated =
    forwardRow != null &&
    forwardRow.remittableMicros !== forwardRow.collectedMicros;

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Tax</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Past {days} days. Source: credit_ledger tax columns. MoR rows
          (Paddle) — collected but remittable = 0. Forward rows (Razorpay IN)
          — collected and fully owed to GST. Kept = collected − remittable.
        </p>
        <div style={{ marginTop: 12 }}>
          <DayPicker current={days} base="/admin/tax" />
        </div>
      </header>

      {error ? <ErrorBanner message={`Tax query failed: ${error}`} /> : null}
      {morInvariantViolated ? (
        <ErrorBanner
          message={`MoR invariant violated: tax_treatment='mor' rows have non-zero tax_remittable_micros (${microsToUsd(morRow!.remittableMicros)}). Under Merchant-of-Record, Paddle owns remittance — remittable MUST be 0. Check lib/payments/adapters/paddle.ts classification.`}
        />
      ) : null}
      {forwardInvariantViolated ? (
        <ErrorBanner
          message={`Forward invariant violated: tax_treatment='forward' rows have remittable != collected (${microsToUsd(forwardRow!.remittableMicros)} vs ${microsToUsd(forwardRow!.collectedMicros)}). Under forward, every paisa collected is owed. Check Razorpay adapter.`}
        />
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
          label="Tax-bearing txns"
          value={formatCount(data.txCount)}
        />
        <StatCard
          label="Collected"
          value={microsToCompactUsd(data.totalCollectedMicros)}
          hint="From customers"
        />
        <StatCard
          label="Remittable"
          value={microsToCompactUsd(data.totalRemittableMicros)}
          hint="We owe this to authority"
          tone={data.totalRemittableMicros > 0 ? "warn" : undefined}
        />
        <StatCard
          label="Kept"
          value={microsToCompactUsd(data.totalKeptMicros)}
          hint="Collected − remittable"
        />
      </section>

      <section style={{ marginBottom: 24 }}>
        <SectionTitle>By treatment</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Treatment</Th>
                <Th align="right">Txns</Th>
                <Th align="right">Collected</Th>
                <Th align="right">Remittable</Th>
                <Th align="right">Kept</Th>
              </tr>
            </thead>
            <tbody>
              {data.byTreatment.length === 0 ? (
                <tr>
                  <Td colSpan={5} align="center">
                    No tax-bearing rows in window.
                  </Td>
                </tr>
              ) : (
                data.byTreatment.map((row) => (
                  <tr key={row.treatment}>
                    <Td>{labelForTreatment(row.treatment)}</Td>
                    <Td align="right" mono>
                      {formatCount(row.txCount)}
                    </Td>
                    <Td align="right" mono>
                      {microsToUsd(row.collectedMicros)}
                    </Td>
                    <Td align="right" mono>
                      {microsToUsd(row.remittableMicros)}
                    </Td>
                    <Td align="right" mono>
                      {microsToUsd(row.keptMicros)}
                    </Td>
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
          <SectionTitle>By currency</SectionTitle>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Currency</Th>
                  <Th align="right">Txns</Th>
                  <Th align="right">Collected</Th>
                  <Th align="right">Remittable</Th>
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
                        {microsToUsd(row.collectedMicros)}
                      </Td>
                      <Td align="right" mono>
                        {microsToUsd(row.remittableMicros)}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <SectionTitle>Daily</SectionTitle>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th align="right">Txns</Th>
                  <Th align="right">Collected</Th>
                  <Th align="right">Remittable</Th>
                </tr>
              </thead>
              <tbody>
                {data.daily.length === 0 ? (
                  <tr>
                    <Td colSpan={4} align="center">
                      —
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
                        {microsToUsd(row.collectedMicros)}
                      </Td>
                      <Td align="right" mono>
                        {microsToUsd(row.remittableMicros)}
                      </Td>
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
