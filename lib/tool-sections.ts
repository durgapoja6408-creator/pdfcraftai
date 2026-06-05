// Shared catalog section model — single source of truth for how tools are
// grouped into the collapsible category sections used by BOTH the /tools
// index (components/marketing/ToolFilter.tsx) and the homepage showcase
// (components/landing/ToolsShowcaseGroups.tsx).
//
// The five free categories come from each tool's data-level `group` field.
// The AI side is one flat `group: "AI"` in the data, so the 52 catalog AI
// tools are sub-grouped HERE (by id) into 6 themed sections — WITHOUT touching
// `tool.group` (that's validated by test-tool-id-conventions.mjs). Keeping the
// id->section map in one module means the two consumers can never drift, and a
// future AI tool that isn't mapped falls into the AI_FALLBACK_KEY bucket so it
// can never silently disappear.
//
// Added 2026-06-04 when the homepage adopted the same collapsible accordion
// the /tools index shipped earlier the same day.

import type { Tool } from "@/lib/tools";

export type FreeSectionDef = { kind: "free"; key: string; label: string; group: Tool["group"] };
export type AiSectionDef = { kind: "ai"; key: string; label: string; ids: readonly string[] };
export type SectionDef = FreeSectionDef | AiSectionDef;

export const FREE_SECTIONS: readonly FreeSectionDef[] = [
  { kind: "free", key: "Organize", label: "Organize", group: "Organize" },
  { kind: "free", key: "Convert", label: "Convert", group: "Convert" },
  { kind: "free", key: "Edit", label: "Edit & annotate", group: "Edit" },
  { kind: "free", key: "Optimize", label: "Optimize", group: "Optimize" },
  { kind: "free", key: "Security", label: "Security & redaction", group: "Security" },
];

export const AI_SECTIONS: readonly AiSectionDef[] = [
  {
    kind: "ai",
    key: "ai-understand",
    label: "Summarize & Understand",
    ids: [
      "ai-summarize", "ai-tldr", "ai-key-points", "ai-study-notes", "ai-eli5",
      "ai-faq", "ai-mindmap", "ai-flashcards", "ai-quiz", "ai-syllabus",
      "ai-research-paper", "ai-semantic-search",
    ],
  },
  {
    kind: "ai",
    key: "ai-write",
    label: "Write & Rewrite",
    ids: [
      "ai-blog", "ai-newsletter", "ai-video-script", "ai-social-thread",
      "ai-condense", "ai-expand", "ai-improve-writing", "ai-paraphrase",
      "ai-rewrite", "ai-proofread", "ai-generate",
    ],
  },
  {
    kind: "ai",
    key: "ai-analyze",
    label: "Analyse & Extract",
    ids: [
      "ai-entities", "ai-tone-analyze", "ai-citations", "ai-sentiment",
      "ai-bias", "ai-readability", "ai-detector", "ai-action-items",
      "ai-chart-to-table", "ai-table", "ai-compare",
    ],
  },
  {
    kind: "ai",
    key: "ai-docs",
    label: "Documents & Convert",
    ids: ["ai-translate", "ai-ocr", "ai-searchable-pdf", "ai-redact", "ai-sign"],
  },
  {
    kind: "ai",
    key: "ai-careers",
    label: "Careers",
    ids: ["ai-ats-resume", "ai-resume-parse", "ai-jd-match", "ai-cover-letter"],
  },
  {
    kind: "ai",
    key: "ai-legal-health",
    label: "Legal & Health",
    ids: [
      "ai-nda", "ai-employment", "ai-partnership-deed", "ai-court-order",
      "ai-loan-bundle", "ai-insurance", "ai-salary-slip", "ai-blood-test",
      "ai-discharge",
    ],
  },
];

// Combined order used by /tools (free first, then AI). The homepage composes
// its own AI-first order from AI_SECTIONS + FREE_SECTIONS.
export const TOOL_SECTIONS: readonly SectionDef[] = [...FREE_SECTIONS, ...AI_SECTIONS];

export const AI_FALLBACK_KEY = "ai-more";

// id -> AI section key (built once).
const AI_SECTION_OF: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const s of AI_SECTIONS) for (const id of s.ids) m.set(id, s.key);
  return m;
})();

export function aiSectionKeyForId(id: string): string | undefined {
  return AI_SECTION_OF.get(id);
}

// Every possible section key — used to initialise "all expanded" open state.
export const ALL_SECTION_KEYS: readonly string[] = [
  ...FREE_SECTIONS.map((s) => s.key),
  ...AI_SECTIONS.map((s) => s.key),
  AI_FALLBACK_KEY,
];

export type BuiltSection = { key: string; label: string; isAI: boolean; tools: Tool[] };

// Bucket a (pre-filtered) tool list into ordered, non-empty sections following
// `order`. Free tools route by `group`; AI tools by the id->section map, with
// a trailing "More AI tools" bucket for anything unmapped.
export function buildSections(tools: readonly Tool[], order: readonly SectionDef[]): BuiltSection[] {
  const byKey = new Map<string, Tool[]>();
  for (const t of tools) {
    const key = t.free ? t.group : aiSectionKeyForId(t.id) ?? AI_FALLBACK_KEY;
    let arr = byKey.get(key);
    if (!arr) { arr = []; byKey.set(key, arr); }
    arr.push(t);
  }
  const out: BuiltSection[] = [];
  for (const s of order) {
    const ts = byKey.get(s.key) ?? [];
    if (ts.length) out.push({ key: s.key, label: s.label, isAI: s.kind === "ai", tools: ts });
  }
  const more = byKey.get(AI_FALLBACK_KEY) ?? [];
  if (more.length) out.push({ key: AI_FALLBACK_KEY, label: "More AI tools", isAI: true, tools: more });
  return out;
}

// ---------------------------------------------------------------------------
// /tools catalog enhancements (2026-06-04, P0/P1/P2 improvement plan)
// ---------------------------------------------------------------------------

// "Popular / Start here" row shown above the full grid (filter=all, no search).
// High-intent tools only; ai-chat excluded (it lives at /app/chat, not /tool/*).
export const POPULAR_TOOL_IDS: readonly string[] = [
  "merge", "split", "compress-pdf", "pdf-to-jpg", "jpg-to-pdf", "rotate",
  "ai-summarize", "ai-translate",
];

// One-line intro under each section <h2> (keyword coverage + scent).
export const SECTION_BLURBS: Record<string, string> = {
  Organize: "Reorder, count, extract and inspect — structure your PDFs.",
  Convert: "PDFs to and from text, images, HTML, Markdown and CSV.",
  Edit: "Stamp, fill, overlay, number, annotate and redact.",
  Optimize: "Shrink and tune PDFs for sharing or print.",
  Security: "Unlock, redact and strip sensitive data from PDFs.",
  "ai-understand": "Summaries, key points and study aids for any PDF.",
  "ai-write": "Turn a PDF into blog posts, threads, scripts and rewrites.",
  "ai-analyze": "Extract entities, tone, citations, tables and sentiment.",
  "ai-docs": "Translate, OCR, redact and sign with AI.",
  "ai-careers": "Resumes, cover letters and JD matching.",
  "ai-legal-health": "Plain-language analysis of legal and medical PDFs.",
  "ai-more": "More AI tools.",
};

// Synonym/alias search expansion: if the query contains a key, the mapped
// tool ids are force-included even when the term isn't in the name/desc.
export const SEARCH_SYNONYMS: Record<string, readonly string[]> = {
  combine: ["merge"], join: ["merge"], concat: ["merge"],
  shrink: ["compress-pdf"], reduce: ["compress-pdf"], smaller: ["compress-pdf"], optimise: ["compress-pdf"],
  turn: ["rotate"], rotate: ["rotate"],
  password: ["unlock"], unlock: ["unlock"], decrypt: ["unlock"],
  image: ["pdf-to-jpg", "pdf-to-png", "jpg-to-pdf", "png-to-pdf", "extract-images"],
  photo: ["jpg-to-pdf", "png-to-pdf"], picture: ["jpg-to-pdf", "png-to-pdf"],
  word: ["pdf-to-text", "pdf-to-markdown"], text: ["pdf-to-text", "pdf-search"],
  excel: ["csv-to-pdf"], spreadsheet: ["csv-to-pdf"], csv: ["csv-to-pdf"],
  sign: ["sign-pdf-free", "ai-sign"], signature: ["sign-pdf-free", "ai-sign"],
  redact: ["redact-free", "ai-redact"], hide: ["redact-free", "ai-redact"],
  translate: ["ai-translate"], language: ["ai-translate"],
  summary: ["ai-summarize", "ai-tldr"], summarise: ["ai-summarize", "ai-tldr"], summarize: ["ai-summarize", "ai-tldr"],
  ocr: ["ai-ocr", "ai-searchable-pdf"], scan: ["ai-ocr", "ai-searchable-pdf"], searchable: ["ai-searchable-pdf"],
  metadata: ["remove-metadata"], clean: ["remove-metadata"],
};

// Free tools that run server-side (NOT in-browser) — everything else free is
// client-side, so it earns the "in-browser" privacy badge.
export const SERVER_SIDE_IDS: ReadonlySet<string> = new Set(["compress-pdf", "pdf-a-convert"]);

// Recently-shipped tools that earn a "NEW" badge on their /tools card.
// Curated (not date-derived) so the badge is a deliberate editorial signal;
// trim this list as tools age. Validated against the catalog by
// scripts/test-tools-catalog-extras.mjs (every id must exist in TOOLS).
export const NEW_TOOL_IDS: ReadonlySet<string> = new Set([
  "extract-contacts",
  "extract-dates",
  "extract-attachments",
  "ai-court-order",
]);

// Sort options for the /tools catalog. "curated" = catalog order (default),
// "az" = alphabetical, "popular" = high-intent tools first.
export const TOOL_SORTS = ["curated", "az", "popular"] as const;
export type ToolSort = (typeof TOOL_SORTS)[number];
