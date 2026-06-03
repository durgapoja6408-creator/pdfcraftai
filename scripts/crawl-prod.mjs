// scripts/crawl-prod.mjs
//
// Comprehensive public-page crawl of production via Playwright/Chromium.
// Runs in GitHub Actions (Chromium can't launch in the Cowork sandbox).
//
// For EVERY URL in sitemap.xml it: loads the page, scrolls to the bottom
// (triggers lazy content), and records: HTTP status, render health (error-
// boundary / 404 text), console errors, uncaught page exceptions, failed
// (>=400) network responses, and broken <img>s. Read-only — no logins, no
// mutations, no credit spend. Writes crawl-report.json + prints a summary.
//
// Env: CRAWL_BASE_URL (default https://pdfcraftai.com), CRAWL_MAX (0=all),
//      CRAWL_CONCURRENCY (default 4).
import { chromium, firefox, webkit } from "@playwright/test";

// Cross-browser: CRAWL_BROWSER=chromium|firefox|webkit (default chromium).
const ENGINES = { chromium, firefox, webkit };
const ENGINE = (process.env.CRAWL_BROWSER || "chromium").toLowerCase();
const browserType = ENGINES[ENGINE] || chromium;
import { writeFileSync } from "node:fs";

const BASE = (process.env.CRAWL_BASE_URL || "https://pdfcraftai.com").replace(/\/$/, "");
const MAX = parseInt(process.env.CRAWL_MAX || "0", 10);
const CONCURRENCY = Math.max(1, parseInt(process.env.CRAWL_CONCURRENCY || "4", 10));

async function fetchLocs(url) {
  const res = await fetch(url);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}
async function getUrls() {
  let locs = await fetchLocs(`${BASE}/sitemap.xml`);
  // handle sitemap-index (locs pointing at more .xml sitemaps)
  const subs = locs.filter((u) => u.endsWith(".xml"));
  if (subs.length) {
    const more = (await Promise.all(subs.map(fetchLocs))).flat();
    locs = locs.filter((u) => !u.endsWith(".xml")).concat(more);
  }
  const uniq = [...new Set(locs)].filter((u) => u.startsWith(BASE));
  return MAX > 0 ? uniq.slice(0, MAX) : uniq;
}

async function visit(browser, url) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const consoleErrors = [], pageErrors = [], failedReq = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => pageErrors.push((e.message || String(e)).slice(0, 200)));
  page.on("response", (r) => { if (r.status() >= 400) failedReq.push(`${r.status()} ${r.url().slice(0, 160)}`); });
  let status = 0, ok = false, scrollH = 0, brokenImgs = 0, err = null;
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    status = resp ? resp.status() : 0;
    await page.evaluate(async () => {
      await new Promise((res) => { let y = 0; const t = setInterval(() => { window.scrollTo(0, y); y += 900; if (y >= document.body.scrollHeight) { clearInterval(t); res(); } }, 35); });
    });
    await page.waitForTimeout(300);
    scrollH = await page.evaluate(() => document.body.scrollHeight);
    brokenImgs = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length);
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
    const errored = /something went wrong|application error|could not be found|page not found|500 -|internal server error/i.test(bodyText);
    ok = status >= 200 && status < 400 && !errored;
  } catch (e) { err = (e.message || String(e)).split("\n")[0].slice(0, 200); }
  await ctx.close();
  return { url, status, ok, scrollH, consoleErrors, pageErrors, failedReq, brokenImgs, err };
}

(async () => {
  const urls = await getUrls();
  console.log(`Crawling ${urls.length} URLs from ${BASE}/sitemap.xml on [${ENGINE}] (concurrency ${CONCURRENCY})`);
  const browser = await browserType.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < urls.length) {
      const u = urls[idx++];
      const r = await visit(browser, u);
      results.push(r);
      const tag = r.ok ? "ok " : "BAD";
      console.log(`[${results.length}/${urls.length}] ${tag} ${String(r.status).padEnd(3)} ce=${r.consoleErrors.length} pe=${r.pageErrors.length} 4xx=${r.failedReq.length} img=${r.brokenImgs} ${(r.url.replace(BASE, "") || "/")}${r.err ? " ERR:" + r.err : ""}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await browser.close();
  writeFileSync("crawl-report.json", JSON.stringify(results, null, 2));
  const bad = results.filter((r) => !r.ok);
  const withConsole = results.filter((r) => r.consoleErrors.length || r.pageErrors.length);
  const withBroken = results.filter((r) => r.brokenImgs > 0);
  const with4xx = results.filter((r) => r.failedReq.length);
  console.log(`\n===== CRAWL SUMMARY [${ENGINE}] =====`);
  console.log(`total=${results.length}  ok=${results.length - bad.length}  bad=${bad.length}  consoleErrPages=${withConsole.length}  brokenImgPages=${withBroken.length}  failedReqPages=${with4xx.length}`);
  if (bad.length) { console.log(`\n-- BAD pages (${bad.length}) --`); bad.forEach((r) => console.log(`  ${r.status} ${r.url} ${r.err || ""}`)); }
  if (withConsole.length) { console.log(`\n-- console / page errors (${withConsole.length}) --`); withConsole.slice(0, 50).forEach((r) => console.log(`  ${r.url}\n     ${[...r.pageErrors, ...r.consoleErrors].slice(0, 2).join("\n     ")}`)); }
  if (withBroken.length) { console.log(`\n-- broken images (${withBroken.length}) --`); withBroken.forEach((r) => console.log(`  ${r.url}  (${r.brokenImgs})`)); }
  if (with4xx.length) { console.log(`\n-- pages with failed (>=400) sub-requests (${with4xx.length}) --`); with4xx.slice(0, 40).forEach((r) => console.log(`  ${r.url} :: ${r.failedReq.slice(0, 3).join(" ; ")}`)); }
  console.log(`\nReport written: crawl-report.json`);
  process.exit(0); // report-only: do not fail the job on findings
})().catch((e) => { console.error("CRAWL FATAL:", e); process.exit(1); });
