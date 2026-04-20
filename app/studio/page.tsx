// app/studio/page.tsx
// Public Workflow Studio — full-bleed canvas editor for macros. Server
// component owns SEO metadata; mounts the client-side <WorkflowStudio/> below.
// Loads with ?t=<template-id> from /macros, defaults to the Invoice Intake
// template if no t param is provided.

import type { Metadata } from "next";
import { Suspense } from "react";
import WorkflowStudio from "@/components/workflow/WorkflowStudio";

export const metadata: Metadata = {
  title: "Workflow Studio — design macros visually",
  description:
    "Drag tools onto a canvas, connect them, and run. Studio is the visual editor behind every macro on pdfcraft ai — open a template or start from scratch.",
  openGraph: {
    title: "Workflow Studio · pdfcraft ai",
    description: "Design multi-tool PDF macros visually. Drag, connect, run.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Workflow Studio · pdfcraft ai",
    description: "Design multi-tool PDF macros visually. Drag, connect, run.",
  },
  alternates: { canonical: "/studio" },
};

export default function StudioPage() {
  // useSearchParams() inside the client component requires a Suspense boundary
  // when rendered from a server component during static generation.
  return (
    <Suspense
      fallback={
        <div
          style={{
            height: "calc(100vh - 64px)",
            display: "grid",
            placeItems: "center",
            color: "var(--fg-muted)",
          }}
        >
          Loading studio…
        </div>
      }
    >
      <WorkflowStudio />
    </Suspense>
  );
}
