import Link from "next/link";

type Col = { title: string; links: Array<[label: string, href: string]> };

const COLS: Col[] = [
  {
    title: "Product",
    links: [
      ["Tools", "/tools"],
      // 2026-05-12 — TOOL_IMPROVEMENT_PLAN T2-6 follow-up. /compare
      // is a verb-led intent router that helps confused visitors find
      // the right tool (12 intent groups: combine, split, shrink,
      // understand, sign, ...). Sits second in the Product column
      // because catalog-browsers ("Tools") and decision-makers
      // ("Find your tool") are the two primary discovery flows;
      // bulk/pricing/api/changelog come after.
      ["Find your tool", "/compare"],
      ["Use cases", "/use-cases"],
      ["Bulk", "/bulk"],
      ["Pricing", "/pricing"],
      ["Changelog", "/changelog"],
    ],
  },
  {
    title: "AI",
    links: [
      // 2026-05-02: link directly to /chat-with-pdf (canonical
      // marketing landing) instead of /tool/ai-chat which
      // 308-redirects here. Saves one hop on every footer click.
      ["Chat with PDF", "/chat-with-pdf"],
      ["Summarize", "/tool/ai-summarize"],
      ["Translate", "/tool/ai-translate"],
      ["OCR", "/tool/ai-ocr"],
    ],
  },
  {
    title: "Company",
    links: [
      ["About", "/about"],
      ["Blog", "/blog"],
      ["Help", "/help"],
      ["Alternatives", "/alternatives"],
      ["Careers", "/careers"],
      ["Contact", "/contact"],
      ["Status", "/status"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
      ["Cookies", "/cookies"],
      ["Refund Policy", "/refund-policy"],
      ["Cancellation", "/cancellation-policy"],
      ["Shipping & Delivery", "/shipping-policy"],
      ["Security", "/security"],
      ["DPA", "/dpa"],
      ["GDPR", "/gdpr"],
    ],
  },
];

export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--border)", padding: "48px 28px 32px", marginTop: 80 }}>
      <div
        className="container-x footer-grid"
      >
        <div>
          <div className="row" style={{ marginBottom: 12 }}>
            <span className="logo-mark">P</span>
            <span style={{ fontWeight: 600 }}>
              pdfcraft<span style={{ color: "var(--accent)" }}>ai</span>
            </span>
          </div>
          <p className="muted" style={{ fontSize: 13, maxWidth: 280 }}>
            Every PDF tool you need, free. Add credits for AI superpowers.
          </p>
          <address
            className="subtle"
            style={{
              fontSize: 12,
              lineHeight: 1.55,
              marginTop: 14,
              fontStyle: "normal",
              maxWidth: 280,
            }}
          >
            Operated by Rajasekar Selvam
            <br />
            No. 311, 3rd Cross Street
            <br />
            Eswari Nagar, Chromepet
            <br />
            Chennai, Tamil Nadu 600044, India
            <br />
            <a
              href="tel:+919498498011"
              style={{ color: "inherit", textDecoration: "none" }}
            >
              +91 94984 98011
            </a>
            {" · "}
            <a
              href="mailto:support@pdfcraftai.com"
              style={{ color: "inherit", textDecoration: "none" }}
            >
              support@pdfcraftai.com
            </a>
          </address>
        </div>

        {COLS.map((col) => (
          <div key={col.title}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              {col.title}
            </div>
            <div className="col" style={{ gap: 8 }}>
              {col.links.map(([label, href]) => (
                <Link
                  key={label + href}
                  href={href}
                  style={{ fontSize: 13, color: "var(--fg-muted)", padding: "4px 0", display: "inline-block" }}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="divider" style={{ margin: "32px 0 20px" }} />

      <div
        className="container-x row"
        style={{ justifyContent: "space-between", fontSize: 12, color: "var(--fg-subtle)" }}
      >
        <span className="mono">
          © {new Date().getFullYear()} pdfcraft ai · Operated by Rajasekar Selvam
        </span>
        {/* 2026-05-08 — honesty fix. Previous copy claimed "Files
            deleted after 1h" — directly contradicting the
            zero-retention work shipped under items #4 + #22 +
            commit `1827ebf`. We don't store files for an hour; we
            don't persist them at all (in-memory processing for AI
            ops, browser-side processing for free tools). "TLS 1.3
            in transit" is the factual half of the prior copy worth
            keeping — encryption-at-rest is not applicable since
            there's no rest. */}
        <span className="mono">Zero retention · TLS 1.3 in transit</span>
      </div>
    </footer>
  );
}
