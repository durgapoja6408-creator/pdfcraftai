// /api/ai/ocr — Vision OCR for scanned PDFs (Phase 5.4).
//
// Life of a request (happy path):
//   1.  auth()                             → 401 if anonymous
//   2.  parse multipart                    → { pdf, idempotencyKey }
//   3.  validate size/type                 → 400 / 413
//   4.  peek page count (pdf-lib)          → 400 on malformed; 422 if >50
//   5.  spendCredits("ocr", pages)         → 402 insufficient; 409 duplicate
//   6.  ocrPdf                             → throws → refund + 502 / 503
//   7.  db.transaction                     → files row + ai_outputs row
//   8.  respond JSON                       → { fileId, markdown, ... }
//
// Why pdf-lib peek before spending credits:
//   - We need page count up front to compute the spend amount. Doing the
//     full `extractPdfText` pass (as summarize/translate do) is wasted
//     work for OCR — the PDF is scanned, so pdfjs will return nothing
//     anyway. pdf-lib's `getPageCount()` reads just the page tree.
//   - Rejecting oversize files (>50 pages) BEFORE the spend call means
//     the user never sees a refund on the ledger for a predictably-
//     oversized doc. Clean ledger, clean UX.
//
// Idempotency (Phase 5.5):
//   - `ai:ocr:${idempotencyKey}` for the spend.
//   - Replay-on-dup: before the pdf-lib peek we look up `ai_outputs` by
//     `(userId, idempotencyKey)` and return the stored markdown with
//     `replay: true` + `creditCost: 0` on a hit. No peek, no spend, no
//     provider call.
//   - If the replay lookup misses but the ledger still reports duplicate
//     (previous attempt died after spend, before persist), we return
//     409 so the client generates a fresh key.
//
// Refund policy (all-or-nothing, same as compare):
//   - If `ocrPdf` throws after ONE successful per-page call, we still
//     refund the full multi-page spend. The partial output isn't
//     persisted. Simpler than per-page reconciliation and fair to the
//     user — they didn't get a usable result.

import "server-only";

import { randomUUID, createHash } from "crypto";
import { PDFDocument } from "pdf-lib";

import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { refundCredits, spendCredits } from "@/lib/ai/credits";
import { findAiOutputByIdempotencyKey } from "@/lib/ai/idempotency";
import { guardAiRoute } from "@/lib/ai/route-guards";
import {
  MAX_OCR_PAGES,
  NoOcrProviderConfiguredError,
  ocrPdf,
} from "@/lib/ai/ocr";

// Node runtime — pdf-lib + mysql2 + AI SDK.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Same ceiling as summarize/translate/compare. 25MB is plenty for 50
// pages of 300-DPI scans; anything bigger is almost always a mis-upload.
const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB

export async function POST(req: Request): Promise<Response> {
  // -- 1. Auth ---------------------------------------------------------
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;
  if (!userId) {
    return json(401, { error: "not_authenticated" });
  }

  // -- 1b. Kill switch + daily cost ceiling (Task #12) ------------------
  const gate = await guardAiRoute("ocr", userId);
  if (gate) return gate;

  // -- 2. Parse multipart body -----------------------------------------
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: "bad_request", detail: "expected multipart/form-data" });
  }

  const pdfFile = form.get("pdf");
  const idempotencyKey = stringField(form, "idempotencyKey") ?? randomUUID();

  if (!(pdfFile instanceof File) || pdfFile.size === 0) {
    return json(400, { error: "bad_request", detail: "pdf is required" });
  }
  if (pdfFile.size > MAX_PDF_BYTES) {
    return json(413, { error: "pdf_too_large", maxBytes: MAX_PDF_BYTES });
  }

  const pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());
  const sha256 = sha256Hex(pdfBytes);

  // -- 2a. Replay on duplicate idempotency key ------------------------
  // Phase 5.5. If this exact key has already produced an OCR artifact
  // for this user, short-circuit with the stored markdown. Runs BEFORE
  // the pdf-lib peek because the peek only exists to compute the per-
  // page spend — wasted work on a cache hit. Replay returns
  // `creditCost: 0` (no new spend) and `replay: true` so the client UI
  // can surface "already processed" copy without re-debiting.
  const replay = await findAiOutputByIdempotencyKey({ userId, idempotencyKey });
  if (replay && replay.kind === "ocr") {
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
      providerId: (m.providerId as string | undefined) ?? null,
      model: (m.model as string | undefined) ?? null,
      pageCount: (m.sourcePageCount as number | undefined) ?? 0,
      processedPageCount: (m.processedPageCount as number | undefined) ?? 0,
      wasTruncated: Boolean(m.wasTruncated),
      replay: true,
    });
  }

  // -- 3. Peek page count ---------------------------------------------
  // pdf-lib parses the page tree only — cheap. Rejecting oversized PDFs
  // here keeps the credit ledger clean (no spend+refund for files the
  // user can predictably tell are too large from the client-side count).
  let pageCount: number;
  try {
    const doc = await PDFDocument.load(pdfBytes);
    pageCount = doc.getPageCount();
  } catch (err) {
    const message = err instanceof Error ? err.message : "pdf_parse_failed";
    return json(400, { error: "pdf_parse_failed", detail: message });
  }
  if (pageCount === 0) {
    return json(400, { error: "pdf_parse_failed", detail: "PDF has no pages" });
  }
  if (pageCount > MAX_OCR_PAGES) {
    return json(422, {
      error: "too_many_pages",
      detail: `OCR is limited to ${MAX_OCR_PAGES} pages per run. This PDF has ${pageCount}. Split it first with the Split tool.`,
      maxPages: MAX_OCR_PAGES,
      pageCount,
    });
  }

  // -- 4. Spend credits ------------------------------------------------
  // `multiplier: pageCount` → `pageCount * 2` credits debited in one ledger
  // row. Refund uses the same multiplier so the reversal matches exactly.
  const spendKey = `ai:ocr:${idempotencyKey}`;
  const spend = await spendCredits({
    userId,
    operation: "ocr",
    multiplier: pageCount,
    idempotencyKey: spendKey,
    note: `OCR "${pdfFile.name}" (${pageCount} page${pageCount === 1 ? "" : "s"})`,
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
      detail: "A previous attempt under this key did not complete. Retry with a new submission.",
    });
  }
  const creditCost = spend.creditsSpent;
  const newBalance = spend.newBalance;

  // -- 5. Run OCR ------------------------------------------------------
  let result: Awaited<ReturnType<typeof ocrPdf>>;
  try {
    result = await ocrPdf({
      pdfBytes,
      pageCount,
      filename: pdfFile.name,
    });
  } catch (err) {
    await refundCredits({
      userId,
      operation: "ocr",
      multiplier: pageCount,
      originalIdempotencyKey: spendKey,
      note: `Refund: OCR failed (${err instanceof Error ? err.name : "unknown"})`,
    });
    if (err instanceof NoOcrProviderConfiguredError) {
      return json(503, { error: "no_ai_provider_configured" });
    }
    const message = err instanceof Error ? err.message : "ocr_failed";
    return json(502, { error: "ocr_failed", detail: message });
  }

  // -- 6. Persist files + ai_outputs -----------------------------------
  const fileId = randomUUID();
  const filename = deriveFilename(pdfFile.name);
  const contentBytes = Buffer.byteLength(result.markdown, "utf8");

  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.files).values({
        id: fileId,
        userId,
        name: filename,
        mime: "text/markdown",
        sizeBytes: contentBytes,
        sha256: sha256Hex(Buffer.from(result.markdown, "utf8")),
        status: "ready",
        source: "tool",
        toolId: "ai-ocr",
      });
      await tx.insert(schema.aiOutputs).values({
        fileId,
        kind: "ocr",
        contentMd: result.markdown,
        // Phase 5.5. Unique index on ai_outputs.idempotency_key means a
        // replay retrying this insert would hit ER_DUP_ENTRY — but the
        // outer spendCredits call already rejects duplicate keys before
        // we get here, so the dedupe is enforced at the ledger layer.
        idempotencyKey,
        meta: {
          sourceSha256: sha256,
          sourceName: pdfFile.name,
          sourcePageCount: pageCount,
          processedPageCount: result.processedPageCount,
          providerId: result.providerId,
          model: result.model,
          tokensIn: result.usage.inputTokens,
          tokensOut: result.usage.outputTokens,
          wasTruncated: result.wasTruncated,
          creditCost,
        },
      });
    });
  } catch (err) {
    // Compute succeeded, persistence failed — return markdown inline
    // so the user can at least copy it out. Do NOT refund (we did the work).
    console.error("[/api/ai/ocr] persistence failed", { userId, fileId, err });
    return json(207, {
      warning: "persist_failed",
      detail:
        "OCR completed but the result couldn't be saved to /app/files. Copy the markdown below before leaving this page.",
      markdown: result.markdown,
      creditCost,
      usage: result.usage,
      providerId: result.providerId,
      model: result.model,
      processedPageCount: result.processedPageCount,
      wasTruncated: result.wasTruncated,
    });
  }

  return json(200, {
    fileId,
    filename,
    markdown: result.markdown,
    creditCost,
    newBalance,
    usage: result.usage,
    providerId: result.providerId,
    model: result.model,
    pageCount,
    processedPageCount: result.processedPageCount,
    wasTruncated: result.wasTruncated,
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
 * Derive the saved filename. OCR has no depth variant, so the suffix is
 * just " — OCR.md".
 *
 *   input:  "Scanned Invoice.pdf"   →  "Scanned Invoice — OCR.md"
 *   input:  "handwritten notes"     →  "handwritten notes — OCR.md"
 */
function deriveFilename(source: string): string {
  const base = source.replace(/\.pdf$/i, "").trim() || "document";
  return `${base} — OCR.md`;
}
