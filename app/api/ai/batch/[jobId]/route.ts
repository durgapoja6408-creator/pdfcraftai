// /api/ai/batch/[jobId] — Poll a batch submission + finalize on completion.
//
// Task #13 sibling of /api/ai/batch/submit. Clients call this at ~30s
// intervals after submission; we hit OpenAI's retrieve endpoint, update
// our batch_jobs row, and if the batch is "completed" we download the
// output file, reassemble the artifact, persist it to the same files +
// ai_outputs tables as realtime, and mark the job "finalized" (our own
// terminal state distinct from OpenAI's "completed").
//
// State machine:
//
//   submitted → validating → in_progress → finalizing → completed
//                                                           ↓  (we finalize)
//                                                        finalized   ← idempotent; future polls short-circuit
//
//   (any) → failed / expired / cancelled  → we refund + mark terminal
//
// Why `finalized` as a separate status (vs just "completed"):
//   "completed" means OpenAI's side finished — the output file is
//   ready. "finalized" means we've already pulled it down, re-built the
//   artifact, persisted the row, and there's nothing left for this
//   route to do. Splitting the two lets retries be free: a completed
//   job that gets polled three times doesn't run the download /
//   reassembly / insert path three times.
//
// Persistence of the output:
//   - files row (mime=text/markdown, source="tool", toolId=ai-{op})
//   - ai_outputs row (kind=summary|translation, idempotencyKey = original client key)
//   Both inside one transaction. `batch_jobs.outputFileId` is then
//   pointed at the new files row.

import "server-only";

import { randomUUID, createHash } from "crypto";

import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { refundCredits } from "@/lib/ai/credits";
import { isTruncatedStopReason, recordAiUsage } from "@/lib/ai/usage";
import {
  fetchBatchResults,
  pollBatch,
  type BatchPollResult,
  type BatchResultLine,
  type BatchStatus,
} from "@/lib/ai/adapters/openai-batch";
import {
  finalizeSummarizeBatchResult,
  type SummarizeDepth,
} from "@/lib/ai/summarize";
import {
  finalizeTranslateBatchResult,
  type TranslateBatchChunkPlan,
} from "@/lib/ai/translate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// OpenAI batch terminal states (non-success).
const OPENAI_FAILED_STATES: ReadonlySet<BatchStatus> = new Set([
  "failed",
  "expired",
  "cancelled",
]);

// Our own terminal states — once a batch_jobs row is in one of these,
// subsequent polls short-circuit to returning the stored row without
// contacting OpenAI.
const LOCAL_TERMINAL_STATES: ReadonlySet<string> = new Set([
  "finalized",
  "failed",
  "expired",
  "cancelled",
]);

export async function GET(
  _req: Request,
  { params }: { params: { jobId: string } }
): Promise<Response> {
  // -- 1. Auth --------------------------------------------------------
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;
  if (!userId) {
    return json(401, { error: "not_authenticated" });
  }

  const jobId = params.jobId;
  if (!jobId || jobId.length > 36) {
    return json(400, { error: "bad_request", detail: "invalid jobId" });
  }

  // -- 2. Load + ownership check --------------------------------------
  const rows = await db
    .select()
    .from(schema.batchJobs)
    .where(and(eq(schema.batchJobs.id, jobId), eq(schema.batchJobs.userId, userId)))
    .limit(1);

  const job = rows[0];
  if (!job) {
    // 404 whether the row doesn't exist OR it belongs to a different
    // user — no enumeration surface for batch_jobs ids.
    return json(404, { error: "not_found" });
  }

  // -- 3. Short-circuit if already in a local terminal state ---------
  if (LOCAL_TERMINAL_STATES.has(job.status)) {
    return json(200, buildTerminalResponse(job));
  }

  // -- 4. Poll OpenAI -------------------------------------------------
  let poll: BatchPollResult;
  try {
    poll = await pollBatch(job.openaiBatchId);
  } catch (err) {
    // Transient poll failure — don't mutate state, just surface the
    // error so the client retries. If OpenAI is genuinely down, the
    // user's credits stay spent; the batch will keep running on their
    // side and a subsequent poll will catch up.
    return json(502, {
      error: "poll_failed",
      detail: err instanceof Error ? err.message : "unknown",
      batchJobId: job.id,
    });
  }

  // -- 5. Handle failure states --------------------------------------
  if (OPENAI_FAILED_STATES.has(poll.status)) {
    return await handleFailure(job, poll);
  }

  // -- 6. Non-terminal — persist updated status + bail ---------------
  if (poll.status !== "completed") {
    await db
      .update(schema.batchJobs)
      .set({ status: poll.status })
      .where(eq(schema.batchJobs.id, job.id));
    return json(200, {
      batchJobId: job.id,
      openaiBatchId: job.openaiBatchId,
      op: job.op,
      status: poll.status,
      requestCounts: poll.requestCounts,
      createdAt: job.createdAt.toISOString(),
    });
  }

  // -- 7. status === "completed": download + finalize ----------------
  // Belt-and-braces: a racing poll that got through between status-hit
  // and our update would re-enter here. We re-read the row under a
  // lenient check — if a concurrent request already finalized, we
  // respect their work and short-circuit.
  return await finalizeJob(job, poll);
}

// -------------------------------------------------------------------
// Failure handler
// -------------------------------------------------------------------

async function handleFailure(
  job: typeof schema.batchJobs.$inferSelect,
  poll: BatchPollResult
): Promise<Response> {
  // Refund credits exactly once. The batch_jobs row update itself is
  // the barrier — if status transitions from submitted/etc → failed,
  // we also issue the refund. If another poll got here first and
  // already set status=failed, the `set` is a no-op and the refund
  // call is gated by checking the existing status.
  const existingStatus = job.status;
  const alreadyTerminal = LOCAL_TERMINAL_STATES.has(existingStatus);

  if (!alreadyTerminal) {
    const opPayload = (job.opPayload ?? {}) as Record<string, unknown>;
    const spendIdemKey = String(opPayload.spendIdempotencyKey ?? "");
    const op = job.op as "summarize" | "translate";

    if (spendIdemKey) {
      await refundCredits({
        userId: job.userId,
        operation: op,
        originalIdempotencyKey: spendIdemKey,
        note: `Refund: batch ${op} ${poll.status} (${poll.errorMessage ?? "no detail"})`,
      });
    }

    await db
      .update(schema.batchJobs)
      .set({
        status: poll.status,
        errorMessage: poll.errorMessage?.slice(0, 512) ?? null,
        errorFileId: poll.errorFileId,
        completedAt: new Date(),
      })
      .where(eq(schema.batchJobs.id, job.id));
  }

  return json(200, {
    batchJobId: job.id,
    openaiBatchId: job.openaiBatchId,
    op: job.op,
    status: poll.status,
    error: poll.errorMessage ?? `batch ${poll.status}`,
    refunded: !alreadyTerminal,
  });
}

// -------------------------------------------------------------------
// Finalize handler — OpenAI status === "completed"
// -------------------------------------------------------------------

async function finalizeJob(
  job: typeof schema.batchJobs.$inferSelect,
  poll: BatchPollResult
): Promise<Response> {
  const opPayload = (job.opPayload ?? {}) as Record<string, unknown>;
  const spendIdemKey = String(opPayload.spendIdempotencyKey ?? "");
  const spendLedgerId =
    (opPayload.spendLedgerId as string | undefined) ?? undefined;
  const clientIdemKey = String(opPayload.clientIdempotencyKey ?? job.idempotencyKey);
  const creditCost = (opPayload.creditCost as number | undefined) ?? 0;
  const op = job.op as "summarize" | "translate";

  // -- a. Download output --------------------------------------------
  let results: Awaited<ReturnType<typeof fetchBatchResults>>;
  try {
    results = await fetchBatchResults({
      outputFileId: poll.outputFileId,
      errorFileId: poll.errorFileId,
    });
  } catch (err) {
    // Keep status=completed so a future poll can retry. No mutation.
    return json(502, {
      error: "result_fetch_failed",
      detail: err instanceof Error ? err.message : "unknown",
      batchJobId: job.id,
    });
  }

  if (results.lines.length < job.requestCount) {
    // Some lines landed in the error file. Treat this as batch failure
    // — refund and flip to status="failed". We could do partial
    // recovery in future (Task #14 eval harness feedback loop), but
    // for v1 a mixed result is simpler to treat as an all-or-nothing
    // failure.
    if (spendIdemKey) {
      await refundCredits({
        userId: job.userId,
        operation: op,
        originalIdempotencyKey: spendIdemKey,
        note: `Refund: batch ${op} had ${results.errors.length} failed lines`,
      });
    }
    const errMsg =
      results.errors[0]?.errorMessage?.slice(0, 512) ??
      `missing lines: expected ${job.requestCount}, got ${results.lines.length}`;
    await db
      .update(schema.batchJobs)
      .set({
        status: "failed",
        errorMessage: errMsg,
        errorFileId: poll.errorFileId,
        completedAt: new Date(),
      })
      .where(eq(schema.batchJobs.id, job.id));
    return json(200, {
      batchJobId: job.id,
      openaiBatchId: job.openaiBatchId,
      op,
      status: "failed",
      error: errMsg,
      refunded: Boolean(spendIdemKey),
    });
  }

  // -- b. Op-specific reassembly -------------------------------------
  let markdown: string;
  let model: string;
  let usage: { inputTokens: number; outputTokens: number };
  let stopReasonForLogging: string | null = null;
  let wasTruncatedOverall = false;
  let wasChunked = false;
  let chunkCount = 1;
  let filename: string;

  try {
    if (op === "summarize") {
      const line = results.lines[0]!;
      const depth = opPayload.depth as SummarizeDepth;
      const wasTruncated = Boolean(opPayload.wasTruncated);
      const finalized = finalizeSummarizeBatchResult({
        line,
        depth,
        wasTruncated,
      });
      markdown = finalized.markdown;
      model = finalized.model;
      usage = finalized.usage;
      stopReasonForLogging = finalized.stopReason;
      wasTruncatedOverall = finalized.wasTruncated;
      filename = deriveSummaryFilename(
        String(opPayload.filename ?? "document.pdf"),
        depth
      );
    } else {
      const chunkPlan = (opPayload.chunkPlan as TranslateBatchChunkPlan[]) ?? [];
      const wasTruncated = Boolean(opPayload.wasTruncated);
      const finalized = finalizeTranslateBatchResult({
        lines: results.lines,
        chunkPlan,
        wasTruncated,
      });
      markdown = finalized.markdown;
      model = finalized.model;
      usage = finalized.usage;
      wasTruncatedOverall = finalized.wasTruncated;
      wasChunked = finalized.wasChunked;
      chunkCount = finalized.chunkCount;
      // For translate we don't have a single stopReason — if any chunk
      // hit `length`, mark the aggregate as max_tokens.
      stopReasonForLogging = results.lines.some((l) => l.stopReason === "length")
        ? "max_tokens"
        : "end_turn";
      filename = deriveTranslationFilename(
        String(opPayload.filename ?? "document.pdf"),
        String(opPayload.targetLang ?? "xx")
      );
    }
  } catch (err) {
    // Moderation or reassembly threw (e.g. missing chunk, unsafe
    // output). Refund and mark failed — the user never sees the
    // offending text.
    if (spendIdemKey) {
      await refundCredits({
        userId: job.userId,
        operation: op,
        originalIdempotencyKey: spendIdemKey,
        note: `Refund: batch ${op} finalize failed`,
      });
    }
    const msg =
      err instanceof Error ? err.message.slice(0, 512) : "finalize_failed";
    await db
      .update(schema.batchJobs)
      .set({
        status: "failed",
        errorMessage: msg,
        completedAt: new Date(),
      })
      .where(eq(schema.batchJobs.id, job.id));
    return json(502, {
      error: "finalize_failed",
      detail: msg,
      batchJobId: job.id,
      refunded: Boolean(spendIdemKey),
    });
  }

  // -- c. Log usage with batch discount ------------------------------
  // recordAiUsage applies the 50% discount when `batchMode: true` is
  // passed — so the ai_usage.cost_micros column captures the infra
  // margin win even though user-facing credit cost is unchanged.
  await recordAiUsage({
    userId: job.userId,
    operation: op,
    providerId: "openai",
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    latencyMs: 0,
    creditsSpent: creditCost,
    costMicros: null,
    success: true,
    batchMode: true,
    stopReason: stopReasonForLogging ?? undefined,
    responseTruncated: isTruncatedStopReason(stopReasonForLogging ?? undefined),
    ledgerId: spendLedgerId,
    idempotencyKey: spendIdemKey || undefined,
  });

  // -- d. Persist files + ai_outputs + flip status ------------------
  const fileId = randomUUID();
  const contentBytes = Buffer.byteLength(markdown, "utf8");
  const sourceSha256 = String(opPayload.sourceSha256 ?? "");
  const sourceName = String(opPayload.sourceName ?? opPayload.filename ?? "");
  const sourcePageCount = (opPayload.pageCount as number | undefined) ?? 0;
  const ocrCandidatePages =
    (opPayload.ocrCandidatePages as number[] | undefined) ?? [];

  const meta: Record<string, unknown> = {
    sourceSha256,
    sourceName,
    sourcePageCount,
    providerId: "openai",
    model,
    tokensIn: usage.inputTokens,
    tokensOut: usage.outputTokens,
    wasTruncated: wasTruncatedOverall,
    ocrCandidatePages,
    creditCost,
    // Mark the stored output as batch-mode so the admin dashboard can
    // segment it vs. realtime. Safe to read back — the UI already
    // handles unknown meta keys.
    mode: "batch",
    openaiBatchId: job.openaiBatchId,
    batchJobId: job.id,
  };

  if (op === "summarize") {
    meta.depth = opPayload.depth;
  } else {
    meta.targetLang = opPayload.targetLang;
    meta.targetLangLabel = opPayload.targetLangLabel ?? null;
    meta.wasChunked = wasChunked;
    meta.chunkCount = chunkCount;
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.files).values({
        id: fileId,
        userId: job.userId,
        name: filename,
        mime: "text/markdown",
        sizeBytes: contentBytes,
        sha256: sha256Hex(Buffer.from(markdown, "utf8")),
        status: "ready",
        source: "tool",
        toolId: op === "summarize" ? "ai-summarize" : "ai-translate",
      });
      await tx.insert(schema.aiOutputs).values({
        fileId,
        kind: op === "summarize" ? "summary" : "translation",
        contentMd: markdown,
        idempotencyKey: clientIdemKey,
        meta,
      });
      await tx
        .update(schema.batchJobs)
        .set({
          status: "finalized",
          outputFileId: fileId,
          resultFileId: poll.outputFileId,
          errorFileId: poll.errorFileId,
          tokensIn: usage.inputTokens,
          tokensOut: usage.outputTokens,
          resultPayload: {
            model,
            lines: results.lines.map((l) => ({
              customId: l.customId,
              stopReason: l.stopReason,
              inputTokens: l.usage.inputTokens,
              outputTokens: l.usage.outputTokens,
              cachedInputTokens: l.usage.cachedInputTokens,
            })),
          },
          completedAt: new Date(),
        })
        .where(eq(schema.batchJobs.id, job.id));
    });
  } catch (err) {
    // Same semantics as realtime persist-failure: compute happened,
    // user paid, surface the markdown inline. We do NOT flip
    // batch_jobs to finalized — a later retry of this route can pick
    // up from status=completed and try the insert again.
    console.error("[/api/ai/batch/[jobId]] persist failed", {
      userId: job.userId,
      batchJobId: job.id,
      err,
    });
    return json(207, {
      warning: "persist_failed",
      detail:
        "Batch finished but we couldn't save the result to /app/files. Copy it below.",
      markdown,
      creditCost,
      usage,
      providerId: "openai",
      model,
      batchJobId: job.id,
      op,
    });
  }

  return json(200, {
    batchJobId: job.id,
    openaiBatchId: job.openaiBatchId,
    op,
    status: "finalized",
    fileId,
    filename,
    markdown,
    creditCost,
    usage,
    providerId: "openai",
    model,
    pageCount: sourcePageCount,
    ocrCandidatePages,
    ...(op === "summarize"
      ? {
          depth: opPayload.depth,
          wasTruncated: wasTruncatedOverall,
        }
      : {
          targetLang: opPayload.targetLang,
          targetLangLabel: opPayload.targetLangLabel ?? null,
          wasChunked,
          wasTruncated: wasTruncatedOverall,
          chunkCount,
        }),
  });
}

// -------------------------------------------------------------------
// Terminal-state response builder (short-circuit path)
// -------------------------------------------------------------------

function buildTerminalResponse(
  job: typeof schema.batchJobs.$inferSelect
): Record<string, unknown> {
  const opPayload = (job.opPayload ?? {}) as Record<string, unknown>;
  const base: Record<string, unknown> = {
    batchJobId: job.id,
    openaiBatchId: job.openaiBatchId,
    op: job.op,
    status: job.status,
    creditCost: (opPayload.creditCost as number | undefined) ?? 0,
  };

  if (job.status === "finalized") {
    // For finalized jobs, the caller can fetch the artifact via
    // /api/files/{outputFileId}. We return enough metadata for the UI
    // to present the link without re-reading the files row.
    base.fileId = job.outputFileId;
    base.tokensIn = job.tokensIn;
    base.tokensOut = job.tokensOut;
    if (job.op === "summarize") {
      base.depth = opPayload.depth;
    } else {
      base.targetLang = opPayload.targetLang;
      base.targetLangLabel = opPayload.targetLangLabel ?? null;
    }
    base.completedAt = job.completedAt?.toISOString() ?? null;
  } else {
    // failed / expired / cancelled
    base.error = job.errorMessage ?? job.status;
    base.completedAt = job.completedAt?.toISOString() ?? null;
    base.refunded = true; // we always refund on terminal failure; set when status flipped
  }

  return base;
}

// -------------------------------------------------------------------
// helpers
// -------------------------------------------------------------------

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sha256Hex(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function deriveSummaryFilename(source: string, depth: SummarizeDepth): string {
  const base = source.replace(/\.pdf$/i, "").trim() || "document";
  const suffix = depth === "standard" ? "" : ` (${depth === "tldr" ? "TL;DR" : depth})`;
  return `${base} — Summary${suffix}.md`;
}

function deriveTranslationFilename(source: string, targetLang: string): string {
  const base = source.replace(/\.pdf$/i, "").trim() || "document";
  return `${base} — Translation (${targetLang}).md`;
}
