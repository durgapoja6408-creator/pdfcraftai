// lib/promos/actions.ts — server actions for promo code UX.
//
// Task #27 / Phase E.
//
// Four actions split across two audiences:
//
//   User-facing (both callable without admin):
//     - applyPromoCodeAction        — preview-only validator. Takes the
//       code the user typed in the /pricing form and returns the
//       resolved discount envelope. Does NOT write to the DB — the
//       actual stamp-on-payments-row step lives in checkout-actions.
//     - getPromoRedemptionHistoryAction — /app/account history list
//       of promo codes the current signed-in user has redeemed.
//
//   Admin-only (wrapped in requireAdmin):
//     - adminCreatePromoCodeAction  — mint a new code. Generates a UUID
//       id, validates payload shape, enforces the code-is-unique
//       invariant via catch-on-duplicate-key.
//     - adminDisablePromoCodeAction — soft-delete (sets is_active=0,
//       disabled_at=NOW, disabled_by=admin email). Does NOT hard-delete
//       — historical promo_redemptions rows FK back to promo_codes with
//       ON DELETE RESTRICT (migration 0015), so a hard delete would
//       fail anyway, and soft-delete preserves the audit trail.
//
// Why server actions and not API routes:
//   - Server actions give us NextAuth session + CSRF for free.
//   - The return value is a plain JS object, which lets client forms
//     (create-code dialog, apply-code input) show inline validation
//     without building a custom error protocol.
//
// Why not fold the admin actions into /admin/promos/page.tsx:
//   - Pages re-render on every navigation and import every symbol they
//     reference at build time. Keeping the write-path code in a
//     separate "use server" module keeps the page bundle narrow and
//     avoids shipping admin write helpers into any future page that
//     happens to import this file for read helpers.

"use server";

import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { requireAdmin } from "@/lib/admin/guard";
import type { CreditPackId, PackVariant } from "@/lib/pricing";
import {
  listActivePromoCodes,
  resolveAndValidate,
  type PromoCodeRow,
  type PromoResolveResult,
} from "./resolver";

// =====================================================================
// User-facing: preview validator
// =====================================================================

export type ApplyPromoCodeActionResult =
  | {
      ok: true;
      code: string;
      kind: PromoCodeRow["kind"];
      /** Discount in billing-currency micros (0 for bonus_credits). */
      discountMicros: number;
      /** Discount as basis points — handy for UI "-12% off" labels. */
      discountBps: number;
      /** Extra credits granted for bonus_credits kind (0 for money-off). */
      bonusCredits: number;
      /** Campaign attribution, echoed back for /app/account mentions. */
      campaign: string | null;
    }
  | {
      ok: false;
      /**
       * Literal union aligned with PromoResolveResult reasons plus an
       * auth-gate extra. Keeps client-side copy tables flat.
       */
      reason:
        | "not_authenticated"
        | "empty_code"
        | "unknown_code"
        | "inactive"
        | "not_started"
        | "expired"
        | "wrong_currency"
        | "wrong_pack"
        | "wrong_variant"
        | "max_redemptions_reached"
        | "user_limit_reached";
      message: string;
    };

/**
 * Preview-only promo code resolution for the checkout UI.
 *
 * Returns the computed discount envelope WITHOUT writing anything. The
 * client uses this to show "You saved $X" before the user clicks Buy,
 * and checkout-actions re-resolves the code at actual Buy-click time
 * to close the TOCTOU window (operator could disable the code between
 * preview and click).
 *
 * Auth-gated — we don't want unauthenticated traffic burning through
 * the promo resolver. Anonymous sessions get `not_authenticated`; the
 * UI hides the promo field entirely for signed-out users anyway, so
 * this is defense-in-depth rather than a primary gate.
 *
 * Returns a tagged result envelope matching
 * CreateCheckoutResult's shape so the client can reuse one error
 * rendering path for both the preview and the actual checkout.
 */
export async function applyPromoCodeAction(args: {
  code: string;
  packId: CreditPackId;
  currency: "USD" | "INR";
  variant: PackVariant;
  /**
   * Post-variant subtotal in billing-currency MINORS (cents / paise).
   * Client computes via packAmountMinor and passes in so the resolver
   * can return an accurate absolute-discount number for the UI. The
   * server re-computes at checkout time so the client is never trusted
   * for the actual charge amount.
   */
  subtotalMinor: number;
}): Promise<ApplyPromoCodeActionResult> {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;

  if (!userId) {
    return {
      ok: false,
      reason: "not_authenticated",
      message: "Please sign in to apply a promo code.",
    };
  }

  const raw = args.code.trim();
  if (!raw) {
    return {
      ok: false,
      reason: "empty_code",
      message: "Enter a promo code to apply.",
    };
  }

  const result: PromoResolveResult = await resolveAndValidate(raw, {
    userId,
    packId: args.packId,
    currency: args.currency,
    variant: args.variant,
    subtotalMinor: args.subtotalMinor,
  });

  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason,
      message: promoReasonCopy(result.reason),
    };
  }

  return {
    ok: true,
    code: result.code.code,
    kind: result.code.kind,
    discountMicros: result.discountMicros,
    discountBps: result.discountBps,
    bonusCredits: result.bonusCredits,
    campaign: result.code.campaign ?? null,
  };
}

/**
 * Short, user-friendly copy for each rejection reason. Kept in one
 * place so the /pricing UI, /app/account, and checkout-actions return
 * identical strings — no copy drift between surfaces.
 *
 * Deliberately does NOT include the code text in the message — the
 * page renders the failed code in its own row so we avoid concatenating
 * user input into messages (XSS posture).
 */
function promoReasonCopy(
  reason: Exclude<ApplyPromoCodeActionResult, { ok: true }>["reason"]
): string {
  switch (reason) {
    case "not_authenticated":
      return "Please sign in to apply a promo code.";
    case "empty_code":
      return "Enter a promo code to apply.";
    case "unknown_code":
      return "That promo code isn't recognized. Check the spelling and try again.";
    case "inactive":
      return "That promo code is no longer active.";
    case "not_started":
      return "That promo code isn't available yet.";
    case "expired":
      return "That promo code has expired.";
    case "wrong_currency":
      return "That promo code isn't valid for your currency.";
    case "wrong_pack":
      return "That promo code can't be applied to this pack.";
    case "wrong_variant":
      return "That promo code only applies to annual purchases.";
    case "max_redemptions_reached":
      return "That promo code has reached its redemption limit.";
    case "user_limit_reached":
      return "You've already used this promo code the maximum number of times.";
  }
}

// =====================================================================
// User-facing: redemption history
// =====================================================================

export type PromoRedemptionHistoryRow = {
  id: string;
  code: string;
  campaign: string | null;
  kind: PromoCodeRow["kind"];
  discountMicros: number;
  bonusCredits: number;
  currency: string;
  packId: string | null;
  annualVariant: boolean;
  redeemedAt: Date;
};

export type GetPromoRedemptionHistoryResult =
  | { ok: true; rows: PromoRedemptionHistoryRow[] }
  | {
      ok: false;
      reason: "not_authenticated";
      message: string;
    };

/**
 * Read-only fetch of the current user's redeemed promo codes, newest
 * first. Used by /app/account to render a "Promo codes applied"
 * section alongside the existing credit history.
 *
 * Joins `promo_redemptions` → `promo_codes` for the code text +
 * campaign attribution. We don't expose `notes` (free-form internal
 * attribution) or `created_by` (admin email) — those are admin-only.
 *
 * 50-row cap — nobody should have redeemed more than that in practice,
 * and if they did the admin-side view is the better place to browse.
 */
export async function getPromoRedemptionHistoryAction(): Promise<GetPromoRedemptionHistoryResult> {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;

  if (!userId) {
    return {
      ok: false,
      reason: "not_authenticated",
      message: "Please sign in to view your redeemed promo codes.",
    };
  }

  const rows = await db
    .select({
      id: schema.promoRedemptions.id,
      code: schema.promoCodes.code,
      campaign: schema.promoCodes.campaign,
      kind: schema.promoCodes.kind,
      discountMicros: schema.promoRedemptions.discountMicros,
      bonusCredits: schema.promoRedemptions.bonusCredits,
      currency: schema.promoRedemptions.currency,
      packId: schema.promoRedemptions.packId,
      annualVariant: schema.promoRedemptions.annualVariant,
      redeemedAt: schema.promoRedemptions.createdAt,
    })
    .from(schema.promoRedemptions)
    .innerJoin(
      schema.promoCodes,
      eq(schema.promoRedemptions.promoCodeId, schema.promoCodes.id)
    )
    .where(eq(schema.promoRedemptions.userId, userId))
    .orderBy(desc(schema.promoRedemptions.createdAt))
    .limit(50);

  return {
    ok: true,
    rows: rows.map((r) => ({
      id: String(r.id),
      code: String(r.code),
      campaign: r.campaign ? String(r.campaign) : null,
      kind: r.kind as PromoCodeRow["kind"],
      discountMicros: Number(r.discountMicros ?? 0),
      bonusCredits: Number(r.bonusCredits ?? 0),
      currency: String(r.currency),
      packId: r.packId ? String(r.packId) : null,
      annualVariant: Number(r.annualVariant ?? 0) === 1,
      redeemedAt: r.redeemedAt ?? new Date(0),
    })),
  };
}

// =====================================================================
// Admin-only: create code
// =====================================================================

export type AdminCreatePromoCodeInput = {
  code: string; // normalized to uppercase before insert
  kind: "percent" | "flat" | "bonus_credits";
  /**
   * Interpretation depends on kind:
   *   - percent: basis points (1000 = 10%)
   *   - flat: micros of billing-currency (5_000_000 = $5.00 USD or ₹5.00 INR)
   *   - bonus_credits: integer count of extra credits
   */
  value: number;
  currency: "USD" | "INR" | null;
  packIds: string | null; // comma-separated list, or null for all packs
  annualOnly: boolean;
  maxRedemptions: number | null;
  perUserLimit: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  campaign: string | null;
  notes: string | null;
};

export type AdminCreatePromoCodeResult =
  | { ok: true; id: string; code: string }
  | {
      ok: false;
      reason:
        | "invalid_code"
        | "invalid_value"
        | "invalid_dates"
        | "duplicate_code"
        | "db_error";
      message: string;
    };

/**
 * Mint a new promo code. Admin-gated via requireAdmin().
 *
 * Validation (cheap first, DB last):
 *   1. code text — trimmed, uppercased, must be 3..64 chars of
 *      [A-Z0-9_-]. We reject spaces/punctuation to avoid copy-paste
 *      surprises in emails.
 *   2. value — kind-specific range check. percent: 1..10_000 bps.
 *      flat: 1..10_000_000_000 micros (cap = $10,000). bonus_credits:
 *      1..1_000_000.
 *   3. dates — if both are set, starts_at must be <= expires_at.
 *   4. insert — relies on the `UNIQUE (code)` index to detect
 *      duplicates; surfaced as `duplicate_code` so the UI can say
 *      "this code already exists" without leaking whether it's active
 *      or disabled.
 */
export async function adminCreatePromoCodeAction(
  input: AdminCreatePromoCodeInput
): Promise<AdminCreatePromoCodeResult> {
  const { email } = await requireAdmin();

  const normalized = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,64}$/.test(normalized)) {
    return {
      ok: false,
      reason: "invalid_code",
      message:
        "Code must be 3–64 characters, uppercase letters, digits, underscores, or hyphens.",
    };
  }

  if (!Number.isFinite(input.value) || input.value <= 0) {
    return {
      ok: false,
      reason: "invalid_value",
      message: "Value must be a positive number.",
    };
  }

  if (input.kind === "percent") {
    if (input.value > 10_000) {
      return {
        ok: false,
        reason: "invalid_value",
        message:
          "Percent discount is in basis points; 10000 = 100%. Value is above cap.",
      };
    }
  } else if (input.kind === "flat") {
    // 10_000_000_000 micros = 10,000 whole-currency units. A bigger
    // flat promo is almost certainly an operator error (paise vs. rupee
    // confusion); require a code change to exceed.
    if (input.value > 10_000_000_000) {
      return {
        ok: false,
        reason: "invalid_value",
        message:
          "Flat discount is in micros; value exceeds the 10,000-unit safety cap.",
      };
    }
  } else if (input.kind === "bonus_credits") {
    if (input.value > 1_000_000) {
      return {
        ok: false,
        reason: "invalid_value",
        message: "Bonus credits exceeds the 1,000,000 safety cap.",
      };
    }
  }

  if (
    input.startsAt &&
    input.expiresAt &&
    input.startsAt.getTime() > input.expiresAt.getTime()
  ) {
    return {
      ok: false,
      reason: "invalid_dates",
      message: "starts_at must be on or before expires_at.",
    };
  }

  const id = randomUUID();

  try {
    await db.insert(schema.promoCodes).values({
      id,
      code: normalized,
      kind: input.kind,
      value: input.value,
      currency: input.currency,
      packIds: input.packIds,
      annualOnly: input.annualOnly ? 1 : 0,
      maxRedemptions: input.maxRedemptions,
      perUserLimit: input.perUserLimit,
      startsAt: input.startsAt,
      expiresAt: input.expiresAt,
      isActive: 1,
      campaign: input.campaign,
      notes: input.notes,
      createdBy: email,
    });

    return { ok: true, id, code: normalized };
  } catch (err: unknown) {
    if (isDuplicateKeyError(err)) {
      return {
        ok: false,
        reason: "duplicate_code",
        message: `A promo code "${normalized}" already exists.`,
      };
    }
    console.error("[promos] adminCreatePromoCodeAction failed:", err);
    return {
      ok: false,
      reason: "db_error",
      message: "Could not create promo code. Check server logs.",
    };
  }
}

// =====================================================================
// Admin-only: disable code
// =====================================================================

export type AdminDisablePromoCodeResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "not_found" | "already_disabled" | "db_error";
      message: string;
    };

/**
 * Soft-delete a promo code.
 *
 * Flips is_active to 0 and stamps (disabled_at, disabled_by) for the
 * audit trail. Existing promo_redemptions rows keep their FK — queries
 * that count historical redemptions still resolve the code.
 *
 * Idempotent-ish: if the code is already disabled we return
 * `already_disabled` rather than silently succeeding, so operators
 * don't accidentally assume a new disable happened (useful when two
 * admins race).
 */
export async function adminDisablePromoCodeAction(args: {
  id: string;
}): Promise<AdminDisablePromoCodeResult> {
  const { email } = await requireAdmin();

  // Fetch current state so we can distinguish not-found from
  // already-disabled. Cheap single-row lookup on the PK.
  const [row] = await db
    .select({ id: schema.promoCodes.id, isActive: schema.promoCodes.isActive })
    .from(schema.promoCodes)
    .where(eq(schema.promoCodes.id, args.id))
    .limit(1);

  if (!row) {
    return {
      ok: false,
      reason: "not_found",
      message: "That promo code no longer exists.",
    };
  }

  if (Number(row.isActive) === 0) {
    return {
      ok: false,
      reason: "already_disabled",
      message: "That promo code is already disabled.",
    };
  }

  try {
    await db
      .update(schema.promoCodes)
      .set({
        isActive: 0,
        disabledAt: new Date(),
        disabledBy: email,
      })
      .where(
        and(
          eq(schema.promoCodes.id, args.id),
          // Guard against a concurrent disable racing us — if isActive
          // flipped to 0 between our read and this write, rowsAffected
          // will be 0 and we return already_disabled.
          eq(schema.promoCodes.isActive, 1)
        )
      );

    return { ok: true, id: args.id };
  } catch (err) {
    console.error("[promos] adminDisablePromoCodeAction failed:", err);
    return {
      ok: false,
      reason: "db_error",
      message: "Could not disable promo code. Check server logs.",
    };
  }
}

// =====================================================================
// Admin-only: read (used by /admin/promos page via direct call)
// =====================================================================

/**
 * Re-export of listActivePromoCodes gated through requireAdmin, so the
 * /admin/promos page can call one server action rather than importing
 * the resolver directly. Keeps "admin-gated reads" explicit.
 */
export async function adminListActivePromoCodesAction(opts?: {
  limit?: number;
}): Promise<PromoCodeRow[]> {
  await requireAdmin();
  return listActivePromoCodes(opts ?? {});
}

// =====================================================================
// Helpers
// =====================================================================

function isDuplicateKeyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; errno?: number };
  return e.code === "ER_DUP_ENTRY" || e.errno === 1062;
}
