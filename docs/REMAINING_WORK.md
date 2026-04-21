# pdfcraftai.com — Remaining Work & Blocker Map

_Generated: 2026-04-21_
_Source of truth: this file consolidates `docs/STATUS.md` + the live task list into a single actionable view._

This is the single file to open when you want to know:
1. What's DONE and verified in production.
2. What's BLOCKED, on whom, and what unblocks it.
3. What's READY-TO-WORK right now (no external dependencies).

---

## 1. Snapshot — 16 tracked items

| # | Title | Status | Blocker | Owner to unblock |
|---|---|---|---|---|
| 1 | Paddle MoR sandbox validation | BLOCKED | Need `PADDLE_API_KEY`, `PADDLE_CLIENT_TOKEN`, `PADDLE_WEBHOOK_SECRET` from sandbox Developer Tools | **You** (paste into chat) |
| 2 | CA consult — 7 tax + 8 GST questions | BLOCKED | Appointment not yet scheduled | **You** (book CA) |
| 3 | Cloudflare geo-block + checkout router | PARTIAL — 6 of 8 sub-items shipped | (1c) WAF rule apply; (2b) `routeCheckoutByCountry` wiring | **You** (CF dashboard) + #1 keys |
| 4 | MARGIN_VERIFICATION v3 follow-ups | PARTIAL — docstring shipped; env-var portion pending | `PADDLE_*` Hostinger env vars | Cascades from #1 |
| 5 | Privacy + Terms + DPA sub-processor update for Paddle KYC | ✅ DONE | — | — |
| 6 | Retire PayPal — D4 cleanup | ✅ DONE | — | — |
| 7 | Deploy `RAZORPAY_*` env vars via hPanel | ✅ DONE | — | — |
| 8 | Verify Razorpay adapter boots post-restart | ✅ DONE | — | — |
| 9 | Flag `.htaccess` CSP PayPal regression | ✅ DONE | — | — |
| 10 | Rewrite `docs/security/pci-saq-a.md` for post-D4 Razorpay-only state | ✅ DONE | — | — |
| 11 | Genuinely retire PayPal code — delete adapter + registry row | ✅ DONE | — | — |
| 12 | Build `/api/payments/probe` runtime self-verification endpoint | ✅ DONE | — | — |
| 13 | Ship pre-push hook via tracked `.githooks/` + `core.hooksPath` bootstrap | ✅ DONE | — | — |
| 14 | Extend `smoke-live.mjs` to cover `/launch-notify` + geo-waitlist contract + `/api/auth/providers` | ✅ DONE | — | — |
| 15 | Extend `smoke-live.mjs` with `/api/payments/probe` coverage | ✅ DONE | — | — |
| 16 | Add CF-IPCountry server-side auto-preselect on `/launch-notify` | ✅ DONE | — | — |

**Summary:** 12 DONE · 2 FULLY BLOCKED · 2 PARTIAL (shipped what we can; rest cascades from #1).

---

## 2. Blocked items — what unblocks each

### #1 — Paddle MoR sandbox validation

**State:** Adapter scaffolded at `lib/payments/adapters/paddle.ts`, registry row wired, CSP allowlist ready. Cannot boot the adapter against the sandbox without credentials.

**What unblocks it:**
1. Log in to `https://sandbox-vendors.paddle.com` (seller id `320957`).
2. Go to **Developer Tools → Authentication**.
3. Generate:
   - `PADDLE_API_KEY` (server-side, never exposed to the browser)
   - `PADDLE_CLIENT_TOKEN` (public, browser-safe)
   - `PADDLE_WEBHOOK_SECRET` (from Developer Tools → Notifications → create endpoint pointing at `https://pdfcraftai.com/api/webhooks/paddle`)
4. Paste the three values into chat. I will save them to `.claude/secrets.env` (gitignored) and run the adapter-boot smoke against sandbox.

**Blocks:** #3 (2b), #4 (env-var portion). Fixing #1 unblocks both.

---

### #2 — CA consult

**State:** Pre-read is ready at `docs/CA_CONSULT_PREREAD.md` with 7 tax questions (PAN vs GSTIN, export-of-service zero-rating, LUT requirement, foreign-currency invoicing, TDS on Paddle payouts, advance-ruling option, GST on referral commissions) and 8 GST questions (place-of-supply rules for digital goods, OIDAR classification, reverse charge on overseas SaaS tools, composition-scheme ineligibility, e-invoicing threshold, refund-of-ITC on zero-rated exports, registration state, QRMP eligibility).

**What unblocks it:** Book a 30-min consult with a practicing CA (ideally one with GST-on-digital-goods exposure). Send them the pre-read in advance. Bring me the written answers afterward — I'll fold them into `docs/india/GST_OIDAR_PLAYBOOK.md`.

**Blocks:** India-side tax reporting config. Does NOT block code or Paddle work.

---

### #3 — Cloudflare geo-block + checkout router (PARTIAL)

**Shipped (6 of 8):**
- (2) `lib/geo/routeCheckoutByCountry.ts` — pure function, 100% covered.
- (3) `lib/geo/shouldGeoBlock.ts` — allow-list + Tier-1/Tier-2 split, 100% covered.
- (4) `/launch-notify` page + form + server action.
- (4b) Tier-2 Set gate in `LaunchNotifySignup.tsx` (client-side defense-in-depth).
- (4c) `searchParams` opt-in (dynamic rendering) — ships `?country=XX` preselect.
- (4d) CF-IPCountry server-side auto-preselect (shipped in `00615d2`; paper-trail in `5f70cd7`).

**Not shipped (2 of 8):**
- **(1c) Cloudflare WAF rule apply** — rule definition lives in `docs/GEO_LAUNCH_POLICY.md` (block all Tier-1 countries at edge with 451 + redirect to `/launch-notify?country=<CF-IPCountry>`). Needs a human to paste it into `Security → WAF → Custom rules` in the Cloudflare dashboard (free plan allows 5 custom rules; we're at 0). **Blocker: you.**
- **(2b) `routeCheckoutByCountry` wiring into `createCheckoutAction`** — pure function is tested and ready, but `createCheckoutAction` currently hard-routes to Razorpay. Wiring it to call the router means the router can pick Paddle for Tier-2 traffic — and that only works once Paddle adapter is bootable. **Blocker: #1.**

**What unblocks it:**
- (1c): 10 minutes of your time in the CF dashboard (I can paste the exact rule JSON if you open the "Create rule" form).
- (2b): cascades from #1.

---

### #4 — MARGIN_VERIFICATION v3 follow-ups (PARTIAL)

**Shipped:** `lib/pricing.ts` v3 docstring (processor-fee split: Razorpay 2% INR, Paddle 5%+50¢ INR-equivalent), `docs/payments/REVENUE_LEAK_AUDIT.md` refreshed against v3 table.

**Not shipped:** Setting `PADDLE_*` env vars in Hostinger hPanel. The code is ready to read them, the docstring references them, but they don't exist until #1 is unblocked.

**What unblocks it:** Cascades from #1 — once keys are generated I'll walk the values into hPanel → Environment Variables, trigger "Save and redeploy", and confirm `/api/payments/probe` reports `paddle.ok: true`.

---

## 3. What we can do RIGHT NOW without unblocking anything

All in this list are optional polish — nothing breaks if we skip them — but each is legitimately useful and needs no external input:

- **`docs/index.md` landing page.** The `/docs` directory is accumulating (~15 top-level files now). A one-page map with 1-line descriptions would save lookup time.
- **Archive `docs/PLAN_GAP_ANALYSIS.md`** — its items are all resolved or folded into `STATUS.md`. Move to `docs/archive/` with a dated header so it stops surfacing in greps.
- **Audit `package.json` for unused deps** after the PayPal retirement (#6, #11). Likely a few packages can be removed cleanly.
- **Tighten the `smoke-live.mjs` assertion count badge** — the harness now runs 248 assertions across 4 suites; the top-of-file comment still says "~180". One-line edit.
- **Add a "blocker" column to `docs/STATUS.md`** matching this file's format so the punch list and blocker map stay in sync.

Say the word on any of these and I'll ship it.

---

## 4. When you come back with credentials / decisions

**If you paste Paddle keys** → unblocks #1, then immediately unblocks (2b) of #3 and the env-var portion of #4. Single session closes 3 items.

**If you apply the CF WAF rule** (or open the dashboard and ask me to dictate it) → closes (1c) of #3.

**If you come back from the CA** with written answers → closes #2 and I fold the answers into the OIDAR playbook.

After all three, the live task list shrinks from 16 items to 0 items in one cleanup pass.

---

_Keep this file next to `docs/STATUS.md`. STATUS.md is the append-only journal; this file is the always-current "what's left" view._
