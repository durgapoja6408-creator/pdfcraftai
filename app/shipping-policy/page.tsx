import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/LegalPage";
import { LEGAL_DOCS } from "@/lib/legal-docs";

const doc = LEGAL_DOCS["shipping-policy"];

export const metadata: Metadata = {
  title: doc.title,
  description: doc.intro,
  alternates: { canonical: "/shipping-policy" },
  openGraph: {
    title: doc.title,
    description: doc.intro,
    url: "/shipping-policy",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: doc.title,
    description: doc.intro,
  },
};

export default function Page() {
  return <LegalPage slug="shipping-policy" doc={doc} />;
}
