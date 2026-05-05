# AI Feedback Rollout — Stage Tracker

PENDING_WORK_ANALYSIS.md §6b ships in three stages. This doc tracks
progress + lays out the rollout plan for the remaining tools.

## Stage 1 — foundation (CLOSED, commit `d74fefe`)

- Migration 0022: `ai_feedback` table
- Drizzle schema entry (`aiFeedback`)
- POST `/api/ai/feedback` (auth-gated, zod-validated, upsert via ON
  DUPLICATE KEY UPDATE, 60/min rate limit)
- `/admin/ai-feedback` page (summary cards + per-op NPS table +
  recent thumbs-down rows)
- Admin layout NAV entry under Ops
- 63-assertion CI guard

## Stage 2 — FeedbackChip + Summarize pilot (IN PROGRESS)

- `components/feedback/FeedbackChip.tsx` (NEW reusable chip)
- `app/api/ai/summarize/route.ts` extended to surface `aiUsageId`
  in both 200 + 207 responses (captured from `recordAiUsage` return)
- `components/tools/SummarizePdfTool.tsx` wires the chip into the
  ResultCard with full provenance (operation, aiUsageId, fileId,
  providerId, model)
- CI guard `ai-feedback-pilot` locks in the wire-up

**Why pilot first:** rolling out the chip across all 53 AI tools in
a single commit would touch 53+ files which cascades the deploy. The
pilot proves the end-to-end loop (POST → row in ai_feedback →
/admin/ai-feedback shows it) on a single high-traffic tool, then
stage 3 batches the rest knowing the chip works.

## Stage 3 — fleet rollout (PENDING)

53 AI tools to wire. Grouped by route category for batched commits
that minimize cascade frequency:

### Batch A — top-5 traffic ops (single commit, ~5 files)

1. `TranslatePdfTool` — `/api/ai/translate` route
2. `RewritePdfTool` — `/api/ai/rewrite` route
3. `TableExtractTool` — `/api/ai/table` route
4. `ComparePdfTool` — `/api/ai/compare` route
5. `OcrPdfTool` — `/api/ai/ocr` route

These are the 5 routes with their own dedicated runner components +
their own POST handlers. Each route needs the same `aiUsageId`
surfacing change, each runner needs the chip wire-up.

### Batch B — variant tools (single commit, ~9 files)

`SummarizeVariantTool` and family (faq / action-items / mindmap /
blood-test / jd-match / paraphrase / detector / rewrite-variant).
These share more code — the parent variant runner can be modified
once and the chip flows through to all variants.

### Batch C — specialist + remaining (final commit, ~30+ files)

The legal / specialist tools (`CourtOrderTool`, `BloodTestTool`,
etc.) plus the long tail. Single commit batched after batches A + B
have validated the pattern.

## What needs to happen at each route

When wiring a new AI route to the chip:

1. **Route handler** (`app/api/ai/<op>/route.ts`):
   - Capture `recordAiUsage` return value:
     `const usageRecord = await recordAiUsage({...});`
   - Add to response body:
     `aiUsageId: usageRecord.applied ? usageRecord.id : null`
   - Add to BOTH the 200 path AND the 207 / persist-failed path.

2. **Runner component** (`components/tools/<X>Tool.tsx`):
   - Import: `import { FeedbackChip } from "@/components/feedback/FeedbackChip"`
   - Result type: add `aiUsageId: string | null` field
   - Response parser: capture `aiUsageId: typeof body.aiUsageId === "string" ? body.aiUsageId : null`
   - ResultCard JSX: add `<FeedbackChip operation="<op>" aiUsageId={result.aiUsageId} fileId={result.fileId ?? null} providerId={result.providerId} model={result.model} />` at the bottom of the card.

3. **CI guard**: extend `test-ai-feedback-pilot.mjs` (rename to
   `test-ai-feedback-rollout.mjs` once batch A lands) to include
   the new tool in the "wired tools" list.

## Edge cases

### Batch ops + chat_turn

Batch ops route through `app/api/ai/batch/submit` → finalize. The
`aiUsageId` here points to the FINALIZED usage row (created during
batch finalize, not at submit time). The chip should still work — it
just attaches feedback to the finalize row.

Chat turns produce no `file_id` and the `aiUsageId` is the chat-turn
row in `ai_usage`. The chip works the same way; the admin page shows
"file_id: null" rather than a clickable file link.

### Re-runs + replays

`recordAiUsage` is idempotent on `idempotencyKey` — a duplicate run
returns `{applied: false, reason: "duplicate"}`. In that case the
route falls through to `aiUsageId: null` and the chip degrades
gracefully (each click inserts a new row instead of flipping). This
is rare (idempotency replay is only triggered by client retry on
network failures) but worth knowing.

### Existing rendered results

Users who already have a Summary card open from before this commit
won't have `aiUsageId` in their result state — the chip will work
but every click is a new row. The next summary they run captures
the id. No data migration needed.

## Tracking

| Stage | Tools wired | % Complete | Commit |
|---|---|---|---|
| Stage 1 — foundation | 0 / 53 (table + endpoints) | 100% (foundation) | `d74fefe` |
| Stage 2 — Summarize pilot | 1 / 53 | 1.9% | `e99ac1c` |
| Stage 3 batch A — top 5 ops (3 of 5) | 4 / 53 | 7.5% | `beeb902` (translate/rewrite/ocr) |
| Stage 3 batch A — finish (table + compare) | 6 / 53 | 11.3% | `ff54b07` |
| Stage 3 batch A — sign + redact (newly unlocked by Batch 3 ai_usage) | 8 / 53 | 15.1% | `1684741` |
| Stage 3 — Generate (last markdown-rendering AI tool) | 9 / 53 | 17.0% | `94db9e1` |
| Stage 3 — Chat (per-message in conversational UX) | 10 / 53 | 18.9% | `cb013ab` |
| Stage 3 batch B — variants (Summarize/Structured/Mindmap/BloodTest) | ~46 / 53 | ~87% | _this commit_ |
| Stage 3 batch C — specialist + tail | — | — | pending |

Update this table as batches ship.

## Batch B notes (this commit)

Batch B targets the four shared variant runner components — they collectively cover ~36 depth variants of the Summarize backend plus flashcards/quiz/mindmap/blood-test. Wiring the chip into the four shared components means **every variant** (key-points, study-notes, eli5, faq, blog, readability, action-items, syllabus, discharge, jd-match, paraphrase, ai-detector, condense, expand, tone-analyze, citations, sentiment, bias, entities, social-thread, newsletter, video-script, improve-writing, proofread, ats-resume, cover-letter, nda, employment, salary-slip, research-paper, insurance, loan-bundle, partnership-deed, chart-to-table, stamp-duty, plus flashcards / quiz / mindmap / blood-test) inherits the chip without per-variant edits.

**Why this is one commit, not 36:** the variant routing is already in place — every variant POSTs to `/api/ai/summarize`. The route already surfaces `aiUsageId` (instrumented in commit `f7d5a9c` via Batch 1 of the AI_USAGE_INSTRUMENTATION_GAP rollout). The only structural change needed was the Result-type extension + capture in the four shared components. Per-variant SEO landings + tool registry entries don't need to know about the chip.

**Files changed:** 4 components (`SummarizeVariantTool.tsx`, `StructuredVariantTool.tsx`, `MindmapPdfTool.tsx`, `BloodTestTool.tsx`) + `scripts/test-ai-feedback-pilot.mjs` WIRED_TOOLS list extended 10 → 14 (entries map components, all four to operation `summarize` matching the route's `recordAiUsage` value).

**Operation aggregation:** all variants share `operation="summarize"` on the chip (matches what `recordAiUsage` persists). `/admin/ai-feedback` rolls them up under the `summarize` op bucket. Per-variant slicing is implicit on the ai_usage row's `prompt_version` field — when the prompt registry A/B work ships, slicing by depth becomes a join, not a chip prop change.

**What's left:** Stage 3 batch C (specialist + long-tail tools). The remaining ~7 tools in the registry that route through their own dedicated AI helper (not `/api/ai/summarize`) — primarily the specialist tools (`CourtOrderTool` etc) that need their own routes to surface `aiUsageId` first.
