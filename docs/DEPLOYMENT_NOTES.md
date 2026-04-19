# pdfcraftai.com — Deployment & Session Notes

_Last updated: 2026-04-20_

## Production environment

- **Host:** Hostinger (managed Next.js hosting, hPanel)
- **CDN / Proxy:** Cloudflare (proxy enabled — confirmed via `cf-ray`, `server: cloudflare`, `cf-cache-status: DYNAMIC`)
- **Domain:** https://pdfcraftai.com (apex + www redirect)
- **Current commit at last successful deploy:** `36034eb` (2026-04-20, GA4 + Clarity)

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
