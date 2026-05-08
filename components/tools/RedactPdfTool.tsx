// RedactPdfTool — Phase 5.6 client runner.
//
// User drops a PDF, we POST it to /api/ai/redact, then render:
//   - A "Download redacted PDF" button (base64 → Blob → anchor click).
//   - A security caveat about visual-overlay redaction (text is still
//     selectable under the black rectangle — print to PDF for truly
//     sensitive handoffs).
//   - The markdown summary: category counts + per-finding table +
//     unmatched findings list.
//
// Auth gate mirrors TableExtractTool / RewritePdfTool:
//   - Render-time `useSession()` swaps the Run button for a Sign-in CTA
//     so anonymous users never upload the PDF before the server
//     bounces a 401.
//   - Defense-in-depth `getSession()` probe inside `run()` catches the
//     rare session-expired-between-render-and-click case.
//   - Idempotency key per submit; server-side replay returns the
//     persisted summary (no PDF — we don't store the redacted bytes).
//
// Result shape:
//   - markdown (GFM) rendered below the download row.
//   - findings[] / unmatched[] drive the overview cards but the main
//     UI surface is the markdown body — it's already formatted by the
//     server helper.

"use client";

import { useState, useCallback, useEffect } from "react";
import { PDFDocument } from "pdf-lib";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, getSession } from "next-auth/react";
import { I } from "@/components/icons/Icons";
// 2026-05-03 plan §9 — Day 6.5 wire-in.
import {
  OutOfCreditsAlert,
  isInsufficientCreditsError,
  isCapExceededError,
  parseRequiredFromError,
  parseBalanceFromError,
} from "@/components/upsell/OutOfCreditsAlert";
// 2026-05-03 plan §5 + Day 2.5 — pre-flight estimator badge.
import { CreditEstimateBadge } from "@/components/upsell/CreditEstimateBadge";
import { FeedbackChip } from "@/components/feedback/FeedbackChip";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { renderMarkdown } from "@/lib/markdown-mini";
import { classifyAiError } from "@/lib/ai/degradation";
import { useTrackToolView } from "./useToolTracking";
import { fetchAiWithRetry } from "@/lib/client/fetch-ai-with-retry";
import { downloadBytes } from "@/lib/client/download";
import { UploadedFilePreview } from "./UploadedFilePreview";
import { GeneratedPdfPreview } from "./GeneratedPdfPreview";

type PiiCategory =
  | "EMAIL"
  | "PHONE"
  | "SSN"
  | "CREDIT_CARD"
  | "ADDRESS"
  | "PERSON_NAME"
  | "DATE_OF_BIRTH"
  | "PASSPORT"
  | "DRIVER_LICENSE"
  | "IP_ADDRESS"
  | "API_KEY"
  | "BANK_ACCOUNT"
  | "OTHER";

type Finding = {
  category: PiiCategory;
  text: string;
  reason: string;
  pagesRedacted: number[];
  occurrences: number;
};

type UnmatchedFinding = {
  category: PiiCategory;
  text: string;
  reason: string;
};

type RedactResult = {
  fileId?: string;
  filename?: string;
  /**
   * Base64 of the redacted PDF. `null` on a replay (we don't persist
   * the PDF, so the first response is the only chance to grab it).
   */
  redactedPdfBase64: string | null;
  redactedPdfFilename: string | null;
  markdown: string;
  findings: Finding[];
  unmatched: UnmatchedFinding[];
  creditCost: number;
  newBalance?: number;
  pageCount?: number;
  providerId: string;
  model: string;
  wasTruncated: boolean;
  /** Non-empty on 207 — compute succeeded, persist failed. */
  persistWarning?: string;
  /** True on idempotency replay — signals "PDF not downloadable again." */
  replay?: boolean;
  /** 2026-05-04 (PENDING §6b stage 3). FeedbackChip dependency. */
  aiUsageId: string | null;
};

// Pre-encoded Sign-in CTA target — see SummarizePdfTool for rationale.
const SIGN_IN_HREF =
  "/login?callbackUrl=" + encodeURIComponent("/tool/ai-redact");

export function RedactPdfTool() {
  useTrackToolView("ai-redact", "AI");
  const router = useRouter();
  // Anonymous-user gate — swap Run for Sign-in so the PDF isn't uploaded
  // before the server bounces a 401. See SummarizePdfTool for rationale.
  const { status: sessionStatus } = useSession();
  const isAnonymous = sessionStatus === "unauthenticated";

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RedactResult | null>(null);
  // Item #5 sweep — retry-status UX (mirrors SummarizePdfTool canary)
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [retryMax, setRetryMax] = useState(0);
  // 2026-05-03 plan §8 layer 4 / Day 2.5 — client-side pageCount peek
  // for the estimate badge. Cheap (pdf-lib parses page tree only,
  // no full-text extraction). Same pattern as OcrPdfTool.
  const [pageCount, setPageCount] = useState<number | null>(null);

  const addFiles = useCallback((files: File[]) => {
    setError(null);
    setResult(null);
    setPageCount(null);
    setFile(files[0] ?? null);
  }, []);

  const reset = () => {
    setFile(null);
    setPageCount(null);
    setError(null);
    setResult(null);
  };

  // Peek page count whenever a fresh file is attached. Aborted
  // gracefully if the user replaces the file mid-load.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      try {
        const bytes = await file.arrayBuffer();
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        if (cancelled) return;
        const n = doc.getPageCount();
        if (n > 0) setPageCount(n);
      } catch {
        // Silent — server-side will produce a helpful error if the
        // PDF is malformed. No need to double-surface here.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const run = async () => {
    if (!file) {
      setError("Drop a PDF first.");
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

    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ik-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
      const res = await fetchAiWithRetry("/api/ai/redact", {
        // M20 (#193): retry on transient 5xx / network failures.
        // FormData is single-use; rebuild it on each attempt.
        bodyFactory: () => {
          const form = new FormData();
          form.append("pdf", file);
          form.append("idempotencyKey", idempotencyKey);

          return form;
        },
        onAttempt: (attempt, max) => {
          if (attempt > 1) {
            setRetryAttempt(attempt);
            setRetryMax(max);
          }
        },
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
          redactedPdfBase64:
            typeof body.redactedPdfBase64 === "string"
              ? body.redactedPdfBase64
              : null,
          redactedPdfFilename:
            typeof body.redactedPdfFilename === "string"
              ? body.redactedPdfFilename
              : null,
          markdown: String(body.markdown ?? ""),
          findings: Array.isArray(body.findings)
            ? (body.findings as Finding[])
            : [],
          unmatched: Array.isArray(body.unmatched)
            ? (body.unmatched as UnmatchedFinding[])
            : [],
          creditCost: Number(body.creditCost ?? 0),
          newBalance:
            typeof body.newBalance === "number" ? body.newBalance : undefined,
          pageCount:
            typeof body.pageCount === "number" ? body.pageCount : undefined,
          providerId: String(body.providerId ?? ""),
          model: String(body.model ?? ""),
          wasTruncated: Boolean(body.wasTruncated),
          replay: Boolean(body.replay),
          aiUsageId:
            typeof body.aiUsageId === "string" ? body.aiUsageId : null,
        });
        return;
      }

      if (res.status === 207) {
        setResult({
          redactedPdfBase64:
            typeof body.redactedPdfBase64 === "string"
              ? body.redactedPdfBase64
              : null,
          redactedPdfFilename:
            typeof body.redactedPdfFilename === "string"
              ? body.redactedPdfFilename
              : null,
          markdown: String(body.markdown ?? ""),
          findings: Array.isArray(body.findings)
            ? (body.findings as Finding[])
            : [],
          unmatched: Array.isArray(body.unmatched)
            ? (body.unmatched as UnmatchedFinding[])
            : [],
          creditCost: Number(body.creditCost ?? 0),
          providerId: String(body.providerId ?? ""),
          model: String(body.model ?? ""),
          wasTruncated: Boolean(body.wasTruncated),
          persistWarning:
            typeof body.detail === "string"
              ? body.detail
              : "PDF redacted, but the summary couldn't be saved to your files. Download the PDF below before leaving.",
          aiUsageId:
            typeof body.aiUsageId === "string" ? body.aiUsageId : null,
        });
        return;
      }

      // Late-401 fallback — render-time gate + getSession() probe should
      // normally catch this earlier.
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
          : "Redaction failed — check your connection and try again."
      );
    } finally {
      setBusy(false);
      setRetryAttempt(0);
      setRetryMax(0);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={addFiles}
          prompt="Drop a PDF to redact"
          hint="Up to 25 MB · processed on our servers with credits."
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
          <UploadedFilePreview file={file} maxHeight={80} />
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

      {/* 2026-05-03 plan §5 + Day 2.5 — pre-flight estimate badge.
          Only shown after the client-side pageCount peek completes
          so the estimator can compute the multiplier-aware cost. */}
      {typeof pageCount === "number" && pageCount > 0 && (
        <CreditEstimateBadge
          op="redact"
          pageCount={pageCount}
          opLabel="this redaction"
        />
      )}

      {error && (
        // 2026-05-03 plan §9 — branch on insufficient-credits.
        isInsufficientCreditsError(error) ? (
          <OutOfCreditsAlert
            required={parseRequiredFromError(error)}
            balance={parseBalanceFromError(error)}
            opLabel="this redaction"
            capExceeded={isCapExceededError(error ?? "")}
          />
        ) : (
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
        )
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
            Sign in to redact
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !file}
            onClick={run}
            aria-busy={busy}
          >
            {/* Bundle G5 (2026-04-26): was "5 credits" — wrong number AND wrong unit.
                lib/tools.ts canonical: "~2 credits per page". formatActionCost() output
                for per-page billing keeps the unit (page count varies per upload). */}
            {retryAttempt > 0
              ? `Retrying… (${retryAttempt}/${retryMax})`
              : busy
                ? "Redacting…"
                : "Redact PDF"}
          </button>
        )}
      </div>
    </div>
  );
}

/** ------------------------------------------------------------------ */

function ResultCard({ result }: { result: RedactResult }) {
  const totalOccurrences = result.findings.reduce(
    (acc, f) => acc + (f.occurrences ?? 0),
    0
  );
  const canDownload = Boolean(
    result.redactedPdfBase64 && result.redactedPdfFilename
  );

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
          {result.persistWarning ? (
            <I.Info size={16} />
          ) : (
            <I.Shield size={16} />
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 14 }}>
            {result.persistWarning
              ? `Redacted (summary not saved)`
              : result.findings.length === 0
                ? `No PII found`
                : `Redacted ${totalOccurrences} span${
                    totalOccurrences === 1 ? "" : "s"
                  } across ${result.findings.length} finding${
                    result.findings.length === 1 ? "" : "s"
                  }`}
          </div>
          <div className="subtle" style={{ fontSize: 12 }}>
            {result.pageCount
              ? `${result.pageCount} page${result.pageCount === 1 ? "" : "s"} · `
              : ""}
            {result.creditCost} credit
            {result.creditCost === 1 ? "" : "s"} spent
            {typeof result.newBalance === "number"
              ? ` · ${result.newBalance} left`
              : ""}
            {result.wasTruncated ? " · truncated (very long doc)" : ""}
            {result.replay ? " · replayed" : ""}
          </div>
        </div>
        {result.fileId && (
          <Link
            href={`/app/files/${result.fileId}/preview`}
            className="btn btn-sm btn-ghost"
            title="View summary on Files"
          >
            <I.Eye size={14} />
            <span>Summary</span>
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

      {/* Download row + security caveat */}
      <div
        style={{
          padding: "16px 18px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          {canDownload ? (
            <DownloadRedactedButton
              base64={result.redactedPdfBase64 as string}
              filename={result.redactedPdfFilename as string}
            />
          ) : (
            <div
              className="subtle"
              style={{ fontSize: 13, fontStyle: "italic" }}
            >
              {result.replay
                ? "Re-run the tool to download a fresh redacted PDF — replays only return the saved summary."
                : "No redacted PDF returned."}
            </div>
          )}
        </div>
        <div
          className="subtle"
          style={{
            fontSize: 12,
            lineHeight: 1.55,
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          <strong style={{ color: "var(--fg)" }}>
            Heads up — visual overlay only.
          </strong>{" "}
          The black rectangles are drawn on top of the page. The underlying
          text in the PDF content stream is untouched, so someone can still
          copy it out with a text editor. For truly sensitive handoffs,
          open the file in any PDF viewer after download and print it to
          a new PDF — that flattens the overlay into pixels.
        </div>
      </div>

      {/* Item #10 — page-1 preview of the redacted PDF. Critical
          for redaction specifically: visual confirmation that the
          redaction overlays landed on the right text BEFORE the
          user downloads + shares the result. Higher-stakes than
          generation: redaction failures expose information the
          user thought they'd hidden. */}
      {result.redactedPdfBase64 && (
        <div
          style={{
            padding: "16px 22px",
            display: "flex",
            justifyContent: "center",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-1)",
          }}
        >
          <GeneratedPdfPreview base64={result.redactedPdfBase64} />
        </div>
      )}

      {/* Rendered markdown summary */}
      <div
        className="prose-mini"
        style={{ padding: "20px 22px", fontSize: 14, lineHeight: 1.65 }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(result.markdown) }}
      />

      {/* 2026-05-04 (PENDING §6b stage 3) — FeedbackChip flywheel.
          redact route surfaces aiUsageId since Batch 3. */}
      <div
        style={{
          padding: "12px 22px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-2, rgba(0,0,0,0.02))",
        }}
      >
        <FeedbackChip
          operation="redact"
          aiUsageId={result.aiUsageId}
          fileId={result.fileId ?? null}
          providerId={result.providerId}
          model={result.model}
        />
      </div>
    </div>
  );
}

/** Converts base64 → Blob → anchor click to trigger a download. */
function DownloadRedactedButton({
  base64,
  filename,
}: {
  base64: string;
  filename: string;
}) {
  const download = () => {
    try {
      // atob → binary string → Uint8Array — standard browser path.
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      downloadBytes(bytes, filename);
    } catch (err) {
      console.error("[RedactPdfTool] download failed", err);
      alert(
        "Couldn't decode the redacted PDF. Try running the tool again — if it keeps failing, contact support."
      );
    }
  };

  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={download}
      title="Download redacted PDF"
    >
      <I.Download size={14} />
      <span>Download redacted PDF</span>
    </button>
  );
}

/** ------------------------------------------------------------------ */

function mapErrorBody(
  status: number,
  body: Record<string, unknown>
): string {
  const code = typeof body.error === "string" ? body.error : "";
  const detail = typeof body.detail === "string" ? body.detail : "";

  // Tool-specific 502 — takes precedence over the shared classifier
  // because `redact_parse_failed` is a parse-layer issue, not an
  // upstream provider outage; copy differs.
  if (status === 502 && code === "redact_parse_failed") {
    return (
      detail ||
      "The AI returned output we couldn't parse. We've refunded your credits — please retry."
    );
  }

  // Shared AI-degradation band (401 / 429 / 502 / 503). See
  // lib/ai/degradation.ts for the full rationale.
  const degraded = classifyAiError(status, body, {
    opLabel: "the redactor",
  });
  if (degraded.kind !== "unknown") return degraded.userMessage;

  switch (status) {
    case 402: {
      const required = typeof body.required === "number" ? body.required : 5;
      const balance = typeof body.balance === "number" ? body.balance : 0;
      const cap = body.capExceeded === true ? " [trial-cap]" : ""; return `Not enough credits — this redaction costs ${required}, you have ${balance}. Top up on /app/billing.${cap}`;
    }
    case 409:
      return (
        detail ||
        "This request is already in flight or has been processed. Check /app/files for the summary."
      );
    case 413:
      return "PDF is too large — the redactor accepts up to 25 MB.";
    case 422:
      if (code === "no_extractable_text") {
        return (
          detail ||
          "We couldn't find text in this PDF — it looks scanned. Run OCR first, then try again."
        );
      }
      return detail || "Couldn't process this PDF.";
    case 400:
      return detail || "That file doesn't look like a valid PDF.";
    default:
      return detail || `Redaction failed (status ${status}).`;
  }
}
