// /api/ai/rewrite — Rewrite a PDF, return markdown, persist on /app/files.
//
// Mirrors /api/ai/summarize end-to-end. Differences:
//   - Operation id is "rewrite" (3 credits flat).
//   - Body field `mode` instead of `depth` (simplify | formal | casual |
//     concise | expand).
//   - aiOutputs.kind is "rewrite".
//   - Replay branch matches kind === "rewrite".
//   - Filename suffix is " — Rewrite (mode).md".

import "server-only";

import { randomUUID, createHash } from "crypto";

import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { extractPdfText } from "@/lib/ai/pdf-extract";
import { refundCredits, spendCredits } from "@/lib/ai/credits";
import {
  NoAIProviderConfiguredError,
  rewritePdf,
  type RewriteMode,
} from "@/lib/ai/rewrite";
import { findAiOutputByIdempotencyKey } from "@/lib/ai/idempotency";
import { guardAiRoute } from "@/lib/ai/route-guards";

// Node runtime — pdfjs-dist legacy + mysql2 + AI SDKs don't run on Edge.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB — same ceiling as summarize.

const VALID_MODES: readonly RewriteMode[] = [
  "simplify",
  "formal",
  "casual",
  "concise",
  "expand",
];

export async function POST(req: Request): Promise<Response> {
  // -- 1. Auth ---------------------------------------------------------
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;
  if (!userId) {
    return json(401, { error: "not_authenticated" });
  }

  // -- 1b. Kill switch + daily cost ceiling (Task #12) ------------------
  const gate = await guardAiRoute("rewrite", userId);
  if (gate) return gate;

  // -- 2. Parse multipart body -----------------------------------------
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: "bad_request", detail: "expected multipart/form-data" });
  }

  const pdfFile = form.get("pdf");
  const modeRaw = stringField(form, "mode") ?? "simplify";
  const idempotencyKey = stringField(form, "idempotencyKey") ?? randomUUID();

  if (!(pdfFile instanceof File) || pdfFile.size === 0) {
    return json(400, { error: "bad_request", detail: "pdf is required" });
  }
  if (pdfFile.size > MAX_PDF_BYTES) {
    return json(413, { error: "pdf_too_large", maxBytes: MAX_PDF_BYTES });
  }
  if (!VALID_MODES.includes(modeRaw as RewriteMode)) {
    return json(400, {
      error: "bad_request",
      detail: `mode must be one of: ${VALID_MODES.join(", ")}`,
    });
  }
  const mode = modeRaw as RewriteMode;

  const pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());
  const sha256 = sha256Hex(pdfBytes);

  // -- 3. Idempotency replay -------------------------------------------
  const replay = await findAiOutputByIdempotencyKey({ userId, idempotencyKey });
  if (replay && replay.kind === "rewrite") {
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
      pageCount: (m.sourcePageCount as number | undefined) ?? 0,
      ocrCandidatePages: (m.ocrCandidatePages as number[] | undefined) ?? [],
      mode: (m.mode as RewriteMode | undefined) ?? mode,
      replay: true,
    });
  }

  // -- 4. Spend credits ------------------------------------------------
  const spendKey = `ai:rewrite:${idempotencyKey}`;
  const spend = await spendCredits({
    userId,
    operation: "rewrite",
    idempotencyKey: spendKey,
    note: `Rewrite "${pdfFile.name}" (${mode})`,
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

  // -- 5. Extract text -------------------------------------------------
  let extracted: Awaited<ReturnType<typeof extractPdfText>>;
  try {
    extracted = await extractPdfText(pdfBytes);
  } catch (err) {
    await refundCredits({
      userId,
      operation: "rewrite",
      originalIdempotencyKey: spendKey,
      note: "Refund: PDF extraction failed",
    });
    const message = err instanceof Error ? err.message : "pdf_extract_failed";
    return json(400, { error: "pdf_extract_failed", detail: message });
  }

  if (extracted.fullText.trim().length < 40) {
    await refundCredits({
      userId,
      operation: "rewrite",
      originalIdempotencyKey: spendKey,
      note: "Refund: no extractable text",
    });
    return json(422, {
      error: "no_extractable_text",
      detail:
        "We couldn't find enough text to rewrite — this PDF appears to be scanned " +
        "images. Run OCR first, then try again.",
      ocrCandidatePages: extracted.ocrCandidatePages,
    });
  }

  // -- 6. Rewrite ------------------------------------------------------
  let rewrite: Awaited<ReturnType<typeof rewritePdf>>;
  try {
    rewrite = await rewritePdf({
      text: extracted.fullText,
      pageCount: extracted.pageCount,
      filename: pdfFile.name,
      mode,
      ocrCandidatePages: extracted.ocrCandidatePages,
    });
  } catch (err) {
    await refundCredits({
      userId,
      operation: "rewrite",
      originalIdempotencyKey: spendKey,
      note: `Refund: rewrite failed (${err instanceof Error ? err.name : "unknown"})`,
    });
    if (err instanceof NoAIProviderConfiguredError) {
      return json(503, { error: "no_ai_provider_configured" });
    }
    const message = err instanceof Error ? err.message : "rewrite_failed";
    return json(502, { error: "rewrite_failed", detail: message });
  }

  // -- 7. Persist files row + ai_outputs row ---------------------------
  const fileId = randomUUID();
  const filename = deriveFilename(pdfFile.name, mode);
  const contentBytes = Buffer.byteLength(rewrite.markdown, "utf8");

  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.files).values({
        id: fileId,
        userId,
        name: filename,
        mime: "text/markdown",
        sizeBytes: contentBytes,
        sha256: sha256Hex(Buffer.from(rewrite.markdown, "utf8")),
        status: "ready",
        source: "tool",
        toolId: "ai-rewrite",
      });
      await tx.insert(schema.aiOutputs).values({
        fileId,
        kind: "rewrite",
        contentMd: rewrite.markdown,
        idempotencyKey,
        meta: {
          sourceSha256: sha256,
          sourceName: pdfFile.name,
          sourcePageCount: extracted.pageCount,
          mode,
          providerId: rewrite.providerId,
          model: rewrite.model,
          tokensIn: rewrite.usage.inputTokens,
          tokensOut: rewrite.usage.outputTokens,
          wasTruncated: rewrite.wasTruncated,
          ocrCandidatePages: extracted.ocrCandidatePages,
          creditCost,
        },
      });
    });
  } catch (err) {
    console.error("[/api/ai/rewrite] persistence failed", { userId, fileId, err });
    return json(207, {
      warning: "persist_failed",
      detail:
        "Rewrite generated but couldn't be saved to /app/files. Copy it below before leaving this page.",
      markdown: rewrite.markdown,
      creditCost,
      usage: rewrite.usage,
      providerId: rewrite.providerId,
      model: rewrite.model,
      wasTruncated: rewrite.wasTruncated,
      mode,
    });
  }

  return json(200, {
    fileId,
    filename,
    markdown: rewrite.markdown,
    creditCost,
    newBalance,
    usage: rewrite.usage,
    providerId: rewrite.providerId,
    model: rewrite.model,
    wasTruncated: rewrite.wasTruncated,
    pageCount: extracted.pageCount,
    ocrCandidatePages: extracted.ocrCandidatePages,
    mode,
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
 * Derive the filename the rewrite saves as on /app/files. Matches the
 * summary helper's pattern.
 *
 *   input:  "Quarterly Report.pdf", "simplify"  →  "Quarterly Report — Rewrite (simplify).md"
 *   input:  "draft.pdf",            "formal"    →  "draft — Rewrite (formal).md"
 */
function deriveFilename(source: string, mode: RewriteMode): string {
  const base = source.replace(/\.pdf$/i, "").trim() || "document";
  return `${base} — Rewrite (${mode}).md`;
}
