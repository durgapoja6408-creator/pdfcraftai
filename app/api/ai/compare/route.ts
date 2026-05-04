// /api/ai/compare — Diff two PDFs with AI severity analysis.
//
// Life of a request (happy path):
//   1.  auth()                            → 401 if anonymous
//   2.  parse multipart                   → { pdfA, pdfB, idempotencyKey }
//   3.  validate size / type on each      → 400 / 413
//   4.  spendCredits("compare", 15)       → 402 insufficient; 409 duplicate
//   5.  extractPdfText x2                 → 400 on either malformed (refunds)
//   6.  comparePdfs                       → throws → refund + 502
//   7.  db.transaction                    → files + ai_outputs(kind="comparison")
//   8.  respond JSON                      → { fileId, markdown, ... }
//
// Mirrors /api/ai/summarize and /api/ai/translate intentionally.
// Structural parity means touching one route is a cue to check the
// others. The two PDF inputs are the only real divergence — every other
// step is the same shape.
//
// Extraction-failure behavior: we refund the WHOLE credit (15) if either
// extraction fails — not 7.5 each. Charging a partial refund for a
// partial failure would be a footgun (what if A parses and B is a
// password-protected PDF?). The spend is atomic; the refund is atomic.

import "server-only";

import { randomUUID, createHash } from "crypto";

import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { extractPdfText } from "@/lib/ai/pdf-extract";
import { refundCredits, spendCredits } from "@/lib/ai/credits";
// 2026-05-04 (PENDING §6b corollary / AI_USAGE_INSTRUMENTATION_GAP) —
// Batch 2: compare joins the instrumented set.
import { recordAiUsage } from "@/lib/ai/usage";
import {
  NoAIProviderConfiguredError,
  comparePdfs,
} from "@/lib/ai/compare";
import { findAiOutputByIdempotencyKey } from "@/lib/ai/idempotency";
import { guardAiRoute } from "@/lib/ai/route-guards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Per-file size ceiling. Same 25MB as summarize/translate. Applies
// independently to each of the two PDFs — the combined-char budget
// inside comparePdfs() handles the "both are big" case via truncation.
const MAX_PDF_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request): Promise<Response> {
  // -- 1. Auth ---------------------------------------------------------
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;
  if (!userId) {
    return json(401, { error: "not_authenticated" });
  }

  // -- 1b. Kill switch + daily cost ceiling (Task #12) ------------------
  const gate = await guardAiRoute("compare", userId);
  if (gate) return gate;

  // -- 2. Parse multipart ----------------------------------------------
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: "bad_request", detail: "expected multipart/form-data" });
  }

  const pdfA = form.get("pdfA");
  const pdfB = form.get("pdfB");
  const idempotencyKey = stringField(form, "idempotencyKey") ?? randomUUID();

  if (!(pdfA instanceof File) || pdfA.size === 0) {
    return json(400, { error: "bad_request", detail: "pdfA (original) is required" });
  }
  if (!(pdfB instanceof File) || pdfB.size === 0) {
    return json(400, { error: "bad_request", detail: "pdfB (revised) is required" });
  }
  if (pdfA.size > MAX_PDF_BYTES) {
    return json(413, {
      error: "pdf_too_large",
      detail: "Original PDF exceeds the size limit.",
      which: "pdfA",
      maxBytes: MAX_PDF_BYTES,
    });
  }
  if (pdfB.size > MAX_PDF_BYTES) {
    return json(413, {
      error: "pdf_too_large",
      detail: "Revised PDF exceeds the size limit.",
      which: "pdfB",
      maxBytes: MAX_PDF_BYTES,
    });
  }

  const aBytes = new Uint8Array(await pdfA.arrayBuffer());
  const bBytes = new Uint8Array(await pdfB.arrayBuffer());
  const shaA = sha256Hex(aBytes);
  const shaB = sha256Hex(bBytes);

  // -- 3. Idempotency replay (Phase 5.5) -------------------------------
  // One key per submission, even though compare takes two PDFs — the
  // client's ComparePdfTool generates a single UUID per submit click.
  // On a hit we return the stored redline markdown with both sides'
  // meta so the UI can reconstruct the full result card.
  const replay = await findAiOutputByIdempotencyKey({ userId, idempotencyKey });
  if (replay && replay.kind === "comparison") {
    const m = (replay.meta ?? {}) as Record<string, unknown>;
    return json(200, {
      fileId: replay.fileId,
      filename: replay.fileName,
      markdown: replay.contentMd,
      creditCost: 0,
      originalCreditCost: (m.creditCost as number | undefined) ?? undefined,
      usage: {
        inputTokens: (m.tokensIn as number | undefined) ?? 0,
        outputTokens: (m.tokensOut as number | undefined) ?? 0,
      },
      providerId: m.providerId,
      model: m.model,
      wasTruncated: Boolean(m.wasTruncated),
      originalPageCount: (m.originalPageCount as number | undefined) ?? 0,
      revisedPageCount: (m.revisedPageCount as number | undefined) ?? 0,
      originalChars: (m.originalChars as number | undefined) ?? 0,
      revisedChars: (m.revisedChars as number | undefined) ?? 0,
      ocrCandidatePagesOriginal:
        (m.ocrCandidatePagesOriginal as number[] | undefined) ?? [],
      ocrCandidatePagesRevised:
        (m.ocrCandidatePagesRevised as number[] | undefined) ?? [],
      replay: true,
    });
  }

  // -- 4. Spend credits ------------------------------------------------
  const spendKey = `ai:compare:${idempotencyKey}`;
  const spend = await spendCredits({
    userId,
    operation: "compare",
    idempotencyKey: spendKey,
    note: `Compare "${pdfA.name}" vs "${pdfB.name}"`,
  });
  if (!spend.ok) {
    if (spend.reason === "insufficient") {
      return json(402, {
        error: "insufficient_credits",
        required: spend.required,
        balance: spend.balance,
        capExceeded: spend.capExceeded ?? false,
      });
    }
    // Phase 5.5: replay missed + ledger duplicate = previous attempt
    // spent but never persisted. Force a new idempotencyKey client-side.
    return json(409, {
      error: "duplicate_submission",
      detail:
        "A previous attempt under this key did not complete. Retry with a new submission.",
    });
  }
  const creditCost = spend.creditsSpent;
  const newBalance = spend.newBalance;

  // -- 4. Extract text (both sides) ------------------------------------
  let extractedA: Awaited<ReturnType<typeof extractPdfText>>;
  let extractedB: Awaited<ReturnType<typeof extractPdfText>>;
  try {
    // Run extractions in parallel — they're independent and pdfjs is
    // CPU-bound. On a 25MB pair this shaves noticeable wall-clock.
    [extractedA, extractedB] = await Promise.all([
      extractPdfText(aBytes),
      extractPdfText(bBytes),
    ]);
  } catch (err) {
    await refundCredits({
      userId,
      operation: "compare",
      originalIdempotencyKey: spendKey,
      note: "Refund: PDF extraction failed",
    });
    const message = err instanceof Error ? err.message : "pdf_extract_failed";
    return json(400, { error: "pdf_extract_failed", detail: message });
  }

  // Both docs being fully-image is a hard fail. One-side-scanned is
  // technically a diff-of-nothing-vs-something, but we bail with the
  // same 422 rather than produce an asymmetric diff the user didn't
  // expect. Surface which side was the problem so the UI can nudge
  // toward OCR (coming in 5.3+).
  const minChars = 40;
  const aShort = extractedA.fullText.trim().length < minChars;
  const bShort = extractedB.fullText.trim().length < minChars;
  if (aShort || bShort) {
    await refundCredits({
      userId,
      operation: "compare",
      originalIdempotencyKey: spendKey,
      note: "Refund: no extractable text on one or both sides",
    });
    return json(422, {
      error: "no_extractable_text",
      detail:
        aShort && bShort
          ? "Neither PDF has enough extractable text — both appear to be scanned images. Run OCR first (coming soon)."
          : aShort
            ? "The original PDF appears to be a scanned image with no extractable text. Run OCR first (coming soon)."
            : "The revised PDF appears to be a scanned image with no extractable text. Run OCR first (coming soon).",
      which: aShort && bShort ? "both" : aShort ? "pdfA" : "pdfB",
      ocrCandidatePagesOriginal: extractedA.ocrCandidatePages,
      ocrCandidatePagesRevised: extractedB.ocrCandidatePages,
    });
  }

  // -- 5. Compare ------------------------------------------------------
  // 2026-05-04 — capture provider start time for recordAiUsage latency.
  const providerStartedAt = Date.now();
  let diffed: Awaited<ReturnType<typeof comparePdfs>>;
  try {
    diffed = await comparePdfs({
      original: {
        text: extractedA.fullText,
        pageCount: extractedA.pageCount,
        filename: pdfA.name,
      },
      revised: {
        text: extractedB.fullText,
        pageCount: extractedB.pageCount,
        filename: pdfB.name,
      },
      ocrCandidatePagesOriginal: extractedA.ocrCandidatePages,
      ocrCandidatePagesRevised: extractedB.ocrCandidatePages,
    });
  } catch (err) {
    await refundCredits({
      userId,
      operation: "compare",
      originalIdempotencyKey: spendKey,
      note: `Refund: compare failed (${err instanceof Error ? err.name : "unknown"})`,
    });
    if (err instanceof NoAIProviderConfiguredError) {
      return json(503, { error: "no_ai_provider_configured" });
    }
    const message = err instanceof Error ? err.message : "compare_failed";
    return json(502, { error: "compare_failed", detail: message });
  }

  // 2026-05-04 — Phase A1 audit row. Compare's diffed result has
  // wasTruncated for "input was clipped to context window."
  const usageRecord = await recordAiUsage({
    userId,
    operation: "compare",
    providerId: diffed.providerId,
    model: diffed.model,
    inputTokens: diffed.usage.inputTokens,
    outputTokens: diffed.usage.outputTokens,
    latencyMs: Date.now() - providerStartedAt,
    creditsSpent: creditCost,
    costMicros: null,
    success: true,
    responseTruncated: diffed.wasTruncated ? 1 : 0,
    ledgerId: spend.ledgerId,
    idempotencyKey: spendKey,
  });

  // -- 6. Persist files + ai_outputs -----------------------------------
  const fileId = randomUUID();
  const filename = deriveFilename(pdfA.name, pdfB.name);
  const contentBytes = Buffer.byteLength(diffed.markdown, "utf8");

  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.files).values({
        id: fileId,
        userId,
        name: filename,
        mime: "text/markdown",
        sizeBytes: contentBytes,
        sha256: sha256Hex(Buffer.from(diffed.markdown, "utf8")),
        status: "ready",
        source: "tool",
        toolId: "ai-compare",
      });
      await tx.insert(schema.aiOutputs).values({
        fileId,
        kind: "comparison",
        contentMd: diffed.markdown,
        // Phase 5.5: the replay gate at the top of this handler reads
        // this column via the unique index.
        idempotencyKey,
        meta: {
          originalSha256: shaA,
          originalName: pdfA.name,
          originalPageCount: extractedA.pageCount,
          originalChars: diffed.originalChars,
          revisedSha256: shaB,
          revisedName: pdfB.name,
          revisedPageCount: extractedB.pageCount,
          revisedChars: diffed.revisedChars,
          providerId: diffed.providerId,
          model: diffed.model,
          tokensIn: diffed.usage.inputTokens,
          tokensOut: diffed.usage.outputTokens,
          wasTruncated: diffed.wasTruncated,
          ocrCandidatePagesOriginal: extractedA.ocrCandidatePages,
          ocrCandidatePagesRevised: extractedB.ocrCandidatePages,
          creditCost,
        },
      });
    });
  } catch (err) {
    // Compute succeeded; persistence failed. Do NOT refund — the
    // diff is real and the user can still copy it. Match the
    // summarize/translate handling.
    console.error("[/api/ai/compare] persistence failed", { userId, fileId, err });
    return json(207, {
      warning: "persist_failed",
      detail:
        "Comparison generated but couldn't be saved to /app/files. Copy it below before leaving this page.",
      markdown: diffed.markdown,
      creditCost,
      usage: diffed.usage,
      providerId: diffed.providerId,
      model: diffed.model,
      wasTruncated: diffed.wasTruncated,
      // 2026-05-04 (PENDING §6b stage 2). FeedbackChip flip semantics.
      aiUsageId: usageRecord.applied ? usageRecord.id : null,
    });
  }

  return json(200, {
    fileId,
    filename,
    markdown: diffed.markdown,
    creditCost,
    newBalance,
    usage: diffed.usage,
    providerId: diffed.providerId,
    model: diffed.model,
    wasTruncated: diffed.wasTruncated,
    originalPageCount: extractedA.pageCount,
    revisedPageCount: extractedB.pageCount,
    originalChars: diffed.originalChars,
    revisedChars: diffed.revisedChars,
    ocrCandidatePagesOriginal: extractedA.ocrCandidatePages,
    ocrCandidatePagesRevised: extractedB.ocrCandidatePages,
    // 2026-05-04 (PENDING §6b stage 2). FeedbackChip flip semantics.
    aiUsageId: usageRecord.applied ? usageRecord.id : null,
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
 * Derive the filename from both source names. We keep both sides
 * visible in the filename so a row on /app/files is self-describing.
 *
 *   "Contract v1.pdf" + "Contract v2.pdf" → "Contract v1 vs Contract v2 — Comparison.md"
 *   "a.pdf"          + "b.pdf"           → "a vs b — Comparison.md"
 */
function deriveFilename(sourceA: string, sourceB: string): string {
  const stripPdf = (s: string) => s.replace(/\.pdf$/i, "").trim() || "document";
  const a = stripPdf(sourceA);
  const b = stripPdf(sourceB);
  return `${a} vs ${b} — Comparison.md`;
}
