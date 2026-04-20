import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/LegalPage";
import { LEGAL_DOCS } from "@/lib/legal-docs";

const doc = LEGAL_DOCS["cancellation-policy"];

export const metadata: Metadata = {
  title: doc.title,
  description: doc.intro,
  alternates: { canonical: "/cancellation-policy" },
  openGraph: {
    title: doc.title,
    description: doc.intro,
    url: "/cancellation-policy",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: doc.title,
    description: doc.intro,
  },
};

export default function Page() {
  return <LegalPage slug="cancellation-policy" doc={doc} />;
}
