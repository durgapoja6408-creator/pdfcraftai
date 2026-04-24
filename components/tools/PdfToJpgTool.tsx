"use client";

// PdfToJpgTool — Tier 1 §1.4 P0.
//
// Rasterize each PDF page to a JPG or PNG image. Uses pdfjs-dist's
// canvas renderer so everything runs in the browser. Quality slider
// lets users trade file size vs detail (DPI scale 1×–3×).
//
// Output pattern: one download per page, triggered on-click. We do NOT
// bundle pages into a zip — that would require jszip as a new dep
// (currently not in package.json) and most users want to grab one or
// two specific pages anyway. If a user needs bulk, there's a
// "Download all" button that sequentially triggers each download.

import { useState, useCallback } from "react";
import { PDFDocument } from "pdf-lib";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";

type PageOutput = {
  pageNumber: number;
  blob: Blob;
  size: number;
  previewUrl: string;
};

type Loaded = {
  file: File;
  pageCount: number;
};

type Format = "jpg" | "png";

export function PdfToJpgTool() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [format, setFormat] = useState<Format>("jpg");
  const [scale, setScale] = useState<number>(2); // 2× ≈ 144 DPI for a US Letter page
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<PageOutput[]>([]);

  const onFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setPages([]);
    setBusy(true);
    try {
      // pdf-lib purely for the page count — pdfjs is heavier so we lazy
      // load it only when the user clicks Render.
      const doc = await PDFDocument.load(await f.arrayBuffer(), {
        ignoreEncryption: true,
      });
      setLoaded({ file: f, pageCount: doc.getPageCount() });
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
    for (const p of pages) URL.revokeObjectURL(p.previewUrl);
    setLoaded(null);
    setPages([]);
    setError(null);
  };

  const render = async () => {
    if (!loaded) return;
    setBusy(true);
    setError(null);
    // Clean up previous previews before regenerating.
    for (const p of pages) URL.revokeObjectURL(p.previewUrl);
    setPages([]);
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.mjs",
          import.meta.url
        ).toString();
      }
      const buf = await loaded.file.arrayBuffer();
      const src = await pdfjs.getDocument({ data: buf }).promise;

      const mime = format === "jpg" ? "image/jpeg" : "image/png";
      const quality = format === "jpg" ? 0.92 : undefined;
      const out: PageOutput[] = [];

      for (let p = 1; p <= src.numPages; p++) {
        const page = await src.getPage(p);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Couldn't create a canvas for rendering.");
        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob: Blob = await new Promise((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
            mime,
            quality
          );
        });
        out.push({
          pageNumber: p,
          blob,
          size: blob.size,
          previewUrl: URL.createObjectURL(blob),
        });
        // Yield to the browser so long documents don't hang the tab.
        // (setTimeout 0 is enough to let the event loop breathe.)
        await new Promise((r) => setTimeout(r, 0));
      }

      setPages(out);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Render failed.");
    } finally {
      setBusy(false);
    }
  };

  const downloadOne = (pg: PageOutput) => {
    const ext = format === "jpg" ? "jpg" : "png";
    const base = loaded?.file.name.replace(/\.pdf$/i, "") ?? "page";
    const name = `${base}-page-${pg.pageNumber}.${ext}`;
    const a = document.createElement("a");
    a.href = pg.previewUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const downloadAll = async () => {
    for (const p of pages) {
      downloadOne(p);
      // Space out triggers so the browser doesn't squash them into one.
      await new Promise((r) => setTimeout(r, 120));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!loaded ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF to rasterize to JPG or PNG"
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
                {loaded.pageCount === 1 ? "" : "s"}
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

          <div className="row" style={{ gap: 20, flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Format</span>
              <div className="row" style={{ gap: 6 }}>
                {(["jpg", "png"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`btn btn-sm ${format === f ? "btn-primary" : "btn-ghost"}`}
                    disabled={busy}
                    onClick={() => setFormat(f)}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 220 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                Scale: {scale}× {scale === 1 ? "(screen)" : scale === 2 ? "(print)" : "(hi-res)"}
              </span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.5}
                value={scale}
                disabled={busy}
                onChange={(e) => setScale(Number(e.target.value))}
              />
            </label>
          </div>
        </>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}

      {pages.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {pages.map((pg) => (
            <div
              key={pg.pageNumber}
              className="card"
              style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pg.previewUrl}
                alt={`Page ${pg.pageNumber}`}
                style={{ width: "100%", height: 160, objectFit: "contain", background: "var(--bg-1)", borderRadius: 4 }}
              />
              <div className="row" style={{ justifyContent: "space-between", fontSize: 12 }}>
                <span className="subtle">Page {pg.pageNumber}</span>
                <span className="subtle">{humanSize(pg.size)}</span>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => downloadOne(pg)}
              >
                <I.Download size={12} />
                <span>Download</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {loaded && (
        <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
          {pages.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={downloadAll}
            >
              Download all
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={render}
          >
            {busy ? "Rendering…" : pages.length > 0 ? "Re-render" : "Convert to images"}
          </button>
        </div>
      )}
    </div>
  );
}
