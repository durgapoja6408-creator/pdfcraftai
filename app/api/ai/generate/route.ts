// /api/ai/generate — Generate a PDF from a text prompt. Returns the PDF
// bytes (base64) + the source markdown we stored on /app/files.
//
// Shape is a cousin of /api/ai/redact: flat-priced AI op, PDF binary in
// the response body (no storage infra), markdown persisted. Differences
// worth calling out:
//
//   - Accepts a JSON body (not multipart) — this op takes a prompt, not
//     a file. The route still allows multipart for future-proofing
//     (attachments TBD) but today the only fields we read are text.
//   - Operation id is "generate" (20 credits flat, per lib/pricing.ts).
//   - aiOutputs.kind is "generation". contentMd = the markdown we got
//     from the model.
//   - Replay branch: same caveat as /api/ai/redact — we don't persist
//     PDF bytes, so replays return `pdfBase64: null` and the client
//     shows "run again for a fresh download."
//   - Filename conventions:
//       PDF download name: "<title>.pdf" (from generate.ts)
//       Persisted markdown: "<title> — Generated.md"

import "server-only";

import { randomUUID, createHash } from "crypto";

import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { refundCredits, spendCredits } from "@/lib/ai/credits";
// 2026-05-04 (PENDING §6b corollary / AI_USAGE_INSTRUMENTATION_GAP) —
// Batch 2: generate joins the instrumented set.
import { recordAiUsage } from "@/lib/ai/usage";
import {
  NoAIProviderConfiguredError,
  generatePdf,
  type GenerateDocType,
  type GenerateLength,
  type GenerateTone,
} from "@/lib/ai/generate";
import { findAiOutputByIdempotencyKey } from "@/lib/ai/idempotency";
import { guardAiRoute } from "@/lib/ai/route-guards";

// Node runtime — pdf-lib + AI SDKs + mysql2 don't run on Edge.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Keep the upper bound sane. A 16 KB prompt is already plenty.
const MAX_PROMPT_CHARS = 16_000;

const VALID_DOC_TYPES: readonly GenerateDocType[] = [
  "memo",
  "report",
  "brief",
  "letter",
  "blog",
  "outline",
  "other",
];
const VALID_LENGTHS: readonly GenerateLength[] = ["short", "medium", "long"];
const VALID_TONES: readonly GenerateTone[] = [
  "neutral",
  "formal",
  "casual",
  "technical",
];

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
  const gate = await guardAiRoute("generate", userId);
  if (gate) return gate;

  // -- 2. Parse body ---------------------------------------------------
  // Accept either JSON or multipart. In practice the client posts JSON;
  // multipart is cheap to support and future-proofs for a v2 where the
  // user attaches a reference file.
  let body: {
    prompt: string;
    title?: string;
    docType?: GenerateDocType;
    length?: GenerateLength;
    tone?: GenerateTone;
    idempotencyKey?: string;
  };
  try {
    body = await parseBody(req);
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : "expected JSON or multipart/form-data";
    return json(400, { error: "bad_request", detail });
  }

  const prompt = (body.prompt ?? "").trim();
  if (prompt.length === 0) {
    return json(400, { error: "bad_request", detail: "prompt is required" });
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return json(413, {
      error: "prompt_too_long",
      maxChars: MAX_PROMPT_CHARS,
    });
  }

  const docType = body.docType ?? "other";
  if (!VALID_DOC_TYPES.includes(docType)) {
    return json(400, {
      error: "bad_request",
      detail: `docType must be one of: ${VALID_DOC_TYPES.join(", ")}`,
    });
  }

  const length = body.length ?? "medium";
  if (!VALID_LENGTHS.includes(length)) {
    return json(400, {
      error: "bad_request",
      detail: `length must be one of: ${VALID_LENGTHS.join(", ")}`,
    });
  }

  const tone = body.tone ?? "neutral";
  if (!VALID_TONES.includes(tone)) {
    return json(400, {
      error: "bad_request",
      detail: `tone must be one of: ${VALID_TONES.join(", ")}`,
    });
  }

  const title = body.title?.trim() || undefined;
  const idempotencyKey = body.idempotencyKey?.trim() || randomUUID();

  // -- 3. Idempotency replay ------------------------------------------
  //
  // Same posture as /api/ai/redact — no PDF byte storage, so replays
  // return `pdfBase64: null` and the client tells the user to re-run
  // for a fresh PDF. The markdown + metadata are all available.
  const replay = await findAiOutputByIdempotencyKey({ userId, idempotencyKey });
  if (replay && replay.kind === "generation") {
    const m = (replay.meta ?? {}) as Record<string, unknown>;
    return json(200, {
      fileId: replay.fileId,
      filename: replay.fileName,
      pdfBase64: null,
      pdfFilename: (m.pdfFilename as string | undefined) ?? null,
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
      pageCount: (m.pageCount as number | undefined) ?? 0,
      docType: (m.docType as GenerateDocType | undefined) ?? docType,
      length: (m.length as GenerateLength | undefined) ?? length,
      tone: (m.tone as GenerateTone | undefined) ?? tone,
      title: (m.title as string | undefined) ?? title,
      replay: true,
    });
  }

  // -- 4. Spend credits ------------------------------------------------
  const spendKey = `ai:generate:${idempotencyKey}`;
  const spendNoteTitle = title ? `"${title}"` : "(untitled)";
  const spend = await spendCredits({
    userId,
    operation: "generate",
    idempotencyKey: spendKey,
    note: `Generate ${docType} ${spendNoteTitle}`,
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

  // -- 5. Generate -----------------------------------------------------
  // 2026-05-04 — capture provider start time for recordAiUsage latency.
  const providerStartedAt = Date.now();
  let result: Awaited<ReturnType<typeof generatePdf>>;
  try {
    result = await generatePdf({
      prompt,
      title,
      docType,
      length,
      tone,
    });
  } catch (err) {
    await refundCredits({
      userId,
      operation: "generate",
      originalIdempotencyKey: spendKey,
      note: `Refund: generate failed (${err instanceof Error ? err.name : "unknown"})`,
    });
    if (err instanceof NoAIProviderConfiguredError) {
      return json(503, { error: "no_ai_provider_configured" });
    }
    const message = err instanceof Error ? err.message : "generate_failed";
    return json(502, { error: "generate_failed", detail: message });
  }

  // 2026-05-04 — Phase A1 audit row.
  const usageRecord = await recordAiUsage({
    userId,
    operation: "generate",
    providerId: result.providerId,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    latencyMs: Date.now() - providerStartedAt,
    creditsSpent: creditCost,
    costMicros: null,
    success: true,
    responseTruncated: result.wasTruncated ? 1 : 0,
    ledgerId: spend.ledgerId,
    idempotencyKey: spendKey,
  });

  // -- 6. Persist summary (markdown) -----------------------------------
  const fileId = randomUUID();
  const resolvedTitle = title || extractFirstHeading(result.markdown) || "Generated document";
  const filename = deriveMarkdownFilename(resolvedTitle);
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
        toolId: "ai-generate",
      });
      await tx.insert(schema.aiOutputs).values({
        fileId,
        kind: "generation",
        contentMd: result.markdown,
        idempotencyKey,
        meta: {
          sourceName: "prompt",
          promptChars: prompt.length,
          title: resolvedTitle,
          docType,
          length,
          tone,
          pageCount: result.pageCount,
          pdfFilename: result.pdfFilename,
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
    console.error("[/api/ai/generate] persistence failed", { userId, fileId, err });
    // Hand back the PDF anyway — user paid for it, they get to download
    // it even if our write path failed. Markdown is in the response too
    // so they can save it client-side.
    return json(207, {
      warning: "persist_failed",
      detail:
        "PDF generated but the markdown source couldn't be saved to /app/files. " +
        "Download the PDF below before leaving this page — the source won't be recoverable.",
      pdfBase64: Buffer.from(result.pdfBytes).toString("base64"),
      pdfFilename: result.pdfFilename,
      markdown: result.markdown,
      creditCost,
      usage: result.usage,
      providerId: result.providerId,
      model: result.model,
      wasTruncated: result.wasTruncated,
      pageCount: result.pageCount,
      docType,
      length,
      tone,
      title: resolvedTitle,
      // 2026-05-04 (PENDING §6b stage 2). FeedbackChip flip semantics.
      aiUsageId: usageRecord.applied ? usageRecord.id : null,
    });
  }

  return json(200, {
    fileId,
    filename,
    pdfBase64: Buffer.from(result.pdfBytes).toString("base64"),
    pdfFilename: result.pdfFilename,
    markdown: result.markdown,
    creditCost,
    newBalance,
    usage: result.usage,
    providerId: result.providerId,
    model: result.model,
    wasTruncated: result.wasTruncated,
    pageCount: result.pageCount,
    docType,
    length,
    tone,
    title: resolvedTitle,
    // 2026-05-04 (PENDING §6b stage 2). FeedbackChip flip semantics.
    aiUsageId: usageRecord.applied ? usageRecord.id : null,
  });
}

// --- helpers ---------------------------------------------------------

async function parseBody(req: Request): Promise<{
  prompt: string;
  title?: string;
  docType?: GenerateDocType;
  length?: GenerateLength;
  tone?: GenerateTone;
  idempotencyKey?: string;
}> {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (ct.includes("application/json")) {
    const j = (await req.json()) as Record<string, unknown>;
    return {
      prompt: typeof j.prompt === "string" ? j.prompt : "",
      title: typeof j.title === "string" ? j.title : undefined,
      docType: typeof j.docType === "string" ? (j.docType as GenerateDocType) : undefined,
      length: typeof j.length === "string" ? (j.length as GenerateLength) : undefined,
      tone: typeof j.tone === "string" ? (j.tone as GenerateTone) : undefined,
      idempotencyKey:
        typeof j.idempotencyKey === "string" ? j.idempotencyKey : undefined,
    };
  }
  if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    return {
      prompt: readField(form, "prompt") ?? "",
      title: readField(form, "title") ?? undefined,
      docType: (readField(form, "docType") as GenerateDocType | null) ?? undefined,
      length: (readField(form, "length") as GenerateLength | null) ?? undefined,
      tone: (readField(form, "tone") as GenerateTone | null) ?? undefined,
      idempotencyKey: readField(form, "idempotencyKey") ?? undefined,
    };
  }
  throw new Error("expected application/json or multipart/form-data");
}

function readField(form: FormData, key: string): string | null {
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
 * Persisted markdown filename pattern:
 *   "Q3 Product Brief" → "Q3 Product Brief — Generated.md"
 */
function deriveMarkdownFilename(title: string): string {
  const safe = title
    .replace(/[\\/:"*?<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "document";
  return `${safe} — Generated.md`;
}

function extractFirstHeading(md: string): string | null {
  const lines = md.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^#{1,3}\s+(.+)$/);
    if (m) return m[1]!.trim();
  }
  return null;
}
