"use client";

// ResizePdfTool — Tier 1 §1.5 P1.
//
// Resize every page of a PDF to a standard paper format (A4, US
// Letter, US Legal, A3, A5, Tabloid). pdf-lib's `page.setSize(width,
// height)` changes the MediaBox and CropBox dimensions in one shot —
// the page's content stream is left intact, so vector paths, text
// runs, and embedded images all get scaled by the viewer at render
// time.
//
// Fit strategies offered:
//   - "scale" (default) — preserves the aspect ratio. We compute the
//     ratio of new-size-to-old-size for both dimensions and scale the
//     underlying content by the smaller of the two. The page's new
//     MediaBox matches the target exactly, so the viewer shows
//     letterbox bars if the target aspect differs from the source.
//   - "stretch" — crudely stretch content to fill the new page. Fine
//     for near-identical aspect ratios (A4 → Letter, 1.003 ratio
//     difference), ugly when forcing portrait → landscape.
//   - "crop" — keep content at 1:1 and clip to the new size. Useful
//     when the source is a larger page (Tabloid → Letter) and you
//     want to crop rather than shrink.
//
// Unit note: pdf-lib uses points (1 pt = 1/72 inch). A4 is 595 × 842,
// Letter is 612 × 792, Legal is 612 × 1008, A3 is 842 × 1191, A5 is
// 420 × 595, Tabloid is 792 × 1224.

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

type PaperSize = {
  id: string;
  label: string;
  widthPt: number;
  heightPt: number;
  description: string;
};

const SIZES: readonly PaperSize[] = [
  { id: "letter", label: "US Letter", widthPt: 612, heightPt: 792, description: "8.5 × 11 in" },
  { id: "legal", label: "US Legal", widthPt: 612, heightPt: 1008, description: "8.5 × 14 in" },
  { id: "tabloid", label: "US Tabloid", widthPt: 792, heightPt: 1224, description: "11 × 17 in" },
  { id: "a3", label: "A3", widthPt: 842, heightPt: 1191, description: "297 × 420 mm" },
  { id: "a4", label: "A4", widthPt: 595, heightPt: 842, description: "210 × 297 mm" },
  { id: "a5", label: "A5", widthPt: 420, heightPt: 595, description: "148 × 210 mm" },
] as const;

type FitMode = "scale" | "stretch" | "crop";

type Loaded = {
  file: File;
  pageCount: number;
  firstWidthPt: number;
  firstHeightPt: number;
};

export function ResizePdfTool() {
  useTrackToolView("resize-pdf", "Edit");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [targetId, setTargetId] = useState<string>("a4");
  const [fit, setFit] = useState<FitMode>("scale");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    bytes: Uint8Array;
    name: string;
    size: number;
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
      if (!first) throw new Error("PDF has no pages.");
      setLoaded({
        file: f,
        pageCount: pages.length,
        firstWidthPt: first.getWidth(),
        firstHeightPt: first.getHeight(),
      });
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
    setError(null);
    setResult(null);
  };

  const run = async () => {
    if (!loaded) return;
    const target = SIZES.find((s) => s.id === targetId);
    if (!target) return;

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const doc = await PDFDocument.load(await loaded.file.arrayBuffer(), {
        ignoreEncryption: true,
      });
      const { widthPt: newW, heightPt: newH } = target;

      for (const page of doc.getPages()) {
        const oldW = page.getWidth();
        const oldH = page.getHeight();

        if (fit === "scale") {
          // Preserve aspect ratio: scale content by the smaller ratio
          // so nothing gets clipped; empty margins appear on the longer
          // axis. pdf-lib exposes `page.scaleContent(x, y)` which wraps
          // the content stream in a `q…Q` save/restore with a CTM
          // concat — visually correct, vector-preserving.
          const ratio = Math.min(newW / oldW, newH / oldH);
          page.scaleContent(ratio, ratio);
          page.setSize(newW, newH);
        } else if (fit === "stretch") {
          // Non-uniform scale — fill the new box fully, aspect ratio
          // discarded. Acceptable for A4 ↔ Letter (~0.3% difference).
          page.scaleContent(newW / oldW, newH / oldH);
          page.setSize(newW, newH);
        } else {
          // "crop" — leave content at its native scale, just trim the
          // MediaBox. Content outside the new box is clipped by the
          // viewer.
          page.setSize(newW, newH);
        }
      }

      const bytes = await doc.save({ useObjectStreams: true });
      const name = deriveOutputName(loaded.file.name, `-${target.id}`);
      setResult({ bytes, name, size: bytes.length });

      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "resize-pdf",
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
      setError(err instanceof Error ? err.message : "Resize failed.");
    } finally {
      setBusy(false);
    }
  };

  const target = SIZES.find((s) => s.id === targetId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!loaded ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF to resize"
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
                {Math.round(loaded.firstWidthPt)} × {Math.round(loaded.firstHeightPt)} pt
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
            <div>
              <label
                htmlFor="resize-target"
                style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-subtle)", display: "block", marginBottom: 6 }}
              >
                TARGET SIZE
              </label>
              <select
                id="resize-target"
                value={targetId}
                disabled={busy}
                onChange={(e) => setTargetId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border-strong)",
                  background: "var(--bg-1)",
                  color: "var(--fg)",
                  fontSize: 14,
                }}
              >
                {SIZES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} · {s.description} · {s.widthPt} × {s.heightPt} pt
                  </option>
                ))}
              </select>
            </div>

            <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
              <legend
                style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-subtle)", marginBottom: 6 }}
              >
                FIT MODE
              </legend>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 8,
                }}
              >
                <FitOption id="scale" value={fit} setValue={setFit} title="Scale" desc="Preserve aspect" disabled={busy} />
                <FitOption id="stretch" value={fit} setValue={setFit} title="Stretch" desc="Fill target" disabled={busy} />
                <FitOption id="crop" value={fit} setValue={setFit} title="Crop" desc="Keep 1:1, clip" disabled={busy} />
              </div>
            </fieldset>

            {target && (
              <div className="subtle" style={{ fontSize: 12 }}>
                Target: <strong style={{ color: "var(--fg)" }}>{target.label}</strong> ·{" "}
                {target.widthPt} × {target.heightPt} pt ({target.description})
              </div>
            )}
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
                Resize complete
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
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
          {busy ? "Resizing…" : "Resize PDF"}
        </button>
      </div>
    </div>
  );
}

function FitOption({
  id,
  value,
  setValue,
  title,
  desc,
  disabled,
}: {
  id: FitMode;
  value: FitMode;
  setValue: (v: FitMode) => void;
  title: string;
  desc: string;
  disabled: boolean;
}) {
  const selected = value === id;
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: 10,
        borderRadius: "var(--radius)",
        border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        background: selected ? "var(--accent-soft)" : "var(--bg-1)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="radio"
          name="fit-mode"
          value={id}
          checked={selected}
          disabled={disabled}
          onChange={() => setValue(id)}
        />
        <strong style={{ fontSize: 13 }}>{title}</strong>
      </span>
      <span className="subtle" style={{ fontSize: 11, marginLeft: 22 }}>
        {desc}
      </span>
    </label>
  );
}
