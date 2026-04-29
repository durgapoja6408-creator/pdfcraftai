// lib/pdf/error-messages.ts
//
// Canonical user-facing error mappings for PDF op failures.
// Each tool's setError() should pass the raw Error message
// through `mapPdfOpError()` so users see consistent guidance
// regardless of which underlying op blew up.
//
// Aligned with docs/UI_COPY.md: direct, no apology, action-
// oriented. Lead with the problem, end with the next move.

const ENCRYPTED_PHRASES = [
  "input document to pdfdocument.load is encrypted",
  "the document is encrypted",
  "pdf is encrypted",
  "encrypted pdf",
  "/encrypt",
];

/**
 * Map a raw error (from pdf-lib / PDFium / fetch / etc) to a
 * canonical user-facing message. Returns the mapped string when
 * we recognize a known failure mode; otherwise returns the
 * original message so debugging info isn't lost.
 *
 * Always pass the *string* through this — wrap the Error catch
 * site like:
 *   setError(mapPdfOpError(err instanceof Error ? err.message : String(err)));
 */
export function mapPdfOpError(raw: string): string {
  const lower = raw.toLowerCase();

  // Encrypted PDF — most common UX confusion. Tell the user
  // exactly which tool to use and link them there. The /tool/unlock
  // path is hardcoded because it's stable.
  if (ENCRYPTED_PHRASES.some((phrase) => lower.includes(phrase))) {
    return "That PDF is password-protected. Use Unlock PDF first (/tool/unlock).";
  }

  // Empty / no pages.
  if (
    lower.includes("no pages") ||
    lower.includes("zero pages") ||
    lower.includes("page count is 0")
  ) {
    return "This PDF has no pages.";
  }

  // Corrupt / unparseable.
  if (
    lower.includes("invalid pdf") ||
    lower.includes("parse error") ||
    lower.includes("malformed") ||
    lower.includes("cannot decode") ||
    lower.includes("unrecognized")
  ) {
    return "Couldn't parse this PDF — it may be corrupt. Try Repair PDF (/tool/repair-pdf).";
  }

  // OOM / very large doc.
  if (
    lower.includes("out of memory") ||
    lower.includes("allocation failed") ||
    lower.includes("rangeerror")
  ) {
    return "Browser ran out of memory. Try a smaller PDF or close other tabs.";
  }

  // Network / timeout (rare for client-only tools, but
  // analyzers and AI tools surface it).
  if (
    lower.includes("network") ||
    lower.includes("failed to fetch") ||
    lower.includes("timeout")
  ) {
    return "Network hiccup — try again in a moment.";
  }

  // Pass through original message — losing a useful diagnostic
  // is worse than showing a slightly raw string.
  return raw;
}
