"use client";

// Bundle C / Task #122 — Real-User Monitoring (RUM) for Core Web Vitals.
//
// Why ship this now:
// ------------------
// Lighthouse / PageSpeed Insights only measures what THEIR fleet sees
// at scan time. Field data (CrUX) is what Google actually scores us
// on for the "Page Experience" ranking signal — and CrUX only kicks
// in once we have enough real user samples on the origin. Until then
// Search Console reports "insufficient data" and we get neither
// reward nor penalty.
//
// This file emits a `web_vitals` GA4 event for every recorded metric
// (LCP, INP, CLS, FCP, TTFB, FID-fallback). GA4 → Looker Studio gives
// us a per-page-template view of which routes are dragging the
// origin's CrUX percentile down, well before Search Console catches
// up.
//
// Why next/web-vitals (not the npm `web-vitals` package directly):
// ----------------------------------------------------------------
// `next/web-vitals` ships as part of Next 14 — zero new dependencies,
// zero bundle bloat. The hook fires inside the App Router lifecycle
// so we get one report per metric per route change, no manual
// disconnect/reconnect needed for SPA-style transitions.
//
// Consent gating:
// ---------------
// We mount this component only when the consent cookie allows
// analytics (see app/layout.tsx — same gate as GA4 itself). If the
// gate flips to `false` mid-session via the cookie banner, the next
// page load won't render this component at all. No background timer,
// no leftover listener.
//
// Why we forward via `window.gtag` instead of fetch:
// --------------------------------------------------
// The GA4 library handles batching, sampling, and offline-replay.
// Doing our own POST to /api/vitals would mean either dropping events
// when offline (worse than current behavior) or building the same
// batching logic GA4 already has.

import { useReportWebVitals } from "next/web-vitals";

/**
 * Forwards CWV measurements to GA4.
 *
 * Only mount this when analytics consent has been granted — see
 * app/layout.tsx for the gate. Renders nothing.
 */
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    // gtag may not be loaded yet (lazyOnload + slow network). Buffer
    // through dataLayer.push instead so the queued event flushes
    // when GA4 finishes initialising.
    if (typeof window === "undefined") return;
    const dataLayer = (window as unknown as { dataLayer?: unknown[] }).dataLayer;
    if (!Array.isArray(dataLayer)) return;

    // GA4 numeric-metric convention: round CLS to 4 decimals, others
    // to integer milliseconds. CLS is unitless; everything else is ms.
    const value =
      metric.name === "CLS"
        ? Math.round(metric.value * 10000) / 10000
        : Math.round(metric.value);

    dataLayer.push({
      event: "web_vitals",
      metric_name: metric.name,
      metric_value: value,
      metric_id: metric.id,
      // metric.rating is "good" | "needs-improvement" | "poor" — useful
      // in Looker for percentile pivots without re-bucketing in code.
      metric_rating: (metric as { rating?: string }).rating ?? "unknown",
      // Provide non_interaction so these events don't inflate
      // engaged-session counts (Lighthouse-style measurement signal,
      // not a user interaction we want to mistake for engagement).
      non_interaction: true,
    });
  });

  return null;
}
