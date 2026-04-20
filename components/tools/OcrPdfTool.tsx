// OcrPdfTool — Phase 5.4 client runner.
//
// Single-dropzone tool that POSTs a PDF to /api/ai/ocr and renders the
// per-page transcription. The twist vs. Summarize is that OCR pricing
// scales linearly per page (2 credits × N), so the CTA label has to
// show the *actual* cost for the file the user just dropped. We peek
// the page count client-side with pdf-lib — the same library the /merge
// /split /rotate tools already use, zero extra bytes — and render the
// price inline before the click.
//
// Client-side guardrails mirror the server:
//   - >50 pages → reject immediately with a "split first" hint instead
//     of sending a POST that we know will 422.
//   - Encrypted PDFs load with `{ ignoreEncryption: true }` so the peek
//     still works; the server will reject them if they're actually
//     unreadable, but most "encrypted" PDFs in the wild are just owner-
//     password-flagged and extract fine.
//
// The response-handling matrix tracks the full route contract:
//   200  → full success (fileId + markdown saved to /app/files).
//   207  → compute succeeded, persist failed (show markdown + warn).
//   400  → malformed PDF / bad request.
//   401  → anonymous.
//   402  → insufficient credits (show balance + required).
//   409  → duplicate submission (point at /app/files).
//   413  → PDF too large (>25 MB).
//   422  → too_many_pages (>50; suggest Split tool).
//   502  → provider errored (credits already refunded server-side).
//   503  → no pdfInput-capable provider configured.
//
// See also: `lib/ai/ocr.ts` (helper), `app/api/ai/ocr/route.ts` (route).

"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, getSession } from "next-auth/react";
import { PDFDocument } from "pdf-lib";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { renderMarkdown } from "@/lib/markdown-mini";

// Keep in sync with server-side `MAX_OCR_PAGES` in lib/ai/ocr.ts.
// We can't import the server module (it's "server-only"), so the
// constant is duplicated here with a reminder comment.
const CLIENT_MAX_OCR_PAGES = 50;
const CREDITS_PER_PAGE = 2;

type OcrResult = {
  fileId?: string;
  filename?: string;
  markdown: string;
  creditCost: number;
  newBalance?: number;
  pageCount?: number;
  processedPageCount?: number;
  providerId: string;
  model: string;
  wasTruncated: boolean;
  /** Non-empty on 207 — OCR succeeded but persist to /app/files failed. */
  persistWarning?: string;
};

// Pre-encoded Sign-in CTA target — see SummarizePdfTool for rationale.
const SIGN_IN_HREF =
  "/login?callbackUrl=" + encodeURIComponent("/tool/ai-ocr");

export function OcrPdfTool() {
  const router = useRouter();
  // Anonymous-user gate: swap the Run button for a Sign-in CTA so the
  // PDF never gets uploaded. See SummarizePdfTool for the full rationale.
  const { status: sessionStatus } = useSession();
  const isAnonymous = sessionStatus === "unauthenticated";
  const [file, setFile] = useState<File | null>(null);
  // Peek state: null while loading, number on success, false on failure.
  // We render "Reading…" during the peek so the CTA can't fire on a
  // file we haven't sized yet.
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [peekError, setPeekError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);

  const addFiles = useCallback((files: File[]) => {
    setError(null);
    setResult(null);
    setPageCount(null);
    setPeekError(null);
    setFile(files[0] ?? null);
  }, []);

  const reset = () => {
    setFile(null);
    setPageCount(null);
    setPeekError(null);
    setError(null);
    setResult(null);
  };

  // Peek page count whenever a new file is attached. Debounced by the
  // useEffect cleanup: if a second file replaces the first mid-load, we
  // flip `cancelled` and discard the stale result.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setPageCount(null);
    setPeekError(null);
    (async () => {
      try {
        const bytes = await file.arrayBuffer();
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        if (cancelled) return;
        const n = doc.getPageCount();
        if (n === 0) {
          setPeekError("This PDF has zero pages — nothing to OCR.");
          return;
        }
        setPageCount(n);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setPeekError(
          `Couldn't read this PDF locally — ${message}. It may be encrypted or corrupt.`
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const creditCost =
    typeof pageCount === "number" ? pageCount * CREDITS_PER_PAGE : null;
  const overLimit =
    typeof pageCount === "number" && pageCount > CLIENT_MAX_OCR_PAGES;

  const run = async () => {
    if (!file) {
      setError("Attach a scanned PDF to run OCR on.");
      return;
    }
    if (typeof pageCount !== "number") {
      setError("Still reading the page count — give it a second.");
      return;
    }
    if (overLimit) {
      setError(
        `OCR is capped at ${CLIENT_MAX_OCR_PAGES} pages per run. This PDF has ${pageCount}. ` +
          `Use the Split tool to break it into chunks first.`
      );
      return;
    }

    // Defense-in-depth session probe — see SummarizePdfTool for detail.
    const fresh = await getSession();
    if (!fresh?.user) {
      router.push(SIGN_IN_HREF);
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);

    // Fresh idempotency key per click. A user-initiated retry is a new
    // request; the server dedupes via the ledger unique index if the
    // same key is ever re-submitted (e.g. double-tap within one ms).
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ik-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
      const form = new FormData();
      form.append("pdf", file);
      form.append("idempotencyKey", idempotencyKey);

      const res = await fetch("/api/ai/ocr", {
        method: "POST",
        body: form,
      });

      const body = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (res.ok) {
        setResult({
          fileId: typeof body.fileId === "string" ? body.fileId : undefined,
          filename:
            typeof body.filename === "string" ? body.filename : undefined,
          markdown: String(body.markdown ?? ""),
          creditCost: Number(body.creditCost ?? 0),
          newBalance:
            typeof body.newBalance === "number" ? body.newBalance : undefined,
          pageCount:
            typeof body.pageCount === "number" ? body.pageCount : undefined,
          processedPageCount:
            typeof body.processedPageCount === "number"
              ? body.processedPageCount
              : undefined,
          providerId: String(body.providerId ?? ""),
          model: String(body.model ?? ""),
          wasTruncated: Boolean(body.wasTruncated),
        });
        return;
      }

      if (res.status === 207) {
        // Compute succeeded, persistence failed. Show the markdown so
        // the user doesn't lose the work they paid for.
        setResult({
          markdown: String(body.markdown ?? ""),
          creditCost: Number(body.creditCost ?? 0),
          processedPageCount:
            typeof body.processedPageCount === "number"
              ? body.processedPageCount
              : undefined,
          providerId: String(body.providerId ?? ""),
          model: String(body.model ?? ""),
          wasTruncated: Boolean(body.wasTruncated),
          persistWarning:
            typeof body.detail === "string"
              ? body.detail
              : "OCR completed, but the result couldn't be saved to your files. Copy it below before leaving.",
        });
        return;
      }

      // Late-401 fallback — render-time gate + getSession() probe
      // should normally catch this earlier; handle the rare expired-
      // mid-upload case gracefully.
      if (res.status === 401) {
        router.push(SIGN_IN_HREF);
        return;
      }

      setError(mapErrorBody(res.status, body));
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "OCR failed — check your connection and try again."
      );
    } finally {
      setBusy(false);
    }
  };

  // CTA label reflects the live page-count peek. While peek is in-flight
  // we render "Reading…"; after peek we show the precise credit cost.
  const ctaLabel = (() => {
    if (busy) return "Transcribing…";
    if (!file) return "OCR — 2 credits / page";
    if (peekError) return "OCR";
    if (typeof pageCount !== "number") return "Reading…";
    if (overLimit) return `${pageCount} pages — over the ${CLIENT_MAX_OCR_PAGES} cap`;
    return `OCR ${pageCount} page${pageCount === 1 ? "" : "s"} — ${creditCost} credits`;
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={addFiles}
          prompt="Drop a scanned PDF to OCR"
          hint="Up to 25 MB, 50 pages · 2 credits per page · processed on our servers."
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
              {typeof pageCount === "number" && (
                <>
                  {" · "}
                  {pageCount} page{pageCount === 1 ? "" : "s"}
                  {creditCost != null && !overLimit && (
                    <>
                      {" · "}
                      {creditCost} credit{creditCost === 1 ? "" : "s"}
                    </>
                  )}
                </>
              )}
              {peekError && <> · page count unavailable</>}
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

      {/* Peek error — couldn't count pages client-side */}
      {peekError && file && (
        <div
          role="alert"
          className="card"
          style={{
            padding: 14,
            borderColor: "var(--amber, #d97706)",
            background: "var(--amber-soft, rgba(217,119,6,0.08))",
            color: "var(--amber, #d97706)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {peekError}
        </div>
      )}

      {/* Over the 50-page limit — actionable hint, not a silent error */}
      {overLimit && (
        <div
          role="alert"
          className="card"
          style={{
            padding: 14,
            borderColor: "var(--amber, #d97706)",
            background: "var(--amber-soft, rgba(217,119,6,0.08))",
            color: "var(--amber, #d97706)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            Too many pages for a single OCR run.
          </div>
          <div>
            OCR is capped at {CLIENT_MAX_OCR_PAGES} pages per run so each
            transcription stays fast. Use{" "}
            <Link href="/tool/split" style={{ textDecoration: "underline" }}>
              Split
            </Link>{" "}
            to break this PDF into chunks, then OCR each chunk.
          </div>
        </div>
      )}

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
        {isAnonymous ? (
          <Link
            href={SIGN_IN_HREF}
            className="btn btn-primary"
            title="Sign in to use AI tools — credits are per-user."
          >
            Sign in to OCR
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={
              busy ||
              !file ||
              overLimit ||
              typeof pageCount !== "number" ||
              Boolean(peekError)
            }
            onClick={run}
          >
            {ctaLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/** ------------------------------------------------------------------ */

function ResultCard({ result }: { result: OcrResult }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — silent fall-through; the user can still
      // triple-click the rendered markdown below.
    }
  };

  const download = () => {
    const blob = new Blob([result.markdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename || "ocr.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4_000);
  };

  const pages = result.processedPageCount ?? result.pageCount;

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
        borderColor: result.persistWarning
          ? "var(--amber, #d97706)"
          : "var(--accent)",
      }}
    >
      {/* Header */}
      <div
        className="row"
        style={{
          gap: 12,
          alignItems: "center",
          padding: "14px 18px",
          background: result.persistWarning
            ? "var(--amber-soft, rgba(217,119,6,0.08))"
            : "var(--accent-soft)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: result.persistWarning
              ? "var(--amber, #d97706)"
              : "var(--accent)",
            color: "var(--bg-1)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          {result.persistWarning ? <I.Info size={16} /> : <I.Check size={16} />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 14 }}>
            {result.persistWarning ? "OCR complete (not saved)" : "OCR complete"}
          </div>
          <div className="subtle" style={{ fontSize: 12 }}>
            {pages ? `${pages} page${pages === 1 ? "" : "s"} · ` : ""}
            {result.creditCost} credit{result.creditCost === 1 ? "" : "s"} spent
            {typeof result.newBalance === "number"
              ? ` · ${result.newBalance} left`
              : ""}
            {result.wasTruncated ? " · clipped to first 50 pages" : ""}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={copy}
          title="Copy markdown"
        >
          <I.Copy size={14} />
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={download}
          title="Download as .md"
        >
          <I.Download size={14} />
          <span>Download</span>
        </button>
        {result.fileId && (
          <Link
            href={`/app/files/${result.fileId}/preview`}
            className="btn btn-sm btn-ghost"
            title="View on Files"
          >
            <I.Eye size={14} />
            <span>View</span>
          </Link>
        )}
      </div>

      {result.persistWarning && (
        <div
          style={{
            padding: "10px 18px",
            fontSize: 13,
            color: "var(--fg-muted)",
            background: "var(--amber-soft, rgba(217,119,6,0.06))",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {result.persistWarning}
        </div>
      )}

      {result.wasTruncated && !result.persistWarning && (
        <div
          style={{
            padding: "10px 18px",
            fontSize: 13,
            color: "var(--fg-muted)",
            background: "var(--amber-soft, rgba(217,119,6,0.06))",
            borderBottom: "1px solid var(--border)",
          }}
        >
          Only the first {pages} pages were transcribed. Split the PDF to
          OCR the remainder.
        </div>
      )}

      {/* Rendered markdown */}
      <div
        className="prose-mini"
        style={{ padding: "20px 22px", fontSize: 14, lineHeight: 1.65 }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(result.markdown) }}
      />

      {/* Provenance footer */}
      <div
        className="subtle mono"
        style={{
          padding: "10px 18px",
          fontSize: 11,
          letterSpacing: "0.04em",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-2)",
        }}
      >
        {result.providerId.toUpperCase()} · {result.model}
      </div>
    </div>
  );
}

/** ------------------------------------------------------------------ */

function mapErrorBody(status: number, body: Record<string, unknown>): string {
  const code = typeof body.error === "string" ? body.error : "";
  const detail = typeof body.detail === "string" ? body.detail : "";

  switch (status) {
    case 401:
      return "Sign in to run OCR — credits are per-user.";
    case 402: {
      const required = typeof body.required === "number" ? body.required : 0;
      const balance = typeof body.balance === "number" ? body.balance : 0;
      return `Not enough credits — this OCR run needs ${required}, you have ${balance}. Top up on /app/billing.`;
    }
    case 409:
      return (
        detail ||
        "This request is already in flight or has been processed. Check /app/files for the result."
      );
    case 413:
      return "PDF is too large — OCR accepts up to 25 MB.";
    case 422:
      if (code === "too_many_pages") {
        return (
          detail ||
          `OCR is capped at ${CLIENT_MAX_OCR_PAGES} pages per run. Use Split to break the PDF into chunks first.`
        );
      }
      return detail || "Couldn't process this PDF.";
    case 400:
      return detail || "That file doesn't look like a valid PDF.";
    case 502:
      return (
        detail ||
        "The AI provider errored — we've refunded your credits. Try again in a moment."
      );
    case 503:
      return "No AI provider with PDF-vision support is configured on this deployment. Ask the admin to set ANTHROPIC_API_KEY (OCR needs a provider that accepts document blocks).";
    default:
      return detail || `OCR failed (status ${status}).`;
  }
}
