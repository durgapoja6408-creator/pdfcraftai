import type { Metadata } from "next";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { ToolFilter } from "@/components/marketing/ToolFilter";
import { AdSlot } from "@/components/marketing/AdSlot";
import { TOOLS, TOOL_STATS } from "@/lib/tools";

const META_DESC_SHORT = `Every PDF tool you need. ${TOOL_STATS.free} free forever, ${TOOL_STATS.ai} AI-powered.`;
const META_DESC_LONG = `Every PDF tool you need — ${TOOL_STATS.free} free forever, ${TOOL_STATS.ai} AI-powered. Merge, split, compress, convert, chat, summarize, translate, redact.`;

export const metadata: Metadata = {
  title: "All tools",
  description: META_DESC_LONG,
  alternates: { canonical: "/tools" },
  openGraph: {
    title: "All tools",
    description: META_DESC_SHORT,
    url: "/tools",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "All tools",
    description: META_DESC_SHORT,
  },
};

// 2026-05-12 — schema.org CollectionPage + ItemList JSON-LD for the
// catalog. Pairs with the FAQPage JSON-LD on /compare (commit
// 52adddc). CollectionPage tells Google the page is a curated index
// over a set of items; ItemList encodes each tool as a ListItem
// with position + name + url + description. Helps Google index the
// individual catalog rows and may unlock site-link search-box +
// rich-snippet features for tool-name queries.
//
// The list derives from the canonical TOOLS array at render time,
// so adding a tool to lib/tools.ts auto-updates the schema. No
// duplication, no drift risk.
//
// Sitelinks search box note: only fires when site:domain.com search
// works AND CollectionPage / ItemList signal is present. We already
// have a sitemap covering /tools so Google has the data; the schema
// here is the second half of the signal pair.
const SITE = "https://pdfcraftai.com";
const COLLECTION_JSONLD = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": `${SITE}/tools#collection`,
  url: `${SITE}/tools`,
  name: "All tools — pdfcraftai.com",
  description: `Every PDF tool you need. ${TOOL_STATS.free} free forever, ${TOOL_STATS.ai} AI-powered.`,
  isPartOf: { "@type": "WebSite", url: SITE, name: "pdfcraftai" },
  mainEntity: {
    "@type": "ItemList",
    numberOfItems: TOOL_STATS.total,
    itemListElement: TOOLS.map((tool, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `${SITE}/tool/${tool.id}`,
      name: tool.name,
      // Truncate to first 200 chars — Google's structured data spec
      // recommends concise descriptions. The desc field in TOOLS
      // sometimes runs 300-400 chars with marketing prose; the head
      // is the high-signal part.
      description: tool.desc.length > 200
        ? tool.desc.slice(0, 197) + "..."
        : tool.desc,
    })),
  },
};

const BREADCRUMB_JSONLD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE },
    {
      "@type": "ListItem",
      position: 2,
      name: "All tools",
      item: `${SITE}/tools`,
    },
  ],
};

export default function ToolsPage() {
  return (
    <main>
      {/* CollectionPage + ItemList structured data. Renders inline
          as <script type="application/ld+json"> so search engines
          pick it up on the initial server-rendered HTML. */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(COLLECTION_JSONLD),
        }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(BREADCRUMB_JSONLD),
        }}
      />
      <section style={{ paddingTop: 80 }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            ALL TOOLS
          </div>
          <h1 className="hero-standard" style={{ marginBottom: 24 }}>Pick a tool, drop a file.</h1>

          {/* Bulk mode promo */}
          <Link
            href="/bulk"
            className="card card-hover"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: 24,
              marginBottom: 32,
              borderColor: "var(--accent-soft)",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                background: "var(--accent-soft)",
                color: "var(--accent)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <I.Layers size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 500, fontSize: 15 }}>
                  Bulk mode — run any tool on many files
                </span>
                <span className="chip chip-new">NEW</span>
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                Drop up to 500 PDFs, pick a tool, get a zip back. Works with every AI and free tool.
              </div>
            </div>
            <I.ArrowRight size={16} />
          </Link>

          <ToolFilter />

          {/* Bundle E (2026-04-26): house promo (or AdSense, when active)
              after the tool grid. /tools is one of the highest-traffic
              SEO landing pages on the site — adding a slot here gives
              first-time visitors who scroll the full grid one curated
              suggestion before they bounce. */}
          <div style={{ marginTop: 40 }}>
            <AdSlot slot="tools-catalog" />
          </div>
        </div>
      </section>

      <div style={{ padding: "80px 0" }} />
    </main>
  );
}
