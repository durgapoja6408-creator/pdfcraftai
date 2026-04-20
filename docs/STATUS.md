# pdfcraftai.com — Live Status & Punch List

_Single source of truth for what's done, what's pending, and who owns each item._
_Future Claude sessions: read this AFTER `CLAUDE.md` and BEFORE starting new work._

**Last updated:** 2026-04-20 (post `/tool/pdf-to-office` runner ship — server-side PDF→Word/.txt, smoke harness now catches COMING SOON shells)

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
- [x] **`/tool/protect` runner live.** New `ProtectPdfTool` component ships two modes in one runner: (a) **Protect** — set user password (≥ 4 chars, confirm-field enforced), optional separate owner password, per-permission grid (allow printing / copying text / editing / annotations); (b) **Unlock** — provide current password, strip the encryption on save so the output PDF is decrypted. Auto-detects whether the dropped file is already encrypted and flips the default mode. Built on `@cantoo/pdf-lib`, a maintained pdf-lib fork that adds the PDF encryption handler (pdf-lib 1.17 can read but not write encrypted PDFs). `@cantoo/pdf-lib` is dynamic-imported only on this runner — the other free-tool bundles are unaffected. Fully client-side — the password never leaves the browser; same "Stays in your browser" reassurance card as the other free tools. Also fixed a Next 14 prerender break: added a `<Suspense>` boundary around `<LoginForm>` in `app/login/page.tsx` because `useSearchParams()` (for the `?reset=1` flash added with the reset-redemption flow) requires one for static generation. Brings the live free-tool count to seven. (2026-04-20)
- [x] **`/tool/rotate` upgraded to true "Rotate & Reorder".** Previous runner only rotated. New `RotatePdfTool` is a single-screen flow with three operations: (a) bulk row — "Rotate all 90° CW", "Rotate all 180°", "Rotate all 90° CCW", "Reverse order", "Undo all edits"; (b) per-page row — show page index + "was #N" badge when reordered + accumulated rotation chip + ↑ / ↓ / rotate-CW / rotate-CCW / delete buttons; (c) Apply & download builds the output via `copyPages` in the edited order, applying each page's accumulated rotation. Output filename suffix is chosen per edit kind (`-rotated`, `-reordered`, `-edited`). Edits stored as a delta from source so "Undo all edits" reloads the file cleanly. Lives up to the registry's "Rotate & Reorder" / "Fix orientation and rearrange pages" promise. (2026-04-20)

### API / monitoring

- [x] **`/api/health` endpoint shipped.** Pings the DB with `SELECT 1`, returns `{ ok, service, commit, uptimeSec, db: { ok, latencyMs|error }, ts }`. Status code 200 on healthy / 503 on DB failure. `cache-control: no-store` so Cloudflare never serves a stale probe. Consumed by the status page and safe to bind as the Cloudflare origin health check. Error strings sanitized — never echoes DSN fragments. **Verified live 2026-04-20 01:50 UTC: `{ "ok": true, "db": { "ok": true, "latencyMs": 48 }}`.** (2026-04-20)

### Deploy recovery

- [x] **Hostinger deploy unstuck — SmartCta RSC serialization bug fixed.** Hostinger's Next build had been failing silently since commit `6941953` because the new `SmartCta` client component accepted `children` as a render-prop function `(label) => ReactNode`, and both consumers (`app/pricing/page.tsx`, `components/landing/LandingSections.tsx` FinalCTA) are Server Components — passing a closure across the Server→Client boundary tripped `Error: Functions cannot be passed directly to Client Components` and timed out static generation of `/`. Diagnosed via SSH-fetched deploy log `~/public_html/.builds/logs/.../2026-04-19_21-23-38_deploy.log`. Fix in commit `322e55b`: replaced render-prop with serialisable `iconBefore` / `iconAfter` slots, updated both call-sites, added a header comment so future hands don't reintroduce the pattern. Deploy `BUILD_ID` flipped `NgDx0xN2ZJtuJfWWuVLl7` → `P5OkoPR8soHHEdoZBCyWi`; `/api/health`, `/api/contact`, `/api/auth/forgot-password`, `/forgot-password`, `/tool/page-numbers`, `/tool/to-pdf`, `/tool/rotate` all verified 200 in prod. Four commits' worth of features unblocked in one push. (2026-04-20)

### Legal content audit

- [x] **Privacy + Terms stale-contact audit complete.** Both pages render through `lib/legal-docs.ts` which uses a single `SUPPORT_EMAIL = "support@pdfcraftai.com"` constant. No stray addresses on either page; when the mailbox goes live, the consistent constant makes the cutover a single-line change. (2026-04-20)

### Content depth

- [x] **Help Center — 24 articles routed at `/help/[slug]`.** `lib/help-topics.ts` rewritten with 6 topics (getting-started / ai-tools / security-privacy / billing / api-developers / troubleshooting) × 4 articles each; every article ships a ~3-paragraph body. New dynamic route `app/help/[slug]/page.tsx` renders breadcrumb, topic-icon header, summary lede, paragraph body, "still stuck?" support card, related-articles list (siblings), cross-topic browse chips. `generateStaticParams` emits all 24 slugs. `generateMetadata` includes per-article OG (`type: "article"`, siteName) + Twitter summary cards + keywords. `HelpSearch` now searches `title + summary + body + topic.name`, results route to the detail page with a topic + summary preview line. Sitemap fans out `helpRoutes` (priority 0.5). Verified: `tsc --noEmit` clean; `next build` shows `/help/[slug]` generating 24 paths. (2026-04-20)
- [x] **API reference — `/api` upgraded from placeholder to real docs.** `lib/api-endpoints.ts` extended with rate-limit tiers (Sandbox / Free / Pro / Scale), rate-limit response headers, 10 error codes (400/401/402/413/415/422/429/500/503), per-endpoint request + response examples with notes for all 8 endpoints, HMAC-signed webhook receiver snippet + 4 event types, idempotency snippet. Page rebuilt with on-page nav, quickstart, auth guide (pk_live / pk_test / sk), endpoints summary table + 8 detail cards with request/response side-by-side, rate-limit tables, error code table, webhook section, idempotency section, footer CTA. Removed "Phase 2" placeholder copy. Verified: `tsc --noEmit` clean; `next build` ok. (2026-04-20)

### Theme + testing infrastructure

- [x] **Light/dark theme toggle** shipped in TopNav via new `ThemeToggle` component. Uses the existing pre-hydration script in `app/layout.tsx` + `[data-theme]` CSS variables in `globals.css`. Stored in `pdfcraft_state.theme`. (2026-04-20)
- [x] **`docs/TEST_PLAN.md` created** — P0–P6 batches (auth, free tools, AI tools, authed app, marketing/SEO, error/edge cases, a11y/perf). (2026-04-20)
- [x] **`docs/FEATURE_TRACKER.md` created** — Done / Partial / Pending matrix across marketing, auth, API, product, analytics, SEO, security. (2026-04-20)
- [x] **`scripts/test-pdf-tools.mjs` — Node-based smoke harness for every client-side PDF tool.** Drives the same `pdf-lib` / `@cantoo/pdf-lib` APIs the browser runners use, so correctness can be asserted without a real browser. 17 tests across 7 tool groups: merge (3+2+4 pages, single-PDF passthrough), split (5-page → 5 singletons), rotate & reorder (rotate, reverse, delete), compress (useObjectStreams resave stays valid), page numbers + watermark (stamp every page, diagonal overlay), image → pdf (PNG, JPG, combined), protect + unlock (encrypt adds Encrypt dict, stock pdf-lib rejects, wrong password throws, user + owner password both unlock, resave strips encryption). All 17 pass in `node scripts/test-pdf-tools.mjs`. (2026-04-20)
- [x] **`scripts/smoke-live.mjs` — Production smoke harness.** Hits the live apex and asserts `/api/health` 200 + cache-control, GET 200 on 6 marketing pages + 7 tool runners, auth redirects for unauthed app routes, `/api/auth/forgot-password` contract (400 on bad email, 200 on valid — including replay, enforcing the anti-enumeration contract), `/api/auth/reset-password` contract (400 on missing / non-hex, 409 on unknown token), `/sitemap.xml` + `/robots.txt`. 24/26 pass as of 2026-04-20 02:45 UTC; the two failures (`/account` 404, unknown-token 500 on reset-password) are fixed locally and pending deploy — see "Prod hotfixes landing in next deploy" below. (2026-04-20)

### Prod hotfixes landing in next deploy

- [x] **`/api/auth/reset-password` 500-on-every-call → fixed via self-healing schema bootstrap.** Root cause: Hostinger doesn't run `drizzle-kit push` on deploy, so the `password_reset_tokens` table that `0001_password_reset_tokens.sql` defines was never created on production MySQL. Every reset attempt threw `ER_NO_SUCH_TABLE` inside `consumePasswordResetToken` and the route catch surfaced a generic 500. Fix in `lib/password-reset.ts`: one-time-per-process `ensureSchema()` that runs `CREATE TABLE IF NOT EXISTS password_reset_tokens (...)` matching the migration byte-for-byte, called from the top of `mintPasswordResetToken` and `lookupPasswordResetToken`. Defence-in-depth: route now inspects `err.code === "ER_NO_SUCH_TABLE"` and returns 409 (same user-facing message as a stale/missing token) instead of 500. Bootstrap is marked `REMOVE WHEN MIGRATIONS RUN AT DEPLOY` so we don't leave runtime DDL in place forever. Local PDF-tool harness still 17/17 green; `tsc --noEmit` clean. (2026-04-20)
- [x] **`/account` → `/app/settings` redirect shipped.** `/account` was 404'ing in prod despite being linked from the pricing-page BYOK CTA. Added `app/account/page.tsx` that `redirect("/app/settings")` at render — keeps external links working (email campaigns, marketing collateral) without duplicating the settings UI. `/app/settings` itself already auth-gates, so unauthed visitors get bounced to `/login` transitively. (2026-04-20)
- [x] **Smoke harness anti-enumeration assertion corrected.** Initial `scripts/smoke-live.mjs` asserted the second forgot-password call should 429; the endpoint intentionally stays 200 on throttle to avoid leaking which addresses are rate-limited. Updated the test to assert 200 + document why. (2026-04-20)
- [x] **`/tool/pdf-to-office` runner shipped (user-reported defect: "not working").** Root cause: the URL returned 200 HTML, which is why `scripts/smoke-live.mjs` was passing, but the page was rendering `ComingSoonRunner` because `pdf-to-office` wasn't in the `LIVE_TOOL_IDS` set in `app/tool/[id]/page.tsx`. From an end-user's POV (including the reporter's screenshot), the disabled "Choose file / Use sample" buttons made the tool indistinguishable from broken. Fix: three new files shipped together — (1) `lib/tools-server/pdf-to-office.ts` converts extracted text to `.docx` (one heading per page, page-break between pages, Calibri 11pt, US Letter, OCR-candidate placeholder paragraphs) or `.txt` (UTF-8 with `\f` between pages); (2) `app/api/tools/pdf-to-office/route.ts` is the POST endpoint — Node runtime, 25 MB body cap, per-IP 10/min throttle, Zod format enum, status-code map (400 bad form / invalid PDF, 413 too large, 422 `no_extractable_text`, 429 rate-limited, 500 server error), Content-Disposition with RFC 5987 filename, `x-page-count` + `x-ocr-candidate-pages` response headers for the client UI; (3) `components/tools/PdfToOfficeTool.tsx` is the client runner — `ToolDropzone` + radio-card format selector (Word / Plain text) + ResultCard with download button + conditional OCR nudge + explicit v2-deferred note pointing tabular users to `/tool/ai-ocr`. Wired into `app/tool/[id]/page.tsx` switch, and that page now special-cases the reassurance row for server-side free tools so the "Stays in your browser" claim isn't a lie (new copy: "Your PDF is converted in-memory on our servers and discarded the moment the download completes — nothing is stored."). Server-side was the right call despite breaking the all-client-side free-tool pattern: pdfjs's worker needs bundling under a strict CSP and the `docx` library would bloat every visitor's bundle. No auth, no credit spend, no disk writes. `tsc --noEmit` clean, 17/17 existing PDF-tool harness still green. **Also extended `scripts/smoke-live.mjs`** with a new per-path assertion that live tool pages must NOT contain the string `TOOL RUNNER LANDS IN` — so any future regression where a runner is registered-but-disabled fails smoke instead of passing silently. Installed `docx@^9.6.1` as a runtime dep. (2026-04-20)

### Accessibility pass (Lighthouse-driven)

- [x] **Lighthouse mobile audit run on home, /pricing, /tool/page-numbers, /tool/to-pdf, /tool/rotate.** Before scores (a11y): 93 / 94 / 96 / 96 / 96. Commit `aca48fb` shipped three fixes: (a) `--fg-subtle` bumped in `app/globals.css` from `oklch(0.55 0.01 260)` → `oklch(0.68 0.01 260)` in dark mode and `0.58` → `0.45` in light mode — resolved 48 color-contrast failures across all five audited pages (muted metadata, mono captions, pricing footnotes); (b) heading order on home (`components/landing/LandingSections.tsx:592`) promoted from `<h4>` → `<h3>` inside the Audience section after a sibling `<h2>`, and on `/pricing` (`app/pricing/page.tsx:83, 203`) the two top-level `<h3>` section headers (Monthly Plus hero, BYOK) promoted to `<h2>` to sit directly under the page `<h1>`; (c) the `POPULAR` chip on `/pricing` switched from `color:"white"` on `var(--accent)` (2.51 contrast, WCAG fail) to `var(--accent-fg)`. After re-audit: a11y **100** on all five pages. Home perf also moved 79 → 88. Verified live by grepping the production CSS bundle for the new `oklch` value. (2026-04-20)

### Stubs for follow-up email wiring

- [x] **`/api/contact` route** — Zod-validated, in-memory rate-limited, logs submissions until SendGrid/Postmark lands. (2026-04-20)
- [x] **`/api/auth/forgot-password` route** — acks identically on success/miss (anti-enumeration), per-email rate limited, logs for reset-link wiring. `ForgotPasswordForm` now POSTs here instead of the local `setTimeout` mock. (2026-04-20)

### Password reset redemption flow (end-to-end)

- [x] **Password reset-link redemption shipped end-to-end.** Completes the forgot-password → email-link → new-password loop that was previously stubbed.
  - **Schema (`db/schema/auth.ts`)** — new `password_reset_tokens` table: `id` (uuid), `user_id` (FK → `users.id` ON DELETE cascade), `token_hash` (sha256-hex, unique), `expires_at` (ts(3)), `consumed_at` (ts(3), nullable), `created_at` (ts(3), default now). Two indexes: `user_id`, `expires_at`.
  - **Migration (`db/migrations/0001_password_reset_tokens.sql` + `meta/_journal.json`)** — drizzle-kit format, statement-breakpoint-separated, journaled so `pnpm db:push` / `pnpm db:generate` pick it up; also runnable directly via `mysql` CLI on Hostinger as a manual fallback.
  - **Helper (`lib/password-reset.ts`)** — `mintPasswordResetToken(email)` (silent no-op on unknown email, 32-byte random hex raw token, 30-minute TTL, stores only sha256 hash at rest), `lookupPasswordResetToken(raw)` (cheap-rejects non-64-hex before any DB hit), `consumePasswordResetToken(raw, newPassword)` (race-safe single-use via guarded `UPDATE ... WHERE id=? AND consumed_at IS NULL`, bcrypt-10 the new password, then invalidates sibling outstanding tokens for the same user so reset-twice can't leave a live second link).
  - **Forgot endpoint (`app/api/auth/forgot-password/route.ts`)** — rewritten: still anti-enumeration 200 on valid payload, still 1/min per-email rate-limited; now mints the token and logs the full reset URL + email + expiry to the Node process log (Hostinger tail) until a transactional mail provider is wired. `NEXT_PUBLIC_SITE_URL` override respected; falls back to the request origin.
  - **Reset endpoint (`app/api/auth/reset-password/route.ts`)** — new POST. Zod validates 64-hex token + 8–128-char password. Per-IP bucket rate limit (5/min) before the DB. Returns 200 on success, 400 on bad payload, 409 on expired/consumed/missing, 429 on rate limit, 500 on DB error. Same "invalid or expired" message for 409 variants (enumeration-safe).
  - **Dynamic page (`app/reset-password/[token]/page.tsx`)** — async server component, `dynamic = "force-dynamic"`, verifies token server-side on mount. Invalid → renders `AuthShell` with "This reset link won't work" + `<I.Info>` warning card + CTA back to `/forgot-password`. Valid → renders `<ResetPasswordForm token=... />` under "Choose a new password".
  - **Client form (`components/auth/ResetPasswordForm.tsx`)** — twin `PasswordField`s (new + confirm) with show/hide toggles, live `PasswordStrength` indicator, disabled-until (length ≥ 8, matches confirm, strength ≥ 2), inline errors, `router.replace("/login?reset=1")` on 200 (replace, not push — keeps the reset URL out of history).
  - **Middleware (`auth.config.ts`)** — `/reset-password/<token>` added to the "auth page" redirect guard so already-signed-in users bounce to `/app/dashboard` instead of redeeming a token they don't need.
  - **Login flash (`components/auth/LoginForm.tsx`)** — `useSearchParams` reads `?reset=1`; shows a green `<I.Check>` banner ("Password updated. Sign in with your new password to continue.") above the Google SSO button.
  - **Typechecked clean** (`./node_modules/.bin/tsc --noEmit` → `EXIT=0`). Swapping in Resend/Postmark once the mailbox is live is a single drop-in around the `console.log` in the forgot endpoint. (2026-04-20)

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
