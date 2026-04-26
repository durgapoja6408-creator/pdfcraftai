// Dual-mode ad slot.
//
// Today (no AdSense yet, no ad-cookie consent yet): renders a curated
// house promo for one of pdfcraft ai's own tools. Drives conversion
// to the AI tier with zero third-party scripts.
//
// October (after AdSense approval + visitor consents to ad cookies):
// renders the Google AdSense <ins> tag. The slot-name + context combo
// determines the AdSense ad unit ID via lib/ads-config.ts.
//
// One env-var flip + a per-visitor consent change toggles the entire
// site from house ads → real ads. No code changes, no redeploys.
//
// All slots emit the same UX shape:
//   - "Sponsored" or "Ad" eyebrow (clear labelling per Google policy)
//   - Headline + body
//   - CTA button with a tracked outbound link
//
// GA4 instrumentation:
// Both modes fire a GA4 event on click so we can measure which slots
// + contexts actually convert. Once both modes are live we can
// A/B-decide which one earns more revenue per impression and route
// to the winner.

import Link from "next/link";
import { cookies } from "next/headers";
import {
  CONSENT_COOKIE_NAME,
  parseConsent,
  adsAllowed,
} from "@/lib/compliance/consent";
import {
  adsenseEnabled,
  adsensePublisherId,
  adsenseSlotId,
  type AdSlotName,
} from "@/lib/ads-config";
import { resolvePromo } from "@/lib/ad-slots";

type Props = {
  slot: AdSlotName;
  /**
   * Optional context key used to pick a context-specific house promo.
   * Typically the page slug — e.g. "ilovepdf" on /alternatives/ilovepdf
   * or "redact-pdf-properly" on /blog/redact-pdf-properly. When absent
   * or unmatched, the slot's default promo renders.
   */
  context?: string;
};

export function AdSlot({ slot, context }: Props) {
  // Resolve consent + AdSense activation server-side so we can
  // decide which mode to render before the markup goes out.
  const consentCookie = cookies().get(CONSENT_COOKIE_NAME)?.value ?? null;
  const consentLevel = parseConsent(consentCookie);

  const showAdSense = adsenseEnabled() && adsAllowed(consentLevel);

  if (showAdSense) {
    return <AdSenseSlot slot={slot} />;
  }

  return <HouseAdSlot slot={slot} context={context} />;
}

/**
 * House promo — pdfcraft ai's own tool promotion.
 *
 * Renders even when AdSense is unset, even when visitor hasn't
 * consented to anything. No third-party scripts, no third-party
 * cookies. Pure first-party content.
 */
function HouseAdSlot({ slot, context }: { slot: AdSlotName; context?: string }) {
  const promo = resolvePromo(slot, context);
  return (
    <aside
      role="complementary"
      aria-label={`Sponsored: ${promo.headline}`}
      data-ad-slot={slot}
      data-ad-mode="house"
      style={{
        margin: "32px 0",
        padding: 24,
        borderRadius: 10,
        background: "var(--bg-1)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        className="eyebrow"
        style={{
          fontSize: 11,
          letterSpacing: "0.12em",
          color: "var(--fg-subtle)",
          marginBottom: 8,
        }}
      >
        SPONSORED · {promo.eyebrow.toUpperCase()}
      </div>
      <h3
        style={{
          fontSize: 18,
          fontWeight: 600,
          margin: "0 0 8px",
          letterSpacing: "-0.01em",
        }}
      >
        {promo.headline}
      </h3>
      <p
        style={{
          fontSize: 14,
          lineHeight: 1.55,
          margin: "0 0 16px",
          color: "var(--fg-muted)",
        }}
      >
        {promo.body}
      </p>
      <Link
        href={promo.href}
        className="btn btn-primary"
        style={{
          fontSize: 13,
          padding: "8px 14px",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
        // GA4 outbound-click tracking — fires through the existing GA4
        // gtag the layout already loads (gated on consent).
        data-ga-event="house_ad_click"
        data-ga-slot={slot}
        data-ga-target={promo.href}
      >
        {promo.cta} →
      </Link>
    </aside>
  );
}

/**
 * Google AdSense slot — renders the official adsbygoogle <ins> tag.
 *
 * Only mounts when:
 *   - GOOGLE_ADSENSE_PUBLISHER_ID env var is set, AND
 *   - per-slot env var (GOOGLE_ADSENSE_SLOT_*) is set, AND
 *   - visitor's consent level is "all_with_ads"
 *
 * The actual <script async src="...adsbygoogle..."></script> loader
 * lives in app/layout.tsx and is itself consent-gated. This component
 * just emits the <ins> element that the loader fills in.
 */
function AdSenseSlot({ slot }: { slot: AdSlotName }) {
  const publisher = adsensePublisherId();
  const slotId = adsenseSlotId(slot);

  // If the publisher is set but this specific slot's ad unit ID
  // hasn't been provisioned yet, fall back to the house promo so
  // we don't render an empty `<ins>`. The fallback is the `default`
  // promo for this slot — context-specific lookup isn't useful here
  // since this branch only runs in the AdSense-enabled mode.
  if (!publisher || !slotId) {
    return <HouseAdSlot slot={slot} />;
  }

  return (
    <aside
      role="complementary"
      aria-label="Advertisement"
      data-ad-slot={slot}
      data-ad-mode="adsense"
      style={{ margin: "32px 0" }}
    >
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={publisher}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
      {/* The adsbygoogle.push({}) call below is what tells the loader
          (loaded site-wide in layout) to fill in the <ins> tag. */}
      <script
        dangerouslySetInnerHTML={{
          __html: "(adsbygoogle = window.adsbygoogle || []).push({});",
        }}
      />
    </aside>
  );
}
