// app/admin/chargebacks/page.tsx — Chargebacks surface.
//
// HONEST STATE: the Paddle adapter at lib/payments/adapters/paddle.ts:366
// currently skips any adjustment whose `action !== "refund"`, so
// chargebacks (and the related "credit" action) don't land in
// `credit_ledger` — they just get stamped as `normalized_kind = 'ignored'`
// in `webhook_events` and the raw payload sits there carrying the
// `data.action = 'chargeback'` tag.
//
// This page reads DIRECTLY from `webhook_events` via a JSON path filter
// so an operator can at least SEE what's arriving today, even if
// nothing downstream acts on it. The ingestion gap is spelled out in
// a banner at the top of the page — "here's what's coming in, but
// we're not yet reversing credits or updating the payment row; Task
// #22 closes the gap".
//
// Why not wait until Task #22 before shipping a page?
// ---------------------------------------------------
// Because an operator who doesn't know chargebacks exist in the
// webhook firehose is going to be surprised when the first one
// arrives and costs $15–$25 in fees. Surfacing the raw count with
// the caveat is strictly better than zero visibility.

import { getChargebacksSummary } from "@/lib/admin/queries";
import {
  formatCount,
  formatUtcDateTime,
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

export default async function AdminChargebacksPage({
  searchParams,
}: {
  searchParams?: { days?: string };
}) {
  const days = clampDays(searchParams?.days);
  const { data, error } = await getChargebacksSummary({ days, limit: 100 });

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Chargebacks
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Past {days} days. Source: webhook_events (raw payload) filtered by
          <code style={{ margin: "0 4px" }}>
            $.data.action = &quot;chargeback&quot;
          </code>
          .
        </p>
        <div style={{ marginTop: 12 }}>
          <DayPicker current={days} base="/admin/chargebacks" />
        </div>
      </header>

      {/* Ingestion-gap banner — painted even when count is 0, because
          the gap exists regardless of whether a chargeback has fired
          yet. Use bad-toned ErrorBanner so the operator treats this
          as a known-debt notice, not a transient failure. */}
      {data.ingestionGap ? (
        <ErrorBanner
          message={
            'Ingestion gap: the Paddle adapter currently skips adjustments with action != "refund", so chargebacks are NOT yet written to credit_ledger. Credits are not auto-reversed, payment status is not updated, and refund reserve does not react. This page reads directly from webhook_events so you can SEE what is arriving; Task #22 (Phase D degradation UX + dunning) will close the gap. Raw payload is available on /admin/logs.'
          }
        />
      ) : null}

      {error ? (
        <ErrorBanner message={`Chargebacks query failed: ${error}`} />
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
          label="Chargeback events"
          value={formatCount(data.count)}
          hint="From webhook_events"
          tone={data.count > 0 ? "warn" : undefined}
        />
        <StatCard
          label="Ledger-reflected"
          value="0"
          hint="Until Task #22"
          tone={data.count > 0 ? "bad" : undefined}
        />
        <StatCard
          label="Ingestion status"
          value="Gap open"
          hint="See banner above"
          tone="warn"
        />
      </section>

      <section>
        <SectionTitle>Recent chargeback events</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Received</Th>
                <Th>Provider</Th>
                <Th>Event type</Th>
                <Th>Normalized kind</Th>
                <Th>Provider event ID</Th>
                <Th>Payment ID</Th>
              </tr>
            </thead>
            <tbody>
              {data.recent.length === 0 ? (
                <tr>
                  <Td colSpan={6} align="center">
                    No chargeback events in window.
                  </Td>
                </tr>
              ) : (
                data.recent.map((row) => (
                  <tr key={row.id}>
                    <Td mono>{formatUtcDateTime(row.receivedAt)}</Td>
                    <Td>{row.providerId}</Td>
                    <Td>{row.eventType}</Td>
                    <Td mono>{row.normalizedKind}</Td>
                    <Td mono>{row.providerEventId}</Td>
                    <Td mono>{row.paymentId ?? "—"}</Td>
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
