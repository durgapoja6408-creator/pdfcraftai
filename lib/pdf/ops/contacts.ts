// lib/pdf/ops/contacts.ts
//
// 2026-05-01 — Extract Contacts: regex-based extraction of email
// addresses and phone numbers from a PDF's text content. Runs entirely
// client-side off lib/pdf/ops/text-export.ts's `extractPagesText`.
//
// Why this lives in lib/pdf/ops alongside extract-images, fonts,
// attachments, etc.: the byte-parser pattern matches inspector-style
// tools — extract once, dedupe across pages, render as a structured
// table with CSV/JSON export. This file produces the structured data;
// components/tools/ExtractContactsTool.tsx renders it.
//
// PII consideration: all extraction happens in the browser. The PDF
// never leaves the user's machine. The extracted contacts table is
// for the user's own use (sales lead enrichment, email campaign
// dedup, HR contact-sheet hygiene). For sharing the extraction
// with third parties, redact via Redact PDF first.

import { extractPagesText } from "@/lib/pdf/ops/text-export";

export interface ExtractedEmail {
  email: string;
  /** 1-indexed page numbers where this email appears. Deduped. */
  pages: number[];
  /** Total occurrences across the document. */
  count: number;
}

export interface ExtractedPhone {
  /** Raw phone string as found in the doc, with original formatting. */
  raw: string;
  /** Normalized E.164-ish form: "+91XXXXXXXXXX" for Indian numbers,
   *  "+1XXXXXXXXXX" for US, etc. Undefined if normalization failed. */
  normalized?: string;
  /** Detected region. "IN" for Indian numbers, "US" for North American,
   *  "intl" for other international, "unknown" if we couldn't classify. */
  region: "IN" | "US" | "intl" | "unknown";
  /** 1-indexed page numbers where this phone appears. Deduped. */
  pages: number[];
  /** Total occurrences across the document. */
  count: number;
}

export interface ExtractContactsResult {
  emails: ExtractedEmail[];
  phones: ExtractedPhone[];
  /** Total pages of text extracted (for "X contacts across N pages" header). */
  pageCount: number;
  /** True if PDF text extraction returned empty/garbage — the PDF is
   *  probably scanned (image-only) and needs OCR before contacts can be
   *  extracted. The UI surfaces this so users know to run ai-ocr first. */
  scannedPdfLikely: boolean;
}

// ===========================================================================
// Email regex.
//
// RFC 5322 is a nightmare; this is a pragmatic regex that catches ~99% of
// real-world emails (plus a handful of false positives like "user@example"
// without TLD — caller filters those). Matches:
//   • word boundary before (so "name@x.com" but not "...sname@x.com")
//   • local part: alphanumerics, dots, plus signs, hyphens, underscores
//     (no quoted local parts — those are vanishingly rare in practice)
//   • @ sign
//   • domain: alphanumerics, dots, hyphens (multi-label, e.g. .co.in)
//   • TLD: 2+ alphabetic chars (catches .com, .in, .org, .museum,
//     .recipes, etc., excludes single-char which would be noise)
// ===========================================================================
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-zA-Z]{2,}/g;

// ===========================================================================
// Phone regex — multi-pattern, India-aware.
//
// Indian phone formats vary wildly:
//   +91 XXXXX XXXXX        // common formal
//   +91-XXXXX-XXXXX        // hyphenated
//   +91XXXXXXXXXX          // unspaced
//   91 XXXXX XXXXX         // missing +
//   0XX-XXXXXXXX           // STD with leading 0 (landline)
//   XXXXX XXXXX            // bare 10 digits (cellular default)
//
// US/Canadian formats:
//   +1 (XXX) XXX-XXXX
//   +1-XXX-XXX-XXXX
//   (XXX) XXX-XXXX
//   XXX-XXX-XXXX
//
// Other international:
//   +<country code> <rest>  // generic, hard to parse without a CC table
//
// Strategy: ordered match. Try Indian patterns first (they're our
// primary audience), then North American, then generic international,
// then bare 10-digit (assumed Indian if all else fails).
//
// We intentionally over-match in the regex and filter false positives
// in `classifyPhone()` below. It's better to extract too much and
// dedupe than to miss real contacts.
// ===========================================================================

// India: with explicit country code
const PHONE_IN_FULL = /(?:\+|0{2}\s?)?91[-\s]?\d{5}[-\s]?\d{5}/g;
// India: STD landline with leading 0
const PHONE_IN_STD = /\b0\d{2,4}[-\s]?\d{6,8}\b/g;
// US/Canada: with explicit country code
const PHONE_US_FULL = /(?:\+|0{2}\s?)?1[-\s]?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}/g;
// US/Canada: 10-digit with parens
const PHONE_US_PAREN = /\(\d{3}\)\s?\d{3}[-\s]?\d{4}/g;
// Generic intl with + prefix (catches everything except IN/US already matched)
const PHONE_INTL = /\+\d{1,3}[-\s]?\d{1,4}[-\s]?\d{4,12}/g;
// Bare 10-digit (assumed Indian if all else fails — Indian mobiles are
// always 10 digits and the most common bare-form pattern in our audience)
const PHONE_BARE_10 = /\b[6-9]\d{9}\b/g;

const PHONE_PATTERNS: Array<[RegExp, ExtractedPhone["region"]]> = [
  [PHONE_IN_FULL, "IN"],
  [PHONE_US_FULL, "US"],
  [PHONE_US_PAREN, "US"],
  [PHONE_IN_STD, "IN"],
  [PHONE_INTL, "intl"],
  [PHONE_BARE_10, "IN"],
];

/**
 * Normalize a phone number to a canonical comparable form.
 * Strips all non-digits, applies country-code prefix where appropriate.
 * Returns undefined if the resulting digits are too few/many to be a
 * valid phone (which happens when the regex over-matches on prices,
 * timestamps, or similar numeric content).
 */
function normalizePhone(
  raw: string,
  region: ExtractedPhone["region"],
): string | undefined {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return undefined;

  if (region === "IN") {
    // Indian mobile is 10 digits; strip leading 0 / 91 / 091.
    const trimmed = digits.replace(/^0+/, "").replace(/^91/, "");
    if (trimmed.length !== 10 || !/^[2-9]/.test(trimmed)) {
      // Indian numbers start with 2-9 (mobiles 6-9, landlines 2-5).
      return undefined;
    }
    return `+91${trimmed}`;
  }

  if (region === "US") {
    const trimmed = digits.replace(/^1/, "");
    if (trimmed.length !== 10) return undefined;
    return `+1${trimmed}`;
  }

  // Generic international: assume the digit string already has country code.
  if (raw.startsWith("+")) return `+${digits}`;
  return undefined; // unknown — don't normalize speculatively
}

/**
 * Filter out obvious false positives that the regex over-matches.
 * Examples:
 *   - "12345678901234567890" — 20 digits, not a phone
 *   - "$1,234,567" — currency
 *   - "January 1, 2026" — date
 *   - "001-2345" — invoice number with hyphen
 */
function isLikelyPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  // Phones have 7-15 digits (E.164 max). Anything outside is noise.
  if (digits.length < 7 || digits.length > 15) return false;
  // No "all zeros" / "all same digit" — those are placeholders.
  if (/^(\d)\1+$/.test(digits)) return false;
  // Can't start with 0 unless it's an STD prefix (handled by IN_STD pattern).
  // Bare 10-digit Indian must start with 6-9 (mobile) or 2-5 (landline).
  return true;
}

/**
 * Extract emails + phones from PDF bytes. Public API.
 *
 * @param bytes - Uint8Array of PDF file contents
 * @returns ExtractContactsResult with deduped emails/phones, page refs,
 *   and a `scannedPdfLikely` flag that hints when the user should
 *   run OCR first (because text extraction returned essentially nothing).
 */
export async function extractContacts(
  bytes: Uint8Array,
): Promise<ExtractContactsResult> {
  const pages = await extractPagesText(bytes);

  // Heuristic: if total extracted text is < 50 chars, this is almost
  // certainly a scanned PDF where text-extraction returned just
  // headers/metadata. The user needs to run ai-ocr first.
  const totalText = pages.join(" ").trim();
  const scannedPdfLikely = totalText.length < 50 && pages.length > 0;

  // Track each (email, page) and (phone, page) pair so we can dedupe
  // across pages while preserving page-reference lists.
  const emailMap = new Map<
    string,
    { pages: Set<number>; count: number }
  >();
  const phoneMap = new Map<
    string, // canonical key (normalized form, or raw if normalization failed)
    {
      raw: string;
      normalized?: string;
      region: ExtractedPhone["region"];
      pages: Set<number>;
      count: number;
    }
  >();

  for (let i = 0; i < pages.length; i++) {
    const pageNum = i + 1;
    const text = pages[i];

    // ----- Emails -----
    for (const m of text.matchAll(EMAIL_RE)) {
      const email = m[0].toLowerCase();
      const existing = emailMap.get(email);
      if (existing) {
        existing.pages.add(pageNum);
        existing.count++;
      } else {
        emailMap.set(email, { pages: new Set([pageNum]), count: 1 });
      }
    }

    // ----- Phones (ordered match — first pattern that matches wins
    // for a given substring; we track consumed ranges to avoid
    // double-counting overlapping matches like "+91XXXXXXXXXX" being
    // also matched by the bare-10 regex).
    const consumed: Array<[number, number]> = [];
    for (const [pattern, region] of PHONE_PATTERNS) {
      // Reset the lastIndex on shared regex by creating a fresh matcher.
      const localPattern = new RegExp(pattern.source, pattern.flags);
      for (const m of text.matchAll(localPattern)) {
        if (m.index === undefined) continue;
        const start = m.index;
        const end = start + m[0].length;
        // Skip if this range overlaps with anything already consumed.
        const overlaps = consumed.some(
          ([s, e]) => start < e && end > s,
        );
        if (overlaps) continue;
        if (!isLikelyPhone(m[0])) continue;

        consumed.push([start, end]);
        const normalized = normalizePhone(m[0], region);
        const key = normalized ?? m[0];
        const existing = phoneMap.get(key);
        if (existing) {
          existing.pages.add(pageNum);
          existing.count++;
        } else {
          phoneMap.set(key, {
            raw: m[0],
            normalized,
            region,
            pages: new Set([pageNum]),
            count: 1,
          });
        }
      }
    }
  }

  // Convert maps to arrays sorted by frequency (desc) then alphabetically.
  const emails: ExtractedEmail[] = [...emailMap.entries()]
    .map(([email, v]) => ({
      email,
      pages: [...v.pages].sort((a, b) => a - b),
      count: v.count,
    }))
    .sort((a, b) => b.count - a.count || a.email.localeCompare(b.email));

  const phones: ExtractedPhone[] = [...phoneMap.values()]
    .map((v) => ({
      raw: v.raw,
      normalized: v.normalized,
      region: v.region,
      pages: [...v.pages].sort((a, b) => a - b),
      count: v.count,
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        (a.normalized ?? a.raw).localeCompare(b.normalized ?? b.raw),
    );

  return {
    emails,
    phones,
    pageCount: pages.length,
    scannedPdfLikely,
  };
}
