# AI Usage Instrumentation Gap

**Discovered:** 2026-05-04 while planning Stage 3 batch A of the AI feedback rollout (`docs/AI_FEEDBACK_ROLLOUT.md`).

**Severity:** SEV-1. Real observability gap; blocks several downstream features.

## Summary

The `ai_usage` table is the per-AI-call audit log. The intent (per the comment header in `lib/ai/usage.ts`) is "every adapter call wraps through `recordAiUsage` after the provider." In practice, **only 2 of 10 AI ops write to it**.

## Empirical evidence (prod, 2026-05-04)

```sql
SELECT operation, COUNT(*) AS calls FROM ai_usage GROUP BY operation;
```

| operation | rows |
|---|---|
| chat_turn | 8 |
| summarize | 4 |
| translate | **0** |
| rewrite | **0** |
| table | **0** |
| compare | **0** |
| ocr | **0** |
| generate | **0** |
| sign | **0** |
| redact | **0** |

The 8 ops with zero rows DO ship traffic — they're all wired into production tools, all spend credits via `spendCredits`, all have route handlers — but none of them call `recordAiUsage` after the provider responds.

## Why this matters

### 1. Margin rollup is incomplete

`lib/ai/margin-rollup.ts` aggregates `ai_usage` rows daily into `ai_daily_margin`. Without rows for translate/rewrite/table/compare/ocr/generate/sign/redact, the rollup only sees:

- summarize
- chat_turn

**80% of AI traffic by op count is invisible to /admin/margin.** The fleet-wide margin number we look at every day is computed against 20% of the actual fleet. Any cost spike or quality regression in the missing ops doesn't trigger the rollup's red-slice detector.

### 2. FeedbackChip flip semantics break for missing ops

The FeedbackChip on AI tool result cards uses `UNIQUE(user_id, ai_usage_id)` for idempotent thumbs flips. Without an `ai_usage_id` from the response, the chip falls back to inserting fresh rows on every click. The user can still rate the output, but flipping ↑→↓ creates two rows instead of replacing the first.

**Impact:** stage 3 of the rollout gets degraded UX on these 8 ops until they're instrumented. The data is still useful in aggregate (per-op NPS still computes correctly with multiple rows), but flip-rate observability and per-call attribution are broken.

### 3. /app/usage page hides spend on missing ops

The user-facing usage page (`/app/usage`) reads from `ai_usage`. Users running translate/rewrite/etc. see "you haven't used any AI ops yet" even though they paid credits.

**Today:** mitigated because the page also reads from `credit_ledger` for the spend total. But the per-op breakdown is wrong.

### 4. Per-op error rates are unmeasurable

The `success` column on `ai_usage` (1 = ok, 0 = error) feeds the daily error-rate dashboard. Without rows for the 8 missing ops, we have no way to detect a 502/503 spike on any of them except by tail-grepping the Hostinger logs.

## Why is this state shipped?

Reading the git history: when the AI ops were added, the `recordAiUsage` discipline was inconsistent. Summarize + chat got the audit instrumentation early (Phase A1). The other ops shipped without it. There's no inline TODO or warning in the route files because the gap wasn't visible — until ai_usage queries ran.

The summarize route is the only one with the canonical pattern:

```typescript
const usageRecord = await recordAiUsage({
  userId,
  operation: "summarize",
  providerId: result.providerId,
  model: result.model,
  inputTokens: result.usage.inputTokens,
  outputTokens: result.usage.outputTokens,
  cachedInputTokens: result.usage.cachedInputTokens,
  cacheCreationInputTokens: result.usage.cacheCreationInputTokens,
  latencyMs: Date.now() - providerStartedAt,
  creditsSpent: creditCost,
  costMicros: null, // Computed by recordAiUsage from token counts
  success: true,
  stopReason: result.stopReason,
  responseTruncated: isTruncatedStopReason(result.stopReason) ? 1 : 0,
  promptVersion: result.promptVersion,
  experimentId: result.experimentId,
  ledgerId: spend.ledgerId, // Links audit to credit debit
  idempotencyKey: spendKey,
});
```

## Fix recipe (per route)

For each of the 8 missing ops:

1. **Capture provider start time** at the top of the route handler:
   ```typescript
   const providerStartedAt = Date.now();
   ```

2. **After the provider call succeeds**, add the recordAiUsage write:
   ```typescript
   const usageRecord = await recordAiUsage({
     userId,
     operation: "<op>",
     providerId: result.providerId,
     model: result.model,
     // ... full payload, see summarize/route.ts:359-403 for canonical shape
   });
   ```

3. **Surface `aiUsageId`** in 200 + 207 response paths:
   ```typescript
   aiUsageId: usageRecord.applied ? usageRecord.id : null,
   ```

4. **In the tool runner component**, add `aiUsageId` to the result type + capture from response.

5. **Pass aiUsageId to the FeedbackChip** in the ResultCard.

## Tracker

| Op | Route handler | Tool component | Status |
|---|---|---|---|
| summarize | app/api/ai/summarize/route.ts | components/tools/SummarizePdfTool.tsx | ✅ instrumented + chip wired |
| chat | app/api/ai/chat/route.ts | components/app/chat/ChatClient.tsx | ✅ instrumented; chip not wired (chat-turn UI is different) |
| translate | app/api/ai/translate/route.ts | components/tools/TranslatePdfTool.tsx | ❌ no ai_usage write |
| rewrite | app/api/ai/rewrite/route.ts | components/tools/RewritePdfTool.tsx | ❌ no ai_usage write |
| table | app/api/ai/table/route.ts | components/tools/TableExtractTool.tsx | ❌ no ai_usage write |
| compare | app/api/ai/compare/route.ts | components/tools/ComparePdfTool.tsx | ❌ no ai_usage write |
| ocr | app/api/ai/ocr/route.ts | components/tools/OcrPdfTool.tsx | ❌ no ai_usage write |
| generate | app/api/ai/generate/route.ts | components/tools/GeneratePdfTool.tsx | ❌ no ai_usage write |
| sign | app/api/ai/sign/route.ts | components/tools/SignPdfTool.tsx | ❌ no ai_usage write |
| redact | app/api/ai/redact/route.ts | components/tools/RedactPdfTool.tsx | ❌ no ai_usage write |

## Rollout plan

Each instrumentation is small (~15 lines per route). But shipping all 8 in one commit cascades — that's 8 route files + provider start-time captures. Better to batch into 3 commits matching the FeedbackChip stage 3 batches:

- **Batch 1** (3 files): translate, rewrite, ocr. Highest-traffic ops first.
- **Batch 2** (3 files): table, compare, generate. Mid-traffic.
- **Batch 3** (2 files): sign, redact. Lowest-traffic.

Each batch closes 3 of the 8 gaps and unlocks FeedbackChip flip semantics for those ops. Batch 1 is recommended for the next code-bearing arc.

## Estimate

Per route: ~15 minutes (capture start time, add recordAiUsage call, surface aiUsageId in 2 response paths). 8 routes × 15 min = 2 hours total instrumentation. Plus per-tool component wire-up (the chip work documented in `AI_FEEDBACK_ROLLOUT.md` Stage 3) which is another 2 hours.

**Total: 4 hours of focused work, batched across 3 cascade events.**

## CI guard

`scripts/test-ai-usage-instrumentation.mjs` (this commit) reads each AI route file and asserts whether `recordAiUsage` is called. Today the guard is INFORMATIONAL — it lists the gap state but doesn't fail CI. Once batch 1 lands the guard's expected list of "instrumented" ops grows; once all 10 are instrumented the guard becomes a regression-only check (fail if a route stops calling it).

The guard's WIRED list is the SSOT — adding a route to the list means the code change must accompany it, otherwise the guard's cross-check fails.
