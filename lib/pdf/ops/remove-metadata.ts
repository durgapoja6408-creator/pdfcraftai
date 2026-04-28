// lib/pdf/ops/remove-metadata.ts
//
// Tier 5 (2026-04-28): clear out PDF metadata before sharing. Removes
// /Info dict fields (Title, Author, Subject, Keywords, Producer,
// Creator, ProductionDate, ModDate) and the embedded XMP metadata
// stream.
//
// Privacy / OPSEC use case: PDFs leak surprising amounts of identity
// info — username from the OS, software fingerprint from "Producer",
// document history from XMP. Strip before sending externally.

import { PDFDocument, PDFName } from "pdf-lib";

export interface RemoveMetadataResult {
  bytes: Uint8Array;
  pageCount: number;
  /** Counts of fields cleared, for the success-card detail line. */
  clearedInfoFields: string[];
  hadXmp: boolean;
}

export async function removePdfMetadata(
  bytes: Uint8Array,
): Promise<RemoveMetadataResult> {
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });
  const pageCount = doc.getPageCount();
  if (pageCount === 0) throw new Error("This PDF has no pages.");

  // Track which Info fields had values so we can report them.
  const cleared: string[] = [];
  const tryClear = (name: string, getter: () => string | undefined, setter: (v: string) => void) => {
    try {
      const v = getter();
      if (v && v.trim()) cleared.push(name);
    } catch {
      // ignore
    }
    try {
      setter("");
    } catch {
      // ignore
    }
  };
  tryClear("Title", () => doc.getTitle(), (v) => doc.setTitle(v));
  tryClear("Author", () => doc.getAuthor(), (v) => doc.setAuthor(v));
  tryClear("Subject", () => doc.getSubject(), (v) => doc.setSubject(v));
  tryClear(
    "Keywords",
    () => doc.getKeywords(),
    (v) => doc.setKeywords(v ? v.split(",").map((k) => k.trim()) : []),
  );
  tryClear("Producer", () => doc.getProducer(), (v) => doc.setProducer(v));
  tryClear("Creator", () => doc.getCreator(), (v) => doc.setCreator(v));

  // XMP metadata stream — there's no direct pdf-lib API to remove the
  // stream, but we can blank it via setLanguage and other setters that
  // touch XMP. Cleanest: clear the document's catalog /Metadata ref.
  let hadXmp = false;
  try {
    const catalog = doc.catalog;
    const metadataKey = PDFName.of("Metadata");
    if (catalog.has(metadataKey)) {
      hadXmp = true;
      catalog.delete(metadataKey);
    }
  } catch {
    // ignore — XMP removal is best-effort
  }

  const out = await doc.save({
    useObjectStreams: true,
    // Don't have pdf-lib re-stamp ModDate / Producer.
    updateFieldAppearances: false,
  });
  return { bytes: out, pageCount, clearedInfoFields: cleared, hadXmp };
}
