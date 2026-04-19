# pdfcraftai.com — Live Status & Punch List

_Single source of truth for what's done, what's pending, and who owns each item._
_Future Claude sessions: read this AFTER `CLAUDE.md` and BEFORE starting new work._

**Last updated:** 2026-04-20 (post-theme-toggle + test-plan session)

---

## How to use this file

- Anything in **Done** is verified live — don't redo it.
- Anything in **Pending (Claude can do)** is fully automatable from a Cowork session — pick it up.
- Anything in **Pending (needs the user)** requires a human action (DNS console, mailbox check, paid signup, etc.) — don't guess credentials, just remind the user.
- When you finish an item, move it to Done with the date and the verification command/screenshot.

---

## Done

### Infra

- [x] **Cloudflare proxy in front of Hostinger** — verified via `cf-ray` + `server: cloudflare` on every response. (2026-04-19)
- [x] **Apex + www both serve the app** — both resolve, www redirects to apex. (2026-04-19)
- [x] **`robots.txt` advertises sitemap** — `Sitemap: https://pdfcraftai.com/sitemap.xml`. (2026-04-19)
- [x] **`sitemap.xml` returns 200, application/xml, 39 URLs.** (2026-04-19)

### Auth

- [x] **NextAuth v5 wired to Google.** Env vars `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET` all set in Hostinger. (2026-04-19)
- [x] **`trustHost: true` on the NextAuth config** — fixes Cloudflare-proxy → Next.js host trust issue. Commit `ffdfde5`. (2026-04-19)
- [x] **Google OAuth consent screen verified.** All three brand URLs (Home, Privacy, Terms), 120×120 logo, support email, authorised domain `pdfcraftai.com`. Filled via Chrome MCP. (2026-04-19)
- [x] **`/api/auth/providers` exposes Google with the correct apex callback URL.** (2026-04-20)

### Analytics

- [x] **GA4 (`G-2Y8PS0S93F`) tag added to `app/layout.tsx`, committed in `36034eb`, deployed, verified rendering.** (2026-04-20)
- [x] **Microsoft Clarity (`wcsbv536zv`) tag added to `app/layout.tsx`, committed in `36034eb`, deployed, verified rendering.** (2026-04-20)

### Auth UX (sitewide)

- [x] **TopNav rewrite: session-aware actions, avatar image (Google profile photo via `next/image` `unoptimized`), click-outside + Escape close, mobile hamburger menu.** (2026-04-20)
- [x] **Middleware (`auth.config.ts`) redirects logged-in users away from `/login`, `/register`, `/signup`, `/forgot-password`.** (2026-04-20)
- [x] **`MarketingChrome` hides marketing TopNav/Footer on all auth pages exactly.** (2026-04-20)
- [x] **Shared `AuthShell` + `AuthBits` design tokens across Login / Register / Signup / Forgot Password.** (2026-04-20)
- [x] **Session-aware CTAs (`SmartCta`) on the homepage final CTA and the pricing hero.** (2026-04-20)

### Marketing routes (filled 404s from footer + nav)

- [x] `/agent` — Agent mode landing. (2026-04-20)
- [x] `/macros` — Workflow Studio landing. (2026-04-20)
- [x] `/bulk` — Batch-processing landing. (2026-04-20)
- [x] `/about` — Mission + values. (2026-04-20)
- [x] `/contact` — Client form + mailto cards, posts to `/api/contact`. (2026-04-20)
- [x] `/changelog` — Release notes, tagged. (2026-04-20)
- [x] `/status` — Service health board with incident log. (2026-04-20)
- [x] `/careers` — Values + open-roles empty state w/ intro mailto. (2026-04-20)
- [x] `/gdpr` — Rights, data categories, sub-processors, DPO contact. (2026-04-20)

### Theme + testing infrastructure

- [x] **Light/dark theme toggle** shipped in TopNav via new `ThemeToggle` component. Uses the existing pre-hydration script in `app/layout.tsx` + `[data-theme]` CSS variables in `globals.css`. Stored in `pdfcraft_state.theme`. (2026-04-20)
- [x] **`docs/TEST_PLAN.md` created** — P0–P6 batches (auth, free tools, AI tools, authed app, marketing/SEO, error/edge cases, a11y/perf). (2026-04-20)
- [x] **`docs/FEATURE_TRACKER.md` created** — Done / Partial / Pending matrix across marketing, auth, API, product, analytics, SEO, security. (2026-04-20)

### Stubs for follow-up email wiring

- [x] **`/api/contact` route** — Zod-validated, in-memory rate-limited, logs submissions until SendGrid/Postmark lands. (2026-04-20)
- [x] **`/api/auth/forgot-password` route** — acks identically on success/miss (anti-enumeration), per-email rate limited, logs for reset-link wiring. `ForgotPasswordForm` now POSTs here instead of the local `setTimeout` mock. (2026-04-20)

### Search engines

- [x] **GSC: sitemap resubmitted.** Property `https://pdfcraftai.com/`. Discovered pages refreshed 59 → 39. (2026-04-20)
- [x] **Bing Webmaster Tools: sitemap resubmitted.** Status moved Success → Processing, last-submit 2026-04-19. URL count will refresh from stale 21 → 39 after re-crawl. (2026-04-20)

### Security / housekeeping

- [x] **Old over-scoped GitHub PAT (`cowork-pdfcraftai-deploy`) deleted.** Had `admin:enterprise, admin:org, delete_repo` etc., expired 2026-05-19. (2026-04-20)
- [x] **Active PAT is `cowork-pdfcraftai-deploy-v2`** — minimal scopes (`repo, workflow, read:network_configurations`), expires 2026-07-18. Stored in `.claude/secrets.env`. (2026-04-20)
- [x] **Hostinger SSH key `cowork-apr2026-v2` active.** Private half at `.claude/id_ed25519_cowork`. (2026-04-19)
- [x] **`.gitignore` covers `.claude/`, `secrets.env`, `id_ed25519*`, `*.key`, `*.pem`, `*.pub`.** Synced from local mount into the repo. (2026-04-20)
- [x] **`CLAUDE.md` + `docs/DEPLOYMENT_NOTES.md` + `docs/STATUS.md` versioned in the repo.** Survives sandbox wipes and fresh clones. (2026-04-20)

---

## Pending (Claude can do — pick these up first)

- [ ] **(legal/email) Audit `app/(legal)/privacy/page.tsx` and `terms/page.tsx`** for any `support@pdfcraftai.com` references. Flag any that need updating once that mailbox goes live.
- [ ] **(quality) Run a Lighthouse / accessibility pass** on home + a few tool pages, surface top-3 fixes.
- [ ] **(SEO) Verify `metadata.openGraph` and `twitter` cards on key pages** — open `https://pdfcraftai.com` in Twitter/Facebook share validators.
- [ ] **(monitoring) Add a `/api/health` endpoint** returning DB ping + commit SHA, then point Cloudflare's health check at it.

---

## Pending (needs the user — Claude cannot complete autonomously)

### Email authentication (only after the user picks an email host)

- [ ] **DMARC TXT record at `_dmarc.pdfcraftai.com`** in Cloudflare DNS. Suggested start: `v=DMARC1; p=none; rua=mailto:dmarc-reports@pdfcraftai.com; pct=100; aspf=r; adkim=r`. Move to `p=quarantine` then `p=reject` after a few weeks of clean reports.
- [ ] **Custom DKIM key in Hostinger Email** (or whatever email provider gets chosen). Hostinger generates the key; user pastes the resulting CNAME/TXT into Cloudflare DNS.
- [ ] **SPF TXT record at apex** (`v=spf1 include:_spf.hostinger.com -all` or include the chosen sender's SPF host).
- [ ] **`support@pdfcraftai.com` mailbox.** Confirm it sends + receives end-to-end before swapping it into the Google OAuth contact email.
- [ ] **Transactional sender wired** (Resend / Postmark / Hostinger SMTP) for password resets, magic links, receipts, etc. Needs an account + API key the user creates.

### Manual smoke tests

- [ ] **Google sign-in click-test.** Open `/login` in your browser, click "Continue with Google", complete the round-trip, confirm redirect back to the app and a session cookie is set. Claude can drive `/login` via Chrome MCP but cannot complete the Google account login itself.

### Cloudflare audit (10-item review, when convenient)

- [ ] SSL/TLS mode = Full (strict) confirmed
- [ ] HSTS on (already present in response headers)
- [ ] Always Use HTTPS on
- [ ] Auto Minify on for HTML/CSS/JS
- [ ] Brotli on
- [ ] Bot Fight Mode review (avoid breaking legit API calls)
- [ ] WAF rules: rate-limit `/api/auth/*` to ~10 req/min/IP
- [ ] Page Rules: confirm www → apex 301
- [ ] Email routing for `support@`, `dmarc-reports@` if mail isn't on Hostinger
- [ ] Analytics → confirm Web Analytics is on (free, separate from GA4)

---

## Credential reference

All actual credential values live ONLY in `.claude/secrets.env` (gitignored). If that file is missing in a fresh sandbox, see `CLAUDE.md` §4 for the handoff pattern — Claude will ask you to paste them.

| Credential | Stored in | Notes |
|---|---|---|
| GitHub PAT (`cowork-pdfcraftai-deploy-v2`) | `.claude/secrets.env` as `GITHUB_PAT` | Expires 2026-07-18 |
| Hostinger SSH private key | `.claude/id_ed25519_cowork` | Public half registered as `cowork-apr2026-v2` |
| Hostinger env vars | hPanel only | Never copied to sandbox |
| Google OAuth client secret | Hostinger env vars only | Never copied to sandbox |
