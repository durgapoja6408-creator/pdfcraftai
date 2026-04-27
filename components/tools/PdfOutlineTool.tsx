"use client";

// components/tools/PdfOutlineTool.tsx
//
// Build 2 Wave 4 (2026-04-27): show the outline / bookmark tree
// of a PDF. Pure byte-parser tool — uses lib/pdf/ops/outline.ts,
// no PDFium engine dependency. Useful for previewing TOCs of long
// docs (research papers, textbooks, legal exhibits) before
// committing to read.

import { useState, useCallback } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import type { OutlineNode } from "@/lib/pdf/ops/outline";

interface OutlineToolResult {
  fileName: string;
  fileSize: number;
  nodes: OutlineNode[];
  unsupported: boolean;
}

type LoadStage = "idle" | "extracting" | "done";

export function PdfOutlineTool() {
  const tracker = useTrackToolView("pdf-outline", "Organize");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<LoadStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OutlineToolResult | null>(null);
  const [copied, setCopied] = useState(false);

  const onFiles = useCallback(
    (files: File[]) => {
      setError(null);
      setResult(null);
      const f = files[0];
      if (!f) return;
      if (!f.type.includes("pdf") && !f.name.toLowerCase().endsWith(".pdf")) {
        setError("Please drop a PDF file.");
        return;
      }
      if (f.size > 100 * 1024 * 1024) {
        setError("File over 100 MB — try a smaller one.");
        return;
      }
      setFile(f);
      tracker.upload(f);
    },
    [tracker],
  );

  const run = async () => {
    if (!file) return;
    setError(null);
    setStage("extracting");
    const t0 = performance.now();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { extractOutline } = await import("@/lib/pdf/ops/outline");
      const r = extractOutline(bytes);
      setResult({
        fileName: file.name,
        fileSize: file.size,
        nodes: r.nodes,
        unsupported: r.unsupported,
      });
      setStage("done");
      tracker.success({
        creditCost: 0,
        pageCount: r.nodes.length,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("pdf-outline failed", err);
      const msg =
        err instanceof Error ? err.message : "Could not parse the PDF outline.";
      setError(msg);
      setStage("idle");
      tracker.error({ errorCode: "parse_failed" });
    }
  };

  const reset = () => {
    setFile(null);
    setError(null);
    setResult(null);
    setStage("idle");
    setCopied(false);
  };

  const copyOutline = async () => {
    if (!result) return;
    const text = result.nodes
      .map((n) => {
        const indent = "  ".repeat(n.depth);
        const page = n.pageNumber !== null ? ` … p. ${n.pageNumber}` : "";
        return `${indent}${n.title}${page}`;
      })
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silent
    }
  };

  const downloadJson = () => {
    if (!result) return;
    const payload = {
      file: { name: result.fileName, size_bytes: result.fileSize },
      outline: result.nodes,
      unsupported: result.unsupported,
      generated_by: "pdfcraft.ai PDF Outline",
      generated_at: new Date().toISOString(),
      schema_version: 1,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      const base = result.fileName.replace(/\.pdf$/i, "");
      a.download = `${base}.outline.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const truncateFilename = (name: string, max = 48) => {
    if (name.length <= max) return name;
    const ext = name.lastIndexOf(".");
    if (ext < 0) return `${name.slice(0, max - 1)}…`;
    const base = name.slice(0, ext);
    const extension = name.slice(ext);
    const keep = max - extension.length - 1;
    return `${base.slice(0, Math.max(8, keep))}…${extension}`;
  };

  const busy = stage === "extracting";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt="Drop a PDF to view its outline"
          hint="Up to 100 MB · runs privately in your browser"
        />
      ) : (
        <div className="card" style={{ padding: 16 }}>
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <span style={{ color: "var(--fg-subtle)" }}>
              <I.File size={18} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={file.name}
              >
                {truncateFilename(file.name)}
              </div>
              <div className="subtle" style={{ fontSize: 12 }}>
                {humanSize(file.size)}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={reset}
              disabled={busy}
              aria-label="Remove file"
            >
              <I.X size={14} />
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>
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
            alignItems: "center",
            gap: 12,
          }}
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span
            className="pulse-soft"
            style={{ color: "var(--accent)", display: "inline-flex" }}
          >
            <I.Sparkle size={16} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              Reading the outline…
            </div>
          </div>
        </div>
      )}

      {result && (
        <div
          className="card"
          style={{ padding: 0, overflow: "hidden" }}
          role="status"
          aria-live="polite"
          aria-label={`Found ${result.nodes.length} outline entries`}
        >
          <div
            style={{
              padding: "16px 24px",
              borderBottom: "1px solid var(--border)",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 16,
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {result.nodes.length === 0
                  ? result.unsupported
                    ? "Couldn't parse the outline"
                    : "No outline / bookmarks"
                  : `${result.nodes.length} bookmark${result.nodes.length === 1 ? "" : "s"}`}
              </div>
              {result.nodes.length === 0 && (
                <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                  {result.unsupported
                    ? "This PDF uses cross-reference streams or encryption that our byte parser can't follow."
                    : "This PDF doesn't have any bookmarks set."}
                </div>
              )}
            </div>
            {result.nodes.length > 0 && (
              <div className="row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={copyOutline}
                  aria-label="Copy outline as text"
                  style={{ minWidth: 90 }}
                >
                  {copied ? (
                    <>
                      <I.Check size={12} /> Copied
                    </>
                  ) : (
                    <>
                      <I.Copy size={12} /> Copy
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={downloadJson}
                  aria-label="Download outline as JSON"
                >
                  <I.Download size={12} /> JSON
                </button>
              </div>
            )}
          </div>

          {result.nodes.length > 0 && (
            <ul
              style={{
                margin: 0,
                padding: "12px 24px",
                listStyle: "none",
                maxHeight: 480,
                overflowY: "auto",
                fontSize: 13,
              }}
            >
              {result.nodes.map((n, i) => (
                <li
                  key={`${n.objectNumber}-${i}`}
                  style={{
                    paddingLeft: n.depth * 18,
                    paddingTop: 4,
                    paddingBottom: 4,
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 8,
                    alignItems: "baseline",
                  }}
                >
                  <span
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={n.title}
                  >
                    {n.depth > 0 && (
                      <span
                        className="subtle"
                        style={{ fontSize: 11, marginRight: 4 }}
                      >
                        ↳
                      </span>
                    )}
                    {n.title || <em className="subtle">(untitled)</em>}
                  </span>
                  {n.pageNumber !== null && (
                    <span
                      className="mono subtle"
                      style={{ fontSize: 11, whiteSpace: "nowrap" }}
                    >
                      p. {n.pageNumber}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>
            View another PDF
          </button>
        ) : (
          <>
            {file && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={reset}
                disabled={busy}
              >
                Reset
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={!file || busy}
              onClick={run}
            >
              {busy ? "Reading…" : "View outline"}
            </button>
          </>
        )}
      </div>

      {/* P12 (2026-04-27): cross-promo card removed. The ToolIntroPanel
          above the dropzone already provides the cross-link to a related
          tool via TOOL_INTROS, and the Related Tools row at the bottom
          provides additional cross-links. Three surfaces was overkill. */}
    </div>
  );
}
