#!/usr/bin/env node
// scripts/run-all-tests.mjs
//
// Unified test runner — spawns each of the repo's plain-Node test harnesses
// in sequence, streams their output as they run, parses the "X passed, Y
// failed" summary line out of each, aggregates the totals, and exits
// non-zero if any suite failed or couldn't be parsed.
//
// Why this exists:
//   The repo has three independent `test-*.mjs` harnesses (one per
//   subsystem: pdf-tools, geo-router, geo-waitlist). They share the
//   same plain `assert()` + `pass/fail` counter idiom but each stands
//   alone — there's no Jest/Vitest driver, and no `"test"` script in
//   package.json. That's fine locally, but in practice it means:
//     1. Developers have to remember the full chain
//        `node scripts/test-pdf-tools.mjs && node scripts/test-geo-router.mjs
//        && node scripts/test-geo-waitlist.mjs` — easy to forget one.
//     2. CI (when it lands) has no canonical entrypoint — any GH Action
//        authored against this repo would have to either hard-code the
//        same chain or duplicate it as three matrix jobs.
//     3. There's no single "is the repo green?" command for pre-push
//        sanity checks.
//   This runner fixes all three: `npm test` (once wired into
//   package.json) runs everything and returns a single verdict.
//
// Design choices:
//   - Sequential, not parallel. Each harness is I/O-light and CPU-light;
//     wall-clock benefit from parallelism is small, and mixing three
//     harnesses' output streams would make failures painful to read.
//   - Stream output live via child.stdout/stderr piping — preserves the
//     "you see what's happening as it happens" feel, same as running the
//     harness directly.
//   - Also buffer stdout so we can regex out the summary line once the
//     child closes. The regex matches the common tail — `(\d+) passed,
//     (\d+) failed` — which each harness prints (with slight prefix
//     variation: plain in pdf-tools, "Geo-router tests: …" / "Geo-waitlist
//     tests: …" in the geo suites). Anchoring on the common tail means
//     adding a 4th harness just needs the same summary idiom, not
//     runner edits.
//   - Exit code 1 on any suite failure OR parse miss — "couldn't tell"
//     is a failure, not a pass. This catches the case where a harness
//     crashes before emitting its summary line.
//   - Zero dependencies — stdlib only, same posture as the harnesses
//     themselves. Keeps `npm test` fast and offline-safe.

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Suites are run in the order they're declared here. Ordering note:
//   - pdf-tools first because it exercises the `pdf-lib` / `@cantoo/pdf-lib`
//     native crypto path; if a dependency upgrade breaks decryption, you
//     want to see that blow up before the pure-logic suites (which would
//     otherwise mask the noise).
//   - geo-router second — pure-logic, fastest, most likely to fail after
//     a data-table edit (TIER_1 / TIER_2 / TIER_3 changes).
//   - geo-waitlist last — it reads source files off disk and spot-checks
//     coverage, so it's the most sensitive to unrelated refactors.
//
// If you add a new harness:
//   1. Drop it in scripts/ following the `test-*.mjs` naming convention.
//   2. Make sure its final line prints `N passed, M failed` (rest of the
//      line can be anything — our regex only anchors on that tail).
//   3. Add an entry here.
const SUITES = [
  { name: "pdf-tools", file: "test-pdf-tools.mjs" },
  { name: "geo-router", file: "test-geo-router.mjs" },
  { name: "geo-waitlist", file: "test-geo-waitlist.mjs" },
  // dual-rail-routing pins Task #20 / Phase C item #1 — the checkout
  // server action's wiring of the pure geo-router decision function
  // into the real request path. Covers: checkout-actions.ts imports
  // routeCheckoutByCountry + readCountryHeader, CreateCheckoutResult
  // error union includes the three new geo error codes (geo_deferred
  // for Tier 2, geo_blocked for Tier 3, geo_unknown for CF "XX"/"T1"/
  // missing) alongside the pre-existing non-geo codes (no extras, no
  // missing), every decision.action branch is handled, the route
  // branch threads decision.rail + decision.currency into
  // selectProvider, packAmountMinor + USD_TO_INR_RATE exist on
  // lib/pricing and are used in checkout-actions to pick paise vs.
  // cents, both razorpay and paddle rows remain env-gated in the
  // registry (razorpay supports INR, paddle USD-only so the registry
  // filter rejects an IN→paddle override), payments.metadata carries
  // the route audit trail (routeCountry/routeRail/routeCurrency/
  // routeOverrode), previewRouteDecision is exported as a server
  // action for pre-Buy UI affordances, and no app/ pages import the
  // router directly (it stays payments-internal). Placed adjacent to
  // the geo-router/geo-waitlist pair because this suite is the
  // consumer of the decision function those two harnesses pin —
  // a refactor of routeCheckoutByCountry's signature surfaces here
  // at the right granularity instead of as a confusing checkout
  // regression miles away in the admin-dashboard suite.
  { name: "dual-rail-routing", file: "test-dual-rail-routing.mjs" },
  // ai-usage pins the Phase A1 `ai_usage` per-call audit contract: the
  // 0005 migration SQL, the Drizzle schema declaration, the write-path
  // helper, and the recordAiUsage() call-sites in the chat + summarize
  // routes. Regressions here would silently break provider-cost auditing.
  { name: "ai-usage", file: "test-ai-usage.mjs" },
  // chat-context-cap pins the Phase A2 token-cap contract (MASTER_PLAN
  // §7 gate #5 + §4 D4): 20k input tokens for chat_turn, 100k for
  // summarize. Locks the char-based estimator shape, the route's
  // 413 `context_too_large` branch, and the refund-before-413 contract.
  { name: "chat-context-cap", file: "test-chat-context-cap.mjs" },
  // ai-router pins the Phase A2 / MASTER_PLAN §7 gate #6 per-op routing
  // contract: the AIOp set, ROUTING_POLICY primary+fallback for every op,
  // OP_REQUIRED_CAPABILITY mapping, OP_ENV_VAR names, the Gemini adapter
  // shape + registry wiring, and the call-site refactor that moved every
  // lib/ai/*.ts subsystem (ocr, translate, summarize, compare) and the
  // chat route from selectProvider() to router.route(op, …). Placed
  // before dev-hooks so that a router regression is surfaced as a
  // subsystem failure rather than as a tooling failure.
  { name: "ai-router", file: "test-router.mjs" },
  // ai-evals pins Task #14 — the Phase A golden-set eval harness
  // scaffold + per-op quality floor. Covers: migration 0011 contract
  // (ai_eval_runs table + 3 indexes), Drizzle schema parity, the
  // lib/ai/eval/{types,rubric,golden-set,runner}.ts module surface,
  // rubric primitive behaviour via dynamic import, golden-set
  // well-formedness (unique (op,id) pairs, diverse rubric kinds,
  // must-cover translate + summarize since those are the Task #4/#11
  // regression targets), runner export contract including
  // PROMPT_BUILDERS coverage for every op with fixtures, and the
  // scripts/run-ai-evals.mjs CLI shell. Placed right after ai-router
  // because runner.ts layers directly on route(op, ...) + the
  // registry adapter surface — a router export removal breaks both,
  // and this harness surfaces "runner cannot build ChatInput for op X"
  // at the right granularity.
  { name: "ai-evals", file: "test-ai-evals.mjs" },
  // health-ai pins Task #18 (code-side) — the /api/health ai.{configured,
  // providers, defaults} block. Covers: import of the router+registry
  // introspection helpers, probeAi() try/catch degrade path, response-body
  // wiring, DB-gated 200/503 posture (AI state never flips `ok`), sibling
  // posture with /api/payments/probe (no-store cache, no SDK imports, no
  // env-var value echoes). Placed right after ai-router because it layers
  // on top of the same router surface — a router export removal breaks
  // both, and test-health-ai pins exactly that surface (currentPolicySnapshot
  // + AIOp type export + listConfiguredProviderIds) so the failure shows
  // up at the right granularity.
  { name: "health-ai", file: "test-health-ai.mjs" },
  // ai-margin-rollup pins Task #22 / MASTER_PLAN §7 gate #7 — the Phase
  // A4 daily margin rollup cron + 7-day green streak metric. Covers:
  // migration 0006 column + index contract, Drizzle schema alignment,
  // the lib/ai/margin-rollup.ts public surface (constants, pure math,
  // streak semantics, Slack emitter gating), and the cron route's
  // auth/backfill shape. Placed right after health-ai because it
  // layers on the same ai_usage schema the Phase A1 suite pins — a
  // column rename in ai_usage breaks both, and this harness pins the
  // aggregate-side consumer of those columns.
  { name: "ai-margin-rollup", file: "test-ai-margin-rollup.mjs" },
  // net-margin-rollup pins Task #17 / Phase B /3 — the "finishing
  // touches" that turn the Phase A gross-margin rollup into a real
  // business net-margin rollup. Covers: migration 0013 contract
  // (three nullable bigint columns added to ai_daily_margin —
  // infra_cost_per_call_micros, refund_reserve_micros,
  // breakage_revenue_micros — additive-only, no DROP/MODIFY, no new
  // index), Drizzle schema parity (same three fields declared as
  // bigint({ mode: "number" }) without .notNull(), existing unique +
  // three indexes unchanged), lib/ai/margin-rollup.ts public surface
  // (env-keyed INFRA_MONTHLY_USD_MICROS / REFUND_RESERVE_BPS /
  // BREAKAGE_RECOGNITION_MONTHS constants with parseIntEnv fallback +
  // warn-on-misconfig, BREAKAGE_SYNTHETIC_SLICE triplet pinning
  // provider_id='system'/model='breakage'/operation='breakage',
  // computeInfraCostPerCallMicros using (monthly/30)/priorCallCount
  // with same-day fallback and zero-divisor short-circuit,
  // computeBreakageRevenueMicros using SUM(delta)/MAX(created_at)/
  // current_balance>0/last_activity<cutoff with REFERENCE_USD_MICROS_
  // PER_CREDIT conversion), runDailyRollup wiring (SliceReport widened
  // with three new nullable fields, infra rate computed once per day
  // outside the slice loop, per-slice reserve = Math.floor(revenue *
  // BPS / 10_000), insertValues spreads all three new columns, upsert
  // sets all three via VALUES(), breakage gated on aggRows.length > 0
  // so empty days still stop the green streak, synthetic breakage
  // slice pinned at margin_bps=10_000/floor_bps=0/is_green=1/infra+
  // reserve=null, real slices carry breakageRevenueMicros=null, try/
  // catch wraps both helpers as non-fatal), and cross-file invariants
  // (every column name appears in migration + schema + rollup, three
  // layers in lockstep — same refactor-trap guard as Task #15). Placed
  // right after ai-margin-rollup because the two suites form a pair:
  // ai-margin-rollup pins the Phase A gross-margin write path, and
  // net-margin-rollup pins the Phase B net-margin extensions — a
  // regression in the Phase A surface (callCount aggregation,
  // SliceReport shape, upsert call-site) typically breaks both, and
  // surfacing as "net-margin-rollup" vs "ai-margin-rollup" gives the
  // right granularity when debugging which side broke.
  { name: "net-margin-rollup", file: "test-net-margin-rollup.mjs" },
  // admin-margin pins Task #22's READ side — the /api/admin/margin
  // endpoint and its supporting helpers (clampAdminDays,
  // parseAdminEmails, isAdminEmail, getAdminMarginSummary). Forms a
  // write/read pair with the ai-margin-rollup suite above: a regression
  // in the cron surfaces as "ai-margin-rollup", a regression in the
  // dashboard endpoint or admin-auth gating surfaces as "admin-margin".
  // Placed here rather than next to the other admin routes (none exist
  // yet — this is the first) so the two margin suites sit together and
  // share their rationale at review time.
  { name: "admin-margin", file: "test-admin-margin.mjs" },
  // admin-dashboard pins Task #18 — the Phase B /admin/* surface (14
  // pages). Complements admin-margin above: admin-margin pins the
  // JSON endpoint + the standalone /app/admin/margin page (the Phase
  // A7 scaffold), and admin-dashboard pins the 14-page cluster under
  // app/admin/* + the shared layout gate (lib/admin/guard.ts
  // requireAdmin → notFound, not 403 — we never advertise the admin
  // surface to non-admins) + the shared UI primitives
  // (components/admin/ui.tsx: StatCard / ErrorBanner / Th / Td /
  // DayPicker / clampDays / SectionTitle / tableStyle) + the 12
  // aggregator queries (lib/admin/queries.ts: overview / revenue /
  // costs / margin / users list / user detail / ops / providers /
  // transactions / credits / webhook logs / deploy snapshot) + the
  // formatting helpers (lib/admin/format.ts) + the PII-masking
  // posture (list pages mask email, detail page does not). Placed
  // right after admin-margin so the two admin suites sit together at
  // review time — a refactor that renames an export on queries.ts or
  // guard.ts typically breaks both harnesses, and surfacing as
  // "admin-margin" vs "admin-dashboard" gives the right granularity
  // when debugging which side broke.
  { name: "admin-dashboard", file: "test-admin-dashboard.mjs" },
  // admin-phase-c pins Task #21 — the Phase C admin surfaces that
  // sit in the Money section alongside the 14-page Phase B cluster:
  // /admin/refunds (refund rate in bps against gross), /admin/chargebacks
  // (raw webhook_events firehose with an ingestion-gap banner until the
  // Paddle adapter's action!="refund" skip is closed in Task #22),
  // /admin/fx (USD↔INR slippage on the Razorpay IN rail; USD-only rows
  // excluded via isNotNull(fx_rate_used)), and /admin/tax (MoR vs
  // forward vs RCM split driving the GSTR-1 / GSTR-3B input, with soft
  // invariant violation banners for MoR-remittable≠0 and
  // forward-remittable≠collected). Covers: query-layer exports
  // (getRefundsSummary / getChargebacksSummary / getFxSnapshot /
  // getTaxSnapshot all returning AdminQueryResult<T>), the refund-rate
  // formula (|refunded_net|/captured_gross, reason='refund' numerator
  // vs reason='purchase' + gross_charge_micros IS NOT NULL denominator,
  // floored at 0 when capturedGross=0, rendered via bpsToPercent on the
  // page), the JSON path filter for chargebacks ($.data.action =
  // 'chargeback' via portable JSON_UNQUOTE(JSON_EXTRACT)), the tax
  // invariants (keptMicros = collected − remittable, NULL treatment
  // coalesced to 'unknown' so legacy rows don't vanish), per-page
  // contracts (force-dynamic + nodejs + default export + no duplicate
  // requireAdmin since layout gates), wiring (clampDays + DayPicker
  // base matches href, errors surfaced via ErrorBanner not thrown),
  // chargebacks banner keyed off data.ingestionGap with explicit Task
  // #22 + action!="refund" references, and NAV registration in
  // app/admin/layout.tsx. Placed directly after admin-dashboard so the
  // Phase B 14-page and Phase C 4-page clusters sit together at review
  // time — a refactor of the shared UI primitives
  // (components/admin/ui.tsx) or the shared format helpers
  // (lib/admin/format.ts) typically breaks both, and splitting the
  // harness keeps "admin-dashboard" vs "admin-phase-c" as the right
  // failure granularity.
  { name: "admin-phase-c", file: "test-admin-phase-c.mjs" },
  // admin-phase-d pins Task #25 — the 5-page Phase D admin cluster
  // (plans / promos / compliance / fraud / rate-limits). Forms a
  // trilogy with admin-dashboard (Phase B, 14 pages) + admin-phase-c
  // (Phase C, 4 pages). Covers: the lib/admin/phase-d-queries.ts
  // module surface (PhaseDQueryResult<T> envelope mirroring queries.ts'
  // AdminQueryResult, FraudSignalsRow / FraudSignalsSnapshot,
  // RateLimitOverrideRow / RateLimitsSnapshot, SubprocessorRow, the
  // two async query functions getFraudSignals + getRateLimitOverrides,
  // plus the three static constant exports SUBPROCESSORS /
  // DPDP_COVERAGE / GDPR_COVERAGE and the re-export of
  // DEFAULT_DAILY_COST_CAP_MICROS from lib/ai/rate-limits), the two
  // Drizzle query shapes (JSON_UNQUOTE(JSON_EXTRACT(rawPayload,
  // '$.data.action')) IN (...) across the 5 dispute action strings
  // for the chargeback/dispute velocity signal, user_rate_limits
  // cap=0 union for the hard-block signal, Map-based dedup keyed on
  // userId, sort order disputeCount desc then isHardBlocked asc for
  // fraud; updatedAt desc with email LEFT JOIN from users for rate-
  // limits; env-vs-compiled-in classification via
  // resolveDailyCapMicros(null) for the globalDefault), the 5 static
  // constants' content (the 7 subprocessors matching /dpa's public
  // disclosure, the 8 DPDP sections s. 6(3)/8(10)/9/11/12/13/14/16,
  // the 6 GDPR / ePrivacy / EDPB / ICO refs), each of the 5 per-page
  // contracts (force-dynamic + nodejs runtime + default export + no
  // duplicate requireAdmin since layout gates), the page-to-module
  // wiring (plans→lib/pricing for CREDIT_PACKS + AI_OPERATION_COSTS +
  // USD_TO_INR_RATE + packAmountMinor, promos→Task #27 placeholder
  // reference, compliance→legal-docs + phase-d-queries,
  // fraud→getFraudSignals + DayPicker + clampDays + ErrorBanner,
  // rate-limits→getRateLimitOverrides + DEFAULT_DAILY_COST_CAP_MICROS),
  // and the 5 NAV entries registered in app/admin/layout.tsx (Pricing
  // section introduced for Plans + Promos because those are "what do
  // we charge?" questions distinct from Money's "what landed?", Fraud
  // and Rate limits in Ops, Compliance in Platform). Placed directly
  // after admin-phase-c so the admin-dashboard (Phase B) +
  // admin-phase-c (Phase C) + admin-phase-d (Phase D) trilogy sits
  // together at review time — a refactor of the shared UI primitives
  // (components/admin/ui.tsx) or format helpers (lib/admin/format.ts)
  // typically breaks all three, and splitting the harness keeps
  // "admin-dashboard" vs "admin-phase-c" vs "admin-phase-d" as the
  // right failure granularity rather than one mega-suite.
  { name: "admin-phase-d", file: "test-admin-phase-d.mjs" },
  // user-dashboard-v2 pins Task #19 — the Phase B /app/app user-facing
  // surface that complements the admin dashboard. Where admin-dashboard
  // proves "admin can see cost/margin/MoR splits", this suite proves
  // "users CANNOT". Three walls are enforced:
  //   (A) PII wall: every lib/user/queries.ts export takes userId as first
  //       positional arg; every page-level consumer derives it from auth()
  //       and never from searchParams/params/props.
  //   (B) Cost/margin/MoR-split wall: the column name set
  //       {cost_micros, net_revenue_micros, processor_fee_micros,
  //        tax_remittable_micros, fx_rate_used, fx_slippage_micros,
  //        infra_amortized_*, refund_reserve_*, gross_charge_micros}
  //       (in both snake and camel case) is forbidden across lib/user/**
  //       AND app/app/**/page.tsx. A regression that leaks a cost column
  //       into a user page is exactly the kind of thing that doesn't
  //       crash at runtime but does open an angry email thread.
  //   (C) Surface wall: no app/app page imports @/lib/admin/* or
  //       @/components/admin/* — those primitives are admin-only.
  // Placed adjacent to admin-dashboard because the two harnesses test
  // opposite sides of the same wall, and a refactor of the ledger/usage
  // projection touches both.
  { name: "user-dashboard-v2", file: "test-user-dashboard-v2.mjs" },
  // prompt-safety pins Task #26 / PLAN_GAP_ANALYSIS SEV-0 — the
  // defense-in-depth layer against prompt injection on PDF→AI flows.
  // Covers: the lib/ai/prompt-safety.ts module contract (exports,
  // PromptSafetyOp superset of AIOp, XML sentinel constants), wrap/
  // escape semantics (source-label sanitization, U+200B break-out escape
  // for tags + legacy === markers), safety-preamble coverage of every
  // op (ocr/translate/chat/summarize/compare/generate/sign/rewrite/
  // table/redact), jailbreak pattern library (13 patterns spanning
  // high/medium/low severity) with positive/negative cases, and
  // call-site integration (every lib/ai/*.ts op module + the chat
  // route imports from prompt-safety and actually wraps user input).
  // Placed after ai-margin-rollup because it pins the same lib/ai/*.ts
  // surface — a file-level rewrite (e.g. deleting summarize.ts) breaks
  // both, and this harness surfaces "prompt-safety call-site missing"
  // at the right granularity.
  { name: "prompt-safety", file: "test-prompt-safety.mjs" },
  // prompt-registry pins Task #26 / Phase E — the prompt version registry
  // + A/B experiment infra that layers on top of the Phase A1 ai_usage
  // audit table. Forms a pair with prompt-safety: prompt-safety pins the
  // INPUT-side defense (injection preamble + user-input wrapping) and
  // prompt-registry pins the AUDIT side (which variant ran, under which
  // experiment, at what per-call infra cost). Covers: migration 0014
  // shape (additive ALTER, `prompt_version varchar(32) NULL` +
  // `experiment_id varchar(64) NULL` appended AFTER `response_truncated`,
  // no DEFAULT / no index / no DROP), Drizzle schema parity on the two
  // new ai_usage columns with matching widths, lib/ai/usage.ts write-
  // path extension (RecordAiUsageInput gains both fields as string |
  // null, 32/64 char clamps at persistence, RECORDING_ENABLED null
  // override still fires), the full lib/ai/prompts/registry.ts module
  // surface (PromptOp / PromptVersion / Experiment / ResolvedPrompt /
  // OpRegistryState types, PROMPT_REGISTRY + EXPERIMENTS + RECORDING_
  // ENABLED constants, stableHashToBps djb2 shape, resolvePromptVersion
  // with enabled filter + 'v1' fallback + experiment routing,
  // listAllPromptVersions / listActiveExperiments introspection helpers
  // for /admin/prompts, classifyOpState four-state enum
  // single/experiment/misconfigured/empty, __PROMPT_REGISTRY_INTERNALS
  // test hook), content invariants (all 10 AIOp entries present in
  // PROMPT_REGISTRY so a future op rename shows up here instead of
  // silently falling through to 'v1'), summarize op + route wire-up
  // (module imports resolvePromptVersion, SummarizeInput gains userId,
  // SummarizeResult + BatchPlan + BatchResult all carry promptVersion +
  // experimentId, both success and error recordAiUsage call-sites thread
  // the audit pair), batch wire-up (submit captures into opPayload at
  // plan time, finalize reads back with ?? null legacy fallback so
  // pre-0014 batches don't throw), /admin/prompts page contract
  // (force-dynamic + nodejs runtime + default export, consumes
  // PROMPT_REGISTRY + classifyOpState + phase-e-queries, red banner on
  // any op in `misconfigured` state, yellow banner when RECORDING_
  // ENABLED=false), NAV registration in app/admin/layout.tsx under Ops,
  // and lib/admin/phase-e-queries.ts contract (PhaseEQueryResult<T>
  // envelope mirroring PhaseDQueryResult / AdminQueryResult,
  // server-only pin, isNotNull(prompt_version) rollup filter so
  // pre-registry rows don't skew per-variant percentages,
  // groupBy(operation, promptVersion, experimentId) 3-tuple). Placed
  // right after prompt-safety because the two suites pin opposite
  // sides of the same module cluster (lib/ai/prompts/*) — a file-level
  // rewrite to lib/ai/prompts/registry.ts or a rename of PromptOp
  // breaks both, and splitting the harness keeps "prompt-safety" vs
  // "prompt-registry" as the right failure granularity when debugging
  // which side (input defense vs audit trail) broke.
  { name: "prompt-registry", file: "test-prompt-registry.mjs" },
  // output-moderation pins Task #28 — the OUTPUT-side defense-in-depth
  // companion to prompt-safety's input-side defense. Covers: the
  // lib/ai/output-moderation.ts module contract (ModerationOp aliased
  // to PromptSafetyOp so the two op sets stay in lockstep,
  // SEVERITY_RANK ladder, moderateOutput/assertOutputSafe/
  // OutputModerationBlockedError exports), the pattern library (10
  // secret subtypes, 5 PII subtypes, 3 jailbreak-echo subtypes with
  // correct severities), positive/negative runtime checks for
  // critical-severity secrets and PII, severity aggregation +
  // redactSample masking, and call-site integration: all 9
  // non-streaming op modules (summarize/translate/compare/generate/
  // rewrite/table/redact/sign/ocr) import moderateOutput +
  // assertOutputSafe and block on critical; the chat route calls
  // moderateOutput advisory-only (console.warn, no
  // assertOutputSafe) because deltas are already on the wire. Placed
  // right after prompt-safety because the two form a defense-in-depth
  // pair and a regression in either module surface typically breaks
  // both harnesses — surfacing as "output-moderation" vs "prompt-safety"
  // gives the right granularity when debugging which side broke.
  { name: "output-moderation", file: "test-output-moderation.mjs" },
  // dev-hooks pins the pre-push hook's contract + DEV_SETUP.md install
  // instructions. Ordered last because it's not a subsystem gate —
  // it's a self-consistency gate on the repo's own dev tooling. If
  // somebody strips the executable bit off .githooks/pre-push or
  // rewires the hook to call something other than `npm test`, this
  // fails here rather than silently at push time.
  { name: "dev-hooks", file: "test-dev-hooks.mjs" },
  // credit-ledger-financials pins Phase B / Task #15 — the 12 new
  // financial columns on credit_ledger (fee / tax / FX / net_revenue /
  // provider / data_source / card_fingerprint). Covers: migration 0012
  // shape (additive-only, DEFAULT NULL across the board, no DROP/MODIFY
  // in executable SQL), Drizzle schema pins (decimal helper imported,
  // every column declared with matching drizzle-orm helper + length/
  // precision), lib/payments/ledger.ts wiring (LedgerFinancials type,
  // financials? on GrantCreditsInput, fxRateUsed persisted as String
  // to preserve decimal(18,8) precision, every column spread via
  // `?? null`), and a cross-file invariant that every column name
  // appears in all three layers (migration ✓ schema ✓ ledger.ts ✓) —
  // that's the refactor trap the prototype shipped net=0 against when
  // a column was added to the migration but left out of the write path.
  // Placed last alongside dev-hooks because this harness is pure
  // static-parse — no route imports — and the financial columns are
  // orthogonal to every AI-cluster suite above.
  {
    name: "credit-ledger-financials",
    file: "test-credit-ledger-financials.mjs",
  },
  // paddle-webhook-financials pins Phase B / Task #16 — the Paddle
  // webhook handler actually populating the credit_ledger financial
  // columns that Task #15 scaffolded. Covers: types.ts discriminated-
  // union contract (LedgerFinancials lives here so adapters can build
  // the payload without a circular import; payment_captured + refund
  // variants expose `financials?`), paddle.ts transaction.completed
  // branch (PaddleTransactionEntity declares the full details.totals
  // subtree + payments[].payment_method_id; buildPaddleCaptured-
  // Financials bakes in the Paddle-rail invariants provider="paddle"/
  // taxTreatment="mor"/dataSource="webhook" and pulls every monetary
  // field; normalize() attaches financials to the returned event),
  // paddle.ts adjustment.created refund branch (symmetric negative-
  // signed builder that leaves `provider` undefined so the ledger
  // fills "refund_reversal"), ledger.ts call-sites (handleCaptured
  // threads financials ONLY into the base grant — the bonus row
  // carries NULL financials by design to avoid double-counting in
  // /admin/margin aggregates; handleRefund spreads event.financials
  // under an explicit `provider: "refund_reversal"` override), and
  // cross-file invariants (v1 leaves fxRateUsed / fxSlippageMicros
  // undefined — Task #17 scope). Placed right after credit-ledger-
  // financials because the two suites form a pair: Task #15's columns
  // are worthless without Task #16's write path, and a Task #15
  // regression typically breaks Task #16 too.
  {
    name: "paddle-webhook-financials",
    file: "test-paddle-webhook-financials.mjs",
  },
  // razorpay-handoff pins the property-name contract between the
  // Razorpay adapter's CheckoutSession.publicConfig and the
  // client-side CheckoutButton modal launch. Why a dedicated suite:
  // on 2026-04-22 a paying user hit "Buy pack" and Razorpay's hosted
  // modal threw "Authentication key was missing during initialization"
  // because the adapter wrote `publicConfig: { keyId: ... }` while
  // the client read `.key`. publicConfig is typed as
  // Record<string,string> (the union has to absorb Paddle's
  // clientToken/environment/sellerId), so TypeScript can't catch the
  // drift. These regex pins make the contract explicit on both sides
  // and on the env-source linkage (process.env.RAZORPAY_KEY_ID →
  // registry.ts → adapter constructor → publicConfig.key → client).
  // 7 assertions, runs in <100ms.
  {
    name: "razorpay-handoff",
    file: "test-razorpay-handoff.mjs",
  },
  // razorpay-retry-promotion pins Task #21 — lib/payments/ledger.ts
  // handleCaptured MUST promote status from pending OR failed to
  // captured (retry flow: card fails, user pivots to netbanking, same
  // order captures on a different pay_id). Production evidence from
  // webhook_events raw_payloads showed 2/7 payments stuck in status=
  // "failed" despite credits being granted correctly (idempotency key
  // on the grant path means credits never went wrong; only the
  // payments.status field + provider_ref were wrong, which broke the
  // /app/billing "Recent payments" UI and Razorpay-side reconciliation
  // of pay_id → our DB row for dispute/chargeback lookups). Static-
  // analysis tests (regex against ledger.ts) — 14 assertions covering
  // the status-transition guard, providerRef update, metadata-merge
  // preservation of route-decision fields, priorAttempts entry shape,
  // the MIRROR property that handleFailed still only demotes pending
  // (never captured), and idempotency-of-credit-grant invariants.
  {
    name: "razorpay-retry-promotion",
    file: "test-razorpay-retry-promotion.mjs",
  },
  // invoicing pins Task #23 / Phase D — the receipt/invoice PDF generator
  // + admin tax CSV export. Covers: lib/invoicing/gstin.ts module surface
  // (INDIAN_STATE_CODES 01–38, validateGstin with Mod-36 checksum,
  // computeGstinCheckDigit determinism + round-trip, classifyGst branch
  // table spanning export / intra_state / inter_state / reverse_charge,
  // describeClassification), deriveInvoiceNumber FY boundary (IN-FY runs
  // Apr 1 → Mar 31, so Jan 2026 → INV-2025-, Apr 1 2026 → INV-2026-,
  // Mar 31 2026 → INV-2025-), lib/invoicing/seller.ts env-driven
  // SellerIdentity (all 7 INVOICE_SELLER_* vars with "Rajasekar Selvam"
  // / "pdfcraftai" / "998313" defaults), lib/invoicing/assemble.ts
  // buildTaxBreakdown (Math.round(micros/10_000) minor conversion,
  // Math.ceil(taxMinor/2) for CGST so CGST absorbs odd paisa per CA
  // convention), lib/invoicing/renderer.ts purity (no DB reads, no
  // env var reads, no network I/O — reads enforced by static grep
  // assertions) + pdf-lib dependency + A4 page 595.28×841.89 pt +
  // "pending registration" fallback when seller.gstin null + branch-
  // specific footer compliance lines (export → LUT, reverse_charge →
  // recipient-pays, registered → remit, pre-reg → below threshold),
  // app/api/invoices/[paymentId]/route.ts authz (401 on no session,
  // 404 — NOT 403 — on mismatched userId so row existence doesn't
  // leak, 409 on pre-capture status) + Content-Disposition attachment
  // + Cache-Control private+no-store + X-Content-Type-Options nosniff
  // + runtime=nodejs pin, app/api/admin/tax/export.csv/route.ts
  // requireAdmin gate + clampDays 1–90 + four-section CSV (HEADLINE /
  // BY_TREATMENT / BY_CURRENCY / DAILY) + CRLF for Excel, and page
  // wiring (app/app/receipts/page.tsx links to /api/invoices/${row.id}
  // with "Download PDF" text — no more mailto: fallback; app/admin/tax
  // /page.tsx adds "Download CSV" anchor next to DayPicker pointing at
  // /api/admin/tax/export.csv?days=${days}). Placed right after paddle-
  // webhook-financials because the invoice renderer consumes the
  // credit_ledger tax columns that Task #15 / #16 populate — a refactor
  // that renames tax_collected_micros / tax_treatment / tax_remittable_
  // micros breaks all three suites in lockstep, and surfacing as
  // "invoicing" vs "credit-ledger-financials" vs "paddle-webhook-
  // financials" gives the right granularity when debugging which
  // layer (schema vs write-path vs render-path) broke.
  {
    name: "invoicing",
    file: "test-invoicing.mjs",
  },
  // compliance pins Task #24 / Phase D — the cookie consent + DPDP
  // Act 2023 + GDPR disclosure surface. Covers: lib/compliance/
  // consent.ts module surface (CONSENT_COOKIE_NAME pinned to
  // "pdfcraft_consent", CONSENT_COOKIE_MAX_AGE_SECONDS = 60*60*24*365,
  // three-level ConsentLevel union, parseConsent + analyticsAllowed
  // + regionRequiresConsent exports, CONSENT_REQUIRED_COUNTRIES
  // covers all EU27 + EEA (IS/LI/NO) + GB + IN, CF sentinels "XX" /
  // "T1" / "" fall through to required=true as safer default,
  // analyticsAllowed returns level === "all" only so "essential"
  // (reject) and "none" (no choice yet) both block), components/
  // compliance/CookieConsent.tsx client banner (begins with
  // "use client", imports shared constants from @/lib/compliance/
  // consent rather than copy-pasting string literals, three buttons
  // Accept all / Essential only / Customize, writes first-party
  // cookie with Max-Age + Path=/ + SameSite=Lax + Secure (HTTPS-
  // gated), calls window.location.reload() so the server re-
  // resolves the analytics gate — router.refresh() is NOT enough
  // because it doesn't re-run <Script> tags, role="dialog" +
  // aria-labelledby/describedby for a11y), components/compliance/
  // ResetConsentButton.tsx withdrawal (also "use client", imports
  // CONSENT_COOKIE_NAME, deletes the cookie via Max-Age=0 rather
  // than overwriting to "essential" — GDPR Art. 7(3) + DPDP s. 6(3)
  // require withdrawal to restore the un-chosen state so the user
  // can re-evaluate from scratch), app/layout.tsx consent gate
  // (imports cookies from next/headers + analyticsAllowed +
  // parseConsent + CONSENT_COOKIE_NAME + CookieConsent, reads the
  // cookie via cookies().get(CONSENT_COOKIE_NAME), the GA4 + Clarity
  // <Script> tags are now wrapped in {analyticsOn ? … : null} so
  // they don't emit until consent is given, <CookieConsent
  // initialLevel={...} /> is rendered unconditionally because the
  // component self-hides), app/cookies/page.tsx full policy (imports
  // ResetConsentButton, lists pdfcraft_consent + authjs.session-
  // token + _ga + _clck/_clsk, cites GDPR Art. 7(3) + DPDP s. 6(3)
  // + s. 8(10) Grievance Officer), lib/legal-docs.ts DPDP expansion
  // (Privacy has "Your rights under the DPDP Act" citing s. 11/12/
  // 13/14/6(3)/8(10), Children section citing s. 9, cross-border
  // under s. 16, cookies line discloses consent-gating; DPA names
  // Data Fiduciary / Data Processor roles and adds DPDP Consent
  // Manager forward-looking note; Grievance Officer surfaced at
  // least twice). Placed right after invoicing because Task #23
  // (invoicing) and Task #24 (compliance) together form the Phase D
  // "legal/financial paperwork" band — a refactor of LEGAL_DOCS or
  // the layout wiring typically cascades through both, and
  // surfacing as "compliance" vs "invoicing" gives the right
  // granularity when debugging which side broke.
  {
    name: "compliance",
    file: "test-compliance.mjs",
  },
  // degradation-ux pins Task #22 part 2 — the shared AI-degradation
  // classifier (lib/ai/degradation.ts) + the nine /api/ai/* tool
  // components' call-sites + the dunning scaffold
  // (lib/payments/dunning.ts). Forms a pair with admin-phase-c which
  // pins Task #22 part 1 (chargeback ingestion + /admin/chargebacks
  // drift banner). The two suites together pin the full Phase D
  // "Degradation UX + self-serve refund UI + dunning" surface: a
  // regression in the shared classifier (say, a kind enum rename)
  // breaks one harness, a regression in a single tool's call-site
  // (somebody re-adds the stale 503 copy) breaks only this one, and
  // a regression in the chargeback adapter surfaces in admin-phase-c.
  // Placed last alongside the paddle-webhook-financials + credit-
  // ledger-financials + dev-hooks cluster because this harness is
  // pure static-parse (no route imports, no DB) and the degradation
  // band is orthogonal to the AI + admin clusters above.
  {
    name: "degradation-ux",
    file: "test-degradation-ux.mjs",
  },
  // promos pins Task #27 — Phase E annual-prepay tier, INR pricing on the
  // user-facing grid, and promo codes end-to-end. Covers: migration 0015
  // (promo_codes + promo_redemptions tables + payments additive columns),
  // db/schema/app.ts parity, lib/pricing.ts variant surface (PackVariant,
  // ANNUAL_DISCOUNT_BPS=2000, packAmountMinor+packCreditsForVariant
  // annual branches, priceInr fields), lib/promos/resolver.ts 8-gate
  // validation ladder (isActive → startsAt → expiresAt → currency →
  // packIds → annualOnly → maxRedemptions → perUserLimit) + kind-aware
  // discount math, lib/promos/actions.ts server actions (applyPromoCode +
  // getPromoRedemptionHistory + adminCreate/DisablePromoCode), checkout-
  // actions plumbing (promo re-resolve at click time for TOCTOU, stamps
  // promo_code_id + promo_discount_micros + promo_bonus_credits + variant
  // on payments row), ledger.ts capture hook (writes promo_redemptions +
  // grants promo_bonus credits idempotent on paymentId), admin rollup
  // (getPromoCodeInventory with CASE-inside-SUM window/lifetime in one
  // query), CheckoutButton props (packVariant + promoCode + promo_invalid
  // friendly copy table), PackUpsellPanel client component (variant
  // toggle + promo input + prop-drilled grid), and page wire-up (pricing
  // uses PackUpsellPanel instead of inline grid, /app/billing renders
  // promo history card, /admin/promos renders inventory + 12-field create
  // form + disable form action). Placed last in the cluster because
  // Phase E closes out the Net Margin Roadmap and this suite is a
  // pure static-parse harness (no route imports, no DB), orthogonal to
  // every earlier suite.
  { name: "promos", file: "test-promos.mjs" },
];

/**
 * Spawn one harness, stream its output, return a structured result.
 *
 * We pipe stdout/stderr to both (a) the parent process's stdout/stderr
 * so the developer sees output in real time, and (b) an in-memory
 * buffer so we can regex the summary line out after close. This is
 * cheap — each harness outputs a few hundred lines at most.
 */
function runSuite(suite) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, suite.file);
    const child = spawn(process.execPath, [scriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
      process.stdout.write(d);
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      process.stderr.write(d);
    });

    child.on("close", (code) => {
      // Match the common tail of every harness's summary: "N passed,
      // M failed". Case-insensitive to be forgiving, and we don't
      // anchor on prefix so future harnesses can label however they
      // like ("Foo tests: 3 passed, 0 failed", "3 passed, 0 failed.",
      // etc. — all work).
      const match = stdout.match(/(\d+)\s+passed,\s+(\d+)\s+failed/i);
      const passed = match ? parseInt(match[1], 10) : NaN;
      const failed = match ? parseInt(match[2], 10) : NaN;
      resolve({
        name: suite.name,
        file: suite.file,
        exit: code ?? -1,
        passed,
        failed,
        parsed: Boolean(match),
      });
    });

    child.on("error", (err) => {
      // Process failed to spawn at all — treat as a suite failure with
      // exit -1 and no parseable counts. The aggregate step below will
      // flip the overall verdict to FAIL.
      resolve({
        name: suite.name,
        file: suite.file,
        exit: -1,
        passed: NaN,
        failed: NaN,
        parsed: false,
        spawnError: err.message,
      });
    });
  });
}

const HR = "=".repeat(72);

(async () => {
  const started = Date.now();
  const results = [];

  for (const s of SUITES) {
    console.log(`\n${HR}`);
    console.log(`  Running: ${s.name}  (scripts/${s.file})`);
    console.log(HR);
    const r = await runSuite(s);
    results.push(r);
  }

  // ----- Aggregate -----
  console.log(`\n${HR}`);
  console.log(`  Test suite summary`);
  console.log(HR);

  let totalPassed = 0;
  let totalFailed = 0;
  let anyFailed = false;

  for (const r of results) {
    const suiteOk = r.exit === 0 && r.parsed && r.failed === 0;
    const verdict = suiteOk ? "OK  " : "FAIL";
    const counts = r.parsed
      ? `${String(r.passed).padStart(3)} passed, ${String(r.failed).padStart(2)} failed`
      : `(summary unparseable)`;
    const exitBadge = r.exit === 0 ? "" : `  [exit ${r.exit}]`;
    console.log(`  [${verdict}] ${r.name.padEnd(14)}  ${counts}${exitBadge}`);

    if (Number.isFinite(r.passed)) totalPassed += r.passed;
    if (Number.isFinite(r.failed)) totalFailed += r.failed;
    if (!suiteOk) anyFailed = true;
  }

  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`  ${"-".repeat(68)}`);
  console.log(
    `  Total: ${totalPassed} passed, ${totalFailed} failed across ${results.length} suites  (${elapsedSec}s)`
  );

  if (anyFailed) {
    console.log(`\n  Result: FAIL\n`);
    process.exit(1);
  }
  console.log(`\n  Result: PASS\n`);
  process.exit(0);
})();
