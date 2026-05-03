// /api/ai/redact — Redact PII from a PDF. Returns the redacted PDF bytes
// (base64) + a markdown summary of what was found and where.
//
// Mirrors /api/ai/table end-to-end. Differences:
//   - Operation id is "redact" (5 credits flat, per lib/pricing.ts).
//   - No `mode` field — single redaction behavior across all 12 PII
//     categories.
//   - aiOutputs.kind is "redaction".
//   - The response carries `redactedPdfBase64` — the PDF we drew black
//     rectangles on. We don't persist the PDF itself (no binary storage
//     infra yet); we persist the markdown summary so users can go back
//     to /app/files and see what was redacted. If they need the PDF
//     again they run the tool again.
//   - meta.findings[] + meta.unmatched[] capture per-span detail so the
//     Files page can render a richer preview later.
//   - Catches RedactParseError specifically → 502 redact_parse_failed
//     + refund.
//   - Filename suffix: persisted summary is " — Redaction Summary.md";
//     the ephemeral PDF download name is " — Redacted.pdf".
//
// Security caveat: our redactions are visual-only overlay rectangles.
// The underlying text in the PDF content stream is untouched so
// determined users can still copy it out. The client surfaces this
// explicitly next to the download button. A content-stream-stripping
// "true redaction" pass is deferred to v2.

import "server-only";

import { randomUUID, createHash } from "crypto";
import { PDFDocument } from "pdf-lib";

import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { refundCredits, spendCredits } from "@/lib/ai/credits";
import {
  NoAIProviderConfiguredError,
  RedactParseError,
  redactPdf,
  type RedactFinding,
  type UnmatchedFinding,
} from "@/lib/ai/redact";
import { findAiOutputByIdempotencyKey } from "@/lib/ai/idempotency";
import { guardAiRoute } from "@/lib/ai/route-guards";
// 2026-05-02 plan §3 (Day 1.7) — multiplier-aware spend.
import { isMultiplierPricingEnabled } from "@/lib/pricing";

// Node runtime — pdfjs-dist legacy + pdf-lib + mysql2 + AI SDKs don't
// run on Edge.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB — same ceiling as table/rewrite.

export async function POST(req: Request): Promise<Response> {
  // -- 1. Auth ---------------------------------------------------------
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  if (!userId) {
    return json(401, { error: "not_authenticated" });
  }

  // -- 1b. Kill switch + daily cost ceiling (Task #12) ------------------
  const gate = await guardAiRoute("redact", userId);
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

  // -- 3. Idempotency replay -------------------------------------------
  //
  // Replay only serves the persisted summary — we don't store the
  // redacted PDF bytes, so a replay can't hand the user another
  // download. We still honor the replay to avoid double-charging; the
  // response carries a `redactedPdfBase64: null` flag that the client
  // reads as "your PDF is on /app/files; the download link is not
  // re-playable — run again to get a fresh PDF."
  const replay = await findAiOutputByIdempotencyKey({ userId, idempotencyKey });
  if (replay && replay.kind === "redaction") {
    const m = (replay.meta ?? {}) as Record<string, unknown>;
    return json(200, {
      fileId: replay.fileId,
      filename: replay.fileName,
      redactedPdfBase64: null,
      redactedPdfFilename: (m.redactedPdfFilename as string | undefined) ?? null,
      markdown: replay.contentMd,
      findings: (m.findings as RedactFinding[] | undefined) ?? [],
      unmatched: (m.unmatched as UnmatchedFinding[] | undefined) ?? [],
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

  // -- 3.5. Peek page count (Day 1.7 — multiplier-aware spend) -------
  // Mirrors /api/ai/ocr's peek pattern. pdf-lib parses the page tree
  // only — cheap, no full-text extraction. Pre-spend so the quoted
  // estimate (estimateCredits with multiplier=pageCount) matches what
  // gets debited. Fall back to multiplier=1 if MULTIPLIER_PRICING_ENABLED
  // is "false" (Hostinger panel rollback lever per plan §14).
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
  const multiplier = isMultiplierPricingEnabled() ? pageCount : 1;

  // -- 4. Spend credits ------------------------------------------------
  const spendKey = `ai:redact:${idempotencyKey}`;
  const spend = await spendCredits({
    userId,
    operation: "redact",
    multiplier,
    idempotencyKey: spendKey,
    note: `Redact PII from "${pdfFile.name}" (${pageCount} page${pageCount === 1 ? "" : "s"})`,
  });
  if (!spend.ok) {
    if (spend.reason === "insufficient") {
      return json(402, {
        error: "insufficient_credits",
        required: spend.required,
        balance: spend.balance,
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

  // -- 5. Run redaction ------------------------------------------------
  //
  // The helper does the positioned extraction internally (we need the
  // per-item rectangles, which the shared extractPdfText strips). So
  // there's no separate extract step here like /api/ai/table has —
  // `redactPdf` is the whole pipeline.
  let result: Awaited<ReturnType<typeof redactPdf>>;
  try {
    result = await redactPdf({
      pdfBytes,
      filename: pdfFile.name,
    });
  } catch (err) {
    await refundCredits({
      userId,
      operation: "redact",
      originalIdempotencyKey: spendKey,
      note: `Refund: redaction failed (${err instanceof Error ? err.name : "unknown"})`,
    });
    if (err instanceof NoAIProviderConfiguredError) {
      return json(503, { error: "no_ai_provider_configured" });
    }
    if (err instanceof RedactParseError) {
      return json(502, {
        error: "redact_parse_failed",
        detail:
          "The AI returned output we couldn't parse. We've refunded your credits — please retry.",
      });
    }
    const message = err instanceof Error ? err.message : "redact_failed";
    // pdf-extract failures bubble up as generic Errors; the message
    // usually makes it clear. 502 is the right bucket — we failed on
    // the provider/pipeline side, not on input validation.
    if (/pdf/i.test(message) && /extract|load|parse/i.test(message)) {
      return json(400, { error: "pdf_extract_failed", detail: message });
    }
    return json(502, { error: "redact_failed", detail: message });
  }

  // No-text guard — if the pipeline succeeded but emitted zero
  // findings AND flagged every page as OCR-candidate, the PDF is
  // almost certainly a scanned image. Same semantics as the
  // `no_extractable_text` branch in /api/ai/table.
  //
  // We keep the credit spend if *any* findings came back (the user
  // got value) and refund only on the zero-signal / scanned-doc case.
  const looksScanned =
    result.findings.length === 0 &&
    result.unmatched.length === 0 &&
    result.ocrCandidatePages.length > 0 &&
    result.ocrCandidatePages.length >= result.pageCount * 0.9;

  if (looksScanned) {
    await refundCredits({
      userId,
      operation: "redact",
      originalIdempotencyKey: spendKey,
      note: "Refund: no extractable text (scanned PDF)",
    });
    return json(422, {
      error: "no_extractable_text",
      detail:
        "We couldn't find enough text to scan for PII — this PDF appears to be " +
        "scanned images. Run OCR first, then try again.",
      ocrCandidatePages: result.ocrCandidatePages,
    });
  }

  // -- 6. Persist summary + ai_outputs row ------------------------------
  const fileId = randomUUID();
  const filename = deriveSummaryFilename(pdfFile.name);
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
        toolId: "ai-redact",
      });
      await tx.insert(schema.aiOutputs).values({
        fileId,
        kind: "redaction",
        contentMd: result.markdown,
        idempotencyKey,
        meta: {
          sourceSha256: sha256,
          sourceName: pdfFile.name,
          sourcePageCount: result.pageCount,
          findings: result.findings,
          findingCount: result.findings.length,
          unmatched: result.unmatched,
          unmatchedCount: result.unmatched.length,
          redactedPdfFilename: result.redactedPdfFilename,
          providerId: result.providerId,
          model: result.model,
          tokensIn: result.usage.inputTokens,
          tokensOut: result.usage.outputTokens,
          wasTruncated: result.wasTruncated,
          ocrCandidatePages: result.ocrCandidatePages,
          creditCost,
        },
      });
    });
  } catch (err) {
    console.error("[/api/ai/redact] persistence failed", { userId, fileId, err });
    // We still hand back the redacted PDF — don't hold the user's
    // download hostage just because we couldn't write a summary row.
    return json(207, {
      warning: "persist_failed",
      detail:
        "PDF redacted but the summary couldn't be saved to /app/files. " +
        "Download the PDF below before leaving this page — the summary won't be recoverable.",
      redactedPdfBase64: Buffer.from(result.pdfBytes).toString("base64"),
      redactedPdfFilename: result.redactedPdfFilename,
      markdown: result.markdown,
      findings: result.findings,
      unmatched: result.unmatched,
      creditCost,
      usage: result.usage,
      providerId: result.providerId,
      model: result.model,
      wasTruncated: result.wasTruncated,
      pageCount: result.pageCount,
      ocrCandidatePages: result.ocrCandidatePages,
    });
  }

  return json(200, {
    fileId,
    filename,
    redactedPdfBase64: Buffer.from(result.pdfBytes).toString("base64"),
    redactedPdfFilename: result.redactedPdfFilename,
    markdown: result.markdown,
    findings: result.findings,
    unmatched: result.unmatched,
    creditCost,
    newBalance,
    usage: result.usage,
    providerId: result.providerId,
    model: result.model,
    wasTruncated: result.wasTruncated,
    pageCount: result.pageCount,
    ocrCandidatePages: result.ocrCandidatePages,
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
 * The persisted artifact on /app/files is the markdown summary, not
 * the PDF itself. Matches the rewrite/table naming pattern.
 *
 *   input:  "Employee Agreement.pdf"  →  "Employee Agreement — Redaction Summary.md"
 *   input:  "draft.pdf"               →  "draft — Redaction Summary.md"
 */
function deriveSummaryFilename(source: string): string {
  const base = source.replace(/\.pdf$/i, "").trim() || "document";
  return `${base} — Redaction Summary.md`;
}
