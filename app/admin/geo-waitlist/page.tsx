// app/admin/geo-waitlist/page.tsx — Geo waitlist viewer (PENDING
// gap A, 2026-05-07).
//
// Closes the "no admin viewer for who signed up to be notified
// when their country opens up" gap. Read-only by design — no
// notify-when-open automation yet (Tier 4 follow-on); this page
// is the manual-export-and-blast surface ops can use today.

import type { Metadata } from "next";

import { db, schema } from "@/db/client";
import { desc, sql } from "drizzle-orm";

import { requireAdmin } from "@/lib/admin/guard";
import { SectionTitle, Td, Th, tableStyle } from "@/components/admin/ui";

export const metadata: Metadata = {
  title: "Geo waitlist",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ") + " UTC";
}

export default async function GeoWaitlistAdminPage() {
  await requireAdmin();

  // Aggregate by country first — operators care about "which markets
  // have demand" before drilling into individual emails.
  const byCountry = await db
    .select({
      country: schema.geoWaitlist.country,
      count: sql<number>`COUNT(*)`,
    })
    .from(schema.geoWaitlist)
    .groupBy(schema.geoWaitlist.country)
    .orderBy(sql`COUNT(*) DESC`);

  // Recent 200 individual signups for export-and-blast workflow
  const recent = await db
    .select()
    .from(schema.geoWaitlist)
    .orderBy(desc(schema.geoWaitlist.createdAt))
    .limit(200);

  const total = byCountry.reduce((acc, r) => acc + Number(r.count), 0);

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Geo waitlist
        </h1>
        <p className="muted" style={{ marginTop: 4, lineHeight: 1.5 }}>
          Source: <code>geo_waitlist</code> (migration 0004). Captures
          email + country when a non-IN buyer hits the upgrade flow
          and lands on <code>/launch-notify</code>. Total signups:{" "}
          <strong>{total}</strong> across {byCountry.length}{" "}
          countries.
        </p>
        <p
          className="muted"
          style={{
            marginTop: 8,
            fontSize: 12,
            fontStyle: "italic",
          }}
        >
          Notify-when-open email automation is not yet built — manual
          export-and-blast via this page today. Tier 4 follow-on
          will wire transactional sender once SMTP is stable.
        </p>
      </header>

      {/* Per-country aggregate */}
      <section style={{ marginBottom: 24 }}>
        <SectionTitle>By country (top markets first)</SectionTitle>
        {byCountry.length === 0 ? (
          <p className="muted" style={{ fontSize: 14 }}>
            No waitlist signups yet.
          </p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Country</Th>
                <Th align="right">Signups</Th>
              </tr>
            </thead>
            <tbody>
              {byCountry.map((r) => (
                <tr key={r.country}>
                  <Td>
                    <code style={{ fontSize: 12 }}>{r.country}</code>
                  </Td>
                  <Td align="right">{Number(r.count)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Recent individual signups */}
      <section>
        <SectionTitle>Recent signups ({recent.length})</SectionTitle>
        {recent.length === 0 ? (
          <p className="muted" style={{ fontSize: 14 }}>
            Empty.
          </p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Email</Th>
                <Th>Country</Th>
                <Th>Reason</Th>
                <Th>Source</Th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <span
                      style={{ fontSize: 11, color: "var(--fg-subtle)" }}
                    >
                      {fmtDate(r.createdAt)}
                    </span>
                  </Td>
                  <Td>
                    <span style={{ fontSize: 12 }}>{r.email}</span>
                  </Td>
                  <Td>
                    <code style={{ fontSize: 12 }}>{r.country}</code>
                  </Td>
                  <Td>
                    <code style={{ fontSize: 11 }}>{r.reason}</code>
                  </Td>
                  <Td>
                    <code style={{ fontSize: 11 }}>{r.source}</code>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
