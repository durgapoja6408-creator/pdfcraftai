// Build 2 (2026-04-27): SEO landing route for "PDF to Text".
// Pairs with the runner at /tool/pdf-to-text. Pulls H1/sub/howTo/FAQ
// from SEO_PAGES (already populated from the earlier SEO push), so
// this route file is a thin 14-line wrapper using SeoLandingPage.

import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { SEO_PAGES } from "@/lib/seo-pages";

const data = SEO_PAGES["pdf-to-text"];

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
