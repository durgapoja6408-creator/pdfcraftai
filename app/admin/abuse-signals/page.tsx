// app/admin/abuse-signals/page.tsx — abuse-signal clustering surface.
//
// Plan ref: docs/PRICING_AND_TELEMETRY_PLAN.md §7 + §8.
//
// What this page shows
//   Three tables that surface signups likely to be the same actor
//   under different identity facets:
//
//     1. By IP /24 bucket — signups grouped by the prefix of
//        users.signup_ip (the column populated by registerAction
//        via the Cloudflare cf-connecting-ip header).
//     2. By device fingerprint — signups with the same canvas+WebGL
//        +browser hash (users.device_fingerprint).
//     3. By Gmail-normalized email — signups whose
//        users.email_normalized collapses to the same canonical key
//        (catches Gmail+alias and dot-trick duplicates).
//
//   Each table shows clusters of size >= 2 ordered by cluster size
//   descending. For each cluster: the shared facet (IP/24, fingerprint,
//   normalized email), member count, and links to /admin/users for
//   each member (when /admin/users/[id] ships in the next session).
//
// Time scope
//   Default 30 days, overridable via ?days=N (clamped 1..365). Real
//   abuse waves typically come in bursts, so anything outside 30 days
//   is noise. 365 cap exists for retroactive forensics.
//
// What's NOT shown
//   - Per-user details (delegated to /admin/users when that ships)
//   - Action buttons (ban / approve / debit). The "queue_review"
//     decision lives in registerAction's stdout log; admin-side
//     intervention happens via SQL for now (this is a v1 surface).
//   - Real-time notifications. Page is request-time only; cron-job.org
//     style polling can hit a future API endpoint if we want alerts.

import { sql } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { requireAdmin } from "@/lib/admin/guard";
import { ErrorBanner, SectionTitle, Td, Th, tableStyle } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface IpCluster {
  bucket: string;
  count: number;
  oldestAt: Date;
  newestAt: Date;
}

interface FingerprintCluster {
  fingerprint: string;
  count: number;
  oldestAt: Date;
  newestAt: Date;
}

interface EmailCluster {
  emailNormalized: string;
  count: number;
  oldestAt: Date;
  newestAt: Date;
}

interface AbuseQueryResult {
  ipClusters: IpCluster[];
  fingerprintClusters: FingerprintCluster[];
  emailClusters: EmailCluster[];
  totalSignupsInWindow: number;
}

function clampDays(raw: string | undefined): number {
  const n = raw ? parseInt(raw, 10) : 30;
  if (!Number.isFinite(n) || n < 1) return 30;
  if (n > 365) return 365;
  return n;
}

async function getAbuseSignals(days: number): Promise<{
  data: AbuseQueryResult | null;
  error: string | null;
}> {
  try {
    const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Three GROUP BY queries, one per facet. Each uses an existing
    // index (users_signup_ip_idx, users_device_fingerprint_idx,
    // users_email_normalized_uq) so the cost is low even with 100k
    // users.

    // IP /24 bucket clusters. We extract the /24 prefix via
    // SUBSTRING_INDEX('192.168.1.42', '.', 3) → '192.168.1'.
    // For IPv6 we punt — not enough volume yet to model /48 buckets
    // separately; v6 IPs land in their own one-row clusters.
    const ipRowsRaw = await db.execute(sql`
      SELECT
        SUBSTRING_INDEX(signup_ip, '.', 3) AS bucket,
        COUNT(*) AS cluster_count,
        MIN(created_at) AS oldest_at,
        MAX(created_at) AS newest_at
      FROM users
      WHERE signup_ip IS NOT NULL
        AND signup_ip != ''
        AND created_at > ${windowStart}
      GROUP BY bucket
      HAVING cluster_count >= 2
      ORDER BY cluster_count DESC, newest_at DESC
      LIMIT 50
    `);

    // mysql2 returns [rows, fields] — drizzle's execute unwraps to
    // the rows array directly via QueryResult.
    const ipRows = (ipRowsRaw as unknown as Array<Record<string, unknown>>[])[0]
      ?? (ipRowsRaw as unknown as Array<Record<string, unknown>>);
    const ipClusters: IpCluster[] = (Array.isArray(ipRows) ? ipRows : []).map((r) => ({
      bucket: String(r.bucket ?? ""),
      count: Number(r.cluster_count ?? 0),
      oldestAt: new Date(String(r.oldest_at ?? new Date().toISOString())),
      newestAt: new Date(String(r.newest_at ?? new Date().toISOString())),
    }));

    // Device fingerprint clusters.
    const fpRowsRaw = await db.execute(sql`
      SELECT
        device_fingerprint AS fingerprint,
        COUNT(*) AS cluster_count,
        MIN(created_at) AS oldest_at,
        MAX(created_at) AS newest_at
      FROM users
      WHERE device_fingerprint IS NOT NULL
        AND device_fingerprint != ''
        AND created_at > ${windowStart}
      GROUP BY device_fingerprint
      HAVING cluster_count >= 2
      ORDER BY cluster_count DESC, newest_at DESC
      LIMIT 50
    `);
    const fpRows = (fpRowsRaw as unknown as Array<Record<string, unknown>>[])[0]
      ?? (fpRowsRaw as unknown as Array<Record<string, unknown>>);
    const fingerprintClusters: FingerprintCluster[] = (Array.isArray(fpRows) ? fpRows : []).map((r) => ({
      fingerprint: String(r.fingerprint ?? ""),
      count: Number(r.cluster_count ?? 0),
      oldestAt: new Date(String(r.oldest_at ?? new Date().toISOString())),
      newestAt: new Date(String(r.newest_at ?? new Date().toISOString())),
    }));

    // Email-normalized clusters (catches Gmail-alias duplicates that
    // bypass the unique index because email_normalized is nullable
    // for legacy rows).
    const emailRowsRaw = await db.execute(sql`
      SELECT
        email_normalized,
        COUNT(*) AS cluster_count,
        MIN(created_at) AS oldest_at,
        MAX(created_at) AS newest_at
      FROM users
      WHERE email_normalized IS NOT NULL
        AND created_at > ${windowStart}
      GROUP BY email_normalized
      HAVING cluster_count >= 2
      ORDER BY cluster_count DESC, newest_at DESC
      LIMIT 50
    `);
    const emailRows = (emailRowsRaw as unknown as Array<Record<string, unknown>>[])[0]
      ?? (emailRowsRaw as unknown as Array<Record<string, unknown>>);
    const emailClusters: EmailCluster[] = (Array.isArray(emailRows) ? emailRows : []).map((r) => ({
      emailNormalized: String(r.email_normalized ?? ""),
      count: Number(r.cluster_count ?? 0),
      oldestAt: new Date(String(r.oldest_at ?? new Date().toISOString())),
      newestAt: new Date(String(r.newest_at ?? new Date().toISOString())),
    }));

    // Total signups for context.
    const totalRowsRaw = await db.execute(sql`
      SELECT COUNT(*) AS total FROM users WHERE created_at > ${windowStart}
    `);
    const totalRows = (totalRowsRaw as unknown as Array<Record<string, unknown>>[])[0]
      ?? (totalRowsRaw as unknown as Array<Record<string, unknown>>);
    const totalSignupsInWindow = Number(
      (Array.isArray(totalRows) ? totalRows[0]?.total : 0) ?? 0,
    );

    return {
      data: {
        ipClusters,
        fingerprintClusters,
        emailClusters,
        totalSignupsInWindow,
      },
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { data: null, error: message };
  }
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function AdminAbuseSignalsPage({
  searchParams,
}: {
  searchParams?: { days?: string };
}) {
  // Gate happens here even though the layout also gates — defense-in-
  // depth + lets us reference the email if we want it later.
  await requireAdmin();

  const days = clampDays(searchParams?.days);
  const { data, error } = await getAbuseSignals(days);

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Abuse signals</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Signups clustered by shared IP /24, device fingerprint, and
          Gmail-normalized email over the last {days} days. Clusters of
          size ≥ 2 shown.
        </p>
        {data ? (
          <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
            Total signups in window: {data.totalSignupsInWindow}.
            Day range: <a href={`?days=7`} style={{ color: "var(--accent)" }}>7d</a>{" · "}
            <a href={`?days=30`} style={{ color: "var(--accent)" }}>30d</a>{" · "}
            <a href={`?days=90`} style={{ color: "var(--accent)" }}>90d</a>{" · "}
            <a href={`?days=365`} style={{ color: "var(--accent)" }}>365d</a>
          </p>
        ) : null}
      </header>

      {error ? <ErrorBanner message={`Abuse-signal query failed: ${error}`} /> : null}

      {data ? (
        <>
          <section style={{ marginBottom: 32 }}>
            <SectionTitle>By IP /24 bucket ({data.ipClusters.length})</SectionTitle>
            {data.ipClusters.length === 0 ? (
              <p className="muted">No IP clusters of size ≥ 2 in the window.</p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <Th>Bucket</Th>
                    <Th>Signups</Th>
                    <Th>First</Th>
                    <Th>Latest</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.ipClusters.map((c) => (
                    <tr key={c.bucket}>
                      <Td><code>{c.bucket}.0/24</code></Td>
                      <Td>{c.count}</Td>
                      <Td>{fmtDate(c.oldestAt)}</Td>
                      <Td>{fmtDate(c.newestAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section style={{ marginBottom: 32 }}>
            <SectionTitle>By device fingerprint ({data.fingerprintClusters.length})</SectionTitle>
            {data.fingerprintClusters.length === 0 ? (
              <p className="muted">No fingerprint clusters of size ≥ 2 in the window.</p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <Th>Fingerprint (first 12 chars)</Th>
                    <Th>Signups</Th>
                    <Th>First</Th>
                    <Th>Latest</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.fingerprintClusters.map((c) => (
                    <tr key={c.fingerprint}>
                      <Td><code>{c.fingerprint.slice(0, 12)}…</code></Td>
                      <Td>{c.count}</Td>
                      <Td>{fmtDate(c.oldestAt)}</Td>
                      <Td>{fmtDate(c.newestAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <SectionTitle>By Gmail-normalized email ({data.emailClusters.length})</SectionTitle>
            {data.emailClusters.length === 0 ? (
              <p className="muted">
                No email clusters of size ≥ 2. (The UNIQUE INDEX on
                email_normalized prevents these at insert time for new
                signups; clusters here would indicate legacy NULL rows
                pre-migration 0018.)
              </p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <Th>Normalized email</Th>
                    <Th>Signups</Th>
                    <Th>First</Th>
                    <Th>Latest</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.emailClusters.map((c) => (
                    <tr key={c.emailNormalized}>
                      <Td><code>{c.emailNormalized}</code></Td>
                      <Td>{c.count}</Td>
                      <Td>{fmtDate(c.oldestAt)}</Td>
                      <Td>{fmtDate(c.newestAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
