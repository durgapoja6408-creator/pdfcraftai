// Sign-and-fill helper — Phase 5.6, final of the 5.
//
// "AI fills fields, you sign and send."
//
// The user uploads a PDF that has form-like fields (printed labels
// followed by blank space or a line: "Name: ______", "Date: _____",
// "Signature: _____"). They also hand us a small bundle of personal
// info — name, initials, email, phone, date, company, title, address,
// plus optional custom key/value pairs.
//
// Pipeline:
//
//   1. Positioned extraction with pdfjs-dist/legacy, same shape as
//      lib/ai/redact.ts — per-item rects so we know where each run
//      sits in PDF user space.
//
//   2. Ask the model for a strict JSON envelope listing every field it
//      spotted, with an `anchorText` we can locate in the source, plus
//      which bundle key should fill that field (or "__signature" /
//      "__initials" for sig lines). Temperature 0.1.
//
//   3. For each returned fill, whitespace-tolerant-locate the anchor,
//      compute a right-of-anchor draw rect, and pdf-lib drawText the
//      value. Signatures use HelveticaBoldOblique at a bumped size to
//      read like a handwritten signature even though it's type.
//
//   4. Return the filled PDF + markdown summary (count, by-key, per-
//      field details, unmatched fields). The route persists only the
//      markdown — the PDF is base64'd in the response and never
//      survives a replay, same contract as redact and generate.
//
// IMPORTANT: this is NOT a cryptographic signature. We draw the user's
// typed signature as text onto the PDF. No PKI, no PAdES, no timestamp
// authority. The UI surfaces this caveat explicitly — anyone needing a
// legally-binding e-signature should use DocuSign/Adobe Sign. A
// cryptographically-signed v2 using @signpdf/signpdf is future work and
// will share this same JSON envelope contract.

import "server-only";

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { capForOp } from "./output-caps";
import type { ModerationResult } from "./output-moderation";
import { assertOutputSafe, moderateOutput } from "./output-moderation";
import type { AIProvider } from "./provider";
import { buildSafetyPreamble, wrapUntrustedInput } from "./prompt-safety";
import { selectProvider } from "./registry";
import type { AIProviderId, TokenUsage } from "./types";

// --- types ------------------------------------------------------------

/**
 * The canonical bundle keys the model can reference. `__signature` and
 * `__initials` are special — they use the signature font + larger size
 * when drawn.
 */
export type SignFieldKey =
  | "full_name"
  | "initials"
  | "email"
  | "phone"
  | "date"
  | "company"
  | "title"
  | "address"
  | "__signature"
  | "__initials"
  | "__skip"
  // "custom:<slug>" — user-provided custom keys (see CUSTOM_KEY_PREFIX).
  | string;

const CUSTOM_KEY_PREFIX = "custom:";

/**
 * Well-known keys (not custom:). Kept as a Set so we can validate the
 * model's output without greenlighting arbitrary strings.
 */
const WELL_KNOWN_KEYS: ReadonlySet<string> = new Set<string>([
  "full_name",
  "initials",
  "email",
  "phone",
  "date",
  "company",
  "title",
  "address",
  "__signature",
  "__initials",
  "__skip",
]);

/** What the user hands us via the form. */
export interface SignUserInfo {
  fullName: string;
  initials?: string;
  email?: string;
  phone?: string;
  date?: string;
  company?: string;
  title?: string;
  address?: string;
  /** Free-form extras. Key is a short slug ("employee_id"), value any string. */
  customFields?: Array<{ key: string; value: string }>;
}

export interface SignInput {
  /** Raw PDF bytes. Route-side size-cap. */
  pdfBytes: Uint8Array;
  filename?: string;
  info: SignUserInfo;
  /** Optional provider override. */
  preferredProvider?: AIProviderId;
}

/** One field the model spotted and we managed to fill. */
export interface SignFilling {
  /** Label text the user will recognise ("Name:"). */
  label: string;
  /** The bundle key we filled from. */
  fieldKey: string;
  /** The literal value we drew on the page. */
  value: string;
  /** Treated as a signature (italic + bigger + signature-like). */
  isSignature: boolean;
  /** 1-indexed page the draw happened on. */
  page: number;
  /** Short justification from the model. */
  reason: string;
}

/** Field the model named but we either skipped or couldn't locate. */
export interface SignUnfilled {
  label: string;
  fieldKey: string;
  reason: string;
  cause: "no_value_for_key" | "anchor_not_found" | "skipped_by_model";
}

export interface SignResult {
  pdfBytes: Uint8Array;
  signedPdfFilename: string;
  markdown: string;
  filled: SignFilling[];
  unfilled: SignUnfilled[];
  pageCount: number;
  ocrCandidatePages: number[];
  providerId: AIProviderId;
  model: string;
  usage: TokenUsage;
  wasTruncated: boolean;
  /**
   * Task #28: output moderation verdict on the summary markdown.
   * The signed PDF draws user-provided values (name, email, etc) at
   * located anchors — deterministic, no model-generated body text —
   * so the moderation surface here is the summary markdown, which
   * echoes the user's bundle values + the model's `reason` strings.
   */
  moderation: ModerationResult;
}

export class NoAIProviderConfiguredError extends Error {
  constructor() {
    super("No AI provider is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
    this.name = "NoAIProviderConfiguredError";
  }
}

/** Thrown when model JSON can't be parsed as our envelope. */
export class SignParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignParseError";
  }
}

// --- constants --------------------------------------------------------

const SIGN_CHAR_BUDGET = 240_000;
// Output-token cap is centralized in ./output-caps
// (OP_OUTPUT_CAP_TABLE.sign.default = 2400). Task #11 moved it out of
// this file so every op shares one source of truth and one hard ceiling.
// Enough for a multi-page agreement with ~15 signature blocks + per-
// block rationale. Used below via `capForOp("sign")`.
const OCR_CANDIDATE_CHAR_THRESHOLD = 20;

/** How much whitespace we leave between the label end and our drawn text. */
const DRAW_GAP_PT = 4;

/** Max horizontal room (pt) a filled value is allowed to use before we clip. */
const DRAW_MAX_WIDTH_PT = 260;

/** Point sizes — regular values vs signatures. Signatures are italic + larger. */
const REG_FONT_SIZE = 10;
const SIG_FONT_SIZE = 16;

// --- pdfjs worker bootstrap (shared pattern with redact.ts) ----------

let workerConfigured = false;
function ensureWorkerConfigured(): void {
  if (workerConfigured) return;
  workerConfigured = true;
  const gw = (pdfjs as typeof pdfjs & { GlobalWorkerOptions: { workerSrc: string } })
    .GlobalWorkerOptions;
  try {
    const req = createRequire(import.meta.url);
    const workerPath = req.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    gw.workerSrc = pathToFileURL(workerPath).href;
  } catch {
    // outputFileTracingIncludes in next.config.mjs handles the fallback.
  }
}

// --- orchestrator -----------------------------------------------------

export async function signPdf(input: SignInput): Promise<SignResult> {
  const provider = await selectProvider({
    capabilityNeeded: "streaming",
    preferredId: input.preferredProvider,
  });
  if (!provider) throw new NoAIProviderConfiguredError();

  const info = normalizeUserInfo(input.info);

  // 1. Positioned extraction.
  const extraction = await extractPositionedText(input.pdfBytes);

  // 2. Ask the model for the fill plan.
  const { truncatedText, wasTruncated } = truncateForContext(extraction.fullText);
  const systemPrompt = buildSystemPrompt({
    filename: input.filename,
    pageCount: extraction.pageCount,
    ocrCandidatePages: extraction.ocrCandidatePages,
    wasTruncated,
    availableKeys: info.availableKeys,
  });
  const userPrompt = buildUserPrompt({ text: truncatedText, info });

  const chat = await runChat(provider, {
    systemPrompt,
    userPrompt,
    maxTokens: capForOp("sign"),
  });

  const rawFills = parseFillsFromResponse(chat.text);

  // 3. Locate + draw.
  const located = locateFills(rawFills, extraction.pages, info);

  const pdfBytes = await drawFills(input.pdfBytes, located.draws);

  // 4. Summary markdown.
  const markdown = renderSummary({
    filename: input.filename,
    pageCount: extraction.pageCount,
    filled: located.filled,
    unfilled: located.unfilled,
    ocrCandidatePages: extraction.ocrCandidatePages,
    wasTruncated,
  });

  // Task #28: moderate the summary markdown. The drawn PDF itself is
  // deterministic (we locate anchors + draw user bundle values), so
  // the moderation surface is the human-visible summary. Critical
  // findings throw via assertOutputSafe → route handler refunds + 502.
  const moderation = moderateOutput(markdown, { op: "sign" });
  assertOutputSafe(moderation, "sign");

  return {
    pdfBytes,
    signedPdfFilename: deriveSignedFilename(input.filename),
    markdown,
    filled: located.filled,
    unfilled: located.unfilled,
    pageCount: extraction.pageCount,
    ocrCandidatePages: extraction.ocrCandidatePages,
    providerId: chat.providerId,
    model: chat.model,
    usage: chat.usage,
    wasTruncated,
    moderation,
  };
}

// --- user info normalization -----------------------------------------

interface NormalizedInfo {
  /** `fieldKey → value`, resolved from user input. */
  valueByKey: Map<string, string>;
  /** Keys we'll expose to the model in the prompt. */
  availableKeys: Array<{ key: string; hint: string }>;
}

function normalizeUserInfo(raw: SignUserInfo): NormalizedInfo {
  const m = new Map<string, string>();
  const put = (k: string, v: string | undefined) => {
    const trimmed = (v ?? "").trim();
    if (trimmed) m.set(k, trimmed);
  };

  put("full_name", raw.fullName);
  // Auto-derive initials if not provided.
  const initials =
    (raw.initials ?? "").trim() || deriveInitials(raw.fullName ?? "");
  if (initials) m.set("initials", initials);
  put("email", raw.email);
  put("phone", raw.phone);
  // Default date to today in ISO if user didn't set one.
  const dateVal = (raw.date ?? "").trim() || todayIso();
  m.set("date", dateVal);
  put("company", raw.company);
  put("title", raw.title);
  put("address", raw.address);

  // Signature + initials are the name/initials themselves — they just
  // get drawn with the signature font treatment downstream.
  if (m.has("full_name")) m.set("__signature", m.get("full_name")!);
  if (m.has("initials")) m.set("__initials", m.get("initials")!);

  // Custom fields.
  if (raw.customFields) {
    for (const { key, value } of raw.customFields) {
      const slug = slugifyKey(key);
      const val = (value ?? "").trim();
      if (slug && val) m.set(`${CUSTOM_KEY_PREFIX}${slug}`, val);
    }
  }

  // What we tell the model it's allowed to reference.
  const availableKeys: Array<{ key: string; hint: string }> = [];
  const pushKey = (key: string, hint: string) => {
    if (m.has(key)) availableKeys.push({ key, hint });
  };
  pushKey("full_name", "the user's printed full name");
  pushKey("initials", "the user's initials");
  pushKey("email", "the user's email address");
  pushKey("phone", "the user's phone number");
  pushKey("date", "today's date (or user-provided date)");
  pushKey("company", "the user's company / organisation");
  pushKey("title", "the user's job title");
  pushKey("address", "the user's street address");
  pushKey("__signature", "draw the user's name AS A SIGNATURE (italic, larger)");
  pushKey("__initials", "draw the user's initials AS A SIGNATURE (italic, larger)");
  for (const k of m.keys()) {
    if (k.startsWith(CUSTOM_KEY_PREFIX)) {
      availableKeys.push({
        key: k,
        hint: `user-provided custom field "${k.slice(CUSTOM_KEY_PREFIX.length)}"`,
      });
    }
  }
  // Always allow __skip.
  availableKeys.push({ key: "__skip", hint: "field exists but no good value — leave blank" });

  return { valueByKey: m, availableKeys };
}

function deriveInitials(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  // First + last letter
  const first = parts[0]!.charAt(0).toUpperCase();
  const last = parts[parts.length - 1]!.charAt(0).toUpperCase();
  // Middle(s) optional — include up to one middle if present.
  if (parts.length >= 3) {
    const mid = parts[1]!.charAt(0).toUpperCase();
    return `${first}${mid}${last}`;
  }
  return `${first}${last}`;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function slugifyKey(k: string): string {
  return k
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

// --- prompt builders --------------------------------------------------

function buildSystemPrompt(opts: {
  filename?: string;
  pageCount: number;
  ocrCandidatePages: number[];
  wasTruncated: boolean;
  availableKeys: Array<{ key: string; hint: string }>;
}): string {
  const title = opts.filename ? `"${opts.filename}"` : "an untitled PDF";
  const ocr = opts.ocrCandidatePages.length
    ? `\nPages ${opts.ocrCandidatePages.join(", ")} appear to be scanned — ` +
      "no extractable text. Do not invent fields for them.\n"
    : "";
  const truncation = opts.wasTruncated
    ? "\nThe source text was truncated. Fields beyond the truncation point " +
      "will not be filled.\n"
    : "";

  const keyList = opts.availableKeys
    .map(({ key, hint }) => `- \`${key}\` — ${hint}`)
    .join("\n");

  // Task #26: prepend safety preamble. See lib/ai/prompt-safety.ts.
  return (
    `${buildSafetyPreamble("sign")}\n\n` +
    `You are the PDFCraft AI form-filler. The user has attached ${title} ` +
    `(${opts.pageCount} page${opts.pageCount === 1 ? "" : "s"}) and asked ` +
    `you to fill in every field you can spot using the info they've ` +
    `provided.\n\n` +
    `Available field keys (use ONLY these — never invent new keys):\n` +
    `${keyList}\n\n` +
    `Your job: identify every fill-in field on the form. A field is a ` +
    `printed label followed by a blank space, underline, line of ` +
    `underscores, or box where the user would write. Typical labels: ` +
    `"Name:", "Printed name:", "Date:", "Signature:", "Email:", etc.\n\n` +
    `For each field, decide which key best fills it. If no key fits, ` +
    `return \`"__skip"\`. If the field is a signature line, use ` +
    `\`"__signature"\`. If it's an initials box, use \`"__initials"\`.\n\n` +
    `Rules:\n` +
    `- Return \`anchorText\` as the exact run of text in the source you ` +
    `  want the filler to locate. Keep it short (1-5 words) and include ` +
    `  the trailing colon if present (\`"Name:"\`, not \`"Name"\`).\n` +
    `- Do NOT return generic body text as an anchor — only actual field ` +
    `  labels.\n` +
    `- If the same label appears many times (e.g. repeated "Date:" on a ` +
    `  multi-page form), return each occurrence once — the locator will ` +
    `  find all matches and fill each.\n` +
    `- \`page\` is your best guess at the 1-indexed page where the field ` +
    `  sits. Pages are separated by \\f in the source text.\n` +
    `- \`reason\` is a short (≤12 words) justification in sentence case.\n` +
    `- No fillable fields? Return \`{ "fills": [] }\`.\n\n` +
    `Output format — return ONLY this JSON, no preamble, no code fence:\n` +
    `{\n` +
    `  "fills": [\n` +
    `    {\n` +
    `      "label": "Human-friendly label shown in the summary",\n` +
    `      "anchorText": "exact substring to locate",\n` +
    `      "fieldKey": "full_name" | "email" | "__signature" | ...,\n` +
    `      "page": 1,\n` +
    `      "reason": "Short justification"\n` +
    `    }\n` +
    `  ]\n` +
    `}\n` +
    ocr +
    truncation
  );
}

function buildUserPrompt(opts: { text: string; info: NormalizedInfo }): string {
  // Task #26: wrap untrusted PDF text in sentinel tags.
  return (
    `Fill every form field you can spot in the document inside the untrusted_input tag. Return ` +
    `the JSON envelope.\n\n` +
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
    temperature: 0.1,
    // Task #10: Anthropic prompt caching. Sign analysis has a stable
    // structured-output system prompt (field-extraction JSON schema +
    // safety preamble) across every run. Non-Anthropic adapters ignore.
    cacheSystemPrompt: true,
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

interface ModelFill {
  label: string;
  anchorText: string;
  fieldKey: string;
  page: number;
  reason: string;
}

function parseFillsFromResponse(raw: string): ModelFill[] {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\n([\s\S]*)\n```$/);
  const jsonText = fenced ? fenced[1]!.trim() : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new SignParseError(
      `Model did not return valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const arr = (parsed as { fills?: unknown })?.fills;
  if (!Array.isArray(arr)) {
    throw new SignParseError("Model JSON missing `fills` array");
  }

  const out: ModelFill[] = [];
  arr.forEach((item, idx) => {
    if (!item || typeof item !== "object") {
      throw new SignParseError(`fills[${idx}] is not an object`);
    }
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    const anchor = typeof o.anchorText === "string" ? o.anchorText.trim() : "";
    const fieldKey = typeof o.fieldKey === "string" ? o.fieldKey.trim() : "";
    const page = typeof o.page === "number" ? Math.floor(o.page) : 1;
    const reason =
      typeof o.reason === "string" && o.reason.trim()
        ? o.reason.trim()
        : "Form field";
    if (!label || !anchor || !fieldKey) return;
    if (!isValidKey(fieldKey)) return;
    out.push({ label, anchorText: anchor, fieldKey, page, reason });
  });
  return out;
}

function isValidKey(k: string): boolean {
  if (WELL_KNOWN_KEYS.has(k)) return true;
  if (k.startsWith(CUSTOM_KEY_PREFIX)) return true;
  return false;
}

// --- positioned extraction (identical to redact.ts structure) --------

interface PositionedItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PositionedPage {
  pageNumber: number;
  width: number;
  height: number;
  items: PositionedItem[];
  combined: string;
  charMap: number[];
  likelyNeedsOcr: boolean;
}

interface PositionedExtraction {
  pageCount: number;
  pages: PositionedPage[];
  fullText: string;
  ocrCandidatePages: number[];
}

async function extractPositionedText(
  bytes: Uint8Array
): Promise<PositionedExtraction> {
  ensureWorkerConfigured();

  // 2026-05-12 — defensive copy. See same comment in lib/ai/redact.ts.
  // pdfjs-dist's getDocument({data}) can detach the Uint8Array;
  // passing the same buffer to pdf-lib upstream then pdfjs here in
  // sequence is brittle (caught by prod E2E run 2026-05-12).
  const bytesCopy = new Uint8Array(bytes);
  const loadingTask = (
    pdfjs as typeof pdfjs & {
      getDocument: (opts: unknown) => { promise: Promise<PdfDocumentLike> };
    }
  ).getDocument({
    data: bytesCopy,
    useSystemFonts: false,
    disableFontFace: true,
    isEvalSupported: false,
  });

  const doc = await loadingTask.promise;
  const pageCount = doc.numPages;
  const pages: PositionedPage[] = [];
  const ocrCandidatePages: number[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    try {
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: PositionedItem[] = [];
      let combined = "";
      const charMap: number[] = [];

      for (const raw of content.items as unknown[]) {
        const item = raw as {
          str?: string;
          width?: number;
          height?: number;
          transform?: number[];
        };
        if (typeof item.str !== "string" || item.str.length === 0) continue;
        const t = item.transform;
        if (!Array.isArray(t) || t.length < 6) continue;
        const x = Number(t[4]);
        const y = Number(t[5]);
        const h = Math.max(Number(item.height ?? 0), Math.abs(Number(t[3] ?? 0)));
        const w = Math.max(Number(item.width ?? 0), 0);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

        const itemIdx = items.length;
        items.push({ str: item.str, x, y, w, h });

        for (const _ch of item.str) {
          combined += _ch;
          charMap.push(itemIdx);
        }
        combined += " ";
        charMap.push(-1);
      }

      const trimmed = combined.trim();
      const likelyNeedsOcr = trimmed.length < OCR_CANDIDATE_CHAR_THRESHOLD;
      if (likelyNeedsOcr) ocrCandidatePages.push(i);

      pages.push({
        pageNumber: i,
        width: viewport.width,
        height: viewport.height,
        items,
        combined,
        charMap,
        likelyNeedsOcr,
      });
    } finally {
      page.cleanup();
    }
  }

  await doc.cleanup();
  await doc.destroy();

  const fullText = pages.map((p) => p.combined.trim()).join("\f");
  return { pageCount, pages, fullText, ocrCandidatePages };
}

interface PdfDocumentLike {
  numPages: number;
  getPage(n: number): Promise<PdfPageLike>;
  cleanup(): Promise<void>;
  destroy(): Promise<void>;
}
interface PdfPageLike {
  getViewport(opts: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: unknown[] }>;
  cleanup(): void;
}

// --- fill locator -----------------------------------------------------

/**
 * One draw instruction for pdf-lib: page + position + value + isSignature.
 */
interface DrawInstruction {
  pageNumber: number;
  /** x of the LEFT edge where we start drawing. */
  x: number;
  /** y of the baseline. */
  y: number;
  /** Horizontal room available before we hit the page margin. */
  maxWidth: number;
  value: string;
  isSignature: boolean;
  /** Font height of the anchor, used to align our text baseline. */
  anchorHeight: number;
}

function locateFills(
  rawFills: ModelFill[],
  pages: PositionedPage[],
  info: NormalizedInfo
): {
  filled: SignFilling[];
  unfilled: SignUnfilled[];
  draws: DrawInstruction[];
} {
  const filled: SignFilling[] = [];
  const unfilled: SignUnfilled[] = [];
  const draws: DrawInstruction[] = [];

  // Dedupe tracker — keyed by "pageNumber|x|y" so we don't double-draw
  // on the same anchor if the model emitted it twice.
  const drawnAnchors = new Set<string>();

  for (const f of rawFills) {
    // Skip → record as unfilled with cause.
    if (f.fieldKey === "__skip") {
      unfilled.push({
        label: f.label,
        fieldKey: f.fieldKey,
        reason: f.reason,
        cause: "skipped_by_model",
      });
      continue;
    }

    // Resolve value.
    const value = info.valueByKey.get(f.fieldKey);
    if (!value) {
      unfilled.push({
        label: f.label,
        fieldKey: f.fieldKey,
        reason: f.reason,
        cause: "no_value_for_key",
      });
      continue;
    }

    // Locate anchor across all pages. Model hint is a guess; we don't
    // restrict search to it (labels can repeat across pages).
    const isSignature =
      f.fieldKey === "__signature" || f.fieldKey === "__initials";
    const anchorCompressed = compressForMatch(f.anchorText);
    if (!anchorCompressed) {
      unfilled.push({
        label: f.label,
        fieldKey: f.fieldKey,
        reason: f.reason,
        cause: "anchor_not_found",
      });
      continue;
    }

    let anyMatch = false;

    for (const page of pages) {
      const matches = findAllWhitespaceTolerant(page.combined, anchorCompressed);
      if (!matches.length) continue;

      for (const m of matches) {
        // Find the last item in the anchor span — its right edge is our
        // draw start.
        let lastItemIdx = -1;
        for (let i = m.end; i >= m.start; i--) {
          const idx = page.charMap[i];
          if (idx != null && idx >= 0) {
            lastItemIdx = idx;
            break;
          }
        }
        if (lastItemIdx < 0) continue;
        const anchor = page.items[lastItemIdx]!;

        const x = anchor.x + anchor.w + DRAW_GAP_PT;
        const y = anchor.y;
        // Horizontal room: until the page right margin (~1/2 in from edge).
        const pageRightSafeX = page.width - 36;
        const availableWidth = Math.max(pageRightSafeX - x, 0);
        const maxWidth = Math.min(availableWidth, DRAW_MAX_WIDTH_PT);

        if (maxWidth < 40) continue; // not enough room to be useful

        const key = `${page.pageNumber}|${x.toFixed(1)}|${y.toFixed(1)}`;
        if (drawnAnchors.has(key)) continue;
        drawnAnchors.add(key);

        draws.push({
          pageNumber: page.pageNumber,
          x,
          y,
          maxWidth,
          value,
          isSignature,
          anchorHeight: anchor.h,
        });

        filled.push({
          label: f.label,
          fieldKey: f.fieldKey,
          value,
          isSignature,
          page: page.pageNumber,
          reason: f.reason,
        });
        anyMatch = true;
      }
    }

    if (!anyMatch) {
      unfilled.push({
        label: f.label,
        fieldKey: f.fieldKey,
        reason: f.reason,
        cause: "anchor_not_found",
      });
    }
  }

  return { filled, unfilled, draws };
}

function compressForMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

function findAllWhitespaceTolerant(
  haystack: string,
  needleCompressed: string
): { start: number; end: number }[] {
  if (!needleCompressed) return [];

  const lower = haystack.toLowerCase();
  let compressed = "";
  const toOriginal: number[] = [];
  for (let i = 0; i < lower.length; i++) {
    const ch = lower.charCodeAt(i);
    const isWs =
      ch === 0x20 ||
      ch === 0x09 ||
      ch === 0x0a ||
      ch === 0x0b ||
      ch === 0x0c ||
      ch === 0x0d ||
      ch === 0xa0;
    if (isWs) continue;
    compressed += lower[i];
    toOriginal.push(i);
  }

  const matches: { start: number; end: number }[] = [];
  let idx = 0;
  while (idx <= compressed.length - needleCompressed.length) {
    const pos = compressed.indexOf(needleCompressed, idx);
    if (pos < 0) break;
    const endPos = pos + needleCompressed.length - 1;
    const start = toOriginal[pos];
    const end = toOriginal[endPos];
    if (start == null || end == null) break;
    matches.push({ start, end });
    idx = pos + 1;
  }
  return matches;
}

// --- pdf-lib drawing --------------------------------------------------

async function drawFills(
  pdfBytes: Uint8Array,
  draws: DrawInstruction[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = doc.getPages();

  // Embed once, reuse across all draws.
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const signature = await doc.embedFont(StandardFonts.HelveticaBoldOblique);

  const black = rgb(0, 0, 0);
  // Signature ink — a touch of blue so users can tell at a glance it's
  // a drawn signature vs. pre-printed form text.
  const ink = rgb(0.04, 0.07, 0.42);

  for (const d of draws) {
    const pageIdx = d.pageNumber - 1;
    if (pageIdx < 0 || pageIdx >= pages.length) continue;
    const page = pages[pageIdx]!;

    const font = d.isSignature ? signature : regular;
    let size = d.isSignature ? SIG_FONT_SIZE : REG_FONT_SIZE;

    // Shrink-to-fit: if the value doesn't fit, step down until it does
    // or we hit a floor of 7pt.
    let width = font.widthOfTextAtSize(d.value, size);
    while (width > d.maxWidth && size > 7) {
      size -= 1;
      width = font.widthOfTextAtSize(d.value, size);
    }

    // Final width may still exceed maxWidth at 7pt — in that case clip
    // with an ellipsis so we never overdraw page furniture.
    let text = d.value;
    if (width > d.maxWidth) {
      text = ellipsizeToWidth(d.value, font, size, d.maxWidth);
    }

    // Vertical nudge: regular text sits on the anchor baseline (y as-is).
    // Signatures get a small lift so the tails don't crash through the
    // printed underline below the field.
    const y = d.isSignature ? d.y + 1 : d.y;

    page.drawText(text, {
      x: d.x,
      y,
      size,
      font,
      color: d.isSignature ? ink : black,
    });
  }

  return doc.save();
}

function ellipsizeToWidth(
  value: string,
  font: { widthOfTextAtSize: (s: string, n: number) => number },
  size: number,
  maxWidth: number
): string {
  const ell = "…";
  // Binary-search the longest prefix that fits with the ellipsis.
  let lo = 0;
  let hi = value.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = value.slice(0, mid) + ell;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? value.slice(0, lo) + ell : ell;
}

// --- markdown summary -------------------------------------------------

function renderSummary(opts: {
  filename?: string;
  pageCount: number;
  filled: SignFilling[];
  unfilled: SignUnfilled[];
  ocrCandidatePages: number[];
  wasTruncated: boolean;
}): string {
  const title = opts.filename
    ? `# Fill & sign report — ${opts.filename}\n`
    : "# Fill & sign report\n";

  const parts: string[] = [title];

  const filledCount = opts.filled.length;
  const sigCount = opts.filled.filter((f) => f.isSignature).length;
  parts.push(
    `We filled **${filledCount}** field${filledCount === 1 ? "" : "s"} ` +
      `across **${opts.pageCount}** page${opts.pageCount === 1 ? "" : "s"}` +
      (sigCount > 0
        ? `, including **${sigCount}** signature${sigCount === 1 ? "" : "s"}`
        : "") +
      `.\n`
  );

  if (opts.wasTruncated) {
    parts.push(
      "_Note: the source was truncated to fit the AI context. Fields past " +
        "the truncation point were not filled._\n"
    );
  }
  if (opts.ocrCandidatePages.length > 0) {
    parts.push(
      `_Note: page${opts.ocrCandidatePages.length === 1 ? "" : "s"} ` +
        `${opts.ocrCandidatePages.join(", ")} appear${opts.ocrCandidatePages.length === 1 ? "s" : ""} ` +
        "to be scanned — no text was extractable, so no fields were detected " +
        "on them. Run OCR first, then re-sign._\n"
    );
  }

  // Group by key for the summary.
  if (filledCount > 0) {
    const byKey = new Map<string, number>();
    for (const f of opts.filled) {
      byKey.set(f.fieldKey, (byKey.get(f.fieldKey) ?? 0) + 1);
    }
    parts.push("\n## By field\n");
    parts.push("| Field key | Occurrences |");
    parts.push("| --- | --- |");
    [...byKey.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => {
        parts.push(`| \`${k}\` | ${n} |`);
      });

    parts.push("\n## Filled fields\n");
    parts.push("| # | Label | Field key | Value | Page | Signature? |");
    parts.push("| --- | --- | --- | --- | --- | --- |");
    opts.filled.forEach((f, i) => {
      parts.push(
        `| ${i + 1} | ${escapeMdCell(f.label)} | \`${f.fieldKey}\` | ` +
          `${escapeMdCell(f.value)} | ${f.page} | ${f.isSignature ? "yes" : "no"} |`
      );
    });
  } else {
    parts.push("\n_No fillable fields were identified in this document._\n");
  }

  if (opts.unfilled.length > 0) {
    parts.push("\n## Fields we didn't fill\n");
    parts.push("| Label | Field key | Cause | Reason |");
    parts.push("| --- | --- | --- | --- |");
    opts.unfilled.forEach((u) => {
      parts.push(
        `| ${escapeMdCell(u.label)} | \`${u.fieldKey}\` | ` +
          `${u.cause.replace(/_/g, " ")} | ${escapeMdCell(u.reason)} |`
      );
    });
  }

  parts.push(
    "\n---\n\n" +
      "**Caveat:** this is a visual fill — we draw typed text (and a " +
      "signature-styled rendering of your name) at each detected field. " +
      "It is NOT a cryptographically-signed document. If you need a " +
      "legally-binding e-signature with an auditable signer identity, use " +
      "DocuSign, Adobe Sign, or an equivalent e-signature service.\n"
  );

  return parts.join("\n") + "\n";
}

function escapeMdCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

// --- helpers ----------------------------------------------------------

function truncateForContext(text: string): {
  truncatedText: string;
  wasTruncated: boolean;
} {
  if (text.length <= SIGN_CHAR_BUDGET) {
    return { truncatedText: text, wasTruncated: false };
  }
  return {
    truncatedText: text.slice(0, SIGN_CHAR_BUDGET),
    wasTruncated: true,
  };
}

/**
 * "Offer Letter.pdf" → "Offer Letter — Signed.pdf"
 * "draft"            → "draft — Signed.pdf"
 */
function deriveSignedFilename(source: string | undefined): string {
  const base = (source ?? "document").replace(/\.pdf$/i, "").trim() || "document";
  return `${base} — Signed.pdf`;
}
