// Shared AI types — the portability surface.
//
// Rules:
//   - No provider-specific shapes here. Anthropic's `RawMessageStreamEvent`
//     and OpenAI's `ChatCompletionChunk` are normalized to ChatChunk at
//     the adapter boundary.
//   - Everything the app layer touches goes through this file. If a UI
//     component imports from `lib/ai/adapters/*`, that's a leak — fix it.
//   - Stable field names. Adding fields is fine; renaming one breaks
//     stored data in `chat_messages.providerId`, `.tokensIn`, etc.
//
// Design notes:
//   - We expose TWO entry points on the provider: `chat()` for request /
//     response, and `streamChat()` for streaming. Each returns the
//     narrowest type the caller needs, so TS doesn't force callers to
//     disambiguate an `AsyncIterable<ChatChunk> | Promise<ChatResult>`
//     at the call site.
//   - `ChatChunk` is a discriminated union. The terminal chunk
//     ("done" | "error") always carries the final `stopReason` and
//     `usage` (null on error). Consumers can trust that exactly one
//     terminal chunk arrives per stream — adapters guarantee this.

/**
 * Identifier used in the registry and stored on every `chat_messages`,
 * `ai_outputs`, and `ai_usage` row. Stable forever — renaming a value
 * would orphan all historical audit rows that reference it.
 *
 * Current roster (Phase A2, Task #21):
 *   - "anthropic" — Claude family (Sonnet, Haiku). Strong writer / reasoner.
 *                   Native PDF ingest, high context. Our default for
 *                   generate / sign / long-form chat.
 *   - "openai"    — gpt-4o family. Cheap, fast on short chat turns.
 *                   No native PDF ingest via Chat Completions (Files API
 *                   is a separate surface we don't use).
 *   - "gemini"    — Google Gemini 2.x family. Native PDF via inline-data
 *                   blobs, strong OCR + translation quality for the
 *                   price. Our default for ocr / translate.
 */
export type AIProviderId = "anthropic" | "openai" | "gemini";

/**
 * Stable currency-of-capability map. Add a field when a new capability
 * lands; don't rename existing ones — they're referenced by the app's
 * feature gates.
 */
export type AICapabilities = {
  /** Supports server-sent streaming of incremental text. */
  streaming: boolean;
  /** Accepts tool_use / tool_result content blocks. Future. */
  toolUse: boolean;
  /** Accepts image inputs in the messages array. */
  imageInput: boolean;
  /**
   * Accepts PDF bytes directly as a document content block. If false,
   * callers must extract text first via `lib/ai/pdf-extract.ts`.
   */
  pdfInput: boolean;
};

/** Role on a chat message. Matches the shared Anthropic/OpenAI convention. */
export type ChatRole = "system" | "user" | "assistant";

/**
 * Content block primitives — the portable shape. Adapters translate these
 * into provider-native message parts at the boundary.
 *
 * Why a discriminated union of { type } blocks vs. a free-form bag:
 *   - Anthropic already has this exact shape (text / image / document /
 *     tool_use) so the mapping is effectively free.
 *   - OpenAI uses `{ type: "text" | "image_url" }` with a different payload
 *     key; the adapter handles that rename in one place.
 *   - Keeps app code provider-agnostic — an OCR caller builds
 *     `[{ type: "image", ... }]` and the registry picks the adapter.
 */
export type TextBlock = { type: "text"; text: string };

/**
 * Image input. `data` is raw base64 (no `data:` URI prefix) — the adapter
 * wraps it in whatever format the provider needs (Anthropic: nested
 * `source.data`; OpenAI: a full `data:<mt>;base64,<data>` URL).
 */
export type ImageBlock = {
  type: "image";
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  /** Base64-encoded image bytes, without the `data:` URI prefix. */
  data: string;
};

/**
 * Raw document input. Today the only carrier is `application/pdf` —
 * Anthropic accepts it natively and rasterizes internally for vision /
 * OCR. Other media types can be added without a breaking change because
 * the adapter is the one that rejects unsupported types.
 *
 * Callers should check `provider.capabilities.pdfInput` before sending
 * document blocks; otherwise the adapter throws an
 * `UnsupportedCapabilityError`.
 */
export type DocumentBlock = {
  type: "document";
  mediaType: "application/pdf";
  /** Base64-encoded document bytes, without the `data:` URI prefix. */
  data: string;
  /** Optional UI-facing filename. Included in provider payloads that accept it. */
  name?: string;
};

export type ContentBlock = TextBlock | ImageBlock | DocumentBlock;

export type ChatMessage = {
  role: ChatRole;
  /**
   * Either a plain string (back-compat for every pre-OCR caller) or an
   * ordered array of content blocks for multimodal prompts. Adapters
   * accept both; a string is equivalent to `[{ type: "text", text }]`.
   */
  content: string | ContentBlock[];
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type StopReason =
  | "end_turn"
  | "max_tokens"
  | "stop_sequence"
  | "tool_use"
  | "error";

export type ChatInput = {
  /** History in chronological order. First message is typically "system". */
  messages: ChatMessage[];
  /**
   * Convenience: if provided, prepended as a "system" role message. Exists
   * because not every provider accepts "system" inside `messages` (Anthropic
   * takes a top-level `system` field); the adapter handles the mapping.
   */
  systemPrompt?: string;
  /**
   * Soft cap. Adapters may clamp to provider limits. Default is 1024 —
   * enough for a chat turn, cheap enough that a runaway prompt doesn't
   * blow through the user's credit budget.
   */
  maxTokens?: number;
  /** 0..1. Adapters pass through as-is. Default provider-specific. */
  temperature?: number;
  /**
   * Optional model override. When omitted, the adapter uses its env-
   * configured default (see each adapter's constructor). Callers should
   * typically leave this unset — pinning a model per-call leaks provider
   * knowledge into app code.
   */
  model?: string;
};

export type ChatResult = {
  text: string;
  stopReason: StopReason;
  usage: TokenUsage;
  /** Model the adapter actually used. Useful for audit + cost trail. */
  model: string;
  providerId: AIProviderId;
};

/**
 * One element of a streaming response.
 *
 * Contract:
 *   - The first non-empty chunk may be `text_delta` or `done` (zero-length
 *     responses are legal — maxTokens=1 can cut before any text).
 *   - Exactly one terminal chunk (`done` or `error`) arrives per stream.
 *     Consumers can `for await` and rely on the loop ending after that.
 *   - `text_delta.text` is NEVER undefined and NEVER empty. If the adapter
 *     receives an empty delta from the provider, it drops it rather than
 *     emitting it. This keeps the UI's append logic simple.
 *   - `usage` on `done` is the CUMULATIVE tally for the whole stream, not
 *     a delta. `null` is allowed if the provider didn't report usage
 *     (some providers only give input tokens mid-stream and nothing else).
 */
export type ChatChunk =
  | { kind: "text_delta"; text: string }
  | {
      kind: "done";
      stopReason: StopReason;
      usage: TokenUsage | null;
      model: string;
      providerId: AIProviderId;
    }
  | {
      kind: "error";
      message: string;
      /**
       * Classifies for the caller so we can decide refund policy:
       *   - "rate_limit" / "overloaded": provider temporarily unable; refund.
       *   - "bad_request": our prompt was malformed; refund.
       *   - "auth": our env key broke; refund (user isn't at fault).
       *   - "context_length": the messages blew past the model's window;
       *     refund (we should have truncated upstream).
       *   - "unknown": catch-all; refund.
       * The route handler uses this to decide log severity and refund logic.
       */
      code:
        | "rate_limit"
        | "overloaded"
        | "bad_request"
        | "auth"
        | "context_length"
        | "unknown";
    };
