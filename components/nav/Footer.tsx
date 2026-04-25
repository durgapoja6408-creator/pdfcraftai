import Link from "next/link";

type Col = { title: string; links: Array<[label: string, href: string]> };

const COLS: Col[] = [
  {
    title: "Product",
    links: [
      ["Tools", "/tools"],
      ["Use cases", "/use-cases"],
      ["Agent", "/agent"],
      ["Macros", "/macros"],
      ["Bulk", "/bulk"],
      ["Pricing", "/pricing"],
      ["API", "/api"],
      ["Changelog", "/changelog"],
    ],
  },
  {
    title: "AI",
    links: [
      ["Chat with PDF", "/tool/ai-chat"],
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
        className="container-x"
        style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 40 }}
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
                  style={{ fontSize: 13, color: "var(--fg-muted)" }}
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
        <span className="mono">Files deleted after 1h · End-to-end encrypted</span>
      </div>
    </footer>
  );
}
