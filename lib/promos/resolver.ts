// lib/promos/resolver.ts — promo code lookup, validation, and discount math.
//
// Task #27 / Phase E.
//
// Responsibilities
// ----------------
// This module is the single source of truth for answering three
// questions at checkout time:
//
//   1. Does `CODE_USER_TYPED` exist and is it redeemable right now?
//      (resolvePromoCode + validatePromoCode)
//
//   2. For a given pack + currency + variant, what absolute discount
//      does the code produce? (computePromoDiscount)
//
//   3. Has this specific user already hit their per-user redemption
//      limit for this code? (countUserRedemptions)
//
// By centralizing all three here we keep the checkout action's code
// path narrow — it calls `resolveAndValidate(code, userId, packId,
// currency, variant)` and gets back a tagged union of "apply this
// discount" or "reject with reason X". The admin routes, the test
// harness, and any future /app/account redemption preview all share
// the same code path.
//
// What this module does NOT do
// -----------------------------
// - Write promo_redemptions rows. That's the webhook-capture side of
//   the flow (lib/payments/ledger.ts or a new lib/promos/record.ts
//   hook), because a row here would inflate counts from abandoned
//   pending payments.
// - Create or edit promo_codes rows. That's admin-only via
//   lib/promos/actions.ts with requireAdmin() around it.
// - Enforce max_redemptions across concurrent checkouts (no
//   SELECT-FOR-UPDATE). At our volume (~handful of campaigns,
//   max ~1000 redemptions each), the race window is tiny; we
//   accept that the last 0–3 redemptions of a capped code may
//   exceed the cap under heavy concurrent load, and reconcile at
//   /admin/promos review time. If we ever run a "first 10 users"
//   code where strict enforcement matters, we add a transaction
//   here.

import { and, eq, gt, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { CreditPackId, PackVariant } from "@/lib/pricing";

// --- Types ---------------------------------------------------------------

/**
 * Shape of a promo_codes row in application land. Strips MySQL-specific
 * bits and makes `kind` a strict union for exhaustiveness checks.
 */
export type PromoCodeRow = {
  id: string;
  code: string;
  kind: "percent" | "flat" | "bonus_credits";
  /** Basis points for "percent"; micros for "flat"; credits for "bonus_credits". */
  value: number;
  currency: "USD" | "INR" | null;
  /** Comma-separated pack IDs the code is valid for; null = any pack. */
  packIds: string | null;
  /** 1 = annual-only, 0 = monthly or annual. */
  annualOnly: number;
  maxRedemptions: number | null;
  perUserLimit: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  /** 1 = active, 0 = soft-deleted (via admin Disable action). */
  isActive: number;
  campaign: string | null;
};

/**
 * Result of resolving + validating a user-entered code.
 *
 * Discriminated union — the three shapes are:
 *   - `ok: true`                  : the code applies; fields describe
 *                                    the computed discount to stamp on
 *                                    the payment row.
 *   - `ok: false, reason: ...`    : the code was found but isn't
 *                                    usable right now. The `reason`
 *                                    tag drives user-facing copy in
 *                                    checkout-actions' return envelope.
 *   - `ok: false, reason: "unknown_code"` : no matching code found.
 */
export type PromoResolveResult =
  | {
      ok: true;
      code: PromoCodeRow;
      /** Absolute money discount in billing-currency micros (0 for bonus_credits). */
      discountMicros: number;
      /** Absolute money discount as a % — basis points. Informational; UI-friendly. */
      discountBps: number;
      /** Credits to grant at webhook-capture time (0 for money-off codes). */
      bonusCredits: number;
    }
  | {
      ok: false;
      reason:
        | "unknown_code"
        | "inactive"
        | "not_started"
        | "expired"
        | "wrong_currency"
        | "wrong_pack"
        | "wrong_variant"
        | "max_redemptions_reached"
        | "user_limit_reached";
    };

// --- Lookup --------------------------------------------------------------

/**
 * Fetch a promo_codes row by user-typed code.
 *
 * Normalization:
 *   - trim leading/trailing whitespace
 *   - uppercase (the unique index on code uses case-insensitive
 *     collation utf8mb4_unicode_ci, but callers may compare the code
 *     string later and we want a canonical form)
 *
 * Returns `null` if nothing matches. Does NOT filter on is_active or
 * expiresAt — that's validatePromoCode's job, so the admin preview
 * flow can call resolvePromoCode and see the exact state of a
 * soft-disabled / expired code.
 */
export async function resolvePromoCode(
  rawCode: string
): Promise<PromoCodeRow | null> {
  const normalized = rawCode.trim().toUpperCase();
  if (!normalized) return null;

  const rows = await db
    .select()
    .from(schema.promoCodes)
    .where(eq(schema.promoCodes.code, normalized))
    .limit(1);

  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    code: r.code,
    kind: r.kind as PromoCodeRow["kind"],
    value: Number(r.value),
    currency: (r.currency as PromoCodeRow["currency"]) ?? null,
    packIds: r.packIds ?? null,
    annualOnly: Number(r.annualOnly ?? 0),
    maxRedemptions: r.maxRedemptions ?? null,
    perUserLimit: r.perUserLimit ?? null,
    startsAt: r.startsAt ?? null,
    expiresAt: r.expiresAt ?? null,
    isActive: Number(r.isActive ?? 1),
    campaign: r.campaign ?? null,
  };
}

// --- Count queries (for validation) --------------------------------------

/**
 * How many TOTAL successful redemptions has this code seen?
 *
 * Queries promo_redemptions (not payments.promo_code_id) — the
 * redemption row is written at webhook-capture time, so this count
 * reflects money that actually landed, not checkouts that started.
 */
export async function countTotalRedemptions(
  promoCodeId: string
): Promise<number> {
  const result = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.promoRedemptions)
    .where(eq(schema.promoRedemptions.promoCodeId, promoCodeId));
  return Number(result[0]?.n ?? 0);
}

/**
 * How many times has THIS user redeemed this code?
 *
 * Hits the composite (promo_code_id, user_id) index added in
 * migration 0015.
 */
export async function countUserRedemptions(
  promoCodeId: string,
  userId: string
): Promise<number> {
  const result = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.promoRedemptions)
    .where(
      and(
        eq(schema.promoRedemptions.promoCodeId, promoCodeId),
        eq(schema.promoRedemptions.userId, userId)
      )
    );
  return Number(result[0]?.n ?? 0);
}

// --- Validation ----------------------------------------------------------

/**
 * Run every gate on a promo code and return a resolved envelope.
 *
 * Order of checks is intentional — cheap in-memory gates first
 * (active / window / currency / pack / variant), DB count queries
 * last (max + per-user). If any cheap gate fails we don't issue the
 * count queries at all.
 *
 * `now` is injectable for deterministic testing (the harness passes
 * a fixed date). Production callers pass `undefined` and we use the
 * real clock.
 */
export async function validatePromoCode(
  code: PromoCodeRow,
  context: {
    userId: string;
    packId: CreditPackId;
    currency: "USD" | "INR";
    variant: PackVariant;
    subtotalMinor: number;
    now?: Date;
  }
): Promise<PromoResolveResult> {
  const now = context.now ?? new Date();

  // Gate 1: is the code active?
  if (code.isActive !== 1) {
    return { ok: false, reason: "inactive" };
  }

  // Gate 2: has the starts_at window opened?
  if (code.startsAt && now.getTime() < code.startsAt.getTime()) {
    return { ok: false, reason: "not_started" };
  }

  // Gate 3: has the expires_at window closed?
  if (code.expiresAt && now.getTime() > code.expiresAt.getTime()) {
    return { ok: false, reason: "expired" };
  }

  // Gate 4: currency scope.
  if (code.currency && code.currency !== context.currency) {
    return { ok: false, reason: "wrong_currency" };
  }

  // Gate 5: pack scope (comma-separated whitelist).
  if (code.packIds) {
    const allowed = code.packIds.split(",").map((s) => s.trim());
    if (!allowed.includes(context.packId)) {
      return { ok: false, reason: "wrong_pack" };
    }
  }

  // Gate 6: annual-only.
  if (code.annualOnly === 1 && context.variant !== "annual") {
    return { ok: false, reason: "wrong_variant" };
  }

  // Gate 7: max_redemptions. Hits DB.
  if (code.maxRedemptions !== null) {
    const total = await countTotalRedemptions(code.id);
    if (total >= code.maxRedemptions) {
      return { ok: false, reason: "max_redemptions_reached" };
    }
  }

  // Gate 8: per_user_limit. Hits DB.
  if (code.perUserLimit !== null) {
    const forUser = await countUserRedemptions(code.id, context.userId);
    if (forUser >= code.perUserLimit) {
      return { ok: false, reason: "user_limit_reached" };
    }
  }

  // All gates passed — compute the discount.
  const { discountMicros, discountBps, bonusCredits } = computePromoDiscount(
    code,
    context.subtotalMinor
  );

  return {
    ok: true,
    code,
    discountMicros,
    discountBps,
    bonusCredits,
  };
}

/**
 * Compute the absolute discount for a validated code against a given
 * subtotal (in billing-currency MINORS — cents/paise, not micros).
 *
 * Returns all three shape parameters regardless of kind — the two
 * that don't apply for a given kind return 0 (and the caller picks
 * the non-zero one). This keeps the return shape stable for
 * downstream typing.
 *
 *   - percent       → discountMicros = (subtotalMinor × value_bps /
 *                     10_000) × 10_000 (minors→micros conversion),
 *                     discountBps = value, bonusCredits = 0
 *   - flat          → discountMicros = value (already micros),
 *                     discountBps = approx of money/subtotal,
 *                     bonusCredits = 0
 *   - bonus_credits → discountMicros = 0, discountBps = 0,
 *                     bonusCredits = value
 *
 * For "flat" codes: if `value` exceeds the subtotal, we floor at the
 * subtotal (100% off, not a negative balance). Same behaviour as
 * packAmountMinor's Math.max(0, ...) clamp.
 */
export function computePromoDiscount(
  code: PromoCodeRow,
  subtotalMinor: number
): { discountMicros: number; discountBps: number; bonusCredits: number } {
  if (code.kind === "percent") {
    const minor = Math.floor((subtotalMinor * code.value) / 10_000);
    const micros = minor * 10_000;
    return {
      discountMicros: micros,
      discountBps: code.value,
      bonusCredits: 0,
    };
  }

  if (code.kind === "flat") {
    const subtotalMicros = subtotalMinor * 10_000;
    const micros = Math.min(code.value, subtotalMicros);
    const bps =
      subtotalMicros === 0 ? 0 : Math.floor((micros / subtotalMicros) * 10_000);
    return {
      discountMicros: micros,
      discountBps: bps,
      bonusCredits: 0,
    };
  }

  // bonus_credits
  return {
    discountMicros: 0,
    discountBps: 0,
    bonusCredits: code.value,
  };
}

// --- Combined convenience ------------------------------------------------

/**
 * One-shot lookup + validation. Used by lib/payments/checkout-actions
 * and the /app/account preview endpoint.
 *
 * Returns `{ ok: false, reason: "unknown_code" }` if the code text
 * doesn't resolve, else passes through whatever validatePromoCode
 * decides.
 */
export async function resolveAndValidate(
  rawCode: string,
  context: {
    userId: string;
    packId: CreditPackId;
    currency: "USD" | "INR";
    variant: PackVariant;
    subtotalMinor: number;
    now?: Date;
  }
): Promise<PromoResolveResult> {
  const code = await resolvePromoCode(rawCode);
  if (!code) return { ok: false, reason: "unknown_code" };
  return validatePromoCode(code, context);
}

/**
 * List all currently-valid promo codes (for /admin/promos inventory).
 *
 * Filters by isActive=1 AND (expires_at IS NULL OR expires_at > NOW()).
 * Does NOT filter on starts_at because an operator browsing the
 * admin page wants to see upcoming codes too. Returns them ordered
 * by created_at DESC so newest campaigns are on top.
 *
 * Limit is clamped to 500 — the admin page paginates beyond that but
 * we never want a single query to materialize thousands of rows.
 */
export async function listActivePromoCodes(
  opts: { limit?: number; now?: Date } = {}
): Promise<PromoCodeRow[]> {
  const limit = Math.min(500, Math.max(1, opts.limit ?? 100));
  const now = opts.now ?? new Date();

  const rows = await db
    .select()
    .from(schema.promoCodes)
    .where(
      and(
        eq(schema.promoCodes.isActive, 1),
        or(
          isNull(schema.promoCodes.expiresAt),
          gt(schema.promoCodes.expiresAt, now)
        )
      )
    )
    .orderBy(sql`${schema.promoCodes.createdAt} DESC`)
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    kind: r.kind as PromoCodeRow["kind"],
    value: Number(r.value),
    currency: (r.currency as PromoCodeRow["currency"]) ?? null,
    packIds: r.packIds ?? null,
    annualOnly: Number(r.annualOnly ?? 0),
    maxRedemptions: r.maxRedemptions ?? null,
    perUserLimit: r.perUserLimit ?? null,
    startsAt: r.startsAt ?? null,
    expiresAt: r.expiresAt ?? null,
    isActive: Number(r.isActive ?? 1),
    campaign: r.campaign ?? null,
  }));
}

/**
 * Silence the eslint "imported but unused" check on drizzle operators
 * that aren't used in this file but are required when future callers
 * want the same import surface.
 */
export const _unused = { lte, isNotNull };
