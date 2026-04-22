// app/admin/invoicing/page.tsx — Invoicing config + recent-invoice audit.
//
// Phase D / Task #23 PART 2.
//
// Two things the operator needs to know at a glance:
//
//   1. Is the seller identity configured correctly? Each
//      INVOICE_SELLER_* env var has a fallback default in
//      lib/invoicing/seller.ts, but the defaults only produce a
//      pre-GST-registration "GSTIN: pending registration" invoice.
//      Once a real GSTIN is issued (CA-owned work), the operator
//      pastes it into Hostinger env + redeploys. This page renders
//      the current resolved seller identity with visual flags for
//      every unset field.
//
//   2. Are recent invoices downloadable? We show the last 20
//      captured payments, each with its generated invoice number,
//      the amount, the currency, the buyer's userId, and a direct
//      link to /api/invoices/{id}. A failure to download is the
//      fastest operator signal that something on the PDF pipeline
//      broke (pdf-lib, ledger join, etc.).
//
// This page is READ-ONLY on purpose. All writes to the seller
// identity are env var changes (Hostinger control panel), not app-
// level writes — the seller GSTIN is a legal registration that the
// CA owns; we never want an operator to be able to flip it from the
// admin UI (audit trail goes through the env-change channel, not
// the app DB).

import Link from "next/link";
import { desc } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { getSellerIdentity } from "@/lib/invoicing/seller";
import { deriveInvoiceNumber } from "@/lib/invoicing/types";
import { formatCount, formatUtcDateTime } from "@/lib/admin/format";
import { formatCurrencyMinor } from "@/lib/user/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminInvoicingPage() {
  const seller = getSellerIdentity();

  const recent = await db
    .select({
      id: schema.payments.id,
      userId: schema.payments.userId,
      amountMinor: schema.payments.amountMinor,
      currency: schema.payments.currency,
      status: schema.payments.status,
      createdAt: schema.payments.createdAt,
    })
    .from(schema.payments)
    .orderBy(desc(schema.payments.createdAt))
    .limit(20);

  // A payment is only invoiceable after capture; `pending` / `failed` /
  // `cancelled` should surface as "not invoiceable" with the reason in
  // plain English so support staff don't chase a 409 response.
  function isInvoiceable(status: string): boolean {
    return status !== "pending" && status !== "failed" && status !== "cancelled";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <header>
        <div className="eyebrow" style={{ marginBottom: 6 }}>ADMIN / INVOICING</div>
        <h1 style={{ fontSize: 24, letterSpacing: "-0.01em", margin: 0 }}>
          Invoicing config + recent captures
        </h1>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Seller identity resolved from <span className="mono">INVOICE_SELLER_*</span> env
          vars. Change a value, redeploy, and refresh this page to verify.
        </p>
      </header>

      {/* ======================================================= */}
      {/* Seller identity card                                     */}
      {/* ======================================================= */}
      <section className="card" style={{ padding: 20 }}>
        <h2 style={sectionHeading}>Seller identity</h2>

        <Row label="Legal name" value={seller.legalName} />
        <Row label="Trade name" value={seller.tradeName} />
        <Row
          label="GSTIN"
          value={seller.gstin}
          missingHint="Pending CA-owned registration. Invoices print 'GSTIN: pending registration' until set."
        />
        <Row
          label="State code"
          value={
            seller.stateCode
              ? `${seller.stateCode} · ${seller.stateName ?? ""}`
              : null
          }
          missingHint="Required once GSTIN lands — drives CGST+SGST vs. IGST split for same-state buyers."
        />
        <Row
          label="PAN"
          value={seller.pan}
          missingHint="Printed on the invoice footer once set."
        />
        <Row
          label="SAC code"
          value={seller.sacCode}
          missingHint="Default 998313 (IT consulting & support). Override if your CA advises a different code."
        />
        <Row label="Contact email" value={seller.email} />
        <Row
          label="Address"
          value={
            seller.addressLines.length > 0
              ? seller.addressLines.join(", ")
              : null
          }
          missingHint="Up to 4 lines via INVOICE_SELLER_ADDRESS_1..4."
        />

        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: "var(--bg-2)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--fg-subtle)",
          }}
        >
          The seller GSTIN is a legal registration owned by the CA. This page
          is read-only — change env vars in Hostinger hPanel (Web App &rarr;
          Environment variables) and redeploy. The renderer picks up the new
          values on the next request.
        </div>
      </section>

      {/* ======================================================= */}
      {/* Invoice format preview                                   */}
      {/* ======================================================= */}
      <section className="card" style={{ padding: 20 }}>
        <h2 style={sectionHeading}>Invoice header logic</h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          The generated PDF uses one of three header titles depending on
          state of the seller GSTIN and the buyer-side classification:
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, margin: 0, paddingLeft: 20 }}>
          <li>
            <strong>&ldquo;Receipt&rdquo;</strong> — seller has no GSTIN set.
            Pre-registration era; we&rsquo;re emitting a transactional receipt,
            not a GST-compliant tax invoice. This is the current state.
          </li>
          <li>
            <strong>&ldquo;Tax Invoice&rdquo;</strong> — seller has a GSTIN
            and the buyer is India-domestic (classifyGst =
            intra_state / inter_state).
          </li>
          <li>
            <strong>&ldquo;Export Invoice&rdquo;</strong> — seller has a
            GSTIN but the buyer is outside India (classifyGst = export).
            Zero-rated under Section 16 of the IGST Act.
          </li>
        </ul>
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          Current seller GSTIN state:{" "}
          <strong style={{ color: seller.gstin ? "var(--green)" : "var(--accent)" }}>
            {seller.gstin ? `set (${seller.gstin})` : "not set — receipts only"}
          </strong>
        </p>
      </section>

      {/* ======================================================= */}
      {/* Recent invoices                                          */}
      {/* ======================================================= */}
      <section className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px 8px" }}>
          <h2 style={{ ...sectionHeading, marginBottom: 4 }}>
            Recent payments ({formatCount(recent.length)})
          </h2>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Last 20 captured or pending payments. Click the invoice number to
            download the generated PDF. Pending / failed / cancelled rows
            return 409 — invoices only generate for captured money.
          </p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              fontSize: 12,
              borderCollapse: "collapse",
              minWidth: 860,
            }}
          >
            <thead>
              <tr style={{ background: "var(--bg-2)" }}>
                <Th>Invoice #</Th>
                <Th>User ID</Th>
                <Th>Amount</Th>
                <Th>Status</Th>
                <Th>Captured</Th>
                <Th style={{ textAlign: "right" }}>PDF</Th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => {
                const invNum = deriveInvoiceNumber(r.id, r.createdAt.getTime());
                const invoiceable = isInvoiceable(r.status);
                return (
                  <tr
                    key={r.id}
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <Td className="mono">{invNum}</Td>
                    <Td className="mono" style={{ color: "var(--fg-subtle)" }}>
                      {r.userId.slice(0, 8)}…
                    </Td>
                    <Td className="mono">
                      {formatCurrencyMinor(r.amountMinor, r.currency)}
                    </Td>
                    <Td>
                      <StatusBadge status={r.status} />
                    </Td>
                    <Td style={{ color: "var(--fg-subtle)" }}>
                      {formatUtcDateTime(r.createdAt)}
                    </Td>
                    <Td style={{ textAlign: "right" }}>
                      {invoiceable ? (
                        <Link
                          href={`/api/invoices/${encodeURIComponent(r.id)}`}
                          className="btn btn-xs btn-outline"
                          prefetch={false}
                        >
                          Download PDF
                        </Link>
                      ) : (
                        <span className="subtle" style={{ fontSize: 11 }}>
                          not invoiceable
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
              {recent.length === 0 && (
                <tr>
                  <Td
                    style={{
                      padding: 24,
                      textAlign: "center",
                      color: "var(--fg-subtle)",
                    }}
                  >
                    No payments yet.
                  </Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ---------------- helpers ----------------

function Row({
  label,
  value,
  missingHint,
}: {
  label: string;
  value: string | null;
  missingHint?: string;
}) {
  const set = Boolean(value && value.length > 0);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "200px 1fr",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px dashed var(--border)",
        alignItems: "start",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>{label}</div>
      <div>
        {set ? (
          <span className="mono" style={{ fontSize: 13 }}>{value}</span>
        ) : (
          <>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 4,
                background: "var(--accent-soft)",
                color: "var(--accent)",
                fontWeight: 500,
              }}
            >
              not set
            </span>
            {missingHint && (
              <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 4 }}>
                {missingHint}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const bg =
    status === "captured" || status === "succeeded"
      ? "var(--green-soft, rgba(0,200,120,0.15))"
      : status === "pending"
      ? "var(--accent-soft)"
      : status === "refunded" || status === "partial_refund"
      ? "var(--bg-2)"
      : "var(--bg-2)";
  const fg =
    status === "captured" || status === "succeeded"
      ? "var(--green, #00a070)"
      : status === "pending"
      ? "var(--accent)"
      : status === "failed" || status === "cancelled"
      ? "var(--red)"
      : "var(--fg-subtle)";
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 4,
        background: bg,
        color: fg,
        fontWeight: 500,
      }}
    >
      {status}
    </span>
  );
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "8px 12px",
        fontSize: 11,
        fontWeight: 500,
        color: "var(--fg-subtle)",
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  style,
  className,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <td
      className={className}
      style={{
        padding: "10px 12px",
        ...style,
      }}
    >
      {children}
    </td>
  );
}

const sectionHeading: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  letterSpacing: "-0.005em",
  margin: "0 0 12px",
};
