// OpenAI Batch API adapter — async chat-completions at 50% discount.
//
// The realtime OpenAIProvider in `./openai.ts` implements `AIProvider`
// for interactive streaming calls. This module is different: batch is
// asynchronous by nature (24h SLA) and single-shot, so it doesn't fit
// the streaming `chat`/`streamChat` contract. It exposes a narrower
// surface:
//
//   submitBatch({ requests, description? })
//     → { batchId, inputFileId, requestCount }
//
//   pollBatch(batchId)
//     → { status, requestCounts, outputFileId, errorFileId, errorMessage }
//
//   fetchBatchResults({ outputFileId, errorFileId? })
//     → { lines: BatchResultLine[], errors: BatchErrorLine[] }
//
// Each `BatchRequest` models ONE chat-completions call: the same
// prompt/messages/params a realtime call would send, keyed by a stable
// `customId` string. For summarize that's always a single request. For
// translate (chunked) it's one request per chunk, custom_ids named
// `chunk-0`, `chunk-1`, etc.
//
// What this module does NOT do:
//   - It does NOT spend credits or write ai_usage rows. Callers (the
//     summarize/translate submit helpers + the batch polling route) own
//     the accounting because batch_mode=true flows through a different
//     cost-math path in `lib/ai/usage.ts`.
//   - It does NOT register with the provider registry. Batch is an
//     op-level capability, not a provider choice — the router's realtime
//     ladder walk is untouched.
//
// Why only OpenAI (no Anthropic/Gemini batch)
// -------------------------------------------
// Anthropic has a Message Batches API with identical economics (50%
// discount, 24h window) but the JSON wire format differs enough that
// we'd essentially rewrite this file — parameter names, stop-reason
// semantics, token-counting fields. Gemini's batch surface is regional
// and enforces a minimum job size that doesn't match single-PDF use.
// Starting with OpenAI covers the dominant op mix (summarize+translate
// route there or to Gemini at realtime; pushing them ALL to OpenAI in
// batch gives a predictable 50% win). Anthropic batch lands with
// Task #26 as part of the A/B infra.

import "server-only";

import OpenAI, {
  APIError,
  AuthenticationError,
  BadRequestError,
  RateLimitError,
} from "openai";

import { AIProviderError } from "../provider";

// -----------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------

/**
 * A single JSONL line we submit to the batch. Mirrors the shape that
 * OpenAI requires under the `/v1/chat/completions` endpoint:
 *
 *   { custom_id, method, url, body: { model, messages, max_tokens, ... } }
 *
 * Callers build one `BatchRequest` per logical unit of work — for
 * summarize it's always length 1; for translate it's one entry per
 * chunk — and the adapter serialises, uploads, and submits them.
 */
export interface BatchRequest {
  /** Stable per-request id. MUST be unique within a single batch. */
  customId: string;
  model: string;
  messages: BatchMessage[];
  /** Corresponds to OpenAI's `max_tokens`. Required so we don't blow our op-level output caps. */
  maxTokens: number;
  /** Deterministic temperature. Optional. */
  temperature?: number;
  /** Response format override. Optional; omit for plain text. */
  responseFormat?: { type: "json_object" } | { type: "text" };
}

export interface BatchMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface BatchSubmitInput {
  requests: BatchRequest[];
  /** Human-readable tag attached to the batch (shows in OpenAI dashboards). */
  description?: string;
  /** Metadata echoed back on retrieve — handy for debugging. Keys must be <=64 chars. */
  metadata?: Record<string, string>;
}

export interface BatchSubmitResult {
  batchId: string;
  inputFileId: string;
  requestCount: number;
  /** Raw status at submission — should always be "validating" but we echo what OpenAI says. */
  initialStatus: BatchStatus;
}

export type BatchStatus =
  | "validating"
  | "failed"
  | "in_progress"
  | "finalizing"
  | "completed"
  | "expired"
  | "cancelling"
  | "cancelled";

export interface BatchPollResult {
  batchId: string;
  status: BatchStatus;
  requestCounts: {
    total: number;
    completed: number;
    failed: number;
  };
  outputFileId: string | null;
  errorFileId: string | null;
  /** Human-readable failure summary built from `errors.data[]`, empty on success. */
  errorMessage: string | null;
  createdAt: number;
  /** Unix seconds — set when status transitions to a terminal state. */
  completedAt: number | null;
  failedAt: number | null;
  expiredAt: number | null;
  cancelledAt: number | null;
}

/**
 * One successful line in the output JSONL. For a batch with 3 requests
 * you get up to 3 `BatchResultLine`s; any request that failed shows up
 * in the error file instead.
 */
export interface BatchResultLine {
  customId: string;
  statusCode: number;
  model: string;
  content: string;
  stopReason: "stop" | "length" | "content_filter" | "tool_calls" | "other";
  usage: {
    inputTokens: number;
    outputTokens: number;
    /** Cached prompt tokens — present when OpenAI served part of the prompt from its cache. */
    cachedInputTokens: number;
  };
}

export interface BatchErrorLine {
  customId: string;
  statusCode: number;
  errorCode: string | null;
  errorMessage: string;
}

// -----------------------------------------------------------------------
// Client bootstrapping
// -----------------------------------------------------------------------

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AIProviderError(
      "openai",
      "configuration",
      "OPENAI_API_KEY is not set — batch operations require it"
    );
  }
  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

// -----------------------------------------------------------------------
// submitBatch
// -----------------------------------------------------------------------

/**
 * Serialises the given requests to JSONL, uploads via the Files API
 * with purpose="batch", then calls POST /v1/batches with a 24h window.
 *
 * Throws AIProviderError on configuration / upload / submit failure.
 * Caller is expected to have already spent credits against an
 * idempotency key — a thrown error here means caller should refund and
 * surface a user-facing error. We don't retry: batch submission is
 * rare enough that one attempt is cheap to redo from the UI.
 */
export async function submitBatch(
  input: BatchSubmitInput
): Promise<BatchSubmitResult> {
  if (input.requests.length === 0) {
    throw new AIProviderError(
      "openai",
      "bad_response",
      "submitBatch called with zero requests"
    );
  }
  if (input.requests.length > 50_000) {
    // OpenAI enforces 50k lines per batch. We chunk well below that, but
    // a defensive guard makes the error message clear if a caller
    // mis-computes.
    throw new AIProviderError(
      "openai",
      "bad_response",
      `submitBatch: ${input.requests.length} requests exceeds the 50,000-line ceiling`
    );
  }

  // Detect duplicate custom_ids — OpenAI errors on these after upload,
  // and it's much more actionable to catch it before network cost.
  const seen = new Set<string>();
  for (const r of input.requests) {
    if (seen.has(r.customId)) {
      throw new AIProviderError(
        "openai",
        "bad_response",
        `submitBatch: duplicate customId "${r.customId}"`
      );
    }
    seen.add(r.customId);
  }

  const client = getClient();
  const jsonl = serialiseJsonl(input.requests);

  // Upload: Files API expects a Blob / File instance. Node 20 has Blob
  // globally. We tag a .jsonl filename purely for the OpenAI dashboard.
  const fileBlob = new Blob([jsonl], { type: "application/jsonl" });
  const fileLike = new File([fileBlob], `batch-${Date.now()}.jsonl`, {
    type: "application/jsonl",
  });

  let inputFileId: string;
  try {
    const uploaded = await client.files.create({
      file: fileLike,
      purpose: "batch",
    });
    inputFileId = uploaded.id;
  } catch (err) {
    throw toAiProviderError(err, "batch input file upload");
  }

  let batchId: string;
  let initialStatus: BatchStatus;
  try {
    const batch = await client.batches.create({
      input_file_id: inputFileId,
      endpoint: "/v1/chat/completions",
      completion_window: "24h",
      metadata: {
        ...(input.description ? { description: input.description.slice(0, 512) } : {}),
        ...(input.metadata ?? {}),
      },
    });
    batchId = batch.id;
    initialStatus = batch.status as BatchStatus;
  } catch (err) {
    throw toAiProviderError(err, "batch submit");
  }

  return {
    batchId,
    inputFileId,
    requestCount: input.requests.length,
    initialStatus,
  };
}

// -----------------------------------------------------------------------
// pollBatch
// -----------------------------------------------------------------------

/**
 * Cheap call — ONE retrieve request, no body download. Callers should
 * poll at a low frequency (e.g. every 2–5 minutes from a cron, or on
 * user page-visit from /api/ai/batch/[jobId]). Never returns results
 * — those live in the output file; use `fetchBatchResults` after this
 * reports status="completed".
 */
export async function pollBatch(batchId: string): Promise<BatchPollResult> {
  const client = getClient();
  let batch;
  try {
    batch = await client.batches.retrieve(batchId);
  } catch (err) {
    throw toAiProviderError(err, `batch retrieve (${batchId})`);
  }

  const counts = batch.request_counts ?? { total: 0, completed: 0, failed: 0 };
  // `errors` on the Batch object is a summary object (type=list, data=[...])
  // when set. We build a short human message out of it — OpenAI already
  // flattens the per-request errors into error_file_id, this field is a
  // top-level reason like "input file was too large".
  const errorMessage = summariseBatchErrors(batch.errors ?? null);

  return {
    batchId: batch.id,
    status: batch.status as BatchStatus,
    requestCounts: {
      total: counts.total ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
    },
    outputFileId: batch.output_file_id ?? null,
    errorFileId: batch.error_file_id ?? null,
    errorMessage,
    createdAt: batch.created_at ?? 0,
    completedAt: batch.completed_at ?? null,
    failedAt: batch.failed_at ?? null,
    expiredAt: batch.expired_at ?? null,
    cancelledAt: batch.cancelled_at ?? null,
  };
}

// -----------------------------------------------------------------------
// fetchBatchResults
// -----------------------------------------------------------------------

export interface FetchBatchResultsInput {
  outputFileId: string | null;
  errorFileId?: string | null;
}

export interface FetchBatchResultsResult {
  lines: BatchResultLine[];
  errors: BatchErrorLine[];
}

/**
 * Downloads the output (and optionally error) JSONL files and parses
 * each line into a typed object. Called by the polling route when a
 * batch reaches status="completed".
 *
 * We don't delete the files from OpenAI here. OpenAI cleans them up on
 * their schedule (docs say results persist ~29 days) and operators
 * sometimes need to re-download for debugging. Task #25's admin UI can
 * add a "purge batch files" action later.
 */
export async function fetchBatchResults(
  input: FetchBatchResultsInput
): Promise<FetchBatchResultsResult> {
  const client = getClient();

  let lines: BatchResultLine[] = [];
  if (input.outputFileId) {
    const response = await client.files.content(input.outputFileId);
    const text = await response.text();
    lines = parseOutputJsonl(text);
  }

  let errors: BatchErrorLine[] = [];
  if (input.errorFileId) {
    const response = await client.files.content(input.errorFileId);
    const text = await response.text();
    errors = parseErrorJsonl(text);
  }

  return { lines, errors };
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function serialiseJsonl(requests: BatchRequest[]): string {
  const parts: string[] = [];
  for (const r of requests) {
    const body: Record<string, unknown> = {
      model: r.model,
      messages: r.messages,
      max_tokens: r.maxTokens,
    };
    if (r.temperature !== undefined) body.temperature = r.temperature;
    if (r.responseFormat) body.response_format = r.responseFormat;
    parts.push(
      JSON.stringify({
        custom_id: r.customId,
        method: "POST",
        url: "/v1/chat/completions",
        body,
      })
    );
  }
  // Trailing newline is harmless for OpenAI's parser and keeps diffs
  // clean if we ever dump the JSONL for debugging.
  return parts.join("\n") + "\n";
}

function parseOutputJsonl(text: string): BatchResultLine[] {
  const lines: BatchResultLine[] = [];
  for (const raw of text.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    let parsed: BatchResultLineWire;
    try {
      parsed = JSON.parse(trimmed) as BatchResultLineWire;
    } catch {
      // Ignore malformed lines — OpenAI's JSONL writer is solid, but
      // partial network reads could in theory truncate. The polling
      // route surfaces a warning when parsed line count < requestCount.
      continue;
    }
    const resp = parsed.response?.body;
    if (!resp || !resp.choices || resp.choices.length === 0) continue;
    const choice = resp.choices[0];
    const msg = choice.message;
    const content = typeof msg?.content === "string" ? msg.content : "";
    const usage = resp.usage ?? {
      prompt_tokens: 0,
      completion_tokens: 0,
    };
    const cachedInputTokens =
      (usage as { prompt_tokens_details?: { cached_tokens?: number } })
        .prompt_tokens_details?.cached_tokens ?? 0;

    lines.push({
      customId: parsed.custom_id,
      statusCode: parsed.response?.status_code ?? 200,
      model: resp.model ?? "",
      content,
      stopReason: mapStopReason(choice.finish_reason),
      usage: {
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
        cachedInputTokens,
      },
    });
  }
  return lines;
}

function parseErrorJsonl(text: string): BatchErrorLine[] {
  const lines: BatchErrorLine[] = [];
  for (const raw of text.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    let parsed: BatchErrorLineWire;
    try {
      parsed = JSON.parse(trimmed) as BatchErrorLineWire;
    } catch {
      continue;
    }
    const err = parsed.response?.body?.error;
    lines.push({
      customId: parsed.custom_id,
      statusCode: parsed.response?.status_code ?? 0,
      errorCode: err?.code ?? null,
      errorMessage: err?.message ?? "Unknown batch line error",
    });
  }
  return lines;
}

function mapStopReason(
  reason: string | null | undefined
): BatchResultLine["stopReason"] {
  if (reason === "stop") return "stop";
  if (reason === "length") return "length";
  if (reason === "content_filter") return "content_filter";
  if (reason === "tool_calls") return "tool_calls";
  return "other";
}

function summariseBatchErrors(
  errors: { data?: Array<{ message?: string; code?: string }> } | null
): string | null {
  if (!errors || !errors.data || errors.data.length === 0) return null;
  // Top-level errors are typically 1 entry ("file too large", "bad
  // endpoint"). Take the first two, truncate, join.
  return errors.data
    .slice(0, 2)
    .map((e) => e.message ?? e.code ?? "error")
    .join("; ")
    .slice(0, 512);
}

function toAiProviderError(err: unknown, stage: string): AIProviderError {
  if (err instanceof AuthenticationError) {
    return new AIProviderError(
      "openai",
      "configuration",
      `OpenAI auth failed during ${stage}: ${err.message}`
    );
  }
  if (err instanceof RateLimitError) {
    return new AIProviderError(
      "openai",
      "unknown",
      `OpenAI rate-limited during ${stage}: ${err.message}`
    );
  }
  if (err instanceof BadRequestError) {
    return new AIProviderError(
      "openai",
      "bad_response",
      `OpenAI rejected ${stage}: ${err.message}`
    );
  }
  if (err instanceof APIError) {
    return new AIProviderError(
      "openai",
      "unknown",
      `OpenAI error during ${stage}: ${err.message}`
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return new AIProviderError("openai", "unknown", `${stage} failed: ${message}`);
}

// -----------------------------------------------------------------------
// Wire-type shapes (internal)
// -----------------------------------------------------------------------

interface BatchResultLineWire {
  custom_id: string;
  response?: {
    status_code?: number;
    body?: {
      model?: string;
      choices?: Array<{
        message?: { content?: string };
        finish_reason?: string | null;
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };
  };
}

interface BatchErrorLineWire {
  custom_id: string;
  response?: {
    status_code?: number;
    body?: {
      error?: { code?: string; message?: string };
    };
  };
}
