// /api/ai/chat — streaming chat-with-PDF endpoint.
//
// Life of a request (happy path):
//   1.  auth()                     → 401 if anonymous
//   2.  parse multipart form       → { sessionId, message, idempotencyKey, pdf? }
//   3.  look up chat session       → 404 if not owned by this user
//   4.  check idempotencyKey hit   → if an assistant row already exists
//                                    for this key, replay it as a stream
//                                    and return (no adapter call, no debit)
//   5.  spendCredits(chat_turn)    → 402 on insufficient balance;
//                                    duplicate collapses to the replay path
//   6.  extract PDF text if sent   → prepend as a system message
//   7.  persist user message       → one chat_messages row, role=user
//   8.  route("chat", …)           → 503 if router ladder has no configured
//                                    provider that supports streaming
//   9.  provider.streamChat()      → pipe chunks as SSE to the client
//  10.  on terminal `done`         → persist assistant message (role=assistant)
//                                    with providerId/model/tokens/stopReason/
//                                    creditCost/idempotencyKey, touch the
//                                    session's updated_at.
//  11.  on terminal `error`        → refundCredits (we charged up front),
//                                    persist a marker assistant row with
//                                    stopReason="error" so the UI can show
//                                    the failed turn.
//
// Response format: SSE (Content-Type: text/event-stream). Each line block
// is `data: <json>\n\n`. The last event is always either `{type:"done", …}`
// or `{type:"error", …}` so clients can close the EventSource cleanly.
//
// Why multipart instead of JSON body: PDFs can be up to 25 MB and we
// don't want to base64-inflate them by 33 %. The client sends the raw
// bytes; we extract text server-side and discard the buffer when done.
// (No S3 storage yet — Phase 2 is metadata-only; real storage lands in
// Phase 6.)

import "server-only";

import { randomUUID } from "crypto";
import { and, asc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { extractPdfText } from "@/lib/ai/pdf-extract";
import { refundCredits, spendCredits } from "@/lib/ai/credits";
import { capForOp } from "@/lib/ai/output-caps";
import { moderateOutput } from "@/lib/ai/output-moderation";
import { isTruncatedStopReason, recordAiUsage } from "@/lib/ai/usage";
import type { AIProvider } from "@/lib/ai/provider";
import { buildSafetyPreamble, wrapUntrustedInput } from "@/lib/ai/prompt-safety";
import { NoRoutableProviderError, route } from "@/lib/ai/router";
import { estimatePromptTokens, OP_MAX_INPUT_TOKENS } from "@/lib/ai/tokens";
import type {
  AIProviderId,
  ChatChunk,
  ChatMessage,
  StopReason,
} from "@/lib/ai/types";
import { AI_OPERATION_COSTS } from "@/lib/pricing";

// Streaming responses cannot be statically rendered. Also, we need the
// Node runtime — pdfjs-dist's legacy build uses Node-only APIs and the
// mysql2 client doesn't run on Edge.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Soft upload ceiling. Bigger PDFs are technically accepted but we bail
// before touching pdfjs so a malicious 500MB body doesn't OOM a worker.
// This is a MEMORY guard, NOT a context-size guard — the authoritative
// per-op input-token ceiling lives in `lib/ai/tokens.ts`
// (`OP_MAX_INPUT_TOKENS.chat_turn`) and is checked post-extraction
// against the assembled prompt. A 25 MB scanned PDF can still blow
// the token cap; a 1 MB text-only PDF will not.
const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB

// How many prior turns to include as context. Anthropic/GPT-4o-mini both
// fit 128k+ tokens; we don't need to enforce a strict window in code, but
// capping at 40 keeps the prompt predictable and the bill bounded.
const HISTORY_WINDOW = 40;

// Hard ceiling on extracted PDF text we splice into the system prompt.
// Backstops the pdfjs extraction so a pathological 1 GB-text PDF
// doesn't OOM the sandbox building a single mega-string. The real
// user-visible gate is the 20k-token cap in `OP_MAX_INPUT_TOKENS`;
// this is just a memory guard a safe multiple above that (20k tokens
// * 3.5 chars/token ≈ 70k chars for Latin text; 240k is ~3.5x that
// to leave headroom before the token check fires a 413).
const PDF_CONTEXT_CHAR_BUDGET = 240_000;

export async function POST(req: Request): Promise<Response> {
  // -- 1. Auth ---------------------------------------------------------
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;
  if (!userId) {
    return json(401, { error: "not_authenticated" });
  }

  // -- 2. Parse multipart body -----------------------------------------
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: "bad_request", detail: "expected multipart/form-data" });
  }

  const sessionId = stringField(form, "sessionId");
  const messageText = stringField(form, "message");
  const idempotencyKey = stringField(form, "idempotencyKey");
  const pdfFile = form.get("pdf");

  if (!sessionId || !messageText || !idempotencyKey) {
    return json(400, {
      error: "bad_request",
      detail: "sessionId, message, idempotencyKey are required",
    });
  }
  // No char-level messageText cap here anymore. The authoritative
  // guard is the token cap below (post-extraction), which accounts for
  // message + history + PDF context + system prompt together — a 15k-
  // char question plus a 12-page PDF can easily blow 20k tokens, and
  // that's the case the cap exists to catch. See lib/ai/tokens.ts.
  if (pdfFile && !(pdfFile instanceof File)) {
    return json(400, { error: "bad_request", detail: "pdf must be a file" });
  }
  if (pdfFile instanceof File && pdfFile.size > MAX_PDF_BYTES) {
    return json(413, { error: "pdf_too_large", maxBytes: MAX_PDF_BYTES });
  }

  // -- 3. Verify session ownership -------------------------------------
  const [chatSession] = await db
    .select({
      id: schema.chatSessions.id,
      userId: schema.chatSessions.userId,
      fileId: schema.chatSessions.fileId,
      title: schema.chatSessions.title,
      providerId: schema.chatSessions.providerId,
      model: schema.chatSessions.model,
    })
    .from(schema.chatSessions)
    .where(
      and(
        eq(schema.chatSessions.id, sessionId),
        eq(schema.chatSessions.userId, userId)
      )
    )
    .limit(1);
  if (!chatSession) {
    return json(404, { error: "session_not_found" });
  }

  // -- 4. Idempotency replay -------------------------------------------
  // If a previous assistant row was already stored for this idempotencyKey,
  // re-emit its text as a single SSE stream and skip the adapter call.
  // This is the "user double-clicked send" and "browser retried on network
  // flap" path — we must NOT charge credits or hit the provider twice.
  const [existing] = await db
    .select({
      id: schema.chatMessages.id,
      content: schema.chatMessages.content,
      providerId: schema.chatMessages.providerId,
      model: schema.chatMessages.model,
      stopReason: schema.chatMessages.stopReason,
      tokensIn: schema.chatMessages.tokensIn,
      tokensOut: schema.chatMessages.tokensOut,
      creditCost: schema.chatMessages.creditCost,
    })
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.idempotencyKey, idempotencyKey))
    .limit(1);
  if (existing && existing.content) {
    return sseReplay({
      messageId: existing.id,
      text: existing.content,
      providerId: (existing.providerId ?? "anthropic") as AIProviderId,
      model: existing.model ?? "",
      stopReason: (existing.stopReason ?? "end_turn") as StopReason,
      tokensIn: existing.tokensIn ?? 0,
      tokensOut: existing.tokensOut ?? 0,
      creditCost: existing.creditCost ?? 0,
    });
  }

  // -- 5. Spend credits (up-front debit) -------------------------------
  const spend = await spendCredits({
    userId,
    operation: "chat_turn",
    idempotencyKey: `ai:${sessionId}:${idempotencyKey}`,
    note: `Chat turn in session ${sessionId}`,
  });
  if (!spend.ok) {
    if (spend.reason === "insufficient") {
      return json(402, {
        error: "insufficient_credits",
        required: spend.required,
        balance: spend.balance,
      });
    }
    // "duplicate" here is effectively impossible: we just looked up the
    // chat_messages row by idempotencyKey above. But TS / defensive: if
    // the ledger entry landed but the assistant row didn't, refunding
    // would be wrong — it's paid but unfulfilled. Return 409 so the
    // client can surface "previous turn didn't finish, try again".
    return json(409, { error: "duplicate_turn" });
  }
  const spendLedgerId = spend.ledgerId;
  const creditCost = spend.creditsSpent;

  // -- 6. Optional PDF extraction --------------------------------------
  // We do this AFTER debiting so a successful extraction counts as a
  // billable turn. If extraction throws we refund below.
  let pdfSystemContext: string | null = null;
  let pdfPageCount = 0;
  if (pdfFile instanceof File && pdfFile.size > 0) {
    try {
      const bytes = new Uint8Array(await pdfFile.arrayBuffer());
      const extracted = await extractPdfText(bytes);
      pdfPageCount = extracted.pageCount;
      const truncated =
        extracted.fullText.length > PDF_CONTEXT_CHAR_BUDGET
          ? extracted.fullText.slice(0, PDF_CONTEXT_CHAR_BUDGET)
          : extracted.fullText;
      pdfSystemContext = buildPdfSystemPrompt({
        filename: pdfFile.name,
        pageCount: extracted.pageCount,
        ocrCandidates: extracted.ocrCandidatePages,
        text: truncated,
        wasTruncated: truncated.length < extracted.fullText.length,
      });
    } catch (err) {
      await refundCredits({
        userId,
        operation: "chat_turn",
        originalIdempotencyKey: `ai:${sessionId}:${idempotencyKey}`,
        note: "Refund: PDF extraction failed",
      });
      const message = err instanceof Error ? err.message : "pdf_extract_failed";
      return json(400, { error: "pdf_extract_failed", detail: message });
    }
  }

  // -- 7. Assemble prompt + token-cap check ----------------------------
  // Build the final shape (system + messages) now so we can count input
  // tokens against the per-op cap BEFORE any further DB writes or the
  // provider call. If the assembled prompt exceeds the cap, refund the
  // up-front debit and 413 — this is the context_too_large gate from
  // docs/MASTER_PLAN.md §7 #5 and §4 decision D4.
  //
  // Order matters: we load history + build the system prompt here
  // (earlier than the pre-token-cap code did) specifically so that
  // when the cap fires, we haven't yet persisted a user_message row
  // and haven't yet selected a provider. Refund is the only side
  // effect to undo.
  const history = await loadHistory(sessionId);

  const messages: ChatMessage[] = [];
  for (const m of history) {
    // Skip stored system messages — we always rebuild the system prompt
    // from the current PDF context to keep things deterministic.
    if (m.role === "system") continue;
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: "user", content: messageText });

  const systemPrompt = buildSystemPrompt({ pdfSystemContext });

  const estimatedInputTokens = estimatePromptTokens(systemPrompt, messages);
  if (estimatedInputTokens > OP_MAX_INPUT_TOKENS.chat_turn) {
    await refundCredits({
      userId,
      operation: "chat_turn",
      originalIdempotencyKey: `ai:${sessionId}:${idempotencyKey}`,
      note: `Refund: context_too_large (${estimatedInputTokens} > ${OP_MAX_INPUT_TOKENS.chat_turn} tokens)`,
    });
    return json(413, {
      error: "context_too_large",
      maxTokens: OP_MAX_INPUT_TOKENS.chat_turn,
      estimatedTokens: estimatedInputTokens,
      detail:
        "Input exceeds the 20k-token chat budget. Shrink your question, " +
        "use a smaller PDF, or try /api/ai/summarize for document-scale inputs.",
    });
  }

  // -- 8. Persist user message -----------------------------------------
  const userMessageId = randomUUID();
  await db.insert(schema.chatMessages).values({
    id: userMessageId,
    sessionId,
    role: "user",
    content: messageText,
    // No idempotencyKey on the user row — the unique index is our retry
    // guard for ASSISTANT rows, and nullable columns accept multiple
    // NULLs under MySQL's unique index semantics.
    idempotencyKey: null,
  });

  // -- 9. Route to provider --------------------------------------------
  // Per-op router (Task #21 / MASTER_PLAN §7 gate #6) walks the `chat`
  // routing ladder (by default openai → anthropic → gemini). It still
  // enforces the capability filter — `chat` requires streaming — so a
  // mis-configured ladder falls through to NoRoutableProviderError
  // exactly the way the old `selectProvider({ capabilityNeeded: "streaming" })`
  // returned null. We preserve the refund-before-503 contract
  // (up-front debit at step 5 must be reversed before we surface the
  // 503 to the user) by catching specifically `NoRoutableProviderError`
  // and falling back to the same refund + JSON shape. Any other error
  // escapes — unreachable-provider is the user-safe failure; an
  // unexpected error here is a bug, not a config issue.
  //
  // The session's pinned provider (set at first-use below) is forwarded
  // as the caller preference so mid-session provider switches don't
  // happen when env overrides change between turns.
  let provider: AIProvider;
  try {
    provider = await route("chat", {
      preferredId: (chatSession.providerId ?? undefined) as AIProviderId | undefined,
    });
  } catch (err) {
    if (err instanceof NoRoutableProviderError) {
      await refundCredits({
        userId,
        operation: "chat_turn",
        originalIdempotencyKey: `ai:${sessionId}:${idempotencyKey}`,
        note: "Refund: no AI provider configured",
      });
      return json(503, { error: "no_ai_provider_configured" });
    }
    throw err;
  }

  const providerId = provider.id;
  const model = provider.defaultModel;

  // (`messages` + `systemPrompt` were assembled earlier, above the
  // token-cap check in step 7. Reused here for the streamChat call.)

  // -- 10. Persist first-use provider metadata on the session ----------
  // Only set if not already set; /app/billing uses this to label "This
  // chat uses <Anthropic>" without scanning all messages.
  if (!chatSession.providerId || !chatSession.model) {
    await db
      .update(schema.chatSessions)
      .set({
        providerId: chatSession.providerId ?? providerId,
        model: chatSession.model ?? model,
      })
      .where(eq(schema.chatSessions.id, sessionId));
  }

  // -- 11. Stream the response -----------------------------------------
  const assistantMessageId = randomUUID();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      // First event: metadata the client uses to show "which model",
      // track the new message id, and replace the optimistic bubble
      // once the stream finishes.
      emit({
        type: "meta",
        userMessageId,
        assistantMessageId,
        providerId,
        model,
        pdfPageCount,
        creditCost,
      });

      let assistantText = "";
      let finalStopReason: StopReason = "end_turn";
      let tokensIn = 0;
      let tokensOut = 0;
      // Task #10: Anthropic prompt-cache token buckets. Undefined when the
      // provider didn't report them (non-Anthropic, or Anthropic without
      // cache_control). Kept undefined (not 0) on purpose so the usage row
      // persists NULL in the new nullable DB columns — see migration 0007.
      let cacheReadTokens: number | undefined;
      let cacheWriteTokens: number | undefined;
      let terminal: "done" | "error" = "done";
      let errorMessage: string | undefined;
      let errorCode: Extract<ChatChunk, { kind: "error" }>["code"] | undefined;

      // Start timing the provider call for the ai_usage row. Captured
      // once, reused in both success + error branches below.
      const providerStartedAt = Date.now();

      try {
        // Output-token cap sourced from the centralized policy
        // (lib/ai/output-caps.ts). Task #11: one source of truth
        // across all 10 AI ops, enforced by HARD_CEILING_TOKENS.
        // Pre-migration value was a hardcoded `maxTokens: 1024` here;
        // the table preserves the same 1024 for chat's default cap.
        for await (const chunk of provider.streamChat({
          messages,
          systemPrompt,
          maxTokens: capForOp("chat"),
        })) {
          switch (chunk.kind) {
            case "text_delta":
              assistantText += chunk.text;
              emit({ type: "delta", text: chunk.text });
              break;
            case "done":
              finalStopReason = chunk.stopReason;
              tokensIn = chunk.usage?.inputTokens ?? 0;
              tokensOut = chunk.usage?.outputTokens ?? 0;
              cacheReadTokens = chunk.usage?.cachedInputTokens;
              cacheWriteTokens = chunk.usage?.cacheCreationInputTokens;
              terminal = "done";
              break;
            case "error":
              terminal = "error";
              errorMessage = chunk.message;
              errorCode = chunk.code;
              break;
          }
        }
      } catch (err) {
        // Adapter threw instead of emitting a terminal error chunk. This
        // should only happen for config bugs (see AIProviderError) but
        // defend anyway — refund + persist + emit.
        terminal = "error";
        errorCode = "unknown";
        errorMessage = err instanceof Error ? err.message : "stream_failed";
      }

      // Task #28: output moderation on the assembled assistant text.
      //
      // ADVISORY ONLY — deltas are already on the wire by the time we
      // get here. Unlike every other AI op (summarize/rewrite/ocr/etc),
      // chat uses streamChat() which emits text_delta chunks to the
      // client as they arrive at line 391 above. We cannot retract
      // bytes the client already rendered, so we do NOT throw on
      // critical findings for streaming chat.
      //
      // What we DO do: log the finding to stderr so it surfaces in
      // server logs / Sentry (when Task #24 is wired). A future
      // migration can add an `ai_usage.moderation_severity` column,
      // at which point this block can stop logging and start writing.
      if (terminal === "done" && assistantText.length > 0) {
        const mod = moderateOutput(assistantText, { op: "chat" });
        if (!mod.safe || mod.severity !== "none") {
          // eslint-disable-next-line no-console
          console.warn("[/api/ai/chat] output moderation flagged", {
            sessionId,
            assistantMessageId,
            severity: mod.severity,
            reasons: mod.reasonsPublic,
            // `findings` includes redacted samples — safe to log.
            findings: mod.findings,
          });
        }
      }

      try {
        if (terminal === "done") {
          // Persist assistant row. Unique index on idempotencyKey means
          // a rare race with a client retry collapses to exactly one row.
          try {
            await db.insert(schema.chatMessages).values({
              id: assistantMessageId,
              sessionId,
              role: "assistant",
              content: assistantText,
              providerId,
              model,
              tokensIn,
              tokensOut,
              stopReason: finalStopReason,
              creditCost,
              idempotencyKey,
            });
          } catch (err) {
            // Duplicate-key on idempotencyKey == concurrent retry won.
            // Not an error from the user's perspective; the stored row
            // already has the response we just generated.
            if (!isDuplicateKeyError(err)) throw err;
          }

          // Touch session so /app/chat list sorts newest-first.
          await db
            .update(schema.chatSessions)
            .set({ updatedAt: new Date() })
            .where(eq(schema.chatSessions.id, sessionId));

          emit({
            type: "done",
            stopReason: finalStopReason,
            usage: { inputTokens: tokensIn, outputTokens: tokensOut },
            model,
            providerId,
          });

          // Phase A1: audit-log the successful call. Fire-and-forget;
          // `recordAiUsage` swallows non-duplicate errors so a usage-row
          // write failure never surfaces to the user.
          await recordAiUsage({
            userId,
            operation: "chat_turn",
            providerId,
            model,
            inputTokens: tokensIn,
            outputTokens: tokensOut,
            // Task #10: forward Anthropic prompt-cache token counts when
            // present. Undefined passes through to the recorder, which
            // writes NULL — preserving "cache not applicable".
            cachedInputTokens: cacheReadTokens,
            cacheCreationInputTokens: cacheWriteTokens,
            latencyMs: Date.now() - providerStartedAt,
            creditsSpent: creditCost,
            costMicros: null,
            success: true,
            // Task #11 truncation observability — `finalStopReason` came
            // from the terminal `done` chunk of the stream (line 407
            // above). `isTruncatedStopReason` maps "max_tokens" → 1 and
            // everything else → 0; anything null/unknown → null so the
            // rollup can exclude it from rate math.
            stopReason: finalStopReason,
            responseTruncated: isTruncatedStopReason(finalStopReason),
            ledgerId: spendLedgerId,
            idempotencyKey: `ai:${sessionId}:${idempotencyKey}`,
          });
        } else {
          // Refund the up-front debit. Provider erred; user didn't get
          // a complete turn.
          const refund = await refundCredits({
            userId,
            operation: "chat_turn",
            originalIdempotencyKey: `ai:${sessionId}:${idempotencyKey}`,
            note: `Refund: provider ${providerId} ${errorCode ?? "error"}`,
          });

          // Persist a marker row so the UI can show the failed turn
          // instead of a silent gap. creditCost=0 because we refunded.
          try {
            await db.insert(schema.chatMessages).values({
              id: assistantMessageId,
              sessionId,
              role: "assistant",
              content: assistantText || "(no response — provider error)",
              providerId,
              model,
              tokensIn,
              tokensOut,
              stopReason: "error",
              creditCost: 0,
              idempotencyKey,
            });
          } catch (err) {
            if (!isDuplicateKeyError(err)) throw err;
          }

          emit({
            type: "error",
            code: errorCode ?? "unknown",
            message: errorMessage ?? "provider_error",
            refunded: refund.ok,
          });

          // Phase A1: audit-log the failed call too — provider cost
          // accrued even though the user was refunded, so the margin
          // rollup must see it. creditsSpent=0 because the refund
          // effectively zeroed out the debit.
          await recordAiUsage({
            userId,
            operation: "chat_turn",
            providerId,
            model,
            inputTokens: tokensIn,
            outputTokens: tokensOut,
            // Task #10: preserve any cache tokens the provider managed to
            // report before erroring — typically 0 on errors but honest
            // data is cheap to record.
            cachedInputTokens: cacheReadTokens,
            cacheCreationInputTokens: cacheWriteTokens,
            latencyMs: Date.now() - providerStartedAt,
            creditsSpent: 0,
            costMicros: null,
            success: false,
            errorCode: errorCode ?? "unknown",
            // Task #11 — error path: stream terminated before (or
            // because of) a provider error. Record whatever terminal
            // reason we did capture (typically null; could be
            // "error" if the adapter forwarded one) and leave
            // responseTruncated null since the call didn't complete
            // a valid stop_reason we can classify.
            stopReason: finalStopReason ?? "error",
            responseTruncated: isTruncatedStopReason(finalStopReason),
            ledgerId: spendLedgerId,
            idempotencyKey: `ai:${sessionId}:${idempotencyKey}`,
          });
        }
      } catch (err) {
        // Last-resort: persistence failed AFTER streaming. The user saw
        // the answer; the ledger already debited. Log and surface an
        // error event. We intentionally don't refund here — the compute
        // DID happen.
        console.error("[/api/ai/chat] persistence failed", {
          sessionId,
          assistantMessageId,
          spendLedgerId,
          err,
        });
        emit({
          type: "error",
          code: "unknown",
          message: "persist_failed",
          refunded: false,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Nginx (and Hostinger's edge) buffers responses by default; this
      // header tells it to flush. Without it, deltas arrive in one blob.
      "X-Accel-Buffering": "no",
    },
  });
}

// -- helpers ----------------------------------------------------------

async function loadHistory(sessionId: string): Promise<
  Array<Pick<
    typeof schema.chatMessages.$inferSelect,
    "role" | "content"
  >>
> {
  const rows = await db
    .select({
      role: schema.chatMessages.role,
      content: schema.chatMessages.content,
      createdAt: schema.chatMessages.createdAt,
    })
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.sessionId, sessionId))
    .orderBy(asc(schema.chatMessages.createdAt))
    .limit(HISTORY_WINDOW);
  return rows.map((r) => ({ role: r.role, content: r.content }));
}

function buildSystemPrompt({
  pdfSystemContext,
}: {
  pdfSystemContext: string | null;
}): string {
  // Task #26: prepend safety preamble so the model treats the attached
  // PDF text (wrapped below) as untrusted data. See lib/ai/prompt-safety.ts.
  const base =
    `${buildSafetyPreamble("chat")}\n\n` +
    "You are the PDFCraft AI assistant. Answer clearly and concisely. " +
    "When a document is attached, ground every factual claim in its text " +
    "and cite page numbers where you can. If the answer isn't in the " +
    "document, say so explicitly instead of guessing.";
  if (!pdfSystemContext) return base;
  return `${base}\n\n${pdfSystemContext}`;
}

function buildPdfSystemPrompt(opts: {
  filename: string;
  pageCount: number;
  ocrCandidates: number[];
  text: string;
  wasTruncated: boolean;
}): string {
  const ocr = opts.ocrCandidates.length
    ? `\nNote: pages ${opts.ocrCandidates.join(", ")} appear to be scanned ` +
      "images with minimal text. If the user asks about those pages, " +
      "suggest running OCR first.\n"
    : "";
  const truncation = opts.wasTruncated
    ? "\n(PDF truncated to fit context — if a question references later " +
      "pages and the answer isn't below, say the excerpt ends before that point.)\n"
    : "";
  // Task #26: PDF text is untrusted — wrap in sentinel tags so the model
  // can't be hijacked by instructions embedded in the document body.
  return (
    `The user has attached a PDF titled "${opts.filename}" (${opts.pageCount} pages). ` +
    `The full extracted text follows inside the untrusted_input tag. Pages are separated by \\f.${ocr}${truncation}\n` +
    wrapUntrustedInput(opts.text, { sourceLabel: "pdf_attachment" })
  );
}

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

function sseReplay(existing: {
  messageId: string;
  text: string;
  providerId: AIProviderId;
  model: string;
  stopReason: StopReason;
  tokensIn: number;
  tokensOut: number;
  creditCost: number;
}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      emit({
        type: "meta",
        userMessageId: null,
        assistantMessageId: existing.messageId,
        providerId: existing.providerId,
        model: existing.model,
        pdfPageCount: 0,
        creditCost: existing.creditCost,
        replay: true,
      });
      // Emit the whole stored text as one delta. Simpler than
      // re-chunking; the UI's append logic handles either case.
      if (existing.text.length > 0) {
        emit({ type: "delta", text: existing.text });
      }
      emit({
        type: "done",
        stopReason: existing.stopReason,
        usage: { inputTokens: existing.tokensIn, outputTokens: existing.tokensOut },
        model: existing.model,
        providerId: existing.providerId,
        replay: true,
      });
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function isDuplicateKeyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; errno?: number };
  return e.code === "ER_DUP_ENTRY" || e.errno === 1062;
}

// Exported for type inference by clients (the UI consumes these as the
// parsed SSE payload union).
export type ChatSseEvent =
  | {
      type: "meta";
      userMessageId: string | null;
      assistantMessageId: string;
      providerId: AIProviderId;
      model: string;
      pdfPageCount: number;
      creditCost: number;
      replay?: boolean;
    }
  | { type: "delta"; text: string }
  | {
      type: "done";
      stopReason: StopReason;
      usage: { inputTokens: number; outputTokens: number };
      model: string;
      providerId: AIProviderId;
      replay?: boolean;
    }
  | {
      type: "error";
      code:
        | "rate_limit"
        | "overloaded"
        | "bad_request"
        | "auth"
        | "context_length"
        | "unknown";
      message: string;
      refunded: boolean;
    };

// Ensure that every cost entry is referenced somewhere, so dead entries
// surface on refactor rather than rotting silently. (This is a no-op at
// runtime — TS shakes it out — but it makes "we removed chat_turn and
// forgot to delete this line" a compile error.)
AI_OPERATION_COSTS.chat_turn;
