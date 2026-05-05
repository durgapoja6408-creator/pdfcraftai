# Next session — pick up here

**Updated 2026-05-04 late-night (latest live commit `36821aa`).**
Multi-day arc complete. Production observability rollout 100% done.
**FeedbackChip rollout structurally complete on AI-using component
side: 19/19 wired** (Stage 3 batches A + B + C all closed). PENDING
§11a (webhook audit ordering), §4c (dunning persistence foundation),
§6c (per-user quality-signal foundation), and §2a/§2b (Slack alert
helper foundation) all closed in this arc.

**Status snapshot:**
- Latest live commit: `36821aa` (Operational Slack alert helper —
  PENDING §2a + §2b foundation; codebase's first dynamic-execution
  CI guard)
- Last code-bearing deploy: same
- Aggregator: **5161/5161 tests passing across 89 suites** in ~5.4s
- `tsc --noEmit` exit 0
- 21 cascade events survived; recovery playbook holds; the last 3
  foundation-pattern commits (`81087df`, `36821aa`) all deployed
  CLEAN, suggesting foundation commits without migrations are
  consistently cgroup-safe
- Production: all systems active, all 10 AI ops audited, /admin/margin
  sees 100% of fleet, /admin/ai-feedback collects ↑/↓ across all
  19 AI-using component surfaces, /admin/quality-signals derives
  per-user trailing-thumbs-down streaks from accumulated chip data,
  /admin/dunning ready for Phase E, lib/ops/slack-alert.ts ready
  for SLACK_OPS_WEBHOOK_URL env var (founder action — when set,
  every consumer goes from no-op to live simultaneously)

## Read first

1. `CLAUDE.md` — bootstrap (credentials + infra)
2. `docs/STATUS.md` — running timeline (most recent at top)
3. `docs/SESSION_2026-05-04_RETROSPECTIVE.md` §9 — full arc summary
   (24-commit observability + chip rollout; cascade-pattern data;
   hypothesis revisions; recovery playbook validation)
4. `docs/PENDING_WORK_ANALYSIS.md` — full forward-looking audit;
   §11a marked ✅ FIXED in this arc

## What's left (ranked by ratio of impact to cascade risk)

### Tier 1 — small + cascade-friendly (any session)

| Item | Estimate | Why now |
|---|---|---|
| ~~Generate FeedbackChip wire-up~~ | ~~~30 min~~ | ✅ DONE (commit `94db9e1`). 9/10 milestone. |
| ~~Chat FeedbackChip wire-up~~ | ~~~30 min~~ | ✅ DONE (commit `cb013ab`). 10/10 milestone. Stage 3 batch A closed. |
| ~~`lib/payments/dunning.ts` orphaned TODO (PENDING §4c)~~ | ~~~2 hours~~ | ✅ DONE (commit `76a0c82`). Migration 0023, persist helpers, /admin/dunning viewer, 59-assertion CI guard. Empty table by design until Phase E wires the webhook handler. |
| Slack alerting verification (PENDING §2a) | 30 min user-action + ~30 min Claude follow-up | ✅ **HELPER FOUNDATION SHIPPED** (commit `36821aa`). `lib/ops/slack-alert.ts` consolidates the env-var read + payload format + never-throws fetch wrapper. Founder action: create webhook → set `SLACK_OPS_WEBHOOK_URL` in Hostinger panel → "Save and redeploy". Once env var lands, follow-up Claude commit migrates `lib/ai/margin-rollup.ts`'s inline read to call `sendSlackAlert()` (1-file diff). |

### Tier 2 — medium (next arc)

| Item | Estimate | Why later |
|---|---|---|
| ~~Stage 3 Batch B chip rollout (SummarizeVariantTool family)~~ | ~~~1 day~~ | ✅ DONE (commit `cda2eae`). 4 shared variant runners → ~36 depth variants get the chip via shared component. |
| ~~Stage 3 Batch C chip rollout (specialist + tail tools)~~ | ~~~2 days~~ | ✅ DONE (commit `2a459f3`). 5 specialist tools wired. Original "blocked on route instrumentation" framing was wrong — all 5 already route through instrumented endpoints. **WIRED_TOOLS now 19/19 = 100% on AI-using components.** |
| ~~Per-user negative feedback signal (PENDING §6c)~~ | ~~~1 week~~ | ✅ FOUNDATION SHIPPED (commit `81087df`). Pure classifier + read helpers + /admin/quality-signals viewer. Auto-routing wire-up gated on 1-2 weeks of accumulated chip data to confirm the (2, 4) thresholds aren't producing too many false positives. |
| Mobile UI hardening (PENDING §5f / T1-4) | 3-5 days | Playwright mobile spec across the 13 visual editors. Fix touch behavior issues. ~40% of typical PDF tool traffic is mobile. |

### Tier 3 — large (multi-week)

| Item | Estimate | Notes |
|---|---|---|
| Real PDF Compress (PENDING T2-1 / §5a) | ~5 days | Server-side qpdf + ghostscript pipeline. Closes the bait-and-switch gap fully. Run as 5-credit AI op since it needs server compute. |
| PDF/A converter (PENDING §5b) | 3-4 days | Server-side ghostscript or qpdf. Real demand from compliance/archival users. |
| Edit Text in PDFs (PENDING §5c) | 2-3 weeks | Significant — pdf-lib doesn't support text editing in existing pages. Apache PDFBox Java sidecar OR deeper PDFium. |
| OCR-then-searchable workflow (PENDING §5d) | 1 week | Combine ai-ocr + ai-searchable-pdf into a unified flow. |
| Bulk processing (PENDING T3-1 / §5e) | 2-3 weeks | ZIP upload OR multi-select with shared config + background job processing + per-file results table. |

### User-action / external-vendor blocked

| Item | Owner | Notes |
|---|---|---|
| GST invoice generation (PENDING §1a) | Founder + CA | 3-5 days when CA reviews HSN code 998313. Required for Indian B2B procurement; below ₹40-lakh threshold today so not urgent. |
| EU VAT path (PENDING §1b) | Paddle KYC clearance | Adapter scaffolded at lib/payments/adapters/paddle.ts. Once Paddle KYC clears, MoR absorbs VAT calculation + remittance. |
| US sales-tax-nexus (PENDING §1c) | Paddle MoR | Same path as EU VAT — Paddle covers it. |
| SOC 2 Type II audit (PENDING §1g) | Founder + auditor | $5k-15k/yr; trigger condition: ARR > $200k OR first enterprise prospect asks. |

## Cascade discipline reminders

The 2026-05-04 arc validated the recovery playbook across 18
cascade events. Three concrete rules going forward:

1. **One pkick max per deploy cycle.** If `pkill -9 -f "next-server"`
   doesn't recover within 60s, escalate to documented
   `ps -fu | grep next-server | awk '{print $2}' | xargs kill -KILL`
   pattern (cascade #13 lesson, validated in #15-#18).

2. **SSH fork-saturation: STOP and wait.** When `bash: fork: retry`
   appears, EVERY reconnect attempt compounds the cgroup pressure.
   Wait 5-10 min for kernel drain; can extend to 25 min in
   worst-case (cascade #18). Don't poll, just wait.

3. **Auto-pull jams clear via empty-commit nudge.** 10/10 jams
   resolved this way. Multiple commits queued behind a jam can
   pile up; auto-pull eventually pulls latest main (commit-by-
   commit semantics not observed). If multiple nudges don't
   work, wait 5+ min — Hostinger may rate-limit auto-pull on
   rapid-fire commit chains.

## Codebase health

The infrastructure groundwork is structurally complete on these axes:

- **Compliance:** SECURITY_COMPLIANCE_AUDIT.md attests to refund/CSP/
  abuse-stack/DPDP/Razorpay merchant requirements all PASS. Cookie
  banner equal-prominence shipped (GDPR dark-pattern fix).
- **Observability:** 100% AI usage instrumentation; per-op error
  rates measurable; /admin/margin sees full fleet.
- **Data flywheel:** ai_feedback table + persist endpoint + admin
  viewer; **10/10 high-traffic AI tools** collect thumbs ↑/↓ with
  full provenance (Stage 3 batch A closed). Stage 3 batches B + C
  remain pending (43 lower-traffic tools — variants + specialist +
  tail).
- **Resilience:** Webhook audit-after-process (§11a fix); reconcile
  sweep + ledger-layer idempotency forms a 2-layer safety net.
- **Lead capture:** /enterprise sales intake + /admin/contact-
  submissions reader. SendGrid/Postmark wire-up still pending
  (founder decision).

## Hypothesis tracker (open questions for future arcs)

1. **Cascade frequency vs. commit scope** — initial hypothesis was
   small commits cascade less. Disproven by cascade #14 (doc-only)
   and weakly held by cascade #18 (3-file). Dominant factor seems
   to be Hostinger plan cgroup pressure at push time. Worth
   tracking across the next 10 cascades for a real signal.

2. **Auto-pull rate-limit threshold** — cascade #16 + jam #10 needed
   3 nudges across 6 queued commits. Suggests Hostinger may rate-
   limit when the queue backs up. Worth instrumenting if it
   recurs.

3. **Recovery time normalization** — cascade #18 took 50 min
   (worst-case); typical is 5-15 min. Whether this correlates with
   time-of-day, cgroup neighbour load, or Hostinger plan tier is
   unclear. Worth logging cascade timestamps + recovery durations.

## Things NOT to do without a clear reason

- **Don't pkick twice within 60 seconds.** Cgroup saturation cascades
  worse than the original incident. Cascade #18 lesson reinforced.
- **Don't push 5+ commits in rapid sequence.** Auto-pull may rate-
  limit and queue them all. Wait for one to deploy before pushing
  the next. (Cascade #16 / jam #10 evidence.)
- **Don't add per-call dollar values to user-facing copy.** The
  `no-credit-number-hardcodes` guard exists for a reason — credits
  are the unit users see; rupees only at /buy.
- **Don't undo the PDFium WASM API route.** `lib/pdf/library.ts`
  routes through `/api/pdfium-wasm` because the static file gets
  served as `text/plain` by LiteSpeed/Passenger regardless of
  next.config.mjs `headers()` or `.htaccess` directives. Reverting
  to `wasmUrl: "/pdfium.wasm"` breaks PDFium-backed tools silently.
  See CLAUDE.md §5 "Static `/public/*.wasm` files".

## Quick health check before any work

```bash
cd /sessions/gifted-funny-franklin/pdfcraftai-work
npx tsc --noEmit                                # exit 0?
node scripts/run-all-tests.mjs 2>&1 | tail -3   # 5161/0 across 89?
curl -s https://pdfcraftai.com/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['commit'], d['uptimeSec'])"
```

If any of these fail, READ STATUS.md tail before doing anything else
— the cascade may be in flight.
