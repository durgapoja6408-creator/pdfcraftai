// Table extraction helper — Phase 5.6.
//
// Takes extracted PDF text and asks the model to locate every tabular
// structure in the document. Returns:
//
//   - One markdown document rendering each table as a GFM pipe table,
//     separated by "## Table N — <title>" headers. This is what we save
//     to `/app/files` as a .md file so users can preview in the reader.
//   - A structured `tables[]` array of `{ title, pageHint, csv }` so the
//     client can offer per-table CSV copy/download without re-parsing
//     the markdown. Stored in `ai_outputs.meta.tables`.
//
// Why AI and not a deterministic extractor:
//   - pdfjs-dist only gives us flat text with positional metadata. Naive
//     column-detection heuristics break on merged cells, wrapped text,
//     and multi-page tables. An LLM with the full text context handles
//     all three with ~1 paragraph of prompt.
//   - For v1 we accept that complex/merged/rotated tables will be
//     approximated. v2 can add a deterministic layout-aware extractor
//     (tabula-js / pdfplumber-style) and route the tricky cases through
//     the AI as a fallback.
//
// Design mirrors summarize.ts / rewrite.ts:
//   - Non-streaming `chat()` with a JSON-in-markdown parsing contract.
//   - 240k char input budget + truncation flag.
//   - Single output-token cap (3200) — generous because tables expand.
//   - Throws on provider error → route handler catches + refunds.

import "server-only";

import type { ModerationResult } from "./output-moderation";
import { assertOutputSafe, moderateOutput } from "./output-moderation";
import type { AIProvider } from "./provider";
import { buildSafetyPreamble, wrapUntrustedInput } from "./prompt-safety";
import { NoRoutableProviderError, route } from "./router";
import type { AIProviderId, TokenUsage } from "./types";

export interface TableInput {
  /** Extracted PDF text, pages joined with `\f`. */
  text: string;
  pageCount: number;
  /** Shown to the model in the system prompt; helpful for titling. */
  filename?: string;
  /** Pages with <20 chars of text, from extractPdfText. */
  ocrCandidatePages?: number[];
  /** Optional provider override, honored if configured. */
  preferredProvider?: AIProviderId;
}

/** One extracted table. Mirrored into `ai_outputs.meta.tables`. */
export interface ExtractedTable {
  /** Short human-readable label, e.g. "Q3 Revenue by Region". */
  title: string;
  /** Best-effort page locator, e.g. "page 4" or "pages 4-5". */
  pageHint: string;
  /** RFC 4180 CSV — header row + data rows. */
  csv: string;
}

export interface TableResult {
  /** Markdown body with one GFM table per section. Persisted to `ai_outputs.content_md`. */
  markdown: string;
  /** Structured per-table payload. Persisted to `ai_outputs.meta.tables`. */
  tables: ExtractedTable[];
  providerId: AIProviderId;
  model: string;
  usage: TokenUsage;
  /** True if the source text was truncated before the model call. */
  wasTruncated: boolean;
  /**
   * Task #28: output moderation verdict on the rendered table markdown
   * (NOT on the raw CSV payload — we only moderate the human-visible
   * surface the model actually generated).
   */
  moderation: ModerationResult;
}

/**
 * Thrown when no provider is configured. The route handler catches this
 * and returns 503. Same error class pattern as summarize.ts / rewrite.ts
 * so the catch block is a one-liner.
 */
export class NoAIProviderConfiguredError extends Error {
  constructor() {
    super("No AI provider is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
    this.name = "NoAIProviderConfiguredError";
  }
}

/**
 * 240k chars ≈ 60k tokens — comfortably inside every provider we target.
 * Matches summarize / rewrite. Going higher risks 429s on Claude's cheaper tiers.
 */
const TABLE_CHAR_BUDGET = 240_000;

/**
 * Output tokens cap. Tables expand aggressively — a 20-row × 6-col table
 * alone eats ~300-500 tokens. 2800 is enough to cover the common case
 * of 2-5 tables per document without blowing the budget.
 *
 * 2026-04-21 (Phase A4, Tier 4): trimmed 3200 → 2800 after observing
 * that with the JSON envelope format (headers + rows as string[][],
 * no redundant GFM copy) the model rarely needs > 2500 tokens even
 * for 5-table docs. The trim saves ~12% on worst-case output cost
 * without affecting typical-case behavior (provider stops at natural
 * end-of-JSON boundary).
 */
const MAX_OUTPUT_TOKENS = 2800;

/**
 * Thrown when the model returns output we can't parse as the expected
 * JSON contract. The route handler surfaces this as 502 table_failed
 * after refunding credits.
 */
export class TableParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TableParseError";
  }
}

export async function extractTables(input: TableInput): Promise<TableResult> {
  // Task #21: route through the AI router. "table" op routes to openai
  // primary — gpt-4o-mini's JSON-mode reliability + ~4-8× cheaper input
  // cost makes it the right default for structured extraction.
  // COST_MATRIX_3PROVIDER.md §2, M2 margin move.
  let provider: AIProvider;
  try {
    provider = await route("table", { preferredId: input.preferredProvider });
  } catch (err) {
    if (err instanceof NoRoutableProviderError) {
      throw new NoAIProviderConfiguredError();
    }
    throw err;
  }

  const { truncatedText, wasTruncated } = truncateForContext(input.text);

  const systemPrompt = buildSystemPrompt({
    filename: input.filename,
    pageCount: input.pageCount,
    ocrCandidatePages: input.ocrCandidatePages ?? [],
    wasTruncated,
  });

  const userPrompt = buildUserPrompt({ text: truncatedText });

  const result = await runChat(provider, {
    systemPrompt,
    userPrompt,
    maxTokens: MAX_OUTPUT_TOKENS,
  });

  const { tables, markdown } = parseTablesFromResponse(result.text);

  // Task #28: moderate the rendered table markdown. Tabular data from
  // HR/finance PDFs frequently contains PII (SSNs, account numbers,
  // salaries), so this op is a high-priority moderation surface.
  const moderation = moderateOutput(markdown, { op: "table" });
  assertOutputSafe(moderation, "table");

  return {
    markdown,
    tables,
    providerId: result.providerId,
    model: result.model,
    usage: result.usage,
    wasTruncated,
    moderation,
  };
}

// --- prompt builders --------------------------------------------------

function buildSystemPrompt(opts: {
  filename?: string;
  pageCount: number;
  ocrCandidatePages: number[];
  wasTruncated: boolean;
}): string {
  const title = opts.filename ? `"${opts.filename}"` : "an untitled PDF";
  const ocr = opts.ocrCandidatePages.length
    ? `\nPages ${opts.ocrCandidatePages.join(", ")} appear to be scanned ` +
      "images with minimal extractable text — skip them silently rather than " +
      "inventing tables.\n"
    : "";
  const truncation = opts.wasTruncated
    ? "\nThe extracted text was truncated to fit your context. Tables appearing " +
      "after the truncation point will not be captured — this is fine, the route " +
      "flags it to the user.\n"
    : "";

  // Task #26: prepend safety preamble. See lib/ai/prompt-safety.ts.
  return (
    `${buildSafetyPreamble("table")}\n\n` +
    `You are the PDFCraft AI table extractor. The user has attached ${title} ` +
    `(${opts.pageCount} page${opts.pageCount === 1 ? "" : "s"}). ` +
    `Pages are delimited by \\f in the source text.\n\n` +
    "Your job: locate every tabular structure in the document — tables, " +
    "schedules, matrices, structured lists — and return them in a strict " +
    "JSON envelope.\n\n" +
    "Rules:\n" +
    "- Only extract genuine tabular data (rows × columns with a clear header). " +
    "Do NOT convert prose bullet lists or outlines into tables.\n" +
    "- Preserve header row exactly as it appears. If the source has no header " +
    "row, synthesize one from column context (e.g. 'Column 1', 'Column 2').\n" +
    "- Merged cells: repeat the value across the spanned cells.\n" +
    "- Multi-page tables: concatenate into one table, note the page range in " +
    "the pageHint (e.g. 'pages 4-5').\n" +
    "- Numbers: preserve formatting as shown (keep commas, currency symbols, " +
    "percent signs).\n" +
    "- Empty cells: use an empty string, not 'N/A' or '-'.\n" +
    "- Missing tables: return `{ \"tables\": [] }` — do not invent tables to " +
    "fill the output.\n\n" +
    "Output format — return ONLY this JSON, no preamble, no code fence:\n" +
    "{\n" +
    '  "tables": [\n' +
    "    {\n" +
    '      "title": "Short label, e.g. Q3 Revenue by Region",\n' +
    '      "pageHint": "page 3" | "pages 4-5",\n' +
    '      "headers": ["Col 1", "Col 2", ...],\n' +
    '      "rows": [["r1c1", "r1c2", ...], ["r2c1", ...]]\n' +
    "    }\n" +
    "  ]\n" +
    "}\n\n" +
    "Before responding: mentally verify the JSON parses. Escape embedded " +
    "double-quotes in cell values (`\\\"`) and newlines (`\\\\n`). Every row " +
    "must have exactly as many cells as the headers array — pad short rows " +
    "with empty strings. A malformed response costs the user a retry, which " +
    "we want to avoid." +
    ocr +
    truncation
  );
}

function buildUserPrompt(opts: { text: string }): string {
  // Task #26: wrap untrusted PDF text in sentinel tags.
  return (
    "Extract all tables from the document inside the untrusted_input tag. Return the JSON envelope.\n\n" +
    wrapUntrustedInput(opts.text, { sourceLabel: "pdf_text" })
  );
}

// --- adapter invocation ----------------------------------------------

async function runChat(
  provider: AIProvider,
  opts: { systemPrompt: string; userPrompt: string; maxTokens: number }
): Promise<{
  text: string;
  providerId: AIProviderId;
  model: string;
  usage: TokenUsage;
}> {
  const result = await provider.chat({
    systemPrompt: opts.systemPrompt,
    messages: [{ role: "user", content: opts.userPrompt }],
    maxTokens: opts.maxTokens,
    // 0.1 — we want deterministic structured JSON output. Tables are
    // facts, not prose, so temperature should be as low as the provider
    // will let us go without triggering repetition penalties.
    temperature: 0.1,
  });
  if (result.stopReason === "error") {
    throw new Error("AI provider returned an error stop reason");
  }
  return {
    text: result.text,
    providerId: result.providerId,
    model: result.model,
    usage: result.usage,
  };
}

// --- response parsing -------------------------------------------------

type ModelTable = {
  title: string;
  pageHint: string;
  headers: string[];
  rows: string[][];
};

function parseTablesFromResponse(raw: string): {
  tables: ExtractedTable[];
  markdown: string;
} {
  const trimmed = raw.trim();
  // Some providers still wrap JSON in a code fence despite the system
  // prompt saying not to. Strip it.
  const fenced = trimmed.match(/^```(?:json)?\n([\s\S]*)\n```$/);
  const jsonText = fenced ? fenced[1]!.trim() : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new TableParseError(
      `Model did not return valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const tablesIn = (parsed as { tables?: unknown })?.tables;
  if (!Array.isArray(tablesIn)) {
    throw new TableParseError("Model JSON missing `tables` array");
  }

  const tables: ExtractedTable[] = [];
  const markdownParts: string[] = [];

  if (tablesIn.length === 0) {
    markdownParts.push("# Extracted Tables\n");
    markdownParts.push(
      "_No tables were detected in this document. If you expected tables here, " +
        "the source may be scanned images — try running OCR first, then re-extract._"
    );
  } else {
    markdownParts.push(`# Extracted Tables (${tablesIn.length})\n`);
  }

  tablesIn.forEach((t, idx) => {
    const table = validateModelTable(t, idx);
    const csv = toCsv(table.headers, table.rows);
    tables.push({
      title: table.title,
      pageHint: table.pageHint,
      csv,
    });
    markdownParts.push(
      `\n## Table ${idx + 1} — ${table.title}\n` +
        `_${table.pageHint}_\n\n` +
        toGfmTable(table.headers, table.rows)
    );
  });

  return {
    tables,
    markdown: markdownParts.join("\n").trim() + "\n",
  };
}

function validateModelTable(raw: unknown, idx: number): ModelTable {
  if (!raw || typeof raw !== "object") {
    throw new TableParseError(`tables[${idx}] is not an object`);
  }
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === "string" && o.title.trim() ? o.title.trim() : `Table ${idx + 1}`;
  const pageHint = typeof o.pageHint === "string" && o.pageHint.trim() ? o.pageHint.trim() : "page unknown";
  if (!Array.isArray(o.headers) || !o.headers.every((h) => typeof h === "string")) {
    throw new TableParseError(`tables[${idx}].headers must be string[]`);
  }
  if (
    !Array.isArray(o.rows) ||
    !o.rows.every(
      (r) => Array.isArray(r) && (r as unknown[]).every((c) => typeof c === "string")
    )
  ) {
    throw new TableParseError(`tables[${idx}].rows must be string[][]`);
  }
  return {
    title,
    pageHint,
    headers: o.headers as string[],
    rows: o.rows as string[][],
  };
}

// --- formatters -------------------------------------------------------

/** RFC 4180 CSV: quote any field containing quote/comma/newline. */
function toCsv(headers: string[], rows: string[][]): string {
  const escapeCell = (s: string): string => {
    if (/[",\r\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines: string[] = [];
  lines.push(headers.map(escapeCell).join(","));
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(","));
  }
  // Trailing newline for POSIX-friendly file output.
  return lines.join("\r\n") + "\r\n";
}

/** GFM pipe table. Escapes `|` inside cells. */
function toGfmTable(headers: string[], rows: string[][]): string {
  const escapeCell = (s: string): string => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const headerRow = `| ${headers.map(escapeCell).join(" | ")} |`;
  const sepRow = `| ${headers.map(() => "---").join(" | ")} |`;
  const bodyRows = rows.map((r) => {
    // Normalize row length to header length so GFM renders correctly.
    const normalized = [...r];
    while (normalized.length < headers.length) normalized.push("");
    return `| ${normalized.slice(0, headers.length).map(escapeCell).join(" | ")} |`;
  });
  return [headerRow, sepRow, ...bodyRows].join("\n");
}

// --- helpers ----------------------------------------------------------

function truncateForContext(text: string): {
  truncatedText: string;
  wasTruncated: boolean;
} {
  if (text.length <= TABLE_CHAR_BUDGET) {
    return { truncatedText: text, wasTruncated: false };
  }
  return {
    truncatedText: text.slice(0, TABLE_CHAR_BUDGET),
    wasTruncated: true,
  };
}
