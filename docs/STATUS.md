# pdfcraftai.com — Live Status & Punch List

_Single source of truth for what's done, what's pending, and who owns each item._
_Future Claude sessions: read this AFTER `CLAUDE.md` and BEFORE starting new work._

**Last updated:** 2026-04-20 (post Help Center depth + a11y-contrast-and-headings pass)

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

### Free tools (client-side WASM)

- [x] **`/tool/page-numbers` runner live.** New `PageNumbersTool` component ships two modes in one runner: (a) **Page numbers** — 4 formats (`1`, `1 / N`, `Page 1`, `Page 1 of N`) × 6 positions (TL/TC/TR/BL/BC/BR), adjustable font size 8–24pt; (b) **Watermark** — user-entered text (≤40 chars) drawn diagonally at 45° across page center, adjustable font size 24–96pt, adjustable opacity 5–60%. Built on `pdf-lib` with `StandardFonts.Helvetica` / `HelveticaBold`; fully client-side, no server round-trip. Wired into `LIVE_TOOL_IDS` in `app/tool/[id]/page.tsx`. Flips T5 in TEST_PLAN.md from Pending → Ready-to-test. (2026-04-20)
- [x] **`/tool/to-pdf` runner live.** New `ImageToPdfTool` component accepts JPG + PNG (≤20 MB each), embeds each image as a page, and saves one PDF. Supports three layout modes: fit-to-image (each page sized to source dimensions, capped at 3000pt), US Letter with centered fit, A4 with centered fit. Adjustable page margin (0–72pt) in Letter/A4 modes. Multi-file reorder + remove controls mirror MergePdfTool. Built on `pdf-lib` `embedJpg` / `embedPng`. Brings the live free-tool count to six. (2026-04-20)
- [x] **`/tool/rotate` upgraded to true "Rotate & Reorder".** Previous runner only rotated. New `RotatePdfTool` is a single-screen flow with three operations: (a) bulk row — "Rotate all 90° CW", "Rotate all 180°", "Rotate all 90° CCW", "Reverse order", "Undo all edits"; (b) per-page row — show page index + "was #N" badge when reordered + accumulated rotation chip + ↑ / ↓ / rotate-CW / rotate-CCW / delete buttons; (c) Apply & download builds the output via `copyPages` in the edited order, applying each page's accumulated rotation. Output filename suffix is chosen per edit kind (`-rotated`, `-reordered`, `-edited`). Edits stored as a delta from source so "Undo all edits" reloads the file cleanly. Lives up to the registry's "Rotate & Reorder" / "Fix orientation and rearrange pages" promise. (2026-04-20)

### API / monitoring

- [x] **`/api/health` endpoint shipped.** Pings the DB with `SELECT 1`, returns `{ ok, service, commit, uptimeSec, db: { ok, latencyMs|error }, ts }`. Status code 200 on healthy / 503 on DB failure. `cache-control: no-store` so Cloudflare never serves a stale probe. Consumed by the status page and safe to bind as the Cloudflare origin health check. Error strings sanitized — never echoes DSN fragments. **Verified live 2026-04-20 01:50 UTC: `{ "ok": true, "db": { "ok": true, "latencyMs": 48 }}`.** (2026-04-20)

### Deploy recovery

- [x] **Hostinger deploy unstuck — SmartCta RSC serialization bug fixed.** Hostinger's Next build had been failing silently since commit `6941953` because the new `SmartCta` client component accepted `children` as a render-prop function `(label) => ReactNode`, and both consumers (`app/pricing/page.tsx`, `components/landing/LandingSections.tsx` FinalCTA) are Server Components — passing a closure across the Server→Client boundary tripped `Error: Functions cannot be passed directly to Client Components` and timed out static generation of `/`. Diagnosed via SSH-fetched deploy log `~/public_html/.builds/logs/.../2026-04-19_21-23-38_deploy.log`. Fix in commit `322e55b`: replaced render-prop with serialisable `iconBefore` / `iconAfter` slots, updated both call-sites, added a header comment so future hands don't reintroduce the pattern. Deploy `BUILD_ID` flipped `NgDx0xN2ZJtuJfWWuVLl7` → `P5OkoPR8soHHEdoZBCyWi`; `/api/health`, `/api/contact`, `/api/auth/forgot-password`, `/forgot-password`, `/tool/page-numbers`, `/tool/to-pdf`, `/tool/rotate` all verified 200 in prod. Four commits' worth of features unblocked in one push. (2026-04-20)

### Legal content audit

- [x] **Privacy + Terms stale-contact audit complete.** Both pages render through `lib/legal-docs.ts` which uses a single `SUPPORT_EMAIL = "support@pdfcraftai.com"` constant. No stray addresses on either page; when the mailbox goes live, the consistent constant makes the cutover a single-line change. (2026-04-20)

### Theme + testing infrastructure

- [x] **Light/dark theme toggle** shipped in TopNav via new `ThemeToggle` component. Uses the existing pre-hydration script in `app/layout.tsx` + `[data-theme]` CSS variables in `globals.css`. Stored in `pdfcraft_state.theme`. (2026-04-20)
- [x] **`docs/TEST_PLAN.md` created** — P0–P6 batches (auth, free tools, AI tools, authed app, marketing/SEO, error/edge cases, a11y/perf). (2026-04-20)
- [x] **`docs/FEATURE_TRACKER.md` created** — Done / Partial / Pending matrix across marketing, auth, API, product, analytics, SEO, security. (2026-04-20)

### Accessibility pass (Lighthouse-driven)

- [x] **Lighthouse mobile audit run on home, /pricing, /tool/page-numbers, /tool/to-pdf, /tool/rotate.** Before scores (a11y): 93 / 94 / 96 / 96 / 96. Commit `aca48fb` shipped three fixes: (a) `--fg-subtle` bumped in `app/globals.css` from `oklch(0.55 0.01 260)` → `oklch(0.68 0.01 260)` in dark mode and `0.58` → `0.45` in light mode — resolved 48 color-contrast failures across all five audited pages (muted metadata, mono captions, pricing footnotes); (b) heading order on home (`components/landing/LandingSections.tsx:592`) promoted from `<h4>` → `<h3>` inside the Audience section after a sibling `<h2>`, and on `/pricing` (`app/pricing/page.tsx:83, 203`) the two top-level `<h3>` section headers (Monthly Plus hero, BYOK) promoted to `<h2>` to sit directly under the page `<h1>`; (c) the `POPULAR` chip on `/pricing` switched from `color:"white"` on `var(--accent)` (2.51 contrast, WCAG fail) to `var(--accent-fg)`. After re-audit: a11y **100** on all five pages. Home perf also moved 79 → 88. Verified live by grepping the production CSS bundle for the new `oklch` value. (2026-04-20)

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

- [ ] **(quality) Home-page Performance is still 88.** Biggest outstanding levers (from the post-fix Lighthouse): LCP 2.8s and TBT 500–600ms. Likely culprits: GA4 + Clarity scripts loaded without `strategy="lazyOnload"` in `app/layout.tsx`, hero image not marked `priority` / correctly sized, and the landing-page client components. A focused perf session could probably clear 95+.
- [ ] **(quality) Wire a `commit` env var on Hostinger** so `/api/health` returns the deployed SHA. Currently `commit:null`, which forces us to verify deploys by grepping CSS bundles instead of polling the health endpoint.
- [ ] **(cleanup) Workspace has uncommitted `SmartCta` render-prop edits** in `app/pricing/page.tsx` and `components/landing/LandingSections.tsx` (a render-prop `children={(label) => ...}` pattern replacing the `iconAfter` prop). The a11y commit deliberately excluded these. Decide whether `SmartCta`'s API actually accepts children and ship — or revert the workspace copy.
- [ ] **(SEO) Verify `metadata.openGraph` and `twitter` cards on key pages** — open `https://pdfcraftai.com` in Twitter/Facebook share validators.
- [ ] **(monitoring) Wire Cloudflare origin health check at `/api/health`.** Endpoint is live (see Done above); this is just the last-mile step of pointing CF at it in the dashboard.

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
