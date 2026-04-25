"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { I } from "@/components/icons/Icons";
import {
  downloadBytes,
  humanSize,
  MAX_FILE_SIZE_BYTES,
  sha256HexOfBytes,
} from "@/lib/client/pdf-utils";
import { logToolResultAction } from "@/lib/tool-result-actions";
import { useTrackToolView } from "./useToolTracking";

/**
 * ImageToPdfTool — in-browser image → PDF runner, no upload.
 *
 * Backs `/tool/to-pdf`. Accepts JPG + PNG, embeds each image as its own
 * page (honoring image dimensions), and saves a single PDF. Multi-file
 * order is user-controllable via up/down reorder buttons, mirroring
 * MergePdfTool's UX for consistency.
 *
 * Notes on format support:
 *   - Implemented: JPEG (image/jpeg, .jpg, .jpeg) and PNG (image/png, .png).
 *   - Word, HTML, etc. → would require a server-side pipeline (LibreOffice
 *     / headless Chromium). This tool cleanly rejects them with a message
 *     that points users at the AI Generate route in the meantime.
 */

const IMAGE_ACCEPT = "image/jpeg,image/png,.jpg,.jpeg,.png";
const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB per image

type Item = {
  id: string;
  file: File;
  kind: "jpg" | "png";
  previewUrl: string;
  width: number;
  height: number;
};

type PageSizeMode = "fit" | "letter" | "a4";

let _idCounter = 0;
const nextId = () => `img${Date.now()}-${++_idCounter}`;

// Page sizes in PDF points (1in = 72pt)
const LETTER_PT = { w: 612, h: 792 } as const;
const A4_PT = { w: 595.28, h: 841.89 } as const;

export function ImageToPdfTool() {
  useTrackToolView("to-pdf", "Convert");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<PageSizeMode>("fit");
  const [marginPt, setMarginPt] = useState(24);
  const [result, setResult] = useState<{
    bytes: Uint8Array;
    name: string;
    size: number;
    pageCount: number;
    originalTotal: number;
  } | null>(null);

  const dragOverRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Clean up preview URLs when the component unmounts or items change.
  useEffect(() => {
    return () => {
      items.forEach((it) => URL.revokeObjectURL(it.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    setError(null);
    setResult(null);
    const next: Item[] = [];
    for (const file of files) {
      const kind = detectImageKind(file);
      if (!kind) {
        setError(`"${file.name}" — only JPG or PNG images are supported here.`);
        return;
      }
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        setError(`"${file.name}" exceeds the ${humanSize(MAX_IMAGE_SIZE_BYTES)} per-image limit.`);
        return;
      }
      try {
        const dims = await readImageDimensions(file);
        next.push({
          id: nextId(),
          file,
          kind,
          previewUrl: URL.createObjectURL(file),
          width: dims.width,
          height: dims.height,
        });
      } catch {
        setError(`"${file.name}" — could not be read as a valid image.`);
        return;
      }
    }
    setItems((prev) => [...prev, ...next]);
  }, []);

  const move = (idx: number, dir: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });
  };

  const remove = (idx: number) => {
    setItems((prev) => {
      const removed = prev[idx];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const reset = () => {
    items.forEach((it) => URL.revokeObjectURL(it.previewUrl));
    setItems([]);
    setError(null);
    setResult(null);
  };

  const run = async () => {
    if (items.length === 0) {
      setError("Add at least one image.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const out = await PDFDocument.create();
      let originalTotal = 0;
      for (const item of items) {
        originalTotal += item.file.size;
        const bytes = new Uint8Array(await item.file.arrayBuffer());
        const embedded =
          item.kind === "jpg"
            ? await out.embedJpg(bytes)
            : await out.embedPng(bytes);

        const { pageW, pageH, drawW, drawH, x, y } = layoutPage(
          item.width,
          item.height,
          pageSize,
          marginPt,
        );
        const page = out.addPage([pageW, pageH]);
        page.drawImage(embedded, { x, y, width: drawW, height: drawH });
      }
      const bytes = await out.save({ useObjectStreams: true });
      const name = deriveOutputName(items.map((i) => i.file.name));
      setResult({
        bytes,
        name,
        size: bytes.length,
        pageCount: items.length,
        originalTotal,
      });

      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "to-pdf",
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
      setError(err instanceof Error ? err.message : "Conversion failed.");
    } finally {
      setBusy(false);
    }
  };

  const totalBytes = items.reduce((sum, it) => sum + it.file.size, 0);

  function handleList(list: FileList | File[]) {
    const files = Array.from(list);
    if (files.length === 0) return;
    void addFiles(files);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {items.length === 0 ? (
        <ImageDropzone
          onFiles={handleList}
          disabled={busy}
          inputRef={inputRef}
          dragOver={dragOver}
          setDragOver={setDragOver}
          dragOverRef={dragOverRef}
        />
      ) : (
        <>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {items.map((item, i) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <span className="subtle mono" style={{ fontSize: 12, width: 20, textAlign: "right" }}>
                  {i + 1}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt={item.file.name}
                  style={{
                    width: 36,
                    height: 36,
                    objectFit: "cover",
                    borderRadius: 6,
                    background: "var(--bg-2)",
                    flexShrink: 0,
                    border: "1px solid var(--border)",
                  }}
                />
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div
                    title={item.file.name}
                    style={{
                      fontSize: 14,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.file.name}
                  </div>
                  <div className="subtle" style={{ fontSize: 12 }}>
                    {item.kind.toUpperCase()} · {item.width} × {item.height} · {humanSize(item.file.size)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  aria-label="Move up"
                  disabled={i === 0 || busy}
                  onClick={() => move(i, -1)}
                  style={{ padding: 6 }}
                >
                  <ArrowIcon dir="up" />
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  aria-label="Move down"
                  disabled={i === items.length - 1 || busy}
                  onClick={() => move(i, 1)}
                  style={{ padding: 6 }}
                >
                  <ArrowIcon dir="down" />
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  aria-label="Remove"
                  disabled={busy}
                  onClick={() => remove(i)}
                  style={{ padding: 6, color: "var(--fg-subtle)" }}
                >
                  <I.X size={14} />
                </button>
              </div>
            ))}
          </div>

          <ImageDropzone
            onFiles={handleList}
            disabled={busy}
            inputRef={inputRef}
            dragOver={dragOver}
            setDragOver={setDragOver}
            dragOverRef={dragOverRef}
            compact
          />

          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Page sizing</div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <SizeChip active={pageSize === "fit"} onClick={() => setPageSize("fit")}>
                Fit to image
              </SizeChip>
              <SizeChip active={pageSize === "letter"} onClick={() => setPageSize("letter")}>
                US Letter
              </SizeChip>
              <SizeChip active={pageSize === "a4"} onClick={() => setPageSize("a4")}>
                A4
              </SizeChip>
            </div>
            {pageSize !== "fit" && (
              <div style={{ marginTop: 14 }}>
                <label
                  htmlFor="margin-range"
                  className="subtle"
                  style={{ fontSize: 12, display: "block", marginBottom: 6 }}
                >
                  Page margin: {Math.round(marginPt)}pt
                </label>
                <input
                  id="margin-range"
                  type="range"
                  min={0}
                  max={72}
                  step={4}
                  value={marginPt}
                  onChange={(e) => setMarginPt(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
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
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 2 }}>PDF ready</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {result.pageCount} image{result.pageCount === 1 ? "" : "s"} ·{" "}
                {humanSize(result.originalTotal)} in → {humanSize(result.size)} out
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

      {items.length > 0 && (
        <div className="row" style={{ gap: 10, justifyContent: "space-between", alignItems: "center" }}>
          <div className="subtle" style={{ fontSize: 12 }}>
            {items.length} image{items.length === 1 ? "" : "s"} · {humanSize(totalBytes)} total
          </div>
          <div className="row" style={{ gap: 10 }}>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={reset}>
              Reset
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || items.length === 0}
              onClick={run}
            >
              {busy ? "Building PDF…" : `Create PDF (${items.length} page${items.length === 1 ? "" : "s"})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageDropzone({
  onFiles,
  disabled,
  inputRef,
  dragOver,
  setDragOver,
  dragOverRef,
  compact,
}: {
  onFiles: (list: FileList | File[]) => void;
  disabled?: boolean;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  dragOverRef: React.MutableRefObject<HTMLDivElement | null>;
  compact?: boolean;
}) {
  return (
    <div
      ref={dragOverRef}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer?.files) onFiles(e.dataTransfer.files);
      }}
      onClick={() => {
        if (disabled) return;
        inputRef.current?.click();
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      style={{
        border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border-strong)"}`,
        borderRadius: "var(--radius-lg)",
        padding: compact ? "20px 16px" : "40px 24px",
        textAlign: "center",
        background: dragOver ? "var(--accent-soft)" : "var(--bg-1)",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 150ms, border-color 150ms",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {!compact && (
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "var(--bg-2)",
            display: "grid",
            placeItems: "center",
            margin: "0 auto 12px",
            color: dragOver ? "var(--accent)" : "var(--fg-subtle)",
          }}
        >
          <I.Image size={20} />
        </div>
      )}
      <p style={{ fontSize: compact ? 13 : 15, fontWeight: 500, margin: 0 }}>
        {compact ? "Add more images" : "Drop JPGs or PNGs here or click to browse"}
      </p>
      {!compact && (
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          Up to {humanSize(MAX_IMAGE_SIZE_BYTES)} per image · converted privately in your browser.
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
    </div>
  );
}

function SizeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? "btn btn-sm btn-primary" : "btn btn-sm btn-ghost"}
      style={{ fontSize: 12 }}
    >
      {children}
    </button>
  );
}

function ArrowIcon({ dir }: { dir: "up" | "down" }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: dir === "up" ? "rotate(180deg)" : undefined }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function detectImageKind(file: File): "jpg" | "png" | null {
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  if (type === "image/jpeg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) return "jpg";
  if (type === "image/png" || name.endsWith(".png")) return "png";
  return null;
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("bad image"));
      img.src = url;
    });
  } finally {
    // Revoke immediately — the preview URL is generated separately so the
    // DOM <img> stays valid while the list is visible.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function layoutPage(
  imgW: number,
  imgH: number,
  mode: PageSizeMode,
  marginPt: number,
): { pageW: number; pageH: number; drawW: number; drawH: number; x: number; y: number } {
  if (mode === "fit") {
    // One page per image at 72 DPI. Cap enormous images so we don't blow
    // up the PDF — anything over 3000pt on either axis is downscaled.
    const MAX = 3000;
    const scale = Math.min(1, MAX / Math.max(imgW, imgH));
    const pageW = imgW * scale;
    const pageH = imgH * scale;
    return { pageW, pageH, drawW: pageW, drawH: pageH, x: 0, y: 0 };
  }
  const target = mode === "letter" ? LETTER_PT : A4_PT;
  const maxW = target.w - marginPt * 2;
  const maxH = target.h - marginPt * 2;
  const ratio = Math.min(maxW / imgW, maxH / imgH);
  const drawW = imgW * ratio;
  const drawH = imgH * ratio;
  const x = (target.w - drawW) / 2;
  const y = (target.h - drawH) / 2;
  // Bail out gracefully on pathological dimensions (0px image).
  const safeW = Number.isFinite(drawW) && drawW > 0 ? drawW : target.w - marginPt * 2;
  const safeH = Number.isFinite(drawH) && drawH > 0 ? drawH : target.h - marginPt * 2;
  return { pageW: target.w, pageH: target.h, drawW: safeW, drawH: safeH, x, y };
}

function deriveOutputName(names: string[]): string {
  if (names.length === 0) return "images.pdf";
  if (names.length === 1) {
    return names[0]!.replace(/\.(jpe?g|png)$/i, ".pdf");
  }
  const first = names[0]!.replace(/\.(jpe?g|png)$/i, "");
  return `${first}-and-${names.length - 1}-more.pdf`;
}
