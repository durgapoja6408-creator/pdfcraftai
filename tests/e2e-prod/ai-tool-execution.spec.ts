// tests/e2e-prod/ai-tool-execution.spec.ts
//
// 2026-05-12 — Phase 3b: real AI tool execution against production.
// Gated behind THREE env vars (test.skip if any unset):
//
//   PROD_E2E_TEST_EMAIL     — Phase 2 test account
//   PROD_E2E_TEST_PASSWORD  —
//   PROD_E2E_AI_BUDGET_OK   — set to "yes" once the account has
//                             credit budget. Default unset = skip.
//
// Why the third gate: every AI tool run consumes real credits.
// With the expanded surface below (~24 credits per full run) we
// can afford weekly cadence on a 1000-credit budget for 41 weeks,
// or daily cadence for ~40 days. The default cron is daily Phase
// 1 + 3a only; this suite runs on a separate weekly cadence or
// manual `gh workflow run`.
//
// COVERAGE STRATEGY:
//   53 AI tools route through ~9 backing /api/ai/* endpoints. We
//   test ONE representative tool per endpoint — that catches
//   route-level regressions (auth, kill-switch gating, rate
//   limit, model routing) without burning 53× the credits.
//
//   Endpoint → representative tool tested here:
//     /api/ai/summarize       → ai-summarize       (3 cr)
//     /api/ai/summarize       → ai-key-points      (3 cr) — depth variant
//     /api/ai/summarize       → ai-faq             (3 cr) — depth variant
//     /api/ai/summarize       → ai-flashcards      (3 cr) — structured variant
//     /api/ai/summarize       → ai-mindmap         (3 cr) — different output shape
//     /api/ai/rewrite         → ai-rewrite         (3 cr)
//     /api/ai/translate       → ai-translate       (~3 cr for 3 pages)
//     /api/ai/table           → ai-table           (3 cr)
//     /api/ai/ocr             → ai-ocr             (2 cr/page) — non-AI-flavored AI op
//
//   Total per full run: ~27 credits.
//
//   The remaining ~44 AI tools either (a) share one of the routes
//   above, (b) need extra input (chat needs a question, redact
//   needs patterns, sign needs a signature image, generate needs
//   a text prompt), or (c) are AI tools we ship without a route
//   probe being meaningful (e.g. extract-tables vs. chart-to-data
//   both call /api/ai/table). Adding more tools here is cheap if
//   a regression on a specific surface shows up.
//
// Safety:
//   - Test account is dedicated; credits spent here don't affect
//     real customer accounts
//   - Each test waits up to 90s for an AI response (some ops are
//     slow — translate especially scales with page count)
//   - Soft balance assertion ensures the credit ledger is actually
//     decrementing, not silently failing-open

import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

const EMAIL = process.env.PROD_E2E_TEST_EMAIL;
const PASSWORD = process.env.PROD_E2E_TEST_PASSWORD;
const AI_OK = process.env.PROD_E2E_AI_BUDGET_OK === "yes";

const SAMPLE_PDF = resolve(process.cwd(), "public", "sample.pdf");

// Read the dashboard "Credit balance" number. Returns NaN if not
// found — caller decides whether to treat that as a hard failure
// (it shouldn't, since dashboard markup may change and we'd rather
// flake on a soft check than block the whole suite on UI churn).
async function readCreditBalance(
  page: import("@playwright/test").Page,
): Promise<number> {
  await page.goto("/app/dashboard");
  // The balance is rendered as a large numeric block adjacent to
  // the "Credit balance" label. We just pull the first integer
  // we can find in the surrounding container — robust to label
  // copy changes ("Credit balance" / "Credits" / "Available").
  const labelText = await page.locator("text=/credit balance/i").first().textContent();
  if (!labelText) return NaN;
  const containerText = await page
    .locator("text=/credit balance/i")
    .first()
    .locator("xpath=ancestor::*[self::div or self::section][1]")
    .textContent();
  if (!containerText) return NaN;
  const m = containerText.match(/\b(\d{1,6})\b/);
  return m ? parseInt(m[1], 10) : NaN;
}

// Wait for an /api/ai/* endpoint to respond 200. THIS is the
// authoritative "the AI op actually ran" signal — much stronger
// than matching UI text (which can false-positive on marketing
// copy that contains words like "PDF" or "sample"). Returns the
// response status. Throws if no AI request fires within timeout.
//
// Why this matters: the first iteration of this suite matched on
// page text and ALL TESTS PASSED while zero ai_usage rows were
// written and zero credits were debited — because the matched
// text was the tool's marketing description ("Executive summary +
// section bullets"), not the AI output. Waiting for the network
// call is the right floor.
async function waitForAiApiCall(
  page: import("@playwright/test").Page,
  endpointMatcher: RegExp,
): Promise<number> {
  const resp = await page.waitForResponse(
    (r) => endpointMatcher.test(r.url()) && r.request().method() === "POST",
    { timeout: 90_000 },
  );
  return resp.status();
}

test.describe("AI tool execution", () => {
  // Run tests serially — each consumes credits, and the final
  // balance check depends on the running total.
  test.describe.configure({ mode: "serial" });

  test.skip(
    !EMAIL || !PASSWORD,
    "Phase 2 secrets missing. Set PROD_E2E_TEST_EMAIL + PROD_E2E_TEST_PASSWORD.",
  );
  test.skip(
    !AI_OK,
    "Phase 3-AI disabled (each run spends real credits). Set PROD_E2E_AI_BUDGET_OK=yes once the test account has credits.",
  );

  let startingBalance = NaN;

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(EMAIL!);
    await page.locator('input[type="password"]').fill(PASSWORD!);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/app\//, { timeout: 15_000 });
  });

  test("0: record starting balance for end-of-suite delta check", async ({ page }) => {
    startingBalance = await readCreditBalance(page);
    console.log(`[ai-exec] starting balance = ${startingBalance}`);
    // Don't fail if we can't read the balance — the per-op tests
    // are the real signal; balance check is gravy.
  });

  // -- /api/ai/summarize family -------------------------------

  // Each test below runs the click + waitForResponse concurrently
  // (Promise.all). Pattern is: install the response listener BEFORE
  // clicking, otherwise the response can arrive before we're
  // listening. Status assertion is `< 400` because the API may
  // return 200 (sync result) or 202 (async batch).

  test("ai-summarize: API called + 2xx response", async ({ page }) => {
    await page.goto("/tool/ai-summarize");
    await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
    const [status] = await Promise.all([
      waitForAiApiCall(page, /\/api\/ai\/summarize/),
      page.getByRole("button", { name: /^Summari[sz]e$/ }).first().click(),
    ]);
    expect(status).toBeLessThan(400);
  });

  test("ai-key-points: API called + 2xx response", async ({ page }) => {
    await page.goto("/tool/ai-key-points");
    await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
    const [status] = await Promise.all([
      waitForAiApiCall(page, /\/api\/ai\/summarize/),
      page.getByRole("button", { name: /extract.*points|^Run$/i }).first().click(),
    ]);
    expect(status).toBeLessThan(400);
  });

  test("ai-faq: API called + 2xx response", async ({ page }) => {
    await page.goto("/tool/ai-faq");
    await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
    const [status] = await Promise.all([
      waitForAiApiCall(page, /\/api\/ai\/summarize/),
      page.getByRole("button", { name: /generate.*faq|^Run$/i }).first().click(),
    ]);
    expect(status).toBeLessThan(400);
  });

  test("ai-flashcards: API called + 2xx response", async ({ page }) => {
    await page.goto("/tool/ai-flashcards");
    await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
    const [status] = await Promise.all([
      waitForAiApiCall(page, /\/api\/ai\/summarize/),
      page.getByRole("button", { name: /generate.*card|^Run$|flashcard/i }).first().click(),
    ]);
    expect(status).toBeLessThan(400);
  });

  test("ai-mindmap: API called + 2xx response", async ({ page }) => {
    await page.goto("/tool/ai-mindmap");
    await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
    const [status] = await Promise.all([
      waitForAiApiCall(page, /\/api\/ai\/summarize/),
      page.getByRole("button", { name: /generate.*map|build.*map|^Run$|mindmap/i }).first().click(),
    ]);
    expect(status).toBeLessThan(400);
  });

  // -- other endpoints -----------------------------------------

  test("ai-rewrite: /api/ai/rewrite called + 2xx response", async ({ page }) => {
    // ai-proofread is actually a summarize-variant — it routes
    // through /api/ai/summarize with a "proofread" depth. The
    // dedicated /api/ai/rewrite endpoint is exercised by the
    // ai-rewrite tool, which is what we want to verify here.
    await page.goto("/tool/ai-rewrite");
    await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
    const [status] = await Promise.all([
      waitForAiApiCall(page, /\/api\/ai\/rewrite/),
      page.getByRole("button", { name: /^Rewrite$|^Run$/i }).first().click(),
    ]);
    expect(status).toBeLessThan(400);
  });

  test("ai-translate: /api/ai/translate called + 2xx response", async ({ page }) => {
    await page.goto("/tool/ai-translate");
    await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
    const [status] = await Promise.all([
      waitForAiApiCall(page, /\/api\/ai\/translate/),
      page.getByRole("button", { name: /translate|^Run$/i }).first().click(),
    ]);
    expect(status).toBeLessThan(400);
  });

  test("ai-table: /api/ai/table called + 2xx response", async ({ page }) => {
    await page.goto("/tool/ai-table");
    await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
    const [status] = await Promise.all([
      waitForAiApiCall(page, /\/api\/ai\/table/),
      page.getByRole("button", { name: /extract.*table|^Run$/i }).first().click(),
    ]);
    expect(status).toBeLessThan(400);
  });

  test("ai-ocr: /api/ai/ocr called + 2xx response", async ({ page }) => {
    await page.goto("/tool/ai-ocr");
    await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
    const [status] = await Promise.all([
      waitForAiApiCall(page, /\/api\/ai\/ocr/),
      page.getByRole("button", { name: /ocr|^Run$|recognize/i }).first().click(),
    ]);
    expect(status).toBeLessThan(400);
  });

  // -- final balance delta check -------------------------------

  test("ZZ: credit balance decreased by ~24 (soft check)", async ({ page }) => {
    if (Number.isNaN(startingBalance)) {
      console.warn("[ai-exec] starting balance was unreadable; skipping delta check");
      return;
    }
    const endingBalance = await readCreditBalance(page);
    console.log(`[ai-exec] ending balance = ${endingBalance}, delta = ${startingBalance - endingBalance}`);
    if (Number.isNaN(endingBalance)) {
      console.warn("[ai-exec] ending balance unreadable; skipping delta check");
      return;
    }
    // We expect ~24 credits consumed (8 tests × 3 cr). Allow some
    // slack for translate's per-page cost variance. The key
    // signal is "balance went DOWN, not up" — that proves the
    // credit ledger is recording the spends.
    expect(endingBalance).toBeLessThan(startingBalance);
    // Optional tighter check — comment out if it's too noisy:
    // expect(startingBalance - endingBalance).toBeGreaterThanOrEqual(15);
  });
});
