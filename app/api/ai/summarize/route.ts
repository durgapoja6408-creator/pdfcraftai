// /api/ai/summarize — Summarize a PDF, return markdown, persist on /app/files.
//
// Life of a request (happy path):
//   1.  auth()                          → 401 if anonymous
//   2.  parse multipart                 → { pdf, depth, idempotencyKey }
//   3.  validate size/depth/type        → 400 / 413
//   4.  spendCredits("summarize", 3)    → 402 insufficient; 409 duplicate
//   5.  extractPdfText                  → 400 on malformed PDF (refunds)
//   6.  summarizePdf                    → throws → refund + 502
//   7.  db.transaction                  → files row + ai_outputs row
//   8.  respond JSON                    → { fileId, markdown, ... }
//
// Returns JSON, not SSE. Summaries are short (~500-2000 tokens) and the
// user sees a spinner, not a token stream. Streaming the summary would
// mean writing a map-reduce strategy in the client to assemble it, which
// isn't worth the complexity at v1 scale.
//
// Idempotency note (Phase 5.5): the client sends one UUID per submit
// and reuses it on fetch retries. We do a lookup against the unique
// index `ai_outputs.idempotency_key` BEFORE spending credits — on a hit
// the route returns the already-stored markdown as a 200 with
// `replay: true` and `creditCost: 0`, no provider call. This replaces
// the Phase 5.1 "return 409 and tell the user to check /app/files"
// behavior. The 409 branch is still reachable on a raced ledger debit
// without an ai_outputs row (e.g. the previous attempt died between
// spend and persist) — in that case we surface a retryable error.

import "server-only";

import { randomUUID, createHash } from "crypto";

import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { extractPdfText } from "@/lib/ai/pdf-extract";
import { refundCredits, spendCredits } from "@/lib/ai/credits";
import { isTruncatedStopReason, recordAiUsage } from "@/lib/ai/usage";
import {
  NoAIProviderConfiguredError,
  summarizePdf,
  type SummarizeDepth,
} from "@/lib/ai/summarize";
import { findAiOutputByIdempotencyKey } from "@/lib/ai/idempotency";
import { guardAiRoute } from "@/lib/ai/route-guards";

// Node runtime — pdfjs-dist legacy + mysql2 + AI SDKs don't run on Edge.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Same ceiling as chat. Bigger and we refuse before touching pdfjs so a
// malicious 500MB body can't OOM a worker.
const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB

// Task #52: six valid depths. Kept here (not in summarize.ts) because
// this is the public boundary — summarize.ts is server-only code.
// "key-points", "study-notes", "eli5" are presentation-style variants
// each exposed as its own dedicated Tier 2 tool (ai-key-points /
// ai-study-notes / ai-eli5). All six flow through the same /api/ai/
// summarize route with different depthLine prompts + output-cap caps.
const VALID_DEPTHS: readonly SummarizeDepth[] = [
  "tldr",
  "standard",
  "detailed",
  "key-points",
  "study-notes",
  "eli5",
  // Task #53 — FAQ + Blog Post variants (see lib/ai/summarize.ts).
  "faq",
  "blog",
  // Task #54:
  "readability",
  "entities",
  "social-thread",
  // Task #55:
  "condense",
  "expand",
  "tone-analyze",
  "citations",
  "financials",
  // Task #56:
  "sentiment",
  "bias",
  "proofread",
  // Task #57:
  "newsletter",
  "video-script",
  // Task #58:
  "flashcards",
  "quiz",
  // Task #59:
  "mindmap",
  // Task #60:
  "semantic-search",
];

export async function POST(req: Request): Promise<Response> {
  // -- 1. Auth ---------------------------------------------------------
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;
  if (!userId) {
    return json(401, { error: "not_authenticated" });
  }

  // -- 1b. Kill switch + per-user daily cost ceiling (Task #12) --------
  // Runs BEFORE we parse the body or touch credits: a killed op or a
  // capped user must not spend CPU on pdfjs extraction or cycles on
  // the idempotency lookup.
  const gate = await guardAiRoute("summarize", userId);
  if (gate) return gate;

  // -- 2. Parse multipart body -----------------------------------------
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: "bad_request", detail: "expected multipart/form-data" });
  }

  const pdfFile = form.get("pdf");
  const depthRaw = stringField(form, "depth") ?? "standard";
  const idempotencyKey = stringField(form, "idempotencyKey") ?? randomUUID();

  if (!(pdfFile instanceof File) || pdfFile.size === 0) {
    return json(400, { error: "bad_request", detail: "pdf is required" });
  }
  if (pdfFile.size > MAX_PDF_BYTES) {
    return json(413, { error: "pdf_too_large", maxBytes: MAX_PDF_BYTES });
  }
  if (!VALID_DEPTHS.includes(depthRaw as SummarizeDepth)) {
    return json(400, {
      error: "bad_request",
      detail: `depth must be one of: ${VALID_DEPTHS.join(", ")}`,
    });
  }
  const depth = depthRaw as SummarizeDepth;

  // Task #60 — optional semantic-search query. Only read when the
  // depth is semantic-search; other depths silently ignore any
  // query value. Cap at 500 chars to bound prompt size and avoid
  // model-side prompt-injection surface.
  const queryRaw = stringField(form, "query") ?? "";
  const query =
    depth === "semantic-search" ? queryRaw.slice(0, 500).trim() : "";
  if (depth === "semantic-search" && !query) {
    return json(400, {
      error: "bad_request",
      detail: "semantic-search requires a non-empty `query` form field",
    });
  }

  // Read the PDF once into a buffer. We need it for hashing AND extraction.
  const pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());
  const sha256 = sha256Hex(pdfBytes);

  // -- 3. Idempotency replay (Phase 5.5) -------------------------------
  // If a previous request for this user already produced an ai_outputs
  // row under the same idempotency key, re-emit it without hitting the
  // ledger or the provider. Happy path for "user double-clicked" or
  // "fetch retried on network flap".
  const replay = await findAiOutputByIdempotencyKey({ userId, idempotencyKey });
  if (replay && replay.kind === "summary") {
    const m = (replay.meta ?? {}) as Record<string, unknown>;
    return json(200, {
      fileId: replay.fileId,
      filename: replay.fileName,
      markdown: replay.contentMd,
      // Replays never re-charge. The original creditCost is still on the
      // stored meta for audit but the response reports 0 so the UI can
      // show "already processed — no extra charge".
      creditCost: 0,
      originalCreditCost: (m.creditCost as number | undefined) ?? undefined,
      usage: {
        inputTokens: (m.tokensIn as number | undefined) ?? 0,
        outputTokens: (m.tokensOut as number | undefined) ?? 0,
      },
      providerId: m.providerId,
      model: m.model,
      wasTruncated: Boolean(m.wasTruncated),
      pageCount: (m.sourcePageCount as number | undefined) ?? 0,
      ocrCandidatePages: (m.ocrCandidatePages as number[] | undefined) ?? [],
      replay: true,
    });
  }

  // -- 4. Spend credits ------------------------------------------------
  // Key prefix distinguishes this op from chat spends in the ledger.
  const spendKey = `ai:summarize:${idempotencyKey}`;
  const spend = await spendCredits({
    userId,
    operation: "summarize",
    idempotencyKey: spendKey,
    note: `Summarize "${pdfFile.name}" (${depth})`,
  });
  if (!spend.ok) {
    if (spend.reason === "insufficient") {
      return json(402, {
        error: "insufficient_credits",
        required: spend.required,
        balance: spend.balance,
      });
    }
    // Duplicate ledger debit without a matching ai_outputs row means the
    // previous attempt died between spend and persist — we already
    // checked for a stored output above and missed. This is the "stuck
    // in-flight" path: the ledger moved, the output didn't land, and
    // the ledger's idempotent-insert semantics means we can't debit a
    // second time under the same key. Surface 409 so the client can
    // prompt the user to retry with a fresh submit (new idempotencyKey).
    return json(409, {
      error: "duplicate_submission",
      detail:
        "A previous attempt under this key did not complete. Retry with a new submission.",
    });
  }
  const creditCost = spend.creditsSpent;
  const newBalance = spend.newBalance;
  const spendLedgerId = spend.ledgerId;

  // -- 4. Extract text -------------------------------------------------
  let extracted: Awaited<ReturnType<typeof extractPdfText>>;
  try {
    extracted = await extractPdfText(pdfBytes);
  } catch (err) {
    await refundCredits({
      userId,
      operation: "summarize",
      originalIdempotencyKey: spendKey,
      note: "Refund: PDF extraction failed",
    });
    const message = err instanceof Error ? err.message : "pdf_extract_failed";
    return json(400, { error: "pdf_extract_failed", detail: message });
  }

  if (extracted.fullText.trim().length < 40) {
    // Nothing to summarize — either empty PDF or fully image-based.
    // Refund and tell the user. OCR will be Phase 5.2.
    await refundCredits({
      userId,
      operation: "summarize",
      originalIdempotencyKey: spendKey,
      note: "Refund: no extractable text",
    });
    return json(422, {
      error: "no_extractable_text",
      detail:
        "We couldn't find enough text to summarize — this PDF appears to be scanned images. " +
        "Run OCR first (coming soon).",
      ocrCandidatePages: extracted.ocrCandidatePages,
    });
  }

  // -- 5. Summarize ----------------------------------------------------
  let summary: Awaited<ReturnType<typeof summarizePdf>>;
  const providerStartedAt = Date.now();
  try {
    summary = await summarizePdf({
      text: extracted.fullText,
      pageCount: extracted.pageCount,
      filename: pdfFile.name,
      depth,
      ocrCandidatePages: extracted.ocrCandidatePages,
      // Phase E / Task #26 — bucketing seed for prompt-variant A/B
      // routing. Stable per user so repeated summarize calls by the
      // same person resolve to the same variant, which is a
      // precondition for any meaningful cost/quality delta measurement.
      userId,
      // Task #60 — semantic-search query (empty string for other depths).
      query: query || undefined,
    });
  } catch (err) {
    await refundCredits({
      userId,
      operation: "summarize",
      originalIdempotencyKey: spendKey,
      note: `Refund: summarize failed (${err instanceof Error ? err.name : "unknown"})`,
    });
    // Phase A1: log the failed call. Provider may have charged us even
    // if the SDK threw post-stream-start (partial stream). Tokens
    // unknown at this point — write zeros, success=false so the margin
    // rollup filters it out of positive-revenue ledgers.
    await recordAiUsage({
      userId,
      operation: "summarize",
      providerId: err instanceof NoAIProviderConfiguredError ? "none" : "unknown",
      model: "unknown",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - providerStartedAt,
      creditsSpent: 0,
      costMicros: null,
      success: false,
      errorCode: err instanceof Error ? err.name : "summarize_failed",
      ledgerId: spendLedgerId,
      idempotencyKey: spendKey,
      // Phase E / Task #26 — we can't know the resolved variant on the
      // error path (summarizePdf threw before returning). Leave both
      // NULL. That's the right shape: the margin rollup's per-variant
      // aggregates filter on `prompt_version IS NOT NULL` so errored
      // calls don't skew either side of an A/B split.
      promptVersion: null,
      experimentId: null,
    });
    if (err instanceof NoAIProviderConfiguredError) {
      return json(503, { error: "no_ai_provider_configured" });
    }
    const message = err instanceof Error ? err.message : "summarize_failed";
    return json(502, { error: "summarize_failed", detail: message });
  }

  // Phase A1: log the successful call. Runs before the persistence
  // transaction so even a persistence failure (which we hard-error-log
  // and return 207) still has an audit trail of the provider spend.
  await recordAiUsage({
    userId,
    operation: "summarize",
    providerId: summary.providerId,
    model: summary.model,
    inputTokens: summary.usage.inputTokens,
    outputTokens: summary.usage.outputTokens,
    // Task #10: forward Anthropic prompt-cache token fields. Undefined is
    // passed through unchanged for non-Anthropic calls — the DB column is
    // nullable and we want "cache not applicable" (null) kept distinct
    // from "cache configured, nothing hit" (explicit 0).
    cachedInputTokens: summary.usage.cachedInputTokens,
    cacheCreationInputTokens: summary.usage.cacheCreationInputTokens,
    latencyMs: Date.now() - providerStartedAt,
    creditsSpent: creditCost,
    costMicros: null,
    success: true,
    // Task #11 truncation observability. `summary.stopReason` is the
    // provider-reported terminal reason; `isTruncatedStopReason` maps
    // "max_tokens" → 1 (truncated), other terminal reasons → 0, and
    // anything unknown → null. Both get persisted so the admin
    // dashboard can compute truncation-rate per op and the raw reason
    // is visible for edge-case debugging.
    stopReason: summary.stopReason,
    responseTruncated: isTruncatedStopReason(summary.stopReason),
    ledgerId: spendLedgerId,
    idempotencyKey: spendKey,
    // Phase E / Task #26 — stamp the variant the model actually ran.
    // `summary.promptVersion` is null when the registry's
    // RECORDING_ENABLED kill switch is off; otherwise it's the
    // PromptVersion.id the resolver returned (e.g. "v1").
    // `summary.experimentId` is null when the assignment was
    // deterministic (single-variant 100%) and the Experiment.id when
    // randomized — see lib/ai/prompts/registry.ts for the full
    // contract.
    promptVersion: summary.promptVersion,
    experimentId: summary.experimentId,
  });

  // -- 6. Persist files row + ai_outputs row ---------------------------
  // Do both writes in one transaction so we never land an orphan files
  // row (listed on /app/files but clicking "View" 404s) or an orphan
  // ai_outputs row (no parent file, stuck until GC).
  const fileId = randomUUID();
  const filename = deriveFilename(pdfFile.name, depth);
  const contentBytes = Buffer.byteLength(summary.markdown, "utf8");

  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.files).values({
        id: fileId,
        userId,
        name: filename,
        mime: "text/markdown",
        sizeBytes: contentBytes,
        sha256: sha256Hex(Buffer.from(summary.markdown, "utf8")),
        status: "ready",
        source: "tool",
        toolId: "ai-summarize",
      });
      await tx.insert(schema.aiOutputs).values({
        fileId,
        kind: "summary",
        contentMd: summary.markdown,
        // Phase 5.5: unique index on this column enables replay-on-dup.
        // On the rare race where two concurrent retries both got past the
        // pre-spend lookup and both land here, the unique index makes one
        // insert fail with ER_DUP_ENTRY — the catch below refunds and
        // falls back to the stored row.
        idempotencyKey,
        meta: {
          sourceSha256: sha256,
          sourceName: pdfFile.name,
          sourcePageCount: extracted.pageCount,
          depth,
          providerId: summary.providerId,
          model: summary.model,
          tokensIn: summary.usage.inputTokens,
          tokensOut: summary.usage.outputTokens,
          wasTruncated: summary.wasTruncated,
          ocrCandidatePages: extracted.ocrCandidatePages,
          creditCost,
        },
      });
    });
  } catch (err) {
    // Persistence failed after a successful summarize. The compute DID
    // happen, so we do NOT refund — the user paid for a summary we
    // generated. Instead we surface the markdown inline so the user can
    // at least copy it out. Log loud.
    console.error("[/api/ai/summarize] persistence failed", { userId, fileId, err });
    return json(207, {
      warning: "persist_failed",
      detail:
        "Summary generated but couldn't be saved to /app/files. Copy it below before leaving this page.",
      markdown: summary.markdown,
      creditCost,
      usage: summary.usage,
      providerId: summary.providerId,
      model: summary.model,
      wasTruncated: summary.wasTruncated,
    });
  }

  return json(200, {
    fileId,
    filename,
    markdown: summary.markdown,
    creditCost,
    newBalance,
    usage: summary.usage,
    providerId: summary.providerId,
    model: summary.model,
    wasTruncated: summary.wasTruncated,
    pageCount: extracted.pageCount,
    ocrCandidatePages: extracted.ocrCandidatePages,
  });
}

// --- helpers ----------------------------------------------------------

function stringField(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sha256Hex(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Derive the filename the summary saves as on /app/files. Drops the
 * `.pdf` suffix of the source, tags the depth, and adds `.md`.
 *
 *   input:  "Quarterly Report.pdf", "standard"   →  "Quarterly Report — Summary.md"
 *   input:  "whitepaper.pdf",       "tldr"       →  "whitepaper — Summary (TL;DR).md"
 *   input:  "notes",                "detailed"   →  "notes — Summary (detailed).md"
 */
function deriveFilename(source: string, depth: SummarizeDepth): string {
  const base = source.replace(/\.pdf$/i, "").trim() || "document";
  const suffix = depth === "standard" ? "" : ` (${depth === "tldr" ? "TL;DR" : depth})`;
  return `${base} — Summary${suffix}.md`;
}
