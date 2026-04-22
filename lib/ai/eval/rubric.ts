/**
 * Phase A / Task #14 — deterministic rubric primitives.
 *
 * Every function here is PURE:
 *   - no network I/O, no disk I/O
 *   - no randomness
 *   - no Date.now (rubric scores must be reproducible across runs)
 *   - no provider/model awareness (we score the OUTPUT, not the
 *     generation process)
 *
 * This is the load-bearing constraint. A nightly floor alarm (Phase B)
 * compares yesterday's trailing-7d pass rate vs. today's. If a
 * rubric check is non-deterministic the alarm becomes noise.
 *
 * Each primitive returns `{ passed: 0 | 1, detail?: string }`. The
 * runner wraps them into a `RubricCheckResult` with the fixture's
 * declared id/label/weight.
 *
 * When adding a new primitive:
 *   1. Add to `RubricCheckKind` in types.ts.
 *   2. Implement here with the same name.
 *   3. Add to `RUBRIC_CHECKS` dispatch map at the bottom.
 *   4. scripts/test-ai-evals.mjs asserts dispatch coverage — a missing
 *      entry fails the test.
 */

import type { RubricCheckKind } from "./types";

/** Internal shape every primitive returns. */
export type CheckOutcome = { passed: 0 | 1; detail?: string };

/**
 * #1. Output is a non-empty trimmed string.
 *
 * Catches the most common silent regression: an adapter returns
 * stopReason="max_tokens" with zero text, or the model emits pure
 * whitespace. Cheap, catches a lot.
 */
export function outputNonEmpty(output: string): CheckOutcome {
  if (typeof output !== "string") {
    return { passed: 0, detail: `output is ${typeof output}, not string` };
  }
  if (output.trim().length === 0) {
    return { passed: 0, detail: "output is empty or whitespace-only" };
  }
  return { passed: 1 };
}

/**
 * #2. Every number (integer or decimal) that appears in the input is
 *     present, character-for-character, in the output.
 *
 * Critical for summarize + translate + compare — a model that
 * hallucinates "$1.2B" into "$1.5B" or drops a page count is the #1
 * quality failure mode. Treats numeric tokens as literal strings, not
 * value-equal (so "1,000" and "1000" do NOT match — that's a real
 * distortion in most financial contexts).
 *
 * `args`:
 *   - `minMatchesBps` (default 10000): fraction of input numbers that
 *     must be preserved. Set to e.g. 8000 for noisy sources where
 *     citing every page number isn't expected.
 *   - `sourceText`: the input text to extract numbers from.
 */
export function numericPreservation(
  output: string,
  args: { sourceText: string; minMatchesBps?: number }
): CheckOutcome {
  const min = args.minMatchesBps ?? 10000;
  const source = args.sourceText ?? "";
  // Capture integers, decimals, and negative values — but NOT dates,
  // phone numbers, or version strings embedded in identifiers. A
  // number is bounded by word boundaries or end-of-string.
  const NUM_RE = /(?<![\w.-])-?\d+(?:\.\d+)?(?![\w.])/g;
  const nums = Array.from(source.matchAll(NUM_RE), (m) => m[0]);
  if (nums.length === 0) {
    // No numbers to preserve → vacuously passes. Avoids false-fail
    // on fixtures that don't contain numbers (e.g. some sign/chat
    // cases).
    return { passed: 1 };
  }
  const present = nums.filter((n) => output.includes(n)).length;
  const bps = Math.round((present / nums.length) * 10000);
  if (bps < min) {
    const missing = nums.filter((n) => !output.includes(n));
    return {
      passed: 0,
      detail: `numeric preservation ${bps}bps < ${min}bps; missing ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`,
    };
  }
  return { passed: 1 };
}

/**
 * #3. Output does NOT start with a conversational preamble.
 *
 * M4 (2026-04-21) tightened every op's system prompt to forbid
 * "Sure, here is…" / "I'll translate…" preambles — they waste output
 * tokens (which we pay for) and clutter the UX. This check pins the
 * behaviour so a prompt regression shows up in evals immediately.
 *
 * Heuristic: if the first 120 chars (case-insensitive) start with any
 * of the known preamble phrases, fail. The list is deliberately short
 * and conservative; false-positives on legitimate content that just
 * happens to start with "Here" are preferable to false-negatives.
 */
const PREAMBLE_PHRASES = [
  "sure,",
  "sure!",
  "of course",
  "certainly,",
  "here is the",
  "here's the",
  "here is your",
  "here's your",
  "i'll ",
  "i will ",
  "let me ",
  "okay, ",
  "ok, ",
  "as requested",
  "as you requested",
  "below is the",
  "below you'll find",
];

export function noPreamble(output: string): CheckOutcome {
  const head = output.trim().slice(0, 120).toLowerCase();
  for (const phrase of PREAMBLE_PHRASES) {
    if (head.startsWith(phrase)) {
      return {
        passed: 0,
        detail: `output starts with preamble phrase: "${head.slice(0, 40)}…"`,
      };
    }
  }
  return { passed: 1 };
}

/**
 * #4. Code identifiers (UUIDs, SKUs, commit SHAs, email addresses,
 *     ticker symbols) present in the input are preserved verbatim
 *     in the output.
 *
 * Translate + rewrite are the main risks: a model that translates
 * "AAPL" → "Manzana" or lowercases "SHA=abcd1234" is a data-corruption
 * bug, not a style bug.
 *
 * Identifier heuristic:
 *   - UUID v4 (8-4-4-4-12 hex)
 *   - Commit SHA (7+ hex)
 *   - Email address
 *   - UPPER_SNAKE_CASE tokens ≥ 3 chars (env vars, constants)
 *   - Ticker-like 1–5 all-caps tokens surrounded by word boundaries
 *
 * `args`:
 *   - `sourceText`: input text to scan for identifiers.
 */
export function codeIdentifierPassthrough(
  output: string,
  args: { sourceText: string }
): CheckOutcome {
  const source = args.sourceText ?? "";
  const patterns: RegExp[] = [
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    /\b[0-9a-f]{7,40}\b/g, // commit SHA (also matches hex numbers; benign)
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    /\b[A-Z][A-Z0-9_]{2,}\b/g, // UPPER_SNAKE_CASE
  ];
  const found = new Set<string>();
  for (const re of patterns) {
    for (const m of source.matchAll(re)) found.add(m[0]);
  }
  if (found.size === 0) return { passed: 1 };
  const missing: string[] = [];
  for (const ident of found) {
    if (!output.includes(ident)) missing.push(ident);
  }
  if (missing.length > 0) {
    return {
      passed: 0,
      detail: `missing identifiers: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`,
    };
  }
  return { passed: 1 };
}

/**
 * #5. Output length is within the op's declared max_output_tokens cap.
 *
 * Task #11 tightened caps per op; this check catches the silent
 * `stopReason="max_tokens"` case where the adapter returns a
 * mid-sentence truncation. We measure CHARACTERS not tokens because
 * tokenization varies across providers — a 4:1 char:token heuristic
 * is good enough for a regression alarm.
 *
 * `args`:
 *   - `maxChars`: upper bound. Typically passed by the runner from
 *     `capForOp(op)` * 4.
 */
export function outputLengthWithinCap(
  output: string,
  args: { maxChars: number }
): CheckOutcome {
  if (output.length > args.maxChars) {
    return {
      passed: 0,
      detail: `output length ${output.length} > ${args.maxChars} (likely hit max_output_tokens)`,
    };
  }
  return { passed: 1 };
}

/**
 * #6. Output contains every substring in `args.phrases` (case-sensitive).
 *
 * For fixtures that need "must mention key X, Y, Z" coverage — e.g.
 * a compare op should reference both side-A and side-B names.
 */
export function containsAll(
  output: string,
  args: { phrases: string[] }
): CheckOutcome {
  const missing = (args.phrases ?? []).filter((p) => !output.includes(p));
  if (missing.length > 0) {
    return {
      passed: 0,
      detail: `missing required phrases: ${missing.slice(0, 5).join(", ")}`,
    };
  }
  return { passed: 1 };
}

/**
 * #7. Output contains NONE of the substrings in `args.phrases`.
 *
 * For negative checks: translate output shouldn't contain the source
 * language's pronouns verbatim; redact output shouldn't contain the
 * redacted SSN.
 */
export function containsNone(
  output: string,
  args: { phrases: string[] }
): CheckOutcome {
  const present = (args.phrases ?? []).filter((p) => output.includes(p));
  if (present.length > 0) {
    return {
      passed: 0,
      detail: `forbidden phrases present: ${present.slice(0, 5).join(", ")}`,
    };
  }
  return { passed: 1 };
}

/**
 * #8. Output matches a regex.
 *
 * `args`:
 *   - `pattern`: regex source.
 *   - `flags`: regex flags (default "").
 *   - `expectMatch`: default true; flip to false to assert the regex
 *     does NOT match.
 */
export function matchesRegex(
  output: string,
  args: { pattern: string; flags?: string; expectMatch?: boolean }
): CheckOutcome {
  const expect = args.expectMatch ?? true;
  let re: RegExp;
  try {
    re = new RegExp(args.pattern, args.flags ?? "");
  } catch (err) {
    return { passed: 0, detail: `rubric bug: invalid regex ${args.pattern}` };
  }
  const matched = re.test(output);
  if (matched === expect) return { passed: 1 };
  return {
    passed: 0,
    detail: `regex /${args.pattern}/${args.flags ?? ""} expectMatch=${expect} but matched=${matched}`,
  };
}

/**
 * #9. Output is valid JSON.
 *
 * For `table` and sometimes `redact`. Tolerates code-fence wrapping
 * (```json ... ```) — a lot of models hand-roll the fence despite
 * being told not to; the app layer strips it, so the rubric should
 * too.
 */
export function isValidJson(output: string): CheckOutcome {
  const stripped = stripCodeFence(output);
  try {
    JSON.parse(stripped);
    return { passed: 1 };
  } catch (err) {
    return {
      passed: 0,
      detail: `JSON parse failed: ${(err as Error).message}`,
    };
  }
}

/**
 * #10. Output parses as JSON and contains all `args.keys` at the top
 *      level. Array-of-objects: every element must have every key.
 */
export function jsonHasKeys(
  output: string,
  args: { keys: string[] }
): CheckOutcome {
  const stripped = stripCodeFence(output);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    return { passed: 0, detail: `JSON parse failed: ${(err as Error).message}` };
  }
  const keys = args.keys ?? [];
  if (Array.isArray(parsed)) {
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      if (!item || typeof item !== "object") {
        return { passed: 0, detail: `array element ${i} is not an object` };
      }
      for (const k of keys) {
        if (!(k in (item as Record<string, unknown>))) {
          return { passed: 0, detail: `array[${i}] missing key "${k}"` };
        }
      }
    }
    return { passed: 1 };
  }
  if (parsed && typeof parsed === "object") {
    for (const k of keys) {
      if (!(k in (parsed as Record<string, unknown>))) {
        return { passed: 0, detail: `missing top-level key "${k}"` };
      }
    }
    return { passed: 1 };
  }
  return {
    passed: 0,
    detail: `parsed JSON is ${typeof parsed}, not object or array`,
  };
}

/**
 * #11. Output "looks like" the expected target language for translate.
 *
 * NOT a real language detector — that would introduce a dependency +
 * non-determinism across model versions. Instead we check for
 * language-characteristic features:
 *   - Spanish (`es`): presence of "ñ", "¿", "¡", or any of {el, la,
 *     los, las, de, que, es, y} as standalone words
 *   - French (`fr`): "ç", "à", "é", "è", or {le, la, les, de, que,
 *     est, et}
 *   - German (`de`): "ß", "ä", "ö", "ü", or {der, die, das, ist, und}
 *   - Japanese (`ja`): Hiragana (U+3040–U+309F) or Katakana (U+30A0–U+30FF)
 *
 * False-positives are possible on short outputs (a single English
 * "de" word in a source would match fr/es). The check treats a
 * fixture as "translated" if the output has at least TWO distinct
 * language markers.
 *
 * `args`:
 *   - `targetLang`: ISO 639-1 code. Only "es", "fr", "de", "ja"
 *     supported in v1; adding more is a type-safe append here.
 */
const LANG_MARKERS: Record<string, { chars: RegExp; words: string[] }> = {
  es: {
    chars: /[ñ¿¡áéíóú]/i,
    words: ["el", "la", "los", "las", "de", "que", "es", "y", "un", "una"],
  },
  fr: {
    chars: /[çàâéèêëîïôùûü]/i,
    words: ["le", "la", "les", "de", "que", "est", "et", "un", "une", "des"],
  },
  de: {
    chars: /[ßäöü]/i,
    words: ["der", "die", "das", "ist", "und", "ein", "eine", "nicht"],
  },
  ja: {
    chars: /[\u3040-\u309F\u30A0-\u30FF]/,
    words: [],
  },
};

export function languageMarker(
  output: string,
  args: { targetLang: string }
): CheckOutcome {
  const lang = args.targetLang;
  const rule = LANG_MARKERS[lang];
  if (!rule) {
    return {
      passed: 0,
      detail: `rubric bug: unsupported targetLang "${lang}" (supported: ${Object.keys(LANG_MARKERS).join(", ")})`,
    };
  }
  let markers = 0;
  if (rule.chars.test(output)) markers += 1;
  const lowered = output.toLowerCase();
  for (const w of rule.words) {
    const wre = new RegExp(`\\b${w}\\b`);
    if (wre.test(lowered)) {
      markers += 1;
      if (markers >= 2) break;
    }
  }
  if (markers < 2) {
    return {
      passed: 0,
      detail: `only ${markers} "${lang}" language markers in output`,
    };
  }
  return { passed: 1 };
}

/* ------------------------------------------------------------------ */
/* Internal helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Strip a ```language ... ``` code fence if present. Idempotent: if
 * there's no fence, returns the input unchanged. Handles `json`,
 * `js`, and no-language variants.
 */
export function stripCodeFence(s: string): string {
  const trimmed = s.trim();
  // ```lang\n...\n``` or ```\n...\n```
  const m = trimmed.match(/^```(?:[a-zA-Z0-9_+-]*)\n([\s\S]*?)\n?```$/);
  if (m) return m[1];
  return trimmed;
}

/* ------------------------------------------------------------------ */
/* Dispatch table                                                      */
/* ------------------------------------------------------------------ */

/**
 * runner.ts looks up the check function by `kind`. Adding a new
 * `RubricCheckKind` without an entry here fails the test harness
 * parity check in scripts/test-ai-evals.mjs.
 */
export const RUBRIC_CHECKS: Record<
  RubricCheckKind,
  (output: string, args?: Record<string, unknown>) => CheckOutcome
> = {
  outputNonEmpty: (out) => outputNonEmpty(out),
  numericPreservation: (out, args) =>
    numericPreservation(out, (args ?? {}) as { sourceText: string; minMatchesBps?: number }),
  noPreamble: (out) => noPreamble(out),
  codeIdentifierPassthrough: (out, args) =>
    codeIdentifierPassthrough(out, (args ?? {}) as { sourceText: string }),
  outputLengthWithinCap: (out, args) =>
    outputLengthWithinCap(out, (args ?? {}) as { maxChars: number }),
  containsAll: (out, args) =>
    containsAll(out, (args ?? {}) as { phrases: string[] }),
  containsNone: (out, args) =>
    containsNone(out, (args ?? {}) as { phrases: string[] }),
  matchesRegex: (out, args) =>
    matchesRegex(out, (args ?? {}) as { pattern: string; flags?: string; expectMatch?: boolean }),
  isValidJson: (out) => isValidJson(out),
  jsonHasKeys: (out, args) =>
    jsonHasKeys(out, (args ?? {}) as { keys: string[] }),
  languageMarker: (out, args) =>
    languageMarker(out, (args ?? {}) as { targetLang: string }),
};
