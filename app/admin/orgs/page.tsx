// app/admin/orgs/page.tsx — Multi-seat organizations admin viewer.
//
// PENDING_WORK_ANALYSIS.md §3b foundation. Read-only consumer of
// `lib/orgs/queries.ts`. Surfaces:
//   1. Total orgs + memberships + invite counts (pending vs accepted)
//   2. Top 10 orgs by member count
//   3. Status banner (MULTI_SEAT flag on/off)
//
// What this page does NOT do
// --------------------------
// - Create / modify orgs. Phase F adds /app/org/<slug> management
//   surfaces for owners + admins. This page is observational only.
// - Show invite emails or token values. Emails are PII; tokens are
//   secrets. /admin/users/[id] (future) drills into per-user org
//   memberships if needed.
// - Per-org drill-down. Clicking an org row could navigate to a
//   /admin/orgs/<id> page with full member + invite + usage detail
//   — that's a future enhancement; today's foundation surfaces only
//   aggregates.
//
// Why ship the empty viewer now
// -----------------------------
// Same reason as referrals / dunning / quality-signals: schema +
// library + viewer + CI guard land before the table has meaningful
// traffic, so when Phase F flips MULTI_SEAT=on the surface is
// already there. The "0 orgs / 0 members / 0 invites" empty state
// is itself useful — confirms the read path works end-to-end
// against real prod schema.

import { requireAdmin } from "@/lib/admin/guard";
import {
  loadAdminOrgStats,
  isMultiSeatEnabled,
} from "@/lib/orgs/queries";
import { SectionTitle, Td, Th, tableStyle } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminOrgsPage() {
  await requireAdmin();
  const enabled = isMultiSeatEnabled();
  const stats = await loadAdminOrgStats();

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Organizations
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Source: <code>organizations</code> +{" "}
          <code>organization_members</code> +{" "}
          <code>organization_invites</code> (migration 0025). Multi-seat
          / team plan foundation.
        </p>
        <p
          className="muted"
          style={{
            marginTop: 8,
            fontSize: 13,
            padding: "8px 12px",
            borderRadius: 4,
            background: enabled
              ? "color-mix(in oklab, #4caf50 12%, transparent)"
              : "color-mix(in oklab, #f57c00 12%, transparent)",
            color: enabled ? "#4caf50" : "#f57c00",
          }}
        >
          <strong>Status:</strong>{" "}
          {enabled
            ? "MULTI_SEAT flag is ON — create-org flow is live, signup-flow + billing wire-up active."
            : "MULTI_SEAT flag is OFF — foundation only. Tables stay empty until Phase F flips the flag and adds create-org UI + billing wire-up."}
        </p>
      </header>

      {/* Summary cards */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div className="card" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Total organizations
          </div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            {stats.totalOrgs}
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Total memberships
          </div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            {stats.totalMemberships}
          </div>
        </div>
        <div
          className="card"
          style={{
            padding: 16,
            borderColor:
              stats.pendingInvitesCount > 0
                ? "#f57c00"
                : "var(--border)",
          }}
        >
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Pending invites
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color:
                stats.pendingInvitesCount > 0 ? "#f57c00" : "var(--fg)",
            }}
          >
            {stats.pendingInvitesCount}
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Accepted invites
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#4caf50" }}>
            {stats.acceptedInvitesCount}
          </div>
        </div>
      </section>

      <SectionTitle>Top organizations (by member count)</SectionTitle>
      {stats.topOrgs.length === 0 ? (
        <p className="muted" style={{ fontSize: 14, marginBottom: 24 }}>
          No organizations yet. Empty by design — Phase F flips
          MULTI_SEAT=on and adds the create-org UI.
        </p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Rank</Th>
              <Th>Name</Th>
              <Th>Slug</Th>
              <Th>Members</Th>
            </tr>
          </thead>
          <tbody>
            {stats.topOrgs.map((o, i) => (
              <tr key={o.organizationId}>
                <Td>{i + 1}</Td>
                <Td>{o.name}</Td>
                <Td>
                  <code style={{ fontSize: 12 }}>{o.slug}</code>
                </Td>
                <Td>{o.memberCount}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
