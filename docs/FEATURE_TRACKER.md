# pdfcraftai.com — Feature Tracker

_Structured matrix of every feature area in the product: what's Done, what's Partial, what's Pending._
_Pair this with `STATUS.md` (operational punch list) — this file answers "does the site have X?", STATUS answers "who owns the next step on X?"._

**Last updated:** 2026-04-20 (post `/tool/pdf-to-office` runner ship)

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
| Help center | `/help` | Done | 24 articles across 6 topics, each routed at `/help/[slug]` with full body, breadcrumb, related-articles list, cross-topic browse, OG/Twitter cards. Sitemap fans out to all 24 URLs. Shipped 2026-04-20. |
| API docs landing | `/api` | Done | Full reference: on-page nav, quickstart, auth guide (pk_live/pk_test/sk), eight endpoints with per-endpoint request/response cards + notes, rate-limit tier table + response headers, error-code table (10 codes), HMAC webhook receiver + event types, idempotency. Shipped 2026-04-20. |

## Auth surface

| Area | Route | Status | Notes |
|---|---|---|---|
| Login | `/login` | Done | `AuthShell` + `AuthBits`. Google SSO. Middleware redirects logged-in users away. |
| Register | `/register` | Done | Same shell. |
| Alt signup slug | `/signup` | Done | Same. |
| Forgot password form | `/forgot-password` | Done | POSTs to `/api/auth/forgot-password`; always-200 anti-enumeration. |
| Reset-link redemption | `/reset-password/[token]` | Done (mail blocked) | Full flow shipped 2026-04-20: dynamic page validates the 64-hex token server-side, `ResetPasswordForm` posts to `/api/auth/reset-password`, success → `/login?reset=1` flash. Schema (`password_reset_tokens`), migration, `lib/password-reset.ts` mint/lookup/consume helpers, race-safe single-use UPDATE, sibling-token invalidation, 30-min TTL, hash-at-rest (sha256), per-IP 5/min rate limit, middleware redirect for already-signed-in users. Reset URLs currently log to the Hostinger Node process; one drop-in away from a real provider. |
| Magic-link sign-in | — | Pending | Blocked on email provider choice. |
| TopNav session awareness | n/a | Done | Avatar + user menu + mobile hamburger. Click-outside + Escape close. |
| Middleware guard | `middleware.ts` via `auth.config.ts` | Done | Redirects authed users off `/login`, `/register`, `/signup`, `/forgot-password`. |
| Sign-in click-test end-to-end | n/a | Pending | Needs a human to complete the Google account round-trip. |

## API endpoints

| Endpoint | Status | Notes |
|---|---|---|
| `POST /api/auth/forgot-password` | Done | Zod-validated, per-email 60s rate limit, identical ack on success/miss, **now mints real `password_reset_tokens` rows and logs the reset URL** until a mail provider lands. |
| `POST /api/auth/reset-password` | Done | New 2026-04-20. Zod 64-hex token + 8–128 char password; per-IP 5/min bucket; race-safe single-use consume via `lib/password-reset.ts`; 409 (enum-safe) on expired/consumed/missing; 429 on rate limit. **Hotfix 2026-04-20**: was 500-on-every-call in prod because Hostinger never ran the migration; `lib/password-reset.ts` now self-heals via a one-time-per-process `CREATE TABLE IF NOT EXISTS` bootstrap; route also classifies `ER_NO_SUCH_TABLE` as 409 for defence-in-depth. |
| `POST /api/contact` | Done (stub) | Zod, in-memory rate limit, logs — swaps to SendGrid/Postmark later. |
| `GET /api/auth/providers` | Done | Exposes Google with apex callback URL. |
| Google SSO callback | Done | `trustHost: true` fixes Cloudflare → Next.js host trust. |
| `GET /api/health` | Done | Returns `ok/service/commit/uptime/db` JSON; 200 on healthy, 503 on DB failure; `no-store`. Shipped 2026-04-20. |
| Transactional mail send | Pending | Blocks password resets + receipts. |

## Product / app surface

| Area | Route | Status | Notes |
|---|---|---|---|
| App dashboard | `/app/dashboard` | Partial | Layout ships; data plumbing depends on logged-in DB reads. |
| Account | `/account` | Done | Redirects to `/app/settings` (real settings surface with profile / password / delete). Kept as a 302 alias so external BYOK / marketing links don't 404. Shipped 2026-04-20. |
| App settings | `/app/settings` | Done | Profile, password, delete. Auth-gated (redirects to `/login` if unauthed). |
| Free tool: Merge | `/tool/merge` | Done | Client-side pdf-lib runner. |
| Free tool: Split | `/tool/split` | Done | Client-side; per-page ZIP. |
| Free tool: Compress | `/tool/compress` | Done | Client-side pdf-lib pass. |
| Free tool: Rotate & Reorder | `/tool/rotate` | Done | True three-op runner: per-page rotate (with bulk row), reorder via up/down arrows (with reverse-all bulk), per-page delete. Tracks edits as a delta from source so "Undo all edits" rebuilds cleanly. Output filename suffixed `-rotated` / `-reordered` / `-edited` based on what changed. (2026-04-20 second pass) |
| Free tool: Page Numbers + Watermark | `/tool/page-numbers` | Done | Two modes in one runner: numbered overlay (4 formats × 6 positions) + diagonal watermark (adjustable opacity/size). Client-side pdf-lib + StandardFonts. Shipped 2026-04-20. |
| Free tool: Image → PDF | `/tool/to-pdf` | Done | JPG + PNG (≤20 MB each), 3 layout modes (fit/Letter/A4), adjustable margin, multi-file reorder. Shipped 2026-04-20. |
| Free tool: Protect / Unlock | `/tool/protect` | Done | Two modes in one runner: **Protect** (set user password + optional owner password + per-permission grid: print/copy/edit/annotate) and **Unlock** (provide current password, strip encryption). Auto-detects whether the dropped file is already encrypted and nudges mode. Built on `@cantoo/pdf-lib` (maintained pdf-lib fork that adds RC4/AES PDF encryption); dynamic-imported only on this runner so the rest of the tool bundles aren't impacted. Fully client-side — passwords never leave the browser. Shipped 2026-04-20. |
| Free tool: PDF → Office | `/tool/pdf-to-office` | Done (v1) | v1 scope: **PDF → Word (.docx)** and **PDF → plain text (.txt)**. Server-side (`/api/tools/pdf-to-office`, Node runtime) because pdfjs's worker + docx lib would be ugly to bundle client-side under our CSP. Reuses `lib/ai/pdf-extract.ts` for text extraction (same extractor powering ai-summarize / ai-chat). Free (no auth, no credit spend), 25 MB max, per-IP 10 conversions/min, bytes held in-memory only. Scanned PDFs → 422 with nudge to AI OCR. Excel (.xlsx) and PowerPoint (.pptx) intentionally deferred to v2 until we have a real layout-extraction pass — surfaced in-UI with a link to `/tool/ai-ocr` for tabular needs today. Shipped 2026-04-20 in response to a user-reported "not working" defect: the URL was 200 but the page was rendering the COMING SOON shell. Smoke harness (`scripts/smoke-live.mjs`) now asserts no `/tool/*` page contains the placeholder marker, so this defect class auto-fails next time. |
| Free tool: Word → PDF | `/tool/to-pdf` (Word-branch) | Pending | Image branch shipped; Word needs server-side pipeline. |
| Free tools (other WASM) | `/tool/...` | Partial | Reorder + delete now folded into `/tool/rotate` (see Rotate & Reorder above). Extract / crop / single-page deletion as a standalone tool still pending. |
| AI tools | `/tool/ai-chat`, `/tool/ai-summarize`, `/tool/ai-translate`, `/tool/ai-ocr`, `/tool/ai-redact`, `/tool/ai-compare` | Partial | All six runner pages serve 200 in prod (verified via `scripts/smoke-live.mjs`). UI present; model routing + credit debit logic still needs an end-to-end test with a funded account. |

## Analytics / monitoring

| Item | Status | Notes |
|---|---|---|
| GA4 (`G-2Y8PS0S93F`) | Done | Verified rendering in layout. |
| Microsoft Clarity (`wcsbv536zv`) | Done | Verified rendering in layout. |
| Uptime / status page data source | Partial | `/status` renders static `SERVICES` array; no real probe yet. |
| `/api/health` | Done | Live; Cloudflare health check just needs binding in the CF dashboard. |
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
| `tsc --noEmit` | Clean | 0 errors (2026-04-20, post reset-password bootstrap + /account alias). |
| PDF tools smoke harness | Green | `node scripts/test-pdf-tools.mjs` → 17/17 across merge, split, rotate, compress, page-numbers, to-pdf, protect+unlock (2026-04-20). PDF→Office isn't covered here because the conversion path is server-side (`/api/tools/pdf-to-office`) — it's covered instead by the live smoke harness, which now also asserts `/tool/pdf-to-office` renders the real runner (not the COMING SOON shell). |
| Live production smoke | 24/26 → tightened 2026-04-20 | `node scripts/smoke-live.mjs` — added per-path "no COMING SOON shell" check on every live tool runner. Any future defect where a URL returns 200 but the runner is disabled will now fail smoke instead of passing silently. |
| Lighthouse pass | Pending | STATUS.md item. |
| OG / Twitter validators | Pending | STATUS.md item. |

---

## How to update this file

1. When you ship a feature, flip its row from Partial/Pending → Done and add a 1-line note (commit SHA, date, or verification evidence).
2. When you discover a new gap, add a row in the right section with Pending status so it doesn't get lost.
3. Keep the wording stable — this file is a source of truth for future audits; don't reword rows without reason.
