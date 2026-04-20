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

// --- PCI DSS SAQ-A scope lockdown -----------------------------------------
//
// Our SAQ-A eligibility rests on card data NEVER touching our origin.
// Users type card details into hosted iframes (Razorpay Checkout modal,
// PayPal Smart Buttons / Advanced Checkout). The CSP below enforces that
// architecture at the browser layer:
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
//   - 'unsafe-eval' is omitted. Razorpay and PayPal SDKs don't need it.
//   - report-uri is not set yet — add a Sentry CSP endpoint when infra
//     has one.

const RAZORPAY_ORIGINS = [
  "https://checkout.razorpay.com",
  "https://api.razorpay.com",
  "https://lumberjack.razorpay.com",
];

const PAYPAL_ORIGINS = [
  "https://www.paypal.com",
  "https://www.paypalobjects.com",
  "https://c.paypal.com",
  // Sandbox — harmless in prod, required in staging.
  "https://www.sandbox.paypal.com",
  "https://api-m.sandbox.paypal.com",
  "https://api-m.paypal.com",
];

// Analytics — must match app/layout.tsx. If a new vendor is added, review
// PCI scope first: analytics origins touch script-src / connect-src / img-src,
// and widening any of those is a SAQ-A review trigger.
const ANALYTICS_ORIGINS_SCRIPT = [
  "https://www.googletagmanager.com",
  "https://www.clarity.ms",
];
const ANALYTICS_ORIGINS_CONNECT = [
  "https://www.google-analytics.com",
  "https://www.clarity.ms",
  "https://c.clarity.ms",
  "https://www.googletagmanager.com",
];
const ANALYTICS_ORIGINS_IMG = [
  "https://www.google-analytics.com",
  "https://www.googletagmanager.com",
];

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${RAZORPAY_ORIGINS.join(" ")} ${PAYPAL_ORIGINS.join(" ")} ${ANALYTICS_ORIGINS_SCRIPT.join(" ")}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://www.paypalobjects.com ${ANALYTICS_ORIGINS_IMG.join(" ")}`,
  "font-src 'self' data:",
  `frame-src 'self' ${RAZORPAY_ORIGINS.join(" ")} ${PAYPAL_ORIGINS.join(" ")}`,
  `connect-src 'self' ${RAZORPAY_ORIGINS.join(" ")} ${PAYPAL_ORIGINS.join(" ")} ${ANALYTICS_ORIGINS_CONNECT.join(" ")}`,
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
    value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://checkout.razorpay.com\" \"https://www.paypal.com\")",
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
  // Bake the deploy commit SHA into the runtime env so `/api/health` can
  // report it without depending on hPanel env-var wiring. See the
  // execSync block at the top of this file.
  env: {
    BUILD_COMMIT_SHA: BUILD_COMMIT_SHA ?? "",
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
    ];
  },
};

export default nextConfig;
