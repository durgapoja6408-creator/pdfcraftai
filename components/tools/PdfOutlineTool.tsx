"use client";

// components/tools/PdfOutlineTool.tsx
//
// Build 2 Wave 4 (2026-04-27): show the outline / bookmark tree
// of a PDF. Pure byte-parser tool — uses lib/pdf/ops/outline.ts,
// no PDFium engine dependency. Useful for previewing TOCs of long
// docs (research papers, textbooks, legal exhibits) before
// committing to read.
//
// 2026-04-30 (audit cluster A): migrated to PdfReadOpsTool. Was
// 387 LOC of bespoke drop+busy+error+copy+JSON-download
// boilerplate; collapsed to ~115 LOC of slot-fills (parser +
// headline + renderBody + jsonExport + csvExport). The unique
// surface — the indented bookmark tree with depth + page number
// — stays here as renderBody.

import type { ReactNode } from "react";
import type { OutlineNode } from "@/lib/pdf/ops/outline";
import { PdfReadOpsTool } from "./PdfReadOpsTool";
import { ToolHowItWorks } from "./ToolHowItWorks";

interface ParseResult {
  nodes: OutlineNode[];
  unsupported: boolean;
}

export function PdfOutlineTool() {
  return (
    <PdfReadOpsTool<ParseResult>
      toolId="pdf-outline"
      toolGroup="Organize"
      prompt="Drop a PDF to view its outline"
      hint="Up to 100 MB · runs privately in your browser"
      busyLabel="Reading the outline…"
      howItWorks={
        <ToolHowItWorks
          steps={[
            {
              title: "Drop in your PDF",
              body: "Books, reports, technical specs — anything with a bookmark structure. The outline parser reads the document tree locally in your browser.",
            },
            {
              title: "We render the full bookmark tree",
              body: "Every chapter / section / subsection with indentation matching its depth + the destination page number. Skim the structure of a 400-page doc in 5 seconds.",
            },
            {
              title: "Copy as markdown or JSON",
              body: "Lift the outline straight into a notes file, repurpose as a TOC starter, or hand the JSON to your downstream pipeline.",
            },
          ]}
          privacyNote="Your PDF stays in your browser. The outline parser reads structural bytes only — nothing is uploaded, logged, or persisted."
        />
      }
      parser={async (bytes) => {
        const { extractOutline } = await import("@/lib/pdf/ops/outline");
        const r = extractOutline(bytes);
        return {
          nodes: r.nodes,
          unsupported: r.unsupported,
        };
      }}
      pageCountForTracker={(r) => r.nodes.length}
      headline={(r) => {
        if (r.nodes.length === 0) {
          return {
            primary: r.unsupported
              ? "Couldn't parse the outline"
              : "No outline / bookmarks",
            detail: r.unsupported
              ? "This PDF uses cross-reference streams or encryption that our byte parser can't follow."
              : "This PDF doesn't have any bookmarks set.",
          };
        }
        return {
          primary: `${r.nodes.length} bookmark${r.nodes.length === 1 ? "" : "s"}`,
        };
      }}
      jsonExport={(r) => r.nodes}
      csvExport={(r, fileName) => {
        if (r.nodes.length === 0) return null;
        const base = fileName.replace(/\.pdf$/i, "");
        return {
          filename: `${base}.outline.csv`,
          header: ["depth", "title", "page_number"],
          rows: r.nodes.map((n) => [
            n.depth,
            n.title,
            n.pageNumber ?? "",
          ]),
        };
      }}
      renderBody={(r) => renderOutlineTree(r.nodes)}
      errorCode="outline_failed"
    />
  );
}

function renderOutlineTree(nodes: OutlineNode[]): ReactNode {
  if (nodes.length === 0) return null;
  return (
    <ul
      style={{
        margin: 0,
        padding: "12px 24px",
        listStyle: "none",
        maxHeight: 480,
        overflowY: "auto",
        fontSize: 13,
      }}
    >
      {nodes.map((n, i) => (
        <li
          key={`${n.objectNumber}-${i}`}
          style={{
            paddingLeft: n.depth * 18,
            paddingTop: 4,
            paddingBottom: 4,
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 8,
            alignItems: "baseline",
          }}
        >
          <span
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={n.title}
          >
            {n.depth > 0 && (
              <span
                className="subtle"
                style={{ fontSize: 11, marginRight: 4 }}
              >
                ↳
              </span>
            )}
            {n.title || <em className="subtle">(untitled)</em>}
          </span>
          {n.pageNumber !== null && (
            <span
              className="mono subtle"
              style={{ fontSize: 11, whiteSpace: "nowrap" }}
            >
              p. {n.pageNumber}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
