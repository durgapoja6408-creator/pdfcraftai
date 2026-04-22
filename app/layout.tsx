import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { MarketingChrome } from "@/components/nav/MarketingChrome";
import { SessionProviderWrapper } from "@/components/providers/SessionProviderWrapper";
import { CookieConsent } from "@/components/compliance/CookieConsent";
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
  },
  twitter: {
    card: "summary_large_image",
    title: {
      default: "pdfcraft ai — Every PDF tool you need",
      template: "%s · pdfcraft ai",
    },
    description: "Every PDF tool you need. Plus the ones you didn't know existed.",
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
      </head>
      <body className="font-sans antialiased">
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
          <MarketingChrome>{children}</MarketingChrome>
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
          </>
        ) : null}
      </body>
    </html>
  );
}
