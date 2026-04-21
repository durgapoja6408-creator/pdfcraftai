"use client";

/**
 * DeferredRegionNotify — email-capture form for Tier-2 deferred-region
 * visitors. Rendered on the "not available in your country yet" surface
 * that the checkout flow shows when `routeCheckoutByCountry(country)`
 * returns `action: "defer"`.
 *
 * Props:
 *   - country: ISO-3166-1 alpha-2 code, must be in TIER_2_COUNTRIES (the
 *     server revalidates; passing a Tier-1 or Tier-3 code here produces
 *     an API 400). The consumer reads this from the CF-IPCountry header
 *     it already routed on.
 *   - source: free-form UI origin — `"checkout_defer"`,
 *     `"pricing_country_picker"`, `"marketing_footer"`. Lets PM cut the
 *     funnel by where the user raised their hand.
 *   - reason: `"tier2_deferred"` (user was turned away from checkout) or
 *     `"tier2_notify"` (user proactively opted in). Defaults to
 *     `tier2_deferred` to match the most common entry point.
 *   - countryName: optional display string (e.g. "Germany"); if omitted
 *     the code is shown verbatim.
 *   - introCopy: optional override for the paragraph above the email
 *     input. Defaults to the checkout-defer framing ("we're not taking
 *     payments from X yet"). Marketing surfaces that want proactive
 *     framing ("be the first to know when we launch") pass their own
 *     copy. Supply a React node so callers can include links, strong
 *     text, etc. Keep it to one short paragraph to preserve the form's
 *     existing visual rhythm.
 *
 * States:
 *   - idle      — form visible.
 *   - loading   — submit in flight.
 *   - sent      — thank-you confirmation. Terminal.
 *   - error     — show inline error; form stays editable.
 *
 * The consent checkbox is NOT pre-checked (GDPR). The exact sentence next
 * to the checkbox is captured into `consentText` and posted with the
 * submission so we have the audit trail server-side. If the copy ever
 * changes, new rows record the new text; old rows stay auditable.
 *
 * Styling follows the existing ContactForm visual language — no new
 * tokens, just CSS variables already in globals.css.
 */

import { useMemo, useState, type ReactNode } from "react";
import { I } from "@/components/icons/Icons";

type State = "idle" | "loading" | "sent" | "error";

export interface DeferredRegionNotifyProps {
  country: string;
  source?: string;
  reason?: "tier2_deferred" | "tier2_notify";
  countryName?: string;
  introCopy?: ReactNode;
}

export function DeferredRegionNotify({
  country,
  source = "checkout_defer",
  reason = "tier2_deferred",
  countryName,
  introCopy,
}: DeferredRegionNotifyProps) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string>("");
  const [consent, setConsent] = useState<boolean>(false);

  // Canonical copy the user clicks through on. Stored verbatim in
  // `geo_waitlist.consent_text` for GDPR defensibility — if we change
  // this string we want the change to be visible in row timestamps.
  const consentSentence = useMemo(
    () =>
      `I agree to receive a one-time email from pdfcraftai.com when the service launches in ${
        countryName || country
      }. I understand I can withdraw consent at any time by emailing support@pdfcraftai.com.`,
    [country, countryName]
  );

  if (state === "sent") {
    return (
      <div
        role="status"
        className="card"
        style={{
          padding: 20,
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          background:
            "color-mix(in oklab, var(--green, #10b981) 10%, var(--bg-1))",
          border:
            "1px solid color-mix(in oklab, var(--green, #10b981) 30%, var(--border))",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "var(--green, #10b981)",
            color: "white",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <I.Check size={16} />
        </span>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>
            You&apos;re on the list.
          </p>
          <p
            className="muted"
            style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.55 }}
          >
            We&apos;ll email you once we launch in{" "}
            {countryName || country}. One email, no newsletter.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (state === "loading") return;
        setError("");
        if (!consent) {
          setError("Please confirm consent before submitting.");
          setState("error");
          return;
        }
        const formData = new FormData(e.currentTarget);
        const email = String(formData.get("email") ?? "").trim();
        if (!email) {
          setError("Please enter your email address.");
          setState("error");
          return;
        }

        setState("loading");
        try {
          const res = await fetch("/api/geo/waitlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email,
              country,
              source,
              reason,
              consent: true,
              consentText: consentSentence,
            }),
          });
          const body = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
          };
          if (!res.ok || !body.ok) {
            // Map the known server error codes to human copy. Anything
            // unrecognized falls through to a generic message.
            const code = body.error ?? "";
            const msg =
              code === "rate_limited_email" || code === "rate_limited_ip"
                ? "You just submitted that. Give us a minute, then try again."
                : code === "country_not_eligible"
                ? "We can't add this country to the waitlist right now."
                : code === "consent_required"
                ? "Please confirm consent before submitting."
                : code === "Invalid email"
                ? "Please enter a valid email address."
                : "Something went wrong — please try again.";
            setError(msg);
            setState("error");
            return;
          }
          setState("sent");
        } catch {
          setError("Network error — please try again.");
          setState("error");
        }
      }}
      style={{ display: "grid", gap: 14 }}
      noValidate
    >
      <p
        className="muted"
        style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}
      >
        {introCopy ?? (
          <>
            We&apos;re not taking payments from {countryName || country}{" "}
            yet. Leave your email and we&apos;ll reach out the moment we
            go live there.
          </>
        )}
      </p>

      <div>
        <label htmlFor="geo-waitlist-email" style={labelStyle}>
          Email
        </label>
        <input
          id="geo-waitlist-email"
          name="email"
          type="email"
          className="input"
          autoComplete="email"
          required
          style={{ width: "100%", height: 42 }}
          aria-describedby="geo-waitlist-consent-text"
        />
      </div>

      <label
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          fontSize: 13,
          lineHeight: 1.5,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          style={{ marginTop: 3, flexShrink: 0 }}
          aria-describedby="geo-waitlist-consent-text"
        />
        <span id="geo-waitlist-consent-text" style={{ color: "var(--fg)" }}>
          {consentSentence}
        </span>
      </label>

      {state === "error" && (
        <p
          role="alert"
          style={{
            color: "var(--danger, #ef4444)",
            background:
              "color-mix(in oklab, var(--danger, #ef4444) 10%, transparent)",
            border:
              "1px solid color-mix(in oklab, var(--danger, #ef4444) 30%, transparent)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
            margin: 0,
          }}
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        className="btn btn-accent"
        style={{ justifyContent: "center", height: 44 }}
        disabled={state === "loading" || !consent}
      >
        {state === "loading" ? "Submitting…" : "Notify me when you launch"}
        {state !== "loading" && <I.ArrowRight size={14} />}
      </button>

      <p
        className="muted"
        style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}
      >
        One email only. We won&apos;t add you to any newsletter. See our{" "}
        <a href="/privacy" style={{ color: "var(--accent)" }}>
          privacy policy
        </a>
        .
      </p>
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 6,
  color: "var(--fg)",
};
