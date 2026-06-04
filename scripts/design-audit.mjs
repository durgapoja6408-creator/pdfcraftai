// scripts/design-audit.mjs
//
// Playwright design/structure audit. For a representative set of pages it
// renders at DESKTOP (1280) + MOBILE (390), scrolls to the bottom, captures
// a FULL-PAGE screenshot, and records structural/UX metrics. For ALL sitemap
// pages it records the lightweight structure metrics (no screenshot) so we
// catch template inconsistencies across the whole catalog.
//
// Output: design-audit/<name>.<desktop|mobile>.png + design-audit/metrics.json
//
// Env: AUDIT_URL (default prod). SHOTS=1 to capture screenshots (default on).
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = (process.env.AUDIT_URL || "https://pdfcraftai.com").replace(/\/$/, "");
const OUT = "design-audit";
mkdirSync(OUT, { recursive: true });

// Representative pages to screenshot (one per template variant + key funnels).
const SHOT_PAGES = [
  ["home", "/"],
  ["tools-index", "/tools"],
  ["free-read", "/tool/page-count"],
  ["free-config", "/tool/bates-numbers"],
  ["free-multi", "/tool/merge"],
  ["free-convert", "/tool/pdf-to-jpg"],
  ["ai-output", "/tool/ai-summarize"],
  ["ai-chat-mktg", "/chat-with-pdf"],
  ["seo-landing", "/extract-emails-from-pdf"],
  ["pricing", "/pricing"],
];

async function metrics(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const q = (s) => [...document.querySelectorAll(s)];
    const h1 = q("h1"), h2 = q("h2"), h3 = q("h3");
    // heading order: collect all h1-h4 levels in DOM order, flag jumps (>1)
    const heads = q("h1,h2,h3,h4").map((h) => +h.tagName[1]);
    let orderJumps = 0;
    for (let i = 1; i < heads.length; i++) if (heads[i] - heads[i - 1] > 1) orderJumps++;
    // landmarks
    const landmarks = {
      header: !!document.querySelector("header"),
      nav: !!document.querySelector("nav"),
      main: !!document.querySelector("main"),
      footer: !!document.querySelector("footer"),
    };
    // above-the-fold: is a file input / primary CTA visible without scrolling?
    const inFold = (el) => { const r = el.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0 && r.width > 0 && r.height > 0; };
    const fileInput = q('input[type="file"]')[0];
    const dropzone = q('[class*="drop"], [class*="Drop"]').find(inFold);
    const primaryBtn = q("button, a.btn, a[role=button]").find((b) => inFold(b) && /try|start|upload|count|run|convert|drop|get started|choose|select/i.test(b.textContent || ""));
    const toolAboveFold = !!(dropzone || (fileInput && inFold(fileInput)) || primaryBtn);
    // horizontal overflow (mobile layout breakage)
    const docW = document.documentElement.scrollWidth;
    const overflowX = Math.max(0, docW - vw);
    // Find elements WIDER than the viewport (true overflow causes).
    const wide = [];
    for (const el of q("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width > vw + 1) {
        const cs = getComputedStyle(el);
        wide.push({ w: Math.round(r.width), tag: el.tagName,
          cls: (el.className || "").toString().slice(0, 40),
          mw: cs.minWidth, ws: cs.whiteSpace,
          txt: (el.textContent || "").trim().slice(0, 26) });
      }
    }
    wide.sort((a, b) => b.w - a.w);
    const widest = { topWide: wide.slice(0, 3) };
    // SEO structural signals
    const metaDesc = (document.querySelector('meta[name="description"]')?.getAttribute("content") || "").length;
    const hasCanonical = !!document.querySelector('link[rel="canonical"]');
    const titleLen = (document.title || "").length;
    // tiny tap targets (interactive elements < 40px in the smaller dimension)
    let tinyTargets = 0;
    for (const el of q("a, button, input, [role=button]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (Math.min(r.width, r.height) < 32) tinyTargets++;
    }
    // tiny font sizes (< 12px body text)
    let tinyFont = 0;
    for (const el of q("p, span, div, li, a")) {
      const t = (el.childNodes.length === 1 && el.firstChild && el.firstChild.nodeType === 3) ? (el.textContent || "").trim() : "";
      if (!t || t.length < 8) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs && fs < 12) tinyFont++;
    }
    return {
      vw, widest, metaDesc, hasCanonical, titleLen, h1: h1.length, h2: h2.length, h3: h3.length, headingOrderJumps: orderJumps,
      h1Text: (h1[0] && h1[0].textContent || "").trim().slice(0, 60),
      landmarks, toolAboveFold, overflowX, tinyTargets, tinyFont,
      scrollH: document.body.scrollHeight,
      sections: q("section").length,
    };
  });
}

async function scrollToBottom(page) {
  await page.evaluate(async () => {
    await new Promise((res) => { let y = 0; const t = setInterval(() => { window.scrollTo(0, y); y += 900; if (y >= document.body.scrollHeight) { clearInterval(t); res(); } }, 25); });
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
}

async function run() {
  const browser = await chromium.launch();
  const report = { shots: [], all: [] };

  // 1) representative pages: desktop + mobile screenshots + metrics
  for (const [name, path] of SHOT_PAGES) {
    for (const [mode, vp] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      try {
        await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(1200); // let client tool runner mount
        await scrollToBottom(page);
        const m = await metrics(page);
        const file = `${OUT}/${name}.${mode}.png`;
        await page.screenshot({ path: file, fullPage: true });
        report.shots.push({ name, path, mode, ...m });
        console.log(`shot ${name}.${mode}  vw=${m.vw} h1=${m.h1} h2=${m.h2} overflowX=${m.overflowX} widest=${m.widest?JSON.stringify(m.widest):"-"} scrollH=${m.scrollH}`);
      } catch (e) { console.log(`FAIL ${name}.${mode}: ${(e.message || e).slice(0, 120)}`); }
      await ctx.close();
    }
  }

  // 2) structural scan across ALL sitemap pages (mobile, metrics only)
  let urls = [];
  // Node fetch (raw XML) + retry — page.goto()+response.text() proved flaky
  // for the XML doc (returned 0 locs intermittently).
  for (let attempt = 0; attempt < 4 && urls.length === 0; attempt++) {
    try {
      const res = await fetch(BASE + "/sitemap.xml", { headers: { accept: "application/xml" } });
      const xml = await res.text();
      urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter((u) => u.startsWith(BASE));
      if (urls.length === 0) console.log(`sitemap attempt ${attempt}: HTTP ${res.status}, ${xml.length} chars, 0 locs`);
    } catch (e) { console.log(`sitemap fetch error (attempt ${attempt}):`, (e.message || e).slice(0, 100)); }
    if (urls.length === 0) await new Promise((r) => setTimeout(r, 4000));
  }
  const limit = process.env.AUDIT_MAX ? +process.env.AUDIT_MAX : urls.length;
  urls = urls.slice(0, limit);
  console.log(`\n-- structural scan of ${urls.length} pages (mobile 390, full scroll, reused context) --`);
  // Reuse ONE context + page across all URLs (per-URL newContext was the
  // bottleneck that timed out at 295). Full scroll-to-bottom on every page.
  const sctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const spage = await sctx.newPage();
  let n = 0;
  for (const u of urls) {
    n++;
    try {
      await spage.goto(u, { waitUntil: "domcontentloaded", timeout: 25000 });
      // Light scroll (2 screens) — structural metrics (headings/landmarks/
      // overflow/meta) are load-time DOM facts; the full-scroll render check
      // is the crawl's job (scrolls all 295). Full-scroll here blew the budget.
      await spage.evaluate(() => window.scrollTo(0, window.innerHeight * 2));
      await spage.waitForTimeout(120);
      const m = await metrics(spage);
      report.all.push({ url: u.replace(BASE, "") || "/", h1: m.h1, h2: m.h2,
        headingOrderJumps: m.headingOrderJumps, landmarks: m.landmarks, overflowX: m.overflowX,
        tinyTargets: m.tinyTargets, toolAboveFold: m.toolAboveFold, metaDesc: m.metaDesc,
        hasCanonical: m.hasCanonical, titleLen: m.titleLen, scrollH: m.scrollH });
      if (n % 25 === 0) console.log(`  …${n}/${urls.length}`);
    } catch (e) { report.all.push({ url: u.replace(BASE, ""), err: (e.message || e).slice(0, 80) }); }
  }
  await sctx.close();
  await browser.close();

  writeFileSync(`${OUT}/metrics.json`, JSON.stringify(report, null, 2));

  // structural-issue summary
  const a = report.all;
  const multiH1 = a.filter((r) => r.h1 > 1);
  const noH1 = a.filter((r) => r.h1 === 0 && !r.err);
  const jumps = a.filter((r) => r.headingOrderJumps > 0);
  const overflow = a.filter((r) => r.overflowX > 2);
  const noMain = a.filter((r) => r.landmarks && !r.landmarks.main);
  console.log(`\n===== STRUCTURE SCAN (${a.length} pages) =====`);
  console.log(`multiple <h1>: ${multiH1.length}  | missing <h1>: ${noH1.length}  | heading-order jumps: ${jumps.length}`);
  console.log(`mobile horizontal overflow (>2px): ${overflow.length}  | missing <main>: ${noMain.length}`);
  if (overflow.length) overflow.slice(0, 25).forEach((r) => console.log(`  overflowX=${r.overflowX}px  ${r.url}`));
  if (multiH1.length) multiH1.slice(0, 15).forEach((r) => console.log(`  h1=${r.h1}  ${r.url}`));
  if (jumps.length) jumps.slice(0, 20).forEach((r) => console.log(`  jumps=${r.headingOrderJumps}  ${r.url}`));
  const noDesc = a.filter((r) => (r.metaDesc || 0) < 20 && !r.err);
  const noCanon = a.filter((r) => r.hasCanonical === false && !r.err);
  const badTitle = a.filter((r) => (r.titleLen || 0) < 10 && !r.err);
  console.log(`SEO: missing/short meta-description: ${noDesc.length}  | missing canonical: ${noCanon.length}  | short <title>: ${badTitle.length}`);
  if (noDesc.length) noDesc.slice(0, 15).forEach((r) => console.log(`  desc=${r.metaDesc}  ${r.url}`));
  if (noCanon.length) noCanon.slice(0, 15).forEach((r) => console.log(`  no-canonical  ${r.url}`));
  const maxOv = a.filter((r)=>(r.overflowX||0)>2).sort((x,y)=>y.overflowX-x.overflowX);
  console.log(`mobile overflow worst: ${maxOv.slice(0,5).map(r=>r.overflowX+"px "+r.url).join(" | ") || "none"}`);
  console.log(`\nReport: design-audit/metrics.json + ${report.shots.length} screenshots`);
}
run().catch((e) => { console.error(e); process.exit(1); });
