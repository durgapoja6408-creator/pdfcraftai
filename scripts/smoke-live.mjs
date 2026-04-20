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
  for (const path of [
    "/tool/ai-chat",
    "/tool/ai-summarize",
    "/tool/ai-translate",
    "/tool/ai-ocr",
    "/tool/ai-redact",
    "/tool/ai-compare",
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
