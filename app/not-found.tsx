import type { Metadata } from "next";
import Link from "next/link";

// 2026-05-02: explicit metadata so 404 pages don't reuse the homepage
// title ("pdfcraft ai — Every PDF tool you need"). Search engines that
// crawl a 404 URL during a re-crawl get a clear "page not found"
// signal; users see "Page not found" in the browser tab and the back-
// nav history; both better than the old behavior where every 404
// looked indistinguishable from the homepage in the URL/tab UX.
//
// noindex: 404s should NEVER be indexed. Robots middleware sets this
// header at the response layer, but explicit metadata is belt-and-
// braces — it lands in the page HTML so browser-side
// interpretations (e.g. archive.org) treat the page correctly too.
export const metadata: Metadata = {
  // Just "Page not found" — root layout's title.template adds
  // "· pdfcraft ai" automatically. Setting the full string here
  // produces "Page not found · pdfcraft ai · pdfcraft ai" (double
  // suffix). Verified via post-deploy probe.
  title: "Page not found",
  description:
    "The page you're looking for doesn't exist. Head back to the tool catalog or homepage.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="container-x" style={{ padding: "120px 28px", textAlign: "center" }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        ERROR · 404
      </div>
      <h1 style={{ fontSize: 56 }}>Page not found</h1>
      <p className="muted" style={{ fontSize: 18, maxWidth: 540, margin: "16px auto 32px" }}>
        The page you&apos;re looking for doesn&apos;t exist or may have moved. Head home or browse the tool catalog.
      </p>
      <div className="row" style={{ justifyContent: "center", gap: 12 }}>
        <Link href="/" className="btn btn-lg btn-primary">
          Back home
        </Link>
        <Link href="/tools" className="btn btn-lg btn-outline">
          Browse tools
        </Link>
      </div>
    </main>
  );
}
