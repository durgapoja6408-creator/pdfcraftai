// app/admin/users/[id]/page.tsx — Per-user detail.
//
// Contract: full user identity (unmasked email, name, signup, balance,
// lifetime net revenue, lifetime AI cost, lifetime call count), recent
// 50 credit ledger rows, recent 50 ai_usage rows. No free-text PII
// beyond what's already in users.name / users.email.
//
// This page is the ONLY place the unmasked email is shown. The list
// on /admin/users masks it. Do not accidentally add a "copy all
// emails" export; that belongs behind a separate explicit admin
// action (not shipped in Task #18).

import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserDetail } from "@/lib/admin/queries";
// Phase F-4 admin polish (2026-05-06): show org memberships on the
// per-user detail page so ops can answer "is this user paying via
// an org or a personal sub" without cross-referencing /admin/orgs.
import { loadOrgsForUser } from "@/lib/orgs/queries";
import {
  bpsToPercent,
  formatBool,
  formatCount,
  formatUtcDate,
  formatUtcDateTime,
  microsToUsd,
} from "@/lib/admin/format";
import {
  ErrorBanner,
  SectionTitle,
  StatCard,
  Td,
  Th,
  tableStyle,
} from "@/components/admin/ui";
// 2026-05-03 plan §7 + §8 / Gap #5 — admin grant + debit actions.
import { AdminUserActions } from "@/components/admin/AdminUserActions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminUserDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { data, error } = await getUserDetail({ userId: params.id });

  if (!data.user && !error) {
    notFound();
  }

  // Org memberships for this user. loadOrgsForUser is membership-
  // scoped + safe to call even when MULTI_SEAT is off (returns []
  // because no orgs exist). Section gates on .length below so
  // users with zero org memberships don't get an empty section.
  const userOrgs = data.user
    ? await loadOrgsForUser(params.id)
    : [];

  const lifetimeMarginBps =
    data.lifetime.netRevenueMicros > 0
      ? Math.round(
          ((data.lifetime.netRevenueMicros - data.lifetime.aiCostMicros) /
            data.lifetime.netRevenueMicros) *
            10_000
        )
      : null;

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          {data.user?.email ?? "(unknown user)"}
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          {data.user?.name ? `${data.user.name} — ` : null}
          joined {data.user ? formatUtcDate(data.user.createdAt) : "—"} — id{" "}
          <code style={{ fontSize: 12 }}>{params.id}</code>
        </p>
      </header>

      {error ? <ErrorBanner message={`User query failed: ${error}`} /> : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Credit balance"
          value={formatCount(data.user?.balance ?? 0)}
        />
        <StatCard
          label="Lifetime net revenue"
          value={microsToUsd(data.lifetime.netRevenueMicros)}
        />
        <StatCard
          label="Lifetime AI cost"
          value={microsToUsd(data.lifetime.aiCostMicros)}
          hint={`${formatCount(data.lifetime.callCount)} calls`}
        />
        <StatCard
          label="Lifetime margin"
          value={
            lifetimeMarginBps !== null
              ? bpsToPercent(lifetimeMarginBps, { showSign: true })
              : "—"
          }
          tone={
            lifetimeMarginBps === null
              ? undefined
              : lifetimeMarginBps >= 3000
                ? "good"
                : lifetimeMarginBps >= 0
                  ? "warn"
                  : "bad"
          }
        />
      </section>

      {/* 2026-05-03 plan §7 + §8 / Gap #5 — admin actions panel.
          Grant / debit credits with audit trail in note field.
          Renders BEFORE the abuse-signal panel so admins reviewing a
          flagged account can claw back without scrolling. */}
      {data.user ? (
        <section style={{ marginBottom: 24 }}>
          <SectionTitle>Admin actions</SectionTitle>
          <AdminUserActions
            targetUserId={params.id}
            currentBalance={data.user.balance ?? 0}
          />
        </section>
      ) : null}

      {/* 2026-05-03 plan §7 + §8 — abuse-signal panel. Surfaces the
          abuse-prevention columns from migration 0018 (signup_ip,
          device_fingerprint, email_normalized) plus the cluster
          sizes of OTHER users sharing this user's IP /24 or
          fingerprint. Cluster size > 0 is the signal that this
          account might be part of a coordinated attempt. */}
      {data.user ? (
        <section style={{ marginBottom: 24 }}>
          <SectionTitle>Abuse signals</SectionTitle>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Signup IP</div>
                <div style={{ fontFamily: "monospace", fontSize: 14 }}>
                  {data.user.signupIp ?? <span className="muted">— (legacy row)</span>}
                </div>
                {data.user.ipBucketSiblings > 0 ? (
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    ⚠ {data.user.ipBucketSiblings} other user{data.user.ipBucketSiblings === 1 ? "" : "s"} from same /24
                  </div>
                ) : data.user.signupIp ? (
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    ✓ unique /24 in user base
                  </div>
                ) : null}
              </div>

              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Device fingerprint</div>
                <div style={{ fontFamily: "monospace", fontSize: 14 }}>
                  {data.user.deviceFingerprint ? (
                    `${data.user.deviceFingerprint.slice(0, 16)}…`
                  ) : (
                    <span className="muted">— (legacy row or fingerprint failed)</span>
                  )}
                </div>
                {data.user.fingerprintSiblings > 0 ? (
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    ⚠ {data.user.fingerprintSiblings} other user{data.user.fingerprintSiblings === 1 ? "" : "s"} share this fingerprint
                  </div>
                ) : data.user.deviceFingerprint ? (
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    ✓ unique fingerprint in user base
                  </div>
                ) : null}
              </div>

              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Email (canonical)</div>
                <div style={{ fontFamily: "monospace", fontSize: 14 }}>
                  {data.user.emailNormalized ?? <span className="muted">— (legacy row)</span>}
                </div>
                {data.user.emailNormalized && data.user.emailNormalized !== data.user.email.toLowerCase() ? (
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Differs from raw email — Gmail+alias or dot-trick collapsed
                  </div>
                ) : null}
              </div>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 16 }}>
              See <a href="/admin/abuse-signals" style={{ color: "var(--accent)" }}>/admin/abuse-signals</a> for cross-user clustering.
            </div>
          </div>
        </section>
      ) : null}

      {/* Organizations — Phase F-4 admin polish, 2026-05-06.
          Surfaces this user's org memberships with role + slug.
          Section hidden entirely when user has no memberships
          (don't render an empty card just to say "no orgs"). */}
      {userOrgs.length > 0 ? (
        <section style={{ marginBottom: 24 }}>
          <SectionTitle>Organizations ({userOrgs.length})</SectionTitle>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Slug</Th>
                  <Th>Role</Th>
                  <Th>Billing mode</Th>
                  <Th>Joined</Th>
                </tr>
              </thead>
              <tbody>
                {userOrgs.map((entry) => (
                  <tr key={entry.org.id}>
                    <Td>
                      <Link
                        href={`/app/org/${entry.org.slug}`}
                        style={{ color: "var(--accent)" }}
                      >
                        {entry.org.name}
                      </Link>
                    </Td>
                    <Td>
                      <code style={{ fontSize: 12 }}>{entry.org.slug}</code>
                    </Td>
                    <Td>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontWeight: 600,
                          letterSpacing: 0.4,
                          textTransform: "uppercase",
                          color:
                            entry.role === "owner"
                              ? "#4caf50"
                              : entry.role === "admin"
                              ? "var(--accent)"
                              : "var(--fg-subtle)",
                        }}
                      >
                        {entry.role}
                      </span>
                    </Td>
                    <Td>
                      <code style={{ fontSize: 11 }}>{entry.org.billingMode}</code>
                    </Td>
                    <Td>{formatUtcDate(entry.org.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section style={{ marginBottom: 24 }}>
        <SectionTitle>Recent credit ledger</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Reason</Th>
                <Th align="right">Delta</Th>
                <Th>Processor</Th>
                <Th>Currency</Th>
                <Th align="right">Gross</Th>
                <Th align="right">Net</Th>
              </tr>
            </thead>
            <tbody>
              {data.recentLedger.length === 0 ? (
                <tr>
                  <Td colSpan={7} align="center">
                    No ledger entries.
                  </Td>
                </tr>
              ) : (
                data.recentLedger.map((row) => (
                  <tr key={row.id}>
                    <Td mono>{formatUtcDateTime(row.createdAt)}</Td>
                    <Td>{row.reason}</Td>
                    <Td align="right" mono>{formatCount(row.delta)}</Td>
                    <Td>{row.provider ?? "—"}</Td>
                    <Td>{row.billingCurrency ?? "—"}</Td>
                    <Td align="right" mono>
                      {row.grossChargeMicros !== null
                        ? microsToUsd(row.grossChargeMicros)
                        : "—"}
                    </Td>
                    <Td align="right" mono>
                      {row.netRevenueMicros !== null
                        ? microsToUsd(row.netRevenueMicros)
                        : "—"}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionTitle>Recent AI usage</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Operation</Th>
                <Th>Provider</Th>
                <Th align="right">Credits</Th>
                <Th align="right">AI cost</Th>
                <Th align="center">Success</Th>
              </tr>
            </thead>
            <tbody>
              {data.recentUsage.length === 0 ? (
                <tr>
                  <Td colSpan={6} align="center">
                    No AI usage.
                  </Td>
                </tr>
              ) : (
                data.recentUsage.map((row) => (
                  <tr key={row.id}>
                    <Td mono>{formatUtcDateTime(row.createdAt)}</Td>
                    <Td>{row.operation}</Td>
                    <Td>{row.providerId}</Td>
                    <Td align="right" mono>{formatCount(row.creditsSpent)}</Td>
                    <Td align="right" mono>
                      {row.costMicros !== null ? microsToUsd(row.costMicros) : "—"}
                    </Td>
                    <Td align="center">
                      {formatBool(row.success === 1)}
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
