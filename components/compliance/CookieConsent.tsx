// components/compliance/CookieConsent.tsx — First-party consent banner.
//
// Task #24 / Phase D.
//
// What it does:
// -------------
// Renders a fixed-bottom banner for visitors whose `pdfcraft_consent`
// cookie is not yet set. Three buttons:
//
//   - "Accept all"  → cookie set to "all"      → GA4 + Clarity load on next hit
//   - "Essential only" → cookie set to "essential" → no analytics ever
//   - "Customize"   → links to /cookies (full policy + per-category granularity
//                     for future expansion)
//
// On any button click the component writes the first-party cookie and
// then calls `location.reload()`. The reload is deliberate: the
// analytics `<Script>` tags are emitted conditionally by the SERVER
// layout (app/layout.tsx) based on the cookie value. A client-only
// state flip wouldn't cause those script tags to materialize — they'd
// only show up on the next navigation. The reload makes the
// accept-to-analytics transition feel instant (the user sees the
// banner disappear and, if they clicked Accept, analytics start
// firing on the very next request).
//
// Why a client component, not just CSS/server:
// -------------------------------------------
// The server KNOWS whether the cookie is set (it reads the header),
// so in principle the banner could be a pure server render that's
// hidden once `level !== "none"`. But: (a) we need JS to *write* the
// cookie on click — there's no server-action equivalent that doesn't
// need a form POST round-trip, and (b) the banner UX (fade-in,
// focus-trap, esc-to-dismiss later) benefits from live React state.
// So we hand the server-resolved initial level in as a prop and keep
// the component otherwise self-contained.
//
// Accessibility:
// --------------
// - `role="dialog"` + `aria-labelledby` / `aria-describedby` so
//   screen readers announce it as a focusable region.
// - All three buttons are real `<button>` elements — no divs + onClick.
// - Focus is moved to the "Accept all" button on first render so
//   keyboard users don't have to tab through the whole page to reach
//   the banner.
// - Colors meet WCAG AA contrast against both light and dark themes
//   (inherits CSS custom properties from globals.css).
//
// Cookie attributes:
// ------------------
// - Path=/ so every page sees it.
// - Max-Age = 365 days (see CONSENT_COOKIE_MAX_AGE_SECONDS in
//   lib/compliance/consent.ts).
// - SameSite=Lax — banner cookie is not cross-site-sensitive; Lax
//   matches browser defaults and avoids the Firefox "Strict" edge
//   cases.
// - Secure — only over HTTPS. Production is HTTPS-only via Cloudflare.
//   On localhost the browser accepts Secure cookies on http://localhost
//   as a dev exception, so no branching needed.
// - NOT HttpOnly — this is intentional. The banner MUST read the
//   cookie via `document.cookie` on the client to decide whether to
//   render (SSR gives us the initial state but client nav still
//   needs to know). An attacker reading this cookie learns nothing
//   sensitive — it's either "none", "essential", or "all".

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CONSENT_COOKIE_NAME,
  CONSENT_COOKIE_MAX_AGE_SECONDS,
  type ConsentLevel,
} from "@/lib/compliance/consent";

type Props = {
  /**
   * The consent level resolved on the server from the incoming
   * `pdfcraft_consent` cookie. When `"none"`, the banner renders.
   * When `"essential"` or `"all"`, the banner hides (user already
   * chose).
   *
   * Passing this in from the server avoids the flash-of-banner
   * problem where the component mounts without knowing the cookie,
   * renders the banner, reads the cookie on useEffect, and hides —
   * that would cause a 200 ms banner flicker for every returning
   * visitor.
   */
  initialLevel: ConsentLevel;
};

function writeConsentCookie(level: ConsentLevel): void {
  // Build the Set-Cookie header in the format document.cookie
  // expects. Note: `document.cookie = "a=b"` SETS a=b, it does NOT
  // overwrite the whole cookie string — this is a quirk of the DOM
  // API.
  const parts = [
    `${CONSENT_COOKIE_NAME}=${level}`,
    `Max-Age=${CONSENT_COOKIE_MAX_AGE_SECONDS}`,
    "Path=/",
    "SameSite=Lax",
  ];
  // On http://localhost the browser allows Secure cookies but only
  // over https in production. Add Secure unconditionally — on
  // localhost the dev browser quietly accepts it.
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    parts.push("Secure");
  }
  document.cookie = parts.join("; ");
}

export function CookieConsent({ initialLevel }: Props) {
  // Hide immediately if the server already saw a choice.
  const [level, setLevel] = useState<ConsentLevel>(initialLevel);
  const acceptButtonRef = useRef<HTMLButtonElement>(null);

  // Move focus to the first actionable button on mount so keyboard
  // users aren't forced to tab through the page to reach the banner.
  // Only do this if the banner is actually visible (level === "none")
  // and only once per mount.
  useEffect(() => {
    if (level === "none") {
      // Defer focus by one frame so the browser's own focus
      // restoration (after page load) doesn't steal it back.
      const raf = requestAnimationFrame(() => {
        acceptButtonRef.current?.focus();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [level]);

  const onChoose = (choice: "all" | "essential") => {
    writeConsentCookie(choice);
    setLevel(choice);
    // 2026-05-08 (item #23 — cookie consent UX): skip the reload
    // when the user picked "Essential only". The reason for the
    // reload was always "we need the SERVER to re-resolve the
    // cookie so the GA4 + Clarity Script tags get emitted (or not)
    // on next render." But:
    //   - "Essential only" means analytics WILL NOT load. There's
    //     nothing for the server to emit. The only effect of the
    //     reload is to disorient the user mid-scroll for 1-3
    //     seconds while the page rebuilds — meaningfully bad UX.
    //   - "Accept all" still needs the reload so the analytics
    //     `<Script>` tags actually materialize on the page; a
    //     client-only state flip wouldn't run them.
    //
    // The setLevel(choice) above already hides the banner via the
    // `if (level !== "none") return null` short-circuit at the
    // bottom of the component, so no reload is needed for the
    // banner-disappear UX.
    if (choice === "all" && typeof window !== "undefined") {
      window.location.reload();
    }
  };

  if (level !== "none") return null;

  return (
    <div
      // 2026-05-12 SEV-2 audit fix: was `role="dialog" aria-modal="false"`
      // — mixing dialog with non-modal confuses screen readers about
      // whether tabbing should escape. The banner is a non-blocking
      // notification (page is still interactive behind it), so the
      // correct role is `region` with `aria-live="polite"`. Screen
      // readers announce the content on first render without
      // demanding focus-trap behaviour. Same a11y semantic as the
      // existing "skip to main content" link region.
      role="region"
      aria-live="polite"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-body"
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 100,
        maxWidth: 520,
        marginLeft: "auto",
        marginRight: 16,
        background: "var(--bg-2, #1e2029)",
        color: "var(--fg, #e6e6ea)",
        border: "1px solid var(--border, #2e313c)",
        borderRadius: 10,
        padding: "16px 18px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <div
        id="cookie-consent-title"
        style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}
      >
        Cookies & analytics
      </div>
      <div
        id="cookie-consent-body"
        style={{ marginBottom: 12, color: "var(--fg-subtle, #a8acb8)" }}
      >
        We use a first-party cookie to keep you signed in. Product
        analytics (Google Analytics 4, Microsoft Clarity) are optional
        and only load if you accept. You can change this any time on{" "}
        <Link
          href="/cookies"
          // 2026-04-30 a11y: underline restored. axe link-in-text-block
          // (serious) flagged the link as indistinguishable from the
          // surrounding subtle-foreground text — accent vs. fg-subtle
          // contrast was 1.14:1 against the 3:1 minimum. Underline is
          // a non-color affordance so it satisfies WCAG 1.4.1 even
          // when the brand-accent token gets re-skinned in light/dark
          // themes. textUnderlineOffset gives the link a touch of
          // visual breathing room without breaking line-height.
          style={{
            color: "var(--accent, #6aa9ff)",
            textDecoration: "underline",
            textUnderlineOffset: 2,
          }}
        >
          the cookies page
        </Link>
        .
      </div>
      {/*
        2026-05-04 (SECURITY_COMPLIANCE_AUDIT.md §2.2): Accept-all and
        Essential-only buttons share IDENTICAL visual prominence —
        same border, same transparent background, same fontWeight 500
        — to satisfy EDPB Guidelines 03/2022 on deceptive design
        patterns and DPDP Act 2023 §6 (consent must be free, specific,
        informed, unambiguous). Earlier styling had Accept-all filled
        with the accent color + fontWeight 600 (visual primary),
        which is the exact unequal-prominence pattern flagged by
        CNIL deliberation 2021-152 (€60M Facebook fine). The
        consent-gating logic is unchanged; only the visual weights
        are equalized. The "Accept all" button still gets the
        autofocus on render (acceptButtonRef) because the EDPB
        guidance is about VISUAL prominence, not keyboard tab order
        — focus on a default option is industry-standard and not a
        manipulation vector. Customize is a Link (de-emphasized
        muted color) because it leads to a deeper menu, not because
        we want to bury it.
      */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          ref={acceptButtonRef}
          type="button"
          onClick={() => onChoose("all")}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: "1px solid var(--border, #2e313c)",
            background: "transparent",
            color: "var(--fg, #e6e6ea)",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Accept all
        </button>
        <button
          type="button"
          onClick={() => onChoose("essential")}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: "1px solid var(--border, #2e313c)",
            background: "transparent",
            color: "var(--fg, #e6e6ea)",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {/*
            2026-05-12 SEV-0 audit fix: label was "Essential only".
            Visual prominence parity with "Accept all" was already
            correct (same border, background, fontWeight — see the
            big comment above), so the GDPR-compliance question was
            LABEL CLARITY, not styling. EDPB Guidelines 03/2022 §27
            and CNIL deliberation 2020-091 explicitly recommend
            "Refuser" / "Reject all" / equivalents as the standard
            label, because "Essential only" requires the user to
            know what "essential" means in this context. Renaming to
            "Reject all" — the cookie value written underneath is
            still "essential" (see onChoose("essential") above), so
            no downstream change. Result: the EDPB equal-prominence
            test now passes on label legibility as well as on visual
            styling.
          */}
          Reject all
        </button>
        <Link
          href="/cookies"
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: "1px solid var(--border, #2e313c)",
            background: "transparent",
            color: "var(--fg-subtle, #a8acb8)",
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
            cursor: "pointer",
          }}
        >
          Customize
        </Link>
      </div>
    </div>
  );
}
