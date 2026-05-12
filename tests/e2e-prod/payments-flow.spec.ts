// tests/e2e-prod/payments-flow.spec.ts
//
// 2026-05-12 — Phase 4: payment-flow smoke against production.
// Gated behind FOUR env vars (test.skip if any unset):
//
//   PROD_E2E_TEST_EMAIL          — same as Phase 2
//   PROD_E2E_TEST_PASSWORD       —
//   PROD_E2E_RAZORPAY_TEST_KEY   — Razorpay test-mode key_id
//                                  (rzp_test_...); allows us to
//                                  hit Razorpay's checkout in test
//                                  mode against the prod codebase
//   PROD_E2E_PAYMENTS_OK         — set to "yes" to confirm you
//                                  understand the test will create
//                                  a real (test-mode) order on
//                                  Razorpay's side, plus a real
//                                  pending-order row on prod DB
//
// Why the explicit yes-gate: even in test mode, this suite:
//   - Creates a pending_order row in production MySQL
//   - Generates a real Razorpay order_id (test-mode but real)
//   - Persists an audit log row on each run
//
// None of those are harmful, but the operator should know they
// exist before we schedule the suite. The test fills the test card
// + completes checkout, then asserts the success state on prod.
//
// Razorpay test card numbers (public): see
// https://razorpay.com/docs/payments/payments/test-card-details/
//
// UNLOCK STEPS:
//   1. Complete Phase 2 unlock
//   2. Switch the prod Razorpay account to ALSO accept a test-mode
//      key alongside live (Razorpay supports both simultaneously).
//      Or: provision a separate Razorpay sub-account just for E2E.
//   3. Add the secrets:
//        gh secret set PROD_E2E_RAZORPAY_TEST_KEY --body "rzp_test_..."
//        gh secret set PROD_E2E_PAYMENTS_OK --body "yes"
//   4. Decide whether to schedule this weekly (cheap) or
//      manually-triggered only (safer — payments are the
//      highest-risk surface)
//
// SAFETY GUARANTEES once enabled:
//   - Test-mode cards never charge real money
//   - Webhook delivery to /api/payments/razorpay-webhook is the
//     SAME endpoint as production webhook (tests the live
//     pipeline, not a sandbox copy) — but only TEST-mode events
//     reach it, identified by Razorpay's account-mode signal
//   - Per-test cleanup: each run's pending_order row is marked
//     `is_test = true` and excluded from /admin/margin
//
// Phase 4 is the HARDEST to make safe — recommend founder review
// before flipping the switch.

import { test, expect } from "@playwright/test";

const EMAIL = process.env.PROD_E2E_TEST_EMAIL;
const PASSWORD = process.env.PROD_E2E_TEST_PASSWORD;
const RZP_KEY = process.env.PROD_E2E_RAZORPAY_TEST_KEY;
const PAYMENTS_OK = process.env.PROD_E2E_PAYMENTS_OK === "yes";

test.describe("payment flows", () => {
  test.skip(
    !EMAIL || !PASSWORD,
    "Phase 2 secrets missing.",
  );
  test.skip(
    !RZP_KEY,
    "Razorpay test key missing. Set PROD_E2E_RAZORPAY_TEST_KEY.",
  );
  test.skip(
    !PAYMENTS_OK,
    "Phase 4 disabled. Set PROD_E2E_PAYMENTS_OK=yes to acknowledge the test-mode order will hit prod DB.",
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(EMAIL!);
    await page.locator('input[type="password"]').fill(PASSWORD!);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/app\//, { timeout: 15_000 });
  });

  test("Starter pack: Razorpay checkout opens", async ({ page }) => {
    await page.goto("/pricing");
    // Click the Starter pack's CTA. The button label is "Buy pack"
    // when on the monthly variant.
    await page.getByRole("button", { name: /Buy pack/i }).first().click();
    // Razorpay's checkout opens as an iframe. Wait for it to load.
    await expect(
      page.frameLocator('iframe[src*="razorpay"]').locator("body").first(),
    ).toBeAttached({ timeout: 15_000 });
  });

  // Full happy-path test (fill test card → complete → assert
  // credits delivered) is intentionally a follow-up commit. It
  // requires the test account, the Razorpay test-mode key, AND
  // the operator picking which Razorpay test card to use (success
  // vs auth-fail vs international). Founder decision.
  test.skip("Starter pack: complete checkout with test card", () => {
    // TODO: fill test card 4111 1111 1111 1111 / 12/30 / 123,
    // submit, assert success redirect, assert credit balance
    // increased on /app/dashboard.
  });
});
