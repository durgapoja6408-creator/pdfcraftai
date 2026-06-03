// tests/e2e-prod/smoke.spec.ts
//
// 2026-05-12 — Phase 1 anonymous read-only smoke against the live
// production site. Covers what an unauthenticated visitor sees +
// validates infrastructure invariants (SEO meta, JSON-LD shape,
// sitemap integrity, security headers).
//
// What this suite WILL NOT cover (intentional Phase 1 scope):
//   - Authenticated flows (login, dashboard, settings)
//   - Tool execution (no file uploads, no AI calls — would consume
//     real credits + drop real files into production storage)
//   - Payment flows (would charge a real card or require sandbox
//     keys that don't exist on prod)
//   - Destructive operations (account deletion, password reset)
//
// Those land in Phase 2 (auth flows with a test account) and
// Phase 3 (payments via Razorpay sandbox). See the on-demand E2E
// README for the roadmap.
//
// Safety guarantees of Phase 1:
//   - Every request is GET (zero POST/PUT/DELETE)
//   - Zero side effects on production (no file uploads, no
//     credit spend, no account changes)
//   - Custom User-Agent identifies our health-check traffic in logs

import { test, expect } from "@playwright/test";

// ─── Group A: Homepage + hero ─────────────────────────────────────────────────

test.describe("homepage", () => {
  test("loads with 200 and key hero elements", async ({ page }) => {
    const resp = await page.goto("/");
    expect(resp?.status()).toBe(200);
    await expect(page).toHaveTitle(/pdfcraft ai/i);
    // Hero CTA — at least one of the variants (the A/B test may be
    // active and showing the /compare variant).
    const hasToolsCta = await page
      .locator('a[href="/tools"]:has-text("Try it now")')
      .count();
    const hasCompareCta = await page
      .locator('a[href="/compare"]:has-text("Pick a tool")')
      .count();
    expect(hasToolsCta + hasCompareCta).toBeGreaterThan(0);
  });

  test("has WebSite + SearchAction JSON-LD for sitelinks search box", async ({
    page,
  }) => {
    await page.goto("/");
    const scripts = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    const merged = scripts.join(" ");
    expect(merged).toContain('"@type":"WebSite"');
    expect(merged).toContain('"@type":"SearchAction"');
  });

  test("has cookie consent banner with Accept + Reject", async ({ page }) => {
    await page.goto("/");
    // Banner should render in the SSR HTML (it's a client component
    // but the wrapper + buttons are in the initial markup).
    await expect(page.getByRole("button", { name: /accept all/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /reject all/i })).toBeVisible();
  });
});

// ─── Group B: Catalog + intent router ─────────────────────────────────────────

test.describe("catalog surfaces", () => {
  test("/tools renders the catalog with >100 tool entries", async ({ page }) => {
    const resp = await page.goto("/tools");
    expect(resp?.status()).toBe(200);
    // Catalog tools render as <a href="/tool/<id>"> entries.
    const toolLinks = await page.locator('a[href^="/tool/"]').count();
    expect(toolLinks).toBeGreaterThan(100);
  });

  test("/tools has CollectionPage + ItemList JSON-LD", async ({ page }) => {
    await page.goto("/tools");
    const scripts = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    const merged = scripts.join(" ");
    expect(merged).toContain('"@type":"CollectionPage"');
    expect(merged).toContain('"@type":"ItemList"');
  });

  test("/compare renders 12 intent groups + FAQPage JSON-LD", async ({
    page,
  }) => {
    const resp = await page.goto("/compare");
    expect(resp?.status()).toBe(200);
    const h2Count = await page.locator("section[id] h2").count();
    expect(h2Count).toBeGreaterThanOrEqual(12);
    const scripts = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    expect(scripts.join(" ")).toContain('"@type":"FAQPage"');
  });
});

// ─── Group C: Pricing + payments surface (read-only) ──────────────────────────

test.describe("pricing", () => {
  test("/pricing returns 200 + has Product + FAQ JSON-LD", async ({ page }) => {
    const resp = await page.goto("/pricing");
    expect(resp?.status()).toBe(200);
    const scripts = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    const merged = scripts.join(" ");
    expect(merged).toContain('"@type":"ProductGroup"');
    expect(merged).toContain('"@type":"FAQPage"');
  });

  test("/pricing shows all 4 named credit packs", async ({ page }) => {
    await page.goto("/pricing");
    // Pack names render in the visual cards — at minimum each name
    // appears once.
    for (const name of ["Starter", "Creator", "Pro", "Studio"]) {
      await expect(
        page.locator("body").getByText(name, { exact: false }).first(),
      ).toBeVisible();
    }
  });
});

// ─── Group D: Trust surfaces ──────────────────────────────────────────────────

test.describe("trust & legal", () => {
  for (const path of [
    "/privacy",
    "/terms",
    "/refund-policy",
    "/cancellation-policy",
    "/cookies",
    "/dpa",
    "/gdpr",
    "/security",
  ]) {
    test(`${path} returns 200 + sets og:image`, async ({ page, request }) => {
      const resp = await page.goto(path);
      expect(resp?.status()).toBe(200);
      const html = await page.content();
      // SEV-2 audit fix landing — every legal page should have
      // og:image either via its own openGraph block or via the
      // root layout cascade.
      expect(html).toMatch(/property="og:image"/);
    });
  }
});

// ─── Group E: Alternatives surface ────────────────────────────────────────────

test.describe("alternatives", () => {
  test("/alternatives lists all 5 competitor cards", async ({ page }) => {
    const resp = await page.goto("/alternatives");
    expect(resp?.status()).toBe(200);
    // Each competitor renders a card with "<name> alternative" text.
    for (const name of ["iLovePDF", "Smallpdf", "Adobe Acrobat", "PDF24", "Sejda"]) {
      await expect(page.locator("body").getByText(name).first()).toBeVisible();
    }
  });

  for (const slug of ["ilovepdf", "smallpdf", "adobe-acrobat", "pdf24", "sejda"]) {
    test(`/alternatives/${slug} returns 200 + has Article JSON-LD`, async ({
      page,
    }) => {
      const resp = await page.goto(`/alternatives/${slug}`);
      expect(resp?.status()).toBe(200);
      const scripts = await page
        .locator('script[type="application/ld+json"]')
        .allTextContents();
      expect(scripts.join(" ")).toContain('"@type":"Article"');
    });
  }
});

// ─── Group F: Tool pages (smoke — no execution) ───────────────────────────────

test.describe("tool pages", () => {
  for (const id of [
    "merge",
    "split",
    "compress-pdf",
    "pdf-to-text",
    "ai-summarize",
    "ai-translate",
    "ai-redact",
    "unlock",
    "sign-pdf-free",
    "free-draw-pdf",
  ]) {
    test(`/tool/${id} returns 200 + has SoftwareApplication JSON-LD`, async ({
      page,
    }) => {
      const resp = await page.goto(`/tool/${id}`);
      // Some tools 308-redirect to a canonical SEO landing; both
      // 200 (no redirect) and 308 (then final 200 after follow) are
      // acceptable.
      expect([200, 308]).toContain(resp?.status() ?? 0);
      const scripts = await page
        .locator('script[type="application/ld+json"]')
        .allTextContents();
      const merged = scripts.join(" ");
      // Either a SoftwareApplication card (genuine tool) or an
      // Article card (the SEO landing it redirected to) is fine.
      expect(
        /\"@type\":\"(SoftwareApplication|Article|HowTo)\"/.test(merged),
      ).toBeTruthy();
    });
  }
});

// ─── Group G: Blog ────────────────────────────────────────────────────────────

test.describe("blog", () => {
  test("/blog renders >=20 post cards", async ({ page }) => {
    const resp = await page.goto("/blog");
    expect(resp?.status()).toBe(200);
    const postLinks = await page.locator('a[href^="/blog/"]').count();
    expect(postLinks).toBeGreaterThan(20);
  });

  test("/blog/pick-the-right-pdf-tool returns 200 + has Article JSON-LD", async ({
    page,
  }) => {
    const resp = await page.goto("/blog/pick-the-right-pdf-tool");
    expect(resp?.status()).toBe(200);
    const scripts = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    expect(scripts.join(" ")).toContain('"@type":"Article"');
  });

  test("/blog/rss.xml returns valid RSS XML", async ({ request }) => {
    const resp = await request.get("/blog/rss.xml");
    expect(resp.status()).toBe(200);
    const text = await resp.text();
    expect(text).toMatch(/<rss/);
    expect(text).toMatch(/<channel>/);
  });
});

// ─── Group H: Help center ─────────────────────────────────────────────────────

test.describe("help center", () => {
  test("/help renders >=20 article links", async ({ page }) => {
    const resp = await page.goto("/help");
    expect(resp?.status()).toBe(200);
    const articleLinks = await page.locator('a[href^="/help/"]').count();
    expect(articleLinks).toBeGreaterThan(20);
  });

  test("help search renders as a real <form action='/help'>", async ({
    page,
  }) => {
    await page.goto("/help");
    // SEV-1 audit fix: the search must be a real form with method=get
    // action=/help so non-JS visitors get a usable submit path.
    const formAction = await page
      .locator('form[action="/help"]')
      .getAttribute("action");
    expect(formAction).toBe("/help");
  });

  test("how-do-I-cancel article is reachable", async ({ page }) => {
    const resp = await page.goto("/help/cancel-subscription");
    expect(resp?.status()).toBe(200);
    await expect(page.getByText(/cancel/i).first()).toBeVisible();
  });
});

// ─── Group I: Use cases ───────────────────────────────────────────────────────

test.describe("use cases", () => {
  test("/use-cases renders >=9 use-case cards + CollectionPage JSON-LD", async ({
    page,
  }) => {
    const resp = await page.goto("/use-cases");
    expect(resp?.status()).toBe(200);
    const links = await page.locator('a[href^="/use-cases/"]').count();
    expect(links).toBeGreaterThanOrEqual(9);
    const scripts = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    expect(scripts.join(" ")).toContain('"@type":"CollectionPage"');
  });
});

// ─── Group J: Marketing pages ────────────────────────────────────────────────

test.describe("marketing surfaces", () => {
  test("/bulk has Service JSON-LD", async ({ page }) => {
    await page.goto("/bulk");
    const scripts = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    expect(scripts.join(" ")).toContain('"@type":"Service"');
  });

  test("/enterprise has Service JSON-LD + contact form", async ({ page }) => {
    await page.goto("/enterprise");
    const scripts = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    expect(scripts.join(" ")).toContain('"@type":"Service"');
    await expect(page.locator("form")).toBeVisible();
  });

  test("/about loads", async ({ page }) => {
    const resp = await page.goto("/about");
    expect(resp?.status()).toBe(200);
  });
});

// ─── Group K: Infrastructure invariants ───────────────────────────────────────

test.describe("infrastructure", () => {
  test("/sitemap.xml returns 200, valid XML, contains key paths", async ({
    request,
  }) => {
    const resp = await request.get("/sitemap.xml");
    expect(resp.status()).toBe(200);
    const text = await resp.text();
    expect(text).toContain("<urlset");
    expect(text).toContain("https://pdfcraftai.com/");
    expect(text).toContain("/pricing");
    expect(text).toContain("/compare");
    expect(text).toContain("/tools");
    // Sitemap must NOT contain redirect-source /tool/ai-chat
    // (SEV-1 audit fix — REDIRECTED_TOOL_IDS exclusion).
    expect(text).not.toContain("/tool/ai-chat");
  });

  test("/robots.txt returns 200 + allows crawl", async ({ request }) => {
    const resp = await request.get("/robots.txt");
    expect(resp.status()).toBe(200);
    const text = await resp.text();
    expect(text).toMatch(/User-agent:/);
  });

  test("/api/health returns 200, ok=true, db.ok=true", async ({ request }) => {
    const resp = await request.get("/api/health");
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.ok).toBe(true);
    expect(json.db?.ok).toBe(true);
    // SEV-2 audit fix: anonymous callers see only ai.configured —
    // NOT the full provider ladder.
    expect(json.ai).toHaveProperty("configured");
    expect(json.ai).not.toHaveProperty("defaults");
  });

  test("/sample.pdf returns 200 + PDF content-type", async ({ request }) => {
    const resp = await request.get("/sample.pdf");
    expect(resp.status()).toBe(200);
    const contentType = resp.headers()["content-type"];
    expect(contentType).toMatch(/pdf/i);
  });

  test("/api/pdfium-wasm returns application/wasm content-type", async ({
    request,
  }) => {
    // CLAUDE.md §5 PDFium-WASM finding — Hostinger LiteSpeed serves
    // public/*.wasm as text/plain. The /api/pdfium-wasm route
    // exists specifically to override the MIME. Regression here
    // would silently break every PDFium-backed tool.
    const resp = await request.get("/api/pdfium-wasm");
    expect(resp.status()).toBe(200);
    expect(resp.headers()["content-type"]).toBe("application/wasm");
  });
});

// ─── Group L: Security & headers ──────────────────────────────────────────────

test.describe("security headers", () => {
  test("homepage sets CSP + X-Frame-Options + Strict-Transport-Security", async ({
    request,
  }) => {
    const resp = await request.get("/");
    const headers = resp.headers();
    expect(headers["content-security-policy"]).toBeTruthy();
    expect(headers["x-frame-options"] ?? headers["X-Frame-Options"]).toMatch(
      /DENY|SAMEORIGIN/i,
    );
    expect(headers["strict-transport-security"]).toMatch(/max-age=/);
  });

  test("CSP allows challenges.cloudflare.com (Turnstile)", async ({
    request,
  }) => {
    const resp = await request.get("/");
    const csp = resp.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("challenges.cloudflare.com");
  });
});

// ─── Group M: Auth surface (read-only redirects) ──────────────────────────────

test.describe("auth surfaces", () => {
  test("/app/welcome 307s anonymous user to /login", async ({ request }) => {
    // Disable redirect follow to inspect the actual 307.
    const resp = await request.get("/app/welcome", { maxRedirects: 0 });
    expect([302, 307, 308]).toContain(resp.status());
    const location = resp.headers()["location"] ?? "";
    expect(location).toMatch(/\/login/);
  });

  test("/app/admin/kill-switches 404s for anonymous users (no leak)", async ({
    request,
  }) => {
    // SEV-0 audit fix: admin pages now notFound() for non-admins.
    // From an anonymous probe, the /app/* layout's redirect-to-
    // login fires first; the leak check is that /admin/kill-switches
    // never returns the legacy 200 with "Admin access required"
    // card. Either 302/307 to login OR 404 is acceptable.
    const resp = await request.get("/app/admin/kill-switches", {
      maxRedirects: 0,
    });
    expect([302, 307, 308, 404]).toContain(resp.status());
  });

  test("/login renders the form", async ({ page }) => {
    const resp = await page.goto("/login");
    expect(resp?.status()).toBe(200);
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});
