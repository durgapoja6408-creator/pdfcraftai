// RewritePdfTool — Phase 5.6 client runner.
//
// User picks a rewrite mode, we POST the PDF to /api/ai/rewrite, render
// the returned markdown inline. Mirrors SummarizePdfTool / TranslatePdfTool
// in shape:
//
//   - Render-time auth gate (useSession). Anon visitors see a Sign-in
//     CTA instead of the Run button — the PDF is never uploaded before
//     auth. See SummarizePdfTool for the full rationale.
//   - Defense-in-depth getSession() probe inside run() for the rare
//     "session expired between render and click" case.
//   - Idempotency key per submit; matching server-side replay returns
//     the stored markdown without re-charging.
//   - Mode picker for tone/style transforms (simplify/formal/casual/
//     concise/expand). Not yet wired to macros — Phase 6.1 macros are
//     opt-in per tool and we can add the MacroBar later if there's
//     repeat-preset demand.
//
// Macros: NOT included in v1. The translate tool's MacroBar is a good
// template if/when we want to add saved presets here.

"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, getSession } from "next-auth/react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { renderMarkdown } from "@/lib/markdown-mini";

// Keep in sync with VALID_MODES in /api/ai/rewrite/route.ts.
type Mode = "simplify" | "formal" | "casual" | "concise" | "expand";

const MODE_OPTIONS: ReadonlyArray<{
  id: Mode;
  label: string;
  hint: string;
}> = [
  {
    id: "simplify",
    label: "Simplify",
    hint: "Plain English, 8th-grade reading level. Best for legalese or technical docs.",
  },
  {
    id: "formal",
    label: "Formal",
    hint: "Tighten and professionalize. Active voice, no contractions.",
  },
  {
    id: "casual",
    label: "Casual",
    hint: "Conversational, warmer tone. Good for internal docs going customer-facing.",
  },
  {
    id: "concise",
    label: "Concise",
    hint: "Compress to ~60% of source length. Cut filler, keep substance.",
  },
  {
    id: "expand",
    label: "Expand",
    hint: "Elaborate with context and examples. Good for outlines becoming drafts.",
  },
];

type RewriteResult = {
  fileId?: string;
  filename?: string;
  markdown: string;
  creditCost: number;
  newBalance?: number;
  pageCount?: number;
  providerId: string;
  model: string;
  mode: Mode;
  wasTruncated: boolean;
  /** Non-empty on 207 — compute succeeded, persist failed. */
  persistWarning?: string;
};

// Pre-encoded Sign-in CTA target — see SummarizePdfTool for rationale.
const SIGN_IN_HREF =
  "/login?callbackUrl=" + encodeURIComponent("/tool/ai-rewrite");

export function RewritePdfTool() {
  const router = useRouter();
  // Anonymous-user gate — swap Run for Sign-in so the PDF isn't uploaded
  // before the server bounces a 401. See SummarizePdfTool for rationale.
  const { status: sessionStatus } = useSession();
  const isAnonymous = sessionStatus === "unauthenticated";

  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("simplify");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RewriteResult | null>(null);

  const addFiles = useCallback((files: File[]) => {
    setError(null);
    setResult(null);
    setFile(files[0] ?? null);
  }, []);

  const reset = () => {
    setFile(null);
    setError(null);
    setResult(null);
  };

  const run = async () => {
    if (!file) {
      setError("Attach a PDF to rewrite.");
      return;
    }

    // Defense-in-depth session probe — see SummarizePdfTool for detail.
    // Catches the edge case where the session expired between page-load
    // (when useSession last fired) and this click.
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
      const form = new FormData();
      form.append("pdf", file);
      form.append("mode", mode);
      form.append("idempotencyKey", idempotencyKey);

      const res = await fetch("/api/ai/rewrite", {
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
          providerId: String(body.providerId ?? ""),
          model: String(body.model ?? ""),
          mode: (body.mode as Mode | undefined) ?? mode,
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
          mode: (body.mode as Mode | undefined) ?? mode,
          wasTruncated: Boolean(body.wasTruncated),
          persistWarning:
            typeof body.detail === "string"
              ? body.detail
              : "Rewrite generated, but couldn't be saved to your files. Copy it below before leaving.",
        });
        return;
      }

      // Late-401 fallback — render-time gate + getSession() probe should
      // normally catch this earlier, but session expiry mid-upload would
      // land here.
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
          : "Rewrite failed — check your connection and try again."
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
          prompt="Drop a PDF to rewrite"
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

      {/* Mode picker — radio cards. Mirrors SummarizePdfTool's depth picker. */}
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
          REWRITE MODE
        </legend>

        {MODE_OPTIONS.map((opt) => {
          const active = mode === opt.id;
          return (
            <label
              key={opt.id}
              className="card"
              style={{
                display: "flex",
                gap: 12,
                padding: "12px 14px",
                cursor: busy ? "not-allowed" : "pointer",
                borderColor: active ? "var(--accent)" : "var(--border)",
                background: active
                  ? "var(--accent-soft)"
                  : "var(--bg-1)",
              }}
            >
              <input
                type="radio"
                name="rewrite-mode"
                value={opt.id}
                checked={active}
                disabled={busy}
                onChange={() => setMode(opt.id)}
                style={{ marginTop: 3, accentColor: "var(--accent)" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{opt.label}</div>
                <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                  {opt.hint}
                </div>
              </div>
            </label>
          );
        })}
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
        {isAnonymous ? (
          <Link
            href={SIGN_IN_HREF}
            className="btn btn-primary"
            title="Sign in to use AI tools — credits are per-user."
          >
            Sign in to rewrite
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !file}
            onClick={run}
          >
            {busy ? "Rewriting…" : "Rewrite — 3 credits"}
          </button>
        )}
      </div>
    </div>
  );
}

/** ------------------------------------------------------------------ */

function ResultCard({ result }: { result: RewriteResult }) {
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
    const blob = new Blob([result.markdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename || `rewrite-${result.mode}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4_000);
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
            <I.Check size={16} />
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 14 }}>
            {result.persistWarning
              ? `Rewrite generated (not saved) — ${result.mode}`
              : `Rewrite ready — ${result.mode}`}
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

function mapErrorBody(
  status: number,
  body: Record<string, unknown>
): string {
  const code = typeof body.error === "string" ? body.error : "";
  const detail = typeof body.detail === "string" ? body.detail : "";

  switch (status) {
    case 401:
      return "Sign in to rewrite PDFs — credits are per-user.";
    case 402: {
      const required = typeof body.required === "number" ? body.required : 3;
      const balance = typeof body.balance === "number" ? body.balance : 0;
      return `Not enough credits — this rewrite costs ${required}, you have ${balance}. Top up on /app/billing.`;
    }
    case 409:
      return (
        detail ||
        "This request is already in flight or has been processed. Check /app/files for the result."
      );
    case 413:
      return "PDF is too large — the rewriter accepts up to 25 MB.";
    case 422:
      if (code === "no_extractable_text") {
        return (
          detail ||
          "We couldn't find text in this PDF — it looks scanned. Run OCR first, then try again."
        );
      }
      return detail || "Couldn't process this PDF.";
    case 400:
      if (detail.toLowerCase().includes("mode")) {
        return detail;
      }
      return detail || "That file doesn't look like a valid PDF.";
    case 502:
      return (
        detail ||
        "The AI provider errored — we've refunded your credits. Try again in a moment."
      );
    case 503:
      return "No AI provider is configured on this deployment. Ask the admin to set ANTHROPIC_API_KEY or OPENAI_API_KEY.";
    default:
      return detail || `Rewrite failed (status ${status}).`;
  }
}
