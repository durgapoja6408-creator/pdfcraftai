// lib/pdf/ops/fonts.ts
//
// Build 2 Wave 4 (2026-04-27): byte parser for PDF font resources.
// Walks every page's /Resources /Font dict, dedupes fonts that
// appear on multiple pages, surfaces base font name + subtype +
// embedded flag.
//
// Most useful for print-prep audiences: an unembedded font in your
// PDF will be substituted at the printer with whatever the printer
// has installed, often producing visibly wrong glyphs. Knowing
// what's embedded vs. referenced is a real production-workflow
// concern.
//
// PDF font structure per spec § 9.6 / § 9.7:
//
//   page → /Resources /Font << /F1 5 0 R /F2 6 0 R … >>
//   5 0 obj <<
//     /Type /Font
//     /Subtype /TrueType                ← or /Type1, /Type0, /CIDFontType…
//     /BaseFont /Helvetica-Bold         ← font name (PostScript-style)
//     /Encoding /WinAnsiEncoding
//     /FontDescriptor 7 0 R             ← descriptor with /FontFile* refs
//   >> endobj
//   7 0 obj << /FontDescriptor /FontFile 8 0 R … >> endobj
//   8 0 obj << /Length N /Filter /FlateDecode >> stream … endstream endobj
//
// "Embedded" means the FontDescriptor has a /FontFile, /FontFile2,
// or /FontFile3 ref pointing to the actual font program data.

export interface PdfFont {
  /** PostScript-style name, e.g. "Helvetica-Bold" or "ABCDEF+TimesNewRoman". */
  baseFont: string;
  /** Subtype: TrueType, Type1, Type0, etc. */
  subtype: string;
  /** True if a /FontFile* ref was found in the font descriptor. */
  embedded: boolean;
  /** True if the font is subsetted (BaseFont starts with 6-letter prefix
   *  followed by '+'). Common in modern PDFs to keep file sizes down. */
  subsetted: boolean;
  /** Pages where this font is referenced (1-based). */
  pages: number[];
  /** Object number (debug aid). */
  objectNumber: string;
}

export interface FontsResult {
  fonts: PdfFont[];
  totalCount: number;
  /** Number of fonts that are NOT embedded — print-prep risk signal. */
  nonEmbeddedCount: number;
  unsupported: boolean;
}

const EMPTY_RESULT: FontsResult = {
  fonts: [],
  totalCount: 0,
  nonEmbeddedCount: 0,
  unsupported: false,
};

const MAX_FONTS = 500;

export function extractFonts(bytes: Uint8Array): FontsResult {
  try {
    const text = bytesToLatin1(bytes);

    // Find catalog → /Pages root → walk page tree to enumerate pages.
    const rootMatch = text.match(/\/Root\s+(\d+)\s+\d+\s+R/);
    if (!rootMatch) return EMPTY_RESULT;
    const catalogBody = readObjectBody(text, rootMatch[1]);
    if (!catalogBody) return { ...EMPTY_RESULT, unsupported: true };
    const pagesRef = catalogBody.match(/\/Pages\s+(\d+)\s+\d+\s+R/);
    if (!pagesRef) return EMPTY_RESULT;

    // Walk page tree, collecting (pageNumber, fontResourceObjNum) pairs.
    const pageFontPairs: Array<{ page: number; fontObjNum: string }> = [];
    const pageCounter = { count: 0 };
    walkPageTreeForFonts(text, pagesRef[1], pageCounter, pageFontPairs, new Set());

    // Dedupe fonts by object number, accumulate pages.
    const byObjNum = new Map<string, PdfFont>();
    for (const { page, fontObjNum } of pageFontPairs) {
      let f = byObjNum.get(fontObjNum);
      if (!f) {
        const parsed = parseFontObject(text, fontObjNum);
        if (!parsed) continue;
        f = parsed;
        byObjNum.set(fontObjNum, f);
        if (byObjNum.size >= MAX_FONTS) break;
      }
      if (!f.pages.includes(page)) f.pages.push(page);
    }

    const fonts = Array.from(byObjNum.values()).sort((a, b) =>
      a.baseFont.localeCompare(b.baseFont),
    );
    const nonEmbeddedCount = fonts.filter((f) => !f.embedded).length;
    return {
      fonts,
      totalCount: fonts.length,
      nonEmbeddedCount,
      unsupported: false,
    };
  } catch {
    return { ...EMPTY_RESULT, unsupported: true };
  }
}

function walkPageTreeForFonts(
  text: string,
  nodeObjNum: string,
  counter: { count: number },
  out: Array<{ page: number; fontObjNum: string }>,
  seen: Set<string>,
): void {
  if (seen.has(nodeObjNum)) return;
  seen.add(nodeObjNum);
  const body = readObjectBody(text, nodeObjNum);
  if (!body) return;

  // /Type /Pages → recurse into /Kids.
  if (/\/Type\s*\/Pages\b/.test(body)) {
    const kidsMatch = body.match(/\/Kids\s*\[([\s\S]*?)\]/);
    if (!kidsMatch) return;
    const kidRefs = kidsMatch[1].match(/(\d+)\s+\d+\s+R/g) || [];
    for (const kr of kidRefs) {
      const kn = kr.match(/(\d+)/)?.[1];
      if (kn) walkPageTreeForFonts(text, kn, counter, out, seen);
    }
    return;
  }
  // /Type /Page → extract /Resources /Font dict refs.
  if (/\/Type\s*\/Page\b/.test(body)) {
    counter.count += 1;
    const pageNum = counter.count;
    // Resources can be inline or a ref.
    let resourcesBody: string | null = null;
    const resourcesRef = body.match(/\/Resources\s+(\d+)\s+\d+\s+R/);
    if (resourcesRef) {
      resourcesBody = readObjectBody(text, resourcesRef[1]);
    } else {
      const inline = body.match(/\/Resources\s*<<([\s\S]*?)>>/);
      if (inline) resourcesBody = inline[1];
    }
    if (!resourcesBody) return;
    // /Font << /F1 5 0 R /F2 6 0 R … >> — collect all refs.
    const fontDictMatch = resourcesBody.match(/\/Font\s*<<([\s\S]*?)>>/);
    if (!fontDictMatch) return;
    const fontRefs = fontDictMatch[1].match(/(\d+)\s+\d+\s+R/g) || [];
    for (const fr of fontRefs) {
      const fn = fr.match(/(\d+)/)?.[1];
      if (fn) out.push({ page: pageNum, fontObjNum: fn });
    }
  }
}

function parseFontObject(text: string, objNum: string): PdfFont | null {
  const body = readObjectBody(text, objNum);
  if (!body) return null;
  // Confirm it's a font (defensive — sometimes refs point at non-fonts in malformed PDFs)
  if (!/\/Type\s*\/Font\b/.test(body) && !/\/Subtype\s*\/(?:Type|TrueType|CIDFont)/.test(body)) {
    return null;
  }
  const subtypeMatch = body.match(/\/Subtype\s*\/(\w+)/);
  const baseFontMatch = body.match(/\/BaseFont\s*\/([^\s<>/[\]]+)/);
  const baseFont = baseFontMatch ? baseFontMatch[1] : "(unknown)";
  // Subsetted: 6-letter prefix + "+" + name (e.g. "ABCDEF+Arial").
  const subsetted = /^[A-Z]{6}\+/.test(baseFont);
  // Embedded: FontDescriptor → /FontFile* ref. For Type0 (composite),
  // the descriptor lives in /DescendantFonts[0]'s descriptor.
  let embedded = checkEmbedded(text, body);
  if (!embedded) {
    const descendantMatch = body.match(/\/DescendantFonts\s*\[\s*(\d+)\s+\d+\s+R/);
    if (descendantMatch) {
      const descBody = readObjectBody(text, descendantMatch[1]);
      if (descBody) embedded = checkEmbedded(text, descBody);
    }
  }
  return {
    baseFont,
    subtype: subtypeMatch ? subtypeMatch[1] : "",
    embedded,
    subsetted,
    pages: [],
    objectNumber: objNum,
  };
}

function checkEmbedded(text: string, fontBody: string): boolean {
  const fdMatch = fontBody.match(/\/FontDescriptor\s+(\d+)\s+\d+\s+R/);
  if (!fdMatch) {
    // Inline FontDescriptor dict — also check for FontFile* there.
    const inlineFd = fontBody.match(/\/FontDescriptor\s*<<([\s\S]*?)>>/);
    if (inlineFd) {
      return /\/FontFile[23]?\s+\d+\s+\d+\s+R/.test(inlineFd[1]);
    }
    return false;
  }
  const fdBody = readObjectBody(text, fdMatch[1]);
  if (!fdBody) return false;
  return /\/FontFile[23]?\s+\d+\s+\d+\s+R/.test(fdBody);
}

// ----- Shared helpers (duplicated for module independence) ----------

function bytesToLatin1(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let s = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    s += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return s;
}

function readObjectBody(text: string, objNum: string): string | null {
  const re = new RegExp(
    `\\b${escapeRegex(objNum)}\\s+\\d+\\s+obj\\b([\\s\\S]*?)\\bendobj\\b`,
  );
  const m = text.match(re);
  return m ? m[1] : null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
