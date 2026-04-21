# pdfcraft ai — Next.js site

Production site for **pdfcraftai.com**. Ports the original React/JSX prototype
(Claude Design) to a real Next.js 14 + TypeScript + Tailwind app, running as a
Node.js application on Hostinger Business hosting.

---

## Status

**Phase 0 — Foundation — DONE.**
**Phase 1 — Marketing pages — DONE.**
**Phase 2 — Auth + DB + dashboard shell — DONE.**
**Phase 3 — Core free PDF tools — DONE.**
**Phase 4 — Credit packs + payments (Razorpay + Paddle) — DONE.**
*Note: Phase 4 originally shipped with PayPal on the international rail; PayPal was retired 2026-04-21 (D4 cleanup) in favor of Paddle's MoR model, which bakes VAT/GST/sales-tax collection and remittance into the payout. See `docs/MASTER_PLAN.md` §D4 and `docs/STATUS.md` paper trail.*
**Phase 5 — Chat with PDF (Anthropic + OpenAI) — DONE.**
**Phase 5.1 — Summarize PDF (first artifact-producing AI op) — DONE.**
**Phase 5.2 — Translate PDF (map-reduce chunked) — DONE.**
**Phase 5.3 — Compare PDFs (AI redline + severity) — DONE.**
**Phase 5.4 — Vision OCR (scanned-PDF unlock) — DONE.**
**Phase 5.5 — Replay-on-dup key (idempotent re-run) — DONE.**
**Phase 6.1 — Macros (saved param presets per tool) — DONE.**
**Phase 6.2 — Studio (batch runner) — REMOVED 2026-04-20** (replaced by public `/studio` canvas + per-tool pages; see `docs/STATUS.md`).
**Phase 6.3 — Smart mode (agent on /app/studio) — REMOVED 2026-04-20** (replaced by public `/agent` plan-then-review demo; see `docs/STATUS.md`).
**Phase 6.4 — Public Agent / Macros / Studio (Claude Design parity) — DONE 2026-04-20.**

What's new in Phase 6.3:

- **New "Smart" mode on `/app/studio`, next to Batch.** A segmented control at the top of the page toggles between the existing Batch runner (one tool × many files) and the new Smart runner, which takes a plain-English description of what the user wants and plans a multi-step run for them. Both components stay mounted so flipping modes mid-work never drops an in-flight queue.
- **Plan-then-confirm UX.** User types a prompt + drops up to 25 PDFs → clicks "Plan it" → an LLM planner (Anthropic by default, OpenAI fallback) returns a validated `AgentPlan` with a numbered step list and a total credit quote. An approval card renders the plan (summary, per-step scope labels, params, total quote). Only after Approve does the runner start; Discard nukes the plan without touching credits.
- **Nine-tool catalog, machine-readable.** `lib/agent/catalog.ts` lists every tool the planner may pick: four AI (summarize / translate / compare / OCR), four free client-side (merge / split / rotate / compress), plus `chat` as a zero-file escape hatch. Each row carries side (server|client), scope (per-file|queue-level|sub-call), input/output kinds, cost shape, and a Zod-validated params hint. The planner embeds the catalog verbatim in its system prompt so it can't invent tool IDs or pass bogus params.
- **Two new MySQL tables: `agent_runs` + `agent_run_steps`.** Runs carry status (`planning|approved|running|succeeded|failed|paused|cancelled`), the original prompt, the `plan_json`, the file_ids, quote_credits, spent_credits, and an error code/message pair. Steps are bucketed by `fileBucketIndex` (matching the scope fan-out: per-file = N rows, queue-level = 1 row at bucket 0, sub-call = 1 row). Inline migration in the Drizzle JSDoc; `drizzle-kit push` applies at deploy.
- **Serial execution with cost-cap guard.** `runAgentPlan` loops file-major: for each file bucket, walk the steps. Each step dispatches to `executeAgentStep` (client-side for free tools, POST to `/api/ai/<tool>` for AI tools) with a stable idempotency key of `agent:${runId}:${stepIndex}:${fileBucketIndex}`. Before each step, `spentCredits + stepCost` is compared against the approved quote — breach raises `quote_exceeded`, marks the run `paused`, and surfaces a terminal banner with "Top up credits" link. V1 finalizes paused runs (no resume) — users can start fresh.
- **Reuses Phase 5.5 replay-on-dup for AI steps.** The per-step idempotency key means a retried run inside the same `runId` replays a succeeded step's cached output instead of re-charging. Cross-run retries get fresh keys but still benefit from the per-tool body-hash de-dupe inside `/api/ai/*`.
- **Live status grid during run.** While a run executes, the Smart panel renders a bucket × step table with sticky filename column and one column per plan step. Cells flip `queued → running → succeeded|failed|skipped` via a `RunnerProgressEvent` stream; each cell shows credits spent, an optional error message, and a "View output" link for succeeded AI/split/merge steps.
- **Terminal banners with tone-typed copy.** Succeeded (green), failed (red), paused — quote exceeded (amber, with "Top up credits"), cancelled (neutral). Each shows `Σ spentCredits` and a "Start new run" action that resets the state while keeping the file queue.
- **Clean partitioning between server and client.** `lib/agent/planner.ts` imports `server-only` (never leaks into the client bundle); `lib/agent-actions.ts` is `"use server"` for the create/approve/cancel flow; `lib/agent/executor.ts` and `lib/agent/runner.ts` are `"use client"` so the Smart component can import them directly. Typecheck passes clean.
- Full section in `docs/ai/architecture.md` (Phase 6.3) with the tool catalog, plan topology, cost-cap guard, schema, key files, and smoke-test steps 61-70.

What's new in Phase 6.2:

- **New `/app/studio` page + "Studio" nav item** (Sparkle icon, slotted between Chat and API Keys). Signed-in users can now run **Summarize / Translate / OCR across up to 25 PDFs in a single pass** without re-dropping files into each individual tool page. Anonymous visitors are redirected to `/login` by the existing `AppShell` guard.
- **Client-driven architecture — zero new server tables.** `StudioRunner` (`components/studio/StudioRunner.tsx`) holds the queue in React state and posts each file serially to the same `/api/ai/{summarize,translate,ocr}` routes the per-tool pages already use. Artifacts land in the existing `ai_outputs` rows, credits flow through the same `spendCredits` / `refundCredits` ledger. Trade-off: closing the tab loses *pending* items, but **completed** items are already persisted as real files + artifacts, and re-queuing a failed row reuses the same `idempotencyKey` so Phase 5.5 replays rather than re-bills.
- **Serial execution, 1-at-a-time (`RUN_CONCURRENCY = 1`).** Keeps spend deterministic for the user watching the queue, keeps provider concurrency predictable, and avoids needing a server-side scheduler. Cancel is a `useRef<boolean>` flag observed between iterations — no stale-closure races, in-flight file finishes naturally.
- **Pre-flight cost estimator in `lib/studio/costs.ts`.** `estimateCost(toolId, pageCount?)` returns a conservative upper bound; `sumEstimatedBatchCost(...)` totals pending + running rows. OCR uses the exact page count when available, falls back to the 50-page cap when the pdf-lib peek hasn't landed yet — so the Run CTA quotes `"Run 12 files — ≤ 600 credits"` (the `≤ ` prefix flips off the moment every OCR file has been peeked).
- **25-file batch cap (`MAX_FILES_PER_RUN = 25`).** Keeps the queue UI scannable on a laptop viewport, bounds worst-case spend at ~25 × the highest-cost tool, and matches what feels like a "batch" vs. a "job". Oversized drops get rejected client-side with a file-count error; the server-side tool routes remain unaware that Studio exists.
- **Per-file error handling is already built.** Each route already returns a discriminated union for 401 / 402 / 403 / 409 / 413 / 422 / 502 / 503 / 207 — `mapErrorBody(toolId, status, body)` in the runner converts those into inline row copy (`"Insufficient credits — balance 4, needed 24"`, `"PDF too large"`, `"Encrypted PDF"`, etc.). 402 responses ship `{ balance, required }` in the body, which is why Studio doesn't need a separate balance-GET endpoint.
- **MacroBar reuse for Summarize + Translate.** The Phase 6.1 chip row drops into Studio unchanged (same `createMacroAction` / `deleteMacroAction` / `listMacrosForToolAction` server actions, same active-chip highlighting, same inline "Save current…" prompt). OCR has no user-params so its MacroBar slot stays empty. Translate's "Other…" input still accepts arbitrary BCP-47 via the `/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/` regex; saveMacro still rejects non-common codes server-side so named presets stay portable.
- **OCR page-count peek runs in the background** after enqueue (`pdf-lib` `PDFDocument.load(bytes, { ignoreEncryption: true }).getPageCount()`), so the queue renders instantly and the cost estimate tightens as each row parses. Files over 50 pages are flagged immediately with a row-level error pointing at `/tool/split`.
- **Retry-failed resets failed rows to `pending` while preserving each row's `idempotencyKey`.** Anything that actually reached the provider hits Phase 5.5's replay path on retry (no second spend, no second ledger row, just the stored markdown). Anything that failed before the provider saw it runs fresh.
- Full section in `docs/ai/architecture.md` with the runner-loop pseudo-code, cost-estimator semantics, macro-reuse notes, and smoke-test steps 51-60.

What's new in Phase 6.1:

- **Named presets on `/tool/ai-summarize` and `/tool/ai-translate`.** A compact chip row above each tool's params lets signed-in users save the current `{depth}` or `{targetLang}` under a name, re-apply it with one click, and delete it when it's stale. Unsigned visitors see nothing — zero visual footprint until login.
- **New table `user_macros`** (id / user_id / tool_id / name / params_json / timestamps). Composite index on `(user_id, tool_id)` for the list read; unique index on `(user_id, tool_id, name)` gives us `duplicate_name` detection via MySQL ER_DUP_ENTRY. `ON DELETE CASCADE` on the user FK so presets don't outlive their owner. Inline migration snippet in the Drizzle JSDoc; `drizzle-kit push` applies at deploy.
- **`tool_id` stored as `varchar(64)` (not an enum)** so adding a new tool in later phases doesn't force a schema migration. The tool registry is the source of truth; `lib/macro-actions.ts` validates each tool's params shape via `zod.discriminatedUnion("toolId", [...])`.
- **Four server actions in `lib/macro-actions.ts`**: `create`, `rename`, `delete`, `listForTool`. All `"use server" + "server-only"`, all gated by `auth()`, all use a composite `(id, userId)` filter as the ownership guard. Errors returned as discriminated `{ok: false, error}` codes (`duplicate_name`, `invalid_macro`, `not_found`, `not_authenticated`, `db_error`); client maps them to inline copy.
- **`delete` is silent-on-miss** — if the row's already gone (or belongs to someone else), we still return `{ok: true}` because the desired end state already holds. The UI can remove the chip optimistically without a round-trip wait.
- **Scope: summarize + translate only.** Compare and OCR have no user-facing parameters, so macros on them would be chrome that never changes anything.
- **User-owned only.** No sharing, no org model, no admin overrides — a macro is a personal shortcut that travels with the user account. Simplest scope that solves the "I always pick the same options" pain point.
- **Translate restricts preset languages to the curated `COMMON_TARGET_LANGUAGES` list** (the same 20 in the dropdown), while the run-time form still accepts arbitrary BCP-47 codes via "Other…". Saved presets stay portable across future curated-list edits; one-off rare languages still work, just not as named shortcuts.
- **`MacroBar` is a pure presentational chip-row component** (`components/tools/MacroBar.tsx`). Parent tool components own params shape, fetch, and callbacks — MacroBar is reusable for any future tool with parameters. Inline "Save current…" prompt instead of a modal (Enter commits, Escape cancels), maxLength on the name input matches the DB column so the UI can't silently trip a server-side validation error.
- **Active-chip highlighting**: the chip whose stored params match the current form state gets a check icon + accent colors; it collapses back to a star as soon as the user tweaks the form. Makes "what did I apply?" legible at a glance.
- Full section in `docs/ai/architecture.md` with schema, server-action table, per-tool wiring notes, and smoke-test steps 42-50.

What's new in Phase 5.5:

- **Retries on the four artifact-producing AI routes (summarize / translate / compare / OCR) now replay, not 409**. Before 5.5, re-submitting with the same `idempotencyKey` bounced back with `duplicate_submission` and copy pointing at `/app/files`. That was correct (we never double-charged) but a terrible experience when a network blip caused a client auto-retry after the server had already committed.
- **New schema: `ai_outputs.idempotency_key VARCHAR(128) NULL` + `UNIQUE INDEX ai_outputs_idempotency_idx`**. Nullable unique so pre-5.5 rows keep their NULL keys (MySQL treats NULLs as distinct under a unique index). Inline migration snippet in the Drizzle JSDoc; `drizzle-kit push` applies it at deploy.
- **Shared helper `lib/ai/idempotency.ts`**: `findAiOutputByIdempotencyKey({ userId, idempotencyKey })` does one unique-index lookup joined to `files.user_id`. The join IS the cross-tenant security boundary — a malicious client guessing another user's key can only replay their own rows.
- **Replay contract — same shape across all four routes**: on hit, return **200** with the stored markdown, `creditCost: 0`, `replay: true`, and op-specific meta fields reconstructed from `ai_outputs.meta` (provider/model, page counts, target lang, compare's symmetric original/revised blob, OCR's processed vs. source counts, etc.). No new provider call, no new debit, no new DB write.
- **Replay block sits before the expensive work**: summarize / translate / compare skip `extractPdfText`; OCR skips the pdf-lib `getPageCount()` peek (the peek only exists to compute the per-page spend multiplier — wasted on a cache hit).
- **409 now means "half-committed"**: if the ledger has a debit under this key but `ai_outputs` does not, a previous attempt spent credits and died before persist. Copy updated to **"A previous attempt under this key did not complete. Retry with a new submission."** — client must regenerate the idempotencyKey.
- **No client changes needed**: all four tool components already generate a per-submit UUID via `crypto.randomUUID()` and send it as `idempotencyKey`. Fresh key per user click, stable within one submit handler (so fetch auto-retry / React Strict Mode double-invoke both hit replay).
- **Known minor gap — cross-user UUID collision**: idempotency keys are globally scoped in the ledger, so a (cryptographically fictional) collision between two users would show user B the 409 copy instead of a replay. Not a leak (user-id filter prevents cross-tenant read); just slightly misleading copy in a scenario that effectively never happens.
- Full section in `docs/ai/architecture.md` with the schema change, helper contract, per-route meta mapping, 409-semantics shift, and smoke-test steps 36-41.

What's new in Phase 5.4:

- **OCR tool live at `/tool/ai-ocr`**: drop a scanned PDF, get a rendered markdown transcription with preserved structure (headings, lists, tables as pipe-syntax, page-break markers) — **2 credits per page**, billed via a single ledger row with a `multiplier` field (not N separate spends).
- **Vision-based, not local rasterization**: pages ship to the provider as an Anthropic `DocumentBlock` (`{ type: "document", source: { type: "base64", media_type: "application/pdf", data } }`) — one page at a time, with the per-page markdown joined by `\n\n---\n\n`. This is the Hostinger-safe path: no `@napi-rs/canvas`, `sharp`, or `node-canvas` native binaries on the deploy target.
- **Anthropic-only today via provider capabilities**: the `AIProvider` interface grew a `capabilities.pdfInput` flag. Anthropic's adapter sets it `true`; OpenAI's throws `UnsupportedCapabilityError("openai", "pdfInput")` on any `DocumentBlock`. The registry picks the first pdf-capable provider; if none is configured the route returns 503 pointing at `ANTHROPIC_API_KEY`.
- **Page count before spend**: the route peeks page count with pdf-lib before calling `spendCredits`, so a 12-page OCR debits exactly 24 credits in one ledger row (`{ op: "ocr", unit: 2, multiplier: 12, total: 24 }`). Client-side peek via `PDFDocument.load(bytes, { ignoreEncryption: true }).getPageCount()` feeds the live CTA label (`"OCR 12 pages — 24 credits"`) so users see cost before submitting.
- **50-page cap enforced both sides** (`MAX_OCR_PAGES = 50`). Client rejects oversized uploads with a link to `/tool/split`; server returns 422 `too_many_pages` as a defense-in-depth check. Rationale: keeps per-call latency under a minute and makes the worst-case spend bounded (100 credits / ~$1 equivalent).
- **All-or-nothing refund on mid-run failures**: if page 37 of 40 fails mid-transcription, the entire 80-credit spend refunds. Same bilateral-failure model as compare — partial OCR output isn't useful enough to charge for.
- **New `ai_outputs.kind` enum value `"ocr"`**. Meta captures `sourcePageCount` (original) and `processedPageCount` (actually transcribed); these diverge only when `wasTruncated: true`. Preview page shows `"first 50 transcribed · clipped at 50 pages"` when the input was over cap.
- **Chain-unlock for 5.1 and 5.2**: because OCR output lands in the same `ai_outputs.content_md` column, users can re-upload an OCR'd scan and then summarize or translate it — scanned contracts, printed research papers, and phone-snapped receipts now flow through the rest of the AI suite.
- **Same credit + persistence pattern as 5.1/5.2/5.3**: spend up-front with `multiplier: pageCount`, `refundCredits` on any failure before the markdown is assembled, 207-with-inline-markdown on post-compute persistence failure (no refund — user paid for real output they can still copy).
- Full section in `docs/ai/architecture.md` with the ContentBlock discriminated union, per-page loop, multiplier-aware credits, status-code table, and smoke-test steps 31-35.

What's new in Phase 5.3:

- **Compare tool live at `/tool/ai-compare`**: two labeled dropzones (Original / Revised), disabled CTA until both slots hold a PDF, result card renders the markdown redline inline with Copy / Download(.md) / View actions — **15 credits flat per diff**.
- **Severity taxonomy baked into the prompt**: `BREAKING` (meaning reversed, obligation added, rights removed), `MATERIAL` (numbers / dates / scope / parties / defined terms), `MINOR` (wording tightening, clarifying additions), `COSMETIC` (typos, formatting). Summary section ends with a one-line bucket count (`"2 breaking, 5 material, 8 minor, 3 cosmetic"`) so downstream parsers can surface it without re-walking the body.
- **Exact H2 output contract**: `## Summary`, `## Breaking Changes`, `## Material Changes`, `## Minor Changes`, `## Cosmetic Changes`. Each listed change is titled + described, followed by verbatim quote blocks labeled `[A p. N]` / `[B p. N]`, with `(added)` / `(removed)` suffixes for single-side changes. Temperature pinned at `0.1` for deterministic structure and faithful quoting.
- **Uniform per-side truncation (not preferential)**: both sides capped independently at 200k chars (combined budget: 400k). We do NOT "keep the longer side" — a 6-page replacement vs. a 40-page original would lose every deletion. If either side is capped, `wasTruncated: true` surfaces to the result card and preview header.
- **15-credit flat pricing** (not per-page). Work is bounded on both ends: combined input cap (400k chars) and output cap (`COMPARE_MAX_OUTPUT_TOKENS = 4000`). Per-page pricing would reward pathological 500-page diffs and penalize the common 5-page contract case.
- **New `ai_outputs.kind` enum value `"comparison"`** (noun, matching `summary` / `translation` / `ocr`). Meta JSON captures both sides symmetrically: `originalSha256 / originalName / originalPageCount / originalChars` + the same four for `revised*`, plus `wasTruncated` and `creditCost`. Preview page (`/app/files/<id>/preview`) renders header as `"<A> vs <B> · M / N pages"`.
- **Bilateral-failure refund is atomic**: if either extraction fails, all 15 credits refund — not 7.5 each. 422s include `which: "pdfA" | "pdfB" | "both"` so the UI can point the user at the scanned side. 413s on either side also include `which:`.
- **Same credit + persistence pattern as 5.1/5.2**: `spendCredits("compare", 15)` up-front, `refundCredits` on any failure before the markdown is produced, 207-with-inline-markdown on post-compute persistence failure (no refund — user paid for real output they can still copy).
- Full section in `docs/ai/architecture.md` including the prompt shape, budgets, meta schema, status-code table, and smoke-test steps 25-30.

What's new in Phase 5.2:

- **Translate tool live at `/tool/ai-translate`**: drop a PDF, pick a target language, get a rendered markdown translation — **5 credits flat, any length**.
- **22 curated languages** via native-name labels (`Español`, `Português`, `日本語`, `العربية`, …) plus an "Other (enter BCP-47 code)…" free-text input for rare cases (`zh-Hant`, `sr-Latn-RS`, `cmn`). Target code validated both client- and server-side with a laxer-than-RFC-5646 regex: `/^[a-zA-Z]{1,3}(-[a-zA-Z0-9]{1,8})*$/`.
- **Real map-reduce chunking**: `chunkText()` splits on paragraph boundaries into ~20k-char chunks; each chunk is translated sequentially with `temperature: 0.1`; results are joined back with `\n\n`. Oversized single paragraphs are emitted whole rather than cut mid-sentence. Input ceiling is 600k chars — beyond that, input is truncated and surfaced with a `wasTruncated` badge.
- **Strict output contract**: system prompt tells the model to preserve markdown structure, `\f` page-break markers, `[p. N]` citations, proper nouns, URLs, and code — and to emit only the translation with no preamble.
- **`ai_outputs.content_md` column upgraded `TEXT` → `MEDIUMTEXT`** (16MB) so long technical translations don't hit the 64KB ceiling — especially relevant for non-ASCII targets where UTF-8 inflates byte count by ~3×. Migration: `ALTER TABLE ai_outputs MODIFY content_md MEDIUMTEXT NOT NULL;`.
- **Chunking metadata on preview**: `/app/files/<id>/preview` shows the target language as `· Português (pt-BR)`, plus `· 4 chunks` when the doc was chunked. The files list eye icon jumps straight to the preview.
- **Same credit lifecycle as summarize**: `spendCredits("translate", 5)` up-front, `refundCredits` on any failure before the markdown is produced, 207-with-inline-markdown on post-compute persistence failure.
- **Shared preview page, shared pattern**: everything reuses the Phase 5.1 `ai_outputs` table (discriminated by `kind`), the `renderMarkdown()` helper, and the `AIProvider` registry. Adding OCR in 5.3 will follow the same template.
- Full section in `docs/ai/architecture.md` — use it as the template when adding OCR or any other artifact-producing AI op.

What's new in Phase 5.1:

- **Summarize tool live at `/tool/ai-summarize`**: drop a PDF, pick a depth (TL;DR / Standard / Detailed), get a rendered markdown summary — 3 credits flat.
- **Three depth levels**, each with its own prompt shape and token cap:
  - `tldr` — one paragraph, ~3 sentences (`maxTokens` 300)
  - `standard` — TL;DR + Key Points + section-by-section (1200)
  - `detailed` — standard + Notable Quotes (cited by page) + Open Questions (2000)
- **`ai_outputs` table** (1:1 with `files` via file_id PK, `ON DELETE CASCADE`): stores `content_md` + a free-form `meta` JSON of provenance (provider, model, tokens, depth, creditCost). Same table will hold translations (5.2) and OCR (5.2+) — the `kind` enum is the discriminator.
- **Shared preview page** at `/app/files/[id]/preview` renders any saved AI output through `lib/markdown-mini.ts`, a zero-dep HTML renderer scoped to the markdown subset our summarizer emits. Every source char is HTML-escaped before inline markers are interpreted; link hrefs are scheme-filtered.
- **Same credit lifecycle as chat**: `spendCredits("summarize", 3)` up-front through the Phase 4 ledger; `refundCredits` reverses on any failure before the markdown is produced. Persistence failures after compute return 207 with the markdown inline — the user paid for a summary they can still copy.
- **Truncation-over-chunking at v1**: 240k-char budget with a `wasTruncated` flag surfaced in the UI. Map-reduce chunking lands in 5.2 once real user data tells us how often we need it.
- **View action on `/app/files`**: rows produced by `ai-summarize` (and the upcoming `ai-translate` / `ai-ocr`) get an eye icon that jumps to the preview page.
- Full section in `docs/ai/architecture.md` — use it as the template when adding translate or OCR.

What's new in Phase 5:

- **Portable AI provider layer**: a single `AIProvider` interface (`lib/ai/provider.ts`), per-provider adapters (`lib/ai/adapters/{anthropic,openai}.ts`), env-driven registry (`lib/ai/registry.ts`). Mirrors the Phase 4 payments pattern — adding a third provider is an adapter file + a registry row + env vars.
- **Streaming chat over SSE**: `/api/ai/chat` emits a discriminated-union event stream (`meta | delta | done | error`) that the client parses incrementally. No provider-specific chunk shapes leak out of the adapter.
- **Credit spend lifecycle**: every AI turn is one credit by default (`AI_OPERATION_COSTS` in `lib/pricing.ts`). `spendCredits` debits up-front through the same idempotent `grantCredits` ledger from Phase 4; `refundCredits` reverses on provider errors. Flat per-op pricing is deliberate — token-metered billing swaps in as a narrow refactor later.
- **Idempotency all the way down**: clients generate a UUID per submit; retries collapse to a single assistant row (unique index on `chat_messages.idempotency_key`) and replay the stored content without re-billing.
- **Server-side PDF text extraction**: `lib/ai/pdf-extract.ts` runs pdfjs-dist over uploads and builds a 240 000-char context window with OCR-candidate page detection. Works with any adapter — providers that don't support PDF attachments get the same context.
- **Chat UI**: `/app/chat` lists sessions with archive/rename/delete; `/app/chat/[id]` streams token-by-token with a pending `▍` cursor, optimistic user-message rendering, and an "attached: file.pdf" header chip.
- **"Open in chat" from /app/files**: every PDF row has a chat affordance that creates a titled session and redirects into it.
- **Config note**: `next.config.mjs` externalizes `openai` / `@anthropic-ai/sdk` / `pdfjs-dist` via `experimental.serverComponentsExternalPackages` — their Node-runtime shims import optional polyfills for pre-Node-18 environments that webpack otherwise tries (and fails) to bundle.
- Full architecture doc at `docs/ai/architecture.md`.

What's new in Phase 4:

- **Two payment providers live, swappable via env**: Razorpay (India / domestic INR) and Paddle (international / MoR). Neither code-wired as the default — the registry at `lib/payments/registry.ts` loads whichever has its env vars set, and the UI renders a button per configured provider.
- **Portable architecture**: a single `PaymentProvider` interface (`lib/payments/provider.ts`), per-provider adapters (`lib/payments/adapters/{razorpay,paddle}.ts`), a shared webhook processor (`lib/payments/webhook-handler.ts`), and one idempotent ledger writer (`lib/payments/ledger.ts`). Adding a third provider (Stripe, Lemon Squeezy, whatever) is an adapter file + a registry row + two env vars.
- **Idempotent credit grants**: `grantCredits()` takes an idempotency key. Webhooks use `${paymentId}:base` / `${paymentId}:bonus`; refunds use `${paymentId}:refund:${providerRefundRef}`. Replay the same webhook ten times and the ledger moves exactly once.
- **Refunds**: self-serve 14-day unused-credits refund button on `/app/billing`. Proration is done from the pack total, not remaining balance, so partial refunds are deterministic and idempotent. See `lib/payments/refund-actions.ts`.
- **Nightly reconciliation cron**: catches webhooks we missed. Pages each provider's history since the last checkpoint, normalizes, runs through the same `applyPaymentEvent` path as live webhooks.
- **PCI DSS SAQ-A compliant by design**: card data never touches our origin. CSP in `next.config.mjs` enforces this at the browser layer (whitelisted `frame-src` / `script-src` / `connect-src`). Full scope doc at `docs/security/pci-saq-a.md`.
- **Security headers**: HSTS (63072000; preload), X-Frame-Options DENY, Permissions-Policy denying camera/mic/geo, Referrer-Policy strict-origin-when-cross-origin.
- **Migration playbook** at `docs/payments/migration-playbook.md` — how to add, switch, or sunset providers without a code change beyond the adapter file.

What's new in Phase 3:

- **Four live tools**: Merge, Split, Rotate, Compress — all running at `/tool/[id]`
- **100% client-side** processing via [pdf-lib](https://pdf-lib.js.org/) — no bytes leave the browser
- **Open to all** — no login required to use the free tools
- **Metadata-only history**: signed-in users see their tool results listed on `/app/files` (name + size + sha256 + source chip), anonymous users get a silent no-op
- Shared primitives: `components/tools/ToolDropzone.tsx`, `lib/client/pdf-utils.ts`, `lib/tool-result-actions.ts`
- Extended `files` schema with `source` (`"upload" | "tool"`) and `toolId` (registry id) columns
- 50 MB per-file ceiling enforced at the dropzone; honest "lossless only" note on the Compress tool

What's new in Phase 2:

- MySQL via **Drizzle ORM** (`db/schema/*.ts`), local dev with `docker-compose`
- **NextAuth v5** with Credentials (email + password, bcrypt) and Google OAuth
- Middleware-gated `/app/*` routes; redirect rules for `/login` + `/register`
- Authed shell: sidebar + user menu + sign out
- Pages: `/app/dashboard`, `/app/files` (metadata-only drop zone), `/app/settings` (working profile, password change, delete account), `/app/api-keys`, `/app/billing` (stubs)
- TopNav flips to an avatar dropdown when signed in
- All auth/app pages are `robots: noindex` and excluded from the sitemap

Coming in later phases:

| Phase | Scope                                               | ETA       |
| ----- | --------------------------------------------------- | --------- |
| 6.3+  | Agent, Admin                                        | Week 11   |

---

## Local development

Requirements:

- **Node.js 18.17+** (Node 20 LTS recommended)
- **Docker** (for the local MySQL container) — or your own MySQL 8 instance

### One-time Windows cleanup (first checkout only)

The source was assembled in a sandbox that can't delete files, so a few
placeholder stubs exist at:

- `app/(marketing)/` — disabled pages renamed to `_disabled-page.tsx`
- `auth-handlers.ts`, `auth-route.ts` — empty `export {}` stubs

On Windows (PowerShell):

```powershell
Remove-Item -Recurse -Force .\app\(marketing)
Remove-Item -Force .\auth-handlers.ts, .\auth-route.ts
```

The site builds either way — these files just aren't doing anything.

### A note on `node_modules` and the Cowork sandbox

`node_modules` is bind-mounted from the Windows host through virtiofs. That means
the **SWC binary is platform-specific** — `@next/swc-win32-x64-msvc` when
`npm install` runs on Windows, or a Linux binary when it runs from inside the
Cowork sandbox. The two aren't interchangeable: running `next build` on Linux
against a Windows-installed `node_modules` silently falls back to a degraded
code path that pegs CPU forever without producing output.

Rule of thumb:

- **Run `npm install` and `npm run build` on the same OS you'll run them on.**
- If you install on Windows, build on Windows (PowerShell). That's the normal case.
- `npm run typecheck` is OS-agnostic — it's safe to run from anywhere and is the
  recommended smoke test to run from inside the Cowork sandbox.

Every phase has been verified with `npm run typecheck` ✅ clean (including
Phase 4's payments module). The full `npm run build` should be run on Windows
(or any environment where `npm install` was last run) — and needs MySQL
reachable, because `output: 'standalone'` static-generation pre-renders a
handful of DB-backed pages at build time.

### Install + env

```bash
# 1. Install deps
npm install

# 2. Copy env template, then fill it in
cp .env.example .env.local
```

Minimum env for local dev (`.env.local`):

```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
PORT=3000

MYSQL_URL=mysql://pdfcraft:pdfcraft_dev_password@127.0.0.1:3306/pdfcraft
NEXTAUTH_SECRET=<32+ byte random string>
NEXTAUTH_URL=http://localhost:3000

# Optional (skip if not using Google login locally):
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Optional — Razorpay. Omit all three to hide the Razorpay button.
# Test-mode keys work fine in dev.
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# Optional — Paddle (international / MoR). Omit to hide the Paddle button.
# PADDLE_ENV accepts "sandbox" (default) or "live".
# PADDLE_API_KEY is server-side; PADDLE_CLIENT_TOKEN is shipped to the
# browser by Paddle.js. Do NOT swap them.
PADDLE_API_KEY=
PADDLE_CLIENT_TOKEN=
PADDLE_WEBHOOK_SECRET=
PADDLE_ENV=sandbox

# Optional — AI providers. Set at least one to unlock /app/chat.
# The registry loads whichever is configured; if both are set, each
# session locks to the provider it opened on first turn.
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

The registry at `lib/payments/registry.ts` checks these on every request — setting (or unsetting) them is a live flip; no code change, no restart beyond the Node process cycle.

Generate a secret:

```bash
openssl rand -base64 32
```

### Start local MySQL (Docker)

```bash
docker compose up -d        # starts pdfcraft-mysql on :3306
docker compose logs -f mysql # watch it come up
```

### Push the schema

```bash
npm run db:push             # Drizzle: sync schema → running MySQL
```

Optional: inspect data in the browser with Drizzle Studio.

```bash
npm run db:studio
```

### Run the app

```bash
npm run dev
```

Visit http://localhost:3000. Register at `/register`, then check `/app/dashboard`.

### Google OAuth setup (optional but recommended)

1. Open [Google Cloud Console](https://console.cloud.google.com/) → create a
   project (any name).
2. **APIs & Services** → **OAuth consent screen** — configure as "External",
   add your email as a test user.
3. **Credentials** → **Create Credentials** → **OAuth client ID**:
   - Type: **Web application**
   - Authorized JavaScript origins: `http://localhost:3000`
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
4. Copy the client ID + secret into `.env.local`:
   ```
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   ```
5. Restart `npm run dev`. "Continue with Google" on `/login` + `/register` now works.

For prod, repeat with `https://pdfcraftai.com` origins + `/api/auth/callback/google` redirect.

### Payments setup (optional for local dev)

You don't need either provider configured to develop locally — the `/pricing` page falls back to a "payments coming online shortly" message when nothing is wired up. Enable one or both when you want to exercise the checkout flow.

**Razorpay (sandbox):**

1. Create a free account at [dashboard.razorpay.com](https://dashboard.razorpay.com/).
2. Stay in **Test Mode** (toggle in the top bar).
3. **Settings → API Keys → Generate Test Keys.** Copy the Key ID + Secret into `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.
4. **Settings → Webhooks → Add New Webhook**:
   - URL: `https://<your-ngrok-or-tunnel>.ngrok.io/api/webhooks/razorpay` (local dev) or `https://pdfcraftai.com/api/webhooks/razorpay` (prod).
   - Events: `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`.
   - Secret: generate or paste any string; put the same value in `RAZORPAY_WEBHOOK_SECRET`.

**Paddle (sandbox):**

Paddle operates as a merchant-of-record — it sells the credits to the end
customer and remits VAT/GST/sales-tax to every jurisdiction on our behalf.
Payout lands in our account net of Paddle's fees + the taxes collected.
The adapter treats Paddle as a one-time transaction provider (same shape
as Razorpay); recurring subscriptions are on the roadmap but not wired
into the UI yet.

1. Sign up at [paddle.com](https://www.paddle.com/) and pick **Paddle Billing** (not the legacy Classic product).
2. Flip the sandbox toggle in the left sidebar of the vendor dashboard. Sandbox is available immediately; live-mode unlocks after Paddle KYC (3–7 business days).
3. **Developer Tools → Authentication → API keys → Create API key.** Copy into `PADDLE_API_KEY` (server-side; never ship to the browser).
4. **Developer Tools → Authentication → Client-side tokens → Generate.** Copy into `PADDLE_CLIENT_TOKEN`. This is the token Paddle.js reads in the browser when opening the overlay checkout — it's narrow-scoped and safe to ship to the client.
5. **Catalog → Products → New Product.** Create one product per credit pack in `lib/pricing.ts` (matching the pack id/name). Add a one-time price in USD to each. Copy the Paddle `price_id` back into the pack row in `lib/pricing.ts` under a `paddlePriceId` field (the adapter reads it to seed checkout).
6. **Developer Tools → Notifications → New destination → Webhook.**
   - URL: `https://<your-ngrok-or-tunnel>.ngrok.io/api/webhooks/paddle` (local dev) or `https://pdfcraftai.com/api/webhooks/paddle` (prod).
   - Events: `transaction.completed`, `transaction.payment_failed`, `adjustment.created`, `adjustment.updated`.
   - Copy the **signing secret** shown after creation into `PADDLE_WEBHOOK_SECRET`.
7. Leave `PADDLE_ENV=sandbox` until KYC clears and you're ready for live traffic.

**Test card numbers:**

- Razorpay test: `4111 1111 1111 1111`, any future expiry, any CVV.
- Paddle sandbox: `4242 4242 4242 4242` (Visa), any future expiry, any CVV. The full list lives at [developer.paddle.com/concepts/payment-methods/credit-debit-card](https://developer.paddle.com/concepts/payment-methods/credit-debit-card).

**Going live:**

1. Flip to live-mode keys on each provider dashboard and swap the env vars in Hostinger.
2. Add the production webhook endpoints on each provider.
3. Set `PADDLE_ENV=live` (only after Paddle KYC verification has cleared).
4. Set `CRON_SECRET` (see below) and wire up the nightly reconciliation cron in hPanel → **Advanced → Cron Jobs**:
   ```
   0 3 * * *  curl -H "x-cron-secret: $CRON_SECRET" https://pdfcraftai.com/api/cron/reconcile-payments
   ```
5. Do one $1 real payment + refund as a smoke test.
6. Before enabling on prod, read `docs/payments/migration-playbook.md` and `docs/security/pci-saq-a.md`.

The reconciliation job sweeps each configured provider's transaction history since the last run, and reapplies any captures/refunds we missed through the webhook path. Every action flows through the same idempotent `applyPaymentEvent()` ledger writer, so duplicate runs are safe.

### AI setup (optional for local dev)

`/app/chat` shows a "no provider configured" notice if neither Anthropic nor OpenAI has its key set. Wire up one or both to exercise the streaming chat flow.

**Anthropic:**

1. Create a key at [console.anthropic.com](https://console.anthropic.com/) → **API Keys**.
2. `ANTHROPIC_API_KEY=sk-ant-...` in `.env.local`.
3. (Optional) Override the default model with `ANTHROPIC_MODEL=claude-sonnet-4-6` or similar.

**OpenAI:**

1. Create a key at [platform.openai.com](https://platform.openai.com/api-keys).
2. `OPENAI_API_KEY=sk-...` in `.env.local`.
3. (Optional) Override the default model with `OPENAI_MODEL=gpt-4o` or similar.

**Both configured at once**: the registry makes both adapters available. Each chat session locks to the provider it opened with on its first turn (stored in `chat_sessions.provider_id`), so mid-conversation env flips don't swap models on an in-progress thread.

Every chat turn debits **one credit** through the same ledger as payments (`AI_OPERATION_COSTS.chat_turn` in `lib/pricing.ts`). Provider errors automatically refund. PDF extraction, context window management, and SSE event shape are all documented at `docs/ai/architecture.md`.

### Scripts

| Command             | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Start Next.js dev server                       |
| `npm run build`     | Production build (output: standalone)          |
| `npm run start`     | Run the production server                      |
| `npm run lint`      | ESLint                                         |
| `npm run typecheck` | TypeScript check (no emit)                     |
| `npm run db:push`   | Drizzle push schema to MySQL                   |
| `npm run db:generate` | Drizzle generate SQL migration files         |
| `npm run db:studio` | Drizzle Studio (web UI for your DB)            |

---

## Deploying to Hostinger Business (Node.js)

Hostinger Business Web Hosting supports Node.js via the **"Setup Node.js App"**
tool in hPanel. You do **not** deploy from Git directly on Business — you upload
a prebuilt bundle and run it.

### One-time setup in hPanel

1. Log in to **hPanel** → **Advanced → Node.js**.
2. **Create Application**:
   - **Node.js version**: 20.x (match your local)
   - **Application mode**: `Production`
   - **Application root**: `pdfcraftai` (a folder under your account root)
   - **Application URL**: `pdfcraftai.com`
   - **Application startup file**: `server.js` (we'll create this below)
   - **Passenger port**: leave default
3. Add **Environment variables** (from `.env.example`):
   - `NEXT_PUBLIC_SITE_URL=https://pdfcraftai.com`
   - `NODE_ENV=production`
   - `MYSQL_URL=mysql://<user>:<pass>@<host>:3306/<db>` — from hPanel → **Databases** → **MySQL Databases**. Use the host shown there (usually `localhost` for same-account, or the external host if connecting remotely); wrap the password if it contains special characters.
   - `NEXTAUTH_SECRET=<32+ byte random string>` — `openssl rand -base64 32`
   - `NEXTAUTH_URL=https://pdfcraftai.com`
   - `GOOGLE_CLIENT_ID=...` / `GOOGLE_CLIENT_SECRET=...` if using Google login
   - Payment providers (set all three for Razorpay and/or all four for Paddle; leave unset to hide that button):
     - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
     - `PADDLE_API_KEY`, `PADDLE_CLIENT_TOKEN`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_ENV=live`
   - AI providers (set at least one to enable `/app/chat`; leave both unset to hide chat UI):
     - `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL`
     - `OPENAI_API_KEY`, optional `OPENAI_MODEL`

### Hostinger prod MySQL notes

- Create the DB + user in hPanel → **Databases** → **MySQL Databases**.
- The user you create only has privileges on the DB you attach it to — that's what Drizzle needs.
- After deploy, run `npm run db:push` once (either via hPanel's terminal or by running it locally with `MYSQL_URL` pointed at the Hostinger external host + your IP whitelisted in hPanel → **Remote MySQL**).
- Hostinger's MySQL 8 accepts the default `caching_sha2_password` the `mysql2` driver uses — no extra config needed.
4. Point your `pdfcraftai.com` domain to the app (hPanel → **Domains** →
   select domain → **Manage** → tie it to the Node.js application root).

### Build locally, upload, install

We're using `output: 'standalone'` in `next.config.mjs`, so the build produces a
compact bundle Hostinger can run directly.

```bash
# 1. Build on your Windows machine (inside Claude\Projects\pdfcraftai)
npm ci
npm run build

# 2. Prepare the deploy bundle
#    .next/standalone/  has server.js + minimal node_modules
#    .next/static/      has client assets (must be copied into standalone)
#    public/            has your static files (must also be copied)
xcopy .next\standalone deploy /E /I
xcopy .next\static deploy\.next\static /E /I
xcopy public deploy\public /E /I
```

Linux/macOS equivalent:

```bash
rm -rf deploy && mkdir deploy
cp -r .next/standalone/. deploy/
cp -r .next/static deploy/.next/static
cp -r public deploy/public
```

Now upload the `deploy/` directory contents into the **Application root**
(`pdfcraftai/`) via hPanel **File Manager** or SFTP. The file layout on the
server should be:

```
pdfcraftai/
  server.js               <- comes from .next/standalone
  package.json            <- comes from .next/standalone (minimal)
  node_modules/           <- comes from .next/standalone
  .next/
    static/...            <- copied in
  public/
```

Then in hPanel → Node.js → your app:

1. Click **Run NPM Install** (skip if node_modules is already in the bundle).
2. Click **Restart**.
3. Hit `https://pdfcraftai.com` — the landing page should load.

### Later: automate with Git + a post-receive hook

Once the manual deploy works, we'll wire up either:

- **GitHub Actions → SFTP** (push to `main`, CI builds and uploads), or
- **Bare Git repo on the server + post-receive hook** (push to `production` remote, server rebuilds).

Pick this up after Phase 1 ships.

### If Business plan Node.js proves too slow

Typical bottlenecks on shared Node.js:

- Large PDF processing (memory limits)
- Concurrent AI API calls (process restarts on idle)
- OCR / image conversion (CPU caps)

Upgrade path when you hit them:

1. **Hostinger VPS** (KVM 2+) — full root, Docker-ready, runs the same Next.js app with `pm2`.
2. **Split frontend/backend** — Next.js stays on Business, heavy work moves to Cloudflare Workers, Railway, or a cheap VPS.

---

## Project structure

```
app/
  layout.tsx              root layout, SessionProvider, MarketingChrome
  page.tsx                landing page
  globals.css             design tokens + component classes
  not-found.tsx           branded 404
  api/
    auth/[...nextauth]/   NextAuth route handlers
    page.tsx              /api marketing page (separate from auth handlers)
  login/                  /login — email + Google
  register/               /register — email + Google
  app/                    authed section (middleware-gated /app/*)
    layout.tsx            fetches session, renders sidebar
    dashboard/
    files/
    chat/                 /app/chat list + /app/chat/[id] streaming UI
    settings/
    api-keys/
    billing/
  blog/ pricing/ help/ ... marketing pages
components/
  nav/
    TopNav.tsx            marketing nav (flips to avatar menu when signed in)
    Footer.tsx
    MarketingChrome.tsx   client wrapper — hides nav on /app, /login, /register
  auth/                   AuthShell, LoginForm, RegisterForm
  app/                    AppShell + settings/files/chat sub-components
    chat/
      ChatClient.tsx      streaming UI (SSE parser + optimistic state)
      NewChatButton.tsx
      ChatRowActions.tsx
    files/
      OpenInChatButton.tsx  "Open in chat" affordance on /app/files
  providers/
    SessionProviderWrapper.tsx
  icons/Icons.tsx         prototype icon set
db/
  client.ts               singleton Drizzle + mysql2 pool
  schema/
    auth.ts               users / accounts / sessions / verificationTokens
    app.ts                files / api_keys / credits / credit_ledger
    index.ts              barrel export
lib/
  tools.ts                canonical tool registry
  pricing.ts              credit packs catalog (shared by /pricing + ledger)
  auth-actions.ts         register / login server actions
  settings-actions.ts     profile / password / delete account
  files-actions.ts        metadata-only file register + delete
  payments/
    provider.ts           PaymentProvider interface + error types
    types.ts              shared Money / Currency / CheckoutInput / NormalizedPaymentEvent
    registry.ts           env-driven adapter loader
    checkout-actions.ts   createCheckoutAction (called from /pricing)
    refund-actions.ts     requestRefundAction (called from /app/billing)
    ledger.ts             grantCredits + applyPaymentEvent (idempotent)
    webhook-handler.ts    shared processWebhook() used by both routes
    reconcile.ts          nightly cron — pages provider history
    adapters/
      razorpay.ts         Razorpay adapter + scrub() (shared)
      paddle.ts           Paddle adapter (MoR; imports scrub from razorpay)
  ai/
    provider.ts           AIProvider interface + UnsupportedCapabilityError
    types.ts              ChatChunk / ChatInput / ChatResult / StopReason / …
    registry.ts           env-driven adapter loader (Anthropic, OpenAI)
    credits.ts            spendCredits + refundCredits (wraps grantCredits)
    pdf-extract.ts        pdfjs-dist Node wrapper + OCR-candidate detection
    adapters/
      anthropic.ts        @anthropic-ai/sdk adapter
      openai.ts           openai adapter
  chat-actions.ts         create / rename / archive / delete chat session actions
app/api/webhooks/
  razorpay/route.ts       POST /api/webhooks/razorpay
  paddle/route.ts         POST /api/webhooks/paddle
app/api/ai/
  chat/route.ts           POST /api/ai/chat (streaming SSE)
db/schema/
  app.ts                  (extended) chat_sessions + chat_messages tables
docs/
  security/pci-saq-a.md   PCI DSS scope + annual attestation checklist
  payments/migration-playbook.md   how to add/switch/sunset a payment provider
  ai/architecture.md      AI provider layer, streaming protocol, credit spend
auth.config.ts            edge-safe NextAuth config (middleware)
auth.ts                   full NextAuth config (Drizzle + bcrypt)
middleware.ts             route gating for /app/*
drizzle.config.ts         Drizzle Kit config
docker-compose.yml        local MySQL 8 container
next.config.mjs           output: 'standalone' + PCI SAQ-A CSP + security headers
tailwind.config.ts        tokens wired to CSS variables
```

---

## Porting notes (from the prototype)

- **Hash router replaced with App Router.** `#/tools` → `/tools`. SEO win.
- **Global `window.Component` pattern replaced with ES modules.** Each component has a file and an import.
- **No more in-browser Babel.** Everything precompiles. Bundle is ~50% smaller per page than the prototype once gzipped.
- **Theme persistence uses the prototype's `pdfcraft_state` localStorage key** so we don't invalidate any returning test users.
- **Icons stayed identical.** I considered swapping to `lucide-react` for file-size reasons, but the prototype's custom glyphs are part of the brand — I ported them verbatim.

---

## Licensing

Proprietary. © pdfcraft ai, Inc.
