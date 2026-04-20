# Phase 5 — Chat-with-PDF architecture

This document is the canonical reference for the AI layer added in Phase 5.
Read it before touching anything under `lib/ai/`, `app/api/ai/`,
`app/app/chat/`, or the `chat_sessions` / `chat_messages` tables.

The design deliberately mirrors the payments layer from Phase 4:

- A portable `AIProvider` interface that every adapter implements.
- An env-driven registry that loads whichever adapters have their keys set.
- One idempotent credit-spend helper (`spendCredits`) and one matching
  refund helper (`refundCredits`) that every AI route calls — same
  ledger, same audit trail as payments.
- Discriminated-union SSE events so the client renders incrementally
  without parsing provider-specific chunk shapes.

Adding a new provider (Mistral, Google, Azure, a local llama.cpp, …) is
an adapter file + a registry row + one or two env vars. No route or
schema changes.

---

## Module map

```
lib/ai/
  types.ts              AIProviderId, ChatMessage, ChatChunk, StopReason, …
  provider.ts           AIProvider interface + UnsupportedCapabilityError
  registry.ts           env-driven loader — getProvider / selectProvider / listConfiguredProviderIds
  credits.ts            spendCredits + refundCredits (thin wrapper over grantCredits)
  pdf-extract.ts        pdfjs-dist Node wrapper — text + OCR-candidate detection
  adapters/
    anthropic.ts        @anthropic-ai/sdk adapter
    openai.ts           openai adapter

app/api/ai/
  chat/route.ts         streaming SSE endpoint (see §"/api/ai/chat")

app/app/chat/
  page.tsx              session list (active + archived)
  [id]/page.tsx         session detail — loads history, hands off to ChatClient
components/app/chat/
  ChatClient.tsx        streaming UI (SSE parser + optimistic state)
  NewChatButton.tsx     form that calls createChatSessionAction
  ChatRowActions.tsx    rename / archive / delete per row
components/app/files/
  OpenInChatButton.tsx  "Open in chat" affordance on /app/files

lib/chat-actions.ts     server actions: create / rename / archive / delete session

db/schema/app.ts        chat_sessions, chat_messages (see §Schema)

lib/pricing.ts          AI_OPERATION_COSTS + AIOperationId type
```

---

## AIProvider interface

Every adapter implements `lib/ai/provider.ts`:

```ts
interface AIProvider {
  readonly id: AIProviderId;          // "anthropic" | "openai"
  readonly displayName: string;       // "Anthropic", "OpenAI"
  readonly capabilities: AICapabilities;
  readonly defaultModel: string;

  chat(input: ChatInput): Promise<ChatResult>;
  streamChat(input: ChatInput): AsyncIterable<ChatChunk>;
}
```

Rules for adapter authors — enforced by review, not by the compiler:

- **Do not leak provider-specific types.** Anthropic's `Message`, OpenAI's
  `ChatCompletion`, etc. stay inside the adapter. Callers only see types
  from `lib/ai/types.ts`.
- **Adapters are `"server-only"`** — the first import in every adapter
  file is the `server-only` sentinel so webpack refuses to bundle API
  keys into a client chunk.
- **`streamChat()` emits exactly one terminal chunk** (`done` or `error`).
  Callers `for await` and break once they see it.
- **Provider auth / rate-limit / overload errors emit `ChatChunk.error`
  with a `code`; they do not throw.** The route handler uses the code to
  decide refund policy (see below). Adapters throw only for
  unrecoverable bugs like broken JSON parse.
- **`chat()` is a thin wrapper over `streamChat()`** — one code path,
  one place to fix bugs.

### ChatChunk — the streaming discriminated union

```ts
type ChatChunk =
  | { kind: "text_delta"; text: string }
  | { kind: "done"; stopReason: StopReason; usage: TokenUsage | null; model: string; providerId: AIProviderId }
  | { kind: "error"; message: string; code: "rate_limit" | "overloaded" | "bad_request" | "auth" | "context_length" | "unknown" }
```

The `error.code` drives refund policy in the route handler:

| code              | refund? | reasoning                                            |
| ----------------- | ------- | ---------------------------------------------------- |
| `rate_limit`      | yes     | Provider throttled us; not the user's fault.         |
| `overloaded`      | yes     | Provider unavailable; not the user's fault.          |
| `auth`            | yes     | Our env key broke; definitely not the user's fault.  |
| `context_length` | yes     | We should have truncated upstream; our bug.           |
| `bad_request`     | yes     | Malformed prompt; our bug.                           |
| `unknown`         | yes     | Catch-all; refund by default.                        |

As of Phase 5 every error code refunds. If in future we decide a class
of errors IS the user's fault (e.g. "you uploaded an 80MB PDF"), we'd
fail fast before `spendCredits` rather than flip this policy.

---

## Registry — env-driven, zero code to switch providers

`lib/ai/registry.ts` loads adapters lazily based on env vars:

```ts
// Controlled by ANTHROPIC_API_KEY, ANTHROPIC_MODEL
const anthropic = { isConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY), … };

// Controlled by OPENAI_API_KEY, OPENAI_MODEL
const openai = { isConfigured: () => Boolean(process.env.OPENAI_API_KEY), … };
```

Three public helpers:

- **`getProvider(id)`** — fetch a specific adapter if it's configured.
- **`listConfiguredProviderIds()`** — sync; safe to call in a page that
  only needs to decide which buttons to render.
- **`selectProvider({ requireCapability?, prefer? })`** — picks the
  right adapter for the current turn. Honors a session's locked-in
  provider (set on the first turn) when passed via `prefer`.

To add a third provider:

1. Write `lib/ai/adapters/mistral.ts` implementing `AIProvider`.
2. Add a row to the registry table with its `isConfigured` predicate.
3. Extend the `AIProviderId` union in `types.ts` (will fail `tsc` until
   every exhaustive switch on `providerId` is updated — that's the point).
4. Add `MISTRAL_API_KEY` / `MISTRAL_MODEL` to `.env.example` + the
   README's prod env list.

No route changes. No schema changes.

---

## `/api/ai/chat` — the streaming endpoint

`app/api/ai/chat/route.ts` is the only route that calls the registry
today. It runs on the Node runtime (`runtime = "nodejs"`) because
pdfjs-dist needs Node APIs and the SSE stream wants access to the raw
`ReadableStream`.

### Lifecycle (11 steps)

1. **Auth** — `auth()`; 401 if no session.
2. **Parse multipart form** — fields: `sessionId`, `message`, `idempotencyKey`, optional `pdf`.
3. **Load the session** — must belong to the current user, or 404.
4. **Idempotency replay check** — if `chat_messages.idempotencyKey` already
   exists for `ai:${sessionId}:${idempotencyKey}`, stream the stored
   content back as if we'd generated it just now. No spend, no adapter
   call, no second user-message row.
5. **Select provider** — `selectProvider({ prefer: row.providerId })`.
   If nothing is configured (no Anthropic key, no OpenAI key), return
   503.
6. **Spend credits** — `spendCredits({ userId, operation: "chat_turn", idempotencyKey })`.
   Insufficient balance → 402. Duplicate key (another replay racing) →
   replay that row instead.
7. **Extract PDF text** — if `pdf` is attached. 25 MB ceiling. Fails
   here refund credits + return 400.
8. **Build prompt** — reassemble history (skipping stored system rows),
   prepend a freshly-built system prompt including PDF excerpt, OCR
   candidates, and truncation notice. PDF context budget: 240 000 chars.
   History window: last 40 messages.
9. **Persist user-message row** — `idempotencyKey: null` (the unique
   index's guard is for assistant rows only).
10. **Open the stream** — return a `ReadableStream<Uint8Array>` with
    `text/event-stream` headers. First SSE event is always `meta`.
11. **Stream adapter output** — forward `text_delta` chunks as SSE
    `delta` events. On terminal `done`: insert assistant row with the
    idempotency key (duplicate-key errors tolerated — a concurrent retry
    won). On terminal `error`: refund credits + insert a marker row
    with `stopReason: "error", creditCost: 0`.

Constants (top of the route file):

```ts
const MAX_PDF_BYTES = 25 * 1024 * 1024;   // 25 MB
const HISTORY_WINDOW = 40;                 // last N messages sent to the model
const PDF_CONTEXT_CHAR_BUDGET = 240_000;   // ~60 k tokens, fits inside 200 k-window models
```

### SSE event shape

The endpoint emits four event kinds. Every event is one SSE `data:`
line; `\n\n` separates events.

```ts
// Always first — tells the client what to attach delta chunks to.
{ kind: "meta", userMessageId, assistantMessageId, providerId, model,
  pdfPageCount: number | null, creditCost: number }

// Zero or more — append `text` to the pending assistant bubble.
{ kind: "delta", text: string }

// Always last on a successful turn.
{ kind: "done", stopReason: StopReason }

// Always last on a failed turn. Client surfaces the message +
// "credit refunded" hint; the server already did the refund.
{ kind: "error", message: string, code: ChatChunk["error"]["code"], refunded: boolean }
```

The client parser is in `components/app/chat/ChatClient.tsx`. It buffers
bytes, splits on `\n\n`, and dispatches on `kind`.

### Idempotency contract

- **Client generates a UUID per submit attempt** (`crypto.randomUUID()`
  or a JS fallback). Retrying the same attempt reuses the same key.
- **Server key for assistant rows** is `ai:${sessionId}:${idempotencyKey}`.
  The `chat_messages` unique index on `idempotencyKey` is the
  deduplication point — a duplicate insert throws, which we tolerate
  silently (a concurrent retry won).
- **User-message rows** use `idempotencyKey: null` (the unique index
  allows multiple NULLs). The replay path infers the associated user
  row from the assistant row's `parentMessageId`.
- **Credit spend idempotency** is delegated to `grantCredits` — same key
  under the `ai_chat_turn` reason. Refund uses key
  `refund:${originalKey}` under reason `ai_chat_turn_refund`.

---

## Credit spend — `spendCredits` / `refundCredits`

`lib/ai/credits.ts` wraps `grantCredits` (from the payments layer) with
an AI-specific cost table and pre-flight balance check.

```ts
export async function spendCredits(input): Promise<
  | { ok: true;  ledgerId; creditsSpent; newBalance }
  | { ok: false; reason: "insufficient"; balance; required }
  | { ok: false; reason: "duplicate" }
>;

export async function refundCredits(input): Promise<
  | { ok: true; ledgerId; creditsRefunded; newBalance }
  | { ok: false; reason: "duplicate" }
>;
```

Costs live in `lib/pricing.ts`:

```ts
export const AI_OPERATION_COSTS: Record<AIOperationId, number> = {
  chat_turn: 1,   // one credit per chat turn — regardless of PDF length
  summarize: 3,
  translate: 5,
  ocr:       2,
};
```

Rationale for flat per-operation pricing (vs. token-metered):

- **UX simpler**: users can predict their spend without a tokenizer.
- **Implementation simpler**: debit once up front, refund once on error.
  No mid-stream proration.
- **Cost to us averages out** over a day of traffic.

If we ever want metered billing, the shape of the table changes from
`number` to `(usage) => number` — a narrow refactor, since every call
site is `AI_OPERATION_COSTS[op]`.

**Pre-flight balance check is not a reservation.** Two concurrent turns
could both pass the check and then both debit, leaving the user with a
tiny negative balance. That's an acceptable race for a flat 1-credit
op; a proper pessimistic lock would be heavier than the problem. If we
ever meter or charge more per op, swap in a `SELECT … FOR UPDATE` on
the credits row.

---

## PDF extraction — `lib/ai/pdf-extract.ts`

`extractPdfText(buf)` runs pdfjs-dist's legacy Node build over the
uploaded bytes and returns:

```ts
{
  pageCount: number;
  text: string;               // joined page text, trimmed
  truncated: boolean;         // true if we hit PDF_CONTEXT_CHAR_BUDGET
  ocrCandidatePages: number[]; // pages where text-per-page fell below threshold
}
```

The route builds a system prompt that includes:

- PDF filename and page count.
- The extracted text, sliced to `PDF_CONTEXT_CHAR_BUDGET` chars.
- If `truncated`, a note telling the model the text was cut off.
- If `ocrCandidatePages.length > 0`, a note that those pages are image-
  based and the model should acknowledge it can't read them. OCR as a
  credit-billed operation will land in Phase 5.1.

**Why server-side text extraction** rather than uploading the PDF directly
to the provider? Two reasons:

- **Provider parity**: not every adapter supports PDF attachments.
  Extracting on our side means new adapters (Mistral, local llama)
  work out of the box.
- **Cost control**: sending 500 pages of base64'd PDF to a provider
  that charges per-token is wildly expensive. A text extract is
  10-50× cheaper.

The tradeoff is that we lose images, charts, and tables that depend on
visual layout. For PDFs where that matters we'll add an explicit
"attach PDF pages as images" toggle in Phase 5.1.

---

## Schema

Two new tables (`db/schema/app.ts`):

```sql
chat_sessions (
  id           varchar(36)  primary key,
  user_id      varchar(36)  not null, -- FK users.id
  title        varchar(256) not null,
  file_id      varchar(36)  null,     -- optional attached file
  provider_id  varchar(32)  null,     -- locked on first turn
  model        varchar(128) null,     -- locked on first turn
  archived_at  timestamp    null,
  created_at   timestamp    not null default CURRENT_TIMESTAMP,
  updated_at   timestamp    not null default CURRENT_TIMESTAMP on update CURRENT_TIMESTAMP,
  index (user_id, archived_at, updated_at)
)

chat_messages (
  id                varchar(36)  primary key,
  session_id        varchar(36)  not null, -- FK chat_sessions.id, cascade
  parent_message_id varchar(36)  null,
  role              enum('system','user','assistant') not null,
  content           mediumtext   not null,
  stop_reason       varchar(32)  null,
  provider_id       varchar(32)  null,
  model             varchar(128) null,
  credit_cost       int          not null default 0,
  idempotency_key   varchar(128) null unique, -- nullable unique = allows many NULLs
  created_at        timestamp    not null default CURRENT_TIMESTAMP,
  index (session_id, created_at)
)
```

Notes:

- `chat_sessions.provider_id` + `model` are only written on the first
  turn and never overwritten. Follow-up turns stay on the same adapter
  even if admin flips env vars mid-conversation.
- `chat_messages.idempotency_key` being nullable is load-bearing —
  MySQL allows many NULLs in a unique index, which is exactly what we
  want for user-message rows.
- `ON DELETE CASCADE` on `chat_messages.session_id` keeps the
  `deleteChatSessionAction` cheap.

---

## Env vars

Both are optional — a deployment with neither just hides the chat UI
with a "provider not configured" message.

| Variable             | Required | Default                      | Purpose                                           |
| -------------------- | :------: | ---------------------------- | ------------------------------------------------- |
| `ANTHROPIC_API_KEY`  |    —     | —                            | Enables the Anthropic adapter.                    |
| `ANTHROPIC_MODEL`    |    —     | `claude-haiku-4-5-20251001`  | Override the default Anthropic model.             |
| `OPENAI_API_KEY`     |    —     | —                            | Enables the OpenAI adapter.                       |
| `OPENAI_MODEL`       |    —     | `gpt-4o-mini`                | Override the default OpenAI model.                |

Set one to unlock the chat UI. Set both and the registry picks
whichever is configured (or whichever the session locked in on its
first turn).

---

## Next.js config note

The OpenAI and Anthropic Node SDKs ship Node-runtime shims that import
several optional polyfills for pre-Node-18 runtimes (`node-fetch`,
`formdata-node`, `agentkeepalive`, `abort-controller`,
`form-data-encoder`). On Node 18+ that code path is dead, but webpack
still tries to resolve the imports at build time and fails.

The fix, in `next.config.mjs`:

```js
experimental: {
  serverComponentsExternalPackages: ['openai', '@anthropic-ai/sdk', 'pdfjs-dist'],
},
```

Externalized packages are `require()`d from `node_modules` at runtime
rather than bundled. `pdfjs-dist` is listed for the same reason — its
legacy build has Node-only dynamic requires that webpack can't
statically analyze.

If you add a third AI SDK, add it to this list before your first build.

---

## Adding a new AI operation

1. Add the op id to `AIOperationId` in `lib/pricing.ts` and a cost to
   `AI_OPERATION_COSTS`.
2. Write the route: `app/api/ai/<op>/route.ts`. Steal the structure
   from `chat/route.ts`.
3. Call `spendCredits({ operation: "<op>", … })` before the adapter.
4. Call `refundCredits({ operation: "<op>", … })` on failure.

That's it. The ledger, idempotency, and auth paths are all shared.

---

## Phase 5.1 — Summarize

Phase 5.1 ships the first AI operation that produces a saved artifact
instead of a live chat stream. The same `AIProvider` layer from Phase 5
is reused — the new surface is a helper, a route, a table, and a tool
runner. Use this section as the template for translate (5.2) and OCR
(5.2+).

### Module additions

```
lib/ai/summarize.ts            Prompt builder + provider invocation
lib/markdown-mini.ts           Zero-dep markdown-to-HTML renderer
app/api/ai/summarize/route.ts  POST multipart → JSON
components/tools/SummarizePdfTool.tsx
                               Client runner (dropzone + depth + result card)
app/app/files/[id]/preview/
  page.tsx                     Read-only view of any saved ai_outputs row
db/schema/app.ts               New `ai_outputs` table (1:1 with files)
```

### Depth levels

The user picks one of three depths; the prompt and token cap scale with
the choice.

| Depth      | Output shape                                                 | `maxTokens` | Credit cost |
| :--------- | :----------------------------------------------------------- | :---------: | :---------: |
| `tldr`     | One paragraph (~3 sentences)                                 |     300     |      3      |
| `standard` | TL;DR + Key Points + Section Summaries                       |    1200     |      3      |
| `detailed` | Standard + Notable Quotes (cited) + Open Questions           |    2000     |      3      |

Flat pricing is intentional — a single "3 credits / doc" line on the
pricing page is easier to reason about than a per-token meter. If a
future depth ("full-document legal review") materially outspends the
rest, peel it out to its own op id with its own cost.

### Input truncation (not chunking)

`summarizePdf` truncates the extracted text to `SUMMARIZE_CHAR_BUDGET =
240_000` chars (~60k tokens) and sets a `wasTruncated` flag. The system
prompt tells the model "if the excerpt clearly continues past the end,
note that explicitly." The tool runner and preview page both show a
"truncated (long doc)" badge when the flag is set.

Chunked map-reduce summarization lands in Phase 5.2 when we have real
user data showing how many docs exceed the budget. The truncation path
lets us ship today without fabricating an architecture for a load we
haven't measured.

### Output format — markdown, not JSON

The prompt requests markdown with specific H2 headers (`## TL;DR`,
`## Key Points`, etc.). Markdown is more reliable at LLM scale than JSON:
no trailing-comma bugs, no code fences wrapping the JSON, no provider-
specific quirks around escape sequences. If structured extraction is
ever needed, parse the markdown with a simple heading walker — that's a
one-way door.

Provider answers sometimes arrive wrapped in a ```markdown ... ``` fence;
`postProcessMarkdown()` strips it. For `tldr` depth it also prepends
`## TL;DR` so the saved file reads cleanly when opened later.

### `ai_outputs` table

```sql
CREATE TABLE ai_outputs (
  file_id     CHAR(36)    PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
  kind        ENUM('summary', 'translation', 'ocr') NOT NULL,
  content_md  TEXT        NOT NULL,       -- 64KB ceiling
  meta        JSON        NULL,
  created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
```

Shape notes:

- **PK on `file_id`** — a file has at most one AI artifact. Multiple
  summaries of the same PDF produce separate files rows (each with a
  unique UUID), each with its own ai_outputs row. No "versions" column.
- **ON DELETE CASCADE** means deleting the file from `/app/files` wipes
  the content automatically; no GC job.
- **`content_md` is `TEXT` (64KB)** — comfortably fits summaries (≤4KB
  in practice) and typical short translations. Very long translations
  will need `MEDIUMTEXT`; that's flagged as a known limit in the 5.2
  work list.
- **`meta` is JSON** — each kind stores different provenance:
  - summary: `{ sourceSha256, sourceName, sourcePageCount, depth, providerId, model, tokensIn, tokensOut, wasTruncated, ocrCandidatePages, creditCost }`
  - translation (5.2): adds `targetLang`, chunking details
  - ocr (5.2+): adds per-page confidence
  Free-form by design — normalizing across kinds would create empty
  columns for most rows.

### Route — POST /api/ai/summarize

Request: `multipart/form-data` with `{ pdf, depth, idempotencyKey }`.
Response: JSON.

Lifecycle:

1. `auth()` → 401 if anonymous.
2. Parse multipart; validate size (≤25MB) and depth.
3. `spendCredits("summarize", 3)` — idempotency key is
   `ai:summarize:<client-supplied-uuid>`. 402 on insufficient, 409 on
   duplicate.
4. `extractPdfText(bytes)` (pdfjs-dist legacy build). Refund + 400 on
   parse failure. 422 + refund if the extracted text is <40 chars
   (fully-image PDFs — route OCR in 5.2).
5. `summarizePdf(...)` → markdown. Refund + 502 on provider error,
   refund + 503 on `NoAIProviderConfiguredError`.
6. `db.transaction()` inserts `files` row (source='tool',
   toolId='ai-summarize') + `ai_outputs` row. On failure we return 207
   with the markdown inline — compute succeeded, so we do NOT refund;
   the user's credits paid for a real summary they can still copy.
7. Return `{ fileId, filename, markdown, creditCost, newBalance,
   usage, providerId, model, wasTruncated, pageCount }`.

Idempotency at 5.1 is debit-only: the ledger's unique index prevents
double-charges on retries, but a duplicate key returns 409 instead of
replaying the cached result. Full replay-on-duplicate lands in 5.2 with
a summarize-result lookup index.

### Client — `SummarizePdfTool`

Single-file dropzone, three-button depth radio, "Summarize — 3 credits"
CTA. On 200 it renders the markdown through `renderMarkdown()` from
`lib/markdown-mini.ts` inside a result card with Copy / Download (.md) /
View actions. The View link jumps to `/app/files/<id>/preview`.

`lib/markdown-mini.ts` is deliberately scoped to what the summarizer
emits: H2–H6 headings, paragraphs, `-`/`*` lists, `>` blockquotes, and
`**bold**`/`*italic*`/`` `code` ``/`[text](url)`. Every source character
is HTML-escaped before inline markers are interpreted; link hrefs are
scheme-filtered to `http`/`https`/`mailto` + same-origin relative. This
avoids pulling in `marked` or `react-markdown` for content we fully
control the shape of.

### Preview page — `/app/files/[id]/preview`

Server component. Joins `files` → `ai_outputs` on `file_id`, filters by
the authed user's id, and renders the stored markdown through
`renderMarkdown()`. A guessed id for another user's file hits zero rows
and returns 404 — no per-file ACL needed beyond the join filter.

The same page will render translations (5.2) and OCR (5.2+); the `kind`
column controls the header label and small metadata tweaks.

### Adding another artifact-producing AI op

Follow the pattern:

1. Add the op id to `AIOperationId` + `AI_OPERATION_COSTS`.
2. Add the op id to the `aiOutputs.kind` enum (schema change).
3. Build `lib/ai/<op>.ts` mirroring `summarize.ts` (prompt builder +
   `runChat` invocation).
4. Build `app/api/ai/<op>/route.ts` mirroring `summarize/route.ts`
   (auth → validate → spend → extract → run → transactional persist).
5. Add `ai-<op>` to `AI_PREVIEWABLE_TOOL_IDS` in `/app/files/page.tsx`
   so the View link appears on the files list.
6. Add the tool id to `LIVE_TOOL_IDS` and a switch case in
   `/app/tool/[id]/page.tsx`.
7. Build a `components/tools/<Op>PdfTool.tsx` client runner.

---

## Phase 5.2 — Translate

Phase 5.2 lands the second artifact-producing AI op, and it's the first
that actually needed the chunking story we hand-waved in 5.1. A 300-page
manual translated into Japanese easily blows past any single provider
call's output ceiling — so translate ships with a real map-reduce
pipeline while summarize keeps its simpler truncate-and-prompt design.

Everything else follows the 5.1 template: same `AIProvider`, same credit
lifecycle, same `ai_outputs` row, same preview page. If you're adding
OCR or any other artifact op, start from this section's module list and
adapt.

### Module additions

```
lib/ai/translate.ts            Prompt builder + chunkText + map-reduce driver
lib/ai/translate-langs.ts      Static 22-language catalog (non-server-only)
app/api/ai/translate/route.ts  POST multipart → JSON
components/tools/TranslatePdfTool.tsx
                               Client runner (dropzone + language select + result card)
db/schema/app.ts               `ai_outputs.content_md` upgraded TEXT → MEDIUMTEXT
```

Two files deserve a note:

- **`translate-langs.ts`** exists because `translate.ts` has a
  `server-only` sentinel (it reaches into the AI registry) and a client
  component can't import from it. The language catalog is static data
  we want in both bundles, so it lives in its own module and `translate.ts`
  re-exports it for server consumers that don't want to know about the
  split.
- **`db/schema/app.ts`** bumps `content_md` from `TEXT` (64KB) to
  `MEDIUMTEXT` (16MB). A long technical translation can easily exceed
  64KB once you factor in markdown overhead and non-ASCII byte
  inflation (e.g. UTF-8 Chinese is ~3 bytes/char). Run
  `ALTER TABLE ai_outputs MODIFY content_md MEDIUMTEXT NOT NULL;` on
  any environment that was created during 5.1.

### Target-language validation

The route accepts a `targetLang` form field and validates with a
laxer-than-RFC-5646 regex:

```ts
const BCP47_ISH = /^[a-zA-Z]{1,3}(-[a-zA-Z0-9]{1,8})*$/;
//                  ^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^^
//                  primary subtag  zero-or-more subtags
```

This accepts `en`, `pt-BR`, `zh-Hant`, `sr-Latn-RS`, and rare ISO 639-3
codes like `eng` or `cmn`. It rejects `"english"` (>3 letters in the
primary subtag), `"EN_us"` (underscore instead of hyphen), injection
attempts with punctuation, and anything longer than 20 chars total.

Bogus-but-parseable codes (e.g. `"xx-YY"`) slip through by design — the
model will translate into the nearest reasonable language rather than
erroring. Not a great outcome, but preferable to rejecting legitimate
rare codes.

The UI offers 22 curated languages via a `<select>` plus an "Other
(enter BCP-47 code)…" option that reveals a monospace free-text input.
Each curated row carries a native-name label (`"Español"` not
`"Spanish"`) which is passed to the model alongside the code — the
label goes into the prompt for clarity, the code goes into
`ai_outputs.meta.targetLang` for downstream filtering.

### Chunking — real map-reduce, not truncation

Unlike summarize, translate must emit output proportional to input
length. A 300k-char PDF produces ~300k chars of translation; there is
no provider whose single-response token cap tolerates that. So
`translatePdf` splits on paragraph boundaries, translates each chunk
independently, and joins the results back with `\n\n`.

Key constants in `lib/ai/translate.ts`:

| Constant                        | Value    | Rationale                                                       |
| :------------------------------ | :------: | :-------------------------------------------------------------- |
| `TRANSLATE_CHUNK_CHAR_BUDGET`   | 20 000   | ~5k input tokens + ~6k output tokens fits every adapter safely. |
| `TRANSLATE_TOTAL_CHAR_CEILING`  | 600 000  | Beyond this, input is truncated and `wasTruncated: true`.       |
| `maxTokensForChunk(n)`          | dynamic  | `min(max(ceil(n / 3) * 1.3, 400), 6000)` — per-chunk output cap.|

The chunker algorithm:

1. Split on `/\n\n+/` to get paragraphs.
2. Walk paragraphs left-to-right, packing into a current buffer until
   the next paragraph would overflow `TRANSLATE_CHUNK_CHAR_BUDGET`.
3. A paragraph larger than the budget (think: a single 30k-char table
   block) gets emitted as its own chunk — we'd rather send it whole
   and trust the model's context window than cut mid-sentence.
4. `joinChunks()` rejoins translated outputs with `\n\n` and filters
   empties.

Chunks are translated **sequentially** with `temperature: 0.1`. The
system prompt tells the model: preserve markdown structure, preserve
`\f` page-break markers verbatim, preserve `[p. N]` page citations,
preserve proper nouns and URLs and code, and output only the
translation — no preamble, no trailing commentary.

Token usage is summed across chunks and surfaced in
`ai_outputs.meta.tokensIn` / `tokensOut`. The number of chunks lands in
`meta.chunkCount` with `meta.wasChunked` true when `chunkCount > 1` —
the preview page renders it as a `· 3 chunks` note on the header.

### Credit pricing

Flat **5 credits per document**, set in `AI_OPERATION_COSTS.translate`.
Same rationale as summarize: one sticker price is easier to reason
about than a per-page meter, and the chunking algorithm means a 300-
page doc costs the same as a 10-page one — that's the point of a flat
fee.

If translate volume starts looking like free abuse (cheap 500-page
contract translations), peel out a separate `translate-long` op with a
higher cost rather than metering every existing user.

### `ai_outputs` meta shape

```ts
{
  sourceSha256: string,
  sourceName: string,
  sourcePageCount: number,
  targetLang: string,                 // e.g. "pt-BR"
  targetLangLabel: string | null,     // e.g. "Português" or null for uncurated codes
  providerId: "anthropic" | "openai",
  model: string,
  tokensIn: number,
  tokensOut: number,
  wasTruncated: boolean,              // true if input exceeded 600k chars
  wasChunked: boolean,                // true if > 1 chunk
  chunkCount: number,
  ocrCandidatePages: number[],        // carried through from extract, not consumed yet
  creditCost: number,
}
```

Values that are translate-specific (`targetLang`, `wasChunked`,
`chunkCount`) only render on preview rows where `kind === "translation"`
— the header fall-through logic in `/app/files/[id]/preview/page.tsx`
keys off the enum, not the meta presence.

### Route — POST /api/ai/translate

Mirrors `/api/ai/summarize` step-for-step. The only structural
differences:

- Validation layer adds BCP-47 parsing and a 20-char length cap on
  `targetLang`.
- Step 5 invokes `translatePdf()` instead of `summarizePdf()` — same
  refund-on-fail pattern, same 502/503 split for provider errors vs.
  missing provider.
- Persistence writes `kind: "translation"` and the translate meta shape.

Intentional structural parity with summarize means touching one route
is a cue to check the other. If we diverge them later (e.g. translate
gets a streaming variant), the comment block at the top flags the
divergence explicitly.

### Client — `TranslatePdfTool`

Dropzone + a `<select>` defaulting to `es`, plus a "Use a different
language" expander that swaps the select for a monospace text input
with live client-side BCP-47 validation (same regex as the server).
"Translate — 5 credits" CTA. Result card supports Copy / Download (as
`.md`) / View, with View linking to `/app/files/<id>/preview`.

Error handling is slightly broader than summarize — we map 400, 401,
402, 409, 413, 422, 502, 503 to distinct, actionable messages.

### Known gaps / deferred to 5.3

- **Vision OCR** — scanned PDFs (>40 chars extract) still 422. The
  `ocrCandidatePages` array is stored in meta for forward-compat but
  unused in the render.
- **Replay-on-duplicate idempotency** — a duplicate `idempotencyKey`
  still returns 409. Replaying the cached translation instead of
  rejecting lands with the summarize replay work.
- **Layout-preserving translation** — the tool card on `/tools` says
  "Preserve layout across 20+ languages." Today, "preserve layout"
  means "preserve markdown structure extracted from the PDF." A
  layout-preserving PDF-out path (word positions, fonts, page geometry)
  is a Phase 6 concern — it needs a rasterizer and a typesetter, not
  a prompt tweak.

---

## Phase 5.3 — Compare

Phase 5.3 ships the third artifact-producing AI op: a two-PDF redline
diff with severity classification. Unlike summarize and translate, it
takes **two** inputs (original A, revised B) and produces a single
markdown redline document that a contract reviewer can skim for what
actually changed — not just a character diff.

### Module additions

- `lib/ai/compare.ts` — the helper. `comparePdfs({ original, revised,
  ... })` → `{ markdown, providerId, model, usage, wasTruncated,
  originalChars, revisedChars }`. Throws `NoAIProviderConfiguredError`
  when no provider is wired (route maps to 503).
- `app/api/ai/compare/route.ts` — the endpoint. `multipart/form-data`
  with `pdfA` + `pdfB` + optional `idempotencyKey`. Mirrors the
  summarize/translate route shape.
- `components/tools/ComparePdfTool.tsx` — the client runner. Two
  labeled dropzones (Original / Revised) side-by-side, disabled CTA
  until both slots hold a PDF, result card with Copy / Download(.md) /
  View actions.
- `lib/tools.ts` — `ai-compare` row cost display: `"15 credits / diff"`
  (flat, no tilde — it's not per-page).
- `lib/pricing.ts` — adds `"compare"` to `AIOperationId` with
  `AI_OPERATION_COSTS.compare = 15`.
- `db/schema/app.ts` — `ai_outputs.kind` enum extended with
  `"comparison"` (noun, to match `summary` / `translation` / `ocr`).
- `app/app/files/page.tsx` — `ai-compare` added to
  `AI_PREVIEWABLE_TOOL_IDS` so the eye icon links to the preview page.
- `app/app/files/[id]/preview/page.tsx` — `AiOutputMeta` extended with
  `originalName / revisedName / originalPageCount / revisedPageCount /
  originalChars / revisedChars`; header renders `"<A> vs <B> · M / N
  pages"` when `kind === "comparison"`.

### Kind enum bump to `"comparison"`

`ai_outputs.kind` is now `mysqlEnum(["summary", "translation", "ocr",
"comparison"])`. Requires a `drizzle-kit generate` + migration in the
target env — a schema-only push is not enough because MySQL enums are
column-constraint baked.

Named **`"comparison"`** (noun), not `"compare"` (verb), to match the
existing noun-form values. The route writes `kind: "comparison"`; the
preview page maps it to the label `"Comparison"`.

### Input budgets — uniform per-side truncation

Two budgets, both in `lib/ai/compare.ts`:

| Constant | Value | Meaning |
| --- | --- | --- |
| `COMPARE_COMBINED_CHAR_BUDGET` | `400_000` | Combined ceiling across both sides (~100k tokens worst case — comfortably inside every supported adapter). |
| `COMPARE_SIDE_CHAR_BUDGET` | `200_000` | Per-side ceiling. Half of the combined budget. |
| `COMPARE_MAX_OUTPUT_TOKENS` | `4_000` | Big enough for a thorough redline of a 30-page contract with 40+ changes. |

**Truncation is uniform, not preferential.** Each side is capped
independently at `COMPARE_SIDE_CHAR_BUDGET`. We explicitly do NOT "keep
the longer side" — because if a 6-page replacement is diffed against a
40-page original, a length-weighted truncation would miss every
removed section. Uniform capping keeps both ends of the diff visible
to the model. If either side is truncated, `wasTruncated: true` is
surfaced to the response + preview header.

**No chunking at v1.** The failure mode for compare is "both docs are
long" — but chunking a diff requires cross-document alignment, and
paragraph insertions drift the alignment. v1 truncates and surfaces
the flag; revisit once real usage tells us which doc pairs people are
diffing.

### Severity taxonomy (pinned in the prompt)

Reviewers pay for the *severity signal* — it's the reason this tool
exists over a text diff. The taxonomy is baked into the system prompt
and documented here so consumers can rely on it:

| Tier | Meaning |
| --- | --- |
| **BREAKING** | Meaning reversed, obligation added, rights removed, or a default flipped. |
| **MATERIAL** | Numbers / dates / scope / deadlines / parties / defined terms changed. |
| **MINOR** | Wording tightened, clarifying additions, non-substantive restructurings. |
| **COSMETIC** | Typos, formatting, whitespace, pure style. |

The Summary section ends with a one-line bucket count (e.g. `"2
breaking, 5 material, 8 minor, 3 cosmetic"`) so a downstream parser
can surface a chip without re-walking the body.

### Output shape — exact H2 sections

The helper's prompt instructs the model to produce these H2 sections,
in this order, with these exact headers:

```
## Summary
## Breaking Changes
## Material Changes
## Minor Changes
## Cosmetic Changes
```

Each listed change uses this bullet shape:

```markdown
- **<short title>** — <one-sentence what-changed>.
  - A [A p. N]: > "<verbatim quote from A>"
  - B [B p. N]: > "<verbatim quote from B>"
  - <one-sentence why-it-matters>
```

Additions suffix the title with `(added)` and omit the A block;
removals suffix with `(removed)` and omit the B block. Temperature is
pinned at `0.1` for deterministic structure + faithful verbatim
quotes — higher temperature and the model starts paraphrasing the
quote blocks.

### Credit pricing — 15 flat per diff

Compare is flat-priced per diff (not per-page) because the work is
bounded on both ends: the input is capped by `COMPARE_COMBINED_
CHAR_BUDGET`, and the output is capped by `COMPARE_MAX_OUTPUT_TOKENS`.
Per-page pricing would reward pathological cases (dropping two 500-page
PDFs against each other) and penalize the common case (a 5-page
contract vs. its revision).

### `ai_outputs` meta shape

The route writes this JSON to `meta` on the `ai_outputs` row:

```json
{
  "originalSha256": "…",
  "originalName": "Contract v1.pdf",
  "originalPageCount": 12,
  "originalChars": 34891,
  "revisedSha256": "…",
  "revisedName": "Contract v2.pdf",
  "revisedPageCount": 13,
  "revisedChars": 36104,
  "providerId": "anthropic",
  "model": "claude-3-5-sonnet-latest",
  "tokensIn": 18320,
  "tokensOut": 2174,
  "wasTruncated": false,
  "ocrCandidatePagesOriginal": [],
  "ocrCandidatePagesRevised": [],
  "creditCost": 15
}
```

The `originalChars` / `revisedChars` fields are the **post-truncation**
counts — the number of characters the model actually saw per side.

### Route — POST /api/ai/compare

Status codes are deliberately parallel to `/api/ai/summarize` and
`/api/ai/translate`:

| Status | Meaning | Credit effect |
| --- | --- | --- |
| 200 | Diff + saved | Debited |
| 207 | Diff generated, save failed | Debited (no refund — user paid for real output; inline markdown included in body) |
| 400 | Malformed multipart / missing pdfA or pdfB / pdf-extract failed | No debit (or refund on extract failure) |
| 401 | Anonymous | No debit |
| 402 | Insufficient credits | No debit |
| 409 | Duplicate `idempotencyKey` | Treated as already-processed |
| 413 | Either side > 25 MB (`which: "pdfA"` or `"pdfB"` in body) | No debit |
| 422 | Extracted text too short on one or both sides (`which: "both" \| "pdfA" \| "pdfB"`) | Refunded |
| 502 | Provider threw | Refunded |
| 503 | No provider configured | Refunded |

**Refund granularity on bilateral failure.** If either extraction
fails, the full 15 credits are refunded — not 7.5 each. The spend is
atomic; the refund is atomic. Per-side partial refunds are a footgun
(what if A parses and B is password-protected?).

### Known gaps / deferred to 5.3+

- **OCR for scanned-side inputs** — if either side is image-only, the
  route 422s with `which: "pdfA" | "pdfB" | "both"`. The
  `ocrCandidatePages*` arrays are stored in meta for forward-compat
  but unused in the render. Vision OCR will unlock comparing a scanned
  original to a text-based revision.
- **Chunking a long-pair diff** — today, pairs past the combined-char
  budget are truncated and flagged. Real chunking requires
  cross-document alignment; deferred until we see real diffs exceeding
  the budget.
- **Replay-on-duplicate idempotency** — a duplicate
  `idempotencyKey` returns 409. Replaying the cached comparison lands
  with the summarize/translate replay work.
- **Side-by-side rendered view** — the preview page renders the
  model's markdown as a single narrative. A true side-by-side
  inline-diff UI lives downstream of a structured-output flip (JSON
  per-change with stable IDs) which we'd only take when we have a
  compelling UX reason.

---

## Phase 5.4 — OCR

Phase 5.4 ships Vision OCR: turning scanned / image-only PDFs into
structured markdown that the summarize, translate, and compare tools
can then chain off of. This is the fourth artifact-producing AI op and
the first one priced **per page** rather than flat per document.

### Module additions

- `lib/ai/ocr.ts` — the helper. `ocrPdf({ pdfBytes, pageCount,
  filename, preferredProvider? })` → `{ markdown, providerId, model,
  usage, processedPageCount, wasTruncated }`. Splits the PDF page-by-
  page with `pdf-lib`, sends each page through `provider.chat()` as a
  `DocumentBlock`, and stitches the results with `## Page N` headers.
  Throws `NoOcrProviderConfiguredError` when no provider with
  `pdfInput: true` is wired (route maps to 503).
- `app/api/ai/ocr/route.ts` — the endpoint. `multipart/form-data` with
  `pdf` + optional `idempotencyKey`. Peeks the page count with pdf-lib
  *before* calling `spendCredits` so we never debit for a predictably-
  oversized file.
- `components/tools/OcrPdfTool.tsx` — the client runner. Single
  dropzone, client-side page-count peek via pdf-lib (same library the
  free tools already use — zero extra bytes), CTA label renders the
  exact credit cost ("OCR 12 pages — 24 credits"), result card with
  Copy / Download(.md) / View actions.
- `lib/pricing.ts` — `AI_OPERATION_COSTS.ocr = 2` (per page, not per
  doc). The `AIOperationId` union already included `"ocr"` from
  Phase 5.1.
- `lib/ai/credits.ts` — `SpendCreditsInput` / `RefundCreditsInput` gain
  an optional `multiplier?: number` (defaults to 1). OCR passes
  `multiplier: pageCount` so the cost is `unitCost × pageCount` and the
  ledger records it as one row, not N.
- `lib/ai/types.ts` — adds a multimodal `ContentBlock` union
  (`TextBlock | ImageBlock | DocumentBlock`). `ChatMessage.content` is
  now `string | ContentBlock[]`. The flat-cost callers still pass
  strings and are unchanged.
- `lib/ai/adapters/anthropic.ts` — translates `DocumentBlock` to
  Anthropic's native `{ type: "document", source: { type: "base64",
  media_type: "application/pdf", data } }` content block. Advertises
  `capabilities.pdfInput: true`.
- `lib/ai/adapters/openai.ts` — rejects `DocumentBlock` with
  `UnsupportedCapabilityError("openai", "pdfInput")`. Keeps
  `capabilities.pdfInput: false`. OpenAI Chat Completions doesn't
  accept raw PDFs as message parts today (the Files API would be a
  separate code path we haven't wired).
- `app/app/files/[id]/preview/page.tsx` — `AiOutputMeta` extended with
  `processedPageCount`; the subheader now reads `"first N
  transcribed · clipped at 50 pages"` when `kind === "ocr"` and
  `wasTruncated`.
- `app/tool/[id]/page.tsx` — `ai-ocr` added to `LIVE_TOOL_IDS` and the
  `ToolRunner` switch dispatches to `<OcrPdfTool />`.
- `app/app/files/page.tsx` — `ai-ocr` already in
  `AI_PREVIEWABLE_TOOL_IDS`, so the eye icon links straight to the
  preview page.

### Why Vision OCR, not local rasterization

The original plan was to rasterize each page locally with pdfjs-dist
and send PNG image blocks. That path needs a Node canvas binary
(`@napi-rs/canvas`, `canvas`, `sharp` + pdfjs-dist/legacy, etc.), all
of which pull 15–25 MB of native deps that conflict with the
**Hostinger zero-native-dep deploy target** committed to in Phase 3.

Anthropic's API accepts base64 PDFs as a first-class `document`
content block and runs vision on them internally. By passing the PDF
through as-is we get equivalent OCR quality without a canvas binary
in the build tree. The `DocumentBlock` shape is also provider-portable
— when we eventually wire OpenAI's Files-API path, the helper signature
doesn't change.

### Per-page pricing with a single ledger row

`AI_OPERATION_COSTS.ocr = 2` is the **per-page** cost. The route
passes `multiplier: pageCount` to `spendCredits`, which multiplies
`unitCost × multiplier` and debits in one row:

```
ai_ocr · -24 credits · idempotency_key=ai:ocr:<uuid> · note="OCR \"Scan.pdf\" (12 pages)"
```

Not 12 rows of -2 credits each. The refund path uses the same
multiplier for an exact reversal. If the provider errors after page 7
of 12, we still refund the full 24 — the partial output isn't
persisted (same all-or-nothing policy as compare's bilateral failure).

Flat-cost operations (`chat_turn`, `summarize`, `translate`,
`compare`) continue to omit the `multiplier` field and get
`multiplier = 1` historical behavior.

### Page-count peek before the spend

The route uses `pdf-lib`'s `PDFDocument.load(bytes).getPageCount()`
(cheap — only parses the page tree) **before** calling `spendCredits`.
Why:

1. `spendCredits` needs the cost up front; the cost needs the page
   count.
2. Rejecting a 120-page PDF at 422 **before** a spend keeps the ledger
   clean — no `-240 credits / +240 refund` pair for a file the user
   could predictably tell was too large from the client-side count.
3. We don't run the full `extractPdfText` pass (as summarize/translate
   do) because the PDF is scanned — pdfjs would return nothing useful.

### The 50-page cap

`MAX_OCR_PAGES = 50` in `lib/ai/ocr.ts` (and mirrored as
`CLIENT_MAX_OCR_PAGES = 50` in the client tool). Rationale:

- A single model call can't fit 50+ pages of transcription inside the
  per-request output-token cap even at 1500 tokens/page.
- One page per call keeps each network round-trip short and the user
  sees steady progress even though we don't stream per-page yet.
- 50 pages × 2 credits = 100-credit cap on the worst-case spend, which
  is a reasonable blast radius for a single click.

PDFs over 50 pages: server returns 422 `too_many_pages` with a "use
Split first" hint; client catches the same case *before* POSTing via
the page-count peek and shows an inline link to `/tool/split`. The
server also transcribes the first 50 pages when called directly with
a larger PDF (e.g. via a future API surface) and sets
`wasTruncated: true` — never fails the whole run for an API caller
who opted in.

### `ai_outputs` meta shape

```json
{
  "sourceSha256": "…",
  "sourceName": "Scanned Invoice.pdf",
  "sourcePageCount": 12,
  "processedPageCount": 12,
  "providerId": "anthropic",
  "model": "claude-3-5-sonnet-latest",
  "tokensIn": 18432,
  "tokensOut": 5120,
  "wasTruncated": false,
  "creditCost": 24
}
```

When `sourcePageCount > 50`, `processedPageCount` is `50` and
`wasTruncated` is `true`; the preview header renders `"first 50
transcribed · clipped at 50 pages"`.

### Route — POST /api/ai/ocr

Status codes:

| Status | Meaning | Credit effect |
| --- | --- | --- |
| 200 | OCR + saved | Debited `2 × pageCount` |
| 207 | OCR generated, save failed | Debited (no refund — real output; inline markdown included in body) |
| 400 | Malformed multipart / `pdf` missing / pdf-lib parse failed | No debit |
| 401 | Anonymous | No debit |
| 402 | Insufficient credits | No debit |
| 409 | Duplicate `idempotencyKey` | Treated as already-processed |
| 413 | PDF > 25 MB | No debit |
| 422 `too_many_pages` | pageCount > 50 | No debit (rejected before spend) |
| 502 | Provider threw mid-run | Refunded (full multiplier) |
| 503 | No provider with `pdfInput` capability configured | Refunded |

The 25 MB cap mirrors summarize / translate / compare — 25 MB is
enough headroom for 50 pages of 300-DPI scans; anything bigger is
almost always a mis-upload.

### Known gaps / deferred

- **Per-page streaming** — today the 50-page UI shows a "Transcribing…"
  spinner for the whole run. Streaming page-by-page progress is a real
  improvement for long scans; deferred because it requires an SSE
  path on the route + client.
- **OpenAI parity via Files API** — `openai.ts` rejects
  `DocumentBlock`. Wiring OpenAI's Files API would let the registry
  round-robin OCR across providers instead of Anthropic-only, at the
  cost of a second upload code path.
- **Confidence scoring** — per-page confidence would let the UI flag
  "this page is noisy". Anthropic's API doesn't expose token-level
  logprobs on vision, so this is a model-side gap, not a plumbing gap.
- **Chain-triggered OCR in summarize / translate** — today, summarize
  and translate still 422 on scanned input with a "try OCR" message.
  Auto-running OCR then piping the result back through is a nice UX
  win but we want users to see the per-page credit cost first.

---

## Phase 5.5 — Replay-on-dup key (idempotent re-run)

Before 5.5 each artifact-producing AI route treated a repeat submission
under the same `idempotencyKey` as a hard failure: the spend layer's
unique index kicked back `{ ok: false, reason: "duplicate" }` and the
route returned **409 `duplicate_submission`** with copy that pointed the
user at `/app/files`. Good for safety (we never double-charged) but bad
for UX — if the network dropped after the server committed but before
the client heard back, the client's automatic retry got a useless 409
instead of the result it had already paid for.

Phase 5.5 turns that 409 into a **200 replay** for all four routes
(summarize / translate / compare / OCR), matching the pattern chat has
had since Phase 5. The contract: if this exact `(userId, idempotencyKey)`
pair already produced a successful `ai_outputs` row, return the stored
markdown verbatim with `creditCost: 0` and `replay: true`. No new
provider call, no new debit, no new DB write.

### Schema change

```ts
// db/schema/app.ts — aiOutputs table
idempotencyKey: varchar("idempotency_key", { length: 128 }),
// + uniqueIndex("ai_outputs_idempotency_idx") on the column
```

Nullable + unique: MySQL treats NULLs as distinct under a unique index,
so existing rows (pre-5.5) keep their NULL keys without conflict, and
new writes get enforced uniqueness on non-NULL values. Inline migration
snippet lives in the JSDoc above the table definition; `drizzle-kit push`
applies it at deploy time.

### Shared helper — `lib/ai/idempotency.ts`

```ts
export async function findAiOutputByIdempotencyKey(params: {
  userId: string;
  idempotencyKey: string;
}): Promise<StoredAiOutput | null>
```

One unique-index lookup joined to `files.user_id`. The join isn't
strictly necessary for lookup (the idempotency key is globally unique
in practice) but it is our **cross-tenant security boundary**: idempotency
keys are client-generated UUIDs, and while a cryptographic collision is
fictional, a malicious client could still probe. Filtering by user id
means a guess can only ever replay the guesser's own rows.

`isDuplicateKeyError(err)` is also exported — checks `ER_DUP_ENTRY` /
errno 1062 — for routes that want to defensively catch the race where
two concurrent retries both miss the pre-spend lookup and race the
unique-index insert. In practice the spendCredits ledger dedupes this
race at the spend step, so the ai_outputs insert almost never sees a
dup-key error; callers rely on spendCredits + the outer 207 fallback.

### Route contract — identical across all four

```text
auth → parse multipart → compute sha256 → findAiOutputByIdempotencyKey
  ↳ hit:  200 { ...replayed fields, creditCost: 0, replay: true }
  ↳ miss: continue → extract/peek → spendCredits → provider → persist
```

The replay block sits **before** anything expensive:
- Summarize / translate / compare — before `extractPdfText`.
- OCR — before the pdf-lib `getPageCount()` peek (the peek only exists
  to compute the per-page spend multiplier; wasted work on a cache hit).

Each route reads its op-specific meta fields out of `ai_outputs.meta`
and reconstructs the same JSON shape a fresh-compute success would
return. Key fields per op:

| Op        | Replayed meta fields                                                 |
| --------- | -------------------------------------------------------------------- |
| summarize | `providerId`, `model`, `wasTruncated`, `pageCount`, `ocrCandidate…` |
| translate | `providerId`, `model`, `targetLang`, `targetLangLabel`, `wasChunked`, `chunkCount` |
| compare   | `providerId`, `model`, `originalName/Page/Chars`, `revisedName/Page/Chars` |
| ocr       | `providerId`, `model`, `sourcePageCount`, `processedPageCount`, `wasTruncated` |

`originalCreditCost` is also surfaced in the replay response, read out
of the stored `meta.creditCost`. The UI can use it to disclose "already
processed (0 extra credits, original cost was N)".

### 409 now means "half-committed"

With the replay path in place, a 409 from spendCredits only happens when:

> the ledger already has a debit row for this key, but `ai_outputs` does
> NOT have a corresponding row.

That's the half-committed state — a previous attempt spent credits but
died before the transaction finished. The 409 copy now reads:

> **"A previous attempt under this key did not complete. Retry with a
> new submission."**

The client must generate a fresh `idempotencyKey` and resubmit. The old
key's ledger row stays (accurate — we DID debit for an attempt that
failed to persist), and the user's refund policy is the same all-or-
nothing rule the routes already apply on provider failure.

### Cross-user key collision — known minor gap

Idempotency keys are globally scoped in the ledger (not per-user). A
UUID collision between two different users (cryptographically near-
impossible) would cause user B to see the 409 "retry with new
submission" copy rather than a replay. **Not a leak** — the replay
helper's user-id join prevents B from seeing A's artifact. Just
slightly misleading copy in a scenario that effectively never happens.
Acceptable.

### Client side — no changes

All four client tool components (`SummarizePdfTool`, `TranslatePdfTool`,
`ComparePdfTool`, `OcrPdfTool`) already generate a fresh UUID per
submit via `crypto.randomUUID()` and send it as an `idempotencyKey`
form field. A user-initiated click produces a new key; any retry inside
the same submit handler (fetch auto-retry, React Strict Mode double-
invoke) reuses the key captured in the closure. That's exactly the
behavior replay-on-dup rewards.

---

## Smoke-test checklist

After touching anything in this layer, run:

```bash
npm run typecheck
```

Then in the browser, signed in with at least one provider configured:

1. `/app/chat` — create a new session; the row appears at top of list.
2. Open it; send a message; verify the assistant response streams token
   by token with a visible `▍` cursor.
3. Hit the refresh button mid-stream; the partial assistant row should
   be replayed as-is from the DB, not re-billed.
4. Send a second message with a PDF attached; verify the model's reply
   references the PDF content.
5. Rename the session via the row's ✎ button.
6. Archive the session; it moves to the `?archived=1` view.
7. Unarchive it; it comes back.
8. Delete it; both the row and its messages are gone.
9. `/app/files` → click the chat icon next to any PDF → lands on a new
   chat session titled "Chat: <filename>".
10. Unplug the provider (remove `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`
    from `.env.local`, restart) → sending a message returns 503 and
    does NOT debit credits.

Phase 5.1 — Summarize:

11. `/tool/ai-summarize` → drop a text-based PDF → pick each depth
    (TL;DR / Standard / Detailed) in separate runs → each returns a
    rendered markdown summary in the result card. Copy / Download
    buttons work; Download lands with a `.md` extension. Credit balance
    decreases by 3 per run.
12. Click the View button on the result card → lands on
    `/app/files/<id>/preview` with the same markdown rendered.
13. `/app/files` shows the summary rows with the "ai-summarize" chip and
    an eye icon that links to the preview page.
14. Delete the summary file from `/app/files` → `ai_outputs` row is
    cascaded out (verify with `SELECT COUNT(*) FROM ai_outputs WHERE
    file_id = '<deleted-id>'` returns 0).
15. Drop a fully-image (scanned) PDF with no extractable text → 422 is
    surfaced as "couldn't find text — looks scanned"; credits are
    refunded (balance unchanged on the next page refresh).
16. Upload a PDF larger than 25MB → 413 message; credits not touched.
17. With zero credits on the account, try to summarize → 402 with
    "Not enough credits — this summary costs 3, you have 0"; no debit,
    no ai_outputs row.

Phase 5.2 — Translate:

18. `/tool/ai-translate` → drop a text-based PDF → pick **Spanish** →
    result card renders the translation as markdown. Copy / Download
    (.md) / View all work. Credit balance decreases by 5.
19. Same PDF, run again with **Japanese** (`ja`) → produces a different
    output file with Japanese text; the files list now shows two
    translation rows.
20. Flip the "Use a different language" toggle, type a rare valid code
    like `zh-Hant` or `sr-Latn` → accepted, translation runs. Then type
    `english` or `EN_us` → client-side validation blocks submit before
    any network call.
21. View any translation → `/app/files/<id>/preview` renders with the
    header line `· ${label} (${code})` and (if chunked) `· N chunks`.
    The eye icon on `/app/files` also links here.
22. Drop a long document (>60k chars of extractable text) → result page
    shows `wasChunked: true` / a chunk count > 1 in the preview header.
    Token usage in the provenance footer reflects the summed totals
    across chunks.
23. Drop a fully-image (scanned) PDF → 422 "couldn't find text — looks
    scanned"; credits are refunded.
24. With zero credits on the account, try to translate → 402 with
    "Not enough credits — this translation costs 5, you have 0"; no
    debit, no ai_outputs row.

Phase 5.3 — Compare:

25. `/tool/ai-compare` → observe two labeled slots (Original / Revised).
    The "Compare — 15 credits" button is disabled until BOTH slots hold
    a PDF. Drop into just one side → button stays disabled.
26. Drop a short text-based PDF as Original and a lightly-revised copy
    as Revised → run → result card renders the redline with the five
    H2 sections (`Summary`, `Breaking Changes`, `Material Changes`,
    `Minor Changes`, `Cosmetic Changes`). Copy / Download(.md) / View
    all work. Credit balance decreases by 15.
27. Click View on the result → `/app/files/<id>/preview` shows
    `"<A> vs <B> · M / N pages"` in the header and the saved markdown
    body. `/app/files` lists the row with the `ai-compare` chip and the
    eye icon.
28. Drop a large pair where combined extracted text exceeds
    `COMPARE_COMBINED_CHAR_BUDGET` (400k chars) → run → result card
    shows `"truncated (very long pair)"` and the preview header shows
    `"· truncated"`.
29. Drop a fully-image scanned PDF on the Original side + a text PDF
    on the Revised side → 422 with `which: "pdfA"`; copy reads "The
    original PDF looks scanned…"; credits are refunded. Swap sides and
    confirm the message switches to "The revised PDF looks scanned…"
    (`which: "pdfB"`). Drop a scan on both sides → "Neither PDF has
    extractable text…" (`which: "both"`).
30. With zero credits on the account, try to compare → 402 with "Not
    enough credits — this comparison costs 15, you have 0"; no debit,
    no `ai_outputs` row. Also verify a 25 MB+ file on either side
    returns 413 with the correct `which:` value and no credits are
    touched.

Phase 5.4 — OCR:

31. `/tool/ai-ocr` → drop a 3-page scanned PDF. The card under the
    dropzone renders `"Scan.pdf · 232 KB · 3 pages · 6 credits"` and
    the CTA label reads `"OCR 3 pages — 6 credits"`. Click it → result
    card shows 3 page sections (`## Page 1`, `## Page 2`, `## Page 3`)
    with transcribed markdown. Credit balance decreases by 6.
32. Click View on the result → `/app/files/<id>/preview` renders the
    same markdown. The subheader reads `"From Scan.pdf · 3 pages"`.
    `/app/files` lists the row with an `ai-ocr` tool chip and an eye
    icon.
33. Drop a 51-page PDF → the client-side peek catches it, the CTA
    switches to `"51 pages — over the 50 cap"`, an inline amber card
    explains the cap and links to `/tool/split`. The server path is
    also covered: hitting `/api/ai/ocr` directly with a 51-page PDF
    returns 422 `too_many_pages` and does not debit credits.
34. Unset `ANTHROPIC_API_KEY` (OpenAI-only deployment) → OCR returns
    503 ("No AI provider with PDF-vision support is configured…"); the
    client message suggests setting `ANTHROPIC_API_KEY`; credits are
    fully refunded.
35. Chainability: run OCR on a 5-page scan → open the resulting
    markdown file from `/app/files` → paste the markdown into a
    fresh PDF (or just confirm the markdown is usable) → the text is
    selectable, searchable, and round-trips through
    `/tool/ai-summarize` and `/tool/ai-translate` (via a text PDF
    built from the markdown) without 422. This is the whole point of
    Phase 5.4 — scans are no longer a dead end.

Phase 5.5 — Replay-on-dup:

36. Run a summarize through the UI on any PDF → succeeds, credits
    debited (say balance drops from 100 → 95). Note the `idempotencyKey`
    fired by DevTools Network. Replay that exact multipart request
    from the Network panel via "Copy as fetch" → the response is
    200 with `replay: true`, `creditCost: 0`, and the same `fileId` /
    `markdown` as the first run. Balance stays at 95, no new
    `ai_outputs` row appears in the DB.
37. Same drill on translate → replay with the same key returns the
    stored translation; credits unchanged; `meta.targetLang` /
    `meta.wasChunked` are reflected in the replay response.
38. Same drill on compare → replay with the same key returns the
    stored comparison; credits unchanged; both `original…` and
    `revised…` meta fields are surfaced in the replay response.
39. Same drill on OCR → replay with the same key returns the stored
    markdown; the pdf-lib peek is skipped (confirm via a log or
    timing — the replay is faster than a fresh run); credits
    unchanged; `pageCount` and `processedPageCount` match the
    original run.
40. Half-committed case: force a post-spend crash (temporarily `throw`
    inside the transaction in one of the routes) → submit → 500 / 502
    on client, ledger has a debit row, `ai_outputs` has nothing.
    Remove the injected throw → retry with the **same** idempotencyKey
    → 409 with the "A previous attempt under this key did not
    complete. Retry with a new submission." copy. Regenerate
    idempotencyKey client-side → retry → succeeds normally.
41. Cross-user isolation: user A runs a summarize (stores key `K`).
    User B somehow submits with key `K` (manually via curl) → B gets
    a miss from `findAiOutputByIdempotencyKey` (user-id filter) and
    goes through a fresh compute. A's artifact is never exposed to B.

## Phase 6.1 — Macros (saved parameter presets)

The AI tool pages settled into a predictable rhythm in Phase 5:
attach PDF → tweak params → hit Run → read markdown. The "tweak
params" step looks identical every time for a given user — a legal
team always wants `depth: detailed` on briefs, a localization team
always wants `targetLang: pt-BR`. Phase 6.1 lets users name those
param sets once and reapply them with a single click.

Scope decisions:

- **User-owned only.** No sharing, no org model, no admin overrides.
  A macro is a personal shortcut that travels with the user account.
  If two users on the same team want the same preset, they each save
  their own — a handful of keystrokes once, never again.
- **Summarize + Translate only.** Compare and OCR have no user-facing
  parameters (Compare takes two files; OCR's only option — page cap
  — is enforced by the server, not picked per-run). Macros on
  parameter-less tools would be chrome that never changes anything.
- **varchar tool-id, not enum.** `tool_id` is a `varchar(64)`, not a
  `mysqlEnum`, so adding a new AI tool in later phases doesn't force
  a schema migration. The tool registry (`lib/tools/registry.ts`) is
  the source of truth; `macro-actions.ts` validates each tool's
  params shape via `zod.discriminatedUnion("toolId", [...])`.

### Schema

One table, three indexes:

```sql
CREATE TABLE user_macros (
  id          VARCHAR(36)  NOT NULL,
  user_id     VARCHAR(255) NOT NULL,
  tool_id     VARCHAR(64)  NOT NULL,
  name        VARCHAR(80)  NOT NULL,
  params_json JSON         NOT NULL,
  created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                           ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX user_macros_user_tool_idx (user_id, tool_id),
  UNIQUE INDEX user_macros_user_tool_name_idx (user_id, tool_id, name)
);
```

- `(user_id, tool_id)` composite index serves the list-for-tool path
  (the common read); the unique `(user_id, tool_id, name)` index is
  the de-dup guard that lets us map MySQL `ER_DUP_ENTRY` /
  `errno 1062` back to a friendly `duplicate_name` error code.
- `params_json` is a JSON blob rather than typed columns because
  different tools carry different shapes (`{depth}` vs.
  `{targetLang}` vs. future `{foo, bar}`). Shape is enforced in the
  action layer, not the DB — MySQL JSON doesn't support check
  constraints in our target versions.
- `ON DELETE CASCADE` on the user FK keeps macro rows from outliving
  their owner.

### Server actions (`lib/macro-actions.ts`)

Four actions, all `"use server" + "server-only"`, following the
existing `lib/*-actions.ts` pattern. Each returns a
`MacroActionResult` discriminated by `ok`:

| Action | Success returns | Error codes |
| ------ | --------------- | ----------- |
| `createMacroAction({toolId, name, params})` | `{macro: MacroRow}` | `not_authenticated`, `invalid_macro`, `duplicate_name`, `db_error` |
| `renameMacroAction({id, name})` | `{macro: MacroRow}` | `not_authenticated`, `invalid_input`, `not_found`, `duplicate_name`, `db_error` |
| `deleteMacroAction({id})` | `{}` (silent on miss) | `not_authenticated`, `invalid_input`, `db_error` |
| `listMacrosForToolAction({toolId})` | `{macros: MacroRow[], canSave: boolean}` | `unsupported_tool` |

Validation uses a Zod discriminated union keyed on `toolId`:

```ts
z.discriminatedUnion("toolId", [
  z.object({
    toolId: z.literal("ai-summarize"),
    name: z.string().trim().min(1).max(80),
    params: z.object({ depth: z.enum(["tldr","standard","detailed"]) }),
  }),
  z.object({
    toolId: z.literal("ai-translate"),
    name: z.string().trim().min(1).max(80),
    params: z.object({ targetLang: z.enum(TARGET_LANG_CODES) }),
  }),
]);
```

This guarantees the stored blob is one of two known shapes — any
future corruption (schema drift, manual SQL, etc.) would be caught
when the client tries to apply the macro.

Ownership is enforced by composite `(id, userId)` filter on every
read/write, so even guessing another user's macro id won't let you
rename or delete theirs.

`listMacrosForToolAction` additionally returns a `canSave` boolean
(`true` iff the session resolves a user id). Client components use
this to hide the "Save current…" button for anonymous visitors
without plumbing `auth()` through every server page that renders a
tool.

`deleteMacroAction` is **silent on miss**: if the row doesn't exist
(already deleted, or wrong user), we still return `{ok: true}`. The
desired end state ("this id is not in my macros") already holds, so
the UI can optimistically remove the chip without waiting to verify.

### UI (`components/tools/MacroBar.tsx`)

`MacroBar` is a pure presentational chip row. The parent tool
component owns params shape, fetch, and callbacks; MacroBar only
renders.

Props:

```ts
{
  macros: MacroBarItem[];      // {id, name, params: Record<string, unknown>}
  canSave: boolean;            // false for anon users
  disabled?: boolean;          // true while the tool is running
  activeId?: string | null;    // macro whose params == current form state
  onApply: (m: MacroBarItem) => void;
  onSave: (name: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}
```

Behaviours worth noting:

- **Hidden when empty + anon.** If `macros.length === 0` and
  `canSave === false`, the component returns `null`. No ghost row on
  tool pages for signed-out visitors.
- **Active chip.** The chip with `id === activeId` swaps the star
  icon for a check and paints in accent colors. Parents compute
  `activeId` by matching the current form state against each macro's
  params — it collapses to `null` as soon as the user tweaks the
  form.
- **Inline name prompt.** Clicking "Save current…" reveals an input
  rather than opening a modal. Enter commits, Escape cancels. Errors
  from the parent's `onSave` are shown inline so the user can
  correct the name without retyping.
- **maxLength=80** mirrors the DB column, so the UI can't silently
  trip a server-side validation error.

### Per-tool wiring

Each tool component (`SummarizePdfTool`, `TranslatePdfTool`) owns
four hooks around MacroBar:

1. `useEffect` on mount → `listMacrosForToolAction({toolId})` →
   populate `macros` + `canSave`.
2. `activeMacroId` derived from current form state.
3. `applyMacro` sets the form state from `macro.params`. For
   translate, the language code is routed into either `langChoice`
   or `customLang` based on whether it's in the curated
   `COMMON_TARGET_LANGUAGES` list.
4. `saveMacro` calls `createMacroAction` with the currently-effective
   params; prepends the returned row to local state; throws on
   failure so MacroBar displays the error inline.
5. `deleteMacro` removes the chip optimistically and only restores on
   transport failure (action-reported `ok:false` is rare — it only
   fires on auth or DB errors).

Translate has one extra guardrail: the macro Zod validator only
accepts `COMMON_TARGET_LANGUAGES` codes, but the Translate UI allows
arbitrary BCP-47 codes via the "Other…" input. If the user is in
"Other…" mode with an uncommon code and tries to save, the action
returns `invalid_macro` and the MacroBar shows "Only common target
languages can be saved as presets." — a deliberate trade-off so
saved presets stay portable across future curated-list edits.

### Smoke steps

Phase 6.1 — Macros:

42. On `/tool/ai-summarize`, signed out → MacroBar renders nothing.
    No chips, no "Save current…" button, no ghost row.
43. Sign in (fresh account, no macros). MacroBar renders just the
    "Save current…" button. Pick `depth: detailed`, click "Save
    current…", type "Legal brief", hit Enter → chip appears with
    star + name; the chip is highlighted (check icon + accent)
    because current `depth` still matches.
44. Change depth to `tldr` → chip loses the active styling (back to
    star icon + neutral colors). Click the chip → `depth` flips to
    `detailed`; the chip lights up again.
45. Try to save a second macro with the same name → MacroBar shows
    "A macro with that name already exists." inline; the name input
    keeps its value so the user can edit it.
46. Click the X on the chip → it disappears instantly (optimistic).
    Reload the page → the chip is still gone (the DELETE persisted).
47. On `/tool/ai-translate`, sign in, pick Spanish (`es`), save as
    "Client docs" → chip appears, active. Switch to French (`fr`) →
    chip de-activates. Pick "Other…", type `pt-BR`, save as "BR
    localization" → new chip appears, active. Reload → both chips
    survive. Apply the `pt-BR` chip → dropdown flips to "Other…"
    and the input shows `pt-BR`.
48. On `/tool/ai-translate`, try to save while in "Other…" mode with
    an uncommon code like `sw` → MacroBar shows "Only common target
    languages can be saved as presets."; the dropdown and input stay
    as-is so the user can switch or continue translating.
49. Cross-tool isolation: macros saved under `ai-summarize` do not
    appear on `/tool/ai-translate` and vice versa. Macros saved by
    user A do not appear when user B signs in.
50. Delete the user account → `ON DELETE CASCADE` removes all their
    `user_macros` rows. No orphaned presets.

## Phase 6.2 — Studio (batch runner) — REMOVED 2026-04-20

> **STATUS: REMOVED.** `/app/studio` was deleted on 2026-04-20 when the
> public `/studio` (workflow canvas) + per-tool pages fully replaced it.
> `components/studio/StudioRunner.tsx` and `app/app/studio/page.tsx` are
> gone. Section kept for historical context. See `docs/STATUS.md` for
> the decision record.

Studio is a single authenticated page (`/app/studio`) that runs an AI
tool across up to 25 PDFs at a time. The architecture is deliberately
thin: no new tables, no new routes, no background workers — the client
owns the queue in component state and fires one ordinary POST per file
to the existing `/api/ai/<tool>` endpoint, serially.

### Scope decisions

- **Three tools** — Summarize, Translate, OCR. Compare is excluded
  because it's pair-based (two inputs per run); a future phase can
  add it with a dual-dropzone UI.
- **Serial execution, 1 file at a time.** Fan-out concurrency is a
  one-line change (`RUN_CONCURRENCY` in `StudioRunner.tsx`) but the
  MVP ships serial so we don't stack spikes on the AI provider rate
  limits. Users seeing the queue fly by one at a time is also a
  clearer mental model of "what am I paying for right now".
- **25 files per run.** A hard cap on intake + on Add-more. Covers
  the long tail of expected batch sizes (most users run 3-8 files at
  a time) and keeps a runaway loop bounded. The cap lives in
  `MAX_FILES_PER_RUN` — grep-find and bump if product asks for more.

### Why no batch_runs table

The obvious alternative is a `batch_runs` / `batch_run_items` pair
with a background worker that the UI polls. That architecture was
rejected for Phase 6.2 because:

- It's weeks of new surface area (worker, polling endpoint, state
  machine) for a feature whose 80% case is "run the same tool on a
  small pile of files".
- Every error path is already implemented in each tool's route
  handler (401/402/409/413/422/502/207). Studio surfaces those
  responses verbatim as row status; a server-side orchestrator would
  duplicate the mapping in a second place.
- Phase 5.5's replay-on-dup is inherited for free: each file in the
  queue carries its own `idempotencyKey`, so retrying a failed item
  hits the output cache instead of double-charging.

Trade-off: **if the tab closes mid-run, pending items are lost**.
Completed items are already in `/app/files` so nothing already-paid-for
is wasted; only the "please process these 12 other PDFs" intent is
gone. A future Phase 6.3 could add a `batch_runs` row keyed off the
run's UUID so a refresh re-hydrates the queue.

### Cost estimator

`lib/studio/costs.ts` exposes two helpers:

- `estimateCost(toolId, pageCount?)` — per-file cost. Summarize and
  Translate return the flat `AI_OPERATION_COSTS[op]`; OCR returns
  `unit × pageCount`, falling back to `STUDIO_OCR_PAGE_CAP` (50) when
  the count isn't known client-side yet. The fallback is intentionally
  pessimistic so the pre-flight warning never under-estimates spend
  ("≤ 100 credits" is ok; "needs 24" when it actually needs 100 is
  not).
- `sumEstimatedBatchCost(toolId, items)` — sums across all `pending`
  and `running` items. Succeeded / failed / cancelled items drop out
  so the estimate is always "what you'll spend to finish the rest".

The UI displays the estimate with a `≤ ` prefix for OCR (reflects the
page-count fallback) and without for Summarize / Translate (the
number is exact).

### Runner loop

`StudioRunner.tsx` holds the queue as `BatchItem[]` and a `cancelRef`
for the cancel flag. The serial loop iterates a snapshot of targeted
ids — new files added mid-run are enqueued as `pending` but won't be
picked up until the user clicks Run again:

```ts
for (const item of queue) {
  if (cancelRef.current) { /* mark remaining cancelled, break */ }
  flip row to "running"
  try { const body = await postSingle(toolId, item, params); flip to "succeeded" }
  catch (err) { flip to "failed" with err.message }
}
```

`postSingle` builds a FormData with `pdf`, `idempotencyKey`, and any
per-tool param (`depth` or `targetLang`) and POSTs to
`routeForTool(toolId)`. 2xx (including 207) is treated as success —
207 means compute succeeded but `/app/files` persist failed, which the
user can't act on from Studio's row view.

**Retry-failed** resets every `failed` row back to `pending` while
keeping the same `idempotencyKey`. The second POST either replays from
Phase 5.5's cache (no re-charge) or retries cleanly if the first
request never reached the provider.

### Macro reuse

Studio reuses the MacroBar primitive from Phase 6.1 as-is — when the
tool picker flips to Summarize or Translate, `listMacrosForToolAction`
reloads presets for that tool. OCR has no user-facing params, so the
MacroBar is hidden for that tool. Saving a macro in Studio writes the
same row that would be created from `/tool/ai-summarize` so presets
round-trip across both surfaces.

### Files touched

- `lib/studio/types.ts` — `StudioToolId`, `BatchItemStatus`,
  `BatchItem`, `StudioToolParams`.
- `lib/studio/costs.ts` — `estimateCost`, `sumEstimatedBatchCost`.
- `components/studio/StudioRunner.tsx` — client component with tool
  picker, params, MacroBar, dropzone, queue table, runner loop,
  cancel, retry.
- `app/app/studio/page.tsx` — authed server shell.
- `components/app/AppShell.tsx` — new Studio nav item (Sparkle icon).

### Smoke steps

Phase 6.2 — Studio:

51. Signed out → visiting `/app/studio` redirects to `/login` (AppShell
    auth guard; the page also double-checks `auth()`).
52. Signed in, pick Summarize, drop 3 PDFs → queue shows 3 pending
    rows with est. 9 credits. Click Run → rows flip running → done
    one by one; CTA label updates from "Run 3 files — 9 credits" to
    "Nothing pending".
53. Pick Translate, choose Spanish, drop 2 PDFs → est. 10 credits.
    Save current as "Spanish batch" → chip appears active. Switch to
    French → chip de-activates. Click the chip → dropdown returns to
    `es`, chip active.
54. Pick OCR, drop a 12-page PDF + a 30-page PDF. Status line shows
    "est. ≤ 84 credits" (50 × 2 fallback while peeking); after peek
    completes, estimate tightens to exactly 84 (12×2 + 30×2). Drop a
    55-page PDF → the peek flags it over-cap server-side on the first
    Run (422), row shows "Over the 50-page cap — split it first."
55. Serial execution: pause at the second running row, verify the
    third is still `pending` (no parallel fan-out). Click Cancel →
    in-flight row finishes, remaining rows flip to `cancelled`.
56. Retry-failed: cause two rows to fail (e.g. 402 on an account with
    low balance + top up after). Click "Retry N failed" → those two
    rows re-run; succeeded rows are untouched. The retried rows
    replay against Phase 5.5's idempotency cache if the original
    charge went through, so no double-spend even if the original
    failure was a post-provider timeout.
57. Cap enforcement: drop 20 files, then try to drop 8 more →
    dropzone shows "Batch cap is 25 files per run (you have 20, this
    drop adds 8). Add up to 5 more." No files are added.
58. Tab close mid-run: start a 5-file batch, close after 2 finish →
    succeeded rows remain in `/app/files`; pending 3 are lost (no
    state server-side). Re-visiting `/app/studio` loads an empty
    queue.
59. Cross-tool macros: a macro saved on `/tool/ai-summarize` appears
    in Studio's MacroBar when Summarize is selected; picking Translate
    hides it. Creating a macro in Studio persists to the same
    `user_macros` row that `/tool/ai-summarize` reads, so the chip
    appears in both places after reload.
60. "View" link on a succeeded row deep-links to
    `/app/files/[id]/preview` and renders the AI output exactly as
    the single-file tool would.

## Phase 6.3 — Smart mode (agent on /app/studio) — REMOVED 2026-04-20

> **STATUS: REMOVED.** The authenticated Smart-mode runner at
> `/app/studio` was retired on 2026-04-20. Its replacement is the public
> `/agent` plan-then-review demo (pure client-side, no DB). The
> `agent_runs` + `agent_run_steps` tables were dropped (see
> `db/migrations/0002_drop_agent_runs.sql`). `lib/agent/*`,
> `lib/agent-actions.ts`, and `components/studio/*` are gone. Section
> kept for historical context only.

Smart mode is the second surface on `/app/studio`, next to Batch. Where
Batch runs one tool across many files, Smart takes a plain-English
description of what the user wants to get done and plans a multi-step
run for them. The planner is an LLM (Anthropic by default, OpenAI as a
fallback); the user approves a quote before anything executes, and the
runner steps through the plan serially, one file at a time, one step at
a time, honoring per-step idempotency and a post-quote cost-cap guard.

### Why a separate surface

We considered folding the agent into `StudioRunner` and nudging users
with a "describe what you want" prompt when no tool is picked. Rejected
because:

- The agent's UX is plan-then-confirm — a separate beat (review card,
  approve, then run). The batch runner has no such beat.
- The agent writes to different tables (`agent_runs` / `agent_run_steps`
  vs. `ai_outputs`) and has its own error taxonomy. Fusing the two risks
  leaking agent-specific error codes into the Batch UI's 401/402/422
  handler.
- Keeping `StudioRunner` untouched preserves Phase 6.2's tested paths.
  The switcher (`StudioModeSwitcher`) mounts both components and hides
  the inactive one so toggling doesn't drop in-flight state on either
  side.

A future Phase could stitch the two back together (e.g. "plan this
batch" button on Batch), but only once the agent's error surface is
fully observable in production.

### Tools the planner can pick

Machine-readable catalog in `lib/agent/catalog.ts`. Nine tools total:
four AI (`ai-summarize`, `ai-translate`, `ai-compare`, `ai-ocr`), four
free (`merge`, `split`, `rotate`, `compress`), plus `chat` as a
zero-file escape hatch. Each row carries `side` (server|client),
`scope` (per-file|queue-level|sub-call), input/output kinds, a cost
shape, and a Zod-validated params hint. The planner embeds this
verbatim in its system prompt so the LLM can't invent tool IDs or
pass bogus params. The executor re-reads the same rows at dispatch
time to validate params and cost-cross-check the approved quote.

Cost shapes mirror `AI_OPERATION_COSTS` — summarize=3, translate=5,
compare=15, ocr=2/page (capped at 50 pages per file to keep quotes
bounded), chat=1, free tools=0.

### Plan shape + topology

A plan is `{ summary, fileCount, steps[] }` where each step has
`toolId`, `params`, `displayName`, `estimatedCostPerUnit`, and an
`inputRef` pointing at either the queue's original files or a prior
step's outputs. `scope` determines fan-out:

- `per-file` → one execution per input file (N rows in
  `agent_run_steps`, bucketed by `fileBucketIndex`).
- `queue-level` → one execution that consumes all files at once
  (merge, compare). `fileBucketIndex = 0`, must be `stepIndex = 0`.
- `sub-call` → one execution unrelated to the queue (chat). No files
  read.

Downstream steps are allowed as long as the chain makes sense:
`ai-ocr` → `ai-summarize` is valid (v2+; v1 planner emits linear
chains only), `split` → anything is rejected because split is
terminal (output kind `pdf-multi`).

### Execution flow

1. **Plan** — user types a prompt, clicks "Plan it" in
   `AgentSmartMode`. `createRunAction` server action validates the
   files (status, page count, encryption, per-run cap of 50),
   inserts an `agent_runs` row at status `planning`, then calls the
   planner. The planner posts to the configured AI provider with the
   catalog + prompt + file manifest, gets JSON back, validates it with
   Zod, and writes the plan to `plan_json`. Response returns
   `{ runId, plan }`.
2. **Review** — `AgentSmartMode` renders an approval card with the
   summary, numbered step list, scope labels (per file × N, or once),
   and the total quote in credits. User clicks Approve (→
   `approveRunAction`) or Discard (→ `cancelRunAction`).
3. **Run** — `approveRunAction` flips the run to `approved`, debits
   nothing up front (credits are charged per step during execution).
   The client then calls `runAgentPlan({runId, plan, ...})` which
   loops file-major: for each file bucket, walk the steps. Each step
   dispatches to `executeAgentStep` (client-side for free tools,
   server AI routes for AI tools) with a stable idempotency key of
   `agent:${runId}:${stepIndex}:${fileBucketIndex}`. Progress events
   (`step-start|step-succeeded|step-failed|step-skipped|run-paused|
   run-completed`) stream to `onProgress` so the grid updates live.
4. **Terminal** — one of: `succeeded` (all steps green), `failed`
   (any non-retryable error, or fatal step), `paused` (quote breach
   or insufficient-credits — v1 finalizes paused runs rather than
   offering resume), `cancelled` (user hit Cancel or tab close).

### Cost-cap guard

The planner quotes an upper bound at plan time. During execution, the
runner tracks `spentCredits` and compares against the approved quote
before each step. If a new step would push total spend past the quote
(e.g. the OCR page-count was under-estimated), the runner raises a
`quote_exceeded` pause, marks the run `paused`, and emits a terminal
banner with the original quote + actual spend + next-action link to
`/app/billing`. Users can't resume a paused run in v1; they start
fresh.

### Schema

Two tables (`agent_runs` + `agent_run_steps`), both MySQL with JSON
columns for plan payloads and structured output:

- `agent_runs` — id (uuid), user_id, status (`planning|approved|
  running|succeeded|failed|paused|cancelled`), prompt, plan_json,
  file_ids_json, quote_credits, spent_credits, error_code,
  error_message, created/updated timestamps.
- `agent_run_steps` — id (uuid), run_id (FK), step_index, file_bucket_index,
  tool_id, params_json, input_json, status, credits_spent,
  output_file_id nullable, error_code, error_message, timestamps. Row
  count per plan = `Σ(bucket count per step)`.

Idempotency key lives on `ai_outputs` (reused from Phase 5.5) so a
retried step replays the cached AI output instead of re-charging.

### Key files

- `lib/agent/types.ts` — `AgentToolId`, `AgentPlan`, `AgentPlanStep`,
  `AgentStepStatus`, `AgentRunStatus`, `AgentErrorCode`.
- `lib/agent/catalog.ts` — `AGENT_TOOL_CATALOG` + `computeStepUnitCost`.
- `lib/agent/planner.ts` — `server-only`; LLM → validated `AgentPlan`.
- `lib/agent/executor.ts` — `"use client"`; unified dispatch for each
  tool row (client-side pdf-lib for free tools, POST to `/api/ai/<tool>`
  for AI tools).
- `lib/agent/runner.ts` — `"use client"`; loop + cost-cap guard +
  progress-event stream.
- `lib/agent-actions.ts` — `"use server"`; `createRunAction`,
  `approveRunAction`, `cancelRunAction`.
- `components/studio/AgentSmartMode.tsx` — Smart mode client component
  (queue + prompt + approval card + live status grid + terminal
  banner).
- `components/studio/StudioModeSwitcher.tsx` — Batch ↔ Smart toggle;
  keeps both runners mounted, toggles visibility so switching never
  drops in-flight state.
- `app/app/studio/page.tsx` — authed server shell; now renders the
  switcher (was `StudioRunner` directly in Phase 6.2).

### Smoke steps

Phase 6.3 — Smart mode:

61. Signed out → `/app/studio` still redirects to `/login`. Signed in,
    default mode is Batch; click "Smart" in the segmented control →
    Batch surface hides, Smart surface shows with an empty queue +
    empty prompt. Switch back to Batch → the Batch queue (if any) is
    still there.
62. Smart mode, drop 3 PDFs → queue rows pill to `ready` after
    metadata peek. Drop an encrypted PDF → row pills to `failed` with
    "Password-protected PDFs aren't supported in Smart mode."
63. Type "summarize each of these in Spanish" + click Plan it →
    approval card shows two per-file steps (ai-summarize standard →
    ai-translate es), scope "per file × 3", total quote `(3+5) × 3
    = 24 credits`. Click Approve → status grid renders with 3 rows
    (filenames on the left, 2 step columns). Cells flip running → done
    one by one, file by file.
64. OCR page-cap: drop a 60-page scan + prompt "make this searchable".
    Planner refuses with "File exceeds the 50-page OCR cap. Split it
    first." No run is created.
65. Cost-cap breach: plan quotes 40 credits; during run, a step
    actually costs more than its per-unit estimate (simulate via
    fixture). Runner pauses at the breach, grid shows the remaining
    cells as `skipped`, terminal banner: "Run paused — quote
    exceeded" with actual spend + original quote + "Top up credits"
    link. Run row in DB is `paused`.
66. Cancel mid-run: approve a 4-file plan, hit Cancel after the 2nd
    file succeeds → in-flight step finishes, remaining cells flip to
    `skipped`, banner reads "Run cancelled" with spent credits. Row
    is `cancelled` in DB.
67. Replay: a step fails on a 402 mid-run, user tops up, starts a new
    Smart run with the same files + same prompt → the AI-tool steps
    that previously succeeded replay from the Phase 5.5 idempotency
    cache (same `agent:${runId}:${stepIndex}:${bucket}` pattern means
    a new run gets new keys, but the per-tool idempotency inside
    `/api/ai/*` still de-dupes if the request body hashes match). No
    double-charge.
68. Terminal file access: on a succeeded run, clicking "View" on a
    grid cell's output link opens `/app/files/[id]/preview` for that
    step's output — markdown for AI tools, PDF for free tools.
69. Tab close during planning: close the tab while the planner is
    still running → server keeps the row at `planning` (no orphan
    cleanup in v1); the user can create a fresh run, the stale row
    stays but never transitions. Acceptable for v1.
70. Switching modes mid-run: start a Smart run, flip to Batch while
    it's running → Smart status grid stays live under the hidden
    panel (component stays mounted), progress events still arrive;
    flipping back to Smart shows the grid in whatever state it
    reached. No lost events.
