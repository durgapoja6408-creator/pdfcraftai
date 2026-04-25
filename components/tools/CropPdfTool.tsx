"use client";

// CropPdfTool — Tier 1 §1.5 P1.
//
// Set a new crop box on every page of a PDF. The user specifies
// margins (top / right / bottom / left, in PDF points = 1/72 inch)
// and we shrink each page's visible area by those amounts while
// leaving the underlying content streams intact.
//
// Why pdf-lib setCropBox and not resize: resizing would have to
// re-draw / scale every content operator, which is lossy. Cropping
// just changes what the viewer shows — same bytes underneath, new
// viewport. That's what "crop" means in every mainstream PDF tool.
//
// Unit note: 1 point = 1/72 inch. A4 is 595 × 842 pt. US Letter is
// 612 × 792 pt. The trim-size preview on the loaded card shows the
// first page's media-box size so users know their starting point.

import { useState, useCallback } from "react";
import { PDFDocument } from "pdf-lib";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import {
  deriveOutputName,
  downloadBytes,
  humanSize,
  sha256HexOfBytes,
} from "@/lib/client/pdf-utils";
import { logToolResultAction } from "@/lib/tool-result-actions";
import { useTrackToolView } from "./useToolTracking";

type Loaded = {
  file: File;
  pageCount: number;
  firstPageWidth: number;
  firstPageHeight: number;
};

type Margins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

const ZERO_MARGINS: Margins = { top: 0, right: 0, bottom: 0, left: 0 };

export function CropPdfTool() {
  useTrackToolView("crop-pdf", "Edit");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [margins, setMargins] = useState<Margins>(ZERO_MARGINS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    bytes: Uint8Array;
    name: string;
    size: number;
    newWidth: number;
    newHeight: number;
  } | null>(null);

  const onFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const doc = await PDFDocument.load(await f.arrayBuffer(), {
        ignoreEncryption: true,
      });
      const pages = doc.getPages();
      const first = pages[0];
      if (!first) {
        throw new Error("PDF has no pages.");
      }
      setLoaded({
        file: f,
        pageCount: pages.length,
        firstPageWidth: first.getWidth(),
        firstPageHeight: first.getHeight(),
      });
      setMargins(ZERO_MARGINS);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error && /encrypted|password/i.test(err.message)
          ? "This PDF is password-protected. Unlock it first."
          : "Couldn't read that PDF. It may be corrupt."
      );
      setLoaded(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const reset = () => {
    setLoaded(null);
    setMargins(ZERO_MARGINS);
    setError(null);
    setResult(null);
  };

  const run = async () => {
    if (!loaded) return;
    const { top, right, bottom, left } = margins;
    if (top === 0 && right === 0 && bottom === 0 && left === 0) {
      setError("Enter at least one margin to crop (in points).");
      return;
    }
    if (top < 0 || right < 0 || bottom < 0 || left < 0) {
      setError("Margins can't be negative.");
      return;
    }
    const previewW = loaded.firstPageWidth - left - right;
    const previewH = loaded.firstPageHeight - top - bottom;
    if (previewW <= 0 || previewH <= 0) {
      setError(
        `Margins leave nothing visible (${Math.round(previewW)} × ${Math.round(previewH)} pt). Lower them.`
      );
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const doc = await PDFDocument.load(await loaded.file.arrayBuffer(), {
        ignoreEncryption: true,
      });
      // setCropBox(x, y, width, height) — x/y measured from page
      // origin (bottom-left in PDF coords). Our "top margin" means
      // the user wants to trim from the top edge, which in PDF
      // coords is at y = height - top_margin. The crop box's origin
      // is therefore (left, bottom) and its extent is
      // (width - left - right, height - top - bottom).
      for (const page of doc.getPages()) {
        const w = page.getWidth();
        const h = page.getHeight();
        const newW = w - left - right;
        const newH = h - top - bottom;
        if (newW <= 0 || newH <= 0) {
          // Per-page guard — some pages might be smaller than the
          // first (unusual but possible). Leave such pages uncropped
          // rather than set a zero/negative cropBox that would show
          // as blank in most viewers.
          continue;
        }
        page.setCropBox(left, bottom, newW, newH);
      }

      const bytes = await doc.save({ useObjectStreams: true });
      const name = deriveOutputName(loaded.file.name, "-cropped");
      setResult({
        bytes,
        name,
        size: bytes.length,
        newWidth: Math.round(previewW),
        newHeight: Math.round(previewH),
      });

      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "crop-pdf",
          name,
          mime: "application/pdf",
          sizeBytes: bytes.length,
          sha256,
        });
      } catch (logErr) {
        console.warn("logToolResult failed (non-fatal):", logErr);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Crop failed.");
    } finally {
      setBusy(false);
    }
  };

  const setSide = (side: keyof Margins, value: string) => {
    const n = Number(value);
    if (Number.isNaN(n)) return;
    setMargins((m) => ({ ...m, [side]: Math.max(0, Math.round(n)) }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!loaded ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF to crop"
        />
      ) : (
        <>
          <div
            className="card"
            style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center" }}
          >
            <span style={{ color: "var(--fg-subtle)" }}>
              <I.File size={18} />
            </span>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div
                title={loaded.file.name}
                style={{
                  fontSize: 14,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {loaded.file.name}
              </div>
              <div className="subtle" style={{ fontSize: 12 }}>
                {humanSize(loaded.file.size)} · {loaded.pageCount} page
                {loaded.pageCount === 1 ? "" : "s"} ·{" "}
                {Math.round(loaded.firstPageWidth)} ×{" "}
                {Math.round(loaded.firstPageHeight)} pt (first page)
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={busy}
              onClick={reset}
              aria-label="Remove file"
            >
              <I.X size={14} />
            </button>
          </div>

          <div
            className="card"
            style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 14,
              }}
            >
              <MarginField
                label="Top"
                value={margins.top}
                onChange={(v) => setSide("top", v)}
                disabled={busy}
              />
              <MarginField
                label="Right"
                value={margins.right}
                onChange={(v) => setSide("right", v)}
                disabled={busy}
              />
              <MarginField
                label="Bottom"
                value={margins.bottom}
                onChange={(v) => setSide("bottom", v)}
                disabled={busy}
              />
              <MarginField
                label="Left"
                value={margins.left}
                onChange={(v) => setSide("left", v)}
                disabled={busy}
              />
            </div>
            <div className="subtle" style={{ fontSize: 12 }}>
              Margins in PDF points (1 pt = 1/72 inch). A 72 pt margin
              crops 1 inch from that side. Preview first-page result:{" "}
              <strong style={{ color: "var(--fg)" }}>
                {Math.max(0, Math.round(loaded.firstPageWidth - margins.left - margins.right))}
                {" × "}
                {Math.max(0, Math.round(loaded.firstPageHeight - margins.top - margins.bottom))}
                {" pt"}
              </strong>
            </div>
          </div>
        </>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}

      {result && (
        <div
          className="card"
          style={{
            padding: 20,
            borderColor: "var(--accent)",
            background: "var(--accent-soft)",
          }}
        >
          <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "var(--accent)",
                color: "var(--bg-1)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <I.Check size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 2 }}>
                Crop complete
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                New size: {result.newWidth} × {result.newHeight} pt ·{" "}
                {humanSize(result.size)}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => downloadBytes(result.bytes, result.name)}
            >
              <I.Download size={14} />
              <span>Download</span>
            </button>
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {loaded && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={reset}
          >
            Reset
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!loaded || busy}
          onClick={run}
        >
          {busy ? "Cropping…" : "Crop PDF"}
        </button>
      </div>
    </div>
  );
}

function MarginField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-subtle)" }}>
        {label.toUpperCase()}
      </span>
      <div className="row" style={{ gap: 6, alignItems: "center" }}>
        <input
          type="number"
          min={0}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1,
            padding: "8px 10px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border-strong)",
            background: "var(--bg-1)",
            color: "var(--fg)",
            fontSize: 14,
            fontFamily: "var(--font-mono), ui-monospace, monospace",
          }}
        />
        <span className="subtle" style={{ fontSize: 12 }}>pt</span>
      </div>
    </label>
  );
}
