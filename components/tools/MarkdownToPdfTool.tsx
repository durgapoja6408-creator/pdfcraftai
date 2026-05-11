"use client";

// components/tools/MarkdownToPdfTool.tsx
//
// 2026-05-01 Tier 1: render markdown to a styled PDF. Powers
// /tool/markdown-to-pdf. Two input modes: paste OR drop a .md file.
//
// Standardized 5-hook contract (handoff/file-URL hooks N/A — input
// is text, not PDF; codified in test-live-tool-standardization.mjs's
// NON_PDF_INPUT_TOOLS allowlist):
//   - useTrackToolView ✓
//   - mapPdfOpError ✓
//   - suffixedFilename ✓
//   - useScrollErrorIntoView ✓
//   - HandoffSuggestions ✓ (output is PDF)

import { useState, useRef, useCallback, useEffect } from "react";
import { I } from "@/components/icons/Icons";
import { humanSize } from "@/lib/client/pdf-utils";
import { downloadBytes } from "@/lib/client/download";
import { useTrackToolView } from "./useToolTracking";
import { useScrollErrorIntoView } from "./useScrollErrorIntoView";
import { HandoffSuggestions } from "./HandoffSuggestions";
import { mapPdfOpError } from "@/lib/pdf/error-messages";
import type { MarkdownPaperSize } from "@/lib/pdf/ops/markdown-to-pdf";

const SIZES: Array<{ v: MarkdownPaperSize; label: string }> = [
  { v: "letter", label: "Letter" },
  { v: "a4", label: "A4" },
];

const FONT_SIZES = [9, 10, 11, 12, 13, 14] as const;

interface ResultState {
  outputBytes: Uint8Array;
  outputFileName: string;
  pageCount: number;
  blockCount: number;
  inputCharCount: number;
}

const MAX_TEXT_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const SAMPLE_MARKDOWN = `# Sample heading

This is a **paragraph** with *italic* and \`inline code\` runs. Markdown links like [text](https://example.com) render as italic.

## Lists

- First bullet
- Second bullet with **bold**
- Third

1. Numbered first
2. Numbered second

## Code block

\`\`\`
function hello() {
  return "world";
}
\`\`\`

## Blockquote

> Wisdom is knowing what you don't know.

---

That's it.`;

export function MarkdownToPdfTool() {
  const tracker = useTrackToolView("markdown-to-pdf", "Convert");
  const [text, setText] = useState("");
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [pageSize, setPageSize] = useState<MarkdownPaperSize>("letter");
  const [fontSize, setFontSize] = useState(11);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // 2026-05-11 (item #17 sweep batch 10) — URL permalink state sync.
  // 2-param shape: pageSize (2 literals letter/a4) + fontSize (bounded
  // 4..72, same range as TextToPdfTool — body-copy use case).
  // Single useEffect with [pageSize, fontSize] dep per the replaceState
  // non-batching invariant.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const rawPage = params.get("pageSize");
    if (rawPage === "letter" || rawPage === "a4") {
      setPageSize(rawPage);
    }
    const rawSize = params.get("fontSize");
    if (rawSize) {
      const n = parseInt(rawSize, 10);
      if (Number.isFinite(n) && n >= 4 && n <= 72) {
        setFontSize(n);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (pageSize === "letter") params.delete("pageSize");
    else params.set("pageSize", pageSize);
    if (fontSize === 11) params.delete("fontSize");
    else params.set("fontSize", String(fontSize));
    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [pageSize, fontSize]);
  const errorRef = useScrollErrorIntoView(error);

  const onFile = useCallback(
    async (file: File) => {
      setError(null);
      setResult(null);
      if (file.size > MAX_FILE_BYTES) {
        setError(
          `File over ${humanSize(MAX_FILE_BYTES)} — paste a smaller excerpt instead.`,
        );
        return;
      }
      const ok =
        file.type.startsWith("text/") ||
        /\.(md|markdown|txt)$/i.test(file.name);
      if (!ok) {
        setError(`"${file.name}" doesn't look like a markdown file.`);
        return;
      }
      try {
        const content = await file.text();
        setText(content);
        setSourceName(file.name);
        tracker.upload(file);
      } catch {
        setError(`Couldn't read "${file.name}".`);
      }
    },
    [tracker],
  );

  const reset = () => {
    setText("");
    setSourceName(null);
    setError(null);
    setResult(null);
    setBusy(false);
  };

  const run = async () => {
    if (text.length === 0) return;
    if (text.length > MAX_TEXT_BYTES) {
      setError(`Text exceeds ${humanSize(MAX_TEXT_BYTES)}. Trim and try again.`);
      return;
    }
    setError(null);
    setBusy(true);
    const t0 = performance.now();
    try {
      const { markdownToPdf } = await import("@/lib/pdf/ops/markdown-to-pdf");
      const r = await markdownToPdf(text, {
        paperSize: pageSize,
        fontSize,
      });
      const baseName = (sourceName ?? "document")
        .replace(/\.[^.]+$/, "")
        .slice(0, 60);
      setResult({
        outputBytes: r.bytes,
        outputFileName: `${baseName || "document"}.pdf`,
        pageCount: r.pageCount,
        blockCount: r.blockCount,
        inputCharCount: text.length,
      });
      tracker.success({
        creditCost: 0,
        pageCount: r.pageCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("markdown-to-pdf failed", err);
      setError(
        mapPdfOpError(
          err instanceof Error ? err.message : "Couldn't build the PDF.",
        ),
      );
      tracker.error({ errorCode: "markdown_to_pdf_failed" });
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!result) return;
    downloadBytes(result.outputBytes, result.outputFileName);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!result && (
        <>
          <div
            role="button"
            tabIndex={0}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) onFile(f);
            }}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            style={{
              border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 12,
              padding: "20px 24px",
              textAlign: "center",
              background: dragOver ? "var(--accent-soft)" : "var(--bg-1)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            <I.File
              size={20}
              style={{ color: "var(--fg-muted)", marginBottom: 8 }}
            />
            <div>Drop a .md / .markdown / .txt file or click to browse</div>
            <div className="subtle" style={{ fontSize: 11, marginTop: 4 }}>
              {sourceName
                ? `Loaded: ${sourceName}`
                : "Optional — you can also paste markdown below"}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste or type your markdown here…"
            rows={14}
            style={{
              width: "100%",
              padding: 12,
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 13,
              fontFamily: "var(--mono, monospace)",
              lineHeight: 1.5,
              resize: "vertical",
              minHeight: 240,
              background: "var(--bg-1)",
              color: "var(--fg)",
            }}
            disabled={busy}
          />
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: -10, fontSize: 12 }}>
            <span className="subtle">
              {text.length.toLocaleString()} characters ·{" "}
              {text === "" ? "empty" : humanSize(new Blob([text]).size)}
            </span>
            {text.length === 0 && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setText(SAMPLE_MARKDOWN)}
                style={{ fontSize: 12 }}
              >
                Insert sample markdown
              </button>
            )}
          </div>

          <div
            className="card"
            style={{
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div className="row" style={{ gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                }}
              >
                Body size:
                <select
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  style={{
                    padding: "4px 8px",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    background: "var(--bg-1)",
                    color: "var(--fg)",
                    fontSize: 13,
                  }}
                >
                  {FONT_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}pt
                    </option>
                  ))}
                </select>
              </label>
              <div className="row" style={{ gap: 6 }}>
                {SIZES.map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    className={`btn btn-sm ${pageSize === opt.v ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setPageSize(opt.v)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="subtle" style={{ fontSize: 12 }}>
              Headings (H1–H6), paragraphs, lists, code blocks, blockquotes,
              horizontal rules, and inline **bold** / *italic* /
              `code` / [links](url) supported. Output is text-selectable +
              searchable.
            </div>
          </div>
        </>
      )}

      {error && (
        <p
          ref={errorRef as React.RefObject<HTMLParagraphElement>}
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
            Rendering markdown to PDF…
          </div>
        </div>
      )}

      {result && (
        <div
          className="card"
          style={{ padding: "16px 20px" }}
          role="status"
          aria-live="polite"
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
                Built {result.pageCount}-page PDF from{" "}
                {result.blockCount} markdown block
                {result.blockCount === 1 ? "" : "s"}
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                {humanSize(result.outputBytes.length)} ·{" "}
                {result.inputCharCount.toLocaleString()} chars input
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={download}
            >
              <I.Download size={12} /> Download
            </button>
          </div>
          <HandoffSuggestions
            sourceToolId="markdown-to-pdf"
            outputBytes={result.outputBytes}
            outputFileName={result.outputFileName}
          />
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>
            Convert more markdown
          </button>
        ) : (
          <>
            {(text.length > 0 || sourceName) && (
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
              disabled={text.length === 0 || busy}
              onClick={run}
            >
              {busy ? "Building…" : "Build PDF"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
