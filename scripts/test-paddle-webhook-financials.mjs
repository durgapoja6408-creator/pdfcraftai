#!/usr/bin/env node
// Self-contained test harness for Phase B / Task #16 — Paddle webhook
// handler populates the credit_ledger financial columns (fee / tax /
// FX / net_revenue / provider / data_source / card_fingerprint).
//
// Companion to test-credit-ledger-financials.mjs (Task #15), which
// pinned the column surface end-to-end (migration ↔ schema ↔ ledger).
// This harness pins the next layer: the normalize() path of the Paddle
// adapter must produce a LedgerFinancials payload on every captured
// transaction, the refund path must produce a symmetric negative-signed
// payload, and the ledger's handleCaptured / handleRefund must thread
// that payload into grantCredits so the row actually lands with the
// breakdown populated.
//
// What this covers:
//   SECTION A — types.ts discriminated-union contract: LedgerFinancials
//               lives here (not ledger.ts) so paddle.ts can import it
//               without a circular dependency. NormalizedPaymentEvent's
//               payment_captured + refund variants expose `financials?`.
//   SECTION B — paddle.ts normalize() transaction.completed branch:
//               PaddleTransactionEntity declares the full
//               details.totals subtree (subtotal/tax/total/fee/earnings)
//               + payments[] with payment_method_id; builder function
//               buildPaddleCapturedFinancials bakes in the Paddle-rail
//               invariants (provider="paddle", taxTreatment="mor",
//               dataSource="webhook"); normalize() attaches financials
//               to the returned payment_captured event.
//   SECTION C — paddle.ts normalize() adjustment.created refund branch:
//               PaddleAdjustmentEntity declares subtotal/tax/total/fee/
//               earnings; builder function buildPaddleRefundFinancials
//               negates every monetary field, leaves provider undefined
//               (ledger tags as refund_reversal), still sets
//               taxTreatment="mor" / dataSource="webhook".
//   SECTION D — ledger.ts handleCaptured + handleRefund call-sites:
//               event.financials is threaded into grantCredits on the
//               base row (not bonus — double-count guard); handleRefund
//               overrides provider to "refund_reversal" before passing
//               financials down.
//   SECTION E — cross-file invariants: every field on LedgerFinancials
//               (12 total) is either populated by buildPaddleCaptured-
//               Financials (10), explicitly omitted with a comment
//               (fxRateUsed / fxSlippageMicros — v1 ships these NULL,
//               Task #17 wires benchmark rates), or populated by the
//               ledger override (provider on refund).
//
// Run: `node scripts/test-paddle-webhook-financials.mjs`
// Exits 0 on pass, 1 on any failure.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const TYPES_PATH = resolve(ROOT, "lib", "payments", "types.ts");
const PADDLE_PATH = resolve(ROOT, "lib", "payments", "adapters", "paddle.ts");
const LEDGER_PATH = resolve(ROOT, "lib", "payments", "ledger.ts");

const TYPES_SRC = readFileSync(TYPES_PATH, "utf8");
const PADDLE_SRC = readFileSync(PADDLE_PATH, "utf8");
const LEDGER_SRC = readFileSync(LEDGER_PATH, "utf8");

let pass = 0;
let fail = 0;
const failures = [];

function assert(label, condition, detail) {
  if (condition) {
    pass += 1;
  } else {
    fail += 1;
    failures.push({ label, detail: detail ?? "" });
  }
}

// =============================================================================
// SECTION A: types.ts discriminated-union contract
// =============================================================================

// A1: LedgerFinancials type lives in types.ts. (The re-export from
// ledger.ts is covered by test-credit-ledger-financials.mjs C1.)
assert(
  "A1: LedgerFinancials defined in types.ts",
  /export\s+type\s+LedgerFinancials\s*=\s*\{/.test(TYPES_SRC)
);

// A2: every field on LedgerFinancials is typed. Drive this from the
// canonical field list so "add a new field" is a one-line change.
const FIN_FIELDS = [
  { name: "grossChargeMicros", type: /number/ },
  { name: "billingCurrency", type: /string/ },
  { name: "provider", type: /"paddle"|"razorpay"|"manual"|"refund_reversal"/ },
  { name: "processorFeeMicros", type: /number/ },
  { name: "taxCollectedMicros", type: /number/ },
  { name: "taxTreatment", type: /"mor"|"forward"|"rcm"|"none"/ },
  { name: "taxRemittableMicros", type: /number/ },
  { name: "fxRateUsed", type: /string\s*\|\s*number/ },
  { name: "fxSlippageMicros", type: /number/ },
  { name: "netRevenueMicros", type: /number/ },
  { name: "cardFingerprint", type: /string/ },
  { name: "dataSource", type: /"webhook"|"backfill_api"|"estimate"/ },
];

for (const f of FIN_FIELDS) {
  const optionalPattern = new RegExp(
    `${f.name}\\?:\\s*${f.type.source}`,
    f.type.flags
  );
  assert(
    `A2.${f.name}: declared with optional-property + correct type shape`,
    optionalPattern.test(TYPES_SRC)
  );
}

// A3: NormalizedPaymentEvent.payment_captured exposes financials?.
// The match is "payment_captured" variant with financials? somewhere
// before the next variant boundary ('|' followed by '{' starting a new
// discriminator).
const CAPTURED_VARIANT = TYPES_SRC.match(
  /kind:\s*"payment_captured"[\s\S]*?financials\?\s*:\s*LedgerFinancials/
);
assert(
  "A3: payment_captured variant exposes financials?: LedgerFinancials",
  CAPTURED_VARIANT !== null
);

// A4: NormalizedPaymentEvent.refund exposes financials?.
const REFUND_VARIANT = TYPES_SRC.match(
  /kind:\s*"refund"[\s\S]*?financials\?\s*:\s*LedgerFinancials/
);
assert(
  "A4: refund variant exposes financials?: LedgerFinancials",
  REFUND_VARIANT !== null
);

// A5: types.ts has NO runtime import from ./ledger. Breaking this
// guarantee re-creates the circular import we moved LedgerFinancials
// to break.
assert(
  "A5: types.ts has no import from ./ledger (circular-import guard)",
  !/from\s+["']\.\/ledger["']/.test(TYPES_SRC)
);

// =============================================================================
// SECTION B: paddle.ts normalize() transaction.completed branch
// =============================================================================

// B1: PaddleTransactionEntity declares the full details.totals subtree.
// The five monetary fields are what we need to build LedgerFinancials
// without a second REST fetch.
const TXN_TOTALS_FIELDS = ["total", "subtotal", "tax", "fee", "earnings"];
const TXN_ENTITY = PADDLE_SRC.match(
  /type\s+PaddleTransactionEntity\s*=\s*\{[\s\S]*?\n\};/
);
assert(
  "B1.entity: PaddleTransactionEntity type declared",
  TXN_ENTITY !== null
);
if (TXN_ENTITY) {
  const totalsBlock = TXN_ENTITY[0].match(/totals\?\s*:\s*\{[\s\S]*?\};/);
  assert(
    "B1.totals: PaddleTransactionEntity.details.totals block present",
    totalsBlock !== null
  );
  if (totalsBlock) {
    for (const field of TXN_TOTALS_FIELDS) {
      const fieldPattern = new RegExp(
        `\\b${field}\\?\\s*:\\s*string\\s*\\|\\s*number`
      );
      assert(
        `B1.totals.${field}: declared as string | number`,
        fieldPattern.test(totalsBlock[0])
      );
    }
  }
}

// B2: PaddleTransactionEntity includes payments[] with payment_method_id.
// That's what buildPaddleCapturedFinancials hashes to derive
// cardFingerprint.
assert(
  "B2: PaddleTransactionEntity exposes payments[].payment_method_id",
  /payments\?\s*:\s*Array<\{[\s\S]*?payment_method_id\?\s*:\s*string/.test(
    PADDLE_SRC
  )
);

// B3: buildPaddleCapturedFinancials exported. Exported (not private) so
// the eventual integration test harness can exercise it against fixture
// payloads without standing up a provider instance.
assert(
  "B3: buildPaddleCapturedFinancials exported",
  /export\s+function\s+buildPaddleCapturedFinancials\s*\(/.test(PADDLE_SRC)
);

// B4: builder bakes in Paddle-rail invariants. provider="paddle" is
// wired into every captured row; the MoR tax treatment is always "mor"
// because Paddle IS the merchant of record for this rail; dataSource
// is always "webhook" because this code path only runs from
// verifyWebhook.
assert(
  "B4.provider: builder always sets provider: \"paddle\"",
  /provider:\s*"paddle"/.test(PADDLE_SRC)
);
assert(
  "B4.taxTreatment: builder always sets taxTreatment: \"mor\"",
  /taxTreatment:\s*"mor"/.test(PADDLE_SRC)
);
assert(
  "B4.dataSource: builder always sets dataSource: \"webhook\"",
  /dataSource:\s*"webhook"/.test(PADDLE_SRC)
);

// B5: builder pulls the four consumed monetary fields out of
// details.totals. Anchor on totals?.<field> so dropping a field
// silently regresses here instead of at audit time.
//
// `subtotal` is declared on the entity (B1.totals.subtotal) for future
// use as a redundant-validation check (total - tax ?= subtotal) but is
// not consumed by the builder today — the ledger has a gross column
// (total, pre-tax + tax) and a tax column, so subtotal would be
// double-bookkeeping. Tracked separately from this invariant.
for (const field of ["total", "tax", "fee", "earnings"]) {
  const pattern = new RegExp(`totals\\?\\.${field}\\b`);
  assert(
    `B5.${field}: buildPaddleCapturedFinancials reads totals?.${field}`,
    pattern.test(PADDLE_SRC)
  );
}

// B6: builder uses paddleMinorToMicros to convert. Guards against a
// future refactor introducing raw Number() coercion that would silently
// drop the cents→micros factor.
assert(
  "B6.converter: paddleMinorToMicros declared and used for conversion",
  /function\s+paddleMinorToMicros\s*\(/.test(PADDLE_SRC) &&
    /paddleMinorToMicros\s*\(\s*totals\?\.\w+\s*\)/.test(PADDLE_SRC)
);

// B7: MoR semantics — taxRemittableMicros always 0 on captured rows
// (Paddle remits on our behalf; we owe nothing). Catch a regression
// that mistakenly set it to taxCollectedMicros.
assert(
  "B7: taxRemittableMicros set to 0 on MoR rows (Paddle remits)",
  /taxRemittableMicros:\s*0/.test(PADDLE_SRC)
);

// B8: cardFingerprint derived from payment_method_id via
// fingerprintPaymentMethod (SHA256 prefix). Guards against any
// future change that stored the raw payment_method_id — which would
// let the ledger row be used to re-charge.
assert(
  "B8.fingerprinter: fingerprintPaymentMethod declared and uses SHA256",
  /function\s+fingerprintPaymentMethod\s*\(/.test(PADDLE_SRC) &&
    /createHash\(\s*"sha256"\s*\)[\s\S]*?\.digest\(\s*"hex"\s*\)/.test(
      PADDLE_SRC
    )
);
assert(
  "B8.call: builder derives cardFingerprint via fingerprintPaymentMethod",
  /cardFingerprint:\s*fingerprintPaymentMethod\(/.test(PADDLE_SRC)
);

// B9: normalize() attaches financials to the payment_captured event.
// The match anchors on the transaction.completed branch so we don't
// confuse this with the refund branch below.
const CAPTURED_BRANCH = PADDLE_SRC.match(
  /transaction\.completed[\s\S]*?kind:\s*"payment_captured"[\s\S]*?financials[\s\S]*?\};/
);
assert(
  "B9: normalize() transaction.completed branch attaches financials",
  CAPTURED_BRANCH !== null
);

// =============================================================================
// SECTION C: paddle.ts normalize() adjustment.created refund branch
// =============================================================================

// C1: PaddleAdjustmentEntity declares the full totals subtree.
const ADJ_ENTITY = PADDLE_SRC.match(
  /type\s+PaddleAdjustmentEntity\s*=\s*\{[\s\S]*?\n\};/
);
assert(
  "C1.entity: PaddleAdjustmentEntity type declared",
  ADJ_ENTITY !== null
);
if (ADJ_ENTITY) {
  for (const field of TXN_TOTALS_FIELDS) {
    const fieldPattern = new RegExp(
      `\\b${field}\\?\\s*:\\s*string\\s*\\|\\s*number`
    );
    assert(
      `C1.totals.${field}: PaddleAdjustmentEntity.totals declares ${field}`,
      fieldPattern.test(ADJ_ENTITY[0])
    );
  }
}

// C2: buildPaddleRefundFinancials exported.
assert(
  "C2: buildPaddleRefundFinancials exported",
  /export\s+function\s+buildPaddleRefundFinancials\s*\(/.test(PADDLE_SRC)
);

// C3: refund builder negates every monetary field. Written as a local
// `neg()` helper — the match pins the definition + application.
assert(
  "C3.neg: refund builder defines a negation helper",
  /const\s+neg\s*=\s*\([^)]+\)[\s\S]{0,120}?=>\s*[\s\S]{0,120}?-\s*\w+/.test(
    PADDLE_SRC
  )
);

// C4: refund builder does NOT set provider (the ledger fills
// "refund_reversal"). We pin the ABSENCE of a `provider: "..."` line
// in the buildPaddleRefundFinancials body.
const REFUND_BUILDER_BODY = PADDLE_SRC.match(
  /export\s+function\s+buildPaddleRefundFinancials[\s\S]*?^}/m
);
assert(
  "C4.body: buildPaddleRefundFinancials body extracted",
  REFUND_BUILDER_BODY !== null
);
if (REFUND_BUILDER_BODY) {
  assert(
    "C4.noprovider: refund builder does NOT set provider directly",
    !/provider:\s*"paddle"/.test(REFUND_BUILDER_BODY[0]) &&
      !/provider:\s*"refund_reversal"/.test(REFUND_BUILDER_BODY[0])
  );
  // But it DOES still set taxTreatment + dataSource — the MoR
  // semantics carry through to the reversal.
  assert(
    "C4.taxTreatment: refund builder sets taxTreatment: \"mor\"",
    /taxTreatment:\s*"mor"/.test(REFUND_BUILDER_BODY[0])
  );
  assert(
    "C4.dataSource: refund builder sets dataSource: \"webhook\"",
    /dataSource:\s*"webhook"/.test(REFUND_BUILDER_BODY[0])
  );
}

// C5: normalize() adjustment.created refund branch attaches financials
// to the returned refund event.
const REFUND_BRANCH = PADDLE_SRC.match(
  /adjustment\.created[\s\S]*?kind:\s*"refund"[\s\S]*?financials[\s\S]*?\};/
);
assert(
  "C5: normalize() adjustment.created/updated branch attaches financials",
  REFUND_BRANCH !== null
);

// =============================================================================
// SECTION D: ledger.ts handleCaptured + handleRefund call-sites
// =============================================================================

// D1: handleCaptured threads event.financials into the BASE grant.
// Anchor on the base idempotencyKey so we catch a regression that
// accidentally put financials on the bonus row (which would double-
// count in /admin/margin aggregates).
const BASE_GRANT = LEDGER_SRC.match(
  /idempotencyKey:\s*`\$\{payment\.id\}:base`[\s\S]{0,200}?financials:\s*event\.financials/
);
assert(
  "D1: handleCaptured base grant threads event.financials",
  BASE_GRANT !== null
);

// D2: handleCaptured does NOT thread financials into the BONUS grant.
// The bonus grant lives under the `if (pack.bonus > 0)` block; its
// grantCredits call must NOT have a financials field set (NULL
// financials on bonus rows is the intended semantics — see Task #15
// docs for "NULL means not categorized, never zero revenue").
const BONUS_GRANT = LEDGER_SRC.match(
  /idempotencyKey:\s*`\$\{payment\.id\}:bonus`[\s\S]{0,200}?\}\);/
);
assert(
  "D2.body: handleCaptured bonus grant body extracted",
  BONUS_GRANT !== null
);
if (BONUS_GRANT) {
  assert(
    "D2.nofinancials: bonus grant does NOT set financials (avoids double-count)",
    !/financials:\s*event\.financials/.test(BONUS_GRANT[0])
  );
}

// D3: handleRefund builds a LedgerFinancials with provider forced to
// "refund_reversal", spreading the event's financials underneath.
// This is the ledger-side provenance tag — adapters leave provider
// undefined on refund events by convention (see types.ts docstring).
assert(
  "D3.override: handleRefund sets provider: \"refund_reversal\" on debit row",
  /const\s+refundFinancials:\s*LedgerFinancials\s*=\s*\{[\s\S]*?\.\.\.\(event\.financials\s*\?\?\s*\{\}\)[\s\S]*?provider:\s*"refund_reversal"/.test(
    LEDGER_SRC
  )
);

// D4: handleRefund threads refundFinancials into the grantCredits call.
assert(
  "D4: handleRefund refund grant threads refundFinancials",
  /idempotencyKey:\s*`\$\{payment\.id\}:refund:\$\{event\.providerRefundRef\}`[\s\S]{0,200}?financials:\s*refundFinancials/.test(
    LEDGER_SRC
  )
);

// =============================================================================
// SECTION E: cross-file invariants
// =============================================================================

// E1: every LedgerFinancials field that buildPaddleCapturedFinancials
// can populate from a Paddle webhook actually appears in the builder
// body. FX fields (fxRateUsed, fxSlippageMicros) are intentionally left
// undefined in v1 — Paddle doesn't expose the FX rate on the webhook,
// and benchmark-rate comparison is Task #17. This assertion pins the
// v1 coverage so a future change can't silently stop populating a
// field we *can* populate today.
const CAPTURED_BUILDER_BODY = PADDLE_SRC.match(
  /export\s+function\s+buildPaddleCapturedFinancials[\s\S]*?^}/m
);
assert(
  "E1.body: buildPaddleCapturedFinancials body extracted",
  CAPTURED_BUILDER_BODY !== null
);
if (CAPTURED_BUILDER_BODY) {
  const POPULATED_FIELDS = [
    "grossChargeMicros",
    "billingCurrency",
    "provider",
    "processorFeeMicros",
    "taxCollectedMicros",
    "taxTreatment",
    "taxRemittableMicros",
    "netRevenueMicros",
    "cardFingerprint",
    "dataSource",
  ];
  for (const f of POPULATED_FIELDS) {
    const p = new RegExp(`${f}:\\s*`);
    assert(
      `E1.${f}: captured builder populates ${f}`,
      p.test(CAPTURED_BUILDER_BODY[0])
    );
  }
  // And v1-deferred: the FX fields MUST NOT appear in the builder body
  // (they must stay undefined so the ledger column is NULL and
  // /admin/margin classifies the row as "not yet categorized" for FX,
  // never as "FX slippage zero").
  assert(
    "E1.fxRateUsed: captured builder leaves fxRateUsed undefined (Task #17 scope)",
    !/fxRateUsed:\s*[^u]/.test(CAPTURED_BUILDER_BODY[0])
  );
  assert(
    "E1.fxSlippageMicros: captured builder leaves fxSlippageMicros undefined (Task #17 scope)",
    !/fxSlippageMicros:\s*[^u]/.test(CAPTURED_BUILDER_BODY[0])
  );
}

// E2: refund builder symmetry — the same field coverage minus
// cardFingerprint (intentionally omitted on refunds — the refund
// row traces back to the payment via internalPaymentId; duplicating
// the card tag would invite consistency bugs if the buyer changed
// cards between charge + refund) and provider (ledger-side tag).
if (REFUND_BUILDER_BODY) {
  const REFUND_POPULATED_FIELDS = [
    "grossChargeMicros",
    "billingCurrency",
    "processorFeeMicros",
    "taxCollectedMicros",
    "taxTreatment",
    "taxRemittableMicros",
    "netRevenueMicros",
    "dataSource",
  ];
  for (const f of REFUND_POPULATED_FIELDS) {
    const p = new RegExp(`${f}:\\s*`);
    assert(
      `E2.${f}: refund builder populates ${f}`,
      p.test(REFUND_BUILDER_BODY[0])
    );
  }
}

// E3: paddle.ts imports LedgerFinancials from ../types (NOT from
// ../ledger). This is the circular-import guard from the adapter side.
assert(
  "E3: paddle.ts imports LedgerFinancials from ../types",
  /import\s+type\s*\{[\s\S]*?\bLedgerFinancials\b[\s\S]*?\}\s*from\s*["']\.\.\/types["']/.test(
    PADDLE_SRC
  )
);
assert(
  "E3.noloop: paddle.ts does NOT import from ../ledger (circular guard)",
  !/from\s+["']\.\.\/ledger["']/.test(PADDLE_SRC)
);

// E4: ledger.ts imports LedgerFinancials as a type-only import (so the
// type move doesn't introduce a runtime import cycle).
assert(
  "E4: ledger.ts uses type-only import for LedgerFinancials",
  /import\s+type\s*\{[\s\S]*?\bLedgerFinancials\b[\s\S]*?\}\s*from\s*["']\.\/types["']/.test(
    LEDGER_SRC
  )
);

// =============================================================================
// Report
// =============================================================================
console.log("");
if (fail === 0) {
  console.log(`paddle-webhook-financials: ${pass} passed, ${fail} failed`);
  process.exit(0);
} else {
  console.log(`paddle-webhook-financials: ${pass} passed, ${fail} failed`);
  for (const f of failures) {
    console.log(`  — ${f.label}${f.detail ? ` :: ${f.detail}` : ""}`);
  }
  process.exit(1);
}
