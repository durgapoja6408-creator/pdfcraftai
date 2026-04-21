#!/usr/bin/env node
/**
 * Live production smoke harness for pdfcraftai.com.
 *
 * Goals:
 *  - Prove the apex is healthy and talking to MySQL (/api/health).
 *  - Prove the auth endpoints enforce their input contracts (zod 400s,
 *    rate-limit 429s, and that the always-200 ack on /forgot-password
 *    is still identical whether the email exists or not).
 *  - Prove a sample of the marketing + tool surface returns 200 with
 *    HTML so we catch redirect regressions or 500s after a deploy.
 *
 * Run from repo root:  node scripts/smoke-live.mjs
 * Exits non-zero if any assertion fails.
 */

const BASE = process.env.SMOKE_BASE ?? "https://pdfcraftai.com";

let pass = 0;
let fail = 0;
const failures = [];

function log(label, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  \u2022 ${label} ... PASS`);
  } else {
    fail++;
    failures.push({ label, detail });
    console.log(`  \u2022 ${label} ... FAIL \u2014 ${detail}`);
  }
}

function group(name) {
  console.log(`\n${name}`);
}

async function req(path, init = {}) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, init);
  let body;
  const ct = res.headers.get("content-type") ?? "";
  try {
    body = ct.includes("application/json") ? await res.json() : await res.text();
  } catch {
    body = null;
  }
  return { status: res.status, headers: res.headers, body, url };
}

async function run() {
  console.log(`== pdfcraftai.com live smoke tests (${BASE}) ==`);

  group("health");
  {
    const r = await req("/api/health");
    log("/api/health returns 200", r.status === 200, `got ${r.status}`);
    log(
      "/api/health reports ok=true + db.ok=true",
      r.body && r.body.ok === true && r.body.db?.ok === true,
      JSON.stringify(r.body)?.slice(0, 200)
    );
    log(
      "/api/health has cache-control: no-store",
      (r.headers.get("cache-control") ?? "").includes("no-store"),
      r.headers.get("cache-control") ?? "(missing)"
    );
  }

  group("marketing surface");
  for (const path of ["/", "/pricing", "/tools", "/about", "/help", "/api"]) {
    const r = await req(path);
    log(`GET ${path} returns 200 HTML`, r.status === 200 && typeof r.body === "string" && r.body.length > 500, `status=${r.status} bytes=${typeof r.body === "string" ? r.body.length : "n/a"}`);
  }

  // Catch the "200 but renders COMING SOON placeholder" defect class.
  // A tool page returning HTML with this marker passed previous smoke
  // checks because the URL responded 200 — but the runner was disabled.
  // Real users perceive that as broken. Any path listed in the "live"
  // groups below MUST NOT contain the placeholder string.
  const COMING_SOON_MARKER = "TOOL RUNNER LANDS IN";

  group("tool runner pages (free)");
  for (const path of [
    "/tool/merge",
    "/tool/split",
    "/tool/rotate",
    "/tool/compress",
    "/tool/page-numbers",
    "/tool/to-pdf",
    "/tool/protect",
    "/tool/pdf-to-office",
  ]) {
    const r = await req(path);
    log(`GET ${path} returns 200`, r.status === 200 && typeof r.body === "string", `status=${r.status}`);
    if (typeof r.body === "string") {
      log(
        `  ${path} renders runner (not the COMING SOON shell)`,
        !r.body.includes(COMING_SOON_MARKER),
        `placeholder marker "${COMING_SOON_MARKER}" found in HTML`,
      );
    }
  }

  group("tool runner pages (AI)");
  // When new AI tool IDs land in lib/tools.ts, add them here so the smoke
  // harness catches the "tool page 404s after a data-only edit" regression
  // (cheap mistake: add to tools.ts, forget to wire the page).
  for (const path of [
    "/tool/ai-chat",
    "/tool/ai-summarize",
    "/tool/ai-translate",
    "/tool/ai-ocr",
    "/tool/ai-redact",
    "/tool/ai-compare",
    "/tool/ai-rewrite",
    "/tool/ai-table",
    "/tool/ai-generate",
    "/tool/ai-sign",
  ]) {
    const r = await req(path);
    log(`GET ${path} returns 200`, r.status === 200 && typeof r.body === "string", `status=${r.status}`);
  }

  group("legal + content pages");
  for (const path of [
    "/privacy",
    "/terms",
    "/gdpr",
    "/changelog",
    "/status",
    "/careers",
    "/contact",
    "/help/your-first-merge",
    "/help/lost-password",
    "/help/api-quickstart",
  ]) {
    const r = await req(path);
    log(`GET ${path} returns 200`, r.status === 200 && typeof r.body === "string", `status=${r.status}`);
  }

  group("404 surface");
  {
    const r = await req("/this-route-does-not-exist-" + Date.now());
    log("unknown route returns 404", r.status === 404, `status=${r.status}`);
    const t = await req("/tool/this-tool-does-not-exist");
    log("unknown tool id returns 404", t.status === 404, `status=${t.status}`);
    const h = await req("/help/this-help-slug-does-not-exist");
    log("unknown help slug returns 404", h.status === 404, `status=${h.status}`);
  }

  group("auth guard redirects for logged-out users");
  for (const path of ["/app/dashboard", "/account"]) {
    const r = await req(path, { redirect: "manual" });
    const ok = r.status === 307 || r.status === 302;
    log(`GET ${path} redirects unauthenticated visitor`, ok, `status=${r.status}`);
  }

  group("/api/auth/forgot-password contract");
  {
    // Invalid payload -> 400
    const bad = await req("/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    log("rejects invalid email with 400", bad.status === 400, `status=${bad.status}`);

    // Valid payload with a made-up address -> 200 (anti-enumeration)
    const unique = `smoke+${Date.now()}@pdfcraftai.com`;
    const good = await req("/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: unique }),
    });
    log("accepts a well-formed address with 200", good.status === 200, `status=${good.status}`);

    // Second call within 60s MUST still ack 200 — the bucket throttles
    // silently to avoid leaking which addresses are rate-limited (account
    // enumeration vector). Same status, same body shape.
    const rate = await req("/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: unique }),
    });
    log(
      "per-email throttle stays 200 (anti-enumeration)",
      rate.status === 200,
      `status=${rate.status}`,
    );
  }

  group("/api/auth/reset-password contract");
  {
    // Missing body -> 400
    const empty = await req("/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    log("rejects missing fields with 400", empty.status === 400, `status=${empty.status}`);

    // Wrong-shape token -> 400
    const shape = await req("/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "not-hex", password: "hunter22hunter22" }),
    });
    log("rejects non-hex token with 400", shape.status === 400, `status=${shape.status}`);

    // Well-shaped but nonexistent token -> 409 (enum-safe error)
    const fakeHex = "a".repeat(64);
    const missing = await req("/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: fakeHex, password: "hunter22hunter22" }),
    });
    log("unknown token returns 409", missing.status === 409, `status=${missing.status}`);
  }

  group("geo waitlist surface (Task #3 / launch-notify)");
  {
    // /launch-notify — the dedicated Tier-2 signup page. Bare hit must
    // render 200 HTML, prove the signup card is actually in the markup
    // (not just the outer shell), and carry the `robots: noindex` meta
    // so the page doesn't outrank /pricing in search.
    const base = await req("/launch-notify");
    log(
      "/launch-notify returns 200 HTML",
      base.status === 200 && typeof base.body === "string" && base.body.length > 500,
      `status=${base.status} bytes=${typeof base.body === "string" ? base.body.length : "n/a"}`,
    );
    if (typeof base.body === "string") {
      log(
        "/launch-notify renders the LAUNCH WAITLIST card",
        base.body.includes("LAUNCH WAITLIST"),
        "missing the 'LAUNCH WAITLIST' eyebrow — signup card may not have rendered",
      );
      log(
        "/launch-notify carries noindex meta (utility page, shouldn't rank)",
        /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(base.body),
        "missing <meta name=\"robots\" content=\"noindex,...\"> — SEO regression",
      );
    }

    // /launch-notify?country=DE — campaign hot-link shape. The page
    // passes the code through pickCountry() → LaunchNotifySignup's
    // Tier-2 sanitiser. When the sanitiser accepts the code, the CTA
    // banner ("We'll email you once pdfcraftai.com launches in
    // <Germany>...") renders server-side. Looking for "Germany" in the
    // HTML proves the full param → render path, not just that the
    // route didn't crash on a query string.
    const de = await req("/launch-notify?country=DE");
    log(
      "/launch-notify?country=DE returns 200",
      de.status === 200 && typeof de.body === "string",
      `status=${de.status}`,
    );
    if (typeof de.body === "string") {
      log(
        "/launch-notify?country=DE preselects Germany (CTA banner renders)",
        de.body.includes("Germany"),
        "'Germany' not in HTML — defaultCountry pipeline may be broken",
      );
    }

    // /launch-notify?country=US — Tier-1 code. The sanitiser should
    // silently drop it (no misleading preselect for a country we
    // already serve) and the page should still render 200. This pins
    // the "garbage in → empty picker, not a crash" behaviour.
    const us = await req("/launch-notify?country=US");
    log(
      "/launch-notify?country=US (Tier-1) still renders 200",
      us.status === 200 && typeof us.body === "string",
      `status=${us.status}`,
    );
    if (typeof us.body === "string") {
      // No CTA banner should render — "Germany" (or any country-name
      // string from the sanitiser) must NOT be present because the
      // tier-1 code was dropped.
      log(
        "/launch-notify?country=US does NOT preselect (US is Tier-1)",
        !us.body.includes("We'll email you once pdfcraftai.com launches in"),
        "Tier-1 code leaked through sanitiser — would show misleading 'launching in US' copy",
      );
    }
  }

  group("/api/geo/waitlist contract (probe-only, safe)");
  {
    // Invalid country code → rejected by Zod .refine() pre-insert.
    // Safe to run against prod: no DB row is created when validation
    // fails. Payload is otherwise valid so the ONLY failing field is
    // country — isolates the error code.
    const invalidCountry = await req("/api/geo/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: `smoke+${Date.now()}@pdfcraftai.com`,
        country: "ZZ", // real ISO-2 shape but not in TIER_2_COUNTRIES
        source: "smoke-test",
        consent: true,
        consentText: "I agree to the privacy policy shown above.",
      }),
    });
    log(
      "invalid country rejected with 400",
      invalidCountry.status === 400,
      `status=${invalidCountry.status}`,
    );
    log(
      "invalid country error code is 'country_not_eligible'",
      invalidCountry.body &&
        typeof invalidCountry.body === "object" &&
        invalidCountry.body.error === "country_not_eligible",
      JSON.stringify(invalidCountry.body)?.slice(0, 200),
    );

    // Missing consent → rejected by z.literal(true) pre-insert. Zod
    // runs all top-level checks in one pass and reports the first
    // failing issue — with every other field valid, the consent
    // mismatch surfaces as issues[0]. Safe: no DB row on 400.
    const noConsent = await req("/api/geo/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: `smoke+${Date.now()}@pdfcraftai.com`,
        country: "DE",
        source: "smoke-test",
        consent: false, // fails z.literal(true)
        consentText: "I agree to the privacy policy shown above.",
      }),
    });
    log(
      "missing consent rejected with 400",
      noConsent.status === 400,
      `status=${noConsent.status}`,
    );
    log(
      "missing consent error code is 'consent_required'",
      noConsent.body &&
        typeof noConsent.body === "object" &&
        noConsent.body.error === "consent_required",
      JSON.stringify(noConsent.body)?.slice(0, 200),
    );

    // Invalid JSON body → early 400 before Zod even runs. Pins the
    // `try { await req.json() } catch` branch so a refactor that
    // drops that guard fails here instead of in prod.
    const badJson = await req("/api/geo/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{this is not json",
    });
    log(
      "malformed JSON rejected with 400 'invalid_json'",
      badJson.status === 400 &&
        badJson.body &&
        typeof badJson.body === "object" &&
        badJson.body.error === "invalid_json",
      `status=${badJson.status} body=${JSON.stringify(badJson.body)?.slice(0, 200)}`,
    );

    // GET on a POST-only route → Next.js serves 405. Non-destructive
    // read-only probe that pins the "we only expose POST" contract.
    const wrongMethod = await req("/api/geo/waitlist");
    log(
      "GET /api/geo/waitlist returns 405 (POST-only)",
      wrongMethod.status === 405,
      `status=${wrongMethod.status}`,
    );
  }

  group("/api/auth/providers (NextAuth configuration surface)");
  {
    // NextAuth v5 exposes configured providers at /api/auth/providers
    // as JSON. We want this endpoint reachable (proves the [...nextauth]
    // catch-all is wired) AND containing google at the apex callback
    // URL — a www-domain callback on the apex-serving deploy is the
    // exact bug class that ate an afternoon during OAuth setup.
    const r = await req("/api/auth/providers");
    log(
      "/api/auth/providers returns 200 JSON",
      r.status === 200 && r.body && typeof r.body === "object",
      `status=${r.status} content-type=${r.headers.get("content-type")}`,
    );
    if (r.body && typeof r.body === "object") {
      log(
        "/api/auth/providers includes google",
        Boolean(r.body.google && r.body.google.id === "google"),
        JSON.stringify(r.body)?.slice(0, 300),
      );
      // callbackUrl MUST be apex pdfcraftai.com — the www subdomain
      // redirects 308 to apex, which breaks OAuth's exact-match URL
      // check. We caught this pre-launch; this assertion keeps the
      // fix pinned so a NEXTAUTH_URL drift gets flagged.
      const cb = r.body.google?.callbackUrl ?? "";
      log(
        "google callbackUrl is apex pdfcraftai.com (not www)",
        typeof cb === "string" && cb.startsWith("https://pdfcraftai.com/"),
        `callbackUrl=${cb}`,
      );
    }
  }

  group("SEO plumbing");
  {
    const sm = await req("/sitemap.xml");
    log(
      "/sitemap.xml returns 200 XML",
      sm.status === 200 && typeof sm.body === "string" && sm.body.includes("<urlset"),
      `status=${sm.status}`
    );
    const rb = await req("/robots.txt");
    log(
      "/robots.txt returns 200 referencing sitemap",
      rb.status === 200 && typeof rb.body === "string" && rb.body.toLowerCase().includes("sitemap"),
      `status=${rb.status}`
    );
  }

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f.label}: ${f.detail}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Smoke harness crashed:", err);
  process.exit(2);
});
