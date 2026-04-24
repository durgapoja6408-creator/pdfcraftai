"use client";

// ExtractImagesTool — Tier 1 §1.8 P0.
//
// Pull every embedded image out of a PDF. We use pdfjs-dist's
// operator-list pass to find paintImageXObject ops on each page,
// grab the image bitmap from commonObjs, and render it to a
// canvas → PNG blob. This gives clean extracted images, but note
// it does NOT preserve the *original* compressed bytes of the
// embedded object (so a JPEG embedded at 60% quality comes out
// re-encoded as a PNG at full quality, usually larger). A future
// v2 can dig into pdf-lib's indirect-object table and write the
// raw /DCTDecode bytes straight to disk for JPEG fidelity.
//
// Output pattern: preview grid like PdfToJpgTool. Download
// individual or all images.

import { useState, useCallback } from "react";
import { PDFDocument } from "pdf-lib";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";

type ExtractedImage = {
  id: string;
  sourcePage: number;
  width: number;
  height: number;
  blob: Blob;
  size: number;
  previewUrl: string;
};

type Loaded = {
  file: File;
  pageCount: number;
};

export function ExtractImagesTool() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<ExtractedImage[]>([]);

  const onFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setImages([]);
    setBusy(true);
    try {
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
    for (const img of images) URL.revokeObjectURL(img.previewUrl);
    setLoaded(null);
    setImages([]);
    setError(null);
  };

  const run = async () => {
    if (!loaded) return;
    setBusy(true);
    setError(null);
    for (const img of images) URL.revokeObjectURL(img.previewUrl);
    setImages([]);
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
      const paintOp = pdfjs.OPS.paintImageXObject;
      const paintInlineOp = pdfjs.OPS.paintInlineImageXObject;

      const out: ExtractedImage[] = [];
      const seenKeys = new Set<string>();

      for (let p = 1; p <= src.numPages; p++) {
        const page = await src.getPage(p);
        const ops = await page.getOperatorList();
        for (let i = 0; i < ops.fnArray.length; i++) {
          const fn = ops.fnArray[i];
          if (fn !== paintOp && fn !== paintInlineOp) continue;
          const imgName = ops.argsArray[i]?.[0];
          if (!imgName) continue;

          // Dedupe by name + page — same image referenced twice on a
          // page or reused across pages shouldn't extract twice.
          const key = typeof imgName === "string" ? imgName : String(imgName);
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);

          // objs vs commonObjs: commonObjs holds images shared across
          // pages (most common case); objs holds page-local. Try both.
          let img: {
            width: number;
            height: number;
            bitmap?: ImageBitmap;
            data?: Uint8ClampedArray;
          } | null = null;
          try {
            img = await new Promise((resolve) => {
              try {
                // commonObjs.get is async via callback in pdfjs v4
                page.commonObjs.get(key, resolve);
              } catch {
                try {
                  page.objs.get(key, resolve);
                } catch {
                  resolve(null);
                }
              }
            });
          } catch {
            img = null;
          }
          if (!img || !img.width || !img.height) continue;

          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;

          if (img.bitmap) {
            // Modern path: ImageBitmap.
            ctx.drawImage(img.bitmap, 0, 0);
          } else if (img.data) {
            // Older path: raw pixel data. pdfjs emits RGBA in some
            // builds and RGB in others — detect via length.
            const bytesPerPx = img.data.length / (img.width * img.height);
            if (bytesPerPx === 4) {
              const imageData = new ImageData(img.data, img.width, img.height);
              ctx.putImageData(imageData, 0, 0);
            } else if (bytesPerPx === 3) {
              // Expand RGB → RGBA.
              const rgba = new Uint8ClampedArray(img.width * img.height * 4);
              for (let j = 0, k = 0; j < img.data.length; j += 3, k += 4) {
                rgba[k] = img.data[j]!;
                rgba[k + 1] = img.data[j + 1]!;
                rgba[k + 2] = img.data[j + 2]!;
                rgba[k + 3] = 255;
              }
              const imageData = new ImageData(rgba, img.width, img.height);
              ctx.putImageData(imageData, 0, 0);
            } else {
              // Unknown stride — skip this image rather than guess wrong.
              continue;
            }
          } else {
            continue;
          }

          const blob: Blob = await new Promise((resolve, reject) => {
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error("toBlob null"))),
              "image/png"
            );
          });

          out.push({
            id: `p${p}-${out.length + 1}`,
            sourcePage: p,
            width: img.width,
            height: img.height,
            blob,
            size: blob.size,
            previewUrl: URL.createObjectURL(blob),
          });
        }
        await new Promise((r) => setTimeout(r, 0));
      }

      if (out.length === 0) {
        setError("No images found in this PDF.");
      }
      setImages(out);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Extraction failed.");
    } finally {
      setBusy(false);
    }
  };

  const downloadOne = (img: ExtractedImage) => {
    const base = loaded?.file.name.replace(/\.pdf$/i, "") ?? "image";
    const name = `${base}-p${img.sourcePage}-${img.id.split("-").pop()}.png`;
    const a = document.createElement("a");
    a.href = img.previewUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const downloadAll = async () => {
    for (const img of images) {
      downloadOne(img);
      await new Promise((r) => setTimeout(r, 120));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!loaded ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF to pull embedded images out"
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
      )}

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}

      {images.length > 0 && (
        <>
          <div
            className="subtle"
            style={{ fontSize: 13 }}
          >
            Found {images.length} image{images.length === 1 ? "" : "s"}.
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            {images.map((img) => (
              <div
                key={img.id}
                className="card"
                style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.previewUrl}
                  alt={`Page ${img.sourcePage} image`}
                  style={{
                    width: "100%",
                    height: 120,
                    objectFit: "contain",
                    background: "var(--bg-1)",
                    borderRadius: 4,
                  }}
                />
                <div className="subtle" style={{ fontSize: 11 }}>
                  Page {img.sourcePage} · {img.width}×{img.height} · {humanSize(img.size)}
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => downloadOne(img)}
                >
                  <I.Download size={12} />
                  <span>Download</span>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {loaded && (
        <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
          {images.length > 0 && (
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
            onClick={run}
          >
            {busy ? "Scanning…" : images.length > 0 ? "Re-scan" : "Extract images"}
          </button>
        </div>
      )}
    </div>
  );
}
