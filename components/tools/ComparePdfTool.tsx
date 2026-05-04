// ComparePdfTool — Phase 5.3 client runner.
//
// Two-dropzone layout: Original (A) left, Revised (B) right. Submit
// disabled until BOTH slots hold a PDF. POST to /api/ai/compare,
// render the returned markdown redline inline with severity headers.
//
// Why two distinct dropzones rather than a single multi-file dropzone:
// the diff is directional (A vs B, not {A,B}). Dropping two files into
// one zone would make the ordering ambiguous and the first bug report
// would be "it showed my deletions as additions." Labeled slots make
// the semantics obvious.
//
// Error handling mirrors summarize/translate with compare-specific
// copy: 15-credit cost, "which" side hints for 413/422, and a nudge
// toward OCR in the 5.3+ backlog for scanned inputs.

"use client";

import { useState, useCallback } from "react";
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
import { ToolDropzone } from "./ToolDropzone";
// 2026-05-03 plan §5 + Day 2.5 — pre-flight estimate badge.
import { CreditEstimateBadge } from "@/components/upsell/CreditEstimateBadge";
import { humanSize } from "@/lib/client/pdf-utils";
import { renderMarkdown } from "@/lib/markdown-mini";
import { classifyAiError } from "@/lib/ai/degradation";
import { useTrackToolView } from "./useToolTracking";
import { fetchAiWithRetry } from "@/lib/client/fetch-ai-with-retry";
import { downloadBytes } from "@/lib/client/download";
import { UploadedFilePreview } from "./UploadedFilePreview";

type CompareResult = {
  fileId?: string;
  filename?: string;
  markdown: string;
  creditCost: number;
  newBalance?: number;
  originalPageCount?: number;
  revisedPageCount?: number;
  originalChars?: number;
  revisedChars?: number;
  providerId: string;
  model: string;
  wasTruncated: boolean;
  /** Non-empty on 207 — compute succeeded, persist failed. */
  persistWarning?: string;
};

// Pre-encoded Sign-in CTA target — see SummarizePdfTool for rationale.
const SIGN_IN_HREF =
  "/login?callbackUrl=" + encodeURIComponent("/tool/ai-compare");

export function ComparePdfTool() {
  useTrackToolView("ai-compare", "AI");
  const router = useRouter();
  // Anonymous-user gate: swap the Run button for a Sign-in CTA so the
  // PDFs (two of them! up to 25 MB each) never get uploaded. See
  // SummarizePdfTool for the full rationale.
  const { status: sessionStatus } = useSession();
  const isAnonymous = sessionStatus === "unauthenticated";
  const [pdfA, setPdfA] = useState<File | null>(null);
  const [pdfB, setPdfB] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);

  const addA = useCallback((files: File[]) => {
    setError(null);
    setResult(null);
    setPdfA(files[0] ?? null);
  }, []);
  const addB = useCallback((files: File[]) => {
    setError(null);
    setResult(null);
    setPdfB(files[0] ?? null);
  }, []);

  const reset = () => {
    setPdfA(null);
    setPdfB(null);
    setError(null);
    setResult(null);
  };

  const run = async () => {
    if (!pdfA || !pdfB) {
      setError("Attach both the original and the revised PDF.");
      return;
    }

    // Defense-in-depth session probe — see SummarizePdfTool for detail.
    // Especially valuable here: Compare uploads two PDFs (up to 50 MB
    // total), so the wasted-bandwidth cost of a late 401 is doubled.
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
      const res = await fetchAiWithRetry("/api/ai/compare", {
        // M20 (#193): retry on transient 5xx / network failures.
        // FormData is single-use; rebuild it on each attempt.
        bodyFactory: () => {
          const form = new FormData();
          form.append("pdfA", pdfA);
          form.append("pdfB", pdfB);
          form.append("idempotencyKey", idempotencyKey);

          return form;
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
          markdown: String(body.markdown ?? ""),
          creditCost: Number(body.creditCost ?? 0),
          newBalance:
            typeof body.newBalance === "number" ? body.newBalance : undefined,
          originalPageCount:
            typeof body.originalPageCount === "number"
              ? body.originalPageCount
              : undefined,
          revisedPageCount:
            typeof body.revisedPageCount === "number"
              ? body.revisedPageCount
              : undefined,
          originalChars:
            typeof body.originalChars === "number" ? body.originalChars : undefined,
          revisedChars:
            typeof body.revisedChars === "number" ? body.revisedChars : undefined,
          providerId: String(body.providerId ?? ""),
          model: String(body.model ?? ""),
          wasTruncated: Boolean(body.wasTruncated),
        });
        return;
      }

      if (res.status === 207) {
        setResult({
          markdown: String(body.markdown ?? ""),
          creditCost: Number(body.creditCost ?? 0),
          providerId: String(body.providerId ?? ""),
          model: String(body.model ?? ""),
          wasTruncated: Boolean(body.wasTruncated),
          persistWarning:
            typeof body.detail === "string"
              ? body.detail
              : "Comparison generated, but couldn't be saved to your files. Copy it below before leaving.",
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
          : "Compare failed — check your connection and try again."
      );
    } finally {
      setBusy(false);
    }
  };

  const bothReady = Boolean(pdfA && pdfB);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Dual-slot row. On narrow screens the grid collapses to a stack. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        <SideSlot
          label="ORIGINAL"
          helper="The “before” version — what things used to say."
          file={pdfA}
          busy={busy}
          onPick={addA}
          onClear={() => setPdfA(null)}
        />
        <SideSlot
          label="REVISED"
          helper="The “after” version — what they say now."
          file={pdfB}
          busy={busy}
          onPick={addB}
          onClear={() => setPdfB(null)}
        />
      </div>

      {bothReady && (
        <CreditEstimateBadge
          op="compare"
          pageCount={1}
          opLabel="this comparison"
        />
      )}

      {error && (
        // 2026-05-03 plan §9 — branch on insufficient-credits.
        isInsufficientCreditsError(error) ? (
          <OutOfCreditsAlert
            required={parseRequiredFromError(error)}
            balance={parseBalanceFromError(error)}
            opLabel="this comparison"
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
        {(pdfA || pdfB) && (
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
            Sign in to compare
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !bothReady}
            onClick={run}
          >
            {busy ? "Comparing…" : "Compare"}
          </button>
        )}
      </div>
    </div>
  );
}

/** One labeled dropzone slot — either empty (shows dropzone) or filled
 *  (shows file chip with a clear button). Visual parity across both
 *  sides so the user's eye can scan A-vs-B quickly. */
function SideSlot({
  label,
  helper,
  file,
  busy,
  onPick,
  onClear,
}: {
  label: string;
  helper: string;
  file: File | null;
  busy: boolean;
  onPick: (files: File[]) => void;
  onClear: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        className="eyebrow"
        style={{
          fontSize: 11,
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      {!file ? (
        <ToolDropzone
          onFiles={onPick}
          prompt={`Drop ${label === "ORIGINAL" ? "the original" : "the revised"} PDF`}
          hint={helper + " Up to 25 MB."}
          disabled={busy}
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
            aria-label={`Remove ${label.toLowerCase()}`}
            disabled={busy}
            onClick={onClear}
            style={{ padding: 6, color: "var(--fg-subtle)" }}
          >
            <I.X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

/** ------------------------------------------------------------------ */

function ResultCard({ result }: { result: CompareResult }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — silent fall-through.
    }
  };

  const download = () => {
    downloadBytes(result.markdown, result.filename || `comparison.md`, "text/markdown;charset=utf-8");
  };

  const pageSummary = (() => {
    const a = result.originalPageCount;
    const b = result.revisedPageCount;
    if (typeof a !== "number" || typeof b !== "number") return null;
    return `${a} / ${b} pages`;
  })();

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
            <I.Check size={16} />
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 14 }}>
            {result.persistWarning
              ? "Comparison generated (not saved)"
              : "Comparison ready"}
          </div>
          <div className="subtle" style={{ fontSize: 12 }}>
            {pageSummary ? `${pageSummary} · ` : ""}
            {result.creditCost} credit
            {result.creditCost === 1 ? "" : "s"} spent
            {typeof result.newBalance === "number"
              ? ` · ${result.newBalance} left`
              : ""}
            {result.wasTruncated ? " · truncated (very long pair)" : ""}
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

      {/* Rendered markdown */}
      <div
        className="prose-mini"
        style={{ padding: "20px 22px", fontSize: 14, lineHeight: 1.65 }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(result.markdown) }}
      />    </div>
  );
}

/** ------------------------------------------------------------------ */

function mapErrorBody(
  status: number,
  body: Record<string, unknown>
): string {
  // Shared AI-degradation band (401 / 429 / 502 / 503). See
  // lib/ai/degradation.ts for the full rationale.
  const degraded = classifyAiError(status, body, {
    opLabel: "the comparator",
  });
  if (degraded.kind !== "unknown") return degraded.userMessage;

  const code = typeof body.error === "string" ? body.error : "";
  const detail = typeof body.detail === "string" ? body.detail : "";
  const which = typeof body.which === "string" ? body.which : "";

  const sideLabel = (w: string): string => {
    if (w === "pdfA") return "original";
    if (w === "pdfB") return "revised";
    if (w === "both") return "both";
    return "";
  };

  switch (status) {
    case 402: {
      const required = typeof body.required === "number" ? body.required : 15;
      const balance = typeof body.balance === "number" ? body.balance : 0;
      const cap = body.capExceeded === true ? " [trial-cap]" : ""; return `Not enough credits — this comparison costs ${required}, you have ${balance}. Top up on /app/billing.${cap}`;
    }
    case 409:
      return (
        detail ||
        "This request is already in flight or has been processed. Check /app/files for the result."
      );
    case 413: {
      const side = sideLabel(which);
      if (side === "original" || side === "revised") {
        return `The ${side} PDF is too large — each side accepts up to 25 MB.`;
      }
      return "PDF is too large — each side accepts up to 25 MB.";
    }
    case 422:
      if (code === "no_extractable_text") {
        const side = sideLabel(which);
        if (side === "both") {
          return (
            detail ||
            "Neither PDF has extractable text — both look scanned. OCR is coming soon."
          );
        }
        if (side === "original" || side === "revised") {
          return (
            detail ||
            `The ${side} PDF looks scanned with no extractable text. OCR is coming soon.`
          );
        }
        return (
          detail ||
          "We couldn't find text in one of the PDFs — it looks scanned. OCR is coming soon."
        );
      }
      return detail || "Couldn't process this pair of PDFs.";
    case 400:
      return detail || "Those files don't look like valid PDFs.";
    default:
      return detail || `Compare failed (status ${status}).`;
  }
}
