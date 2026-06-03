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

  test("Starter pack checkout: order created (IN) or geo-deferred (non-IN)", async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto("/pricing");
    // Clicking "Buy pack" invokes createCheckoutAction (a Next.js SERVER ACTION
    // — it POSTs to the page itself with a `next-action` request header, NOT a
    // REST endpoint). What happens next is GEO-ROUTED on CF-IPCountry:
    //   - India  -> a Razorpay TEST-mode order is created + the client loads
    //     Razorpay's hosted SDK (checkout.razorpay.com/v1/checkout.js).
    //   - Non-IN -> the action returns geo_deferred/geo_blocked and the button
    //     shows an inline [role=alert] notice (the international launch-notify
    //     surface). GitHub CI runs on US IPs, so CI exercises the NON-IN path.
    // We assert the server action runs cleanly AND that exactly one of the two
    // geo-correct outcomes happens. We never assert the hosted Razorpay iframe
    // (its checkout.js refuses to mount in a headless datacenter browser).
    // (Prod is Razorpay TEST mode — rzp_test_* — so the IN path moves no real
    // money either; see the file header.)
    const actionStatus = page
      .waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          !!r.request().headers()["next-action"],
        { timeout: 20_000 },
      )
      .then((r) => r.status())
      .catch(() => null);

    const sdkLoaded = page
      .waitForRequest((r) => r.url().includes("checkout.razorpay.com"), {
        timeout: 18_000,
      })
      .then(() => true)
      .catch(() => false);

    const geoDeferred = page
      .getByRole("alert")
      .filter({
        hasText: /country|region|launch|notify|not available|restrictions/i,
      })
      .first()
      .waitFor({ state: "visible", timeout: 18_000 })
      .then(() => true)
      .catch(() => false);

    await page.getByRole("button", { name: /Buy pack/i }).first().click();

    const [orderStatus, sdk, deferred] = await Promise.all([
      actionStatus,
      sdkLoaded,
      geoDeferred,
    ]);

    // The checkout server action executed (auth + promo + geo-routing +
    // currency selection) with no 500 and no auth bounce.
    expect(orderStatus, "createCheckoutAction should respond").not.toBeNull();
    expect(orderStatus as number).toBeLessThan(400);

    // Exactly the geo-correct client outcome occurred — Razorpay opened (IN) or
    // the geo-defer notice appeared (non-IN). A silent no-op fails here.
    expect(
      sdk || deferred,
      "Buy pack must open Razorpay (IN) or show the geo-defer notice (non-IN)",
    ).toBe(true);

    test.info().annotations.push({
      type: "checkout-outcome",
      description: sdk
        ? "razorpay-sdk-loaded (IN path)"
        : deferred
          ? "geo-deferred notice shown (non-IN path; expected in CI)"
          : "neither",
    });
  });

  // ── DEFERRED (2026-05-12): "complete checkout with test card"
  //
  // I attempted to wire the full happy-path test:
  //   /pricing → Buy pack → Razorpay iframe → contact modal →
  //   card form → Pay → webhook → credits delivered → balance up
  //
  // The iframe-driven flow has too many failure modes to be
  // worth automating in CI:
  //
  //   1. CONTACT-DETAILS MODAL.
  //      Razorpay's checkout in IN-mode opens a "Contact details"
  //      modal BEFORE showing the payment-method picker. Need to
  //      type a 10-digit mobile number.
  //
  //   2. MOBILE VALIDATOR BLOCKLIST.
  //      The validator rejects obvious test patterns:
  //        9999999999, 9876543210 → "Please enter a valid mobile number"
  //      Some non-sequential numbers (8123456709) get accepted.
  //      The pattern isn't publicly documented; it's brittle to
  //      Razorpay tightening it.
  //
  //   3. CARD FORM IN NESTED IFRAMES (PCI).
  //      The card-number / expiry / CVV fields are in nested
  //      cross-origin iframes for PCI compliance. Inner iframe
  //      content is sometimes in shadow DOM. Playwright handles
  //      this with frameLocator, but the selectors aren't stable
  //      across Razorpay SDK versions.
  //
  //   4. 3DS CHALLENGE WINDOW.
  //      Some test-mode flows pop a 3DS challenge popup that
  //      needs to be dismissed. Inconsistent across Razorpay's
  //      test cards.
  //
  //   5. REDIRECT + ASYNC WEBHOOK.
  //      After "Pay", Razorpay calls back to the merchant's
  //      handler() JS callback OR redirects, then a webhook
  //      fires async to /api/webhooks/razorpay. Need to poll for
  //      balance increase up to ~30-60s.
  //
  // RECOMMENDED ALTERNATIVE: webhook simulation.
  //   Instead of driving Razorpay's UI, POST a synthetic
  //   `payment.captured` event directly to
  //   /api/webhooks/razorpay with a valid HMAC over the body
  //   using RAZORPAY_WEBHOOK_SECRET. This tests the code we
  //   actually own (signature verify + credit grant) without
  //   any Razorpay UX coupling.
  //
  //   Blocker: the webhook secret lives only in prod env. To
  //   run this from a Playwright test, either:
  //     (a) inject RAZORPAY_WEBHOOK_SECRET into the test runner's
  //         env via the same SSH-read pattern we used for
  //         debugging, OR
  //     (b) add a small E2E-only seam in the webhook handler
  //         that accepts a hard-coded test signature when
  //         the body originates from the test-account user_id.
  //         Lower-surface-area than option (a) but adds a
  //         constant to verify in audits.
  //
  //   Both options need founder review before shipping. Until
  //   then, route-level coverage (the "Razorpay checkout opens"
  //   test above) is the actively-running Phase 4 surface.
  //
  // FOUNDER WORK NEEDED:
  //   - Decide on webhook simulation approach (a) vs (b) above
  //   - Or decide it's acceptable to leave full-card path
  //     uncovered in CI and test manually each release
  test.fixme(
    "Starter pack: complete checkout with test card",
    async () => {
      // Intentionally empty. Full implementation tried + reverted
      // (commit 26416c3 series); the iframe approach is too brittle
      // for CI. See the comment block above this test for the
      // recommended webhook-simulation alternative.
    },
  );
});
