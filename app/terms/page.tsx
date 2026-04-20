import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/LegalPage";
import { LEGAL_DOCS } from "@/lib/legal-docs";

const doc = LEGAL_DOCS.terms;

export const metadata: Metadata = {
  title: `${doc.title} — pdfcraft ai`,
  description: doc.intro,
  alternates: { canonical: "/terms" },
  openGraph: {
    title: `${doc.title} — pdfcraft ai`,
    description: doc.intro,
    url: "/terms",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${doc.title} — pdfcraft ai`,
    description: doc.intro,
  },
};

export default function Page() {
  return <LegalPage slug="terms" doc={doc} />;
}
