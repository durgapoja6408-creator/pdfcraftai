import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UseCasePage } from "@/components/marketing/UseCasePage";
import { USE_CASES, USE_CASE_SLUGS, type UseCaseSlug } from "@/lib/use-cases";

export function generateStaticParams() {
  return USE_CASE_SLUGS.map((slug) => ({ slug }));
}

type Props = { params: { slug: string } };

export function generateMetadata({ params }: Props): Metadata {
  const slug = params.slug as UseCaseSlug;
  const data = USE_CASES[slug];
  if (!data) return {};
  const ogImage = `/og?title=${encodeURIComponent(data.h1)}&subtitle=${encodeURIComponent(data.sub)}`;
  return {
    title: data.h1,
    description: data.sub,
    alternates: { canonical: `/use-cases/${slug}` },
    openGraph: {
      title: data.h1,
      description: data.sub,
      url: `/use-cases/${slug}`,
      type: "article",
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      images: [ogImage],
    },
  };
}

export default function Page({ params }: Props) {
  const slug = params.slug as UseCaseSlug;
  const data = USE_CASES[slug];
  if (!data) notFound();
  return <UseCasePage data={data} />;
}
