"use client";

// DeletePagesTool — Tier 1 §1.1 P0.
//
// Inverse of Extract: keep every page EXCEPT the ones the user names.
// Same parser (parsePageRanges), same pdf-lib pipeline. Separate tool
// because users search "delete pages from PDF" orders of magnitude more
// often than "extract" — giving each its own surface + SEO landing is a
// high-ROI split.

import { useState, useCallback } from "react";
import { PDFDocument } from "pdf-lib";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import {
  deriveOutputName,
  downloadBytes,
  humanSize,
  parsePageRanges,
  sha256HexOfBytes,
} from "@/lib/client/pdf-utils";
import { logToolResultAction } from "@/lib/tool-result-actions";
import { useTrackToolView } from "./useToolTracking";

type Loaded = {
  file: File;
  doc: PDFDocument;
  pageCount: number;
};

export function DeletePagesTool() {
  useTrackToolView("delete-pages", "Organize");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [spec, setSpec] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    bytes: Uint8Array;
    name: string;
    size: number;
    keptCount: number;
    deletedCount: number;
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
      setLoaded({ file: f, doc, pageCount: doc.getPageCount() });
      setSpec("");
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error && /encrypted|password/i.test(err.message)
          ? "This PDF is password-protected. Unlock it first with the Protect tool."
          : "Couldn't read that PDF. It may be corrupt."
      );
      setLoaded(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const reset = () => {
    setLoaded(null);
    setSpec("");
    setError(null);
    setResult(null);
  };

  const run = async () => {
    if (!loaded) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const groups = parsePageRanges(spec, loaded.pageCount);
      const toDelete = new Set(groups.flat());
      if (toDelete.size === 0) {
        throw new Error("Specify which pages to delete, e.g. 3, 5-7.");
      }
      if (toDelete.size === loaded.pageCount) {
        throw new Error(
          "That would delete every page. Leave at least one behind."
        );
      }

      // Keep indices that are NOT in toDelete.
      const keepIndices: number[] = [];
      for (let p = 1; p <= loaded.pageCount; p++) {
        if (!toDelete.has(p)) keepIndices.push(p - 1);
      }

      const out = await PDFDocument.create();
      const copied = await out.copyPages(loaded.doc, keepIndices);
      for (const p of copied) out.addPage(p);

      const bytes = await out.save({ useObjectStreams: true });
      const name = deriveOutputName(loaded.file.name, "-trimmed");
      setResult({
        bytes,
        name,
        size: bytes.length,
        keptCount: keepIndices.length,
        deletedCount: toDelete.size,
      });

      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "delete-pages",
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
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!loaded ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF to delete pages from"
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

          <label
            htmlFor="delete-spec"
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            <span style={{ fontSize: 13, fontWeight: 500 }}>Pages to delete</span>
            <input
              id="delete-spec"
              type="text"
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              placeholder="e.g. 3, 5-7"
              disabled={busy}
              style={{
                padding: "10px 12px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border-strong)",
                background: "var(--bg-1)",
                color: "var(--fg)",
                fontSize: 14,
                fontFamily: "var(--font-mono), ui-monospace, monospace",
              }}
            />
            <span className="subtle" style={{ fontSize: 12 }}>
              Commas for single pages, dashes for ranges. All OTHER pages
              are kept in their original order.
            </span>
          </label>
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
                Pages removed
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {result.deletedCount} deleted · {result.keptCount} kept ·{" "}
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
          disabled={!loaded || busy || !spec.trim()}
          onClick={run}
        >
          {busy ? "Removing…" : "Delete pages"}
        </button>
      </div>
    </div>
  );
}
