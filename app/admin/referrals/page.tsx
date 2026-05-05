// app/admin/referrals/page.tsx — referral program admin viewer.
//
// PENDING_WORK_ANALYSIS.md §3e foundation. Read-only consumer of
// `lib/referrals/queries.ts`. Surfaces:
//   1. Total codes generated + total signups attributed
//   2. Reward state aggregates (fully-rewarded vs pending)
//   3. Top 10 referrers leaderboard (by signup count)
//   4. Recent attribution log (paginated table, 200 rows)
//
// What this page does NOT do
// --------------------------
// - Trigger any reward grant. The actual credit grants live in Phase E
//   (signup-flow wire-up + first-purchase milestone), gated behind
//   the `REFERRALS_ENABLED` env flag. This page is observational only.
// - Show the user-facing referral page (/app/refer). That's a future
//   Phase E item — once the wire-up is on, users get a "share your
//   code" surface in their dashboard.
// - Link to user profiles. Phase E adds `/admin/users/[id]` deep
//   links per row; today the user IDs render as opaque strings since
//   the table will be empty until the program goes live.
//
// Foundation rationale (matches dunning + ai-feedback + quality-signals):
// the page lands NOW so the read path is verified end-to-end against
// real prod schema. The "0 codes / 0 signups / no rewards" empty state
// is itself useful — it confirms migration 0024 + Drizzle schema +
// query helpers all wire together correctly.

import {
  loadAdminReferralStats,
  listRecentReferralSignups,
  isReferralsEnabled,
} from "@/lib/referrals/queries";
import { requireAdmin } from "@/lib/admin/guard";
import {
  SectionTitle,
  Td,
  Th,
  tableStyle,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function StatusChip({
  referrerRewardedAt,
  referredRewardedAt,
}: {
  referrerRewardedAt: Date | null;
  referredRewardedAt: Date | null;
}) {
  const both =
    referrerRewardedAt !== null && referredRewardedAt !== null;
  const partial =
    !both && (referrerRewardedAt !== null || referredRewardedAt !== null);

  let bg: string;
  let fg: string;
  let label: string;
  if (both) {
    bg = "color-mix(in oklab, #4caf50 18%, transparent)";
    fg = "#4caf50";
    label = "FULLY REWARDED";
  } else if (partial) {
    bg = "color-mix(in oklab, #f57c00 18%, transparent)";
    fg = "#f57c00";
    label = "PARTIAL";
  } else {
    bg = "color-mix(in oklab, var(--fg) 12%, transparent)";
    fg = "var(--fg-subtle)";
    label = "PENDING";
  }
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        background: bg,
        color: fg,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.4,
      }}
    >
      {label}
    </span>
  );
}

function fmtDate(d: Date | null): string {
  if (d === null) return "—";
  return d.toISOString().slice(0, 19).replace("T", " ") + " UTC";
}

function shortUser(userId: string): string {
  // user IDs from NextAuth are 21-char nanoid-ish strings; show first 8
  // + last 4 for readability (e.g. "abc12345…wxyz").
  if (userId.length <= 16) return userId;
  return `${userId.slice(0, 8)}…${userId.slice(-4)}`;
}

export default async function AdminReferralsPage() {
  await requireAdmin();
  const enabled = isReferralsEnabled();
  const stats = await loadAdminReferralStats();
  const recent = await listRecentReferralSignups(200);

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Referrals
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Source: <code>referral_codes</code> + <code>referral_signups</code>{" "}
          (migration 0024). Per-user codes generated lazily via{" "}
          <code>lib/referrals/codes.ts:getOrCreateReferralCode</code>;
          attribution recorded at signup time when{" "}
          <code>?ref=&lt;CODE&gt;</code> arrives via URL.
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
            ? "REFERRALS_ENABLED=1 — attribution writes are LIVE. Signups arriving with ?ref=CODE will land in referral_signups."
            : "REFERRALS_ENABLED unset — foundation only. Tables stay empty until the env flag flips. Phase E wires the signup flow."}
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
            Codes generated
          </div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.totalCodes}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Signups attributed
          </div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            {stats.totalSignups}
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Fully rewarded
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#4caf50" }}>
            {stats.fullyRewardedCount}
          </div>
        </div>
        <div
          className="card"
          style={{
            padding: 16,
            borderColor:
              stats.pendingRewardCount > 0 ? "#f57c00" : "var(--border)",
          }}
        >
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Pending rewards
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: stats.pendingRewardCount > 0 ? "#f57c00" : "var(--fg)",
            }}
          >
            {stats.pendingRewardCount}
          </div>
        </div>
      </section>

      {/* Top referrers */}
      <SectionTitle>Top referrers (by signup count)</SectionTitle>
      {stats.topReferrers.length === 0 ? (
        <p className="muted" style={{ fontSize: 14, marginBottom: 24 }}>
          No referrers yet. The leaderboard populates as users share their
          codes and successful signups land in <code>referral_signups</code>.
        </p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Rank</Th>
              <Th>Referrer userId</Th>
              <Th>Signups</Th>
            </tr>
          </thead>
          <tbody>
            {stats.topReferrers.map((r, i) => (
              <tr key={r.referrerUserId}>
                <Td>{i + 1}</Td>
                <Td>
                  <code style={{ fontSize: 12 }}>{r.referrerUserId}</code>
                </Td>
                <Td>{r.signupCount}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Recent attributions */}
      <div style={{ marginTop: 24 }}>
        <SectionTitle>Recent attributions ({recent.length})</SectionTitle>
        {recent.length === 0 ? (
          <p className="muted" style={{ fontSize: 14 }}>
            Nothing attributed yet. Empty by design — Phase E flips the
            switch by setting <code>REFERRALS_ENABLED=1</code> and wiring{" "}
            <code>recordReferralSignup()</code> into the signup flow.
          </p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Referrer</Th>
                <Th>Referred</Th>
                <Th>Code</Th>
                <Th>Reward state</Th>
                <Th>Referrer credited</Th>
                <Th>Referred credited</Th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => (
                <tr key={row.id}>
                  <Td>
                    <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
                      {fmtDate(row.createdAt)}
                    </span>
                  </Td>
                  <Td>
                    <code style={{ fontSize: 12 }}>
                      {shortUser(row.referrerUserId)}
                    </code>
                  </Td>
                  <Td>
                    <code style={{ fontSize: 12 }}>
                      {shortUser(row.referredUserId)}
                    </code>
                  </Td>
                  <Td>
                    <code style={{ fontSize: 12 }}>{row.code}</code>
                  </Td>
                  <Td>
                    <StatusChip
                      referrerRewardedAt={row.referrerRewardedAt}
                      referredRewardedAt={row.referredRewardedAt}
                    />
                  </Td>
                  <Td>
                    <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
                      {fmtDate(row.referrerRewardedAt)}
                    </span>
                  </Td>
                  <Td>
                    <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
                      {fmtDate(row.referredRewardedAt)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
