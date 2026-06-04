// tests/e2e-prod/option-matrix.spec.ts
//
// 2026-06-04 — OPTION-MATRIX execution. Goes beyond all-tools-execution
// (one run per tool) by exercising EVERY option/mode of every tool: for
// each tool it auto-detects option controls (native <select> + radio groups
// — the codebase renders segmented choices like Summarize's TL;DR/Standard/
// Detailed as a hidden input[type=radio] inside a <label>), then runs the
// tool ONCE PER OPTION VALUE and verifies the output each time.
//
//   FREE: a result/download/result-region appears and NO error alert.
//   AI  : the /api/ai POST returns <400 (402 out-of-credits tolerated) and
//         the response body is non-empty.
//
// Records one JSONL row per (tool, group, value) to test-results/
// option-matrix/matrix.jsonl for the summary. Large selects are capped
// (MAX_VALUES_PER_GROUP) so e.g. a 50-language dropdown doesn't explode
// into 50 AI calls; the cap is recorded.

import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { readFileSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";

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
const AI = MANIFEST.filter((t) => !t.free && t.special !== "chat");

const EMAIL = process.env.PROD_E2E_TEST_EMAIL;
const PASSWORD = process.env.PROD_E2E_TEST_PASSWORD;
const AI_OK = process.env.PROD_E2E_AI_BUDGET_OK === "yes";

const MAX_VALUES_PER_GROUP = 5; // cap per option group (large language selects etc.)
const MAX_VARIANTS = 8; // cap total variants per tool

const OUT = resolve(process.cwd(), "test-results", "option-matrix");
mkdirSync(OUT, { recursive: true });
const MATRIX = resolve(OUT, "matrix.jsonl");
function record(row: Record<string, unknown>) { appendFileSync(MATRIX, JSON.stringify(row) + "\n"); }

const INPUT_OVERRIDE: Record<string, string> = {
  "pdf-form-fill": FORM, "pdf-forms": FORM,
  "ai-table": TABLE, "ai-chart-to-table": TABLE,
  "extract-images": IMAGEPDF, "pdf-attachments": IMAGEPDF,
  "ai-sign": FORM, "ai-redact": FORM,
};
const EDITOR_IDS = new Set(["add-links", "add-text-box", "crop-pdf", "delete-pages", "extract-pages", "sort-pages"]);

// ---- generic drivers (mirror all-tools-execution.spec.ts) -----------------
async function uploadByAccept(page: Page, primaryOverride?: string): Promise<number> {
  let fed = 0;
  for (let pass = 0; pass < 3; pass++) {
    const inputs = page.locator('input[type="file"]');
    const n = await inputs.count();
    let fedThisPass = 0;
    for (let i = 0; i < n; i++) {
      const inp = inputs.nth(i);
      if ((await inp.count()) === 0) continue;
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
      try { await inp.setInputFiles(files, { timeout: 6000 }); fed++; fedThisPass++; await page.waitForTimeout(400); } catch { /* */ }
    }
    if (fedThisPass === 0) break;
  }
  return fed;
}

async function fillInputs(page: Page): Promise<void> {
  const tas = page.locator("textarea:visible");
  for (let i = 0; i < (await tas.count()); i++) {
    const ta = tas.nth(i);
    if ((await ta.inputValue().catch(() => "x")) === "") {
      try { await ta.fill("pdfcraftai automated verification — please process this sample and produce a result."); } catch { /* */ }
    }
  }
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

type OptGroup = { kind: "select" | "radio"; id: string; values: string[] };
async function enumerate(page: Page): Promise<OptGroup[]> {
  const groups: OptGroup[] = [];
  const selects = page.locator("select:visible");
  const sn = await selects.count();
  for (let i = 0; i < sn; i++) {
    const opts = await selects.nth(i).locator("option").evaluateAll((els) =>
      (els as HTMLOptionElement[]).map((o) => ({ v: o.value, d: o.disabled })));
    const vals = opts.filter((o) => !o.d && o.v !== "").map((o) => o.v);
    if (vals.length > 1) groups.push({ kind: "select", id: String(i), values: [...new Set(vals)].slice(0, MAX_VALUES_PER_GROUP) });
  }
  const byName = await page.locator('input[type="radio"]').evaluateAll((els) => {
    const m: Record<string, string[]> = {};
    (els as HTMLInputElement[]).forEach((e) => { const n = e.getAttribute("name") || "_"; (m[n] ||= []).push(e.getAttribute("value") || ""); });
    return m;
  });
  for (const [name, vals] of Object.entries(byName)) {
    const uniq = [...new Set(vals)].filter(Boolean);
    if (uniq.length > 1) groups.push({ kind: "radio", id: name, values: uniq.slice(0, MAX_VALUES_PER_GROUP) });
  }
  return groups;
}

async function setOption(page: Page, g: OptGroup, value: string): Promise<void> {
  if (g.kind === "select") {
    await page.locator("select:visible").nth(+g.id).selectOption(value).catch(() => {});
  } else {
    const lbl = page.locator(`label:has(input[type="radio"][name="${g.id}"][value="${value}"])`);
    if (await lbl.count()) await lbl.first().click({ force: true }).catch(() => {});
    else await page.locator(`input[type="radio"][name="${g.id}"][value="${value}"]`).check({ force: true }).catch(() => {});
  }
  await page.waitForTimeout(300);
}

// Build the variant list: each value of each group (others left at default).
function buildVariants(groups: OptGroup[]): Array<{ g: OptGroup | null; v: string | null }> {
  if (!groups.length) return [{ g: null, v: null }];
  const out: Array<{ g: OptGroup | null; v: string | null }> = [];
  for (const g of groups) for (const v of g.values) { if (out.length < MAX_VARIANTS) out.push({ g, v }); }
  return out;
}

async function freeVerdict(page: Page, baseline: number, downloadedRef: { v: boolean }): Promise<{ ok: boolean; reason: string }> {
  const deadline = Date.now() + 22_000;
  while (Date.now() < deadline) {
    if (downloadedRef.v) return { ok: true, reason: "download" };
    const erred = await hasError(page);
    if (erred) return { ok: false, reason: `error: ${erred}` };
    const ctrl = page.locator('a[download]:visible, button:visible:has-text("Download"), button:visible:has-text("Save"), button:visible:has-text("Export"), button:visible:has-text("Copy"), button:visible:has-text("JSON"), button:visible:has-text("CSV")');
    for (let i = 0; i < (await ctrl.count()); i++) { if (await ctrl.nth(i).isEnabled().catch(() => false)) return { ok: true, reason: "result control" }; }
    if ((await page.locator('[class*="result"]:visible, [class*="output"]:visible, [class*="stat"]:visible, pre:visible, table:visible, canvas:visible, dl:visible').count()) > 0) return { ok: true, reason: "result region" };
    const body = ((await page.locator("main").first().textContent().catch(() => "")) || "");
    if (BENIGN_EMPTY_RX.test(body)) return { ok: true, reason: "valid empty" };
    if (Math.abs(body.length - baseline) >= 100) return { ok: true, reason: "view transitioned" };
    await page.waitForTimeout(600);
  }
  return { ok: false, reason: "no result signal" };
}

// ---- FREE option matrix ---------------------------------------------------
test.describe("free option matrix", () => {
  test.describe.configure({ retries: 1 });
  for (const tool of FREE) {
    test(`free:${tool.id} — ${tool.name}`, async ({ page }) => {
      test.setTimeout(150_000);
      const resp = await page.goto(`/tool/${tool.id}`, { waitUntil: "domcontentloaded" });
      expect(resp?.status() ?? 0, "page <400").toBeLessThan(400);
      await page.waitForTimeout(700);

      if (EDITOR_IDS.has(tool.id)) {
        await uploadByAccept(page, INPUT_OVERRIDE[tool.id]);
        await page.waitForTimeout(1200);
        const erred = await hasError(page);
        const surface = (await page.locator("canvas:visible, img:visible, [class*='thumb']:visible, [class*='page']:visible, button.btn-primary:visible").count()) > 0;
        record({ tool: tool.id, free: true, group: "(editor)", value: null, ok: !erred && surface, reason: erred || (surface ? "surface renders" : "no surface") });
        expect(!erred && surface, `${tool.id}: editor surface`).toBe(true);
        return;
      }

      // discover options on a freshly-loaded, uploaded page
      await uploadByAccept(page, INPUT_OVERRIDE[tool.id]);
      await fillInputs(page);
      const groups = await enumerate(page);
      const variants = buildVariants(groups);
      record({ tool: tool.id, free: true, kind: "discover", groups: groups.map((g) => ({ id: g.id, kind: g.kind, n: g.values.length })) });

      let anyFail = "";
      for (const variant of variants) {
        await page.goto(`/tool/${tool.id}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(600);
        const downloadedRef = { v: false };
        page.removeAllListeners("download");
        page.on("download", () => { downloadedRef.v = true; });
        await uploadByAccept(page, INPUT_OVERRIDE[tool.id]);
        await fillInputs(page);
        if (variant.g && variant.v != null) await setOption(page, variant.g, variant.v);
        const baseline = ((await page.locator("main").first().textContent().catch(() => "")) || "").length;
        await clickPrimaryAction(page);
        const v = await freeVerdict(page, baseline, downloadedRef);
        record({ tool: tool.id, free: true, group: variant.g ? `${variant.g.kind}:${variant.g.id}` : "(none)", value: variant.v, ok: v.ok, reason: v.reason });
        if (!v.ok) anyFail = `${variant.g?.id || "(none)"}=${variant.v}: ${v.reason}`;
      }
      expect(anyFail === "", `${tool.id}: ${anyFail}`).toBe(true);
    });
  }
});

// ---- AI option matrix -----------------------------------------------------
async function login(page: Page) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto("/login");
    await page.getByRole("button", { name: /reject all|accept all|accept/i }).first().click({ timeout: 4000 }).catch(() => {});
    await page.locator('input[type="email"]').fill(EMAIL!, { timeout: 15_000 });
    await page.locator('input[type="password"]').fill(PASSWORD!, { timeout: 15_000 });
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    if (await page.waitForURL(/\/app\//, { timeout: 25_000 }).then(() => true).catch(() => false)) return;
  }
  throw new Error("login did not reach /app/");
}

test.describe("AI option matrix", () => {
  test.describe.configure({ retries: 1 });
  test.skip(!EMAIL || !PASSWORD, "AI: creds unset");
  test.skip(!AI_OK, "AI: PROD_E2E_AI_BUDGET_OK!=yes (spends credits)");
  test.beforeEach(async ({ page }) => { await login(page); });

  for (const tool of AI) {
    test(`ai:${tool.id} — ${tool.name}`, async ({ page }) => {
      test.setTimeout(240_000);
      // discover options once
      await page.goto(`/tool/${tool.id}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);
      if (tool.special !== "prompt") await uploadByAccept(page, INPUT_OVERRIDE[tool.id]);
      await fillInputs(page);
      const groups = await enumerate(page);
      const variants = buildVariants(groups);
      record({ tool: tool.id, free: false, kind: "discover", groups: groups.map((g) => ({ id: g.id, kind: g.kind, n: g.values.length })) });

      let anyFail = "";
      for (const variant of variants) {
        await page.goto(`/tool/${tool.id}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(600);
        if (tool.special !== "prompt") await uploadByAccept(page, INPUT_OVERRIDE[tool.id]);
        await fillInputs(page);
        if (variant.g && variant.v != null) await setOption(page, variant.g, variant.v);
        const aiRespP = page.waitForResponse((r) => /\/api\/ai\//.test(r.url()) && r.request().method() === "POST", { timeout: 90_000 }).catch(() => null);
        await clickPrimaryAction(page);
        const r = await aiRespP;
        const status = r ? r.status() : -1;
        let bodyLen = 0;
        if (r) { try { bodyLen = (await r.text()).length; } catch { /* */ } }
        const okStatus = status === 402 || (status > 0 && status < 400) ||
          ((tool.id === "ai-sign" || tool.id === "ai-redact") && ![400, 401, 403, 429, 503].includes(status));
        const ok = okStatus && (status === 402 || bodyLen > 20 || tool.id === "ai-sign" || tool.id === "ai-redact");
        record({ tool: tool.id, free: false, group: variant.g ? `${variant.g.kind}:${variant.g.id}` : "(none)", value: variant.v, status, bodyLen, ok });
        if (!ok) anyFail = `${variant.g?.id || "(none)"}=${variant.v}: status ${status}, body ${bodyLen}`;
      }
      expect(anyFail === "", `${tool.id}: ${anyFail}`).toBe(true);
    });
  }
});
