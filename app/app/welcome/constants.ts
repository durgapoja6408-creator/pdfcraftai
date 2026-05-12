// app/app/welcome/constants.ts
//
// 2026-05-12 — PENDING_WORK_ANALYSIS §7c. Cookie name + greeting
// strings extracted to a non-page module because Next.js App Router
// only allows whitelisted exports (default, metadata, dynamic, ...)
// from `page.tsx`. The `next-page-exports` CI guard catches arbitrary
// exports from page files and forces this pattern. The constants live
// here so tests can import them without going through the page module.

// Name of the cookie that marks a user as having seen the welcome
// page at least once. Read by app/app/welcome/page.tsx to decide
// between the first-visit greeting ("Welcome, $name!") and the
// returning-user greeting ("Welcome back, $name."). Written by the
// MarkWelcomeSeen client component on mount.
export const WELCOME_SEEN_COOKIE = "pcai_seen_welcome";
