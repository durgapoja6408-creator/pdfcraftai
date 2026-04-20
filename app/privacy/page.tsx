import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/LegalPage";
import { LEGAL_DOCS } from "@/lib/legal-docs";

const doc = LEGAL_DOCS.privacy;

export const metadata: Metadata = {
  title: `${doc.title} — pdfcraft ai`,
  description: doc.intro,
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: `${doc.title} — pdfcraft ai`,
    description: doc.intro,
    url: "/privacy",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${doc.title} — pdfcraft ai`,
    description: doc.intro,
  },
};

export default function Page() {
  return <LegalPage slug="privacy" doc={doc} />;
}
