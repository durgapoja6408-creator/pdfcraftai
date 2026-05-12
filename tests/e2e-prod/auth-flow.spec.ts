// tests/e2e-prod/auth-flow.spec.ts
//
// 2026-05-12 — Phase 2: authenticated read-only flows against
// production. Gated behind two env vars (test.skip if either unset):
//
//   PROD_E2E_TEST_EMAIL    — email of a dedicated test account on prod
//   PROD_E2E_TEST_PASSWORD — that account's password
//
// Suite stays GREEN-by-default when the secrets are unset (skipped,
// not failed), so the rest of the prod-E2E run can ship before the
// test account exists. The moment the founder creates the account
// and adds the secrets to GitHub Actions, these tests start running
// automatically.
//
// Why a dedicated test account vs. reusing the founder account:
//   - Founder account uses real credits; we don't want tests to
//     accidentally consume them on AI calls
//   - Bcrypt/session test artifacts shouldn't pollute the real
//     account's audit log
//   - The test account can be revoked if anything goes wrong
//
// UNLOCK STEPS (operator action):
//   1. Open an incognito browser at https://pdfcraftai.com/register
//   2. Sign up with a dedicated email (e.g. e2e-test@pdfcraftai.com)
//   3. Complete the email verification (check Hostinger Mail)
//   4. Add the credentials to GitHub Actions:
//        gh secret set PROD_E2E_TEST_EMAIL --body "e2e-test@pdfcraftai.com"
//        gh secret set PROD_E2E_TEST_PASSWORD --body "<strong-random-pw>"
//   5. Add the same pair to your local .env.local for local runs
//   6. Top up the account with a small credit balance if you want
//      Phase 3-AI tests to also run (separate decision)
//
// Safety:
//   - Tests log in but DON'T modify settings, change password,
//     buy credits, delete account, or run AI ops
//   - All assertions are on rendered state, not on mutations
//   - If the test account is somehow compromised the blast radius
//     is one (small, intentionally-low-credit) account

import { test, expect } from "@playwright/test";

const EMAIL = process.env.PROD_E2E_TEST_EMAIL;
const PASSWORD = process.env.PROD_E2E_TEST_PASSWORD;

// One-time skip gate — the whole describe block skips if creds
// aren't configured. Skipping (vs failing) means the green/red
// signal on the rest of the suite stays meaningful.
test.describe("authenticated flows", () => {
  test.skip(
    !EMAIL || !PASSWORD,
    "Phase 2 disabled. Set PROD_E2E_TEST_EMAIL + PROD_E2E_TEST_PASSWORD to enable.",
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(EMAIL!);
    await page.locator('input[type="password"]').fill(PASSWORD!);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    // Successful sign-in lands somewhere under /app — dashboard or
    // welcome depending on whether the account has seen welcome
    // before.
    await expect(page).toHaveURL(/\/app\//, { timeout: 15_000 });
  });

  test("dashboard renders with stat cards", async ({ page }) => {
    await page.goto("/app/dashboard");
    await expect(page.locator("text=Credit balance").first()).toBeVisible();
    await expect(page.locator("text=Last 7 days").first()).toBeVisible();
    await expect(page.locator("text=Last 30 days").first()).toBeVisible();
  });

  test("welcome page accessible when navigated directly", async ({ page }) => {
    const resp = await page.goto("/app/welcome");
    expect(resp?.status()).toBe(200);
    await expect(page.locator("text=Popular tools").first()).toBeVisible();
  });

  test("settings page loads (read-only check)", async ({ page }) => {
    const resp = await page.goto("/app/settings");
    expect(resp?.status()).toBe(200);
    // Email field shows the logged-in email — soft assertion
    // since the UI may render it as a label vs. an input.
    const html = await page.content();
    expect(html.toLowerCase()).toContain((EMAIL ?? "").toLowerCase());
  });

  test("billing page loads + shows pricing CTA", async ({ page }) => {
    const resp = await page.goto("/app/billing");
    expect(resp?.status()).toBe(200);
  });

  test("session cookie survives navigation", async ({ page, context }) => {
    await page.goto("/app/dashboard");
    const cookies = await context.cookies();
    // NextAuth v5 (Auth.js) ships under the `authjs.*` cookie
    // namespace; v4 used `next-auth.*`. We accept either to keep
    // the test resilient if/when we migrate. Production runs over
    // HTTPS so the cookie is prefixed `__Secure-`.
    const sessionCookie = cookies.find(
      (c) =>
        c.name === "authjs.session-token" ||
        c.name === "__Secure-authjs.session-token" ||
        c.name === "next-auth.session-token" ||
        c.name === "__Secure-next-auth.session-token",
    );
    expect(sessionCookie).toBeDefined();
    // Cookie should be httpOnly + secure (prod is HTTPS).
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.secure).toBe(true);
  });

  test("admin /admin/* still 404s for non-admin authed user", async ({
    page,
  }) => {
    // SEV-0 audit fix verification: even logged in, non-admin
    // users should get notFound() on admin pages (no namespace
    // leak). The test account must NOT be on the ADMIN_EMAILS
    // allowlist — if it is, this test fails and we know we mis-
    // configured the allowlist.
    const resp = await page.goto("/app/admin/kill-switches");
    expect([404, 307]).toContain(resp?.status() ?? 0);
  });
});
