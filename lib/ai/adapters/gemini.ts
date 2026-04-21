// Gemini adapter — the third implementation of `AIProvider` (Task #21).
//
// Follows the same rules as the Anthropic + OpenAI adapters:
//   - No SDK types leak past the module boundary. Everything normalizes
//     to `ChatChunk` / `ChatResult`.
//   - `"server-only"` at the top to keep the API key off the client.
//   - `streamChat()` is the single source of truth. `chat()` consumes
//     the iterable.
//   - Errors are emitted inline as terminal `chunk.error` with a
//     classified code. Don't throw for rate / auth / overload.
//
// Gemini-specific notes:
//   - Gemini uses `role: "user" | "model"` (not "assistant"). We map
//     ChatRole "assistant" → "model" at the boundary and back again
//     when serializing (only matters if we ever parse Gemini responses
//     — we don't today).
//   - `system` is NOT a role. Gemini takes a top-level `systemInstruction`
//     (string | Part | Content), so `systemPrompt` collapses to a
//     string there and any "system" role messages in history are
//     concatenated into it. Matches the Anthropic pattern.
//   - Content parts are `{ text }` or `{ inlineData: { mimeType, data } }`.
//     Inline data covers BOTH images AND PDFs — Gemini doesn't have a
//     separate "document" part type. We emit `inlineData` for both the
//     `ImageBlock` and `DocumentBlock` cases in our portable union.
//   - Usage metadata arrives on every streaming chunk's `usageMetadata`
//     (prompt + candidates token counts). We take the LAST non-null
//     reading for the terminal tally — it's cumulative across the stream.
//   - Gemini classifies errors via `GoogleGenerativeAIFetchError.status`
//     (HTTP layer) — map to our portable codes in `normalizeError`.
//
// Capability flags:
//   - streaming: true  (generateContentStream)
//   - toolUse:   false (SDK supports function declarations; we don't wire
//                      them yet — same discipline as the other adapters)
//   - imageInput: true (inlineData with image/* mime types)
//   - pdfInput:   true (inlineData with application/pdf — Gemini performs
//                      vision + text extraction internally, same path as
//                      Anthropic's `document` block)

import "server-only";

import {
  GoogleGenerativeAI,
  GoogleGenerativeAIAbortError,
  GoogleGenerativeAIError,
  GoogleGenerativeAIFetchError,
  GoogleGenerativeAIRequestInputError,
  type Content,
  type EnhancedGenerateContentResponse,
  type Part,
} from "@google/generative-ai";

import { AIProviderError, type AIProvider } from "../provider";
import type {
  AICapabilities,
  AIProviderId,
  ChatChunk,
  ChatInput,
  ChatResult,
  ContentBlock,
  StopReason,
  TokenUsage,
} from "../types";

/**
 * Convert our portable ContentBlock[] to Gemini's Part[]. String content
 * collapses to a single text part.
 *
 * Gemini has no separate "document" Part shape — PDFs travel as
 * `inlineData` with `mimeType: "application/pdf"`, same plumbing as
 * images. The SDK's type for this is `GenerativeContentBlob`, but we
 * build the inline structure directly so the SDK import surface stays
 * small.
 */
function toGeminiParts(content: string | ContentBlock[]): Part[] {
  if (typeof content === "string") {
    return [{ text: content }];
  }
  return content.map((b): Part => {
    if (b.type === "text") return { text: b.text };
    if (b.type === "image") {
      return {
        inlineData: {
          mimeType: b.mediaType,
          data: b.data,
        },
      };
    }
    // DocumentBlock — mediaType is locked to "application/pdf" at the
    // type level, but Gemini accepts that through the same inlineData
    // channel as images. No separate Files-API dance needed (that's
    // the OpenAI path we deliberately don't wire).
    return {
      inlineData: {
        mimeType: b.mediaType,
        data: b.data,
      },
    };
  });
}

export interface GeminiProviderOptions {
  apiKey: string;
  defaultModel: string;
}

export class GeminiProvider implements AIProvider {
  readonly id: AIProviderId = "gemini";
  readonly displayName = "Google Gemini";
  readonly capabilities: AICapabilities = {
    streaming: true,
    // Same discipline as Anthropic + OpenAI: SDK supports function
    // declarations, but our adapter doesn't wire them end-to-end yet.
    toolUse: false,
    imageInput: true,
    // Gemini accepts application/pdf via inlineData and runs vision
    // internally. We route OCR + translate here by default (see
    // `lib/ai/router.ts`).
    pdfInput: true,
  };
  readonly defaultModel: string;

  private readonly client: GoogleGenerativeAI;

  constructor(opts: GeminiProviderOptions) {
    if (!opts.apiKey) {
      throw new AIProviderError(
        "gemini",
        "configuration",
        "GEMINI_API_KEY is empty"
      );
    }
    this.defaultModel = opts.defaultModel;
    this.client = new GoogleGenerativeAI(opts.apiKey);
  }

  /**
   * Non-streaming chat. Implemented as a consumer of `streamChat()` so
   * there's exactly one code path through retries + normalization.
   * Same shape as the Anthropic + OpenAI adapters.
   */
  async chat(input: ChatInput): Promise<ChatResult> {
    let text = "";
    let stopReason: StopReason = "end_turn";
    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    let model = input.model ?? this.defaultModel;
    for await (const chunk of this.streamChat(input)) {
      switch (chunk.kind) {
        case "text_delta":
          text += chunk.text;
          break;
        case "done":
          stopReason = chunk.stopReason;
          if (chunk.usage) usage = chunk.usage;
          model = chunk.model;
          break;
        case "error":
          throw new AIProviderError(
            "gemini",
            chunk.code === "auth" ? "configuration" : "unknown",
            chunk.message
          );
      }
    }
    return { text, stopReason, usage, model, providerId: this.id };
  }

  /**
   * Streaming chat. Yields `text_delta` per SDK chunk and exactly one
   * terminal `done` or `error` chunk.
   *
   * Gemini's stream model: the SDK returns
   * `{ stream: AsyncGenerator<EnhancedGenerateContentResponse>, response: Promise<...> }`.
   * Each streamed response is a CUMULATIVE snapshot, not a delta — the
   * SDK's `.text()` helper on the *chunk* returns only that chunk's
   * contribution (the per-iteration text), so we can safely yield it as
   * a delta without subtracting prior content.
   */
  async *streamChat(input: ChatInput): AsyncIterable<ChatChunk> {
    const modelName = input.model ?? this.defaultModel;
    // Match the other adapters' 1024-token default. Keeps the "runaway
    // prompt doesn't blow the credit budget" guarantee portable across
    // providers.
    const maxTokens = input.maxTokens ?? 1024;

    // Map our ChatMessage[] to Gemini's `Content[]`. Gemini takes
    // `systemInstruction` at the top level (not in the contents array),
    // so we collapse "system" role messages into a single instruction
    // string, same pattern as the Anthropic adapter.
    const systemPieces: string[] = [];
    if (input.systemPrompt) systemPieces.push(input.systemPrompt);
    const contents: Content[] = [];
    for (const m of input.messages) {
      if (m.role === "system") {
        // Images in a system message are an app-layer bug — Gemini's
        // systemInstruction doesn't accept them anyway. Flatten to text.
        if (typeof m.content === "string") {
          systemPieces.push(m.content);
        } else {
          const textOnly = m.content
            .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
            .map((b) => b.text)
            .join("\n\n");
          if (textOnly) systemPieces.push(textOnly);
        }
        continue;
      }
      // Gemini uses "user" | "model" (not "assistant"). Map at the
      // boundary so callers never see the SDK's vocabulary.
      const role = m.role === "assistant" ? "model" : "user";
      contents.push({ role, parts: toGeminiParts(m.content) });
    }
    const systemInstruction =
      systemPieces.length > 0 ? systemPieces.join("\n\n") : undefined;

    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: StopReason = "end_turn";

    try {
      const model = this.client.getGenerativeModel({
        model: modelName,
        ...(systemInstruction ? { systemInstruction } : {}),
        generationConfig: {
          maxOutputTokens: maxTokens,
          ...(input.temperature != null ? { temperature: input.temperature } : {}),
        },
      });

      const { stream, response } = await model.generateContentStream({
        contents,
      });

      for await (const chunk of stream) {
        // `.text()` on a streamed chunk returns THIS chunk's text only
        // (per the SDK contract). Empty-string handling follows the
        // portability rule — never yield an empty delta.
        const delta = safeChunkText(chunk);
        if (delta.length > 0) {
          yield { kind: "text_delta", text: delta };
        }
        // Usage metadata is cumulative; take the last non-null reading.
        if (chunk.usageMetadata) {
          inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens;
          outputTokens =
            chunk.usageMetadata.candidatesTokenCount ?? outputTokens;
        }
        // First candidate's finishReason lands on the terminal chunk.
        const candidate = chunk.candidates?.[0];
        if (candidate?.finishReason) {
          stopReason = mapStopReason(String(candidate.finishReason));
        }
      }

      // The `response` promise resolves to the aggregated response. Use
      // it to pick up any usage / stop-reason the incremental chunks
      // missed (Gemini sometimes only reports usage on the terminal
      // aggregate).
      const final = await response;
      if (final.usageMetadata) {
        inputTokens = final.usageMetadata.promptTokenCount ?? inputTokens;
        outputTokens = final.usageMetadata.candidatesTokenCount ?? outputTokens;
      }
      const finalCandidate = final.candidates?.[0];
      if (finalCandidate?.finishReason) {
        stopReason = mapStopReason(String(finalCandidate.finishReason));
      }

      yield {
        kind: "done",
        stopReason,
        usage: { inputTokens, outputTokens },
        model: modelName,
        providerId: this.id,
      };
    } catch (err) {
      yield normalizeError(err);
    }
  }
}

// -- helpers ----------------------------------------------------------

/**
 * `.text()` on a Gemini chunk throws if the candidate was blocked. The
 * SDK already surfaces that as an error on the `response` promise, so
 * swallowing here preserves the "stream yields deltas, errors emit
 * terminal chunk" contract — a blocked candidate lands in `catch`.
 */
function safeChunkText(chunk: EnhancedGenerateContentResponse): string {
  try {
    const t = chunk.text();
    return typeof t === "string" ? t : "";
  } catch {
    return "";
  }
}

function mapStopReason(r: string | null | undefined): StopReason {
  switch (r) {
    case "STOP":
      return "end_turn";
    case "MAX_TOKENS":
      return "max_tokens";
    case "SAFETY":
    case "RECITATION":
    case "LANGUAGE":
      return "stop_sequence";
    // Gemini's FunctionCall finish state, when it lands, maps to our
    // portable "tool_use". Today we don't enable tools so this branch
    // is defensive.
    case "FUNCTION_CALL":
      return "tool_use";
    default:
      return "end_turn";
  }
}

function normalizeError(err: unknown): ChatChunk {
  // Abort takes priority — route handler treats as transient.
  if (err instanceof GoogleGenerativeAIAbortError) {
    return { kind: "error", code: "overloaded", message: err.message };
  }

  if (err instanceof GoogleGenerativeAIFetchError) {
    const status = err.status ?? 0;
    const msg = err.message;
    // 401/403 — our key is bad. Refund the user (not their fault).
    if (status === 401 || status === 403) {
      return { kind: "error", code: "auth", message: msg };
    }
    // 429 — rate limit / quota. Refund.
    if (status === 429) {
      return { kind: "error", code: "rate_limit", message: msg };
    }
    // 503 / 502 / 504 — transient provider overload.
    if (status === 503 || status === 502 || status === 504) {
      return { kind: "error", code: "overloaded", message: msg };
    }
    // 400 — body inspection. Gemini surfaces context-length as a 400
    // with the phrase "input is too long" or similar; match loosely.
    if (status === 400) {
      if (/too long|exceeds|context|maximum.*tokens/i.test(msg)) {
        return { kind: "error", code: "context_length", message: msg };
      }
      return { kind: "error", code: "bad_request", message: msg };
    }
    return { kind: "error", code: "unknown", message: msg };
  }

  if (err instanceof GoogleGenerativeAIRequestInputError) {
    // Input validation — same refund semantics as bad_request.
    return { kind: "error", code: "bad_request", message: err.message };
  }

  if (err instanceof GoogleGenerativeAIError) {
    return { kind: "error", code: "unknown", message: err.message };
  }

  const message = err instanceof Error ? err.message : String(err);
  return { kind: "error", code: "unknown", message };
}
