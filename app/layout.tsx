import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { MarketingChrome } from "@/components/nav/MarketingChrome";
import { SessionProviderWrapper } from "@/components/providers/SessionProviderWrapper";
import { CookieConsent } from "@/components/compliance/CookieConsent";
import { WebVitalsReporter } from "@/components/analytics/WebVitalsReporter";
import { PdfiumServiceWorker } from "@/components/PdfiumServiceWorker";
import {
  CONSENT_COOKIE_NAME,
  analyticsAllowed,
  parseConsent,
} from "@/lib/compliance/consent";
import { auth } from "@/auth";
import "./globals.css";

const GA_MEASUREMENT_ID = "G-2Y8PS0S93F";
const CLARITY_PROJECT_ID = "wcsbv536zv";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://pdfcraftai.com"),
  title: {
    default: "pdfcraft ai — Every PDF tool you need",
    template: "%s · pdfcraft ai",
  },
  description:
    "Merge, split, convert, compress — always free. Chat, summarize, translate, redact with AI — pay only for what you use.",
  // openGraph.title + twitter.title use the same `{ default, template }`
  // shape as the root title. Next.js applies the template when a child
  // page sets `title: "About"` so og:title / twitter:title resolve to
  // "About · pdfcraft ai" without every page needing to repeat itself.
  // Pages can still fully override openGraph / twitter when they need
  // a bespoke share card (hero images, long-form descriptions, etc.).
  // Fixes SEV-2 from the 2026-04-20 production readiness audit.
  openGraph: {
    type: "website",
    siteName: "pdfcraft ai",
    title: {
      default: "pdfcraft ai — Every PDF tool you need",
      template: "%s · pdfcraft ai",
    },
    description:
      "Every PDF tool you need. Plus the ones you didn't know existed.",
    // Static public/og.png shipped in the repo. Pre-rendered 1200x630
    // at build time so there's no runtime / build-time font fetch
    // (which is what blew up Task #74's dynamic ImageResponse
    // approach on Hostinger). Every page inherits this card unless
    // it sets openGraph.images itself.
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "pdfcraft ai — Every PDF tool you need. Plus the ones you didn't know existed.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: {
      default: "pdfcraft ai — Every PDF tool you need",
      template: "%s · pdfcraft ai",
    },
    description: "Every PDF tool you need. Plus the ones you didn't know existed.",
    images: [
      {
        url: "/og.png",
        alt: "pdfcraft ai — Every PDF tool you need.",
      },
    ],
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#1a1c24" },
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Pre-resolve the session on the server so the client `<SessionProvider>`
  // hydrates with state already populated. Without this, next-auth/react
  // fires a `/api/auth/session` fetch on mount for every page hit, even
  // logged-out ones, which was costing ~150–300 ms of TBT on the home
  // page Lighthouse run.
  //
  // `auth()` is the NextAuth v5 helper. For logged-out visitors it
  // resolves to `null` essentially for free (no DB hit — JWT decode on
  // the session cookie, which is absent). For logged-in visitors it
  // returns the session object we'd have fetched on the client anyway.
  const session = await auth();

  // Task #24 — cookie-gated analytics.
  //
  // Read the first-party `pdfcraft_consent` cookie and resolve it to
  // one of "none" | "essential" | "all". The GA4 + Clarity `<Script>`
  // tags below only render when the level is "all". "none" (not yet
  // chosen) and "essential" (explicitly rejected) both suppress
  // analytics. The consent banner component is always rendered but
  // hides itself when a choice has been made.
  //
  // Reading cookies via `next/headers` would mark this layout as
  // dynamic — but `auth()` above already does, so there's no new
  // cost. Next.js App Router streams the layout regardless.
  const consentCookie = cookies().get(CONSENT_COOKIE_NAME)?.value ?? null;
  const consentLevel = parseConsent(consentCookie);
  const analyticsOn = analyticsAllowed(consentLevel);

  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Warm the handshake for analytics hosts well before the
          lazyOnload scripts fire. dns-prefetch is cheap; preconnect
          adds TLS handshake bandwidth but shaves ~150ms off the first
          analytics payload on mobile.
        */}
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.clarity.ms" />
        <link rel="preconnect" href="https://www.googletagmanager.com" crossOrigin="" />
        {/*
          SEO Ship #6 (2026-04-25): preconnect to AI provider endpoints
          so the TLS handshake is warm by the time a paid AI tool fires
          its first request. Cuts ~150-300ms off TTFB on AI ops, which
          shows up directly in Largest Contentful Paint for tool pages
          where the model output is the LCP element.
          We use dns-prefetch (cheap) for both, and preconnect only on
          the OpenAI host since Anthropic doesn't currently take user
          requests directly from the browser (we route via our API).
        */}
        <link rel="dns-prefetch" href="https://api.openai.com" />
        <link rel="dns-prefetch" href="https://api.anthropic.com" />
        {/*
          Site-wide JSON-LD (Task #72). Two types in one block:
          - Organization: identifies the brand entity to Google so it
            can build a Knowledge Panel and connect signals across
            social/citations.
          - WebSite with potentialAction: enables a Sitelinks Search
            Box in SERPs ("search pdfcraft ai" surfaces the search
            field directly under our SERP entry).
          Per-page HowTo + FAQPage + SoftwareApplication blocks live
          on the SEO landings via SeoLandingPage.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": "https://pdfcraftai.com/#org",
                  name: "pdfcraft ai",
                  url: "https://pdfcraftai.com",
                  logo: "https://pdfcraftai.com/icon.png",
                  description:
                    "Every PDF tool you need — free forever for the basics, AI-enhanced for the advanced.",
                },
                {
                  "@type": "WebSite",
                  "@id": "https://pdfcraftai.com/#website",
                  url: "https://pdfcraftai.com",
                  name: "pdfcraft ai",
                  publisher: { "@id": "https://pdfcraftai.com/#org" },
                  potentialAction: {
                    "@type": "SearchAction",
                    target: {
                      "@type": "EntryPoint",
                      urlTemplate:
                        "https://pdfcraftai.com/tools?q={search_term_string}",
                    },
                    "query-input": "required name=search_term_string",
                  },
                },
              ],
            }),
          }}
        />
      </head>
      <body className="font-sans antialiased">
        {/*
          Skip-to-main-content link — WCAG 2.1 SC 2.4.1 "Bypass Blocks"
          (Level A). Task #31. CSS-only focus/blur handling (no JS
          handlers) so this works in a server component + works when
          JavaScript is disabled. The .skip-link class is defined in
          app/globals.css with `transform: translateY(-100%)` by
          default and `transform: translateY(0)` on :focus.
        */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {/* Prevent theme flash: apply stored theme before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { try {
              const s = JSON.parse(localStorage.getItem('pdfcraft_state') || '{}');
              if (s.theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
            } catch (_) {} })();`,
          }}
        />
        <SessionProviderWrapper session={session}>
          <MarketingChrome>
            {/*
              Skip-link target. Wrap children in a focusable div so the
              skip-link anchor (#main-content) lands somewhere the
              browser can move focus to. tabIndex={-1} makes it
              programmatically focusable but not in the natural tab
              order, so it doesn't disrupt normal keyboard flow.
              Screen readers will announce the page region change.
            */}
            <div id="main-content" tabIndex={-1} style={{ outline: "none" }}>
              {children}
            </div>
          </MarketingChrome>
        </SessionProviderWrapper>

        {/*
          Cookie consent banner — renders for visitors with
          consentLevel === "none" (no cookie set yet). Hides itself
          when the user has already chosen "essential" or "all".
          Writes the cookie on the client and triggers a reload so
          the server re-resolves the analytics gate below.
        */}
        <CookieConsent initialLevel={consentLevel} />

        {/*
          Google Analytics (GA4) + Microsoft Clarity — both load with
          strategy="lazyOnload" so they never block LCP / TBT on the
          critical path.

          Task #24: these are now CONSENT-GATED. They only emit to
          the DOM when the visitor has explicitly accepted analytics
          cookies ("all"). For "none" (not yet chosen) and "essential"
          (rejected), we render nothing — no beacons, no cookies,
          no network calls to googletagmanager.com or clarity.ms.

          This is the minimum required by GDPR Art. 6(1)(a) + ePrivacy
          Directive Art. 5(3) (EU/UK) and the DPDP Act 2023 s. 6
          (India). See lib/compliance/consent.ts for the full
          rationale.
        */}
        {analyticsOn ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="lazyOnload"
            />
            <Script id="ga4-init" strategy="lazyOnload">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: true });
              `}
            </Script>

            <Script id="ms-clarity-init" strategy="lazyOnload">
              {`
                (function(c,l,a,r,i,t,y){
                  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
                })(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");
              `}
            </Script>
            {/*
              Bundle C — Web Vitals real-user monitoring. Pushes LCP /
              INP / CLS / FCP / TTFB measurements through dataLayer so
              GA4 can stream them to Looker Studio. Only mounts when
              analytics consent has been granted (same gate as GA4
              itself). See components/analytics/WebVitalsReporter.tsx
              for the full rationale.
            */}
            <WebVitalsReporter />
          </>
        ) : null}
        {/* M23 (#193, 2026-04-29): register the PDFium WASM service
            worker. Single-purpose — caches /pdfium.wasm only. Saves
            ~4MB of repeat downloads for users who hit multiple tools
            within a session OR return after the browser HTTP cache
            evicted (mobile Safari is aggressive about this). Runs
            outside the consent gate because it's not analytics — it
            doesn't observe or report user activity. */}
        <PdfiumServiceWorker />
      </body>
    </html>
  );
}
