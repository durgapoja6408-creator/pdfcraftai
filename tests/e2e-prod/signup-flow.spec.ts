// tests/e2e-prod/signup-flow.spec.ts
//
// Phase: signup — end-to-end new-account registration. Requires the Turnstile
// TEST keys to be LIVE (import .claude/test.env) so the captcha auto-passes,
// and is gated behind PROD_E2E_SIGNUP_OK=yes.
//
// NOTE: this CREATES a real (unverified, no-bonus) account per run, using a
// unique throwaway email. Operator cleanup (quarterly), same idea as the
// payments pending rows:
//   DELETE FROM users WHERE email LIKE 'playwright.e2e.%@example.com'
//     AND email_verified IS NULL AND created_at < NOW() - INTERVAL 30 DAY;
import { test, expect } from "@playwright/test";

const SIGNUP_OK = process.env.PROD_E2E_SIGNUP_OK === "yes";

test.describe("signup flow", () => {
  test.skip(
    !SIGNUP_OK,
    "Signup phase disabled. Set PROD_E2E_SIGNUP_OK=yes (needs Turnstile TEST keys live via test.env).",
  );

  test("register a new account -> signs in -> lands on /app", async ({ page }) => {
    test.setTimeout(45_000);
    const email = `playwright.e2e.${Date.now()}@example.com`;
    const password = "E2eTestPw2026X";
    await page.goto("/register");
    await page.locator('input[name="name"]').fill("E2E Signup Test");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    // Turnstile TEST site key (1x...AA) auto-passes; give the widget a moment
    // to inject the hidden cf-turnstile-response token before submitting.
    await page.waitForTimeout(3000);
    // IMPORTANT: target the credentials submit ("Create free account") — NOT the
    // "Sign up with Google" button, which starts an un-automatable OAuth redirect.
    await page.getByRole("button", { name: /create free account/i }).click();
    // On success registerAction signs the user in and redirects to /app/dashboard.
    await expect(page).toHaveURL(/\/app\//, { timeout: 25_000 });
  });
});
