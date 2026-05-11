"use client";

// components/tools/PdfResizeTool.tsx
// Tier 5 (2026-04-28): resize every page to a target paper size,
// scaling content to fit while preserving aspect ratio.
//
// 2026-04-30 (audit cluster C): migrated to PdfSimpleOpsTool with
// the new `configPanel` slot. Was 187 LOC of bespoke
// drop+config+busy+error+result+download boilerplate; collapsed to
// ~95 LOC of slot-fills + a paper-size selector. Picks up
// inspect/handoff-suggestions/error-mapping/scroll-error-into-view
// for free.

import { useState, useEffect } from "react";
import type { PaperSize } from "@/lib/pdf/ops/resize";
import { PdfSimpleOpsTool } from "./PdfSimpleOpsTool";
import { ToolHowItWorks } from "./ToolHowItWorks";

const SIZES: Array<{ v: PaperSize; label: string; pt: string }> = [
  { v: "letter", label: "Letter", pt: "612 × 792" },
  { v: "legal", label: "Legal", pt: "612 × 1008" },
  { v: "a4", label: "A4", pt: "595 × 842" },
  { v: "a3", label: "A3", pt: "842 × 1191" },
  { v: "a5", label: "A5", pt: "420 × 595" },
];

export function PdfResizeTool() {
  const [size, setSize] = useState<PaperSize>("letter");
  const [landscape, setLandscape] = useState(false);

  // 2026-05-11 (item #17 sweep batch 8) — URL permalink state sync.
  // Same mixed-type 2-param shape as ImagesToPdfTool (5-literal
  // PaperSize enum + boolean landscape) — fewer enum members (no
  // "fit" option here since resize is always to a concrete paper).
  // Single useEffect with [size, landscape] dep per the replaceState
  // non-batching invariant.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const rawSize = params.get("size");
    if (
      rawSize === "letter" || rawSize === "legal" ||
      rawSize === "a4" || rawSize === "a3" || rawSize === "a5"
    ) {
      setSize(rawSize);
    }
    const rawLand = params.get("landscape");
    if (rawLand === "1" || rawLand === "true") {
      setLandscape(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (size === "letter") params.delete("size");
    else params.set("size", size);
    if (!landscape) params.delete("landscape");
    else params.set("landscape", "1");
    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [size, landscape]);

  const sizeLabel = SIZES.find((s) => s.v === size)?.label ?? size;

  return (
    <PdfSimpleOpsTool
      toolId="resize-pdf"
      toolGroup="Edit"
      dropPrompt="Drop a PDF to resize"
      busyLabel="Resizing pages…"
      howItWorks={
        <ToolHowItWorks
          steps={[
            {
              title: "Drop in your PDF",
              body: "Up to 100 MB. The resize runs entirely in your browser with pdf-lib — nothing leaves your machine.",
            },
            {
              title: "Pick a target paper size",
              body: "Letter / A4 / Legal / Tabloid / A3, portrait or landscape. Content is scaled to fit; aspect ratio is preserved so existing layouts don't distort.",
            },
            {
              title: "Save the resized PDF",
              body: "All annotations, links, and form fields scale with the page. Useful for normalizing a mixed-format batch before printing or archiving.",
            },
          ]}
          privacyNote="Your PDF never leaves your machine. The resize is client-side with pdf-lib — nothing is uploaded or persisted."
        />
      }
      // Function form so the label stays in sync with the size /
      // landscape selectors.
      actionLabel={() =>
        `Resize to ${sizeLabel}${landscape ? " (landscape)" : ""}`
      }
      successCta="Resize another PDF"
      errorCode="resize_failed"
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
          <div style={{ fontSize: 13, fontWeight: 500 }}>Target size</div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {SIZES.map((opt) => (
              <button
                key={opt.v}
                type="button"
                className={`btn btn-sm ${size === opt.v ? "btn-primary" : "btn-outline"}`}
                onClick={() => setSize(opt.v)}
                title={`${opt.pt} pt`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <label
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
          >
            <input
              type="checkbox"
              checked={landscape}
              onChange={(e) => setLandscape(e.target.checked)}
            />
            Landscape orientation
          </label>
          <div className="subtle" style={{ fontSize: 12 }}>
            Content scales to fit while preserving aspect ratio. Margins fill
            the rest.
          </div>
        </div>
      }
      apply={async (bytes, file) => {
        const { resizePdf } = await import("@/lib/pdf/ops/resize");
        const r = await resizePdf(bytes, { size, landscape });
        const baseName = file.name.replace(/\.pdf$/i, "");
        return {
          outputBytes: r.bytes,
          outputFileName: `${baseName || "document"}-${size}.pdf`,
          headline: `Resized ${r.pageCount} page${r.pageCount === 1 ? "" : "s"} to ${sizeLabel}`,
          detail: `${Math.round(r.width)}×${Math.round(r.height)} pt`,
        };
      }}
    />
  );
}
