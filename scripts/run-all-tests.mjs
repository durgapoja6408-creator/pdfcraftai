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
  { name: "dashboard-improvements", file: "test-dashboard-improvements.mjs" },
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
  { name: "razorpay-financials-disputes", file: "test-razorpay-financials-disputes.mjs" },
  // 2026-05-01: paddle-webhook-financials suite REMOVED. Paddle was
  // retired as a payment rail in this commit; the dedicated test
  // suite went with the adapter. credit-ledger-financials (above)
  // still covers the financial-column schema + write contract via
  // razorpay-only assertions, so the abstraction layer's coverage
  // is preserved.
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
  // tool-stats-consistency pins the TOOL_STATS invariant: every
  // marketing surface that shows "N tools / M free / K AI" reads
  // from lib/tools.ts::TOOL_STATS, never hardcodes. Before this fix,
  // adding a tool drifted 5 places across app/ and components/ (the
  // homepage said 16 tools but the pricing chip said 8, etc.). The
  // derived TOOL_STATS object + this test catch the drift at CI time.
  {
    name: "tool-stats-consistency",
    file: "test-tool-stats-consistency.mjs",
  },
  // tier1-expansion pins the 6-tool Tier-1 expansion from
  // 2026-04-24 (extract-pages, delete-pages, pdf-to-jpg,
  // extract-images, page-count, pdf-metadata). Catches registry /
  // dispatcher / LIVE_TOOL_IDS / switch-case drift that would
  // silently render a "coming soon" placeholder instead of the real
  // tool. Also pins the privacy invariant: no free Tier-1 tool may
  // fetch(/api/...) — the reassurance copy on /tool/{id} depends on
  // it.
  {
    name: "tier1-expansion",
    file: "test-tier1-expansion.mjs",
  },
  // M24 follow-up: pin TOOLS ↔ LIVE_TOOL_IDS ↔ ToolRunner switch
  // consistency. Catches the "tool registered + lit but no dispatcher
  // case" drift that would render a blank tool body. tier1-expansion
  // pins a curated 12-tool subset; this one is exhaustive.
  {
    name: "tool-runner-coverage",
    file: "test-tool-runner-coverage.mjs",
  },
  // 2026-05-01: standardization-parity guard for client-side free
  // tools. Pins the 7-hook contract (useTrackToolView + mapPdfOpError
  // + suffixedFilename + useScrollErrorIntoView + HandoffSuggestions
  // + useHandoffConsumer + useFileUrlConsumer) — every tool wired
  // into LIVE_TOOL_IDS must either inherit a shared base or wire the
  // hooks directly. Caught the jpg-to-pdf / png-to-pdf / text-to-pdf
  // 2026-05-01 partial-standardization regression that ToolRunner-
  // coverage missed (which only checks the dispatcher mapping).
  // Placed immediately after tool-runner-coverage because both
  // operate on the same surface (LIVE_TOOL_IDS ↔ ToolRunner.tsx).
  {
    name: "live-tool-standardization",
    file: "test-live-tool-standardization.mjs",
  },
  // 2026-05-01: free-tool content-coverage guard. Pins TOOL_INTROS
  // and TOOL_LONGFORMS coverage for every free tool wired into
  // LIVE_TOOL_IDS. Caught the jpg-to-pdf / png-to-pdf / text-to-pdf
  // 2026-05-01 regression where the runner shipped but the page
  // rendered without the "What you'll get" intro and without the
  // marketing longform block (use cases / how-it-works / FAQs / CTA).
  // Visually obvious next to /tool/page-count and /tool/pdf-inspector
  // which have rich content. Placed adjacent to the other LIVE_TOOL_IDS
  // surface guards.
  {
    name: "tool-content-coverage",
    file: "test-tool-content-coverage.mjs",
  },
  // 2026-05-01: paper-size naming convention guard. Locks in bare
  // "Letter" / "Legal" / "Tabloid" in user-facing copy — country-
  // prefixed forms ("US Letter" etc.) read parochially in a region-
  // agnostic product. Drift surfaced across PdfResizeTool, the new
  // ImagesToPdfTool / TextToPdfTool, 4 SEO landings, and 2 longform
  // passages. Code comments + JSDoc describing the formal spec are
  // allowed via stripCommentsAndFences before scanning.
  {
    name: "paper-size-naming",
    file: "test-paper-size-naming.mjs",
  },
  // Phase 2 (2026-04-30): functional parse-back tests for every Node-
  // runnable pdf-lib op. ~36 tests across writable ops (merge, split,
  // rotate, crop, etc.), visual editors (highlight, redact, etc.),
  // and byte-parser inspectors (fonts, links, forms, etc.). Catches
  // "op produced corrupt PDF" — the failure class that static-parse
  // and Playwright UI tests both miss. Runs via tsx because the ops
  // are TypeScript and the test imports them directly.
  {
    name: "pdf-ops",
    file: "test-pdf-ops.ts",
    runner: "npx",
    args: ["tsx"],
  },
  // Phase 5 (2026-04-30): bundle-size budget guard. Reads
  // .next/build-manifest.json + chunks dir; fails if any chunk or
  // page first-load JS regresses past budget. Skips silently if
  // .next/ doesn't exist (so local `npm test` doesn't force a build).
  // CI should run `npm run build` before this.
  {
    name: "bundle-budget",
    file: "test-bundle-budget.mjs",
  },
  // schema-drift pins Task #28 — the migration-drift boot-time guard.
  // After the errno-150 incident on 0009, we learned migrations can
  // silently fail to land on Hostinger-managed MariaDB. lib/db/schema-
  // drift.ts introspects Drizzle's schema via getTableConfig and diffs
  // against information_schema.COLUMNS; /api/health?drift=1 and
  // /admin/deploy surface the report. This static-analysis test pins
  // the module surface, the health-route wiring (gated behind ?drift=1,
  // never flips ok), and the admin-deploy inline renderer. 17
  // assertions — if a refactor breaks any hinge the guard goes silent.
  {
    name: "schema-drift",
    file: "test-schema-drift.mjs",
  },
  // billing-pending-ageout pins Task #23 — /app/billing shows "Expired"
  // (muted) for payments.status="pending" rows older than 30 min. Razorpay
  // doesn't fire webhooks for orders that never had a payment attempt;
  // the row sits at pending forever otherwise. Presentational only — the
  // DB stays pending until reconcile.ts catches up (Task #24, blocked on
  // CRON_SECRET). 11 assertions across 5 sections pinning the helper
  // shape, STATUS map entries, render-site wiring, nowMs hoisting, and
  // the invariant that quoteRefund still trusts the raw DB status.
  {
    name: "billing-pending-ageout",
    file: "test-billing-pending-ageout.mjs",
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
  // M6 (#193, 2026-04-29): static audit that every `createObjectURL`
  // call has a matching `revokeObjectURL`. The 2026-04-29 baseline run
  // counted 36 sites across components/tools + 3 in lib — all clean
  // (28 with 1:1 pairs, 8 with defensive over-revoke). This suite
  // guards against regressions where a new tool forgets to revoke.
  // Pure static parse — no DB, no fetches — always last so a leak
  // failure shows up after the heavier suites have already passed.
  { name: "objecturl-revocation", file: "test-objecturl-revocation.mjs" },
  // Every Copy button routes through the shared copyText() helper
  // (Clipboard API → execCommand fallback) — no silent-fail writeText.
  { name: "clipboard-helper", file: "test-clipboard-helper.mjs" },
  // M22 (#193, 2026-04-29): unit tests for lib/client/csv.ts. Pure
  // logic — escapeCsvField, csvRow, buildCsv. The downloadCsv helper
  // touches DOM globals so it's covered indirectly by the four
  // migrated consumer tools (PdfLinks / PdfAnnotations / PdfFonts
  // / PdfForms) plus the objecturl-revocation invariant above.
  { name: "csv-helper", file: "test-csv-helper.mjs" },
  // M1 (#193, 2026-04-29): single-page edge-case audit for the five
  // multi-page consumers of PageEditorTool. Asserts each declares
  // `multiPage`, branches applyLabel + success headline on
  // single-vs-multi page, and pluralizes count nouns correctly.
  // Catches "Apply 3 highlights on 1 pages" regressions before they
  // ship. Also verifies single-page consumers (Crop, AddTextBox)
  // don't opt into multiPage mode.
  { name: "page-editor-consumers", file: "test-page-editor-consumers.mjs" },
  // M9 (#193, 2026-04-29): tool-handoff infrastructure tests.
  // Validates that every TOOL_SUGGESTIONS source/target id exists in
  // lib/tools.ts (no broken references), that no tool suggests
  // itself, that suggestion arrays are 1–4 entries with no dupes,
  // and that handoffUrl + register/consume are exported from
  // lib/client/handoff.ts. PageEditorTool is verified to consume
  // ?handoff=<key> on mount and strip the param from the URL.
  { name: "tool-handoff", file: "test-tool-handoff.mjs" },
  // M20 (#193, 2026-04-29): retry-on-transient-failure semantics for
  // AI op fetches. Mocks global.fetch with scripted responses and
  // exercises every retry branch: 200 first try (no retry), 503→200
  // (one retry), 503→502→200 (two retries), 503×3 (returns last 503),
  // 400 (no retry on 4xx), 500 (no retry on non-transient 5xx),
  // network TypeError + recovery, network TypeError exhaustion,
  // 408 retry, and bodyFactory called per-attempt.
  { name: "fetch-ai-retry", file: "test-fetch-ai-retry.mjs" },
  // M25 (#193, 2026-04-29): unit tests for useFirstPagePreview's
  // sampleHash + LRU cache. The React surface needs jsdom (skipped),
  // but the pure-logic portions M25 added — the FNV-1a-style sample
  // hash and the LRU eviction order — are testable in pure node.
  { name: "first-page-preview-cache", file: "test-first-page-preview-cache.mjs" },
  // /tools findability v3 (2026-06-05): pure helpers behind Recently-used,
  // Favourites, typo-tolerant search, URL state, and catalog-id guards.
  { name: "tool-prefs", file: "test-tool-prefs.mjs" },
  { name: "tools-search", file: "test-tools-search.mjs" },
  { name: "tools-url", file: "test-tools-url.mjs" },
  { name: "tools-catalog-extras", file: "test-tools-catalog-extras.mjs" },
  { name: "tools-ia", file: "test-tools-ia.mjs" },
  { name: "user-favorites-foundation", file: "test-user-favorites-foundation.mjs" },
  { name: "design-system", file: "test-design-system.mjs" },
  { name: "skeleton", file: "test-skeleton.mjs" },
  // M18 (2026-05-02): every AI tool that accepts a PDF input must
  // render UploadedFilePreview on its upload card. Caught the gap
  // earlier today's audit surfaced (ai-court-order shipping without
  // suggestion-map entry was the trigger to look at the broader
  // standardization landscape). Resolves to source files via the
  // ToolRunner.tsx dynamic-import map → checks each AI tool's
  // resolved file imports UploadedFilePreview. Sister to the
  // first-page-preview-cache guard (which pins the underlying hook's
  // unit-level invariants); this one pins the per-tool consumption.
  // NO_FILE_INPUT allowlist whitelists ai-generate (no PDF input)
  // and ai-chat (separate streaming surface).
  { name: "ai-tool-preview", file: "test-ai-tool-preview.mjs" },
  // 2026-05-02: redirect-direction integrity. Catches the lurking
  // bug where a /<slug> → /tool/<id> redirect intentionally exists
  // but its destination is the OPPOSITE-direction tool from what
  // the SEO landing's tool: field declares. Caught + fixed today
  // for /markdown-to-pdf (was → /tool/pdf-to-markdown, wrong
  // direction); same pattern caught earlier for /text-to-pdf.
  // Sister to seo-pages-tool-mapping (which pins each landing's
  // tool: ref to a real tool id) and redirect-destinations (which
  // pins each redirect dest to a live route) — both pass for
  // direction-flip bugs because the dest IS a real tool and DOES
  // resolve. The bug is structural — wrong tool for the URL.
  // KNOWN_FALLBACK_REDIRECTS allowlist matches KNOWN_DEAD_REFS in
  // test-seo-pages-tool-mapping for deliberate "shipping ahead of
  // tooling" cases (Office bidirectionals → /tool/pdf-to-text).
  { name: "redirect-direction", file: "test-redirect-direction.mjs" },
  // 2026-05-02 Tier A2: download-helper adoption guard. After today's
  // sweep migrated 30 tools from hand-rolled Blob+download dance to
  // the canonical downloadBytes() helper, this guard locks the
  // migration: any tool that hand-rolls the dance fails npm test.
  // Floor on adoption count (>=30) catches the reverse regression
  // (tool migrated back to hand-rolled or download functionality
  // removed entirely).
  { name: "download-helper-adoption", file: "test-download-helper-adoption.mjs" },
  // 2026-05-02 Tier B2: pin British/Indian spelling for verbs that
  // have both forms (Analysing not Analyzing, Recognising not
  // Recognizing). Site is India-based — locale-correct copy. Allows
  // third-party UI label quotes (e.g. Acrobat's "Recognize Text"
  // menu item) since accuracy beats consistency when describing
  // someone else's product. Caught CourtOrderTool's "Analyzing…"
  // drift today; this guard prevents future ones.
  { name: "spelling-uk-in", file: "test-spelling-uk-in.mjs" },
  // 2026-04-30 a11y guard: prevents `color: var(--accent),
  // textDecoration: "none"` from being reintroduced in body-text JSX
  // contexts. Pattern was the source of 18 serious axe
  // link-in-text-block violations across 13 files in this arc; without
  // a CI guard, any future visual designer's "links look cleaner
  // without underlines" instinct would silently regress the fix until
  // the next prod axe run. Allow marker (`a11y-allowed:` in either
  // `//` line comment or `{/* */}` JSX block comment) silences false
  // positives like button-styled CTAs.
  { name: "inline-link-a11y", file: "test-inline-link-a11y.mjs" },
  // 2026-04-30 SEO guard: every `tool:` field in lib/seo-pages.ts
  // must resolve to a real `id:` in lib/tools.ts. Mismatch causes
  // SeoLandingPage to return null → Next renders the layout's
  // notFound boundary → page returns 200 OK with a "this page
  // hasn't been ported yet" body. Caught 19 dead refs in the first
  // run; KNOWN_DEAD_REFS allowlist whitelists "shipped ahead of
  // tooling" cases so the guard fires only on NEW dead refs.
  { name: "seo-pages-tool-mapping", file: "test-seo-pages-tool-mapping.mjs" },
  // 2026-04-30 SEO health guard: every slug advertised in sitemap.xml
  // must have a corresponding routable page. Curl audit found
  // **35 of 116 (30%)** non-dynamic sitemap URLs returning 404 —
  // worst possible SEO signal (soft-404, wasted crawl budget,
  // domain authority hit). KNOWN_MISSING_SEO_ROUTES allowlist tracks
  // the existing backlog; new dead routes fail the guard.
  { name: "sitemap-routes-exist", file: "test-sitemap-routes-exist.mjs" },
  // 2026-04-30 redirect health guard: every `destination:` in
  // next.config.mjs `redirects()` must resolve to a real route.
  // First run caught two pre-existing dead redirects (/tools/
  // protect-pdf + /tools/unlock-pdf both pointed at /tool/protect
  // which doesn't exist). Resolves chained redirects up to 4 hops
  // deep so legitimate /tools/<slug> → /<slug> → /tool/<id>
  // patterns work.
  { name: "redirect-destinations", file: "test-redirect-destinations.mjs" },
  // 2026-04-30 sitemap canonicalization guard: the
  // REDIRECTED_SEO_SLUGS Set in app/sitemap.ts (filters redirect-
  // sourced slugs out of sitemap.xml so Google sees only canonical
  // URLs) must stay in sync with the single-segment 308 redirects
  // in next.config.mjs whose source is in SEO_SLUGS. Without this
  // guard, drift between the two files silently re-introduces
  // redirect-sourced sitemap entries OR drops live SEO landings
  // from the sitemap.
  { name: "sitemap-redirect-sync", file: "test-sitemap-redirect-sync.mjs" },
  // 2026-04-30 dynamic-route coverage guard: every public dynamic
  // route advertised in sitemap.xml (blog, help, alternatives,
  // authors, use-cases, tools) must have (a) a non-empty data
  // source above floor-count, (b) a working app/<path>/[<param>]/
  // page.tsx, and (c) generateStaticParams (where applicable).
  // sitemap.ts must continue importing from each data file. Catches
  // the class of regression where someone removes data entries or
  // renames the route file, silently shrinking sitemap surface.
  { name: "dynamic-route-coverage", file: "test-dynamic-route-coverage.mjs" },
  // 2026-04-30 robots.txt safety guard: app/robots.ts (which Next
  // uses to render /robots.txt) must keep /api/, /app/, /admin/,
  // /_next/ in the disallow list AND must NOT accidentally disallow
  // /tools, /pricing, /blog, /help. Catastrophic if /admin/ ever
  // falls off the disallow list and gets indexed. Sub-second
  // static parse.
  { name: "robots-config", file: "test-robots-config.mjs" },
  // 2026-04-30 reverse-tabnabbing guard: every <a target="_blank">
  // must carry rel="noopener". Without it, the linked page can use
  // window.opener to redirect/modify the original tab — a classic
  // phishing vector. noreferrer is advisory (some patterns
  // intentionally allow Referer). Modern browsers default to
  // noopener for target=_blank since 2021, but Lighthouse + manual
  // security audits still flag the missing attribute.
  { name: "target-blank-rel", file: "test-target-blank-rel.mjs" },
  // 2026-04-30 dead-link guard: every literal `<Link/a href="/...">`
  // in JSX must resolve to a real route. Resolution rules cover
  // top-level static routes, dynamic route surfaces (tool, blog,
  // help, alternatives, use-cases, authors), and redirect sources.
  // The runtime smoke specs catch this for some surfaces but only
  // for routes a smoke spec actually visits — the static guard
  // covers every literal href in every .tsx file in sub-second
  // time. Caught nothing on first run; preventive going forward.
  { name: "internal-links", file: "test-internal-links.mjs" },
  // 2026-04-30 public-asset reference guard: every literal
  // `src="/..."` / `href="/..."` pointing at a static file
  // (.png, .jpg, .wasm, .mjs, etc.) must exist under /public/.
  // First run caught a real bug — preload link in app/tool/[id]/
  // page.tsx still pointed at /pdfium.wasm even after the WASM
  // fix moved the runtime fetch to /api/pdfium-wasm. Also
  // verifies critical files (og.png, pdfium.wasm, etc.) stay in
  // place — removing og.png would silently break every social
  // share preview.
  { name: "public-asset-refs", file: "test-public-asset-refs.mjs" },
  // 2026-04-30 redirect health (chain + dupe): two adjacent checks
  // on next.config.mjs redirects():
  //   (a) chain: no destination should match another redirect's
  //       source (2+ hop chains waste round-trips + Google de-rates
  //       them). Caught the legacy /tools/<slug> → /<slug> →
  //       /tool/<id> pattern that commits 89cd1e8 + cadf27c
  //       accidentally created.
  //   (b) dupe: no two redirects should share the same source —
  //       Next.js silently keeps the first match and ignores the
  //       second.
  { name: "redirect-chains", file: "test-redirect-chains.mjs" },
  // 2026-04-30 reverse-sweep — Razorpay /orders/<id>/payments
  // shape parsing for Task #24 (recovery cron). Originally orphaned
  // (file existed but wasn't in SUITES) — caught + wired up by the
  // aggregator-coverage guard below.
  { name: "reverse-sweep", file: "test-reverse-sweep.mjs" },
  // 2026-05-01 tool-runner-longform-ai-parity: ToolRunnerLongform is
  // the shared longform component every tool runner page renders below
  // its drop-zone. It used to bake a single hardcoded set of "what
  // makes us different" bullets ("100% local processing... never
  // touches our infrastructure", "no signup, no daily limit") that
  // were true for free tools and FALSE for AI tools — every AI tool
  // runner page (50+ surfaces) was claiming we don't upload your file
  // while a sibling block on the same page said "processed on our
  // servers with credits." This guard locks in the fix: both
  // FREE_DIFFERENTIATORS and AI_DIFFERENTIATORS exist with >=4 entries
  // each, no shared titles, isAI prop is destructured + consumed in
  // the JSX, the call site passes isAI={!tool.free}. Regression in
  // any of those eight invariants fails the build before the same
  // dishonest claim can resurface on production.
  { name: "tool-runner-longform-ai-parity", file: "test-tool-runner-longform-ai-parity.mjs" },
  // 2026-05-01 auth-callback-preservation: locks in the sitewide
  // callbackUrl fix. Until commit (this one), every layer of the
  // auth funnel hardcoded /app/dashboard as the post-sign-in
  // destination, silently dropping any callback context. Three
  // layers, all bugged:
  //   • LoginForm.tsx:69 + RegisterForm.tsx:46 hardcoded
  //     `signIn("google", { callbackUrl: "/app/dashboard" })`
  //   • lib/auth-actions.ts both actions hardcoded
  //     `redirectTo: "/app/dashboard"`
  //   • 11 server-side redirect("/login") sites in app/app/*/page.tsx
  //     dropped any callback intent
  // This guard locks all three layers: it asserts the sanitizer
  // exists with security-critical rejections (//, /api/, /login,
  // /register), the forms read from URL params + propagate via
  // hidden input, the actions read from form data and don't
  // hardcode redirectTo, and every /app/* page-level redirect
  // includes ?callbackUrl=. Mutation-tested by removing the
  // callback from /app/usage — guard fails with the exact
  // diagnostic and restoration brings it back to 21/21.
  { name: "auth-callback-preservation", file: "test-auth-callback-preservation.mjs" },
  // 2026-05-01 tool-id-references: every CTA linkHref + related[] tool
  // id must exist in the canonical TOOLS array (lib/tools.ts). Today
  // caught two real bugs: a /tool/fill-forms typo (should be
  // pdf-form-fill, plural→singular) AND a related[] entry referencing
  // "sign"/"fill-form" which aren't tool ids. Both rendered 404
  // links from the related-tools section of SEO landings.
  //
  // Surfaced 22 unique pre-existing broken ids in seo-pages.ts
  // related[] arrays (~70 reference points). All grandfathered into
  // KNOWN_BROKEN_RELATED_IDS with cap=22 and per-category rationale
  // (renames, aspirational tools, deferred Indian-context AI tools,
  // SEO slugs misplaced in related[], early-scheme catch-all names).
  // Cap is monotonic-shrinkage — any NEW invalid id (not in the
  // allowlist) fails the build immediately; pre-existing entries
  // stay accepted until Phase 3 cleanup repairs them.
  { name: "tool-id-references", file: "test-tool-id-references.mjs" },
  // 2026-05-02 plan §4.4 — two guards landing alongside the
  // supply-chain scrub + credit-badge removal commit:
  //   - no-supply-chain-leaks: catches Anthropic/OpenAI/Gemini/
  //     Haiku/Sonnet/GPT-4/Flash + latencyMs/inputTokens/outputTokens
  //     mentions in user-facing components. Documented exemption
  //     list for legitimate uses (BYOK copy, AI Detector tool, chat
  //     pages until a follow-up cleanup pass).
  //   - no-credit-number-hardcodes: catches the `\b\d+\s*credits?\b`
  //     regex in tool/marketing copy outside billing/pricing/admin/api.
  //     Single source of truth for "how many credits" is the pre-flight
  //     estimator (§5, Day 2).
  // Both are pure static-parse, sub-50ms, fail closed. Sequenced
  // before aggregator-coverage so a missed wire-in shows here.
  { name: "no-supply-chain-leaks", file: "test-no-supply-chain-leaks.mjs" },
  { name: "no-credit-number-hardcodes", file: "test-no-credit-number-hardcodes.mjs" },
  // 2026-05-02 plan §5 (Day 2) — pre-flight credit estimator. Pure
  // function lib/ai/estimate.ts:estimateCredits() is the single source
  // of truth for "how many credits will this op cost?". Verified via
  // 5-section static-parse harness covering source contract, pricing
  // constants sanity, feature-flag wiring, route contract, cross-file
  // invariants. Day 1.7 wires the multiplier-aware spend at runtime;
  // until then the estimator quotes the future state and route
  // handlers still use flat costs (estimator may quote MORE than gets
  // charged, but never less — user-friendly direction).
  { name: "estimate", file: "test-estimate.mjs" },
  // 2026-05-02 plan §8a items 4-8 (Day 1.5b) — auth hardening invariants.
  // Static-parse guard against regression on bcrypt cost factor (≥12),
  // password strength rules (10 chars + 3 of 4 char classes), no user-
  // enumeration phrasing in registerAction errors, bcrypt.compare for
  // credentials authorize. 21 assertions across 5 sections.
  { name: "auth-hardening", file: "test-auth-hardening.mjs" },
  // 2026-05-02 plan §8a DPDP gap 13 (Day 1.6) — DPDP endpoint contract.
  // Static-parse guard for /api/account/export (DPDP right to export),
  // /api/account/delete (right to erasure with email confirmation +
  // cascade), and docs/runbooks/data-breach.md (72-hour notification
  // protocol covering DPDP §8(6) + GDPR Art. 33-34). 34 assertions
  // across 3 sections.
  { name: "dpdp-endpoints", file: "test-dpdp-endpoints.mjs" },
  // 2026-05-02 plan §8 layers 1, 2, 4 (Day 5 partial) — abuse-prevention
  // helpers + registerAction wire-in. Verifies disposable email
  // blocklist (~250 domains), Gmail+alias + dot normalization,
  // IPv4/IPv6 bucket reduction, Cloudflare cf-connecting-ip preference,
  // schema + migration parity, and that registerAction calls the
  // disposable check BEFORE the DB lookup. 34 assertions / 5 sections.
  // Layer 3 (email verification gate) requires the verification flow
  // from Day 1.5a — deferred. Layer 5/6/7 (device fingerprint, expiry,
  // Turnstile) deferred to Day 5.5.
  { name: "abuse-prevention", file: "test-abuse-prevention.mjs" },
  // 2026-05-02 plan §8 layer 6 + Day 6 prep — signup-bonus helper
  // contract. Static-parse guard for grantSignupBonus() default-OFF
  // feature flag, idempotency key shape, default 5 credits / 7-day
  // TTL, ledger expiresAt threading, schema + migration 0019 parity.
  // 20 assertions / 5 sections. Helper is callable today but no-ops
  // until SIGNUP_GRANT_ENABLED=true (Day 6 atomic flip).
  { name: "signup-bonus", file: "test-signup-bonus.mjs" },
  // 2026-05-03 plan §9 (Day 6.5) — out-of-credits alert. Reusable
  // component shown when an AI op returns 402 insufficient_credits.
  // Replaces plain-text error with conversion-focused card linking
  // to /buy. Credits-only display (principle 1) — no per-call rupee
  // values. 21 assertions / 3 sections (component surface, copy
  // compliance, parser-regex correctness against real mapErrorBody
  // 402 messages including multiplier-aware ops).
  { name: "out-of-credits-alert", file: "test-out-of-credits-alert.mjs" },
  // 2026-05-03 plan §8 layer 6 (Day 5.5) — credit-expiry cron
  // sweeper. /api/cron/expire-grants debits expired signup_bonus
  // rows so the "valid 7 days" promise is enforced. CRON_SECRET-
  // gated, idempotent per-row, debit clamped to current balance,
  // per-row try/catch so partial failures don't abort the sweep.
  // 21 assertions / 6 sections covering surface, auth, query,
  // idempotency, error handling, response shape.
  { name: "expire-grants", file: "test-expire-grants.mjs" },
  // 2026-05-03 plan §8 layer 7 (Day 5.5) — Cloudflare Turnstile
  // captcha. Server-side verifyTurnstileToken() helper +
  // registerAction wire-in (verify before any DB write) + client
  // widget on RegisterForm with NEXT_PUBLIC_TURNSTILE_SITE_KEY.
  // Fail-OPEN when env vars unset (escape hatch). 25 assertions
  // / 5 sections covering surface, token submission, failure
  // handling, registerAction wire-in, client widget rendering.
  { name: "turnstile", file: "test-turnstile.mjs" },
  // 2026-05-03 plan §8 layer 5 (Day 5.5) — vanilla device fingerprint.
  // computeFingerprint() collects browser signals (UA, screen, canvas,
  // WebGL, timezone, hardware) → SHA-256 hex hash. Falls back to a
  // 64-char non-crypto hash on insecure-origin browsers. Submitted
  // via hidden form field, persisted to users.device_fingerprint.
  // 25 assertions / 6 sections.
  { name: "fingerprint", file: "test-fingerprint.mjs" },
  // 2026-05-03 plan §8a Day 1.5a Phase C — login rate limit.
  // Migration 0020 adds failed_login_attempts table; auth.ts
  // authorize() gates on checkLockout() before bcrypt.compare(),
  // recordFailure() on user-not-found OR wrong-password paths
  // (anti-enumeration), clearFailures() on success. 5 failures /
  // 15 min window / 30 min lockout — env-overridable.
  // 31 assertions / 4 sections.
  { name: "login-rate-limit", file: "test-login-rate-limit.mjs" },
  // 2026-05-03 post-plan Gap #4 + Gap #5 contract guards:
  //   - /api/account/recent-usage endpoint (auth-gated, credits-only,
  //     7-day window, top-3 cap, delegates to lib/user/queries —
  //     specifically NOT lib/admin to prevent USD micros leak)
  //   - OutOfCreditsAlert recap fetch (silent soft-load, hides on
  //     totalCredits=0, AbortController cleanup, all 9 AI ops mapped)
  //   - lib/admin/user-actions (requireAdmin FIRST, 1000-credit cap,
  //     audit-trail email stamp, second-aligned idempotency key,
  //     debit clamps to balance, structured error logs)
  //   - AdminUserActions client component (useTransition, 5s
  //     auto-clear, debit-disabled-when-balance-zero)
  //   - /admin/users/[id] mounts AdminUserActions BEFORE the abuse-
  //     signal panel (placement invariant: admins reviewing a flagged
  //     account claw back without scrolling)
  // 54 assertions across 5 sections. Sequenced after login-rate-limit
  // (last of the Pricing/Telemetry plan suites) and before aggregator-
  // coverage (which would error if a new test file was orphaned).
  // Pure static-parse — no DB, no live route — adds ~5ms.
  { name: "gap4-gap5", file: "test-gap4-gap5.mjs" },
  // 2026-05-03 plan §8 layer 6 / Gap #2 Option A — per-op signup-bonus
  // cap (feature-flagged, default OFF). Helper at
  // lib/payments/per-op-bonus-cap.ts caps how many of a free-trial
  // user's 5-credit pool can land on any single AI op type
  // (BONUS_PER_OP_CAP, default 2). Wires into spendCredits BEFORE
  // the balance probe — placement invariant preserved by guard B6
  // (otherwise pool credits would always satisfy balance and the cap
  // would never fire). Returns the new spend variant
  // { reason: "insufficient", capExceeded: true } so existing route
  // handlers see the same 402 path without code changes
  // (forward-compat — bespoke "free trial cap" copy can be added
  // per-route later via the optional capExceeded flag).
  // 26 assertions across 3 sections (A: helper surface, B: spendCredits
  // wire-in, C: forward-compat invariants). Sequenced after gap4-gap5
  // and before aggregator-coverage. Pure static-parse — no DB.
  { name: "per-op-bonus-cap", file: "test-per-op-bonus-cap.mjs" },
  // 2026-05-04 — CSP must allow Cloudflare Turnstile origin. Discovered
  // during post-activation E2E smoke test that the CSP was missing
  // https://challenges.cloudflare.com from script-src + frame-src.
  // The Turnstile widget script couldn't load → empty widget div →
  // empty cf-turnstile-response form field → server-side verify
  // returned false → every credentials registration failed with
  // "Captcha verification failed". The bug was cosmetic before today's
  // TURNSTILE_SECRET_KEY activation (Turnstile failed-open without the
  // secret); activation flipped it to fail-closed, exposing the gap as
  // a release-blocking outage. Guard locks in the fix.
  { name: "csp-turnstile", file: "test-csp-turnstile.mjs" },
  // 2026-05-04 (Plan T2-5) — capExceeded wire-up guard. Locks in the
  // 4-layer chain shipped at commits 8d47400 + 9f8bf07: spendCredits
  // → 402 response body → tool error string [trial-cap] marker →
  // OutOfCreditsAlert capExceeded prop → friendlier heading. If any
  // layer drops the flag, free-trial users hitting the per-op cap
  // fall back to the misleading "Not enough credits / you have 0"
  // copy instead of "Free trial cap reached on this tool". 77
  // assertions across 5 sections (alert surface, 10 routes, 9 tool
  // components, spendCredits union, forward-compat). Pure static-
  // parse — adds ~3ms.
  { name: "cap-exceeded-wireup", file: "test-cap-exceeded-wireup.mjs" },
  // 2026-05-04 (Plan T1-6 ext) — locks in the OutOfCreditsAlert
  // "Start Plus" CTA + the /enterprise sales-qualified-lead landing
  // page + sitemap inclusion. Both items shipped at commit 96ac693
  // (sitemap fix at 2a3263f). Drop the Plus CTA → revert to lower-
  // LTV one-shot funnel. Drop /enterprise → SMB+ leads with no
  // landing path. Pure static-parse — adds ~2ms.
  {
    name: "enterprise-and-plus-cta",
    file: "test-enterprise-and-plus-cta.mjs",
  },
  // 2026-05-04 (SECURITY_COMPLIANCE_AUDIT.md §2.2) — cookie banner
  // Accept-all and Essential-only buttons must share equal visual
  // prominence (same border, background, fontWeight, color). Earlier
  // styling had Accept-all filled-accent + fontWeight 600 (visual
  // primary), the exact pattern flagged by EDPB Guidelines 03/2022
  // §3.2.1 ("Hindering") and CNIL 2021-152 (€60M Facebook fine).
  // Equalized to outlined-neutral 500-weight. Pure static-parse —
  // anchors on JSX label sentinels + style block extraction.
  {
    name: "cookie-banner-prominence",
    file: "test-cookie-banner-prominence.mjs",
  },
  // 2026-05-12 (PENDING_WORK_ANALYSIS §7c) — first-time-user welcome
  // page. New /app/welcome route shows curated 8-tool starter grid
  // (4 free + 4 AI) for fresh signups; cookie pcai_seen_welcome
  // toggles between first-time and "welcome back" variants. The
  // verify-email post-success now routes here instead of straight to
  // /app/dashboard. 35 assertions across 5 sections (A: page +
  // 8 tools, B: cookie-keyed greeting variants, C: MarkWelcomeSeen
  // client component, D: verify-email redirect target — gap-closure
  // assertion, E: defense-in-depth auth + redirect). Pure static-
  // parse — no live state needed.
  {
    name: "welcome-page",
    file: "test-welcome-page.mjs",
  },
  // 2026-05-12 (TOOL_IMPROVEMENT_PLAN T2-6) — /compare intent-router
  // landing for visitors who know what they want but don't know the
  // tool name. Verb-led decision tree (12 intent groups: combine,
  // split, convert-from-pdf, convert-to-pdf, shrink, understand,
  // fill-sign, security, translate, redact, compare, annotate)
  // routing to the right tool with explicit free-vs-AI badges where
  // both options exist. SEO-indexable + linked from sitemap. 34
  // assertions across 6 sections (A: 12 intents + hero, B: candidate
  // href validity + kind badges, C: SEO meta + canonical, D: sitemap
  // priority + frequency, E: back-out CTA to /tools, F: footer
  // discovery link 'Find your tool' pin).
  {
    name: "compare-page",
    file: "test-compare-page.mjs",
  },
  // 2026-05-12 (TOOL_IMPROVEMENT_PLAN T2-2 scoped) — pins the tool-ID
  // conventions in lib/tools.ts so future drift fails CI. Rules: all
  // IDs lowercase kebab, unique, AI tools have ai- prefix, free tools
  // don't, group is in the 6-group enum, group <-> free pairing
  // matches, names are unique. 9 assertions. Caught one existing
  // display-name collision on first run ("Compare PDFs" used for
  // both pdf-diff free visual + ai-compare AI content) — renamed
  // pdf-diff to "Visual Diff" in the same commit.
  {
    name: "tool-id-conventions",
    file: "test-tool-id-conventions.mjs",
  },
  // 2026-05-12 — CollectionPage + ItemList JSON-LD on the /tools
  // catalog page. Mirrors the FAQPage JSON-LD pattern shipped on
  // /compare. ItemList derives from the canonical TOOLS array via
  // .map() at render time so adding a tool auto-updates the schema.
  // 14 assertions across 5 sections (A: constants, B: shape spec,
  // C: derivation-not-literal — anchored on COLLECTION_JSONLD block
  // since breadcrumb itemListElement IS legitimately a literal,
  // D: breadcrumb, E: script tags + JSON.stringify wrapping).
  {
    name: "tools-catalog-jsonld",
    file: "test-tools-catalog-jsonld.mjs",
  },
  // 2026-05-12 — same pattern on /alternatives (competitor
  // comparisons index). Each entry in COMPETITOR_SLUGS becomes a
  // ListItem with the comparison URL + one-line summary. 14
  // assertions, same section structure as tools-catalog-jsonld.
  {
    name: "alternatives-jsonld",
    file: "test-alternatives-jsonld.mjs",
  },
  // 2026-05-12 — Service + Organization JSON-LD on /enterprise
  // (B2B sales-qualified-lead landing). Different schema shape from
  // tools/compare/alternatives because the page sells a consultative
  // service engagement, not a software application. Service.hasOffer-
  // Catalog enumerates the 6 features list as Offer items. 14
  // assertions (A: constants, B: Service shape + provider +
  // audience, C: OfferCatalog derived from FEATURES — anti-drift,
  // D: breadcrumb, E: rendering hygiene).
  {
    name: "enterprise-jsonld",
    file: "test-enterprise-jsonld.mjs",
  },
  // 2026-05-12 — Product + Offer + FAQPage + Breadcrumb JSON-LD on
  // /pricing. Highest commercial-leverage JSON-LD on the site
  // (SERP pricing rich snippets are direct conversion drivers).
  // ProductGroup at top with hasVariant for each CREDIT_PACKS entry;
  // each variant has TWO Offers (USD + INR) for dual-currency
  // checkout. FAQPage derived from PRICING_FAQ. 24 assertions
  // across 6 sections (A: 3 constants, B: ProductGroup shape +
  // sku + brand, C: dual-currency offers + derivation-not-literal,
  // D: FAQ from PRICING_FAQ, E: breadcrumb, F: 3 script tags
  // hygiene).
  {
    name: "pricing-jsonld",
    file: "test-pricing-jsonld.mjs",
  },
  // 2026-05-12 — CollectionPage + ItemList JSON-LD on /use-cases
  // index. Each USE_CASES entry becomes a ListItem with h1 + sub.
  // 12 assertions. Per-slug /use-cases/[slug] pages already emit
  // HowTo + FAQ + Article via the shared UseCasePage component
  // (pre-existing) — this guard covers only the index.
  {
    name: "use-cases-index-jsonld",
    file: "test-use-cases-index-jsonld.mjs",
  },
  // 2026-05-12 — JSON-LD on /api (TechArticle), /bulk (Service +
  // OfferCatalog of CAPABILITIES), /help (CollectionPage + ItemList
  // of HELP_TOPICS). 21 assertions across 3 page sections. Each
  // page uses the schema shape appropriate to its content type.
  {
    name: "marketing-pages-jsonld",
    file: "test-marketing-pages-jsonld.mjs",
  },
  // 2026-05-12 — pins two product wire-ups: §6d A/B test
  // (HOMEPAGE_HERO_CTA flag + first deterministic-percent variant
  // render on the homepage) and §6c auto-routing (applyQualityBias
  // IfEnabled call in lib/ai/router.ts). 14 assertions across the
  // two wire surfaces + activation-guidance documentation. Both
  // ship in disabled state; operator flips env vars when ready.
  {
    name: "product-wireups",
    file: "test-product-wireups.mjs",
  },
  // 2026-05-12 — T2-4 LOC ceiling on the 5 largest tool files.
  // Locks current line counts as a no-worsening ceiling. Caught
  // +285 LOC of silent growth on first measurement vs the
  // TOOL_IMPROVEMENT_PLAN documented numbers. Forces any growth to
  // be paired with extraction. 6 assertions (5 per-file + 1 total).
  {
    name: "tool-file-loc-ceiling",
    file: "test-tool-file-loc-ceiling.mjs",
  },
  // 2026-05-12 — pins three multi-week foundations: §5c
  // EDIT_PDF_TEXT flag (foundation only, no user surface), T2-4
  // LOC ceiling presence, §5f mobile-floor Playwright spec
  // existence + 13-editor coverage. 29 assertions across the three.
  // These are floor pins — the real engineering work for each is
  // explicitly out of scope of a single session.
  {
    name: "multi-week-foundations",
    file: "test-multi-week-foundations.mjs",
  },
  // 2026-05-12 — pins for the comprehensive SEV-1 audit fix batch:
  // .env.example completeness (15 required env vars + no stale
  // Paddle), author title dedupe, "How do I cancel" help article,
  // help search SSR fallback (<form action>), List-Unsubscribe
  // headers (Gmail/Yahoo Feb-2024 rules), sitemap redirect-source
  // exclusion, canonical { error, detail } error shape on 3
  // standardised routes. 35 assertions across 7 sections.
  {
    name: "sev1-fixes",
    file: "test-sev1-fixes.mjs",
  },
  // 2026-05-12 — SEV-2 polish-tier batch: og:image cascade fix on 8
  // legal/marketing pages, cookie banner aria-modal repair,
  // session.maxAge config, buildResetUrl host-header hardening,
  // /api/health AI detail gated behind cron-secret, SMTP_PASS boot
  // warning. 29 assertions across 7 sections.
  {
    name: "sev2-fixes",
    file: "test-sev2-fixes.mjs",
  },
  // 2026-05-04 (PENDING_WORK_ANALYSIS.md §4c) — contact form
  // persistence + admin viewer. Migration 0021 added the
  // contact_submissions table; the route now persists every
  // submission so /enterprise sales-qualified leads survive log
  // rotation. 46 assertions across 5 sections (migration shape,
  // Drizzle schema parity, route wiring + try/catch + stdout
  // fallback, admin page existence + admin gate, layout nav
  // wiring). Pure static-parse — no live MySQL dependency.
  {
    name: "contact-persistence",
    file: "test-contact-persistence.mjs",
  },
  // 2026-05-04 (PENDING_WORK_ANALYSIS §6b) — AI feedback foundation.
  // Migration 0022 (ai_feedback table), POST /api/ai/feedback,
  // /admin/ai-feedback page. The data flywheel for AI quality.
  // Stage 1 of 2: schema + persist + admin viewer ship in this
  // commit; FeedbackChip on AI tool result cards (the UI that
  // populates the table) follows in a separate cascade-conscious
  // commit. 63 assertions across 5 sections (migration shape, schema
  // parity, route auth + zod + upsert + rate-limit + try/catch,
  // admin page sections, layout NAV).
  {
    name: "ai-feedback-foundation",
    file: "test-ai-feedback-foundation.mjs",
  },
  // 2026-05-04 (PENDING §6b stage 2 pilot) — FeedbackChip wired
  // into SummarizePdfTool. Locks in: chip component contract,
  // summarize route surfaces aiUsageId in 200 + 207 paths, tool
  // captures + passes the id, rollout doc tracks fleet status.
  // Stage 3 batches extend WIRED_TOOLS as new tools land.
  {
    name: "ai-feedback-pilot",
    file: "test-ai-feedback-pilot.mjs",
  },
  // 2026-05-04 (PENDING §4c foundation) — subscription dunning
  // foundation. Migration 0023 (subscription_dunning table),
  // persistence helpers in lib/payments/dunning.ts, /admin/dunning
  // read-only viewer. Same staging discipline as ai-feedback: the
  // table + persist surface lands now even though no Phase E
  // webhook handler calls it yet, so the persist wiring can ship
  // as a 1-file diff later. 59 assertions across 6 sections
  // (migration shape, schema parity, helper + DUNNING_POLICY
  // surface preservation, admin page contract, layout NAV,
  // cross-file state-name invariant).
  {
    name: "dunning-foundation",
    file: "test-dunning-foundation.mjs",
  },
  // 2026-05-04 (PENDING §6c foundation) — per-user AI quality
  // signal. Pure classifier + read-side helpers in lib/ai/
  // quality-signal.ts (no migration — derives from existing
  // ai_feedback table) + /admin/quality-signals viewer. Same
  // foundation-now-automation-later discipline as dunning. 39
  // assertions across 5 sections (lib surface, pure-function
  // semantics including the trailing-streak break invariant +
  // flagged-before-watch ordering trap, admin page contract,
  // layout NAV, cross-file bucket-name invariant + PENDING anchor).
  {
    name: "quality-signal-foundation",
    file: "test-quality-signal-foundation.mjs",
  },
  // 2026-05-04 (PENDING §2a + §2b foundation) — operational Slack
  // alert helper. lib/ops/slack-alert.ts as the single home for
  // the SLACK_OPS_WEBHOOK_URL env var read + the canonical
  // attachment payload format + the never-throws fetch wrapper.
  // Consumed (eventually) by margin-rollup floor breaches, dunning
  // lifecycle transitions, quality-signal flagging, and cron
  // failure escalation — all currently writing to the same
  // "post a Slack alert" TODO without a shared helper to call.
  // 42 assertions across 5 sections, including the codebase's
  // FIRST dynamic-execution guard: Section B compiles
  // formatSlackPayload from .ts to .js via a stripped-TS regex
  // pass and runs canonical inputs through `new Function`, so
  // the formatter's actual output (severity → color mapping,
  // numeric coercion, null/undefined drop, 200-char cap, ts
  // unit) is verified rather than just the source shape.
  // Section D additionally scans lib/ + app/ + components/ for
  // hardcoded `https://hooks.slack.com/` URLs (credential leak
  // tripwire).
  {
    name: "slack-alert-foundation",
    file: "test-slack-alert-foundation.mjs",
  },
  // 2026-05-04 follow-up to commit `36821aa` — the first consumer
  // migration of the shared Slack helper. lib/ai/margin-rollup.ts's
  // postMarginAlertToSlack used to read AI_SPEND_ALERT_SLACK_URL
  // inline + post legacy {text:...} payloads; this commit migrated
  // it to call sendSlackAlert with a structured (severity, title,
  // body, context) payload, while preserving the legacy env var as
  // urlOverride for backward-compat. 26 assertions across 5
  // sections — keeping migration-specific invariants in their own
  // suite (vs. the foundation guard) makes failure attribution
  // clean: a regression in the helper API breaks foundation; a
  // regression in margin-rollup's call-site breaks migration.
  {
    name: "margin-rollup-slack-migration",
    file: "test-margin-rollup-slack-migration.mjs",
  },
  // 2026-05-04 (PENDING §2b application-level escalation) — three
  // cron route handlers (ai-margin-rollup, reconcile-payments,
  // expire-grants) now thread sendSlackAlert into their failure
  // paths so an application-level cron failure pages the operator
  // even when cron-job.org's URL-level monitoring would consider
  // the request a 5xx success-after-retry. Severity discipline:
  // "alarm" for data-at-risk failure modes (rollup + reconcile),
  // "warn" for non-cascading per-row failures (expire-grants).
  // Each call uses the urlOverride backward-compat pattern from
  // commit b4e382b. 31 assertions across 4 sections.
  {
    name: "cron-slack-escalation",
    file: "test-cron-slack-escalation.mjs",
  },
  // 2026-05-04 (PENDING §4c automation) — dunning webhook automation.
  // Follow-up to commit 76a0c82 (dunning persistence foundation):
  // lib/payments/ledger.ts:handleSubscription now drives the dunning
  // state machine alongside the existing subscriptions.status update.
  // Dispatch is dormant today (no recurring SKUs), activates without
  // code changes when Phase E ships. 38 assertions across 5 sections.
  {
    name: "dunning-automation",
    file: "test-dunning-automation.mjs",
  },
  // 2026-05-04 (PENDING §6c automation) — quality-signal router-bias.
  // Follow-up to commit 81087df (quality-signal foundation): the
  // router consults applyQualityBiasIfEnabled before walking its
  // ladder so flagged users get the offending provider deprioritized.
  // Behind a default-off env flag (QUALITY_SIGNAL_AUTO_ROUTE_ENABLED).
  // Separate suite from quality-signal-foundation for clean failure
  // attribution: foundation regression breaks classifier surface;
  // bias regression breaks the router wire-up. 23 assertions across
  // 5 sections.
  {
    name: "quality-signal-router-bias",
    file: "test-quality-signal-router-bias.mjs",
  },
  // 2026-05-05 (PENDING §4d foundation) — feature flag system. Pure
  // env-var-backed flags (no SaaS dependency yet) with deterministic
  // hash-bucket percent rollouts + per-user override list +
  // per-flag override knob. lib/flags.ts + /admin/feature-flags
  // viewer + 53-assertion CI guard with dynamic execution of all 5
  // pure helpers (envKey, bucketUserId, parsePercent, parseUserList,
  // parseOverride). The bucketing helper hash-spread invariant is
  // exercised across 1000 sample users to confirm SHA-1 gives ≥50
  // distinct buckets out of 100 (degenerate hashes would fail this).
  {
    name: "feature-flags-foundation",
    file: "test-feature-flags-foundation.mjs",
  },
  // 2026-05-05 — closes the validation gap exposed by commit
  // a849c91 (feature-flags foundation) where I added a non-allowlist
  // named export to a Next.js Page file. tsc --noEmit + aggregator
  // both passed; only `next build` caught it, and only on
  // Hostinger's deploy. This static-parse guard scans every
  // page.tsx / page.ts under app/ for exports outside the App
  // Router allowlist (default / metadata / generateMetadata /
  // viewport / generateViewport / generateStaticParams + Route
  // Segment Config). Catches the bug class in <1s instead of at
  // ~2-min `next build`-time. 13 assertions including extractor
  // self-tests on 8 export forms.
  {
    name: "next-page-exports",
    file: "test-next-page-exports.mjs",
  },
  // 2026-05-05 (PENDING §3e foundation) — referrals storage + helper
  // surface guard. Mirrors the feature-flags / quality-signal /
  // dunning shape: pin migration 0024 (referral_codes +
  // referral_signups), Drizzle schema parity per column, helper
  // public surface (generateReferralCode + getOrCreateReferralCode +
  // lookupReferralCode + isReferralsEnabled), code generator alphabet
  // (must exclude visually ambiguous 0/O/1/I/L), admin viewer
  // read-only constraint (no POST surface), and 200-sample dynamic
  // execution of the generator to verify length, alphabet membership,
  // and pairwise uniqueness across 200 generations. Placed
  // immediately after next-page-exports because both are static-parse
  // guards with zero runtime dependency. 73 assertions.
  {
    name: "referrals-foundation",
    file: "test-referrals-foundation.mjs",
  },
  // 2026-05-07 — multi-seat / organizations feature REMOVED. Three
  // tables (organizations, organization_members, organization_invites)
  // dropped via migration 0029. Library, pages, components, server
  // actions, MULTI_SEAT flag, and the test-orgs-foundation guard
  // were all deleted at founder request — feature was scoped behind
  // the flag but never activated for users, and is not on the
  // current product roadmap. The aggregator-coverage guard's allowlist
  // was reduced accordingly.
  // 2026-05-08 — API keys foundation (Tier 1 #1). Schema was already
  // shipped (api_keys table); this commit ships the mint/verify/
  // revoke/list pipeline + management UI. Pins helper public
  // surface, token format invariants (pck_ prefix, SHA-256 hash,
  // 68-char raw, 12-char display prefix), anti-DB-leak posture,
  // soft-delete revoke semantics, fire-and-forget telemetry,
  // server actions anti-impersonation, manager UI shape (mint
  // form + active list + revoked-audit list + one-time fresh-key
  // reveal). Header-verify middleware (wiring keys into AI route
  // auth) is a follow-up commit. ~30 assertions.
  {
    name: "api-keys-foundation",
    file: "test-api-keys-foundation.mjs",
  },
  // 2026-05-05 (PENDING §6a foundation) — human eval grading layer.
  // Sits beside the automated eval infra from Phase A Task #14
  // (golden-set + rubric + runner + ai_eval_runs). New table
  // eval_human_grades stores 4-dimension Likert scores from weekly
  // grading sessions. Pin migration 0026 DDL (4 score tinyints,
  // unique on 5-col combo, 3 indexes), Drizzle schema parity, query
  // module public surface (read-only, sorts worst-first, mean-of-4
  // overall), HUMAN_GRADE_FLOOR=3.5, admin viewer Page export shape
  // + read-only invariant + threshold pin. 66 assertions across
  // sections A-D.
  {
    name: "eval-human-grades-foundation",
    file: "test-eval-human-grades-foundation.mjs",
  },
  // 2026-05-05 (PENDING §5f foundation) — mobile UI hardening guard.
  // Two-layer coverage:
  //   1. Static parse: scans every tool component for hardcoded
  //      width / minWidth > 380px (iPhone 14 viewport breathing
  //      room) WITHOUT a maxWidth companion + gridTemplateColumns
  //      repeat(4+) without minmax floor. Catches the bug class
  //      that horizontal-scrolls mobile users.
  //   2. Pin presence + shape of tests/e2e/mobile-tools.spec.ts —
  //      iPhone 14 device emulation, body.scrollWidth assertion,
  //      above-fold CTA assertion, console-error filter for known
  //      third-party noise, ≥ 5 tool URLs covered.
  // The static guard runs sub-second; Playwright spec is in the
  // E2E suite (run separately via `npx playwright test`).
  {
    name: "mobile-hostile-styles",
    file: "test-mobile-hostile-styles.mjs",
  },
  // 2026-05-05 (PENDING §5a foundation) — PDF compress route guard.
  // Locks the Ghostscript wrapper invariants (level→preset map,
  // required gs flags, mkdtemp + finally{} cleanup, SIGKILL on
  // timeout, bypass-on-low-savings branch) and the route handler
  // contract (auth → flag gate → size cap → magic-header check →
  // level whitelist → gs spawn → categorized error). The flag-gate
  // assertion is the foundation's load-bearing invariant — without
  // it, the route would expose to all logged-in users on first
  // deploy. 45 assertions across 4 sections including dynamic eval
  // of the level→preset map literal.
  {
    name: "pdf-compress-foundation",
    file: "test-pdf-compress-foundation.mjs",
  },
  // 2026-05-05 (PENDING §5b foundation) — PDF/A-2b converter guard.
  // Companion to pdf-compress-foundation: same Ghostscript wrapper
  // discipline, different argv builder. Pins PdfaLevel union at "2b"
  // only (broader exposure invites confusion + invalid output for
  // non-tagged source PDFs), pins PDFACompatibilityPolicy=1 (without
  // it gs silently strips un-PDF/A-able content and produces files
  // that LIE about conformance), pins -sOutputIntentProfile usage,
  // pins PDFA_MAX_INPUT_BYTES is INHERITED from COMPRESS_MAX_INPUT_BYTES
  // (single source of truth). 39 assertions across 4 sections.
  {
    name: "pdfa-foundation",
    file: "test-pdfa-foundation.mjs",
  },
  // 2026-05-04 (PENDING §1f) — webhook + reconcile resilience
  // contract. Locks in: 500 on processing error (provider retries),
  // 200 on duplicate (provider stops), 400 on bad sig (provider
  // stops), reconcile shares applyPaymentEvent path, lookback ≥
  // 24h Razorpay retry budget, idempotency keys consistent across
  // webhook + reconcile so a synthesized event after a successful
  // webhook doesn't double-grant. 23 assertions across 7 sections.
  // F1 explicitly documents the recordWebhookEvent-before-process
  // ordering issue mitigated by the reconcile sweep.
  {
    name: "webhook-reconcile-resilience",
    file: "test-webhook-reconcile-resilience.mjs",
  },
  // 2026-05-04 (PENDING §6b corollary) — ai_usage instrumentation
  // tracker. Discovered 8/10 AI ops don't call recordAiUsage which
  // means /admin/margin sees ~20% of fleet, FeedbackChip flip
  // semantics broken on those ops, /app/usage per-op breakdown
  // wrong, per-op error rate unmeasurable. Guard locks the current
  // state + SSOT for which ops are instrumented; ops moving from
  // MISSING_OPS to INSTRUMENTED_OPS must be paired with the route
  // change in the same commit. 48 assertions across 5 sections
  // (tracker doc, instrumented ops actually call recordAiUsage,
  // missing ops actually don't, AIOp union coverage, operator
  // summary). See docs/AI_USAGE_INSTRUMENTATION_GAP.md.
  {
    name: "ai-usage-instrumentation",
    file: "test-ai-usage-instrumentation.mjs",
  },
  // 2026-05-08 — Tier 4 #11 ai-history-page guard. Pins the dedicated
  // /app/ai-history index that closes the "where did my output go?"
  // discoverability gap. Pure static parse (no DB / no route imports);
  // asserts the cross-tenant safety invariant (INNER JOIN to files +
  // userId filter on the files row, not on ai_outputs which has no
  // userId column at all), kind enum parity with db/schema/app.ts
  // (catches the runtime crash when a future kind is added to the
  // schema enum but not to the page's KIND_META map), payload-size
  // discipline (excerpt before render, content_md is mediumtext / 16MB),
  // whitelist-not-echo of the kind search param, nav entry presence,
  // and force-dynamic. Placed before aggregator-coverage so the latter
  // (which checks all test files are wired) sees this entry too.
  {
    name: "ai-history-page",
    file: "test-ai-history-page.mjs",
  },
  // 2026-05-08 — preview-page-kind-parity guard. Sister harness to
  // ai-history-page: AI History surfaces all 9 kinds, then clicking a
  // row navigates to /app/files/[id]/preview which independently
  // renders the kind label. Until commit b56120b's follow-on, that
  // page hard-coded a 4-way ternary chain (summary / translation /
  // comparison / OCR) so the 5 Phase-5.6 kinds (rewrite / table /
  // redaction / generation / signing) all rendered as "AI · OCR".
  // The fix replaces the chain with a `KIND_LABELS: Record<typeof
  // row.kind, string>` map (TS fail-closed on missing kinds) plus a
  // generation-special-case so `meta.sourceName === "prompt"` doesn't
  // surface the awkward "From prompt" line. This guard pins all of
  // it: KIND_LABELS canonical signature, schema/page kind parity, the
  // old ternary chain is gone (regression check), and generation is
  // branched before the sourceName fallback. Pure static parse.
  {
    name: "preview-page-kind-parity",
    file: "test-preview-page-kind-parity.mjs",
  },
  // 2026-05-08 — account-export-ui guard. Pins item #25 (account
  // deletion polish): adds the missing UI surface for the
  // /api/account/export endpoint that's existed since the original
  // DPDP compliance work but had no button. ExportDataButton client
  // component fetches the endpoint, downloads as date-stamped JSON,
  // mounted on /app/settings ABOVE the Danger zone (matches DPDP
  // §11 access → §12 erasure reading order). DeleteAccountForm copy
  // updated to nudge users toward export first. Pure static parse:
  // component shape (use client, named export, fetch URL, credentials),
  // M6 object-URL revoke in finally, settings page import + mount,
  // section ordering invariant, delete-form copy.
  {
    name: "account-export-ui",
    file: "test-account-export-ui.mjs",
  },
  // 2026-05-08 — tool-permalinks guard. Pins item #17 of the
  // improvement analysis: URL state encoding canary on
  // SummarizePdfTool. depth setting syncs bidirectionally with
  // `?depth=` — read on mount, written via history.replaceState
  // on change. Lets users share `/tool/ai-summarize?depth=detailed`
  // links. Pure static parse: URL → state mount-effect, value
  // whitelist (no garbage in setDepth), state → URL effect on
  // [depth], replaceState (not pushState — back-button hell), default
  // omitted from URL, SSR `typeof window` guard.
  {
    name: "tool-permalinks",
    file: "test-tool-permalinks.mjs",
  },
  // 2026-05-08 — aria-live-results guard. Pins item #14 (screen
  // reader announcements) on the AI tool runners' result cards.
  // Sister to test-retry-status-ux.mjs (covers the in-flight
  // aria-busy state); together they form: aria-busy on click → AT
  // announces "busy", aria-live=polite + role=status + aria-atomic
  // on result region → AT announces the result when it lands. 9
  // tools currently wired (those with `function ResultCard`); 9
  // more inline-result tools tracked in INLINE_RESULT_TOOLS_DEFERRED
  // for follow-up sweep.
  {
    name: "aria-live-results",
    file: "test-aria-live-results.mjs",
  },
  // 2026-05-08 — tool-dropzone-prompt guard. Pins item #3 of the
  // improvement analysis: empty states sweep. Every ToolDropzone
  // consumer in components/tools/ must pass a tool-specific
  // `prompt` prop instead of falling back to the generic "Drop a
  // PDF here or click to browse." Audit found 38 consumers + 39
  // <ToolDropzone> mounts; all pass. Two consumer files are name-
  // allowlisted (ToolDropzone.tsx self-reference, ImagesToPdfTool
  // which uses an inline image-typed dropzone, not ToolDropzone).
  // Catches the regression where a new tool ships using ToolDropzone
  // with default copy.
  {
    name: "tool-dropzone-prompt",
    file: "test-tool-dropzone-prompt.mjs",
  },
  // 2026-05-08 — tool-how-it-works guard. Pins item #8 of the
  // improvement analysis: inline tool explainer shipped as a
  // canary on SummarizePdfTool. Pure static parse: native <details>
  // /<summary> shape (no useState reimplementation that would lose
  // a11y), 3-step canonical structure, optional privacyNote prop
  // referencing the canonical zero-retention phrases. Other 30+
  // tool runners follow the same pattern in a follow-up sweep.
  {
    name: "tool-how-it-works",
    file: "test-tool-how-it-works.mjs",
  },
  // 2026-05-08 — color-contrast guard. Pins item #13 of the
  // improvement analysis: programmatic WCAG AA contrast check on
  // the design tokens in app/globals.css. Parses oklch(L C H) per
  // theme, converts oklch → oklab → linear sRGB → relative
  // luminance via Ottosson's published matrices, computes WCAG
  // contrast ratio. Asserts canonical token pairs (fg/fg-muted/
  // fg-subtle on bg-1, accent on bg, accent-fg on accent, etc.)
  // meet 4.5:1 for body text or 3.0:1 for UI components, in both
  // dark + light themes. The tokens already had manual fix history
  // from 2026-04-20 (--fg-subtle bumped 0.55→0.68 dark, 0.58→0.45
  // light); this guard pins those values + caught a NEW regression
  // shipped same commit (light --accent-fg flipped 0.99→0.20 to
  // fix the Material-Design white-on-orange 3.26:1 fail). Pure
  // math, no deps.
  {
    name: "color-contrast",
    file: "test-color-contrast.mjs",
  },
  // 2026-05-08 — retry-status-ux guard. Pins item #5 of the
  // improvement analysis: SummarizePdfTool wires fetchAiWithRetry's
  // onAttempt callback into a retryAttempt state so the user sees
  // "Retrying… (2/3)" instead of an indefinite "Summarizing…"
  // during the retry backoff window. Pure static parse: asserts
  // retryAttempt + retryMax state declared, onAttempt wiring with
  // the >1 gate, reset-in-finally for both states, button label
  // ladder (retry > busy > idle priority), aria-busy attribute.
  // Canary tool — other 9 AI runners follow the same pattern in a
  // follow-up sweep.
  {
    name: "retry-status-ux",
    file: "test-retry-status-ux.mjs",
  },
  // 2026-05-08 — generated-pdf-preview guard. Pins item #10 of the
  // improvement analysis: page-1 preview thumbnail above the
  // Download button on Generate / Redact / Sign success cards. New
  // GeneratedPdfPreview client component (sister to UploadedFile-
  // Preview — bracketing the AI op with input-preview before and
  // generated-preview after). Pure static parse: asserts the
  // component shape (use client, named export, props type, base64-
  // to-bytes try/catch, useFirstPagePreview reuse) plus mount-site
  // pinning across all 3 consumer tools (each must import + mount
  // gated on its specific result-shape field).
  {
    name: "generated-pdf-preview",
    file: "test-generated-pdf-preview.mjs",
  },
  // 2026-05-08 — marketing-honesty guard. Pins items #20 (footer)
  // and #21 (status page) of the improvement analysis. Catches the
  // regression class where lies sneak back into marketing copy
  // ("files deleted after 1h", "updated every 60 seconds from our
  // monitoring") that contradict the zero-retention work shipped
  // under items #4 + #22. Sister to test-tool-runner-longform-ai-
  // parity which pins a different surface; together they form the
  // "no marketing surface lies about file retention" coverage. Pure
  // static parse: positive checks for the canonical "Zero retention
  // · TLS 1.3 in transit" copy + footer /cookies link + status page
  // probeServiceHealth + force-dynamic + recent-incident inclusion;
  // negative checks for the regressed copy patterns.
  {
    name: "marketing-honesty",
    file: "test-marketing-honesty.mjs",
  },
  // 2026-05-08 — tool-dropzone-recovery guard. Pins the new
  // ToolDropzone behavior where oversized-PDF errors surface
  // /tool/compress as a one-click recovery affordance. The
  // structured DropzoneError union (kind + fileName + sizeBytes +
  // limitBytes for too-large; kind + fileName for non-pdf) is what
  // lets the JSX branch on kind to render the recovery link OR
  // not. Pure static parse: asserts the union shape, useState
  // typing, both setError call-sites pass the right shape,
  // makeError signature returns { message, recovery }, /tool/compress
  // is the exact recovery target, "Compress this PDF first" copy
  // (with load-bearing "first"), aria-label on the iconified Link,
  // non-pdf path returns recovery: null (different mental model —
  // no single sensible recovery), JSX destructures + renders both
  // pieces.
  {
    name: "tool-dropzone-recovery",
    file: "test-tool-dropzone-recovery.mjs",
  },
  // 2026-05-08 — delete-ai-artifact guard. Pins the Delete button
  // on /app/files/[id]/preview that closes the artifact-management
  // loop (AI History → preview → delete-without-bouncing). Two-click
  // confirm pattern with auto-disarm timer protects against
  // accidental destructive clicks on this focused single-artifact
  // surface (different UX than /app/files row trash icon, which is
  // intentionally one-click). Pure static parse: asserts component
  // is a client component with named export, useState armed/setArmed
  // state, "Click again to confirm" copy in armed branch, setTimeout
  // disarm + clearTimeout cleanup, useRouter().push("/app/ai-history")
  // + router.refresh() on success, preview page mounts with
  // id={params.id}, deleteFileAction revalidatePath includes
  // /app/ai-history (so stale cached row doesn't point at 404), and
  // canonical-action import (no fork drift).
  {
    name: "delete-ai-artifact",
    file: "test-delete-ai-artifact.mjs",
  },
  // 2026-05-08 — oauth-email-verified guard. Pins the auth.ts
  // events.signIn fix that stamps users.emailVerified=NOW() for
  // Google OAuth signups. Without this, when EMAIL_VERIFICATION_GATE=
  // on flips, every Google user gets locked out of every /api/ai/*
  // route by `assertEmailVerified` (lib/auth/email-verification.ts).
  // The Credentials provider sets emailVerified via the OTP flow;
  // OAuth had no equivalent until this commit. Pure static parse:
  // asserts the signIn handler accepts account+profile params,
  // checks provider==="google" specifically (not any provider —
  // would skip OTP for Credentials), checks Google's email_verified
  // claim === true (strict, not truthy), UPDATE has the IS NULL
  // filter for idempotency + timestamp preservation, the WHERE
  // clause scopes by userId (not all NULL rows), the try/catch is
  // present so a DB hiccup never blocks sign-in. Plus a cross-file
  // pin against the gate's read path so a column rename breaks
  // both surfaces in lockstep.
  {
    name: "oauth-email-verified",
    file: "test-oauth-email-verified.mjs",
  },
  // 2026-05-08 — ai-output-actions guard. Pins the Copy markdown +
  // Download .md affordances on /app/files/[id]/preview. Critical
  // exit ramps for the AI artifact surface — without them the page
  // is view-only and users fall back to right-click-view-source-copy
  // which loses the markdown structure. Asserts client-component
  // directive, navigator.clipboard (not legacy execCommand), object-
  // URL revocation in finally (M6 invariant), every required prop
  // wired through with the right shape (catches the silent swap-bug
  // where contentMd={row.toolId} would download wrong content), and
  // filename-sanitizer allowlist + generation special-case. Pure
  // static parse; placed after preview-page-kind-parity since both
  // pin properties of the same preview page.
  {
    name: "ai-output-actions",
    file: "test-ai-output-actions.mjs",
  },
  // 2026-04-30 aggregator-coverage guard: every scripts/test-*.mjs
  // and scripts/test-*.ts must be wired into the SUITES array
  // above. Catches orphan test files that silently never run in
  // `npm test` despite being green standalone. First run found
  // test-reverse-sweep.mjs was orphaned for an unknown duration.
  { name: "aggregator-coverage", file: "test-aggregator-coverage.mjs" },
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
    // Phase 2 (2026-04-30): some suites are TypeScript and need tsx
    // to run. A suite can specify `runner` (defaults to node's
    // execPath) and optional `args` prepended before the script path.
    // For .ts suites: `runner: "npx", args: ["tsx"]`.
    const runner = suite.runner ?? process.execPath;
    const childArgs = [...(suite.args ?? []), scriptPath];
    const child = spawn(runner, childArgs, {
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
