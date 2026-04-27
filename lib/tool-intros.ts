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
  // --------- Top head-term free tools (Wave 9 pdf-lib writable) ---------
  // 2026-04-27 Wave 9: merge / split / rotate / unlock now point to
  // each other (or to PDFium siblings that exist in lib/tools.ts).
  // Earlier placeholders pointed to IDs that were nuked — those
  // would render as dead cross-promo links.
  merge: {
    text: "What you'll get: a single combined PDF in the exact order you set, runs entirely in your browser via pdf-lib.",
    related: { id: "split", label: "Split PDF" },
  },
  split: {
    text: "What you'll get: a multi-page PDF split into separate files via a visual thumbnail picker — click between pages to mark split points, see a live segment preview, and download each section.",
    related: { id: "merge", label: "Merge PDFs" },
  },
  rotate: {
    text: "What you'll get: a PDF with the pages you click rotated 90°/180°/270° — visual thumbnail picker, lossless via pdf-lib, runs entirely in your browser.",
    related: { id: "pdf-inspector", label: "PDF Inspector" },
  },
  unlock: {
    text: "What you'll get: a copy of your PDF without owner restrictions (no-print, no-copy, no-edit) — for files that don't require a password to open.",
    related: { id: "pdf-inspector", label: "PDF Inspector" },
  },

  // Tier 2 — Extract / Delete Pages share the PageGridTool base.
  "extract-pages": {
    text: "What you'll get: a brand-new PDF containing only the pages you click — visual thumbnail grid, no text-range typing, runs entirely in your browser via pdf-lib.",
    related: { id: "delete-pages", label: "Delete Pages" },
  },
  "delete-pages": {
    text: "What you'll get: a trimmed PDF with the pages you click removed — visual thumbnail grid with dimmed previews of pages marked for removal, lossless save.",
    related: { id: "extract-pages", label: "Extract Pages" },
  },
  "sort-pages": {
    text: "What you'll get: a PDF with pages in the order you arrange them — drag-and-drop thumbnails to reorder, with one-click Reverse and Reset bulk actions.",
    related: { id: "extract-pages", label: "Extract Pages" },
  },

  // --------- Common utility free tools ---------
  "free-draw": {
    text: "What you'll get: free-hand pen annotations over any PDF page in 5 colors and adjustable widths. Useful for casual markup and quick reviews.",
    related: { id: "highlight-pdf", label: "Highlight PDF" },
  },
  "html-to-pdf": {
    text: "What you'll get: any HTML file or pasted HTML rendered to a styled PDF, with CSS preserved.",
    related: { id: "markdown-to-pdf", label: "Markdown to PDF" },
  },
  "word-count": {
    text: "What you'll get: word, character, and sentence count for any PDF. Useful for translation cost estimates and academic submission limits.",
    related: { id: "pdf-inspector", label: "PDF Inspector" },
  },

  // --------- Inspector P3 split (2026-04-27) ---------
  // Page Counter and PDF Inspector are siblings — same PDFium parse,
  // different surfaces. Each intro cross-links to the other so users
  // can upgrade or downgrade the level of detail mid-session without
  // backtracking to /tools.
  // Build 2 Wave 6 (2026-04-27): tightened all PDFium intros to a
  // strict 1-sentence output description. Use cases / personas /
  // marketing prose belong in the longform "Why people use" section
  // — having both the intro AND the longform say similar things at
  // length read as duplicate. Now: intro = WHAT (output), longform
  // = WHO/WHY (personas).
  "page-count": {
    text: "What you'll get: the exact page count for any PDF, copyable in one click.",
    related: { id: "pdf-inspector", label: "PDF Inspector" },
  },
  "pdf-inspector": {
    text: "What you'll get: pages, dimensions, word count, reading time, metadata, and mixed-size warnings — one parse, every stat.",
    related: { id: "page-count", label: "Page Count" },
  },

  // Build 2 — text-export trio.
  "pdf-to-text": {
    text: "What you'll get: a plain .txt file with every word from your PDF in reading order.",
    related: { id: "pdf-to-markdown", label: "PDF to Markdown" },
  },
  "pdf-to-markdown": {
    text: "What you'll get: a .md file with each page as an H2 section, paragraphs reflowed.",
    related: { id: "pdf-to-html", label: "PDF to HTML" },
  },
  "pdf-to-html": {
    text: "What you'll get: a portable .html file with structural <h2>/<p> tags, UTF-8, no external CSS.",
    related: { id: "pdf-to-text", label: "PDF to Text" },
  },

  // Build 2 Wave 2 — rasterizers.
  "pdf-to-jpg": {
    text: "What you'll get: each PDF page as a JPG image at 1×/2×/3× resolution. Multi-page → zip.",
    related: { id: "pdf-to-png", label: "PDF to PNG" },
  },
  "pdf-to-png": {
    text: "What you'll get: each PDF page as a lossless PNG at 1×/2×/3× resolution. Multi-page → zip.",
    related: { id: "pdf-to-jpg", label: "PDF to JPG" },
  },

  // Build 2 Wave 3.
  "pdf-search": {
    text: "What you'll get: every match of your query across the PDF, with surrounding context and page refs.",
    related: { id: "pdf-inspector", label: "PDF Inspector" },
  },
  "extract-images": {
    text: "What you'll get: every embedded image as a PNG at original resolution. Multi-image → zip.",
    related: { id: "pdf-to-png", label: "PDF to PNG" },
  },

  // Build 2 Wave 4.
  "pdf-outline": {
    text: "What you'll get: the bookmark tree of the PDF with page numbers per entry.",
    related: { id: "pdf-inspector", label: "PDF Inspector" },
  },
  "pdf-forms": {
    text: "What you'll get: a table of every AcroForm field — name, type, value, flags. CSV / JSON export.",
    related: { id: "pdf-attachments", label: "PDF Attachments" },
  },
  "pdf-attachments": {
    text: "What you'll get: a list of every embedded file — filename, MIME, size, description.",
    related: { id: "pdf-forms", label: "PDF Form Inspector" },
  },
  "pdf-fonts": {
    text: "What you'll get: every font in the PDF, flagged embedded vs not, with the pages each appears on.",
    related: { id: "pdf-inspector", label: "PDF Inspector" },
  },

  // Build 2 Wave 8.
  "pdf-links": {
    text: "What you'll get: every hyperlink in the PDF, with page references and external/internal classification. CSV / JSON export.",
    related: { id: "pdf-annotations", label: "PDF Annotations" },
  },
  "pdf-annotations": {
    text: "What you'll get: every comment, highlight, sticky note in the PDF — author, date, color, content, page. CSV / JSON export.",
    related: { id: "pdf-links", label: "Extract Links" },
  },
  "pdf-javascript": {
    text: "What you'll get: every JavaScript handler in the PDF, with trigger, location, code preview, and severity classification.",
    related: { id: "pdf-a-check", label: "PDF/A Check" },
  },
  "pdf-accessibility": {
    text: "What you'll get: a 0–100 accessibility score plus per-check pass/fail for tagged PDF, structure tree, language, alt text.",
    related: { id: "pdf-a-check", label: "PDF/A Check" },
  },
  "pdf-a-check": {
    text: "What you'll get: a PDF/A compliance verdict — declared level, per-requirement pass/fail, and what we couldn't verify.",
    related: { id: "pdf-x-check", label: "PDF/X Check" },
  },
  "pdf-x-check": {
    text: "What you'll get: a PDF/X compliance verdict — declared version, per-requirement pass/fail, and what we couldn't verify.",
    related: { id: "pdf-a-check", label: "PDF/A Check" },
  },

  // --------- AI tools with dedicated runners (no SummarizeVariantTool) ---------
  // These tools each ship their own component (SummarizePdfTool,
  // TranslatePdfTool, etc.) instead of using SummarizeVariantTool, so
  // they don't carry a `pricingBlurb` prop. Adding entries here gives
  // the runner page a panel to render via ToolIntroPanel — same UX as
  // the variant-template AI tools.
  "ai-summarize": {
    text: "What you'll get: an executive summary plus per-section bullets, each cited to a source page. Best for reports, papers, and long memos.",
    related: { id: "ai-tldr", label: "AI · TL;DR Generator" },
  },
  "ai-tldr": {
    text: "What you'll get: a single-paragraph executive summary — fast, cheap, and precise. The cheapest way to triage a long PDF.",
    related: { id: "ai-summarize", label: "AI · Summarize PDF" },
  },
  "ai-translate": {
    text: "What you'll get: a fully translated PDF with layout preserved — paragraphs, headings, tables, and lists kept intact. 30+ languages.",
    related: { id: "ai-ocr", label: "AI · PDF OCR" },
  },
  "ai-compare": {
    text: "What you'll get: a side-by-side diff of two PDFs with added / removed / changed text highlighted, plus a plain-language summary of what changed.",
    related: { id: "ai-redact", label: "AI · Redact PDF" },
  },
  "ai-ocr": {
    text: "What you'll get: a searchable, copyable PDF — scanned pages run through OCR with the original layout preserved as an invisible text layer behind the image.",
    related: { id: "ai-searchable-pdf", label: "AI · Make Searchable" },
  },
  "ai-rewrite": {
    text: "What you'll get: your PDF's text rewritten in the tone you pick (formal / casual / clearer / shorter / academic). Layout preserved.",
    related: { id: "ai-summarize", label: "AI · Summarize PDF" },
  },
  "ai-table": {
    text: "What you'll get: every table in your PDF extracted as structured CSV / Excel — column headers detected, merged cells normalized, footnote refs stripped.",
    related: { id: "pdf-to-office", label: "PDF to Excel (free)" },
  },
  "ai-redact": {
    text: "What you'll get: your PDF with names, emails, phone numbers, addresses, IDs, and other PII detected and blacked out. Custom regex patterns supported.",
    related: { id: "redact-free", label: "Free Redact (manual)" },
  },
  "ai-generate": {
    text: "What you'll get: a brand-new PDF generated from your prompt — pitch decks, contracts, reports, briefs. Cite sources to ground the output.",
    related: { id: "ai-summarize", label: "AI · Summarize PDF" },
  },
  "ai-sign": {
    text: "What you'll get: an AI-placed signature on the right page in the right field — uploaded signature image fitted, signing date stamped, audit trail logged.",
    related: { id: "sign-pdf-free", label: "Free Sign PDF (manual)" },
  },
  "ai-mindmap": {
    text: "What you'll get: an interactive mind map of your PDF's main ideas — central topic, branches per section, leaf nodes for key points. Exportable as PNG / SVG / Markdown.",
    related: { id: "ai-study-notes", label: "AI · Study Notes" },
  },
  "ai-blood-test": {
    text: "What you'll get: structured tables of your blood-test results with reference ranges, out-of-range flags, and plain-language explanations of what each marker means.",
    related: { id: "ai-summarize", label: "AI · Summarize PDF" },
  },
  "ai-resume-parse": {
    text: "What you'll get: structured JSON of your resume — name, contact, work history, education, skills, certifications. Ready to push into your ATS.",
    related: { id: "ai-ats-resume", label: "AI · ATS Resume Optimizer" },
  },
  "ai-searchable-pdf": {
    text: "What you'll get: a scanned PDF made fully searchable and copyable — OCR text layer added behind the original page images, no visual changes.",
    related: { id: "ai-ocr", label: "AI · PDF OCR" },
  },
  "ai-semantic-search": {
    text: "What you'll get: search-by-meaning across one or many PDFs — finds concepts even when keywords don't match. Each hit cited to the source page.",
    related: { id: "ai-chat", label: "AI · Chat with PDF" },
  },
  "ai-chat": {
    text: "What you'll get: an interactive chat over your PDF — ask anything in plain English, get answers grounded in the document with page citations.",
    related: { id: "ai-summarize", label: "AI · Summarize PDF" },
  },

  // --------- AI tools previously rendered via SummarizeVariantTool's
  // --------- inline pricingBlurb (Bundle E migration). Moved here so
  // --------- all 95 tools render the panel from the SAME source in
  // --------- the SAME location on the runner page.
  "ai-key-points": {
    text: "What you'll get: a bulleted list of 6–12 key points from your PDF, each cited by page.",
    related: { id: "ai-summarize", label: "AI · Summarize PDF (with prose sections)" },
  },
  "ai-study-notes": {
    text: "What you'll get: revision-grade study notes with an overview, key concepts, detailed sections with takeaways, and self-check questions.",
    related: { id: "ai-key-points", label: "AI · Key Points (quick bullet list)" },
  },
  "ai-eli5": {
    text: "What you'll get: a plain-language explanation — big idea, simple bullets, and why it matters. Written for a 12-year-old.",
    related: { id: "ai-summarize", label: "AI · Summarize (formal voice)" },
  },
  "ai-faq": {
    text: "What you'll get: 6–10 Q&A pairs inferred from your document, each answer grounded in the source with page citations. Gaps flagged under 'Not covered'.",
    related: { id: "ai-chat", label: "AI · Chat with PDF (ask your own questions)" },
  },
  "ai-blog": {
    text: "What you'll get: a publish-ready blog post — title, lede, 3–5 H2 sections, conclusion. Factual fidelity preserved.",
    related: { id: "ai-rewrite", label: "AI · Rewrite (tone + voice shifts)" },
  },
  "ai-readability": {
    text: "What you'll get: a Flesch-Kincaid grade level + complex-sentence callouts + jargon flags + 3–5 concrete edit suggestions.",
    related: { id: "ai-rewrite", label: "AI · Rewrite (to actually apply the fixes)" },
  },
  "ai-entities": {
    text: "What you'll get: four tables — People / Organisations / Places / Dates — with page citations and one-line role notes.",
    related: { id: "extract-contacts", label: "Extract Contacts (free regex version)" },
  },
  "ai-social-thread": {
    text: "What you'll get: a numbered 5–10 post thread — hook, one idea per post, takeaway close. ~240 chars each, LinkedIn or X ready.",
    related: { id: "ai-blog", label: "AI · PDF to Blog Post (long-form)" },
  },
  "ai-condense": {
    text: "What you'll get: a tighter rewrite preserving every fact, ~40–60% of original length. Not a summary — the document itself, shorter.",
    related: { id: "ai-tldr", label: "AI · TL;DR (one-paragraph summary instead)" },
  },
  "ai-expand": {
    text: "What you'll get: each bullet expanded into a full paragraph with context and examples from the source. No invented facts. ~140–180% of original length.",
    related: { id: "ai-rewrite", label: "AI · Rewrite (tone shifts + more)" },
  },
  "ai-tone-analyze": {
    text: "What you'll get: a voice + audience + 6–10 style attributes report with observations on tells and shifts. Analyses only — doesn't rewrite.",
    related: { id: "ai-readability", label: "AI · Readability Score (grade-level focus)" },
  },
  "ai-citations": {
    text: "What you'll get: a BibTeX block + human-readable reference list with auto-generated citation keys.",
    related: { id: "ai-entities", label: "AI · Extract Entities (people/orgs/places/dates)" },
  },
  "ai-sentiment": {
    text: "What you'll get: an overall sentiment verdict + per-section table with evidence + notable shifts between sections.",
    related: { id: "ai-tone-analyze", label: "AI · Tone & Style Analyzer (voice + register)" },
  },
  "ai-bias": {
    text: "What you'll get: a bias audit covering gendered language, outdated terminology, stereotyping, and accessibility-framing — plus concrete edit suggestions.",
    related: { id: "ai-proofread", label: "AI · Proofread (grammar + spelling)" },
  },
  "ai-proofread": {
    text: "What you'll get: an error table — Page / Error / Type / Suggested Fix. Genuine errors only (spelling, grammar, agreement, punctuation).",
    related: { id: "ai-rewrite", label: "AI · Rewrite (apply the fixes automatically)" },
  },
  "ai-newsletter": {
    text: "What you'll get: a complete newsletter — subject line, preheader, 3–5 sections, and sign-off. Direct voice, no sales-speak.",
    related: { id: "ai-blog", label: "AI · PDF to Blog Post (longer form)" },
  },
  "ai-video-script": {
    text: "What you'll get: a video script — opening hook + 3–5 × 90-second segments + closing CTA, with bracketed stage cues.",
    related: { id: "ai-social-thread", label: "AI · PDF to Social Thread (shorter-form distillation)" },
  },
  "ai-ats-resume": {
    text: "What you'll get: an ATS score with critical fixes, keyword gaps, format issues, and a suggested summary line.",
    related: { id: "ai-resume-parse", label: "AI · Resume Parser (export to CSV)" },
  },
  "ai-action-items": {
    text: "What you'll get: a markdown table of actionable TODOs — Task / Owner / Due / Priority / Page. Owners and deadlines blank when not in the source.",
    related: { id: "extract-dates", label: "Extract Dates → Calendar (for deadlines)" },
  },
  "ai-syllabus": {
    text: "What you'll get: a topic map + 12-week schedule with practice checkpoints + a final-revision strategy. Tuned for TNPSC / UPSC / JEE / NEET / NCERT / university syllabi.",
    related: { id: "ai-study-notes", label: "AI · PDF to Study Notes (per-doc deep notes)" },
  },
  "ai-discharge": {
    text: "What you'll get: a patient + family-friendly version of your discharge summary with diagnoses, medications, follow-ups, and warning signs in everyday language. Not medical advice.",
    related: { id: "ai-blood-test", label: "AI · Blood Test Report Parser" },
  },
  "ai-cover-letter": {
    text: "What you'll get: a 300–350 word tailored cover letter with 3 customisation notes so you can swap in alternatives. Paste the JD for a tailored letter; leave blank for a generic-but-strong version.",
  },
  "ai-jd-match": {
    text: "What you'll get: a fit score (0–100) + per-requirement alignment table + strengths + gaps + missing keywords (ATS blockers) + concrete next steps.",
  },
  "ai-nda": {
    text: "What you'll get: a parties + type + risk-flag (severity-rated) report with negotiation points and missing standard clauses. Common red flags surfaced — embedded non-competes, indefinite terms, IP assignment. Not legal advice.",
    related: { id: "ai-employment", label: "AI · Employment Contract Review" },
  },
  "ai-employment": {
    text: "What you'll get: a compensation + term + termination + risk-flag (non-compete, IP assignment, training bond) report with missing protections and negotiation points. Not legal advice.",
    related: { id: "ai-nda", label: "AI · NDA Analyzer" },
  },
  "ai-salary-slip": {
    text: "What you'll get: structured JSON with employer / employee / period / earnings / deductions / totals / YTD. Preserves idiosyncratic component names (Special Allowance, LTA, etc.) for accurate YoY comparison.",
  },
  "ai-research-paper": {
    text: "What you'll get: APA citation + BibTeX + research question + methods + key results (with magnitudes preserved) + limitations (acknowledged + implied) + cite-this examples + related reading.",
    related: { id: "ai-citations", label: "AI · Extract Citations" },
  },
  "ai-insurance": {
    text: "What you'll get: a coverage + premiums + exclusions + waiting periods + claim process + renewal/portability report with risk flags (room-rent capping, sub-limits, missing day-care list, restoration absent). Not insurance advice.",
    related: { id: "ai-blood-test", label: "AI · Blood Test Analyzer" },
  },
  "ai-loan-bundle": {
    text: "What you'll get: an audit of your loan-application bundle against a typical lender checklist (ID proofs, salary slips, bank statements, ITRs, property docs) + missing-item flags + income snapshot + eligibility-affecting issues. Not pre-approval.",
    related: { id: "ai-table", label: "AI · Table Extract" },
  },
  "ai-partnership-deed": {
    text: "What you'll get: a partners table + capital + profit/loss share + decision-making + admission/retirement rules + risk flags + missing standard clauses (arbitration, IP/goodwill, succession). Not legal advice.",
    related: { id: "ai-employment", label: "AI · Employment Contract Review" },
  },
  "ai-improve-writing": {
    text: "What you'll get: a rewrite for clarity and concision (~20–30% shorter) without changing facts, register, or claims. Edit summary surfaces the kinds of changes made (passive→active, redundant qualifiers cut, etc.).",
    related: { id: "ai-paraphrase", label: "AI · Paraphrase" },
  },
  "ai-paraphrase": {
    text: "What you'll get: a re-wording that preserves every claim, number, and conclusion. Same length as input. Technical terms preserved when no plainer synonym would be accurate. Not a substitute for citation.",
    related: { id: "ai-improve-writing", label: "AI · Improve Writing" },
  },
  "ai-detector": {
    text: "What you'll get: a heuristic AI-content audit — surfaces well-documented LLM stylistic fingerprints (formulaic openers, hedging overuse, em-dash patterns, register-too-polished, three-item rhetoric, transitional clichés). Honest caveat: heuristic only, not a courtroom-grade classifier — false positives and negatives possible.",
    related: { id: "ai-improve-writing", label: "AI · Improve Writing" },
  },
  "ai-chart-to-table": {
    text: "What you'll get: chart data points extracted from any visual chart type (bar / line / pie / scatter / stacked), with axis labels and units preserved. For values it can't read precisely, returns a range with a confidence note.",
    related: { id: "ai-table", label: "AI · Table Extract" },
  },
  "ai-flashcards": {
    text: "What you'll get: 10–30 Q&A flashcards grounded in your PDF, with page refs. Anki-compatible CSV export (front,back).",
    related: { id: "ai-quiz", label: "AI · PDF to Quiz (MCQ format)" },
  },
  "ai-quiz": {
    text: "What you'll get: 6–12 multiple-choice questions with 4 plausible options each, correct answer, and a one-line explanation with page ref. JSON export.",
    related: { id: "ai-flashcards", label: "AI · PDF to Flashcards (Q&A format)" },
  },

  // --------- 5 free tools previously missing from TOOL_INTROS ---------
};
