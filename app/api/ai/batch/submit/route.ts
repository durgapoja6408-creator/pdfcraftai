// /api/ai/batch/submit — Submit a non-urgent AI op to OpenAI's Batch API.
//
// Task #13 (Net Margin Roadmap, Phase A item #4). This route is the
// batch-mode sibling of the realtime `/api/ai/summarize` and
// `/api/ai/translate` endpoints. A batch submission returns within
// seconds but the ACTUAL work completes asynchronously (up to 24h SLA
// on OpenAI's side — usually <15 minutes in practice). The polling
// sibling at `/api/ai/batch/[jobId]` is what reads out the finalized
// result.
//
// Why a dedicated route instead of `mode=batch` on the realtime ones:
//   1. Response shapes differ. Realtime returns the finalized artifact
//      inline; batch returns only `{batchJobId, openaiBatchId, status}`
//      until polling resolves. Branching a single route would force the
//      client to type-discriminate on every response — clunky.
//   2. The realtime path is the load-bearing UX. Keeping it untouched
//      means zero regression risk for the 95% of users who want
//      immediate results.
//   3. Batch has different failure modes (expired, cancelled, partial
//      errors) that need their own persistence plan. Forking routes
//      keeps the state machine legible.
//
// Supported ops:
//   - summarize (single-request batch, depth in {tldr, standard, detailed})
//   - translate (one request per chunk — see buildTranslateBatchPlan)
//
// Credit accounting:
//   - Credits spend at SUBMIT time, identical UX to realtime. The user
//     has "paid" as soon as the batch enters OpenAI's queue.
//   - The 50% batch discount applies to ai_usage.cost_micros only, NOT
//     to user-facing credits. That's the infra margin win: we keep the
//     saved cost on the COGS side.
//   - On batch failure/expiration the poll route refunds via the same
//     idempotency key (`ai:batch:{op}:{idempotencyKey}`).
//
// Idempotency:
//   - `batch_jobs.idempotency_key` has a UNIQUE (user_id, key) index.
//   - Submitting the same op with the same key replays the stored row
//     (returns the existing batch_jobs.id + status without a second
//     OpenAI submission).

import "server-only";

import { randomUUID, createHash } from "crypto";

import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { extractPdfText } from "@/lib/ai/pdf-extract";
import { refundCredits, spendCredits } from "@/lib/ai/credits";
import { isBatchEligible } from "@/lib/ai/router";
import { guardAiRoute } from "@/lib/ai/route-guards";
import {
  buildSummarizeBatchRequest,
  type SummarizeDepth,
} from "@/lib/ai/summarize";
import {
  buildTranslateBatchPlan,
  COMMON_TARGET_LANGUAGES,
} from "@/lib/ai/translate";
import { submitBatch } from "@/lib/ai/adapters/openai-batch";
import { AIProviderError } from "@/lib/ai/provider";
import type { AIOp } from "@/lib/ai/router";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Same ceiling as the realtime routes.
const MAX_PDF_BYTES = 25 * 1024 * 1024;

// Valid summarize depth strings. Mirror of /api/ai/summarize.
const VALID_DEPTHS: readonly SummarizeDepth[] = ["tldr", "standard", "detailed"];

// BCP-47-ish language code regex — same validator as /api/ai/translate.
const BCP47_ISH = /^[a-zA-Z]{1,3}(-[a-zA-Z0-9]{1,8})*$/;

// Build curated label lookup so batch jobs inherit the same "pt" →
// "Português" enrichment the realtime translate route uses.
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

  // -- 2. Parse body --------------------------------------------------
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: "bad_request", detail: "expected multipart/form-data" });
  }

  const opRaw = stringField(form, "op");
  if (!opRaw) {
    return json(400, { error: "bad_request", detail: "op is required" });
  }

  // Enforce batch eligibility BEFORE kill-switch / credit logic — an
  // ineligible op is a 400 we can return with zero side effects.
  const eligibleOps: AIOp[] = ["summarize", "translate"];
  if (!eligibleOps.includes(opRaw as AIOp) || !isBatchEligible(opRaw as AIOp)) {
    return json(400, {
      error: "bad_request",
      detail: `op "${opRaw}" is not batch-eligible. Supported: ${eligibleOps.join(", ")}`,
    });
  }
  const op = opRaw as "summarize" | "translate";

  // -- 2b. Kill switch + daily cost ceiling --------------------------
  const gate = await guardAiRoute(op, userId);
  if (gate) return gate;

  // -- 3. Op-agnostic fields -----------------------------------------
  const pdfFile = form.get("pdf");
  const idempotencyKey = stringField(form, "idempotencyKey") ?? randomUUID();

  if (!(pdfFile instanceof File) || pdfFile.size === 0) {
    return json(400, { error: "bad_request", detail: "pdf is required" });
  }
  if (pdfFile.size > MAX_PDF_BYTES) {
    return json(413, { error: "pdf_too_large", maxBytes: MAX_PDF_BYTES });
  }

  // -- 4. Op-specific fields -----------------------------------------
  let depth: SummarizeDepth | null = null;
  let targetLang: string | null = null;
  let targetLangLabel: string | undefined;

  if (op === "summarize") {
    const depthRaw = stringField(form, "depth") ?? "standard";
    if (!VALID_DEPTHS.includes(depthRaw as SummarizeDepth)) {
      return json(400, {
        error: "bad_request",
        detail: `depth must be one of: ${VALID_DEPTHS.join(", ")}`,
      });
    }
    depth = depthRaw as SummarizeDepth;
  } else {
    // op === "translate"
    const targetLangRaw = stringField(form, "targetLang");
    if (!targetLangRaw || !BCP47_ISH.test(targetLangRaw) || targetLangRaw.length > 20) {
      return json(400, {
        error: "bad_request",
        detail: "targetLang must be a BCP-47 language code (e.g. 'en', 'pt-BR', 'zh-Hant')",
      });
    }
    targetLang = targetLangRaw;
    targetLangLabel = CURATED_LABEL_BY_CODE.get(targetLang);
  }

  // -- 5. Replay check ------------------------------------------------
  // If a batch_jobs row already exists for this (user, key), return it
  // unchanged. Client can keep polling the original job; no second
  // OpenAI submission, no second credit debit. Note this is separate
  // from realtime's `findAiOutputByIdempotencyKey` — batch jobs live in
  // a different table, so their idempotency space is disjoint.
  const existing = await db
    .select()
    .from(schema.batchJobs)
    .where(
      and(
        eq(schema.batchJobs.userId, userId),
        eq(schema.batchJobs.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0]!;
    return json(200, {
      batchJobId: row.id,
      openaiBatchId: row.openaiBatchId,
      status: row.status,
      op: row.op,
      requestCount: row.requestCount,
      replay: true,
    });
  }

  const pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());
  const sha256 = sha256Hex(pdfBytes);

  // -- 6. Spend credits ----------------------------------------------
  // Key scheme mirrors realtime: `ai:batch:{op}:{idempotencyKey}` —
  // distinguishable from `ai:summarize:...` in the ledger so admin
  // queries can segment batch vs. realtime spend.
  const spendKey = `ai:batch:${op}:${idempotencyKey}`;
  const spend = await spendCredits({
    userId,
    operation: op,
    idempotencyKey: spendKey,
    note:
      op === "summarize"
        ? `Batch summarize "${pdfFile.name}" (${depth})`
        : `Batch translate "${pdfFile.name}" → ${targetLangLabel ?? targetLang}`,
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
        "A previous batch attempt under this key did not complete. Retry with a new submission.",
    });
  }
  const creditCost = spend.creditsSpent;
  const newBalance = spend.newBalance;

  // -- 7. Extract PDF text --------------------------------------------
  let extracted: Awaited<ReturnType<typeof extractPdfText>>;
  try {
    extracted = await extractPdfText(pdfBytes);
  } catch (err) {
    await refundCredits({
      userId,
      operation: op,
      originalIdempotencyKey: spendKey,
      note: "Refund: batch PDF extraction failed",
    });
    const message = err instanceof Error ? err.message : "pdf_extract_failed";
    return json(400, { error: "pdf_extract_failed", detail: message });
  }

  if (extracted.fullText.trim().length < 40) {
    await refundCredits({
      userId,
      operation: op,
      originalIdempotencyKey: spendKey,
      note: "Refund: batch — no extractable text",
    });
    return json(422, {
      error: "no_extractable_text",
      detail:
        "We couldn't find enough text to process in batch mode — this PDF appears to be scanned images.",
      ocrCandidatePages: extracted.ocrCandidatePages,
    });
  }

  // -- 8. Build batch plan -------------------------------------------
  // One `batch_jobs.id` is allocated here up front so translate can
  // embed it as the customId prefix (one customId per chunk).
  const batchJobId = randomUUID();

  let requests: import("@/lib/ai/adapters/openai-batch").BatchRequest[];
  let model: string;
  let opPayload: Record<string, unknown>;
  let requestCount: number;

  if (op === "summarize") {
    const plan = buildSummarizeBatchRequest({
      text: extracted.fullText,
      pageCount: extracted.pageCount,
      filename: pdfFile.name,
      depth: depth!,
      ocrCandidatePages: extracted.ocrCandidatePages,
      customId: `${batchJobId}-0`,
    });
    requests = [plan.request];
    model = plan.model;
    requestCount = 1;
    opPayload = {
      op: "summarize",
      filename: pdfFile.name,
      depth,
      pageCount: extracted.pageCount,
      sourceSha256: sha256,
      sourceName: pdfFile.name,
      ocrCandidatePages: extracted.ocrCandidatePages,
      wasTruncated: plan.wasTruncated,
      truncatedCharCount: plan.truncatedCharCount,
      creditCost,
      spendLedgerId: spend.ledgerId,
      spendIdempotencyKey: spendKey,
      clientIdempotencyKey: idempotencyKey,
      customIdPrefix: batchJobId,
    };
  } else {
    const plan = buildTranslateBatchPlan({
      text: extracted.fullText,
      pageCount: extracted.pageCount,
      filename: pdfFile.name,
      targetLang: targetLang!,
      targetLangLabel,
      ocrCandidatePages: extracted.ocrCandidatePages,
      customIdPrefix: batchJobId,
    });
    requests = plan.requests;
    model = plan.model;
    requestCount = plan.chunkCount;
    opPayload = {
      op: "translate",
      filename: pdfFile.name,
      targetLang,
      targetLangLabel: targetLangLabel ?? null,
      pageCount: extracted.pageCount,
      sourceSha256: sha256,
      sourceName: pdfFile.name,
      ocrCandidatePages: extracted.ocrCandidatePages,
      totalChars: plan.totalChars,
      chunkCount: plan.chunkCount,
      chunkPlan: plan.chunkPlan,
      wasTruncated: plan.wasTruncated,
      creditCost,
      spendLedgerId: spend.ledgerId,
      spendIdempotencyKey: spendKey,
      clientIdempotencyKey: idempotencyKey,
      customIdPrefix: batchJobId,
    };
  }

  // -- 9. Submit to OpenAI -------------------------------------------
  let submitResult: Awaited<ReturnType<typeof submitBatch>>;
  try {
    submitResult = await submitBatch({
      requests,
      description: `${op} | ${pdfFile.name}`.slice(0, 200),
      metadata: {
        // Keys ≤64 chars; values ≤512 chars. OpenAI echoes these back on
        // retrieve so they're a cheap debugging breadcrumb.
        op,
        user_id: userId,
        batch_job_id: batchJobId,
      },
    });
  } catch (err) {
    // Submission failed — OpenAI never queued anything, so refund the
    // credit spend. No batch_jobs row to clean up (we haven't inserted
    // it yet).
    await refundCredits({
      userId,
      operation: op,
      originalIdempotencyKey: spendKey,
      note: `Refund: batch submit failed (${err instanceof Error ? err.name : "unknown"})`,
    });
    if (err instanceof AIProviderError) {
      return json(502, {
        error: "batch_submit_failed",
        detail: err.message,
        kind: err.code,
      });
    }
    return json(502, {
      error: "batch_submit_failed",
      detail: err instanceof Error ? err.message : "unknown",
    });
  }

  // -- 10. Persist batch_jobs row ------------------------------------
  try {
    await db.insert(schema.batchJobs).values({
      id: batchJobId,
      userId,
      op,
      openaiBatchId: submitResult.batchId,
      status: submitResult.initialStatus,
      requestCount,
      opPayload,
      idempotencyKey,
    });
  } catch (err) {
    // Persistence failed AFTER OpenAI accepted the batch. We can't
    // cancel (we'd need the batch_jobs row to find the openaiBatchId
    // on polling). Best effort: log loud and refund — the user would
    // lose the ability to pick up the result anyway.
    console.error("[/api/ai/batch/submit] batch_jobs insert failed", {
      userId,
      batchJobId,
      openaiBatchId: submitResult.batchId,
      err,
    });
    await refundCredits({
      userId,
      operation: op,
      originalIdempotencyKey: spendKey,
      note: "Refund: batch row persist failed (OpenAI batch orphaned)",
    });
    return json(500, {
      error: "batch_persist_failed",
      detail:
        "Batch was submitted to OpenAI but we couldn't save the tracking row. Credits refunded.",
      openaiBatchId: submitResult.batchId,
    });
  }

  return json(200, {
    batchJobId,
    openaiBatchId: submitResult.batchId,
    status: submitResult.initialStatus,
    op,
    requestCount,
    creditCost,
    newBalance,
    model,
    pageCount: extracted.pageCount,
    ocrCandidatePages: extracted.ocrCandidatePages,
    // Client should start polling /api/ai/batch/{batchJobId} at ~30s
    // intervals. Typical finalize is <15 min; 24h is the hard SLA.
    pollAfterSeconds: 30,
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
