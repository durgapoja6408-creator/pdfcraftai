// lib/pdf/ops/forms.ts
//
// Build 2 Wave 4 (2026-04-27): byte parser for PDF AcroForm fields.
// Same pattern as outline.ts and metadata.ts — direct Latin-1 view
// over PDF bytes, regex against object refs, no PDFium dependency.
//
// AcroForm structure per PDF 1.7 spec § 12.7.2:
//
//   trailer << /Root N 0 R >>
//   N 0 obj << /AcroForm K 0 R … >> endobj         ← Catalog
//   K 0 obj <<                                    ← AcroForm dict
//     /Fields [F1 0 R F2 0 R …]
//     /NeedAppearances true
//   >> endobj
//   F1 0 obj <<                                   ← Field
//     /T (FullName)               ← partial name
//     /FT /Tx                     ← field type (Tx/Btn/Ch/Sig)
//     /V (Jane Doe)               ← value
//     /Ff 1                       ← flags (read-only / required / etc.)
//     /Kids [G1 0 R G2 0 R …]    ← nested fields (optional)
//   >> endobj
//
// Field types per spec:
//   Tx  — text (default), email, signature line, date, etc.
//   Btn — button: pushbutton, checkbox, radio
//   Ch  — choice: list box, combo box
//   Sig — signature

export type FormFieldType = "text" | "button" | "choice" | "signature" | "unknown";

export interface FormField {
  /** Object number (debug aid). */
  objectNumber: string;
  /** Field name from /T. May be a leaf name or a dotted path with parents. */
  name: string;
  /** Coarse type bucket. */
  type: FormFieldType;
  /** Raw /FT subtype string for power users. */
  rawType: string;
  /** Current /V value if extractable. Empty string if absent or unparseable. */
  value: string;
  /** Field flags: required / readOnly / multiline / password. */
  flags: {
    readOnly: boolean;
    required: boolean;
    multiline: boolean;
    password: boolean;
  };
  /** Number of /Kids nested fields, 0 if none. */
  kidsCount: number;
}

export interface FormsResult {
  fields: FormField[];
  totalCount: number;
  /** True if this PDF has /AcroForm but the parser couldn't read it. */
  unsupported: boolean;
  /** True if /AcroForm reference was missing entirely (no form). */
  noFormPresent: boolean;
}

const EMPTY_RESULT: FormsResult = {
  fields: [],
  totalCount: 0,
  unsupported: false,
  noFormPresent: true,
};

const MAX_FIELDS = 1000;

export function extractFormFields(bytes: Uint8Array): FormsResult {
  try {
    const text = bytesToLatin1(bytes);
    const rootMatch = text.match(/\/Root\s+(\d+)\s+\d+\s+R/);
    if (!rootMatch) return EMPTY_RESULT;

    const catalogBody = readObjectBody(text, rootMatch[1]);
    if (!catalogBody) {
      return { ...EMPTY_RESULT, unsupported: true, noFormPresent: false };
    }
    // /AcroForm can be either an inline dict or a reference. Try ref first.
    const acroFormRef = catalogBody.match(/\/AcroForm\s+(\d+)\s+\d+\s+R/);
    let acroFormBody: string | null = null;
    if (acroFormRef) {
      acroFormBody = readObjectBody(text, acroFormRef[1]);
    } else {
      // Inline dict: /AcroForm << ... >>
      const inline = catalogBody.match(/\/AcroForm\s*<<([\s\S]*?)>>/);
      if (inline) acroFormBody = inline[1];
    }
    if (!acroFormBody) {
      return EMPTY_RESULT; // no AcroForm — not all PDFs have one.
    }

    // Extract /Fields array refs.
    const fieldsMatch = acroFormBody.match(/\/Fields\s*\[([\s\S]*?)\]/);
    if (!fieldsMatch) {
      return { ...EMPTY_RESULT, noFormPresent: false };
    }
    const refs = (fieldsMatch[1].match(/(\d+)\s+\d+\s+R/g) || []).map(
      (r) => r.match(/(\d+)/)![1],
    );

    const fields: FormField[] = [];
    const seen = new Set<string>();
    for (const ref of refs) {
      walkField(text, ref, "", fields, seen);
      if (fields.length >= MAX_FIELDS) break;
    }
    return {
      fields,
      totalCount: fields.length,
      unsupported: false,
      noFormPresent: false,
    };
  } catch {
    return { ...EMPTY_RESULT, unsupported: true, noFormPresent: false };
  }
}

function walkField(
  text: string,
  objNum: string,
  parentName: string,
  out: FormField[],
  seen: Set<string>,
): void {
  if (out.length >= MAX_FIELDS) return;
  if (seen.has(objNum)) return;
  seen.add(objNum);

  const body = readObjectBody(text, objNum);
  if (!body) return;

  const partialName = readPdfStringField(body, "T");
  const fullName = parentName
    ? partialName
      ? `${parentName}.${partialName}`
      : parentName
    : partialName;

  const ftMatch = body.match(/\/FT\s*\/(\w+)/);
  const rawType = ftMatch ? ftMatch[1] : "";
  const type: FormFieldType =
    rawType === "Tx"
      ? "text"
      : rawType === "Btn"
        ? "button"
        : rawType === "Ch"
          ? "choice"
          : rawType === "Sig"
            ? "signature"
            : rawType
              ? "unknown"
              : "unknown";

  // Value: prefer /V which can be a string, name (e.g. /Yes), or ref.
  let value = readPdfStringField(body, "V");
  if (!value) {
    // Name-token value, e.g. /V /Yes for a checked checkbox.
    const nameVal = body.match(/\/V\s*\/(\w+)/);
    if (nameVal) value = `/${nameVal[1]}`;
  }

  // Flag bits per PDF spec § 12.7.3.1.
  const ffMatch = body.match(/\/Ff\s+(-?\d+)/);
  const flags = ffMatch ? parseInt(ffMatch[1], 10) : 0;
  const readOnly = (flags & 1) !== 0;
  const required = (flags & 2) !== 0;
  // Tx-specific bits:
  //   bit 13 (4096) = Multiline
  //   bit 14 (8192) = Password
  const multiline = type === "text" && (flags & 0x1000) !== 0;
  const password = type === "text" && (flags & 0x2000) !== 0;

  // /Kids — nested fields. Either widget annotations (no /T of their
  // own) or a hierarchy where parents define common state.
  const kidsMatch = body.match(/\/Kids\s*\[([\s\S]*?)\]/);
  const kidsRefs = kidsMatch
    ? (kidsMatch[1].match(/(\d+)\s+\d+\s+R/g) || []).map(
        (r) => r.match(/(\d+)/)![1],
      )
    : [];

  // Only emit a field row if this object has a /FT (it's a real
  // field, not just a widget annotation). Pure widget kids are skipped.
  if (rawType) {
    out.push({
      objectNumber: objNum,
      name: fullName || "(unnamed)",
      type,
      rawType,
      value,
      flags: { readOnly, required, multiline, password },
      kidsCount: kidsRefs.length,
    });
  }

  // Recurse into kids that are themselves fields.
  for (const k of kidsRefs) {
    walkField(text, k, fullName, out, seen);
  }
}

// ----- Shared helpers (duplicated from outline.ts to keep the byte-
// parser modules independent — extracting a shared parser-utils
// module is a future cleanup) ---------------------------------------

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
