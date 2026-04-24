"use client";

// ExtractPagesTool — Tier 1 §1.1 P0.
//
// Given a single PDF and a page-range spec (e.g. "1-3, 5, 7-9"), build
// a new PDF containing only those pages in the order given. Runs
// entirely in the browser via pdf-lib — no upload, no credit spend.
//
// Pattern intentionally mirrors MergePdfTool / SplitPdfTool:
//   - ToolDropzone for the file intake
//   - pdf-lib PDFDocument.copyPages() for page selection
//   - downloadBytes + logToolResultAction for the finish step
//   - parsePageRanges reused from lib/client/pdf-utils (same parser
//     split/extract share so "1-3, 5" behaves identically across tools)
//
// Why a separate tool from Split: Split produces ONE output per range
// group (N files out). Extract produces ONE combined output with only
// the requested pages in the requested order (1 file out). Users reach
// for different mental models for these two jobs, so the UX is distinct
// even though the internals are close.

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

type Loaded = {
  file: File;
  doc: PDFDocument;
  pageCount: number;
};

export function ExtractPagesTool() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [spec, setSpec] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    bytes: Uint8Array;
    name: string;
    size: number;
    extractedCount: number;
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
      setSpec(`1-${doc.getPageCount()}`);
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
      // parsePageRanges is shared with Split — behaves identically.
      // Flatten the grouped ranges into a single ordered page list; we
      // don't group-separate here because Extract produces one output.
      const groups = parsePageRanges(spec, loaded.pageCount);
      const pageNumbers = groups.flat();
      if (pageNumbers.length === 0) {
        throw new Error("No pages selected.");
      }
      if (pageNumbers.length === loaded.pageCount && groups.length === 1) {
        // Extracting every page is a legal no-op but usually a mistake —
        // the user probably meant a subset. Surface it rather than
        // silently produce an identical file.
        throw new Error(
          "That extracts every page. Enter a subset, e.g. 1-3, 5, 7-9."
        );
      }

      const out = await PDFDocument.create();
      // copyPages wants 0-based indices.
      const indices = pageNumbers.map((p) => p - 1);
      const copied = await out.copyPages(loaded.doc, indices);
      for (const p of copied) out.addPage(p);

      const bytes = await out.save({ useObjectStreams: true });
      const name = deriveOutputName(loaded.file.name, "-extracted");
      setResult({
        bytes,
        name,
        size: bytes.length,
        extractedCount: pageNumbers.length,
      });

      // Metadata log for signed-in users.
      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "extract-pages",
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
      setError(err instanceof Error ? err.message : "Extract failed.");
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
          prompt="Drop a PDF to extract pages from"
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
            htmlFor="extract-spec"
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            <span style={{ fontSize: 13, fontWeight: 500 }}>Pages to extract</span>
            <input
              id="extract-spec"
              type="text"
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              placeholder="e.g. 1-3, 5, 7-9"
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
              Use commas to pick individual pages; dashes for ranges. The
              new PDF keeps the order you list them in.
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
                Extract complete
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {result.extractedCount} page
                {result.extractedCount === 1 ? "" : "s"} · {humanSize(result.size)}
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
          {busy ? "Extracting…" : "Extract pages"}
        </button>
      </div>
    </div>
  );
}
