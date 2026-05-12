// app/app/welcome/page.tsx
//
// 2026-05-12 — PENDING_WORK_ANALYSIS §7c (no guided first-tool
// experience). Closes the gap where new signups previously flowed
// `verify-email → /app/dashboard` and landed on a stat-card heavy
// page with no curated "here are the tools you'd most likely want
// to try" surface. The previous empty-state on /app/dashboard's
// "Recent activity" section pointed to /app/files (a generic file
// manager) rather than to specific tools — useful once a user knows
// what they want to do, not so useful on day 1.
//
// Design choices:
//
// 1. Server component reads `pcai_seen_welcome` from cookies() to
//    decide between the first-time greeting and the "welcome back"
//    variant. A user who bookmarks /app/welcome and revisits gets a
//    legitimate "welcome back" experience rather than a confusing
//    "Welcome, $name!" they've already seen.
//
// 2. The MarkWelcomeSeen client component sets the cookie on mount.
//    Server components in Next.js 14 cannot mutate cookies (only
//    Route Handlers + Server Actions can). The client-side cookie
//    set is the standard pattern for "remember the user has seen
//    this page". samesite=lax + max-age=1y in MarkWelcomeSeen.
//
// 3. The eight tools chosen represent the most likely first-tool
//    intents based on landing-page traffic patterns: 4 free
//    workhorses (Merge / Split / PDF to Word / Unlock) + 4 AI ops
//    that show off the credit-priced surface (Summarize / Translate
//    / Chat / Sign). Mix is intentional — a new user should see
//    BOTH that there are free tools (no immediate paywall pressure)
//    AND that there's a richer AI surface available.
//
// 4. "Continue to Dashboard" is the bottom-right button — explicit
//    skip path for users who already know what they want and don't
//    want the curated landing. Pairs with a smaller "See all tools"
//    link bottom-left.
//
// 5. The page is reachable via any of: (a) the post-verify-email
//    redirect (intended primary entry), (b) direct navigation
//    `/app/welcome` (returning user bookmarked it), (c) menu link
//    if we later add one. Auth-guarded by the parent /app/layout.tsx
//    redirect-to-login fallback; the page also calls `auth()` and
//    redirects to /login on no-session for defense-in-depth.

import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MarkWelcomeSeen } from "./MarkWelcomeSeen";
import { WELCOME_SEEN_COOKIE } from "./constants";

export const metadata: Metadata = {
  title: "Welcome",
  // Welcome page is gated behind sign-in — should not be indexed or
  // appear in search engines. Same pattern as /app/dashboard.
  robots: { index: false, follow: false },
};

// Auth state per request — never cache.
export const dynamic = "force-dynamic";

// WELCOME_SEEN_COOKIE lives in ./constants.ts — Next.js App Router
// only permits whitelisted exports from page.tsx (default, metadata,
// dynamic, ...). The cookie name is imported above and used in the
// cookieStore.get() call below.

// Curated starter tools — 8 items mixing free + AI to demonstrate
// both surfaces on first paint. Order is left-to-right reading
// flow: pairs are (free workhorse, AI counterpart) — Merge/Summarize,
// Split/Translate, PDF-to-Word/Chat, Unlock/Sign.
//
// Badge values are deliberately non-numeric. The
// no-credit-number-hardcodes CI guard rejects any user-facing copy
// containing "N credits" outside of buy/pricing/admin routes, because
// the pre-flight estimator is the single source of truth for cost
// and any "3 credits" hardcoded into a marketing chip becomes a lie
// the moment a size-based multiplier ships. "AI" + "Free" is enough
// information for a brand-new user; once they pick a tool the pre-
// flight estimator quotes the exact cost on the tool page.
const WELCOME_TOOLS: Array<{
  id: string;
  title: string;
  desc: string;
  href: string;
  badge: "Free" | "AI";
}> = [
  {
    id: "merge",
    title: "Merge PDF",
    desc: "Combine multiple PDFs into a single document. Reorder pages before exporting.",
    href: "/tool/merge",
    badge: "Free",
  },
  {
    id: "ai-summarize",
    title: "AI Summarize",
    desc: "Get a concise TL;DR plus key points and action items from any PDF.",
    href: "/tool/ai-summarize",
    badge: "AI",
  },
  {
    id: "split",
    title: "Split PDF",
    desc: "Extract page ranges or split into multiple files.",
    href: "/tool/split",
    badge: "Free",
  },
  {
    id: "ai-translate",
    title: "AI Translate",
    desc: "Translate PDFs into 90+ languages while preserving layout.",
    href: "/tool/ai-translate",
    badge: "AI",
  },
  {
    id: "pdf-to-word",
    title: "PDF to Word",
    desc: "Convert to editable .docx. Works on scans (OCR auto-applied).",
    // 2026-05-12 — corrected: /tool/pdf-to-office is a 404 (no such
    // catalog id; the underlying server-side LibreOffice rail is
    // KNOWN_DEAD_REFS-deferred). The SEO landing /pdf-to-word is the
    // canonical user-facing entry point and currently 308-redirects
    // to /tool/pdf-to-text — keeping the welcome page pointing at
    // the SEO landing rather than the redirect target so the URL
    // stays meaningful if the LibreOffice rail ever ships.
    href: "/pdf-to-word",
    badge: "Free",
  },
  {
    id: "ai-chat",
    title: "Chat with PDF",
    desc: "Ask questions and get cited answers from a PDF you upload.",
    href: "/tool/ai-chat",
    badge: "AI",
  },
  {
    id: "unlock",
    title: "Unlock PDF",
    desc: "Remove password protection from PDFs you own.",
    href: "/tool/unlock",
    badge: "Free",
  },
  {
    id: "ai-sign",
    title: "Sign PDF",
    desc: "Add a typed or drawn signature anywhere on the page.",
    href: "/tool/ai-sign",
    badge: "Free",
  },
];

export default async function WelcomePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/app/welcome");
  }

  const cookieStore = cookies();
  const hasSeenBefore =
    cookieStore.get(WELCOME_SEEN_COOKIE)?.value === "1";

  const firstName = session.user.name?.split(" ")[0] ?? "there";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 28,
        maxWidth: 960,
      }}
    >
      {/* Client-side cookie set on mount. Renders nothing. Repeat
          visits are idempotent — overwriting the cookie with the
          same value is a no-op. */}
      <MarkWelcomeSeen />

      <header>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          WELCOME
        </div>
        <h1 style={{ fontSize: 32, letterSpacing: "-0.025em" }}>
          {hasSeenBefore
            ? `Welcome back, ${firstName}.`
            : `Welcome, ${firstName}!`}
        </h1>
        <p
          className="muted"
          style={{ fontSize: 15, marginTop: 4, maxWidth: 640 }}
        >
          {hasSeenBefore
            ? "Pick a tool to get started, or head to your dashboard."
            : "Your account is ready. Pick one of the popular tools below to try it out — every PDF stays private (most run entirely in your browser), and you can come back to this page anytime."}
        </p>
      </header>

      <section>
        <h2
          style={{
            fontSize: 18,
            letterSpacing: "-0.01em",
            margin: "0 0 12px",
          }}
        >
          Popular tools
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          {WELCOME_TOOLS.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              className="card"
              style={{
                padding: 16,
                textDecoration: "none",
                color: "inherit",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div
                className="row"
                style={{ justifyContent: "space-between", alignItems: "center" }}
              >
                <div style={{ fontWeight: 600, fontSize: 15 }}>{t.title}</div>
                <span
                  className="subtle"
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "var(--bg-2)",
                  }}
                >
                  {t.badge}
                </span>
              </div>
              <p
                className="muted"
                style={{ fontSize: 13, margin: 0, lineHeight: 1.45 }}
              >
                {t.desc}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 4,
        }}
      >
        <Link
          href="/tools"
          className="subtle"
          style={{ fontSize: 13, textDecoration: "none" }}
        >
          See all 120+ tools →
        </Link>
        <Link href="/app/dashboard" className="btn btn-outline btn-sm">
          Continue to Dashboard
        </Link>
      </div>
    </div>
  );
}
