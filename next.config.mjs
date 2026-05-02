/** @type {import('next').NextConfig} */

import { execSync } from "node:child_process";

// --- Build-time deploy commit SHA ----------------------------------------
//
// Hostinger doesn't inject a commit SHA into the runtime env on its own, so
// `/api/health` was returning `commit: null` — forcing deploy verification
// via CSS-bundle greps. Capture the short SHA at build time and bake it
// into `process.env.BUILD_COMMIT_SHA` via the `env` block below. Next.js
// inlines these values at build time; no runtime file reads needed.
//
// If `git` isn't available (shouldn't happen on Hostinger's GitHub-App
// deploy path, which checks out the full repo), fall through to `null`
// quietly — health still returns, just without a SHA.
let BUILD_COMMIT_SHA = null;
try {
  BUILD_COMMIT_SHA = execSync("git rev-parse --short=12 HEAD", {
    stdio: ["ignore", "pipe", "ignore"],
  })
    .toString()
    .trim();
} catch (_) {
  // git not available at build time — leave SHA null.
}

// --- Build-time recent-commit log ----------------------------------------
//
// 2026-04-29: bake the last 25 commits into the build so /admin/deploy
// can render a "what's deployed" punch list without needing a GitHub API
// call. Format: a JSON-stringified array of { sha, author, isoDate,
// subject }. 25 entries covers a full session of work without bloating
// the env var (~3KB ceiling).
//
// We use `--no-merges` so merge commits don't crowd out the actual ship-
// commits operators care about. `` as a field delimiter (instead
// of `|`) so commit subjects containing pipes don't break the split.
let BUILD_RECENT_COMMITS = "[]";
try {
  const raw = execSync(
    "git log -n 25 --no-merges --pretty=format:%h%an%cI%s",
    { stdio: ["ignore", "pipe", "ignore"] },
  )
    .toString()
    .trim();
  const commits = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, author, isoDate, subject] = line.split("");
      return { sha, author, isoDate, subject };
    });
  BUILD_RECENT_COMMITS = JSON.stringify(commits);
} catch (_) {
  // git unavailable — bake empty array; /admin/deploy renders "(unavailable)".
}

// --- PCI DSS SAQ-A scope lockdown -----------------------------------------
//
// Our SAQ-A eligibility rests on card data NEVER touching our origin.
// Users type card details into hosted iframes (Razorpay Checkout modal).
// The CSP below enforces that architecture at the browser layer:
//
//   - `frame-src` whitelists ONLY the provider iframes. A phishing page
//     embedded elsewhere can't render inside our origin.
//   - `script-src` whitelists provider SDK origins + 'self'. A compromised
//     third-party script cannot inject a fake card form because the new
//     script origin would be blocked.
//   - `connect-src` whitelists provider APIs. If we or an injected script
//     tried to POST card data to a rogue endpoint, the browser blocks it.
//   - `form-action 'self'` — form submits go to our origin only.
//   - `base-uri 'self'` — blocks <base href> injection that could reroute
//     relative URLs to an attacker.
//
// If this file changes in a way that widens `script-src`, `frame-src`, or
// `connect-src`, the PCI checklist in docs/security/pci-saq-a.md must be
// reviewed — adding a new third-party payment-adjacent origin can push us
// out of SAQ-A into a heavier SAQ.
//
// CSP notes:
//   - 'unsafe-inline' on script-src is a concession to Next.js inline
//     script runtime. When Next 15's strict CSP lands we should switch to
//     nonces. For SAQ-A this is acceptable because the card-capture path
//     is *inside* the provider iframe — our inline scripts can't reach it.
//   - 'unsafe-eval' is omitted. The Razorpay SDK doesn't need it.
//   - report-uri is not set yet — add a Sentry CSP endpoint when infra
//     has one.

const RAZORPAY_ORIGINS = [
  "https://checkout.razorpay.com",
  "https://api.razorpay.com",
  "https://lumberjack.razorpay.com",
];

// 2026-05-01 — PADDLE_ORIGINS removed (Paddle retired at commit 92f965a;
// adapter / webhook route / dedicated test suite all deleted, registry
// stripped of Paddle, router defaults non-IN traffic to "defer"). Razorpay
// is the sole payment processor today. International payments will route
// through whichever gateway gets approved next; when that happens, add a
// new {GATEWAY}_ORIGINS const + thread it through the CSP joins below
// + add to the Permissions-Policy `payment` directive.

// Analytics — must match app/layout.tsx. If a new vendor is added, review
// PCI scope first: analytics origins touch script-src / connect-src / img-src,
// and widening any of those is a SAQ-A review trigger.
//
// 2026-04-30: added Cloudflare Web Insights (cloudflareinsights.com).
// Discovered via Phase 1 Playwright homepage spec running against prod —
// Cloudflare auto-injects its RUM beacon when CF proxy is enabled, and
// our CSP was rejecting it on every page load (silent CSP violation in
// every user's browser console). PCI scope unchanged: CF Insights is
// first-party-style telemetry from the same edge that fronts our origin,
// no card-data path, no SAQ-A widening.
const ANALYTICS_ORIGINS_SCRIPT = [
  "https://www.googletagmanager.com",
  "https://www.clarity.ms",
  "https://static.cloudflareinsights.com",
];
const ANALYTICS_ORIGINS_CONNECT = [
  "https://www.google-analytics.com",
  "https://www.clarity.ms",
  "https://c.clarity.ms",
  "https://www.googletagmanager.com",
  "https://cloudflareinsights.com",
  "https://static.cloudflareinsights.com",
];
const ANALYTICS_ORIGINS_IMG = [
  "https://www.google-analytics.com",
  "https://www.googletagmanager.com",
];

const CSP = [
  "default-src 'self'",
  // 'wasm-unsafe-eval' (added 2026-04-27 for PDFium) lets the browser
  // compile + instantiate WebAssembly modules. It is the narrow-scope
  // directive explicitly designed for WASM — it does NOT enable the
  // general `eval()` or `new Function()`, so PCI SAQ-A scope is
  // unaffected. Without it, @hyzyla/pdfium fails on first user click
  // with: "WebAssembly.instantiate(): violates Content Security policy".
  // Required for: PageCountTool and every future PDFium-backed tool.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' ${RAZORPAY_ORIGINS.join(" ")} ${ANALYTICS_ORIGINS_SCRIPT.join(" ")}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${ANALYTICS_ORIGINS_IMG.join(" ")}`,
  "font-src 'self' data:",
  `frame-src 'self' ${RAZORPAY_ORIGINS.join(" ")}`,
  `connect-src 'self' ${RAZORPAY_ORIGINS.join(" ")} ${ANALYTICS_ORIGINS_CONNECT.join(" ")}`,
  "worker-src 'self' blob:",
  // Free PDF tools run WASM client-side — blob: lets pdf-lib instantiate.
  "child-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: CSP,
  },
  {
    // Belt-and-braces with frame-ancestors; legacy browsers fall back here.
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // HSTS — long max-age + preload flag. Only enabled in production; in
    // dev we'd lock ourselves out of http://localhost.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    // Card iframes don't need camera/mic/geo. Deny everything unless a
    // legitimate need arises.
    // 2026-05-01 — paddle.com origins removed (Paddle retired). Razorpay
    // is the only payment processor that needs cross-origin payment access.
    value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://checkout.razorpay.com\")",
  },
  {
    // Legacy but cheap — browsers that still honor this get an extra check.
    key: "X-XSS-Protection",
    value: "0",
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // Bake the deploy commit SHA + build timestamp into the runtime env
  // so `/api/health` and `/admin/deploy` can report them without
  // depending on hPanel env-var wiring. See the execSync block at the
  // top of this file for the SHA source. BUILD_TIMESTAMP is ISO-8601
  // capturing when THIS build ran — unlike Node process.uptime, it
  // survives LSAPI worker recycling so ops can see "code last built"
  // rather than "worker booted".
  env: {
    BUILD_COMMIT_SHA: BUILD_COMMIT_SHA ?? "",
    BUILD_TIMESTAMP: new Date().toISOString(),
    // JSON array of { sha, author, isoDate, subject }. /admin/deploy
    // renders this as a "Recent commits" table so operators can see at
    // a glance what's deployed. Parsing happens in lib/admin/queries.ts
    // because the env-var inlining loses TypeScript types.
    BUILD_RECENT_COMMITS,
  },
  // Hostinger Node.js app — standalone output keeps the deploy small
  // and lets us run `node .next/standalone/server.js` directly.
  output: 'standalone',
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
    // AI SDKs ship Node runtime shims that import optional polyfills for
    // pre-Node-18 (node-fetch, formdata-node, agentkeepalive, …). Next 14
    // tries to bundle those and fails. Mark them external so they're
    // require()d from node_modules at runtime — on Node 18+ the shim's
    // branch that needs them is dead code anyway.
    serverComponentsExternalPackages: ['openai', '@anthropic-ai/sdk', 'pdfjs-dist'],
    // pdfjs-dist's `pdf.mjs` does a *dynamic* import of `./pdf.worker.mjs`
    // when it boots its in-process "fake worker" under Node. That dynamic
    // import is invisible to Next's static tracer, so the worker file
    // never lands in `.next/standalone/node_modules/pdfjs-dist/...`,
    // and at runtime pdfjs throws:
    //   Setting up fake worker failed: "Cannot find module
    //   '.../pdfjs-dist/legacy/build/pdf.worker.mjs'"
    // Force-include the worker for any /api route — only the AI + PDF
    // tool endpoints actually need it, but the glob keeps this file
    // from drifting if we add new routes that touch the extractor.
    outputFileTracingIncludes: {
      '/api/**/*': [
        './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      ],
    },
  },
  async headers() {
    // Applied to every route. If a specific route ever needs a different
    // CSP (e.g. an embed page that must be framed), add an override with
    // a narrower `source` BELOW this entry — Next uses first-match order.
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // 2026-04-30: Apache/LiteSpeed serves /public/*.wasm with
      // text/plain regardless of next.config.mjs `headers()` (which
      // doesn't apply to /public files in this Hostinger setup) or
      // .htaccess `AddType` / `ForceType` / `<FilesMatch>` directives
      // (none of which took effect on the static-handler path). Browsers
      // fail WebAssembly.compileStreaming() with "Incorrect response MIME
      // type" — every PDFium-dependent free tool (page-count, inspector,
      // visual editors, etc.) silently fell back to slower ArrayBuffer
      // instantiation. We've moved the WASM behind a route handler at
      // /api/pdfium-wasm that sets Content-Type explicitly; see
      // app/api/pdfium-wasm/route.ts. The static /pdfium.wasm path is
      // left in place for the file copy (scripts/copy-pdfium-wasm.mjs
      // still drops the bytes into /public) but no client code references
      // it directly. Keeping this header entry as a belt-and-suspenders
      // fallback in case a future Hostinger setting starts honouring
      // it.
      {
        source: "/pdfium.wasm",
        headers: [
          {
            key: "Content-Type",
            value: "application/wasm",
          },
        ],
      },
    ];
  },
  async redirects() {
    // Platform-level redirects. These are handled by Next BEFORE the app
    // router runs, so the browser sees a proper 3xx + Location header even
    // on direct HTTP hits (search engines, external links, bookmarks).
    //
    // We used to implement /signup → /register with a server component that
    // called `redirect("/register")` from next/navigation. Next's static
    // prerender cached that response as a 307 with NO Location header and
    // an `<html id="__next_error__">` body — so in-app RSC nav worked, but
    // `curl -L` and crawlers hit a dead 307. Moving the alias here fixes
    // both paths with one entry.
    //
    // `permanent: false` (307) because /signup is a marketing-friendly
    // alias we may want to reclaim later; 308 would let browsers cache the
    // redirect forever.
    return [
      {
        source: "/signup",
        destination: "/register",
        permanent: false,
      },
      // Task #71 — legacy /tools/<slug> URLs from the prototype that
      // Google still has cached. Surfaced via GSC: 14 pages were
      // returning 5xx because the routes no longer exist. We map each
      // legacy slug to its current SEO landing (or `/tools` for the
      // ones that don't have a 1:1 successor) with permanent: true so
      // Google replaces the cached entry with the new canonical.
      //
      // Why permanent (308 in Next 14): we never want these legacy
      // paths back. The 308 also preserves PageRank from any backlinks
      // that point at the old URLs.
      // 2026-04-30 chain-flatten: these used to point at /<slug>
      // which itself 308s to the canonical /tool/<id>, creating a
      // 2-hop chain. Google de-rates chained redirects (and each hop
      // is an extra round-trip for the user). Pointed directly at
      // the final destination so /tools/<slug> → /tool/<id> in one
      // hop.
      { source: "/tools/merge-pdf", destination: "/tool/merge", permanent: true },
      { source: "/tools/split-pdf", destination: "/tool/split", permanent: true },
      { source: "/tools/compress-pdf", destination: "/tools", permanent: true },
      // 2026-04-30: was /tool/protect (dead — no "protect" tool in
      // lib/tools.ts). The redirect-destinations CI guard caught
      // this. Re-pointed to /tool/unlock (the closest security-
      // category tool we ship). Adding a "protect" tool that
      // password-encrypts a PDF would be a real product addition;
      // until then this is the best destination.
      { source: "/tools/protect-pdf", destination: "/tool/unlock", permanent: true },
      { source: "/tools/unlock-pdf", destination: "/tool/unlock", permanent: true },
      { source: "/tools/organize-pdf", destination: "/tool/sort-pages", permanent: true },
      // 2026-04-30 chain-flatten — same rationale as above
      // (/tools/<slug> → /<slug> → /tool/<id> was 2 hops; now
      // 1 hop direct to the canonical destination).
      { source: "/tools/remove-pages", destination: "/tool/delete-pages", permanent: true },
      { source: "/tools/extract-pages", destination: "/tool/extract-pages", permanent: true },
      { source: "/tools/rotate-pdf", destination: "/tool/rotate", permanent: true },
      { source: "/tools/pdf-to-jpg", destination: "/pdf-to-jpg", permanent: true },
      { source: "/tools/pdf-to-png", destination: "/pdf-to-png", permanent: true },
      // 2026-04-30 chain-flatten — pdf-to-{word,excel,powerpoint}
      // and {png,jpg,word,excel,powerpoint}-to-pdf all 308 to a
      // canonical now (commits 89cd1e8 + cadf27c). Direct map.
      // Note: /pdf-to-jpg + /pdf-to-png are LIVE routes (real
      // app/<slug>/page.tsx files), not redirects, so leave those
      // entries unchanged.
      { source: "/tools/pdf-to-word", destination: "/tool/pdf-to-text", permanent: true },
      { source: "/tools/pdf-to-excel", destination: "/tool/pdf-to-text", permanent: true },
      { source: "/tools/pdf-to-powerpoint", destination: "/tool/pdf-to-text", permanent: true },
      // 2026-05-01: jpg-to-pdf + png-to-pdf are real tools now.
      { source: "/tools/png-to-pdf", destination: "/tool/png-to-pdf", permanent: true },
      { source: "/tools/jpg-to-pdf", destination: "/tool/jpg-to-pdf", permanent: true },
      { source: "/tools/word-to-pdf", destination: "/tools", permanent: true },
      { source: "/tools/excel-to-pdf", destination: "/tools", permanent: true },
      { source: "/tools/powerpoint-to-pdf", destination: "/tools", permanent: true },
      // Catch-all for any other /tools/<slug> not covered above. The
      // /tools/ index is now /tools (no trailing /tools/<slug> paths
      // exist), so anything that lands here is a stale Google cache
      // entry — bounce them to the tools directory rather than 404.
      // CRITICAL: must be `:slug+` (one or more), NOT `:slug*` (zero
      // or more) — the latter matches `/tools` itself, creating an
      // infinite self-redirect loop that 100% breaks the tools index.
      { source: "/tools/:slug+", destination: "/tools", permanent: true },
      // Task #101 — ai-plagiarism rebrand to ai-detector (AI Content
      // Detector). Honest positioning: the tool was always a heuristic
      // AI-text detector, not a real plagiarism scan. Permanent 308s so
      // GSC + any inbound links transfer their authority to the new URLs.
      { source: "/tool/ai-plagiarism", destination: "/tool/ai-detector", permanent: true },
      { source: "/pdf-plagiarism-check", destination: "/ai-content-detector", permanent: true },
      // 2026-05-01 — ai-chat is NOT a /tool/[id] runner (chat is multi-turn;
      // every other catalog entry is single-shot, drop-PDF-and-go). The legacy
      // URL /tool/ai-chat was rendering the generic
      // "COMING SOON · TOOL RUNNER LANDS IN PHASE 5" placeholder. Option B
      // (commit e5a9aa8) promoted Chat to a first-class top-nav slot
      // (components/nav/TopNav.tsx → /chat-with-pdf) and removed it from the
      // /tools catalog (components/marketing/ToolFilter.tsx).
      //
      // Redirect target is the PUBLIC marketing page /chat-with-pdf, NOT the
      // logged-in /app/chat dashboard. Reasoning: the dominant source for
      // /tool/ai-chat URLs in the wild is anonymous SEO traffic — old social
      // shares, AI-assistant snippets that quote our deprecated catalog
      // structure, stale bookmarks. Those visitors need an indexable landing
      // with FAQs + JSON-LD + a "Start chatting" CTA, NOT a NextAuth sign-in
      // wall. Logged-in users still convert: /chat-with-pdf's CTA routes them
      // straight to /app/chat for the actual multi-turn experience.
      { source: "/tool/ai-chat", destination: "/chat-with-pdf", permanent: true },
      // 2026-04-26 — /categories/* deleted. Originally redirected to
      // /tools (preserve link equity), then removed because the pages
      // were live for ~1 hour total: zero external links, zero Google
      // indexation, zero bookmarks. Nothing to preserve. The standard
      // 404 is the correct answer for a URL that never had a real
      // audience. Kept this comment as a reminder: only add a 308 when
      // there's real traffic / link equity to migrate.
      //
      // 2026-04-30 — sitemap-404 fix.
      // A bulk-curl audit (see docs/STATUS.md "30% of sitemap.xml is
      // 404") found that 35 slugs in lib/seo-pages.ts SEO_SLUGS lack
      // an app/<slug>/page.tsx, so sitemap.xml was advertising 35
      // dead URLs to Google. The cleanest fix is a 308 to the
      // closest live equivalent: search engines transfer the
      // accumulated keyword equity to the destination, users land on
      // a useful page instead of a 404, and the soft-404 SEO penalty
      // clears on the next crawl cycle.
      //
      // Mapping rationale:
      //   - "<slug>" → /tool/<id>: when the slug names a specific
      //     tool that exists in lib/tools.ts, redirect there. Most
      //     direct equity transfer.
      //   - "<slug>" → /tools: when the slug names a tool category
      //     that doesn't have a dedicated runner (compress, generic
      //     "to-pdf" / "edit-pdf" surfaces, exotic transforms like
      //     grayscale + booklet that aren't built). The /tools index
      //     is the closest canonical destination — it lists every
      //     tool, so users can self-route.
      //
      // CRITICAL — always 308 (permanent: true), not 307. 308 signals
      // permanent move to crawlers and accumulates the keyword
      // authority on the destination. 307 is for temporary aliases
      // (like /signup → /register) where we want to keep the option
      // to reclaim the URL.
      { source: "/merge-pdf", destination: "/tool/merge", permanent: true },
      { source: "/split-pdf", destination: "/tool/split", permanent: true },
      { source: "/compress-pdf", destination: "/tools", permanent: true },
      { source: "/word-to-pdf", destination: "/tools", permanent: true },
      { source: "/excel-to-pdf", destination: "/tools", permanent: true },
      { source: "/powerpoint-to-pdf", destination: "/tools", permanent: true },
      // 2026-05-01: real tools shipped — redirect to the canonical
      // /tool/<id> instead of /tools index.
      { source: "/jpg-to-pdf", destination: "/tool/jpg-to-pdf", permanent: true },
      { source: "/png-to-pdf", destination: "/tool/png-to-pdf", permanent: true },
      { source: "/extract-pdf-pages", destination: "/tool/extract-pages", permanent: true },
      { source: "/delete-pdf-pages", destination: "/tool/delete-pages", permanent: true },
      { source: "/pdf-page-count", destination: "/tool/page-count", permanent: true },
      { source: "/resize-pdf", destination: "/tool/resize-pdf", permanent: true },
      { source: "/remove-pdf-metadata", destination: "/tool/remove-metadata", permanent: true },
      { source: "/add-logo-to-pdf", destination: "/tool/image-watermark", permanent: true },
      { source: "/add-text-to-pdf", destination: "/tool/add-text-box", permanent: true },
      { source: "/highlight-pdf", destination: "/tool/highlight-pdf", permanent: true },
      { source: "/redact-pdf-free", destination: "/tool/redact-free", permanent: true },
      // 2026-05-02: /extract-pdf-attachments REDIRECT REMOVED — real
      // tool (extract-attachments) shipped today (commit 4bb60f7) and
      // app/extract-pdf-attachments/page.tsx now renders the SEO
      // landing. Redirect was a stopgap when the tool didn't exist.
      // 2026-05-02: /edit-pdf REDIRECT REMOVED — SEO landing repointed
      // today (commit 205697c) at add-text-box with honest copy
      // downgrade and app/edit-pdf/page.tsx now renders the landing.
      { source: "/sign-pdf-free", destination: "/tool/sign-pdf-free", permanent: true },
      { source: "/repair-pdf", destination: "/tool/repair-pdf", permanent: true },
      { source: "/flatten-pdf", destination: "/tool/flatten-pdf", permanent: true },
      // 2026-05-02: /markdown-to-pdf REDIRECT REMOVED — same bug
      // pattern as text-to-pdf below (caught earlier). Was pointing
      // at /tool/pdf-to-markdown which is the OPPOSITE direction
      // (PDF → Markdown extractor, not Markdown → PDF generator).
      // Real Markdown → PDF tool shipped earlier in the
      // 2026-05-01 Tier 1 batch alongside grayscale + booklet, and
      // an SEO landing for /markdown-to-pdf exists in lib/seo-pages.ts
      // pointing at the correct `tool: "markdown-to-pdf"`. Created
      // app/markdown-to-pdf/page.tsx so the landing renders instead
      // of bouncing through the wrong-direction redirect.
      // 2026-05-01: text-to-pdf is its own tool now (was redirected
      // to /tool/pdf-to-text — the OPPOSITE direction. Bad pre-fix.)
      { source: "/text-to-pdf", destination: "/tool/text-to-pdf", permanent: true },
      { source: "/extract-pdf-form-data", destination: "/tool/pdf-forms", permanent: true },
      { source: "/reorder-pdf-pages", destination: "/tool/sort-pages", permanent: true },
      // 2026-05-02: /extract-emails-from-pdf REDIRECT REMOVED — real
      // tool (extract-contacts) shipped today (commit c56705e) and
      // app/extract-emails-from-pdf/page.tsx now renders the SEO
      // landing.
      { source: "/extract-entities-from-pdf", destination: "/tool/ai-entities", permanent: true },
      { source: "/stamp-pdf", destination: "/tool/stamp-pdf", permanent: true },
      { source: "/n-up-pdf", destination: "/tool/n-up-pdf", permanent: true },
      // 2026-05-02: /grayscale-pdf REDIRECT REMOVED — real tool
      // shipped earlier in this commit-arc and app/grayscale-pdf/
      // page.tsx now renders the SEO landing.
      { source: "/strip-links", destination: "/tool/strip-links", permanent: true },
      // 2026-05-02: /booklet-pdf REDIRECT REMOVED — real tool shipped
      // earlier in this commit-arc and app/booklet-pdf/page.tsx now
      // renders the SEO landing.
      { source: "/free-draw-pdf", destination: "/tool/free-draw-pdf", permanent: true },
      { source: "/add-links", destination: "/tool/add-links", permanent: true },
      //
      // 2026-04-30 second-pass — close out the 5 "broken-render"
      // landings (originally surfaced by the SEO smoke spec). These
      // five DO have app/<slug>/page.tsx files but their `tool:`
      // field in lib/seo-pages.ts references a tool ID that doesn't
      // exist in lib/tools.ts. SeoLandingPage's `if (!tool) return
      // null;` falls back to the layout's notFound boundary, so the
      // pages return 200 OK with a "this page hasn't been ported
      // yet" body — bad UX, bad SEO.
      //
      // next.config.mjs redirects() runs BEFORE the file-system
      // route matcher, so adding a 308 here intercepts the request
      // before the broken-render path can fire. The dead app/<slug>/
      // page.tsx files become dead code — could be deleted later
      // but the redirect alone fixes the user-visible problem.
      //
      // Destination rationale:
      //   - pdf-to-word/excel/powerpoint: no PDF-to-Office
      //     extraction tool exists; route to /tool/pdf-to-text
      //     (closest extraction tool, preserves the "get content out
      //     of a PDF" intent).
      //   - pdf-to-ics-calendar: no extract-dates tool exists; route
      //     to /tool/pdf-search (text-finding is the closest live
      //     analog).
      //   - court-judgment-summarizer: no ai-court-order tool;
      //     route to /tool/ai-summarize (general PDF summarization
      //     covers the legal-doc summary use case).
      { source: "/pdf-to-word", destination: "/tool/pdf-to-text", permanent: true },
      { source: "/pdf-to-excel", destination: "/tool/pdf-to-text", permanent: true },
      { source: "/pdf-to-powerpoint", destination: "/tool/pdf-to-text", permanent: true },
      // 2026-05-02: /pdf-to-ics-calendar REDIRECT REMOVED — real tool
      // (extract-dates) shipped today (commit c586d63) and the
      // existing app/pdf-to-ics-calendar/page.tsx now renders the
      // SEO landing instead of being intercepted.
      // 2026-05-02: /court-judgment-summarizer REDIRECT REMOVED —
      // real tool (ai-court-order) shipped today (commit 84cb9a9)
      // and the existing app/court-judgment-summarizer/page.tsx now
      // renders the SEO landing.
    ];
  },
};

export default nextConfig;
