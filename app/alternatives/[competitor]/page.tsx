import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlternativePage } from "@/components/marketing/AlternativePage";
import {
  COMPETITORS,
  COMPETITOR_SLUGS,
  type CompetitorSlug,
} from "@/lib/alternatives";

// Static-generate every comparison page at build time. They're pure
// content with zero runtime data, so SSG is the right call — Cloudflare
// caches them, the first byte is instant, and the JSON-LD lands in the
// initial HTML so Google sees it on the first crawl.
export function generateStaticParams() {
  return COMPETITOR_SLUGS.map((slug) => ({ competitor: slug }));
}

type Props = { params: { competitor: string } };

export function generateMetadata({ params }: Props): Metadata {
  const slug = params.competitor as CompetitorSlug;
  const data = COMPETITORS[slug];
  if (!data) return {};

  const title = `${data.name} alternative — pdfcraft ai vs ${data.name}`;
  const description = `Honest, side-by-side comparison of pdfcraft ai vs ${data.name}: feature matrix, pricing, where each one wins, and a step-by-step migration guide for common workflows.`;

  return {
    title,
    description,
    alternates: { canonical: `/alternatives/${slug}` },
    openGraph: {
      title,
      description,
      url: `/alternatives/${slug}`,
      type: "website",
    },
  };
}

export default function Page({ params }: Props) {
  const slug = params.competitor as CompetitorSlug;
  const data = COMPETITORS[slug];
  if (!data) notFound();
  return <AlternativePage data={data} />;
}
