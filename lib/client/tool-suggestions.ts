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
};

/** Look up suggestions, defaulting to empty if no entry. */
export function suggestionsFor(toolId: string): readonly string[] {
  return TOOL_SUGGESTIONS[toolId] ?? [];
}
