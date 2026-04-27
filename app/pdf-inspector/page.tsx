// app/pdf-inspector/page.tsx
//
// Inspector P2 (2026-04-27): brand-alias SEO landing for the
// "PDF inspector" search term. Pairs with the runner at
// /tool/page-count (which stays put to preserve ranking equity for
// "page count" queries).
//
// Why a separate landing instead of just renaming the runner URL:
//   - "page count" is the higher-volume search term and our existing
//     ranker — moving the URL would 301 us out of those rankings
//     for ~3 months and lose 10–15% of link equity in transit
//   - "pdf inspector" is the higher-intent term that matches the
//     product name — having a clean landing for it lets us rank for
//     that keyword without sacrificing the other
//   - Best of both: two landings (one keyword each), both 200, both
//     point at the same runner via "Open the tool →" CTA
//
// Net effect: typing "pdf inspector" into Google now lands the user
// on a URL that matches the visible product name. Typing "page count"
// keeps landing on /pdf-page-count or /tool/page-count, both of which
// already rank well.

import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { SEO_PAGES } from "@/lib/seo-pages";

const data = SEO_PAGES["pdf-inspector"];

export const metadata: Metadata = {
  title: data.h1,
  description: data.sub,
  alternates: { canonical: data.canonical },
  openGraph: {
    title: data.h1,
    description: data.sub,
    url: data.canonical,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: data.h1,
    description: data.sub,
  },
};

export default function Page() {
  return <SeoLandingPage data={data} />;
}
