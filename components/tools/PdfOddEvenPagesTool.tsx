"use client";

// components/tools/PdfOddEvenPagesTool.tsx
//
// 2026-05-01 Tier 2: extract just the odd or even pages.

import { useState } from "react";
import type { Parity } from "@/lib/pdf/ops/odd-even-pages";
import { PdfSimpleOpsTool } from "./PdfSimpleOpsTool";

export function PdfOddEvenPagesTool() {
  const [parity, setParity] = useState<Parity>("odd");

  return (
    <PdfSimpleOpsTool
      toolId="odd-even-pages"
      toolGroup="Organize"
      dropPrompt="Drop a PDF to extract odd or even pages"
      busyLabel="Extracting pages…"
      actionLabel={() => `Extract ${parity}-numbered pages`}
      successCta="Extract from another PDF"
      errorCode="odd_even_failed"
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
