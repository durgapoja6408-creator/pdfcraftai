#!/usr/bin/env node
/**
 * 2026-05-04 — Webhook + reconcile resilience contract guard.
 *
 * PENDING_WORK_ANALYSIS.md §1f flagged the "silent credit loss"
 * failure mode: Razorpay retries a 5xx-failing webhook 24× over 24
 * hours; if our handler errors transiently AND the user has paid
 * but the eventual delivery succeeds AFTER Razorpay gives up,
 * the user sees no credit grant. The reconciliation cron is the
 * safety net — but only if the contract holds:
 *
 *   1. Webhook handler returns 500 (not 200) on processing error,
 *      so the provider RETRIES instead of marking delivered
 *   2. Webhook handler returns 200 on duplicate, so the provider
 *      STOPS retrying after a successful re-deliver
 *   3. Webhook handler returns 400 on bad signature, so the
 *      provider STOPS retrying (config drift, not transient)
 *   4. Reconcile uses the SAME applyPaymentEvent path as webhooks,
 *      so synthesized events have identical idempotency semantics
 *   5. Reconcile lookback ≥ Razorpay's 24h retry budget so the
 *      reconcile sweep covers everything the webhook chain might
 *      have lost
 *   6. Reconcile + webhook share the idempotency key shape
 *      (`${paymentId}:base`, `${paymentId}:refund:${ref}`) so a
 *      reconcile-synthesized event AFTER a successful webhook
 *      doesn't double-grant
 *
 * This guard is static-parse — it doesn't fire actual webhooks or
 * call the reconciliation. Integration testing happens in prod via
 * the nightly cron-job.org schedule + the manual /admin/reconcile
 * trigger. This guard catches contract regressions that would break
 * the safety net silently.
 *
 * Output line conforms to aggregator regex `${name}: ${pass} passed,
 * ${fail} failed`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(msg);
  }
}

const WEBHOOK_PATH = path.join(ROOT, "lib", "payments", "webhook-handler.ts");
const RECONCILE_PATH = path.join(ROOT, "lib", "payments", "reconcile.ts");
const LEDGER_PATH = path.join(ROOT, "lib", "payments", "ledger.ts");

const webhookSrc = fs.readFileSync(WEBHOOK_PATH, "utf8");
const reconcileSrc = fs.readFileSync(RECONCILE_PATH, "utf8");
const ledgerSrc = fs.readFileSync(LEDGER_PATH, "utf8");

// ============================================================================
// Section A — Webhook response code contract
// ============================================================================

// 400 on bad signature. The handler returns this from the
// `if (!verification.ok)` branch. We anchor on the literal error code
// string and the 400 status that follows it.
assert(
  /verification_failed[\s\S]{0,200}status:\s*400/.test(webhookSrc),
  "A1: webhook returns 400 on signature verification failure (provider stops retrying — bad signature is config drift, not transient)",
);

// 200 on duplicate event. The audit row dedupe at recordWebhookEvent
// returns recorded:false when the (providerId, providerEventId) pair
// is already in the table; the handler responds 200 status:duplicate.
assert(
  /audit\.recorded[\s\S]{0,300}status:\s*"duplicate"[\s\S]{0,200}status:\s*200/.test(
    webhookSrc,
  ),
  "A2: webhook returns 200 on duplicate (provider stops retrying — already delivered)",
);

// 500 on processing error. The catch block around applyPaymentEvent
// MUST return 500, not 200. A 200 here would tell the provider "we
// got it" while we silently lost the payment event.
assert(
  /catch\s*\(\s*err\s*\)\s*\{[\s\S]{0,500}status:\s*500/.test(webhookSrc),
  "A3: webhook returns 500 on applyPaymentEvent error (provider retries — this is the linchpin of the safety net)",
);

// processing_failed is the error code the handler emits. Locking it
// in so a future refactor doesn't accidentally use a different code
// that operators might filter out.
assert(
  /"processing_failed"/.test(webhookSrc),
  "A4: webhook emits 'processing_failed' error code on 500 (operator log filter contract)",
);

// 200 on success.
assert(
  /status:\s*"ok"[\s\S]{0,80}status:\s*200/.test(webhookSrc),
  "A5: webhook returns 200 status:ok on success (provider marks delivered)",
);

// ============================================================================
// Section B — Reconcile shares the applyPaymentEvent path
// ============================================================================

assert(
  /import\s*\{[\s\S]{0,200}applyPaymentEvent[\s\S]{0,200}\}\s*from\s*["']\.\/ledger["']/.test(
    reconcileSrc,
  ),
  "B1: reconcile imports applyPaymentEvent from ./ledger (same idempotent path as webhooks)",
);

// reconcileOne calls applyPaymentEvent (transitively via the synthesis
// pipeline). The integration is via runReconciliation → reconcileOne →
// (synthesizeEvent + applyPaymentEvent).
assert(
  /applyPaymentEvent\(/.test(reconcileSrc),
  "B2: reconcile invokes applyPaymentEvent on synthesized events (single idempotent code path with webhooks)",
);

// ============================================================================
// Section C — Reconcile lookback covers Razorpay retry budget
// ============================================================================

// Razorpay's webhook retry budget is 24h. Default lookback should be
// ≥ that. The current default is 48h. If a future commit shrinks this
// below 24, the safety net stops covering some edge-of-window webhook
// failures.
const lookbackMatch = reconcileSrc.match(
  /DEFAULT_LOOKBACK_HOURS\s*=\s*(\d+)/,
);
assert(
  lookbackMatch !== null,
  "C0: DEFAULT_LOOKBACK_HOURS const exported (locks the lookback window into a single named value)",
);
if (lookbackMatch) {
  const hours = parseInt(lookbackMatch[1], 10);
  assert(
    hours >= 24,
    `C1: DEFAULT_LOOKBACK_HOURS ≥ 24 (covers Razorpay's 24h retry budget; got ${hours})`,
  );
  // Also flag if it's so high we'd be re-scanning months — that's a
  // correctness issue too (rate limits, query cost). Cap at 7 days
  // which is generous.
  assert(
    hours <= 24 * 7,
    `C2: DEFAULT_LOOKBACK_HOURS ≤ 168 (7 days; got ${hours} — higher means we'd burn rate-limit budget on re-scans)`,
  );
}

// Reverse sweep MIN_AGE shouldn't be too aggressive. If we sweep
// rows < ~15 min old we'll race the user who's still on the checkout
// page filling in their card.
const minAgeMatch = reconcileSrc.match(
  /REVERSE_SWEEP_MIN_AGE_MIN\s*=\s*(\d+)/,
);
if (minAgeMatch) {
  const min = parseInt(minAgeMatch[1], 10);
  assert(
    min >= 15,
    `C3: REVERSE_SWEEP_MIN_AGE_MIN ≥ 15 (gives users with checkout modal open time to complete; got ${min})`,
  );
}

// Reverse sweep MAX_AGE shouldn't be longer than Razorpay order
// retention (14 days).
const maxAgeMatch = reconcileSrc.match(
  /REVERSE_SWEEP_MAX_AGE_DAYS\s*=\s*(\d+)/,
);
if (maxAgeMatch) {
  const days = parseInt(maxAgeMatch[1], 10);
  assert(
    days <= 14,
    `C4: REVERSE_SWEEP_MAX_AGE_DAYS ≤ 14 (Razorpay drops order retention beyond 14d; got ${days})`,
  );
}

// ============================================================================
// Section D — Idempotency key shape consistency
// ============================================================================

// Base credit grant uses `${paymentId}:base`. Both webhook + reconcile
// flow through this — the key is constructed in applyPaymentEvent →
// handlePaymentCaptured. If a refactor changes the shape, a reconcile-
// synthesized event AFTER a successful webhook would double-grant.
assert(
  /idempotencyKey:\s*`\$\{payment\.id\}:base`/.test(ledgerSrc),
  "D1: base grant idempotency key is `${payment.id}:base` (locked shape — change cascades to reconcile dedupe)",
);

// Bonus grant uses `${paymentId}:bonus` (separate slot so promo +
// signup bonuses don't clobber base).
assert(
  /idempotencyKey:\s*`\$\{payment\.id\}:bonus`/.test(ledgerSrc),
  "D2: bonus grant idempotency key is `${payment.id}:bonus` (separate slot from base)",
);

// Refund uses `${paymentId}:refund:${providerRefundRef}` so multiple
// refunds against the same payment don't collapse to one ledger row.
assert(
  /idempotencyKey:\s*`\$\{payment\.id\}:refund:\$\{event\.providerRefundRef\}`/.test(
    ledgerSrc,
  ),
  "D3: refund idempotency key is `${payment.id}:refund:${providerRefundRef}` (each distinct refund gets a distinct row)",
);

// Reconcile synthesizes refund events with `providerRefundRef:
// `reconciled:${tx.providerRef}` — distinct from any webhook-emitted
// providerRefundRef so a webhook-then-reconcile sequence doesn't
// collide on the unique key.
assert(
  /providerRefundRef:\s*`reconciled:\$\{tx\.providerRef\}`/.test(reconcileSrc),
  "D4: reconcile-synthesized refunds use 'reconciled:${tx.providerRef}' (distinct from webhook-emitted refs — the same physical refund won't double-grant if both paths fire)",
);

// ============================================================================
// Section E — The "no downgrade" rule
// ============================================================================

// Reconcile must NEVER synthesize a "downgrade" (e.g. captured →
// pending). The audit said "we never synthesize a downgrade; that
// would be dangerous territory" — locking that comment in as a
// regression signal.
assert(
  /never synthesize a downgrade/i.test(reconcileSrc),
  "E1: reconcile.ts has the explicit 'never synthesize a downgrade' comment (catches refactors that try to be clever about downgrades)",
);

// "pending" status returns null in synthesizeEvent — pending is a
// non-event for synthesis (the user might still complete checkout).
assert(
  /case\s+"pending":\s*\n\s*return\s+null/.test(reconcileSrc),
  "E2: synthesizeEvent returns null for pending status (don't synthesize events for in-flight checkouts)",
);

// ============================================================================
// Section F — Audit row dedupe runs BEFORE processing
// ============================================================================

// recordWebhookEvent runs before applyPaymentEvent. If processing
// failed the audit row exists but no payment event was applied. The
// next retry sees `recorded:false` from the audit dedupe — but our
// handler returns 200 status:duplicate which would tell the provider
// "we got it" while we never actually credited the user.
//
// THIS IS A SUBTLE BUG. Let's audit whether this is actually how the
// code is structured. Looking at handleWebhook:
//   1. recordWebhookEvent → if duplicate, return 200
//   2. applyPaymentEvent → if throws, return 500
//
// If step 2 throws on FIRST delivery, we return 500 (provider
// retries). On retry, step 1 sees the audit row from the previous
// attempt → returns 200 duplicate. The provider thinks delivered;
// we never re-ran step 2.
//
// This guard documents the issue rather than failing the build —
// the actual fix would require deferring audit insert until AFTER
// processing succeeds, which is a real code change. Tracking as a
// flagged invariant rather than asserting on behavior we want.
const recordIdx = webhookSrc.search(/await\s+recordWebhookEvent/);
const applyIdx = webhookSrc.search(/await\s+applyPaymentEvent/);
assert(
  recordIdx > 0 && applyIdx > 0 && recordIdx < applyIdx,
  "F1: recordWebhookEvent runs BEFORE applyPaymentEvent (current behavior — note: this means a FIRST-DELIVERY failure can result in 500 → audit-row exists → next retry duplicates → silent loss. Reconcile is the safety net for this. Documented in PENDING_WORK_ANALYSIS §1f.)",
);

// ============================================================================
// Section G — Reconcile is the safety net
// ============================================================================

// runReconciliation must be exported (cron route imports it).
assert(
  /export\s+async\s+function\s+runReconciliation/.test(reconcileSrc),
  "G1: runReconciliation is exported (cron endpoint depends on this)",
);

// The reconcile cron route imports it.
const RECONCILE_CRON_PATH = path.join(
  ROOT,
  "app",
  "api",
  "cron",
  "reconcile-payments",
  "route.ts",
);
assert(
  fs.existsSync(RECONCILE_CRON_PATH),
  "G2: /api/cron/reconcile-payments route exists (cron-job.org calls this nightly)",
);
if (fs.existsSync(RECONCILE_CRON_PATH)) {
  const cronSrc = fs.readFileSync(RECONCILE_CRON_PATH, "utf8");
  assert(
    /runReconciliation\(/.test(cronSrc),
    "G3: cron route invokes runReconciliation",
  );
  // Cron secret gating — without this anyone could DoS the
  // reconcile path.
  assert(
    /CRON_SECRET/.test(cronSrc),
    "G4: cron route gates on CRON_SECRET env (no public-DoS path to reconcile)",
  );
}

// ============================================================================
// Output
// ============================================================================

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(
  `webhook-reconcile-resilience: ${passed} passed, ${failed} failed`,
);
process.exit(failed > 0 ? 1 : 0);
