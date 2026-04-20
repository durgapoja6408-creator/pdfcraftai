// PdfToOfficeTool — free "PDF → Word/Text" runner.
//
// Unlike the other free tools (merge/split/rotate/compress etc.) this
// one runs the actual conversion on our server at /api/tools/pdf-to-office.
// Rationale is documented in that route's header: pdfjs-dist's worker
// needs bundling + CSP gymnastics we didn't want to take on for a tool
// most visitors won't touch, and the `docx` library would bloat every
// client bundle. Server-side keeps the bundle lean and reuses the
// extractor that already powers the AI tools.
//
// The UI makes this tradeoff explicit in the dropzone hint ("processed
// on our servers, then deleted") and the reassurance row on the page.
// We do NOT write the upload to disk — it lives in the Node process's
// memory for the duration of the request only.
//
// Error handling mirrors the AI tools: 400 = bad PDF, 413 = too big,
// 422 with `error: "no_extractable_text"` = scanned doc (nudge to OCR),
// 429 = rate-limited, 5xx = transient server error.

"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";

type Format = "docx" | "txt";

const FORMAT_OPTIONS: ReadonlyArray<{
  value: Format;
  label: string;
  hint: string;
  icon: keyof typeof I;
}> = [
  {
    value: "docx",
    label: "Word (.docx)",
    hint: "Editable Microsoft Word document — one section per PDF page.",
    icon: "File",
  },
  {
    value: "txt",
    label: "Plain text (.txt)",
    hint: "UTF-8 text, one page per form-feed. Best for copy/paste.",
    icon: "Edit",
  },
];

type Result = {
  filename: string;
  size: number;
  pageCount: number;
  ocrCandidatePages: number[];
  objectUrl: string;
};

export function PdfToOfficeTool() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<Format>("docx");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const addFiles = useCallback((files: File[]) => {
    setError(null);
    // If we had a previous result, revoke the blob URL so it's eligible
    // for GC — the user is about to convert something new.
    setResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
    setFile(files[0] ?? null);
  }, []);

  const reset = useCallback(() => {
    setFile(null);
    setError(null);
    setResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
  }, []);

  const run = async () => {
    if (!file) {
      setError("Drop a PDF to convert.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });

    try {
      const form = new FormData();
      form.append("pdf", file);
      form.append("format", format);

      const res = await fetch("/api/tools/pdf-to-office", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        setError(mapErrorBody(res.status, body));
        return;
      }

      const pageCount = Number(res.headers.get("x-page-count") || "0");
      const ocrRaw = res.headers.get("x-ocr-candidate-pages") || "";
      const ocrCandidatePages = ocrRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0);

      const disposition = res.headers.get("content-disposition") || "";
      const filename =
        parseFilename(disposition) ||
        deriveFilename(file.name, format);

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);

      setResult({
        filename,
        size: blob.size,
        pageCount,
        ocrCandidatePages,
        objectUrl,
      });
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Conversion failed — check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={addFiles}
          prompt="Drop a PDF to convert"
          hint="Up to 25 MB · processed on our servers and deleted immediately after conversion."
        />
      ) : (
        <div
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 16px",
          }}
        >
          <span style={{ color: "var(--fg-subtle)" }}>
            <I.File size={16} />
          </span>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div
              title={file.name}
              style={{
                fontSize: 14,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {file.name}
            </div>
            <div className="subtle" style={{ fontSize: 12 }}>
              {humanSize(file.size)}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            aria-label="Remove"
            disabled={busy}
            onClick={() => setFile(null)}
            style={{ padding: 6, color: "var(--fg-subtle)" }}
          >
            <I.X size={14} />
          </button>
        </div>
      )}

      {/* Format selector — radio cards */}
      <fieldset
        style={{
          border: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
        disabled={busy}
      >
        <legend
          className="eyebrow"
          style={{
            padding: 0,
            fontSize: 11,
            marginBottom: 4,
            letterSpacing: "0.08em",
          }}
        >
          OUTPUT FORMAT
        </legend>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
          }}
        >
          {FORMAT_OPTIONS.map((opt) => {
            const selected = format === opt.value;
            const Ic = I[opt.icon];
            return (
              <label
                key={opt.value}
                className="card"
                style={{
                  position: "relative",
                  padding: 14,
                  cursor: busy ? "not-allowed" : "pointer",
                  borderColor: selected ? "var(--blue)" : "var(--border)",
                  background: selected ? "var(--blue-soft)" : "var(--bg-1)",
                  transition: "background 120ms, border-color 120ms",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                <input
                  type="radio"
                  name="format"
                  value={opt.value}
                  checked={selected}
                  onChange={() => setFormat(opt.value)}
                  disabled={busy}
                  style={{
                    position: "absolute",
                    opacity: 0,
                    width: 1,
                    height: 1,
                    pointerEvents: "none",
                  }}
                />
                <div
                  className="row"
                  style={{ gap: 8, alignItems: "center", marginBottom: 4 }}
                >
                  <span
                    style={{ color: selected ? "var(--blue)" : "var(--fg-subtle)" }}
                  >
                    <Ic size={16} />
                  </span>
                  <div
                    style={{
                      fontWeight: 500,
                      fontSize: 14,
                      color: selected ? "var(--blue)" : "var(--fg)",
                    }}
                  >
                    {opt.label}
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
                  {opt.hint}
                </div>
              </label>
            );
          })}
        </div>
        <p
          className="subtle"
          style={{ fontSize: 12, margin: 0, marginTop: 4, lineHeight: 1.5 }}
        >
          Excel (.xlsx) and PowerPoint (.pptx) exports need a layout pass we
          haven&rsquo;t shipped yet — they&rsquo;ll land as soon as we can do
          them well. For tabular extraction today, try the{" "}
          <Link href="/tool/ai-ocr" style={{ textDecoration: "underline" }}>
            AI OCR &amp; Smart Extract
          </Link>{" "}
          tool.
        </p>
      </fieldset>

      {error && (
        <div
          role="alert"
          className="card"
          style={{
            padding: 14,
            borderColor: "var(--red)",
            background: "var(--red-soft, rgba(220,38,38,0.08))",
            color: "var(--red)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}

      {result && <ResultCard result={result} />}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {file && (
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
          disabled={busy || !file}
          onClick={run}
        >
          {busy
            ? "Converting…"
            : format === "docx"
              ? "Convert to Word"
              : "Convert to text"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Result card                                                         */
/* ------------------------------------------------------------------ */

function ResultCard({ result }: { result: Result }) {
  return (
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
            Ready to download
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {result.pageCount} page{result.pageCount === 1 ? "" : "s"} ·{" "}
            {humanSize(result.size)} · {result.filename}
          </div>
          {result.ocrCandidatePages.length > 0 && (
            <div
              className="subtle"
              style={{
                fontSize: 12,
                marginTop: 6,
                padding: "6px 10px",
                borderRadius: 6,
                background: "var(--bg-2)",
                color: "var(--fg-muted, var(--fg))",
                lineHeight: 1.5,
              }}
            >
              <I.Info size={12} /> Page
              {result.ocrCandidatePages.length === 1 ? " " : "s "}
              {result.ocrCandidatePages.join(", ")}{" "}
              looked scanned — no text was extracted from{" "}
              {result.ocrCandidatePages.length === 1 ? "it" : "them"}. Try{" "}
              <Link href="/tool/ai-ocr" style={{ textDecoration: "underline" }}>
                AI OCR
              </Link>{" "}
              first for scanned PDFs.
            </div>
          )}
        </div>
        <a
          href={result.objectUrl}
          download={result.filename}
          className="btn btn-primary"
        >
          <I.Download size={14} />
          <span>Download</span>
        </a>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function mapErrorBody(status: number, body: Record<string, unknown>): string {
  const detail = typeof body.detail === "string" ? body.detail : "";
  const code = typeof body.error === "string" ? body.error : "";

  switch (status) {
    case 400:
      return detail || "That file doesn't look like a valid PDF.";
    case 413:
      return detail || "PDF is too large — the converter accepts up to 25 MB.";
    case 422:
      if (code === "no_extractable_text") {
        return (
          detail ||
          "This PDF appears to be a scan with no extractable text. Try the AI OCR tool first."
        );
      }
      return detail || "Couldn't process this PDF.";
    case 429:
      return detail || "Too many conversions. Try again in a minute.";
    case 502:
    case 503:
      return detail || "The converter is temporarily unavailable. Try again shortly.";
    default:
      return detail || `Conversion failed (status ${status}).`;
  }
}

/**
 * Pull the filename out of a Content-Disposition header. Prefers the
 * RFC 5987 `filename*=UTF-8''encoded` form, falls back to the plain
 * `filename="..."` form.
 */
function parseFilename(disposition: string): string | null {
  const star = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (star && star[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fall through */
    }
  }
  const plain = disposition.match(/filename="?([^"\\;]+)"?/i);
  if (plain && plain[1]) return plain[1];
  return null;
}

function deriveFilename(original: string, format: Format): string {
  const base = original.replace(/\.pdf$/i, "").slice(0, 200) || "document";
  return format === "docx" ? `${base}.docx` : `${base}.txt`;
}
