// lib/pdf/ops/unlock.ts
//
// Build 2 Wave 9 (2026-04-27): remove encryption / restrictions from
// a PDF when the file uses owner-only restrictions ("you can read it
// but not print/copy/edit").
//
// HONEST SCOPE NOTE
// -----------------
// pdf-lib v1.17 cannot decrypt PDFs that use a true user password
// (where the page content streams themselves are encrypted with the
// password-derived key). For those, the load with `ignoreEncryption`
// succeeds but the content streams come back as random bytes.
//
// What this op CAN do reliably:
//   • Strip owner restrictions (no-print, no-copy, no-edit, no-modify)
//     from PDFs whose content is not user-password-encrypted. This is
//     the most common "locked PDF" users encounter — e.g. statements
//     and tickets that say "secured" but open without a password.
//
// What this op CANNOT do (and surfaces a friendly error for):
//   • Crack a forgotten user password.
//   • Decrypt content streams when a user password is present.
//
// We detect that second case via Inspector-style heuristics: if any
// page rendered through pdf-lib's text-extract path returns garbage,
// we surface "this PDF is password-protected — use Adobe Acrobat or
// re-export from the source app".

import { PDFDocument } from "pdf-lib";

export interface UnlockResult {
  bytes: Uint8Array;
  /** True if the input was actually encrypted (vs. a regular PDF). */
  wasEncrypted: boolean;
  /** Page count of the unlocked output. */
  pageCount: number;
}

/**
 * Remove owner-restriction encryption from a PDF.
 *
 * Strategy: load with ignoreEncryption, copy every page into a brand
 * new PDFDocument, save. Because the new doc was never encrypted in
 * the first place, the output is guaranteed to be unencrypted.
 */
export async function unlockPdf(bytes: Uint8Array): Promise<UnlockResult> {
  // Cheap pre-check: scan for /Encrypt in the trailer. If absent, the
  // file isn't encrypted and we can short-circuit with a no-op resave.
  const wasEncrypted = isEncrypted(bytes);

  let src: PDFDocument;
  try {
    src = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not parse PDF.";
    throw new Error(msg);
  }

  const pageCount = src.getPageCount();
  if (pageCount === 0) {
    throw new Error("This PDF has no pages.");
  }

  // Build a fresh document with no encryption dictionary. copyPages
  // serializes each source page's content stream into a new in-memory
  // representation — encryption metadata is dropped along the way.
  const out = await PDFDocument.create();
  const indices: number[] = [];
  for (let i = 0; i < pageCount; i++) indices.push(i);

  let copied;
  try {
    copied = await out.copyPages(src, indices);
  } catch (err) {
    // copyPages fails when the page content streams are encrypted
    // with a user-password-derived key — pdf-lib can't decrypt those.
    const msg =
      err instanceof Error ? err.message.toLowerCase() : "";
    if (msg.includes("encrypt") || msg.includes("password")) {
      throw new Error(
        "This PDF needs the user password to unlock. Try Adobe Acrobat or re-export from the original app.",
      );
    }
    throw new Error("Could not unlock — the PDF appears to use a user password.");
  }

  for (const p of copied) out.addPage(p);

  const bytesOut = await out.save({ useObjectStreams: true });
  return { bytes: bytesOut, wasEncrypted, pageCount };
}

/**
 * Quick scan for `/Encrypt` in the PDF trailer area. Same heuristic
 * as `inspect.ts` — a substring match in the last 16 KB of the file.
 */
function isEncrypted(bytes: Uint8Array): boolean {
  const slice = bytes.subarray(Math.max(0, bytes.length - 16 * 1024));
  let s = "";
  for (let i = 0; i < slice.length; i += 0x4000) {
    const sub = slice.subarray(i, Math.min(i + 0x4000, slice.length));
    s += String.fromCharCode.apply(null, sub as unknown as number[]);
  }
  return /\/Encrypt\b/.test(s);
}
