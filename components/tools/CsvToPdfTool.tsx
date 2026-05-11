"use client";

// components/tools/CsvToPdfTool.tsx
//
// 2026-05-01 Tier 2: render CSV as a paginated PDF table. Bespoke
// layout — input is text, output is PDF, so the PDF-input shared
// bases don't apply. Text-input exemption codified in
// test-live-tool-standardization.mjs's NON_PDF_INPUT_TOOLS allowlist.

import { useState, useRef, useCallback, useEffect } from "react";
import { I } from "@/components/icons/Icons";
import { humanSize } from "@/lib/client/pdf-utils";
import { downloadBytes } from "@/lib/client/download";
import { useTrackToolView } from "./useToolTracking";
import { useScrollErrorIntoView } from "./useScrollErrorIntoView";
import { HandoffSuggestions } from "./HandoffSuggestions";
import { ToolHowItWorks } from "./ToolHowItWorks";
import { mapPdfOpError } from "@/lib/pdf/error-messages";
import type { CsvPaperSize } from "@/lib/pdf/ops/csv-to-pdf";

const PAPERS: Array<{ v: CsvPaperSize; label: string }> = [
  { v: "letter", label: "Letter (portrait)" },
  { v: "letter-landscape", label: "Letter (landscape)" },
  { v: "a4", label: "A4 (portrait)" },
  { v: "a4-landscape", label: "A4 (landscape)" },
];

const FONT_SIZES = [8, 9, 10, 11, 12] as const;

interface ResultState {
  outputBytes: Uint8Array;
  outputFileName: string;
  pageCount: number;
  rowCount: number;
  columnCount: number;
}

const MAX_TEXT_BYTES = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const SAMPLE_CSV = `Name,Department,Hire Date,Salary
Alex Chen,Engineering,2022-03-15,$112000
Priya Patel,Product,2021-08-22,$128000
Marcus Reed,Marketing,2023-01-10,$94000
Saanvi Kumar,Engineering,2024-06-01,$118000
Riley Nakamura,Design,2022-11-30,$102000`;

export function CsvToPdfTool() {
  const tracker = useTrackToolView("csv-to-pdf", "Convert");
  const [text, setText] = useState("");
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  // 2026-05-11 (item #17 batch 13) — URL permalinks for sharing
  // table-export templates. Same default-omit + replaceState
  // single-effect pattern as the 13 tools wired previously.
  // Default values are NOT written to the URL so a vanilla landing
  // stays clean.
  //
  // Defaults: pageSize=letter-landscape, fontSize=10, hasHeader=true,
  // delimiter=','.
  //
  // pageSize literals (4): letter / a4 / letter-landscape / a4-landscape
  // fontSize bounded number: 6..16 (table copy — narrower than body)
  // hasHeader boolean
  // delimiter literals (3): , (default) / "\t" / ;
  //   The tab character is URL-encoded as %09 by URLSearchParams
  //   transparently. The allowlist matches the raw decoded char.
  const initialFromQs = (() => {
    if (typeof window === "undefined")
      return { pageSize: "letter-landscape" as CsvPaperSize, fontSize: 10, hasHeader: true, delimiter: "," as "," | "\t" | ";" };
    const qs = new URLSearchParams(window.location.search);
    const ps = qs.get("pageSize");
    const fs = qs.get("fontSize");
    const hh = qs.get("hasHeader");
    const dl = qs.get("delimiter");
    const fsNum = fs ? parseInt(fs, 10) : NaN;
    return {
      pageSize:
        ps === "letter" || ps === "a4" || ps === "letter-landscape" || ps === "a4-landscape"
          ? (ps as CsvPaperSize)
          : ("letter-landscape" as CsvPaperSize),
      fontSize:
        Number.isFinite(fsNum) && fsNum >= 6 && fsNum <= 16 ? fsNum : 10,
      hasHeader: hh === "false" ? false : true,
      delimiter:
        dl === "," || dl === "\t" || dl === ";" ? (dl as "," | "\t" | ";") : (",") as "," | "\t" | ";",
    };
  })();
  const [pageSize, setPageSize] = useState<CsvPaperSize>(initialFromQs.pageSize);
  const [fontSize, setFontSize] = useState(initialFromQs.fontSize);
  const [hasHeader, setHasHeader] = useState(initialFromQs.hasHeader);
  const [delimiter, setDelimiter] = useState<"," | "\t" | ";">(initialFromQs.delimiter);

  // Write the 4-tuple to URL via a SINGLE useEffect — replaceState
  // is non-batching, so separate effects per param would race and
  // drop intermediate states. Defaults are omitted from the URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (pageSize === "letter-landscape") params.delete("pageSize");
    else params.set("pageSize", pageSize);
    if (fontSize === 10) params.delete("fontSize");
    else params.set("fontSize", String(fontSize));
    if (hasHeader === true) params.delete("hasHeader");
    else params.set("hasHeader", "false");
    if (delimiter === ",") params.delete("delimiter");
    else params.set("delimiter", delimiter);
    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [pageSize, fontSize, hasHeader, delimiter]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const errorRef = useScrollErrorIntoView(error);

  const onFile = useCallback(
    async (file: File) => {
      setError(null);
      setResult(null);
      if (file.size > MAX_FILE_BYTES) {
        setError(`File over ${humanSize(MAX_FILE_BYTES)} — paste a smaller excerpt instead.`);
        return;
      }
      const ok =
        file.type.startsWith("text/") ||
        /\.(csv|tsv|txt)$/i.test(file.name);
      if (!ok) {
        setError(`"${file.name}" doesn't look like a CSV / TSV file.`);
        return;
      }
      try {
        const content = await file.text();
        setText(content);
        setSourceName(file.name);
        // Auto-detect TSV by extension.
        if (/\.tsv$/i.test(file.name)) setDelimiter("\t");
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
      const { csvToPdf } = await import("@/lib/pdf/ops/csv-to-pdf");
      const r = await csvToPdf(text, {
        paperSize: pageSize,
        fontSize,
        hasHeader,
        delimiter,
      });
      const baseName = (sourceName ?? "table").replace(/\.[^.]+$/, "").slice(0, 60);
      setResult({
        outputBytes: r.bytes,
        outputFileName: `${baseName || "table"}.pdf`,
        pageCount: r.pageCount,
        rowCount: r.rowCount,
        columnCount: r.columnCount,
      });
      tracker.success({
        creditCost: 0,
        pageCount: r.pageCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("csv-to-pdf failed", err);
      setError(
        mapPdfOpError(err instanceof Error ? err.message : "Couldn't build the PDF."),
      );
      tracker.error({ errorCode: "csv_to_pdf_failed" });
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
            title: "Drop in your CSV, TSV, or TXT",
            body: "Up to 100 MB. The file is parsed locally — the data never leaves your browser.",
          },
          {
            title: "Pick a paper size and layout",
            body: "Letter / A4 / Legal, portrait or landscape, font size, header repeat per page. We auto-fit columns to the page width.",
          },
          {
            title: "Save the PDF table",
            body: "We render each row as a clean grid with header repetition, page numbers, and zebra-striped rows for readability — handy for printing or archiving spreadsheets as fixed documents.",
          },
        ]}
        privacyNote="Your CSV and the generated PDF stay in your browser. The conversion happens client-side — nothing is uploaded or persisted."
      />
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
            <I.File size={20} style={{ color: "var(--fg-muted)", marginBottom: 8 }} />
            <div>Drop a .csv / .tsv / .txt file or click to browse</div>
            <div className="subtle" style={{ fontSize: 11, marginTop: 4 }}>
              {sourceName ? `Loaded: ${sourceName}` : "Optional — you can also paste CSV below"}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
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
            placeholder="Paste your CSV data here (header row optional)…"
            rows={10}
            style={{
              width: "100%",
              padding: 12,
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 13,
              fontFamily: "var(--mono, monospace)",
              lineHeight: 1.5,
              resize: "vertical",
              minHeight: 180,
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
                onClick={() => setText(SAMPLE_CSV)}
                style={{ fontSize: 12 }}
              >
                Insert sample CSV
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
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(e) => setHasHeader(e.target.checked)}
                />
                First row is header
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                Delimiter:
                <select
                  value={delimiter}
                  onChange={(e) => setDelimiter(e.target.value as "," | "\t" | ";")}
                  style={{
                    padding: "4px 8px",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    background: "var(--bg-1)",
                    color: "var(--fg)",
                    fontSize: 13,
                  }}
                >
                  <option value=",">, (comma)</option>
                  <option value="\t">{"\\t (tab)"}</option>
                  <option value=";">; (semicolon)</option>
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                Font size:
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
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {PAPERS.map((opt) => (
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
            <div className="subtle" style={{ fontSize: 12 }}>
              RFC 4180 parser handles quoted fields, escaped quotes (""),
              embedded delimiters, and embedded newlines. Long cells truncate
              with an ellipsis to fit. Headers repeat on every page. Output
              is text-selectable + searchable.
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
            Building table PDF…
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
                Built {result.pageCount}-page PDF · {result.rowCount} rows ×{" "}
                {result.columnCount} columns
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                {humanSize(result.outputBytes.length)}
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
            sourceToolId="csv-to-pdf"
            outputBytes={result.outputBytes}
            outputFileName={result.outputFileName}
          />
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>
            Convert more CSV
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
