"use client";

// components/tools/ExtractContactsTool.tsx
//
// 2026-05-01 — Extract Contacts: regex-based email + phone extraction
// from a PDF's text content. Uses PdfReadOpsTool slot-fill (same
// pattern as PdfFontsTool, PdfAttachmentsTool, etc.).
//
// Closes one of the KNOWN_DEAD_REFS entries — the SEO landing at
// /extract-emails-from-pdf has been seeded since at least 2026-04-30
// with `tool: "extract-contacts"` but the tool itself didn't exist.
// The landing rendered the "page hasn't been ported yet" placeholder
// for any visitor. Now it works.

import type { ReactNode } from "react";
import type {
  ExtractContactsResult,
  ExtractedEmail,
  ExtractedPhone,
} from "@/lib/pdf/ops/contacts";
import { PdfReadOpsTool } from "./PdfReadOpsTool";

export function ExtractContactsTool() {
  return (
    <PdfReadOpsTool<ExtractContactsResult>
      toolId="extract-contacts"
      toolGroup="Organize"
      prompt="Drop a PDF to extract emails + phone numbers"
      hint="Up to 100 MB · runs privately in your browser"
      busyLabel="Scanning for contacts…"
      parser={async (bytes) => {
        const { extractContacts } = await import("@/lib/pdf/ops/contacts");
        return extractContacts(bytes);
      }}
      pageCountForTracker={(r) => r.emails.length + r.phones.length}
      headline={(r) => {
        if (r.scannedPdfLikely) {
          return {
            primary: "No text extractable",
            detail:
              "This PDF is likely scanned (image-only). Run AI PDF OCR to make the text searchable, then re-run Extract Contacts.",
          };
        }
        const total = r.emails.length + r.phones.length;
        if (total === 0) {
          return {
            primary: "No contacts found",
            detail: `Scanned ${r.pageCount} page${r.pageCount === 1 ? "" : "s"} — no emails or phone numbers detected.`,
          };
        }
        const parts: string[] = [];
        if (r.emails.length > 0) {
          parts.push(`${r.emails.length} email${r.emails.length === 1 ? "" : "s"}`);
        }
        if (r.phones.length > 0) {
          parts.push(`${r.phones.length} phone${r.phones.length === 1 ? "" : "s"}`);
        }
        return {
          primary: parts.join(" · "),
          detail: `Across ${r.pageCount} page${r.pageCount === 1 ? "" : "s"}`,
        };
      }}
      jsonExport={(r) => ({
        emails: r.emails,
        phones: r.phones,
      })}
      csvExport={(r, fileName) => {
        if (r.emails.length === 0 && r.phones.length === 0) return null;
        const base = fileName.replace(/\.pdf$/i, "");
        // Combined CSV: type,value,normalized,region,count,pages
        // Single CSV is friendlier than two files for downstream
        // workflows like importing into a CRM or spreadsheet.
        const rows: string[][] = [];
        for (const e of r.emails) {
          rows.push([
            "email",
            e.email,
            "", // normalized N/A for emails
            "", // region N/A
            String(e.count),
            e.pages.join(","),
          ]);
        }
        for (const p of r.phones) {
          rows.push([
            "phone",
            p.raw,
            p.normalized ?? "",
            p.region,
            String(p.count),
            p.pages.join(","),
          ]);
        }
        return {
          filename: `${base}.contacts.csv`,
          header: ["type", "value", "normalized", "region", "count", "pages"],
          rows,
        };
      }}
      renderBody={(r) => renderContactsBody(r)}
    />
  );
}

function renderContactsBody(r: ExtractContactsResult): ReactNode {
  if (r.scannedPdfLikely) return null;
  if (r.emails.length === 0 && r.phones.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {r.emails.length > 0 && renderEmailTable(r.emails)}
      {r.phones.length > 0 && renderPhoneTable(r.phones)}
    </div>
  );
}

function renderEmailTable(emails: ExtractedEmail[]): ReactNode {
  return (
    <section>
      <h3 style={sectionHeadStyle}>Emails ({emails.length})</h3>
      <div style={{ maxHeight: 320, overflowY: "auto" }}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr
              style={{
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-1)",
              }}
            >
              <th style={cellStyle(true)}>Email</th>
              <th style={cellStyle(true)}>Count</th>
              <th style={cellStyle(true)}>Pages</th>
            </tr>
          </thead>
          <tbody>
            {emails.map((e, i) => (
              <tr
                key={`${e.email}-${i}`}
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <td style={cellStyle()}>
                  <span style={{ fontFamily: "var(--mono, monospace)" }}>
                    {e.email}
                  </span>
                </td>
                <td style={cellStyle()}>
                  <span className="subtle" style={{ fontSize: 12 }}>
                    {e.count}×
                  </span>
                </td>
                <td style={cellStyle()}>
                  <span className="subtle" style={{ fontSize: 11 }}>
                    {formatPageList(e.pages)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function renderPhoneTable(phones: ExtractedPhone[]): ReactNode {
  return (
    <section>
      <h3 style={sectionHeadStyle}>Phone numbers ({phones.length})</h3>
      <div style={{ maxHeight: 320, overflowY: "auto" }}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr
              style={{
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-1)",
              }}
            >
              <th style={cellStyle(true)}>As found</th>
              <th style={cellStyle(true)}>Normalized</th>
              <th style={cellStyle(true)}>Region</th>
              <th style={cellStyle(true)}>Count</th>
              <th style={cellStyle(true)}>Pages</th>
            </tr>
          </thead>
          <tbody>
            {phones.map((p, i) => (
              <tr
                key={`${p.raw}-${i}`}
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <td style={cellStyle()}>
                  <span style={{ fontFamily: "var(--mono, monospace)" }}>
                    {p.raw}
                  </span>
                </td>
                <td style={cellStyle()}>
                  {p.normalized ? (
                    <span style={{ fontFamily: "var(--mono, monospace)" }}>
                      {p.normalized}
                    </span>
                  ) : (
                    <span className="subtle" style={{ fontSize: 11 }}>—</span>
                  )}
                </td>
                <td style={cellStyle()}>
                  <span style={regionPillStyle(p.region)}>{p.region}</span>
                </td>
                <td style={cellStyle()}>
                  <span className="subtle" style={{ fontSize: 12 }}>
                    {p.count}×
                  </span>
                </td>
                <td style={cellStyle()}>
                  <span className="subtle" style={{ fontSize: 11 }}>
                    {formatPageList(p.pages)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatPageList(pages: number[]): string {
  if (pages.length === 1) return `p. ${pages[0]}`;
  if (pages.length <= 5) return `pp. ${pages.join(", ")}`;
  return `${pages.length} pages`;
}

const sectionHeadStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  margin: "0 0 12px",
  color: "var(--fg)",
};

function cellStyle(isHeader = false): React.CSSProperties {
  return {
    padding: "10px 16px",
    textAlign: "left",
    fontWeight: isHeader ? 500 : 400,
    fontSize: isHeader ? 11 : 13,
    letterSpacing: isHeader ? "0.05em" : undefined,
    textTransform: isHeader ? ("uppercase" as const) : undefined,
    color: isHeader ? "var(--fg-muted)" : "var(--fg)",
    verticalAlign: "top",
  };
}

function regionPillStyle(
  region: ExtractedPhone["region"],
): React.CSSProperties {
  const colors: Record<ExtractedPhone["region"], { bg: string; fg: string }> = {
    IN: { bg: "rgba(74, 222, 128, 0.12)", fg: "rgb(74, 222, 128)" },
    US: { bg: "rgba(96, 165, 250, 0.12)", fg: "rgb(96, 165, 250)" },
    intl: { bg: "rgba(168, 85, 247, 0.12)", fg: "rgb(168, 85, 247)" },
    unknown: { bg: "var(--bg-2)", fg: "var(--fg-muted)" },
  };
  const { bg, fg } = colors[region];
  return {
    fontSize: 11,
    fontWeight: 500,
    padding: "2px 6px",
    borderRadius: 4,
    background: bg,
    color: fg,
  };
}
