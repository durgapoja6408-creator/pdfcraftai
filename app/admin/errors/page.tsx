// app/admin/errors/page.tsx — In-house error tracker viewer.
//
// Contract: read the `error_events` table (populated by
// lib/observability/capture.ts via /api/errors and server-side
// captureServerError) and present it grouped by `fingerprint` so an
// operator sees DISTINCT problems ranked by how often they fire,
// not a raw firehose. This is the free, self-hosted alternative to a
// paid error-tracking SaaS — same table the rest of /admin reads, no
// external dependency, no per-event cost.
//
// Two stat cards (total in window / last 24h) give a quick "is
// something on fire right now" read; the grouped table is the triage
// surface. Newest occurrence wins for the displayed message/path so a
// fingerprint that drifts slightly still shows its latest shape.

import { sql } from "drizzle-orm";

import { db } from "@/db/client";
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

type ErrorGroup = {
  fingerprint: string;
  count: number;
  kind: string;
  lastMessage: string;
  lastPath: string | null;
  lastSeen: Date;
};

function rows(raw: unknown): Array<Record<string, unknown>> {
  // mysql2 returns [rows, fields]; drizzle's execute unwraps to the
  // rows array. Tolerate both shapes (same guard the other admin
  // pages use).
  const a = (raw as Array<Record<string, unknown>>[])[0]
    ?? (raw as Array<Record<string, unknown>>);
  return Array.isArray(a) ? a : [];
}

export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams?: { days?: string };
}) {
  const days = clampDays(searchParams?.days);

  let groups: ErrorGroup[] = [];
  let total = 0;
  let last24h = 0;
  let error: string | null = null;

  try {
    const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Grouped by fingerprint: one row per distinct problem, newest
    // occurrence supplies the displayed message/path.
    const groupedRaw = await db.execute(sql`
      SELECT
        e.fingerprint AS fingerprint,
        e.cnt AS cnt,
        e.last_seen AS last_seen,
        latest.kind AS kind,
        latest.message AS message,
        latest.path AS path
      FROM (
        SELECT fingerprint, COUNT(*) AS cnt, MAX(created_at) AS last_seen
        FROM error_events
        WHERE created_at > ${windowStart}
        GROUP BY fingerprint
      ) e
      JOIN error_events latest
        ON latest.fingerprint = e.fingerprint
       AND latest.created_at = e.last_seen
      GROUP BY e.fingerprint, e.cnt, e.last_seen, latest.kind, latest.message, latest.path
      ORDER BY e.cnt DESC, e.last_seen DESC
      LIMIT 200
    `);
    groups = rows(groupedRaw).map((r) => ({
      fingerprint: String(r.fingerprint ?? ""),
      count: Number(r.cnt ?? 0),
      kind: String(r.kind ?? ""),
      lastMessage: String(r.message ?? ""),
      lastPath: r.path == null ? null : String(r.path),
      lastSeen: new Date(String(r.last_seen ?? new Date().toISOString())),
    }));

    const totalRaw = await db.execute(sql`
      SELECT COUNT(*) AS n FROM error_events WHERE created_at > ${windowStart}
    `);
    total = Number(rows(totalRaw)[0]?.n ?? 0);

    const last24hRaw = await db.execute(sql`
      SELECT COUNT(*) AS n FROM error_events WHERE created_at > ${dayAgo}
    `);
    last24h = Number(rows(last24hRaw)[0]?.n ?? 0);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Errors</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Past {days} days. Grouped by fingerprint — one row per distinct
          problem, ranked by occurrences.
        </p>
        <div style={{ marginTop: 12 }}>
          <DayPicker current={days} base="/admin/errors" />
        </div>
      </header>

      {error ? <ErrorBanner message={`Errors query failed: ${error}`} /> : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
          marginBottom: 28,
        }}
      >
        <StatCard label={`Total (${days}d)`} value={total.toLocaleString()} />
        <StatCard label="Last 24h" value={last24h.toLocaleString()} />
        <StatCard label="Distinct issues" value={groups.length.toLocaleString()} />
      </section>

      <section>
        <SectionTitle>Issues by fingerprint</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Count</Th>
                  <Th>Kind</Th>
                  <Th>Message</Th>
                  <Th>Path</Th>
                  <Th>Last seen</Th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 ? (
                  <tr>
                    <Td colSpan={5}>
                      <span className="muted">
                        No errors recorded in this window. 🎉
                      </span>
                    </Td>
                  </tr>
                ) : (
                  groups.map((g) => (
                    <tr key={g.fingerprint}>
                      <Td>
                        <strong>{g.count.toLocaleString()}</strong>
                      </Td>
                      <Td>{g.kind}</Td>
                      <Td>
                        <span
                          style={{
                            display: "block",
                            maxWidth: 460,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={g.lastMessage}
                        >
                          {g.lastMessage || "—"}
                        </span>
                      </Td>
                      <Td>
                        <span className="muted">{g.lastPath ?? "—"}</span>
                      </Td>
                      <Td>{g.lastSeen.toISOString().replace("T", " ").slice(0, 19)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
