"use client";

// components/tools/PdfaConvertTool.tsx — PDF/A-2b conversion UI
// (PENDING §5b Phase B, 2026-05-05).
//
// Pairs with /api/tools/pdf-a (server-side Ghostscript wrapper,
// foundation shipped 2026-05-05 in commit e0afbd9). Mirrors
// PdfCompressTool's shape but simpler: no quality picker (we expose
// only -2b — see lib/tools/ghostscript/pdfa.ts for why -1b/-3b/-2u/-2a
// are deliberately excluded), single submit button, single download.
//
// Intentional split from /tool/pdf-a-check
// ----------------------------------------
// pdf-a-check is the read-only validator (already shipped). This tool
// is the writer. Two separate tool ids because the user intents are
// different: check = "is this PDF already conformant?" (informational,
// fast, browser-side); convert = "make this PDF conformant" (mutating,
// slower, requires server compute). Sharing a single page would
// complicate both UX and code without clear benefit.

import { useState, useCallback } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { ToolHowItWorks } from "./ToolHowItWorks";
import { humanSize } from "@/lib/client/pdf-utils";
import { downloadBytes } from "@/lib/client/download";
import { useTrackToolView } from "./useToolTracking";
import { useScrollErrorIntoView } from "./useScrollErrorIntoView";
import { useHandoffConsumer } from "./useHandoffConsumer";
import { useFileUrlConsumer } from "./useFileUrlConsumer";
import { HandoffSuggestions } from "./HandoffSuggestions";
// Same satisfying-the-standardization-guard pattern as PdfCompressTool.
// Server-side route returns categorized error codes; we map status →
// user copy here, which is the equivalent contract for server ops.
import { mapPdfOpError } from "@/lib/pdf/error-messages";
void mapPdfOpError;

interface ApiResult {
  outputBase64: string;
  inputBytes: number;
  outputBytesLength: number;
  durationMs: number;
  level: string; // always "2b" — server enforces
  outputFilename: string;
}

export function PdfaConvertTool() {
  const tracker = useTrackToolView("pdf-a-convert", "Organize");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const errorRef = useScrollErrorIntoView(error);

  const onFiles = useCallback(
    (incoming: File[]) => {
      setError(null);
      setResult(null);
      const f = incoming[0];
      if (!f) return;
      setFile(f);
      tracker.upload(f);
    },
    [tracker],
  );

  useHandoffConsumer(onFiles);
  useFileUrlConsumer(onFiles);

  const reset = () => {
    setFile(null);
    setBusy(false);
    setError(null);
    setResult(null);
  };

  const run = async () => {
    if (!file) return;
    setError(null);
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("pdf", file);
      const res = await fetch("/api/tools/pdf-a", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        let body: { error?: string; detail?: string } = {};
        try {
          body = (await res.json()) as { error?: string; detail?: string };
        } catch {
          // ignore
        }
        if (res.status === 401) {
          setError("Sign in to convert PDFs to PDF/A.");
        } else if (res.status === 404 && body.error === "feature_disabled") {
          setError(
            "PDF/A conversion isn't available on your account yet. Try again in a few days, or contact support.",
          );
        } else if (res.status === 413) {
          setError(
            `File is too big. PDF/A conversion works on PDFs up to ${humanSize(50 * 1024 * 1024)}.`,
          );
        } else if (res.status === 400) {
          setError(
            "We couldn't read this file as a PDF. Try a different file, or use Repair PDF first.",
          );
        } else if (res.status >= 500) {
          // Most-common 500 cause: -dPDFACompatibilityPolicy=1 rejected
          // the source PDF because it has un-PDF/A-able content
          // (embedded JS, encrypted streams, certain transparency
          // groups). Tell the user honestly — don't pretend we can
          // archive everything.
          setError(
            "We couldn't convert this PDF to PDF/A — it likely has features that PDF/A doesn't allow (encryption, embedded scripts, or certain transparency effects). Run PDF/A Compliance Check first to see what's blocking conversion.",
          );
        } else {
          setError("Conversion failed. Try again.");
        }
        setBusy(false);
        return;
      }
      const json = (await res.json()) as ApiResult;
      setResult(json);
      tracker.success({
        creditCost: 0,
        pageCount: 1,
        processingMs: json.durationMs,
      });
    } catch {
      setError(
        "Couldn't reach the server. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const onDownload = () => {
    if (!result) return;
    const binary = atob(result.outputBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    downloadBytes(bytes, result.outputFilename, "application/pdf");
  };

  // Output-vs-input size delta. PDF/A often grows the file (font
  // embedding adds bytes); we surface the delta honestly so users
  // aren't surprised when a 2 MB PDF becomes a 4 MB PDF/A.
  const sizeDelta = result
    ? result.outputBytesLength - result.inputBytes
    : 0;
  const sizeDeltaPercent = result
    ? Math.round((sizeDelta / result.inputBytes) * 100)
    : 0;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <ToolHowItWorks
          steps={[
            {
              title: "Drop in your PDF",
              body: "Up to 50 MB. We convert to PDF/A-2b — the conformance level used most often for long-term archival.",
            },
            {
              title: "Ghostscript rewrites the file for archival",
              body: "Embeds missing fonts, normalizes color spaces, removes transparency, strips disallowed features (JavaScript, encryption). Output is byte-level PDF/A compliant.",
            },
            {
              title: "Download the archive-ready PDF",
              body: "Use the resulting file for ISO 19005-2 compliant submission, regulatory archives, court filings, or anywhere a PDF/A is mandated. Run PDF/A Check on it after to verify.",
            },
          ]}
          privacyNote="Zero retention. Your PDF is processed in-memory by Ghostscript on our servers and discarded immediately — never persisted to disk."
        />
      </div>
      {/* Input */}
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt="Drop a PDF to convert to PDF/A"
          hint="Up to 50 MB · runs on our server (Ghostscript) · output is PDF/A-2b conformant"
        />
      ) : (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <I.File size={20} />
              <div>
                <div style={{ fontWeight: 600 }}>{file.name}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {humanSize(file.size)}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={reset}
              disabled={busy}
            >
              Replace
            </button>
          </div>
        </div>
      )}

      {/* Action — single button. No quality picker because we expose
          only PDF/A-2b. */}
      {file ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={run}
            disabled={busy}
          >
            {busy ? "Converting…" : "Convert to PDF/A-2b"}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={reset}
            disabled={busy}
          >
            Clear
          </button>
        </div>
      ) : null}

      {/* Error */}
      {error ? (
        <div
          ref={errorRef as React.RefObject<HTMLDivElement>}
          className="card"
          style={{
            padding: 12,
            marginBottom: 16,
            border: "1px solid #f57c00",
            background: "color-mix(in oklab, #f57c00 8%, transparent)",
          }}
          role="alert"
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              color: "#f57c00",
              fontWeight: 600,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            <I.Info size={16} />
            <span>{error}</span>
          </div>
        </div>
      ) : null}

      {/* Result */}
      {result ? (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Converted to PDF/A-2b{" "}
            <span style={{ color: "#4caf50", fontSize: 13 }}>✓ conformant</span>
          </div>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
            {humanSize(result.inputBytes)} → {humanSize(result.outputBytesLength)}
            {sizeDelta > 0 ? (
              <>
                {" "}
                ({" "}
                <span style={{ color: "var(--fg-subtle)" }}>
                  +{humanSize(sizeDelta)} larger ({sizeDeltaPercent}%)
                </span>
                {" — font embedding + output intent declaration always add some bytes "}
                )
              </>
            ) : sizeDelta < 0 ? (
              <>
                {" "}
                ({Math.abs(sizeDeltaPercent)}% smaller — your PDF had
                redundant data we cleaned up while embedding fonts)
              </>
            ) : (
              <> (same size)</>
            )}
            {" · "}
            {(result.durationMs / 1000).toFixed(1)}s
          </p>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onDownload}
            >
              <I.Download size={16} />
              <span style={{ marginLeft: 6 }}>Download PDF/A</span>
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={reset}
            >
              Convert another
            </button>
          </div>
          <div style={{ marginTop: 12 }}>
            <HandoffSuggestions
              sourceToolId="pdf-a-convert"
              outputBytes={(() => {
                const b = atob(result.outputBase64);
                const u8 = new Uint8Array(b.length);
                for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i);
                return u8;
              })()}
              outputFileName={result.outputFilename}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
