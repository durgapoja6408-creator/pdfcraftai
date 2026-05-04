// app/admin/layout.tsx — shared chrome for every /admin/* page.
//
// Why a layout and not a per-page call?
// --------------------------------------
// The admin surface is 14 pages. Duplicating the "await requireAdmin()
// + render sidebar" block 14 times invites drift — one page skipping
// the gate, another rendering a slightly different sidebar, a third
// using the wrong logout href, etc. Centralising here means:
//
//   1. Gate runs ONCE per request (Next.js de-duplicates auth() inside
//      a single render pass).
//   2. Sidebar nav is one source of truth — adding a new admin page
//      means two edits (the page + one line in this nav), not three.
//   3. Any non-admin who lands on any /admin/* URL gets the SAME 404
//      response, so the surface footprint is perfectly consistent.
//
// Why inline CSS + `var(...)` instead of tailwind / module CSS?
// -------------------------------------------------------------
// The marketing/app parts of the site established an inline-CSS-with-
// CSS-vars convention (see app/app/dashboard/page.tsx) so admin pages
// match the rest of the product instead of looking like a bolted-on
// ops console. The CSS vars (--bg-2, --border, --fg-subtle) are
// defined in app/globals.css and respond to the site-wide theme.

import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";

export const metadata: Metadata = {
  title: "Admin",
  // Absolutely no search-engine indexing on the admin surface. The 404
  // posture on non-admin access already prevents public discovery;
  // robots noindex is belt-and-braces.
  robots: { index: false, follow: false, nocache: true },
};

// Force fresh data per request — admin data is operational, not
// cacheable.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type NavItem = { href: string; label: string; section: string };

const NAV: NavItem[] = [
  { section: "Money", href: "/admin", label: "Overview" },
  { section: "Money", href: "/admin/revenue", label: "Revenue" },
  { section: "Money", href: "/admin/costs", label: "Costs" },
  { section: "Money", href: "/admin/margin", label: "Margin" },
  { section: "Money", href: "/admin/transactions", label: "Transactions" },
  { section: "Money", href: "/admin/credits", label: "Credits" },
  // Phase C / Task #21 — dedicated surfaces for refund rate, chargeback
  // firehose, FX slippage, and tax treatment split. Sit in Money
  // because they're all "did money land / did money leak" questions.
  { section: "Money", href: "/admin/refunds", label: "Refunds" },
  { section: "Money", href: "/admin/chargebacks", label: "Chargebacks" },
  { section: "Money", href: "/admin/fx", label: "FX" },
  { section: "Money", href: "/admin/tax", label: "Tax" },
  // Phase D / Task #23 PART 2 — Invoicing surface. Shows the seller
  // identity resolved from INVOICE_SELLER_* env vars, flags missing
  // config (most notably the seller GSTIN before CA-owned registration
  // lands), and lists the last 20 captured payments with one-click
  // "download invoice" links. Sits in Money because "can buyers
  // download a compliant receipt?" is a money-flow question (failed
  // invoice download = buyer escalates to support = refund risk).
  { section: "Money", href: "/admin/invoicing", label: "Invoicing" },
  // Phase D / Task #25 — Pricing band. Plans is the read-only audit of
  // CREDIT_PACKS + AI_OPERATION_COSTS; Promos is the placeholder that
  // Task #27 will fill in with the real promo_codes table. Kept in
  // their own section because they're "what do we charge?" questions
  // (future-facing), distinct from Money's "what landed?" (past-facing).
  { section: "Pricing", href: "/admin/plans", label: "Plans" },
  { section: "Pricing", href: "/admin/promos", label: "Promos" },
  { section: "People", href: "/admin/users", label: "Users" },
  // 2026-05-03 plan §7 + §8 — abuse-signal clustering across IP /24,
  // device fingerprint, and Gmail-normalized email facets. Surfaces
  // signups likely to be the same actor under different identities.
  // Lives in People because it's a "who keeps trying to abuse us"
  // question, not a financial rollup.
  { section: "People", href: "/admin/abuse-signals", label: "Abuse signals" },
  // 2026-05-04 — contact form submissions queue. Lives in People
  // because it's a "who's reaching out + what do they need" surface,
  // not a financial rollup. Founder reads here while SendGrid /
  // Postmark / Resend transactional email is still pending; without
  // this surface, /enterprise SMB sales-qualified leads were
  // disappearing into Hostinger log rotation.
  {
    section: "People",
    href: "/admin/contact-submissions",
    label: "Contact",
  },
  // 2026-05-03 plan §7 — per-op unit economics. Lists all AIOperationId
  // entries with base cost + multiplier rule; click through for per-op
  // stats (calls, credits, cost, margin, success rate, provider mix,
  // top users). Lives in Ops because it's an operator question
  // ("which tool is healthy / which is leaking margin?"), not a
  // money-flow rollup (that's /admin/margin).
  { section: "Ops", href: "/admin/tools", label: "Tools" },
  { section: "Ops", href: "/admin/ops", label: "Operations" },
  { section: "Ops", href: "/admin/providers", label: "Providers" },
  { section: "Ops", href: "/admin/router", label: "Router" },
  { section: "Ops", href: "/admin/alarms", label: "Alarms" },
  // Phase D / Task #25 — Fraud review queue + rate-limit overrides.
  // Live in Ops because both are operator-facing "who needs
  // intervention today" surfaces, not financial rollups.
  { section: "Ops", href: "/admin/fraud", label: "Fraud" },
  { section: "Ops", href: "/admin/rate-limits", label: "Rate limits" },
  // Phase E / Task #26 — Prompt registry + A/B experiment rollout
  // audit. Lives in Ops because it answers "is the right variant
  // running, and is its traffic split healthy?" — an operator
  // question, not a revenue/cost rollup. The per-variant cost
  // deltas from the underlying ai_usage rollup join back to
  // /admin/margin (which already slices by op); this page is
  // specifically the rollout / misconfiguration surface.
  { section: "Ops", href: "/admin/prompts", label: "Prompts" },
  { section: "Platform", href: "/admin/deploy", label: "Deploy" },
  { section: "Platform", href: "/admin/logs", label: "Webhook logs" },
  // Task #91 — on-demand reconciliation runner with live forward/reverse
  // sweep stats per provider. Wraps runReconciliation() behind admin
  // auth so operators can trigger sweeps without the cron secret.
  { section: "Platform", href: "/admin/reconcile", label: "Reconcile" },
  // Phase D / Task #25 — Compliance coverage map (DPDP / GDPR /
  // subprocessors / Grievance Officer). Platform because it's a
  // cross-cutting attestation surface, not tied to any one feature.
  { section: "Platform", href: "/admin/compliance", label: "Compliance" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Gate trips here. On failure this throws NEXT_NOT_FOUND, so children
  // never render. On success we get the verified admin email back.
  const { email } = await requireAdmin();

  // Group NAV by section while preserving the original order. Can't use
  // Object.groupBy (Node 20 only) for build-time safety.
  const bySection = new Map<string, NavItem[]>();
  for (const item of NAV) {
    const bucket = bySection.get(item.section) ?? [];
    bucket.push(item);
    bySection.set(item.section, bucket);
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "240px 1fr",
        minHeight: "100vh",
        background: "var(--bg-1)",
      }}
    >
      <aside
        style={{
          borderRight: "1px solid var(--border)",
          background: "var(--bg-2)",
          padding: "24px 16px",
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: -0.3,
              marginBottom: 4,
            }}
          >
            pdfcraftai admin
          </div>
          <div
            className="subtle"
            style={{ fontSize: 12, wordBreak: "break-all" }}
          >
            {email}
          </div>
        </div>
        {Array.from(bySection.entries()).map(([section, items]) => (
          <nav key={section} style={{ marginBottom: 18 }}>
            <div
              className="eyebrow"
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 1,
                color: "var(--fg-subtle)",
                marginBottom: 6,
              }}
            >
              {section}
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    style={{
                      display: "block",
                      padding: "6px 10px",
                      margin: "2px 0",
                      borderRadius: 6,
                      color: "inherit",
                      textDecoration: "none",
                      fontSize: 14,
                    }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <div
          style={{
            borderTop: "1px solid var(--border)",
            paddingTop: 16,
            marginTop: 16,
            fontSize: 12,
          }}
          className="subtle"
        >
          <Link href="/app/dashboard" style={{ color: "inherit" }}>
            ← Back to app
          </Link>
        </div>
      </aside>
      <main style={{ padding: "32px 40px", overflow: "auto" }}>{children}</main>
    </div>
  );
}
