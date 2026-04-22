// app/admin/fraud/page.tsx — Fraud signal review queue.
//
// Task #25 / Phase D.
//
// What this page is:
// ------------------
// The operator's review queue for users who look sketchy enough to
// investigate. We DERIVE the signals from existing tables (no new
// schema) and present them in one table so the ops workflow is "open
// the page, scan, action the bad rows, close the page" rather than
// "run three queries in MySQL client and correlate by hand".
//
// The three signals we surface:
//
//   1. Chargeback / dispute velocity — users with dispute-related
//      webhook events in the past N days. Single-threshold heuristic:
//      ≥ 3 disputes in 90d is the canonical "probable fraud" review
//      queue. We show the count + most-recent-dispute timestamp so the
//      operator can pick "new recurring pattern" vs "one-off ancient
//      dispute".
//
//   2. Hard-blocked users — rows in user_rate_limits where
//      daily_cost_cap_micros = 0. These are users we've ALREADY
//      actioned; showing them on the fraud page (even when they have
//      no recent disputes) lets operators review the backlog and
//      un-block false positives.
//
//   3. (Implicit) union of #1 and #2 — a user who's been hard-blocked
//      AND has recent disputes appears once with both fields populated,
//      which is the "confirmed fraudster" signal.
//
// Why no "suspend user" button:
// -----------------------------
// This is a READ surface. Operators mutate user_rate_limits via DB tool
// today. Adding a button here without an audit-logged server action + a
// confirm step would invite misclicks that nuke good accounts. The
// action will land with Task #27 (which ships audit-logged admin
// actions as part of the promo-code creation flow).

import { getFraudSignals } from "@/lib/admin/phase-d-queries";
import {
  formatCount,
  formatUtcDateTime,
  maskEmail,
  microsToUsd,
} from "@/lib/admin/format";
import {
  DayPicker,
  ErrorBanner,
  SectionTitle,
  StatCard,
  Td,
  Th,
  clampDays,
  tableStyle,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminFraudPage({
  searchParams,
}: {
  searchParams?: { days?: string };
}) {
  const days = clampDays(searchParams?.days, 90);
  const result = await getFraudSignals({ days, limit: 200 });

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Fraud signals
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Past {days} days. Union of dispute-event velocity (from{" "}
          <code>webhook_events</code> → <code>payments</code>) and
          operator-set hard-blocks (from <code>user_rate_limits</code>{" "}
          where <code>daily_cost_cap_micros = 0</code>). Dedup'd per user,
          sorted by dispute count desc. Read-only — mutate via DB tooling.
        </p>
        <div style={{ marginTop: 12 }}>
          <DayPicker current={days} base="/admin/fraud" />
        </div>
      </header>

      {!result.ok ? (
        <ErrorBanner message={`Fraud signals query failed: ${result.error}`} />
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
              label={`Dispute events (past ${days}d)`}
              value={formatCount(result.data.totalDisputeEvents)}
              hint="From webhook_events with dispute actions"
              tone={result.data.totalDisputeEvents > 0 ? "warn" : undefined}
            />
            <StatCard
              label="Hard-blocked users"
              value={formatCount(result.data.totalHardBlocks)}
              hint="user_rate_limits cap = 0"
              tone={result.data.totalHardBlocks > 0 ? "warn" : undefined}
            />
            <StatCard
              label="Unique users flagged"
              value={formatCount(result.data.rows.length)}
              hint="Dedup across both signals"
              tone={result.data.rows.length >= 10 ? "bad" : undefined}
            />
          </section>

          <section>
            <SectionTitle>Review queue</SectionTitle>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <Th>User</Th>
                    <Th align="right">Disputes ({days}d)</Th>
                    <Th>Most recent dispute</Th>
                    <Th>Hard-blocked</Th>
                    <Th align="right">Cap (USD / day)</Th>
                    <Th>Notes</Th>
                    <Th>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.rows.length === 0 ? (
                    <tr>
                      <Td colSpan={7} align="center">
                        No flagged users in window. Healthy state.
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
                          {row.disputeCount > 0 ? (
                            <span
                              style={{
                                color:
                                  row.disputeCount >= 3
                                    ? "#b23b3b"
                                    : row.disputeCount >= 2
                                      ? "#b7791f"
                                      : undefined,
                                fontWeight:
                                  row.disputeCount >= 3 ? 700 : undefined,
                              }}
                            >
                              {row.disputeCount}
                            </span>
                          ) : (
                            "—"
                          )}
                        </Td>
                        <Td mono>
                          {row.mostRecentDisputeAt
                            ? formatUtcDateTime(row.mostRecentDisputeAt)
                            : "—"}
                        </Td>
                        <Td>
                          {row.isHardBlocked ? (
                            <span
                              style={{
                                color: "#b23b3b",
                                fontWeight: 600,
                              }}
                            >
                              yes
                            </span>
                          ) : (
                            "—"
                          )}
                        </Td>
                        <Td align="right" mono>
                          {row.capMicros !== null
                            ? row.capMicros === 0
                              ? "BLOCK"
                              : microsToUsd(row.capMicros)
                            : "—"}
                        </Td>
                        <Td>{row.notes ?? "—"}</Td>
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
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Heuristic: ≥ 3 disputes in 90d is the canonical "probable
              fraud" threshold. Rows with ≥ 2 are warn-tinted; ≥ 3 are
              bad-tinted. Confirm with the user detail page before any
              enforcement action — dispute counts alone can be false
              positives (e.g., a corporate card that gets replaced).
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
