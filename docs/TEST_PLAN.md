# pdfcraftai.com — End-to-End Test Plan

_Prioritized smoke-test checklist to run after every deploy. Each batch can be picked up in order._
_Sister file: `FEATURE_TRACKER.md` (what exists); `STATUS.md` (what's still owed)._

**Last updated:** 2026-04-20

---

## How to use this plan

1. Run batches in priority order — **P0 blocks everything below it**.
2. For each item, mark ✅ pass / ❌ fail / ⏭ skipped with a short note.
3. File a fresh entry under STATUS.md "Pending" for any ❌.
4. Browser matrix: Chrome-latest (primary), Safari-latest (secondary), Firefox-latest (best-effort). Mobile: iOS Safari.

---

## P0 — Auth & core identity (test first, blocks P1+)

| # | Case | Expected | Verification |
|---|---|---|---|
| A1 | Register with email + password | Redirect to `/app/dashboard`; session cookie `authjs.session-token` set | Check devtools → Application → Cookies |
| A2 | Log out | `Sign out` in user menu drops the session; redirect to `/` | Cookie is gone |
| A3 | Log in with email + password | Same cookie set; dashboard renders | — |
| A4 | Google OAuth round-trip | Click "Continue with Google" → Google consent → back to apex → session set | No host-mismatch error |
| A5 | Session persistence across reload | Refresh the dashboard; still authed | — |
| A6 | Protected route when signed out | Hitting `/app/dashboard` unauthed → redirect to `/login?callbackUrl=...` | — |
| A7 | Middleware redirects authed users off auth pages | While logged in, visit `/login` → redirect to `/app/dashboard`. Also `/register`, `/signup`, `/forgot-password`. | — |
| A8 | Forgot-password happy path | Submit a valid email → always-200 success card appears | Watch Hostinger logs for `[forgot-password] reset requested` |
| A9 | Forgot-password rate limit | Submit the same email twice in 60s → still 200, but server logs `[forgot-password] throttled` | Logs |
| A10 | Forgot-password invalid input | Empty or malformed email → inline error, NOT the success card | — |

## P1 — Free PDF tools (client-side WASM)

Assume: logged-out visitor, Chrome latest, a ~5-page sample PDF + a 2MB JPG.

| # | Tool | Steps | Expected |
|---|---|---|---|
| T1 | Merge | `/tool/merge` → drop 2 PDFs → Merge | Download is a valid PDF with combined pages |
| T2 | Split | `/tool/split` → drop PDF → choose "every page" → Split | Download is a ZIP of single-page PDFs |
| T3 | Compress | `/tool/compress` → drop PDF → Compress | Output file size < input, opens cleanly |
| T4 | Rotate | `/tool/rotate` → drop PDF → rotate 90° | Output pages rotated |
| T5 | Page numbers | `/tool/page-numbers` → drop PDF → pick "Page numbers" → choose format + position + size → Apply | Output PDF has numbers drawn at chosen corner on every page; original content intact |
| T5b | Watermark | `/tool/page-numbers` → drop PDF → pick "Watermark" → type text → adjust opacity → Apply | Output PDF has semi-transparent diagonal watermark centered on each page |
| T6 | Protect / Unlock | `/tool/protect` | **Pending.** |
| T7 | PDF ↔ Office | `/tool/pdf-to-office`, `/tool/to-pdf` | **Pending.** |

## P2 — AI tools (credits required)

Assume: test account with ≥100 credits on file.

| # | Tool | Steps | Expected |
|---|---|---|---|
| AI1 | Summarize | `/tool/ai-summarize` → drop PDF → Summarize | Credit debited; summary returned; cost matches card on `/pricing` |
| AI2 | Translate | `/tool/ai-translate` → pick language → Translate | PDF preserves layout; debit matches |
| AI3 | OCR | `/tool/ai-ocr` → drop scanned PDF → OCR | Searchable PDF returned; text selectable |
| AI4 | Compare | `/tool/ai-compare` → drop v1 + v2 → Compare | Redline diff with severity labels |
| AI5 | Chat with PDF | `/tool/ai-chat` | **Pending — runner not shipped yet.** |
| AI6 | Redact / Rewrite / Generate / Sign / Table | — | **Pending.** |

## P3 — Authed app surfaces

| # | Case | Expected |
|---|---|---|
| D1 | `/app/dashboard` | Renders credit balance + 5 most recent files for the logged-in user |
| D2 | `/app/files` | Lists user's files with download buttons |
| D3 | `/app/files/[id]` | Detail view renders for user's own file; 404 for someone else's |
| D4 | `/app/chat` | Chat list renders (may be empty); creating a chat works end-to-end |
| D5 | `/app/studio` | Workflow Studio loads |
| D6 | `/app/billing` | Balance shown; credit packs → CheckoutButton reaches Stripe/Razorpay but no real charge in test |
| D7 | `/app/api-keys` | Key create/revoke UI works; no real keys issued without provider wiring |
| D8 | `/app/settings` | Form saves; validation on invalid inputs |

## P4 — Marketing + SEO

| # | Case | Expected |
|---|---|---|
| M1 | `/` | Hero + all landing sections render; "Start free" → `/register` anon, `/app/dashboard` authed |
| M2 | `/pricing` | Session-aware primary CTA; credit packs render; "Start Plus" → Stripe checkout |
| M3 | `/tools` | All 17 tools listed; free/AI chips correct |
| M4 | `/agent`, `/macros`, `/bulk` | MarketingHero renders; CTAs route to register/contact |
| M5 | `/about`, `/contact`, `/careers`, `/gdpr` | Render with no console errors |
| M6 | `/changelog`, `/status` | Dates correct; status indicators render |
| M7 | `/help` | Search works; topic cards clickable |
| M8 | `/blog`, `/blog/[slug]` | List + detail render |
| M9 | SEO per-tool landing pages | `/merge-pdf`, `/split-pdf`, `/compress-pdf`, `/pdf-to-word`, `/translate-pdf` all render with unique metadata |
| M10 | `robots.txt` + `sitemap.xml` | Return 200, content-type correct |
| M11 | OG / Twitter cards | `https://pdfcraftai.com` previews with proper title + description in validators |
| M12 | 404 page | Wrong URL → `/not-found.tsx` shell renders |

## P5 — Error & edge cases

| # | Case | Expected |
|---|---|---|
| E1 | Refresh dashboard mid-API call | No hydration error |
| E2 | Post to `/api/contact` with malformed JSON | 400 with `error` body |
| E3 | Post to `/api/contact` same email twice fast | Second returns throttle 200 (stub) |
| E4 | Forgot-password with non-existent email | Same 200 + success card (anti-enumeration) |
| E5 | Upload 0-byte file to merge | Client-side rejection, no crash |
| E6 | Upload 150MB file | Client-side rejection with clear message |

## P6 — A11y + performance

| # | Case | Expected |
|---|---|---|
| A11Y1 | Keyboard-only nav through TopNav | Focus visible, Enter opens menu, Escape closes |
| A11Y2 | Color contrast audit on homepage | WCAG 2.2 AA pass (axe or Lighthouse) |
| A11Y3 | Lighthouse mobile score on `/` | Performance ≥ 85, Best Practices ≥ 95, SEO ≥ 95 |
| A11Y4 | Lighthouse desktop score on `/pricing` | Same bars |

---

## Out of scope for this plan

- Payment providers (Stripe/Razorpay/PayPal) in live mode — test-mode only.
- Real email delivery — blocks on the user picking a transactional host (SendGrid/Postmark/Resend).
- Account deletion + GDPR data-export flows — UX shipped, back-end pending.
