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
  { id: "pdf-inspector", name: "PDF Inspector", desc: "See everything inside a PDF — pages, dimensions, word count, reading time + mixed-size warnings. Free, in-browser.", icon: "Search", free: true, cost: "free", group: "Organize" },

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
  { id: "ai-table", name: "AI Table Extract", desc: "Extract tables as CSV or Excel — even multi-page.", icon: "Pages", free: false, cost: "3 credits per doc", group: "AI" },
  { id: "ai-compare", name: "Compare PDFs", desc: "Redline diff with AI severity analysis.", icon: "Compare", free: false, cost: "15 credits per diff", group: "AI" },
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
