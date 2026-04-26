// AdSlot feature-flag + Google AdSense client/slot ID configuration.
//
// The /components/marketing/AdSlot component reads from this to decide
// whether to render a house promo (today) or a Google AdSense <ins>
// tag (after AdSense activation in October 2026).
//
// Three runtime modes:
//
//   1. House ads only (today): GOOGLE_ADSENSE_PUBLISHER_ID env var is
//      unset. AdSlot renders a curated promo for one of pdfcraft ai's
//      own tools. No third-party scripts. No third-party cookies.
//
//   2. AdSense without consent (October 2026, user hasn't accepted
//      ad cookies): GOOGLE_ADSENSE_PUBLISHER_ID is set, but the
//      visitor's consent level is not "all_with_ads". AdSlot falls
//      back to house promo to avoid setting ad cookies before consent.
//      Same UX as mode 1 from the visitor's perspective.
//
//   3. AdSense fully active (October 2026, visitor consented):
//      GOOGLE_ADSENSE_PUBLISHER_ID is set AND visitor consent is
//      "all_with_ads". AdSlot renders the Google AdSense <ins> tag
//      with the slot's specific ad unit ID.
//
// Env vars (read at request time, not build time, so a config change
// can flip modes without a redeploy):
//
//   GOOGLE_ADSENSE_PUBLISHER_ID
//     The "ca-pub-XXXXXXXXXXXXXXXX" publisher ID from the AdSense
//     console. Drives the global <script async src="...adsbygoogle..."
//     data-ad-client="ca-pub-..."></script> in the layout.
//     Leave unset until AdSense is approved.
//
//   GOOGLE_ADSENSE_SLOT_*
//     One env var per slot, holding the numeric ad unit ID from the
//     AdSense console. Configured per slot below.

/** Whether AdSense has been activated. Read at request time. */
export function adsenseEnabled(): boolean {
  return !!process.env.GOOGLE_ADSENSE_PUBLISHER_ID?.trim();
}

/** The publisher ID for the layout-level adsbygoogle script tag. */
export function adsensePublisherId(): string | null {
  return process.env.GOOGLE_ADSENSE_PUBLISHER_ID?.trim() || null;
}

/**
 * Per-slot AdSense ad unit IDs. Each slot in the AdSlot catalog has
 * a corresponding env var that holds the numeric ad unit ID once the
 * slot is created in the AdSense console.
 *
 * Add an entry here when you ship a new AdSlot position.
 */
export type AdSlotName =
  | "article-end"
  | "alternative-end"
  | "use-case-end"
  | "seo-landing-mid"
  // Bundle E (2026-04-26): expanded coverage to high-traffic page types
  // that lacked an ad slot.
  // tools-catalog → /tools index page (95-card grid; high SEO traffic).
  // tool-runner-end → /tool/[id] runner pages, between reassurance row
  // and Related Tools section. Non-intrusive, away from primary action.
  | "tools-catalog"
  | "tool-runner-end";

export function adsenseSlotId(slot: AdSlotName): string | null {
  const envName = {
    "article-end": "GOOGLE_ADSENSE_SLOT_ARTICLE_END",
    "alternative-end": "GOOGLE_ADSENSE_SLOT_ALTERNATIVE_END",
    "use-case-end": "GOOGLE_ADSENSE_SLOT_USE_CASE_END",
    "seo-landing-mid": "GOOGLE_ADSENSE_SLOT_SEO_LANDING_MID",
    "tools-catalog": "GOOGLE_ADSENSE_SLOT_TOOLS_CATALOG",
    "tool-runner-end": "GOOGLE_ADSENSE_SLOT_TOOL_RUNNER_END",
  }[slot];
  return process.env[envName]?.trim() || null;
}
