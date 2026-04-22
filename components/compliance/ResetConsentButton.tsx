// components/compliance/ResetConsentButton.tsx — "Reset cookie
// preferences" action for the /cookies policy page.
//
// Task #24 / Phase D.
//
// Why a dedicated component:
// --------------------------
// GDPR Art. 7(3) + DPDP Act s. 6(3) both mandate that withdrawing
// consent must be as easy as giving it. We give consent with one
// click on the banner; withdrawal must therefore be equally one
// click. This button is that one click.
//
// It doesn't merely switch the cookie to "essential" — that would
// be a different signal (explicit reject) vs. a withdrawal. It
// deletes the cookie entirely by setting Max-Age=0, which resets
// the state to "not yet chosen" and re-surfaces the consent banner
// on the next page load. That's the cleanest way to let the user
// re-evaluate without prejudicing the decision.

"use client";

import { useState } from "react";
import { CONSENT_COOKIE_NAME } from "@/lib/compliance/consent";

function clearConsentCookie(): void {
  // Setting Max-Age=0 on a cookie with matching name + path deletes
  // it. The browser then treats future requests as if no cookie
  // existed. SameSite/Secure must match the original Set-Cookie to
  // ensure the delete hits the right scope.
  const parts = [
    `${CONSENT_COOKIE_NAME}=`,
    "Max-Age=0",
    "Path=/",
    "SameSite=Lax",
  ];
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    parts.push("Secure");
  }
  document.cookie = parts.join("; ");
}

export function ResetConsentButton() {
  const [cleared, setCleared] = useState(false);

  const onClick = () => {
    clearConsentCookie();
    setCleared(true);
    // Reload so the banner re-appears and analytics stop firing if
    // the user had previously accepted.
    if (typeof window !== "undefined") {
      // A short delay lets the "Cleared. Reloading..." label flash
      // briefly so the user sees feedback that the click registered.
      setTimeout(() => {
        window.location.reload();
      }, 300);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={cleared}
      style={{
        padding: "10px 16px",
        borderRadius: 6,
        border: "1px solid var(--accent, #6aa9ff)",
        background: cleared
          ? "var(--bg-2, #1e2029)"
          : "var(--accent, #6aa9ff)",
        color: cleared ? "var(--fg-subtle, #a8acb8)" : "var(--bg, #0f1116)",
        fontSize: 13,
        fontWeight: 600,
        cursor: cleared ? "default" : "pointer",
        transition: "background 150ms",
      }}
    >
      {cleared ? "Cleared — reloading…" : "Reset cookie preferences"}
    </button>
  );
}
