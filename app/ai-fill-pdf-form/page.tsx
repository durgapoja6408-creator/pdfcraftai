import type { Metadata } from "next";
import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { SEO_PAGES } from "@/lib/seo-pages";

const data = SEO_PAGES["ai-fill-pdf-form"];

const ogImage = `/og?title=${encodeURIComponent(data.h1)}&subtitle=${encodeURIComponent(data.sub)}`;

export const metadata: Metadata = {
  title: data.h1,
  description: data.sub,
  alternates: { canonical: data.canonical },
  openGraph: {
    title: data.h1,
    description: data.sub,
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    images: [ogImage],
  },
};

export default function Page() {
  return <SeoLandingPage data={data} />;
}
