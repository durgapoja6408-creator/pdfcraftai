"use client";

// components/tools/PdfBookletTool.tsx
//
// 2026-05-01 Tier 1: saddle-stitch booklet imposition. Powers
// /tool/booklet-pdf. Built on PdfSimpleOpsTool (auto-wires the 7
// standardized hooks: track / errors / scroll / handoff suggestions
// / handoff consumer / file-url consumer / suffixed filename).

import { useState, useEffect } from "react";
import type { BookletPaperSize } from "@/lib/pdf/ops/booklet";
import { PdfSimpleOpsTool } from "./PdfSimpleOpsTool";
import { ToolHowItWorks } from "./ToolHowItWorks";

const PAPERS: Array<{ v: BookletPaperSize; label: string }> = [
  { v: "letter", label: "Letter" },
  { v: "a4", label: "A4" },
  { v: "legal", label: "Legal" },
  { v: "a3", label: "A3" },
];

export function PdfBookletTool() {
  // 2026-05-11 (item #17 batch 18) — URL permalink for booklet
  // paper + foldLine. Same default-omit pattern as previous batches.
  // foldLine is default-TRUE so URL only carries it when FALSE.
  const initialFromQs = (() => {
    if (typeof window === "undefined")
      return { paper: "letter" as BookletPaperSize, foldLine: true };
    const qs = new URLSearchParams(window.location.search);
    const p = qs.get("paper");
    const fl = qs.get("foldLine");
    return {
      paper:
        p === "letter" || p === "legal" || p === "a4" || p === "a3"
          ? (p as BookletPaperSize)
          : ("letter" as BookletPaperSize),
      foldLine: fl === "false" ? false : true,
    };
  })();
  const [paper, setPaper] = useState<BookletPaperSize>(initialFromQs.paper);
  const [foldLine, setFoldLine] = useState(initialFromQs.foldLine);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (paper === "letter") params.delete("paper");
    else params.set("paper", paper);
    if (foldLine === true) params.delete("foldLine");
    else params.set("foldLine", "false");
    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [paper, foldLine]);

  return (
    <PdfSimpleOpsTool
      toolId="booklet-pdf"
      toolGroup="Edit"
      dropPrompt="Drop a PDF to lay out as a booklet"
      busyLabel="Imposing booklet pages…"
      actionLabel={() => `Build ${paper.toUpperCase()} booklet`}
      successCta="Build another booklet"
      errorCode="booklet_failed"
      howItWorks={
        <ToolHowItWorks
          steps={[
            {
              title: "Pick paper + fold settings",
              body:
                "Choose the output paper size (Letter / A4 / Legal / A3). Toggle fold lines if you want printed crease guides for hand-folding.",
            },
            {
              title: "Drop a PDF",
              body:
                "Up to 100 MB. Page count is automatically padded to a multiple of 4 so the booklet folds cleanly.",
            },
            {
              title: "Build and download",
              body:
                "pdf-lib imposes the pages in printer-spread order: 2 source pages per output page, arranged so that printing double-sided and folding produces a proper booklet.",
            },
          ]}
          privacyNote="Booklet imposition runs entirely in your browser via pdf-lib — files never leave your machine."
        />
      }
      configPanel={
        <div
          className="card"
          style={{
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 500 }}>Output sheet size</div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {PAPERS.map((opt) => (
              <button
                key={opt.v}
                type="button"
                className={`btn btn-sm ${paper === opt.v ? "btn-primary" : "btn-outline"}`}
                onClick={() => setPaper(opt.v)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
            }}
          >
            <input
              type="checkbox"
              checked={foldLine}
              onChange={(e) => setFoldLine(e.target.checked)}
            />
            Show faint fold-line guide on each sheet
          </label>
          <div className="subtle" style={{ fontSize: 12 }}>
            Output is landscape sheets — print double-sided
            (flip-on-long-edge), stack in order, fold the stack in
            half, staple along the fold.
          </div>
        </div>
      }
      apply={async (bytes, file) => {
        const { bookletPdf } = await import("@/lib/pdf/ops/booklet");
        const r = await bookletPdf(bytes, {
          paper,
          foldLineGuide: foldLine,
        });
        const baseName = file.name.replace(/\.pdf$/i, "");
        const padNote =
          r.paddedPageCount > r.sourcePageCount
            ? ` · padded with ${r.paddedPageCount - r.sourcePageCount} blank page${
                r.paddedPageCount - r.sourcePageCount === 1 ? "" : "s"
              }`
            : "";
        return {
          outputBytes: r.bytes,
          outputFileName: `${baseName || "document"}-booklet.pdf`,
          headline: `${r.sourcePageCount} pages → ${r.sheetCount} sheets`,
          detail: `Print ${r.sheetCount} double-sided sheet${
            r.sheetCount === 1 ? "" : "s"
          }${padNote}`,
        };
      }}
    />
  );
}
