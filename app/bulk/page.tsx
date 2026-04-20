import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { I } from "@/components/icons/Icons";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Bulk processing — process 1,000 files in one drop",
  description:
    "Drop a zip, a folder, or a glob. pdfcraft ai fans the job out in parallel and hands you a manifest when it&apos;s done.",
  canonical: "/bulk",
});

const CAPABILITIES: Array<{ icon: keyof typeof I; title: string; body: string }> = [
  {
    icon: "Upload",
    title: "Drop anything",
    body: "ZIPs, folders, globs, or URLs. We unpack, validate, and report any bad files before the work starts.",
  },
  {
    icon: "Zap",
    title: "Parallelized automatically",
    body: "No knobs to tune. Jobs run in parallel with automatic retry and exponential backoff on transient errors.",
  },
  {
    icon: "File",
    title: "Manifest + ledger",
    body: "Every run produces a manifest.csv with per-file status, duration, output path, and credits consumed.",
  },
  {
    icon: "Download",
    title: "Streamed downloads",
    body: "Start downloading as soon as the first file finishes. No waiting for the slowest PDF in the batch.",
  },
];

export default function BulkPage() {
  return (
    <>
      <MarketingHero
        chip={{ label: "BULK", tone: "new" }}
        eyebrow="BATCH PROCESSING"
        title={
          <>
            Process 1,000 files in{" "}
            <span style={{ color: "var(--accent)" }}>one drop.</span>
          </>
        }
        subtitle="Every tool on pdfcraft ai works in bulk — merge, split, OCR, translate, redact. Drop a zip or point at a folder; we handle the fan-out."
        primaryCta={{ href: "/register", label: "Upload a batch" }}
        secondaryCta={{ href: "/macros", label: "Wrap it in a macro" }}
      />

      <section style={{ padding: "80px 28px", borderTop: "1px solid var(--border)" }}>
        <div className="container-x">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 18,
            }}
          >
            {CAPABILITIES.map((c) => {
              const Ic = I[c.icon];
              return (
                <article key={c.title} className="card" style={{ padding: 22 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 9,
                      background: "var(--accent-soft)",
                      color: "var(--accent)",
                      display: "grid",
                      placeItems: "center",
                      marginBottom: 12,
                    }}
                  >
                    <Ic size={16} />
                  </div>
                  <h3 style={{ fontSize: 16, margin: "0 0 6px", letterSpacing: "-0.01em" }}>
                    {c.title}
                  </h3>
                  <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.55, margin: 0 }}>
                    {c.body}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section
        style={{
          padding: "60px 28px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-1)",
          textAlign: "center",
        }}
      >
        <div className="container-narrow">
          <h2 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 12px" }}>
            Free tiers handle 50 files / drop.
          </h2>
          <p className="muted" style={{ fontSize: 15, marginBottom: 20 }}>
            Bring your own credits for AI steps. Business plan lifts the per-drop cap to 5,000.
          </p>
          <div className="row" style={{ justifyContent: "center", gap: 12 }}>
            <Link href="/register" className="btn btn-lg btn-accent">
              Try a bulk run <I.ArrowRight size={16} />
            </Link>
            <Link href="/pricing" className="btn btn-lg btn-outline">
              See plan limits
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
