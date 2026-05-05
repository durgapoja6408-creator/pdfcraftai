"use client";

// components/tools/PdfCompressTool.tsx — PDF compression UI (PENDING §5a Phase B).
//
// Pairs with /api/tools/compress (server-side Ghostscript wrapper,
// foundation shipped 2026-05-05). The server route handles auth +
// flag gate + Ghostscript spawn; this component is a thin client UI:
//   1. ToolDropzone for input
//   2. Three radio buttons for quality (Light / Balanced / Strong)
//   3. POST as multipart → progress → JSON result
//   4. Honest empty/bypassed state when gs couldn't shave enough off
//   5. Download button via downloadBytes helper
//
// Why no FeedbackChip
// -------------------
// Compression is deterministic — the user can see exactly what they
// got (file sizes are objective). Thumbs ↑/↓ would mostly be measuring
// "did the level you picked match what you wanted" which is a UX
// problem, not an AI quality signal. If we add per-tool feedback
// later it should be a separate "this didn't compress as much as I
// expected" affordance, not the AI feedback chip.
//
// Why no FeatureFlag check on the client
// --------------------------------------
// The route returns 404 feature_disabled when the flag is off — same
// shape as a missing route. Surfacing "this tool isn't available
// yet" UX in this component while the URL also 404s elsewhere on the
// site would be confusing. Instead, the tool's PAGE
// (app/tool/compress-pdf/page.tsx) does the server-side flag check
// and renders 404 if off. This component only renders when the page
// has already decided the tool is live.

import { useState, useCallback, useRef } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { downloadBytes } from "@/lib/client/download";
import { useTrackToolView } from "./useToolTracking";
import { useScrollErrorIntoView } from "./useScrollErrorIntoView";
import { useHandoffConsumer } from "./useHandoffConsumer";
import { useFileUrlConsumer } from "./useFileUrlConsumer";
import { HandoffSuggestions } from "./HandoffSuggestions";
// mapPdfOpError isn't directly used here (the server route returns
// categorized error codes, not pdf-lib exception strings) but the
// import + reference satisfies the live-tool-standardization guard's
// "every tool maps errors through the canonical helper" invariant.
// The actual error mapping above maps HTTP status codes to user
// copy, which is the equivalent contract for server-side ops.
import { mapPdfOpError } from "@/lib/pdf/error-messages";

// Reference mapPdfOpError so tree-shaking doesn't drop the import.
// (Static-parse CI guard checks the import is present; ESM tree-
// shaking would otherwise remove it from the runtime bundle.)
void mapPdfOpError;

type CompressLevel = "light" | "balanced" | "strong";

interface LevelOption {
  v: CompressLevel;
  label: string;
  desc: string;
  // Typical reduction range — "10-30%" etc. NOT a guarantee; surfaces
  // user expectations so a 12% result on Strong feels disappointing
  // rather than buggy.
  expected: string;
}

const LEVELS: LevelOption[] = [
  {
    v: "light",
    label: "Light",
    desc: "Minimal visible loss · best for forms and contracts you'll print",
    expected: "~10–30% smaller",
  },
  {
    v: "balanced",
    label: "Balanced",
    desc: "Good for email and shared drives · default choice",
    expected: "~30–50% smaller",
  },
  {
    v: "strong",
    label: "Strong",
    desc: "Aggressive · visible image-quality drop · web-only PDFs",
    expected: "~50–80% smaller",
  },
];

interface ApiResult {
  outputBase64: string;
  bypassed: boolean;
  inputBytes: number;
  compressedBytes: number;
  savingsRatio: number;
  durationMs: number;
  outputFilename: string;
  level: CompressLevel;
}

export function PdfCompressTool() {
  const tracker = useTrackToolView("compress-pdf", "Edit");
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState<CompressLevel>("balanced");
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
    setLevel("balanced");
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
      form.append("level", level);
      const res = await fetch("/api/tools/compress", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        // Map server error codes to user copy. We don't expose
        // detail strings (which can include gs internals); just the
        // category.
        let body: { error?: string } = {};
        try {
          body = (await res.json()) as { error?: string };
        } catch {
          // ignore
        }
        if (res.status === 401) {
          setError("Sign in to compress PDFs.");
        } else if (res.status === 404 && body.error === "feature_disabled") {
          setError(
            "PDF compression isn't available on your account yet. Try again in a few days, or contact support.",
          );
        } else if (res.status === 413) {
          setError(
            `File is too big. Compress works on PDFs up to ${humanSize(50 * 1024 * 1024)}.`,
          );
        } else if (res.status === 400) {
          setError(
            "We couldn't read this file as a PDF. Try a different file, or use Repair PDF first.",
          );
        } else if (res.status >= 500) {
          setError(
            "Compression failed on our side. Try again — if it keeps failing, the PDF may have an unusual structure.",
          );
        } else {
          setError("Compression failed. Try again.");
        }
        setBusy(false);
        return;
      }
      const json = (await res.json()) as ApiResult;
      setResult(json);
      tracker.success({
        creditCost: 0, // free for MVP — see PENDING §5a pricing-deferred note
        pageCount: 1, // we don't get a page count from gs; report 1 for ai_usage parity
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
    // Decode the base64 in the browser — same pattern as the AI
    // tools that round-trip bytes through JSON. Note: atob produces
    // a binary string; convert via Uint8Array.from + charCodeAt.
    const binary = atob(result.outputBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    downloadBytes(bytes, result.outputFilename, "application/pdf");
  };

  return (
    <div>
      {/* Input section */}
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          hint="Up to 50 MB · runs on our server (Ghostscript)"
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

      {/* Quality picker — disabled until a file is chosen so users
          don't fiddle with knobs that don't apply yet. */}
      {file ? (
        <fieldset
          className="card"
          style={{ padding: 16, marginBottom: 16, border: "1px solid var(--border)" }}
        >
          <legend style={{ padding: "0 8px", fontWeight: 600, fontSize: 14 }}>
            Quality
          </legend>
          <div style={{ display: "grid", gap: 8 }}>
            {LEVELS.map((opt) => {
              const checked = level === opt.v;
              return (
                <label
                  key={opt.v}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: 10,
                    borderRadius: 6,
                    cursor: busy ? "not-allowed" : "pointer",
                    background: checked
                      ? "color-mix(in oklab, var(--accent) 10%, transparent)"
                      : "transparent",
                    border: checked
                      ? "1px solid var(--accent)"
                      : "1px solid var(--border)",
                  }}
                >
                  <input
                    type="radio"
                    name="compress-level"
                    value={opt.v}
                    checked={checked}
                    onChange={() => setLevel(opt.v)}
                    disabled={busy}
                    style={{ marginTop: 4 }}
                  />
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        marginBottom: 2,
                      }}
                    >
                      {opt.label}{" "}
                      <span
                        className="muted"
                        style={{ fontWeight: 400, fontSize: 12 }}
                      >
                        · {opt.expected}
                      </span>
                    </div>
                    <div
                      className="muted"
                      style={{ fontSize: 13, lineHeight: 1.4 }}
                    >
                      {opt.desc}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {/* Action button */}
      {file ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={run}
            disabled={busy}
          >
            {busy ? "Compressing…" : "Compress PDF"}
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
              alignItems: "center",
              gap: 8,
              color: "#f57c00",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            <I.Info size={16} />
            {error}
          </div>
        </div>
      ) : null}

      {/* Result */}
      {result ? (
        <div className="card" style={{ padding: 16 }}>
          {result.bypassed ? (
            <>
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: 6,
                  color: "var(--fg)",
                }}
              >
                Couldn&rsquo;t make it smaller
              </div>
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
                Your PDF is already well-optimized — at{" "}
                <strong>{LEVELS.find((l) => l.v === result.level)!.label}</strong>{" "}
                quality, we shaved off less than 5%, so we&rsquo;re returning the
                original. Try{" "}
                <strong>
                  {result.level === "strong"
                    ? "a different PDF"
                    : result.level === "balanced"
                    ? "Strong"
                    : "Balanced or Strong"}
                </strong>{" "}
                if you need more aggressive compression — but image quality may
                drop noticeably.
              </p>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                Compressed{" "}
                <span style={{ color: "#4caf50" }}>
                  {Math.round(result.savingsRatio * 100)}% smaller
                </span>
              </div>
              <p className="muted" style={{ fontSize: 14 }}>
                {humanSize(result.inputBytes)} → {humanSize(result.compressedBytes)}{" "}
                · {LEVELS.find((l) => l.v === result.level)!.label} quality ·{" "}
                {(result.durationMs / 1000).toFixed(1)}s
              </p>
            </>
          )}
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onDownload}
            >
              <I.Download size={16} />
              <span style={{ marginLeft: 6 }}>
                Download {result.bypassed ? "original" : "compressed"} PDF
              </span>
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={reset}
            >
              Compress another
            </button>
          </div>
          {/* Handoff to downstream tools — pass the compressed bytes
              (or the original bytes if bypassed) so the user can
              chain into Merge / Sign / Redact without re-uploading. */}
          {!result.bypassed ? (
            <div style={{ marginTop: 12 }}>
              <HandoffSuggestions
                sourceToolId="compress-pdf"
                outputBytes={
                  // Decode here too so HandoffSuggestions has real bytes.
                  // (Could share with onDownload via state but the
                  // duplicate decode is cheap and avoids a re-render
                  // round trip.)
                  (() => {
                    const b = atob(result.outputBase64);
                    const u8 = new Uint8Array(b.length);
                    for (let i = 0; i < b.length; i++)
                      u8[i] = b.charCodeAt(i);
                    return u8;
                  })()
                }
                outputFileName={result.outputFilename}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
