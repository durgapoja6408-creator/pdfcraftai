// app/admin/chargebacks/page.tsx — Chargebacks surface.
//
// Phase D / Task #22 CLOSED the ingestion gap. The Paddle adapter at
// lib/payments/adapters/paddle.ts now dispatches adjustment actions
// three ways — "refund" → kind="refund", "chargeback" /
// "chargeback_warning" / "chargeback_reverse" → kind="chargeback", and
// everything else → kind="ignored". The ledger handler in
// lib/payments/ledger.ts:handleChargeback writes a negative-signed
// debit row tagged `provider = 'chargeback_reversal'` and flips the
// payment into refunded / partial_refund (the payments.status enum
// has no "chargeback" value yet — future migration).
//
// This page does a DOUBLE-READ: webhook_events (what Paddle SENT us,
// via the JSON path filter) and credit_ledger (what we ACTED on, via
// the provider tag). Healthy state: the two counts agree. If they
// drift — webhookCount > ledgerCount — we've got an ingestion bug
// and the banner fires.
//
// Why keep the webhook-events JSON path filter even after ingestion
// is wired?
// -----------------------------------------------------------------
// Two reasons:
//   1. Ground truth. webhook_events is the raw audit log, so it's the
//      authoritative "what Paddle says happened". credit_ledger is
//      our downstream mirror.
//   2. Drift detection. If the ingestion pipeline silently breaks
//      (bad deploy, schema mismatch, SQL error swallowed), the
//      webhook count will keep climbing while the ledger count
//      flatlines — the banner catches that without requiring an
//      alarm rule.

import { getChargebacksSummary } from "@/lib/admin/queries";
import {
  formatCount,
  formatUtcDateTime,
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
          Past {days} days. Double-read: webhook_events (what Paddle sent)
          vs credit_ledger (what we booked, provider=
          <code style={{ margin: "0 4px" }}>chargeback_reversal</code>).
          Drift means ingestion is broken.
        </p>
        <div style={{ marginTop: 12 }}>
          <DayPicker current={days} base="/admin/chargebacks" />
        </div>
      </header>

      {/* Drift banner — fires ONLY when ledgerCount < webhookCount.
          Healthy state (both zero, or both equal and positive) keeps
          the banner off so the page reads calm on quiet days. */}
      {data.ingestionGap ? (
        <ErrorBanner
          message={`Ingestion drift: webhook_events contains ${data.webhookCount} chargeback event(s) but credit_ledger only shows ${data.ledgerCount} booked reversal(s). The ingestion pipeline may have silently broken — check /admin/logs for failed adapter runs and verify the Paddle adapter dispatch for chargeback/chargeback_warning/chargeback_reverse actions.`}
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
          label="Webhook events"
          value={formatCount(data.webhookCount)}
          hint="From webhook_events (ground truth)"
          tone={data.webhookCount > 0 ? "warn" : undefined}
        />
        <StatCard
          label="Ledger reversals"
          value={formatCount(data.ledgerCount)}
          hint="From credit_ledger"
          tone={data.ingestionGap ? "bad" : undefined}
        />
        <StatCard
          label="Gross reversed"
          value={microsToUsd(data.reversedGrossMicros)}
          hint={`Net ${microsToUsd(data.reversedNetMicros)}`}
          tone={data.reversedGrossMicros > 0 ? "warn" : undefined}
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
