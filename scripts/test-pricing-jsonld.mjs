#!/usr/bin/env node
// scripts/test-pricing-jsonld.mjs
//
// 2026-05-12 — CI guard for the Product + Offer + FAQPage +
// BreadcrumbList JSON-LD added to /pricing. Highest commercial-
// leverage JSON-LD on the site — SERP pricing rich snippets are
// the single biggest "rich result that affects conversion" feature.
//
// Schema choices:
//   - ProductGroup at the top with hasVariant for each credit pack
//   - Each pack has TWO offers (USD + INR) per CREDIT_PACKS shape
//   - FAQPage from PRICING_FAQ
//   - BreadcrumbList Home → Pricing
//
// Sections:
//   A — three constants declared (PRODUCT_JSONLD, FAQ_JSONLD,
//       BREADCRUMB_JSONLD) — three because /pricing is the only
//       page with three JSON-LD blocks
//   B — ProductGroup shape (hasVariant maps CREDIT_PACKS)
//   C — each variant has USD + INR Offer (dual-currency pricing)
//   D — FAQPage derives from PRICING_FAQ.map
//   E — Breadcrumb shape
//   F — rendering hygiene (3 script tags + JSON.stringify)
//
// Pure static-parse.

import { readFileSync } from "node:fs";

const PAGE_PATH = "app/pricing/page.tsx";
const PAGE = readFileSync(PAGE_PATH, "utf8");

let pass = 0;
let fail = 0;
const report = [];

function check(label, predicate) {
  const ok = !!predicate;
  if (ok) pass++;
  else fail++;
  report.push({ label, ok });
}

// ─── Section A: constants ───
check("A1: PRODUCT_JSONLD declared", /const PRODUCT_JSONLD\s*=/.test(PAGE));
check("A2: FAQ_JSONLD declared", /const FAQ_JSONLD\s*=/.test(PAGE));
check("A3: BREADCRUMB_JSONLD declared", /const BREADCRUMB_JSONLD\s*=/.test(PAGE));
check(
  "A4: CREDIT_PACKS imported from lib/pricing",
  /import\s*\{[^}]*CREDIT_PACKS[^}]*PRICING_FAQ[^}]*\}\s*from\s*"@\/lib\/pricing"/.test(PAGE)
);

// ─── Section B: ProductGroup shape ───
check(
  "B1: top-level @type ProductGroup",
  /"@type":\s*"ProductGroup"/.test(PAGE)
);
check(
  "B2: productGroupID set",
  /productGroupID:\s*"credit-packs"/.test(PAGE)
);
check(
  "B3: variesBy includes credits + price",
  /variesBy:\s*\[\s*"credits",\s*"price"\s*\]/.test(PAGE)
);
check(
  "B4: hasVariant maps over CREDIT_PACKS",
  /hasVariant:\s*CREDIT_PACKS\.map/.test(PAGE)
);
check(
  "B5: each variant is @type Product with sku field",
  /"@type":\s*"Product"[\s\S]*?sku:\s*`pack-\$\{pack\.id\}`/.test(PAGE)
);
check(
  "B6: brand declared",
  /brand:\s*\{\s*"@type":\s*"Brand",\s*name:\s*"pdfcraftai"\s*\}/.test(PAGE)
);

// ─── Section C: dual-currency offers ───
// The variant mapper builds an `offers` local array (USD always +
// INR conditional on pack.inrPrice presence) and returns it inside
// the variant object. Anchor on the "@type": "Offer" entry next to
// either a literal array OR an `offers` local variable.
check(
  "C1: each Product has @type Offer entries (USD + conditional INR)",
  /"@type":\s*"Offer"/.test(PAGE) && /offers,?\s*\n?\s*\}/.test(PAGE)
);
check(
  "C2: USD Offer present (priceCurrency: 'USD')",
  /priceCurrency:\s*"USD"/.test(PAGE)
);
check(
  "C3: INR Offer present (priceCurrency: 'INR')",
  /priceCurrency:\s*"INR"/.test(PAGE)
);
check(
  "C4: USD price derived from pack.price (not hardcoded)",
  /price:\s*pack\.price\.toFixed\(2\)/.test(PAGE)
);
check(
  "C5: INR price derived from pack.inrPrice (not hardcoded)",
  /price:\s*pack\.inrPrice\.toFixed\(2\)/.test(PAGE)
);
check(
  "C6: availability is schema.org/InStock",
  /availability:\s*"https:\/\/schema\.org\/InStock"/.test(PAGE)
);

// Anti-drift on the PRODUCT_JSONLD block: hasVariant must be a .map,
// not a literal array. Breadcrumb's itemListElement IS legitimately
// a literal — the anti-literal check anchors on PRODUCT_JSONLD scope.
check(
  "C7: PRODUCT_JSONLD hasVariant uses .map (not literal)",
  (() => {
    const start = PAGE.indexOf("const PRODUCT_JSONLD");
    if (start < 0) return false;
    const end = PAGE.indexOf("};", start);
    if (end < 0) return false;
    const block = PAGE.slice(start, end);
    return (
      /hasVariant:\s*CREDIT_PACKS\.map/.test(block) &&
      !/hasVariant:\s*\[/.test(block)
    );
  })()
);

// ─── Section D: FAQPage from PRICING_FAQ ───
check("D1: FAQ_JSONLD @type FAQPage", /"@type":\s*"FAQPage"/.test(PAGE));
check(
  "D2: FAQ mainEntity maps over PRICING_FAQ",
  /mainEntity:\s*PRICING_FAQ\.map/.test(PAGE)
);
check(
  "D3: every entry is Question with acceptedAnswer",
  /"@type":\s*"Question"/.test(PAGE) &&
    /"@type":\s*"Answer"/.test(PAGE)
);

// ─── Section E: breadcrumb ───
check("E1: BreadcrumbList @type", /"@type":\s*"BreadcrumbList"/.test(PAGE));
check(
  "E2: breadcrumb has Home + Pricing items",
  /name:\s*"Home"[\s\S]*name:\s*"Pricing"/.test(PAGE)
);

// ─── Section F: rendering hygiene ───
check(
  "F1: at least 3 application/ld+json script tags (Product + FAQ + Breadcrumb)",
  (PAGE.match(/type="application\/ld\+json"/g) || []).length >= 3
);
check(
  "F2: JSON.stringify wraps all three schemas",
  /JSON\.stringify\(PRODUCT_JSONLD\)/.test(PAGE) &&
    /JSON\.stringify\(FAQ_JSONLD\)/.test(PAGE) &&
    /JSON\.stringify\(BREADCRUMB_JSONLD\)/.test(PAGE)
);

// ─── Report ───
console.log("pricing-jsonld:");
for (const r of report) {
  console.log(`  ${r.ok ? "✓" : "✗"} ${r.label}`);
}
const total = pass + fail;
console.log(`pricing-jsonld: ${pass} passed, ${fail} failed (of ${total})`);
process.exit(fail === 0 ? 0 : 1);
