import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/LegalPage";
import { LEGAL_DOCS } from "@/lib/legal-docs";
import { DEFAULT_OG_IMAGES } from "@/lib/og-defaults";

const doc = LEGAL_DOCS.terms;

export const metadata: Metadata = {
  title: doc.title,
  description: doc.intro,
  alternates: { canonical: "/terms" },
  openGraph: {
    title: doc.title,
    description: doc.intro,
    url: "/terms",
    type: "website",
    images: DEFAULT_OG_IMAGES,
  },
  twitter: {
    card: "summary_large_image",
    title: doc.title,
    description: doc.intro,
    images: DEFAULT_OG_IMAGES.map((i) => i.url),
  },
};

export default function Page() {
  return <LegalPage slug="terms" doc={doc} />;
}
