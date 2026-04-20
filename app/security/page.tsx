import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/LegalPage";
import { LEGAL_DOCS } from "@/lib/legal-docs";

const doc = LEGAL_DOCS.security;

export const metadata: Metadata = {
  title: `${doc.title} — pdfcraft ai`,
  description: doc.intro,
  alternates: { canonical: "/security" },
  openGraph: {
    title: `${doc.title} — pdfcraft ai`,
    description: doc.intro,
    url: "/security",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${doc.title} — pdfcraft ai`,
    description: doc.intro,
  },
};

export default function Page() {
  return <LegalPage slug="security" doc={doc} />;
}
