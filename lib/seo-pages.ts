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
  | "highlight-pdf";

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
};

export const SEO_SLUGS = Object.keys(SEO_PAGES) as SeoPageSlug[];
