// app/admin/reconcile/page.tsx — payment reconciliation runner.
//
// Why this page exists:
// The nightly cron logs its report to console.log only — there's no
// durable record once the workers recycle. Operators investigating
// "did the reverse sweep recover anything overnight?" had to either
// SSH and tail logs, or wait for the next morning's run.
//
// This page wraps `runReconciliation()` in an admin-gated POST and
// renders the resulting ReconciliationReport inline — including the
// new reverseSweep stats from Task #24. Each click is a fresh sweep,
// so it's also a useful tool for after-the-fact incident investigation
// (e.g. "Razorpay had an outage 6h ago — did we miss any captures?").
//
// Auth: requireAdmin() in this server component renders the page
// (notFound() to non-admins). The `Run` button POSTs to
// /api/admin/reconcile, which also requires admin — same gate, so
// the click is consistent with what the page itself permits.

import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/guard";
import { ReconcileRunner } from "@/components/admin/ReconcileRunner";

export const metadata: Metadata = {
  title: "Reconcile",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminReconcilePage() {
  await requireAdmin();

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Reconcile</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          On-demand payment reconciliation across all configured providers.
          Runs the same logic as the nightly cron — forward sweep
          (provider → DB) plus reverse sweep (stale-pending DB rows →
          provider, Task #24).
        </p>
      </header>

      <section
        style={{
          padding: 16,
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>
          What this does
        </h2>
        <ul
          style={{
            margin: 0,
            paddingLeft: 20,
            fontSize: 13,
            color: "var(--fg-subtle)",
          }}
        >
          <li>
            <strong>Forward sweep</strong> walks each provider&apos;s recent
            transactions over the lookback window and matches against our{" "}
            <code>payments</code> table. Synthesizes ledger events for any
            tx where provider state ≠ DB state (caught webhooks we missed).
          </li>
          <li>
            <strong>Reverse sweep (Task #24)</strong> walks our{" "}
            <code>payments</code> table for <code>status=&apos;pending&apos;</code>{" "}
            rows aged 30 min – 14 days and asks the provider directly via{" "}
            <code>fetchPaymentStatus()</code>. Catches orders whose
            capture webhook never landed and the forward sweep missed.
          </li>
          <li>
            All actions flow through the same idempotent{" "}
            <code>applyPaymentEvent</code> ledger path the webhook handler
            uses. Running twice in quick succession is safe — duplicate
            ledger rows are rejected by the unique idempotencyKey index.
          </li>
        </ul>
      </section>

      <ReconcileRunner />
    </div>
  );
}
