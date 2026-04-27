// lib/pdf/ops/javascript.ts
//
// Build 2 Wave 8: detect every JavaScript handler embedded in a
// PDF. Security tool — JavaScript in PDFs has been used for
// phishing, credential exfiltration, and malware delivery, so
// knowing what's in there matters for security review.

import { bytesToLatin1, readObjectBody } from "./standards-helpers";

export interface JsHandler {
  /** Where the JS lives — document, page, form-field, link, named-script. */
  location: "document" | "page" | "form-field" | "link" | "named" | "other";
  /** Trigger description (e.g. "OpenAction", "Mouse Up", "Validate"). */
  trigger: string;
  /** First ~200 chars of the actual JS code. */
  preview: string;
  /** Full code length in chars (so user can see a "200 of 5,000 chars" hint). */
  codeLength: number;
  /** Severity heuristic. */
  severity: "low" | "medium" | "high";
}

export interface JsResult {
  handlers: JsHandler[];
  totalCount: number;
  hasJavaScript: boolean;
  unsupported: boolean;
}

const EMPTY_RESULT: JsResult = {
  handlers: [],
  totalCount: 0,
  hasJavaScript: false,
  unsupported: false,
};

const MAX_HANDLERS = 200;

export function detectJavaScript(bytes: Uint8Array): JsResult {
  try {
    const text = bytesToLatin1(bytes);
    const handlers: JsHandler[] = [];

    // Strategy: find every occurrence of /JS (...) or /JS <hex> or
    // /JS N 0 R (ref to a stream). Walk back to find the enclosing
    // /Subtype or /S to figure out what triggered it.
    const jsRefRegex = /\/JS\s+(\d+)\s+\d+\s+R/g;
    const jsLiteralRegex = /\/JS\s*\(([^)]*)\)/g;
    const jsStreamRegex = /\/JS\s*<([0-9A-Fa-f\s]*)>/g;

    let m: RegExpExecArray | null;

    // /JS N 0 R — code lives in a separate stream object.
    while ((m = jsRefRegex.exec(text)) !== null) {
      if (handlers.length >= MAX_HANDLERS) break;
      const refObj = readObjectBody(text, m[1]);
      let code = "";
      if (refObj) {
        // The stream code is between "stream" and "endstream".
        const streamMatch = refObj.match(/stream\s*\n([\s\S]*?)\nendstream/);
        if (streamMatch) code = streamMatch[1];
      }
      const ctx = surroundingContext(text, m.index);
      handlers.push(buildHandler(ctx, code));
    }

    // /JS (literal code)
    while ((m = jsLiteralRegex.exec(text)) !== null) {
      if (handlers.length >= MAX_HANDLERS) break;
      const ctx = surroundingContext(text, m.index);
      handlers.push(buildHandler(ctx, m[1]));
    }

    // /JS <hex>
    while ((m = jsStreamRegex.exec(text)) !== null) {
      if (handlers.length >= MAX_HANDLERS) break;
      const ctx = surroundingContext(text, m.index);
      const hex = m[1].replace(/\s/g, "");
      let code = "";
      try {
        for (let i = 0; i + 1 < hex.length; i += 2) {
          code += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
        }
      } catch {
        // ignore
      }
      handlers.push(buildHandler(ctx, code));
    }

    return {
      handlers,
      totalCount: handlers.length,
      hasJavaScript: handlers.length > 0,
      unsupported: false,
    };
  } catch {
    return { ...EMPTY_RESULT, unsupported: true };
  }
}

interface JsContext {
  location: JsHandler["location"];
  trigger: string;
}

function surroundingContext(text: string, jsIdx: number): JsContext {
  // Look back ~500 chars to figure out what dictionary this /JS is in.
  const window = text.slice(Math.max(0, jsIdx - 500), jsIdx);

  // Action types: /S /JavaScript or /S /Named etc.
  // Look for /Subtype near the action.
  if (/\/Subtype\s*\/Link\b/.test(window)) {
    return { location: "link", trigger: "Link click" };
  }
  if (/\/Subtype\s*\/Widget\b/.test(window)) {
    return { location: "form-field", trigger: "Form field event" };
  }
  // OpenAction in catalog.
  if (/\/OpenAction\b/.test(window)) {
    return { location: "document", trigger: "Document open" };
  }
  // Additional actions /AA — could be document, page, or field.
  if (/\/AA\b/.test(window)) {
    if (/\/Type\s*\/Page\b/.test(window)) {
      return { location: "page", trigger: "Page action" };
    }
    return { location: "form-field", trigger: "Field event (AA)" };
  }
  // Names tree.
  if (/\/Names\s*\[/.test(window) || /\/JavaScript\b/.test(window)) {
    return { location: "named", trigger: "Named JavaScript" };
  }
  return { location: "other", trigger: "Unknown trigger" };
}

function buildHandler(ctx: JsContext, code: string): JsHandler {
  const cleanCode = code.replace(/\s+/g, " ").trim();
  const preview = cleanCode.slice(0, 200);
  return {
    location: ctx.location,
    trigger: ctx.trigger,
    preview,
    codeLength: cleanCode.length,
    severity: classifySeverity(cleanCode),
  };
}

function classifySeverity(code: string): "low" | "medium" | "high" {
  const lower = code.toLowerCase();
  // High: dynamic content, network, file system access
  if (
    /\bxhr\b|fetch\(|importdata|loadxml|exportasfile|launchurl|launchurlwindow|submitform|net\.|jspath|app\.execdialog|app\.beep|app\.alert\(.*url/i.test(
      lower,
    )
  ) {
    return "high";
  }
  // Medium: form-field manipulation, validation, calc
  if (/getfield|setfield|event\.|app\.alert|af_|validate|calculate/i.test(lower)) {
    return "medium";
  }
  return "low";
}
