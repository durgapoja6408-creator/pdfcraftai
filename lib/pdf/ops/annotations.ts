// lib/pdf/ops/annotations.ts
//
// Build 2 Wave 8: enumerate every annotation in a PDF except /Link
// (those go to lib/pdf/ops/links.ts).

import {
  bytesToLatin1,
  readObjectBody,
  readPdfStringField,
} from "./standards-helpers";

export interface PdfAnnotation {
  pageNumber: number;
  /** Raw /Subtype, e.g. "Highlight", "Text", "FreeText", "Ink". */
  subtype: string;
  /** /Contents text — comment body. */
  contents: string;
  /** /T — author / title (optional). */
  author: string;
  /** Creation date (ISO) or null. */
  creationDate: string | null;
  /** Modification date (ISO) or null. */
  modDate: string | null;
  /** /C color array as hex (e.g. #FFFF00) or null. */
  colorHex: string | null;
}

export interface AnnotationsResult {
  annotations: PdfAnnotation[];
  totalCount: number;
  unsupported: boolean;
}

const EMPTY_RESULT: AnnotationsResult = {
  annotations: [],
  totalCount: 0,
  unsupported: false,
};

const MAX_ANNOTATIONS = 2000;

// Skip these subtypes (handled elsewhere or not annotation content)
const SKIP_SUBTYPES = new Set(["Link", "Widget", "Popup"]);

export function extractAnnotations(bytes: Uint8Array): AnnotationsResult {
  try {
    const text = bytesToLatin1(bytes);
    const out: PdfAnnotation[] = [];
    const rootMatch = text.match(/\/Root\s+(\d+)\s+\d+\s+R/);
    if (!rootMatch) return EMPTY_RESULT;
    const catalogBody = readObjectBody(text, rootMatch[1]);
    if (!catalogBody) return { ...EMPTY_RESULT, unsupported: true };
    const pagesRef = catalogBody.match(/\/Pages\s+(\d+)\s+\d+\s+R/);
    if (!pagesRef) return EMPTY_RESULT;

    const ctx = { count: 0 };
    walkPages(text, pagesRef[1], ctx, out, new Set());

    return { annotations: out, totalCount: out.length, unsupported: false };
  } catch {
    return { ...EMPTY_RESULT, unsupported: true };
  }
}

function walkPages(
  text: string,
  nodeObjNum: string,
  ctx: { count: number },
  out: PdfAnnotation[],
  seen: Set<string>,
): void {
  if (out.length >= MAX_ANNOTATIONS) return;
  if (seen.has(nodeObjNum)) return;
  seen.add(nodeObjNum);
  const body = readObjectBody(text, nodeObjNum);
  if (!body) return;
  if (/\/Type\s*\/Pages\b/.test(body)) {
    const kids = body.match(/\/Kids\s*\[([\s\S]*?)\]/);
    if (!kids) return;
    const refs = kids[1].match(/(\d+)\s+\d+\s+R/g) || [];
    for (const r of refs) {
      const n = r.match(/(\d+)/)?.[1];
      if (n) walkPages(text, n, ctx, out, seen);
    }
    return;
  }
  if (/\/Type\s*\/Page\b/.test(body)) {
    ctx.count += 1;
    const pageNum = ctx.count;
    let annotsBody: string | null = null;
    const annotsRef = body.match(/\/Annots\s+(\d+)\s+\d+\s+R/);
    if (annotsRef) {
      const aBody = readObjectBody(text, annotsRef[1]);
      if (aBody) {
        const inline = aBody.match(/\[([\s\S]*?)\]/);
        if (inline) annotsBody = inline[1];
      }
    } else {
      const inline = body.match(/\/Annots\s*\[([\s\S]*?)\]/);
      if (inline) annotsBody = inline[1];
    }
    if (!annotsBody) return;
    const annotRefs = annotsBody.match(/(\d+)\s+\d+\s+R/g) || [];
    for (const ar of annotRefs) {
      if (out.length >= MAX_ANNOTATIONS) return;
      const an = ar.match(/(\d+)/)?.[1];
      if (!an) continue;
      const annotBody = readObjectBody(text, an);
      if (!annotBody) continue;
      const subMatch = annotBody.match(/\/Subtype\s*\/(\w+)/);
      const subtype = subMatch ? subMatch[1] : "";
      if (!subtype || SKIP_SUBTYPES.has(subtype)) continue;
      out.push({
        pageNumber: pageNum,
        subtype,
        contents: readPdfStringField(annotBody, "Contents"),
        author: readPdfStringField(annotBody, "T"),
        creationDate: parsePdfDate(readPdfStringField(annotBody, "CreationDate")),
        modDate: parsePdfDate(readPdfStringField(annotBody, "M")),
        colorHex: parseColor(annotBody),
      });
    }
  }
}

function parseColor(body: string): string | null {
  // /C [r g b] with floats 0..1
  const m = body.match(/\/C\s*\[\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\]/);
  if (!m) return null;
  const toHex = (f: number) => {
    const i = Math.round(Math.max(0, Math.min(1, parseFloat(String(f)))) * 255);
    return i.toString(16).padStart(2, "0");
  };
  return `#${toHex(parseFloat(m[1]))}${toHex(parseFloat(m[2]))}${toHex(parseFloat(m[3]))}`;
}

function parsePdfDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.replace(/^D:/, "");
  const m = s.match(
    /^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([+\-Z])?(\d{2})?'?(\d{2})?'?$/,
  );
  if (!m) return null;
  const [, y, mo = "01", d = "01", h = "00", mi = "00", se = "00", tz, tzh, tzm] = m;
  let zone = "Z";
  if (tz === "+" || tz === "-") zone = `${tz}${tzh ?? "00"}:${tzm ?? "00"}`;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${se}${zone}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}
