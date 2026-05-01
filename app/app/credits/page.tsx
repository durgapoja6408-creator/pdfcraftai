// app/app/credits/page.tsx — Per-user credit ledger (their own rows only).
//
// Contract: shows the signed-in user the last 100 entries from their own
// credit_ledger. Columns:
//   - when (formatRelative)
//   - reason (humanized: "Credit pack", "AI usage", "Refund", …)
//   - delta (signed, +green / -subtle)
//   - note (free text, usually the operation name for "usage" rows)
//   - payment link (if the row is tied to a payment, link to /app/billing)
//
// Explicitly does NOT display: gross_charge_micros, processor_fee_micros,
// tax_*_micros, fx_rate_used, fx_slippage_micros, net_revenue_micros,
// card_fingerprint, data_source. Those are MoR/admin-only.
//
// Phase B/5 — Task #19.

import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getRecentCreditLedger, getUserBalance } from "@/lib/user/queries";
import {
  formatCredits,
  formatRelative,
  humanizeLedgerReason,
} from "@/lib/user/format";

export const metadata: Metadata = {
  title: "Credits",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_LIMIT = 100;

export default async function CreditsPage() {
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;
  if (!userId) redirect("/login?callbackUrl=%2Fapp%2Fcredits");

  const [{ data: rows, error: rowsError }, { data: bal, error: balError }] =
    await Promise.all([
      getRecentCreditLedger(userId, DEFAULT_LIMIT),
      getUserBalance(userId),
    ]);

  const errors = [rowsError, balError].filter((e): e is string => !!e);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 820 }}>
      <header>
        <div className="eyebrow" style={{ marginBottom: 6 }}>CREDITS</div>
        <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: 0 }}>
          Credit history
        </h1>
        <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          Every add or spend against your account. Most recent {DEFAULT_LIMIT} entries.
        </p>
      </header>

      {errors.map((e, i) => (
        <div
          key={i}
          role="alert"
          className="card"
          style={{
            padding: "10px 14px",
            borderColor: "#c00",
            background: "color-mix(in oklab, #c00 6%, transparent)",
            fontSize: 13,
          }}
        >
          Couldn’t load credit history: {e}
        </div>
      ))}

      <div className="card" style={{ padding: 20 }}>
        <div className="eyebrow" style={{ margin: 0 }}>Current balance</div>
        <div style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-0.02em" }}>
          {formatCredits(bal.balance)}{" "}
          <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>
            credits
          </span>
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
          <Link href="/pricing" className="btn btn-accent btn-sm">
            Top up
          </Link>
          <Link href="/app/usage" className="btn btn-ghost btn-sm">
            See usage
          </Link>
        </div>
      </div>

      <section>
        <h2 style={sectionTitleStyle}>History</h2>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Reason</Th>
                <Th align="right">Delta</Th>
                <Th>Note</Th>
                <Th>Payment</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <Td colSpan={5} align="center">
                    No ledger entries yet. Top up to get started.
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
                    <Td>{humanizeLedgerReason(row.reason)}</Td>
                    <Td mono align="right">
                      <DeltaCell delta={row.delta} />
                    </Td>
                    <Td>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {row.note ?? "—"}
                      </span>
                    </Td>
                    <Td mono>
                      {row.paymentId ? (
                        <Link
                          href="/app/billing"
                          style={{ color: "inherit", textDecoration: "underline" }}
                          title={`Payment ${row.paymentId}`}
                        >
                          view
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

function DeltaCell({ delta }: { delta: number }) {
  const pos = delta > 0;
  const sign = pos ? "+" : delta < 0 ? "−" : "";
  const abs = Math.abs(delta);
  return (
    <span style={{ color: pos ? "#2f855a" : "var(--fg-muted)", fontWeight: 500 }}>
      {sign}
      {formatCredits(abs)}
    </span>
  );
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--fg-subtle)",
  margin: "0 0 10px 0",
};

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
