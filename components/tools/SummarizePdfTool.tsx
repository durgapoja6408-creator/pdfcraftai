// SummarizePdfTool — Phase 5.1 client runner.
//
// Pattern mirrors MergePdfTool, but the actual compute happens on the
// server: we POST the PDF to /api/ai/summarize and render the returned
// markdown inline. Why server-side?
//   - We're calling an AI provider with a private key; those calls have
//     to go through our own backend.
//   - We debit credits from the authed user's balance — only the server
//     can enforce that.
//   - PDF text extraction runs against pdfjs-dist's legacy Node build
//     (same extraction path as /api/ai/chat).
//
// Credit lifecycle (mirrored from the route header):
//   1. User clicks Summarize → we POST.
//   2. Server spends 3 credits up-front via idempotency key.
//   3. Server extracts text, calls the provider, saves files + ai_outputs.
//   4. Server returns markdown + new balance on 200.
//
// Error handling — the route maps provider errors to REST statuses; we
// map those back to human messages below. On 402 we show the balance
// and an upgrade link; on 409 we tell the user to check /app/files; on
// 422 (no extractable text) we suggest OCR (which will land in 5.2).
// On 207 we *still* show the markdown — compute succeeded, only the
// persistence step failed, so the result is real and copyable.

"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { classifyAiError } from "@/lib/ai/degradation";
import { useSession, getSession } from "next-auth/react";
import { I } from "@/components/icons/Icons";
// 2026-05-03 plan §9 (Day 6.5) — conversion-focused alert when 402
// insufficient_credits hits. Reference wire-in for SummarizePdfTool;
// other AI tools can adopt the same 5-line pattern.
import {
  OutOfCreditsAlert,
  isInsufficientCreditsError,
  isCapExceededError,
  parseRequiredFromError,
  parseBalanceFromError,
} from "@/components/upsell/OutOfCreditsAlert";
import { ToolDropzone } from "./ToolDropzone";
// 2026-05-03 plan §5 + Day 2.5 — pre-flight estimate badge.
// Summarize is a flat-cost op; the badge renders once a file is
// picked so the user sees "this run costs N credits" before committing.
import { CreditEstimateBadge } from "@/components/upsell/CreditEstimateBadge";
import { humanSize } from "@/lib/client/pdf-utils";
import { renderMarkdown } from "@/lib/markdown-mini";
import { MacroBar, type MacroBarItem } from "./MacroBar";
import {
  createMacroAction,
  deleteMacroAction,
  listMacrosForToolAction,
} from "@/lib/macro-actions";
import { fetchAiWithRetry } from "@/lib/client/fetch-ai-with-retry";
import { downloadBytes } from "@/lib/client/download";
import { UploadedFilePreview } from "./UploadedFilePreview";

type Depth = "tldr" | "standard" | "detailed";

const TOOL_ID = "ai-summarize";

type SummaryResult = {
  fileId?: string;
  filename?: string;
  markdown: string;
  creditCost: number;
  newBalance?: number;
  pageCount?: number;
  providerId: string;
  model: string;
  wasTruncated: boolean;
  /** Non-empty on 207 — summary generated but couldn't be saved. */
  persistWarning?: string;
};

const DEPTH_OPTIONS: ReadonlyArray<{
  value: Depth;
  label: string;
  hint: string;
}> = [
  {
    value: "tldr",
    label: "TL;DR",
    hint: "One paragraph, ~3 sentences. Fastest.",
  },
  {
    value: "standard",
    label: "Standard",
    hint: "TL;DR + key points + section-by-section.",
  },
  {
    value: "detailed",
    label: "Detailed",
    hint: "Adds notable quotes and open questions.",
  },
];

// Stable URL for the Sign-in CTA + post-login redirect. We pre-encode
// it once so the JSX read sites stay tight. Keep in sync with the
// matching `/tool/ai-summarize` slug in /tool/[id]/page.tsx.
const SIGN_IN_HREF =
  "/login?callbackUrl=" + encodeURIComponent("/tool/ai-summarize");

export function SummarizePdfTool() {
  const router = useRouter();
  // Session-aware gating. We render a Sign-in CTA for anonymous visitors
  // *before* any upload happens — otherwise clicking Run uploads the
  // entire PDF (up to 25 MB) to the server, the server returns 401, and
  // only then do we redirect. On a slow uplink that's a minute+ of
  // wasted bandwidth and a confusing "Summarizing…" spinner. With this
  // gate, anon clicks bounce instantly to /login.
  const { status: sessionStatus } = useSession();
  const isAnonymous = sessionStatus === "unauthenticated";
  const [file, setFile] = useState<File | null>(null);
  const [depth, setDepth] = useState<Depth>("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SummaryResult | null>(null);

  // Phase 6.1 macros — chip row above the depth picker. We lazy-load
  // the list on mount because anonymous visitors get `canSave=false`
  // and an empty list, which collapses the MacroBar to null anyway.
  const [macros, setMacros] = useState<MacroBarItem[]>([]);
  const [canSave, setCanSave] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listMacrosForToolAction({ toolId: TOOL_ID });
      if (cancelled || !res.ok) return;
      setCanSave(res.canSave);
      setMacros(
        res.macros.map((m) => ({ id: m.id, name: m.name, params: m.params }))
      );
    })().catch((err) => {
      // Not fatal — tool still works without macros. Log and move on.
      console.warn("[SummarizePdfTool] load macros failed", err);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The "active" macro is the one whose stored depth matches the
  // current form state exactly. Highlights the chip the user just
  // applied, and collapses to null once they tweak the form.
  const activeMacroId =
    macros.find(
      (m) => typeof m.params.depth === "string" && m.params.depth === depth
    )?.id ?? null;

  const applyMacro = useCallback((m: MacroBarItem) => {
    const d = m.params.depth;
    if (d === "tldr" || d === "standard" || d === "detailed") {
      setDepth(d);
    }
  }, []);

  const saveMacro = useCallback(
    async (name: string) => {
      const res = await createMacroAction({
        toolId: TOOL_ID,
        name,
        params: { depth },
      });
      if (!res.ok) {
        // MacroBar shows the thrown message inline; pick friendly copy.
        if (res.error === "duplicate_name") {
          throw new Error("A macro with that name already exists.");
        }
        if (res.error === "not_authenticated") {
          throw new Error("Sign in to save presets.");
        }
        if (res.error === "invalid_macro") {
          throw new Error("Couldn't save — name or params are invalid.");
        }
        throw new Error("Couldn't save macro. Try again.");
      }
      setMacros((prev) => [
        { id: res.macro.id, name: res.macro.name, params: res.macro.params },
        ...prev,
      ]);
    },
    [depth]
  );

  const deleteMacro = useCallback(async (id: string) => {
    // Optimistic remove — the action is idempotent on the client side
    // (silent-on-miss), so rolling back only matters for transport
    // failures, which we catch and restore.
    setMacros((prev) => {
      const snapshot = prev;
      const next = prev.filter((m) => m.id !== id);
      void (async () => {
        const res = await deleteMacroAction({ id }).catch(() => null);
        if (!res || !res.ok) {
          // Restore if the server-side delete threw. We only replace
          // state if it's still our optimistic version, to avoid
          // clobbering a subsequent save.
          setMacros((curr) =>
            curr.some((m) => m.id === id) ? curr : snapshot
          );
        }
      })();
      return next;
    });
  }, []);

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
      setError("Drop a PDF first.");
      return;
    }

    // Defense-in-depth session probe. The render-time `useSession()`
    // gate above already swaps the Run button for a Sign-in CTA when
    // the user is anonymous, so we'd normally never reach this. But
    // sessions can expire between page load and click, and useSession
    // only refetches on focus/interval. A fresh getSession() costs
    // ~50ms and beats uploading 25 MB only to bounce on a 401. If
    // anon, we redirect *before* any FormData / fetch work.
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
    // same key is ever re-submitted (e.g. double-tap).
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ik-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
      // M20 (#193, 2026-04-29): retry on transient 5xx / network failures.
      // FormData is single-use (consumes the underlying File stream once),
      // so the helper accepts a factory and rebuilds it on each attempt.
      // The same idempotencyKey is reused — server-side ledger unique
      // index dedupes if the first attempt's transaction already landed.
      const res = await fetchAiWithRetry("/api/ai/summarize", {
        bodyFactory: () => {
          const form = new FormData();
          form.append("pdf", file);
          form.append("depth", depth);
          form.append("idempotencyKey", idempotencyKey);
          return form;
        },
      });

      // Parse the body once; every response branch is JSON.
      const body = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (res.ok) {
        // 200 — full success path.
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
          wasTruncated: Boolean(body.wasTruncated),
        });
        return;
      }

      if (res.status === 207) {
        // Compute succeeded, persist failed. Show the markdown so the
        // user doesn't lose the work they paid for.
        setResult({
          markdown: String(body.markdown ?? ""),
          creditCost: Number(body.creditCost ?? 0),
          providerId: String(body.providerId ?? ""),
          model: String(body.model ?? ""),
          wasTruncated: Boolean(body.wasTruncated),
          persistWarning:
            typeof body.detail === "string"
              ? body.detail
              : "Summary generated, but couldn't be saved to your files. Copy it below before leaving.",
        });
        return;
      }

      // Anonymous user → bounce to /login. The render-time gate above
      // and the getSession() probe at the top of run() should catch
      // this earlier (saving the upload), but if the session expired
      // mid-upload the server may still 401 us — handle it gracefully.
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
          : "Summarize failed — check your connection and try again."
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
          prompt="Drop a PDF to summarize"
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
          {/* M18 (#193, 2026-04-29): page-1 preview thumbnail. Lets
              users verify they uploaded the right doc before paying
              credits. The M25 cache means handoff users see this
              instantly; first-time uploads see a brief loading icon. */}
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

      {file && (
        <CreditEstimateBadge
          op="summarize"
          pageCount={1}
          opLabel="this summary"
        />
      )}

      {/* Saved presets (macros) — hidden when anon + empty. */}
      <MacroBar
        macros={macros}
        canSave={canSave}
        disabled={busy}
        activeId={activeMacroId}
        onApply={applyMacro}
        onSave={saveMacro}
        onDelete={deleteMacro}
      />

      {/* Depth selector */}
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
          DEPTH
        </legend>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          {DEPTH_OPTIONS.map((opt) => {
            const selected = depth === opt.value;
            return (
              <label
                key={opt.value}
                className="card"
                style={{
                  position: "relative",
                  padding: 14,
                  cursor: busy ? "not-allowed" : "pointer",
                  borderColor: selected ? "var(--accent)" : "var(--border)",
                  background: selected
                    ? "var(--accent-soft)"
                    : "var(--bg-1)",
                  transition: "background 120ms, border-color 120ms",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                <input
                  type="radio"
                  name="depth"
                  value={opt.value}
                  checked={selected}
                  onChange={() => setDepth(opt.value)}
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
                  style={{
                    fontWeight: 500,
                    fontSize: 14,
                    marginBottom: 2,
                    color: selected ? "var(--accent)" : "var(--fg)",
                  }}
                >
                  {opt.label}
                </div>
                <div className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
                  {opt.hint}
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      {error && (
        // 2026-05-03 plan §9 — branch on insufficient-credits to surface
        // the conversion-focused alert; everything else uses the
        // existing inline error card. Reference wire-in for other tools.
        isInsufficientCreditsError(error) ? (
          <OutOfCreditsAlert
            required={parseRequiredFromError(error)}
            balance={parseBalanceFromError(error)}
            opLabel="this summary"
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
          // Render-time gate for anonymous visitors. A real <Link> (not
          // a button-with-onClick) so right-click → "Open in new tab"
          // works and the destination is visible in the status bar.
          // The callback brings them straight back here post-login.
          <Link
            href={SIGN_IN_HREF}
            className="btn btn-primary"
            title="Sign in to use AI tools — credits are per-user."
          >
            Sign in to summarize
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !file}
            onClick={run}
          >
            {busy ? "Summarizing…" : "Summarize"}
          </button>
        )}
      </div>
    </div>
  );
}

/** ------------------------------------------------------------------ */

function ResultCard({ result }: { result: SummaryResult }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — silent fall-through; the user can still
      // triple-click the rendered markdown.
    }
  };

  const download = () => {
    downloadBytes(result.markdown, result.filename || "summary.md", "text/markdown;charset=utf-8");
  };

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
        borderColor: result.persistWarning ? "var(--amber, #d97706)" : "var(--accent)",
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
            {result.persistWarning ? "Summary generated (not saved)" : "Summary ready"}
          </div>
          <div className="subtle" style={{ fontSize: 12 }}>
            {result.pageCount ? `${result.pageCount} page${result.pageCount === 1 ? "" : "s"} · ` : ""}
            {result.creditCost} credit{result.creditCost === 1 ? "" : "s"} spent
            {typeof result.newBalance === "number" ? ` · ${result.newBalance} left` : ""}
            {result.wasTruncated ? " · truncated (long doc)" : ""}
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

function mapErrorBody(status: number, body: Record<string, unknown>): string {
  const code = typeof body.error === "string" ? body.error : "";
  const detail = typeof body.detail === "string" ? body.detail : "";

  // Task #22 — shared degradation classifier handles the 401 /
  // 429 / 502 / 503 band consistently across every AI tool. We
  // still keep tool-specific branches for 402 / 409 / 413 / 422
  // because those carry domain-specific numbers (required vs
  // balance, file size, OCR suggestion) that the shared layer
  // can't know about.
  const degraded = classifyAiError(status, body, {
    opLabel: "the summarizer",
  });
  if (degraded.kind !== "unknown") return degraded.userMessage;

  switch (status) {
    case 402: {
      const required = typeof body.required === "number" ? body.required : 3;
      const balance = typeof body.balance === "number" ? body.balance : 0;
      const cap = body.capExceeded === true ? " [trial-cap]" : ""; return `Not enough credits — this summary costs ${required}, you have ${balance}. Top up on /app/billing.${cap}`;
    }
    case 409:
      return (
        detail ||
        "This request is already in flight or has been processed. Check /app/files for the result."
      );
    case 413:
      return "PDF is too large — the summarizer accepts up to 25 MB.";
    case 422:
      if (code === "no_extractable_text") {
        return (
          detail ||
          "We couldn't find text in this PDF — it looks scanned. OCR is coming soon; for now, try a text-based PDF."
        );
      }
      return detail || "Couldn't process this PDF.";
    case 400:
      return detail || "That file doesn't look like a valid PDF.";
    default:
      return detail || `Summarize failed (status ${status}).`;
  }
}
