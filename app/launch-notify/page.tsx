import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { LaunchNotifySignup } from "@/components/geo/LaunchNotifySignup";
import { pageMetadata } from "@/lib/page-metadata";

/**
 * /launch-notify — dedicated landing page for the proactive Tier-2
 * "notify me when you launch" signup (Task #3 sub-item 4b —
 * docs/GEO_LAUNCH_POLICY.md §4).
 *
 * Why a dedicated page in addition to the /pricing embed:
 *   - A permalink we can paste into emails/Slack when someone asks "when
 *     will you launch in [country]?" — the /pricing embed is buried mid-page.
 *   - A terminal URL for the checkout-defer flow: if a Tier-2 visitor is
 *     turned away at checkout and wants to share the waitlist with a
 *     colleague, they can hand over this URL rather than the scroll-depth
 *     anchor on /pricing.
 *   - Lets PM A/B-test dedicated-page framing against the pricing-embed
 *     framing by directing ads to different `source` values —
 *     `launch_notify_page` vs `pricing_country_picker` shows the split
 *     in `geo_waitlist.source`.
 *
 * Source attribution:
 *   - The component is rendered with `source="launch_notify_page"`. That
 *     literal is pinned by scripts/test-geo-waitlist.mjs so PM's analytics
 *     queries keep working across refactors.
 *
 * Static rendering:
 *   - This page is a plain server component (no `"use client"` — the
 *     interactive bit lives inside `LaunchNotifySignup`). Next.js will
 *     statically generate it, same as /pricing. We deliberately do NOT
 *     read `CF-IPCountry` here; auto-preselecting the visitor's country
 *     requires a dynamic render and a server-component wrapper, and we'd
 *     rather ship the permalink today than wait on that. Follow-up can
 *     add a `?country=XX` query-string prefill (still static-safe via
 *     searchParams) if we want to hot-link from campaign emails.
 *
 * SEO posture:
 *   - `robots: { index: false, follow: true }` — this is a utility
 *     signup page, not a page we want Google to rank against "pdfcraftai
 *     pricing" or "pdfcraftai [country]". `follow: true` so outbound
 *     links on the page (privacy, /register for Tier-1 visitors who
 *     landed here by mistake) still transfer their signal.
 *   - The canonical path is set anyway so that if someone does deep-link
 *     with a tracking query string, search engines collapse to the bare
 *     URL.
 */

export const metadata = pageMetadata({
  title: "Launch waitlist — pdfcraftai.com",
  description:
    "Not in a supported region yet? Tell us your country and we'll email you the moment pdfcraftai.com launches there. One email only, no newsletter.",
  canonical: "/launch-notify",
  og: {
    title: "Be the first to know when pdfcraftai.com launches in your country",
    description:
      "Pick your country. We'll email you once, the moment we go live there. No newsletter, no spam.",
  },
  // Utility page — we don't want this competing with pricing / home in
  // search. Links (privacy policy, /register) still transfer signal via
  // follow:true. See the pageMetadata docstring for why this goes here
  // instead of being a separate `export const robots`.
  robots: { index: false, follow: true },
});

export default function LaunchNotifyPage() {
  return (
    <main>
      {/* ===== Hero ===== */}
      <section style={{ paddingTop: 96, paddingBottom: 40 }}>
        <div
          className="container-x"
          style={{ padding: "0 28px", maxWidth: 780, textAlign: "center" }}
        >
          <div
            className="eyebrow"
            style={{
              marginBottom: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <I.Globe size={14} />
            LAUNCH WAITLIST
          </div>
          <h1
            style={{
              fontSize: 48,
              letterSpacing: "-0.03em",
              lineHeight: 1.08,
              margin: 0,
            }}
          >
            We&apos;ll email you the moment we launch in your country.
          </h1>
          <p
            className="muted"
            style={{
              fontSize: 18,
              maxWidth: 620,
              margin: "20px auto 0",
              lineHeight: 1.55,
            }}
          >
            pdfcraftai.com rolls out country-by-country as local tax and
            compliance work finishes. Tell us where you are and we&apos;ll
            send exactly one email — the day we go live there.
          </p>
        </div>
      </section>

      {/* ===== Signup card ===== */}
      <section style={{ paddingTop: 8 }}>
        <div
          className="container-x"
          style={{ padding: "0 28px", maxWidth: 780 }}
        >
          <LaunchNotifySignup
            source="launch_notify_page"
            heading="Which country are you in?"
            subheading="Pick your country. We'll email you the moment we launch there. One email, no newsletter."
          />
        </div>
      </section>

      {/* ===== Promise strip (what this waitlist actually is) ===== */}
      <section style={{ paddingTop: 64 }}>
        <div
          className="container-x"
          style={{ padding: "0 28px", maxWidth: 960 }}
        >
          <div className="eyebrow" style={{ marginBottom: 8, textAlign: "center" }}>
            WHAT YOU&apos;RE SIGNING UP FOR
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 14,
              marginTop: 20,
            }}
          >
            <PromiseCard
              icon="Bell"
              title="One email, then silence"
              body="You'll get exactly one message — the day pdfcraftai.com goes live in your country. We don't add you to a newsletter, digest, or product announcement list."
            />
            <PromiseCard
              icon="Lock"
              title="Your address doesn't go anywhere else"
              body="We store your email, country, and the date you signed up. That's it. No profile enrichment, no ad retargeting, no third-party sharing. See our privacy policy for details."
            />
            <PromiseCard
              icon="Check"
              title="Unsubscribe at any time"
              body="Reply to support@pdfcraftai.com with the word 'remove' and we'll delete your row before launch day. No link-chasing, no dark patterns."
            />
          </div>
        </div>
      </section>

      {/* ===== Already-supported visitor fallback ===== */}
      <section style={{ paddingTop: 56, paddingBottom: 120 }}>
        <div
          className="container-x"
          style={{ padding: "0 28px", maxWidth: 780 }}
        >
          <div
            className="card"
            style={{
              padding: 20,
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
              background: "var(--bg-2)",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "var(--accent-soft)",
                color: "var(--accent)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <I.Info size={14} />
            </span>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>
                Your country isn&apos;t in the picker?
              </div>
              <p className="muted" style={{ margin: 0 }}>
                It means we&apos;re already live there. You can{" "}
                <Link
                  href="/register"
                  style={{ color: "var(--accent)" }}
                >
                  create your account
                </Link>{" "}
                and start using the tools right now — no waiting. If
                something still blocks checkout, email{" "}
                <a
                  href="mailto:support@pdfcraftai.com"
                  className="mono"
                  style={{ color: "var(--accent)" }}
                >
                  support@pdfcraftai.com
                </a>{" "}
                and we&apos;ll look at it.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function PromiseCard({
  icon,
  title,
  body,
}: {
  icon: keyof typeof I;
  title: string;
  body: string;
}) {
  const Ic = I[icon];
  return (
    <div className="card" style={{ padding: 20 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "var(--accent-soft)",
          color: "var(--accent)",
          display: "grid",
          placeItems: "center",
          marginBottom: 12,
        }}
      >
        <Ic size={18} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>
        {title}
      </div>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
        {body}
      </div>
    </div>
  );
}
