// Build 2 Wave 2 (2026-04-27): SEO landing route for "PDF to JPG".

import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { SEO_PAGES } from "@/lib/seo-pages";

const data = SEO_PAGES["pdf-to-jpg"];

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
