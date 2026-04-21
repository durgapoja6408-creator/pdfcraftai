"use client";

/**
 * LaunchNotifySignup — proactive "notify me when you launch in my
 * country" signup surface for marketing pages (Task #3 sub-item 4 —
 * docs/GEO_LAUNCH_POLICY.md §4 "Proactive notify list").
 *
 * Shape of the flow:
 *   1. Visitor lands on a marketing page (pricing, footer CTA, a
 *      dedicated /launch-notify page, etc.).
 *   2. They pick their country from the dropdown. We only show Tier-2
 *      countries because Tier-1 visitors can already check out and
 *      Tier-3 visitors must not be onboarded (sanctions).
 *   3. Once a country is selected, we render the existing
 *      DeferredRegionNotify form (same component used on the checkout
 *      "not available yet" surface) with:
 *        - `reason="tier2_notify"` — distinguishes proactive signups
 *          from checkout-defer rejections in analytics and in the
 *          geo_waitlist table.
 *        - `source` — free-form string passed by the embedder so PM
 *          can attribute by surface (e.g. "pricing_country_picker",
 *          "footer_notify", "launch_notify_page").
 *        - `introCopy` — proactive framing, not the checkout-defer
 *          "we're not taking payments from X yet" apology copy.
 *
 * Why two layers instead of one big component:
 *   DeferredRegionNotify already does the heavy lifting (POST, rate-limit
 *   error mapping, GDPR consent checkbox, thank-you state). Wrapping it
 *   with a picker is zero duplication — the country-picker step is the
 *   only thing the marketing flow needs that the checkout-defer flow
 *   doesn't (checkout already knows the country from CF-IPCountry).
 *
 * Server-side safety:
 *   The country pick is UI convenience only — the /api/geo/waitlist
 *   route re-validates the code against TIER_2_COUNTRIES and returns a
 *   400 "country_not_eligible" if a client tampers with the payload.
 *   So even if someone POSTs a Tier-1 or Tier-3 code, the backend
 *   refuses it. Defense in depth.
 *
 * Props:
 *   - source: required. Where on the site the widget is embedded. Stored
 *     verbatim in geo_waitlist.source so PM can slice the funnel.
 *   - defaultCountry: optional ISO-2. If the embedder already knows
 *     something about the visitor (e.g. CF-IPCountry on a server
 *     component that rehydrates props to this client component),
 *     preselect it — but only if it's actually Tier 2; otherwise we
 *     still show the picker empty so the user affirmatively picks.
 *   - heading / subheading: optional. Section-level copy above the
 *     picker itself. Defaults to sensible proactive wording.
 */

import { useMemo, useState } from "react";
import { I } from "@/components/icons/Icons";
import { TIER_2_COUNTRY_OPTIONS, tier2CountryName } from "@/lib/geo/country-names";
import { TIER_2_COUNTRIES } from "@/lib/payments/router";
import { DeferredRegionNotify } from "./DeferredRegionNotify";

export interface LaunchNotifySignupProps {
  source: string;
  defaultCountry?: string;
  heading?: string;
  subheading?: string;
}

export function LaunchNotifySignup({
  source,
  defaultCountry,
  heading = "Not in a supported region yet?",
  subheading = "Pick your country and we'll email you the moment we launch there. One email, no newsletter.",
}: LaunchNotifySignupProps) {
  // Sanitise the initial value: only accept Tier-2 codes. Anything else
  // (Tier 1, Tier 3, "XX", bad input) becomes empty so the user picks.
  const initial = useMemo(() => {
    const code = (defaultCountry ?? "").toUpperCase();
    return code && TIER_2_COUNTRIES.has(code) ? code : "";
  }, [defaultCountry]);

  const [country, setCountry] = useState<string>(initial);

  return (
    <div
      className="card"
      style={{
        padding: 28,
        display: "grid",
        gap: 18,
      }}
    >
      <div style={{ display: "grid", gap: 6 }}>
        <div
          className="eyebrow"
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <I.Globe size={14} />
          LAUNCH WAITLIST
        </div>
        <h3 style={{ margin: 0, fontSize: 22, letterSpacing: "-0.01em" }}>
          {heading}
        </h3>
        <p
          className="muted"
          style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}
        >
          {subheading}
        </p>
      </div>

      <div style={{ display: "grid", gap: 8, maxWidth: 360 }}>
        <label
          htmlFor="launch-notify-country"
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--fg)",
          }}
        >
          Country
        </label>
        <select
          id="launch-notify-country"
          className="input"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          style={{ width: "100%", height: 42 }}
        >
          <option value="">Select your country…</option>
          {TIER_2_COUNTRY_OPTIONS.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.name}
            </option>
          ))}
        </select>
        <p
          className="muted"
          style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}
        >
          Only regions where we haven&apos;t launched yet are listed. If
          your country isn&apos;t here, you can already{" "}
          <a href="/register" style={{ color: "var(--accent)" }}>
            sign up and check out
          </a>
          .
        </p>
      </div>

      {country && (
        <div
          key={country} /* reset DeferredRegionNotify state on country change */
          style={{
            paddingTop: 6,
            borderTop:
              "1px dashed color-mix(in oklab, var(--border) 70%, transparent)",
          }}
        >
          <DeferredRegionNotify
            country={country}
            countryName={tier2CountryName(country)}
            reason="tier2_notify"
            source={source}
            introCopy={
              <>
                We&apos;ll email you once pdfcraftai.com launches in{" "}
                <strong style={{ color: "var(--fg)", fontWeight: 500 }}>
                  {tier2CountryName(country)}
                </strong>
                . One email only — we won&apos;t add you to any
                newsletter and we won&apos;t share your address.
              </>
            }
          />
        </div>
      )}
    </div>
  );
}
