/**
 * M9 (#193, 2026-04-29): which tools to suggest "Open in" handoffs to.
 *
 * Curated by use-case, not by category. The goal is to surface the next
 * action a user is likely to want, not to offer every conceivable tool.
 * Three suggestions max per source — beyond that the success card gets
 * cluttered and the user just scrolls past.
 *
 * Maintenance note: when adding a tool that produces a PDF output,
 * decide:
 *  1. What's the most common follow-on action?  (add as suggestion[0])
 *  2. What's the second-most common?  (suggestion[1])
 *  3. What's a useful but less common third?  (suggestion[2])
 * Don't pad with every tool just because it accepts PDF input.
 */

/**
 * Map source tool ID → ranked array of target tool IDs to suggest.
 * Suggestions render in array order (most common first).
 *
 * Tool IDs MUST match the IDs in `lib/tools.ts` so the URL builder
 * routes correctly. Any tool ID not in this map renders no
 * suggestions (safe default — empty success-card "what next" panel).
 */
export const TOOL_SUGGESTIONS: Record<string, readonly string[]> = {
  // Visual editors — natural pairs (PageEditorTool consumers)
  "highlight-pdf": ["redact-free", "add-links", "page-numbers"],
  "redact-free": ["highlight-pdf", "flatten-pdf", "page-numbers"],
  "add-links": ["highlight-pdf", "page-numbers", "stamp-pdf"],
  "free-draw-pdf": ["highlight-pdf", "redact-free", "flatten-pdf"],
  "sign-pdf-free": ["highlight-pdf", "page-numbers", "stamp-pdf"],

  // Single-page visual editors
  "crop-pdf": ["resize-pdf", "rotate", "page-numbers"],
  "add-text-box": ["highlight-pdf", "page-numbers", "stamp-pdf"],
  "image-watermark": ["page-numbers", "resize-pdf", "highlight-pdf"],

  // Organize tools — chain into next manipulations
  merge: ["split", "rotate", "resize-pdf"],
  split: ["merge", "resize-pdf", "rotate"],
  "extract-pages": ["merge", "page-numbers", "stamp-pdf"],
  "delete-pages": ["page-numbers", "stamp-pdf", "resize-pdf"],
  "sort-pages": ["page-numbers", "stamp-pdf", "resize-pdf"],
  rotate: ["resize-pdf", "page-numbers", "crop-pdf"],

  // Optimize tools
  "resize-pdf": ["page-numbers", "stamp-pdf", "split"],
  "flatten-pdf": ["resize-pdf", "page-numbers", "stamp-pdf"],
  "remove-metadata": ["resize-pdf", "flatten-pdf", "page-numbers"],

  // Edit tools
  "page-numbers": ["stamp-pdf", "resize-pdf", "highlight-pdf"],
  "stamp-pdf": ["page-numbers", "resize-pdf", "highlight-pdf"],

  // Security tools
  "strip-links": ["redact-free", "remove-metadata", "resize-pdf"],
  unlock: ["resize-pdf", "page-numbers", "highlight-pdf"],
  "repair-pdf": ["resize-pdf", "flatten-pdf", "page-numbers"],

  // 2026-05-01 — Tier 1 image / text → PDF tools.
  // Output is always a PDF; users typically follow up by combining
  // with other PDFs (merge), adding identifying marks (page-numbers /
  // stamp), or shrinking the result if image-heavy (resize).
  "jpg-to-pdf": ["merge", "page-numbers", "resize-pdf"],
  "png-to-pdf": ["merge", "page-numbers", "resize-pdf"],
  // Text → PDF: most users want pagination metadata next, then to
  // combine with a cover page (merge), then to add a watermark.
  "text-to-pdf": ["page-numbers", "merge", "stamp-pdf"],

  // 2026-05-01 Tier 1 batch.
  // Markdown → PDF: same shape as text-to-pdf (paginate, combine,
  // watermark). Adding page numbers is the most common follow-up.
  "markdown-to-pdf": ["page-numbers", "merge", "stamp-pdf"],
  // Grayscale → typically the last step before sending to print, so
  // pair with size/layout adjustments and final pagination.
  "grayscale-pdf": ["resize-pdf", "n-up-pdf", "page-numbers"],
  // Booklet → users often add page numbers AFTER imposition (page
  // numbers stamped on each half of each sheet) and a fold guide.
  "booklet-pdf": ["page-numbers", "stamp-pdf", "merge"],

  // 2026-05-01 Tier 2 batch.
  // Bates → typical legal workflow: stamp Bates → redact PII →
  // merge into production volume.
  "bates-numbers": ["redact-free", "merge", "remove-metadata"],
  // Odd/even → users typically merge with the other parity result
  // (re-scan use case), then add pagination on the merged file.
  "odd-even-pages": ["merge", "page-numbers", "sort-pages"],
  // CSV → table is rendered; common follow-ups are pagination
  // (page numbers) and combining with a cover page (merge).
  "csv-to-pdf": ["page-numbers", "merge", "stamp-pdf"],
  // pdf-overlay → letterhead / watermark workflow; users typically
  // add page numbers AFTER overlay, or sign the result.
  "pdf-overlay": ["page-numbers", "sign-pdf-free", "merge"],
  // pdf-form-fill → typical post-fill is sign + flatten + send.
  // Most users want a signature next, then to compile into a binder.
  "pdf-form-fill": ["sign-pdf-free", "flatten-pdf", "merge"],
  // pdf-batch → output is a zip; not a single PDF. The handoff
  // suggestions surface the underlying ops users may want to apply
  // individually to specific files in the batch (after extracting).
  "pdf-batch": ["merge", "page-numbers", "stamp-pdf"],
  // pdf-diff → after seeing the visual diff, users typically want
  // semantic AI compare for content-level details, or to extract
  // pages of interest, or to highlight further regions manually.
  "pdf-diff": ["ai-compare", "extract-pages", "highlight-pdf"],

  // -----------------------------------------------------------------
  // 2026-05-01 — AI tool cross-funnel suggestions.
  //
  // Curated by what users actually do AFTER each AI op. Same shape
  // as free-tool suggestions: source tool ID → ranked array of
  // target tool IDs. Targets must exist in lib/tools.ts.
  //
  // Patterns:
  //   - Summary-family tools (output = markdown) → text-to-pdf to
  //     archive, ai-translate to localize, ai-key-points to extract
  //     bullets if the user wants something tighter than a summary.
  //   - Document-type tools (resume / cover-letter / blood-test) →
  //     adjacent tools in the same workflow.
  //   - Structured-output tools (flashcards / quiz / mindmap) →
  //     other study-aid tools.
  //   - Document operations (translate / compare / ocr / redact) →
  //     follow-on AI ops or downstream archival.
  // -----------------------------------------------------------------

  // --- Summary family (output = markdown) ---
  "ai-summarize": ["ai-tldr", "ai-key-points", "text-to-pdf"],
  "ai-tldr": ["ai-summarize", "ai-key-points", "ai-translate"],
  "ai-key-points": ["ai-flashcards", "ai-quiz", "ai-summarize"],
  "ai-study-notes": ["ai-flashcards", "ai-quiz", "ai-key-points"],
  "ai-eli5": ["ai-summarize", "ai-key-points", "text-to-pdf"],
  "ai-faq": ["ai-key-points", "ai-summarize", "text-to-pdf"],
  "ai-blog": ["text-to-pdf", "ai-translate", "ai-key-points"],
  "ai-readability": ["ai-improve-writing", "ai-summarize", "ai-key-points"],
  "ai-entities": ["ai-redact", "ai-key-points", "ai-summarize"],
  "ai-social-thread": ["ai-tldr", "ai-translate", "text-to-pdf"],
  "ai-condense": ["ai-tldr", "ai-summarize", "ai-key-points"],
  "ai-expand": ["ai-improve-writing", "ai-summarize", "ai-translate"],
  "ai-tone-analyze": ["ai-improve-writing", "ai-rewrite", "ai-summarize"],
  "ai-citations": ["ai-key-points", "ai-research-paper", "text-to-pdf"],
  "ai-sentiment": ["ai-tone-analyze", "ai-key-points", "ai-summarize"],
  "ai-bias": ["ai-improve-writing", "ai-rewrite", "ai-summarize"],
  "ai-proofread": ["ai-improve-writing", "ai-rewrite", "ai-paraphrase"],
  "ai-newsletter": ["text-to-pdf", "ai-translate", "ai-key-points"],
  "ai-video-script": ["text-to-pdf", "ai-translate", "ai-tldr"],

  // --- Document-type family (resume / cover-letter / medical / legal) ---
  "ai-ats-resume": ["ai-jd-match", "ai-cover-letter", "ai-resume-parse"],
  "ai-resume-parse": ["ai-ats-resume", "ai-cover-letter", "ai-jd-match"],
  "ai-cover-letter": ["ai-jd-match", "ai-improve-writing", "ai-resume-parse"],
  "ai-jd-match": ["ai-cover-letter", "ai-resume-parse", "ai-ats-resume"],
  "ai-blood-test": ["ai-discharge", "ai-summarize", "text-to-pdf"],
  "ai-discharge": ["ai-blood-test", "ai-summarize", "ai-key-points"],
  "ai-syllabus": ["ai-flashcards", "ai-quiz", "ai-key-points"],
  "ai-action-items": ["ai-key-points", "ai-summarize", "text-to-pdf"],
  "ai-nda": ["ai-employment", "ai-partnership-deed", "ai-redact"],
  "ai-employment": ["ai-nda", "ai-cover-letter", "ai-redact"],
  // 2026-05-01 — ai-court-order shipped today (commit 84cb9a9).
  // Suggestions route to the broader legal-toolkit (NDA / employment /
  // partnership for counterparty docs; redact for sealed-content prep
  // before sharing judgments where party identities matter).
  "ai-court-order": ["ai-nda", "ai-employment", "ai-partnership-deed", "ai-redact"],
  "ai-salary-slip": ["ai-blood-test", "ai-redact", "text-to-pdf"],
  "ai-research-paper": ["ai-citations", "ai-summarize", "ai-key-points"],
  "ai-insurance": ["ai-blood-test", "ai-summarize", "ai-key-points"],
  "ai-loan-bundle": ["ai-summarize", "ai-redact", "merge"],
  "ai-partnership-deed": ["ai-nda", "ai-employment", "ai-redact"],

  // --- Structured output (study aids + extraction) ---
  "ai-flashcards": ["ai-quiz", "ai-mindmap", "ai-key-points"],
  "ai-quiz": ["ai-flashcards", "ai-key-points", "ai-summarize"],
  "ai-mindmap": ["ai-flashcards", "ai-quiz", "ai-key-points"],
  "ai-semantic-search": ["ai-summarize", "ai-key-points", "pdf-search"],

  // --- Document operations ---
  "ai-translate": ["ai-summarize", "pdf-to-text", "ai-improve-writing"],
  "ai-compare": ["pdf-diff", "highlight-pdf", "ai-summarize"],
  "ai-ocr": ["pdf-to-text", "ai-translate", "ai-summarize"],
  "ai-searchable-pdf": ["pdf-search", "ai-summarize", "ai-translate"],
  "ai-redact": ["redact-free", "strip-links", "remove-metadata"],
  "ai-rewrite": ["ai-improve-writing", "ai-paraphrase", "ai-detector"],
  "ai-improve-writing": ["ai-rewrite", "ai-paraphrase", "ai-proofread"],
  "ai-paraphrase": ["ai-rewrite", "ai-improve-writing", "ai-detector"],
  "ai-detector": ["ai-improve-writing", "ai-rewrite", "ai-paraphrase"],
  "ai-table": ["ai-chart-to-table", "pdf-to-text", "ai-summarize"],
  "ai-chart-to-table": ["ai-table", "ai-summarize", "ai-key-points"],
  "ai-generate": ["text-to-pdf", "ai-improve-writing", "merge"],
  "ai-sign": ["sign-pdf-free", "flatten-pdf", "merge"],
};

/** Look up suggestions, defaulting to empty if no entry. */
export function suggestionsFor(toolId: string): readonly string[] {
  return TOOL_SUGGESTIONS[toolId] ?? [];
}
