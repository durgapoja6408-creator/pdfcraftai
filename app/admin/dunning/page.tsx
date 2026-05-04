// app/admin/dunning/page.tsx — subscription dunning posture overview.
//
// PENDING_WORK_ANALYSIS.md §4c. Read-only viewer for the
// `subscription_dunning` table (migration 0023). Today the table stays
// empty because we only sell one-shot credit packs — every charge
// either succeeds (credits land) or fails (no credits, no retry); no
// recurring contracts means no dunning posture to track. Once Phase E
// ships recurring plans, the same page surfaces:
//   - State distribution (how many subs in current / past_due /
//     suspended / cancelled right now)
//   - Past-due backlog (the actionable list — subs that need attention
//     before grace window expires)
//   - Recent state transitions (audit timeline)
//
// What this page does NOT do (yet)
//   - Retry-now buttons or manual state overrides — Phase E concern
//     once we know the operational pattern. v1 is read-only same as
//     /admin/contact-submissions and /admin/ai-feedback.
//   - Per-user drill-in — the dunning row is keyed by subscription_id,
//     not user_id, and the `subscriptions` table doesn't yet have the
//     recurring shape that would let us join cleanly.
//   - Per-provider segmentation — Phase E adds a `provider` column on
//     the dunning row when there's a real second rail to compare.
//
// Why ship the empty viewer now
// -----------------------------
// Mirrors the discipline from contact-submissions (commit `52307a3`)
// and ai-feedback (commit `d74fefe`): schema + viewer + CI guard
// land together so the persist-side wiring (Phase E webhook handler)
// can ship as a 1-file diff later without first having to land + run
// a migration. The "no rows yet" empty state is itself useful — it
// confirms the table exists and the read path works.

import Link from "next/link";

import { listDunningRows, DUNNING_POLICY } from "@/lib/payments/dunning";
import type { DunningRow, DunningState } from "@/lib/payments/dunning";
import { requireAdmin } from "@/lib/admin/guard";
import {
  ErrorBanner,
  SectionTitle,
  Td,
  Th,
  tableStyle,
} from "@/components/admin/ui";
import { formatRelative, formatUtcDate } from "@/lib/admin/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PageData {
  rows: DunningRow[];
  byState: Record<DunningState, number>;
  pastDueBacklog: DunningRow[];
}

async function getDunning(): Promise<{
  data: PageData | null;
  error: string | null;
}> {
  try {
    const rows = await listDunningRows(500);

    const byState: Record<DunningState, number> = {
      current: 0,
      past_due: 0,
      suspended: 0,
      cancelled: 0,
    };
    for (const row of rows) {
      byState[row.state] = (byState[row.state] ?? 0) + 1;
    }

    // Past-due backlog: subs in past_due or suspended state, sorted by
    // how long they've been there (oldest first — those are the ones
    // about to age out of the grace window).
    const pastDueBacklog = rows
      .filter((r) => r.state === "past_due" || r.state === "suspended")
      .sort((a, b) => a.stateSinceMs - b.stateSinceMs);

    return {
      data: { rows, byState, pastDueBacklog },
      error: null,
    };
  } catch (e) {
    return { data: null, error: String(e) };
  }
}

function StateChip({ state }: { state: DunningState }) {
  const palette: Record<DunningState, { bg: string; fg: string }> = {
    current: { bg: "color-mix(in oklab, #4caf50 18%, transparent)", fg: "#4caf50" },
    past_due: { bg: "color-mix(in oklab, #f57c00 18%, transparent)", fg: "#f57c00" },
    suspended: { bg: "color-mix(in oklab, #e53935 18%, transparent)", fg: "#e53935" },
    cancelled: { bg: "color-mix(in oklab, var(--fg) 12%, transparent)", fg: "var(--fg-subtle)" },
  };
  const tone = palette[state];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        background: tone.bg,
        color: tone.fg,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
      {state}
    </span>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export default async function AdminDunningPage() {
  await requireAdmin();
  const { data, error } = await getDunning();

  const nowMs = Date.now();
  const graceMs = DUNNING_POLICY.gracePastDueMs;
  const suspendedMs = DUNNING_POLICY.suspendedBeforeCancelMs;

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Subscription dunning
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Source: <code>subscription_dunning</code> table (migration 0023).
          Read-only audit of the dunning posture machine in{" "}
          <code>lib/payments/dunning.ts</code>. Grace window:{" "}
          {formatDuration(graceMs)} past-due before suspending,{" "}
          {formatDuration(suspendedMs)} suspended before cancelling.
        </p>
        <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
          <strong>Phase E pending:</strong> persist wiring lives in{" "}
          <code>lib/payments/dunning.ts</code> (
          <code>persistDunningEvent</code>) but is not yet called from
          the webhook handler. Until recurring plans ship, this table
          stays empty by design — every SKU today is a one-shot pack.
        </p>
      </header>

      {error ? (
        <ErrorBanner message={`Dunning query failed: ${error}`} />
      ) : null}

      {data ? (
        <>
          {/* Summary cards — state distribution */}
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <div className="card" style={{ padding: 16 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Total tracked
              </div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>
                {data.rows.length}
              </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Current
              </div>
              <div
                style={{ fontSize: 24, fontWeight: 700, color: "#4caf50" }}
              >
                {data.byState.current}
              </div>
            </div>
            <div
              className="card"
              style={{
                padding: 16,
                borderColor:
                  data.byState.past_due > 0 ? "#f57c00" : "var(--border)",
              }}
            >
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Past due
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: data.byState.past_due > 0 ? "#f57c00" : "var(--fg)",
                }}
              >
                {data.byState.past_due}
              </div>
            </div>
            <div
              className="card"
              style={{
                padding: 16,
                borderColor:
                  data.byState.suspended > 0 ? "#e53935" : "var(--border)",
              }}
            >
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Suspended
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: data.byState.suspended > 0 ? "#e53935" : "var(--fg)",
                }}
              >
                {data.byState.suspended}
              </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Cancelled
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: "var(--fg-subtle)",
                }}
              >
                {data.byState.cancelled}
              </div>
            </div>
          </section>

          {/* Past-due backlog */}
          <SectionTitle>
            Past-due backlog ({data.pastDueBacklog.length})
          </SectionTitle>

          {data.pastDueBacklog.length === 0 ? (
            <p className="muted" style={{ fontSize: 14, marginBottom: 24 }}>
              No subscriptions in past_due or suspended state. (Either
              everything's healthy — or no recurring subs exist yet.
              Phase E wiring will populate this once shipped.)
            </p>
          ) : (
            <table style={{ ...tableStyle, marginBottom: 24 }}>
              <thead>
                <tr>
                  <Th>Subscription</Th>
                  <Th>State</Th>
                  <Th>In state for</Th>
                  <Th>Failed attempts</Th>
                  <Th>Next retry</Th>
                </tr>
              </thead>
              <tbody>
                {data.pastDueBacklog.map((r) => (
                  <tr key={r.subscriptionId}>
                    <Td>
                      <code style={{ fontSize: 12 }}>{r.subscriptionId}</code>
                    </Td>
                    <Td>
                      <StateChip state={r.state} />
                    </Td>
                    <Td>
                      <div style={{ fontSize: 13 }}>
                        {formatDuration(nowMs - r.stateSinceMs)}
                      </div>
                      <div
                        className="muted"
                        style={{ fontSize: 11, marginTop: 2 }}
                      >
                        since {formatUtcDate(new Date(r.stateSinceMs))}
                      </div>
                    </Td>
                    <Td>{r.failedAttempts}</Td>
                    <Td>
                      {r.nextRetryAtMs ? (
                        <div style={{ fontSize: 13 }}>
                          {formatRelative(new Date(r.nextRetryAtMs))}
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>
                          —
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* All rows — full audit timeline */}
          <SectionTitle>All rows ({data.rows.length})</SectionTitle>

          {data.rows.length === 0 ? (
            <p className="muted" style={{ fontSize: 14 }}>
              <code>subscription_dunning</code> is empty. Phase E will
              start populating this table once webhook-handler.ts wires
              <code> persistDunningEvent</code>. See{" "}
              <Link
                href="/admin/plans"
                style={{ color: "var(--accent)", textDecoration: "underline" }}
              >
                /admin/plans
              </Link>{" "}
              for the current SKU set (all one-shot packs as of today).
            </p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Subscription</Th>
                  <Th>State</Th>
                  <Th>Failed attempts</Th>
                  <Th>Last event</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.subscriptionId}>
                    <Td>
                      <code style={{ fontSize: 12 }}>{r.subscriptionId}</code>
                    </Td>
                    <Td>
                      <StateChip state={r.state} />
                    </Td>
                    <Td>{r.failedAttempts}</Td>
                    <Td>
                      {r.lastProviderEventId ? (
                        <code
                          style={{
                            fontSize: 11,
                            color: "var(--fg-subtle)",
                          }}
                        >
                          {r.lastProviderEventId}
                        </code>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>
                          (no event yet)
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : null}
    </div>
  );
}
