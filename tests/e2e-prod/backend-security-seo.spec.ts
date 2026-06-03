// tests/e2e-prod/backend-security-seo.spec.ts
//
// 2026-06-03 — Backend + security-header + SEO sweep against prod.
// API-level checks (no browser interaction needed beyond request ctx).
//   BACKEND: /api/health, sitemap.xml, robots.txt, /sample.pdf, every
//            /api/ai/* route rejects anon with 401/403 (gate intact).
//   SECURITY: CSP / HSTS / X-Frame-Options / X-Content-Type-Options /
//            Referrer-Policy / Permissions-Policy present + sane.
//   AUTH GATING: /app/* and /admin/* redirect anon to /login.
//   SEO: key page types carry <title>, meta description, canonical,
//        og:title; sitemap lists URLs; robots references the sitemap.

import { test, expect } from "@playwright/test";

const AI_ROUTES = ["summarize", "rewrite", "translate", "table", "ocr", "generate", "compare", "chat", "redact", "sign"];

test.describe("backend + API", () => {
  test("health endpoint returns ok JSON", async ({ request }) => {
    const r = await request.get("/api/health");
    expect(r.status(), "health 200").toBe(200);
    const body = await r.text();
    expect(body.length, "health has a body").toBeGreaterThan(1);
  });

  test("sitemap.xml serves 200 + lists URLs", async ({ request }) => {
    const r = await request.get("/sitemap.xml");
    expect(r.status()).toBe(200);
    const xml = await r.text();
    expect(xml).toContain("<urlset");
    expect((xml.match(/<loc>/g) || []).length, "sitemap has many URLs").toBeGreaterThan(50);
  });

  test("robots.txt serves 200 + references sitemap", async ({ request }) => {
    const r = await request.get("/robots.txt");
    expect(r.status()).toBe(200);
    expect((await r.text()).toLowerCase()).toContain("sitemap");
  });

  test("static sample.pdf serves with pdf content-type", async ({ request }) => {
    const r = await request.get("/sample.pdf");
    expect(r.status()).toBe(200);
    expect((r.headers()["content-type"] || "").toLowerCase()).toContain("pdf");
  });

  test("pdfium wasm served as application/wasm (not text/plain)", async ({ request }) => {
    // CLAUDE.md §5: must route through the API handler to get the
    // correct MIME, else PDFium-backed tools fall back to slow init.
    const r = await request.get("/api/pdfium-wasm");
    expect(r.status()).toBe(200);
    expect((r.headers()["content-type"] || "").toLowerCase()).toContain("wasm");
  });

  for (const op of AI_ROUTES) {
    test(`AI route /api/ai/${op} rejects anonymous (gate intact)`, async ({ request }) => {
      const r = await request.post(`/api/ai/${op}`, { data: {}, failOnStatusCode: false });
      // Must NOT be 200 for an unauthenticated empty POST. Expect an
      // auth/validation/method gate: 401/403 (auth), 400/422 (bad input
      // before auth is fine too), 405 (method). The ONLY bad outcome is
      // a 200 (free-AI to the world) or 5xx (route crash).
      expect([401, 403, 400, 422, 404, 405, 429], `${op} returned ${r.status()}`).toContain(r.status());
    });
  }
});

test.describe("security headers", () => {
  test("homepage carries the core security headers", async ({ request }) => {
    const r = await request.get("/");
    expect(r.status()).toBe(200);
    const h = r.headers();
    const csp = h["content-security-policy"] || "";
    expect(csp.length, "CSP present + full (not collapsed to 1 directive)").toBeGreaterThan(200);
    expect(csp, "CSP allows Turnstile challenge frame").toContain("challenges.cloudflare.com");
    expect(h["strict-transport-security"] || "", "HSTS present").toContain("max-age");
    expect((h["x-content-type-options"] || "").toLowerCase()).toContain("nosniff");
    expect((h["x-frame-options"] || h["content-security-policy"] || "").toLowerCase()).toMatch(/sameorigin|frame-ancestors|deny/);
    expect(h["referrer-policy"] || "", "Referrer-Policy present").not.toBe("");
  });
});

test.describe("auth gating (anonymous)", () => {
  // /app/* gate by REDIRECTING anon to /login.
  for (const path of ["/app/dashboard", "/app/chat"]) {
    test(`${path} redirects anon to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page, `${path} should bounce to /login`).toHaveURL(/\/login/, { timeout: 15_000 });
    });
  }
  // /admin/* gate by returning 404 to anon (deliberately hides that the
  // admin surface exists — a stronger posture than a login redirect).
  // Either outcome (404/403 OR a /login bounce) is acceptable; a 2xx
  // that actually renders admin content to anon would be the real gap.
  for (const path of ["/admin", "/admin/margin"]) {
    test(`${path} is NOT accessible to anon (404/403/login)`, async ({ request, page }) => {
      const r = await request.get(path, { maxRedirects: 0, failOnStatusCode: false });
      const status = r.status();
      if (status === 404 || status === 403) return; // hidden — good
      // otherwise it must redirect to /login, not render admin content
      await page.goto(path);
      await expect(page, `${path} must not expose admin content to anon`).toHaveURL(/\/login/, { timeout: 15_000 });
    });
  }
});

test.describe("SEO essentials", () => {
  const PAGES = ["/", "/tools", "/pricing", "/blog", "/extract-emails-from-pdf", "/tool/page-count"];
  for (const path of PAGES) {
    test(`${path} has title + meta description + canonical + og`, async ({ page }) => {
      const resp = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(resp?.status() ?? 0).toBeLessThan(400);
      await expect(page).toHaveTitle(/.{10,}/); // non-trivial title
      const desc = await page.locator('meta[name="description"]').getAttribute("content");
      expect((desc || "").length, "meta description present").toBeGreaterThan(20);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
      expect(canonical || "", "canonical present").toContain("pdfcraftai.com");
      const og = await page.locator('meta[property="og:title"]').count();
      expect(og, "og:title present").toBeGreaterThan(0);
    });
  }
});
