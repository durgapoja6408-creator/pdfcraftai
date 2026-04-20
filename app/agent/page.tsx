// app/agent/page.tsx
// Public Agent demo page. Server component that owns SEO metadata; mounts the
// client-side <AgentInteractive/> below. The marketing prose around it has
// been moved INTO the interactive component so the prompt box is the hero.
// Keep this file a server component — do not add "use client".

import type { Metadata } from "next";
import { Suspense } from "react";
import AgentInteractive from "@/components/agent/AgentInteractive";

export const metadata: Metadata = {
  title: "Agent Mode — describe the outcome, skip the steps",
  description:
    "Agent Mode plans and runs multi-tool PDF workflows from a single prompt. OCR → categorize → redact → summarize → send, with visible cost and an audit trail.",
  openGraph: {
    title: "Agent Mode · pdfcraft ai",
    description:
      "Describe the outcome. Agent plans the steps, shows the cost, and runs it end-to-end.",
    url: "/agent",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Mode · pdfcraft ai",
    description:
      "Describe the outcome. Agent plans the steps, shows the cost, and runs it end-to-end.",
  },
  alternates: { canonical: "/agent" },
};

export default function AgentPage() {
  // useSearchParams() inside the client component requires a Suspense boundary
  // when rendered from a server component during static generation.
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "60vh",
            display: "grid",
            placeItems: "center",
            color: "var(--fg-muted)",
          }}
        >
          Loading…
        </div>
      }
    >
      <AgentInteractive />
    </Suspense>
  );
}
