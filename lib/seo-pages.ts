// SEO landing page data. Ported from prototype seo-pages.jsx SEO_PAGES.

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
  | "gst-invoice-generator"
  | "edit-pdf"
  | "sign-pdf-free"
  | "repair-pdf"
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
  | "pdf-to-blog-post";

export type SeoPageData = {
  tool: string; // tool id from lib/tools.ts
  h1: string;
  sub: string;
  canonical: string;
  howTo: Array<{ t: string; d: string }>;
  faq: Array<{ q: string; a: string }>;
  related: string[]; // tool ids
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

  "gst-invoice-generator": {
    tool: "invoice-generator",
    h1: "Free GST invoice generator — one-page PDF in seconds",
    sub: "Fill the form, get a clean A4 invoice PDF. CGST+SGST or IGST tax modes. INR default; USD / EUR / GBP also supported.",
    canonical: "/gst-invoice-generator",
    howTo: [
      { t: "Enter business + customer info", d: "Name, address, optional GSTIN for both sides." },
      { t: "Add line items", d: "Description, quantity, unit price. Totals recalculate live." },
      { t: "Pick tax mode", d: "No tax, CGST+SGST (intra-state), or IGST (inter-state). Default rate 18% — change to 5 / 12 / 28 as needed." },
      { t: "Generate and download", d: "A4 single-page PDF. No watermarks. Ready to email or print." },
    ],
    faq: [
      { q: "Is this GSTR-compliant?", a: "It produces the fields mandated by the CGST rules — invoice number, date, parties, GSTIN, item breakdown, tax split. For official filing, check with your CA. This is a document generator, not a tax filing service." },
      { q: "Can I save templates?", a: "Not yet — the form resets on reload. Save the generated PDF as your template and start from there. Multi-template save is on the paid roadmap." },
      { q: "Does it support partial payments / advances?", a: "No, single-payment invoices only. Partial / advance handling is in-scope for the paid Pro Invoice tool." },
      { q: "Is it really free?", a: "Yes, unlimited. No signup, no per-invoice limit." },
    ],
    related: ["invoice-generator", "ai-generate", "to-pdf", "page-numbers"],
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
};

export const SEO_SLUGS = Object.keys(SEO_PAGES) as SeoPageSlug[];
