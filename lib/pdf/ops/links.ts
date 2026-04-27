// lib/pdf/ops/links.ts
//
// Build 2 Wave 8 (2026-04-27): extract every hyperlink in a PDF.
// Walks page /Annots arrays, filters /Subtype /Link, surfaces
// /A /URI for external links and /Dest for internal page refs.

import {
  bytesToLatin1,
  readObjectBody,
  readPdfStringField,
} from "./standards-helpers";

export interface PdfLink {
  /** 1-based page number where the link appears. */
  pageNumber: number;
  /** "external" for /URI, "internal" for /Dest, "other" for unknown. */
  type: "external" | "internal" | "other";
  /** External URL or destination description. */
  target: string;
  /** Optional rect of the link annotation [x1, y1, x2, y2]. */
  rect: [number, number, number, number] | null;
}

export interface LinksResult {
  links: PdfLink[];
  totalCount: number;
  externalCount: number;
  internalCount: number;
  unsupported: boolean;
}

const EMPTY_RESULT: LinksResult = {
  links: [],
  totalCount: 0,
  externalCount: 0,
  internalCount: 0,
  unsupported: false,
};

const MAX_LINKS = 2000;

export function extractLinks(bytes: Uint8Array): LinksResult {
  try {
    const text = bytesToLatin1(bytes);
    const links: PdfLink[] = [];

    // Walk page tree.
    const rootMatch = text.match(/\/Root\s+(\d+)\s+\d+\s+R/);
    if (!rootMatch) return EMPTY_RESULT;
    const catalogBody = readObjectBody(text, rootMatch[1]);
    if (!catalogBody) return { ...EMPTY_RESULT, unsupported: true };
    const pagesRef = catalogBody.match(/\/Pages\s+(\d+)\s+\d+\s+R/);
    if (!pagesRef) return EMPTY_RESULT;

    const ctx = { count: 0 };
    walkPages(text, pagesRef[1], ctx, links, new Set());

    const externalCount = links.filter((l) => l.type === "external").length;
    const internalCount = links.filter((l) => l.type === "internal").length;
    return {
      links,
      totalCount: links.length,
      externalCount,
      internalCount,
      unsupported: false,
    };
  } catch {
    return { ...EMPTY_RESULT, unsupported: true };
  }
}

function walkPages(
  text: string,
  nodeObjNum: string,
  ctx: { count: number },
  out: PdfLink[],
  seen: Set<string>,
): void {
  if (out.length >= MAX_LINKS) return;
  if (seen.has(nodeObjNum)) return;
  seen.add(nodeObjNum);
  const body = readObjectBody(text, nodeObjNum);
  if (!body) return;
  if (/\/Type\s*\/Pages\b/.test(body)) {
    const kidsMatch = body.match(/\/Kids\s*\[([\s\S]*?)\]/);
    if (!kidsMatch) return;
    const kidRefs = kidsMatch[1].match(/(\d+)\s+\d+\s+R/g) || [];
    for (const kr of kidRefs) {
      const kn = kr.match(/(\d+)/)?.[1];
      if (kn) walkPages(text, kn, ctx, out, seen);
    }
    return;
  }
  if (/\/Type\s*\/Page\b/.test(body)) {
    ctx.count += 1;
    const pageNum = ctx.count;
    // /Annots can be inline array or a ref to one.
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
      if (out.length >= MAX_LINKS) return;
      const an = ar.match(/(\d+)/)?.[1];
      if (!an) continue;
      const annotBody = readObjectBody(text, an);
      if (!annotBody) continue;
      // Only /Link annotations.
      if (!/\/Subtype\s*\/Link\b/.test(annotBody)) continue;
      const link = parseLinkAnnotation(annotBody, pageNum);
      if (link) out.push(link);
    }
  }
}

function parseLinkAnnotation(body: string, pageNum: number): PdfLink | null {
  // Rect [x1 y1 x2 y2]
  const rectMatch = body.match(
    /\/Rect\s*\[\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\]/,
  );
  const rect: [number, number, number, number] | null = rectMatch
    ? [
        parseFloat(rectMatch[1]),
        parseFloat(rectMatch[2]),
        parseFloat(rectMatch[3]),
        parseFloat(rectMatch[4]),
      ]
    : null;

  // External: /A << /S /URI /URI (https://...) >>
  const uriMatch = body.match(
    /\/A\s*<<[\s\S]*?\/URI\s*\(([^)]*)\)/,
  );
  if (uriMatch) {
    return {
      pageNumber: pageNum,
      type: "external",
      target: uriMatch[1],
      rect,
    };
  }

  // Some PDFs use /URI directly without nested /A
  const directUri = readPdfStringField(body, "URI");
  if (directUri) {
    return { pageNumber: pageNum, type: "external", target: directUri, rect };
  }

  // Internal: /Dest [page-ref /Fit] or named destination
  const destInline = body.match(/\/Dest\s*\[\s*(\d+)\s+\d+\s+R/);
  if (destInline) {
    return {
      pageNumber: pageNum,
      type: "internal",
      target: `Page object ${destInline[1]}`,
      rect,
    };
  }
  const destNamed = body.match(/\/Dest\s*\(([^)]+)\)/);
  if (destNamed) {
    return {
      pageNumber: pageNum,
      type: "internal",
      target: `Named: ${destNamed[1]}`,
      rect,
    };
  }
  // /A << /S /GoTo /D [page-ref] >>
  const gotoAction = body.match(/\/A\s*<<[\s\S]*?\/D\s*\[\s*(\d+)\s+\d+\s+R/);
  if (gotoAction) {
    return {
      pageNumber: pageNum,
      type: "internal",
      target: `Page object ${gotoAction[1]}`,
      rect,
    };
  }
  // Unknown action type
  return { pageNumber: pageNum, type: "other", target: "(unrecognized)", rect };
}
