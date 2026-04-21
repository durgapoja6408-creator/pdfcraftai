# Net Margin Roadmap (pdfcraftai)

_Initiative started: 2026-04-22. Owner: Rajasekar Selvam. Planning done by Claude (Cowork)._

## Purpose

The AI observability work shipped in Tier 1–5 (commit `4139098`, 2026-04-21) only measures **AI gross margin** — provider cost as a percentage of a fixed USD revenue proxy (`REFERENCE_USD_MICROS_PER_CREDIT = 30_000`). It does not capture taxes, payment processor fees, FX slippage, infrastructure, refunds, breakage, or promo amortization. This roadmap closes that gap and ships the supporting admin surface required to run the business on real numbers rather than vibes.

## Core philosophy

1. **Quality-constrained cost minimization.** For each AI op we define a measurable quality floor. The router picks the cheapest provider that clears the floor. We never trade user quality for margin.
2. **Admin-only margin visibility.** Users never see provider names, per-op COGS, cost matrix, or margin. Admin sees everything. Hard wall between the two surfaces.
3. **Kill-switch first.** Every new subsystem ships with an env-var kill switch before it goes live, so we can disable in seconds if it misbehaves in production.
4. **Instrument before optimizing.** If a cost line isn't tracked in the schema, it doesn't exist for the margin dashboard. Schema changes precede feature work.
5. **Reversible in one commit.** No change in this roadmap should require more than a revert + redeploy to roll back.

## Out of scope (explicitly not in this roadmap)

- **GST registration + LUT + hiring a CA.** That's real-world paperwork (2–3 weeks, `docs/india/` covers current stance). Code is built with `gstin: null` placeholder so it activates when registration completes.
- **Incorporation (Pvt Ltd).** Separate track; orthogonal to this work.
- **Model fine-tuning / distillation.** 6-month play, not now.
- **Any action that moves money on behalf of the user.** Dunning *retries* the card charge; user-initiated refunds; admin-approved refunds — all fine. Placing trades, sending money, transferring funds on user's behalf — never.

## Phase summary

| Phase | Theme | Tasks | Admin pages | Status |
|------|------|-------|-------------|--------|
| A | Code-only AI cost wins | #10–#14 | `/admin/kill-switches`, `/admin/evals` (scaffold) | planned |
| B | Schema + observability | #15–#19 | 12 admin pages + user dashboard v2 | planned |
| C | Dual-rail payment (Paddle + Razorpay) | #20–#21 | `/admin/refunds`, `/admin/chargebacks`, `/admin/fx`, `/admin/tax` | planned |
| D | UX + policies + legal | #22–#25 | `/admin/plans`, `/admin/promos`, `/admin/compliance`, `/admin/fraud`, `/admin/rate-limits`, `/admin/settings`, `/admin/invoicing` | planned |
| E | Pricing data + prompt infra | #26–#27 | `/admin/prompts` (full), cohort analytics | planned |

Task IDs correspond to the TodoList. Run `TaskList` at the start of every session to see current state and pick up the next unblocked task.

## Completion criteria for the overall initiative

- `/admin/margin` displays **contribution margin** (not AI gross margin) broken down by op, provider, rail, and currency.
- Every credit_ledger row carries `net_revenue_micros` computed from actual Paddle/Razorpay webhook data — no proxies.
- Indian users check out via Razorpay in INR; international via Paddle in USD; user chooses manually if detection is ambiguous.
- Prompt caching is active on Claude calls; cache hit rate tracked on `/admin/ops`.
- Eval harness runs on every deploy and alerts if any op drops below its quality floor.
- Every admin page in `ADMIN_PAGES_CATALOG.md` is shipped or explicitly deferred with a note.
- Every user-facing page has been audited to remove provider/cost/margin leaks (documented in Phase B acceptance).

## How to resume this work after a session wipe

1. Read `CLAUDE.md` (session bootstrap).
2. Read this file (`docs/roadmap/NET_MARGIN_ROADMAP.md`).
3. Read `docs/roadmap/ADMIN_PAGES_CATALOG.md` for the admin-surface plan.
4. Read the current phase's detailed spec (`docs/roadmap/PHASE_{A..E}_*.md`).
5. Run `TaskList` to see state of the TodoList.
6. Pick the lowest unblocked task ID, set status to `in_progress`, start work.
7. When a task completes: run tests, commit, push, mark task `completed`, update the phase doc with commit SHA.

## Index of files in this roadmap

- `NET_MARGIN_ROADMAP.md` (this file) — master plan + philosophy + phase summary.
- `ADMIN_PAGES_CATALOG.md` — every admin page with route, features, data source, permissions, status.
- `PHASE_A_AI_COST_WINS.md` — Anthropic caching, response caps, kill switches, batch API, eval harness.
- `PHASE_B_SCHEMA_OBSERVABILITY.md` — credit_ledger schema, Paddle webhook, infra amortization, admin v2.
- `PHASE_C_DUAL_RAIL.md` — Razorpay adapter, country routing, INR pricing, refund/tax admin.
- `PHASE_D_UX_POLICIES.md` — degradation UX, refunds, dunning, receipts, legal, fraud protection.
- `PHASE_E_PRICING_DATA.md` — prompt registry, A/B testing, annual tier, promo codes, cohort analytics.
