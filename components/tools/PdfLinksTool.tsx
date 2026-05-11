"use client";

// components/tools/PdfLinksTool.tsx
// Build 2 Wave 8: extract every hyperlink from a PDF.
//
// M21 (#193, 2026-04-29): migrated to PdfReadOpsTool. ~340 LOC of
// boilerplate (file drop, busy card, error card, result-card shell,
// copy-JSON, CSV download, reset) collapsed to ~80 LOC of slot-fills
// for parser + headline + renderBody + csvExport. The unique
// rendering — the Page/Type/Target table with external-link styling
// — stays here as renderBody.

import type { ReactNode } from "react";
import type { PdfLink } from "@/lib/pdf/ops/links";
import { PdfReadOpsTool } from "./PdfReadOpsTool";
import { ToolHowItWorks } from "./ToolHowItWorks";

interface ParseResult {
  links: PdfLink[];
  externalCount: number;
  internalCount: number;
  unsupported: boolean;
}

export function PdfLinksTool() {
  return (
    <PdfReadOpsTool<ParseResult>
      toolId="pdf-links"
      toolGroup="Organize"
      prompt="Drop a PDF to extract its links"
      hint="Up to 100 MB · runs privately in your browser"
      busyLabel="Extracting links…"
      howItWorks={
        <ToolHowItWorks
          steps={[
            {
              title: "Drop in your PDF",
              body: "Up to 100 MB. The link extractor parses the PDF's annotation dictionary locally — nothing leaves your browser.",
            },
            {
              title: "We surface every hyperlink",
              body: "External URLs, internal cross-references, named destinations, even URI dictionary entries — each tagged by type and anchored to the page it lives on.",
            },
            {
              title: "Audit before you click",
              body: "Spot deceptive link text vs. real destinations, pull every URL for SEO link-checking, or export as CSV for compliance review of a long contract.",
            },
          ]}
          privacyNote="Your PDF stays in your browser. The link extractor reads structural bytes only — nothing is uploaded, logged, or persisted."
        />
      }
      parser={async (bytes) => {
        const { extractLinks } = await import("@/lib/pdf/ops/links");
        const r = extractLinks(bytes);
        return {
          links: r.links,
          externalCount: r.externalCount,
          internalCount: r.internalCount,
          unsupported: r.unsupported,
        };
      }}
      pageCountForTracker={(r) => r.links.length}
      headline={(r) => {
        if (r.links.length === 0) {
          return {
            primary: r.unsupported ? "Couldn't parse links" : "No links found",
          };
        }
        return {
          primary: `${r.links.length} link${r.links.length === 1 ? "" : "s"}`,
          detail: `${r.externalCount} external · ${r.internalCount} internal`,
        };
      }}
      jsonExport={(r) => r.links}
      csvExport={(r, fileName) => {
        if (r.links.length === 0) return null;
        const base = fileName.replace(/\.pdf$/i, "");
        return {
          filename: `${base}.links.csv`,
          header: ["page", "type", "target"],
          rows: r.links.map((l) => [l.pageNumber, l.type, l.target]),
        };
      }}
      renderBody={(r) => renderLinksTable(r.links)}
    />
  );
}

function renderLinksTable(links: PdfLink[]): ReactNode {
  if (links.length === 0) return null;
  return (
    <div style={{ maxHeight: 480, overflowY: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr
            style={{
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-1)",
            }}
          >
            <th style={cell(true)}>Page</th>
            <th style={cell(true)}>Type</th>
            <th style={cell(true)}>Target</th>
          </tr>
        </thead>
        <tbody>
          {links.map((l, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={cell()}>{l.pageNumber}</td>
              <td style={cell()}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background:
                      l.type === "external"
                        ? "rgba(56, 189, 248, 0.12)"
                        : "var(--bg-2)",
                    color:
                      l.type === "external"
                        ? "rgb(56, 189, 248)"
                        : "var(--fg-muted)",
                  }}
                >
                  {l.type}
                </span>
              </td>
              <td
                style={{
                  ...cell(),
                  fontFamily: "var(--mono, monospace)",
                  maxWidth: 460,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={l.target}
              >
                {l.type === "external" ? (
                  <a
                    href={l.target}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--accent)" }}
                  >
                    {l.target}
                  </a>
                ) : (
                  l.target
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function cell(isHeader = false): React.CSSProperties {
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
