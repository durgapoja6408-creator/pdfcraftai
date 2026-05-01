"use client";

// components/tools/PdfBatesNumbersTool.tsx
//
// 2026-05-01 Tier 2: Bates numbering for legal discovery / litigation.
// Built on PdfSimpleOpsTool — auto-wires all 7 standardized hooks.

import { useState } from "react";
import type { BatesPosition } from "@/lib/pdf/ops/bates-numbers";
import { PdfSimpleOpsTool } from "./PdfSimpleOpsTool";

const POSITIONS: Array<{ v: BatesPosition; label: string }> = [
  { v: "bottom-right", label: "Bottom right" },
  { v: "bottom-center", label: "Bottom center" },
  { v: "bottom-left", label: "Bottom left" },
  { v: "top-right", label: "Top right" },
  { v: "top-center", label: "Top center" },
  { v: "top-left", label: "Top left" },
];

export function PdfBatesNumbersTool() {
  const [prefix, setPrefix] = useState("LAW");
  const [digits, setDigits] = useState(6);
  const [startNumber, setStartNumber] = useState(1);
  const [position, setPosition] = useState<BatesPosition>("bottom-right");
  const [fontSize, setFontSize] = useState(9);

  const previewLabel =
    prefix + String(startNumber).padStart(digits, "0");

  return (
    <PdfSimpleOpsTool
      toolId="bates-numbers"
      toolGroup="Edit"
      dropPrompt="Drop a PDF to apply Bates numbering"
      busyLabel="Stamping Bates labels…"
      actionLabel={() => `Stamp Bates labels (${previewLabel}…)`}
      successCta="Stamp another PDF"
      errorCode="bates_failed"
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
          <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              Prefix
              <input
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.slice(0, 16))}
                placeholder="LAW"
                style={{
                  padding: "4px 8px",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  background: "var(--bg-1)",
                  color: "var(--fg)",
                  fontSize: 13,
                  width: 100,
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              Digit count
              <select
                value={digits}
                onChange={(e) => setDigits(Number(e.target.value))}
                style={{
                  padding: "4px 8px",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  background: "var(--bg-1)",
                  color: "var(--fg)",
                  fontSize: 13,
                }}
              >
                {[3, 4, 5, 6, 7, 8].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              Start number
              <input
                type="number"
                min={0}
                value={startNumber}
                onChange={(e) => setStartNumber(Math.max(0, Number(e.target.value) || 0))}
                style={{
                  padding: "4px 8px",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  background: "var(--bg-1)",
                  color: "var(--fg)",
                  fontSize: 13,
                  width: 110,
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              Font size
              <select
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                style={{
                  padding: "4px 8px",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  background: "var(--bg-1)",
                  color: "var(--fg)",
                  fontSize: 13,
                }}
              >
                {[8, 9, 10, 11, 12, 14].map((s) => (
                  <option key={s} value={s}>
                    {s}pt
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Position</div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {POSITIONS.map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  className={`btn btn-sm ${position === opt.v ? "btn-primary" : "btn-outline"}`}
                  onClick={() => setPosition(opt.v)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="subtle" style={{ fontSize: 12 }}>
            Preview: <strong>{previewLabel}</strong> on page 1, then sequential.
            Use a wide enough digit count to cover all pages
            (digit pad is enforced — overflow throws an error before stamping).
          </div>
        </div>
      }
      apply={async (bytes, file) => {
        const { batesNumbersPdf } = await import("@/lib/pdf/ops/bates-numbers");
        const r = await batesNumbersPdf(bytes, {
          prefix,
          digits,
          startNumber,
          position,
          fontSize,
        });
        const baseName = file.name.replace(/\.pdf$/i, "");
        return {
          outputBytes: r.bytes,
          outputFileName: `${baseName || "document"}-bates.pdf`,
          headline: `Stamped ${r.pageCount} page${r.pageCount === 1 ? "" : "s"} (${previewLabel} → ${r.lastLabel})`,
          detail: `Last label stamped: ${r.lastLabel}. Continue your next batch from #${startNumber + r.pageCount}.`,
        };
      }}
    />
  );
}
