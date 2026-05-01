// app/app/receipts/page.tsx — Captured-payment receipts (user-facing).
//
// Contract: lists payments where money actually moved (status IN
// ('captured', 'refunded', 'partial_refund')). Users see what they paid —
// the gross charge as it appeared on their card/bank statement. This is
// sourced from `payments.amount_minor`, which matches the provider's
// captured amount.
//
// Explicitly does NOT display:
//   - processor_fee_micros / tax_remittable_micros / fx_*  (admin-only)
//   - net_revenue_micros (admin-only)
//   - card fingerprint (PCI surface)
//
// PDF receipt downloads landed in Task #23 (Phase D). Each captured
// payment row has a "Download PDF" link that hits
// /api/invoices/[paymentId] and streams back a single-page A4 PDF
// invoice with the seller's legal name, GSTIN posture (pending or
// registered), and the right GST split (CGST+SGST intra-state / IGST
// inter-state / zero-rated export / reverse-charge). Buyer GSTIN
// collection (PART 2) lands with the /app/account migration.
//
// Phase B/5 — Task #19; Phase D — Task #23.

import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getReceipts } from "@/lib/user/queries";
import {
  formatCurrencyMinor,
  formatRelative,
  humanizeStatus,
  humanizePackId,
} from "@/lib/user/format";

export const metadata: Metadata = {
  title: "Receipts",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;

export default async function ReceiptsPage() {
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;
  if (!userId) redirect("/login?callbackUrl=%2Fapp%2Freceipts");

  const { data: rows, error } = await getReceipts(userId, DEFAULT_LIMIT);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 820 }}>
      <header>
        <div className="eyebrow" style={{ marginBottom: 6 }}>RECEIPTS</div>
        <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: 0 }}>
          Payment receipts
        </h1>
        <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          Every captured charge or refund. For pending or failed payments
          see{" "}
          <Link
            href="/app/billing"
            style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            billing
          </Link>
          .
        </p>
      </header>

      {error ? (
        <div
          role="alert"
          className="card"
          style={{
            padding: "10px 14px",
            borderColor: "#c00",
            background: "color-mix(in oklab, #c00 6%, transparent)",
            fontSize: 13,
          }}
        >
          Couldn’t load receipts: {error}
        </div>
      ) : null}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Item</Th>
              <Th>Processor</Th>
              <Th align="right">Amount</Th>
              <Th>Status</Th>
              <Th>Receipt</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <Td colSpan={6} align="center">
                  No receipts yet.{" "}
                  <Link
                    href="/pricing"
                    style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 2 }}
                  >
                    Buy credits →
                  </Link>
                </Td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <Td mono>
                    <span title={new Date(row.createdAt).toISOString()}>
                      {formatRelative(row.createdAt)}
                    </span>
                  </Td>
                  <Td>
                    {row.packId
                      ? humanizePackId(row.packId)
                      : row.planCode
                        ? `Plan: ${humanizePackId(row.planCode)}`
                        : "—"}
                  </Td>
                  <Td mono>{row.providerId}</Td>
                  <Td mono align="right">
                    {formatCurrencyMinor(row.amountMinor, row.currency)}
                  </Td>
                  <Td>
                    <StatusPill status={row.status} />
                  </Td>
                  <Td>
                    <a
                      href={`/api/invoices/${encodeURIComponent(row.id)}`}
                      style={{
                        color: "var(--accent)",
                        textDecoration: "underline",
                        textUnderlineOffset: 2,
                        fontSize: 12,
                      }}
                      title="Download a PDF invoice for this payment."
                    >
                      Download PDF
                    </a>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className="muted" style={{ fontSize: 12 }}>
        Amounts shown are the exact charge that appeared on your statement.
        Each row has a downloadable PDF invoice with tax treatment and
        (if registered) seller GSTIN. Buyer GSTIN entry for input-tax
        credit ships next. For anything urgent, email{" "}
        <a
          href="mailto:support@pdfcraftai.com"
          style={{ color: "var(--accent)" }}
        >
          support@pdfcraftai.com
        </a>
        .
      </footer>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const good = status === "captured";
  const warn = status === "partial_refund";
  const bad = status === "refunded";
  const tone = good ? "#2f855a" : warn ? "#b7791f" : bad ? "#b23b3b" : "var(--fg-subtle)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        color: tone,
        border: `1px solid ${tone}`,
        background: "var(--bg-2)",
      }}
    >
      {humanizeStatus(status)}
    </span>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
        fontWeight: 600,
        fontSize: 12,
        letterSpacing: "0.02em",
        color: "var(--fg-subtle)",
        textTransform: "uppercase",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  mono = false,
  colSpan,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        textAlign: align,
        padding: "10px 14px",
        borderTop: "1px solid var(--border)",
        fontFamily: mono ? "var(--font-mono, ui-monospace, monospace)" : undefined,
      }}
    >
      {children}
    </td>
  );
}
