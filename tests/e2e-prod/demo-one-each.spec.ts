// tests/e2e-prod/demo-one-each.spec.ts
//
// 2026-06-04 — DEMONSTRATION spec: one Non-AI (free) tool + one AI tool,
// run end-to-end against production with BOTH input and output captured
// and validated:
//   FREE  — Merge PDFs: upload a 5-page + a 1-page fixture, capture the
//           downloaded output, and assert (via pdf-lib) the merged PDF has
//           EXACTLY 6 pages. Screenshots of the input + result are saved.
//   AI    — Summarize PDF: log in, upload the 5-page fixture, run, assert the
//           /api/ai/* call succeeds (<400, 402 tolerated) and the rendered
//           summary text is non-empty. Screenshot + summary text saved.
//
// Artifacts land in test-results/demo/ (uploaded by .github/workflows/
// demo-one-each.yml). The AI test self-skips if creds are absent or if prod
// is not in TEST MODE (login won't reach /app/).

import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";

const FX = (n: string) => resolve(process.cwd(), "tests", "fixtures", n);
const OUT = resolve(process.cwd(), "test-results", "demo");
mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) =>
  page.screenshot({ path: resolve(OUT, name), fullPage: true });

const EMAIL = process.env.PROD_E2E_TEST_EMAIL;
const PASSWORD = process.env.PROD_E2E_TEST_PASSWORD;
const AI_OK = process.env.PROD_E2E_AI_BUDGET_OK === "yes";

// Proven generic primary-action driver (mirrors all-tools-execution.spec.ts,
// whose ai-summarize test passes). The first demo run used a naive button
// selector that didn't trigger the /api/ai POST on the summarize runner.
const ACTION = /summari[sz]e|simplif|explain|extract|generate|\brun\b|^apply$|review|improve|audit|translate|rewrite|convert|analy[sz]e|detect|proofread|paraphrase|condense|expand|^create|build|make|process|^start$/i;
const NOT_ACTION = /sign ?in|log ?in|sign ?up|register|google|reset|clear|cancel|remove|back|upgrade|buy|pricing|menu|close|new chat|learn more|how it works|download|copy|sample|feedback|report a|share/i;
async function clickPrimaryAction(page: Page): Promise<void> {
  const buttons = page.locator("button:visible, a[role=button]:visible");
  const n = await buttons.count();
  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    const name = ((await b.textContent()) || "").trim();
    if (!name || NOT_ACTION.test(name) || !ACTION.test(name)) continue;
    if (!(await b.isEnabled())) continue;
    try { await b.click({ timeout: 4000 }); return; } catch { /* */ }
  }
  const primaries = page.locator("button.btn-primary:visible");
  for (let i = 0; i < (await primaries.count()); i++) {
    const b = primaries.nth(i);
    const name = ((await b.textContent()) || "").trim();
    if (NOT_ACTION.test(name)) continue;
    if (!(await b.isEnabled())) continue;
    try { await b.click({ timeout: 4000 }); return; } catch { /* */ }
  }
}

// ---------------------------------------------------------------------------
// NON-AI (free) tool: Merge PDFs — full input + output validation
// ---------------------------------------------------------------------------
test("FREE merge — 5pg + 1pg input -> verified 6pg output PDF", async ({ page }) => {
  test.setTimeout(90_000);

  const resp = await page.goto("/tool/merge", { waitUntil: "domcontentloaded" });
  expect(resp?.status() ?? 0, "merge page loads <400").toBeLessThan(400);
  await page.waitForTimeout(1200);
  await shot(page, "free-01-loaded.png");

  // INPUT: feed the 5-page + 1-page fixtures (file inputs accept multiple).
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles([FX("multi-page.pdf"), FX("single-page.pdf")]);
  await page.waitForTimeout(1500);
  await shot(page, "free-02-inputs-loaded.png");

  // ACT: click the Merge action, capturing whatever download it produces
  // (some builds auto-download; others reveal a Download button).
  const firstDownload = page.waitForEvent("download", { timeout: 20_000 }).catch(() => null);
  const mergeBtn = page
    .getByRole("button", { name: /merge|combine/i })
    .or(page.locator("button.btn-primary:visible"))
    .first();
  await mergeBtn.click({ timeout: 8000 }).catch(() => {});
  let download = await firstDownload;

  if (!download) {
    const dl2 = page.waitForEvent("download", { timeout: 20_000 }).catch(() => null);
    await page
      .getByRole("button", { name: /download|save/i })
      .first()
      .click({ timeout: 8000 })
      .catch(() => {});
    download = await dl2;
  }
  expect(download, "merge produced a downloadable output").toBeTruthy();

  // OUTPUT: save + validate the merged PDF byte-for-byte (page count).
  const outPath = resolve(OUT, "merged-output.pdf");
  await download!.saveAs(outPath);
  await page.waitForTimeout(500);
  await shot(page, "free-03-result.png");

  const bytes = readFileSync(outPath);
  const merged = await PDFDocument.load(bytes);
  const pages = merged.getPageCount();
  writeFileSync(resolve(OUT, "free-verdict.txt"), `merged-output.pdf pages=${pages} (expected 6)\n`);
  test.info().annotations.push({ type: "verdict", description: `merge output = ${pages} pages (expected 6)` });
  expect(pages, "merged 5pg + 1pg should equal 6 pages").toBe(6);
});

// ---------------------------------------------------------------------------
// AI tool: Summarize PDF — input + AI output validation
// ---------------------------------------------------------------------------
test.describe("AI summarize", () => {
  test.skip(!EMAIL || !PASSWORD, "AI: PROD_E2E_TEST_EMAIL/PASSWORD unset");
  test.skip(!AI_OK, "AI: PROD_E2E_AI_BUDGET_OK!=yes (spends credits)");

  test("AI ai-summarize — 5pg input -> verified summary output", async ({ page }) => {
    test.setTimeout(110_000);

    // login (requires prod TEST MODE so Turnstile always-passes)
    let loggedIn = false;
    for (let attempt = 0; attempt < 2 && !loggedIn; attempt++) {
      await page.goto("/login");
      // The test-env cookie banner overlays the form and can intercept fills
      // (locator.fill actionability timeout). Dismiss it first.
      await page.getByRole("button", { name: /reject all|accept all|accept/i }).first().click({ timeout: 4000 }).catch(() => {});
      const email = page.locator('input[type="email"]');
      await email.waitFor({ state: "visible", timeout: 15_000 });
      await email.fill(EMAIL!, { timeout: 15_000 });
      await page.locator('input[type="password"]').fill(PASSWORD!, { timeout: 15_000 });
      await page.getByRole("button", { name: /sign in|log in/i }).click();
      loggedIn = await page.waitForURL(/\/app\//, { timeout: 25_000 }).then(() => true).catch(() => false);
    }
    expect(loggedIn, "login reached /app/ (prod must be in TEST MODE)").toBe(true);

    const resp = await page.goto("/tool/ai-summarize", { waitUntil: "domcontentloaded" });
    expect(resp?.status() ?? 0, "ai-summarize page loads <400").toBeLessThan(400);
    await page.waitForTimeout(1000);

    // INPUT
    await page.locator('input[type="file"]').first().setInputFiles(FX("multi-page.pdf"));
    await page.waitForTimeout(1200);
    await shot(page, "ai-01-input-loaded.png");

    // ACT + capture the AI API status
    const aiResp = page
      .waitForResponse((r) => /\/api\/ai\//.test(r.url()) && r.request().method() === "POST", { timeout: 75_000 })
      .then((r) => r.status())
      .catch(() => -1);
    await clickPrimaryAction(page);
    const status = await aiResp;
    test.info().annotations.push({ type: "ai-status", description: `/api/ai status ${status}` });

    if (status === 402) {
      writeFileSync(resolve(OUT, "ai-verdict.txt"), "ai-summarize: 402 out of credits (route reached, gate passed)\n");
      test.skip(true, "out of AI credits (402) — route verified, no output to capture");
      return;
    }
    expect(status, "AI route returned <400").toBeLessThan(400);

    // OUTPUT: wait for the summary text to render, capture + validate non-empty.
    await page.waitForTimeout(2500);
    const outRegion = page
      .locator('[data-testid*="output"]:visible, [data-testid*="result"]:visible, [class*="result"]:visible, [class*="output"]:visible, article:visible, pre:visible')
      .first();
    const text = ((await outRegion.textContent().catch(() => "")) || "").trim();
    await shot(page, "ai-02-summary-output.png");
    writeFileSync(resolve(OUT, "ai-summary.txt"), text.slice(0, 4000));
    writeFileSync(resolve(OUT, "ai-verdict.txt"), `ai-summarize: status ${status}, summary chars=${text.length}\n`);
    test.info().annotations.push({ type: "verdict", description: `summary length = ${text.length} chars` });
    expect(text.length, "AI summary output should be non-empty").toBeGreaterThan(40);
  });
});
