import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { MarketingChrome } from "@/components/nav/MarketingChrome";
import { SessionProviderWrapper } from "@/components/providers/SessionProviderWrapper";
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
  openGraph: {
    type: "website",
    siteName: "pdfcraft ai",
    title: "pdfcraft ai — Every PDF tool you need",
    description:
      "Every PDF tool you need. Plus the ones you didn't know existed.",
  },
  twitter: {
    card: "summary_large_image",
    title: "pdfcraft ai",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
        <SessionProviderWrapper>
          <MarketingChrome>{children}</MarketingChrome>
        </SessionProviderWrapper>

        {/*
          Google Analytics (GA4) + Microsoft Clarity — both load with
          strategy="lazyOnload" so they never block LCP / TBT on the
          critical path. Page-view tracking still captures every visit
          because these fire once the browser's idle, which is well
          before the user bounces.
        */}
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
      </body>
    </html>
  );
}
