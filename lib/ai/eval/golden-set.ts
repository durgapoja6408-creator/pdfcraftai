/**
 * Phase A / Task #14 — golden-set fixtures.
 *
 * v1 coverage focuses on the ops most at-risk from recent changes:
 *   - `translate` — primary flipped Gemini→gpt-4o-mini in Task #4
 *     (2026-04-21, commit 4139098). Translate is the #1 regression
 *     candidate in Phase A.
 *   - `summarize` — output cap tightened in Task #11 + routed
 *     through batch in Task #13. Truncation + preamble are top
 *     risks.
 *   - `compare` / `rewrite` — short-form structured ops where
 *     gpt-4o-mini was promoted; want numeric + identifier
 *     preservation checks.
 *   - `table` / `redact` — structured JSON ops; need
 *     `isValidJson` + `jsonHasKeys`.
 *
 * Not in v1:
 *   - `ocr` — needs real PDF bytes, defer to Phase B.
 *   - `chat` — multi-turn fixture; defer to Phase B after we
 *     decide on the canonical harness for chat sessions.
 *   - `generate` / `sign` — defer; low regression risk from recent
 *     changes.
 *
 * When a Phase B author adds a fixture: `(op, id)` must be unique,
 * and every `checks[].kind` must resolve to a `RUBRIC_CHECKS` entry.
 * scripts/test-ai-evals.mjs asserts both.
 */

import type { GoldenItem } from "./types";

export const GOLDEN_SET: GoldenItem[] = [
  /* ------------------------------------------------------------------ */
  /* TRANSLATE                                                           */
  /* ------------------------------------------------------------------ */
  {
    id: "translate-es-financial",
    label: "Translate EN → ES, preserve numbers + ticker symbols",
    op: "translate",
    input: {
      text:
        "Apple Inc. (AAPL) reported Q4 2025 revenue of $94.9B, up 6% year-over-year. " +
        "The company repurchased 112M shares at an average price of $228.50. " +
        "CFO Luca Maestri cited strength in Services (+16%) and iPhone (+2.8%).",
      targetLang: "es",
    },
    checks: [
      { id: "non-empty", label: "Output is non-empty", weight: 10, kind: "outputNonEmpty" },
      { id: "no-preamble", label: "No conversational preamble", weight: 10, kind: "noPreamble" },
      {
        id: "numerics",
        label: "All numbers preserved",
        weight: 30,
        kind: "numericPreservation",
        args: {
          sourceText:
            "Apple Inc. (AAPL) reported Q4 2025 revenue of $94.9B, up 6% year-over-year. " +
            "The company repurchased 112M shares at an average price of $228.50. " +
            "CFO Luca Maestri cited strength in Services (+16%) and iPhone (+2.8%).",
        },
      },
      {
        id: "identifiers",
        label: "Ticker + proper-noun identifiers preserved",
        weight: 25,
        kind: "codeIdentifierPassthrough",
        args: {
          sourceText:
            "Apple Inc. (AAPL) reported Q4 2025 revenue of $94.9B, up 6% year-over-year. " +
            "The company repurchased 112M shares at an average price of $228.50. " +
            "CFO Luca Maestri cited strength in Services (+16%) and iPhone (+2.8%).",
        },
      },
      {
        id: "spanish-markers",
        label: "Output contains Spanish language markers",
        weight: 25,
        kind: "languageMarker",
        args: { targetLang: "es" },
      },
    ],
  },
  {
    id: "translate-fr-technical",
    label: "Translate EN → FR, preserve UUID + commit SHA",
    op: "translate",
    input: {
      text:
        "The incident (id: 7f3e1a2b-4c8d-49fa-bd12-0abc9def1234) was caused by a " +
        "regression in commit abc12345. Rollback to the previous release returned " +
        "error rate to 0.12% within 8 minutes.",
      targetLang: "fr",
    },
    checks: [
      { id: "non-empty", label: "Output is non-empty", weight: 10, kind: "outputNonEmpty" },
      { id: "no-preamble", label: "No conversational preamble", weight: 10, kind: "noPreamble" },
      {
        id: "numerics",
        label: "All numbers preserved",
        weight: 25,
        kind: "numericPreservation",
        args: {
          sourceText:
            "The incident (id: 7f3e1a2b-4c8d-49fa-bd12-0abc9def1234) was caused by a " +
            "regression in commit abc12345. Rollback to the previous release returned " +
            "error rate to 0.12% within 8 minutes.",
        },
      },
      {
        id: "identifiers",
        label: "UUID + commit SHA passed through",
        weight: 30,
        kind: "codeIdentifierPassthrough",
        args: {
          sourceText:
            "The incident (id: 7f3e1a2b-4c8d-49fa-bd12-0abc9def1234) was caused by a " +
            "regression in commit abc12345. Rollback to the previous release returned " +
            "error rate to 0.12% within 8 minutes.",
        },
      },
      {
        id: "french-markers",
        label: "Output contains French language markers",
        weight: 25,
        kind: "languageMarker",
        args: { targetLang: "fr" },
      },
    ],
  },
  {
    id: "translate-de-short",
    label: "Translate EN → DE short form, no preamble",
    op: "translate",
    input: {
      text: "Please return the items within 30 days for a full refund.",
      targetLang: "de",
    },
    checks: [
      { id: "non-empty", label: "Output is non-empty", weight: 20, kind: "outputNonEmpty" },
      { id: "no-preamble", label: "No conversational preamble", weight: 30, kind: "noPreamble" },
      {
        id: "numerics",
        label: "Number 30 preserved",
        weight: 20,
        kind: "numericPreservation",
        args: { sourceText: "Please return the items within 30 days for a full refund." },
      },
      {
        id: "german-markers",
        label: "Output contains German language markers",
        weight: 30,
        kind: "languageMarker",
        args: { targetLang: "de" },
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* SUMMARIZE                                                           */
  /* ------------------------------------------------------------------ */
  {
    id: "summarize-financial-brief",
    label: "Summarize financial report, preserve numbers, no preamble",
    op: "summarize",
    input: {
      text:
        "In Q3 2025, GlobalCorp (GCRP) reported revenue of $2.4B against $2.1B in Q3 2024, " +
        "representing 14.3% YoY growth. Operating margin expanded 180 basis points to 22.4%. " +
        "Free cash flow reached $512M, up from $387M. The company returned $300M to " +
        "shareholders via dividends and repurchased 4.2M shares at an average price of $71.50. " +
        "Guidance for Q4: revenue $2.55B–$2.65B, EPS $1.42–$1.48. Three segments drove growth: " +
        "Cloud (+22%), Enterprise Software (+11%), and Consumer (+4%).",
      depth: "brief",
    },
    checks: [
      { id: "non-empty", label: "Output is non-empty", weight: 10, kind: "outputNonEmpty" },
      { id: "no-preamble", label: "No conversational preamble", weight: 15, kind: "noPreamble" },
      {
        id: "numerics",
        label: "Key numbers preserved (≥ 80%)",
        weight: 40,
        kind: "numericPreservation",
        args: {
          minMatchesBps: 8000,
          sourceText:
            "In Q3 2025, GlobalCorp (GCRP) reported revenue of $2.4B against $2.1B in Q3 2024, " +
            "representing 14.3% YoY growth. Operating margin expanded 180 basis points to 22.4%. " +
            "Free cash flow reached $512M, up from $387M. The company returned $300M to " +
            "shareholders via dividends and repurchased 4.2M shares at an average price of $71.50. " +
            "Guidance for Q4: revenue $2.55B–$2.65B, EPS $1.42–$1.48. Three segments drove growth: " +
            "Cloud (+22%), Enterprise Software (+11%), and Consumer (+4%).",
        },
      },
      {
        id: "cap",
        label: "Output within brief summarize cap",
        weight: 20,
        kind: "outputLengthWithinCap",
        // Summarize brief cap is ~512 tokens per output-caps.ts — allow
        // 4 chars/token → ~2048 chars, with some slack.
        args: { maxChars: 2400 },
      },
      {
        id: "ticker",
        label: "GCRP ticker preserved",
        weight: 15,
        kind: "containsAll",
        args: { phrases: ["GCRP"] },
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* COMPARE                                                             */
  /* ------------------------------------------------------------------ */
  {
    id: "compare-contract-versions",
    label: "Compare two contract clauses, mention both sides",
    op: "compare",
    input: {
      a: "Contract v1: Vendor shall deliver goods within 30 days of purchase order. Late delivery incurs 2% penalty per week.",
      b: "Contract v2: Vendor shall deliver goods within 21 days of purchase order. Late delivery incurs 3% penalty per week, capped at 15%.",
    },
    checks: [
      { id: "non-empty", label: "Output is non-empty", weight: 10, kind: "outputNonEmpty" },
      { id: "no-preamble", label: "No conversational preamble", weight: 10, kind: "noPreamble" },
      {
        id: "numerics",
        label: "All key numbers preserved",
        weight: 40,
        kind: "numericPreservation",
        args: {
          minMatchesBps: 8000,
          sourceText:
            "Contract v1: Vendor shall deliver goods within 30 days of purchase order. Late delivery incurs 2% penalty per week. " +
            "Contract v2: Vendor shall deliver goods within 21 days of purchase order. Late delivery incurs 3% penalty per week, capped at 15%.",
        },
      },
      {
        id: "mentions-both",
        label: "References both versions",
        weight: 40,
        kind: "containsAll",
        args: { phrases: ["30", "21"] },
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* REWRITE                                                             */
  /* ------------------------------------------------------------------ */
  {
    id: "rewrite-formal-to-casual",
    label: "Rewrite formal→casual, preserve identifiers",
    op: "rewrite",
    input: {
      text:
        "Please note that the API_VERSION has been updated from 2.3 to 2.4. " +
        "All clients must migrate by 2026-06-30. Contact support@example.com with questions.",
      tone: "casual",
    },
    checks: [
      { id: "non-empty", label: "Output is non-empty", weight: 15, kind: "outputNonEmpty" },
      { id: "no-preamble", label: "No conversational preamble", weight: 15, kind: "noPreamble" },
      {
        id: "numerics",
        label: "Dates + versions preserved",
        weight: 30,
        kind: "numericPreservation",
        args: {
          sourceText:
            "Please note that the API_VERSION has been updated from 2.3 to 2.4. " +
            "All clients must migrate by 2026-06-30. Contact support@example.com with questions.",
        },
      },
      {
        id: "identifiers",
        label: "API_VERSION + support email preserved",
        weight: 40,
        kind: "codeIdentifierPassthrough",
        args: {
          sourceText:
            "Please note that the API_VERSION has been updated from 2.3 to 2.4. " +
            "All clients must migrate by 2026-06-30. Contact support@example.com with questions.",
        },
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* TABLE                                                               */
  /* ------------------------------------------------------------------ */
  {
    id: "table-extract-line-items",
    label: "Extract invoice line items as JSON",
    op: "table",
    input: {
      text:
        "Invoice #INV-20260415-0042\n" +
        "Line items:\n" +
        "- Widget Pro, qty 3, unit $29.99, total $89.97\n" +
        "- Gadget Plus, qty 1, unit $149.00, total $149.00\n" +
        "- Service fee, qty 1, unit $15.00, total $15.00\n" +
        "Subtotal: $253.97\n" +
        "Tax (8.5%): $21.59\n" +
        "Total: $275.56",
    },
    checks: [
      { id: "valid-json", label: "Output parses as JSON", weight: 40, kind: "isValidJson" },
      {
        id: "has-keys",
        label: "Each row has item/qty/total keys",
        weight: 30,
        kind: "jsonHasKeys",
        // Tolerates common naming variants by letting the fixture author
        // pin the exact expected keys. If the model uses different
        // casing, the table op's prompt is the thing to fix — the test
        // is acting as the spec here.
        args: { keys: ["item"] },
      },
      {
        id: "numerics",
        label: "All prices preserved",
        weight: 30,
        kind: "numericPreservation",
        args: {
          minMatchesBps: 9000,
          sourceText:
            "Invoice #INV-20260415-0042\n" +
            "- Widget Pro, qty 3, unit $29.99, total $89.97\n" +
            "- Gadget Plus, qty 1, unit $149.00, total $149.00\n" +
            "- Service fee, qty 1, unit $15.00, total $15.00\n" +
            "Subtotal: $253.97\n" +
            "Tax (8.5%): $21.59\n" +
            "Total: $275.56",
        },
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* REDACT                                                              */
  /* ------------------------------------------------------------------ */
  {
    id: "redact-pii-contact",
    label: "Redact email + phone, leave the rest intact",
    op: "redact",
    input: {
      text:
        "Contact John Smith at john.smith@example.com or (555) 123-4567 for the " +
        "latest on order #ORD-98765. Office hours 9am-5pm EST.",
    },
    checks: [
      { id: "non-empty", label: "Output is non-empty", weight: 10, kind: "outputNonEmpty" },
      {
        id: "no-email",
        label: "Original email is redacted",
        weight: 30,
        kind: "containsNone",
        args: { phrases: ["john.smith@example.com"] },
      },
      {
        id: "no-phone",
        label: "Original phone is redacted",
        weight: 30,
        kind: "containsNone",
        args: { phrases: ["(555) 123-4567", "555-123-4567", "5551234567"] },
      },
      {
        id: "preserves-context",
        label: "Order id + hours retained",
        weight: 30,
        kind: "containsAll",
        args: { phrases: ["ORD-98765"] },
      },
    ],
  },
];

/**
 * Indexed lookup — runner.ts and the test harness both use this.
 */
export function goldenSetForOp(op: string): GoldenItem[] {
  return GOLDEN_SET.filter((g) => g.op === op);
}

/**
 * Total fixture count. Reported on CLI startup so regressions in
 * fixture coverage (e.g. an accidental `.filter()` in a future
 * refactor) show up immediately.
 */
export function goldenSetSize(): number {
  return GOLDEN_SET.length;
}
