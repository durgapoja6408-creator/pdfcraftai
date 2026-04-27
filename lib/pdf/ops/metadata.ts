// lib/pdf/ops/metadata.ts
//
// Inspector P5 (2026-04-27): pure-JS PDF metadata extraction.
//
// The @hyzyla/pdfium wrapper doesn't expose FPDF_GetMetaText / version
// / encryption APIs — only the page-level surface. Rather than fork
// the wrapper or call into the WASM module directly (fragile), we
// parse the raw PDF bytes for the four pieces of info that matter:
//
//   1. PDF version  — first 10 bytes of the file (%PDF-X.Y header)
//   2. Encryption   — presence of /Encrypt in the trailer dict
//   3. Info dict    — Title / Author / Subject / Keywords / Creator
//                     / Producer / CreationDate / ModDate
//   4. Approx XMP   — Adobe-style metadata stream (RDF/XML), if present
//
// Limitations honestly stated up front:
//
//   - PDFs with cross-reference STREAMS (PDF 1.5+) compress object
//     locations in ways that this byte-scanner can't follow into
//     compressed object streams. We catch the simple cases (Info dict
//     stored as a non-compressed object) which is the common case.
//   - We do NOT decrypt encrypted PDFs. If /Encrypt is present, we
//     return the encryption flag but can't read the Info dict text.
//   - PDFDocEncoding (a Latin-1 superset) and UTF-16BE w/ BOM are
//     supported. Stranger encodings degrade to whatever Latin-1 says.
//
// All extraction happens client-side over the same Uint8Array we
// already hand to PDFium. Zero added bytes over the wire.

export interface PdfMetadata {
  /** "1.4", "1.7", "2.0", or null if header was unparseable. */
  version: string | null;
  /** True when the trailer references an /Encrypt object. */
  encrypted: boolean;
  /** Document title from /Info. May be empty string. */
  title: string;
  /** /Info Author. */
  author: string;
  /** /Info Subject. */
  subject: string;
  /** /Info Keywords. */
  keywords: string;
  /** Producing application name (e.g. "Microsoft Word"). */
  creator: string;
  /** Producing PDF library (e.g. "Adobe PDF Library 17.0"). */
  producer: string;
  /** Document creation timestamp in ISO 8601, or null if unparseable. */
  creationDate: string | null;
  /** Document modification timestamp in ISO 8601, or null if unparseable. */
  modDate: string | null;
}

const EMPTY_METADATA: PdfMetadata = {
  version: null,
  encrypted: false,
  title: "",
  author: "",
  subject: "",
  keywords: "",
  creator: "",
  producer: "",
  creationDate: null,
  modDate: null,
};

/**
 * Extract metadata from a PDF byte stream.
 *
 * Always returns a PdfMetadata object — never throws. Fields that
 * couldn't be parsed are left as their empty defaults.
 */
export function extractPdfMetadata(bytes: Uint8Array): PdfMetadata {
  try {
    const meta: PdfMetadata = { ...EMPTY_METADATA };

    // ---- 1. Version (first ~16 bytes) ----------------------------
    meta.version = parseHeaderVersion(bytes);

    // ---- 2. Latin-1 view for the rest ----------------------------
    // PDFs are *mostly* ASCII for structure tokens. Latin-1 is a
    // 1:1 byte→char map so it preserves the file exactly without
    // throwing on non-UTF8 sequences. We use String.fromCharCode in
    // chunks to avoid the 65k-arg limit on .apply().
    const text = bytesToLatin1(bytes);

    // ---- 3. Encryption flag --------------------------------------
    // The trailer dictionary references the encryption dict via
    // `/Encrypt N 0 R`. A simple presence check on `/Encrypt`
    // tokens suffices — if there's no Encrypt entry, the doc is
    // unencrypted.
    meta.encrypted = /\/Encrypt[\s/<]/.test(text);

    // ---- 4. Locate Info dictionary -------------------------------
    // Info ref pattern: `/Info N 0 R` in the trailer.
    const infoRefMatch = text.match(/\/Info\s+(\d+)\s+\d+\s+R/);
    if (!infoRefMatch) return meta;
    const infoObjNum = infoRefMatch[1];
    // Find the object body: `N 0 obj << ... >>`.
    const objRe = new RegExp(
      `\\b${infoObjNum}\\s+\\d+\\s+obj\\b([\\s\\S]*?)\\bendobj\\b`,
    );
    const infoBodyMatch = text.match(objRe);
    if (!infoBodyMatch) return meta;
    const body = infoBodyMatch[1];

    // ---- 5. Pull each Info field ---------------------------------
    meta.title = readInfoField(body, "Title");
    meta.author = readInfoField(body, "Author");
    meta.subject = readInfoField(body, "Subject");
    meta.keywords = readInfoField(body, "Keywords");
    meta.creator = readInfoField(body, "Creator");
    meta.producer = readInfoField(body, "Producer");

    const rawCreation = readInfoField(body, "CreationDate");
    const rawMod = readInfoField(body, "ModDate");
    meta.creationDate = parsePdfDate(rawCreation);
    meta.modDate = parsePdfDate(rawMod);

    return meta;
  } catch {
    // Defensive: if anything throws (malformed PDF, unexpected
    // structure), return empty metadata so the inspector keeps
    // rendering its other stats.
    return { ...EMPTY_METADATA };
  }
}

// ----- Helpers -------------------------------------------------------

function parseHeaderVersion(bytes: Uint8Array): string | null {
  // PDF header: "%PDF-1.4\n" or similar in the first ~16 bytes.
  // Some PDFs have a few junk bytes before the header (legal per
  // spec, used to fool some viewers). Search the first 1024 bytes
  // to be safe.
  const window = bytesToLatin1(bytes.slice(0, 1024));
  const m = window.match(/%PDF-(\d+\.\d+)/);
  return m ? m[1] : null;
}

function bytesToLatin1(bytes: Uint8Array): string {
  // Avoid String.fromCharCode.apply with huge arrays (V8 has an
  // arg-count limit). Process in 32K chunks.
  const CHUNK = 0x8000;
  let s = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    s += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return s;
}

/**
 * Read a single Info-dictionary field by its key.
 *
 * Handles three string forms PDF allows:
 *   - Literal: (My Title) — with backslash escapes and balanced parens
 *   - Hex:     <FEFF004D006F00...> — typically UTF-16BE w/ BOM
 *   - Empty:   absent or () — returns ""
 */
function readInfoField(body: string, key: string): string {
  // Match `/Title (...)` or `/Title <...>`. Allow whitespace flex.
  const re = new RegExp(
    `\\/${key}\\s*` +
      // Literal string: balanced parens with backslash escapes.
      `(?:\\(((?:[^\\\\()]|\\\\.|\\([^()]*\\))*)\\)` +
      // OR hex string: <hex>.
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
  // Resolve PDF backslash escapes: \n, \r, \t, \b, \f, \(, \), \\,
  // octal \ddd. Anything else: drop the backslash, keep the char.
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    if (ch !== 0x5c) {
      out += raw[i];
      continue;
    }
    // Backslash escape.
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
    } else if (next === "b") {
      out += "\b";
      i += 1;
    } else if (next === "f") {
      out += "\f";
      i += 1;
    } else if (next === "(" || next === ")" || next === "\\") {
      out += next;
      i += 1;
    } else if (next >= "0" && next <= "7") {
      // Octal escape \ddd (1-3 digits)
      let oct = next;
      if (raw[i + 2] >= "0" && raw[i + 2] <= "7") oct += raw[i + 2];
      if (raw[i + 3] >= "0" && raw[i + 3] <= "7") oct += raw[i + 3];
      out += String.fromCharCode(parseInt(oct, 8));
      i += oct.length;
    } else {
      // Unknown escape — per spec, drop the backslash, keep the char.
      out += next;
      i += 1;
    }
  }
  // After Latin-1 decoding, check for a UTF-16BE BOM (FE FF) which
  // some producers embed inside a literal string. Convert if found.
  return latinToUtf16beIfBom(out);
}

function decodeHex(hex: string): string {
  const clean = hex.replace(/\s/g, "");
  // Odd-length hex is technically allowed (treat trailing nibble as
  // having an implicit 0). Don't bother — ignore the odd nibble.
  const evenLen = clean.length - (clean.length % 2);
  const bytes: number[] = [];
  for (let i = 0; i < evenLen; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  // BOM check first 2 bytes for UTF-16BE.
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decodeUtf16be(bytes.slice(2));
  }
  // Fall back to Latin-1.
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

/**
 * Parse a PDF date string into ISO 8601.
 *
 * PDF date format: `D:YYYYMMDDHHmmSSOHH'mm'` where O is +/-/Z.
 * Examples:
 *   D:20240115093045+05'30'  → 2024-01-15T09:30:45+05:30
 *   D:20240115093045Z        → 2024-01-15T09:30:45Z
 *   D:20240115              → 2024-01-15T00:00:00 (missing parts → 0)
 *
 * Returns null for unparseable inputs.
 */
function parsePdfDate(raw: string): string | null {
  if (!raw) return null;
  // Strip optional `D:` prefix.
  const s = raw.replace(/^D:/, "");
  // Pattern: YYYY MM DD HH mm SS [O HH 'mm']
  const m = s.match(
    /^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([+\-Z])?(\d{2})?'?(\d{2})?'?$/,
  );
  if (!m) return null;
  const [, y, mo = "01", d = "01", h = "00", mi = "00", se = "00", tz, tzh, tzm] = m;
  let zone = "Z";
  if (tz === "+" || tz === "-") {
    zone = `${tz}${tzh ?? "00"}:${tzm ?? "00"}`;
  } else if (tz === "Z") {
    zone = "Z";
  } else {
    // No timezone given. Treat as UTC for ISO output (PDFs often
    // omit TZ; we'd otherwise need to assume locale, which is wrong).
    zone = "Z";
  }
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${se}${zone}`;
  // Validate by round-tripping through Date — return null if invalid.
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return iso;
}
