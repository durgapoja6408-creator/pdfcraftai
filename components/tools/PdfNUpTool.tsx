"use client";

// components/tools/PdfNUpTool.tsx
// Tier 5 (2026-04-28): N-up — pack 2 or 4 source pages onto each
// output sheet via pdf-lib embedPdf + drawPage.
//
// 2026-04-30 (audit cluster C): migrated to PdfSimpleOpsTool with
// the new `configPanel` slot. Was 169 LOC of bespoke
// drop+config+busy+error+result+download boilerplate; collapsed to
// ~85 LOC of slot-fills + a small layout selector. Picks up
// inspect/handoff-suggestions/error-mapping/scroll-error-into-view
// for free. Same deal as PdfResizeTool — both unlocked by the
// configPanel slot in PdfSimpleOpsTool.

import { useState, useEffect } from "react";
import type { NUpLayout } from "@/lib/pdf/ops/n-up";
import { PdfSimpleOpsTool } from "./PdfSimpleOpsTool";
import { ToolHowItWorks } from "./ToolHowItWorks";

export function PdfNUpTool() {
  // 2026-05-11 (item #17 batch 18) — URL permalink for layout.
  // Default `"2"` omitted.
  const initialLayout = (() => {
    if (typeof window === "undefined") return "2" as NUpLayout;
    const qs = new URLSearchParams(window.location.search);
    const l = qs.get("layout");
    return l === "2" || l === "4" ? (l as NUpLayout) : ("2" as NUpLayout);
  })();
  const [layout, setLayout] = useState<NUpLayout>(initialLayout);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (layout === "2") params.delete("layout");
    else params.set("layout", layout);
    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [layout]);

  return (
    <PdfSimpleOpsTool
      toolId="n-up-pdf"
      toolGroup="Edit"
      dropPrompt="Drop a PDF to lay out N-up"
      busyLabel={`Building ${layout}-up layout…`}
      // Function form — re-evaluates on every render so the label
      // tracks the layout selector live.
      actionLabel={() => `Build ${layout}-up PDF`}
      successCta="N-up another PDF"
      errorCode="n_up_failed"
      howItWorks={
        <ToolHowItWorks
          steps={[
            {
              title: "Pick a layout",
              body:
                "2-up (book pages, 1 sheet for 2), 4-up (handouts, 1 sheet for 4), 6-up or 9-up (contact sheets / overviews). Each layout halves or quarters your sheet count.",
            },
            {
              title: "Drop a PDF",
              body:
                "Up to 100 MB. The tool aspect-fits each source page into a tile on the output sheet — content scales down, no cropping.",
            },
            {
              title: "Build and download",
              body:
                "pdf-lib composes new pages with the source pages embedded as tiles. Common uses: print 4 slides per page from a deck, fit a long doc onto fewer sheets, or batch-print to save paper.",
            },
          ]}
          privacyNote="N-up imposition runs entirely in your browser via pdf-lib — files never leave your machine."
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
          <div style={{ fontSize: 13, fontWeight: 500 }}>Pages per sheet</div>
          <div className="row" style={{ gap: 6 }}>
            <button
              type="button"
              className={`btn btn-sm ${layout === "2" ? "btn-primary" : "btn-outline"}`}
              onClick={() => setLayout("2")}
            >
              2-up (vertical stack)
            </button>
            <button
              type="button"
              className={`btn btn-sm ${layout === "4" ? "btn-primary" : "btn-outline"}`}
              onClick={() => setLayout("4")}
            >
              4-up (2×2 grid)
            </button>
          </div>
          <div className="subtle" style={{ fontSize: 12 }}>
            Output sheet size matches your source.{" "}
            {layout === "2"
              ? "2 source pages per output sheet."
              : "4 source pages per output sheet."}
          </div>
        </div>
      }
      apply={async (bytes, file) => {
        const { nUpPdf } = await import("@/lib/pdf/ops/n-up");
        const r = await nUpPdf(bytes, { layout });
        const baseName = file.name.replace(/\.pdf$/i, "");
        return {
          outputBytes: r.bytes,
          outputFileName: `${baseName || "document"}-${layout}up.pdf`,
          headline: `${r.sourcePageCount} pages → ${r.pageCount} sheets (${layout}-up)`,
          detail: `${r.pageCount} output page${r.pageCount === 1 ? "" : "s"}`,
        };
      }}
    />
  );
}
