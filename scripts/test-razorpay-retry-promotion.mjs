#!/usr/bin/env node
// scripts/test-razorpay-retry-promotion.mjs
//
// Pins Task #21 — `handleCaptured` in lib/payments/ledger.ts MUST
// promote payments.status from BOTH "pending" AND "failed" to "captured".
// The original code had `status === "pending"` only, which silently
// wedged the retry flow (card fails → user pivots to netbanking → same
// order_id captures on a different pay_id). Credits still got granted
// (idempotency key), but /app/billing kept showing "Failed" for a
// successful purchase AND Razorpay dashboard ↔ our DB reconciliation
// broke because our `provider_ref` pointed at the losing pay_id.
//
// Production evidence (decoded from webhook_events.raw_payload on
// 2026-04-24): payment id `eee72226-73cc-4836-86bf-781b00e9184a`
// received THREE webhooks against order `order_ShAnYSoHGUYhxu`:
//   1. payment.failed     pay_ShAoBk82MXko1V  method=card        error=payment_risk_check_failed
//   2. payment.authorized pay_ShAoYWvUuLAEZM  method=netbanking  (→ normalized payment_captured)
//   3. payment.captured   pay_ShAoYWvUuLAEZM  method=netbanking
// The same pattern also affected pay_Sgb9rg6ehLV0CB on 2026-04-22
// (card failed → netbanking captured). In both cases payments.status
// stayed "failed" despite credits being granted correctly.
//
// This suite is intentionally static-analysis (regex on the source) —
// the same pattern used by test-razorpay-handoff.mjs and
// test-paddle-webhook-financials.mjs. A full live-DB integration test
// would need a test harness we don't have in the sandbox (the prod DB
// is on Hostinger via SSH). The regex pins lock in the SHAPE of the
// fix so a future refactor of ledger.ts can't silently regress Task #21.
//
// Run: `node scripts/test-razorpay-retry-promotion.mjs`
// Exits 0 on pass, 1 on any failure.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const LEDGER_PATH = resolve(ROOT, "lib", "payments", "ledger.ts");
const LEDGER_SRC = readFileSync(LEDGER_PATH, "utf8");

let pass = 0;
let fail = 0;
const failures = [];

function assert(label, cond, detail) {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    failures.push({ label, detail: detail ?? "" });
  }
}

// Extract the handleCaptured function body so the assertions below
// scope to the right call-site (the file has handleFailed /
// handleRefund / handleSubscription which must NOT match).
const CAPTURED_FN_MATCH = LEDGER_SRC.match(
  /async function handleCaptured\([\s\S]*?\n\}/
);
const CAPTURED_FN_SRC = CAPTURED_FN_MATCH ? CAPTURED_FN_MATCH[0] : "";
// And handleFailed — we assert its guard STILL only allows pending →
// failed (the mirror property: never demote a captured row).
const FAILED_FN_MATCH = LEDGER_SRC.match(
  /async function handleFailed\([\s\S]*?\n\}/
);
const FAILED_FN_SRC = FAILED_FN_MATCH ? FAILED_FN_MATCH[0] : "";

// =============================================================================
// SECTION A — handleCaptured reads providerRef + metadata from the row
// =============================================================================
// Needed because the retry-promotion branch archives the losing pay_id
// into metadata.priorAttempts[], which requires both the prior
// providerRef and the existing metadata object.

assert(
  "A1 handleCaptured selects providerRef from the payments row",
  /providerRef:\s*schema\.payments\.providerRef/.test(CAPTURED_FN_SRC),
  "The retry-promotion branch needs the LOSING pay_id so it can archive it to metadata.priorAttempts. Without this select, we lose audit trail for dispute/chargeback lookups."
);

assert(
  "A2 handleCaptured selects metadata from the payments row",
  /metadata:\s*schema\.payments\.metadata/.test(CAPTURED_FN_SRC),
  "We need the existing metadata (routeRail/routeCountry/promoCode/…) so the priorAttempts merge doesn't clobber route-decision audit. Tests that route metadata is preserved live in the merge assertions below."
);

// =============================================================================
// SECTION B — Status-transition guard permits pending OR failed → captured
// =============================================================================

assert(
  "B1 handleCaptured guard admits payment.status === \"pending\"",
  /payment\.status\s*===\s*"pending"/.test(CAPTURED_FN_SRC),
  "The original (pre-Task #21) behavior — first-attempt capture — must still promote pending → captured. Removing this would break every happy-path payment."
);

assert(
  "B2 handleCaptured guard admits payment.status === \"failed\" (Task #21 fix)",
  /payment\.status\s*===\s*"failed"/.test(CAPTURED_FN_SRC),
  "THE fix for Task #21. When Razorpay sends payment.failed for attempt 1 (card blocked by domain allowlist, 3DS timeout, declined) and later payment.captured for attempt 2 on the same order_id, the row MUST be promoted failed → captured. Without this, /app/billing lies (\"Failed\" for a successful purchase) and Razorpay reconciliation breaks (their dashboard shows captured, our DB shows failed against the wrong pay_id)."
);

assert(
  "B3 handleCaptured guard uses OR, not AND, between pending and failed",
  /payment\.status\s*===\s*"pending"\s*\|\|\s*payment\.status\s*===\s*"failed"/.test(
    CAPTURED_FN_SRC
  ),
  "The two status admissions must be combined with || (not &&, not separate blocks) so both transitions end up inside the SAME update() call. Two separate blocks would double-update the row and double-serialize the metadata merge."
);

assert(
  "B4 handleCaptured does NOT promote refunded rows into captured",
  !/payment\.status\s*===\s*"refunded"/.test(CAPTURED_FN_SRC) &&
    !/payment\.status\s*===\s*"partial_refund"/.test(CAPTURED_FN_SRC),
  "A late payment.captured event arriving AFTER a refund must NOT silently un-refund the payment — that would be a real financial bug. The existing implicit guard (refunded/partial_refund falls through the if) is correct; never add those statuses to the promotion set."
);

// =============================================================================
// SECTION C — UPDATE statement threads new providerRef + merged metadata
// =============================================================================

assert(
  "C1 handleCaptured sets status: \"captured\" in the UPDATE",
  /\.set\(\s*\{[\s\S]{0,400}?\bstatus\s*:\s*"captured"/.test(CAPTURED_FN_SRC),
  "The end-state of a successful capture MUST be status=\"captured\". Any other value (e.g. \"authorized\" for the intermediate Razorpay state) would keep the UI showing wrong status."
);

assert(
  "C2 handleCaptured sets providerRef: event.providerRef in the UPDATE",
  /\.set\(\s*\{[\s\S]{0,600}?\bproviderRef\s*:\s*event\.providerRef/.test(
    CAPTURED_FN_SRC
  ),
  "On retry-promotion, the DB row's providerRef MUST be updated to the winning pay_id so Razorpay dashboard reconciliation (their pay_id → our DB row) still works after the fix. Stale providerRef = broken dispute/chargeback lookup."
);

assert(
  "C3 handleCaptured sets metadata to a merged object including priorAttempts",
  /\.set\(\s*\{[\s\S]{0,600}?\bmetadata\s*:\s*\{\s*\.\.\.priorMeta,\s*priorAttempts\s*\}/.test(
    CAPTURED_FN_SRC
  ),
  "The UPDATE must spread the existing metadata (routeRail, routeCountry, promoCode, …) and only add/update priorAttempts. A bare `metadata: { priorAttempts }` would wipe the route-decision audit fields every time, and downstream admin-margin queries read those route fields."
);

// =============================================================================
// SECTION D — priorAttempts construction captures the losing pay_id
// =============================================================================

assert(
  "D1 priorAttempts is initialized from existing metadata.priorAttempts array",
  /Array\.isArray\(priorMeta\.priorAttempts\)\s*\?\s*\[\.\.\.\(priorMeta\.priorAttempts as unknown\[\]\)\]\s*:\s*\[\]/.test(
    CAPTURED_FN_SRC
  ),
  "If this is the Nth retry (not the first), metadata.priorAttempts already has prior failed attempts — we must preserve them, not overwrite. Array.isArray guards against corrupted metadata that stored priorAttempts as a non-array."
);

assert(
  "D2 priorAttempts push is gated on failed→captured (not on pending→captured)",
  /if\s*\(\s*payment\.status\s*===\s*"failed"[\s\S]{0,200}?priorAttempts\.push/.test(
    CAPTURED_FN_SRC
  ),
  "Pending → captured is the happy path (no prior failed attempt) and has nothing to archive. Pushing on every capture would produce meaningless empty attempt objects."
);

assert(
  "D3 priorAttempts push is gated on providerRef != event.providerRef",
  /payment\.providerRef\s*!==\s*event\.providerRef[\s\S]{0,200}?priorAttempts\.push/.test(
    CAPTURED_FN_SRC
  ),
  "Defensive: if the exact same pay_id somehow fires both a payment.failed AND a payment.captured event (edge case we haven't seen in prod but can't rule out), don't add it to priorAttempts — it wasn't a separate attempt."
);

assert(
  "D4 priorAttempts entry shape: providerRef + outcome + promotedAt",
  /priorAttempts\.push\(\s*\{\s*providerRef\s*:\s*payment\.providerRef\s*,\s*outcome\s*:\s*"failed"\s*,\s*promotedAt\s*:\s*new Date\(\)\.toISOString\(\)\s*,?\s*\}\s*\)/.test(
    CAPTURED_FN_SRC
  ),
  "The entry must carry: the losing provider_ref (pay_id), outcome=\"failed\", and a timestamp. Dispute-lookup tooling reads all three — without outcome, a row with priorAttempts can't distinguish failed-but-recovered from some future outcome (e.g. user-cancelled)."
);

// =============================================================================
// SECTION E — handleFailed still refuses to demote a captured row
// =============================================================================
// Mirror of B4 — if this guard gets accidentally relaxed, a late
// payment.failed event would demote a legitimately captured payment
// back to failed, losing the UI signal AND confusing the audit trail.

assert(
  "E1 handleFailed still gates on payment.status === \"pending\" only",
  /if\s*\(\s*payment\.status\s*===\s*"pending"\s*\)/.test(FAILED_FN_SRC),
  "The mirror property of Task #21: handleFailed MUST NOT demote captured → failed. Only pending → failed is legal. Any relaxation here (e.g. accidentally matching the handleCaptured guard) would regress the \"captured payments can't be undone by a late failed webhook\" invariant."
);

assert(
  "E2 handleFailed does NOT match the failed-status admission",
  !/payment\.status\s*===\s*"failed"[\s\S]{0,80}?\.set\(\s*\{[\s\S]{0,200}?status\s*:\s*"failed"/.test(
    FAILED_FN_SRC
  ),
  "Scanner: don't let a future refactor copy-paste the handleCaptured guard into handleFailed. That would create a loop where a payment.failed event could re-demote a (still-status-failed) row which then gets promoted again — introducing thrash on RSC prefetches and more log noise."
);

// =============================================================================
// SECTION F — Idempotency of the credit grant is UNCHANGED by the fix
// =============================================================================
// The credit grant path (grantCredits with idempotencyKey `${payment.id}:base`)
// must still run regardless of whether the row came in as pending or
// failed — it's what granted credits correctly in the 2 production
// rows affected before the fix landed.

assert(
  "F1 handleCaptured calls grantCredits with idempotencyKey `${payment.id}:base`",
  /idempotencyKey:\s*`\$\{payment\.id\}:base`/.test(CAPTURED_FN_SRC),
  "The idempotency key is what made the bug \"only\" a UI / reconciliation bug — it's why credits weren't double-granted despite the status-update guard being wrong. Never remove this."
);

assert(
  "F2 handleCaptured credit grant sits OUTSIDE the status-transition guard",
  // grantCredits({ must appear AFTER the status-update if-block in the function body
  // We don't want a regression where grantCredits is accidentally indented into
  // the if, causing credits to only grant when status was pending.
  (() => {
    const m = CAPTURED_FN_SRC.match(
      /if\s*\(\s*payment\.status\s*===\s*"pending"\s*\|\|\s*payment\.status\s*===\s*"failed"\s*\)[\s\S]*?\n\s*\}\s*\n/
    );
    if (!m) return false;
    const afterGuard = CAPTURED_FN_SRC.slice(m.index + m[0].length);
    return /await grantCredits\(/.test(afterGuard);
  })(),
  "Moving the grantCredits call INSIDE the status-update guard would re-introduce a real bug: a legitimate replay of payment.captured (status already captured) would skip the guard body AND skip the credit grant — meaning no idempotent no-op. Credits would appear to drop on replay. Keep grantCredits at the function-body scope."
);

// =============================================================================
// Report
// =============================================================================

const total = pass + fail;
console.log("");
if (fail > 0) {
  console.log("FAILURES:");
  for (const f of failures) {
    console.log(`  ✗ ${f.label}`);
    if (f.detail) console.log(`      ${f.detail}`);
  }
  console.log("");
}
// Final line MUST match `N passed, M failed` — scripts/run-all-tests.mjs
// parses this tail. Without it the aggregator reports "(summary
// unparseable)" and marks the suite as failed even when every assertion
// passed.
console.log(
  `test-razorpay-retry-promotion: ${pass} passed, ${fail} failed (of ${total})`
);
process.exit(fail > 0 ? 1 : 0);
