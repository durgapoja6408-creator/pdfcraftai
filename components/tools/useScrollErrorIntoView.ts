"use client";

// components/tools/useScrollErrorIntoView.ts
//
// M16 (#193, 2026-04-29): when an error string transitions from null
// to a value, scroll the error element into view if it's off-screen.
//
// Why scroll-not-focus: per WCAG 3.3.1 (Error Identification), an
// error must be programmatically determinable — `role="alert"` on
// the error element handles that, and screen readers auto-announce
// the alert when it appears. Moving keyboard focus to the error
// goes BEYOND what WCAG requires and can disrupt the user (they
// were typing in a field; suddenly focus jumps elsewhere). The
// scroll-into-view middle ground gets the error in front of the
// user without stealing where they're working.
//
// Only scrolls when the element is OFF-SCREEN. If the error appears
// next to the button the user just clicked, they're already looking
// at it — scrolling would be jumpy and pointless. We use
// IntersectionObserver-equivalent logic via getBoundingClientRect.
//
// Respects prefers-reduced-motion via { behavior: "smooth" } only
// when it's safe — we pass "auto" if the user opted out of motion.
//
// Returns a ref that the caller attaches to the error element. The
// caller is responsible for the alert role and aria-live attributes
// on that element; this hook only handles the scroll.

import { useEffect, useRef } from "react";

export function useScrollErrorIntoView(
  error: string | null,
): React.RefObject<HTMLElement> {
  // The ref the caller attaches to <p role="alert">.
  const errorRef = useRef<HTMLElement | null>(null);
  // Tracks the last seen error so we only scroll on null → string
  // transitions (not every re-render with the same error).
  const prevErrorRef = useRef<string | null>(null);

  useEffect(() => {
    const wasNull = prevErrorRef.current === null;
    prevErrorRef.current = error;

    // Only act on null → string transitions (i.e. an error JUST
    // appeared). String → string changes are caught by role="alert".
    if (!error || !wasNull) return;
    if (typeof window === "undefined") return;
    const el = errorRef.current;
    if (!el) return;

    // Check if the error is already visible.
    const r = el.getBoundingClientRect();
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    const fullyVisible = r.top >= 0 && r.bottom <= viewportH;
    if (fullyVisible) return;

    // Respect the user's reduced-motion preference.
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollIntoView({
      behavior: prefersReduced ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });
  }, [error]);

  // Cast the ref so consumers can attach it to any HTMLElement
  // (typically <p>, <div>, or <span>).
  return errorRef as React.RefObject<HTMLElement>;
}
