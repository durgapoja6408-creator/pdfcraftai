// /api/ai/sign — AI-driven fill-and-sign. The model spots printed form
// labels ("Name:", "Date:", "Signature:") and we draw the user's
// personal-info bundle into the right-of-anchor space on the original
// PDF. The response carries the filled PDF bytes (base64) + a markdown
// summary of what got filled and where.
//
// Mirrors /api/ai/redact end-to-end. Differences:
//   - Operation id is "sign" (10 credits flat, per lib/pricing.ts).
//   - Accepts an `info` multipart field — a JSON string holding the
//     SignUserInfo bundle (fullName required; rest optional).
//   - aiOutputs.kind is "signing".
//   - The response carries `signedPdfBase64` — we don't persist the
//     PDF itself (no binary storage infra yet); we persist the
//     markdown summary so users can go back to /app/files and see
//     what got filled. If they need the PDF again they run again.
//   - meta.filled[] + meta.unfilled[] capture per-field detail so the
//     Files page can render a richer preview later.
//   - Catches SignParseError specifically → 502 sign_parse_failed + refund.
//   - Filename suffix: persisted summary is " — Fill & Sign Report.md";
//     the ephemeral PDF download name is " — Signed.pdf".
//
// LEGAL CAVEAT: this is not a cryptographic signature. We draw the
// user's typed name on the page. Anyone needing a legally-binding
// e-signature should use DocuSign / Adobe Sign. The client surfaces
// this caveat explicitly next to the download button.

import "server-only";

import { randomUUID, createHash } from "crypto";
import { PDFDocument } from "pdf-lib";

import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { refundCredits, spendCredits } from "@/lib/ai/credits";
import {
  NoAIProviderConfiguredError,
  SignParseError,
  signPdf,
  type SignFilling,
  type SignUnfilled,
  type SignUserInfo,
} from "@/lib/ai/sign";
import { findAiOutputByIdempotencyKey } from "@/lib/ai/idempotency";
import { guardAiRoute } from "@/lib/ai/route-guards";
// 2026-05-02 plan §3 (Day 1.7) — multiplier-aware spend.
import { isMultiplierPricingEnabled } from "@/lib/pricing";

// Node runtime — pdfjs-dist legacy + pdf-lib + mysql2 + AI SDKs don't
// run on Edge.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB — same ceiling as redact/table/rewrite.
const MAX_INFO_BYTES = 16 * 1024; // 16 KB — plenty of room for name + custom fields.

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
  const gate = await guardAiRoute("sign", userId);
  if (gate) return gate;

  // -- 2. Parse multipart body -----------------------------------------
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, {
      error: "bad_request",
      detail: "expected multipart/form-data",
    });
  }

  const pdfFile = form.get("pdf");
  const rawInfo = stringField(form, "info");
  const idempotencyKey = stringField(form, "idempotencyKey") ?? randomUUID();

  if (!(pdfFile instanceof File) || pdfFile.size === 0) {
    return json(400, { error: "bad_request", detail: "pdf is required" });
  }
  if (pdfFile.size > MAX_PDF_BYTES) {
    return json(413, { error: "pdf_too_large", maxBytes: MAX_PDF_BYTES });
  }
  if (!rawInfo) {
    return json(400, {
      error: "bad_request",
      detail: "info (JSON with at least fullName) is required",
    });
  }
  if (Buffer.byteLength(rawInfo, "utf8") > MAX_INFO_BYTES) {
    return json(413, {
      error: "info_too_large",
      detail: "info payload exceeds 16 KB — trim your custom fields.",
    });
  }

  // Validate the info bundle. fullName is the only hard requirement —
  // everything else is optional and the helper tolerates missing keys
  // (those fields just don't appear in the availableKeys list given
  // to the model).
  let info: SignUserInfo;
  try {
    info = parseUserInfo(rawInfo);
  } catch (err) {
    return json(400, {
      error: "bad_request",
      detail: err instanceof Error ? err.message : "invalid info payload",
    });
  }

  const pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());
  const sha256 = sha256Hex(pdfBytes);

  // -- 3. Idempotency replay -------------------------------------------
  //
  // Replay only serves the persisted summary — we don't store the
  // signed PDF bytes, so a replay can't hand the user another download.
  // We still honor the replay to avoid double-charging; the response
  // carries `signedPdfBase64: null` so the client can show "re-run
  // for a fresh PDF."
  const replay = await findAiOutputByIdempotencyKey({ userId, idempotencyKey });
  if (replay && replay.kind === "signing") {
    const m = (replay.meta ?? {}) as Record<string, unknown>;
    return json(200, {
      fileId: replay.fileId,
      filename: replay.fileName,
      signedPdfBase64: null,
      signedPdfFilename: (m.signedPdfFilename as string | undefined) ?? null,
      markdown: replay.contentMd,
      filled: (m.filled as SignFilling[] | undefined) ?? [],
      unfilled: (m.unfilled as SignUnfilled[] | undefined) ?? [],
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
  // pdf-lib parses the page tree only — cheap, no full-text extraction.
  // Pre-spend so the quoted estimate (estimateCredits with
  // multiplier=pageCount) matches what gets debited.
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
  const spendKey = `ai:sign:${idempotencyKey}`;
  const spend = await spendCredits({
    userId,
    operation: "sign",
    multiplier,
    idempotencyKey: spendKey,
    note: `Fill & sign "${pdfFile.name}" (${pageCount} page${pageCount === 1 ? "" : "s"})`,
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

  // -- 5. Run the sign pipeline ----------------------------------------
  //
  // The helper owns positioned extraction, prompt construction, model
  // call, anchor location, and pdf-lib drawing. There's no separate
  // extract step here — `signPdf` is the whole pipeline (same shape
  // as /api/ai/redact).
  let result: Awaited<ReturnType<typeof signPdf>>;
  try {
    result = await signPdf({
      pdfBytes,
      filename: pdfFile.name,
      info,
    });
  } catch (err) {
    await refundCredits({
      userId,
      operation: "sign",
      originalIdempotencyKey: spendKey,
      note: `Refund: sign failed (${err instanceof Error ? err.name : "unknown"})`,
    });
    if (err instanceof NoAIProviderConfiguredError) {
      return json(503, { error: "no_ai_provider_configured" });
    }
    if (err instanceof SignParseError) {
      return json(502, {
        error: "sign_parse_failed",
        detail:
          "The AI returned output we couldn't parse. We've refunded your credits — please retry.",
      });
    }
    const message = err instanceof Error ? err.message : "sign_failed";
    // pdf-extract failures bubble up as generic Errors; the message
    // usually makes it clear. 400 is the right bucket for input
    // problems, 502 for provider/pipeline issues.
    if (/pdf/i.test(message) && /extract|load|parse/i.test(message)) {
      return json(400, { error: "pdf_extract_failed", detail: message });
    }
    return json(502, { error: "sign_failed", detail: message });
  }

  // No-text guard — if the pipeline succeeded but emitted zero fills
  // AND flagged every page as OCR-candidate, the PDF is almost
  // certainly a scanned image. Same semantics as the
  // `no_extractable_text` branch in /api/ai/redact.
  //
  // We keep the credit spend if *any* fills came back (the user got
  // value) and refund only on the zero-signal / scanned-doc case.
  const looksScanned =
    result.filled.length === 0 &&
    result.unfilled.length === 0 &&
    result.ocrCandidatePages.length > 0 &&
    result.ocrCandidatePages.length >= result.pageCount * 0.9;

  if (looksScanned) {
    await refundCredits({
      userId,
      operation: "sign",
      originalIdempotencyKey: spendKey,
      note: "Refund: no extractable text (scanned PDF)",
    });
    return json(422, {
      error: "no_extractable_text",
      detail:
        "We couldn't find enough text to scan for fillable fields — this PDF appears to be " +
        "scanned images. Run OCR first, then try again.",
      ocrCandidatePages: result.ocrCandidatePages,
    });
  }

  // -- 6. Persist summary + ai_outputs row -----------------------------
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
        toolId: "ai-sign",
      });
      await tx.insert(schema.aiOutputs).values({
        fileId,
        kind: "signing",
        contentMd: result.markdown,
        idempotencyKey,
        meta: {
          sourceSha256: sha256,
          sourceName: pdfFile.name,
          sourcePageCount: result.pageCount,
          filled: result.filled,
          filledCount: result.filled.length,
          unfilled: result.unfilled,
          unfilledCount: result.unfilled.length,
          signedPdfFilename: result.signedPdfFilename,
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
    console.error("[/api/ai/sign] persistence failed", { userId, fileId, err });
    // We still hand back the signed PDF — don't hold the user's
    // download hostage just because we couldn't write a summary row.
    return json(207, {
      warning: "persist_failed",
      detail:
        "PDF filled and signed but the summary couldn't be saved to /app/files. " +
        "Download the PDF below before leaving this page — the summary won't be recoverable.",
      signedPdfBase64: Buffer.from(result.pdfBytes).toString("base64"),
      signedPdfFilename: result.signedPdfFilename,
      markdown: result.markdown,
      filled: result.filled,
      unfilled: result.unfilled,
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
    signedPdfBase64: Buffer.from(result.pdfBytes).toString("base64"),
    signedPdfFilename: result.signedPdfFilename,
    markdown: result.markdown,
    filled: result.filled,
    unfilled: result.unfilled,
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
 * the PDF itself. Matches the redact/rewrite/table naming pattern.
 *
 *   input:  "Employee Agreement.pdf"  →  "Employee Agreement — Fill & Sign Report.md"
 *   input:  "draft.pdf"               →  "draft — Fill & Sign Report.md"
 */
function deriveSummaryFilename(source: string): string {
  const base = source.replace(/\.pdf$/i, "").trim() || "document";
  return `${base} — Fill & Sign Report.md`;
}

/**
 * Parse the multipart `info` field into a SignUserInfo. Enforces:
 *   - Valid JSON
 *   - fullName is a non-empty string (the only hard requirement)
 *   - Every other well-known field, if present, is a string
 *   - customFields, if present, is an array of {key, value} string pairs
 *     (capped at 20 to keep the prompt budget healthy)
 */
function parseUserInfo(raw: string): SignUserInfo {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("info is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("info must be a JSON object");
  }
  const obj = parsed as Record<string, unknown>;

  const fullName = typeof obj.fullName === "string" ? obj.fullName.trim() : "";
  if (fullName.length === 0) {
    throw new Error("info.fullName is required");
  }

  const out: SignUserInfo = { fullName };

  const optKeys = [
    "initials",
    "email",
    "phone",
    "date",
    "company",
    "title",
    "address",
  ] as const;
  for (const k of optKeys) {
    const v = obj[k];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v !== "string") {
      throw new Error(`info.${k} must be a string if present`);
    }
    const trimmed = v.trim();
    if (trimmed.length > 0) {
      (out as unknown as Record<string, string>)[k] = trimmed;
    }
  }

  if (obj.customFields !== undefined) {
    if (!Array.isArray(obj.customFields)) {
      throw new Error("info.customFields must be an array");
    }
    if (obj.customFields.length > 20) {
      throw new Error("info.customFields supports at most 20 entries");
    }
    const customFields: Array<{ key: string; value: string }> = [];
    for (const entry of obj.customFields) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error("each info.customFields entry must be {key, value}");
      }
      const e = entry as Record<string, unknown>;
      const key = typeof e.key === "string" ? e.key.trim() : "";
      const value = typeof e.value === "string" ? e.value.trim() : "";
      if (key.length === 0 || value.length === 0) continue;
      customFields.push({ key, value });
    }
    if (customFields.length > 0) {
      out.customFields = customFields;
    }
  }

  return out;
}
