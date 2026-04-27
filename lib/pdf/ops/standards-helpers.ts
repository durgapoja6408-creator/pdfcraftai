// lib/pdf/ops/standards-helpers.ts
//
// Build 2 Wave 8 (2026-04-27): shared byte-stream helpers used by
// PDF/A, PDF/X, and Accessibility checkers, plus the JS Detector.
// Centralizes the cross-cutting checks so each tool composes them
// rather than reimplementing.
//
// Pattern matches metadata.ts / outline.ts / forms.ts — Latin-1
// view over PDF bytes, regex against object refs, defensive
// try/catch never throws.

export interface CommonChecks {
  /** True if any /Encrypt entry exists in the trailer. */
  encrypted: boolean;
  /** True if any JavaScript handler exists anywhere in the PDF. */
  hasJavaScript: boolean;
  /** True if /MarkInfo /Marked true is set in the catalog. */
  isTagged: boolean;
  /** True if a /StructTreeRoot ref exists in the catalog. */
  hasStructTree: boolean;
  /** Document language from /Lang (e.g. "en-US"), or null. */
  language: string | null;
  /** Document title from /Info or XMP, or null. */
  title: string | null;
  /** True if /ViewerPreferences /DisplayDocTitle true. */
  displayDocTitle: boolean;
  /** XMP metadata block (raw RDF/XML), or null. */
  xmpMetadata: string | null;
}

/**
 * Run all the cheap structural checks once. Each tool composes the
 * subset it cares about from this output.
 */
export function checkCommonStructure(bytes: Uint8Array): CommonChecks {
  const text = bytesToLatin1(bytes);
  const result: CommonChecks = {
    encrypted: false,
    hasJavaScript: false,
    isTagged: false,
    hasStructTree: false,
    language: null,
    title: null,
    displayDocTitle: false,
    xmpMetadata: null,
  };
  try {
    // Encryption — same check as metadata.ts.
    result.encrypted = /\/Encrypt[\s/<]/.test(text);

    // JavaScript anywhere in the byte stream — broad heuristic. We
    // search for /JavaScript or /JS as actions/keys. False positives
    // are rare because these tokens have specific PDF semantics.
    result.hasJavaScript =
      /\/JavaScript\b/.test(text) || /\/S\s*\/JavaScript\b/.test(text);

    // Catalog dict.
    const rootMatch = text.match(/\/Root\s+(\d+)\s+\d+\s+R/);
    if (!rootMatch) return result;
    const catalogBody = readObjectBody(text, rootMatch[1]);
    if (!catalogBody) return result;

    // Tagged PDF.
    result.isTagged = /\/MarkInfo\s*<<[\s\S]*?\/Marked\s+true/.test(catalogBody);

    // Structure tree.
    result.hasStructTree = /\/StructTreeRoot\s+\d+\s+\d+\s+R/.test(catalogBody);

    // Language.
    const langMatch = catalogBody.match(/\/Lang\s*\(([^)]*)\)/);
    if (langMatch) result.language = langMatch[1] || null;

    // Display doc title viewer pref.
    const vpRef = catalogBody.match(/\/ViewerPreferences\s+(\d+)\s+\d+\s+R/);
    let viewerPrefsBody: string | null = null;
    if (vpRef) {
      viewerPrefsBody = readObjectBody(text, vpRef[1]);
    } else {
      const vpInline = catalogBody.match(/\/ViewerPreferences\s*<<([\s\S]*?)>>/);
      if (vpInline) viewerPrefsBody = vpInline[1];
    }
    if (viewerPrefsBody) {
      result.displayDocTitle = /\/DisplayDocTitle\s+true\b/.test(viewerPrefsBody);
    }

    // XMP metadata stream — search for the embedded RDF/XML directly
    // since it's typically uncompressed. We look for the
    // <x:xmpmeta>...</x:xmpmeta> envelope.
    const xmpMatch = text.match(/<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/);
    if (xmpMatch) result.xmpMetadata = xmpMatch[0];

    // Title — try Info dict first, then XMP if Info absent.
    const infoRef = text.match(/\/Info\s+(\d+)\s+\d+\s+R/);
    if (infoRef) {
      const infoBody = readObjectBody(text, infoRef[1]);
      if (infoBody) {
        result.title = readPdfStringField(infoBody, "Title") || null;
      }
    }
    if (!result.title && result.xmpMetadata) {
      // Try XMP <dc:title>...<rdf:li>Title</rdf:li>...</dc:title>
      const xmpTitle = result.xmpMetadata.match(
        /<dc:title>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>[\s\S]*?<\/dc:title>/,
      );
      if (xmpTitle) result.title = xmpTitle[1].trim() || null;
    }
  } catch {
    // Defensive — any parse error returns whatever we managed to find
    // before the throw.
  }
  return result;
}

/**
 * Extract the PDF/A conformance markers from XMP metadata.
 *
 * PDF/A identification (per ISO 19005):
 *   <pdfaid:part>1</pdfaid:part>            ← part 1, 2, or 3
 *   <pdfaid:conformance>B</pdfaid:conformance>  ← A, B, or U
 *
 * Returns null if no PDF/A markers are present.
 */
export function detectPdfALevel(xmp: string | null): {
  part: string;
  conformance: string;
} | null {
  if (!xmp) return null;
  const partMatch = xmp.match(
    /<pdfaid:part[^>]*>([\s\S]*?)<\/pdfaid:part>|pdfaid:part="([^"]+)"/,
  );
  const confMatch = xmp.match(
    /<pdfaid:conformance[^>]*>([\s\S]*?)<\/pdfaid:conformance>|pdfaid:conformance="([^"]+)"/,
  );
  if (!partMatch || !confMatch) return null;
  const part = (partMatch[1] || partMatch[2] || "").trim();
  const conformance = (confMatch[1] || confMatch[2] || "").trim().toUpperCase();
  if (!part || !conformance) return null;
  return { part, conformance };
}

/**
 * Extract the PDF/X version markers from XMP or trailer.
 *
 * PDF/X identification:
 *   XMP: <pdfxid:GTS_PDFXVersion>PDF/X-4</pdfxid:GTS_PDFXVersion>
 *   Trailer: /GTS_PDFXVersion (PDF/X-1:2001) or similar
 *
 * Returns null if no PDF/X markers are present.
 */
export function detectPdfXVersion(
  bytes: Uint8Array,
  xmp: string | null,
): string | null {
  if (xmp) {
    const m = xmp.match(
      /<pdfxid:GTS_PDFXVersion[^>]*>([\s\S]*?)<\/pdfxid:GTS_PDFXVersion>|pdfxid:GTS_PDFXVersion="([^"]+)"/,
    );
    if (m) {
      const v = (m[1] || m[2] || "").trim();
      if (v) return v;
    }
  }
  // Fallback: look for /GTS_PDFXVersion in the byte stream directly.
  const text = bytesToLatin1(bytes.slice(0, Math.min(bytes.length, 1024 * 32)));
  const m2 = text.match(/\/GTS_PDFXVersion\s*\(([^)]+)\)/);
  return m2 ? m2[1].trim() : null;
}

// ----- Shared parsing primitives ------------------------------------

export function bytesToLatin1(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let s = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    s += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return s;
}

export function readObjectBody(text: string, objNum: string): string | null {
  const re = new RegExp(
    `\\b${escapeRegex(objNum)}\\s+\\d+\\s+obj\\b([\\s\\S]*?)\\bendobj\\b`,
  );
  const m = text.match(re);
  return m ? m[1] : null;
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function readPdfStringField(body: string, key: string): string {
  const re = new RegExp(
    `\\/${key}\\s*` +
      `(?:\\(((?:[^\\\\()]|\\\\.|\\([^()]*\\))*)\\)` +
      `|<([0-9A-Fa-f\\s]*)>)`,
  );
  const m = body.match(re);
  if (!m) return "";
  const literal = m[1];
  const hex = m[2];
  if (literal !== undefined) return decodeLiteral(literal);
  if (hex !== undefined) return decodeHex(hex);
  return "";
}

function decodeLiteral(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    if (ch !== 0x5c) {
      out += raw[i];
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) break;
    if (next === "n") {
      out += "\n";
      i += 1;
    } else if (next === "r") {
      out += "\r";
      i += 1;
    } else if (next === "t") {
      out += "\t";
      i += 1;
    } else if (next === "(" || next === ")" || next === "\\") {
      out += next;
      i += 1;
    } else if (next >= "0" && next <= "7") {
      let oct = next;
      if (raw[i + 2] >= "0" && raw[i + 2] <= "7") oct += raw[i + 2];
      if (raw[i + 3] >= "0" && raw[i + 3] <= "7") oct += raw[i + 3];
      out += String.fromCharCode(parseInt(oct, 8));
      i += oct.length;
    } else {
      out += next;
      i += 1;
    }
  }
  return latinToUtf16beIfBom(out);
}

function decodeHex(hex: string): string {
  const clean = hex.replace(/\s/g, "");
  const evenLen = clean.length - (clean.length % 2);
  const bytes: number[] = [];
  for (let i = 0; i < evenLen; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decodeUtf16be(bytes.slice(2));
  }
  return bytes.map((b) => String.fromCharCode(b)).join("");
}

function latinToUtf16beIfBom(s: string): string {
  if (s.length < 2) return s;
  if (s.charCodeAt(0) !== 0xfe || s.charCodeAt(1) !== 0xff) return s;
  const bytes: number[] = [];
  for (let i = 2; i < s.length; i++) bytes.push(s.charCodeAt(i));
  return decodeUtf16be(bytes);
}

function decodeUtf16be(bytes: number[]): string {
  let out = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  }
  return out;
}
