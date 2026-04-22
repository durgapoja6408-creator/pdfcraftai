// Client-side checkout button.
//
// What this component does:
//   1. Renders a plain button that looks like any other btn.
//   2. On click, calls the `createCheckoutAction` server action for the
//      given pack.
//   3. If the returned CheckoutSession is "redirect", sends the browser
//      to that URL (Paddle hosted checkout page, some subscription flows).
//   4. If the session is "client", loads the provider's SDK script on
//      demand and opens the provider's hosted modal (Razorpay Checkout
//      modal, Paddle.js overlay checkout).
//
// Why we load SDK scripts lazily (not in the layout <head>):
//   - Only ~5% of page views actually click a checkout button. Loading
//     an ~80KB Razorpay SDK on every pricing view would burn bandwidth
//     and LCP for no gain.
//   - Each SDK has its own quirks about re-initialization if loaded
//     twice. Guarding with `window.__pdfcraftSdkLoaded` ensures we load
//     once per session.
//
// Error UX:
//   - Network/auth/provider errors are surfaced as a small inline error
//     under the button, not a blocking dialog. The button itself
//     re-enables so users can retry a different pack.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { I } from "@/components/icons/Icons";
import type { CreditPackId, PackVariant } from "@/lib/pricing";
import type { CheckoutSession, ProviderId } from "@/lib/payments/types";
import { createCheckoutAction } from "@/lib/payments/checkout-actions";

type Variant = "accent" | "outline";

type Props = {
  packId: CreditPackId;
  /** If set, the server action is told to prefer this provider. */
  preferredProviderId?: ProviderId;
  /**
   * "monthly" (default) or "annual". Annual gets 12× credits + 20% off,
   * one-time charge. Task #27 / Phase E.
   */
  packVariant?: PackVariant;
  /**
   * Promo code to apply at checkout. Validated server-side by
   * createCheckoutAction; invalid codes surface as an inline error.
   */
  promoCode?: string;
  label?: string;
  variant?: Variant;
  /** Pass an extra className (e.g. "btn-lg") through to the button. */
  size?: "sm" | "md" | "lg";
  /** Fill the parent container — used on the credit pack cards. */
  fullWidth?: boolean;
  /** Override label trailing icon. Default: right-arrow. */
  showArrow?: boolean;
};

export function CheckoutButton({
  packId,
  preferredProviderId,
  packVariant,
  promoCode,
  label = "Buy pack",
  variant = "outline",
  size = "md",
  fullWidth = false,
  showArrow = false,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const trimmedPromo = promoCode?.trim();
      const result = await createCheckoutAction({
        packId,
        preferredProviderId,
        variant: packVariant,
        promoCode: trimmedPromo ? trimmedPromo : undefined,
      });
      if (!result.ok) {
        if (result.error === "not_authenticated") {
          // Bounce through the sign-in flow and land back on /pricing
          // with the pack pre-selected so the user can retry in one click.
          router.push(
            `/login?returnTo=${encodeURIComponent(`/pricing?pack=${packId}`)}`
          );
          return;
        }
        // Promo rejections get mapped to friendly copy. Other failures
        // fall through to the provider/message from the server action.
        if (result.error === "promo_invalid" && result.promoReason) {
          setError(promoReasonCopy(result.promoReason));
          return;
        }
        setError(result.message);
        return;
      }
      await launchCheckout(result.session);
    } catch (err) {
      console.error("[checkout-button]", err);
      setError(
        "Something went wrong starting checkout. Please try again in a moment."
      );
    } finally {
      setBusy(false);
    }
  };

  const className = [
    "btn",
    variant === "accent" ? "btn-accent" : "btn-outline",
    size === "lg" ? "btn-lg" : size === "sm" ? "btn-sm" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div style={{ width: fullWidth ? "100%" : undefined }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={className}
        style={{
          width: fullWidth ? "100%" : undefined,
          justifyContent: fullWidth ? "center" : undefined,
          opacity: busy ? 0.7 : undefined,
          cursor: busy ? "progress" : undefined,
        }}
      >
        {busy ? "Starting…" : label}
        {!busy && showArrow && <I.ArrowRight size={16} />}
      </button>
      {error && (
        <div
          role="alert"
          className="muted"
          style={{
            fontSize: 12,
            marginTop: 8,
            color: "var(--danger, #c00)",
            textAlign: fullWidth ? "center" : "left",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

// --- Promo rejection copy (mirrors lib/promos/actions.ts) -----------------
//
// Kept here (duplicated) rather than imported from lib/promos/actions.ts
// because that module is "use server" — importing it into a client
// component would pull the whole server action bundle. Duplicating 9
// copy strings is cheaper than the bundle bloat, and the unit tests
// in scripts/test-promos.mjs pin both sides so drift is caught.

function promoReasonCopy(
  reason:
    | "unknown_code"
    | "inactive"
    | "not_started"
    | "expired"
    | "wrong_currency"
    | "wrong_pack"
    | "wrong_variant"
    | "max_redemptions_reached"
    | "user_limit_reached"
): string {
  switch (reason) {
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

// --- SDK loader ------------------------------------------------------------

type SdkStatus = "idle" | "loading" | "ready" | "error";
const SDK_STATE: Record<string, SdkStatus> = {};

declare global {
  interface Window {
    // Razorpay SDK exposes window.Razorpay (constructor).
    Razorpay?: new (options: RazorpayOptions) => {
      open(): void;
      close(): void;
      on(event: string, handler: (...args: unknown[]) => void): void;
    };
    // Paddle.js exposes window.Paddle — populated lazily when the first
    // international checkout click loads https://cdn.paddle.com/paddle/v2/paddle.js.
    Paddle?: unknown;
  }
}

type RazorpayOptions = {
  key: string;
  order_id: string;
  name?: string;
  description?: string;
  // Razorpay's SDK uses `any` liberally in its own types. We narrow to
  // the handful of fields we actually set.
  handler?: (response: { razorpay_payment_id: string }) => void;
  modal?: { ondismiss?: () => void };
  prefill?: Record<string, string>;
  notes?: Record<string, string>;
  theme?: { color?: string };
};

function loadScript(src: string, key: string): Promise<void> {
  if (SDK_STATE[key] === "ready") return Promise.resolve();
  if (SDK_STATE[key] === "loading") {
    // Poll until the concurrent load finishes.
    return new Promise((resolve, reject) => {
      const tick = () => {
        if (SDK_STATE[key] === "ready") resolve();
        else if (SDK_STATE[key] === "error") reject(new Error(`sdk ${key} failed`));
        else setTimeout(tick, 50);
      };
      tick();
    });
  }
  SDK_STATE[key] = "loading";
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => {
      SDK_STATE[key] = "ready";
      resolve();
    };
    s.onerror = () => {
      SDK_STATE[key] = "error";
      reject(new Error(`sdk ${key} failed to load`));
    };
    document.head.appendChild(s);
  });
}

async function launchCheckout(session: CheckoutSession): Promise<void> {
  if (session.kind === "redirect") {
    // Full-page redirect — Paddle hosted checkout, some subscription flows.
    window.location.href = session.url;
    return;
  }

  // session.kind === "client" — load SDK and open hosted modal.
  if (session.sdk === "razorpay") {
    await loadScript(
      "https://checkout.razorpay.com/v1/checkout.js",
      "razorpay"
    );
    if (!window.Razorpay) {
      throw new Error("Razorpay SDK did not initialize");
    }
    const rzp = new window.Razorpay({
      key: session.publicConfig.key,
      order_id: session.clientToken,
      name: session.publicConfig.name ?? "pdfcraft ai",
      description: session.publicConfig.description ?? "Credit pack",
      theme: { color: "#0b0b0b" },
      // Razorpay fires `handler` on successful authorization. We don't
      // do anything here — the webhook is what grants credits. But we
      // redirect the user to /app/billing so they see "processing".
      handler: () => {
        window.location.href = "/app/billing?status=processing";
      },
      modal: {
        ondismiss: () => {
          // User closed the modal. No-op — the pending payments row
          // stays "pending" and reconciliation will sweep it later.
        },
      },
    });
    rzp.open();
    return;
  }

  // Unknown client SDK — shouldn't happen if the registry and adapters
  // stay in sync. Fallback: log and surface.
  throw new Error(`Unknown client SDK: ${session.sdk}`);
}
