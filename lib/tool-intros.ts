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
    related: { id: "n-up-pdf", label: "N-up Layout" },
  },
  "n-up-pdf": {
    text: "What you'll get: a multi-page-per-sheet PDF — 2, 4, 6, or 9 pages per sheet — useful for reviewing layouts or printing handouts.",
    related: { id: "booklet-pdf", label: "Booklet PDF" },
  },
  "stamp-pdf": {
    text: "What you'll get: a preset business stamp (DRAFT / CONFIDENTIAL / APPROVED / PAID) placed on every page in the color and rotation you pick.",
    related: { id: "image-watermark", label: "Image Watermark" },
  },
  "grayscale-pdf": {
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

  // --------- AI tools with dedicated runners (no SummarizeVariantTool) ---------
  // These tools each ship their own component (SummarizePdfTool,
  // TranslatePdfTool, etc.) instead of using SummarizeVariantTool, so
  // they don't carry a `pricingBlurb` prop. Adding entries here gives
  // the runner page a panel to render via ToolIntroPanel — same UX as
  // the variant-template AI tools.
  "ai-summarize": {
    text: "What you'll get: an executive summary plus per-section bullets, each cited to a source page. Best for reports, papers, and long memos. 3 credits per PDF.",
    related: { id: "ai-tldr", label: "AI · TL;DR Generator" },
  },
  "ai-tldr": {
    text: "What you'll get: a single-paragraph executive summary — fast, cheap, and precise. The cheapest way to triage a long PDF. 2 credits per PDF.",
    related: { id: "ai-summarize", label: "AI · Summarize PDF" },
  },
  "ai-translate": {
    text: "What you'll get: a fully translated PDF with layout preserved — paragraphs, headings, tables, and lists kept intact. 30+ languages. 5 credits per PDF.",
    related: { id: "ai-ocr", label: "AI · PDF OCR" },
  },
  "ai-compare": {
    text: "What you'll get: a side-by-side diff of two PDFs with added / removed / changed text highlighted, plus a plain-language summary of what changed. 6 credits per pair.",
    related: { id: "ai-redact", label: "AI · Redact PDF" },
  },
  "ai-ocr": {
    text: "What you'll get: a searchable, copyable PDF — scanned pages run through OCR with the original layout preserved as an invisible text layer behind the image. 4 credits per PDF.",
    related: { id: "ai-searchable-pdf", label: "AI · Make Searchable" },
  },
  "ai-rewrite": {
    text: "What you'll get: your PDF's text rewritten in the tone you pick (formal / casual / clearer / shorter / academic). Layout preserved. 5 credits per PDF.",
    related: { id: "ai-summarize", label: "AI · Summarize PDF" },
  },
  "ai-table": {
    text: "What you'll get: every table in your PDF extracted as structured CSV / Excel — column headers detected, merged cells normalized, footnote refs stripped. 5 credits per PDF.",
    related: { id: "pdf-to-office", label: "PDF to Excel (free)" },
  },
  "ai-redact": {
    text: "What you'll get: your PDF with names, emails, phone numbers, addresses, IDs, and other PII detected and blacked out. Custom regex patterns supported. 5 credits per PDF.",
    related: { id: "redact-free", label: "Free Redact (manual)" },
  },
  "ai-generate": {
    text: "What you'll get: a brand-new PDF generated from your prompt — pitch decks, contracts, reports, briefs. Cite sources to ground the output. 10 credits per PDF.",
    related: { id: "ai-summarize", label: "AI · Summarize PDF" },
  },
  "ai-sign": {
    text: "What you'll get: an AI-placed signature on the right page in the right field — uploaded signature image fitted, signing date stamped, audit trail logged. 3 credits per signature.",
    related: { id: "sign-pdf-free", label: "Free Sign PDF (manual)" },
  },
  "ai-mindmap": {
    text: "What you'll get: an interactive mind map of your PDF's main ideas — central topic, branches per section, leaf nodes for key points. Exportable as PNG / SVG / Markdown. 6 credits per PDF.",
    related: { id: "ai-study-notes", label: "AI · Study Notes" },
  },
  "ai-blood-test": {
    text: "What you'll get: structured tables of your blood-test results with reference ranges, out-of-range flags, and plain-language explanations of what each marker means. 5 credits per report.",
    related: { id: "ai-summarize", label: "AI · Summarize PDF" },
  },
  "ai-resume-parse": {
    text: "What you'll get: structured JSON of your resume — name, contact, work history, education, skills, certifications. Ready to push into your ATS. 4 credits per resume.",
    related: { id: "ai-ats-resume", label: "AI · ATS Resume Optimizer" },
  },
  "ai-searchable-pdf": {
    text: "What you'll get: a scanned PDF made fully searchable and copyable — OCR text layer added behind the original page images, no visual changes. 4 credits per PDF.",
    related: { id: "ai-ocr", label: "AI · PDF OCR" },
  },
  "ai-semantic-search": {
    text: "What you'll get: search-by-meaning across one or many PDFs — finds concepts even when keywords don't match. Each hit cited to the source page. 5 credits per index build.",
    related: { id: "ai-chat", label: "AI · Chat with PDF" },
  },
  "ai-chat": {
    text: "What you'll get: an interactive chat over your PDF — ask anything in plain English, get answers grounded in the document with page citations. ~5 credits per question.",
    related: { id: "ai-summarize", label: "AI · Summarize PDF" },
  },

  // --------- AI tools previously rendered via SummarizeVariantTool's
  // --------- inline pricingBlurb (Bundle E migration). Moved here so
  // --------- all 95 tools render the panel from the SAME source in
  // --------- the SAME location on the runner page.
  "ai-key-points": {
    text: "Bulleted list only — 6–12 key points with page citations. 3 credits per PDF.",
    related: { id: "ai-summarize", label: "AI · Summarize PDF (with prose sections)" },
  },
  "ai-study-notes": {
    text: "Revision-grade notes — overview, key concepts, detailed sections with takeaways, self-check questions. 8 credits per PDF.",
    related: { id: "ai-key-points", label: "Key Points (quick bullet list)" },
  },
  "ai-eli5": {
    text: "Plain-language explanation — big idea, simple bullets, why it matters. 3 credits per PDF.",
    related: { id: "ai-summarize", label: "AI · Summarize (formal voice)" },
  },
  "ai-faq": {
    text: "6–10 Q&A pairs inferred from the document. Each answer grounded in the source with page citations. Gaps flagged under 'Not covered'. 5 credits per PDF.",
    related: { id: "ai-chat", label: "Chat with PDF (ask your own questions)" },
  },
  "ai-blog": {
    text: "Full blog-post structure — title, lede, 3–5 H2 sections, conclusion. Factual fidelity preserved. 10 credits per PDF.",
    related: { id: "ai-rewrite", label: "AI · Rewrite (tone + voice shifts)" },
  },
  "ai-readability": {
    text: "Flesch-Kincaid grade level + complex-sentence callouts + jargon flags + 3–5 concrete edit suggestions. 3 credits per PDF.",
    related: { id: "ai-rewrite", label: "AI · Rewrite (to actually apply the fixes)" },
  },
  "ai-entities": {
    text: "Four tables — People / Organisations / Places / Dates — with page citations and one-line role notes. 3 credits per PDF.",
    related: { id: "extract-contacts", label: "Extract Contacts (free regex version)" },
  },
  "ai-social-thread": {
    text: "Numbered 5–10 post thread — hook, idea-per-post, takeaway close. ~240 chars each. LinkedIn or X ready. 5 credits per PDF.",
    related: { id: "ai-blog", label: "PDF to Blog Post (long-form)" },
  },
  "ai-condense": {
    text: "Tighter rewrite preserving every fact. ~40–60% of original length. Not a summary — the document itself, shorter. 3 credits per PDF.",
    related: { id: "ai-tldr", label: "TL;DR (one-paragraph summary instead)" },
  },
  "ai-expand": {
    text: "Each bullet becomes a full paragraph with context + examples from the source. No invented facts. ~140–180% of original length. 5 credits per PDF.",
    related: { id: "ai-rewrite", label: "AI · Rewrite (tone shifts + more)" },
  },
  "ai-tone-analyze": {
    text: "Voice + audience + 6–10 style attributes + observations on tells and shifts. Doesn't rewrite — analyses. 3 credits per PDF.",
    related: { id: "ai-readability", label: "Readability Score (grade-level focus)" },
  },
  "ai-citations": {
    text: "BibTeX block + human-readable reference list. Auto-generated citation keys. 5 credits per PDF.",
    related: { id: "ai-entities", label: "Extract Entities (people/orgs/places/dates)" },
  },
  "ai-sentiment": {
    text: "Overall verdict + per-section table with evidence + notable shifts between sections. 3 credits per PDF.",
    related: { id: "ai-tone-analyze", label: "Tone & Style Analyzer (voice + register)" },
  },
  "ai-bias": {
    text: "Gendered language + outdated terminology + stereotyping + accessibility-framing + concrete edit suggestions. 5 credits per PDF.",
    related: { id: "ai-proofread", label: "AI · Proofread (grammar + spelling)" },
  },
  "ai-proofread": {
    text: "Error table — Page / Error / Type / Suggested Fix. Genuine errors only (spelling, grammar, agreement, punctuation). 5 credits per PDF.",
    related: { id: "ai-rewrite", label: "AI · Rewrite (apply the fixes automatically)" },
  },
  "ai-newsletter": {
    text: "Subject line + preheader + 3–5 sections + sign-off. Direct voice, no sales-speak. 8 credits per PDF.",
    related: { id: "ai-blog", label: "PDF to Blog Post (longer form)" },
  },
  "ai-video-script": {
    text: "Opening hook + 3–5 × 90s segments + closing CTA. Bracketed stage cues. 10 credits per PDF.",
    related: { id: "ai-social-thread", label: "PDF to Social Thread (shorter-form distillation)" },
  },
  "ai-ats-resume": {
    text: "ATS score + critical fixes + keyword gaps + format issues + suggested summary. 10 credits per resume.",
    related: { id: "ai-resume-parse", label: "Resume Parser (export to CSV)" },
  },
  "ai-action-items": {
    text: "Markdown table of actionable TODOs — Task / Owner / Due / Priority / Page. Owners and deadlines blank when not in source. 3 credits per PDF.",
    related: { id: "extract-dates", label: "Extract Dates → Calendar (for deadlines)" },
  },
  "ai-syllabus": {
    text: "Topic map + 12-week schedule with practice checkpoints + final-revision strategy. Tuned for TNPSC / UPSC / JEE / NEET / NCERT / university syllabi. 20 credits.",
    related: { id: "ai-study-notes", label: "PDF to Study Notes (per-doc deep notes)" },
  },
  "ai-discharge": {
    text: "Patient + family-friendly version with diagnoses / medications / follow-ups / warning signs in everyday language. 10 credits. Not medical advice.",
    related: { id: "ai-blood-test", label: "Blood Test Report Parser" },
  },
  "ai-cover-letter": {
    text: "300–350 word tailored cover letter with 3-bullet customisation notes so you can swap in alternatives. 5 credits. Paste the JD for a tailored letter; leave blank for a generic-but-strong version.",
  },
  "ai-jd-match": {
    text: "Fit score 0–100 + per-requirement alignment table + strengths + gaps + missing-keywords (ATS blockers) + concrete next steps. 5 credits per resume.",
  },
  "ai-nda": {
    text: "Parties + type + risk flags (severity-rated) + negotiation points + missing standard clauses. Common red flags surfaced — embedded non-competes, indefinite terms, IP assignment in NDAs. 15 credits. Not legal advice.",
    related: { id: "ai-employment", label: "Employment Contract Review" },
  },
  "ai-employment": {
    text: "Compensation + term + termination + risk flags (non-compete, IP assignment, training bond) + missing protections + negotiation points. 20 credits. Not legal advice.",
    related: { id: "ai-nda", label: "NDA Analyzer" },
  },
  "ai-salary-slip": {
    text: "Structured JSON with employer / employee / period / earnings / deductions / totals / YTD. Preserves idiosyncratic component names (Special Allowance, LTA, etc.) for accurate YoY comparison. 10 credits.",
  },
  "ai-research-paper": {
    text: "APA citation + BibTeX + research question + methods + key results (with magnitudes preserved) + limitations (acknowledged + implied) + cite-this examples + related reading. 15 credits.",
    related: { id: "ai-citations", label: "Extract Citations" },
  },
  "ai-insurance": {
    text: "Coverage + premiums + exclusions + waiting periods + claim process + renewal/portability + risk flags (room-rent capping, sub-limits, missing day-care list, restoration absent). 20 credits. Not insurance advice.",
    related: { id: "ai-blood-test", label: "Blood Test Analyzer" },
  },
  "ai-loan-bundle": {
    text: "Detects loan type + audits docs against typical lender checklist (PAN, Aadhaar, salary slips, bank statements, ITR/Form 16, property docs, etc.) + flags missing items + income snapshot + eligibility-affecting issues. 15 credits. Not pre-approval.",
    related: { id: "ai-table", label: "AI Table Extract" },
  },
  "ai-partnership-deed": {
    text: "Partners table + capital + profit/loss share + decision-making + admission/retirement rules + risk flags + missing standard clauses (arbitration, IP/goodwill, succession). 20 credits.",
    related: { id: "ai-employment", label: "Employment Contract Review" },
  },
  "ai-improve-writing": {
    text: "Rewrites for clarity + concision (~20-30% shorter) without changing facts, register, or claims. Edit-summary surfaces the kinds of changes made (passive→active, redundant qualifiers cut, etc.). 5 credits.",
    related: { id: "ai-paraphrase", label: "Paraphrase" },
  },
  "ai-paraphrase": {
    text: "Re-words preserving every claim + number + conclusion. Same length as input. Technical terms preserved when no plainer synonym would be accurate. NOT a substitute for citation. 5 credits.",
    related: { id: "ai-improve-writing", label: "Improve Writing" },
  },
  "ai-detector": {
    text: "Heuristic AI-content detector — surfaces well-documented LLM stylistic fingerprints (formulaic openers, hedging overuse, em-dash patterns, register-too-polished, three-item rhetoric, transitional clichés). 10 credits. Honest caveat: heuristic only, not a courtroom-grade classifier. False positives + negatives possible.",
    related: { id: "ai-improve-writing", label: "Improve Writing" },
  },
  "ai-chart-to-table": {
    text: "Reads charts visually (bar / line / pie / scatter / stacked), extracts data points faithfully with axis labels and units. For values it can't read precisely, returns a range with confidence note. 5 credits.",
    related: { id: "ai-table", label: "AI Table Extract" },
  },
  "ai-flashcards": {
    text: "10–30 Q&A cards grounded in the source, with page refs. Anki-compatible CSV export (front,back). 10 credits per PDF.",
    related: { id: "ai-quiz", label: "PDF to Quiz (MCQ format)" },
  },
  "ai-quiz": {
    text: "6–12 MCQs with 4 plausible options, correct answer, and one-line explanation with page ref. JSON export. 10 credits per PDF.",
    related: { id: "ai-flashcards", label: "PDF to Flashcards (Q&A format)" },
  },

  // --------- 5 free tools previously missing from TOOL_INTROS ---------
  "extract-contacts": {
    text: "What you'll get: every email address, phone number, and URL pulled from your PDF as text or vCard / CSV export. Regex-based, runs entirely in your browser.",
    related: { id: "ai-entities", label: "AI · Extract Entities (names, orgs, dates too)" },
  },
  "extract-dates": {
    text: "What you'll get: every date detected in your PDF, exported as an .ics calendar file you can drop straight into Google Calendar / Outlook / Apple Calendar.",
    related: { id: "ai-action-items", label: "AI · Action Items (with deadlines)" },
  },
  "free-draw-pdf": {
    text: "What you'll get: any PDF page marked up with freehand pen strokes — 5 colors, adjustable stroke width. Useful for review notes and informal annotation.",
    related: { id: "highlight-pdf", label: "Highlight PDF" },
  },
};
