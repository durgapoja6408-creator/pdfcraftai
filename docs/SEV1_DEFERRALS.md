# SEV-1 audit items deferred — 2026-05-12

The comprehensive gap analysis (commit `d6daa16` cover note) found 18
SEV-1 items. 14 have been fixed across commits `631be15` (backend
batch), `8d12aaa` (user-surface batch), and a third commit covering
the responsibly-shippable remainder. **Four remain explicitly
deferred** because shipping them in a single session would either
require infrastructure decisions that aren't mine to make, fabrication
of content that would be deceptive, or new product surface that
warrants founder-loop participation.

## 1. Rate-limiter persistence (Backend, audit #3)

**Audit finding:** Three routes (`auth/forgot-password`,
`auth/reset-password`, `contact`, `tools/pdf-to-office`) use
`new Map()` as the rate-limit store. Each LSAPI worker has its own
memory; advertised "5/min per IP" becomes effectively `N × 5/min`
across workers, and every `pkick` (CLAUDE.md §5 cascade recovery)
resets the state.

**Why deferred:** The fix needs a persistent store. Options:

- **MySQL-backed bucket** (cheapest): new `rate_limits` table with
  `(key, window_start, count)`. Adds 1 DB write + 1 DB read per
  rate-limited route call. The 3 routes are low-volume so the load
  is fine, but every cron + every auth call now has DB dependency
  on a path that currently has none. Migration risk.
- **Redis** (cleanest): proper rate-limit primitive (`INCR` +
  `EXPIRE`). Requires picking a provider (Upstash, Hostinger Redis,
  Cloudflare KV) + adding a client + handling connection failures.
  Multi-hour ship.
- **In-memory + sticky sessions** (works for the current 1-LSAPI-
  worker reality): no infra change but breaks the moment we scale
  to 2+ workers. Sticky-by-IP via Cloudflare or Hostinger session
  affinity could keep this honest.

**Recommended next step:** founder decides Redis vs MySQL bucket vs
sticky sessions. The choice has cost (Redis ~$10/mo on Upstash free
tier; MySQL bucket adds DB load) and trade-off implications (Redis
adds infra dependency; MySQL bucket couples auth to DB health).

**Mitigation in place today:** all four affected routes do have
per-IP rate limits (just per-worker-memory). Real-world abuse with
IP rotation defeats them, but baseline drive-by traffic is still
gated.

---

## 2. Social proof on homepage (User-surface, audit #5)

**Audit finding:** Zero matches for `testimonial | review |
trusted by | customers say | PDFs processed | users served` on the
homepage. SOC2 + ISO + DPDP badges are asterisked ("audit on
roadmap") with no offsetting trust signal.

**Why deferred:** Cannot ship without real testimonials. Fabricating
quotes from named "customers" would be deceptive — same category of
problem as the compress-pdf bait-and-switch that T1-1 fixed. The
honest options:

- **Real testimonials** — collect from existing users (the dashboard
  + post-purchase email already touch users; a one-question survey
  would work). Founder action.
- **Aggregate stats** — "X million PDFs processed", "Y signups
  this week". Requires server-side counter + maintaining honest
  numbers + a fact-check process. Doable but needs a deliberate
  product surface.
- **Logos** — "trusted by" wall with customer logos. Requires
  customer permission. Founder action.

**Recommended next step:** founder collects 3-5 testimonials from
existing paying users (free credits in exchange for a quote works
well). Once received, this is a 30-minute ship — drop them into a
new `<TestimonialsSection>` on the homepage.

---

## 3. Blog dates clumped on April 25 (User-surface, audit #8)

**Audit finding:** 20 of 27 blog posts dated `Apr 25, 2026` (single-
day dump). Trips Google's "doorway pages" classifier in the quality
algorithm.

**Why deferred:** Changing the publish dates on existing posts:

- Sends inconsistent signals to RSS subscribers (those posts already
  shipped via `/blog/rss.xml`; re-dating mid-stream is unusual)
- Affects Google's freshness signal — backdating posts can be
  interpreted as deceptive; forward-dating delays indexing
- Requires a phased plan: which posts move to which dates, and what
  the rationale is for each move
- Cannot be done without founder sign-off on the editorial sequence

**Recommended next step:** founder picks 3-4 posts to re-publish
across a weekly cadence (re-published = updated date + a "Updated
on X" footer noting the revision). Other posts keep their original
date. This is a 1-hour ship per re-published post, spread across
a month.

---

## 4. Newsletter / lead capture on blog posts (User-surface, audit #10)

**Audit finding:** Zero newsletter signup forms on blog posts.
Thousands of monthly organic visits go uncaptured.

**Why deferred:** Requires a provider decision + real list management.

- **Mailchimp / ConvertKit / Loops / Buttondown / SendGrid Marketing
  Campaigns** — pick one. Each has different pricing, deliverability,
  template flexibility, and API surface.
- **Self-hosted via SMTP** — possible but requires building list
  management, double-opt-in, unsubscribe flow, segmentation, send
  scheduling. Multi-week work.
- **First-touch newsletter** — what's the value prop? "One short PDF
  tip per week" needs someone to write the tips. Founder content.

**Recommended next step:** founder picks a provider (1-hour
decision), then I can wire the signup widget on every blog post
template (~30 min ship) + add a backend route that proxies signups
to the provider's list API (~1 hour ship). The provider choice is
the unlock.

---

## Decision matrix

| Item | Blocker | Estimated ship after blocker clears |
|---|---|---|
| Rate-limiter persistence | Infra choice (Redis vs MySQL vs sticky) | Half day after choice |
| Social proof | Real testimonials collected | 30 min |
| Blog dates clumped | Founder editorial plan | 1 hour per post × ~6 posts |
| Newsletter | Provider chosen | ~2 hours total once provider picked |

None of these are stuck waiting on engineering. All four are stuck
on a decision that's appropriately the founder's to make.
