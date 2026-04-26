// Per-tool descriptive intros rendered between the dropzone and the
// reassurance cards on /tool/[id] pages.
//
// Why this file exists:
// AI tools (built on SummarizeVariantTool) had a `pricingBlurb` field
// rendering a "What you'll get + related tool link" panel. Free tools
// never got an equivalent — each tool had its own custom runner with
// no shared blurb slot. Result: AI tool pages had a rich inline panel
// while free tool pages went straight from "Drop your PDF" to feature
// cards, missing on-page context, missing related-tool cross-links,
// and (a real cost) reading as "thin content" to Google's quality
// raters.
//
// This file fixes that with a single source of truth. The renderer in
// app/tool/[id]/page.tsx reads from here for any free tool that has
// an entry, and gracefully shows nothing for tools that don't yet
// have one. New tool introductions can be added without code changes.
//
// Format guidelines (be tight):
//   - text: 1–2 sentences. What does the user get? Concrete output.
//   - related: optional ID + label of a related tool that the user
//     might want next, OR a richer alternative (e.g. AI version).
//   - The related tool ID MUST exist in lib/tools.ts. Type-check this
//     by running `node scripts/verify-tool-intros.mjs` (added below).

export type ToolIntro = {
  /** 1-2 sentence "what you'll get" description. Plain text only. */
  text: string;
  /** Optional inline link to a related tool the user might want next. */
  related?: {
    /** Target tool ID — must exist in lib/tools.ts TOOLS catalog. */
    id: string;
    /** CTA text shown as the link. */
    label: string;
  };
};

export const TOOL_INTROS: Record<string, ToolIntro> = {
  // --------- Top head-term free tools ---------
  merge: {
    text: "What you'll get: a single PDF that combines all your input files in the order you set, with bookmarks and hyperlinks reconciled to the new page numbers. No watermarks. Up to 50 files per merge.",
    related: { id: "split", label: "Split PDF" },
  },
  split: {
    text: "What you'll get: each page (or page range) of your PDF as a separate file, packaged in a zip. Bookmarks pointing into each output range are preserved.",
    related: { id: "merge", label: "Merge PDFs" },
  },
  compress: {
    text: "What you'll get: a smaller PDF with text staying vector-sharp and images re-encoded at the level you pick (Light / Balanced / Strong). Or set a target file size and we iterate.",
    related: { id: "ai-summarize", label: "AI · Summarize PDF" },
  },
  "pdf-to-office": {
    text: "What you'll get: an editable .docx, .xlsx, or .pptx with paragraphs, tables, and headings reconstructed from your PDF. Best on PDFs exported from Word/Google Docs; works on scans with OCR.",
    related: { id: "ai-table", label: "AI · Table Extract" },
  },
  "to-pdf": {
    text: "What you'll get: a single PDF assembled from your Word, Excel, PowerPoint, or image files. Embedded fonts preserved, images at native resolution.",
    related: { id: "merge", label: "Merge PDFs" },
  },
  rotate: {
    text: "What you'll get: your PDF with selected pages rotated 90°/180°/270°, plus optional drag-to-reorder thumbnails for full page rearrangement.",
    related: { id: "sort-pages", label: "Sort Pages" },
  },
  "page-numbers": {
    text: "What you'll get: page numbers in any position (top/bottom × left/center/right), with optional headers, footers, and a translucent watermark stamp on every page.",
    related: { id: "image-watermark", label: "Add Logo Watermark" },
  },
  protect: {
    text: "What you'll get: a password-protected PDF (AES-256), or an unlocked copy if you provide the existing password. Set view-only or full-edit permissions independently.",
    related: { id: "redact-free", label: "Redact PDF" },
  },
  "extract-pages": {
    text: "What you'll get: a new PDF containing only the pages you select. Original file untouched.",
    related: { id: "delete-pages", label: "Delete Pages" },
  },
  "delete-pages": {
    text: "What you'll get: your PDF with the pages you mark removed, page numbers reflowed automatically. Bookmarks pointing to deleted pages drop cleanly.",
    related: { id: "extract-pages", label: "Extract Pages" },
  },
  "pdf-to-jpg": {
    text: "What you'll get: each page rendered as a JPG (or PNG with transparency) at the DPI you choose, packaged in a zip. Pick 72 DPI for web, 150 for screen, 300 for print.",
    related: { id: "to-pdf", label: "JPG to PDF" },
  },
  "extract-images": {
    text: "What you'll get: every embedded image extracted at its original resolution, named by source page, packaged in a zip.",
    related: { id: "pdf-to-jpg", label: "PDF to JPG" },
  },
  "edit-pdf": {
    text: "What you'll get: an in-place text editor for any PDF. Click any text run to retype it; the original font is preserved when embedded.",
    related: { id: "ai-rewrite", label: "AI · Rewrite & Rephrase" },
  },
  "sign-pdf-free": {
    text: "What you'll get: a signed PDF with your signature placed where you click — type it in a script font, draw it with mouse/finger, or upload an image of your hand-signed name. Saves to your account for future signings.",
    related: { id: "ai-sign", label: "AI · Sign & Fill Forms" },
  },
  "redact-free": {
    text: "What you'll get: PDF with the regions you mark permanently redacted — text removed at the byte level, not just covered with a black rectangle. Searching for redacted text returns nothing.",
    related: { id: "ai-redact", label: "AI · Auto-Redact PII" },
  },
  "highlight-pdf": {
    text: "What you'll get: a PDF with highlighter strokes over selected text in any of 5 colors. Annotations carry the underlying text so they reflow correctly in modern readers.",
    related: { id: "free-draw", label: "Draw on PDF" },
  },
  "add-text-box": {
    text: "What you'll get: clickable text boxes anywhere on a PDF page. Match the surrounding font with the dropper tool, anchor to page-relative position for headers/footers.",
    related: { id: "edit-pdf", label: "Edit PDF (Text)" },
  },
  "image-watermark": {
    text: "What you'll get: your PNG/JPEG logo stamped on every page at the size, position, and opacity you set. Common on contract drafts and confidential documents.",
    related: { id: "page-numbers", label: "Page Numbers" },
  },

  // --------- Common utility free tools ---------
  "fill-forms": {
    text: "What you'll get: every form field in your AcroForm PDF rendered as a typed input, dropdown, checkbox, or radio. Save the filled PDF and optionally flatten so recipients can't edit your answers.",
    related: { id: "sign-pdf-free", label: "Sign PDF" },
  },
  "crop-pdf": {
    text: "What you'll get: every page cropped by the margins you set (top/right/bottom/left in points). Useful for trimming scanned page edges or removing letterhead.",
    related: { id: "resize-pdf", label: "Resize Pages" },
  },
  "resize-pdf": {
    text: "What you'll get: every page resized to A4, Letter, Legal, A3, A5, or Tabloid. Scaling preserves aspect ratio; centering anchor configurable.",
    related: { id: "crop-pdf", label: "Crop PDF" },
  },
  "flatten-pdf": {
    text: "What you'll get: a PDF with all form fields, annotations, and editable signatures baked into static page content. Recipients can read but not modify.",
    related: { id: "remove-metadata", label: "Remove Metadata" },
  },
  "repair-pdf": {
    text: "What you'll get: a re-saved PDF with the cross-reference table rebuilt and orphaned objects dropped. Fixes the 'damaged file' error on PDFs from buggy exporters.",
    related: { id: "compress", label: "Compress PDF" },
  },
  "remove-metadata": {
    text: "What you'll get: your PDF with author name, creation date, application name, and other identifying metadata stripped. Important before sharing externally.",
    related: { id: "redact-free", label: "Redact PDF" },
  },
  "pdf-metadata": {
    text: "What you'll get: a viewer/editor for the PDF's metadata fields (title, author, subject, keywords, dates) plus a one-click strip-all option.",
    related: { id: "remove-metadata", label: "Remove Metadata" },
  },
  "page-count": {
    text: "What you'll get: an instant report of page count, word count, character count, and average words per page for any PDF.",
    related: { id: "compress", label: "Compress PDF" },
  },
  "sort-pages": {
    text: "What you'll get: drag-and-drop visual reordering of every page in your PDF, with thumbnails showing each page in its new order before you save.",
    related: { id: "rotate", label: "Rotate Pages" },
  },
  "pdf-to-text": {
    text: "What you'll get: every line of text from your PDF as a plain .txt file — paragraphs, headers, footers, all preserved in reading order. Run AI OCR first if your PDF is a scan.",
    related: { id: "ai-ocr", label: "AI · OCR" },
  },
  "pdf-to-markdown": {
    text: "What you'll get: your PDF converted to Markdown with headings, lists, links, and code blocks detected from the original structure.",
    related: { id: "ai-blog", label: "AI · PDF to Blog Post" },
  },
  "pdf-to-html": {
    text: "What you'll get: your PDF rendered as standalone HTML — useful for embedding pages on a website or sharing as an email attachment.",
    related: { id: "pdf-to-jpg", label: "PDF to JPG" },
  },
  "markdown-to-pdf": {
    text: "What you'll get: your Markdown rendered to a styled PDF — headings, lists, code blocks, tables, and links all preserved. Choose font + page size.",
    related: { id: "text-to-pdf", label: "Text to PDF" },
  },
  "text-to-pdf": {
    text: "What you'll get: your plain text rendered to a PDF with the font, size, and page size you pick. Long lines word-wrap automatically.",
    related: { id: "markdown-to-pdf", label: "Markdown to PDF" },
  },
  "extract-form-data": {
    text: "What you'll get: every AcroForm field value extracted as JSON or CSV — useful for batch-processing filled forms.",
    related: { id: "fill-forms", label: "Fill PDF Forms" },
  },
  "extract-attachments": {
    text: "What you'll get: every embedded file attachment from your PDF, downloaded with original filenames intact.",
    related: { id: "extract-images", label: "Extract Images" },
  },
  "free-draw": {
    text: "What you'll get: free-hand pen annotations over any PDF page in 5 colors and adjustable widths. Useful for casual markup and quick reviews.",
    related: { id: "highlight-pdf", label: "Highlight PDF" },
  },
  "add-links": {
    text: "What you'll get: clickable hyperlink regions anywhere on a PDF page. Drag a rectangle, paste a URL — works for https://, mailto:, and tel: targets.",
    related: { id: "strip-links", label: "Strip Links" },
  },
  "strip-links": {
    text: "What you'll get: your PDF with every clickable hyperlink annotation removed. Use before publishing public-facing PDFs to prevent link-rot embarrassment.",
    related: { id: "add-links", label: "Add Hyperlinks" },
  },
  "booklet-pdf": {
    text: "What you'll get: a print-ready booklet PDF with pages reordered for fold-and-staple binding (2-up, signature-style imposition).",
    related: { id: "n-up", label: "N-up Layout" },
  },
  "n-up": {
    text: "What you'll get: a multi-page-per-sheet PDF — 2, 4, 6, or 9 pages per sheet — useful for reviewing layouts or printing handouts.",
    related: { id: "booklet-pdf", label: "Booklet PDF" },
  },
  "stamp-pdf": {
    text: "What you'll get: a preset business stamp (DRAFT / CONFIDENTIAL / APPROVED / PAID) placed on every page in the color and rotation you pick.",
    related: { id: "image-watermark", label: "Image Watermark" },
  },
  grayscale: {
    text: "What you'll get: every page rendered as black-and-white (grayscale colorspace). Useful for B&W printing prep or shrinking color-heavy PDFs.",
    related: { id: "compress", label: "Compress PDF" },
  },
  "html-to-pdf": {
    text: "What you'll get: any HTML file or pasted HTML rendered to a styled PDF, with CSS preserved.",
    related: { id: "markdown-to-pdf", label: "Markdown to PDF" },
  },
  "word-count": {
    text: "What you'll get: word, character, and sentence count for any PDF. Useful for translation cost estimates and academic submission limits.",
    related: { id: "page-count", label: "Page & Word Count" },
  },
};
