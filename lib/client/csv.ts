/**
 * M22 (#193, 2026-04-29): Canonical CSV export helper for inspector tools.
 *
 * Before this, four inspectors (PdfAnnotations / PdfFonts / PdfForms /
 * PdfLinks) each carried their own copy of the same 18-line escape +
 * blob + revoke dance. Same RFC 4180 escape rule, same `text/csv;
 * charset=utf-8` MIME, same `${base}.${suffix}.csv` filename pattern,
 * same anchor-click-revoke sequence — but four implementations.
 *
 * Reasons to consolidate:
 *  1. **Test once.** A single `escapeCsvField` is unit-testable; four
 *     inline copies aren't.
 *  2. **Fix once.** When (not if) we discover Excel chokes on lone
 *     "\n" line endings or on UTF-8 without a BOM, the fix lands in
 *     one place. Today the inline copies all use bare "\n" — works
 *     for Google Sheets and macOS Numbers, fragile in Excel-on-Windows.
 *  3. **Pattern lock-in.** New inspectors (M22 expands to ~7 tools as
 *     more `Pdf*Tool` consumers add CSV) start canonical instead of
 *     copying whichever sibling they happened to look at.
 *
 * RFC 4180 conformance:
 *  - Fields with `,`, `"`, `\n`, or `\r` are wrapped in double quotes.
 *  - Embedded `"` is doubled.
 *  - Newline between rows is `\r\n` (Excel-safe; Sheets, Numbers, and
 *    every CSV parser written this century also accept this).
 *  - UTF-8 BOM is prepended so Excel-on-Windows reads non-ASCII
 *    correctly (e.g. an annotation author named "Søren" or a font
 *    named "Times—Bold").
 *
 * Why this isn't shared with TableExtractTool: that tool's CSV comes
 * out of the LLM/parser already-formatted (it owns its own escaping
 * and structure). Wrapping it through this helper would re-escape
 * already-escaped fields. Different concern, different file.
 */

/**
 * Escape a single CSV field per RFC 4180.
 *
 * Returns the field as-is if it contains no quote/comma/newline (which
 * is the common case — most field values are short identifiers or
 * page numbers). Wraps in `"…"` and doubles embedded quotes only
 * when needed. This keeps the output readable when opened in a text
 * editor instead of force-quoting every field.
 *
 * Numbers and booleans are coerced via `String(...)` so callers don't
 * have to remember to stringify.
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s === "") return "";
  // Normalize internal newlines to a single space — embedded `\n` in
  // a CSV field technically works (when wrapped in quotes) but breaks
  // every "open in Excel and copy a column" workflow we've seen.
  // Annotation contents and form values are the typical sources.
  const normalized = s.replace(/\r?\n/g, " ");
  // Only quote when needed.
  if (/[",\r\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

/**
 * Render a row of fields as one CSV line. Pre-escapes each field.
 */
export function csvRow(fields: readonly unknown[]): string {
  return fields.map(escapeCsvField).join(",");
}

/**
 * Build a complete CSV body: header line + one line per row, joined
 * with `\r\n` (Excel-safe). Caller passes raw values; we escape.
 */
export function buildCsv(
  header: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  const headerLine = header.map(escapeCsvField).join(",");
  const bodyLines = rows.map(csvRow);
  return [headerLine, ...bodyLines].join("\r\n");
}

/**
 * Trigger a CSV download in the browser.
 *
 * Wraps the `buildCsv` body in a Blob with a UTF-8 BOM, creates an
 * object URL, clicks an invisible anchor, then revokes the URL.
 * Mirrors the suffixedFilename pattern from lib/client/download.ts so
 * repeat downloads of the same source PDF get distinct filenames.
 *
 * @param filename - desired download filename (the helper does NOT
 *   suffix-uniquify; callers that need that should run the value
 *   through `suffixedFilename()` from lib/client/download.ts first).
 */
export function downloadCsv(
  filename: string,
  header: readonly string[],
  rows: readonly (readonly unknown[])[],
): void {
  const body = buildCsv(header, rows);
  // BOM = U+FEFF; required for Excel-on-Windows to detect UTF-8.
  const blob = new Blob(["﻿" + body], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
