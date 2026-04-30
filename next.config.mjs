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
// Users type card details into hosted iframes (Razorpay Checkout modal,
// Paddle.js overlay checkout). The CSP below enforces that architecture
// at the browser layer:
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
//   - 'unsafe-eval' is omitted. Razorpay and Paddle SDKs don't need it.
//   - report-uri is not set yet — add a Sentry CSP endpoint when infra
//     has one.

const RAZORPAY_ORIGINS = [
  "https://checkout.razorpay.com",
  "https://api.razorpay.com",
  "https://lumberjack.razorpay.com",
];

// Paddle.js is loaded from a single CDN origin; the overlay checkout
// iframes off buy.paddle.com (production) and sandbox-buy.paddle.com
// (sandbox). The /adjustments + /transactions API calls go server-side
// from Next's Node runtime, so they don't need connect-src entries —
// only the browser-facing origins do. Sandbox origins are harmless in
// prod and required during pre-launch validation against our sandbox
// seller account (Seller ID 320957).
const PADDLE_ORIGINS = [
  "https://cdn.paddle.com",
  "https://buy.paddle.com",
  "https://checkout.paddle.com",
  "https://sandbox-buy.paddle.com",
  "https://sandbox-checkout.paddle.com",
];

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
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' ${RAZORPAY_ORIGINS.join(" ")} ${PADDLE_ORIGINS.join(" ")} ${ANALYTICS_ORIGINS_SCRIPT.join(" ")}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${ANALYTICS_ORIGINS_IMG.join(" ")}`,
  "font-src 'self' data:",
  `frame-src 'self' ${RAZORPAY_ORIGINS.join(" ")} ${PADDLE_ORIGINS.join(" ")}`,
  `connect-src 'self' ${RAZORPAY_ORIGINS.join(" ")} ${PADDLE_ORIGINS.join(" ")} ${ANALYTICS_ORIGINS_CONNECT.join(" ")}`,
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
    value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://checkout.razorpay.com\" \"https://buy.paddle.com\" \"https://checkout.paddle.com\")",
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
      { source: "/tools/merge-pdf", destination: "/merge-pdf", permanent: true },
      { source: "/tools/split-pdf", destination: "/split-pdf", permanent: true },
      { source: "/tools/compress-pdf", destination: "/compress-pdf", permanent: true },
      { source: "/tools/protect-pdf", destination: "/tool/protect", permanent: true },
      { source: "/tools/unlock-pdf", destination: "/tool/protect", permanent: true },
      { source: "/tools/organize-pdf", destination: "/tool/sort-pages", permanent: true },
      { source: "/tools/remove-pages", destination: "/delete-pdf-pages", permanent: true },
      { source: "/tools/extract-pages", destination: "/extract-pdf-pages", permanent: true },
      { source: "/tools/rotate-pdf", destination: "/tool/rotate", permanent: true },
      { source: "/tools/pdf-to-jpg", destination: "/pdf-to-jpg", permanent: true },
      { source: "/tools/pdf-to-png", destination: "/pdf-to-png", permanent: true },
      { source: "/tools/pdf-to-word", destination: "/pdf-to-word", permanent: true },
      { source: "/tools/pdf-to-excel", destination: "/pdf-to-excel", permanent: true },
      { source: "/tools/pdf-to-powerpoint", destination: "/pdf-to-powerpoint", permanent: true },
      { source: "/tools/png-to-pdf", destination: "/png-to-pdf", permanent: true },
      { source: "/tools/jpg-to-pdf", destination: "/jpg-to-pdf", permanent: true },
      { source: "/tools/word-to-pdf", destination: "/word-to-pdf", permanent: true },
      { source: "/tools/excel-to-pdf", destination: "/excel-to-pdf", permanent: true },
      { source: "/tools/powerpoint-to-pdf", destination: "/powerpoint-to-pdf", permanent: true },
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
      // 2026-04-26 — /categories/* deleted. Originally redirected to
      // /tools (preserve link equity), then removed because the pages
      // were live for ~1 hour total: zero external links, zero Google
      // indexation, zero bookmarks. Nothing to preserve. The standard
      // 404 is the correct answer for a URL that never had a real
      // audience. Kept this comment as a reminder: only add a 308 when
      // there's real traffic / link equity to migrate.
    ];
  },
};

export default nextConfig;
