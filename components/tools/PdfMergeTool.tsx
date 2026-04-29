"use client";

// components/tools/PdfMergeTool.tsx
//
// Build 2 Wave 9 (2026-04-27): merge multiple PDFs into one.
// First pdf-lib-backed writable tool. Pattern matches PdfLinksTool /
// PdfFontsTool — useTrackToolView funnel, aria-live result card,
// "Merge another set" repeat-use CTA.
//
// Differs from single-file tools in three ways:
//   1. ToolDropzone is `multiple` so users can drop several PDFs at once.
//   2. The file list supports drag-to-reorder + remove (HTML5 DnD).
//   3. The minimum-viable input is 2 files; one file shows a friendlier
//      "drop another to merge with" hint.

import { useState, useCallback, useEffect } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import { mapPdfOpError } from "@/lib/pdf/error-messages";

interface PendingFile {
  /** Stable key for React + DnD reordering. */
  key: string;
  file: File;
  /**
   * Object URL for a small first-page thumbnail rendered via PDFium.
   * Null while rendering or if rendering failed (we fall back to the
   * generic file icon in both cases — the merge itself is unaffected).
   */
  thumbnailUrl: string | null;
}

interface MergeResultState {
  outputBytes: Uint8Array;
  outputFileName: string;
  totalPageCount: number;
  sourceCount: number;
  totalSize: number;
}

export function PdfMergeTool() {
  const tracker = useTrackToolView("merge", "Organize");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MergeResultState | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Revoke any thumbnail object URLs on unmount so we don't leak blob
  // memory across navigation. Per-file revocation also happens in
  // removeAt + reset for the still-mounted case.
  useEffect(() => {
    return () => {
      files.forEach((f) => {
        if (f.thumbnailUrl) URL.revokeObjectURL(f.thumbnailUrl);
      });
    };
  }, [files]);

  // Render a small first-page thumbnail for one input file via PDFium.
  // We only need page 1 — the file list shows it as identification, not
  // as content preview. Failures degrade gracefully: thumbnailUrl stays
  // null, the runner falls back to the generic file icon, and the merge
  // itself is unaffected.
  const renderThumbnailFor = useCallback(async (key: string, file: File) => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { rasterizePdf } = await import("@/lib/pdf/ops/rasterize");
      const rendered = await rasterizePdf(bytes, {
        format: "jpeg",
        scale: 0.35,
        quality: 0.6,
      });
      const firstPage = rendered[0];
      if (!firstPage) return;
      const blob = new Blob([firstPage.bytes], { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      setFiles((prev) =>
        prev.map((f) =>
          f.key === key ? { ...f, thumbnailUrl: url } : f,
        ),
      );
    } catch (err) {
      // Thumbnail render failure is non-fatal — log and keep the file.
      console.warn("merge thumbnail render failed", err);
    }
  }, []);

  const onFiles = useCallback(
    (incoming: File[]) => {
      setError(null);
      setResult(null);
      const valid: PendingFile[] = [];
      for (const f of incoming) {
        if (!f.type.includes("pdf") && !f.name.toLowerCase().endsWith(".pdf")) {
          setError("Only PDF files are supported.");
          continue;
        }
        if (f.size > 100 * 1024 * 1024) {
          setError(`"${f.name}" is over 100 MB — skipped.`);
          continue;
        }
        valid.push({
          key: `${f.name}-${f.size}-${f.lastModified}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          file: f,
          thumbnailUrl: null,
        });
      }
      if (valid.length === 0) return;
      setFiles((prev) => [...prev, ...valid]);
      // Kick off thumbnail rendering for each new file in the
      // background. They appear in the UI immediately (with a
      // placeholder); the thumbnails fill in as PDFium finishes each.
      for (const v of valid) {
        renderThumbnailFor(v.key, v.file);
      }
      // Track the first file as the upload event for funnel parity
      // with the single-file tools.
      const firstNew = valid[0];
      if (firstNew) tracker.upload(firstNew.file);
    },
    [tracker, renderThumbnailFor],
  );

  const removeAt = (idx: number) => {
    setFiles((prev) => {
      const removed = prev[idx];
      if (removed?.thumbnailUrl) URL.revokeObjectURL(removed.thumbnailUrl);
      return prev.filter((_, i) => i !== idx);
    });
    setError(null);
    setResult(null);
  };

  const moveTo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setFiles((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const reset = () => {
    files.forEach((f) => {
      if (f.thumbnailUrl) URL.revokeObjectURL(f.thumbnailUrl);
    });
    setFiles([]);
    setError(null);
    setResult(null);
    setBusy(false);
  };

  const run = async () => {
    if (files.length < 2) {
      setError("Add at least two PDFs to merge.");
      return;
    }
    setError(null);
    setBusy(true);
    const t0 = performance.now();
    try {
      const inputs = await Promise.all(
        files.map(async (f) => ({
          name: f.file.name,
          bytes: new Uint8Array(await f.file.arrayBuffer()),
        })),
      );
      const { mergePdfs } = await import("@/lib/pdf/ops/merge");
      const r = await mergePdfs(inputs);
      const totalSize = files.reduce((acc, f) => acc + f.file.size, 0);
      const baseName = (files[0]?.file.name ?? "merged").replace(/\.pdf$/i, "");
      const outputFileName = `${baseName || "merged"}-merged.pdf`;
      setResult({
        outputBytes: r.bytes,
        outputFileName,
        totalPageCount: r.pageCount,
        sourceCount: files.length,
        totalSize,
      });
      tracker.success({
        creditCost: 0,
        pageCount: r.pageCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("merge failed", err);
      const msg = err instanceof Error ? err.message : "Could not merge PDFs.";
      setError(mapPdfOpError(msg));
      tracker.error({ errorCode: "merge_failed" });
    } finally {
      setBusy(false);
    }
  };

  const downloadResult = () => {
    if (!result) return;
    const blob = new Blob([result.outputBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = result.outputFileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const truncate = (s: string, max = 36) =>
    s.length <= max ? s : `${s.slice(0, max - 1)}…`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <ToolDropzone
        onFiles={onFiles}
        multiple
        prompt={
          files.length === 0
            ? "Drop two or more PDFs to merge"
            : "Add another PDF"
        }
        hint="Up to 100 MB each · runs privately in your browser"
      />

      {files.length > 0 && (
        <div
          className="card"
          style={{ padding: 0, overflow: "hidden" }}
          aria-label="Files to merge"
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 13,
            }}
          >
            <span style={{ fontWeight: 500 }}>
              {files.length} file{files.length === 1 ? "" : "s"} queued
            </span>
            <span className="subtle" style={{ fontSize: 12 }}>
              Drag to reorder
            </span>
          </div>
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {files.map((f, idx) => (
              <li
                key={f.key}
                draggable={!busy}
                onDragStart={() => setDragIndex(idx)}
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) moveTo(dragIndex, idx);
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
                style={{
                  display: "grid",
                  // position-number · thumbnail · name+size · up/down · remove
                  gridTemplateColumns: "auto auto 1fr auto auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 16px",
                  borderTop: idx === 0 ? "none" : "1px solid var(--border)",
                  cursor: busy ? "default" : "grab",
                  background:
                    dragIndex === idx ? "var(--bg-2)" : "transparent",
                }}
              >
                <span
                  className="subtle"
                  style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}
                >
                  {idx + 1}.
                </span>
                {/*
                 * Thumbnail of the input's first page. Rendered async
                 * after the file is added (renderThumbnailFor); shows a
                 * placeholder until it lands. Aspect ratio is 3:4
                 * (portrait) — close to A4/Letter, looks right for the
                 * vast majority of PDFs without locking us to an exact
                 * source-page ratio.
                 */}
                <div
                  aria-hidden="true"
                  style={{
                    width: 36,
                    height: 48,
                    borderRadius: 4,
                    overflow: "hidden",
                    background: "var(--bg-2)",
                    border: "1px solid var(--border)",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  {f.thumbnailUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={f.thumbnailUrl}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <span
                      className="pulse-soft"
                      style={{ color: "var(--fg-subtle)" }}
                    >
                      <I.File size={14} />
                    </span>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={f.file.name}
                  >
                    {truncate(f.file.name)}
                  </div>
                  <div className="subtle" style={{ fontSize: 11 }}>
                    {humanSize(f.file.size)}
                  </div>
                </div>
                <div className="row" style={{ gap: 4 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => moveTo(idx, idx - 1)}
                    disabled={busy || idx === 0}
                    aria-label={`Move ${f.file.name} up`}
                  >
                    <I.ArrowLeft size={14} style={{ transform: "rotate(90deg)" }} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => moveTo(idx, idx + 1)}
                    disabled={busy || idx === files.length - 1}
                    aria-label={`Move ${f.file.name} down`}
                  >
                    <I.ArrowRight
                      size={14}
                      style={{ transform: "rotate(90deg)" }}
                    />
                  </button>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => removeAt(idx)}
                  disabled={busy}
                  aria-label={`Remove ${f.file.name}`}
                >
                  <I.X size={14} />
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {error && (
        <p
          role="alert"
          style={{ color: "var(--red)", fontSize: 13, margin: 0 }}
        >
          {error}
        </p>
      )}

      {busy && (
        <div
          className="card"
          style={{
            padding: 16,
            background: "var(--bg-1)",
            display: "flex",
            gap: 12,
          }}
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span className="pulse-soft" style={{ color: "var(--accent)" }}>
            <I.Sparkle size={16} />
          </span>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
            Merging {files.length} PDFs…
          </div>
        </div>
      )}

      {result && (
        <div
          className="card"
          style={{ padding: "16px 20px" }}
          role="status"
          aria-live="polite"
          aria-label={`Merged ${result.sourceCount} PDFs into one with ${result.totalPageCount} pages`}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 16,
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                Merged into one PDF
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                {result.totalPageCount} page
                {result.totalPageCount === 1 ? "" : "s"} ·{" "}
                {result.sourceCount} source files · {humanSize(result.totalSize)}{" "}
                in
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={downloadResult}
            >
              <I.Download size={12} /> Download
            </button>
          </div>
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>
            Merge another set
          </button>
        ) : (
          <>
            {files.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={reset}
                disabled={busy}
              >
                Clear
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={files.length < 2 || busy}
              onClick={run}
            >
              {busy
                ? "Merging…"
                : files.length < 2
                  ? "Add 2+ PDFs to merge"
                  : `Merge ${files.length} PDFs`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
