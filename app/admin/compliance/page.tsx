// app/admin/compliance/page.tsx — Compliance coverage dashboard.
//
// Task #25 / Phase D.
//
// What this page is:
// ------------------
// A single-pane "are we covered?" report for the three legal surfaces an
// operator needs to answer audit/DPA questionnaire asks on demand:
//
//   1. Subprocessor list — every third-party that touches user data, with
//      purpose / data region / transfer mechanism. Matches the public
//      /dpa subprocessor table; a drift between this page and /dpa is
//      itself a compliance bug (subprocessors must be disclosed).
//
//   2. DPDP Act 2023 coverage — which sections we disclose where.
//      Maps against the six rights granted by ss. 11–14, the s. 6(3)
//      withdrawal mandate, s. 8(10) Grievance Officer, s. 9 children,
//      and s. 16 cross-border transfers. Task #24 wired each of these
//      into the public docs; this page pins the inventory.
//
//   3. GDPR / ePrivacy / ICO / EDPB coverage — the parallel EU surface.
//
//   4. Legal doc freshness — "last updated" for /privacy, /terms, /dpa,
//      /cookies so the operator can spot stale docs before an auditor
//      does. The "updated" field lives in lib/legal-docs.ts per-doc.
//
//   5. Grievance Officer card — DPDP s. 8(10) requires us to name a
//      role + contact + response SLA. We surface that here so any
//      operator acting as Grievance Officer (or their successor) can
//      confirm the public record is correct.
//
// Why pure-static (no DB query):
// ------------------------------
// Everything shown is static metadata from lib/legal-docs.ts +
// phase-d-queries.ts constants. No PII, no counts, no per-user state.
// This is a compliance map, not a compliance LOG — logs of consent
// changes per user would live on the user detail page once we add them.

import type { Metadata } from "next";
import { LEGAL_DOCS } from "@/lib/legal-docs";
import {
  SUBPROCESSORS,
  DPDP_COVERAGE,
  GDPR_COVERAGE,
} from "@/lib/admin/phase-d-queries";
import {
  SectionTitle,
  StatCard,
  Td,
  Th,
  tableStyle,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Compliance · Admin",
};

export default function AdminCompliancePage() {
  const dpdpCount = DPDP_COVERAGE.length;
  const gdprCount = GDPR_COVERAGE.length;
  const subCount = SUBPROCESSORS.length;
  const thirdCountrySubs = SUBPROCESSORS.filter(
    (s) =>
      !/^Domestic/i.test(s.transferMechanism) && s.dataRegion !== "India"
  ).length;

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Compliance
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Coverage inventory for DPDP Act 2023 (India), GDPR (EU/UK), the
          ePrivacy Directive, and the subprocessor list. Read-only.
          Everything on this page is derived from{" "}
          <code>lib/legal-docs.ts</code> and{" "}
          <code>lib/admin/phase-d-queries.ts</code> — edit those to update
          the public record, not this page.
        </p>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Subprocessors"
          value={String(subCount)}
          hint={`${thirdCountrySubs} cross-border`}
        />
        <StatCard
          label="DPDP sections disclosed"
          value={String(dpdpCount)}
          hint="s. 6(3) / 8(10) / 9 / 11 / 12 / 13 / 14 / 16"
          tone="good"
        />
        <StatCard
          label="GDPR + ePrivacy refs"
          value={String(gdprCount)}
          hint="Art. 6(1)(a) / 7(3) / Ch. V / ePrivacy Art. 5(3)"
          tone="good"
        />
        <StatCard
          label="Legal docs live"
          value={String(Object.keys(LEGAL_DOCS).length)}
          hint="privacy / terms / dpa / security / policies"
        />
      </section>

      <section style={{ marginBottom: 32 }}>
        <SectionTitle>Legal doc freshness</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Slug</Th>
                <Th>Title</Th>
                <Th>Last updated</Th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(LEGAL_DOCS).map(([slug, doc]) => (
                <tr key={slug}>
                  <Td mono>/{slug}</Td>
                  <Td>{doc.title}</Td>
                  <Td>{doc.updated}</Td>
                </tr>
              ))}
              <tr>
                <Td mono>/cookies</Td>
                <Td>Cookie policy</Td>
                <Td>April 22, 2026</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <SectionTitle>Subprocessors ({subCount})</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Category</Th>
                <Th>Purpose</Th>
                <Th>Data region</Th>
                <Th>Transfer mechanism</Th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((s) => (
                <tr key={s.name}>
                  <Td>{s.name}</Td>
                  <Td mono>{s.category}</Td>
                  <Td>{s.purpose}</Td>
                  <Td>{s.dataRegion}</Td>
                  <Td>{s.transferMechanism}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          This list mirrors the public subprocessor disclosure in{" "}
          <a href="/dpa" style={{ color: "inherit" }}>
            /dpa
          </a>
          . A drift between this page and /dpa is itself a compliance
          finding — update <code>lib/legal-docs.ts</code> and{" "}
          <code>lib/admin/phase-d-queries.ts:SUBPROCESSORS</code> in the
          same PR.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <SectionTitle>
          DPDP Act 2023 coverage ({dpdpCount} sections)
        </SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Section</Th>
                <Th>Topic</Th>
                <Th>Disclosed in</Th>
              </tr>
            </thead>
            <tbody>
              {DPDP_COVERAGE.map((row) => (
                <tr key={row.section}>
                  <Td mono>{row.section}</Td>
                  <Td>{row.topic}</Td>
                  <Td>
                    {row.disclosedIn.map((p, i) => (
                      <span key={p}>
                        {i > 0 ? ", " : ""}
                        <a href={p} style={{ color: "inherit" }}>
                          <code>{p}</code>
                        </a>
                      </span>
                    ))}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <SectionTitle>
          GDPR + ePrivacy + EDPB + ICO coverage ({gdprCount} refs)
        </SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Topic</Th>
                <Th>Disclosed in</Th>
              </tr>
            </thead>
            <tbody>
              {GDPR_COVERAGE.map((row) => (
                <tr key={row.reference}>
                  <Td>{row.reference}</Td>
                  <Td>{row.topic}</Td>
                  <Td>
                    {row.disclosedIn.map((p, i) => (
                      <span key={p}>
                        {i > 0 ? ", " : ""}
                        <a href={p} style={{ color: "inherit" }}>
                          <code>{p}</code>
                        </a>
                      </span>
                    ))}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <SectionTitle>Grievance Officer (DPDP s. 8(10))</SectionTitle>
        <div className="card" style={{ padding: 20 }}>
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>Role:</strong> Grievance Officer
          </p>
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>Contact:</strong>{" "}
            <a
              href="mailto:support@pdfcraftai.com"
              style={{ color: "inherit" }}
            >
              support@pdfcraftai.com
            </a>
          </p>
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>Response SLA:</strong> 15 days (per DPDP s. 8(10))
          </p>
          <p className="muted" style={{ margin: "8px 0 0 0", fontSize: 13 }}>
            Named on <code>/privacy</code>, <code>/cookies</code>, and{" "}
            <code>/dpa</code>. Indian residents can escalate to the Data
            Protection Board of India (once constituted) under DPDP s. 27
            if we fail to respond within SLA.
          </p>
        </div>
      </section>

      <section>
        <SectionTitle>Forward-looking: DPDP Consent Manager</SectionTitle>
        <p>
          MeitY (Ministry of Electronics &amp; IT) is expected to notify
          the DPDP Consent Manager framework in 2026/2027. When the CM
          framework is live, we'll integrate so Indian users can manage
          consent across all their Data Fiduciaries from one CM dashboard
          — our cookie banner will forward to the user-selected CM rather
          than only writing <code>pdfcraft_consent</code> locally. This
          commitment is disclosed in <code>/dpa</code>.
        </p>
      </section>
    </div>
  );
}
