// /api/ai/table — Extract tables from a PDF, return markdown + structured CSVs.
//
// Mirrors /api/ai/rewrite end-to-end. Differences:
//   - Operation id is "table" (3 credits flat, per lib/pricing.ts).
//   - No `mode` field — single extraction behavior.
//   - aiOutputs.kind is "table".
//   - meta.tables[] holds the per-table { title, pageHint, csv } triples
//     so the client can offer individual CSV downloads without parsing
//     the markdown.
//   - Catches TableParseError specifically → 502 table_parse_failed + refund.
//   - Filename suffix is " — Tables.md".

import "server-only";

import { randomUUID, createHash } from "crypto";

import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { extractPdfText } from "@/lib/ai/pdf-extract";
import { refundCredits, spendCredits } from "@/lib/ai/credits";
import {
  NoAIProviderConfiguredError,
  TableParseError,
  extractTables,
  type ExtractedTable,
} from "@/lib/ai/table";
import { findAiOutputByIdempotencyKey } from "@/lib/ai/idempotency";
import { guardAiRoute } from "@/lib/ai/route-guards";

// Node runtime — pdfjs-dist legacy + mysql2 + AI SDKs don't run on Edge.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB — same ceiling as rewrite/summarize.

export async function POST(req: Request): Promise<Response> {
  // -- 1. Auth ---------------------------------------------------------
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;
  if (!userId) {
    return json(401, { error: "not_authenticated" });
  }

  // -- 1b. Kill switch + daily cost ceiling (Task #12) ------------------
  const gate = await guardAiRoute("table", userId);
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
  const replay = await findAiOutputByIdempotencyKey({ userId, idempotencyKey });
  if (replay && replay.kind === "table") {
    const m = (replay.meta ?? {}) as Record<string, unknown>;
    return json(200, {
      fileId: replay.fileId,
      filename: replay.fileName,
      markdown: replay.contentMd,
      tables: (m.tables as ExtractedTable[] | undefined) ?? [],
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
  const spendKey = `ai:table:${idempotencyKey}`;
  const spend = await spendCredits({
    userId,
    operation: "table",
    idempotencyKey: spendKey,
    note: `Extract tables from "${pdfFile.name}"`,
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
      operation: "table",
      originalIdempotencyKey: spendKey,
      note: "Refund: PDF extraction failed",
    });
    const message = err instanceof Error ? err.message : "pdf_extract_failed";
    return json(400, { error: "pdf_extract_failed", detail: message });
  }

  if (extracted.fullText.trim().length < 40) {
    await refundCredits({
      userId,
      operation: "table",
      originalIdempotencyKey: spendKey,
      note: "Refund: no extractable text",
    });
    return json(422, {
      error: "no_extractable_text",
      detail:
        "We couldn't find enough text to scan for tables — this PDF appears to be " +
        "scanned images. Run OCR first, then try again.",
      ocrCandidatePages: extracted.ocrCandidatePages,
    });
  }

  // -- 6. Extract tables ------------------------------------------------
  let extractResult: Awaited<ReturnType<typeof extractTables>>;
  try {
    extractResult = await extractTables({
      text: extracted.fullText,
      pageCount: extracted.pageCount,
      filename: pdfFile.name,
      ocrCandidatePages: extracted.ocrCandidatePages,
    });
  } catch (err) {
    await refundCredits({
      userId,
      operation: "table",
      originalIdempotencyKey: spendKey,
      note: `Refund: table extraction failed (${err instanceof Error ? err.name : "unknown"})`,
    });
    if (err instanceof NoAIProviderConfiguredError) {
      return json(503, { error: "no_ai_provider_configured" });
    }
    if (err instanceof TableParseError) {
      return json(502, {
        error: "table_parse_failed",
        detail:
          "The AI returned output we couldn't parse as table data. We've refunded your credits — please retry.",
      });
    }
    const message = err instanceof Error ? err.message : "table_failed";
    return json(502, { error: "table_failed", detail: message });
  }

  // -- 7. Persist files row + ai_outputs row ---------------------------
  const fileId = randomUUID();
  const filename = deriveFilename(pdfFile.name);
  const contentBytes = Buffer.byteLength(extractResult.markdown, "utf8");

  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.files).values({
        id: fileId,
        userId,
        name: filename,
        mime: "text/markdown",
        sizeBytes: contentBytes,
        sha256: sha256Hex(Buffer.from(extractResult.markdown, "utf8")),
        status: "ready",
        source: "tool",
        toolId: "ai-table",
      });
      await tx.insert(schema.aiOutputs).values({
        fileId,
        kind: "table",
        contentMd: extractResult.markdown,
        idempotencyKey,
        meta: {
          sourceSha256: sha256,
          sourceName: pdfFile.name,
          sourcePageCount: extracted.pageCount,
          tables: extractResult.tables,
          tableCount: extractResult.tables.length,
          providerId: extractResult.providerId,
          model: extractResult.model,
          tokensIn: extractResult.usage.inputTokens,
          tokensOut: extractResult.usage.outputTokens,
          wasTruncated: extractResult.wasTruncated,
          ocrCandidatePages: extracted.ocrCandidatePages,
          creditCost,
        },
      });
    });
  } catch (err) {
    console.error("[/api/ai/table] persistence failed", { userId, fileId, err });
    return json(207, {
      warning: "persist_failed",
      detail:
        "Tables extracted but couldn't be saved to /app/files. Copy the CSVs below before leaving this page.",
      markdown: extractResult.markdown,
      tables: extractResult.tables,
      creditCost,
      usage: extractResult.usage,
      providerId: extractResult.providerId,
      model: extractResult.model,
      wasTruncated: extractResult.wasTruncated,
    });
  }

  return json(200, {
    fileId,
    filename,
    markdown: extractResult.markdown,
    tables: extractResult.tables,
    creditCost,
    newBalance,
    usage: extractResult.usage,
    providerId: extractResult.providerId,
    model: extractResult.model,
    wasTruncated: extractResult.wasTruncated,
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
 * Derive the filename the table-extract saves as on /app/files. Matches the
 * rewrite helper's pattern.
 *
 *   input:  "Quarterly Report.pdf"  →  "Quarterly Report — Tables.md"
 *   input:  "draft.pdf"             →  "draft — Tables.md"
 */
function deriveFilename(source: string): string {
  const base = source.replace(/\.pdf$/i, "").trim() || "document";
  return `${base} — Tables.md`;
}
