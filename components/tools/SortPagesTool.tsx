"use client";

// SortPagesTool — Tier 1 §1.1 P1.
//
// Visual drag-to-reorder UI: renders each page as a thumbnail,
// lets the user drag them into the order they want, then rebuilds
// the PDF via pdf-lib `copyPages()` in the new sequence.
//
// Implementation notes:
//   - Thumbnails rendered via pdfjs at SCALE=0.25 (tight bounds,
//     fits ~300px wide at A4). Each thumb is cached as a PNG
//     data URL so re-ordering doesn't re-render.
//   - Drag-and-drop uses HTML5 DnD API with dataTransfer carrying
//     the source index. No external react-dnd dep.
//   - On drop: splice the source index out, insert at the target
//     index, re-render the grid.
//   - Apply: create a fresh PDFDocument, `copyPages(src,
//     orderedIndices)` → addPage for each, save.

import { useState, useCallback, useEffect } from "react";
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

const THUMB_SCALE = 0.25;

type Loaded = {
  file: File;
  buffer: ArrayBuffer;
  pageCount: number;
};

type Thumb = {
  originalIndex: number; // 0-based index in the source PDF
  dataUrl: string;
  w: number;
  h: number;
};

export function SortPagesTool() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [order, setOrder] = useState<number[]>([]); // ordered indices into thumbs
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [renderingThumbs, setRenderingThumbs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ bytes: Uint8Array; name: string; size: number } | null>(null);
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const onFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setResult(null);
    setThumbs([]);
    setOrder([]);
    setBusy(true);
    try {
      const buffer = await f.arrayBuffer();
      const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const pageCount = doc.getPageCount();
      if (pageCount === 0) throw new Error("PDF has no pages.");
      setLoaded({ file: f, buffer, pageCount });
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

  // Render thumbnails when the file loads.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    const render = async () => {
      setRenderingThumbs(true);
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs-worker.min.mjs";
        }
        const src = await pdfjs.getDocument({ data: loaded.buffer.slice(0) }).promise;
        const out: Thumb[] = [];
        for (let p = 1; p <= src.numPages; p++) {
          if (cancelled) return;
          const page = await src.getPage(p);
          const viewport = page.getViewport({ scale: THUMB_SCALE });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          out.push({
            originalIndex: p - 1,
            dataUrl: canvas.toDataURL("image/png"),
            w: viewport.width,
            h: viewport.height,
          });
          // Progressive render — update state incrementally so
          // users see thumbs appearing as they're built.
          setThumbs([...out]);
        }
        if (!cancelled) {
          setOrder(out.map((_, i) => i));
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError("Couldn't render thumbnails.");
        }
      } finally {
        if (!cancelled) setRenderingThumbs(false);
      }
    };
    render();
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  const reset = () => {
    setLoaded(null);
    setThumbs([]);
    setOrder([]);
    setResult(null);
    setError(null);
  };

  const restoreOriginal = () => {
    setOrder(thumbs.map((_, i) => i));
  };

  const reverse = () => {
    setOrder((prev) => [...prev].reverse());
  };

  // Drag handlers
  const onDragStart = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
    setDragFromIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };
  const onDragOver = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  };
  const onDragLeave = () => {
    setDragOverIdx(null);
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>, targetIdx: number) => {
    e.preventDefault();
    const fromIdx = dragFromIdx;
    setDragFromIdx(null);
    setDragOverIdx(null);
    if (fromIdx === null || fromIdx === targetIdx) return;
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
  };
  const onDragEnd = () => {
    setDragFromIdx(null);
    setDragOverIdx(null);
  };

  const apply = async () => {
    if (!loaded) return;
    if (order.length === 0) {
      setError("Thumbnails haven't finished rendering yet.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const src = await PDFDocument.load(loaded.buffer.slice(0), {
        ignoreEncryption: true,
      });
      const dst = await PDFDocument.create();
      const sourceIndices = order.map((oi) => thumbs[oi].originalIndex);
      const copied = await dst.copyPages(src, sourceIndices);
      for (const p of copied) dst.addPage(p);
      const bytes = await dst.save({ useObjectStreams: true });
      const name = deriveOutputName(loaded.file.name, "-reordered");
      setResult({ bytes, name, size: bytes.length });
      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "sort-pages",
          name,
          mime: "application/pdf",
          sizeBytes: bytes.length,
          sha256,
        });
      } catch (e) {
        console.warn(e);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Apply failed.");
    } finally {
      setBusy(false);
    }
  };

  const isReordered = order.some((oi, i) => thumbs[oi]?.originalIndex !== i);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!loaded ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF to drag-reorder its pages"
        />
      ) : (
        <div
          className="card"
          style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center" }}
        >
          <span style={{ color: "var(--fg-subtle)" }}>
            <I.File size={18} />
          </span>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div title={loaded.file.name} style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {loaded.file.name}
            </div>
            <div className="subtle" style={{ fontSize: 12 }}>
              {humanSize(loaded.file.size)} · {loaded.pageCount} page
              {loaded.pageCount === 1 ? "" : "s"} ·{" "}
              {renderingThumbs
                ? `rendering thumbnails (${thumbs.length}/${loaded.pageCount})…`
                : isReordered
                  ? "order changed"
                  : "original order"}
            </div>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={reset} aria-label="Remove file">
            <I.X size={14} />
          </button>
        </div>
      )}

      {loaded && thumbs.length > 0 && (
        <>
          <div className="card" style={{ padding: 10, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={reverse}>
              Reverse
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy || !isReordered} onClick={restoreOriginal}>
              Restore original
            </button>
          </div>

          <div
            className="card"
            style={{
              padding: 12,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 10,
              background: "var(--bg-2)",
            }}
          >
            {order.map((oi, i) => {
              const t = thumbs[oi];
              if (!t) return null;
              const isDragging = dragFromIdx === i;
              const isDragOver = dragOverIdx === i;
              return (
                <div
                  key={`${t.originalIndex}-${i}`}
                  draggable={!busy}
                  onDragStart={(e) => onDragStart(e, i)}
                  onDragOver={(e) => onDragOver(e, i)}
                  onDragLeave={onDragLeave}
                  onDrop={(e) => onDrop(e, i)}
                  onDragEnd={onDragEnd}
                  style={{
                    border: `2px solid ${isDragOver ? "var(--accent)" : isDragging ? "var(--border-strong)" : "var(--border)"}`,
                    background: "white",
                    borderRadius: "var(--radius)",
                    padding: 6,
                    cursor: busy ? "default" : "grab",
                    opacity: isDragging ? 0.4 : 1,
                    transition: "opacity 0.1s, border-color 0.1s",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.dataUrl}
                    alt={`Page ${t.originalIndex + 1}`}
                    style={{ width: "100%", height: "auto", display: "block", borderRadius: 2 }}
                    draggable={false}
                  />
                  <div style={{ marginTop: 4, fontSize: 11, textAlign: "center", color: "var(--fg-subtle)" }}>
                    Now #{i + 1}
                    {t.originalIndex !== i && (
                      <span style={{ color: "var(--accent)", marginLeft: 4 }}>
                        (was #{t.originalIndex + 1})
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{error}</p>
      )}

      {result && (
        <div className="card" style={{ padding: 20, borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
          <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--accent)", color: "var(--bg-1)", display: "grid", placeItems: "center" }}>
              <I.Check size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15 }}>Reorder complete</div>
              <div className="muted" style={{ fontSize: 13 }}>{humanSize(result.size)}</div>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => downloadBytes(result.bytes, result.name)}>
              <I.Download size={14} />
              <span>Download</span>
            </button>
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {loaded && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={reset}>
            Reset
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!loaded || busy || thumbs.length === 0}
          onClick={apply}
        >
          {busy ? "Applying…" : "Apply order"}
        </button>
      </div>
    </div>
  );
}
