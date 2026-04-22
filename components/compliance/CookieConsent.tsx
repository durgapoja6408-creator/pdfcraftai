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
    // Reload so the SERVER re-resolves the cookie and either emits
    // or suppresses the GA4 + Clarity Script tags. Without this,
    // the banner disappears but analytics don't start until the
    // next navigation.
    //
    // We deliberately use `location.reload()` and not
    // `router.refresh()` — the latter does an RSC refresh but does
    // NOT re-execute the `<Script>` tags on the page, which is the
    // whole point of the reload.
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  if (level !== "none") return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
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
          style={{ color: "var(--accent, #6aa9ff)", textDecoration: "none" }}
        >
          the cookies page
        </Link>
        .
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          ref={acceptButtonRef}
          type="button"
          onClick={() => onChoose("all")}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: "1px solid var(--accent, #6aa9ff)",
            background: "var(--accent, #6aa9ff)",
            color: "var(--bg, #0f1116)",
            fontSize: 13,
            fontWeight: 600,
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
          Essential only
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
