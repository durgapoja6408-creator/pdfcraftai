// SEO Ship #3 (2026-04-25): competitor-comparison ("alternative to X")
// landing pages.
//
// Why these matter for SEO: "alternative to X" queries are the highest-
// intent search type — they're decision-stage. The searcher already
// knows the category; they're choosing between options. Conversion
// rates run 3–5× higher than head-term traffic because the user is
// already shopping.
//
// Editorial principles for these pages:
//
// 1. Be honest about competitors. They are well-established companies
//    with millions of happy users. Falsehoods or sneers about them
//    erode our credibility, not theirs.
// 2. Always include "where they still win" — the searcher knows their
//    current tool's strengths. Pretending those don't exist makes the
//    whole page feel like an ad.
// 3. The migration guide is the highest-value section for the user.
//    Concrete workflows mapped from "their way" → "our way" answers
//    the question they're actually asking: "if I switch, what changes?"
// 4. Trademarks are used factually, in comparison context. We don't
//    mimic their branding, claim affiliation, or imply endorsement.

export type CompetitorSlug =
  | "ilovepdf"
  | "smallpdf"
  | "adobe-acrobat"
  | "pdf24"
  | "sejda";

export type FeatureRow = {
  feature: string;
  us: string | boolean;
  them: string | boolean;
  /** Short footnote shown beneath the row — keeps the table honest. */
  note?: string;
};

export type FeatureMatrix = {
  category: string;
  rows: FeatureRow[];
};

export type CompetitorData = {
  slug: CompetitorSlug;
  /** The brand name as the company writes it. */
  name: string;
  /** Their canonical domain (used in copy, not as an outbound link). */
  domain: string;
  /** Year founded — for the "established X years ago" framing. */
  founded: string;
  /** Headquarters country/region — adds factual texture. */
  hq: string;
  /** One-sentence description we use on the hero. */
  oneLine: string;
  /** What they genuinely do well. Don't shy from this — credibility. */
  whatTheyDoWell: string[];
  /** Where pdfcraft ai is meaningfully different (not just "we're newer"). */
  whereWeWin: string[];
  /** Where they still win for many users. Critical for honest framing. */
  whereTheyWin: string[];
  /** Side-by-side feature matrix grouped by category. */
  matrix: FeatureMatrix[];
  /** Pricing comparison — pulled from each company's public pricing page. */
  pricing: {
    /** Free-tier comparison. */
    free: { us: string; them: string };
    /** Cheapest paid plan, monthly equivalent. */
    paid: { us: string; them: string };
    /** Plain-language summary of the pricing delta. */
    summary: string;
  };
  /** Common workflows mapped from their tool to ours. */
  migration: Array<{ workflow: string; theirWay: string; ourWay: string }>;
  /** Page-specific FAQ (in addition to the generic alternative FAQ). */
  faq: Array<{ q: string; a: string }>;
  /** Recommended tools from our catalog to deep-link from this page. */
  relatedTools: string[];
};

// ============================================================
// Competitor data
// ============================================================

export const COMPETITORS: Record<CompetitorSlug, CompetitorData> = {
  // -------------------------------------------------------------
  // iLovePDF
  // -------------------------------------------------------------
  ilovepdf: {
    slug: "ilovepdf",
    name: "iLovePDF",
    domain: "ilovepdf.com",
    founded: "2010",
    hq: "Barcelona, Spain",
    oneLine:
      "iLovePDF is a Barcelona-based PDF suite that has been around since 2010, with around 25 tools, a desktop and mobile app, and a free tier with per-task daily limits.",
    whatTheyDoWell: [
      "A polished, mature product — 14 years of refinement shows in the UX of the core tools.",
      "Localized into 25+ languages with strong adoption across Europe.",
      "Solid mobile and desktop apps — useful if you live in their ecosystem.",
      "Stable API that has been in market for years.",
      "Honest, paid-tier-funded business model with no surprise charges.",
    ],
    whereWeWin: [
      "95 PDF tools versus their ~25 — including 50+ AI tools they don't offer at all (Chat with PDF, Summarize, Translate with layout preservation, AI Redact, AI Compare, Smart OCR, and 40+ more).",
      "No daily task cap on the free tier. Their free is rate-limited per day; ours runs unlimited.",
      "All free tools run in your browser — your file never touches our server. Their free tools upload to their servers regardless of plan.",
      "No signup for any free tool. They require an account beyond a few uses.",
      "Pricing is roughly half theirs at the entry tier, and we ship the AI features as the same plan.",
    ],
    whereTheyWin: [
      "Brand maturity. iLovePDF is the household name for online PDF tools in Europe; we are a newer entrant.",
      "Native desktop and mobile apps. We are web-first; they have full installable clients.",
      "Larger localization footprint — they support more interface languages than we do today.",
      "Workflow integrations with WordPress, Joomla, and a few enterprise platforms. We offer an API; they offer that plus prebuilt plugins.",
      "If you only use the basic 5 tools (merge, split, compress, PDF-to-Word, JPG-to-PDF), iLovePDF Premium is fine and their established brand may be reassuring to your IT team.",
    ],
    matrix: [
      {
        category: "Catalog",
        rows: [
          { feature: "Total PDF tools", us: "95", them: "~25" },
          { feature: "AI-powered tools", us: "50+", them: "A handful (Chat, Summarize, OCR added 2024+)" },
          { feature: "Free-forever tools", us: "43", them: "All tools usable free with daily caps" },
          { feature: "Macros / chained workflows", us: true, them: false, note: "We let you save multi-step workflows; iLovePDF runs one tool at a time." },
        ],
      },
      {
        category: "Free tier",
        rows: [
          { feature: "Daily task limit", us: "Unlimited", them: "Limited per task per day" },
          { feature: "Watermarks", us: "None", them: "None on free tier" },
          { feature: "Signup required", us: "No", them: "After a few uses" },
          { feature: "File size cap", us: "100 MB per file", them: "Up to 80 MB free, 200 MB premium" },
          { feature: "In-browser processing", us: "Yes (free tools)", them: "No — all uploads", note: "Free tools that run in your browser never send your file to our servers." },
        ],
      },
      {
        category: "AI features",
        rows: [
          { feature: "Chat with PDF", us: true, them: true, note: "Both available; we cite page numbers, they don't always." },
          { feature: "Summarize PDF", us: "11 formats (executive, TL;DR, study notes, action items, etc.)", them: "Single format" },
          { feature: "AI translate (layout preserved)", us: "90+ languages", them: "Limited" },
          { feature: "AI Redact (auto-detect PII)", us: true, them: false },
          { feature: "AI Compare with severity classification", us: true, them: false },
          { feature: "AI Sign & Fill (auto-populate forms)", us: true, them: false },
          { feature: "Generate PDF from prompt", us: true, them: false },
        ],
      },
      {
        category: "API & integrations",
        rows: [
          { feature: "REST API", us: false, them: true },
          { feature: "Official SDKs", us: false, them: "PHP, Java, Python, .NET, Ruby" },
          { feature: "WordPress plugin", us: "Roadmap", them: true },
          { feature: "Zapier integration", us: "Roadmap", them: true },
          { feature: "Batch endpoint", us: false, them: true },
        ],
      },
      {
        category: "Privacy",
        rows: [
          { feature: "Files deleted after processing", us: "60 minutes", them: "2 hours" },
          { feature: "Files used for AI training", us: "Never", them: "Never" },
          { feature: "GDPR compliance", us: true, them: true },
          { feature: "Free tools run client-side", us: true, them: false, note: "Major privacy difference for the basic tools." },
        ],
      },
    ],
    pricing: {
      free: {
        us: "43 tools, unlimited use, no signup",
        them: "All tools, daily per-task limits, free account required after a few uses",
      },
      paid: {
        us: "$4/month for the Pro plan including all AI features",
        them: "$4/month iLovePDF Premium (paid annually $48/year), AI features extra",
      },
      summary:
        "Headline pricing is similar — both around $48/year for the entry paid tier. The real difference is what's included: pdfcraft ai's plan ships the AI features (Chat, Summarize, Translate, OCR, Redact, Compare) at the entry tier, while iLovePDF treats AI as add-ons or premium-tier-only. If you only need the basics, iLovePDF Premium is a fine choice and the brand is more established.",
    },
    migration: [
      {
        workflow: "Merging PDFs",
        theirWay: "iLovePDF → Merge PDF tool, upload files, click Merge, download.",
        ourWay: "pdfcraft ai → Merge PDFs (free, runs in browser, no upload). Same UI; the file stays on your machine.",
      },
      {
        workflow: "Compressing for email",
        theirWay: "iLovePDF → Compress PDF, choose level, download.",
        ourWay: "pdfcraft ai → Compress PDF with target-size mode ('get under 5 MB'). Iterates parameters automatically; iLovePDF doesn't have this option.",
      },
      {
        workflow: "OCR a scanned document",
        theirWay: "iLovePDF → OCR PDF, free with caps; full quality requires Premium.",
        ourWay: "pdfcraft ai → AI OCR or Make PDF Searchable. 20 pages free, then 2 credits per page. AI OCR adds structure detection (tables, headings) iLovePDF doesn't.",
      },
      {
        workflow: "Extract text or tables",
        theirWay: "iLovePDF → PDF to Word or PDF to Excel.",
        ourWay: "pdfcraft ai → PDF to Word/Excel/PPT. Or use AI Table Extract for tables that don't follow simple grid patterns — iLovePDF doesn't have a dedicated table-only tool.",
      },
      {
        workflow: "Translating documents",
        theirWay: "iLovePDF doesn't currently translate PDFs while preserving layout — they offer plain-text translation only.",
        ourWay: "pdfcraft ai → Translate PDF preserves the original layout in 90+ languages — text fits inside its original bounding boxes, tables stay tables.",
      },
    ],
    faq: [
      {
        q: "Why would I switch from iLovePDF if I'm happy with it?",
        a: "Honestly, you might not need to. If you only use the basic tools (merge, split, compress) and they're working for you, there's no urgency to switch. The reasons to consider us: you've started needing AI features (Chat, Summarize, Translate, Redact) that iLovePDF either doesn't offer or charges extra for; you want the free tier without daily caps; or you want free tools that run in your browser instead of uploading every file.",
      },
      {
        q: "Can I use both?",
        a: "Yes. Many users keep iLovePDF for one or two specific workflows (their WordPress plugin, for instance) and use pdfcraft ai for everything else. We don't lock you in — there's no account migration to do.",
      },
      {
        q: "Will iLovePDF stop working if I subscribe to pdfcraft ai?",
        a: "No. We have no relationship with iLovePDF. Your iLovePDF subscription is independent of ours.",
      },
      {
        q: "Is iLovePDF's API better?",
        a: "We don't offer a public REST API today — a developer API is on our roadmap. If you're API-first and need programmatic access now, iLovePDF is the better fit. What we do offer is BYOK (bring your own OpenAI/Anthropic/Google key) on Pro+ and bulk processing in the app, plus AI operations they don't have.",
      },
      {
        q: "Are pdfcraft ai's free tools really truly free?",
        a: "Yes — 43 tools run unlimited, no signup, no watermarks, no daily caps. They run in your browser, so your file never touches our servers. We make money from the AI features, not from gating the free tools.",
      },
    ],
    relatedTools: ["merge", "split", "compress", "pdf-to-office", "ai-chat", "ai-summarize", "ai-translate"],
  },

  // -------------------------------------------------------------
  // Smallpdf
  // -------------------------------------------------------------
  smallpdf: {
    slug: "smallpdf",
    name: "Smallpdf",
    domain: "smallpdf.com",
    founded: "2013",
    hq: "Zürich, Switzerland",
    oneLine:
      "Smallpdf is a Swiss-based PDF tool suite founded in 2013, known for a clean UI and a tight free tier (2 tasks per day) with paid plans starting at around $9/month.",
    whatTheyDoWell: [
      "Probably the cleanest UI in the category — a real design pedigree shows up in every tool.",
      "Tight free-tier rules that, while restrictive, keep the experience fast for paid users.",
      "Strong integrations with Google Drive, Dropbox, and OneDrive — picks up files where you already store them.",
      "Excellent mobile apps with offline mode for paid users.",
      "Pro plans bundle e-signature features that compete directly with cheaper-tier DocuSign.",
    ],
    whereWeWin: [
      "Their free tier is 2 tasks per day total, across all tools. Ours is unlimited.",
      "Smallpdf Pro starts around $9/month — significantly more than our $4/month — and the features at our price are a superset of theirs.",
      "We ship 50+ AI tools; their AI catalog is smaller and most AI features sit behind the Pro plan.",
      "Free tools on pdfcraft ai run in your browser. Smallpdf uploads everything regardless of plan.",
      "No mandatory signup on any free tool. Smallpdf rate-limits anonymous users tightly.",
    ],
    whereTheyWin: [
      "Brand recognition — Smallpdf is one of the two or three names most people know in the category.",
      "Cloud storage integrations are deeper and have been around longer.",
      "Their e-signature workflow is more polished than our free Sign tool today.",
      "Strong Microsoft 365 add-on for users in the Office ecosystem.",
      "Better designed mobile experience on iOS specifically.",
    ],
    matrix: [
      {
        category: "Catalog",
        rows: [
          { feature: "Total PDF tools", us: "95", them: "~24" },
          { feature: "AI-powered tools", us: "50+", them: "Approximately 6 (Chat, Summarize, Translate, OCR, Compress AI, Smart Convert)" },
          { feature: "Free-forever tools", us: "43", them: "All — 2 tasks/day limit", note: "All Smallpdf tools work free; you just hit the daily cap quickly." },
        ],
      },
      {
        category: "Free tier",
        rows: [
          { feature: "Daily task limit", us: "Unlimited", them: "2 tasks per 24 hours" },
          { feature: "Per-task usage cap", us: "None", them: "Hourly limit" },
          { feature: "Watermarks", us: "None", them: "None" },
          { feature: "Signup required", us: "No", them: "Yes for repeat use" },
          { feature: "In-browser processing", us: true, them: false },
        ],
      },
      {
        category: "AI features",
        rows: [
          { feature: "Chat with PDF (with citations)", us: true, them: true },
          { feature: "Summarize formats", us: "11 formats", them: "1 format" },
          { feature: "Translate with layout preservation", us: "90+ languages", them: "Limited (Pro only)" },
          { feature: "AI redact PII", us: true, them: false },
          { feature: "AI compare with severity", us: true, them: false },
          { feature: "AI table extract (multi-page)", us: true, them: false },
          { feature: "AI sign & fill", us: true, them: "Sign yes; AI fill no" },
          { feature: "Generate PDF from prompt", us: true, them: false },
        ],
      },
      {
        category: "Integrations",
        rows: [
          { feature: "Google Drive", us: "Roadmap", them: true },
          { feature: "Dropbox", us: "Roadmap", them: true },
          { feature: "OneDrive", us: "Roadmap", them: true },
          { feature: "Microsoft Word add-in", us: false, them: true },
          { feature: "REST API", us: false, them: true },
          { feature: "Macros (chain steps)", us: true, them: false },
        ],
      },
      {
        category: "Pricing",
        rows: [
          { feature: "Cheapest paid plan", us: "$4/month", them: "~$9/month (Pro, billed annually)" },
          { feature: "Annual billing", us: "$48/year", them: "~$108/year" },
          { feature: "AI features included in entry plan", us: true, them: "Mostly Pro-only" },
        ],
      },
    ],
    pricing: {
      free: {
        us: "43 tools, unlimited daily use, no signup",
        them: "All tools, 2 tasks per day, signup required after first use",
      },
      paid: {
        us: "$4/month",
        them: "~$9/month (Pro, billed annually)",
      },
      summary:
        "Smallpdf is roughly twice our price at the entry tier, and pushes most AI features into the Pro plan. If your job is mostly basic operations and you're already in their ecosystem (Google Drive, Microsoft Word add-in), staying with Smallpdf is reasonable. If you do anything AI-heavy or use more than 2 tools per day, the cost difference is significant.",
    },
    migration: [
      {
        workflow: "Hitting the 2-task daily cap on Smallpdf free",
        theirWay: "Smallpdf free → 2 tasks → 24-hour wait or upgrade.",
        ourWay: "pdfcraft ai → unlimited free uses on the same operations. No migration step beyond bookmarking the new URL.",
      },
      {
        workflow: "Importing from Google Drive / Dropbox",
        theirWay: "Smallpdf → import from cloud storage → process → save back.",
        ourWay: "pdfcraft ai → drag a downloaded file in (cloud import is on the roadmap). The friction is real; it's the main thing Smallpdf does today that we don't.",
      },
      {
        workflow: "E-signature workflow",
        theirWay: "Smallpdf eSign → upload PDF, drag fields, send for signature, recipient signs.",
        ourWay: "pdfcraft ai → Sign PDF (free, type/draw/upload your own signature). Multi-party send-for-signature workflow is on our paid roadmap; for now Smallpdf wins on this specific use case.",
      },
      {
        workflow: "Translating a PDF",
        theirWay: "Smallpdf has a Translate tool but layout preservation has been inconsistent.",
        ourWay: "pdfcraft ai → Translate PDF preserves layout cleanly across 90+ languages, with table and image-callout handling.",
      },
      {
        workflow: "Bulk processing many files",
        theirWay: "Smallpdf API for technical users; web tool processes one file at a time.",
        ourWay: "pdfcraft ai → Macros chain steps without writing code. Drop a folder in; output a folder out. No engineer required.",
      },
    ],
    faq: [
      {
        q: "Is Smallpdf cheaper than pdfcraft ai?",
        a: "No — Smallpdf Pro is about double our price at the entry tier ($9/month vs $4/month). Their free tier is also tighter (2 tasks/day vs unlimited).",
      },
      {
        q: "Will my Smallpdf integrations break?",
        a: "Your Smallpdf subscription is independent of ours. You can run both — many users do — and migrate over time. The Google Drive integration is the one piece you'd still need Smallpdf for if you depend on it heavily.",
      },
      {
        q: "Is Smallpdf's UI better?",
        a: "Honestly, it's good. Smallpdf has won design awards for the experience. Our UI is clean too but they've had more years to polish theirs.",
      },
      {
        q: "What about the Microsoft Word add-in?",
        a: "Smallpdf has one; we don't yet. If your workflow lives in Word and you depend on the add-in, that's a reason to keep Smallpdf for that specific job.",
      },
      {
        q: "What about file privacy?",
        a: "Both of us delete uploaded files within a couple of hours and don't use them for training. The biggest privacy difference is that our free tools run in your browser — your file never touches our servers — while Smallpdf uploads every file regardless of plan.",
      },
    ],
    relatedTools: ["merge", "split", "compress", "ai-sign", "ai-chat", "ai-summarize", "ai-translate"],
  },

  // -------------------------------------------------------------
  // Adobe Acrobat
  // -------------------------------------------------------------
  "adobe-acrobat": {
    slug: "adobe-acrobat",
    name: "Adobe Acrobat",
    domain: "adobe.com",
    founded: "1993",
    hq: "San Jose, California",
    oneLine:
      "Adobe Acrobat is the company that invented the PDF format in 1993. Acrobat Pro is the desktop standard for legal, government, and large enterprise PDF work — at around $240/year and 3 GB of installed software.",
    whatTheyDoWell: [
      "They invented the format. Their renderer is the reference implementation; if it looks right in Acrobat, it looks right everywhere.",
      "Industrial-grade features for prepress, accessibility (PDF/UA), archival (PDF/A), and forensic workflows.",
      "Integration with the full Adobe Creative Cloud suite if you already use Photoshop, Illustrator, or InDesign.",
      "Sign — Adobe's e-signature workflow — is well-integrated into Acrobat and accepted by virtually every enterprise compliance team.",
      "Cryptographic signing with full PKI support, timestamp authorities, and certificate management. The clear leader for high-stakes signing.",
    ],
    whereWeWin: [
      "Acrobat Pro DC costs around $240/year. Our Pro plan is $48/year — roughly one-fifth the price for the operations the typical user actually performs.",
      "Acrobat is desktop software (a 3 GB install) plus a separate cloud subscription. We are web-only, no install, works from any browser on any OS.",
      "Most of Acrobat's AI features (AI Assistant) cost an extra $5/month on top of the Acrobat subscription. Our equivalents are included.",
      "We have 50+ AI tools (Chat, Summarize, Translate, Redact, Compare, Sign & Fill, Generate from prompt). Adobe AI Assistant covers a smaller subset.",
      "Free tools on pdfcraft ai run in your browser. Adobe's free Reader is read-only; you cannot edit, merge, or compress without paying.",
    ],
    whereTheyWin: [
      "Compliance and high-stakes signing. If you need PKI-grade cryptographic signatures, qualified electronic signatures (QES), or PDF/A-3 archival output, Acrobat Pro is the only option auditors will accept without a fight.",
      "Pre-press and print production. PDF/X output, color management, ink calibration, transparency flattening — Acrobat has 30 years of features here that we don't.",
      "Large enterprise IT acceptance. Acrobat is on every IT department's approved-software list. We are not (yet).",
      "Accessibility. Acrobat's PDF/UA tooling — alt text on every image, tagged structure, reading order — is more thorough than ours.",
      "Working offline. Acrobat is a real desktop app; we require an internet connection.",
    ],
    matrix: [
      {
        category: "Format",
        rows: [
          { feature: "Web tool (no install)", us: true, them: "Adobe has Acrobat Online, but full features need the desktop app" },
          { feature: "Desktop app", us: false, them: true, note: "If you need offline, Acrobat is the only choice." },
          { feature: "Mobile apps", us: "Web only", them: "iOS, Android" },
          { feature: "Browser extension", us: "Roadmap", them: true },
        ],
      },
      {
        category: "Pricing",
        rows: [
          { feature: "Free tier", us: "43 tools unlimited", them: "Reader only — read PDFs, no editing" },
          { feature: "Cheapest paid plan", us: "$4/month", them: "Acrobat Standard ~$13/month" },
          { feature: "Pro plan", us: "$4/month (everything included)", them: "Acrobat Pro DC ~$20/month" },
          { feature: "AI features", us: "Included in $4/month", them: "AI Assistant +$5/month" },
        ],
      },
      {
        category: "Catalog",
        rows: [
          { feature: "PDF operations", us: "95 tools", them: "Comparable for editing; Acrobat covers more prepress" },
          { feature: "AI tools", us: "50+ (Chat, Summarize 11 formats, Translate 90+ langs, Redact, Compare, Sign & Fill, etc.)", them: "AI Assistant only" },
          { feature: "Macros / chained workflows", us: true, them: "Acrobat Actions (desktop only)" },
        ],
      },
      {
        category: "Privacy",
        rows: [
          { feature: "Free tools run in browser", us: true, them: false, note: "Adobe processes every file on their servers." },
          { feature: "Files deleted after processing", us: "60 minutes", them: "Acrobat Online: 24h" },
          { feature: "Files used for AI training", us: "Never", them: "Never (per current Adobe terms)" },
        ],
      },
      {
        category: "High-stakes / compliance",
        rows: [
          { feature: "PKI cryptographic signing", us: "API only", them: true, note: "Acrobat is the standard for compliance signing." },
          { feature: "PDF/A archival output", us: true, them: true },
          { feature: "PDF/X prepress", us: false, them: true },
          { feature: "PDF/UA accessibility", us: "Basic", them: "Comprehensive" },
          { feature: "Certificate trust chains", us: false, them: true },
        ],
      },
    ],
    pricing: {
      free: {
        us: "43 tools, unlimited use, no signup",
        them: "Adobe Reader only — read but not edit. Acrobat web has limited free trials.",
      },
      paid: {
        us: "$4/month, all tools and AI included",
        them: "Acrobat Standard $13/month or Acrobat Pro $20/month, plus $5/month for AI Assistant",
      },
      summary:
        "Acrobat Pro DC is around $240/year before AI; with AI Assistant it's roughly $300/year. Our Pro plan is $48/year and includes all AI features. The catch: Acrobat does things we don't (high-stakes cryptographic signing, prepress, full PDF/UA accessibility) that some specific jobs require. If you need those, the price is justified. For everyone else, the 5× price gap matters.",
    },
    migration: [
      {
        workflow: "Daily PDF editing (text, images, pages)",
        theirWay: "Acrobat Pro desktop → Edit PDF tool → save.",
        ourWay: "pdfcraft ai → Edit PDF in browser. Same operations; no install. Output is fully Acrobat-compatible.",
      },
      {
        workflow: "Combining files into one PDF",
        theirWay: "Acrobat Pro → Combine Files → drag in inputs → Combine.",
        ourWay: "pdfcraft ai → Merge PDFs (free, runs in browser).",
      },
      {
        workflow: "OCR a scanned PDF",
        theirWay: "Acrobat → Scan & OCR → Recognize Text. Solid quality, slow on long docs.",
        ourWay: "pdfcraft ai → AI OCR. Faster, with structure detection (tables, headings) Acrobat doesn't do natively. 20 pages free, then 2 credits per page.",
      },
      {
        workflow: "Asking questions about a PDF",
        theirWay: "Acrobat → AI Assistant ($5/month extra). Answers questions with citations.",
        ourWay: "pdfcraft ai → Chat with PDF. Same operation, included in our $4/month plan.",
      },
      {
        workflow: "Cryptographic signing for compliance",
        theirWay: "Acrobat → Certificate sign with your PKI cert. Industry standard.",
        ourWay: "pdfcraft ai → Visual signing for free; cryptographic signing through our API integration with certificate workflows. For most business contracts a visual signature is binding (US ESIGN, EU eIDAS); for high-stakes compliance, Acrobat is still the safer choice.",
      },
      {
        workflow: "Pre-press / print production",
        theirWay: "Acrobat Pro → Output Preview, Color Management, Ink Manager.",
        ourWay: "We don't compete here. Keep Acrobat for prepress.",
      },
    ],
    faq: [
      {
        q: "Can pdfcraft ai actually replace Acrobat for me?",
        a: "Depends on what you do. For 80% of office PDF work — editing, merging, splitting, compressing, OCR, signing, summarizing, redacting — yes, easily, at one-fifth the price. For specialized work (prepress, qualified e-signatures, full PDF/UA accessibility), Acrobat still wins.",
      },
      {
        q: "Is the file format compatible?",
        a: "Yes. We produce standard PDF (and PDF/A when you ask). Output opens cleanly in Acrobat, every browser, Preview, and every PDF reader. We use industry-standard libraries, not a proprietary format.",
      },
      {
        q: "What about Acrobat's AI Assistant?",
        a: "It's good, especially the cited-summary feature. Our Chat with PDF and Summarize PDF tools cover the same use cases and are included in our base plan instead of being a $5/month add-on.",
      },
      {
        q: "Can I use both?",
        a: "Yes. Many of our users keep Acrobat for the few jobs only Acrobat does (compliance signing, prepress) and use pdfcraft ai for everything else. You're not locked into one or the other.",
      },
      {
        q: "What about offline work?",
        a: "We're web-only. If you need to work on a flight without WiFi, Acrobat is the right choice. We're not pretending to compete here.",
      },
      {
        q: "Does pdfcraft ai support Adobe's e-signature workflow?",
        a: "We don't integrate with Adobe Sign. Our Sign tool is independent. If your team is already paying for Adobe Sign, you'd keep using it for that specific workflow.",
      },
    ],
    relatedTools: ["edit-pdf", "merge", "compress", "ai-ocr", "ai-chat", "ai-summarize", "ai-sign"],
  },

  // -------------------------------------------------------------
  // PDF24
  // -------------------------------------------------------------
  pdf24: {
    slug: "pdf24",
    name: "PDF24",
    domain: "pdf24.org",
    founded: "2006",
    hq: "Bonn, Germany",
    oneLine:
      "PDF24 is a German PDF tool suite that has been free since 2006, ad-supported, with both a web app and a free Windows desktop tool that runs offline.",
    whatTheyDoWell: [
      "Genuinely free, with no per-day caps and no required signup, supported by ads.",
      "The Windows desktop tool (PDF24 Creator) runs fully offline — install once, no internet needed.",
      "30+ tools, including some niche operations (e.g. PDF compare, PDF measure) you don't find elsewhere.",
      "Strong privacy story — files are deleted after a few hours, no AI training on data.",
      "German engineering reputation — stable, predictable software.",
    ],
    whereWeWin: [
      "We have 50+ AI tools (Chat with PDF, Summarize, Translate with layout preservation, AI Redact, AI Compare). PDF24 has zero AI tools.",
      "No ads anywhere on pdfcraft ai. PDF24 is ad-supported on every page.",
      "Free tools on pdfcraft ai run in your browser. PDF24's free web tools upload to their servers.",
      "Our UI is faster and cleaner — PDF24's design is functional but dated.",
      "Our paid plan ($4/month) unlocks AI features PDF24 simply doesn't have.",
    ],
    whereTheyWin: [
      "PDF24 is genuinely 100% free for everything they offer (ads pay the bills). We charge for AI features.",
      "PDF24 Creator (the Windows desktop app) runs offline. We're web-only.",
      "If you need a reliable Windows desktop PDF tool that costs nothing forever, PDF24 Creator is the right answer.",
      "PDF24 has been around since 2006 — 18 years of stability. We're newer.",
      "For niche operations like PDF measure (measuring distances on engineering drawings), PDF24 is one of the few free options.",
    ],
    matrix: [
      {
        category: "Pricing model",
        rows: [
          { feature: "Cost", us: "$0 free / $4/month Pro", them: "Free with ads" },
          { feature: "Ads", us: "None", them: "On every page" },
          { feature: "Daily limits", us: "None", them: "None" },
          { feature: "Signup required", us: "No (free tools)", them: "No" },
        ],
      },
      {
        category: "Catalog",
        rows: [
          { feature: "Total tools", us: "95", them: "~30" },
          { feature: "AI tools", us: "50+", them: "0" },
          { feature: "Niche tools (Measure, Compare, etc.)", us: "AI Compare", them: "Yes — PDF24 has good niche coverage" },
          { feature: "Macros / chained workflows", us: true, them: false },
        ],
      },
      {
        category: "Platform",
        rows: [
          { feature: "Web tool", us: true, them: true },
          { feature: "Windows desktop (offline)", us: false, them: true },
          { feature: "Mac desktop", us: false, them: false },
          { feature: "Mobile apps", us: "Web only", them: false },
          { feature: "Browser extension", us: "Roadmap", them: true },
        ],
      },
      {
        category: "AI",
        rows: [
          { feature: "Chat with PDF", us: true, them: false },
          { feature: "Summarize", us: true, them: false },
          { feature: "Translate (layout preserved)", us: true, them: false },
          { feature: "AI Redact PII", us: true, them: false },
          { feature: "AI OCR with structure", us: true, them: "Basic OCR only" },
        ],
      },
    ],
    pricing: {
      free: {
        us: "43 tools, unlimited, no ads",
        them: "All ~30 tools, unlimited, ad-supported",
      },
      paid: {
        us: "$4/month for AI tools",
        them: "No paid plan",
      },
      summary:
        "PDF24 is genuinely free forever with no caps, supported by ads. Our free tier is similar in scope but ad-free; the paid tier ($4/month) adds 50+ AI tools PDF24 doesn't offer at any price. If you only need basic operations and ads don't bother you, PDF24 is hard to argue with on cost. If you want AI tools or a cleaner UI, we're the better pick.",
    },
    migration: [
      {
        workflow: "Basic PDF operations (merge, split, compress)",
        theirWay: "PDF24 web → tool page → upload → process → download. Ad-supported.",
        ourWay: "pdfcraft ai → same tools, ad-free, runs in your browser without uploading.",
      },
      {
        workflow: "PDF Measure (engineering drawings)",
        theirWay: "PDF24 has a dedicated Measure tool.",
        ourWay: "We don't compete here. Keep PDF24 for measuring drawings.",
      },
      {
        workflow: "Offline PDF work",
        theirWay: "PDF24 Creator desktop app — install on Windows, works without internet.",
        ourWay: "We don't compete on offline. If offline is critical, PDF24 Creator is the right tool.",
      },
      {
        workflow: "Asking questions about a long PDF",
        theirWay: "PDF24 has no Chat with PDF feature.",
        ourWay: "pdfcraft ai → Chat with PDF, with page-level citations on every answer.",
      },
      {
        workflow: "Translating a contract while preserving layout",
        theirWay: "PDF24 has no PDF translation.",
        ourWay: "pdfcraft ai → Translate PDF in 90+ languages, layout preserved.",
      },
    ],
    faq: [
      {
        q: "Is PDF24 really 100% free?",
        a: "Yes. PDF24 is ad-supported, not a freemium upsell. They've been doing it for 18 years and it's a legitimate model. The trade-off is the ads.",
      },
      {
        q: "Do I need to switch?",
        a: "No, you can use both. If PDF24 covers all your jobs and you're fine with ads, keep using it. The reasons to add or switch to pdfcraft ai: AI tools (Chat, Summarize, Translate, Redact) PDF24 doesn't have, ad-free experience, and free tools that run in your browser instead of uploading.",
      },
      {
        q: "What about PDF24 Creator (the desktop app)?",
        a: "It's good, and it's the only fully offline option in this comparison. We don't compete on offline; we're web-only.",
      },
      {
        q: "Why is pdfcraft ai cleaner than PDF24?",
        a: "Newer codebase, no ads to lay out around, and a design system built for the AI tools we ship. PDF24's UI is functional and stable; ours is more modern.",
      },
    ],
    relatedTools: ["merge", "split", "compress", "ai-chat", "ai-summarize", "ai-translate"],
  },

  // -------------------------------------------------------------
  // Sejda
  // -------------------------------------------------------------
  sejda: {
    slug: "sejda",
    name: "Sejda",
    domain: "sejda.com",
    founded: "2010",
    hq: "USA",
    oneLine:
      "Sejda is a privacy-focused PDF tool suite founded in 2010, with a strict free tier (3 tasks per hour, 200-page max) and paid plans starting around $5/month.",
    whatTheyDoWell: [
      "Strong privacy posture — files deleted after 5 hours, no third-party tracking.",
      "Genuinely good PDF editor — better in-place editing than most web tools.",
      "Stable, mature product with a loyal user base.",
      "Desktop app for Windows, Mac, and Linux that runs offline (a real differentiator).",
      "OCR is solid for a free tier.",
    ],
    whereWeWin: [
      "Sejda's free tier is 3 tasks per hour with a 200-page or 50 MB cap. Ours is unlimited with a 100 MB cap on free tools.",
      "We have 95 tools versus their ~30, including 50+ AI tools they don't offer.",
      "Free tools on pdfcraft ai run in your browser. Sejda's web tools upload everything.",
      "Sejda's $5/month covers basic operations only. Our $4/month includes Chat, Summarize, Translate, Redact, Compare, and 45+ other AI tools.",
      "Sejda doesn't have AI features. We have a full AI catalog.",
    ],
    whereTheyWin: [
      "Sejda Desktop runs offline on Windows, Mac, and Linux. We don't have a desktop app.",
      "Sejda's in-place PDF editor is more polished for some operations (specifically inline text editing of complex layouts).",
      "Their privacy policy is one of the cleanest in the category — they delete files in 5 hours and don't track at all.",
      "If you need a desktop PDF editor that doesn't require Adobe and works on Linux, Sejda Desktop is one of the few good options.",
      "Their pricing is comparable; if you only use basic tools and don't need AI, the difference is small.",
    ],
    matrix: [
      {
        category: "Free tier",
        rows: [
          { feature: "Daily task limit", us: "Unlimited", them: "3 per hour" },
          { feature: "Page limit per file", us: "Free tools no limit", them: "200 pages" },
          { feature: "File size limit", us: "100 MB", them: "50 MB" },
          { feature: "Watermarks", us: "None", them: "None" },
          { feature: "In-browser processing", us: true, them: false },
        ],
      },
      {
        category: "Catalog",
        rows: [
          { feature: "Total tools", us: "95", them: "~30" },
          { feature: "AI tools", us: "50+", them: "0" },
          { feature: "Macros", us: true, them: false },
        ],
      },
      {
        category: "Platform",
        rows: [
          { feature: "Web", us: true, them: true },
          { feature: "Windows desktop", us: false, them: true },
          { feature: "Mac desktop", us: false, them: true },
          { feature: "Linux desktop", us: false, them: true },
          { feature: "Offline mode", us: false, them: true },
        ],
      },
      {
        category: "Pricing",
        rows: [
          { feature: "Cheapest plan", us: "$4/month", them: "$5/month (Sejda Web)" },
          { feature: "AI features included", us: true, them: "No AI" },
          { feature: "Annual cost", us: "$48", them: "$63" },
        ],
      },
    ],
    pricing: {
      free: {
        us: "43 tools, unlimited, 100 MB max",
        them: "30 tools, 3 tasks/hour, 200 pages, 50 MB max",
      },
      paid: {
        us: "$4/month all features",
        them: "$5/month Web, $63/year",
      },
      summary:
        "Pricing is similar at the entry tier. The real difference: Sejda doesn't have AI features at any price, while our paid plan includes 50+ AI tools. If you only need basic PDF operations on a Linux desktop, Sejda Desktop is the better choice. If you need AI features or work primarily in the browser, we're the better pick.",
    },
    migration: [
      {
        workflow: "Basic PDF operations within Sejda's free hour limit",
        theirWay: "Sejda → 3 tasks/hour → wait an hour or upgrade.",
        ourWay: "pdfcraft ai → same tools, no per-hour limit.",
      },
      {
        workflow: "Linux desktop PDF editing",
        theirWay: "Sejda Desktop on Linux — install, work offline.",
        ourWay: "We don't compete on Linux desktop. Sejda is the right tool here.",
      },
      {
        workflow: "Inline text editing of complex layouts",
        theirWay: "Sejda's editor is one of the best in the web category for this specific job.",
        ourWay: "Our Edit PDF works for most cases; for complex inline edits Sejda still wins.",
      },
      {
        workflow: "Asking AI questions about a PDF",
        theirWay: "Sejda has no AI. You'd export to text and use ChatGPT separately.",
        ourWay: "pdfcraft ai → Chat with PDF, included in $4/month plan.",
      },
      {
        workflow: "Privacy-first PDF processing",
        theirWay: "Sejda uploads files but deletes within 5 hours.",
        ourWay: "Our free tools run in your browser — your file never uploads. For paid AI ops we delete in 60 minutes and never train on user data.",
      },
    ],
    faq: [
      {
        q: "Why is Sejda's free tier so tight?",
        a: "It's their conversion model — the limits push frequent users to paid. Our model is different; we keep free tools fully unlimited and earn from paid AI usage instead.",
      },
      {
        q: "Should I keep Sejda Desktop?",
        a: "Yes if you need offline PDF editing on Mac, Windows, or Linux. We're web-only; we don't compete on offline.",
      },
      {
        q: "Is Sejda's editor better than yours?",
        a: "For some specific edits — inline text in complex multi-column layouts, especially — yes. For most workflows the difference is minor. Try our free Edit PDF on a real document and compare.",
      },
      {
        q: "Does Sejda have AI?",
        a: "No, not currently. That's the biggest catalog difference between us. If you need Chat with PDF, Summarize, Translate, Redact, or any of the 45+ other AI ops, we have them and Sejda doesn't.",
      },
    ],
    relatedTools: ["edit-pdf", "merge", "compress", "ai-chat", "ai-summarize", "ai-redact"],
  },
};

export const COMPETITOR_SLUGS = Object.keys(COMPETITORS) as CompetitorSlug[];
