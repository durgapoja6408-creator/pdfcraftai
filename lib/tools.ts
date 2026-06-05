// Canonical tool registry. Ported from the prototype shell.jsx.
// Each tool's `icon` is a key into components/icons/Icons.tsx (the `I` object).

import type { IconName } from "@/components/icons/Icons";

export type ToolGroup = "AI" | "Organize" | "Inspect" | "Convert" | "Optimize" | "Edit" | "Security";

export type Tool = {
  id: string;
  name: string;
  desc: string;
  icon: IconName;
  free: boolean;
  cost?: string;
  group: ToolGroup;
};

export const TOOLS: readonly Tool[] = [
  // ----- Free (PDFium-powered, post-nuke rebuild) -----
  // Build 1 (2026-04-27, commit after 33f0785):
  //   First tool restored on Google's PDFium engine via @hyzyla/pdfium.
  //   Proof-of-concept that the lib/pdf/ pipeline works end-to-end.
  //   The remaining 5 PDFium-applicable tools (pdf-to-jpg, pdf-to-text,
  //   pdf-to-html, pdf-to-markdown, extract-images) ship in Build 2
  //   using this same pattern. The other 34 nuked tools require a
  //   writable engine (pdf-lib, mupdf commercial, or server-side qpdf)
  //   and stay deleted until that engine decision lands.
  // 2026-04-27 SPLIT: Page Counter and PDF Inspector are now two
  // separate tools sharing the same `lib/pdf/ops/inspect.ts` parse:
  //   - Page Counter (this entry, /tool/page-count): just the count.
  //     Single-purpose, fast-answer surface for users who searched
  //     "page count" and want one number to copy.
  //   - PDF Inspector (next entry, /tool/pdf-inspector): the rich
  //     5-stat document inspector + warnings + longform.
  // Both run the SAME PDFium parse — the split is purely about
  // matching search intent (and fixing the URL/title mismatch where
  // /tool/page-count visibly said "PDF Inspector"). Each tool
  // cross-promos the other so users can upgrade or downgrade as needed.
  // 2026-04-27 (Inspector P3 polish): renamed "Page Counter" → "Page
  // Count" so the visible name exactly matches the URL slug
  // /tool/page-count. Matches the BreadcrumbList JSON-LD and the
  // competitor convention (iLovePDF, Smallpdf both maintain strict
  // slug↔name alignment). No URL change, zero SEO cost.
  { id: "page-count", name: "Page Count", desc: "Count pages in any PDF — fast, free, in-browser. One number, one click to copy.", icon: "Pages", free: true, cost: "free", group: "Organize" },
  { id: "pdf-inspector", name: "PDF Inspector", desc: "See everything inside a PDF — pages, dimensions, word count, reading time + mixed-size warnings. Free, in-browser.", icon: "Search", free: true, cost: "free", group: "Inspect" },

  // Build 2 (2026-04-27): PDFium-backed text-export trio. All three
  // share lib/pdf/ops/text-export.ts — same single PDFium parse,
  // three formatters. Restored from the pre-nuke catalog because
  // PDF→Text/Markdown/HTML are read-only operations PDFium handles
  // cleanly. Group is "Convert" so they cluster with PDF→Word /
  // PDF→Excel / PDF→PowerPoint in the /tools index.
  { id: "pdf-to-text", name: "PDF to Text", desc: "Extract every word from a PDF as plain .txt — preserves reading order, runs in your browser.", icon: "Convert", free: true, cost: "free", group: "Convert" },
  { id: "pdf-to-markdown", name: "PDF to Markdown", desc: "Convert PDF text to Markdown — paste into Notion, Obsidian, GitHub, or any doc tool. Free, in-browser.", icon: "Convert", free: true, cost: "free", group: "Convert" },
  { id: "pdf-to-html", name: "PDF to HTML", desc: "Convert PDF text to a portable HTML document with proper structure tags. Free, in-browser.", icon: "Convert", free: true, cost: "free", group: "Convert" },

  // Build 2 Wave 2 (2026-04-27): PDF → JPG / PNG. PDFium renders
  // each page to RGBA pixels; we paint to canvas + toBlob() for the
  // final image. Multi-page output zips via JSZip (dynamic import).
  { id: "pdf-to-jpg", name: "PDF to JPG", desc: "Convert PDF pages to JPG images at 1×/2×/3× resolution. Multi-page PDFs bundle into a zip. Free, in-browser.", icon: "Image", free: true, cost: "free", group: "Convert" },
  { id: "pdf-to-png", name: "PDF to PNG", desc: "Convert PDF pages to lossless PNG images at 1×/2×/3× resolution. Multi-page PDFs bundle into a zip. Free, in-browser.", icon: "Image", free: true, cost: "free", group: "Convert" },

  // 2026-05-01: image/text → PDF tools (closes 3 dead SEO routes).
  // Pure pdf-lib client-side — no PDFium, no server dependency. Native
  // resolution preserved for images; output is text-selectable for
  // text-to-pdf (no rasterization).
  { id: "jpg-to-pdf", name: "JPG to PDF", desc: "Combine multiple JPG images into a single PDF — drag to reorder, choose page size, output preserves native image resolution. Free, in-browser.", icon: "Image", free: true, cost: "free", group: "Convert" },
  { id: "png-to-pdf", name: "PNG to PDF", desc: "Combine multiple PNG images into a single PDF — lossless image embedding, drag to reorder, page-size selectable. Free, in-browser.", icon: "Image", free: true, cost: "free", group: "Convert" },
  { id: "text-to-pdf", name: "Text to PDF", desc: "Convert plain text or .txt/.md/.csv files into a paginated PDF — pick a font, size, paper size; output is text-selectable + searchable.", icon: "Convert", free: true, cost: "free", group: "Convert" },
  // 2026-05-01 Tier 1 batch (3 tools — encrypt-pdf deferred, no
  // pdf-lib write-encryption support):
  { id: "markdown-to-pdf", name: "Markdown to PDF", desc: "Render markdown (headings, lists, code blocks, blockquotes, inline bold/italic/code) into a styled, paginated PDF. Output is text-selectable + searchable.", icon: "Convert", free: true, cost: "free", group: "Convert" },
  { id: "grayscale-pdf", name: "PDF to Grayscale", desc: "Convert any PDF to grayscale via PDFium-rasterize + BT.709 luminance. Ideal for printing on monochrome printers; output is rasterized so text becomes part of the image.", icon: "Edit", free: true, cost: "free", group: "Optimize" },
  { id: "booklet-pdf", name: "Booklet PDF", desc: "Saddle-stitch imposition — reorder pages so you can print double-sided, fold the stack in half, and staple along the fold to make a booklet.", icon: "Pages", free: true, cost: "free", group: "Edit" },
  // 2026-05-01 Tier 2 batch:
  { id: "bates-numbers", name: "Bates Numbering", desc: "Stamp legal-style sequential identifiers (LAW000001, LAW000002, …) on every page. Configurable prefix, digit count, start number, position. For litigation discovery and document production.", icon: "Edit", free: true, cost: "free", group: "Edit" },
  { id: "odd-even-pages", name: "Odd / Even Pages", desc: "Extract just the odd-numbered or just the even-numbered pages of a PDF — useful for re-scanning duplex documents where only one side captured.", icon: "Pages", free: true, cost: "free", group: "Organize" },
  { id: "csv-to-pdf", name: "CSV to PDF", desc: "Render CSV / TSV data as a paginated PDF table — RFC 4180 quoted fields supported, header repeats on every page, output is text-selectable + searchable.", icon: "Convert", free: true, cost: "free", group: "Convert" },
  { id: "pdf-overlay", name: "PDF Overlay", desc: "Stamp the first page of one PDF (letterhead / template / watermark) onto every page of another PDF. Front-or-behind layer, configurable opacity, fit-or-stretch, optional page subset.", icon: "Edit", free: true, cost: "free", group: "Edit" },
  { id: "pdf-form-fill", name: "Fill PDF Form", desc: "Visually fill PDF AcroForm fields — text, checkboxes, radio buttons, dropdowns, multi-select. Optional flatten to bake values so recipients can&apos;t edit.", icon: "Edit", free: true, cost: "free", group: "Edit" },
  { id: "pdf-batch", name: "Batch Process PDFs", desc: "Apply one operation (rotate, page numbers, watermark, remove metadata, flatten, strip links) across many PDFs at once. Output bundles into a downloadable zip.", icon: "Pages", free: true, cost: "free", group: "Edit" },
  // PENDING §5a Phase B (2026-05-05): server-side Ghostscript-backed
  // compress. Free for MVP, bounded by 50MB + 60s timeout. Three
  // levels (Light / Balanced / Strong) map to gs PDFSETTINGS=
  // /printer | /ebook | /screen. Behind PDF_COMPRESS feature flag —
  // appears in the catalog only when isFeatureEnabled returns true
  // for the user (the page-level guard in app/tool/[id]/page.tsx
  // turns 404 when the flag is off, so an early click before flag
  // flip lands on a graceful 404 instead of a runtime crash).
  // Replaces the long-standing "no compress" gap that motivated the
  // T1-1 bait-and-switch removal.
  { id: "compress-pdf", name: "Compress PDF", desc: "Shrink PDF file size with adjustable quality (Light, Balanced, Strong). Server-side via Ghostscript — keeps text searchable, embeds web-optimized linearization. Falls back to your original if compression doesn't actually help.", icon: "Compress", free: true, cost: "free", group: "Optimize" },
  // PENDING §5b Phase B (2026-05-05): server-side Ghostscript-backed
  // PDF/A-2b converter. Different tool id from /tool/pdf-a-check
  // (read-only validator) — separate intents = separate tools.
  // Behind PDF_A_CONVERT feature flag. Output is conformant PDF/A-2b
  // with embedded fonts + sRGB output intent + dPDFACompatibilityPolicy=1
  // policy (gs fails honestly on un-PDF/A-able content rather than
  // silently producing files that LIE about conformance).
  { id: "pdf-a-convert", name: "Convert to PDF/A", desc: "Convert any PDF to PDF/A-2b for archival storage. Embeds all fonts, declares sRGB output intent, ensures long-term renderability. Pairs with PDF/A Compliance Check — run check first to see if conversion is needed; run convert to make it conformant.", icon: "Shield", free: true, cost: "free", group: "Convert" },
  // 2026-05-12 — renamed from "Compare PDFs" to "Visual Diff" to
  // eliminate display-name collision with ai-compare ("Compare PDFs"
  // for AI content diff). Caught by test-tool-id-conventions.mjs §G1.
  // The two tools had the same catalog label but very different
  // costs (free in-browser vs 15 credits per diff) and outputs
  // (pixel-level visual vs redline content). Users browsing the
  // catalog couldn't distinguish them. New name is honest about
  // what the tool actually does — pixel-level visual diff.
  { id: "pdf-diff", name: "Visual Diff", desc: "Pixel-level visual diff between two PDFs — output a comparison PDF with red highlighting on regions that differ + per-page diff percentage. Pairs with AI Compare for content-level diffs.", icon: "Search", free: true, cost: "free", group: "Inspect" },

  // Build 2 Wave 3 (2026-04-27): Search + Extract Images. Both
  // PDFium-backed read-only ops.
  { id: "pdf-search", name: "Search in PDF", desc: "Find any word or phrase across every page of a PDF. Case-sensitive and whole-word options, with surrounding context. Free, in-browser.", icon: "Search", free: true, cost: "free", group: "Inspect" },
  { id: "extract-images", name: "Extract Images from PDF", desc: "Pull every embedded image out of a PDF as PNG, at native resolution. Single download or zip bundle. Free, in-browser.", icon: "Image", free: true, cost: "free", group: "Convert" },

  // Build 2 Wave 4 (2026-04-27): byte-parser tool — no PDFium needed.
  // Reads the outline (bookmark) tree from the raw PDF bytes,
  // resolves destinations to page numbers via the page tree.
  { id: "pdf-outline", name: "PDF Outline Viewer", desc: "View the bookmark / table-of-contents tree of any PDF, with page references. Useful for previewing long docs before reading. Free, in-browser.", icon: "Pages", free: true, cost: "free", group: "Inspect" },
  // Build 2 Wave 4 (continued) — Form Fields + Attachments byte parsers.
  { id: "pdf-forms", name: "PDF Form Inspector", desc: "List every AcroForm field in a PDF — name, type, value, required/read-only flags. Export as CSV or JSON. Free, in-browser.", icon: "Pen", free: true, cost: "free", group: "Inspect" },
  { id: "pdf-attachments", name: "PDF Attachments Lister", desc: "List every embedded file in a PDF — filename, description, MIME type, size. Useful for compliance audits and security review. Free, in-browser.", icon: "Shield", free: true, cost: "free", group: "Inspect" },
  // 2026-05-01 — Extract Contacts: regex-based emails + phone numbers
  // from PDF text. Closes the /extract-emails-from-pdf SEO landing
  // that was seeded ahead of the tool. Indian phone formats
  // (+91 XXXXX XXXXX, 0XX-XXXXXXXX, bare 10-digit mobiles) are primary
  // supported variants alongside US/Canadian and generic international
  // (+CC) patterns. Runs entirely client-side.
  { id: "extract-contacts", name: "Extract Emails & Phones", desc: "Pull every email address and phone number out of a PDF as a deduped table. Indian + international phone formats, page references, CSV export. Free, in-browser.", icon: "Search", free: true, cost: "free", group: "Inspect" },
  // 2026-05-01 — Extract Dates: regex-based date extraction with .ics
  // calendar export. Closes the /pdf-to-ics-calendar SEO landing
  // (was a placeholder pre-today). Day-first default for ambiguous
  // numeric formats (Indian/EU convention); month-first interpretation
  // surfaced as an alt column for ambiguous matches.
  { id: "extract-dates", name: "Extract Dates → ICS", desc: "Find every date in a PDF and download an .ics file importable into Google Calendar / Apple Calendar / Outlook. Day-first default with ambiguity flagging. Free, in-browser.", icon: "Convert", free: true, cost: "free", group: "Inspect" },
  // 2026-05-01 — Extract Attachments: pulls actual file bytes from
  // embedded files (vs the existing pdf-attachments tool which just
  // LISTS them). Per-file download + ZIP bundle for multi-attachment
  // PDFs. Closes the long-standing FAQ in pdf-attachments and the
  // /extract-pdf-attachments SEO landing.
  { id: "extract-attachments", name: "Extract PDF Attachments", desc: "Download embedded files from a PDF — research datasets, regulatory supporting docs, PDF/A archive sources. Per-file download or ZIP bundle. FlateDecode + ASCIIHex + ASCII85 supported. Free, in-browser.", icon: "Convert", free: true, cost: "free", group: "Inspect" },
  // Build 2 Wave 4 (final): font inventory — completes the 11-tool list.
  { id: "pdf-fonts", name: "PDF Font Inspector", desc: "List every font in a PDF, flag embedded vs not, see which pages use each. Critical for print prep. Free, in-browser.", icon: "Edit", free: true, cost: "free", group: "Inspect" },

  // Build 2 Wave 8 (2026-04-27): 6 byte-parser tools — links,
  // annotations, JS detector, accessibility, PDF/A, PDF/X.
  { id: "pdf-links", name: "Extract Links from PDF", desc: "Find every hyperlink (internal + external) in a PDF, with the page where each appears. CSV / JSON export.", icon: "Search", free: true, cost: "free", group: "Inspect" },
  { id: "pdf-annotations", name: "PDF Annotations Export", desc: "Export every comment, highlight, sticky note from a PDF — author, date, color, content, page. Free, in-browser.", icon: "Edit", free: true, cost: "free", group: "Inspect" },
  { id: "pdf-javascript", name: "PDF JavaScript Detector", desc: "Find every JavaScript handler embedded in a PDF — security review for phishing, exfil, malware. Free, in-browser.", icon: "Shield", free: true, cost: "free", group: "Inspect" },
  { id: "pdf-accessibility", name: "PDF Accessibility Checker", desc: "Audit a PDF against WCAG / PDF/UA accessibility heuristics. Tagged status, structure tree, language, alt text. Free, in-browser.", icon: "Shield", free: true, cost: "free", group: "Inspect" },
  { id: "pdf-a-check", name: "PDF/A Compliance Check", desc: "Heuristic check whether a PDF meets PDF/A archive standards. Flags unembedded fonts, encryption, JavaScript, missing metadata.", icon: "Shield", free: true, cost: "free", group: "Inspect" },
  { id: "pdf-x-check", name: "PDF/X Compliance Check", desc: "Heuristic check whether a PDF meets PDF/X print-production standards. Flags unembedded fonts, missing output intent, no trim box.", icon: "Edit", free: true, cost: "free", group: "Inspect" },

  // Build 2 Wave 9 (2026-04-27): 4 pdf-lib-backed writable tools.
  // First Wave to use a writable engine (pdf-lib v1.17) instead of
  // PDFium's read-only API. All four run client-side, no upload, no
  // watermark. Ship docs/PDF_LIB_NOTES.md alongside this commit
  // explaining what pdf-lib can/can't do (no encrypt — needs server-
  // side qpdf — no compress, no edit text).
  { id: "merge", name: "Merge PDFs", desc: "Combine multiple PDFs into one in the order you choose. Drag to reorder, runs in your browser via pdf-lib.", icon: "Merge", free: true, cost: "free", group: "Organize" },
  { id: "split", name: "Split PDF", desc: "Split a PDF into per-page files, custom ranges, or fixed-size chunks. Single output downloads directly, multiples zip.", icon: "Split", free: true, cost: "free", group: "Organize" },
  { id: "rotate", name: "Rotate PDF", desc: "Rotate selected pages by 90°/180°/270°. Lossless via pdf-lib's /Rotate adjustment — runs in milliseconds.", icon: "Rotate", free: true, cost: "free", group: "Edit" },
  { id: "unlock", name: "Unlock PDF", desc: "Remove owner restrictions (no-print, no-copy, no-edit) from a PDF. For files that don't require a password to open.", icon: "Unlock", free: true, cost: "free", group: "Security" },

  // Tier 2 (2026-04-27): Extract Pages + Delete Pages — both run on
  // the shared PageGridTool base component. Same UI shape, mirrored
  // semantics. Both ids were already in LIVE_TOOL_IDS as orphaned
  // pre-nuke entries; this commit makes those routes actually render.
  { id: "extract-pages", name: "Extract Pages", desc: "Pick pages from a PDF via thumbnail grid and save them as a new PDF. Click to select, runs in your browser.", icon: "Pages", free: true, cost: "free", group: "Organize" },
  { id: "delete-pages", name: "Delete Pages", desc: "Remove pages from a PDF via thumbnail grid. Click pages to mark for deletion, save the trimmed file.", icon: "Trash", free: true, cost: "free", group: "Organize" },
  // Tier 2 (continued) — Sort Pages / Organize PDF. Drag-and-drop
  // reorder via HTML5 native DnD (same approach Merge uses for files).
  { id: "sort-pages", name: "Sort Pages", desc: "Reorder pages in a PDF via drag-and-drop on a thumbnail grid. Reverse, restore, or rearrange — runs in your browser.", icon: "Pages", free: true, cost: "free", group: "Organize" },

  // Tier 3 (2026-04-28): 4 pdf-lib tools — page numbers, repair,
  // strip links, flatten. All previously orphaned ids in
  // LIVE_TOOL_IDS; this batch lights them up with real ops + runners.
  { id: "page-numbers", name: "Add Page Numbers", desc: "Stamp page numbers onto every page — pick position, format, and font size. pdf-lib drawText overlay, runs in your browser.", icon: "Pages", free: true, cost: "free", group: "Edit" },
  { id: "repair-pdf", name: "Repair PDF", desc: "Fix mildly malformed PDFs by reparsing through pdf-lib and re-saving. Recovers from dangling xref, stale trailer dicts, bad object streams.", icon: "Edit", free: true, cost: "free", group: "Edit" },
  { id: "strip-links", name: "Strip Hyperlinks", desc: "Remove every clickable hyperlink from a PDF. Print prep, compliance, and accidental-tap-proofing. Other annotations preserved.", icon: "Edit", free: true, cost: "free", group: "Edit" },
  { id: "flatten-pdf", name: "Flatten PDF Forms", desc: "Bake AcroForm field values into static page content. Recipients see filled values but can&apos;t edit them. Lossless for the page content.", icon: "Edit", free: true, cost: "free", group: "Edit" },
  // Tier 4 (2026-04-28): first visual-editor tool.
  { id: "crop-pdf", name: "Crop PDF", desc: "Drag a rectangle on page 1 to define a crop area, applied uniformly to every page. Lossless via /CropBox — no content is removed, just hidden.", icon: "Edit", free: true, cost: "free", group: "Edit" },
  // Tier 5 (2026-04-28): 4 more pdf-lib tools — text watermark, N-up,
  // resize, remove metadata.
  { id: "stamp-pdf", name: "Watermark PDF", desc: "Add a text watermark (DRAFT, CONFIDENTIAL, your company name) on every page — pick position, opacity, color, and font size.", icon: "Edit", free: true, cost: "free", group: "Edit" },
  { id: "n-up-pdf", name: "N-up PDF", desc: "Pack 2 or 4 source pages onto each output sheet — paper-saving prints, handouts, multi-page reading.", icon: "Pages", free: true, cost: "free", group: "Edit" },
  { id: "resize-pdf", name: "Resize PDF", desc: "Resize every page to Letter / Legal / A4 / A3 / A5. Content scales to fit, aspect ratio preserved.", icon: "Edit", free: true, cost: "free", group: "Edit" },
  { id: "remove-metadata", name: "Remove PDF Metadata", desc: "Strip Title, Author, Producer, Creator, dates, and XMP metadata before sharing externally. Page content untouched.", icon: "Shield", free: true, cost: "free", group: "Security" },
  // Tier 5 (continued): image watermark / logo overlay (config-only v1).
  { id: "image-watermark", name: "Image Watermark", desc: "Add a PNG or JPG watermark (logo, signature, brand mark) to every page — pick position, opacity, and size. Lossless overlay via pdf-lib.", icon: "Image", free: true, cost: "free", group: "Edit" },
  // Tier 6 (2026-04-28): second visual editor on the new
  // <PageEditorTool> base. Click-to-place + text input + style.
  { id: "add-text-box", name: "Add Text to PDF", desc: "Click on the page to place a text box, type your label, pick font size + color. Stamps on every page at the same position.", icon: "Edit", free: true, cost: "free", group: "Edit" },
  // Tier 6 (continued): third visual editor — drag-to-highlight.
  { id: "highlight-pdf", name: "Highlight PDF", desc: "Drag to add yellow / green / pink / blue highlights on page 1. Multiple highlights per session, opacity adjustable, lossless overlay.", icon: "Edit", free: true, cost: "free", group: "Edit" },
  // Tier 6 (continued): fourth visual editor — drag-to-redact (visual cover only).
  { id: "redact-free", name: "Redact PDF", desc: "Drag opaque rectangles over sensitive content on page 1. Visual cover only — see FAQ on what this does and doesn&apos;t do.", icon: "Shield", free: true, cost: "free", group: "Security" },
  // Tier 6 (continued): fifth visual editor — click-to-place signature image.
  { id: "sign-pdf-free", name: "Sign PDF", desc: "Place a signature image on page 1 — click to position, slider for size. Visual signature, not cryptographic e-sign (see FAQ).", icon: "Pen", free: true, cost: "free", group: "Edit" },
  // Tier 6 (continued): sixth visual editor — pen tool over canvas.
  { id: "free-draw-pdf", name: "Free Draw on PDF", desc: "Pen tool — click and drag to draw freehand on page 1. Multiple strokes, color and width pickers, undo / clear all.", icon: "Pen", free: true, cost: "free", group: "Edit" },
  // Tier 6 (continued): seventh visual editor — drag-rect + URL input.
  { id: "add-links", name: "Add Hyperlinks", desc: "Drag a rectangle on page 1, type a URL — repeat to add multiple clickable regions. pdf-lib /Link annotations, every viewer respects them.", icon: "Edit", free: true, cost: "free", group: "Edit" },

  // ----- AI -----
  { id: "ai-chat", name: "Chat with PDF", desc: "Ask questions. Get answers cited to pages.", icon: "Chat", free: false, cost: "1 credit per question", group: "AI" },
  { id: "ai-summarize", name: "Summarize PDF", desc: "Executive summary + section bullets.", icon: "Summary", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-tldr", name: "TL;DR Generator", desc: "One-paragraph executive summary. Fast, cheap, precise.", icon: "Summary", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-key-points", name: "Key Points Extractor", desc: "Bulleted list of a PDF's core insights, each cited by page.", icon: "Summary", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-study-notes", name: "PDF to Study Notes", desc: "Revision-grade notes: overview, concepts, detailed sections, self-check questions.", icon: "Book", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-eli5", name: "Explain Like I'm 12", desc: "Plain-language explanation of any PDF. Short sentences, everyday words.", icon: "Chat", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-faq", name: "Generate FAQ", desc: "Auto-generate 6–10 Q&A pairs a reader would ask. Answers grounded in the doc.", icon: "Help", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-blog", name: "PDF to Blog Post", desc: "Turn a PDF into a publish-ready blog post — hook, sections, conclusion.", icon: "Edit", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-readability", name: "Readability Score", desc: "Flesch-Kincaid grade + complex-sentence callouts + jargon flags + fixes.", icon: "Compare", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-entities", name: "Extract Entities", desc: "People / organisations / places / dates — four tables with page cites.", icon: "Search", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-social-thread", name: "PDF to Social Thread", desc: "5–10 post X/LinkedIn thread. Hook, ideas, takeaway close.", icon: "Chat", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-condense", name: "Condense PDF", desc: "Tighter rewrite of the document itself — keep every fact, cut 40–60% of the length.", icon: "Edit", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-expand", name: "Expand PDF", desc: "Elaborate every bullet into a full paragraph with source-grounded context.", icon: "Edit", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-tone-analyze", name: "Tone & Style Analyzer", desc: "Voice + audience + 6–10 style attributes + observations. Doesn't rewrite.", icon: "Compare", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-citations", name: "Extract Citations (BibTeX)", desc: "References as a BibTeX block + readable reference list.", icon: "Book", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-sentiment", name: "Sentiment Analysis", desc: "Overall + per-section sentiment verdict with evidence and shifts.", icon: "Compare", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-bias", name: "Inclusive Language Audit", desc: "Gendered language + outdated terminology + stereotyping flagged with fixes.", icon: "Shield", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-proofread", name: "Proofread PDF", desc: "Error table — page, quote, type, suggested fix. Spelling + grammar + agreement.", icon: "Edit", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-newsletter", name: "PDF to Email Newsletter", desc: "Subject + preheader + sections + sign-off. Publish-ready draft.", icon: "Send", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-video-script", name: "PDF to Video Script", desc: "Talking-head script with 90s segments, hook, stage cues, closing CTA.", icon: "Play", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-flashcards", name: "PDF to Flashcards", desc: "10–30 Anki-compatible Q&A cards, downloadable CSV.", icon: "Book", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-quiz", name: "PDF to Quiz (MCQ)", desc: "6–12 multiple-choice questions with 4 options, answer key, and explanations.", icon: "Help", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-mindmap", name: "PDF to Mind Map", desc: "Hierarchical outline of a PDF — 4–8 branches, 3 levels deep. Text + JSON export.", icon: "Flow", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-semantic-search", name: "Semantic Search in PDF", desc: "Ask in natural language, get verbatim passages with page refs and relevance notes.", icon: "Search", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-ats-resume", name: "ATS Resume Optimizer", desc: "audit your resume for ATS compatibility + get concrete fixes.", icon: "User", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-resume-parse", name: "Resume Parser", desc: "parse a resume into structured JSON (ATS / spreadsheet ready).", icon: "User", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-action-items", name: "Extract Action Items", desc: "Meeting notes / specs / briefs → TODO table with owners, due dates, priorities.", icon: "Check", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-blood-test", name: "Blood Test Report Parser", desc: "lab values with normal/high/low flags. Extraction only, not medical advice.", icon: "File", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-syllabus", name: "Syllabus to Study Plan", desc: "12-week study plan with topic map, practice checkpoints, revision strategy.", icon: "Book", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-discharge", name: "Discharge Summary Simplifier", desc: "plain-language rewrite for patients + families. Not medical advice.", icon: "Chat", free: false, cost: "3 credits per doc", group: "AI" },
  // Task #67 — Tier 3 §3.6, §3.3, §3.1 P0 wedges.
  { id: "ai-cover-letter", name: "Cover Letter Generator", desc: "tailored cover letter from your resume + optional JD. 300–350 words with customisation notes.", icon: "Edit", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-jd-match", name: "Resume ↔ JD Matcher", desc: "fit score + per-requirement alignment table + missing-keyword ATS audit. Paste the JD, drop the resume.", icon: "Compare", free: false, cost: "3 credits per doc", group: "AI" },
  // Task #69 — Tier 2 §2.3 P0: Scanned → Searchable PDF.
  { id: "ai-searchable-pdf", name: "Make PDF Searchable", desc: "OCR scanned pages and overlay invisible text so Ctrl-F finds matches. Visual layout unchanged.", icon: "Scan", free: false, cost: "2 credits per page", group: "AI" },
  // Task #75 — five Tier 3 P1 wedges.
  { id: "ai-nda", name: "NDA Analyzer", desc: "risk flags + negotiation points + missing standard clauses. Catches embedded non-competes, IP assignment.", icon: "Shield", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-employment", name: "Employment Contract Review", desc: "comp + termination + risk flags (non-compete, IP, training bond) + negotiation points.", icon: "Shield", free: false, cost: "3 credits per doc", group: "AI" },
  // Task #77 — five more Tier 3 P1 wedges.
  { id: "ai-salary-slip", name: "Salary Slip Analyzer", desc: "structured JSON of earnings + deductions + YTD with original component names preserved for YoY comparison.", icon: "Receipt", free: false, cost: "3 credits per doc", group: "AI" },
  // Task #78 — five more Tier 3 wedges.
  { id: "ai-research-paper", name: "Research Paper Summarizer", desc: "citation + BibTeX + methods + results (magnitudes preserved) + limitations + how-to-cite examples + related reading.", icon: "Book", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-insurance", name: "Insurance Policy Analyzer", desc: "coverage + exclusions + waiting periods + claim process + renewal/portability + risk flags. Health/life/motor/home/travel/term.", icon: "Shield", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-loan-bundle", name: "Loan Application Bundler Audit", desc: "audits a stack of loan docs against lender checklist. Detects loan type, lists missing items, surfaces eligibility issues.", icon: "Receipt", free: false, cost: "3 credits per doc", group: "AI" },
  // Task #79 — five more Tier 3 wedges.
  { id: "ai-partnership-deed", name: "Partnership Deed Analyzer", desc: "partners + capital + profit/loss share + decision-making + admission/retirement + risk flags. Partnership & LLP deeds.", icon: "Shield", free: false, cost: "3 credits per doc", group: "AI" },
  // Task #80 — five more Tier 3 wedges.
  // Task #81 — five more wedges (Tier 2 §2.5/§2.6/§2.8 + Tier 3 §3.3).
  { id: "ai-improve-writing", name: "Improve Writing", desc: "Rewrites for clarity + concision (~20-30% shorter) without changing facts, register, or claims.", icon: "Edit", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-paraphrase", name: "Paraphrase PDF", desc: "Rewords preserving every claim + number + conclusion. Same length as input. Technical terms preserved.", icon: "Edit", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-detector", name: "AI Content Detector", desc: "Detect AI-generated text (ChatGPT / Claude / Gemini) in any PDF. Surfaces formulaic structure, AI-typical phrasing, register shifts. Honest heuristic — not a courtroom-grade scan.", icon: "Shield", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-chart-to-table", name: "Chart → Data Table", desc: "Reads charts visually, extracts data points with axis labels + units. Bar / line / pie / scatter / stacked supported.", icon: "Pages", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-translate", name: "Translate PDF", desc: "Preserve layout across 20+ languages.", icon: "Translate", free: false, cost: "5 credits per doc", group: "AI" },
  { id: "ai-ocr", name: "OCR & Smart Extract", desc: "Turn scans into searchable, structured data.", icon: "Scan", free: false, cost: "2 credits per page", group: "AI" },
  { id: "ai-rewrite", name: "Rewrite & Rephrase", desc: "Tone shift, simplify, or expand text.", icon: "Edit", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-redact", name: "Redact Sensitive Info", desc: "Auto-detect PII and black it out.", icon: "Shield", free: false, cost: "5 credits per doc", group: "AI" },
  { id: "ai-generate", name: "Generate PDF from Prompt", desc: "Draft reports, contracts, briefs from text.", icon: "Generate", free: false, cost: "20 credits per doc", group: "AI" },
  { id: "ai-sign", name: "Sign & Fill Forms", desc: "AI fills fields, you sign and send.", icon: "Pen", free: false, cost: "10 credits per doc", group: "AI" },
  // 2026-05-01 — ai-court-order: Indian court judgment/order summarizer.
  // Closes the /court-judgment-summarizer SEO landing that was seeded
  // pre-2026-04-30 but had no underlying tool. Routes through
  // /api/ai/summarize with depth=court-order; structured JSON output
  // (meta + parties + acts cited + issues + holding + reasoning +
  // remedy + plain-English summary). Triage aid for legal research
  // and journalists; "not legal advice" caveat surfaced at every layer.
  { id: "ai-court-order", name: "Court Judgment Summarizer", desc: "Indian court judgments → structured summary: parties, acts/sections cited, issues framed, holding, reasoning, remedy. Plain-English summary suitable for non-lawyers. Triage aid, not legal advice.", icon: "Shield", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-table", name: "AI Table Extract", desc: "Extract tables as CSV or Excel — even multi-page.", icon: "Pages", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-compare", name: "Compare PDFs", desc: "Redline diff with AI severity analysis.", icon: "Compare", free: false, cost: "15 credits per diff", group: "AI" },
] as const;

export const GROUP_ORDER: readonly ToolGroup[] = ["AI", "Organize", "Convert", "Optimize", "Edit", "Inspect", "Security"] as const;

export const toolById = (id: string): Tool | undefined => TOOLS.find((t) => t.id === id);

export const toolsByGroup = (
  filter?: (t: Tool) => boolean,
): Record<ToolGroup, Tool[]> => {
  const out = {} as Record<ToolGroup, Tool[]>;
  for (const g of GROUP_ORDER) out[g] = [];
  for (const t of TOOLS) {
    if (filter && !filter(t)) continue;
    out[t.group].push(t);
  }
  return out;
};

// Single source of truth for tool counts rendered in marketing copy.
// Every place that says "16 tools" / "8 free forever" / "10 AI" used
// to hardcode these numbers and drifted every time TOOLS grew. Derive
// them here once; every consumer pulls from the same place so adding
// a tool to TOOLS[] auto-updates every surface that references counts.
//
// Exposed as an object rather than three separate exports so call-sites
// read as `TOOL_STATS.free` / `TOOL_STATS.ai` — grepable, impossible to
// confuse with other counts elsewhere in the app.
export const TOOL_STATS = {
  total: TOOLS.length,
  free: TOOLS.filter((t) => t.free).length,
  ai: TOOLS.filter((t) => !t.free).length,
} as const;

/**
 * Bundle G5 (2026-04-26) — single source of truth for cost display on
 * action buttons. Pre-G5, every AI tool component hardcoded its own
 * button label like `"Summarize — 3 credits"` as a literal string,
 * which meant the heading chip (which derives from `tool.cost` —
 * "AI · 3 credits per doc") and the button could drift independently.
 * The user-visible bug: chip said "3 CREDITS PER DOC", button said
 * "3 credits", and credit cost may actually vary for some tools
 * (per-page, per-question, per-table billing) but the hardcoded
 * button gave no honest signal of variability.
 *
 * This helper returns the canonical short cost string for a button:
 *   - free tool                 → null  (caller should render no cost)
 *   - fixed per-call AI         → "3 credits"
 *   - variable per-doc          → "~3 credits" (preserves the ~ marker
 *                                 so buttons honestly signal estimate)
 *   - per-unit billed (page/Q)  → "~2 credits / page" (preserves unit)
 *
 * Usage:
 *   <button>{busy ? "Summarizing…" : `Summarize — ${formatActionCost(tool)}`}</button>
 *
 * Why drop "per doc" for fixed-per-doc tools: the action verb
 * implies one document already (you click "Summarize" once per
 * upload). Keeping "per X" only when X varies (page, question,
 * table) is the honest middle ground — short for the common case,
 * informative when it matters.
 */
export function formatActionCost(tool: Tool): string | null {
  if (tool.free || !tool.cost) return null;
  // tool.cost example shapes:
  //   "3 credits per doc"         → "3 credits"      (drop "per doc")
  //   "~5 credits per Q"          → "~5 credits"     (drop "per Q" — Q == 1 question per click)
  //   "~2 credits per page"       → "~2 credits / page"  (preserve)
  //   "~3 credits per table"      → "~3 credits / table" (preserve)
  //   "15 credits per diff"       → "15 credits"     (one click = one diff)
  //   "10 credits per resume"     → "10 credits"
  const COLLAPSE_UNITS = new Set([
    "doc", "summary", "diff", "letter", "slip",
    "paper", "policy", "bundle", "deed", "contract",
    "NDA", "syllabus", "resume", "report", "Q",
  ]);
  const m = tool.cost.match(/^(~?\d+\s+credits?)\s+per\s+(\w+)$/);
  if (!m) return tool.cost; // fallback: show as-is
  const [, prefix, unit] = m;
  if (COLLAPSE_UNITS.has(unit)) return prefix;
  return `${prefix} / ${unit}`;
}
