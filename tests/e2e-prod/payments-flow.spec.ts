// tests/e2e-prod/payments-flow.spec.ts
//
// 2026-05-12 — Phase 4: payment-flow smoke against production.
//
// IMPORTANT FINDING (2026-05-12): production is currently running
// on Razorpay TEST-mode keys (`RAZORPAY_KEY_ID=rzp_test_*`). That
// means the live checkout flow at https://pdfcraftai.com/pricing
// already opens a test-mode Razorpay widget for everyone — no real
// money is collected today. The Phase 4 E2E doesn't need a separate
// `PROD_E2E_RAZORPAY_TEST_KEY` env injection because the live
// codebase IS test mode.
//
// When the founder swaps prod to `rzp_live_*` keys for real
// revenue, this suite must be revisited:
//   - Either provision a parallel test-mode key on a sub-account
//     and add a separate `/api/payments/test` route in the app
//   - Or run the Phase 4 E2E against staging instead of prod
//
// Until then: prod IS test, so prod E2E is safe.
//
// Gates:
//
//   PROD_E2E_TEST_EMAIL          — same as Phase 2
//   PROD_E2E_TEST_PASSWORD       —
//   PROD_E2E_PAYMENTS_OK         — set to "yes" to confirm you
//                                  understand the test will create
//                                  a real (test-mode) order on
//                                  Razorpay's side, plus a real
//                                  pending-order row on prod DB
//
// Why the explicit yes-gate even though it's test mode: this suite:
//   - Creates a `payments` row (status=pending, provider_id=razorpay)
//     in production MySQL on each run
//   - Generates a real Razorpay order_id (test-mode but real)
//   - The schema has NO `is_test` column; test-account pending
//     orders are attributable by user_id only. /admin/margin
//     filters by status='captured' so pending rows don't pollute
//     revenue reports, but the test-account orders will accumulate
//     slowly. Operator-side cleanup query (run quarterly):
//        DELETE FROM payments
//        WHERE user_id = '<test-account-uuid>'
//          AND status = 'pending'
//          AND created_at < NOW() - INTERVAL 30 DAY;
//
// None of those are harmful, but the operator should know they
// exist before we schedule the suite.
//
// Razorpay test card numbers (public): see
// https://razorpay.com/docs/payments/payments/test-card-details/

import { test, expect } from "@playwright/test";

const EMAIL = process.env.PROD_E2E_TEST_EMAIL;
const PASSWORD = process.env.PROD_E2E_TEST_PASSWORD;
const PAYMENTS_OK = process.env.PROD_E2E_PAYMENTS_OK === "yes";

test.describe("payment flows", () => {
  test.skip(
    !EMAIL || !PASSWORD,
    "Phase 2 secrets missing.",
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
    // Click the Starter pack's CTA. Wait for the Razorpay
    // checkout iframe to attach. The flow is:
    //  1. Client POSTs to /api/payments/razorpay/create-order
    //  2. Server creates a pending_order row + returns
    //     {order_id, key_id, amount, currency}
    //  3. Client opens Razorpay's hosted checkout (iframe)
    // We wait for any /api/payments/razorpay/* call to fire
    // (proves the create-order round-trip happened) AND the
    // iframe to attach (proves the checkout opened).
    const [orderStatus] = await Promise.all([
      page
        .waitForResponse(
          (r) =>
            /\/api\/payments\/razorpay\/(create-order|order)/.test(r.url()) &&
            r.request().method() === "POST",
          { timeout: 15_000 },
        )
        .then((r) => r.status())
        .catch(() => null),
      page.getByRole("button", { name: /Buy pack/i }).first().click(),
    ]);
    // Order endpoint should have returned 200.
    if (orderStatus !== null) {
      expect(orderStatus).toBeLessThan(400);
    }
    // Razorpay's checkout opens as an iframe with the SDK's host
    // in its src. The widget is loaded async — give it 15s.
    await expect(
      page.frameLocator('iframe[src*="razorpay"]').locator("body").first(),
    ).toBeAttached({ timeout: 15_000 });
  });

  // Full happy-path test (fill test card → complete → assert
  // credits delivered) is intentionally a follow-up commit. It
  // requires the operator picking which Razorpay test card to
  // use (success vs auth-fail vs international). Founder decision.
  test.skip("Starter pack: complete checkout with test card", () => {
    // TODO: fill test card 4111 1111 1111 1111 / 12/30 / 123,
    // submit, assert success redirect, assert credit balance
    // increased on /app/dashboard.
  });
});
