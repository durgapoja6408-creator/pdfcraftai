// lib/client/download.ts
//
// M3 (#193, 2026-04-28): filename collision suffix on repeat
// downloads. Browsers auto-rename `report.pdf` to `report (1).pdf`
// on second download, which can confuse users on first glance and
// — worse — fails silently if the OS is set to "always replace
// existing." Tracking a session-local counter lets us emit
// `report.pdf`, `report-2.pdf`, `report-3.pdf` etc, which is more
// predictable and never silently replaces a previous download.
//
// Scope: counter lives in module memory (cleared on page reload).
// localStorage felt like overreach — users navigating away and
// back probably WANT a fresh `report.pdf` again.

const counts = new Map<string, number>();

/**
 * Compute a suffixed filename if the base has been downloaded
 * before in this session. First download returns the base
 * unchanged; subsequent downloads append `-2`, `-3`, etc just
 * before the `.pdf` extension.
 *
 * Examples:
 *   suffixedFilename("report.pdf")    →  "report.pdf"  (1st)
 *   suffixedFilename("report.pdf")    →  "report-2.pdf" (2nd)
 *   suffixedFilename("report.pdf")    →  "report-3.pdf" (3rd)
 *   suffixedFilename("notes.txt")     →  "notes.txt"
 *   suffixedFilename("notes.txt")     →  "notes-2.txt"
 *
 * Pure function with side-effect (incrementing the counter). Idempotent
 * within a single render pass: call it AT DOWNLOAD TIME, not at result-
 * card render time, so the counter only ticks when the user actually
 * clicks Download.
 */
export function suffixedFilename(base: string): string {
  const prev = counts.get(base) ?? 0;
  const next = prev + 1;
  counts.set(base, next);
  if (next === 1) return base;
  // Insert "-N" before the last extension.
  const dot = base.lastIndexOf(".");
  if (dot === -1) return `${base}-${next}`;
  return `${base.slice(0, dot)}-${next}${base.slice(dot)}`;
}

/**
 * Trigger a browser download for the given bytes + filename. Wraps
 * the createObjectURL → click → revokeObjectURL dance and applies
 * the session-local collision suffix automatically.
 */
export function downloadBytes(
  bytes: Uint8Array | ArrayBuffer,
  filename: string,
  mimeType = "application/pdf",
): void {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = suffixedFilename(filename);
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Test/debug helper: clear the session counter. */
export function _resetDownloadCounter(): void {
  counts.clear();
}
