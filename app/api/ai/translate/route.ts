// /api/ai/translate — Translate a PDF into a target language.
//
// Life of a request (happy path):
//   1.  auth()                           → 401 if anonymous
//   2.  parse multipart                  → { pdf, targetLang, idempotencyKey }
//   3.  validate size / lang / type      → 400 / 413
//   4.  spendCredits("translate", 5)     → 402 insufficient; 409 duplicate
//   5.  extractPdfText                   → 400 on malformed PDF (refunds)
//   6.  translatePdf (chunked)           → throws → refund + 502
//   7.  db.transaction                   → files + ai_outputs(kind="translation")
//   8.  respond JSON                     → { fileId, markdown, ... }
//
// Mirrors /api/ai/summarize intentionally — the two routes will diverge
// over time, but Phase 5.2 keeps them structurally identical so that
// touching one is a cue to check the other.
//
// Validation note: we accept any BCP-47-ish code matching the regex
// below (1-3 letters, optional `-` subtags). This is laxer than a full
// RFC-5646 parser but catches typos ("EN_us") without rejecting valid
// rare codes ("zh-Hant", "sr-Latn-RS"). If a bogus code slips through,
// the model will just translate into the nearest reasonable language —
// not a great outcome, but not catastrophic either.

import "server-only";

import { randomUUID, createHash } from "crypto";

import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { extractPdfText } from "@/lib/ai/pdf-extract";
import { refundCredits, spendCredits } from "@/lib/ai/credits";
// 2026-05-02 plan §3 (Day 1.7) — multiplier-aware spend.
import { isMultiplierPricingEnabled } from "@/lib/pricing";
import {
  COMMON_TARGET_LANGUAGES,
  NoAIProviderConfiguredError,
  translatePdf,
} from "@/lib/ai/translate";
import { findAiOutputByIdempotencyKey } from "@/lib/ai/idempotency";
import { guardAiRoute } from "@/lib/ai/route-guards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Same ceiling as summarize. pdfjs can choke on pathologically big PDFs
// and we don't want a 400MB body OOM'ing a worker.
const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB

// BCP-47-ish: 1-3 ASCII letters optionally followed by 1-N `-` subtags
// each 1-8 chars. Good enough to reject "english" / "EN_us" / injection
// attempts while allowing rare cases like "zh-Hant-TW".
const BCP47_ISH = /^[a-zA-Z]{1,3}(-[a-zA-Z0-9]{1,8})*$/;

// Build a fast lookup of curated labels so `pt` gets called "Português"
// in the prompt, not just "pt". For codes not in the list (e.g.
// "sr-Latn"), we pass the code through verbatim — the model knows.
// Widen to `Map<string, string>` so a user-entered BCP-47 code can be
// used as a lookup key without TS complaining that "pt-BR" isn't in
// the curated union.
const CURATED_LABEL_BY_CODE: Map<string, string> = new Map(
  COMMON_TARGET_LANGUAGES.map((l) => [l.code, l.name])
);

export async function POST(req: Request): Promise<Response> {
  // -- 1. Auth ---------------------------------------------------------
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;
  if (!userId) {
    return json(401, { error: "not_authenticated" });
  }

  // -- 1b. Kill switch + daily cost ceiling (Task #12) ------------------
  const gate = await guardAiRoute("translate", userId);
  if (gate) return gate;

  // -- 2. Parse multipart ----------------------------------------------
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: "bad_request", detail: "expected multipart/form-data" });
  }

  const pdfFile = form.get("pdf");
  const targetLangRaw = stringField(form, "targetLang");
  const idempotencyKey = stringField(form, "idempotencyKey") ?? randomUUID();

  if (!(pdfFile instanceof File) || pdfFile.size === 0) {
    return json(400, { error: "bad_request", detail: "pdf is required" });
  }
  if (pdfFile.size > MAX_PDF_BYTES) {
    return json(413, { error: "pdf_too_large", maxBytes: MAX_PDF_BYTES });
  }
  if (!targetLangRaw || !BCP47_ISH.test(targetLangRaw) || targetLangRaw.length > 20) {
    return json(400, {
      error: "bad_request",
      detail: "targetLang must be a BCP-47 language code (e.g. 'en', 'pt-BR', 'zh-Hant')",
    });
  }
  const targetLang = targetLangRaw;
  // Resolve a curated label if we have one — otherwise pass the code
  // through so the model still has enough context.
  const targetLangLabel = CURATED_LABEL_BY_CODE.get(targetLang);

  const pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());
  const sha256 = sha256Hex(pdfBytes);

  // -- 3. Idempotency replay (Phase 5.5) -------------------------------
  // Same pattern as /api/ai/summarize — check for a stored ai_outputs
  // row under this user + key before debiting. Hits short-circuit to a
  // 200 "replay" response; misses fall through to the spend path.
  const replay = await findAiOutputByIdempotencyKey({ userId, idempotencyKey });
  if (replay && replay.kind === "translation") {
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
      targetLang: m.targetLang,
      targetLangLabel: (m.targetLangLabel as string | undefined) ?? null,
      wasChunked: Boolean(m.wasChunked),
      wasTruncated: Boolean(m.wasTruncated),
      chunkCount: (m.chunkCount as number | undefined) ?? 0,
      pageCount: (m.sourcePageCount as number | undefined) ?? 0,
      ocrCandidatePages: (m.ocrCandidatePages as number[] | undefined) ?? [],
      replay: true,
    });
  }

  // -- 3.5. Extract text BEFORE spend (Day 1.7 — multiplier-aware) ---
  // Plan §3: translate's spend should scale with chunkCount, not be
  // flat 5. Computing chunkCount requires the extracted text length.
  // Moving extraction before spend means the user's quoted estimate
  // (estimateCredits with charCount → ceil(chars/10K) chunks) matches
  // what gets debited. Fast operation (~100ms for typical PDFs) — we
  // accept the cost of extracting before user "commits" because (a)
  // failed extraction = no spend = no refund needed, (b) under-40-char
  // PDFs hit early return without spending, both improvements over
  // the old extract-after-spend ordering.
  let extracted: Awaited<ReturnType<typeof extractPdfText>>;
  try {
    extracted = await extractPdfText(pdfBytes);
  } catch (err) {
    const message = err instanceof Error ? err.message : "pdf_extract_failed";
    return json(400, { error: "pdf_extract_failed", detail: message });
  }

  if (extracted.fullText.trim().length < 40) {
    return json(422, {
      error: "no_extractable_text",
      detail:
        "We couldn't find enough text to translate — this PDF appears to be scanned images. " +
        "Run OCR first (coming soon).",
      ocrCandidatePages: extracted.ocrCandidatePages,
    });
  }

  // chunkCount estimate matches lib/ai/estimate.ts:TRANSLATE_CHUNK_CHARS.
  // Both call sites must use the SAME constant or the user-quoted
  // estimate drifts from the actual debit.
  const TRANSLATE_CHUNK_CHARS = 10_000;
  const chunkCount = Math.max(
    1,
    Math.ceil(extracted.fullText.length / TRANSLATE_CHUNK_CHARS),
  );
  const multiplier = isMultiplierPricingEnabled() ? chunkCount : 1;

  // -- 4. Spend credits ------------------------------------------------
  const spendKey = `ai:translate:${idempotencyKey}`;
  const spend = await spendCredits({
    userId,
    operation: "translate",
    multiplier,
    idempotencyKey: spendKey,
    note: `Translate "${pdfFile.name}" → ${targetLangLabel ?? targetLang} (${chunkCount} chunk${chunkCount === 1 ? "" : "s"})`,
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
    return json(409, {
      error: "duplicate_submission",
      detail:
        "A previous attempt under this key did not complete. Retry with a new submission.",
    });
  }
  const creditCost = spend.creditsSpent;
  const newBalance = spend.newBalance;

  // -- 5. Translate ----------------------------------------------------
  let translated: Awaited<ReturnType<typeof translatePdf>>;
  try {
    translated = await translatePdf({
      text: extracted.fullText,
      pageCount: extracted.pageCount,
      filename: pdfFile.name,
      targetLang,
      targetLangLabel,
      ocrCandidatePages: extracted.ocrCandidatePages,
    });
  } catch (err) {
    await refundCredits({
      userId,
      operation: "translate",
      originalIdempotencyKey: spendKey,
      note: `Refund: translate failed (${err instanceof Error ? err.name : "unknown"})`,
    });
    if (err instanceof NoAIProviderConfiguredError) {
      return json(503, { error: "no_ai_provider_configured" });
    }
    const message = err instanceof Error ? err.message : "translate_failed";
    return json(502, { error: "translate_failed", detail: message });
  }

  // -- 6. Persist files + ai_outputs -----------------------------------
  const fileId = randomUUID();
  const filename = deriveFilename(pdfFile.name, targetLang);
  const contentBytes = Buffer.byteLength(translated.markdown, "utf8");

  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.files).values({
        id: fileId,
        userId,
        name: filename,
        mime: "text/markdown",
        sizeBytes: contentBytes,
        sha256: sha256Hex(Buffer.from(translated.markdown, "utf8")),
        status: "ready",
        source: "tool",
        toolId: "ai-translate",
      });
      await tx.insert(schema.aiOutputs).values({
        fileId,
        kind: "translation",
        contentMd: translated.markdown,
        // Phase 5.5: unique-index gate for replay-on-dup. See the replay
        // branch at the top of this handler for the lookup side.
        idempotencyKey,
        meta: {
          sourceSha256: sha256,
          sourceName: pdfFile.name,
          sourcePageCount: extracted.pageCount,
          targetLang,
          targetLangLabel: targetLangLabel ?? null,
          providerId: translated.providerId,
          model: translated.model,
          tokensIn: translated.usage.inputTokens,
          tokensOut: translated.usage.outputTokens,
          wasTruncated: translated.wasTruncated,
          wasChunked: translated.wasChunked,
          chunkCount: translated.chunkCount,
          ocrCandidatePages: extracted.ocrCandidatePages,
          creditCost,
        },
      });
    });
  } catch (err) {
    // Persist failed after successful compute. Don't refund — the user
    // paid for a translation that DID run. Surface the markdown inline.
    console.error("[/api/ai/translate] persistence failed", { userId, fileId, err });
    return json(207, {
      warning: "persist_failed",
      detail:
        "Translation generated but couldn't be saved to /app/files. Copy it below before leaving this page.",
      markdown: translated.markdown,
      creditCost,
      usage: translated.usage,
      providerId: translated.providerId,
      model: translated.model,
      targetLang,
      targetLangLabel: targetLangLabel ?? null,
      wasChunked: translated.wasChunked,
      wasTruncated: translated.wasTruncated,
      chunkCount: translated.chunkCount,
    });
  }

  return json(200, {
    fileId,
    filename,
    markdown: translated.markdown,
    creditCost,
    newBalance,
    usage: translated.usage,
    providerId: translated.providerId,
    model: translated.model,
    targetLang,
    targetLangLabel: targetLangLabel ?? null,
    wasChunked: translated.wasChunked,
    wasTruncated: translated.wasTruncated,
    chunkCount: translated.chunkCount,
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
 * Derive the filename. Drops `.pdf`, adds language tag + `.md`.
 *
 *   input:  "Quarterly Report.pdf", "es"     →  "Quarterly Report — Translation (es).md"
 *   input:  "contract",             "pt-BR"  →  "contract — Translation (pt-BR).md"
 */
function deriveFilename(source: string, targetLang: string): string {
  const base = source.replace(/\.pdf$/i, "").trim() || "document";
  return `${base} — Translation (${targetLang}).md`;
}
