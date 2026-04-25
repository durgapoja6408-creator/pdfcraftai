#!/usr/bin/env node
// Task #24 verification — reverse-sweep correctness against stubbed
// Razorpay HTTP responses.
//
// This isn't a full integration test (we'd need a real DB + cron secret
// for that). It exercises the pure pieces:
//   1. RazorpayProvider.fetchPaymentStatus correctly translates the
//      /orders/<id>/payments shape into NormalizedTx.
//   2. Status ranking picks the right dominant attempt.
//   3. Subscription refs (sub_xxx) and unknown ids return null cleanly.
//   4. 400/404 errors don't propagate.
//
// Run: node scripts/test-reverse-sweep.mjs

import { strict as assert } from "node:assert";

// Inline a minimal copy of statusRank + mapRazorpayStatus + the
// fetchPaymentStatus body so we can exercise it without spinning up the
// full TS compile + module graph. This mirrors the logic in
// lib/payments/adapters/razorpay.ts — keep them in sync if either changes.

function mapRazorpayStatus(s) {
  switch (s) {
    case "captured":
    case "authorized":
      return "captured";
    case "failed":
      return "failed";
    case "refunded":
      return "refunded";
    default:
      return "pending";
  }
}

function statusRank(s) {
  switch (s) {
    case "captured":
      return 5;
    case "authorized":
      return 4;
    case "refunded":
      return 3;
    case "failed":
      return 2;
    case "created":
      return 1;
    default:
      return 0;
  }
}

class FakeRazorpay {
  constructor(responses) {
    this.responses = responses; // map: providerRef → { items: [...] } | Error
  }
  async fetchPaymentStatus(providerRef) {
    if (providerRef.startsWith("sub_")) return null;

    let res;
    try {
      const next = this.responses.get(providerRef);
      if (next instanceof Error) throw next;
      if (!next) throw new Error(` 400: order id is invalid`);
      res = next;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes(" 400:") || msg.includes(" 404:")) return null;
      throw err;
    }

    if (!res.items || res.items.length === 0) return null;
    const ranked = res.items.slice().sort((a, b) => statusRank(b.status) - statusRank(a.status));
    const top = ranked[0];

    return {
      providerId: "razorpay",
      providerRef: top.id,
      internalPaymentId: top.notes?.internalPaymentId ?? null,
      status: mapRazorpayStatus(top.status),
      amount: { amountMinor: top.amount, currency: top.currency },
      occurredAt: new Date(top.created_at * 1000),
    };
  }
}

// ---- Tests ----

const responses = new Map([
  // Order with one captured payment.
  [
    "order_capt_1",
    {
      count: 1,
      items: [
        { id: "pay_capt_1", status: "captured", amount: 14900, currency: "INR", created_at: 1700000000, notes: { internalPaymentId: "internal-A" } },
      ],
    },
  ],
  // Order with failed→captured retry. Must pick captured.
  [
    "order_retry_1",
    {
      count: 2,
      items: [
        { id: "pay_fail_1", status: "failed", amount: 14900, currency: "INR", created_at: 1700000000 },
        { id: "pay_capt_2", status: "captured", amount: 14900, currency: "INR", created_at: 1700000060 },
      ],
    },
  ],
  // Order with only failed attempts. Must pick failed.
  [
    "order_fail_only",
    {
      count: 1,
      items: [
        { id: "pay_fail_2", status: "failed", amount: 14900, currency: "INR", created_at: 1700000000 },
      ],
    },
  ],
  // Order created but no payments at all — empty items array.
  ["order_empty", { count: 0, items: [] }],
  // Razorpay says 400 (invalid id) — typical of sandbox/live drift.
  ["order_unknown", new Error("Razorpay GET /orders/order_unknown/payments failed 400: BAD_REQUEST_ERROR")],
  // 5xx — must propagate so cron counts as error.
  ["order_5xx", new Error("Razorpay GET /orders/order_5xx/payments failed 502: bad gateway")],
]);

const fake = new FakeRazorpay(responses);

// 1. Captured single attempt
{
  const tx = await fake.fetchPaymentStatus("order_capt_1");
  assert.equal(tx.status, "captured");
  assert.equal(tx.providerRef, "pay_capt_1");
  assert.equal(tx.amount.amountMinor, 14900);
  assert.equal(tx.internalPaymentId, "internal-A");
  console.log("✓ captured single-attempt order resolves correctly");
}

// 2. Failed→captured retry must pick captured
{
  const tx = await fake.fetchPaymentStatus("order_retry_1");
  assert.equal(tx.status, "captured");
  assert.equal(tx.providerRef, "pay_capt_2");
  console.log("✓ failed-then-captured retry picks captured attempt");
}

// 3. All failed → status="failed"
{
  const tx = await fake.fetchPaymentStatus("order_fail_only");
  assert.equal(tx.status, "failed");
  console.log("✓ all-failed order surfaces failed status");
}

// 4. Empty items → null
{
  const tx = await fake.fetchPaymentStatus("order_empty");
  assert.equal(tx, null);
  console.log("✓ order with zero attempts returns null");
}

// 5. 400 unknown id → null
{
  const tx = await fake.fetchPaymentStatus("order_unknown");
  assert.equal(tx, null);
  console.log("✓ 400 BAD_REQUEST returns null (sandbox/live drift)");
}

// 6. Subscription ref → null
{
  const tx = await fake.fetchPaymentStatus("sub_anything");
  assert.equal(tx, null);
  console.log("✓ sub_xxx returns null (out of scope)");
}

// 7. 5xx must throw
{
  let threw = false;
  try {
    await fake.fetchPaymentStatus("order_5xx");
  } catch (err) {
    threw = true;
    assert.match(err.message, /502/);
  }
  assert.equal(threw, true);
  console.log("✓ 5xx propagates (caller counts as error)");
}

console.log("\nAll 7 reverse-sweep correctness checks passed.");
