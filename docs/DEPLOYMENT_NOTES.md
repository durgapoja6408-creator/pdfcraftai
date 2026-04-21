# pdfcraftai.com — Deployment & Session Notes

_Last updated: 2026-04-21 (Task #21 — Gemini adapter + per-op router)_

## Production environment

- **Host:** Hostinger (managed Next.js hosting, hPanel)
- **CDN / Proxy:** Cloudflare (proxy enabled — confirmed via `cf-ray`, `server: cloudflare`, `cf-cache-status: DYNAMIC`)
- **Domain:** https://pdfcraftai.com (apex + www redirect)
- **Current commit at last successful deploy:** `ed6e244` (2026-04-21, Phase A2 gate #6 — Gemini adapter + per-op routing ladder — Task #21. Three new files: `lib/ai/adapters/gemini.ts` (`GeminiProvider` class matching the `AIProvider` interface — gemini-2.5-flash default with `GEMINI_MODEL` override, PDF bytes as `inlineData` Part, usage from `usageMetadata`), `lib/ai/router.ts` (exports `AIOp`/`ROUTING_POLICY`/`OP_REQUIRED_CAPABILITY`/`OP_ENV_VAR`/`route()`/`NoRoutableProviderError` with caller-preferred > env-override > compiled-in precedence; ocr/translate → Gemini-primary, chat → OpenAI-primary, summarize/compare/generate/sign → Anthropic-primary with typed fallback chains), `scripts/test-router.mjs` (76 assertions / 6 sections). Seven refactored files: `lib/ai/types.ts`/`registry.ts`/`ocr.ts`/`translate.ts`/`summarize.ts`/`compare.ts`/`app/api/ai/chat/route.ts` — every `selectProvider()` → `route(op, { preferredId })` + typed `NoRoutableProviderError` catch mapped to each subsystem's existing error class. Chat route provider-swap preserved all Phase A1 `recordAiUsage`/`providerStartedAt` + Phase A2 `estimatePromptTokens`/20k-cap/413-refund logic byte-for-byte (verified green by re-running `test-ai-usage.mjs` + `test-chat-context-cap.mjs` post-refactor). `scripts/run-all-tests.mjs` SUITES gains `ai-router`; `npm test` now runs 7 suites / 602 assertions / ~1.1s, all green. `npx tsc --noEmit` exit 0. `@google/generative-ai ^0.24.1` added with clean +10-line lockfile delta. **No deploy gotcha** — pure code change, no migration, no env-var addition required to deploy (gate #6 runtime validation defers until `GEMINI_API_KEY` lands in Hostinger — same handoff shape as Task #18's `ANTHROPIC_API_KEY`). Until then `route("ocr", …)` falls through to the Anthropic fallback (if configured) or throws `NoRoutableProviderError` → 503 `no_ai_provider_configured` — the ladder degrades gracefully, doesn't silently misroute. Previous: `e882eed` (Phase A2 token-level input-context cap on `/api/ai/chat` — Task #20. Replaces old 16k-char byte-level `message_too_long` guard with a proper 20k-token ceiling per MASTER_PLAN §4 D4 + §7 gate #5. Three-file bundle: new `lib/ai/tokens.ts` (char-based heuristic, 3.5 chars/token Latin + 1:1 CJK + 4-token role-framing), restructured `app/api/ai/chat/route.ts` (cap check runs after PDF extract, before user-message INSERT; refund-before-413 on overflow), new `scripts/test-chat-context-cap.mjs` (33 assertions across 5 sections: static / behavioral / route-wiring / drift / spec-pin). Also wired ai-usage + chat-context-cap suites into the aggregator and fixed the Task #19 retrospective gap. `npm test` now runs 6 suites / 526 assertions / ~1.0s, all green. **No deploy gotcha this time** — pure code change, no migration. Previous: `037f6ea` Phase A1 `ai_usage` per-call audit table — Task #19. **Deploy gotcha for that one: `db/migrations/0005_ai_usage.sql` was applied manually to Hostinger MySQL 2026-04-21 ~11:00 UTC via SSH — verified via `SHOW CREATE TABLE ai_usage` showing all 15 columns + 5 indexes + FK to users.id ON DELETE CASCADE.** See STATUS.md § "AI observability (Phase A1/A2)". Before that: `5f70cd7` CF-IPCountry auto-preselect on `/launch-notify` Task #3 sub-item 4d; code shipped in `00615d2`.)

## Hostinger environment variables (production)

Set in hPanel → App → Environment Variables:

| Key | Value |
|---|---|
| `MYSQL_URL` | (pre-existing — MySQL connection string) |
| `NEXTAUTH_SECRET` | (pre-existing) |
| `NEXTAUTH_URL` | `https://pdfcraftai.com` |
| `NEXT_PUBLIC_SITE_URL` | `https://pdfcraftai.com` |
| `GOOGLE_CLIENT_ID` | `912612566698-n1857n8qa60n2sb55qag7sn2fi9bgias.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | (set; do not echo) |

After editing env vars, click **Save and redeploy**.

## Google OAuth

- **Google Cloud project:** `pdfcraftai`
- **Consent screen:** Published + Branding verified (2026-04-19)
- **OAuth client type:** Web application
- **Authorized JavaScript origins:**
  - `https://pdfcraftai.com`
  - `https://www.pdfcraftai.com`
- **Authorized redirect URIs:**
  - `https://pdfcraftai.com/api/auth/callback/google`
  - `https://www.pdfcraftai.com/api/auth/callback/google`
- **App logo uploaded:** `public/brand/pdfcraftai-mark-120.png` (120×120 chromatic monogram)
- **Branding URLs filled:** App home, Privacy, Terms — all pointing at `https://pdfcraftai.com/...`
- **Support email:** `rajasekarjavaee@gmail.com` (swap to `support@pdfcraftai.com` once that mailbox is confirmed deliverable)

## Known operational issue — 503 after deployment

**Symptom:** Occasionally after clicking *Save and redeploy* in Hostinger, the site returns HTTP 503.

**Fix:** In Hostinger hPanel:
1. Go to **Resource usage** (left nav / app dashboard)
2. Find the running Node process(es)
3. Click **Stop running process**
4. The app auto-restarts fresh and the 503 clears

## Integration status (verified 2026-04-20)

| Integration | Status | Evidence |
|---|---|---|
| Cloudflare proxy | OK | `cf-ray`, `server: cloudflare` on every response |
| `robots.txt` | OK | Advertises `Sitemap: https://pdfcraftai.com/sitemap.xml` |
| Sitemap (`/sitemap.xml`) | OK | 39 URLs, application/xml, resubmitted to GSC + Bing 2026-04-19 |
| Google OAuth (plumbing) | OK | `/api/auth/providers` shows Google wired to correct callback |
| Google OAuth (sign-in smoke test) | Pending | Needs human click at `/login` |
| Microsoft Clarity | OK (live) | Tag `wcsbv536zv` present in rendered HTML, commit `36034eb` |
| Google Analytics (GA4) | OK (live) | Tag `G-2Y8PS0S93F` present in rendered HTML, commit `36034eb` |

## `app/layout.tsx` current state

Contains:
1. Theme-flash-prevention inline script (pre-existing)
2. GA4 snippet via `next/script` (id `ga4-init`, `afterInteractive`)
3. Microsoft Clarity snippet via `next/script` (id `ms-clarity-init`, `afterInteractive`)

IDs are defined as constants at the top of the file: `GA_MEASUREMENT_ID`, `CLARITY_PROJECT_ID`.

## Useful commands

```bash
# Check live headers (from sandbox)
curl -sI https://pdfcraftai.com | head -20

# Verify Clarity + GA4 present in live HTML
curl -s https://pdfcraftai.com | grep -oE '(gtag/js\?id=G-[A-Z0-9]+|clarity\.ms|ga4-init|ms-clarity-init)' | sort -u

# Check sitemap URL count
curl -s https://pdfcraftai.com/sitemap.xml | grep -c '<loc>'

# Auth plumbing
curl -s https://pdfcraftai.com/api/auth/providers
```
