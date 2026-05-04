// app/admin/contact-submissions/page.tsx — read-only contact submissions queue.
//
// Plan ref: docs/PENDING_WORK_ANALYSIS.md §4c (contact form persisted
// to stdout only). This page is the admin-side reader for the new
// `contact_submissions` table (migration 0021), which exists to keep
// /enterprise sales-qualified leads from disappearing into Hostinger
// log rotation while the founder evaluates SendGrid / Postmark /
// Resend for transactional email.
//
// What this page shows
//   The 100 most recent contact form submissions, newest first, with:
//     - timestamp (UTC + relative)
//     - status chip ("new" / "read" / "replied" / "spam")
//     - topic chip
//     - name + email
//     - 200-char excerpt of the message
//     - IP + truncated User-Agent (in monospace, smaller font) for triage
//     - referer (so we can tell /enterprise leads from /contact leads)
//
// What this page does NOT do (yet)
//   - Mark-as-read / mark-as-replied — v1 is read-only. The admin
//     workflow is "open this page, scan, copy email to your mail
//     client, reply, done." Status stays "new" until a future commit
//     wires server actions for status transitions.
//   - Send replies in-app — that requires the SendGrid/Postmark wire
//     up which is the actual blocker.
//   - Pagination — 100 rows handles ~3-6 months of low-volume traffic
//     before we need it. When the table grows, add ?page=N + LIMIT/OFFSET.
//
// Time scope
//   Default 30 days, overridable via ?days=N (clamped 1..365).
//   Pattern matches the rest of /admin/* pages (DayPicker component
//   from @/components/admin/ui). 30 days catches the recent activity
//   that's actionable; the 365 cap exists for retroactive search
//   ("did this person email us last summer?").

import Link from "next/link";
import { sql } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { requireAdmin } from "@/lib/admin/guard";
import {
  DayPicker,
  ErrorBanner,
  SectionTitle,
  Td,
  Th,
  clampDays,
  tableStyle,
} from "@/components/admin/ui";
import { formatRelative, formatUtcDate } from "@/lib/admin/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SubmissionRow {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  ip: string;
  userAgent: string | null;
  referer: string | null;
  status: string;
  createdAt: Date;
  readAt: Date | null;
}

interface QueryResult {
  rows: SubmissionRow[];
  totalInWindow: number;
  newCount: number;
  byTopic: Array<{ topic: string; count: number }>;
}

async function getSubmissions(days: number): Promise<{
  data: QueryResult | null;
  error: string | null;
}> {
  try {
    const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Single SELECT for the row list + two cheap COUNTs/GROUP BY for
    // the summary cards. Three round-trips because the queries don't
    // share a WHERE clause shape; each runs ~ms against the indexed
    // (created_at) and (status, created_at) columns.
    const rowsRaw = await db
      .select()
      .from(schema.contactSubmissions)
      .where(sql`${schema.contactSubmissions.createdAt} > ${windowStart}`)
      .orderBy(sql`${schema.contactSubmissions.createdAt} DESC`)
      .limit(100);

    // The Drizzle row shape already maps snake_case to camelCase via
    // the schema declaration, so we can pass these straight to the
    // SubmissionRow consumer.
    const rows: SubmissionRow[] = rowsRaw.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      topic: r.topic,
      message: r.message,
      ip: r.ip,
      userAgent: r.userAgent ?? null,
      referer: r.referer ?? null,
      status: r.status,
      createdAt: r.createdAt,
      readAt: r.readAt ?? null,
    }));

    // Summary card #1: total submissions in window.
    const totalRaw = await db.execute(sql`
      SELECT COUNT(*) AS c
      FROM contact_submissions
      WHERE created_at > ${windowStart}
    `);
    const totalRow = (totalRaw as unknown as Array<Array<Record<string, unknown>>>)[0]?.[0]
      ?? (totalRaw as unknown as Array<Record<string, unknown>>)[0];
    const totalInWindow = Number((totalRow as { c?: unknown })?.c ?? 0);

    // Summary card #2: count of "new" status (the actionable backlog).
    const newRaw = await db.execute(sql`
      SELECT COUNT(*) AS c
      FROM contact_submissions
      WHERE created_at > ${windowStart}
        AND status = 'new'
    `);
    const newRow = (newRaw as unknown as Array<Array<Record<string, unknown>>>)[0]?.[0]
      ?? (newRaw as unknown as Array<Record<string, unknown>>)[0];
    const newCount = Number((newRow as { c?: unknown })?.c ?? 0);

    // Summary card #3: topic distribution. Ordered by count DESC so
    // the founder sees "Sales" leads first if /enterprise is driving
    // the funnel.
    const topicRaw = await db.execute(sql`
      SELECT topic, COUNT(*) AS c
      FROM contact_submissions
      WHERE created_at > ${windowStart}
      GROUP BY topic
      ORDER BY c DESC
    `);
    const topicRows = (topicRaw as unknown as Array<Record<string, unknown>>[])[0]
      ?? (topicRaw as unknown as Array<Record<string, unknown>>);
    const byTopic = (Array.isArray(topicRows) ? topicRows : []).map((r) => ({
      topic: String(r.topic ?? "?"),
      count: Number(r.c ?? 0),
    }));

    return {
      data: { rows, totalInWindow, newCount, byTopic },
      error: null,
    };
  } catch (e) {
    return { data: null, error: String(e) };
  }
}

function statusTone(status: string): { bg: string; fg: string } {
  // Color mapping kept inline (not in @/components/admin/ui) so a
  // future change to the status enum doesn't have to round-trip
  // through the shared UI module. "new" gets the accent-soft color
  // to draw the eye to the actionable rows; "read" / "replied" go
  // muted; "spam" stays warning-yellow.
  switch (status) {
    case "new":
      return {
        bg: "color-mix(in oklab, var(--accent) 18%, transparent)",
        fg: "var(--accent)",
      };
    case "read":
      return {
        bg: "color-mix(in oklab, var(--fg) 8%, transparent)",
        fg: "var(--fg-subtle, #a8acb8)",
      };
    case "replied":
      return {
        bg: "color-mix(in oklab, #4caf50 18%, transparent)",
        fg: "#4caf50",
      };
    case "spam":
      return {
        bg: "color-mix(in oklab, #f57c00 18%, transparent)",
        fg: "#f57c00",
      };
    default:
      return {
        bg: "transparent",
        fg: "var(--fg)",
      };
  }
}

function StatusChip({ status }: { status: string }) {
  const tone = statusTone(status);
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
      {status}
    </span>
  );
}

function TopicChip({ topic }: { topic: string }) {
  // Topic chip is neutral so the eye lands on the status chip first.
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        border: "1px solid var(--border)",
        color: "var(--fg)",
        fontSize: 11,
        fontWeight: 500,
      }}
    >
      {topic}
    </span>
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

export default async function AdminContactSubmissionsPage({
  searchParams,
}: {
  searchParams?: { days?: string };
}) {
  await requireAdmin();
  const days = clampDays(searchParams?.days);
  const { data, error } = await getSubmissions(days);

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Contact submissions
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Past {days} days. Source: <code>contact_submissions</code> table
          (migration 0021). Submissions persist here AND log to stdout for
          defense-in-depth. Outbound email (SendGrid/Postmark/Resend) is
          still pending — reply manually from your mail client.
        </p>
        <div style={{ marginTop: 12 }}>
          <DayPicker current={days} base="/admin/contact-submissions" />
        </div>
      </header>

      {error ? (
        <ErrorBanner message={`Submissions query failed: ${error}`} />
      ) : null}

      {data ? (
        <>
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
                Total in window
              </div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>
                {data.totalInWindow}
              </div>
            </div>
            <div
              className="card"
              style={{
                padding: 16,
                borderColor:
                  data.newCount > 0 ? "var(--accent)" : "var(--border)",
              }}
            >
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                New (unread)
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: data.newCount > 0 ? "var(--accent)" : "var(--fg)",
                }}
              >
                {data.newCount}
              </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Top topics
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {data.byTopic.length === 0 ? (
                  <span className="muted" style={{ fontSize: 13 }}>
                    none
                  </span>
                ) : (
                  data.byTopic.slice(0, 5).map((t) => (
                    <span
                      key={t.topic}
                      style={{
                        fontSize: 12,
                        padding: "2px 6px",
                        borderRadius: 4,
                        border: "1px solid var(--border)",
                      }}
                    >
                      {t.topic} <strong>×{t.count}</strong>
                    </span>
                  ))
                )}
              </div>
            </div>
          </section>

          <SectionTitle>Recent submissions ({data.rows.length})</SectionTitle>

          {data.rows.length === 0 ? (
            <p className="muted" style={{ fontSize: 14 }}>
              No submissions in the past {days} days.
            </p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Status</Th>
                  <Th>Topic</Th>
                  <Th>From</Th>
                  <Th>Message</Th>
                  <Th>Source</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      <div style={{ fontSize: 13 }}>
                        {formatUtcDate(r.createdAt)}
                      </div>
                      <div
                        className="muted"
                        style={{ fontSize: 11, marginTop: 2 }}
                      >
                        {formatRelative(r.createdAt)}
                      </div>
                    </Td>
                    <Td>
                      <StatusChip status={r.status} />
                    </Td>
                    <Td>
                      <TopicChip topic={r.topic} />
                    </Td>
                    <Td>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {r.name}
                      </div>
                      <Link
                        href={`mailto:${r.email}`}
                        style={{
                          fontSize: 12,
                          color: "var(--accent)",
                          textDecoration: "underline",
                        }}
                      >
                        {r.email}
                      </Link>
                    </Td>
                    <Td>
                      <div
                        style={{
                          fontSize: 12,
                          maxWidth: 360,
                          lineHeight: 1.5,
                        }}
                      >
                        {truncate(r.message, 200)}
                      </div>
                    </Td>
                    <Td>
                      <div
                        style={{
                          fontSize: 11,
                          fontFamily: "var(--font-mono, monospace)",
                          color: "var(--fg-subtle, #a8acb8)",
                        }}
                      >
                        {r.ip || "—"}
                      </div>
                      {r.referer && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--fg-subtle, #a8acb8)",
                            marginTop: 2,
                            maxWidth: 240,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={r.referer}
                        >
                          ref: {r.referer}
                        </div>
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
