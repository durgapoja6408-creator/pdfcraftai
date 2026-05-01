// Server actions for the checkout UI.
//
// Responsibilities split between this file and the provider adapters:
//   - This file: owns the DB lifecycle of a `payments` row. Mints the
//     internal UUID, writes "pending" state, attaches the providerRef
//     returned by the adapter, and hands the browser-safe `CheckoutSession`
//     back to the React client.
//   - Adapters: own the provider-side call. They never write to our DB —
//     the webhook + reconciliation path is what promotes a row from
//     "pending" to "captured".
//
// Why a server action (not a route handler)?
//   - Server actions give us built-in CSRF protection and inline form
//     semantics, which is exactly what a "Buy pack" button needs.
//   - The return value is a plain JS object — we can send the
//     `CheckoutSession` back to the client component without serializing
//     through JSON headers or building our own envelope.
//
// Security:
//   - Auth is enforced inside the action, not at the Next.js middleware
//     layer, because /pricing is a public marketing page. Anonymous users
//     clicking "Buy" get redirected to /login?returnTo=/pricing.
//   - `preferredProviderId` is trusted only to the extent that the
//     registry filters it against configured + currency-eligible
//     providers. A hostile client can't force-route through a provider
//     that isn't configured.
//
// Phase C / Task #20 — Dual-rail auto-routing:
//   - Every call consults `routeCheckoutByCountry(CF-IPCountry)` before
//     picking a provider. Tier 3 sanctioned → block. Tier 2 deferred →
//     defer (UI shows launch-notify signup). Tier 1 → route through the
//     rail the policy doc names (razorpay for IN; international rail
//     currently empty, all non-IN traffic falls through to "defer").
//     CF "XX"/"T1"/missing → unknown (UI asks user to pick their
//     country manually).
//   - `preferredProviderId` remains honored — an explicit user click on
//     "Pay with X" or a test harness override wins over auto-route. The
//     registry still filters it against configured + currency-eligible
//     providers, so a hostile override to a provider that can't serve
//     the geo-picked currency fails closed with `provider_error`.
//   - Billing currency is derived from the route decision: IN → INR,
//     others → USD. Pack price is converted via `packAmountMinor` —
//     display-time approximation until Task #27 lands the per-pack INR
//     pricing table.

"use server";

import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import {
  CREDIT_PACKS,
  packAmountMinor,
  type CreditPackId,
  type PackVariant,
} from "@/lib/pricing";
import { resolveAndValidate } from "@/lib/promos/resolver";
import { selectProvider, listConfiguredProviderIds } from "./registry";
import {
  routeCheckoutByCountry,
  readCountryHeader,
  type RouteDecision,
} from "./router";
import type { CheckoutSession, Currency, ProviderId } from "./types";

export type CreateCheckoutResult =
  | {
      ok: true;
      internalPaymentId: string;
      providerRef: string;
      providerId: ProviderId;
      session: CheckoutSession;
      /**
       * The geo decision that shaped this checkout. Echoed back so the
       * client can render "Paying in INR via Razorpay" affordances and so
       * the analytics layer can log which rail served the purchase.
       * Always present on `ok: true` — a successful checkout necessarily
       * resolved a Tier-1 route decision.
       */
      route: {
        country: string;
        rail: ProviderId;
        currency: Currency;
        /** true → the caller passed `preferredProviderId` and it won. */
        overrode: boolean;
      };
      /**
       * Task #27 / Phase E — promo + variant echo for the client receipt
       * view. Always present; `promo` is null when no code was applied.
       * `amountMinor` reflects the final post-discount, post-variant
       * charge — the number actually handed to the provider.
       */
      checkout: {
        variant: PackVariant;
        amountMinor: number;
        promo: {
          code: string;
          kind: "percent" | "flat" | "bonus_credits";
          discountMicros: number;
          bonusCredits: number;
        } | null;
      };
    }
  | {
      ok: false;
      error:
        | "not_authenticated"
        | "unknown_pack"
        | "no_provider_configured"
        | "provider_error"
        /**
         * Promo code was provided but the resolver rejected it. The
         * `promoReason` field carries the granular reason string from
         * `PromoResolveResult` so the UI can render targeted copy
         * (expired vs. wrong-currency vs. user-limit-reached).
         */
        | "promo_invalid"
        /**
         * Tier-2 country (EU, CH, EEA, CN/RU/BY). The UI should show the
         * launch-notify signup (components/geo/DeferredRegionNotify) and
         * POST to /api/geo/waitlist with reason="tier2_deferred".
         */
        | "geo_deferred"
        /**
         * Tier-3 country (IR/SY/KP/CU, OFAC comprehensive sanctions). The
         * UI should render a minimal HTTP-451 "unavailable for legal
         * reasons" message — no waitlist, no contact form.
         */
        | "geo_blocked"
        /**
         * CF-IPCountry missing / "XX" / "T1". The UI should prompt the
         * user to select their country manually, then retry with the
         * selected country echoed as `countryOverride`.
         */
        | "geo_unknown";
      message: string;
      /**
       * Country code the router saw (normalized to uppercase). Omitted
       * for non-geo errors. For `geo_unknown` this is null (we didn't
       * receive a usable code).
       */
      country?: string | null;
      /**
       * Granular rejection reason from the promo resolver. Present only
       * when `error === "promo_invalid"`. Mirrors PromoResolveResult's
       * reason union so the client can copy-map without pulling the
       * resolver module into its bundle.
       */
      promoReason?:
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

/**
 * Mint a checkout session for a one-time credit pack.
 *
 * Call flow:
 *   1. Verify the user is signed in. (Anon → /login redirect.)
 *   2. Resolve the pack from CREDIT_PACKS; bail if unknown.
 *   3. Read CF-IPCountry and call `routeCheckoutByCountry`. Bail on
 *      defer / block / unknown (surfaced as distinct error codes so the
 *      UI can pick the right copy).
 *   4. Pick a provider via the registry. The caller's
 *      `preferredProviderId` wins over the router's `decision.rail` if
 *      present (manual user override). Otherwise the router's `rail` is
 *      the preferred ID and the billing currency follows the decision.
 *   5. INSERT a `payments` row in "pending" with a fresh UUID plus the
 *      route decision stamped into metadata for the audit trail.
 *   6. Call `provider.createCheckout`. On success, UPDATE the row with
 *      the providerRef. On failure, mark the row "failed" (still useful
 *      for the audit trail — shows attempted-but-not-started checkouts).
 *   7. Return the `CheckoutSession` shape the client component uses to
 *      load the SDK or redirect.
 */
export async function createCheckoutAction(args: {
  packId: CreditPackId;
  preferredProviderId?: ProviderId;
  /**
   * If the UI captured a manual country (after a `geo_unknown` retry),
   * pass it here and the router reuses it in place of the CF header.
   * Must be an ISO-3166-1 alpha-2 code; the router validates.
   */
  countryOverride?: string;
  /**
   * Task #27 / Phase E — pack variant. "monthly" keeps the legacy
   * one-month-of-credits behaviour; "annual" multiplies credits by
   * 12 and applies a 20% price discount (ANNUAL_DISCOUNT_BPS). Omit
   * for the default "monthly" variant.
   */
  variant?: PackVariant;
  /**
   * Task #27 / Phase E — optional promo code. Resolver runs at
   * checkout-init time, discount is baked into the amount handed to
   * the provider, and the resolved envelope is stamped on the
   * payments row so the webhook-capture hook can write the
   * promo_redemptions audit row. Omitted / empty string = no promo.
   */
  promoCode?: string;
}): Promise<CreateCheckoutResult> {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;

  if (!userId) {
    return {
      ok: false,
      error: "not_authenticated",
      message: "Please sign in before purchasing credits.",
    };
  }

  const pack = CREDIT_PACKS.find((p) => p.id === args.packId);
  if (!pack) {
    return {
      ok: false,
      error: "unknown_pack",
      message: `Unknown pack: ${args.packId}`,
    };
  }

  // Step 3: route by geo. `countryOverride` wins over CF header so the
  // "pick your country" fallback UI doesn't have to forge an x-forwarded
  // header to get through the router.
  const h = headers();
  const rawCountry =
    typeof args.countryOverride === "string" && args.countryOverride.trim()
      ? args.countryOverride
      : readCountryHeader(h);
  const decision: RouteDecision = routeCheckoutByCountry(rawCountry);

  if (decision.action === "block") {
    return {
      ok: false,
      error: "geo_blocked",
      message:
        "Checkout is not available in your region due to international trade restrictions.",
      country: decision.country,
    };
  }

  if (decision.action === "defer") {
    return {
      ok: false,
      error: "geo_deferred",
      message:
        "We haven't launched paid checkout in your country yet. Leave your email and we'll notify you when we do.",
      country: decision.country,
    };
  }

  if (decision.action === "unknown") {
    return {
      ok: false,
      error: "geo_unknown",
      message:
        "We couldn't detect your country. Please pick it from the list and try again.",
      country: null,
    };
  }

  // decision.action === "route" from here on — TypeScript narrows.
  // Honor caller override if provided, else default to the router's rail.
  const overrode = args.preferredProviderId !== undefined;
  const chosenRail: ProviderId = overrode
    ? args.preferredProviderId!
    : decision.rail;
  const chosenCurrency: Currency = decision.currency;

  const provider = await selectProvider({
    currency: chosenCurrency,
    mode: "one_time",
    preferredId: chosenRail,
  });

  if (!provider) {
    return {
      ok: false,
      error: "no_provider_configured",
      message:
        "Checkout is temporarily unavailable. Please try again in a few minutes.",
      country: decision.country,
    };
  }

  // Build return URLs from the current request's origin. `headers()` is
  // the safest way to learn the host Next.js is serving on right now —
  // env overrides would drift between staging and production.
  const origin = resolveOrigin();
  const internalPaymentId = randomUUID();

  // Task #27: resolve variant + promo BEFORE amount calc so the
  // discount lands in the provider's order and the receipt
  // shows the correct line items. Sequence matters:
  //   1. compute the pre-promo subtotal for the chosen variant (so
  //      the resolver's subtotalMinor matches what the provider sees
  //      if no promo applies);
  //   2. resolve the promo against that subtotal;
  //   3. re-compute amountMinor with the resolved discount applied.
  //
  // Re-resolving the code here — even if the client already called
  // applyPromoCodeAction for preview — closes the TOCTOU window:
  // an admin could have disabled the code between preview and click,
  // and we don't want a "preview said $X off" state to win.
  const variant: PackVariant = args.variant ?? "monthly";
  const preDiscountMinor = packAmountMinor(pack, chosenCurrency, { variant });

  let promoDiscountMicros = 0;
  let promoDiscountBps = 0;
  let promoBonusCredits = 0;
  let resolvedPromoId: string | null = null;
  let resolvedPromoCode: string | null = null;
  let resolvedPromoKind:
    | "percent"
    | "flat"
    | "bonus_credits"
    | null = null;

  const trimmedCode =
    typeof args.promoCode === "string" ? args.promoCode.trim() : "";

  if (trimmedCode) {
    const promoResult = await resolveAndValidate(trimmedCode, {
      userId,
      packId: pack.id,
      currency: chosenCurrency,
      variant,
      subtotalMinor: preDiscountMinor,
    });

    if (!promoResult.ok) {
      return {
        ok: false,
        error: "promo_invalid",
        message:
          "That promo code couldn't be applied. Remove it or try a different code.",
        country: decision.country,
        promoReason: promoResult.reason,
      };
    }

    promoDiscountMicros = promoResult.discountMicros;
    promoDiscountBps = promoResult.discountBps;
    promoBonusCredits = promoResult.bonusCredits;
    resolvedPromoId = promoResult.code.id;
    resolvedPromoCode = promoResult.code.code;
    resolvedPromoKind = promoResult.code.kind;
  }

  // Final amount with variant + promo discount baked in. For
  // "bonus_credits" codes the money total is unchanged (discount
  // micros = 0) but we still stamp `promoBonusCredits` on the
  // payments row so the capture hook can grant the extra credits.
  const amountMinor = packAmountMinor(pack, chosenCurrency, {
    variant,
    // Prefer the bps path when the resolver produced one — it avoids
    // the minors→micros→minors round-trip and its accumulated flooring
    // for "percent" codes. "flat" codes have bps=0 from
    // computePromoDiscount, so they fall through to the micros path
    // which is exact.
    promoDiscountBps: promoDiscountBps > 0 ? promoDiscountBps : undefined,
    promoDiscountMicros: promoDiscountBps > 0 ? undefined : promoDiscountMicros,
  });

  // Step 5: pre-insert the pending row. We want this to exist BEFORE we
  // call the provider so that if the provider call succeeds but our DB
  // write fails afterward, reconciliation can still identify the payment
  // by its internal ID echoed in provider metadata.
  await db.insert(schema.payments).values({
    id: internalPaymentId,
    userId,
    providerId: provider.id,
    providerRef: null,
    mode: "one_time",
    status: "pending",
    amountMinor,
    currency: chosenCurrency,
    packId: pack.id,
    planCode: null,
    subscriptionId: null,
    metadata: {
      initiatedFrom: "pricing_page",
      preferredProviderId: args.preferredProviderId ?? null,
      // Route decision — stored for the payments audit trail so a
      // dispute over "why did this customer get Razorpay when their
      // card was USD" can be answered from the row itself.
      routeCountry: decision.country,
      routeRail: decision.rail,
      routeCurrency: decision.currency,
      routeOverrode: overrode,
      // Task #27: pre-discount subtotal kept in metadata so the
      // /admin/revenue view can sanity-check the discount math
      // without having to rebuild the pricing formula from the pack
      // table + variant + currency.
      preDiscountMinor,
      promoCode: resolvedPromoCode,
      promoDiscountBps: promoDiscountBps || null,
      promoKind: resolvedPromoKind,
    },
    // Task #27 / migration 0015 — dedicated columns on the payments
    // row. Nullable; unset fields stay NULL for pre-promo rows.
    promoCodeId: resolvedPromoId,
    promoDiscountMicros: resolvedPromoId ? promoDiscountMicros : null,
    promoBonusCredits: resolvedPromoId ? promoBonusCredits : null,
    annualVariant: variant === "annual" ? 1 : 0,
  });

  try {
    // Step 6: ask the adapter for a checkout handle.
    const result = await provider.createCheckout({
      mode: "one_time",
      internalPaymentId,
      userId,
      packId: pack.id,
      amount: { amountMinor, currency: chosenCurrency },
      returnUrl: `${origin}/app/billing?status=success&id=${internalPaymentId}`,
      cancelUrl: `${origin}/pricing?status=cancelled&id=${internalPaymentId}`,
      metadata: {
        internalPaymentId,
        packId: pack.id,
        userId,
      },
    });

    // Attach the providerRef so the webhook handler can look us up later.
    await db
      .update(schema.payments)
      .set({ providerRef: result.providerRef })
      .where(eq(schema.payments.id, internalPaymentId));

    return {
      ok: true,
      internalPaymentId,
      providerRef: result.providerRef,
      providerId: provider.id,
      session: result.session,
      route: {
        country: decision.country,
        rail: provider.id,
        currency: chosenCurrency,
        overrode,
      },
      checkout: {
        variant,
        amountMinor,
        promo: resolvedPromoId && resolvedPromoCode && resolvedPromoKind
          ? {
              code: resolvedPromoCode,
              kind: resolvedPromoKind,
              discountMicros: promoDiscountMicros,
              bonusCredits: promoBonusCredits,
            }
          : null,
      },
    };
  } catch (err) {
    // Adapter failure — mark the row failed so billing audits can see
    // we attempted and why. We don't swallow the details internally (the
    // exception bubbles to server logs) but we do sanitize for the client
    // response — providers sometimes include tokens or PII in errors.
    await db
      .update(schema.payments)
      .set({
        status: "failed",
        metadata: {
          initiatedFrom: "pricing_page",
          routeCountry: decision.country,
          routeRail: decision.rail,
          routeCurrency: decision.currency,
          routeOverrode: overrode,
          // Task #27: preserve promo context on failed rows so the
          // support team can answer "did my promo still get applied?"
          // questions from row metadata alone.
          promoCode: resolvedPromoCode,
          promoDiscountBps: promoDiscountBps || null,
          promoKind: resolvedPromoKind,
          error: err instanceof Error ? err.message.slice(0, 200) : "unknown",
        },
      })
      .where(eq(schema.payments.id, internalPaymentId));

    console.error("[checkout] createCheckout failed:", err);
    return {
      ok: false,
      error: "provider_error",
      message:
        "We couldn't start checkout with that provider. Please try another option.",
      country: decision.country,
    };
  }
}

/**
 * Server action invoked by anonymous users clicking a Buy button. We
 * route them to /login with a returnTo so they land back on /pricing
 * after signing in.
 */
export async function redirectToSignIn(returnTo: string): Promise<never> {
  const sanitized =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/pricing";
  redirect(`/login?returnTo=${encodeURIComponent(sanitized)}`);
}

/**
 * Exposed for the UI so the pricing page can render provider chooser
 * buttons only for providers that are actually configured. Wrapping
 * listConfiguredProviderIds in a server action lets client components
 * call it without pulling the registry into their bundle.
 */
export async function getConfiguredProviderIds(): Promise<ProviderId[]> {
  return listConfiguredProviderIds();
}

/**
 * Server-side preview of what the router would do for the current
 * request. Exposed so the client pricing page can render
 * "Paying in INR" / "We're not in your country yet" affordances BEFORE
 * the user clicks Buy — otherwise an EU visitor spends a click discovering
 * they can't check out.
 */
export async function previewRouteDecision(): Promise<RouteDecision> {
  const h = headers();
  return routeCheckoutByCountry(readCountryHeader(h));
}

function resolveOrigin(): string {
  // Next.js 14: `headers()` returns a read-only store — host + proto
  // tell us the origin Hostinger is currently serving on. Falls back to
  // NEXT_PUBLIC_SITE_URL for local dev where the forwarded-proto header
  // is sometimes missing.
  const h = headers();
  const host = h.get("host");
  const proto =
    h.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "production" ? "https" : "http");
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://pdfcraftai.com";
}
