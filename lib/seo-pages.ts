// SEO landing page data. Ported from prototype seo-pages.jsx SEO_PAGES.
//
// SEO Ship #1 (2026-04-25): we now also attach optional longform bodies
// to a hand-picked set of head-term landings. Those bodies live in
// ./seo-longform.ts and get merged into SEO_PAGES at the bottom of this
// file. Keeping them in a separate file keeps this catalog readable.

export type SeoPageSlug =
  | "merge-pdf"
  | "split-pdf"
  | "compress-pdf"
  | "pdf-to-word"
  | "translate-pdf"
  // Tier 1 expansion — 12 SEO landings routing to existing combo tools
  // (to-pdf, pdf-to-office) or the new client-side runners shipped on
  // 2026-04-24 (pdf-to-jpg, extract-pages, delete-pages, page-count).
  | "word-to-pdf"
  | "excel-to-pdf"
  | "powerpoint-to-pdf"
  | "jpg-to-pdf"
  | "png-to-pdf"
  | "pdf-to-jpg"
  | "pdf-to-png"
  | "pdf-to-excel"
  | "pdf-to-powerpoint"
  | "extract-pdf-pages"
  | "delete-pdf-pages"
  | "pdf-page-count"
  // 2026-04-24 wave 2: Tier 1 ships for PDF → TXT, Resize Pages, and
  // Remove Metadata. All three target high-intent Google queries where
  // iLovePDF / Smallpdf rank on the first page — long-tail money.
  | "pdf-to-text"
  | "resize-pdf"
  | "remove-pdf-metadata"
  | "add-logo-to-pdf"
  | "add-text-to-pdf"
  | "highlight-pdf"
  | "redact-pdf-free"
  | "extract-pdf-attachments"
  | "edit-pdf"
  | "sign-pdf-free"
  | "repair-pdf"
  | "flatten-pdf"
  | "markdown-to-pdf"
  | "text-to-pdf"
  | "pdf-to-markdown"
  | "pdf-to-html"
  | "extract-pdf-form-data"
  | "reorder-pdf-pages"
  | "extract-emails-from-pdf"
  | "pdf-to-ics-calendar"
  | "pdf-tldr"
  | "pdf-key-points"
  | "pdf-to-study-notes"
  | "explain-pdf"
  | "generate-faq-from-pdf"
  | "pdf-to-blog-post"
  | "pdf-readability-score"
  | "extract-entities-from-pdf"
  | "pdf-to-social-thread"
  // Task #68 — SEO landings for Tier 2 §2.2 (translate) + Tier 3 §3.6
  // HR + §3.3 Education wedges shipped in Tasks #67 / #61.
  | "hindi-pdf-translator"
  | "tamil-pdf-translator"
  | "cover-letter-generator"
  | "resume-job-match"
  // Task #69 — Tier 2 §2.3 P0.
  | "make-pdf-searchable"
  // Task #82 — 10 SEO landings for high-traffic Tier 3 wedges.
  | "nda-analyzer"
  | "employment-contract-review"
  // Task #83 — 10 more SEO landings for Tier 3 wedges.
  | "blood-report-analyzer"
  | "ats-resume-optimizer"
  | "resume-parser"
  | "salary-slip-analyzer"
  | "research-paper-summarizer"
  // Task #84 — 10 SEO landings for AI core + more Tier 3.
  | "chat-with-pdf"
  | "summarize-pdf"
  | "ai-pdf-ocr"
  | "compare-pdfs"
  | "ai-redact-pdf"
  | "discharge-summary-explainer"
  | "loan-application-bundler"
  | "pdf-to-flashcards"
  // Task #85 — 10 more SEO landings completing Tier 3 wedge coverage.
  | "court-judgment-summarizer"
  | "partnership-deed-analyzer"
  | "insurance-policy-analyzer"
  // Task #86 — 10 SEO landings for Tier 2 AI variants.
  | "pdf-to-quiz"
  | "pdf-to-mindmap"
  | "syllabus-to-study-plan"
  | "extract-tables-from-pdf"
  | "rewrite-pdf-tone"
  | "improve-pdf-writing"
  | "paraphrase-pdf"
  | "ai-content-detector"
  | "chart-to-data-table"
  | "stamp-pdf"
  | "n-up-pdf"
  | "grayscale-pdf"
  | "strip-links"
  | "booklet-pdf"
  | "free-draw-pdf"
  | "add-links";

export type SeoPageData = {
  tool: string; // tool id from lib/tools.ts
  h1: string;
  sub: string;
  canonical: string;
  howTo: Array<{ t: string; d: string }>;
  faq: Array<{ q: string; a: string }>;
  related: string[]; // tool ids
  // SEO Ship #1 (2026-04-25): optional 1,000+ word editorial body that
  // gives Google enough on-page content to rank for the head term. We
  // emit it as a real <article> with H2/H3 sub-heads + paragraphs + the
  // schema.org Article JSON-LD wrapper. When omitted, the page renders
  // exactly as before — only the top-20 head-term pages get this body.
  longform?: SeoLongform;
};

export type SeoLongform = {
  /** Section 1 H2 title (defaults to "What this tool does"). */
  title?: string;
  /** 1–3 sentence intro shown directly under the title. */
  intro?: string;
  /** Editorial sections rendered as <h3> + paragraphs (+ optional list). */
  sections: Array<{
    h: string;
    p: string[];
    list?: {
      ordered?: boolean;
      items: Array<{ b?: string; t: string }>;
    };
  }>;
};

export const SEO_PAGES: Record<SeoPageSlug, SeoPageData> = {
  "merge-pdf": {
    tool: "merge",
    h1: "Merge PDF files — free, online, unlimited",
    sub: "Combine any number of PDFs into a single document. Reorder pages, no watermarks, no signup.",
    canonical: "/merge-pdf",
    howTo: [
      {
        t: "Drop in your PDFs",
        d: "Select files from your device, Drive, or Dropbox. Up to 100MB each.",
      },
      {
        t: "Reorder if needed",
        d: "Drag to set the order. You can even interleave pages between files.",
      },
      {
        t: "Click Merge",
        d: "Done in seconds. Download or send to the next step in a macro.",
      },
    ],
    faq: [
      {
        q: "Is it really free?",
        a: "Yes. Merge is one of our eight free forever tools — no signup, no watermarks, no per-file or per-day limits. The whole free tier runs unlimited.",
      },
      {
        q: "What's the size limit?",
        a: "Each file up to 100MB, up to 50 files per merge. If you need more, the API runs batch jobs with no cap.",
      },
      {
        q: "Are my files kept?",
        a: "Files are encrypted in transit, processed in a sandboxed worker, and deleted within 60 minutes. Nothing is used for training.",
      },
      {
        q: "Can I merge password-protected PDFs?",
        a: "Yes — if you enter the password. Otherwise use the Unlock tool first, or chain both steps together in a macro.",
      },
      {
        q: "Can I rearrange pages between files?",
        a: "Yes. Drag page thumbnails after upload to interleave pages however you like.",
      },
      {
        q: "Does this work on iPhone / Android?",
        a: "Yes. The site is fully responsive and every free tool runs in the browser — no app install.",
      },
    ],
    related: ["split", "compress", "pdf-to-office", "rotate"],
  },
  "split-pdf": {
    tool: "split",
    h1: "Split PDF — extract pages as separate files",
    sub: "Split one PDF into many, pull out custom ranges, or save each page as its own file. Free.",
    canonical: "/split-pdf",
    howTo: [
      {
        t: "Upload your PDF",
        d: "Any size up to 100MB. We read the page count in seconds.",
      },
      {
        t: "Pick a split mode",
        d: "Each page as a separate file, custom ranges like 1-3, 5, 7-9, or every Nth page.",
      },
      {
        t: "Download a zip",
        d: "All your pages packaged up, named automatically.",
      },
    ],
    faq: [
      {
        q: "Can I split by custom ranges?",
        a: "Yes — use 1-3, 5, 7-9 syntax to grab exactly the pages you want.",
      },
      {
        q: "Can I split by file size?",
        a: 'Yes. In the Options panel, switch to "By size" and set a target MB per output.',
      },
      {
        q: "Do the output PDFs keep bookmarks?",
        a: "Yes — bookmarks that point into each range are preserved, orphaned ones are stripped.",
      },
      {
        q: "Is there a page limit?",
        a: "No limit on the free web tool. The API's batch endpoint handles 10k-page PDFs with streaming output.",
      },
    ],
    related: ["merge", "rotate", "compress", "pdf-to-office"],
  },
  "compress-pdf": {
    tool: "compress",
    h1: "Compress PDF — shrink file size without losing quality",
    sub: "Three levels of compression, typically 20-75% smaller. Free, fast, and safe for print.",
    canonical: "/compress-pdf",
    howTo: [
      {
        t: "Drop a PDF",
        d: "Scans, image-heavy reports, exported slide decks — anything goes.",
      },
      {
        t: "Pick a level",
        d: "Light (20%), Balanced (50%), or Strong (75%). Balanced keeps print-grade sharpness.",
      },
      {
        t: "Download",
        d: 'Attach to email, upload to portals — no more "file too large" bounces.',
      },
    ],
    faq: [
      {
        q: "What's the difference between Light, Balanced and Strong?",
        a: "Light re-encodes images at high quality (~80% JPEG). Balanced at medium (~60%). Strong at aggressive (~40%) and downsamples to 150 DPI — still readable, not print-grade.",
      },
      {
        q: "Can I compress to a specific size?",
        a: "Yes. Use 'Target size' in Options — we iterate until we hit your ceiling (or tell you it's not possible without destroying quality).",
      },
      {
        q: "Will text get blurry?",
        a: "No. Text stays vector. Only images are re-encoded.",
      },
      {
        q: "Are scanned PDFs handled differently?",
        a: "Yes. Scans trigger a different pipeline — we can also offer to OCR them in the same step (costs credits).",
      },
    ],
    related: ["merge", "split", "pdf-to-office", "to-pdf"],
  },
  "pdf-to-word": {
    tool: "pdf-to-office",
    h1: "PDF to Word — convert PDF to editable .docx, free",
    sub: "Preserves layout, fonts, tables, and images. Works on scans (with OCR) and digital PDFs.",
    canonical: "/pdf-to-word",
    howTo: [
      {
        t: "Upload the PDF",
        d: "Digital or scanned. We detect which one and pick the right pipeline.",
      },
      {
        t: "Pick .docx",
        d: "Or .xlsx for tables, .pptx for slide-like PDFs. Mix and match in the Options panel.",
      },
      {
        t: "Download and edit in Word",
        d: "Opens clean in Microsoft Word, Google Docs, and Pages. Formatting preserved.",
      },
    ],
    faq: [
      {
        q: "Does it work on scanned PDFs?",
        a: "Yes — OCR is applied automatically if the input has no embedded text. It runs on free tier up to 20 pages, then charges 2 credits/page.",
      },
      {
        q: "Will tables convert correctly?",
        a: "Yes. We detect table structure including merged cells. For multi-page tables or complex layouts, AI Table Extraction gives higher fidelity.",
      },
      {
        q: "What about fonts?",
        a: "We substitute to the closest available system font when the original isn't embedded. Embedded fonts are preserved exactly.",
      },
      {
        q: "Max pages?",
        a: "Free: 100 pages per file. API & Pro: unlimited.",
      },
    ],
    related: ["to-pdf", "ai-table", "ai-ocr", "compress"],
  },
  "translate-pdf": {
    tool: "ai-translate",
    h1: "Translate PDF — 90+ languages, layout preserved",
    sub: "Translate contracts, reports, academic papers, and handbooks while keeping formatting intact.",
    canonical: "/translate-pdf",
    howTo: [
      {
        t: "Upload your PDF",
        d: "Any language, any length. We detect the source language automatically.",
      },
      {
        t: "Pick target languages",
        d: "One or several. Batch output comes in a zip with one file per language.",
      },
      {
        t: "Download or run as macro",
        d: "Save the workflow to auto-translate every new file dropped in a folder.",
      },
    ],
    faq: [
      {
        q: "How much does it cost?",
        a: "1 credit per page. A 20-page document costs 20 credits (about $0.40 on the Starter pack).",
      },
      {
        q: "Will tables and images stay in place?",
        a: "Yes. We reconstruct the layout in the target language, shifting text blocks if the translation is longer or shorter.",
      },
      {
        q: "Which languages are supported?",
        a: "90+. Full list includes Spanish, French, German, Italian, Portuguese, Japanese, Korean, Simplified & Traditional Chinese, Arabic, Hindi, Vietnamese, Turkish, and many more.",
      },
      {
        q: "Can I translate into multiple languages at once?",
        a: "Yes — use the Multilingual Handbook macro, or queue targets in the Options panel.",
      },
    ],
    related: ["ai-summarize", "ai-rewrite", "ai-ocr", "merge"],
  },

  // -----------------------------------------------------------------
  // Tier 1 expansion (2026-04-24). Each landing routes to the matching
  // /tool/{id} runner. Copy is kept tight — high-intent keywords in
  // h1 + sub, 3 howTo steps, 4-5 FAQ entries. Long-tail entries map
  // to the SAME runner (pdf-to-excel and pdf-to-powerpoint both use
  // pdf-to-office; word-to-pdf / excel-to-pdf / jpg-to-pdf / png-to-pdf
  // all use to-pdf) because one tool can front many search queries.

  "word-to-pdf": {
    tool: "to-pdf",
    h1: "Convert Word to PDF — free, unlimited, no signup",
    sub: "Turn DOCX into a polished PDF with fonts, tables, and images preserved.",
    canonical: "/word-to-pdf",
    howTo: [
      { t: "Drop your DOCX", d: "Files up to 100 MB. Legacy .doc files also accepted." },
      { t: "We convert", d: "Server-side LibreOffice rendering — layout stays pixel-perfect." },
      { t: "Download", d: "Clean PDF, no watermarks, ready to share or sign." },
    ],
    faq: [
      { q: "Will tables and images stay aligned?", a: "Yes — we use a headless LibreOffice worker so the output matches what you'd see printing from Word." },
      { q: "Is it really free?", a: "Yes, unlimited. Free tier includes Word, Excel, PowerPoint, and image-to-PDF with no per-day cap." },
      { q: "What about .doc (old binary)?", a: "Supported too — we detect and auto-convert via the same pipeline." },
      { q: "Are my files kept?", a: "In-memory only. Discarded the moment the download completes." },
    ],
    related: ["to-pdf", "pdf-to-office", "merge", "compress"],
  },

  "excel-to-pdf": {
    tool: "to-pdf",
    h1: "Convert Excel to PDF — free online tool",
    sub: "XLSX / XLS → PDF with your sheets, columns, and formulas preserved.",
    canonical: "/excel-to-pdf",
    howTo: [
      { t: "Drop your XLSX", d: "We accept .xlsx, .xls, and Google Sheets exports." },
      { t: "We render", d: "Every sheet becomes its own page set; print area settings are respected." },
      { t: "Download", d: "Multi-sheet PDF, selectable text, ready to email." },
    ],
    faq: [
      { q: "Does it handle multiple sheets?", a: "Yes. Each sheet becomes one or more pages in the output PDF in the order they appear in the workbook." },
      { q: "Are formulas preserved?", a: "Formula results are preserved as static values. The PDF format doesn't hold live formulas." },
      { q: "Is it free?", a: "Yes, unlimited. No signup, no watermark." },
      { q: "Does it work for large workbooks?", a: "Up to 100 MB. For bigger jobs, try the API or split the workbook first." },
    ],
    related: ["to-pdf", "pdf-to-office", "merge"],
  },

  "powerpoint-to-pdf": {
    tool: "to-pdf",
    h1: "Convert PowerPoint to PDF — free, fast, no watermark",
    sub: "PPTX → PDF with every slide as one page, fonts and animations baked in as static frames.",
    canonical: "/powerpoint-to-pdf",
    howTo: [
      { t: "Drop your PPTX", d: "Also accepts .ppt and .odp." },
      { t: "We render slides", d: "One slide per page, in the order they appear in your deck." },
      { t: "Download", d: "Share a slide deck without requiring PowerPoint on the other end." },
    ],
    faq: [
      { q: "Do animations work?", a: "Animations are rendered as their final on-screen state. PDFs don't animate." },
      { q: "Are speaker notes included?", a: "Not by default — set Options → Include notes if you want them." },
      { q: "Free forever?", a: "Yes. No signup, unlimited conversions." },
      { q: "What about .key (Keynote)?", a: "Export to .pptx from Keynote first; we don't read native Keynote files." },
    ],
    related: ["to-pdf", "pdf-to-office", "merge", "compress"],
  },

  "jpg-to-pdf": {
    tool: "to-pdf",
    h1: "JPG to PDF — combine photos into a single PDF",
    sub: "Convert one or many images into a single PDF with custom page size and orientation.",
    canonical: "/jpg-to-pdf",
    howTo: [
      { t: "Drop your photos", d: "JPG, JPEG — select multiple and reorder after." },
      { t: "Arrange", d: "Drag to set the page order. One image per page by default." },
      { t: "Download", d: "Single PDF, ready to email, print, or sign." },
    ],
    faq: [
      { q: "Can I mix JPG and PNG?", a: "Yes — the Image-to-PDF tool accepts both. Also HEIC from iPhones." },
      { q: "What page size do I get?", a: "A4 by default. Switch to US Letter or fit-to-image in the Options panel." },
      { q: "Free?", a: "Yes, unlimited. No watermarks, no signup." },
      { q: "Is metadata stripped?", a: "EXIF/GPS metadata is dropped when the image becomes a PDF page. Use the Metadata tool to also strip PDF-level fields." },
    ],
    related: ["to-pdf", "compress", "merge", "pdf-metadata"],
  },

  "png-to-pdf": {
    tool: "to-pdf",
    h1: "PNG to PDF — convert images to PDF online",
    sub: "Turn PNG screenshots or scans into a searchable-ready PDF.",
    canonical: "/png-to-pdf",
    howTo: [
      { t: "Drop your PNGs", d: "Transparent backgrounds render on white paper automatically." },
      { t: "Arrange", d: "Reorder pages with drag-and-drop." },
      { t: "Download", d: "One PDF, crisp vectors-where-possible, rasters-where-needed." },
    ],
    faq: [
      { q: "Transparent PNG — what happens?", a: "We flatten transparency to a white background so the PDF renders the same in every reader." },
      { q: "Does OCR run?", a: "Not on this free tool — images stay as images. If you need text extraction, use the AI OCR tool." },
      { q: "Free?", a: "Yes. Unlimited, no signup." },
      { q: "How big can each image be?", a: "Up to 100 MB per file, up to 50 images per PDF." },
    ],
    related: ["to-pdf", "ai-ocr", "compress", "merge"],
  },

  "pdf-to-jpg": {
    tool: "pdf-to-jpg",
    h1: "PDF to JPG — export every page as a high-quality image",
    sub: "Convert each PDF page to JPG or PNG at 1×, 2×, or 3× scale. Runs in your browser.",
    canonical: "/pdf-to-jpg",
    howTo: [
      { t: "Drop your PDF", d: "Runs entirely on your device — nothing uploaded." },
      { t: "Pick format and scale", d: "JPG for photos, PNG for screenshots. Scale decides sharpness vs file size." },
      { t: "Download", d: "Grab a single page or use Download All to save every image at once." },
    ],
    faq: [
      { q: "What scale should I pick?", a: "1× for screen preview, 2× for printed output (~144 DPI equivalent), 3× for hi-res archiving." },
      { q: "Is my PDF uploaded?", a: "No — rasterization runs in the browser. Your file never leaves your device." },
      { q: "How many pages can I convert?", a: "No hard cap, but large PDFs (200+ pages) will take proportionally longer — each page renders sequentially." },
      { q: "Can I get all images as a zip?", a: "Not yet — click Download All to save each page individually. Zip support is on the roadmap." },
    ],
    related: ["pdf-to-jpg", "compress", "extract-images", "pdf-to-office"],
  },

  "pdf-to-png": {
    tool: "pdf-to-jpg",
    h1: "PDF to PNG — lossless page-to-image conversion",
    sub: "Export PDF pages to PNG for screenshots, thumbnails, or archival.",
    canonical: "/pdf-to-png",
    howTo: [
      { t: "Drop your PDF", d: "Processing happens in your browser." },
      { t: "Choose PNG", d: "Lossless quality, larger files than JPG but crisp for text." },
      { t: "Download", d: "Individual or all pages at once." },
    ],
    faq: [
      { q: "PNG vs JPG?", a: "PNG is lossless — best for text, line art, screenshots. JPG is smaller — best for photos." },
      { q: "Does scale affect file size?", a: "Yes — 2× means 4× the pixel count and roughly 4× the PNG size. Start at 2× and raise only if you need more detail." },
      { q: "Private?", a: "Yes — runs entirely in your browser." },
      { q: "Free?", a: "Unlimited, no signup." },
    ],
    related: ["pdf-to-jpg", "extract-images", "compress"],
  },

  "pdf-to-excel": {
    tool: "pdf-to-office",
    h1: "PDF to Excel — extract tables into a real spreadsheet",
    sub: "Convert tables inside a PDF into an editable XLSX — preserving rows, columns, and cell values.",
    canonical: "/pdf-to-excel",
    howTo: [
      { t: "Drop your PDF", d: "Works best on PDFs with real tables (not scanned images)." },
      { t: "We parse", d: "Table layout detected per page, columns aligned, cells split out." },
      { t: "Download XLSX", d: "Open in Excel, Numbers, or Google Sheets — ready to edit." },
    ],
    faq: [
      { q: "What about scanned tables?", a: "For scanned PDFs, use the AI Table Extract tool first — it runs OCR + structure detection for image-based tables." },
      { q: "Multi-page tables?", a: "Yes — tables spanning many pages are concatenated into a single sheet with a header row per page break." },
      { q: "Is it free?", a: "Yes for text PDFs. AI Table Extract (for scans) costs a few credits." },
      { q: "Are my files kept?", a: "In-memory only, discarded after download." },
    ],
    related: ["pdf-to-office", "ai-table", "extract-pages", "compress"],
  },

  "pdf-to-powerpoint": {
    tool: "pdf-to-office",
    h1: "PDF to PowerPoint — turn a PDF into an editable deck",
    sub: "Every page becomes a slide. Text, images, and basic layout are recreated.",
    canonical: "/pdf-to-powerpoint",
    howTo: [
      { t: "Drop your PDF", d: "Works best on PDFs originally created from slide decks." },
      { t: "We convert", d: "One PDF page → one PPTX slide, with text and images placed." },
      { t: "Download PPTX", d: "Open in PowerPoint, Keynote, or Google Slides — tweak and present." },
    ],
    faq: [
      { q: "Will layouts be perfect?", a: "Close, not exact. Text boxes land approximately where they were; animations are lost (PDFs have no animation data)." },
      { q: "Free?", a: "Yes, unlimited." },
      { q: "What about embedded videos?", a: "PDFs don't embed videos the way PPTX does — any video in the original deck is lost when exported to PDF." },
      { q: "Privacy?", a: "Processed in-memory; not stored after download." },
    ],
    related: ["pdf-to-office", "to-pdf", "merge"],
  },

  "extract-pdf-pages": {
    tool: "extract-pages",
    h1: "Extract PDF pages — pick just the pages you need",
    sub: "Build a new PDF from any subset of pages. Specify ranges like 1-3, 5, 7-9.",
    canonical: "/extract-pdf-pages",
    howTo: [
      { t: "Drop your PDF", d: "Runs in your browser — we never see the file." },
      { t: "Type the pages", d: "Commas for single pages, dashes for ranges. Order matters in the output." },
      { t: "Download", d: "New PDF with only the pages you picked, in the order you listed them." },
    ],
    faq: [
      { q: "What if I reorder the pages in my spec?", a: "They come out in the order you list them. \"5, 1, 3\" gives a 3-page PDF with those pages in that exact order." },
      { q: "Is this the same as Split?", a: "Similar but different. Split makes one output per range. Extract makes one combined output with just the pages you wanted." },
      { q: "Free?", a: "Yes. No signup, unlimited." },
      { q: "Password-protected PDFs?", a: "Unlock first with the Protect tool, then extract. We don't handle password input directly yet." },
    ],
    related: ["extract-pages", "split", "delete-pages", "merge"],
  },

  "delete-pdf-pages": {
    tool: "delete-pages",
    h1: "Delete PDF pages — remove unwanted pages in seconds",
    sub: "Specify which pages to drop; everything else stays in its original order.",
    canonical: "/delete-pdf-pages",
    howTo: [
      { t: "Drop your PDF", d: "Processed in your browser, no upload." },
      { t: "List pages to remove", d: "Commas and dashes — e.g. 3, 5-7, 12." },
      { t: "Download", d: "New PDF with those pages gone." },
    ],
    faq: [
      { q: "Can I undo?", a: "We don't modify your original — the download is a new file. Keep both until you're sure." },
      { q: "What if I delete everything?", a: "We stop you. You must leave at least one page." },
      { q: "Free?", a: "Yes, unlimited." },
      { q: "Privacy?", a: "100% browser-side — nothing uploaded, nothing stored." },
    ],
    related: ["delete-pages", "extract-pages", "split", "rotate"],
  },

  "pdf-page-count": {
    tool: "page-count",
    h1: "PDF page count + word count — instant stats",
    sub: "Drop a PDF and see page count, word count, character count, and all metadata fields. Free, unlimited.",
    canonical: "/pdf-page-count",
    howTo: [
      { t: "Drop your PDF", d: "Runs entirely in your browser." },
      { t: "We read", d: "Pages + all embedded text, then tally counts." },
      { t: "Read off the stats", d: "Page count, word count, character count, plus title, author, and creation date from the PDF metadata." },
    ],
    faq: [
      { q: "Does it work for scanned PDFs?", a: "Page count yes — but word count will show 0 because there's no extractable text. Run OCR first to convert a scan into searchable text." },
      { q: "How accurate is word count?", a: "It splits on whitespace after extraction. Comparable to what Microsoft Word shows for the same document." },
      { q: "Is it free?", a: "Yes, unlimited." },
      { q: "Privacy?", a: "Entirely browser-side. Your PDF is never uploaded." },
    ],
    related: ["page-count", "ai-summarize", "pdf-metadata", "ai-ocr"],
  },

  "pdf-to-text": {
    tool: "pdf-to-text",
    h1: "PDF to Text — extract plain text from any PDF",
    sub: "Pull every word out of a text-based PDF and download it as a plain .txt file. Free, unlimited, in your browser.",
    canonical: "/pdf-to-text",
    howTo: [
      { t: "Drop your PDF", d: "Parsed in your browser — never uploaded." },
      { t: "We extract", d: "Every page's text is read in reading order with page-break markers between pages." },
      { t: "Download .txt", d: "Plain UTF-8 text file. Paste into Word, Google Docs, or any editor." },
    ],
    faq: [
      { q: "Does it work for scanned PDFs?", a: "No — scans are images, so there's no extractable text. Use AI · OCR first to convert the scan into a searchable PDF, then come back here." },
      { q: "Is formatting preserved?", a: "Layout is flattened to reading order. Columns, tables, and decorative positioning will read sequentially. If you need layout, use PDF → Word instead." },
      { q: "Any size limit?", a: "Up to 100MB per file. Runs fully on your device, so longer docs just take a bit longer to parse." },
      { q: "Is it really free?", a: "Yes, unlimited. No watermarks, no signup." },
    ],
    related: ["pdf-to-text", "pdf-to-office", "ai-summarize", "ai-ocr"],
  },

  "resize-pdf": {
    tool: "resize-pdf",
    h1: "Resize PDF pages — change to A4, Letter, Legal, A3, A5, or Tabloid",
    sub: "Convert any PDF to a standard paper size. Preserve aspect ratio, stretch to fit, or crop — your call.",
    canonical: "/resize-pdf",
    howTo: [
      { t: "Drop your PDF", d: "Processed client-side — never leaves your browser." },
      { t: "Pick a target size", d: "Six presets: A4, A3, A5, US Letter, US Legal, US Tabloid." },
      { t: "Choose a fit mode", d: "Scale preserves aspect ratio. Stretch fills the new size. Crop keeps content at 1:1 and trims to fit." },
    ],
    faq: [
      { q: "Does it change the file size?", a: "Usually modestly — the content streams aren't re-encoded, only the page dimensions change. For drastic size shrinks, run Compress PDF afterwards." },
      { q: "What if my pages are mixed sizes?", a: "All pages are converted to the selected target. The first page's dimensions are shown when you load the file so you know your starting point." },
      { q: "Aspect ratio?", a: "Scale mode always preserves aspect ratio and adds letterbox space if needed. Stretch distorts. Crop clips." },
      { q: "Privacy?", a: "100% client-side. Your PDF is never uploaded." },
    ],
    related: ["resize-pdf", "crop-pdf", "compress", "rotate"],
  },

  "remove-pdf-metadata": {
    tool: "remove-metadata",
    h1: "Remove PDF metadata — scrub author, title, dates before sharing",
    sub: "Uploaded PDFs routinely carry the author's name, the original filename, and the authoring app. Strip them before you share.",
    canonical: "/remove-pdf-metadata",
    howTo: [
      { t: "Drop your PDF", d: "We read the metadata fields without uploading the file." },
      { t: "See what's there", d: "Title, Author, Subject, Keywords, Creator, Producer, creation + modification dates, and any XMP metadata stream." },
      { t: "Scrub and download", d: "Every field cleared. Content streams untouched." },
    ],
    faq: [
      { q: "What exactly gets removed?", a: "The /Info dictionary (Title, Author, Subject, Keywords, Creator, Producer, dates) and the XMP metadata stream if present. Content — text, images, annotations — is never touched." },
      { q: "Does redacting content still need this?", a: "Yes. Redacting text is pointless if the metadata still says 'Prepared by Jane Smith, C:\\Users\\jane\\Documents\\confidential.docx'." },
      { q: "Annotations and form fields?", a: "Those can carry their own author metadata. For a truly clean document, flatten first (Flatten PDF tool), then scrub metadata." },
      { q: "Privacy?", a: "Your PDF is processed entirely in your browser — nothing is uploaded or stored." },
    ],
    related: ["remove-metadata", "pdf-metadata", "flatten-pdf", "ai-redact"],
  },

  "add-logo-to-pdf": {
    tool: "image-watermark",
    h1: "Add a logo or image watermark to a PDF — free, in your browser",
    sub: "Stamp a PNG or JPEG onto every page. Nine-position grid, opacity and scale sliders, per-page selection. No signup, no watermarks on your output.",
    canonical: "/add-logo-to-pdf",
    howTo: [
      { t: "Drop your PDF", d: "Processed on your device — nothing uploaded." },
      { t: "Pick your logo or watermark image", d: "PNG (with transparency) or JPEG. We show a preview so you can confirm." },
      { t: "Set position, scale, and opacity", d: "Nine-point grid (corners / edges / center). Scale = % of page's short side. Opacity = 10–100%." },
      { t: "Apply to all pages or a range", d: "Blank = every page. Or type e.g. 1, 3-5, 9 to target specific pages." },
    ],
    faq: [
      { q: "Will it go behind the text?", a: "No — it draws on top with your chosen opacity. A subtle 20–30% opacity reads as a background stamp even when drawn on top, which is how every major PDF tool handles image watermarks. True behind-content layering requires content-stream surgery that most viewers don't render consistently." },
      { q: "What image formats?", a: "PNG (including transparency) and JPEG. GIF isn't supported by the PDF spec — convert to PNG first." },
      { q: "Is aspect ratio preserved?", a: "Yes. Scale sets the maximum dimension; the other side shrinks to keep proportions." },
      { q: "Will it work on scanned PDFs?", a: "Yes — the watermark draws on top of whatever's already on each page, including scanned images." },
      { q: "Is it really free?", a: "Yes, unlimited. No signup, no output watermarks, no per-file limits." },
    ],
    related: ["image-watermark", "page-numbers", "flatten-pdf", "protect"],
  },

  "add-text-to-pdf": {
    tool: "add-text-box",
    h1: "Add text to a PDF — type directly on any page, free",
    sub: "Click anywhere on a PDF page to drop a text box. Navigate multi-page docs, adjust font size, preview before applying. No signup.",
    canonical: "/add-text-to-pdf",
    howTo: [
      { t: "Drop your PDF", d: "Rendered in your browser — never uploaded." },
      { t: "Type your text + pick a font size", d: "Helvetica, black, 6 to 96 pt. Color + custom fonts coming in a later release." },
      { t: "Click on the page where you want it", d: "A highlighted preview appears at the click point. Navigate with Prev / Next to add text across pages." },
      { t: "Apply and download", d: "All placed text boxes get written in one pass. The list below the canvas shows everything staged before you commit." },
    ],
    faq: [
      { q: "Can I edit existing text in the PDF?", a: "No — this tool adds new text boxes on top of the existing content. Editing existing text needs a full PDF editor (we're building that as Edit PDF)." },
      { q: "Which fonts and colors?", a: "Current version uses Helvetica in black at sizes 6–96 pt. Font family and color are next up." },
      { q: "Does the preview match the final output exactly?", a: "Position is accurate; the on-canvas font size preview is approximate because pdf-lib and browser-font metrics differ slightly. The final PDF uses pdf-lib's drawText which is precise." },
      { q: "Privacy?", a: "100% client-side. The PDF never leaves your browser." },
      { q: "Is it really free?", a: "Yes, unlimited. No watermarks, no signup." },
    ],
    related: ["add-text-box", "page-numbers", "image-watermark", "fill-forms"],
  },

  "highlight-pdf": {
    tool: "highlight-pdf",
    h1: "Highlight PDF — drag-to-mark any region, free",
    sub: "Drag the cursor across a PDF page to highlight. Yellow, green, pink, blue, or orange. Multi-page, no signup, stays in your browser.",
    canonical: "/highlight-pdf",
    howTo: [
      { t: "Drop your PDF", d: "Rendered in your browser — never uploaded." },
      { t: "Pick a highlight color", d: "Five presets: yellow (default), green, pink, blue, orange." },
      { t: "Drag over what you want to highlight", d: "Click-drag anywhere on the rendered page. Navigate with Prev / Next to highlight across pages." },
      { t: "Apply and download", d: "All staged highlights get baked into the PDF at 40% opacity — readable and unmistakable." },
    ],
    faq: [
      { q: "Are these real PDF highlight annotations?", a: "No — this MVP draws semi-transparent rectangles via pdf-lib's drawRectangle. They render consistently in every viewer but aren't interactive annotations that screen readers or copy-paste can inspect. Real /Highlight annotations are on the roadmap for a richer paid Annotate tool." },
      { q: "Can I move a highlight after placing it?", a: "Not yet. Click the × on the highlight (or on the list below the canvas) to remove and redraw. Edit-in-place is on the list." },
      { q: "Can I highlight text specifically?", a: "No — it's rectangular regions only. Text-selection-aware highlighting would need the OCR text layer; that's in scope for the AI · OCR tool paired with this one." },
      { q: "Privacy?", a: "100% client-side. Your PDF is never uploaded." },
      { q: "Is it really free?", a: "Yes, unlimited. No signup, no watermarks on your output." },
    ],
    related: ["highlight-pdf", "add-text-box", "ai-redact", "flatten-pdf"],
  },

  "redact-pdf-free": {
    tool: "redact-free",
    h1: "Redact PDF free — black out sensitive info in your browser",
    sub: "Drag black boxes over anything you need to hide. Multi-page. Visual-cover MVP; cryptographic stream-level redaction is the paid upgrade.",
    canonical: "/redact-pdf-free",
    howTo: [
      { t: "Drop your PDF", d: "Rendered on your device — nothing uploaded." },
      { t: "Drag over sensitive regions", d: "Each drag becomes a fully-opaque black rectangle. Navigate multi-page docs with Prev / Next." },
      { t: "Apply and download", d: "Rectangles get baked in. Form fields are flattened on save for extra metadata cleanup." },
    ],
    faq: [
      { q: "Is this truly redacted?", a: "Visually yes — every reasonable viewer, print, and screenshot shows a black box. But the original text objects remain in the content stream; a determined attacker can extract them with `pdftotext`. For everyday sharing (screenshots, printing, non-adversarial review), this is what you need. For legal discovery / adversarial review, use a stream-level redaction tool (that's the paid AI · Redact upgrade)." },
      { q: "Why is this free but AI · Redact costs credits?", a: "Manual redaction — you tell us where — is free. AI · Redact automatically detects PII / sensitive patterns for you, which uses an AI call. Both produce the same output format." },
      { q: "Does it remove annotations / form fields?", a: "Yes — we flatten the form on save so annotation-carried metadata gets baked into static content. For extra scrubbing of /Author, /Title, /Producer fields, run Remove Metadata first." },
      { q: "Privacy?", a: "100% client-side. Your PDF never leaves your browser." },
    ],
    related: ["redact-free", "ai-redact", "remove-metadata", "flatten-pdf"],
  },

  "extract-pdf-attachments": {
    tool: "extract-attachments",
    h1: "Extract PDF attachments — save embedded files to your disk",
    sub: "Some PDFs carry embedded files (invoices, data, supporting docs). List them all and download the ones you want.",
    canonical: "/extract-pdf-attachments",
    howTo: [
      { t: "Drop your PDF", d: "We read the /EmbeddedFiles name tree locally." },
      { t: "See the list", d: "Every attachment with its filename, description, and size." },
      { t: "Save what you need", d: "One-click download per attachment, correct MIME inferred from extension." },
    ],
    faq: [
      { q: "What if there are no attachments?", a: "Most PDFs don't carry attachments — they're a specific authoring feature. You'll see a clear message telling you the /EmbeddedFiles tree is empty." },
      { q: "Does it include images on the pages?", a: "No — this is for files embedded via /EmbeddedFiles, not images drawn on the page. For image extraction, use Extract Images." },
      { q: "Privacy?", a: "Everything is parsed and saved in your browser — nothing is uploaded." },
    ],
    related: ["extract-attachments", "extract-images", "pdf-metadata", "page-count"],
  },


  "edit-pdf": {
    tool: "edit-pdf",
    h1: "Edit PDF text — click, type, replace. Free, in your browser",
    sub: "Click any text on a PDF page to edit it. Font and position preserved. Multi-page, no signup, no watermarks.",
    canonical: "/edit-pdf",
    howTo: [
      { t: "Drop your PDF", d: "Rendered on your device — nothing uploaded." },
      { t: "Click the text you want to change", d: "Every text run on the page is clickable. The current text appears in an inline editor." },
      { t: "Type the replacement", d: "Press Enter to save, Escape to cancel. Edits stack — you can change many runs in one session." },
      { t: "Apply and download", d: "Original text is covered, replacement drawn at the same position with a matched standard font." },
    ],
    faq: [
      { q: "Does it work on scanned PDFs?", a: "No — scans are images, not text. Run AI · OCR first to convert the scan into a searchable PDF, then come back here. Once OCR'd, the detected text becomes editable." },
      { q: "What about coloured or patterned backgrounds?", a: "This v1 covers the original text with an opaque white rectangle before drawing the replacement. On coloured backgrounds the white rectangle will be visible. For those cases, use Redact first (to blank the region your way), then Add Text Box for the new content." },
      { q: "Why does my replacement look slightly different?", a: "pdf-lib's standard fonts cover Helvetica / Times / Courier / Symbol / ZapfDingbats in their regular/bold/italic/bold-italic variants. Documents using Roboto, Arial, or an embedded custom font will render replacements in Helvetica — the editor shows a warning chip when that's the case." },
      { q: "Can I edit images too?", a: "Not yet. This is a v1 text-only release. Image editing (replace, delete, resize) is on the roadmap." },
      { q: "Will longer text overflow?", a: "Yes — we don't reflow surrounding content, so a replacement much longer than the original may overflow into adjacent text. The editor flashes a warning if your replacement is >40% longer." },
      { q: "Privacy?", a: "100% client-side. Your PDF never leaves your browser." },
    ],
    related: ["edit-pdf", "add-text-box", "redact-free", "ai-rewrite"],
  },

  "sign-pdf-free": {
    tool: "sign-pdf-free",
    h1: "Sign PDF online free — draw, type, or upload your signature",
    sub: "Place your signature on any PDF page in three clicks. No signup, no watermarks. Multi-page, multi-placement.",
    canonical: "/sign-pdf-free",
    howTo: [
      { t: "Drop your PDF", d: "Rendered client-side — never uploaded." },
      { t: "Create your signature", d: "Three modes: Draw (touch + mouse), Type (italic script font), or Upload (PNG / JPEG with transparency)." },
      { t: "Click to place on the page", d: "Click anywhere on the rendered page to drop a copy. Multiple placements per signature, navigate multi-page with Prev / Next." },
      { t: "Sign and download", d: "pdf-lib embeds the signature PNG and draws each placement at the clicked coordinates. Download the signed PDF." },
    ],
    faq: [
      { q: "Is this a legally binding e-signature?", a: "It places a visual signature image on the PDF — the same category as Adobe Acrobat's \"Fill & Sign\". For many contracts and everyday paperwork that's sufficient. For legally-binding cryptographic signatures (ISO 32000 DigSig with certificate), you'll want a CA-backed signing service; that's roadmapped as a paid feature." },
      { q: "What's the difference between this and the paid AI · Sign?", a: "AI · Sign automatically detects signature fields (and related form fields), fills them, and places your signature in the right spots. This free version is manual: you pick where. Both produce the same signed-PDF output format." },
      { q: "Is my signature stored?", a: "No — the signature exists in your browser memory only. It's embedded into the PDF you download; nothing is saved server-side." },
      { q: "Which file formats for upload?", a: "PNG (including transparent background — recommended) and JPEG. Transparent PNG gives the cleanest look over existing page content." },
      { q: "Can I sign multiple documents at once?", a: "Not yet — one PDF at a time in v1. Batch signing is planned for the paid tier." },
      { q: "Privacy?", a: "100% client-side. Your PDF and your signature never leave your browser." },
    ],
    related: ["sign-pdf-free", "ai-sign", "fill-forms", "protect"],
  },

  "repair-pdf": {
    tool: "repair-pdf",
    h1: "Repair PDF — fix corrupt, broken, or stuck PDFs free",
    sub: "Rebuilds the xref table, drops orphaned objects, recompresses streams. In your browser, no upload, no signup.",
    canonical: "/repair-pdf",
    howTo: [
      { t: "Drop your PDF", d: "Parse attempts run locally — if it's recoverable, we rebuild it in seconds." },
      { t: "We try strict first", d: "Any parse error is caught and retried with full recovery mode (throwOnInvalidObject: false, ignoreEncryption: true)." },
      { t: "Re-save with fresh xref", d: "Orphaned objects dropped, xref table rebuilt, content streams recompressed. Usually comes out smaller." },
      { t: "Download + read the report", d: "Each step's outcome is listed so you know exactly what was repaired." },
    ],
    faq: [
      { q: "What kinds of corruption does this fix?", a: "Stale or out-of-date xref tables, missing trailers, broken page-tree references from truncated uploads, invalid /Info entries, wrong %PDF header, and encryption with a blank password. These cover most 'Adobe won't open this' cases." },
      { q: "What CAN'T it fix?", a: "PDFs missing the catalog object entirely (nothing to rebuild from), binary corruption inside individual content streams (needs operator-level parsing — not in our MVP), and real password-protected PDFs (unlock those with our Protect tool first)." },
      { q: "Will it lose any content?", a: "Unreachable pages and orphaned objects are dropped — that's by design. If a page can't be walked via the catalog, it's effectively invisible to every viewer already; the repair doesn't change what you see, it just cleans up the file structure." },
      { q: "Does it make the file smaller?", a: "Usually yes. Orphaned objects and stale xref entries accumulate in heavily-edited PDFs. The repair report shows the before/after sizes so you know how much was reclaimed." },
      { q: "Privacy?", a: "100% client-side. pdf-lib parses and re-saves in your browser — nothing uploaded." },
    ],
    related: ["repair-pdf", "compress", "flatten-pdf", "pdf-metadata"],
  },

  "flatten-pdf": {
    tool: "flatten-pdf",
    h1: "Flatten PDF — bake forms, annotations, and signatures into static content",
    sub: "Make a PDF un-editable: form fields become permanent text, annotations get burned in, signatures lock in place. Free, in-browser.",
    canonical: "/flatten-pdf",
    howTo: [
      { t: "Drop your PDF", d: "Up to 100 MB. Forms, annotations, comments, and editable signatures are all detected." },
      { t: "Click Flatten", d: "Form field values are written as static text. Annotations and digital signatures lock in place. The output behaves like a printed scan." },
      { t: "Download", d: "Recipients can read but cannot edit, modify form values, or remove highlights and signatures." },
    ],
    faq: [
      { q: "Why flatten?", a: "Form fields and annotations stay editable by anyone with a PDF reader. Flattening converts them into part of the page itself, locking the file in its current state. Use this before sharing a final version where you don't want recipients accidentally (or intentionally) modifying values." },
      { q: "Is flattening reversible?", a: "No. Flattening is permanent — once form fields are baked into the page, you can't get them back as fields. Always save the unflattened working copy alongside the flattened deliverable." },
      { q: "Will signatures still verify after flattening?", a: "Visual signatures stay visible. Cryptographic signatures are invalidated by flattening because the byte layout changes — the signature becomes a visible stamp without the verification chain. Sign after flattening if you need cryptographic validity." },
      { q: "What about comments and highlights?", a: "All annotations get burned into the page. Highlight color overlays become permanent yellow/blue/etc. tints. Comment text becomes either visible text or is dropped depending on the comment type." },
      { q: "Privacy?", a: "100% client-side. The flatten operation runs in your browser via pdf-lib. Your file never uploads." },
    ],
    related: ["sign-pdf-free", "page-numbers", "remove-metadata", "compress"],
  },

  "markdown-to-pdf": {
    tool: "markdown-to-pdf",
    h1: "Markdown to PDF — free online .md → .pdf converter",
    sub: "Paste or upload Markdown, get a polished A4 PDF with headings, bold, italic, lists, and code blocks. 100% in your browser.",
    canonical: "/markdown-to-pdf",
    howTo: [
      { t: "Paste or upload", d: "Drop your .md file or paste content directly. Sample loaded by default so you can see the format." },
      { t: "We render locally", d: "Minimal inline parser + pdf-lib draws each block with Helvetica body / Helvetica-Bold headers / Courier code. No server round-trip." },
      { t: "Auto-pagination", d: "A4 with 1-inch margins. New pages spawn automatically when content overflows." },
      { t: "Download", d: "Save the PDF. No watermarks, no signup, no per-file limits." },
    ],
    faq: [
      { q: "What Markdown is supported?", a: "Headers (# ## ###), paragraphs, **bold**, *italic*, `inline code`, fenced code blocks, unordered (-) and ordered (1.) lists, blockquotes (>), horizontal rules (---), and [links](url) rendered as blue text." },
      { q: "What's NOT supported?", a: "Tables (pipe syntax) and images (![]()) — both are on the v2 roadmap. HTML passthrough is rendered literally. Need those now? Use AI · Generate for more complex layouts." },
      { q: "Are links clickable in the output PDF?", a: "Not in v1 — links render as blue text without the /Link annotation needed for click-through. Real hyperlinks are on the v2 list." },
      { q: "What font is used?", a: "Helvetica for body, Helvetica-Bold for headings, Helvetica-Oblique for italic, Courier for inline/block code. These are PDF standard fonts — no font embedding, so output files stay small." },
      { q: "Can I upload a .txt file?", a: "Yes — plain text is rendered as a single paragraph. For formatting use actual Markdown syntax." },
      { q: "Privacy?", a: "100% client-side. Your markdown and PDF never leave the browser." },
    ],
    related: ["markdown-to-pdf", "to-pdf", "ai-generate", "invoice-generator"],
  },

  "text-to-pdf": {
    tool: "text-to-pdf",
    h1: "Text to PDF — free .txt to .pdf converter, in your browser",
    sub: "Paste plain text or upload a .txt file, choose a font and page size, download the PDF. No signup, no watermarks.",
    canonical: "/text-to-pdf",
    howTo: [
      { t: "Paste or upload", d: "Drop a .txt file or paste directly into the text area." },
      { t: "Pick your style", d: "Font (Helvetica / Times / Courier), size (8–24 pt), page size (A4 / Letter / Legal), margin (24–144 pt)." },
      { t: "Generate and download", d: "Line breaks are preserved; long lines auto-wrap to fit the page. Pages add themselves as needed." },
    ],
    faq: [
      { q: "What's the difference vs. Markdown to PDF?", a: "Markdown to PDF interprets syntax — ** becomes bold, # becomes a header, etc. Text to PDF takes your text literally, no syntax interpretation. Use Text to PDF for logs, code, letters, or any content where you don't want formatting rules applied." },
      { q: "Will long lines wrap?", a: "Yes — greedy word-wrap against the page width using the exact font metrics. If a single word is wider than the line, it gets clipped; keep lines reasonable." },
      { q: "Are tabs supported?", a: "Tabs expand to 4 spaces so Courier alignment stays consistent. Consider using Courier + a larger margin for code listings." },
      { q: "How big can the file be?", a: "5 MB of input text. Larger inputs should be split (the output PDF is roughly 1 page per 40 lines at default settings — keep that in mind for page count)." },
      { q: "Privacy?", a: "100% client-side. Your text and PDF never leave the browser." },
    ],
    related: ["text-to-pdf", "markdown-to-pdf", "to-pdf", "ai-generate"],
  },

  "pdf-to-markdown": {
    tool: "pdf-to-markdown",
    h1: "PDF to Markdown — free, heuristic conversion in your browser",
    sub: "Drop a PDF, get a .md file. Headings detected by font size, bold runs preserved. No AI credits needed.",
    canonical: "/pdf-to-markdown",
    howTo: [
      { t: "Drop your PDF", d: "Parsed locally via pdfjs — no upload." },
      { t: "We extract text + metadata", d: "Each text run's font size and weight. Top sizes become # H1 / ## H2 / ### H3." },
      { t: "Download the .md file", d: "Preview visible inline; full file downloadable." },
    ],
    faq: [
      { q: "How does heading detection work?", a: "We build a font-size histogram. The most-common size is body text; anything ≥1.25× body becomes H3, ≥1.6× becomes H2, ≥2× becomes H1. Works well on well-typeset documents." },
      { q: "What about tables?", a: "Tables lose fidelity — this is a heuristic, not AI. Complex layouts (multi-column, tables, figures) come out as sequential text. For higher-quality conversion, use AI · Rewrite chained with OCR." },
      { q: "Does it do OCR?", a: "No — scanned / image-only PDFs produce no text. Run AI · OCR first to convert the scan to a text-based PDF, then come back." },
      { q: "Privacy?", a: "100% client-side — nothing uploaded." },
    ],
    related: ["pdf-to-markdown", "pdf-to-text", "ai-ocr", "ai-rewrite"],
  },

  "pdf-to-html": {
    tool: "pdf-to-html",
    h1: "PDF to HTML — free self-contained .html converter",
    sub: "Single-file HTML with inline CSS, heuristic heading detection, browser-ready output. In your browser.",
    canonical: "/pdf-to-html",
    howTo: [
      { t: "Drop your PDF", d: "Parsed via pdfjs — never uploaded." },
      { t: "We build a self-contained .html", d: "Inline CSS, Helvetica default, H1/H2/H3 detected by font size, <strong> for bold runs, <hr> between pages." },
      { t: "Download and open", d: "Works in any browser. No external stylesheets, no CDN dependencies." },
    ],
    faq: [
      { q: "Can I edit the result?", a: "Yes — the HTML uses standard tags (h1/h2/h3/p/strong) and inline styles. Drop it into a wiki, CMS, or editor of choice." },
      { q: "Does it preserve tables and images?", a: "Tables and images are not supported in v1 — text only. For richer output use AI · OCR (for images) or the paid AI · Rewrite." },
      { q: "Privacy?", a: "100% client-side." },
    ],
    related: ["pdf-to-html", "pdf-to-markdown", "pdf-to-text", "ai-rewrite"],
  },

  "extract-pdf-form-data": {
    tool: "extract-form-data",
    h1: "Extract PDF form data — CSV or JSON, free",
    sub: "Pull the values out of every AcroForm field (text, checkbox, radio, dropdown, list) and download as CSV or JSON.",
    canonical: "/extract-pdf-form-data",
    howTo: [
      { t: "Drop your filled PDF form", d: "AcroForm fields enumerated locally." },
      { t: "Review the table", d: "Each field shown with name, type, and current value." },
      { t: "Download CSV or JSON", d: "CSV for spreadsheets, JSON for scripts." },
    ],
    faq: [
      { q: "What if the PDF has no form fields?", a: "You'll see a clear \"no fields\" message. Static PDFs with visible signature lines aren't form fields — they're just drawn text." },
      { q: "What about XFA / dynamic forms?", a: "Only classic AcroForm fields are extracted. XFA is Adobe-proprietary and not supported by pdf-lib." },
      { q: "Privacy?", a: "100% client-side — no data leaves your browser." },
    ],
    related: ["extract-form-data", "fill-forms", "ai-table"],
  },

  "reorder-pdf-pages": {
    tool: "sort-pages",
    h1: "Reorder PDF pages — drag thumbnails visually, free",
    sub: "See every page as a thumbnail. Drag to reorder. Reverse or restore. Download the new PDF.",
    canonical: "/reorder-pdf-pages",
    howTo: [
      { t: "Drop your PDF", d: "Each page renders as a thumbnail client-side." },
      { t: "Drag to reorder", d: "Click and drag any thumbnail to a new position. Use Reverse for bulk-flip, Restore original to reset." },
      { t: "Apply and download", d: "pdf-lib copyPages in the new sequence; original untouched." },
    ],
    faq: [
      { q: "Does it change the pages themselves?", a: "No — only the order. Each page's content is copied verbatim into the new sequence." },
      { q: "Works for large PDFs?", a: "Up to 100MB. Thumbnails render progressively so you can start dragging before all are done." },
      { q: "Privacy?", a: "100% client-side." },
    ],
    related: ["sort-pages", "rotate", "extract-pages", "delete-pages"],
  },

  "extract-emails-from-pdf": {
    tool: "extract-contacts",
    h1: "Extract emails, phones, URLs from a PDF — free, client-side",
    sub: "Regex-based contact extraction from any text-based PDF. CSV and vCard downloads. No signup, no AI credits.",
    canonical: "/extract-emails-from-pdf",
    howTo: [
      { t: "Drop your PDF", d: "Parsed locally via pdfjs — never uploaded." },
      { t: "Review the table", d: "Every email, phone, and URL found, with the source page." },
      { t: "Download CSV or vCard", d: "CSV for spreadsheets; vCard for address-book imports." },
    ],
    faq: [
      { q: "Does it work on scans?", a: "No — scanned / image-only PDFs produce no text. Run AI · OCR first, then come back." },
      { q: "What about obfuscated emails?", a: "This is regex-based, so patterns like \"jane (at) example (dot) com\" or text-as-image are missed. For those, the paid AI version handles obfuscation." },
      { q: "How are phone numbers detected?", a: "A practical 10–15 digit pattern that covers common international formats and Indian 10-digit numbers. Sequences like page numbers or ISBN fragments with 8+ identical digits are filtered out." },
      { q: "Privacy?", a: "100% client-side. Your PDF never leaves the browser." },
    ],
    related: ["extract-contacts", "ai-redact", "pdf-to-text", "remove-metadata"],
  },

  "pdf-to-ics-calendar": {
    tool: "extract-dates",
    h1: "PDF to .ics calendar — extract every date into your calendar",
    sub: "Find every date in a PDF (schedules, contracts, syllabi) and download an .ics file importable into Google Calendar / Apple Calendar / Outlook.",
    canonical: "/pdf-to-ics-calendar",
    howTo: [
      { t: "Drop your PDF", d: "Text extracted locally via pdfjs." },
      { t: "Dates regex'd + normalised", d: "Supports ISO (2026-04-24), slashes (24/04/2026), named months (24 April 2026). Day-first vs month-first toggle for ambiguous cases." },
      { t: "Download .ics or CSV", d: "Each date becomes an all-day VEVENT with surrounding context as the SUMMARY." },
    ],
    faq: [
      { q: "Day-first vs month-first?", a: "\"04/05/2026\" is ambiguous — Indian/EU reads it as 4 May; US reads it as April 5. Toggle in the UI; default is day-first (Indian convention)." },
      { q: "What about contextual dates?", a: "Phrases like \"next Tuesday\" or \"the first Monday of March\" need the paid AI version — regex only matches literal date strings." },
      { q: "Which calendars accept the .ics?", a: "Any standards-compliant app: Google Calendar (File → Import), Apple Calendar (drag .ics onto the app), Outlook, Fastmail, Proton Calendar." },
      { q: "Privacy?", a: "100% client-side — nothing uploaded." },
    ],
    related: ["extract-dates", "pdf-to-text", "ai-summarize", "page-count"],
  },

  "pdf-tldr": {
    tool: "ai-tldr",
    h1: "PDF TL;DR — one-paragraph executive summary in seconds",
    sub: "Drop any PDF, get a 2–4 sentence TL;DR. 2 credits per doc. Faster and cheaper than the full Summarize tool.",
    canonical: "/pdf-tldr",
    howTo: [
      { t: "Drop your PDF", d: "Any PDF, up to 25 MB." },
      { t: "We extract + summarise", d: "Server-side text extraction + Gemini Flash 2.5 one-paragraph prompt." },
      { t: "Read the TL;DR", d: "Tight 2–4 sentence executive summary. Full doc saved to your Files if you want to re-run with more depth." },
    ],
    faq: [
      { q: "How is this different from Summarize PDF?", a: "TL;DR is optimised for the \"just tell me what this says\" use case — one paragraph, 2 credits. Summarize gives section headings and bullets at 3 credits, with TL;DR / Standard / Detailed depth pickers. Same backend, different front doors." },
      { q: "Is it accurate on long PDFs?", a: "The TL;DR runs on the full extracted text up to the model's context window. Very long PDFs may be truncated — we show a warning when that happens and point you at the chunked Detailed mode." },
      { q: "Does it work on scanned PDFs?", a: "Only if they have a text layer. Scanned / image-only PDFs: run AI · OCR first." },
      { q: "Signin required?", a: "Yes — all AI tools require a signed-in account (25 free credits on signup, worth ~₹125 of usage)." },
    ],
    related: ["ai-tldr", "ai-summarize", "ai-chat", "pdf-to-text"],
  },

  "pdf-key-points": {
    tool: "ai-key-points",
    h1: "PDF Key Points Extractor — 6–12 bullets, each cited by page",
    sub: "Drop a PDF and get a clean bulleted list of its core insights. No prose, no TL;DR, just the bullets. 3 credits per doc.",
    canonical: "/pdf-key-points",
    howTo: [
      { t: "Drop your PDF", d: "Any text PDF up to 25 MB." },
      { t: "We extract + condense", d: "Gemini Flash 2.5 produces a bulleted list — each bullet is one claim or finding with a page citation." },
      { t: "Copy or save", d: "Result renders as Markdown; saved to your Files for re-use." },
    ],
    faq: [
      { q: "How is this different from Summarize?", a: "Summarize returns TL;DR + bullets + section prose. Key Points returns ONLY the bullets — scannable, quick, no reading through intros. 3 credits vs 3 credits but much less output to wade through." },
      { q: "How many bullets?", a: "6–12 typically. Shorter PDFs get fewer, longer get more. No fixed cap — the model decides based on how many distinct claims exist." },
      { q: "What about the page citations?", a: "Every bullet should end with \"[p. N]\" citing where the claim came from. If a bullet lacks a citation, the model couldn't trace it to a single page (common for multi-page themes)." },
      { q: "Signin required?", a: "Yes — 25 free credits on signup." },
    ],
    related: ["ai-key-points", "ai-summarize", "ai-tldr", "ai-study-notes"],
  },

  "pdf-to-study-notes": {
    tool: "ai-study-notes",
    h1: "PDF to Study Notes — revision-grade AI notes with self-check questions",
    sub: "Turn any PDF (textbook, paper, lecture) into structured study notes with key concepts, detailed sections, takeaways, and self-check questions. 8 credits per doc.",
    canonical: "/pdf-to-study-notes",
    howTo: [
      { t: "Drop your PDF", d: "Textbook chapter, research paper, or lecture slides — any text PDF." },
      { t: "We build the note pack", d: "Overview → Key Concepts → Detailed Notes (concept-by-concept with Remember: takeaways) → Self-Check Questions for recall testing." },
      { t: "Download and revise", d: "Rendered as Markdown; saved to your Files for revision sessions." },
    ],
    faq: [
      { q: "Who is this for?", a: "Students preparing for exams, teachers building revision packs, self-learners. Longer output than Summarize (8 credits vs 3) because study notes need the detail + recall-test structure." },
      { q: "Does it hallucinate?", a: "We explicitly instruct the model not to invent facts. Every claim is grounded in the source text; analogies are allowed but must preserve the source's factual claims. For high-stakes exam prep, cross-check with the original." },
      { q: "What about the self-check questions?", a: "4–6 short-answer questions for active-recall testing. No answer key — the point is to test what you've learned, then re-read the corresponding section to check." },
      { q: "Indian school syllabus (NCERT)?", a: "Works across curricula — the prompt is general. Paid vertical tool NCERT Summarizer (§3.3) is roadmapped as a class-wise optimised variant." },
    ],
    related: ["ai-study-notes", "ai-summarize", "ai-key-points", "ai-eli5"],
  },

  "explain-pdf": {
    tool: "ai-eli5",
    h1: "Explain PDF in plain English — free 25 credits on signup",
    sub: "Short sentences, everyday words, no jargon. Big Idea / Details / Why It Matters structure. 3 credits per PDF.",
    canonical: "/explain-pdf",
    howTo: [
      { t: "Drop your PDF", d: "Any text-based PDF — research papers, legal docs, medical reports, technical whitepapers." },
      { t: "Gemini simplifies", d: "Plain-language explanation with three sections: The Big Idea, The Details, Why It Matters." },
      { t: "Read or share", d: "Good for non-expert audiences, briefing family on medical reports, first-pass skim of research papers." },
    ],
    faq: [
      { q: "Does simplification lose accuracy?", a: "We explicitly instruct the model to preserve factual claims even inside analogies. Numbers, dates, and quotes aren't simplified — only the VOICE is. For exam / publication-grade answers, use Summarize instead." },
      { q: "Why 12 and not 5?", a: "\"Like I'm 5\" is the SEO keyword, but 12 is the actual reading level we target — short sentences, no jargon, but enough vocabulary that the output isn't patronising." },
      { q: "Does it work for legal / medical PDFs?", a: "Yes — plain-language summaries of contracts or lab reports are the top use case. But this is NOT legal or medical advice. Verify with a professional before acting." },
    ],
    related: ["ai-eli5", "ai-summarize", "ai-tldr", "ai-key-points"],
  },

  "generate-faq-from-pdf": {
    tool: "ai-faq",
    h1: "Generate FAQ from PDF — 6–10 Q&A pairs, answers cited",
    sub: "Auto-extract the likely questions a reader would ask, with answers grounded in the source. 5 credits per PDF.",
    canonical: "/generate-faq-from-pdf",
    howTo: [
      { t: "Drop your PDF", d: "Any document — product spec, policy, research paper." },
      { t: "We infer + answer", d: "Gemini Flash 2.5 asks what a reader would realistically ask and answers only from the source text." },
      { t: "Ship it", d: "Use as-is on your help center, in onboarding, or as a review deck. Gaps flagged under 'Not covered'." },
    ],
    faq: [
      { q: "How is this different from Chat with PDF?", a: "Chat with PDF lets YOU ask — one question at a time. FAQ Generator predicts the top 6–10 questions your readers will ask and answers them all at once. Flat-fee 5 credits per doc vs 5 credits / 20 questions on Chat." },
      { q: "Can I trust the answers?", a: "Answers are grounded in the source and page-cited where possible. Gaps the document doesn't address are flagged under a 'Not covered' section rather than made up." },
      { q: "Can I edit the output?", a: "Yes — result is Markdown; saved to your Files. Paste into any help-center editor." },
    ],
    related: ["ai-faq", "ai-chat", "ai-summarize", "ai-key-points"],
  },

  "pdf-to-blog-post": {
    tool: "ai-blog",
    h1: "PDF to Blog Post — publish-ready article in seconds",
    sub: "Reformat a whitepaper, report, or research PDF as a blog post with hook, sections, and conclusion. 10 credits per PDF.",
    canonical: "/pdf-to-blog-post",
    howTo: [
      { t: "Drop your PDF", d: "Research report, whitepaper, policy brief, case study." },
      { t: "We restructure", d: "Title + lede + 3–5 H2 sections with paragraphs and bullets + closing. Factual fidelity preserved — no invented claims." },
      { t: "Edit to taste + ship", d: "Markdown output; drop straight into WordPress, Ghost, Medium, or any Markdown CMS." },
    ],
    faq: [
      { q: "Does it editorialise?", a: "No — we explicitly instruct the model not to add opinions the source doesn't carry. Numbers, dates, quotes preserved exactly. If you want opinion-pieces, use AI · Rewrite with a tone shift afterwards." },
      { q: "SEO-optimised?", a: "Structurally yes — H1/H2/H3 hierarchy, natural lead-in, scannable bullets. Keyword targeting isn't automatic — add your own keyword tune-up pass before publishing." },
      { q: "How long is the output?", a: "~800–1500 words typically; scales with source length. Cap is set to accommodate 3–5 sections with a few paragraphs each." },
    ],
    related: ["ai-blog", "ai-rewrite", "ai-summarize", "ai-generate"],
  },

  "pdf-readability-score": {
    tool: "ai-readability",
    h1: "PDF Readability Score — Flesch-Kincaid grade + edit suggestions",
    sub: "Analyse a PDF's writing quality: grade level, complex sentences, jargon callouts, concrete edit suggestions. 3 credits.",
    canonical: "/pdf-readability-score",
    howTo: [
      { t: "Drop your PDF", d: "Any text-based document." },
      { t: "We analyse", d: "Estimate Flesch-Kincaid grade, flag long sentences and jargon without definition." },
      { t: "Apply the fixes", d: "Use the suggestions in AI · Rewrite to actually apply them." },
    ],
    faq: [
      { q: "Does it rewrite the document?", a: "No — Readability analyses. To revise the text itself, pipe the suggestions into AI · Rewrite." },
      { q: "How accurate is the Flesch-Kincaid estimate?", a: "Within ±1 grade level for most English text. True precision needs a deterministic calculator; for nuanced judgement (\"is this accessible to a 12-year-old?\") the LLM estimate is usually better." },
      { q: "Does it handle non-English?", a: "Flesch-Kincaid is English-specific; the complex-sentence + jargon detection degrades gracefully to other Latin-script languages but results are best for English." },
    ],
    related: ["ai-readability", "ai-rewrite", "ai-eli5", "ai-summarize"],
  },

  "extract-entities-from-pdf": {
    tool: "ai-entities",
    h1: "Extract named entities from a PDF — people, orgs, places, dates",
    sub: "Four Markdown tables, page-cited, with one-line role notes. 3 credits.",
    canonical: "/extract-entities-from-pdf",
    howTo: [
      { t: "Drop your PDF", d: "Reports, research, news, legal docs." },
      { t: "We extract", d: "People, Organisations, Places, Dates — each in its own table with page cites." },
      { t: "Paste into your system", d: "Markdown tables copy cleanly into Notion, Google Docs, spreadsheets via import." },
    ],
    faq: [
      { q: "How is this different from Extract Contacts?", a: "Extract Contacts (free) finds emails/phones/URLs via regex. Extract Entities (AI, 3 credits) identifies named people, organisations, places, and dates with context — things regex can't catch reliably." },
      { q: "Does it infer entity relationships?", a: "No — v1 extracts, doesn't link. Two people mentioned in the same document aren't claimed to know each other unless the source says so." },
      { q: "What about Indian names?", a: "Works across languages / scripts the LLM understands (all Indian scripts supported by Gemini). Accuracy degrades for rare transliterations — verify before critical use." },
    ],
    related: ["ai-entities", "extract-contacts", "ai-summarize", "ai-key-points"],
  },

  "pdf-to-social-thread": {
    tool: "ai-social-thread",
    h1: "PDF to social thread — 5–10 post LinkedIn/X thread, publish-ready",
    sub: "Numbered thread with hook opener, one-idea-per-post body, takeaway close. No emojis, no hashtags, no cringe. 5 credits.",
    canonical: "/pdf-to-social-thread",
    howTo: [
      { t: "Drop your PDF", d: "Whitepaper, report, research paper, case study." },
      { t: "We structure", d: "5–10 numbered posts at ~240 chars each. Opening hook is specific (a claim, number, or question from the source — not a generic tease)." },
      { t: "Paste into LinkedIn / X", d: "Copy post-by-post, or use a thread scheduler. Markdown output makes it easy." },
    ],
    faq: [
      { q: "Does it editorialise?", a: "No — the voice is 'direct first-person-neutral', not personal or corporate. No added opinions, no hot takes. If you want a punchier take, run AI · Rewrite on the output with a tone shift." },
      { q: "Emojis and hashtags?", a: "Intentionally suppressed. Both are noise in most B2B contexts. Add them yourself if your audience expects them." },
      { q: "How long is each post?", a: "~240 chars — under X's historical cap and well under LinkedIn's limit. If you need a different length, reformat from the Markdown output." },
    ],
    related: ["ai-social-thread", "ai-blog", "ai-summarize", "ai-tldr"],
  },

  // ---------------------------------------------------------------
  // Task #68 — SEO landings.
  //
  //   §2.2 translate: Hindi + Tamil carry enormous India search
  //   volume. Both land on /tool/ai-translate with preset target
  //   language via query-param (handled client-side by the runner).
  //
  //   §3.6 HR wedges (cover letter + JD match) — global search
  //   volume, especially ATS-heavy queries.
  //
  //   §3.3 Education wedges (TNPSC + JEE/NEET) — niche but
  //   extremely high-intent; TNPSC aspirants are a well-defined
  //   persona already searching for analyser tools.
  // ---------------------------------------------------------------

  "hindi-pdf-translator": {
    tool: "ai-translate",
    h1: "Hindi PDF Translator — English to Hindi & Hindi to English",
    sub: "Translate PDFs between Hindi and English while keeping layout, tables, and images in place. 1 credit per page.",
    canonical: "/hindi-pdf-translator",
    howTo: [
      { t: "Drop your PDF", d: "Hindi (Devanagari) or English source — we detect automatically. Up to 100 MB." },
      { t: "Pick direction", d: "English → Hindi, or Hindi → English. Bilingual side-by-side output also available." },
      { t: "Download", d: "Translated PDF with original layout preserved. Ready to share or print." },
    ],
    faq: [
      { q: "Does it handle Hindi Unicode correctly?", a: "Yes. We embed a Devanagari-capable font so conjuncts, matras, and nuqtas render correctly — no question-mark glyphs or broken ligatures." },
      { q: "What about mixed Hindi-English documents?", a: "Common in Indian documents (government forms, university syllabi). We keep English terms untranslated when they're technical (names, acronyms, company names) and only translate the Hindi body." },
      { q: "Accuracy vs Google Translate?", a: "We use Gemini Flash 2.5 — comparable on everyday prose, better on legal / tax / medical registers because we prompt the model to match the source document's tone." },
      { q: "Does it work for government forms (PAN, Aadhaar, TNPSC papers)?", a: "Yes — scanned forms go through AI OCR first, then translation. Output is a searchable PDF you can fill or share." },
    ],
    related: ["ai-translate", "ai-ocr", "tamil-pdf-translator", "ai-summarize"],
  },

  "tamil-pdf-translator": {
    tool: "ai-translate",
    h1: "Tamil PDF Translator — English to Tamil & Tamil to English",
    sub: "Translate PDFs between Tamil and English with layout preserved. Built for TN government forms, judgements, and study material. 1 credit per page.",
    canonical: "/tamil-pdf-translator",
    howTo: [
      { t: "Drop your PDF", d: "Tamil or English source. Auto-detected. Up to 100 MB per file." },
      { t: "Pick direction", d: "English → Tamil, or Tamil → English. Side-by-side bilingual output also available." },
      { t: "Download", d: "Translated PDF keeps its original layout, tables, and pagination." },
    ],
    faq: [
      { q: "Does it render Tamil correctly?", a: "Yes — Noto Sans Tamil is embedded, so ligatures (க்ஷ, ஶ்ரீ), grantha consonants, and combining vowels render accurately. No question marks, no broken glyphs." },
      { q: "Handles Tamil Nadu government forms?", a: "Yes — TANGEDCO bills, pattas, EC certificates, rental agreements, and TNPSC papers are in our regular test set. Scanned forms go through OCR first, then translation." },
      { q: "Will legal Tamil be translated correctly?", a: "Court judgments, rental agreements, and sale deeds use a specialised register (neethimandram, vaadhi, pratividhi). Gemini Flash 2.5 handles this well; we prompt the model to preserve the formal register." },
      { q: "What about Tamil-English code-mixed text?", a: "Common in emails and WhatsApp exports. We keep English as-is when it reads naturally to a Tamil speaker and translate only the Tamil body." },
    ],
    related: ["ai-translate", "ai-ocr", "hindi-pdf-translator", "ai-tnpsc"],
  },

  "cover-letter-generator": {
    tool: "ai-cover-letter",
    h1: "AI Cover Letter Generator — tailored to the job description",
    sub: "Drop your resume, paste the JD, get a 300-word tailored cover letter with customisation notes. 5 credits.",
    canonical: "/cover-letter-generator",
    howTo: [
      { t: "Upload your resume", d: "PDF only. We parse the structure automatically." },
      { t: "Paste the JD (optional)", d: "Paste the full job description for a tailored letter, or leave blank for a strong generic version." },
      { t: "Download or copy", d: "300-350 words, 3-paragraph letter + customisation-notes section showing which resume lines mapped to which JD requirements." },
    ],
    faq: [
      { q: "What makes this different from ChatGPT?", a: "We use the actual resume PDF (not a paste), extract real achievements with numbers, and surface a 3-bullet 'which line mapped to which requirement' section so you can swap in alternatives." },
      { q: "Will it sound like AI?", a: "Not if you let it do its job. We suppress AI-speak clichés ('self-motivated team player', 'hit the ground running') with explicit negative examples in the prompt. The letter reads like a human wrote it." },
      { q: "How long is the letter?", a: "Capped at 350 words — the sweet spot for reading time without feeling empty. Three paragraphs: hook, two achievements, close with call to action." },
      { q: "Can I generate multiple versions?", a: "Yes — run it again with a different JD. Each run costs 5 credits. The customisation-notes section tells you which lines to swap for different roles." },
    ],
    related: ["ai-cover-letter", "ai-jd-match", "ai-ats-resume", "ai-resume-parse"],
  },

  "resume-job-match": {
    tool: "ai-jd-match",
    h1: "Resume ↔ Job Description Matcher — fit score + gap analysis",
    sub: "Score your resume 0–100 against any JD, with per-requirement alignment table and missing-keyword ATS audit. 5 credits.",
    canonical: "/resume-job-match",
    howTo: [
      { t: "Upload resume PDF", d: "Your latest resume. We parse structure, skills, and achievements." },
      { t: "Paste the JD", d: "Full job description — role, responsibilities, requirements, qualifications." },
      { t: "Get the report", d: "Fit score 0–100, requirement-by-requirement alignment table, strengths, gaps, missing ATS keywords, and 3 concrete next steps." },
    ],
    faq: [
      { q: "How is the fit score calculated?", a: "Weighted match across: explicit JD requirements (50%), inferred skills (25%), seniority/title alignment (15%), domain keywords (10%). The score is a ballpark, not a guarantee — use the per-requirement table for actionable detail." },
      { q: "Does it catch missing keywords?", a: "Yes — we extract JD-critical terms (tools, certifications, acronyms) and flag which ones are absent from the resume. Those are the ones most likely to block you at the ATS filter stage." },
      { q: "What's a 'good' score?", a: "80+ usually means you're a strong fit. 65–80: worth applying with a tailored cover letter. Below 65: consider the gap list — some gaps close easily (add a line), others need real experience." },
      { q: "Is my resume stored?", a: "No — by default we delete uploads after your session. Upgrade to Pro for 30-day history if you want to track multiple JDs." },
    ],
    related: ["ai-jd-match", "ai-cover-letter", "ai-ats-resume", "ai-resume-parse"],
  },



  "make-pdf-searchable": {
    tool: "ai-searchable-pdf",
    h1: "Make PDF searchable — OCR scanned pages, keep visual layout",
    sub: "Add an invisible text layer to a scanned PDF so Ctrl-F finds matches and copy/paste returns real text. Original page appearance unchanged. 2 credits per page.",
    canonical: "/make-pdf-searchable",
    howTo: [
      { t: "Drop your scanned PDF", d: "Up to 50 pages per file. Larger? Use the free Split PDF tool first, then run each chunk." },
      { t: "We OCR each page", d: "Vision OCR transcribes the text — works on machine-printed scans and most clear handwriting." },
      { t: "Download the searchable PDF", d: "Same visual content, plus an invisible text layer. Ctrl-F now works in Acrobat, Chrome, Preview, and search engines." },
    ],
    faq: [
      { q: "Will the visual page look any different?", a: "No — the original scanned image is untouched. We only add an invisible text overlay (opacity 0). The PDF reader's text-search index sees the text; visually nothing changes." },
      { q: "Will copy/paste give me word-perfect text?", a: "Search works perfectly. Copy/paste returns the recognised text as a single block per page rather than word-by-word coordinates. For pixel-accurate copy/paste with bounding boxes we need Tesseract HOCR — on the roadmap." },
      { q: "What languages are supported?", a: "English works best. Indian-language scripts (Devanagari, Tamil, Telugu, etc.) are recognised by the OCR step but the invisible-text overlay uses a Latin-only font, so search for non-Latin queries is best-effort." },
      { q: "What happens to blank pages?", a: "Skipped silently. The page stays in the output but no overlay is added. Your credit cost is based on TOTAL pages OCR'd, including blanks (the OCR pass still touches every page)." },
      { q: "Is this faster than Acrobat OCR?", a: "Comparable. Acrobat does word-bbox positioning which gives perfect copy/paste alignment but takes ~5-10 seconds per page. Our pass is ~2-3s per page and gives perfect search." },
    ],
    related: ["ai-searchable-pdf", "ai-ocr", "ai-translate", "split-pdf"],
  },

  // ---------------------------------------------------------------
  // Task #82 — SEO landings for the 10 highest-traffic Tier 3
  // wedges shipped in #75-#81. Every page auto-inherits JSON-LD
  // HowTo + FAQPage + SoftwareApplication from SeoLandingPage,
  // making them eligible for Google rich results.
  // ---------------------------------------------------------------

  "nda-analyzer": {
    tool: "ai-nda",
    h1: "NDA Analyzer — flag risky clauses, missing carveouts, negotiation points",
    sub: "Drop a Non-Disclosure Agreement. We surface risk flags by severity, missing standard carveouts (residual knowledge, publicly-known info), embedded non-competes, and IP-assignment-in-NDA traps. 15 credits.",
    canonical: "/nda-analyzer",
    howTo: [
      { t: "Drop the NDA", d: "Unilateral, mutual, multilateral, founder-to-investor, employee, vendor — any flavour." },
      { t: "We audit clause-by-clause", d: "Risk-flagged with severity (high/medium/low) and the verbatim quote so you can read it in context." },
      { t: "Get redlines to push back", d: "3-5 specific negotiation points with suggested replacement language a non-lawyer can confidently propose." },
    ],
    faq: [
      { q: "What's the most common red flag in Indian NDAs?", a: "Embedded non-competes. Indian NDAs often slip in 12-24 month non-compete clauses with extremely broad scope. Section 27 of the Indian Contract Act makes most post-employment non-competes unenforceable, but having them in the document still chills you. We flag them every time." },
      { q: "Does it catch IP assignment hidden in NDAs?", a: "Yes. An NDA shouldn't contain IP assignment language (that belongs in an employment / consultancy agreement). We surface it as high-severity if found — it's a common trap, especially in founder-investor NDAs." },
      { q: "Is this legal advice?", a: "No. It's an audit aid. We highlight what to discuss with counsel. For high-stakes NDAs (acquisition discussions, large vendor relationships, IP-licensing) you should still review with a lawyer." },
      { q: "Can I redline directly in the output?", a: "The negotiation-points section gives you suggested replacement language you can paste back into the NDA. Tracked-change redlining inside the original document is on the roadmap (would need pdf-lib annotation work)." },
    ],
    related: ["ai-nda", "ai-employment", "ai-rental", "ai-partnership-deed"],
  },

  "employment-contract-review": {
    tool: "ai-employment",
    h1: "Employment Contract Review — comp, termination, non-compete, IP traps",
    sub: "Drop your appointment / employment contract before you sign. We flag training-bond clauses, broad non-solicits, IP assignment that captures pre-employment work, and missing severance protections. 20 credits.",
    canonical: "/employment-contract-review",
    howTo: [
      { t: "Drop the offer letter", d: "Standard appointment letter, executive contract, consulting agreement, or 'fixed-term' employment doc — all supported." },
      { t: "We audit comp + termination + risk", d: "Compensation table, term length, both-sides notice periods, severance entitlement, plus risk flags." },
      { t: "Get redlines", d: "3-5 specific points a candidate could reasonably push back on with suggested replacement language." },
    ],
    faq: [
      { q: "What red flags should every Indian candidate look for?", a: "Training bonds (especially common in IT services), unilateral transfer rights anywhere in India, broad non-solicits beyond direct customers, IP assignment that doesn't carve out pre-employment work, and one-sided exclusive jurisdiction in a distant city. We flag all of these." },
      { q: "Does it explain Indian-specific clauses like 'garden leave'?", a: "Yes. Garden leave at full pay is fine; garden leave at reduced pay or unpaid is a red flag because it caps your ability to start a new role. We separate the two cases." },
      { q: "Is this legal advice?", a: "No — audit aid. For senior roles (VP+) or India-specific issues like ESOP vesting acceleration on termination, consult an employment lawyer." },
      { q: "Will it work for offer letters from US / UK / Singapore companies?", a: "Yes — our prompt is Indian-employment-aware but international offers parse cleanly. Comp + non-compete + IP analysis is reasonably universal." },
    ],
    related: ["ai-employment", "ai-cover-letter", "ai-jd-match", "ai-nda"],
  },



  // ---------------------------------------------------------------
  // Task #83 — 10 more SEO landings for Tier 3 wedges.
  // ---------------------------------------------------------------

  "blood-report-analyzer": {
    tool: "ai-blood-test",
    h1: "Blood Report Analyzer — lab values, flags, reference ranges",
    sub: "Drop a blood test / lab report. We extract every value, flag out-of-range results, and group by panel (CBC / Lipid / LFT / KFT / Thyroid / Glucose). 15 credits.",
    canonical: "/blood-report-analyzer",
    howTo: [
      { t: "Drop the lab report PDF", d: "SRL, Dr Lal PathLabs, Thyrocare, Metropolis, Apollo Diagnostics, hospital-side labs — all supported." },
      { t: "We extract every test", d: "Test name / value / unit / reference range / flag (normal / low / high / critical / unknown). Grouped by panel." },
      { t: "Compare across reports", d: "Run multiple reports through to track trends over time. (Trend visualisation is on the roadmap.)" },
    ],
    faq: [
      { q: "Is this medical advice?", a: "No. Strictly data extraction. We surface what the lab reported and which values are flagged out-of-range per the reference range printed on the report. Discuss interpretation with your doctor — reference ranges vary by lab, age, sex, and clinical context." },
      { q: "Does it understand Indian lab conventions?", a: "Yes. Indian labs sometimes use different units (mg/dL vs mmol/L for glucose) and cutoffs (HbA1c diabetes threshold of 6.5% per ICMR). We extract both the value and the unit verbatim — no conversion guesswork." },
      { q: "What about handwritten reports?", a: "Modern Indian labs print reports digitally. For old handwritten reports, accuracy depends on legibility. Use AI OCR + manual review for those." },
      { q: "Can I export the data?", a: "Yes — JSON output is downloadable. Tracking trends across reports? Coming soon as a Pro tier feature with a dashboard." },
    ],
    related: ["ai-blood-test", "ai-medical-bill", "ai-prescription", "ai-discharge"],
  },

  "ats-resume-optimizer": {
    tool: "ai-ats-resume",
    h1: "ATS Resume Optimizer — beat the keyword filter, get to the recruiter",
    sub: "Drop your resume. We audit it against ATS (Applicant Tracking System) parsing — keyword density, section headers, formatting traps — and rewrite for maximum pass-through. 10 credits.",
    canonical: "/ats-resume-optimizer",
    howTo: [
      { t: "Drop your resume PDF", d: "Most-used Indian formats: simple two-column, modern with sidebar, or executive single-column." },
      { t: "We audit ATS-readiness", d: "Keyword density, section headers (some ATS choke on 'Career Highlights' vs 'Work Experience'), date formats, multi-column traps." },
      { t: "Get a rewrite + checklist", d: "Suggested keyword additions tied to your experience, fixes for ATS-hostile elements, and a final pass-through-likelihood score." },
    ],
    faq: [
      { q: "Does it actually beat real ATS systems?", a: "It mimics what major ATS tools (Workday, Greenhouse, Lever, iCIMS, Naukri's filter) typically check. We can't guarantee it bypasses every system — corporate ATS configs vary — but the audit aligns with public ATS best practices and surfaces the obvious failures." },
      { q: "Will it tell me what keywords to add?", a: "Yes — keywords tied to YOUR existing experience, not generic stuffing. We don't suggest adding things you didn't do; we surface words you used implicitly that ATS filters look for explicitly." },
      { q: "Two-column vs one-column?", a: "We flag two-column resumes that some older ATS read in column-major order, scrambling the content. Most modern ATS handle both, but if you're applying through a Fortune 500 careers portal that may use legacy parser, single-column is safer." },
      { q: "Is the rewritten version different from the JD-match tool?", a: "Yes. JD-match scores against a specific job description. ATS Optimizer is generic ATS readiness. Use both — first ATS, then tune for the specific JD." },
    ],
    related: ["ai-ats-resume", "ai-jd-match", "ai-cover-letter", "ai-resume-parse"],
  },

  "resume-parser": {
    tool: "ai-resume-parse",
    h1: "Resume Parser — bulk PDF resumes to CSV / JSON for recruiters",
    sub: "Drop a stack of resume PDFs. We extract candidate name + contact + experience + skills + education into a structured CSV / JSON. 5 credits per resume.",
    canonical: "/resume-parser",
    howTo: [
      { t: "Drop a resume", d: "PDF of a candidate's CV — formats vary; we handle most." },
      { t: "We extract structured fields", d: "Personal (name, email, phone, location), Experience (company / role / dates / bullets), Education (institute / degree / years), Skills (categorised)." },
      { t: "Download CSV / JSON", d: "Importable into your ATS, Google Sheet, or downstream pipeline." },
    ],
    faq: [
      { q: "Bulk processing?", a: "Single resume per call right now. Bulk-upload (multiple files at once or a zip) is on the roadmap." },
      { q: "Indian phone numbers / emails recognised?", a: "Yes. +91, 10-digit Indian mobile patterns, and common Indian email domains (gmail, yahoo, rediffmail, edu institutional addresses) all detected." },
      { q: "Will it skip dates with weird formats?", a: "Common Indian resume date formats (Mar 2019, 03/2019, Mar'19, 2019-Present) are normalised to ISO. If a date is ambiguous, we surface it as a string rather than guessing." },
      { q: "Privacy of candidate data?", a: "By default, uploads delete in 60 minutes. For recruiter use cases, we recommend the Pro tier with longer history + an audit log of who accessed what." },
    ],
    related: ["ai-resume-parse", "ai-ats-resume", "ai-jd-match", "ai-cover-letter"],
  },


  "salary-slip-analyzer": {
    tool: "ai-salary-slip",
    h1: "Salary Slip Analyzer — Indian payslip parsed into structured JSON",
    sub: "Drop your monthly salary slip / pay slip. We parse it into structured JSON: earnings, deductions, YTD, with original component names preserved for accurate YoY comparison. 10 credits.",
    canonical: "/salary-slip-analyzer",
    howTo: [
      { t: "Drop the slip PDF", d: "Standard Indian salary slip from any employer — IT, finance, manufacturing, government, PSU." },
      { t: "We parse + structure", d: "Employer / employee / period / earnings (Basic, HRA, Special, LTA…) / deductions (EPF, PT, TDS…) / totals / YTD." },
      { t: "Compare across slips", d: "Run multiple slips for YoY comparison or to track raise/promotion structure." },
    ],
    faq: [
      { q: "Why preserve original names instead of normalising?", a: "Different employers use idiosyncratic component names — 'Special Allowance' in one company is 'Performance Pay' in another. If we normalised everything to 'Allowance', you'd lose the granularity needed for accurate YoY comparison. We keep names verbatim." },
      { q: "Are PAN / UAN masked?", a: "Yes. PII is masked in output (PAN as 'XXXXX1234X', UAN truncated to last 4 digits). Original PDF is deleted within 60 minutes by default." },
      { q: "Will it work for hourly / contract slips?", a: "Yes — same parser. Hourly slips have different earnings structure (no Basic/HRA/Special split), but the JSON shape adapts." },
      { q: "Does it compute taxable income?", a: "We extract what the slip shows. 'Taxable income for this slip' is sometimes shown; 'taxable income for the year' usually requires the FY-end Form 16 (use ITR Analyzer for that)." },
    ],
    related: ["ai-salary-slip", "ai-itr-form16", "ai-bank-statement", "ai-expense-report"],
  },


  "research-paper-summarizer": {
    tool: "ai-research-paper",
    h1: "Research Paper Summarizer — citation, methods, results, BibTeX",
    sub: "Drop an academic research paper. We extract citation (APA + BibTeX), research question, methods, results (with magnitudes preserved verbatim), and limitations. 15 credits.",
    canonical: "/research-paper-summarizer",
    howTo: [
      { t: "Drop the paper PDF", d: "Pre-print or published. Single-column or two-column. STM, social science, humanities — all supported." },
      { t: "We summarise the structure", d: "Citation + BibTeX + research question + methods + key results + limitations + how-to-cite examples + related-reading from the paper's own bibliography." },
      { t: "Use in your own work", d: "Paste BibTeX into your reference manager. Use the cite-this examples (with appropriate adaptation) in your own writing." },
    ],
    faq: [
      { q: "Does it preserve numerical magnitudes correctly?", a: "Yes — explicitly. We quote effect sizes, p-values, sample sizes verbatim rather than paraphrasing them. Misreporting numbers is the #1 risk in AI-generated paper summaries; we prioritise accuracy here." },
      { q: "Will it identify paper limitations the authors didn't acknowledge?", a: "Yes — there's a separate 'implied limitations' section. Common ones: small N for the conclusion drawn, lack of placebo control, single-site / single-population sample, observational design used to argue causation. Surface what the paper's methods choices imply, not just what's in the limitations paragraph." },
      { q: "Are related-reading recommendations external or from the paper?", a: "From the paper's own bibliography. We pick 3-5 references that look most central to the paper's argument so you can read the lineage. Not external recommendation engine." },
      { q: "Will it work for non-English papers?", a: "Best for English. For Indian-language academic papers (uncommon but exist), use AI Translate first, then summarise the translated version." },
    ],
    related: ["ai-research-paper", "ai-citations", "ai-summarize", "ai-tldr"],
  },

  // ---------------------------------------------------------------
  // Task #84 — 10 SEO landings for AI core (Chat / Summarize /
  // OCR / Compare / Redact) + more Tier 3 (GST / Multi-Bank /
  // Discharge / Loan / Flashcards).
  // ---------------------------------------------------------------

  "chat-with-pdf": {
    tool: "ai-chat",
    h1: "Chat with PDF — ask questions, get cited answers",
    sub: "Upload a PDF, ask anything in natural language, get answers with source page references. Works on contracts, research papers, manuals, financial statements. 5 credits / 20 questions.",
    canonical: "/chat-with-pdf",
    howTo: [
      { t: "Upload your PDF", d: "Up to 100 MB, any topic — legal, financial, academic, technical." },
      { t: "Ask in natural language", d: "\"What's the termination clause?\", \"What was the revenue in 2023?\", \"Summarise section 4 in plain English.\"" },
      { t: "Get cited answers", d: "Every claim links back to a page in the source PDF — verify before relying on it." },
    ],
    faq: [
      { q: "How is this different from copy-pasting into ChatGPT?", a: "Two big things. (1) We chunk + retrieve passages from your PDF and ground answers in those passages with page citations — so hallucination is bounded. (2) The PDF stays attached across the conversation; you don't have to re-paste sections each turn." },
      { q: "Will it work for scanned PDFs?", a: "Yes — we OCR scanned pages first, then chat. Scanned-PDF chat is slightly slower (one-time OCR cost on first use) but answers cite the same page numbers as the printed scan." },
      { q: "How long is the chat memory?", a: "20 questions per session for 5 credits. After that, we charge 5 credits per additional 20 questions to keep the conversation going. The PDF stays loaded across the whole session." },
      { q: "Can I chat with multiple PDFs at once?", a: "Single PDF for now. Multi-PDF chat (e.g. 'compare the termination clauses across these 3 vendor contracts') is on the roadmap." },
    ],
    related: ["ai-chat", "ai-summarize", "ai-tldr", "ai-semantic-search"],
  },

  "summarize-pdf": {
    tool: "ai-summarize",
    h1: "Summarize PDF — short, medium, detailed, bullet-point modes",
    sub: "Drop any PDF and pick a depth: tldr, standard, detailed, or bullet points. Page citations included. Works on research papers, contracts, reports, manuals. 5 credits.",
    canonical: "/summarize-pdf",
    howTo: [
      { t: "Drop a PDF", d: "Any size up to 100 MB. We extract text, OCR if scanned, then summarise." },
      { t: "Pick a depth", d: "TL;DR (1 paragraph) / Standard (5-7 paragraphs) / Detailed (15+ paragraphs) / Bullet Points." },
      { t: "Read with page refs", d: "Every claim cites the page it came from. Cross-check anything that surprises you." },
    ],
    faq: [
      { q: "How long does it take?", a: "10-30 seconds for most documents. Longer documents (200+ pages) may take ~60 seconds — the AI processes them in chunks." },
      { q: "Will the summary preserve numbers exactly?", a: "Yes — explicitly. We instruct the model to quote effect sizes, percentages, p-values verbatim. Misreporting numbers in summaries is the #1 risk; we prioritise accuracy here." },
      { q: "Does it editorialise?", a: "No. Neutral prose, no superlatives. We suppress 'critical', 'remarkable', 'important' unless the source uses those exact words. Plain summary, not marketing." },
      { q: "Can I summarise multiple PDFs together?", a: "Single PDF per call. For comparing 2 PDFs, use AI Compare. For multi-PDF Q&A, use Multi-PDF Chat (on the roadmap)." },
    ],
    related: ["ai-summarize", "ai-tldr", "ai-key-points", "ai-study-notes"],
  },

  "ai-pdf-ocr": {
    tool: "ai-ocr",
    h1: "AI PDF OCR — handwriting, multilingual, low-quality scans",
    sub: "Drop a scanned PDF. We OCR every page — including handwriting and Indian-language scripts (Devanagari, Tamil, Telugu, Bengali) — and return clean searchable text. ~2 credits / page.",
    canonical: "/ai-pdf-ocr",
    howTo: [
      { t: "Drop a scanned PDF", d: "Up to 50 pages. Older / low-resolution scans, handwritten notes, multilingual documents — all supported." },
      { t: "We OCR + clean", d: "AI Vision model (not legacy Tesseract) — handles handwriting better, recovers from lower DPI, multilingual." },
      { t: "Get text + searchable PDF option", d: "Markdown text by default. Want the original PDF made searchable? Use Make PDF Searchable instead." },
    ],
    faq: [
      { q: "How does this differ from Tesseract?", a: "Tesseract is rule-based — fast on clean printed text, struggles on handwriting and Indian scripts. We use a vision-language model that handles imperfect scans, mixed scripts, and handwriting much better. Higher accuracy, slightly higher cost." },
      { q: "Which Indian languages are supported?", a: "Devanagari (Hindi, Marathi, Sanskrit), Tamil, Telugu, Kannada, Malayalam, Bengali, Gujarati, Punjabi (Gurmukhi), Odia, Assamese, Urdu (Nastaliq). Best results on machine-printed text; handwritten Indic is harder." },
      { q: "Can I get a searchable PDF instead of just text?", a: "Yes — use the Make PDF Searchable tool, which OCRs each page AND overlays the recognised text invisibly on the original visual, so Ctrl-F finds matches in the original layout." },
      { q: "What's the page limit?", a: "50 pages per call. For longer documents, split first (use our free Split PDF tool), OCR each chunk, then combine." },
    ],
    related: ["ai-ocr", "ai-searchable-pdf", "pdf-to-text", "ai-translate"],
  },

  "compare-pdfs": {
    tool: "ai-compare",
    h1: "Compare PDFs — side-by-side diff with AI severity analysis",
    sub: "Upload two versions of a document. We surface what changed, classify changes by severity (added clause / deleted clause / numeric change / wording shift), and flag legally / financially material edits. 15 credits.",
    canonical: "/compare-pdfs",
    howTo: [
      { t: "Upload two PDFs", d: "Original + modified. Same document, different revisions — contracts, agreements, reports, policies." },
      { t: "We diff with context", d: "Not just textual diff: AI classifies each change by severity (cosmetic / wording / material / legal-impact)." },
      { t: "Read the diff narrative", d: "Section-by-section narrative with the most material changes surfaced first, plus a flat list of all changes for completeness." },
    ],
    faq: [
      { q: "Will it work for redlined Word→PDF exports?", a: "Yes. Track-changes PDFs export clean → we diff against the older clean version and surface the same changes a Word redline would, but with severity classification on top." },
      { q: "What counts as a 'material' change?", a: "Numeric changes (price, dates, payment terms, deposit amounts), party changes, jurisdiction shifts, indemnity caps, termination notice periods. Cosmetic / formatting changes are surfaced separately at the end." },
      { q: "Can it detect missing clauses?", a: "Yes — if v2 deletes a clause from v1, we flag it as a deletion with the original wording shown for context." },
      { q: "Privacy?", a: "By default both PDFs delete in 60 minutes. For sensitive contracts, Pro tier offers shorter retention windows + audit log." },
    ],
    related: ["ai-compare", "ai-summarize", "ai-rewrite", "ai-redact"],
  },

  "ai-redact-pdf": {
    tool: "ai-redact",
    h1: "AI Redact PDF — auto-detect PII and black it out",
    sub: "Drop a PDF. We auto-detect names, emails, phone numbers, PAN, Aadhaar, account numbers, addresses, and let you confirm before redacting. Output is permanently sanitised. 2 credits / page.",
    canonical: "/ai-redact-pdf",
    howTo: [
      { t: "Drop the PDF", d: "Contracts, court orders, medical records, bank statements — anything you need to share but with PII removed." },
      { t: "We detect PII", d: "Names, emails, phones, PAN (X-style mask), Aadhaar (last 4 digits), account numbers, addresses. Confirm before applying." },
      { t: "Download redacted PDF", d: "PII is permanently rasterised over — recipient cannot copy/paste or extract the underlying text." },
    ],
    faq: [
      { q: "Is the redaction reversible?", a: "No. We rasterise the redacted regions, so the underlying text is destroyed in the output PDF. (Don't confuse this with white-rectangle 'redaction' that some PDF tools do — those leave the text in the content stream and a determined recipient can recover it. We don't.)" },
      { q: "Will it catch Indian-specific PII?", a: "Yes — PAN format (5 letters + 4 digits + 1 letter), Aadhaar (12 digits, formatted XXXX-XXXX-XXXX), GSTIN (15 chars), bank account numbers (8-18 digits). All detected and offered for redaction." },
      { q: "What about photos / signatures?", a: "Embedded images aren't auto-redacted. Use our manual Free Redact tool to draw rectangles over images. Auto-detection of faces / signatures is on the roadmap." },
      { q: "Can I keep some PII visible?", a: "Yes — confirmation step lets you uncheck specific PII types or specific instances before applying. E.g., keep the company name visible while redacting individual employee names." },
    ],
    related: ["ai-redact", "redact-free", "protect", "ai-summarize"],
  },


  "discharge-summary-explainer": {
    tool: "ai-discharge",
    h1: "Discharge Summary Explainer — plain Indian English for patients + family",
    sub: "Drop a hospital discharge summary. We rewrite the diagnoses, medications, follow-up plan, and warning signs in plain language. 10 credits.",
    canonical: "/discharge-summary-explainer",
    howTo: [
      { t: "Drop the discharge PDF", d: "From any Indian hospital — multi-speciality, smaller nursing home, government hospital." },
      { t: "We rewrite in plain English", d: "Diagnosis (medical Latin → everyday words), treatment given, medications (with dosing in 1-0-1 / BD / TDS familiar terms), follow-up plan, warning signs." },
      { t: "Share with family", d: "Output is patient + family friendly so caregivers (often elderly parents or non-doctor relatives) actually understand the post-discharge instructions." },
    ],
    faq: [
      { q: "Is this medical advice?", a: "No. It's a language translation aid. We rewrite what the doctor wrote — we don't add interpretation, we don't change dosages, we don't suggest skipping medications. Always discuss the discharge with the prescribing doctor if anything is unclear." },
      { q: "Does it explain medications?", a: "Yes — in plain language. 'Tab Pan-D 40 mg 1-0-0' becomes 'Pantoprazole 40 mg, one tablet in the morning before food, for stomach acid'. Indian prescribing shorthand pre-encoded." },
      { q: "What about warning signs to watch for?", a: "Surfaced prominently — when to rush back to the hospital, when to call the doctor, when something is normal vs an emergency. Critical for post-surgery / post-cardiac / post-stroke discharges." },
      { q: "Will it explain insurance / payment items?", a: "Discharge summaries are clinical, not financial. For the bill itself use Medical Bill Analyzer — it parses the itemised charges and surfaces IRDAI-reimbursable items." },
    ],
    related: ["ai-discharge", "ai-medical-bill", "ai-prescription", "ai-blood-test"],
  },

  "loan-application-bundler": {
    tool: "ai-loan-bundle",
    h1: "Loan Application Document Bundler Audit — checklist + missing items",
    sub: "Drop your stack of loan-application docs (concatenated). We detect the loan type, audit against the lender's typical checklist, surface missing items and eligibility-affecting flags. 15 credits.",
    canonical: "/loan-application-bundler",
    howTo: [
      { t: "Combine your loan docs", d: "Use our free Merge PDF tool to combine PAN + Aadhaar + salary slips + bank statements + ITR + property docs into one PDF." },
      { t: "Drop the bundle", d: "We detect the loan type (home / personal / business / car / education) from the document mix." },
      { t: "Get the audit", d: "Documents present / partial / missing per the typical lender checklist + income snapshot + eligibility-affecting issues + concrete next steps." },
    ],
    faq: [
      { q: "Will banks accept my loan if everything's green?", a: "No. This is a checklist completeness aid, not pre-approval. Final eligibility is the lender's call based on your CIBIL score, FOIR, employment stability, and credit appetite. We surface what's missing so you don't waste a sanction-day with incomplete docs." },
      { q: "How does it know the lender's checklist?", a: "We've encoded the typical Indian retail lending checklist — same set used by HDFC / SBI / ICICI / Axis / Bajaj / etc. for home / personal / business loans. Specific lender exceptions (e.g., NBFCs that don't ask for Form 26AS) need verification with the lender directly." },
      { q: "Will it spot bounced EMIs / salary credit gaps in the bank statement?", a: "Yes — those are the eligibility-affecting flags. Bounced EMIs in the last 12 months are a major red flag for any new sanction." },
      { q: "Privacy?", a: "Sensitive financials are uploaded — 60-minute deletion default. For DSAs / brokers handling multiple clients, Pro tier offers per-client folders + audit logs." },
    ],
    related: ["ai-loan-bundle", "ai-bank-statement", "ai-itr-form16", "ai-salary-slip"],
  },

  "pdf-to-flashcards": {
    tool: "ai-flashcards",
    h1: "PDF to Flashcards — 10-30 Anki-compatible cards from any document",
    sub: "Drop a textbook chapter, lecture notes, or study material. We generate 10-30 question / answer flashcards with difficulty levels. Anki-compatible export. 10 credits.",
    canonical: "/pdf-to-flashcards",
    howTo: [
      { t: "Drop the PDF", d: "NCERT chapter, lecture handout, exam syllabus, research paper — any factual document with content worth retaining." },
      { t: "We generate Q/A pairs", d: "10-30 cards depending on document length. Each card has a question, an answer, and a difficulty level (easy / medium / hard)." },
      { t: "Import to Anki / Quizlet", d: "JSON export is compatible with Anki's CSV-import and Quizlet's bulk-import. Or just read them in-browser." },
    ],
    faq: [
      { q: "Are the questions exam-style?", a: "Yes for school / college / competitive content — we mix factual recall, definitions, and application questions in proportions that match exam patterns. Specific exam targeting (TNPSC / UPSC / JEE) is better via the dedicated exam-paper analyzers." },
      { q: "What difficulty mix?", a: "~40% easy (recall facts), ~40% medium (apply concepts), ~20% hard (analyse / compare). Adjust the balance manually if you're using cards for early-stage vs final revision." },
      { q: "Will it work for non-English content?", a: "English best. For Indian-language content, AI Translate first, then generate flashcards. Native Indic-language flashcard generation is on the roadmap." },
      { q: "Anki-compatible export format?", a: "JSON output mirrors Anki's question/answer/tag/difficulty schema. Save the JSON, run a 5-line Python script (or use Anki's CSV-import after a converter), and your deck is ready." },
    ],
    related: ["ai-flashcards", "ai-quiz", "ai-mindmap", "ai-study-notes"],
  },

  // ---------------------------------------------------------------
  // Task #85 — 10 more SEO landings completing Tier 3 wedge coverage.
  // ---------------------------------------------------------------

  "court-judgment-summarizer": {
    tool: "ai-court-order",
    h1: "Court Judgment Summarizer — citation, ratio decidendi, implications",
    sub: "Drop an Indian court order or judgment. We extract citation, parties, issues framed, held/operative directions, ratio decidendi, reasoning, cited authorities, and practical implications. 20 credits.",
    canonical: "/court-judgment-summarizer",
    howTo: [
      { t: "Drop the judgment", d: "Supreme Court, High Court, NCLT, NCDRC, ITAT, CESTAT, district court — any reportable Indian decision." },
      { t: "We structure the analysis", d: "Citation + parties + issues + held + ratio decidendi + reasoning chain with paragraph numbers + cited authorities." },
      { t: "Get the practical takeaway", d: "What this means for similarly-placed litigants, lawyers, or authorities — 3-4 bullets." },
    ],
    faq: [
      { q: "Will it identify the ratio decidendi correctly?", a: "Mostly yes. We surface the principle of law on which the decision rests, paraphrased AND quoted from the para that lays it down. For complex multi-issue judgments, the model occasionally collapses overlapping ratios — for citation work, always cross-check the original judgment." },
      { q: "Does it identify obiter dicta?", a: "Surfaced separately when present. The court's incidental observations are noted but flagged as not part of the binding ratio." },
      { q: "Will it handle judgments in vernacular Indian languages?", a: "English best. Most reportable judgments are in English. For state-court vernacular judgments (Tamil Nadu HC sometimes publishes Tamil), AI Translate first, then summarise." },
      { q: "Is this legal advice?", a: "No. It's a research aid for lawyers, paralegals, and law students. For citation work, always read the full judgment." },
    ],
    related: ["ai-court-order", "ai-nda", "ai-employment", "ai-rental"],
  },

  "partnership-deed-analyzer": {
    tool: "ai-partnership-deed",
    h1: "Partnership Deed Analyzer — Indian partnership + LLP audit",
    sub: "Drop a partnership / LLP deed. We extract partners, capital contributions, profit-share, decision-making rules + flag risks (no exit clause, indefinite lock-in, missing IP/goodwill, no arbitration). 20 credits.",
    canonical: "/partnership-deed-analyzer",
    howTo: [
      { t: "Drop the deed", d: "Indian Partnership Act 1932 partnership OR LLP Act 2008 LLP. Both supported." },
      { t: "We extract structure", d: "Partners table (name + role + capital + profit share + drawings) + business object + decision-making + admission/retirement/death rules." },
      { t: "Get risk flags + missing clauses", d: "Vague decision-making, no goodwill valuation, missing IP / succession / arbitration clauses surfaced as severity-rated flags." },
    ],
    faq: [
      { q: "What's the most common red flag in Indian partnership deeds?", a: "Profit share that doesn't match capital share, without justification. If A puts in 60% of capital but takes only 40% of profit (and no clear reason), that's an audit flag — usually due to one partner contributing services not capital. Should be documented explicitly." },
      { q: "What are the 'missing standard clauses' to watch for?", a: "Arbitration / dispute resolution, IP / goodwill ownership on dissolution, succession on partner death (without it the firm dissolves under the Indian Partnership Act 1932), books-of-account audit cadence, non-compete on retirement." },
      { q: "Does it know LLP-specific concerns?", a: "Yes. LLPs have different liability + profit-share + RoC compliance requirements vs traditional partnerships. We flag LLP-specific issues separately when the deed is an LLP agreement." },
      { q: "Is this legal advice?", a: "No — audit aid. For high-stakes partnerships (large capital, multi-partner, succession concerns), engage a lawyer." },
    ],
    related: ["ai-partnership-deed", "ai-employment", "ai-nda", "ai-balance-sheet"],
  },

  "insurance-policy-analyzer": {
    tool: "ai-insurance",
    h1: "Insurance Policy Analyzer — health, life, motor, home, travel, term",
    sub: "Drop your Indian insurance policy. We surface coverage, premiums, exclusions, waiting periods, claim process, renewal/portability, and risk flags (room-rent capping, sub-limits, missing day-care list). 20 credits.",
    canonical: "/insurance-policy-analyzer",
    howTo: [
      { t: "Drop the policy PDF", d: "Health (individual / family floater / group), life, term, motor, home, travel — all parsed." },
      { t: "We audit coverage + exclusions", d: "Section-by-section benefits + sum-insured + sub-limits + permanent exclusions + waiting periods (PED, specific-disease, initial)." },
      { t: "Get risk flags + claim process", d: "Severity-rated flags (low room-rent capping, high co-pay, missing day-care list, restoration absent) + cashless network + claim document checklist." },
    ],
    faq: [
      { q: "What's 'room-rent capping' and why does it matter?", a: "Many Indian health policies cap the room-rent eligible for reimbursement (e.g., 1% of sum insured per day). If you take a higher-category room, the proportionate-deduction clause kicks in — every other charge (doctor's fees, investigations, OT charges) is reduced in proportion. Worst-case you can lose 30-50% of your claim. We flag low room-rent capping as high-severity." },
      { q: "Does it understand IRDAI standard exclusions?", a: "Yes — registration fees, food/attendant charges, diapers, telephone, MRD admin charges are pre-encoded as standard exclusions. Policy-specific exclusions (specific-disease waits, hazardous-activity exclusions) are extracted from the policy itself." },
      { q: "Will it tell me whether to renew or port?", a: "We surface the data — sum insured used to date, NCB earned, cumulative bonus, renewability guarantee. The renewal vs port decision is yours, but you'll have the inputs." },
      { q: "Is this insurance advice?", a: "No — parsing aid. For decisions on switching insurers, engage an IRDAI-licensed insurance advisor." },
    ],
    related: ["ai-insurance", "ai-medical-bill", "ai-discharge", "ai-blood-test"],
  },



  // ---------------------------------------------------------------
  // Task #86 — 10 SEO landings for Tier 2 AI variants.
  // ---------------------------------------------------------------

  "pdf-to-quiz": {
    tool: "ai-quiz",
    h1: "PDF to Quiz — 6-12 MCQs with answer key + explanations",
    sub: "Drop a study material PDF. We generate 6-12 multiple-choice questions with an answer key and per-question explanations. 10 credits.",
    canonical: "/pdf-to-quiz",
    howTo: [
      { t: "Drop the source PDF", d: "Textbook chapter, lecture notes, training material, or product documentation." },
      { t: "We generate MCQs", d: "Each question has 4 options + correct answer + explanation. Difficulty mix: ~40% easy / 40% medium / 20% hard." },
      { t: "Use as practice or assessment", d: "Self-test, classroom quiz, employee training assessment. Export as JSON for LMS integration." },
    ],
    faq: [
      { q: "How does this differ from PDF to Flashcards?", a: "Quizzes are MCQs (4 options + 1 right answer + explanation). Flashcards are open Q/A pairs. Quizzes test recognition + selection; flashcards test recall." },
      { q: "Are the wrong-answer options plausible?", a: "Yes — distractors (wrong options) are intentionally similar to the correct answer in length and concept-domain. We don't generate trivially-wrong options that defeat the purpose of testing." },
      { q: "Will it work for technical content?", a: "Yes — engineering, medical, legal, finance content. Edge case: very dense formal-logic content where one term has subtle distinctions sometimes generates ambiguous distractors. Always sanity-check before using high-stakes." },
      { q: "LMS-compatible export?", a: "JSON output. SCORM / xAPI / QTI export is on the roadmap if there's signal." },
    ],
    related: ["ai-quiz", "ai-flashcards", "ai-mindmap", "ai-study-notes"],
  },

  "pdf-to-mindmap": {
    tool: "ai-mindmap",
    h1: "PDF to Mind Map — hierarchical concept tree, expandable",
    sub: "Drop a PDF. We build a hierarchical mind map of the document — root concept → main topics → sub-topics → details. Renders as a collapsible nested outline. 10 credits.",
    canonical: "/pdf-to-mindmap",
    howTo: [
      { t: "Drop the PDF", d: "Research paper, book chapter, business plan, study material — anything with hierarchical structure." },
      { t: "We extract the tree", d: "Root → main branches → sub-branches → leaf details. Auto-detected depth, typically 3-5 levels." },
      { t: "Read collapsed", d: "Each node expands on click. Easier to scan than a linear summary; preserves the nested relationships." },
    ],
    faq: [
      { q: "Is this a visual mind map?", a: "Currently a structured text outline that mimics mind-map hierarchy. Visual SVG mind-map rendering (with branches radiating from a centre) is on the roadmap." },
      { q: "How does it choose what's a main branch vs a leaf?", a: "Heuristic from document structure — section / chapter headers become main branches; bullet lists and definitions become leaves. Documents without clear headers are restructured by topic." },
      { q: "Export to mind-mapping software?", a: "OPML / Markdown export for now (XMind / MindNode / iThoughts compatible). Native FreeMind .mm and Miro JSON on the roadmap." },
      { q: "Will it work for very long documents?", a: "Yes but the depth gets unwieldy past 200 pages. For book-length content, summarise into chapters first, then mind-map each chapter." },
    ],
    related: ["ai-mindmap", "ai-flashcards", "ai-quiz", "ai-study-notes"],
  },

  "syllabus-to-study-plan": {
    tool: "ai-syllabus",
    h1: "Syllabus to Study Plan — week-by-week schedule with practice checkpoints",
    sub: "Drop a course syllabus. We turn it into a 12-week (default) study plan with topic map, hours per topic, and practice checkpoints. 20 credits.",
    canonical: "/syllabus-to-study-plan",
    howTo: [
      { t: "Drop the syllabus PDF", d: "TNPSC / UPSC / JEE / NEET / NCERT / university course / coaching institute syllabus — all supported." },
      { t: "We sequence the weeks", d: "Topic map of the syllabus + week-by-week table (Week N | Topics | Hours | Practice Checkpoint)." },
      { t: "Get final-week strategy", d: "Last-week revision plan: what to revise, in what order, with what tools (mock tests, summaries, flashcards)." },
    ],
    faq: [
      { q: "Why default to 12 weeks?", a: "Most quarterly competitive-exam preparation cycles, semester courses, and bootcamps fit a 12-week container. We auto-detect shorter (6-week boot camps) or longer (full-year syllabi) and adjust." },
      { q: "What's a 'practice checkpoint'?", a: "A concrete activity that tests retention — a mock test, a problem set, a summary essay. NOT a passive 'review your notes' instruction. Concrete tasks anchor study sessions." },
      { q: "Will it adapt to my pace?", a: "The default plan assumes ~8 hrs/week. If you have more or less time, scale the Hours column proportionally — the topic-priority order stays the same." },
      { q: "Does it know exam-specific weighting?", a: "For TNPSC / UPSC / JEE / NEET / SSC / Banking / GATE — yes, we weight high-yield topics heavier. For generic course syllabi, we treat topics as roughly equal-weight unless the syllabus document specifies otherwise." },
    ],
    related: ["ai-syllabus", "ai-tnpsc", "ai-upsc", "ai-jee-neet"],
  },

  "extract-tables-from-pdf": {
    tool: "ai-table",
    h1: "Extract Tables from PDF — AI-cleaned, multi-page aware, Excel export",
    sub: "Drop a PDF with tables (financial statements, scientific data, schedules). We extract every table — even multi-page — with headers correctly aligned + Excel/CSV export. 5 credits.",
    canonical: "/extract-tables-from-pdf",
    howTo: [
      { t: "Drop the PDF", d: "Financial statements, scientific data tables, government data PDFs, train timetables — anything with tabular data." },
      { t: "We extract all tables", d: "Multi-page tables stitched correctly. Merged cells handled. Header rows aligned. Numbers preserved verbatim." },
      { t: "Download as Excel / CSV", d: "Or copy directly. Each table is a separate sheet in the Excel export." },
    ],
    faq: [
      { q: "How is this different from copy-paste from PDF?", a: "Copy-paste from PDF mangles tables — column boundaries collapse, merged cells break, multi-page tables fragment. AI-aware table extraction reconstructs the structure semantically." },
      { q: "Will it handle tables that span pages?", a: "Yes. Continuation tables on the next page are stitched into a single output table when the headers match." },
      { q: "Are numbers preserved exactly?", a: "Yes — explicitly. We don't reformat or round numbers; we copy them character-by-character from the source. Critical for financial / scientific data where precision matters." },
      { q: "What about complex nested tables?", a: "Tables with multi-row headers (e.g. quarterly data with 'Q1' / 'Q2' / 'Q3' / 'Q4' under a 'FY24' grouping) are handled. Truly nested sub-tables (a table inside a cell) are surfaced separately." },
    ],
    related: ["ai-table", "pdf-to-excel", "ai-balance-sheet", "ai-bank-statement"],
  },

  "rewrite-pdf-tone": {
    tool: "ai-rewrite",
    h1: "Rewrite PDF in Different Tone — formal, casual, academic, simple",
    sub: "Drop a PDF and pick a target tone (formal / casual / academic / simple / persuasive). We rewrite preserving meaning. 5 credits.",
    canonical: "/rewrite-pdf-tone",
    howTo: [
      { t: "Drop the PDF", d: "Email draft, blog post, business proposal, academic paper — any prose document." },
      { t: "Pick the target tone", d: "Formal (legal / corporate), Casual (friendly / blog), Academic (peer-review style), Simple (5th-grade level), Persuasive (sales / marketing)." },
      { t: "Read and refine", d: "Output preserves every fact and number; only voice and word choice change. Refine manually for sensitive contexts." },
    ],
    faq: [
      { q: "How is this different from Improve Writing?", a: "Improve Writing makes the same prose tighter (clarity + concision). Rewrite Tone changes the register — same meaning in a different voice. Use both: improve first, then re-tone for the audience." },
      { q: "Will it preserve technical accuracy in 'Simple' mode?", a: "Yes — we never simplify by lying. Technical terms get an explanation in parentheses on first use. If something genuinely can't be simplified without losing accuracy, we leave it untranslated." },
      { q: "Can I provide a custom tone?", a: "Currently the 5 preset tones. For custom (e.g. 'in the voice of a 1990s news anchor'), use Improve Writing or AI Generate with a custom prompt — those have more flexibility." },
      { q: "What about non-English content?", a: "Best on English. For Indian-language content, AI Translate first, then re-tone." },
    ],
    related: ["ai-rewrite", "ai-improve-writing", "ai-paraphrase", "ai-proofread"],
  },

  "improve-pdf-writing": {
    tool: "ai-improve-writing",
    h1: "Improve PDF Writing — clarity + concision rewrite, ~25% shorter",
    sub: "Drop any prose PDF. We rewrite for clarity and concision (~20-30% shorter) without changing facts, register, or claims. Preserves voice. 5 credits.",
    canonical: "/improve-pdf-writing",
    howTo: [
      { t: "Drop the PDF", d: "Email draft, business proposal, blog post, white paper, policy document — anything you want tighter." },
      { t: "We rewrite", d: "Same meaning, fewer words. Cut redundant qualifiers, split run-on sentences, replace passive voice where it doesn't add nuance." },
      { t: "Read and refine", d: "Edit-summary explains the kinds of changes made. Keep what works, push back on what doesn't." },
    ],
    faq: [
      { q: "Will it change my voice?", a: "Register is preserved — formal stays formal, casual stays casual. But within that register, sentence-level choices may shift. Read the rewrite aloud — if a sentence doesn't sound like you, replace it with your own version (and the cleaner alternative is still in front of you for comparison)." },
      { q: "What about my unique phrasings?", a: "We err on the side of keeping unusual or distinctive phrasings if they're working. We cut clichés (\"thinking outside the box\"), redundant qualifiers (\"absolutely critical\"), and obvious filler (\"in today's world\"). We don't cut craft." },
      { q: "How much shorter?", a: "20-30% typical. For very tight documents (well-written news copy, scientific abstracts), only 5-10% reduction. For drafts (which is what most people send), 30-40%." },
      { q: "Will it work for fiction / poetry?", a: "Use cautiously. The rewriter is calibrated for non-fiction prose — fiction has deliberate redundancy, rhythm, and voice that doesn't benefit from a 'concision' pass." },
    ],
    related: ["ai-improve-writing", "ai-paraphrase", "ai-rewrite", "ai-proofread"],
  },

  "paraphrase-pdf": {
    tool: "ai-paraphrase",
    h1: "Paraphrase PDF — re-word preserving every claim and number",
    sub: "Drop a PDF. We paraphrase preserving every claim, number, and conclusion. Same length as input. Technical terms preserved when no plainer synonym fits. 5 credits.",
    canonical: "/paraphrase-pdf",
    howTo: [
      { t: "Drop the PDF", d: "Any prose document. Common use cases: report drafts that need a fresh phrasing, citations to summarise in your own words, content syndication." },
      { t: "We rephrase, not re-imagine", d: "Same length as input, every fact preserved, every number quoted exactly. Only the wording changes." },
      { t: "Cite the original", d: "Paraphrasing is a wording change, not a substitute for citation. Always credit the original source." },
    ],
    faq: [
      { q: "How is this different from Improve Writing?", a: "Improve Writing CUTS words. Paraphrase keeps the SAME length but in different wording. Use Paraphrase when you need the same content in a different voice. Use Improve when you want it tighter." },
      { q: "Will technical terms be replaced?", a: "Only when a plainer synonym exists without losing meaning. 'Amortisation' won't be paraphrased to 'paying off' because that loses precision. 'Leveraging' will be paraphrased to 'using' because the precision is fake to begin with." },
      { q: "Can I use this for academic citations?", a: "Yes for summarising someone else's work in your own words — but you STILL need to cite the original. Paraphrasing without attribution is plagiarism. The 'in your own words' is about wording, not authorship." },
      { q: "Will it sound AI-generated?", a: "We use a high-quality model that produces natural prose. Read it carefully — if a sentence sounds AI-fluent, replace it with your own. The Originality Heuristic Check tool surfaces AI-tells if you want to audit." },
    ],
    related: ["ai-paraphrase", "ai-improve-writing", "ai-detector", "ai-rewrite"],
  },

  "ai-content-detector": {
    tool: "ai-detector",
    h1: "AI Content Detector for PDFs — spot ChatGPT, Claude, Gemini text",
    sub: "Drop a PDF. We surface well-documented LLM stylistic fingerprints: formulaic openers, hedging overuse, em-dash patterns, register-too-polished, three-item rhetoric, transitional clichés. Honest heuristic — not a courtroom-grade classifier. 10 credits.",
    canonical: "/ai-content-detector",
    howTo: [
      { t: "Drop the PDF", d: "Essay, blog post, report, article — anything you want to check for AI-generated text." },
      { t: "We run a stylometric audit", d: "Compare prose patterns against the well-documented stylistic fingerprint of LLMs (ChatGPT, Claude, Gemini, Llama, Mistral). Flagged passages get a confidence score (Low / Medium / High)." },
      { t: "Get a verdict + counter-evidence", d: "One-line verdict (Likely AI / Mixed / Likely Human / Inconclusive), table of fingerprints found, AND signals that lean human — so you see both sides of the call." },
      { t: "Optional: get edit suggestions", d: "If you want to humanize AI text — vary sentence length, drop hedging, kill formulaic openers, add specific examples. We give 3-5 concrete edits." },
    ],
    faq: [
      { q: "Is this a definitive AI classifier?", a: "No, and we don't pretend it is. This is a heuristic based on stylistic patterns. False positives happen (some humans naturally write in clean, structured prose). False negatives happen (a careful human edit can mask AI fingerprints). Tools like GPTZero / Originality.ai use trained classifiers and may give different verdicts. Treat our output as ONE input, not the verdict." },
      { q: "What patterns does it look for?", a: "Formulaic openers ('In today's world', 'In conclusion'), hedging overuse ('it could be argued that'), three-item rhetoric (chronic X/Y/Z triplets), em-dash overuse, register-too-polished (uniform formal voice with no personality), definition-textbook style, transitional clichés ('moreover', 'furthermore' as section openers), unprompted safety disclaimers, and stylometric uniformity (sentence-length sameness, vocabulary-richness drop)." },
      { q: "What's 'counter-evidence'?", a: "Signals that lean human: specific personal details, idiomatic expressions, minor inconsistencies, opinion shifts, casual asides. We surface these alongside the AI fingerprints so the verdict isn't a one-sided witch-hunt." },
      { q: "How is this different from Turnitin?", a: "Different problem. Turnitin compares your text against an indexed corpus of billions of documents — it catches paraphrased copying. We look at prose style — we catch AI-generated text. They're complementary checks, not substitutes. For academic plagiarism specifically, run Turnitin / Copyleaks / iThenticate in addition." },
      { q: "Can I use this to rewrite my AI essay so it passes detection?", a: "We give edit suggestions that humanize the prose (vary sentence length, add specifics, drop clichés). But we're not in the business of helping students cheat. The honest use case is: you wrote a draft, you want to know if it reads like AI before submitting." },
    ],
    related: ["ai-detector", "ai-improve-writing", "ai-paraphrase", "ai-proofread"],
  },

  "chart-to-data-table": {
    tool: "ai-chart-to-table",
    h1: "Chart to Data Table — extract numeric data from chart images",
    sub: "Drop a PDF with charts (bar / line / pie / scatter / stacked). We read each chart visually and extract its data points as Markdown tables with axis labels and units. 5 credits.",
    canonical: "/chart-to-data-table",
    howTo: [
      { t: "Drop the PDF", d: "Research paper, financial report, government data PDF — anything with embedded charts." },
      { t: "We read every chart", d: "Bar / line / pie / scatter / stacked / 100%-stacked / radar / histogram supported. Axis labels + units extracted faithfully." },
      { t: "Use the data", d: "Markdown tables for each chart. For values that aren't precisely readable from the visual, we return a range with confidence note rather than inventing." },
    ],
    faq: [
      { q: "How accurate are the extracted values?", a: "For clear charts with gridlines and labels, very accurate. For chart images at low resolution OR without gridlines, we return ranges (e.g. '170-180') with a confidence note. We don't invent precise numbers." },
      { q: "Will it work for unusual chart types?", a: "Common types covered. Sankey diagrams, treemaps, sunburst, parallel coordinates — these are handled best-effort. If you have a niche chart type that matters, run it and check the output before relying." },
      { q: "Per-chart pricing?", a: "5 credits per chart found in the PDF. A 10-chart report is 50 credits. We list every chart in the summary so you can audit the count." },
      { q: "Export?", a: "Markdown tables (copy-paste ready). For Excel-friendly export, CSV is on the roadmap. Right now copy from the markdown table into a spreadsheet works fine." },
    ],
    related: ["ai-chart-to-table", "ai-table", "ai-balance-sheet", "ai-research-paper"],
  },

  "stamp-pdf": {
    tool: "stamp-pdf",
    h1: "Add stamp to PDF — DRAFT, CONFIDENTIAL, APPROVED, PAID, RECEIVED",
    sub: "Apply preset business stamps to any PDF page in your browser. Free, no signup, no upload — runs entirely on your device.",
    canonical: "/stamp-pdf",
    howTo: [
      { t: "Drop the PDF", d: "Up to 50 MB. Encrypted PDFs need to be unlocked first." },
      { t: "Pick a stamp", d: "DRAFT, CONFIDENTIAL, APPROVED, REJECTED, PAID, RECEIVED, REVIEWED, COPY, ORIGINAL, VOID, FINAL, URGENT — or type your own (up to 30 chars)." },
      { t: "Choose position + rotation + opacity", d: "9-position grid (top/middle/bottom × left/center/right), -45° to +45° tilt, 20-100% opacity. Blank page range = stamp every page." },
      { t: "Apply and download", d: "Output PDF has the stamp baked into the page content stream — recipients can't easily edit it out without a fresh redact pass." },
    ],
    faq: [
      { q: "Is the stamp reversible?", a: "It's drawn into the page content stream, not as an annotation. A determined recipient with PDF editor software can still remove it (the original ink layer is intact underneath). For irreversible stamping, also run Redact + Flatten after stamping." },
      { q: "Why no transparent fill on the rectangle?", a: "Classic rubber-stamp look has a colored border with the document visible behind. If you need a fully solid block-out (e.g., for VOID over financial data), use Redact instead." },
      { q: "Can I stamp only specific pages?", a: "Yes — the page range field accepts ranges like \"1, 3-5, 7\". Blank means every page." },
      { q: "Does this work on scanned PDFs?", a: "Yes. The stamp is drawn on top of whatever's on the page — image-only or vector-text both work." },
    ],
    related: ["image-watermark", "redact-free", "highlight-pdf", "flatten-pdf"],
  },

  "n-up-pdf": {
    tool: "n-up-pdf",
    h1: "N-up PDF — combine multiple pages on one sheet (2-up, 4-up, booklet)",
    sub: "Tile 2, 4, 6, 8, or 9 source pages onto a single output sheet. Pure browser conversion — no upload, no signup. Save paper on long documents.",
    canonical: "/n-up-pdf",
    howTo: [
      { t: "Drop the PDF", d: "Any size; 50 MB cap." },
      { t: "Pick a layout", d: "2-up (2×1), 4-up (2×2), 6-up (3×2), 8-up (4×2), or 9-up (3×3)." },
      { t: "Pick output paper + spacing", d: "US Letter / A4 / Legal / A3 in landscape. Margin 0-72pt, gap between slots 0-48pt. Optional thin borders around each placed page." },
      { t: "Combine and download", d: "Output is a fresh PDF with each sheet containing your tiled source pages, aspect-preserved and centered in each slot." },
    ],
    faq: [
      { q: "Why landscape output?", a: "2-up and 4-up portrait sources fit naturally on landscape sheets — pages stay right-side-up. For pure-portrait output (e.g., a 1-up cropped print), use Crop PDF." },
      { q: "Can I do booklet imposition (folded saddle-stitch)?", a: "This tool does straight-grid tiling, not signature imposition (where page order is shuffled for booklet folding). For saddle-stitch booklets the page-order math is different — that's on the roadmap." },
      { q: "Will text in the tiled pages still be selectable?", a: "Yes. Each source page is embedded as a real PDF page (not rasterized), so text remains selectable and accessible at the smaller scale." },
      { q: "What if my source has different page sizes?", a: "Each is independently scaled to fit its slot, aspect-preserved. Mixed-size sources work cleanly." },
    ],
    related: ["merge", "split", "extract-pages", "resize-pdf"],
  },

  "grayscale-pdf": {
    tool: "grayscale-pdf",
    h1: "Convert PDF to grayscale — black & white print prep",
    sub: "Render every page as luminance-correct grayscale entirely in your browser. Perfect for B&W laser print prep, color-restricted submissions, or visual-noise reduction.",
    canonical: "/grayscale-pdf",
    howTo: [
      { t: "Drop the PDF", d: "Any size up to 50 MB. Multi-page documents work — each page is processed sequentially with progress shown." },
      { t: "Pick render quality", d: "Draft (96 DPI) for screen review, Standard (144 DPI) for general use, High (192 DPI) for clean print, Print (240 DPI) for archive-quality." },
      { t: "Convert", d: "Each page is rasterized and converted using the Rec. 601 luminance formula (0.299R + 0.587G + 0.114B) — perceptually correct grayscale, not naive averaging." },
      { t: "Download", d: "Output PDF has every page as a grayscale image. File size scales with quality preset." },
    ],
    faq: [
      { q: "Will text still be selectable?", a: "No — the output is image-only because every page is rasterized to grayscale. This is the trade-off for true visual grayscale. If you need both selectable text AND grayscale, that's a content-stream color remap (paid AI tier roadmap item, not free)." },
      { q: "Why luminance instead of just averaging RGB?", a: "Naive (R+G+B)/3 makes pure red and pure green render as the same gray, which looks wrong. Rec. 601 weights match human perception — green looks brighter than red, which matches reality." },
      { q: "How big will the output file be?", a: "Roughly 0.5-2 MB per page at Standard quality; 1-4 MB per page at Print quality. Color PDFs often shrink slightly because the 3 color channels collapse into 1, even though we're encoding as PNG." },
      { q: "Is this the same as Compress PDF?", a: "No. Compress reduces file size while preserving color and text. Grayscale removes color entirely (and text-selectability) but isn't necessarily smaller. Use them together if you want a small B&W file: Grayscale → Compress." },
    ],
    related: ["compress", "pdf-to-jpg", "remove-metadata", "flatten-pdf"],
  },

  "strip-links": {
    tool: "strip-links",
    h1: "Remove hyperlinks from PDF — strip every URL and goto link",
    sub: "Surgically remove every clickable link from a PDF without touching highlights, comments, or other annotations. Free, browser-only — no upload needed.",
    canonical: "/strip-links",
    howTo: [
      { t: "Drop the PDF", d: "Up to 50 MB. We count URL links and internal navigation links separately so you know what's about to change." },
      { t: "Strip", d: "Walks each page's annotation array and removes anything with subtype /Link. Other annotations (highlights, sticky notes, form widgets) stay put." },
      { t: "Download", d: "Output PDF reads identically — only the click targets are gone. Visible link text and styling are preserved." },
    ],
    faq: [
      { q: "Will the link text still be visible?", a: "Yes. Only the click target is removed (the /Link annotation). The original underlying text — including the blue / underline styling that the original document author chose — is part of the page content stream and stays exactly as it was. To strip the styling too, run Edit PDF after this." },
      { q: "What's the difference vs. Flatten PDF?", a: "Flatten removes ALL annotations including form widgets, highlights, and comments. Strip Hyperlinks is the surgical version — only /Link annotations are touched." },
      { q: "Why would I need this?", a: "Common cases: sharing a doc where the linked URLs themselves are sensitive (private GitHub repos, internal Confluence, partner-only resources); printing without blue link clutter; preventing recipients from accidentally navigating away during a presentation; meeting submission requirements that disallow active hyperlinks." },
      { q: "What about table-of-contents jumps?", a: "Internal navigation links (TOC jumps within the same PDF) are also removed. If you need to keep them, use Flatten + Bookmarks instead." },
    ],
    related: ["flatten-pdf", "remove-metadata", "redact-free", "edit-pdf"],
  },

  "booklet-pdf": {
    tool: "booklet-pdf",
    h1: "PDF booklet maker — saddle-stitch imposition for fold-and-staple printing",
    sub: "Shuffle pages so they read in correct order after folding and stapling at the spine. Pure browser conversion — print duplex, fold, staple. Done.",
    canonical: "/booklet-pdf",
    howTo: [
      { t: "Drop the PDF", d: "Source is automatically padded to a multiple of 4 with blank pages at the end so the cover wrap math works out." },
      { t: "Pick output paper", d: "US Letter / A4 / Legal / A3 — all in landscape (the only orientation where two portrait halves of a sheet make a booklet)." },
      { t: "Optional fold-line guide", d: "Faint center line drawn on each output page so you can fold cleanly. Toggle off for production print." },
      { t: "Print, fold, staple", d: "Print double-sided with flip-on-long-edge. Stack the printouts in order, fold the entire stack in half, staple along the fold (saddle stitch)." },
    ],
    faq: [
      { q: "What's the difference between this and N-up?", a: "N-up tiles pages in reading order — page 1 in slot 1, page 2 in slot 2, etc. Booklet imposition shuffles pages so that AFTER folding the printed sheets, they read in correct order. The math is different and they solve different problems. N-up is for compact reading; booklet is for fold-and-staple printing." },
      { q: "Why does my PDF need a multiple of 4 pages?", a: "A folded sheet has 4 pages (two faces × two halves). Source PDFs that aren't a multiple of 4 get padded with blanks at the end. A 5-page source becomes 8 pages — the last 3 are blank but the page-order math still works." },
      { q: "What if I want to print single-sided?", a: "Print 'odd pages only' first, re-feed the stack, then print 'even pages only'. Most modern printers handle this in their print dialog. Output PDF order is already correct for both sides." },
      { q: "Does this work for very long PDFs?", a: "Saddle-stitch tops out around 80 pages (20 sheets) before the fold gets bulky and pages start to creep at the spine. For longer documents, perfect-bound (multiple signatures glued at the spine) is the right approach — that's not what this tool does." },
    ],
    related: ["n-up-pdf", "merge", "split", "extract-pages"],
  },

  "free-draw-pdf": {
    tool: "free-draw-pdf",
    h1: "Draw on PDF — sketch, mark up, and annotate any page in your browser",
    sub: "Free-draw pen tool for PDFs. 5 colors, adjustable stroke width, multi-page navigation. Pure browser — your file never leaves your device.",
    canonical: "/free-draw-pdf",
    howTo: [
      { t: "Drop the PDF", d: "Up to 50 MB. Multi-page documents work — Prev/Next navigation moves between pages and preserves your strokes per-page." },
      { t: "Pick color and width", d: "Black, red, blue, green, or orange. Stroke width 1-8pt." },
      { t: "Draw freely", d: "Click and drag — your strokes appear live as a smooth pen line. Multiple strokes per page, undo any time." },
      { t: "Apply and download", d: "Strokes are baked into the page content stream as SVG paths. Output PDF reads identically in every viewer." },
    ],
    faq: [
      { q: "Are these real PDF annotations?", a: "Strokes go into the page's content stream as SVG paths — not as /Ink annotation objects. The visual result is identical and works everywhere; the difference matters only if a downstream tool needs to enumerate / edit annotations after the fact (e.g., Adobe Acrobat's annotation panel). For that workflow, paid Annotate ships /Ink annotations proper." },
      { q: "Can I erase a single stroke?", a: "Click ↶ Undo to remove the last stroke on the current page (page-aware undo — won't accidentally remove a stroke from another page). For finer-grain editing, a stroke list is shown so you can remove any specific stroke before applying. After Apply, strokes become part of the page content and need Edit PDF or another redaction step to remove." },
      { q: "Will my drawing line up exactly with what I see on screen?", a: "Yes. We track every pointer point in CSS pixels, convert to PDF points using the canvas's actual rendered size, and apply via pdf-lib's drawSvgPath at the same coordinates. Resize the window mid-drawing — committed strokes still align because they're stored in PDF space, not in CSS pixels." },
      { q: "Can I draw with a stylus or finger on tablet?", a: "Yes. The tool uses Pointer Events, which handle mouse, touch, and pen input uniformly. Pressure sensitivity isn't honored in v1 (stroke width is fixed per stroke); proper pressure-aware ink is on the paid roadmap." },
    ],
    related: ["highlight-pdf", "add-text-box", "sign-pdf-free", "redact-free"],
  },

  "add-links": {
    tool: "add-links",
    h1: "Add hyperlinks to PDF — make any region clickable",
    sub: "Drag a rectangle on a PDF page, paste a URL, get a real /Link annotation. Multi-page, additive (preserves existing annotations), pure browser.",
    canonical: "/add-links",
    howTo: [
      { t: "Drop the PDF", d: "Up to 50 MB. We render every page so you can click-and-drag link regions visually." },
      { t: "Drag to define a region", d: "Click and drag a rectangle anywhere — over text, over an image, anywhere you want clickable. The dashed amber outline shows the pending region until you confirm with a URL." },
      { t: "Type the URL", d: "https://, http://, mailto:, and tel: are all supported. Press Enter to commit, Esc to cancel. Multi-page support — navigate with Prev/Next and add more regions." },
      { t: "Apply", d: "Each region becomes a /Link annotation pointing at your URL. Existing annotations on the page are preserved (additive, not replace)." },
    ],
    faq: [
      { q: "Will this overlay change how the page looks?", a: "Visually: no. The /Link annotation has /Border [0 0 0] which means no rectangle is drawn. The link area is clickable but invisible — exactly like the hyperlinks already in your PDF. If you want to make the clickable area visually obvious, run Highlight PDF over the same region first." },
      { q: "What URL formats work?", a: "https:// and http:// for web links; mailto:you@example.com for email; tel:+15551234567 for phone numbers (mobile viewers can tap to dial). Internal goto-page links aren't supported in this tool — that's a different annotation kind. Use Bookmarks Editor (paid roadmap) for internal navigation." },
      { q: "Why does this need low-level pdf-lib code?", a: "pdf-lib has high-level helpers for drawing rectangles, text, images, SVG paths — anything that goes into a page's content stream. Annotations are different: they're sibling objects that the viewer overlays for interactivity. pdf-lib doesn't expose a high-level addLink(); we construct the /Annot dict manually with the right /Subtype, /Rect, /Border, and /A action subtree, then register it and append the indirect ref to the page's /Annots array. Doable, just not one-liner doable." },
      { q: "Inverse?", a: "Strip Hyperlinks. Run Add Hyperlinks → Strip Hyperlinks and you're back where you started. Both tools agree on the same /Link annotation shape." },
    ],
    related: ["strip-links", "highlight-pdf", "add-text-box", "edit-pdf"],
  },

  // Sprint A REVERTED in Task #99 — 5 govt ID parser SEO entries
  // (aadhaar-parser, pan-card-parser, driving-license-parser,
  // voter-id-parser, passport-parser) removed.





};

// Merge optional longform editorial bodies onto the matching landings.
// We use a side-effect-on-init approach (rather than rebuilding the
// record immutably) because SEO_PAGES has 95 entries and lookups are
// hot-path on every landing render. Doing this once at module load is
// cheap and keeps the consumer code (SeoLandingPage) unchanged — it
// just reads the optional `longform` field if present.
//
// Lazy-imported to avoid a circular type import: seo-longform.ts
// imports SeoLongform/SeoPageSlug from here.
import { LONGFORM_BODIES } from "./seo-longform";
for (const slug of Object.keys(LONGFORM_BODIES) as SeoPageSlug[]) {
  const body = LONGFORM_BODIES[slug];
  if (body && SEO_PAGES[slug]) {
    SEO_PAGES[slug].longform = body;
  }
}

export const SEO_SLUGS = Object.keys(SEO_PAGES) as SeoPageSlug[];
