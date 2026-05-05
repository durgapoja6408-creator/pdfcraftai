"use client";

// StructuredVariantTool — Tier 2 §2.4 structured-output variants.
//
// Same auth / idempotency / error-mapping flow as
// SummarizeVariantTool, but the backend returns JSON inside a
// ```json fenced code block and this component parses + renders
// the parsed data (flashcards as cards, quiz as MCQ with reveal).
//
// Deliberately a separate component from SummarizeVariantTool
// because:
//   - The rendered UI is structurally different (cards / MCQ
//     widgets, not markdown prose).
//   - Each variant has its own export format (Anki CSV for
//     flashcards, JSON-for-quiz-runners for quiz).
//   - Sharing the auth/post flow via a copy keeps the surface
//     simple; extracting a hook would save ~50 lines but add
//     one more abstraction layer in code that's already shipping
//     fine.

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { classifyAiError } from "@/lib/ai/degradation";
import { useSession, getSession } from "next-auth/react";
import { I } from "@/components/icons/Icons";
// 2026-05-03 plan §9 — Day 6.5 wire-in. Same pattern as the
// SummarizeVariantTool wrapper.
import {
  OutOfCreditsAlert,
  isInsufficientCreditsError,
  parseRequiredFromError,
  parseBalanceFromError,
} from "@/components/upsell/OutOfCreditsAlert";
import { ToolDropzone } from "./ToolDropzone";
import {
  deriveOutputName,
  humanSize,
  sha256HexOfBytes,
} from "@/lib/client/pdf-utils";
import { downloadBytes } from "@/lib/client/download";
import { logToolResultAction } from "@/lib/tool-result-actions";
import { useToolTracking } from "./useToolTracking";
import { mapPdfOpError } from "@/lib/pdf/error-messages";
import { fetchAiWithRetry } from "@/lib/client/fetch-ai-with-retry";
import { UploadedFilePreview } from "./UploadedFilePreview";
// 2026-05-04 (PENDING §6b Stage 3 batch B) — chip on flashcards + quiz.
// StructuredVariantTool also routes through /api/ai/summarize, so
// operation="summarize" matches what recordAiUsage persists.
import { FeedbackChip } from "@/components/feedback/FeedbackChip";

type Flashcard = { q: string; a: string; page: number };
type QuizItem = {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  page: number;
};

type Mode = "flashcards" | "quiz";

// Extract the JSON payload from the LLM's markdown-with-```json
// fence. If the model occasionally omits the fence (it shouldn't
// with our instructions, but resilience matters), we fall back to
// the first `[` to the last `]` substring.
function extractJsonArray(markdown: string): unknown[] | null {
  const fence = markdown.match(/```json\s*([\s\S]*?)\s*```/);
  const raw = fence ? fence[1] : null;
  let text = raw;
  if (!text) {
    const first = markdown.indexOf("[");
    const last = markdown.lastIndexOf("]");
    if (first !== -1 && last > first) {
      text = markdown.slice(first, last + 1);
    }
  }
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function asFlashcards(arr: unknown[]): Flashcard[] {
  const out: Flashcard[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.q !== "string" || typeof r.a !== "string") continue;
    out.push({
      q: r.q,
      a: r.a,
      page: typeof r.page === "number" ? r.page : 0,
    });
  }
  return out;
}

function asQuizItems(arr: unknown[]): QuizItem[] {
  const out: QuizItem[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.question !== "string") continue;
    if (!Array.isArray(r.options) || r.options.length !== 4) continue;
    const opts = r.options.filter((o): o is string => typeof o === "string");
    if (opts.length !== 4) continue;
    if (typeof r.correct !== "number" || r.correct < 0 || r.correct > 3) continue;
    out.push({
      question: r.question,
      options: opts,
      correct: r.correct,
      explanation: typeof r.explanation === "string" ? r.explanation : "",
      page: typeof r.page === "number" ? r.page : 0,
    });
  }
  return out;
}

function escCsv(s: string): string {
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export function StructuredVariantTool(props: {
  mode: Mode;
  toolId: string;
  callbackUrl: string;
  depth: "flashcards" | "quiz";
  prompt: string;
  runLabel: string;
  busyLabel: string;
  successTitle: string;
  pricingBlurb: string;
}) {
  const router = useRouter();
  const { status } = useSession();
  const trackTool = useToolTracking(props.toolId, "AI");
  useEffect(() => trackTool.view(), [trackTool]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[] | null>(null);
  const [quizItems, setQuizItems] = useState<QuizItem[] | null>(null);
  const [meta, setMeta] = useState<{
    creditCost: number;
    newBalance?: number;
    fileId?: string;
    rawMarkdown: string;
    // 2026-05-04 (PENDING §6b Stage 3 batch B) — provenance for the
    // FeedbackChip rendered next to the flashcards / quiz cards.
    aiUsageId?: string | null;
    providerId?: string;
    model?: string;
  } | null>(null);

  const onFiles = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setFlashcards(null);
    setQuizItems(null);
    setMeta(null);
    setFile(f);
    trackTool.upload(f);
  }, [trackTool]);

  const reset = () => {
    setFile(null);
    setError(null);
    setFlashcards(null);
    setQuizItems(null);
    setMeta(null);
  };

  const run = async () => {
    if (!file) {
      setError("Drop a PDF first.");
      return;
    }
    const fresh = await getSession();
    if (!fresh?.user) {
      trackTool.signupRedirect(props.callbackUrl);
      router.push(`/login?callbackUrl=${encodeURIComponent(props.callbackUrl)}`);
      return;
    }
    setBusy(true);
    setError(null);
    setFlashcards(null);
    setQuizItems(null);
    setMeta(null);

    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ik-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

    try {
      const res = await fetchAiWithRetry("/api/ai/summarize", {
        // M20 (#193): retry on transient 5xx / network failures.
        // FormData is single-use; rebuild it on each attempt.
        bodyFactory: () => {
          const form = new FormData();
          form.append("pdf", file);
          form.append("depth", props.depth);
          form.append("idempotencyKey", idempotencyKey);
          return form;
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const processingMs = Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0,
      );

      if (res.ok || res.status === 207) {
        const markdown = String(body.markdown ?? "");
        const parsed = extractJsonArray(markdown);
        if (!parsed) {
          setError(
            "The AI returned output in an unexpected format. This usually resolves on retry."
          );
          trackTool.error({ errorCode: "parse_failed", depth: props.depth });
          return;
        }
        if (props.mode === "flashcards") {
          const cards = asFlashcards(parsed);
          if (cards.length === 0) {
            setError("No valid flashcards returned. Try a text-heavier PDF.");
            trackTool.error({ errorCode: "no_items_returned", depth: props.depth });
            return;
          }
          setFlashcards(cards);
        } else {
          const items = asQuizItems(parsed);
          if (items.length === 0) {
            setError("No valid quiz items returned. Try a text-heavier PDF.");
            trackTool.error({ errorCode: "no_items_returned", depth: props.depth });
            return;
          }
          setQuizItems(items);
        }
        const credit = Number(body.creditCost ?? 0);
        setMeta({
          creditCost: credit,
          newBalance: typeof body.newBalance === "number" ? body.newBalance : undefined,
          fileId: typeof body.fileId === "string" ? body.fileId : undefined,
          rawMarkdown: markdown,
          aiUsageId: typeof body.aiUsageId === "string" ? body.aiUsageId : null,
          providerId: typeof body.providerId === "string" ? body.providerId : undefined,
          model: typeof body.model === "string" ? body.model : undefined,
        });
        trackTool.success({ creditCost: credit, depth: props.depth, processingMs });
        return;
      }
      const classified = classifyAiError(res.status, body);
      setError(
        "userMessage" in classified
          ? classified.userMessage
          : "Something went wrong. Try again in a moment."
      );
      trackTool.error({ errorCode: `http_${res.status}`, depth: props.depth });
    } catch (err) {
      console.error(err);
      setError(mapPdfOpError(err instanceof Error ? err.message : "Request failed."));
      trackTool.error({ errorCode: "network_error", depth: props.depth });
    } finally {
      setBusy(false);
    }
  };

  const downloadFlashcardsCsv = async () => {
    if (!flashcards) return;
    // Anki import-friendly: just two columns, no header (Anki prefers
    // headerless by default; users can import with "first column =
    // front, second = back").
    const rows = flashcards.map((c) => `${escCsv(c.q)},${escCsv(c.a)}`);
    const bytes = new TextEncoder().encode(rows.join("\n") + "\n");
    const name = deriveOutputName(file?.name ?? "flashcards.pdf", "-flashcards").replace(
      /\.pdf$/i,
      ".csv"
    );
    downloadBytes(bytes, name, "text/csv;charset=utf-8");
    try {
      const sha256 = await sha256HexOfBytes(bytes);
      await logToolResultAction({
        toolId: "ai-flashcards",
        name,
        mime: "text/csv",
        sizeBytes: bytes.length,
        sha256,
      });
    } catch (e) {
      console.warn(e);
    }
  };

  const downloadQuizJson = async () => {
    if (!quizItems) return;
    const bytes = new TextEncoder().encode(JSON.stringify(quizItems, null, 2));
    const name = deriveOutputName(file?.name ?? "quiz.pdf", "-quiz").replace(
      /\.pdf$/i,
      ".json"
    );
    downloadBytes(bytes, name, "application/json");
    try {
      const sha256 = await sha256HexOfBytes(bytes);
      await logToolResultAction({
        toolId: "ai-quiz",
        name,
        mime: "application/json",
        sizeBytes: bytes.length,
        sha256,
      });
    } catch (e) {
      console.warn(e);
    }
  };

  const signedOut = status !== "loading" && status !== "authenticated";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone onFiles={onFiles} disabled={busy} prompt={props.prompt} />
      ) : (
        <div
          className="card"
          style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center" }}
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
            <div className="subtle" style={{ fontSize: 12 }}>{humanSize(file.size)}</div>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={reset} aria-label="Remove file">
            <I.X size={14} />
          </button>
        </div>
      )}

      {/* Bundle E (2026-04-26): pricingBlurb panel removed — see
          SummarizeVariantTool.tsx for the full rationale. The text now
          renders once at the top of the runner page via TOOL_INTROS. */}

      {error && (
        // 2026-05-03 plan §9 — branch on insufficient-credits.
        isInsufficientCreditsError(error) ? (
          <OutOfCreditsAlert
            required={parseRequiredFromError(error)}
            balance={parseBalanceFromError(error)}
            opLabel={`this ${props.runLabel.toLowerCase()} run`}
          />
        ) : (
          <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>
            {error}
          </p>
        )
      )}

      {flashcards && (
        <div className="card" style={{ padding: 20, borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
          <div className="row" style={{ gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--accent)", color: "var(--bg-1)", display: "grid", placeItems: "center" }}>
              <I.Check size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15 }}>{flashcards.length} flashcards ready</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {meta?.creditCost} credits used
                {typeof meta?.newBalance === "number" && ` · ${meta.newBalance} left`}
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={downloadFlashcardsCsv}>
              <I.Download size={14} />
              <span>Download Anki CSV</span>
            </button>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {flashcards.map((c, i) => (
              <details
                key={i}
                style={{
                  padding: "8px 12px",
                  background: "var(--bg-1)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  fontSize: 13,
                }}
              >
                <summary style={{ cursor: "pointer", fontWeight: 500 }}>
                  {c.q}{" "}
                  <span className="subtle" style={{ fontWeight: 400, fontSize: 11 }}>p.{c.page}</span>
                </summary>
                <div style={{ marginTop: 8, color: "var(--fg)", lineHeight: 1.5 }}>
                  {c.a}
                </div>
              </details>
            ))}
          </div>
          {/* 2026-05-04 (PENDING §6b Stage 3 batch B) — chip on flashcards card */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 12,
              borderTop: "1px solid var(--border)",
            }}
          >
            <FeedbackChip
              operation="summarize"
              aiUsageId={meta?.aiUsageId ?? null}
              fileId={meta?.fileId ?? null}
              providerId={meta?.providerId}
              model={meta?.model}
            />
          </div>
        </div>
      )}

      {quizItems && (
        <div className="card" style={{ padding: 20, borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
          <div className="row" style={{ gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--accent)", color: "var(--bg-1)", display: "grid", placeItems: "center" }}>
              <I.Check size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15 }}>{quizItems.length}-question quiz ready</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {meta?.creditCost} credits used
                {typeof meta?.newBalance === "number" && ` · ${meta.newBalance} left`}
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={downloadQuizJson}>
              <I.Download size={14} />
              <span>Download JSON</span>
            </button>
          </div>
          <ol style={{ display: "grid", gap: 12, paddingLeft: 22, margin: 0 }}>
            {quizItems.map((q, i) => (
              <li key={i} style={{ fontSize: 13, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 500 }}>
                  {q.question}{" "}
                  <span className="subtle" style={{ fontWeight: 400, fontSize: 11 }}>p.{q.page}</span>
                </div>
                <ol
                  style={{
                    marginTop: 4,
                    display: "grid",
                    gap: 2,
                    paddingLeft: 0,
                    listStyle: "none",
                  }}
                >
                  {q.options.map((opt, optIdx) => (
                    <li
                      key={optIdx}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 4,
                        background: "var(--bg-1)",
                      }}
                    >
                      <strong>{String.fromCharCode(65 + optIdx)}.</strong> {opt}
                    </li>
                  ))}
                </ol>
                <details style={{ marginTop: 4, fontSize: 12 }}>
                  <summary style={{ cursor: "pointer", color: "var(--fg-subtle)" }}>
                    Show answer
                  </summary>
                  <div style={{ marginTop: 4 }}>
                    <strong>{String.fromCharCode(65 + q.correct)}</strong>
                    {q.explanation && <> — {q.explanation}</>}
                  </div>
                </details>
              </li>
            ))}
          </ol>
          {/* 2026-05-04 (PENDING §6b Stage 3 batch B) — chip on quiz card */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 12,
              borderTop: "1px solid var(--border)",
            }}
          >
            <FeedbackChip
              operation="summarize"
              aiUsageId={meta?.aiUsageId ?? null}
              fileId={meta?.fileId ?? null}
              providerId={meta?.providerId}
              model={meta?.model}
            />
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {file && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={reset}>
            Reset
          </button>
        )}
        {signedOut ? (
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(props.callbackUrl)}`}
            className="btn btn-primary"
          >
            Sign in to run
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!file || busy}
            onClick={run}
          >
            {busy ? props.busyLabel : props.runLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// Concrete exports.

export function FlashcardsPdfTool() {
  return (
    <StructuredVariantTool
      mode="flashcards"
      toolId="ai-flashcards"
      callbackUrl="/tool/ai-flashcards"
      depth="flashcards"
      prompt="Drop a PDF to generate Anki-compatible flashcards"
      runLabel="Generate flashcards"
      busyLabel="Building deck…"
      successTitle="Flashcards ready"
      pricingBlurb="10–30 Q&A cards grounded in the source, with page refs. Anki-compatible CSV export (front,back)."
    />
  );
}

export function QuizPdfTool() {
  return (
    <StructuredVariantTool
      mode="quiz"
      toolId="ai-quiz"
      callbackUrl="/tool/ai-quiz"
      depth="quiz"
      prompt="Drop a PDF to generate a multiple-choice quiz"
      runLabel="Generate quiz"
      busyLabel="Writing questions…"
      successTitle="Quiz ready"
      pricingBlurb="6–12 MCQs with 4 plausible options, correct answer, and one-line explanation with page ref. JSON export."
    />
  );
}
