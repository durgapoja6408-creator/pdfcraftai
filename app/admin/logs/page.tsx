// app/admin/logs/page.tsx — Recent webhook events.
//
// Contract: show the most recent webhook_events rows with raw provider
// event id + normalized kind so an operator can trace "this payment
// came in — did we receive the webhook?" without needing DB access.
//
// No reprocess button here on purpose. Webhook retries come from the
// processor side (Razorpay, etc.); our stored row is just the
// audit-log endpoint.

import Link from "next/link";
import { getWebhookLogs } from "@/lib/admin/queries";
import { formatRelative } from "@/lib/admin/format";
import {
  ErrorBanner,
  SectionTitle,
  Td,
  Th,
  tableStyle,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams?: { limit?: string };
}) {
  const limit = clampLimit(searchParams?.limit);
  const { data, error } = await getWebhookLogs({ limit });

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Webhook logs
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Most recent {limit} webhook_events rows across all processors.
        </p>
      </header>

      {error ? (
        <ErrorBanner message={`Webhook log query failed: ${error}`} />
      ) : null}

      <section>
        <SectionTitle>Recent events</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Processor</Th>
                <Th>Event type</Th>
                <Th>Normalized kind</Th>
                <Th>Provider event id</Th>
                <Th>Payment id</Th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <Td colSpan={6} align="center">
                    No webhook events recorded yet.
                  </Td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr key={row.id}>
                    <Td mono>{formatRelative(row.receivedAt)}</Td>
                    <Td>{row.providerId}</Td>
                    <Td mono>{row.eventType}</Td>
                    <Td>
                      <KindBadge kind={row.normalizedKind} />
                    </Td>
                    <Td mono>
                      <span title={row.providerEventId}>
                        {truncate(row.providerEventId, 32)}
                      </span>
                    </Td>
                    <Td mono>
                      {row.paymentId ? (
                        <Link
                          href={`/admin/transactions?limit=200`}
                          style={{ color: "inherit" }}
                          title={`Jump to transactions view — payment ${row.paymentId}`}
                        >
                          {truncate(row.paymentId, 24)}
                        </Link>
                      ) : (
                        "—"
                      )}
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

function clampLimit(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(Math.floor(n), 1000);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/**
 * Color-coded pill for the normalized-kind column. Kinds that represent
 * "money moved in" are green; "money moved out" (refunds, chargebacks)
 * are red; signals and state changes are neutral.
 */
function KindBadge({ kind }: { kind: string }) {
  const good = new Set(["payment.succeeded", "purchase.completed"]);
  const bad = new Set([
    "payment.refunded",
    "payment.failed",
    "charge.dispute.created",
    "chargeback.created",
  ]);
  const tone = good.has(kind)
    ? "#2f855a"
    : bad.has(kind)
      ? "#b23b3b"
      : "var(--fg-subtle)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 600,
        background: "var(--bg-2)",
        border: `1px solid ${tone}`,
        color: tone,
      }}
    >
      {kind}
    </span>
  );
}
