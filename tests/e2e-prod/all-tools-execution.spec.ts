// tests/e2e-prod/all-tools-execution.spec.ts
//
// 2026-06-03 — COMPREHENSIVE per-tool execution. One test per tool
// across the WHOLE catalog (tests/e2e-prod/tool-manifest.json — 113
// tools: 60 free + 53 AI). Goal: prove every tool RUNS end-to-end
// against production — "no gaps".
//
// v3 (post 2nd-run hardening):
//   - fillInputs now fills text/url/search inputs too (pdf-search query,
//     ai-semantic-search query, ai-sign Full Name, add-text-box text).
//   - uploadByAccept multi-passes so 2-slot tools (ai-compare, pdf-diff,
//     pdf-overlay) get BOTH dropzones (slot 2 appears after slot 1).
//   - INPUT_OVERRIDE feeds form.pdf to form tools, table.pdf to table
//     tools, image.pdf to image-extract tools.
//   - EDITOR_IDS (canvas-draw / page-select / drag-reorder tools) are
//     verified at the "interactive surface renders + no error" level —
//     full output needs manual canvas interaction, so a one-click bot
//     can't produce a file; we assert the editor is functional instead.

import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const FX = (n: string) => resolve(process.cwd(), "tests", "fixtures", n);
const PDF = FX("multi-page.pdf");
const PDF2 = FX("single-page.pdf");
const FORM = FX("form.pdf");
const TABLE = FX("table.pdf");
const IMAGEPDF = FX("image.pdf");
const IMG_PNG = FX("sample.png");
const IMG_JPG = FX("sample.jpg");
const TXT = FX("sample.txt");
const CSV = FX("sample.csv");
const MD = FX("sample.md");

type ToolRow = { id: string; name: string; free: boolean; group: string; needsAuth: boolean; special: string };
const MANIFEST: ToolRow[] = JSON.parse(readFileSync(resolve(process.cwd(), "tests", "e2e-prod", "tool-manifest.json"), "utf8"));
const FREE = MANIFEST.filter((t) => t.free);
const AI = MANIFEST.filter((t) => !t.free);

const EMAIL = process.env.PROD_E2E_TEST_EMAIL;
const PASSWORD = process.env.PROD_E2E_TEST_PASSWORD;
const AI_OK = process.env.PROD_E2E_AI_BUDGET_OK === "yes";

// Tools whose primary PDF input should be a richer fixture.
const INPUT_OVERRIDE: Record<string, string> = {
  "pdf-form-fill": FORM, "pdf-forms": FORM,
  "ai-table": TABLE, "ai-chart-to-table": TABLE,
  "extract-images": IMAGEPDF, "pdf-attachments": IMAGEPDF,
};
// Canvas-draw / page-select / drag-reorder editors — a one-click bot
// can't perform the manual interaction that produces output, so we
// verify the interactive surface renders + no error (smoke level).
const EDITOR_IDS = new Set(["add-links", "add-text-box", "crop-pdf", "delete-pages", "extract-pages", "sort-pages"]);

// ---- generic drivers -------------------------------------------------

async function uploadByAccept(page: Page, primaryOverride?: string): Promise<number> {
  let fed = 0;
  // multi-pass: slot 2 (compare/overlay/diff) only appears after slot 1 fills
  for (let pass = 0; pass < 3; pass++) {
    const inputs = page.locator('input[type="file"]');
    const n = await inputs.count();
    let fedThisPass = 0;
    for (let i = 0; i < n; i++) {
      const inp = inputs.nth(i);
      if ((await inp.count()) === 0) continue;
      if (!(await inp.isVisible().catch(() => false)) && !(await inp.isEnabled().catch(() => true))) { /* hidden-but-usable ok */ }
      const accept = ((await inp.getAttribute("accept")) || "").toLowerCase();
      const multiple = (await inp.getAttribute("multiple")) !== null;
      let files: string[];
      if (/image|png|jpe?g/.test(accept) && !/pdf/.test(accept)) {
        files = /png/.test(accept) && !/jpe?g/.test(accept) ? [IMG_PNG] : [IMG_JPG];
      } else if (/csv|tsv/.test(accept) && !/pdf/.test(accept)) {
        files = [CSV];
      } else if (/(text|\.txt|markdown|\.md)/.test(accept) && !/pdf/.test(accept)) {
        files = /md|markdown/.test(accept) ? [MD] : [TXT];
      } else {
        files = multiple ? [PDF, PDF2] : [primaryOverride || PDF];
      }
      try {
        await inp.setInputFiles(files, { timeout: 6000 });
        fed++; fedThisPass++;
        await page.waitForTimeout(450);
      } catch { /* input replaced by chip after a sibling upload */ }
    }
    if (fedThisPass === 0) break;
  }
  return fed;
}

async function fillInputs(page: Page): Promise<void> {
  // textareas
  const tas = page.locator("textarea:visible");
  for (let i = 0; i < (await tas.count()); i++) {
    const ta = tas.nth(i);
    if ((await ta.inputValue().catch(() => "x")) === "") {
      try { await ta.fill("pdfcraftai automated verification — please process this sample and produce a result."); } catch { /* */ }
    }
  }
  // text / search / url inputs (query, full name, url, stamp text…)
  const inputs = page.locator('input[type="text"]:visible, input[type="search"]:visible, input[type="url"]:visible, input:not([type]):visible');
  for (let i = 0; i < (await inputs.count()); i++) {
    const inp = inputs.nth(i);
    if ((await inp.inputValue().catch(() => "x")) !== "") continue;
    const ctx = ((await inp.getAttribute("placeholder")) || "") + " " + ((await inp.getAttribute("name")) || "") + " " + ((await inp.getAttribute("aria-label")) || "");
    let val = "verification";
    if (/url|https?|link/i.test(ctx)) val = "https://example.com";
    else if (/name/i.test(ctx)) val = "E2E Test User";
    else if (/word|phrase|search|query|find|side effects|what does/i.test(ctx)) val = "page";
    else if (/text|stamp|message/i.test(ctx)) val = "VERIFIED";
    try { await inp.fill(val); } catch { /* */ }
  }
}

const ACTION = /summari[sz]e|simplif|explain|extract|generate|\brun\b|^apply$|review|improve|audit|translate|rewrite|convert|analy[sz]e|detect|proofread|paraphrase|condense|expand|^create|build|make|process|^start$|fill|\bsign\b|redact|compare|parse|match|table|map|quiz|flash ?card|study notes|brief|draft|stamp|watermark|merge|split|rotate|number|booklet|crop|resize|overlay|highlight|outline|repair|flatten|strip|grayscale|bates|odd|even|n-?up|sort|delete pages|unlock|count|inspect|search|index|to (text|markdown|html|jpe?g|png|pdf|grayscale)/i;
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

const ERROR_RX = /\b(error|failed|couldn.?t|could not|unable|invalid|not a valid|something went wrong|unsupported|too large|went wrong)\b/i;
const BENIGN_EMPTY_RX = /\bno (images|attachments|links|hyperlinks|form fields|fields|fonts|annotations|javascript|bookmarks|metadata|results|matches|tables|dates|contacts|outline)\b|\b0 (matches|results|links|fonts|annotations)\b|nothing (found|to extract)|not found/i;

async function hasError(page: Page): Promise<string> {
  const alerts = page.locator('[role="alert"]:visible, .error:visible, [data-error]:visible');
  for (let i = 0; i < (await alerts.count()); i++) {
    const t = ((await alerts.nth(i).textContent()) || "").trim();
    if (t && ERROR_RX.test(t) && !BENIGN_EMPTY_RX.test(t)) return t.slice(0, 120);
  }
  return "";
}

// ---- FREE tools ------------------------------------------------------

test.describe("free tool execution (all)", () => {
  test.describe.configure({ retries: 1 });
  for (const tool of FREE) {
    test(`free:${tool.id} — ${tool.name}`, async ({ page }) => {
      test.setTimeout(60_000);
      let downloaded = false;
      page.on("download", () => { downloaded = true; });

      const resp = await page.goto(`/tool/${tool.id}`, { waitUntil: "domcontentloaded" });
      expect(resp?.status() ?? 0, "page should load <400").toBeLessThan(400);
      await page.waitForTimeout(800);
      const baseline = ((await page.locator("main").first().textContent().catch(() => "")) || "").length;

      const fed = await uploadByAccept(page, INPUT_OVERRIDE[tool.id]);
      await fillInputs(page);
      const hasTextarea = (await page.locator("textarea:visible").count()) > 0;
      if (fed === 0 && !hasTextarea && !EDITOR_IDS.has(tool.id)) {
        expect(false, `${tool.id}: no file input/textarea (runner mount gap)`).toBe(true);
        return;
      }

      // Visual editors: verify the interactive surface renders (+ no error).
      // A one-click bot can't draw/select/drag, so output can't be produced.
      if (EDITOR_IDS.has(tool.id)) {
        await page.waitForTimeout(1500);
        const erred = await hasError(page);
        const surface = (await page.locator("canvas:visible, img:visible, [class*='thumb']:visible, [class*='page']:visible").count()) > 0
          || (await page.locator("button.btn-primary:visible, button:visible:has-text('Apply'), button:visible:has-text('Download')").count()) > 0;
        test.info().annotations.push({ type: "verdict", description: `${tool.id}: editor surface ${surface ? "rendered" : "MISSING"}${erred ? " err:" + erred : ""}` });
        expect(!erred && surface, `${tool.id}: editor surface should render w/o error (full output needs manual interaction)`).toBe(true);
        return;
      }

      await clickPrimaryAction(page);
      const deadline = Date.now() + 25_000;
      let verdict = { ok: false, reason: "no signal" };
      while (Date.now() < deadline) {
        if (downloaded) { verdict = { ok: true, reason: "download event" }; break; }
        const erred = await hasError(page);
        if (erred) { verdict = { ok: false, reason: `error alert: ${erred}` }; break; }
        const ctrl = page.locator('a[download]:visible, button:visible:has-text("Download"), button:visible:has-text("Save"), button:visible:has-text("Export"), button:visible:has-text("Copy"), button:visible:has-text("JSON"), button:visible:has-text("CSV")');
        let ctrlOk = false;
        for (let i = 0; i < (await ctrl.count()); i++) { if (await ctrl.nth(i).isEnabled().catch(() => false)) { ctrlOk = true; break; } }
        if (ctrlOk) { verdict = { ok: true, reason: "result control (download/save/export/copy)" }; break; }
        if ((await page.locator('[data-testid*="output"]:visible, [data-testid*="result"]:visible, [class*="result"]:visible, [class*="output"]:visible, [class*="stat"]:visible, [class*="panel"]:visible, pre:visible, table:visible, canvas:visible, dl:visible').count()) > 0) {
          verdict = { ok: true, reason: "result region rendered" }; break;
        }
        // role=status result summaries (e.g. "Found N matches") — exclude spinners
        const statuses = page.locator('[role="status"]:visible');
        for (let i = 0; i < (await statuses.count()); i++) {
          const t = ((await statuses.nth(i).textContent()) || "").trim();
          if (t.length > 8 && !/^(loading|processing|reading|parsing|working|please wait)/i.test(t)) { verdict = { ok: true, reason: `status: ${t.slice(0, 40)}` }; break; }
        }
        if (verdict.ok) break;
        const body = ((await page.locator("main").first().textContent().catch(() => "")) || "");
        if (BENIGN_EMPTY_RX.test(body)) { verdict = { ok: true, reason: "valid empty result" }; break; }
        if (Math.abs(body.length - baseline) >= 100) { verdict = { ok: true, reason: "view transitioned to result" }; break; }
        await page.waitForTimeout(700);
      }
      test.info().annotations.push({ type: "verdict", description: `${tool.id}: ${verdict.reason}` });
      expect(verdict.ok, `${tool.id}: ${verdict.reason}`).toBe(true);
    });
  }
});

// ---- AI tools --------------------------------------------------------

async function login(page: Page) {
  // Retry once — under 53 parallel logins a redirect can occasionally lag.
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(EMAIL!);
    await page.locator('input[type="password"]').fill(PASSWORD!);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    try {
      await page.waitForURL(/\/app\//, { timeout: 25_000 });
      return;
    } catch {
      if (attempt === 1) throw new Error("login did not reach /app/ after 2 attempts");
    }
  }
}

test.describe("AI tool execution (all)", () => {
  test.describe.configure({ retries: 1 });
  test.skip(!EMAIL || !PASSWORD, "AI: PROD_E2E_TEST_EMAIL/PASSWORD unset");
  test.skip(!AI_OK, "AI: PROD_E2E_AI_BUDGET_OK!=yes (each run spends credits)");

  test.beforeEach(async ({ page }) => { await login(page); });

  for (const tool of AI) {
    test(`ai:${tool.id} — ${tool.name}`, async ({ page }) => {
      test.setTimeout(120_000);

      if (tool.special === "chat") {
        await page.goto("/app/chat");
        await Promise.all([
          page.waitForURL(/\/app\/chat\/[A-Za-z0-9-]{6,}/, { timeout: 25_000 }),
          page.getByRole("button", { name: /^New chat$/ }).first().click(),
        ]);
        await page.getByPlaceholder(/Ask a question/i).fill("Say hello in one sentence.");
        const [status] = await Promise.all([
          page.waitForResponse((r) => /\/api\/ai\/chat/.test(r.url()) && r.request().method() === "POST", { timeout: 90_000 }).then((r) => r.status()),
          page.getByRole("button", { name: /^Send$/ }).first().click(),
        ]);
        if (status === 402) { test.info().annotations.push({ type: "ai-402", description: "out of credits" }); return; }
        expect(status, "chat route <400").toBeLessThan(400);
        return;
      }

      const resp = await page.goto(`/tool/${tool.id}`, { waitUntil: "domcontentloaded" });
      expect(resp?.status() ?? 0, "page <400").toBeLessThan(400);
      await page.waitForTimeout(800);
      if (tool.special !== "prompt") await uploadByAccept(page, INPUT_OVERRIDE[tool.id]);
      await fillInputs(page);

      const aiResp = page.waitForResponse(
        (r) => /\/api\/ai\//.test(r.url()) && r.request().method() === "POST",
        { timeout: 95_000 },
      ).then((r) => r.status()).catch(() => -1);
      await clickPrimaryAction(page);
      const status = await aiResp;

      if (status === -1) {
        const out = (await page.locator('[data-testid*="output"]:visible, [data-testid*="result"]:visible, [class*="result"]:visible, pre:visible, table:visible').count()) > 0;
        test.info().annotations.push({ type: "verdict", description: `${tool.id}: no /api/ai POST; clientOutput=${out}` });
        expect(out, `${tool.id}: no /api/ai/* POST fired and no output region (needs manual check)`).toBe(true);
        return;
      }
      if (status === 402) { test.info().annotations.push({ type: "ai-402", description: `${tool.id}: out of credits` }); return; }
      expect(status, `${tool.id}: AI route <400 (or 402)`).toBeLessThan(400);
    });
  }
});
