# pdfcraftai.com — Feature Tracker

_Structured matrix of every feature area in the product: what's Done, what's Partial, what's Pending._
_Pair this with `STATUS.md` (operational punch list) — this file answers "does the site have X?", STATUS answers "who owns the next step on X?"._

**Last updated:** 2026-04-20 (post-page-numbers-watermark-runner session)

---

## Legend

- **Done** — feature is live in production, visually polished, and wired to a real backend (or a privacy-preserving stub that won't embarrass us).
- **Partial** — UI ships, but the backing behavior is stubbed / mocked / disabled behind a flag.
- **Pending** — not built at all, or only a stub route exists.

---

## Marketing surface

| Area | Route | Status | Notes |
|---|---|---|---|
| Homepage | `/` | Done | Session-aware FinalCTA via `SmartCta`. |
| Pricing | `/pricing` | Done | Hero CTA session-aware; monthly Plus card; credit packs grid; BYOK card; per-op table; FAQ. |
| Tools index | `/tools` | Done | Filtered by category; free / AI tags. |
| Agent landing | `/agent` | Done | Uses `MarketingHero`. |
| Workflow Studio | `/macros` | Done | Uses `MarketingHero`. |
| Batch | `/bulk` | Done | Uses `MarketingHero`. |
| About | `/about` | Done | 3 values; `Zap` icon (was `Bolt`, fixed). |
| Contact | `/contact` | Done | Client form posts to `/api/contact`; mailto cards. |
| Changelog | `/changelog` | Done | NEW / IMPROVED / FIXED / SECURITY tags. |
| Status | `/status` | Done | 6 services + resolved incident log. |
| Careers | `/careers` | Done | Empty-state with careers@ mailto. |
| GDPR | `/gdpr` | Done | Rights, categories, sub-processors, DPO. |
| Privacy | `/privacy` | Done | Needs audit for any stale `support@` references (see STATUS.md). |
| Terms | `/terms` | Done | Same audit pending. |
| Help center | `/help` | Partial | Index exists; article depth is thin. |
| API docs landing | `/api` | Partial | Landing page exists but reference tables are placeholder. |

## Auth surface

| Area | Route | Status | Notes |
|---|---|---|---|
| Login | `/login` | Done | `AuthShell` + `AuthBits`. Google SSO. Middleware redirects logged-in users away. |
| Register | `/register` | Done | Same shell. |
| Alt signup slug | `/signup` | Done | Same. |
| Forgot password form | `/forgot-password` | Done | POSTs to `/api/auth/forgot-password`; always-200 anti-enumeration. |
| Reset-link redemption | `/reset-password/[token]` | Pending | No reset flow yet — needs mail provider. |
| Magic-link sign-in | — | Pending | Same blocker. |
| TopNav session awareness | n/a | Done | Avatar + user menu + mobile hamburger. Click-outside + Escape close. |
| Middleware guard | `middleware.ts` via `auth.config.ts` | Done | Redirects authed users off `/login`, `/register`, `/signup`, `/forgot-password`. |
| Sign-in click-test end-to-end | n/a | Pending | Needs a human to complete the Google account round-trip. |

## API endpoints

| Endpoint | Status | Notes |
|---|---|---|
| `POST /api/auth/forgot-password` | Done (stub) | Zod-validated, per-email 60s rate limit, identical ack on success/miss, logs for later wiring. |
| `POST /api/contact` | Done (stub) | Zod, in-memory rate limit, logs — swaps to SendGrid/Postmark later. |
| `GET /api/auth/providers` | Done | Exposes Google with apex callback URL. |
| Google SSO callback | Done | `trustHost: true` fixes Cloudflare → Next.js host trust. |
| `GET /api/health` | Pending | See STATUS.md pending list. |
| Transactional mail send | Pending | Blocks password resets + receipts. |

## Product / app surface

| Area | Route | Status | Notes |
|---|---|---|---|
| App dashboard | `/app/dashboard` | Partial | Layout ships; data plumbing depends on logged-in DB reads. |
| Account | `/account` | Partial | BYOK configure UI stub; needs wiring. |
| Free tool: Merge | `/tool/merge` | Done | Client-side pdf-lib runner. |
| Free tool: Split | `/tool/split` | Done | Client-side; per-page ZIP. |
| Free tool: Compress | `/tool/compress` | Done | Client-side pdf-lib pass. |
| Free tool: Rotate | `/tool/rotate` | Done | 90/180/270° per-page. |
| Free tool: Page Numbers + Watermark | `/tool/page-numbers` | Done | Two modes in one runner: numbered overlay (4 formats × 6 positions) + diagonal watermark (adjustable opacity/size). Client-side pdf-lib + StandardFonts. Shipped 2026-04-20. |
| Free tool: Protect / Unlock | `/tool/protect` | Pending | Needs client-side crypto wiring. |
| Free tool: PDF↔Office | `/tool/pdf-to-office`, `/tool/to-pdf` | Pending | Needs LibreOffice conversion worker. |
| Free tools (other WASM) | `/tool/...` | Partial | Reorder / delete / extract / crop routes exist; runners not yet shipped. |
| AI tools | `/tools/chat`, `/summarize`, `/translate`, `/ocr`, `/redact` | Partial | UI present; model routing + credit debit logic needs E2E test. |

## Analytics / monitoring

| Item | Status | Notes |
|---|---|---|
| GA4 (`G-2Y8PS0S93F`) | Done | Verified rendering in layout. |
| Microsoft Clarity (`wcsbv536zv`) | Done | Verified rendering in layout. |
| Uptime / status page data source | Partial | `/status` renders static `SERVICES` array; no real probe yet. |
| `/api/health` | Pending | Needed before Cloudflare health check can bind. |
| Error tracking (Sentry or similar) | Pending | Not wired. |

## SEO / search

| Item | Status | Notes |
|---|---|---|
| `robots.txt` | Done | Points at sitemap. |
| `sitemap.xml` | Done | 39 URLs. |
| GSC submission | Done | Resubmitted 2026-04-20. |
| Bing Webmaster | Done | Resubmitted; awaiting re-crawl. |
| OpenGraph / Twitter cards | Partial | Metadata shipped on most pages; validator pass pending (STATUS.md). |

## Security / housekeeping

| Item | Status | Notes |
|---|---|---|
| Over-scoped PAT deleted | Done | Old `cowork-pdfcraftai-deploy`. |
| Active PAT | Done | `cowork-pdfcraftai-deploy-v2`, minimal scopes, expires 2026-07-18. |
| Hostinger SSH key | Done | `cowork-apr2026-v2`. |
| `.gitignore` covers `.claude/` | Done | Plus `secrets.env`, keys, certs. |
| CLAUDE.md / STATUS.md / DEPLOYMENT_NOTES.md in repo | Done | Survive sandbox wipes. |
| Auth rate limits (WAF level) | Pending | Part of Cloudflare audit in STATUS.md. |
| DMARC / DKIM / SPF | Pending | Blocks on email host choice (STATUS.md). |

## Typecheck / build health

| Check | Status | Evidence |
|---|---|---|
| `tsc --noEmit` | Clean | 0 errors (2026-04-20, after `Bolt` → `Zap` fix). |
| Lighthouse pass | Pending | STATUS.md item. |
| OG / Twitter validators | Pending | STATUS.md item. |

---

## How to update this file

1. When you ship a feature, flip its row from Partial/Pending → Done and add a 1-line note (commit SHA, date, or verification evidence).
2. When you discover a new gap, add a row in the right section with Pending status so it doesn't get lost.
3. Keep the wording stable — this file is a source of truth for future audits; don't reword rows without reason.
