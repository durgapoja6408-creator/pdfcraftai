// Canonical tool registry. Ported from the prototype shell.jsx.
// Each tool's `icon` is a key into components/icons/Icons.tsx (the `I` object).

import type { IconName } from "@/components/icons/Icons";

export type ToolGroup = "AI" | "Organize" | "Convert" | "Optimize" | "Edit" | "Security";

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
  // ----- Free -----
  { id: "merge", name: "Merge PDFs", desc: "Combine multiple PDFs into a single document.", icon: "Merge", free: true, group: "Organize" },
  { id: "split", name: "Split PDF", desc: "Separate pages into independent files.", icon: "Split", free: true, group: "Organize" },
  { id: "compress", name: "Compress PDF", desc: "Shrink file size without losing quality.", icon: "Compress", free: true, group: "Optimize" },
  { id: "pdf-to-office", name: "PDF to Word/Excel/PPT", desc: "Convert PDFs into editable Office files.", icon: "Convert", free: true, group: "Convert" },
  { id: "to-pdf", name: "Word/Image to PDF", desc: "Turn any file into a polished PDF.", icon: "Image", free: true, group: "Convert" },
  { id: "rotate", name: "Rotate & Reorder", desc: "Fix orientation and rearrange pages.", icon: "Rotate", free: true, group: "Organize" },
  { id: "extract-pages", name: "Extract Pages", desc: "Pick specific pages into a new PDF.", icon: "Pages", free: true, group: "Organize" },
  { id: "delete-pages", name: "Delete Pages", desc: "Remove pages from a PDF.", icon: "Pages", free: true, group: "Organize" },
  { id: "pdf-to-jpg", name: "PDF to JPG/PNG", desc: "Export every page as a high-res image.", icon: "Image", free: true, group: "Convert" },
  { id: "extract-images", name: "Extract Images", desc: "Pull every embedded image out of a PDF.", icon: "Image", free: true, group: "Convert" },
  { id: "page-count", name: "Page & Word Count", desc: "Instant stats for any PDF.", icon: "Pages", free: true, group: "Edit" },
  { id: "pdf-metadata", name: "PDF Metadata Editor", desc: "Read, edit, or strip title / author / subject.", icon: "Edit", free: true, group: "Edit" },
  { id: "flatten-pdf", name: "Flatten PDF", desc: "Bake forms + annotations into static content.", icon: "Shield", free: true, group: "Optimize" },
  { id: "crop-pdf", name: "Crop PDF", desc: "Trim margins from every page.", icon: "Edit", free: true, group: "Edit" },
  { id: "fill-forms", name: "Fill PDF Forms", desc: "Fill AcroForm fields and save the PDF.", icon: "Pen", free: true, group: "Edit" },
  { id: "pdf-to-text", name: "PDF to Text", desc: "Extract every page's text as a plain .txt file.", icon: "Convert", free: true, group: "Convert" },
  { id: "resize-pdf", name: "Resize Pages", desc: "Change page size to A4, Letter, Legal, A3, A5, or Tabloid.", icon: "Pages", free: true, group: "Edit" },
  { id: "remove-metadata", name: "Remove Metadata", desc: "Scrub title, author, creator, and XMP data before sharing.", icon: "Shield", free: true, group: "Security" },
  { id: "image-watermark", name: "Add Logo or Image Watermark", desc: "Stamp a PNG/JPEG logo onto every page. Position, scale, opacity.", icon: "Image", free: true, group: "Edit" },
  { id: "add-text-box", name: "Add Text Box", desc: "Click anywhere on a PDF page to add a text box. Multi-page support.", icon: "Pen", free: true, group: "Edit" },
  { id: "highlight-pdf", name: "Highlight PDF", desc: "Drag to highlight any region. Yellow, green, pink, blue, or orange.", icon: "Edit", free: true, group: "Edit" },
  { id: "redact-free", name: "Redact PDF (free)", desc: "Black-out sensitive regions by dragging. Visual redaction for everyday sharing.", icon: "Shield", free: true, group: "Security" },
  { id: "extract-attachments", name: "Extract Attachments", desc: "List and download files embedded inside a PDF.", icon: "File", free: true, group: "Convert" },
  { id: "invoice-generator", name: "GST Invoice Generator", desc: "Generate a clean GST-compliant invoice PDF from a form. INR/USD/EUR/GBP.", icon: "Receipt", free: true, group: "Convert" },
  { id: "edit-pdf", name: "Edit PDF (Text)", desc: "Click any text on a page to replace it. Preserves font and position.", icon: "Edit", free: true, group: "Edit" },
  { id: "sign-pdf-free", name: "Sign PDF (free)", desc: "Draw, type, or upload your signature and place it on any page.", icon: "Pen", free: true, group: "Security" },
  { id: "repair-pdf", name: "Repair PDF", desc: "Fix broken xref, rebuild page tree, and recompress streams.", icon: "Shield", free: true, group: "Optimize" },
  { id: "markdown-to-pdf", name: "Markdown to PDF", desc: "Turn .md notes into a polished A4 PDF with headings, lists, and code blocks.", icon: "Convert", free: true, group: "Convert" },
  { id: "text-to-pdf", name: "Text to PDF", desc: "Paste or upload plain text and download a clean PDF. Font, size, margins are yours.", icon: "Convert", free: true, group: "Convert" },
  { id: "pdf-to-markdown", name: "PDF to Markdown", desc: "Heuristic conversion — detects headings by font size, preserves bold.", icon: "Convert", free: true, group: "Convert" },
  { id: "pdf-to-html", name: "PDF to HTML", desc: "Self-contained .html file with inline CSS. Heuristic heading detection.", icon: "Convert", free: true, group: "Convert" },
  { id: "extract-form-data", name: "Extract Form Data", desc: "Pull AcroForm field values as CSV or JSON.", icon: "Pages", free: true, group: "Edit" },
  { id: "sort-pages", name: "Sort Pages", desc: "Drag thumbnails to reorder a PDF's pages visually.", icon: "Pages", free: true, group: "Organize" },
  { id: "extract-contacts", name: "Extract Emails, Phones, URLs", desc: "Regex-based extraction of contact info from text PDFs. CSV and vCard export.", icon: "Search", free: true, group: "Convert" },
  { id: "extract-dates", name: "Extract Dates → Calendar", desc: "Find every date in a PDF and download as an .ics calendar file.", icon: "Clock", free: true, group: "Convert" },
  { id: "page-numbers", name: "Page Numbers & Watermark", desc: "Add headers, footers, and watermarks.", icon: "Pages", free: true, group: "Edit" },
  { id: "protect", name: "Unlock / Protect PDF", desc: "Add or remove passwords and permissions.", icon: "Lock", free: true, group: "Security" },

  // ----- AI -----
  { id: "ai-chat", name: "Chat with PDF", desc: "Ask questions. Get answers cited to pages.", icon: "Chat", free: false, cost: "~5 credits / Q", group: "AI" },
  { id: "ai-summarize", name: "Summarize PDF", desc: "Executive summary + section bullets.", icon: "Summary", free: false, cost: "3 credits / doc", group: "AI" },
  { id: "ai-tldr", name: "TL;DR Generator", desc: "One-paragraph executive summary. Fast, cheap, precise.", icon: "Summary", free: false, cost: "2 credits / doc", group: "AI" },
  { id: "ai-key-points", name: "Key Points Extractor", desc: "Bulleted list of a PDF's core insights, each cited by page.", icon: "Summary", free: false, cost: "3 credits / doc", group: "AI" },
  { id: "ai-study-notes", name: "PDF to Study Notes", desc: "Revision-grade notes: overview, concepts, detailed sections, self-check questions.", icon: "Book", free: false, cost: "8 credits / doc", group: "AI" },
  { id: "ai-eli5", name: "Explain Like I'm 12", desc: "Plain-language explanation of any PDF. Short sentences, everyday words.", icon: "Chat", free: false, cost: "3 credits / doc", group: "AI" },
  { id: "ai-faq", name: "Generate FAQ", desc: "Auto-generate 6–10 Q&A pairs a reader would ask. Answers grounded in the doc.", icon: "Help", free: false, cost: "5 credits / doc", group: "AI" },
  { id: "ai-blog", name: "PDF to Blog Post", desc: "Turn a PDF into a publish-ready blog post — hook, sections, conclusion.", icon: "Edit", free: false, cost: "10 credits / doc", group: "AI" },
  { id: "ai-readability", name: "Readability Score", desc: "Flesch-Kincaid grade + complex-sentence callouts + jargon flags + fixes.", icon: "Compare", free: false, cost: "3 credits / doc", group: "AI" },
  { id: "ai-entities", name: "Extract Entities", desc: "People / organisations / places / dates — four tables with page cites.", icon: "Search", free: false, cost: "3 credits / doc", group: "AI" },
  { id: "ai-social-thread", name: "PDF to Social Thread", desc: "5–10 post X/LinkedIn thread. Hook, ideas, takeaway close.", icon: "Chat", free: false, cost: "5 credits / doc", group: "AI" },
  { id: "ai-condense", name: "Condense PDF", desc: "Tighter rewrite of the document itself — keep every fact, cut 40–60% of the length.", icon: "Edit", free: false, cost: "3 credits / doc", group: "AI" },
  { id: "ai-expand", name: "Expand PDF", desc: "Elaborate every bullet into a full paragraph with source-grounded context.", icon: "Edit", free: false, cost: "5 credits / doc", group: "AI" },
  { id: "ai-tone-analyze", name: "Tone & Style Analyzer", desc: "Voice + audience + 6–10 style attributes + observations. Doesn't rewrite.", icon: "Compare", free: false, cost: "3 credits / doc", group: "AI" },
  { id: "ai-citations", name: "Extract Citations (BibTeX)", desc: "References as a BibTeX block + readable reference list.", icon: "Book", free: false, cost: "5 credits / doc", group: "AI" },
  { id: "ai-financials", name: "Extract Financial Numbers", desc: "Metric / Value / Unit / Period / Page table — INR crore + USD million + ratios.", icon: "Coin", free: false, cost: "5 credits / doc", group: "AI" },
  { id: "ai-sentiment", name: "Sentiment Analysis", desc: "Overall + per-section sentiment verdict with evidence and shifts.", icon: "Compare", free: false, cost: "3 credits / doc", group: "AI" },
  { id: "ai-bias", name: "Inclusive Language Audit", desc: "Gendered language + outdated terminology + stereotyping flagged with fixes.", icon: "Shield", free: false, cost: "5 credits / doc", group: "AI" },
  { id: "ai-proofread", name: "Proofread PDF", desc: "Error table — page, quote, type, suggested fix. Spelling + grammar + agreement.", icon: "Edit", free: false, cost: "5 credits / doc", group: "AI" },
  { id: "ai-newsletter", name: "PDF to Email Newsletter", desc: "Subject + preheader + sections + sign-off. Publish-ready draft.", icon: "Send", free: false, cost: "8 credits / doc", group: "AI" },
  { id: "ai-video-script", name: "PDF to Video Script", desc: "Talking-head script with 90s segments, hook, stage cues, closing CTA.", icon: "Play", free: false, cost: "10 credits / doc", group: "AI" },
  { id: "ai-flashcards", name: "PDF to Flashcards", desc: "10–30 Anki-compatible Q&A cards, downloadable CSV.", icon: "Book", free: false, cost: "10 credits / doc", group: "AI" },
  { id: "ai-quiz", name: "PDF to Quiz (MCQ)", desc: "6–12 multiple-choice questions with 4 options, answer key, and explanations.", icon: "Help", free: false, cost: "10 credits / doc", group: "AI" },
  { id: "ai-mindmap", name: "PDF to Mind Map", desc: "Hierarchical outline of a PDF — 4–8 branches, 3 levels deep. Text + JSON export.", icon: "Flow", free: false, cost: "10 credits / doc", group: "AI" },
  { id: "ai-semantic-search", name: "Semantic Search in PDF", desc: "Ask in natural language, get verbatim passages with page refs and relevance notes.", icon: "Search", free: false, cost: "2 credits / search", group: "AI" },
  { id: "ai-ats-resume", name: "ATS Resume Optimizer", desc: "Tier 3 HR: audit your resume for ATS compatibility + get concrete fixes.", icon: "User", free: false, cost: "10 credits / resume", group: "AI" },
  { id: "ai-resume-parse", name: "Resume Parser", desc: "Tier 3 HR: parse a resume into structured JSON (ATS / spreadsheet ready).", icon: "User", free: false, cost: "5 credits / resume", group: "AI" },
  { id: "ai-action-items", name: "Extract Action Items", desc: "Meeting notes / specs / briefs → TODO table with owners, due dates, priorities.", icon: "Check", free: false, cost: "3 credits / doc", group: "AI" },
  { id: "ai-bank-statement", name: "Bank Statement Parser", desc: "Tier 3 Finance: SBI/HDFC/ICICI/Axis/Kotak → categorised transactions CSV.", icon: "Receipt", free: false, cost: "30 credits / statement", group: "AI" },
  { id: "ai-blood-test", name: "Blood Test Report Parser", desc: "Tier 3 Healthcare: lab values with normal/high/low flags. Extraction only, not medical advice.", icon: "File", free: false, cost: "15 credits / report", group: "AI" },
  { id: "ai-gst-invoice", name: "GST Invoice Extractor", desc: "Tier 3 Finance: invoice → GSTR-2-ready fields with line-item tax breakdown.", icon: "Receipt", free: false, cost: "25 credits / invoice", group: "AI" },
  { id: "ai-rental", name: "Rental Agreement Analyzer", desc: "Tier 3 Legal: flags risks, missing clauses, and gives state-specific negotiation points.", icon: "Shield", free: false, cost: "15 credits / agreement", group: "AI" },
  { id: "ai-syllabus", name: "Syllabus to Study Plan", desc: "Tier 3 Education: 12-week study plan with topic map, practice checkpoints, revision strategy.", icon: "Book", free: false, cost: "20 credits / syllabus", group: "AI" },
  { id: "ai-property", name: "Property Document Checker", desc: "Tier 3 Real Estate: red flags + missing docs + chain of title in Indian sale deeds / khata / EC.", icon: "Shield", free: false, cost: "30 credits / doc", group: "AI" },
  { id: "ai-discharge", name: "Discharge Summary Simplifier", desc: "Tier 3 Healthcare: plain-language rewrite for patients + families. Not medical advice.", icon: "Chat", free: false, cost: "10 credits / summary", group: "AI" },
  { id: "ai-itr-form16", name: "ITR / Form 16 Analyzer", desc: "Tier 3 Finance: income summary + deductions + tax computation + suggested actions.", icon: "Receipt", free: false, cost: "20 credits / doc", group: "AI" },
  { id: "ai-translate", name: "Translate PDF", desc: "Preserve layout across 20+ languages.", icon: "Translate", free: false, cost: "5 credits / doc", group: "AI" },
  { id: "ai-ocr", name: "OCR & Smart Extract", desc: "Turn scans into searchable, structured data.", icon: "Scan", free: false, cost: "~2 credits / page", group: "AI" },
  { id: "ai-rewrite", name: "Rewrite & Rephrase", desc: "Tone shift, simplify, or expand text.", icon: "Edit", free: false, cost: "~3 credits / page", group: "AI" },
  { id: "ai-redact", name: "Redact Sensitive Info", desc: "Auto-detect PII and black it out.", icon: "Shield", free: false, cost: "~2 credits / page", group: "AI" },
  { id: "ai-generate", name: "Generate PDF from Prompt", desc: "Draft reports, contracts, briefs from text.", icon: "Generate", free: false, cost: "~20 credits / doc", group: "AI" },
  { id: "ai-sign", name: "Sign & Fill Forms", desc: "AI fills fields, you sign and send.", icon: "Pen", free: false, cost: "~10 credits / doc", group: "AI" },
  { id: "ai-table", name: "AI Table Extract", desc: "Extract tables as CSV or Excel — even multi-page.", icon: "Pages", free: false, cost: "~3 credits / table", group: "AI" },
  { id: "ai-compare", name: "Compare PDFs", desc: "Redline diff with AI severity analysis.", icon: "Compare", free: false, cost: "15 credits / diff", group: "AI" },
] as const;

export const GROUP_ORDER: readonly ToolGroup[] = ["AI", "Organize", "Convert", "Optimize", "Edit", "Security"] as const;

export const toolById = (id: string): Tool | undefined => TOOLS.find((t) => t.id === id);

export const toolsByGroup = (): Record<ToolGroup, Tool[]> => {
  const out = {} as Record<ToolGroup, Tool[]>;
  for (const g of GROUP_ORDER) out[g] = [];
  for (const t of TOOLS) out[t.group].push(t);
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
