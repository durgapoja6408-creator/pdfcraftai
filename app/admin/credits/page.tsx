// app/admin/credits/page.tsx — Outstanding credits & breakage aging.
//
// Contract: show (1) total outstanding credit balance across the fleet,
// (2) a cohort breakdown by credit_ledger.reason (how credits were
// granted/spent), (3) an aged view of outstanding balances bucketed by
// "months since last activity" — the 12+ month bucket is the one the
// breakage sweeper will eventually recognize as revenue.
//
// Uses the derived "last_active" per user (MAX(credit_ledger.created_at))
// rather than a dedicated column on the credits table. That's a proxy,
// not a guarantee — if a user gets a grant but never transacts, their
// "last_active" is the grant date itself, which still lines up with
// the intent (time since this balance started looking stale).

import { getCreditsSummary } from "@/lib/admin/queries";
import { formatCount } from "@/lib/admin/format";
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

export default async function AdminCreditsPage() {
  const { data, error } = await getCreditsSummary();

  // Credits are unit counts (not micros). Convert to an approximate USD
  // value using REFERENCE_USD_MICROS_PER_CREDIT is overkill here — the
  // cohort and aged tables already expose raw counts/balances, and the
  // operator reads those directly.

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Credits</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Outstanding balances, cohort breakdown by reason, and aged view
          (breakage eligibility).
        </p>
      </header>

      {error ? (
        <ErrorBanner message={`Credits query failed: ${error}`} />
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Total outstanding credits"
          value={formatCount(data.totalOutstanding)}
          hint="Sum of credits.balance across users with balance ≥ 1"
        />
        <StatCard
          label="Users with a balance"
          value={formatCount(data.totalUsers)}
        />
      </section>

      <section style={{ marginBottom: 24 }}>
        <SectionTitle>Cohort by reason (all-time)</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Reason</Th>
                <Th align="right">Count</Th>
                <Th align="right">Total delta</Th>
              </tr>
            </thead>
            <tbody>
              {data.reasons.length === 0 ? (
                <tr>
                  <Td colSpan={3} align="center">
                    No credit ledger activity.
                  </Td>
                </tr>
              ) : (
                data.reasons.map((r) => (
                  <tr key={r.reason}>
                    <Td>{r.reason}</Td>
                    <Td align="right" mono>{formatCount(r.count)}</Td>
                    <Td align="right" mono>
                      <span
                        style={{
                          color:
                            r.totalDelta > 0
                              ? "#2f855a"
                              : r.totalDelta < 0
                                ? "#b23b3b"
                                : undefined,
                        }}
                      >
                        {r.totalDelta > 0 ? "+" : ""}
                        {formatCount(r.totalDelta)}
                      </span>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionTitle>Aged outstanding balance</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Bucket</Th>
                <Th align="right">Users</Th>
                <Th align="right">Total balance</Th>
              </tr>
            </thead>
            <tbody>
              {data.aged.length === 0 ? (
                <tr>
                  <Td colSpan={3} align="center">
                    No outstanding balances.
                  </Td>
                </tr>
              ) : (
                data.aged.map((r) => {
                  const isBreakage = r.bucket.startsWith("12+");
                  return (
                    <tr key={r.bucket}>
                      <Td>
                        <span
                          style={{
                            color: isBreakage ? "#2f855a" : undefined,
                            fontWeight: isBreakage ? 600 : 400,
                          }}
                        >
                          {r.bucket}
                        </span>
                      </Td>
                      <Td align="right" mono>{formatCount(r.userCount)}</Td>
                      <Td align="right" mono>{formatCount(r.totalBalance)}</Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
          Bucket &ldquo;12+ months&rdquo; is breakage-eligible: those balances
          have been dormant long enough that the nightly breakage sweeper will
          recognize them as revenue (once the sweeper is enabled — see Task
          #17 / ai_daily_margin breakage slice).
        </p>
      </section>

      <p className="muted" style={{ marginTop: 16, fontSize: 12 }}>
        For the current USD-per-credit reference rate, see /admin/deploy. For
        exact revenue attribution on actual purchases, use /admin/revenue.
      </p>
    </div>
  );
}
