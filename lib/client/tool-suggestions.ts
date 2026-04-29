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
};

/** Look up suggestions, defaulting to empty if no entry. */
export function suggestionsFor(toolId: string): readonly string[] {
  return TOOL_SUGGESTIONS[toolId] ?? [];
}
