"use client";

// app/app/welcome/MarkWelcomeSeen.tsx
//
// 2026-05-12 — PENDING_WORK_ANALYSIS §7c (no first-time onboarding):
// tiny client component that stamps `pcai_seen_welcome=1` on the
// document cookie store on first mount. The /welcome page itself is
// a server component; the cookie set has to happen client-side
// because Next.js 14 server components cannot mutate cookies
// (Server Actions / Route Handlers are the only mutating surfaces).
//
// `max-age=31536000` (one year) so a returning user reliably reads
// the post-onboarding greeting variant. `path=/` so the cookie is
// available to any future server component that wants to gate
// behavior on "has the user seen the welcome page yet". `samesite=lax`
// is the default behaviour Chrome/Safari/Firefox enforce on cookies
// without an explicit attribute; setting it explicitly keeps the
// intent visible in code review.
//
// The component renders nothing — it exists purely for the useEffect
// side-effect of setting the cookie. The empty fragment-via-null
// return is idiomatic for "client-only side-effect hook component".

import { useEffect } from "react";

export function MarkWelcomeSeen() {
  useEffect(() => {
    document.cookie =
      "pcai_seen_welcome=1; max-age=31536000; path=/; samesite=lax";
  }, []);
  return null;
}
