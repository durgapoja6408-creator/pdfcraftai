// app/admin/rate-limits/page.tsx — Rate-limit overrides list.
//
// Task #25 / Phase D.
//
// What this page is:
// ------------------
// The operator's read-only view of every row in user_rate_limits — the
// per-user override of the global daily AI cost cap. We surface:
//
//   1. The global default — what "no override row" means today, and
//      whether it comes from the USER_DAILY_COST_MICROS_CAP env var or
//      from the compiled-in DEFAULT_DAILY_COST_CAP_MICROS. Operators
//      need this because when a user emails "why was I cut off?", the
//      answer is "our default is $X/day, your override is $Y/day" —
//      both halves of that answer live on this page.
//
//   2. Every override row — user, cap, notes, when it was created /
//      last updated. Sorted by updatedAt desc so the freshest operator
//      decision sits at the top.
//
//   3. Three headline metrics — global default, override count,
//      hard-blocks (cap=0 subset of rows). Hard-blocks are also
//      surfaced on /admin/fraud; showing them here as a count lets
//      operators see "how many enforcement actions are currently live"
//      at a glance.
//
// Why no "create override" button:
// --------------------------------
// Same posture as /admin/fraud: read-only v1, mutations land with the
// audit-logged admin-actions infra in Task #27. Today, operators set
// an override with a MySQL INSERT. If that happens often enough to be
// annoying, we'll prioritise the UI.

import {
  getRateLimitOverrides,
  DEFAULT_DAILY_COST_CAP_MICROS,
} from "@/lib/admin/phase-d-queries";
import {
  formatCount,
  formatUtcDateTime,
  maskEmail,
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminRateLimitsPage() {
  const result = await getRateLimitOverrides({ limit: 200 });

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Rate limits
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Per-user overrides of the global daily AI cost cap. Read-only —
          mutations happen via DB tooling. A cap of <code>0</code> means
          the user is hard-blocked; these also appear on{" "}
          <a href="/admin/fraud" style={{ color: "inherit" }}>
            /admin/fraud
          </a>
          .
        </p>
      </header>

      {!result.ok ? (
        <ErrorBanner
          message={`Rate-limits query failed: ${result.error}`}
        />
      ) : null}

      {result.ok ? (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <StatCard
              label="Global daily cap"
              value={microsToUsd(result.data.globalDefaultMicros)}
              hint={
                result.data.globalDefaultSource === "env"
                  ? "From USER_DAILY_COST_MICROS_CAP env var"
                  : "Compiled-in DEFAULT_DAILY_COST_CAP_MICROS (no env override)"
              }
            />
            <StatCard
              label="Active overrides"
              value={formatCount(result.data.overrideCount)}
              hint="Users with a non-default cap"
            />
            <StatCard
              label="Hard-blocks (cap = 0)"
              value={formatCount(
                result.data.rows.filter((r) => r.capMicros === 0).length
              )}
              hint="Subset of overrides — also on /admin/fraud"
              tone={
                result.data.rows.some((r) => r.capMicros === 0)
                  ? "warn"
                  : undefined
              }
            />
          </section>

          <section style={{ marginBottom: 24 }}>
            <div className="card" style={{ padding: 16 }}>
              <div
                className="subtle"
                style={{ fontSize: 12, marginBottom: 4 }}
              >
                Resolution order (first match wins)
              </div>
              <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
                <li>
                  Per-user <code>user_rate_limits.daily_cost_cap_micros</code>{" "}
                  if set
                </li>
                <li>
                  Env var <code>USER_DAILY_COST_MICROS_CAP</code> if parseable
                  to a non-negative integer
                </li>
                <li>
                  Compiled-in <code>DEFAULT_DAILY_COST_CAP_MICROS</code> ={" "}
                  {microsToUsd(DEFAULT_DAILY_COST_CAP_MICROS)}/day
                </li>
              </ol>
            </div>
          </section>

          <section>
            <SectionTitle>Per-user overrides</SectionTitle>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <Th>User</Th>
                    <Th align="right">Cap (USD / day)</Th>
                    <Th>Notes</Th>
                    <Th>Created</Th>
                    <Th>Updated</Th>
                    <Th>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.rows.length === 0 ? (
                    <tr>
                      <Td colSpan={6} align="center">
                        No rate-limit overrides configured. Every user runs
                        against the global default of{" "}
                        {microsToUsd(result.data.globalDefaultMicros)}/day.
                      </Td>
                    </tr>
                  ) : (
                    result.data.rows.map((row) => (
                      <tr key={row.userId}>
                        <Td>
                          <div>{maskEmail(row.email)}</div>
                          <div
                            className="muted"
                            style={{ fontSize: 11, fontFamily: "ui-monospace" }}
                          >
                            {row.userId}
                          </div>
                        </Td>
                        <Td align="right" mono>
                          {row.capMicros === 0 ? (
                            <span
                              style={{
                                color: "#b23b3b",
                                fontWeight: 700,
                              }}
                            >
                              BLOCK
                            </span>
                          ) : (
                            microsToUsd(row.capMicros)
                          )}
                        </Td>
                        <Td>{row.notes ?? "—"}</Td>
                        <Td mono>{formatUtcDateTime(row.createdAt)}</Td>
                        <Td mono>{formatUtcDateTime(row.updatedAt)}</Td>
                        <Td>
                          <a
                            href={`/admin/users/${encodeURIComponent(
                              row.userId
                            )}`}
                            style={{ color: "inherit" }}
                          >
                            → detail
                          </a>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
