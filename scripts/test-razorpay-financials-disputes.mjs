// Pins the 2026-06 payments hardening:
//   - Razorpay capture financials (gross/fee/currency/provider/card/source)
//   - payment.dispute.lost -> chargeback normalization (money clawback)
//   - signature hex guard
//   - annual-variant correctness in refund/chargeback credit clawback
import fs from "fs";
import path from "path";

const root = process.cwd();
const RZ = fs.readFileSync(path.join(root, "lib/payments/adapters/razorpay.ts"), "utf8");
const LG = fs.readFileSync(path.join(root, "lib/payments/ledger.ts"), "utf8");

let pass = 0, fail = 0;
const assert = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log("  ✗ " + msg); } };

// --- signature hardening ---
assert(/sig\.length % 2 !== 0/.test(RZ) && /malformed signature/.test(RZ),
  "A1: webhook verify rejects non-even-length / non-hex signatures");

// --- financials builder ---
assert(/export function razorpayMinorToMicros/.test(RZ) && /minor \* 10_000/.test(RZ),
  "B1: razorpayMinorToMicros multiplies minor units by 10_000");
assert(/export function buildRazorpayCapturedFinancials/.test(RZ),
  "B2: buildRazorpayCapturedFinancials exported");
assert(/grossChargeMicros: razorpayMinorToMicros\(p\.amount\)/.test(RZ), "B3: gross from p.amount");
assert(/billingCurrency: p\.currency/.test(RZ), "B4: billingCurrency from p.currency");
assert(/provider: "razorpay"/.test(RZ), "B5: provider razorpay");
assert(/processorFeeMicros: razorpayMinorToMicros\(p\.fee \?\? 0\)/.test(RZ), "B6: processor fee from p.fee");
assert(/dataSource: "webhook"/.test(RZ), "B7: dataSource webhook");
assert(/cardFingerprint: fingerprintCard\(/.test(RZ), "B8: card fingerprint set");
assert(!/taxCollectedMicros/.test(RZ) && !/netRevenueMicros/.test(RZ),
  "B9: tax/net deliberately left NULL (follow-up, not fabricated)");
assert(/createHash\("sha256"\)\.update\(cardId\)\.digest\("hex"\)\.slice\(0, 16\)/.test(RZ),
  "B10: fingerprintCard = sha256 hex, 16 chars");
assert(/financials: buildRazorpayCapturedFinancials\(p\)/.test(RZ),
  "B11: payment_captured attaches financials");

// --- dispute.lost -> chargeback ---
assert(/eventType === "payment\.dispute\.lost"/.test(RZ),
  "C1: only payment.dispute.lost is handled (not created/won/closed)");
assert(!/payment\.dispute\.created/.test(RZ.replace(/\/\/.*$/gm, "")),
  "C2: dispute.created is NOT mapped in code (stays ignored => no wrong debit)");
const db = (RZ.match(/payment\.dispute\.lost"[\s\S]*?\n {4}}/) || [""])[0];
assert(/kind: "chargeback"/.test(db), "C3: maps to chargeback kind");
assert(/providerChargebackRef: d\.id/.test(db), "C4: chargeback ref = dispute id");
assert(/amount: \{ amountMinor: d\.amount/.test(db), "C5: amount from dispute entity");
assert(/reason: d\.reason_code/.test(db), "C6: reason carried for dispute prep");
assert(/dispute\?\: \{\s*entity:/.test(RZ), "C7: RazorpayWebhookBody types the dispute entity");
assert(/fee\?\: number \| null;/.test(RZ) && /card_id\?\: string \| null;/.test(RZ),
  "C8: payment entity type extended with fee + card_id");

// --- ledger annual-variant correctness ---
const refundFn = (LG.match(/async function handleRefund[\s\S]*?\n}/) || [""])[0];
const cbFn = (LG.match(/async function handleChargeback[\s\S]*?\n}/) || [""])[0];
assert(/annualVariant: schema\.payments\.annualVariant/.test(refundFn), "D1: refund selects annualVariant");
assert(/packCredits\(payment\.packId, variant\)/.test(refundFn), "D2: refund passes variant to packCredits");
assert(/annualVariant: schema\.payments\.annualVariant/.test(cbFn), "D3: chargeback selects annualVariant");
assert(/packCredits\(payment\.packId, variant\)/.test(cbFn), "D4: chargeback passes variant to packCredits");

console.log(`razorpay-financials-disputes: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
