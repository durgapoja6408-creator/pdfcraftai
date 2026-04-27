// lib/pdf/ops/outline.ts
//
// Build 2 Wave 4 (2026-04-27): byte-stream parser for the PDF
// outline (bookmarks) tree. Extends the pattern used in P5
// metadata.ts — direct Latin-1 view over the raw bytes, regex
// against object refs, no PDFium dependency.
//
// Outline structure per PDF 1.7 spec § 12.3.3:
//
//   trailer << /Root N 0 R >>
//   N 0 obj << /Outlines M 0 R … >> endobj         ← Catalog
//   M 0 obj << /First K 0 R /Last L 0 R … >> endobj  ← Outline root
//   K 0 obj <<
//     /Title (Chapter 1)
//     /Parent M 0 R
//     /First J 0 R       ← children (optional)
//     /Next  P 0 R       ← next sibling (optional)
//     /Dest [12 0 R /Fit] ← destination (optional)
//     /Count 5
//   >> endobj
//
// We walk the tree via /First and /Next refs, collecting title +
// destination page (when extractable) for each item.
//
// Limitations honestly stated:
//   - PDFs with cross-reference STREAMS (PDF 1.5+) compress object
//     locations in ways this byte scanner can't follow into
//     compressed object streams. We catch the simple case where
//     outline items are stored as direct (non-compressed) objects.
//   - Destination resolution to page numbers is best-effort. Some
//     /Dest values reference named destinations (an extra
//     dereference layer) which we don't follow yet.
//   - Encrypted PDFs are not decrypted — outline text will be
//     gibberish or empty in those cases.

export interface OutlineNode {
  /** Display label as it appears in the PDF. */
  title: string;
  /** Nesting depth from the outline root (0 = top level). */
  depth: number;
  /** Best-effort 1-based page number, or null if unresolvable. */
  pageNumber: number | null;
  /** Object number of this outline item (debug aid). */
  objectNumber: string;
}

export interface OutlineResult {
  /** Flat array — caller renders as a tree using `depth`. */
  nodes: OutlineNode[];
  /** Total bookmarks found (== nodes.length). */
  totalCount: number;
  /** True if we tried but couldn't extract a usable outline. Could
   * mean no outline exists, or the PDF uses cross-ref streams. */
  unsupported: boolean;
}

const EMPTY_RESULT: OutlineResult = {
  nodes: [],
  totalCount: 0,
  unsupported: false,
};

const MAX_NODES = 2000; // Sanity cap to avoid runaway pathological PDFs.
const MAX_DEPTH = 20;

/**
 * Extract the outline (bookmarks) tree from a PDF.
 *
 * Always returns an OutlineResult — never throws. If the PDF has no
 * outline, or the byte parser can't follow the structure, returns
 * an empty array with `unsupported: false` (legitimately empty) or
 * `unsupported: true` (couldn't parse).
 */
export function extractOutline(bytes: Uint8Array): OutlineResult {
  try {
    const text = bytesToLatin1(bytes);

    // Find /Root N 0 R in trailer.
    const rootMatch = text.match(/\/Root\s+(\d+)\s+\d+\s+R/);
    if (!rootMatch) return EMPTY_RESULT;

    // Catalog object → /Outlines M 0 R.
    const catalogBody = readObjectBody(text, rootMatch[1]);
    if (!catalogBody) return { ...EMPTY_RESULT, unsupported: true };
    const outlinesRef = catalogBody.match(/\/Outlines\s+(\d+)\s+\d+\s+R/);
    if (!outlinesRef) return EMPTY_RESULT; // No outline — legitimately empty.

    // Outline root → /First K 0 R.
    const outlineRootBody = readObjectBody(text, outlinesRef[1]);
    if (!outlineRootBody) return { ...EMPTY_RESULT, unsupported: true };
    const firstRef = outlineRootBody.match(/\/First\s+(\d+)\s+\d+\s+R/);
    if (!firstRef) return EMPTY_RESULT;

    // Walk the tree.
    const nodes: OutlineNode[] = [];
    const seen = new Set<string>(); // Cycle guard — pathological PDFs.
    walk(text, firstRef[1], 0, nodes, seen);
    return {
      nodes,
      totalCount: nodes.length,
      unsupported: false,
    };
  } catch {
    return { ...EMPTY_RESULT, unsupported: true };
  }
}

// ----- Walker -------------------------------------------------------

function walk(
  text: string,
  startObjNum: string,
  depth: number,
  out: OutlineNode[],
  seen: Set<string>,
): void {
  if (depth > MAX_DEPTH) return;
  let currentObjNum: string | null = startObjNum;
  while (currentObjNum && out.length < MAX_NODES) {
    if (seen.has(currentObjNum)) return; // Cycle.
    seen.add(currentObjNum);

    const body = readObjectBody(text, currentObjNum);
    if (!body) return;

    const title = readPdfStringField(body, "Title");
    const pageNumber = resolveDestPage(text, body);
    out.push({ title, depth, pageNumber, objectNumber: currentObjNum });

    // Recurse into children if /First present.
    const firstChildRef = body.match(/\/First\s+(\d+)\s+\d+\s+R/);
    if (firstChildRef) {
      walk(text, firstChildRef[1], depth + 1, out, seen);
    }

    // Move to next sibling.
    const nextRef = body.match(/\/Next\s+(\d+)\s+\d+\s+R/);
    currentObjNum = nextRef ? nextRef[1] : null;
  }
}

// ----- Helpers ------------------------------------------------------

function bytesToLatin1(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let s = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    s += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return s;
}

/** Find `N 0 obj << ... >> endobj` and return the dict body. */
function readObjectBody(text: string, objNum: string): string | null {
  // Match the object header. Generation number is usually 0 but allow any.
  const re = new RegExp(
    `\\b${escapeRegex(objNum)}\\s+\\d+\\s+obj\\b([\\s\\S]*?)\\bendobj\\b`,
  );
  const m = text.match(re);
  return m ? m[1] : null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Read a /Title-style string field. Reuses the same literal/hex/UTF-16BE
 * decoding as the metadata extractor.
 */
function readPdfStringField(body: string, key: string): string {
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

/**
 * Best-effort: resolve an outline item's `/Dest` to a 1-based page
 * number. Handles the common case `/Dest [N 0 R /Fit]` where N is
 * the page object. Doesn't follow named-destination references
 * (those require an extra catalog lookup we skip here).
 */
function resolveDestPage(text: string, body: string): number | null {
  // /Dest [12 0 R /Fit ...]
  const destInline = body.match(/\/Dest\s*\[\s*(\d+)\s+\d+\s+R/);
  if (destInline) {
    return resolvePageNumber(text, destInline[1]);
  }
  // /A << /D [12 0 R /Fit] >> (action with destination)
  const action = body.match(/\/A\s*<<[\s\S]*?\/D\s*\[\s*(\d+)\s+\d+\s+R/);
  if (action) {
    return resolvePageNumber(text, action[1]);
  }
  return null;
}

/**
 * Walk the page tree to find the 1-based index of the page object
 * referenced by `pageObjNum`. We do this by counting all page-leaf
 * objects in document order until we hit the target.
 *
 * This is O(P) per call and called once per outline item. For huge
 * outlines this could be slow; an indexed lookup would be ~free
 * after a one-time scan. The straightforward approach is fine for v1.
 */
function resolvePageNumber(text: string, pageObjNum: string): number | null {
  // Find the catalog → /Pages root.
  const root = text.match(/\/Root\s+(\d+)\s+\d+\s+R/);
  if (!root) return null;
  const catalog = readObjectBody(text, root[1]);
  if (!catalog) return null;
  const pagesRef = catalog.match(/\/Pages\s+(\d+)\s+\d+\s+R/);
  if (!pagesRef) return null;
  // Walk the page tree, return 1-based index when we find the target.
  const ctx = { count: 0, target: pageObjNum, found: -1 };
  walkPageTree(text, pagesRef[1], ctx, new Set());
  return ctx.found > 0 ? ctx.found : null;
}

function walkPageTree(
  text: string,
  nodeObjNum: string,
  ctx: { count: number; target: string; found: number },
  seen: Set<string>,
): void {
  if (ctx.found > 0) return;
  if (seen.has(nodeObjNum)) return;
  seen.add(nodeObjNum);
  const body = readObjectBody(text, nodeObjNum);
  if (!body) return;
  // Pages node: /Type /Pages with /Kids
  if (/\/Type\s*\/Pages\b/.test(body)) {
    // Extract /Kids [N 0 R N 0 R …]
    const kidsMatch = body.match(/\/Kids\s*\[([\s\S]*?)\]/);
    if (!kidsMatch) return;
    const kidRefs = kidsMatch[1].match(/(\d+)\s+\d+\s+R/g);
    if (!kidRefs) return;
    for (const kr of kidRefs) {
      const kn = kr.match(/(\d+)/)?.[1];
      if (kn) walkPageTree(text, kn, ctx, seen);
      if (ctx.found > 0) return;
    }
    return;
  }
  // Page leaf: /Type /Page (no 's')
  if (/\/Type\s*\/Page\b/.test(body)) {
    ctx.count += 1;
    if (nodeObjNum === ctx.target) ctx.found = ctx.count;
  }
}
