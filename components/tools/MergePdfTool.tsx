"use client";

import { useState, useCallback } from "react";
import { PDFDocument } from "pdf-lib";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import {
  downloadBytes,
  humanSize,
  sha256HexOfBytes,
} from "@/lib/client/pdf-utils";
import { logToolResultAction } from "@/lib/tool-result-actions";
import { useTrackToolView } from "./useToolTracking";

type Item = {
  id: string;
  file: File;
};

let _idCounter = 0;
const nextId = () => `m${Date.now()}-${++_idCounter}`;

export function MergePdfTool() {
  useTrackToolView("merge", "Organize");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    bytes: Uint8Array;
    name: string;
    size: number;
    originalTotal: number;
  } | null>(null);

  const addFiles = useCallback((files: File[]) => {
    setError(null);
    setResult(null);
    setItems((prev) => [...prev, ...files.map((file) => ({ id: nextId(), file }))]);
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
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const reset = () => {
    setItems([]);
    setError(null);
    setResult(null);
  };

  const run = async () => {
    if (items.length < 2) {
      setError("Add at least two PDFs to merge.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const out = await PDFDocument.create();
      let originalTotal = 0;

      for (const { file } of items) {
        originalTotal += file.size;
        const src = await PDFDocument.load(await file.arrayBuffer(), {
          ignoreEncryption: true,
        });
        const pages = await out.copyPages(src, src.getPageIndices());
        for (const p of pages) out.addPage(p);
      }

      const bytes = await out.save({ useObjectStreams: true });
      const name = deriveMergedName(items.map((i) => i.file.name));
      setResult({ bytes, name, size: bytes.length, originalTotal });

      // Log metadata for signed-in users (anonymous users → no-op)
      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "merge",
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
      setError(err instanceof Error ? err.message : "Merge failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {items.length === 0 ? (
        <ToolDropzone onFiles={addFiles} multiple prompt="Drop PDFs to merge" />
      ) : (
        <>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {items.map((item, i) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <span className="subtle mono" style={{ fontSize: 12, width: 20, textAlign: "right" }}>
                  {i + 1}
                </span>
                <span style={{ color: "var(--fg-subtle)" }}>
                  <I.File size={16} />
                </span>
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
                    {humanSize(item.file.size)}
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

          <ToolDropzone
            onFiles={addFiles}
            multiple
            disabled={busy}
            prompt="Add more PDFs"
            hint="Drop or click to add — we'll append them to the list"
          />
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
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 2 }}>Merge complete</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {items.length} files · {humanSize(result.originalTotal)} in → {humanSize(result.size)} out
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
        {items.length > 0 && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={reset}>
            Reset
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || items.length < 2}
          onClick={run}
        >
          {busy ? "Merging…" : `Merge ${items.length || ""} PDFs`.trim()}
        </button>
      </div>
    </div>
  );
}

function deriveMergedName(names: string[]): string {
  if (names.length === 0) return "merged.pdf";
  const first = names[0]!.replace(/\.pdf$/i, "");
  return `${first}-merged-${names.length}.pdf`;
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
