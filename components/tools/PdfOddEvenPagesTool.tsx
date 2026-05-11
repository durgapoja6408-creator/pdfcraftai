"use client";

// components/tools/PdfOddEvenPagesTool.tsx
//
// 2026-05-01 Tier 2: extract just the odd or even pages.

import { useState, useEffect } from "react";
import type { Parity } from "@/lib/pdf/ops/odd-even-pages";
import { PdfSimpleOpsTool } from "./PdfSimpleOpsTool";
import { ToolHowItWorks } from "./ToolHowItWorks";

export function PdfOddEvenPagesTool() {
  // 2026-05-11 (item #17 batch 18) — URL permalink for parity.
  // Default `"odd"` omitted.
  const initialParity = (() => {
    if (typeof window === "undefined") return "odd" as Parity;
    const qs = new URLSearchParams(window.location.search);
    const p = qs.get("parity");
    return p === "odd" || p === "even" ? (p as Parity) : ("odd" as Parity);
  })();
  const [parity, setParity] = useState<Parity>(initialParity);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (parity === "odd") params.delete("parity");
    else params.set("parity", parity);
    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [parity]);

  return (
    <PdfSimpleOpsTool
      toolId="odd-even-pages"
      toolGroup="Organize"
      dropPrompt="Drop a PDF to extract odd or even pages"
      busyLabel="Extracting pages…"
      actionLabel={() => `Extract ${parity}-numbered pages`}
      successCta="Extract from another PDF"
      errorCode="odd_even_failed"
      howItWorks={
        <ToolHowItWorks
          steps={[
            {
              title: "Pick odd or even",
              body:
                "Odd pages (1, 3, 5…) typically hold the recto / front. Even pages (2, 4, 6…) hold the verso / back. Useful when a duplex scanner produced two separate PDFs or when you need to split fronts and backs.",
            },
            {
              title: "Drop a PDF",
              body:
                "Up to 100 MB. The tool walks every page and keeps only those matching the chosen parity.",
            },
            {
              title: "Extract and download",
              body:
                "pdf-lib copies matching pages into a fresh PDF preserving order. Common follow-up: extract odd from File A + extract even from File B, then merge to interleave them.",
            },
          ]}
          privacyNote="Page extraction runs entirely in your browser via pdf-lib — files never leave your machine."
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
          <div style={{ fontSize: 13, fontWeight: 500 }}>Which pages to keep</div>
          <div className="row" style={{ gap: 6 }}>
            <button
              type="button"
              className={`btn btn-sm ${parity === "odd" ? "btn-primary" : "btn-outline"}`}
              onClick={() => setParity("odd")}
            >
              Odd (1, 3, 5, …)
            </button>
            <button
              type="button"
              className={`btn btn-sm ${parity === "even" ? "btn-primary" : "btn-outline"}`}
              onClick={() => setParity("even")}
            >
              Even (2, 4, 6, …)
            </button>
          </div>
          <div className="subtle" style={{ fontSize: 12 }}>
            Common use: re-scanning a duplex (two-sided) document where only
            one side captured. Run once for odd pages, again for even pages,
            then merge for the full document.
          </div>
        </div>
      }
      apply={async (bytes, file) => {
        const { oddEvenPagesPdf } = await import("@/lib/pdf/ops/odd-even-pages");
        const r = await oddEvenPagesPdf(bytes, { parity });
        const baseName = file.name.replace(/\.pdf$/i, "");
        return {
          outputBytes: r.bytes,
          outputFileName: `${baseName || "document"}-${parity}.pdf`,
          headline: `Kept ${r.pageCount} ${parity}-numbered page${
            r.pageCount === 1 ? "" : "s"
          } from ${r.sourcePageCount}`,
          detail: `Output is a ${r.pageCount}-page PDF.`,
        };
      }}
    />
  );
}
