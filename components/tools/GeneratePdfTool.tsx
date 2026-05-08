// GeneratePdfTool — Phase 5.6 client runner for the prompt-to-PDF tool.
//
// Differs from RewritePdfTool / SummarizePdfTool in one key way: there's
// no file attachment. The input is a text prompt. Everything else mirrors
// the established pattern:
//
//   - Render-time auth gate (useSession) — anon visitors see "Sign in
//     to generate" instead of the Run button. No prompt is submitted
//     before auth.
//   - Defense-in-depth getSession() probe inside run() for the rare
//     "session expired between render and click" case.
//   - Idempotency key per submit; matching server-side replay returns
//     the stored markdown (replays don't include the PDF bytes — the
//     user needs to re-run to get another PDF download).
//
// The route returns a base64 PDF we decode to a Blob + download via an
// object URL. The markdown source is also returned for inline preview
// and copy/download.

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
import { renderMarkdown } from "@/lib/markdown-mini";
import { classifyAiError } from "@/lib/ai/degradation";
import { useTrackToolView } from "./useToolTracking";
import { fetchAiWithRetry } from "@/lib/client/fetch-ai-with-retry";
// 2026-05-03 plan §5 + Day 2.5 — pre-flight estimate badge.
// Generate is prompt-only (no file). We pass charCount = trimmed prompt
// length so the badge surfaces only when there's a real query to run.
import { CreditEstimateBadge } from "@/components/upsell/CreditEstimateBadge";
import { FeedbackChip } from "@/components/feedback/FeedbackChip";
import { downloadBytes } from "@/lib/client/download";
import { GeneratedPdfPreview } from "./GeneratedPdfPreview";

// Keep in sync with VALID_DOC_TYPES / VALID_LENGTHS / VALID_TONES in the
// route handler.
type DocType = "memo" | "report" | "brief" | "letter" | "blog" | "outline" | "other";
type Length = "short" | "medium" | "long";
type Tone = "neutral" | "formal" | "casual" | "technical";

const DOC_TYPE_OPTIONS: ReadonlyArray<{ id: DocType; label: string }> = [
  { id: "other", label: "Other / auto" },
  { id: "memo", label: "Memo" },
  { id: "report", label: "Report" },
  { id: "brief", label: "Brief" },
  { id: "letter", label: "Business letter" },
  { id: "blog", label: "Blog post" },
  { id: "outline", label: "Outline" },
];

const LENGTH_OPTIONS: ReadonlyArray<{
  id: Length;
  label: string;
  hint: string;
}> = [
  { id: "short", label: "Short", hint: "~300–500 words" },
  { id: "medium", label: "Medium", hint: "~800–1,200 words" },
  { id: "long", label: "Long", hint: "~1,500–3,000 words" },
];

const TONE_OPTIONS: ReadonlyArray<{ id: Tone; label: string }> = [
  { id: "neutral", label: "Neutral" },
  { id: "formal", label: "Formal" },
  { id: "casual", label: "Casual" },
  { id: "technical", label: "Technical" },
];

type GenerateResult = {
  fileId?: string;
  filename?: string;
  pdfBase64: string | null;
  pdfFilename: string | null;
  markdown: string;
  creditCost: number;
  newBalance?: number;
  pageCount?: number;
  providerId: string;
  model: string;
  title: string;
  docType: DocType;
  length: Length;
  tone: Tone;
  wasTruncated: boolean;
  /** True on replay — route returns markdown but no PDF bytes. */
  replay?: boolean;
  /** Non-empty on 207 — compute succeeded, persist failed. */
  persistWarning?: string;
  /**
   * 2026-05-04 (PENDING §6b stage 3 / Generate). FeedbackChip flip-
   * semantics dependency from generate route.ts (Batch 2
   * instrumentation, commit 37b6573).
   */
  aiUsageId: string | null;
};

const SIGN_IN_HREF =
  "/login?callbackUrl=" + encodeURIComponent("/tool/ai-generate");

export function GeneratePdfTool() {
  useTrackToolView("ai-generate", "AI");
  const router = useRouter();
  // Anonymous-user gate — see SummarizePdfTool for the full rationale.
  const { status: sessionStatus } = useSession();
  const isAnonymous = sessionStatus === "unauthenticated";

  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<DocType>("other");
  const [length, setLength] = useState<Length>("medium");
  const [tone, setTone] = useState<Tone>("neutral");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  // Item #5 sweep — retry-status UX (mirrors SummarizePdfTool canary)
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [retryMax, setRetryMax] = useState(0);

  const reset = useCallback(() => {
    setPrompt("");
    setTitle("");
    setDocType("other");
    setLength("medium");
    setTone("neutral");
    setError(null);
    setResult(null);
  }, []);

  const run = async () => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) {
      setError("Describe what you want generated.");
      return;
    }

    // Defense-in-depth session probe.
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
      // M20 part 2 (#193): retry on transient 5xx / network failures.
      // JSON body — re-stringify per attempt for parity with FormData
      // tools (also free; the inputs don't change between attempts).
      const res = await fetchAiWithRetry("/api/ai/generate", {
        headers: { "Content-Type": "application/json" },
        bodyFactory: () =>
          JSON.stringify({
            prompt: trimmed,
            title: title.trim() || undefined,
            docType,
            length,
            tone,
            idempotencyKey,
          }),
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
          pdfBase64:
            typeof body.pdfBase64 === "string" ? body.pdfBase64 : null,
          pdfFilename:
            typeof body.pdfFilename === "string" ? body.pdfFilename : null,
          markdown: String(body.markdown ?? ""),
          creditCost: Number(body.creditCost ?? 0),
          newBalance:
            typeof body.newBalance === "number" ? body.newBalance : undefined,
          pageCount:
            typeof body.pageCount === "number" ? body.pageCount : undefined,
          providerId: String(body.providerId ?? ""),
          model: String(body.model ?? ""),
          title: String(body.title ?? (title.trim() || "Generated document")),
          docType: (body.docType as DocType | undefined) ?? docType,
          length: (body.length as Length | undefined) ?? length,
          tone: (body.tone as Tone | undefined) ?? tone,
          wasTruncated: Boolean(body.wasTruncated),
          replay: Boolean(body.replay),
          aiUsageId:
            typeof body.aiUsageId === "string" ? body.aiUsageId : null,
        });
        return;
      }

      if (res.status === 207) {
        setResult({
          pdfBase64:
            typeof body.pdfBase64 === "string" ? body.pdfBase64 : null,
          pdfFilename:
            typeof body.pdfFilename === "string" ? body.pdfFilename : null,
          markdown: String(body.markdown ?? ""),
          creditCost: Number(body.creditCost ?? 0),
          providerId: String(body.providerId ?? ""),
          model: String(body.model ?? ""),
          title: String(body.title ?? (title.trim() || "Generated document")),
          docType: (body.docType as DocType | undefined) ?? docType,
          length: (body.length as Length | undefined) ?? length,
          tone: (body.tone as Tone | undefined) ?? tone,
          wasTruncated: Boolean(body.wasTruncated),
          persistWarning:
            typeof body.detail === "string"
              ? body.detail
              : "PDF generated, but the source couldn't be saved to your files. Download it below before leaving.",
          aiUsageId:
            typeof body.aiUsageId === "string" ? body.aiUsageId : null,
        });
        return;
      }

      // Late-401 fallback.
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
          : "Generation failed — check your connection and try again."
      );
    } finally {
      setBusy(false);
      setRetryAttempt(0);
      setRetryMax(0);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Title input (optional) */}
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          className="eyebrow"
          style={{ fontSize: 11, letterSpacing: "0.08em" }}
        >
          TITLE (OPTIONAL)
        </span>
        <input
          type="text"
          className="input"
          placeholder="e.g., Q3 Product Launch Brief"
          value={title}
          maxLength={120}
          disabled={busy}
          onChange={(e) => setTitle(e.target.value)}
          style={{ padding: "10px 12px", fontSize: 14 }}
        />
      </label>

      {/* Prompt textarea */}
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          className="eyebrow"
          style={{ fontSize: 11, letterSpacing: "0.08em" }}
        >
          PROMPT
        </span>
        <textarea
          className="input"
          placeholder="Describe what you want us to write. Include audience, key points, and any constraints."
          rows={8}
          value={prompt}
          maxLength={16_000}
          disabled={busy}
          onChange={(e) => setPrompt(e.target.value)}
          style={{
            padding: "12px 14px",
            fontSize: 14,
            lineHeight: 1.55,
            resize: "vertical",
            minHeight: 140,
            fontFamily: "inherit",
          }}
        />
        <span
          className="subtle"
          style={{ fontSize: 11, textAlign: "right" }}
        >
          {prompt.length.toLocaleString()} / 16,000
        </span>
      </label>

      {/* Parameter grid — doc type + tone + length on one row when wide. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            className="eyebrow"
            style={{ fontSize: 11, letterSpacing: "0.08em" }}
          >
            FORMAT
          </span>
          <select
            className="input"
            value={docType}
            disabled={busy}
            onChange={(e) => setDocType(e.target.value as DocType)}
            style={{ padding: "10px 12px", fontSize: 14 }}
          >
            {DOC_TYPE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            className="eyebrow"
            style={{ fontSize: 11, letterSpacing: "0.08em" }}
          >
            LENGTH
          </span>
          <select
            className="input"
            value={length}
            disabled={busy}
            onChange={(e) => setLength(e.target.value as Length)}
            style={{ padding: "10px 12px", fontSize: 14 }}
          >
            {LENGTH_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label} — {o.hint}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            className="eyebrow"
            style={{ fontSize: 11, letterSpacing: "0.08em" }}
          >
            TONE
          </span>
          <select
            className="input"
            value={tone}
            disabled={busy}
            onChange={(e) => setTone(e.target.value as Tone)}
            style={{ padding: "10px 12px", fontSize: 14 }}
          >
            {TONE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        // 2026-05-03 plan §9 — branch on insufficient-credits.
        isInsufficientCreditsError(error) ? (
          <OutOfCreditsAlert
            required={parseRequiredFromError(error)}
            balance={parseBalanceFromError(error)}
            opLabel="generating this PDF"
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

      {prompt.trim().length >= 10 && !result && (
        <CreditEstimateBadge
          op="generate"
          charCount={prompt.trim().length}
          opLabel="this generation"
        />
      )}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {(prompt.length > 0 || result) && (
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
            Sign in to generate
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || prompt.trim().length === 0}
            onClick={run}
            aria-busy={busy}
          >
            {/* Bundle G5: lib/tools.ts canonical "~20 credits per doc" — preserve the
                ~ marker so users know this is an estimate, not exact. */}
            {retryAttempt > 0
              ? `Retrying… (${retryAttempt}/${retryMax})`
              : busy
                ? "Generating…"
                : "Generate PDF"}
          </button>
        )}
      </div>
    </div>
  );
}

/** ------------------------------------------------------------------ */

function ResultCard({ result }: { result: GenerateResult }) {
  const [copied, setCopied] = useState(false);

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(result.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — silent fall-through.
    }
  };

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
            <I.Generate size={16} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 500,
              fontSize: 14,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {result.persistWarning
              ? `Generated (not saved) — ${result.title}`
              : `Generated — ${result.title}`}
          </div>
          <div className="subtle" style={{ fontSize: 12 }}>
            {result.pageCount
              ? `${result.pageCount} page${result.pageCount === 1 ? "" : "s"} · `
              : ""}
            {result.docType} · {result.length} · {result.tone}
            {" · "}
            {result.creditCost} credit{result.creditCost === 1 ? "" : "s"} spent
            {typeof result.newBalance === "number"
              ? ` · ${result.newBalance} left`
              : ""}
            {result.wasTruncated ? " · truncated (hit length cap)" : ""}
          </div>
        </div>
        <DownloadPdfButton result={result} />
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={copyMarkdown}
          title="Copy markdown source"
        >
          <I.Copy size={14} />
          <span>{copied ? "Copied" : "Copy md"}</span>
        </button>
        {result.fileId && (
          <Link
            href={`/app/files/${result.fileId}/preview`}
            className="btn btn-sm btn-ghost"
            title="View saved markdown"
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

      {result.replay && !result.pdfBase64 && (
        <div
          style={{
            padding: "10px 18px",
            fontSize: 13,
            color: "var(--fg-muted)",
            background: "var(--bg-2)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          This is a replay of an earlier generation — the original PDF isn't
          stored on our servers. Re-run the generator to download a fresh PDF.
          The markdown source below is the same one we delivered before.
        </div>
      )}

      {/* Item #10 — page-1 preview of the generated PDF. Renders
          inline above the markdown so the user sees the visual
          result BEFORE clicking Download. Bracketed with the
          UploadedFilePreview pattern: upload preview before the
          credit spend, generated preview after. */}
      {result.pdfBase64 && (
        <div
          style={{
            padding: "16px 22px",
            display: "flex",
            justifyContent: "center",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-1)",
          }}
        >
          <GeneratedPdfPreview base64={result.pdfBase64} />
        </div>
      )}

      {/* Rendered markdown preview */}
      <div
        className="prose-mini"
        style={{ padding: "20px 22px", fontSize: 14, lineHeight: 1.65 }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(result.markdown) }}
      />

      {/* 2026-05-04 (PENDING §6b stage 3 / Generate) — FeedbackChip
          flywheel; generate route surfaces aiUsageId since Batch 2.
          Placement is after the markdown preview and after the
          download button; gives the user a chance to evaluate the
          output before rating. */}
      <div
        style={{
          padding: "12px 22px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-2, rgba(0,0,0,0.02))",
        }}
      >
        <FeedbackChip
          operation="generate"
          aiUsageId={result.aiUsageId}
          fileId={result.fileId ?? null}
          providerId={result.providerId}
          model={result.model}
        />
      </div>
    </div>
  );
}

function DownloadPdfButton({ result }: { result: GenerateResult }) {
  if (!result.pdfBase64) {
    return null;
  }
  const handleDownload = () => {
    try {
      const binary = atob(result.pdfBase64!);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      downloadBytes(bytes, result.pdfFilename || `${result.title}.pdf`);
    } catch (err) {
      console.error("Download failed", err);
    }
  };
  return (
    <button
      type="button"
      className="btn btn-sm btn-primary"
      onClick={handleDownload}
      title="Download the generated PDF"
    >
      <I.Download size={14} />
      <span>Download PDF</span>
    </button>
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
    opLabel: "the generator",
  });
  if (degraded.kind !== "unknown") return degraded.userMessage;

  const code = typeof body.error === "string" ? body.error : "";
  const detail = typeof body.detail === "string" ? body.detail : "";

  switch (status) {
    case 402: {
      const required = typeof body.required === "number" ? body.required : 20;
      const balance = typeof body.balance === "number" ? body.balance : 0;
      const cap = body.capExceeded === true ? " [trial-cap]" : ""; return `Not enough credits — this generation costs ${required}, you have ${balance}. Top up on /app/billing.${cap}`;
    }
    case 409:
      return (
        detail ||
        "This request is already in flight or has been processed. Check /app/files for the result."
      );
    case 413:
      if (code === "prompt_too_long") {
        const maxChars =
          typeof body.maxChars === "number" ? body.maxChars : 16_000;
        return `Prompt is too long — cap is ${maxChars.toLocaleString()} characters.`;
      }
      return "Payload too large.";
    case 400:
      return detail || "Couldn't understand the request.";
    default:
      return detail || `Generation failed (status ${status}).`;
  }
}
