"use client";

// components/tools/TextToPdfTool.tsx
//
// 2026-05-01: convert plain text into a PDF. Powers /tool/text-to-pdf.
// Two input modes:
//   1. Paste text directly into a textarea
//   2. Drop a .txt file
//
// Quality model: see lib/pdf/ops/text-to-pdf.ts header. Output is
// text-selectable + searchable (no rasterization).

import { useState, useRef, useCallback, useEffect } from "react";
import { I } from "@/components/icons/Icons";
import { humanSize } from "@/lib/client/pdf-utils";
import { downloadBytes } from "@/lib/client/download";
import { useTrackToolView } from "./useToolTracking";
import { useScrollErrorIntoView } from "./useScrollErrorIntoView";
import { HandoffSuggestions } from "./HandoffSuggestions";
import { ToolHowItWorks } from "./ToolHowItWorks";
import { mapPdfOpError } from "@/lib/pdf/error-messages";
import type { TextFontFamily, PaperSize } from "@/lib/pdf/ops/text-to-pdf";

// 2026-05-01 — standardization parity: see ImagesToPdfTool for the
// 5-hook contract. text-to-pdf is exempt from useHandoffConsumer +
// useFileUrlConsumer for the same reason (input is text, not PDF);
// exemption codified in scripts/test-live-tool-standardization.mjs.

const FONTS: Array<{ v: TextFontFamily; label: string; sample: string }> = [
  { v: "monospace", label: "Monospace (Courier)", sample: "for code" },
  { v: "sans", label: "Sans-serif (Helvetica)", sample: "for prose" },
  { v: "serif", label: "Serif (Times)", sample: "for documents" },
];

const SIZES: Array<{ v: PaperSize; label: string }> = [
  { v: "letter", label: "Letter" },
  { v: "a4", label: "A4" },
];

interface ResultState {
  outputBytes: Uint8Array;
  outputFileName: string;
  pageCount: number;
  wrappedLineCount: number;
  inputCharCount: number;
}

const MAX_TEXT_BYTES = 5 * 1024 * 1024; // 5 MB of text
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function TextToPdfTool() {
  const tracker = useTrackToolView("text-to-pdf", "Convert");
  const [text, setText] = useState("");
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [fontFamily, setFontFamily] = useState<TextFontFamily>("monospace");
  const [fontSize, setFontSize] = useState(11);
  const [pageSize, setPageSize] = useState<PaperSize>("letter");

  // 2026-05-11 (item #17 sweep batch 9) — URL permalink state sync.
  // 3-param shape: fontFamily (3 literals) + fontSize (number 4-72)
  // + pageSize (2 literals). Single useEffect with 3-tuple dep per
  // the replaceState non-batching invariant. Defaults (monospace /
  // 11 / letter) omitted from URL. Lets users share preset configs
  // like `/tool/text-to-pdf?fontFamily=sans&fontSize=14` for
  // documentation templates.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const rawFam = params.get("fontFamily");
    if (rawFam === "monospace" || rawFam === "sans" || rawFam === "serif") {
      setFontFamily(rawFam);
    }
    const rawSize = params.get("fontSize");
    if (rawSize) {
      const n = parseInt(rawSize, 10);
      // Wider bounds than PageNumbers (4-24) because text-to-pdf is
      // for body copy: 8pt small print → 72pt poster header.
      if (Number.isFinite(n) && n >= 4 && n <= 72) {
        setFontSize(n);
      }
    }
    const rawPage = params.get("pageSize");
    if (rawPage === "letter" || rawPage === "a4") {
      setPageSize(rawPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (fontFamily === "monospace") params.delete("fontFamily");
    else params.set("fontFamily", fontFamily);
    if (fontSize === 11) params.delete("fontSize");
    else params.set("fontSize", String(fontSize));
    if (pageSize === "letter") params.delete("pageSize");
    else params.set("pageSize", pageSize);
    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [fontFamily, fontSize, pageSize]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  // M16 — scroll the error region into view on null→string.
  const errorRef = useScrollErrorIntoView(error);

  const onFile = useCallback(
    async (file: File) => {
      setError(null);
      setResult(null);
      if (file.size > MAX_FILE_BYTES) {
        setError(`File over ${humanSize(MAX_FILE_BYTES)} — paste a smaller excerpt instead.`);
        return;
      }
      // Heuristic file-type check: accept .txt, .md, .csv, .log, .json, etc.
      // Anything text-like.
      const ok =
        file.type.startsWith("text/") ||
        /\.(txt|md|markdown|csv|log|json|tsv|xml|yaml|yml)$/i.test(file.name);
      if (!ok) {
        setError(`"${file.name}" doesn't look like a text file.`);
        return;
      }
      try {
        const content = await file.text();
        setText(content);
        setSourceName(file.name);
        tracker.upload(file);
      } catch (err) {
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
      setError(
        `Text exceeds ${humanSize(MAX_TEXT_BYTES)}. Trim and try again.`,
      );
      return;
    }
    setError(null);
    setBusy(true);
    const t0 = performance.now();
    try {
      const { textToPdf } = await import("@/lib/pdf/ops/text-to-pdf");
      const r = await textToPdf(text, {
        fontFamily,
        fontSize,
        pageSize,
      });
      const baseName = (sourceName ?? "document")
        .replace(/\.[^.]+$/, "")
        .slice(0, 60);
      setResult({
        outputBytes: r.bytes,
        outputFileName: `${baseName || "document"}.pdf`,
        pageCount: r.pageCount,
        wrappedLineCount: r.wrappedLineCount,
        inputCharCount: text.length,
      });
      tracker.success({
        creditCost: 0,
        pageCount: r.pageCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("text-to-pdf failed", err);
      setError(
        mapPdfOpError(
          err instanceof Error ? err.message : "Couldn't build the PDF.",
        ),
      );
      tracker.error({ errorCode: "text_to_pdf_failed" });
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
      <ToolHowItWorks
        steps={[
          {
            title: "Paste plain text or drop in a .txt file",
            body: "Either input mode works — paste a chunk of text into the textarea, or drop a .txt file. Up to 100 MB.",
          },
          {
            title: "Pick a font and paper size",
            body: "Monospace (great for code / logs / receipts), sans-serif (clean readability), or serif (long-form documents). Body font size 4–72pt. Letter or A4 paper.",
          },
          {
            title: "Save the PDF",
            body: "Clean wrap, automatic page breaks, page numbers included. Useful for archiving logs, printing notes, or turning paste-buffer text into a polished, paginated document.",
          },
        ]}
        privacyNote="Your text stays in your browser. The render happens client-side with pdf-lib — nothing is uploaded or persisted."
      />
      {!result && (
        <>
          {/* Drop zone for file upload (alternative to typing) */}
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
            <div>Drop a .txt / .md / .csv / .log file or click to browse</div>
            <div className="subtle" style={{ fontSize: 11, marginTop: 4 }}>
              {sourceName ? `Loaded: ${sourceName}` : "Optional — you can also paste text below"}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".txt,.md,.markdown,.csv,.log,.json,.tsv,.xml,.yaml,.yml,text/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </div>

          {/* Textarea — primary input */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste or type your text here…"
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
          <div className="subtle" style={{ fontSize: 12, marginTop: -10 }}>
            {text.length.toLocaleString()} character
            {text.length === 1 ? "" : "s"} ·{" "}
            {text === "" ? "empty" : humanSize(new Blob([text]).size)}
          </div>

          {/* Config panel */}
          <div
            className="card"
            style={{
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                Font
              </div>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {FONTS.map((f) => (
                  <button
                    key={f.v}
                    type="button"
                    className={`btn btn-sm ${fontFamily === f.v ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setFontFamily(f.v)}
                    title={f.sample}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="row" style={{ gap: 16, alignItems: "center" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                }}
              >
                Size:
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
                  {[8, 9, 10, 11, 12, 13, 14, 16, 18].map((s) => (
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
            Building PDF…
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
                {result.inputCharCount.toLocaleString()} characters
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                {humanSize(result.outputBytes.length)}
                {result.wrappedLineCount > 0
                  ? ` · ${result.wrappedLineCount} long lines word-wrapped`
                  : ""}
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
          {/* M9 — cross-tool funnel panel. */}
          <HandoffSuggestions
            sourceToolId="text-to-pdf"
            outputBytes={result.outputBytes}
            outputFileName={result.outputFileName}
          />
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>
            Convert more text
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
