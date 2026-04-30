"use client";

// components/tools/PdfGrayscaleTool.tsx
//
// 2026-05-01 Tier 1: convert PDF to grayscale. Uses PDFium-rasterize
// + BT.709 luminance + JPEG re-embed. Rasterized output (text not
// preserved) — the FAQ panel calls this trade-off out clearly.

import { useState } from "react";
import { PdfSimpleOpsTool } from "./PdfSimpleOpsTool";

export function PdfGrayscaleTool() {
  const [scale, setScale] = useState<1 | 2 | 3>(2);
  const [quality, setQuality] = useState<70 | 85 | 95>(90 as 70 | 85 | 95);

  return (
    <PdfSimpleOpsTool
      toolId="grayscale-pdf"
      toolGroup="Optimize"
      dropPrompt="Drop a PDF to convert to grayscale"
      busyLabel="Converting to grayscale…"
      actionLabel={() => `Convert to grayscale (${scale}× quality)`}
      successCta="Convert another PDF"
      errorCode="grayscale_failed"
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
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
              Render scale
            </div>
            <div className="row" style={{ gap: 6 }}>
              {([1, 2, 3] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`btn btn-sm ${scale === s ? "btn-primary" : "btn-outline"}`}
                  onClick={() => setScale(s)}
                >
                  {s}× ({72 * s} DPI)
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
              JPEG quality
            </div>
            <div className="row" style={{ gap: 6 }}>
              {([70, 85, 95] as const).map((q) => (
                <button
                  key={q}
                  type="button"
                  className={`btn btn-sm ${quality === q ? "btn-primary" : "btn-outline"}`}
                  onClick={() => setQuality(q)}
                >
                  {q === 70 ? "Low" : q === 85 ? "Standard" : "High"} ({q})
                </button>
              ))}
            </div>
          </div>
          <div className="subtle" style={{ fontSize: 12 }}>
            Output is rasterized — text becomes part of the image and
            is no longer searchable or selectable. For text-preserving
            grayscale, a server-side Ghostscript rail is the only
            reliable path; not available client-side.
          </div>
        </div>
      }
      apply={async (bytes, file) => {
        const { grayscalePdf } = await import("@/lib/pdf/ops/grayscale");
        const r = await grayscalePdf(bytes, {
          scale,
          quality: quality / 100,
        });
        const baseName = file.name.replace(/\.pdf$/i, "");
        return {
          outputBytes: r.bytes,
          outputFileName: `${baseName || "document"}-grayscale.pdf`,
          headline: `Converted ${r.pageCount} page${r.pageCount === 1 ? "" : "s"} to grayscale`,
          detail: `Rendered at ${scale}× (${72 * scale} DPI), JPEG quality ${quality}`,
        };
      }}
    />
  );
}
