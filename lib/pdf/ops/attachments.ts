// lib/pdf/ops/attachments.ts
//
// Build 2 Wave 4 (2026-04-27): byte parser for embedded files in
// PDFs. Surfaces the names + sizes of attachments without
// extracting the actual file bytes (which would require handling
// FlateDecode + other stream filters — separate work).
//
// Embedded-files structure per PDF 1.7 spec § 7.11.4:
//
//   trailer << /Root N 0 R >>
//   N 0 obj << /Names M 0 R … >> endobj             ← Catalog
//   M 0 obj << /EmbeddedFiles K 0 R … >> endobj      ← Names dict
//   K 0 obj << /Names [(name1) F1 0 R (name2) F2 0 R …] >> endobj
//   F1 0 obj <<                                     ← Filespec
//     /Type /Filespec
//     /F (myattachment.txt)              ← filename (legacy)
//     /UF (myattachment.txt)             ← filename (Unicode)
//     /Desc (Description text)
//     /EF << /F E1 0 R /UF E1 0 R >>     ← embedded file refs
//   >> endobj
//   E1 0 obj << /Type /EmbeddedFile /Length 1234
//     /Subtype /text#2Fplain >>
//   stream
//     ...bytes...
//   endstream endobj

export interface PdfAttachment {
  /** Filename as it appears in the PDF. */
  filename: string;
  /** Optional description from /Desc. Empty string if absent. */
  description: string;
  /** Optional MIME type from /Subtype. Empty string if absent. */
  mimeType: string;
  /** Raw byte length of the embedded stream from /Length. -1 if unknown. */
  sizeBytes: number;
  /** Object number of the Filespec (debug aid). */
  filespecObjectNumber: string;
}

export interface AttachmentsResult {
  attachments: PdfAttachment[];
  totalCount: number;
  /** True if /Names tree exists but parsing failed. */
  unsupported: boolean;
}

const EMPTY_RESULT: AttachmentsResult = {
  attachments: [],
  totalCount: 0,
  unsupported: false,
};

const MAX_ATTACHMENTS = 500;

export function extractAttachments(bytes: Uint8Array): AttachmentsResult {
  try {
    const text = bytesToLatin1(bytes);

    // trailer → /Root → catalog
    const rootMatch = text.match(/\/Root\s+(\d+)\s+\d+\s+R/);
    if (!rootMatch) return EMPTY_RESULT;
    const catalogBody = readObjectBody(text, rootMatch[1]);
    if (!catalogBody) return { ...EMPTY_RESULT, unsupported: true };

    // catalog → /Names → /EmbeddedFiles
    // /Names can be inline dict or ref.
    let namesDictBody: string | null = null;
    const namesRef = catalogBody.match(/\/Names\s+(\d+)\s+\d+\s+R/);
    if (namesRef) {
      namesDictBody = readObjectBody(text, namesRef[1]);
    } else {
      const inline = catalogBody.match(/\/Names\s*<<([\s\S]*?)>>/);
      if (inline) namesDictBody = inline[1];
    }
    if (!namesDictBody) return EMPTY_RESULT; // legitimately no embedded files

    // /EmbeddedFiles ref → name tree root
    const embeddedRef = namesDictBody.match(/\/EmbeddedFiles\s+(\d+)\s+\d+\s+R/);
    if (!embeddedRef) return EMPTY_RESULT;
    const embeddedRootBody = readObjectBody(text, embeddedRef[1]);
    if (!embeddedRootBody) return { ...EMPTY_RESULT, unsupported: true };

    // Walk the name tree. The simple case is a single-leaf tree with
    // /Names [(name) F 0 R …]. Larger PDFs use /Kids subtrees.
    const filespecRefs: Array<{ name: string; ref: string }> = [];
    walkNameTree(text, embeddedRootBody, filespecRefs);
    if (filespecRefs.length === 0) return EMPTY_RESULT;

    const attachments: PdfAttachment[] = [];
    for (const { name, ref } of filespecRefs) {
      if (attachments.length >= MAX_ATTACHMENTS) break;
      const filespecBody = readObjectBody(text, ref);
      if (!filespecBody) continue;
      const filename =
        readPdfStringField(filespecBody, "UF") ||
        readPdfStringField(filespecBody, "F") ||
        name;
      const description = readPdfStringField(filespecBody, "Desc");
      // /EF << /F refToStream /UF refToStream >> — find the stream ref.
      const efMatch = filespecBody.match(
        /\/EF\s*<<([\s\S]*?)(?:>>|\bendobj)/,
      );
      let sizeBytes = -1;
      let mimeType = "";
      if (efMatch) {
        const streamRefMatch =
          efMatch[1].match(/\/UF\s+(\d+)\s+\d+\s+R/) ||
          efMatch[1].match(/\/F\s+(\d+)\s+\d+\s+R/);
        if (streamRefMatch) {
          const streamBody = readObjectBody(text, streamRefMatch[1]);
          if (streamBody) {
            // /Length N or /Length N 0 R (indirect length — best-effort)
            const lenMatch = streamBody.match(/\/Length\s+(\d+)(?:\s+\d+\s+R)?/);
            if (lenMatch) sizeBytes = parseInt(lenMatch[1], 10);
            // /Subtype /text#2Fplain → "text/plain" (unescape #-encoded slashes)
            const subMatch = streamBody.match(/\/Subtype\s*\/(\S+)/);
            if (subMatch) {
              mimeType = subMatch[1].replace(/#2F/gi, "/").replace(/#2E/gi, ".");
            }
          }
        }
      }
      attachments.push({
        filename,
        description,
        mimeType,
        sizeBytes,
        filespecObjectNumber: ref,
      });
    }

    return {
      attachments,
      totalCount: attachments.length,
      unsupported: false,
    };
  } catch {
    return { ...EMPTY_RESULT, unsupported: true };
  }
}

/**
 * Walk a name-tree node. Either /Names [(name) ref (name) ref …] for
 * a leaf or /Kids [N 0 R N 0 R …] for an intermediate node.
 */
function walkNameTree(
  text: string,
  body: string,
  out: Array<{ name: string; ref: string }>,
  depth = 0,
): void {
  if (depth > 10) return;
  if (out.length >= MAX_ATTACHMENTS) return;
  const namesMatch = body.match(/\/Names\s*\[([\s\S]*?)\]/);
  if (namesMatch) {
    // Pairs of (name) ref. The name can be a literal or hex string.
    // Use a global regex to find each pair sequentially.
    const pairsText = namesMatch[1];
    const pairRe = /(?:\(((?:[^\\()]|\\.|\([^()]*\))*)\)|<([0-9A-Fa-f\s]*)>)\s*(\d+)\s+\d+\s+R/g;
    let m: RegExpExecArray | null;
    while ((m = pairRe.exec(pairsText)) !== null) {
      const literal = m[1];
      const hex = m[2];
      const ref = m[3];
      let name: string;
      if (literal !== undefined) {
        name = decodeLiteral(literal);
      } else if (hex !== undefined) {
        name = decodeHex(hex);
      } else {
        name = "(unknown)";
      }
      out.push({ name, ref });
      if (out.length >= MAX_ATTACHMENTS) return;
    }
  }
  // Kids subtree
  const kidsMatch = body.match(/\/Kids\s*\[([\s\S]*?)\]/);
  if (kidsMatch) {
    const kidRefs = kidsMatch[1].match(/(\d+)\s+\d+\s+R/g) || [];
    for (const kr of kidRefs) {
      const kn = kr.match(/(\d+)/)?.[1];
      if (!kn) continue;
      const kidBody = readObjectBody(text, kn);
      if (kidBody) walkNameTree(text, kidBody, out, depth + 1);
      if (out.length >= MAX_ATTACHMENTS) return;
    }
  }
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
