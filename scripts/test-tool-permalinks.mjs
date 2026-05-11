#!/usr/bin/env node
/**
 * 2026-05-08 — Item #17 from the improvement analysis: tool sharing
 * permalinks. SummarizePdfTool ships as the canary — depth state
 * syncs bidirectionally with `?depth=` in the URL, so users can
 * share `/tool/ai-summarize?depth=detailed` and a collaborator
 * lands on the right preset.
 *
 * What this guard catches:
 *   - URL → state sync removed (URL becomes informational, not
 *     bidirectional — link sharing breaks)
 *   - State → URL sync removed (UI clicks don't update the URL,
 *     defeating the share affordance)
 *   - history.replaceState swapped for pushState (would create a
 *     history entry per click — Back-button hell)
 *   - URL allowlist loosened (would let unsafe values into the
 *     `?depth=` filter — TS would catch a string-literal type
 *     error today, but the run-time guard is belt-and-braces)
 *   - Default value "standard" leaks into URL ("?depth=standard"
 *     bloats the bare path for the most common case)
 *
 * Pure static parse. Sub-second.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(msg);
  }
}

const TOOL_PATH = path.join(ROOT, "components/tools/SummarizePdfTool.tsx");
assert(fs.existsSync(TOOL_PATH), `SummarizePdfTool missing at ${TOOL_PATH}`);
if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
  console.log(`tool-permalinks: ${passed} passed, ${failed} failed`);
  process.exit(1);
}

const SRC = fs.readFileSync(TOOL_PATH, "utf8");

// ---------------------------------------------------------------------
// Section A — URL → state sync on mount.
// ---------------------------------------------------------------------

assert(
  /URLSearchParams\(window\.location\.search\)/.test(SRC),
  "URL → state sync must read `URLSearchParams(window.location.search)` " +
    "on mount. Without this, opening a `?depth=detailed` link lands on " +
    "the default state — link sharing is purely informational, not " +
    "actionable.",
);

assert(
  /params\.get\("depth"\)/.test(SRC),
  "Mount-effect must call `params.get(\"depth\")` to read the saved " +
    "depth from the URL.",
);

// Allowlist — exactly the three Depth literals. Loosening to a generic
// "if (raw)" branch would let URL-injected garbage flow into setDepth
// (TS would catch that today via the literal-typed Depth, but the
// run-time guard is belt-and-braces against future type drift).
assert(
  /raw\s*===\s*"tldr"\s*\|\|\s*raw\s*===\s*"standard"\s*\|\|\s*raw\s*===\s*"detailed"/.test(
    SRC,
  ),
  "URL parser must whitelist the three Depth values explicitly: " +
    "`raw === \"tldr\" || raw === \"standard\" || raw === \"detailed\"`. " +
    "Anything looser lets URL-injected garbage flow into setDepth.",
);

// ---------------------------------------------------------------------
// Section B — state → URL sync on change.
// ---------------------------------------------------------------------

assert(
  /useEffect\(\(\)\s*=>\s*\{[\s\S]*?history\.replaceState[\s\S]*?\},\s*\[depth\]\)/.test(
    SRC,
  ),
  "depth → URL sync must live in a `useEffect(() => { ... history." +
    "replaceState(...) }, [depth])` so URL updates whenever depth " +
    "changes via UI clicks. The [depth] dep is what makes it " +
    "reactive; an empty dep array (mount-only) would make the URL " +
    "stick at the initial value.",
);

assert(
  /history\.replaceState/.test(SRC),
  "URL sync must use `history.replaceState`. `pushState` would " +
    "create a back-stack entry per click — Back-button hell on a " +
    "tool runner.",
);

// Negative — must NOT use pushState for the URL sync. Check that
// pushState doesn't appear in the depth-sync useEffect block.
const depthEffectMatch = SRC.match(
  /useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[depth\]\)/,
);
if (depthEffectMatch) {
  assert(
    !/pushState/.test(depthEffectMatch[1]),
    "depth-sync effect uses pushState — would clutter back history " +
      "with one entry per click. Use replaceState.",
  );
}

// ---------------------------------------------------------------------
// Section C — default value omitted from URL.
// ---------------------------------------------------------------------
//
// Most users hit /tool/ai-summarize without any param and see the
// default ("standard"). Writing "?depth=standard" back into the URL
// for the default would bloat the bare path for the most common case
// — uglier share-able URLs and noisier bookmarks.

assert(
  /depth\s*===\s*"standard"\s*\)\s*\{\s*params\.delete\("depth"\)/.test(SRC),
  "Default value must be omitted from the URL: " +
    "`if (depth === \"standard\") params.delete(\"depth\")`. Without " +
    "the delete branch, the URL ends up with `?depth=standard` for " +
    "the most common case.",
);

// ---------------------------------------------------------------------
// Section D — SSR safety.
// ---------------------------------------------------------------------

assert(
  /typeof window === "undefined"/.test(SRC),
  "Permalink effects must guard `typeof window === \"undefined\"` so " +
    "they no-op during SSR. Without this, hydration crashes on " +
    "ReferenceError: window is not defined.",
);

// ---------------------------------------------------------------------
// Section E — TranslatePdfTool sweep expansion (?lang=).
// ---------------------------------------------------------------------
//
// Sweep batch 1 — TranslatePdfTool.tsx wires the same pattern as the
// SummarizePdfTool canary, but for `?lang=<bcp47>`. The dispatch is
// slightly more complex because Translate uses a two-state shape:
// `langChoice` (dropdown) flips to OTHER_CODE_SENTINEL when the user
// picks Other, and `customLang` holds the BCP-47 string in that
// case. The mount effect must replicate the same dispatch logic
// applyMacro uses (common → langChoice; arbitrary → SENTINEL +
// customLang) so permalinks behave identically to manual UI picks.

const TRANSLATE_PATH = path.join(ROOT, "components/tools/TranslatePdfTool.tsx");
assert(fs.existsSync(TRANSLATE_PATH), `TranslatePdfTool missing at ${TRANSLATE_PATH}`);
const TRANS = fs.existsSync(TRANSLATE_PATH) ? fs.readFileSync(TRANSLATE_PATH, "utf8") : "";

assert(
  /URLSearchParams\(window\.location\.search\)/.test(TRANS),
  "TranslatePdfTool: URL → state sync must read URLSearchParams on mount.",
);

assert(
  /params\.get\("lang"\)/.test(TRANS),
  "TranslatePdfTool: mount-effect must call `params.get(\"lang\")`.",
);

assert(
  /BCP47_ISH\.test\(/.test(TRANS),
  "TranslatePdfTool: URL parser must validate via BCP47_ISH regex. " +
    "Anything looser lets URL-injected garbage flow into setLangChoice.",
);

assert(
  /COMMON_LANG_CODES\.has\(/.test(TRANS),
  "TranslatePdfTool: mount-effect must dispatch via COMMON_LANG_CODES.has " +
    "to mirror applyMacro's common-vs-Other branch. Without this the " +
    "OTHER_CODE_SENTINEL path is unreachable from URL.",
);

assert(
  /useEffect\(\(\)\s*=>\s*\{[\s\S]*?history\.replaceState[\s\S]*?\},\s*\[currentTargetLang\]\)/.test(
    TRANS,
  ),
  "TranslatePdfTool: state → URL sync must live in `useEffect(..., " +
    "[currentTargetLang])`. The dep must be the DERIVED " +
    "currentTargetLang, not langChoice + customLang separately, so " +
    "Other-mode mid-typing (invalid BCP-47) doesn't write garbage to " +
    "the URL.",
);

assert(
  /currentTargetLang === null \|\| currentTargetLang === "es"/.test(TRANS),
  "TranslatePdfTool: default value (es) AND null (invalid Other-mode " +
    "input) must be omitted from URL via params.delete. Without this, " +
    "URL bloats with `?lang=es` for the default case OR carries a stale " +
    "param while the user is mid-typing a custom code.",
);

assert(
  /typeof window === "undefined"/.test(TRANS),
  "TranslatePdfTool: permalink effects must guard SSR with `typeof " +
    "window === \"undefined\"`.",
);

// Negative — pushState must NOT appear in the lang-sync effect.
const langEffectMatch = TRANS.match(
  /useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[currentTargetLang\]\)/,
);
if (langEffectMatch) {
  assert(
    !/pushState/.test(langEffectMatch[1]),
    "TranslatePdfTool: lang-sync effect uses pushState — back-button hell. " +
      "Use replaceState.",
  );
}

// ---------------------------------------------------------------------
// Section F — RewritePdfTool sweep batch 2 (?mode=).
// ---------------------------------------------------------------------
//
// Sweep batch 2 — RewritePdfTool wires the same pattern but for
// `?mode=<simplify|formal|casual|concise|expand>`. Single-state
// (no Other branch like Translate's), so the dispatch is the
// simpler 5-literal allowlist shape.

const REWRITE_PATH = path.join(ROOT, "components/tools/RewritePdfTool.tsx");
assert(fs.existsSync(REWRITE_PATH), `RewritePdfTool missing at ${REWRITE_PATH}`);
const REWRITE = fs.existsSync(REWRITE_PATH) ? fs.readFileSync(REWRITE_PATH, "utf8") : "";

assert(
  /params\.get\("mode"\)/.test(REWRITE),
  "RewritePdfTool: mount-effect must call `params.get(\"mode\")`.",
);

assert(
  /raw\s*===\s*"simplify"\s*\|\|\s*raw\s*===\s*"formal"\s*\|\|\s*raw\s*===\s*"casual"\s*\|\|\s*raw\s*===\s*"concise"\s*\|\|\s*raw\s*===\s*"expand"/.test(
    REWRITE,
  ),
  "RewritePdfTool: URL parser must whitelist all 5 Mode literals " +
    "explicitly. Loosening to a generic check would let URL-injected " +
    "garbage flow into setMode.",
);

assert(
  /useEffect\(\(\)\s*=>\s*\{[\s\S]*?history\.replaceState[\s\S]*?\},\s*\[mode\]\)/.test(
    REWRITE,
  ),
  "RewritePdfTool: state → URL sync must live in `useEffect(..., [mode])`.",
);

assert(
  /mode === "simplify"\s*\)\s*\{\s*params\.delete\("mode"\)/.test(REWRITE),
  "RewritePdfTool: default value `simplify` must be omitted from URL " +
    "via params.delete. Without this, every URL carries `?mode=simplify` " +
    "for the most common case.",
);

assert(
  /typeof window === "undefined"/.test(REWRITE),
  "RewritePdfTool: permalink effects must guard SSR with `typeof " +
    "window === \"undefined\"`.",
);

const modeEffectMatch = REWRITE.match(
  /useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[mode\]\)/,
);
if (modeEffectMatch) {
  assert(
    !/pushState/.test(modeEffectMatch[1]),
    "RewritePdfTool: mode-sync effect uses pushState — back-button " +
      "hell. Use replaceState.",
  );
}

// ---------------------------------------------------------------------
// Section G — GeneratePdfTool sweep batch 3 (?docType=&length=&tone=).
// ---------------------------------------------------------------------
//
// Sweep batch 3 — GeneratePdfTool wires the same pattern with THREE
// params syncing in tandem. The state → URL sync MUST be a single
// useEffect with a 3-tuple dep array, not three separate effects:
// history.replaceState doesn't batch within React's render cycle, so
// three separate effects would race and the URL would temporarily
// drop two of the three params before the final state lands.

const GENERATE_PATH = path.join(ROOT, "components/tools/GeneratePdfTool.tsx");
assert(fs.existsSync(GENERATE_PATH), `GeneratePdfTool missing at ${GENERATE_PATH}`);
const GENERATE = fs.existsSync(GENERATE_PATH) ? fs.readFileSync(GENERATE_PATH, "utf8") : "";

assert(
  /params\.get\("docType"\)/.test(GENERATE) &&
    /params\.get\("length"\)/.test(GENERATE) &&
    /params\.get\("tone"\)/.test(GENERATE),
  "GeneratePdfTool: mount-effect must read all 3 params (docType / " +
    "length / tone). A missing branch leaves that field stuck at the " +
    "default for permalink consumers.",
);

// Whitespace-tolerant — the source has multi-line breaks between
// the six `||` conjuncts.
assert(
  /rawDocType\s*===\s*"memo"\s*\|\|\s*rawDocType\s*===\s*"report"\s*\|\|\s*rawDocType\s*===\s*"brief"\s*\|\|\s*rawDocType\s*===\s*"letter"\s*\|\|\s*rawDocType\s*===\s*"blog"\s*\|\|\s*rawDocType\s*===\s*"outline"\s*\|\|\s*rawDocType\s*===\s*"other"/.test(
    GENERATE,
  ),
  "GeneratePdfTool: docType allowlist must enumerate all 7 DocType " +
    "literals. Loosening lets URL-injected values into setDocType.",
);

assert(
  /rawLength === "short" \|\| rawLength === "medium" \|\| rawLength === "long"/.test(
    GENERATE,
  ),
  "GeneratePdfTool: length allowlist must enumerate all 3 Length literals.",
);

assert(
  /rawTone\s*===\s*"neutral"\s*\|\|\s*rawTone\s*===\s*"formal"\s*\|\|\s*rawTone\s*===\s*"casual"\s*\|\|\s*rawTone\s*===\s*"technical"/.test(
    GENERATE,
  ),
  "GeneratePdfTool: tone allowlist must enumerate all 4 Tone literals.",
);

assert(
  /useEffect\(\(\)\s*=>\s*\{[\s\S]*?history\.replaceState[\s\S]*?\},\s*\[docType,\s*length,\s*tone\]\)/.test(
    GENERATE,
  ),
  "GeneratePdfTool: state → URL sync must live in a SINGLE useEffect " +
    "with `[docType, length, tone]` dep array. Three separate effects " +
    "would race because history.replaceState doesn't batch within " +
    "React's render cycle — the URL would temporarily drop 2 of the " +
    "3 params before the final state lands.",
);

assert(
  /docType === "other"\s*\)\s*params\.delete\("docType"\)/.test(GENERATE) &&
    /length === "medium"\s*\)\s*params\.delete\("length"\)/.test(GENERATE) &&
    /tone === "neutral"\s*\)\s*params\.delete\("tone"\)/.test(GENERATE),
  "GeneratePdfTool: each of the 3 defaults (other / medium / neutral) " +
    "must be omitted from URL via params.delete. Without per-param " +
    "delete branches, the bare path bloats with `?docType=other&" +
    "length=medium&tone=neutral` for the most common shape.",
);

assert(
  /typeof window === "undefined"/.test(GENERATE),
  "GeneratePdfTool: permalink effects must guard SSR with `typeof " +
    "window === \"undefined\"`.",
);

const generateEffectMatch = GENERATE.match(
  /useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[docType,\s*length,\s*tone\]\)/,
);
if (generateEffectMatch) {
  assert(
    !/pushState/.test(generateEffectMatch[1]),
    "GeneratePdfTool: 3-param sync effect uses pushState — back-button " +
      "hell. Use replaceState.",
  );
}

// ---------------------------------------------------------------------
// Section H — PdfCompressTool sweep batch 4 (?level=) — first free tool.
// ---------------------------------------------------------------------
//
// Sweep batch 4 — PdfCompressTool wires `?level=<light|balanced|strong>`.
// First FREE tool to ship the permalink pattern (the prior batches
// were all AI tools). Confirms the pattern transfers cleanly to the
// non-AI tool-runner surface.

const COMPRESS_PATH = path.join(ROOT, "components/tools/PdfCompressTool.tsx");
assert(fs.existsSync(COMPRESS_PATH), `PdfCompressTool missing at ${COMPRESS_PATH}`);
const COMPRESS = fs.existsSync(COMPRESS_PATH) ? fs.readFileSync(COMPRESS_PATH, "utf8") : "";

assert(
  /params\.get\("level"\)/.test(COMPRESS),
  "PdfCompressTool: mount-effect must call `params.get(\"level\")`.",
);

assert(
  /raw\s*===\s*"light"\s*\|\|\s*raw\s*===\s*"balanced"\s*\|\|\s*raw\s*===\s*"strong"/.test(
    COMPRESS,
  ),
  "PdfCompressTool: URL parser must whitelist all 3 CompressLevel " +
    "literals explicitly. Loosening lets URL-injected garbage flow " +
    "into setLevel.",
);

assert(
  /useEffect\(\(\)\s*=>\s*\{[\s\S]*?history\.replaceState[\s\S]*?\},\s*\[level\]\)/.test(
    COMPRESS,
  ),
  "PdfCompressTool: state → URL sync must live in `useEffect(..., [level])`.",
);

assert(
  /level === "balanced"\s*\)\s*\{\s*params\.delete\("level"\)/.test(COMPRESS),
  "PdfCompressTool: default value `balanced` must be omitted from URL " +
    "via params.delete. Without this the bare path bloats with " +
    "`?level=balanced` for the most common case.",
);

assert(
  /typeof window === "undefined"/.test(COMPRESS),
  "PdfCompressTool: permalink effects must guard SSR with `typeof " +
    "window === \"undefined\"`.",
);

const compressEffectMatch = COMPRESS.match(
  /useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[level\]\)/,
);
if (compressEffectMatch) {
  assert(
    !/pushState/.test(compressEffectMatch[1]),
    "PdfCompressTool: level-sync effect uses pushState — back-button " +
      "hell. Use replaceState.",
  );
}

// ---------------------------------------------------------------------
// Section I — PdfRasterizeTool sweep batch 5 (numeric ?scale=).
// ---------------------------------------------------------------------
//
// Sweep batch 5 — PdfRasterizeTool wires `?scale=<1|2|3>` — the
// first NUMERIC variant in the sweep. State is a numeric union
// type (1 | 2 | 3) so the URL parser must dispatch on string-
// compared digits (the URL value is always string-typed) and
// setScale receives the numeric literal. The String() conversion
// on write keeps types crisp on the way out.

const RASTERIZE_PATH = path.join(ROOT, "components/tools/PdfRasterizeTool.tsx");
assert(fs.existsSync(RASTERIZE_PATH), `PdfRasterizeTool missing at ${RASTERIZE_PATH}`);
const RASTERIZE = fs.existsSync(RASTERIZE_PATH) ? fs.readFileSync(RASTERIZE_PATH, "utf8") : "";

assert(
  /params\.get\("scale"\)/.test(RASTERIZE),
  "PdfRasterizeTool: mount-effect must call `params.get(\"scale\")`.",
);

assert(
  /raw === "1"\s*\)\s*setScale\(1\);?\s*else if\s*\(\s*raw === "2"\s*\)\s*setScale\(2\);?\s*else if\s*\(\s*raw === "3"\s*\)\s*setScale\(3\)/.test(
    RASTERIZE,
  ),
  "PdfRasterizeTool: URL parser must dispatch via string-compared " +
    "digits (\"1\"/\"2\"/\"3\") to numeric setScale(1/2/3). The numeric " +
    "literal types require explicit branching — `parseInt(raw, 10)` " +
    "would widen back to `number` and lose the 1|2|3 union.",
);

assert(
  /useEffect\(\(\)\s*=>\s*\{[\s\S]*?history\.replaceState[\s\S]*?\},\s*\[scale\]\)/.test(
    RASTERIZE,
  ),
  "PdfRasterizeTool: state → URL sync must live in `useEffect(..., [scale])`.",
);

assert(
  /scale === 2\s*\)\s*\{\s*params\.delete\("scale"\)/.test(RASTERIZE),
  "PdfRasterizeTool: default value `2` must be omitted from URL.",
);

assert(
  /params\.set\("scale",\s*String\(scale\)\)/.test(RASTERIZE),
  "PdfRasterizeTool: non-default value must be written via `String(scale)`. " +
    "URLSearchParams accepts numbers but TS sometimes wants the explicit " +
    "conversion; the cast also future-proofs against the type widening " +
    "if Scale ever grows.",
);

assert(
  /typeof window === "undefined"/.test(RASTERIZE),
  "PdfRasterizeTool: permalink effects must guard SSR with `typeof " +
    "window === \"undefined\"`.",
);

const rasterEffectMatch = RASTERIZE.match(
  /useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[scale\]\)/,
);
if (rasterEffectMatch) {
  assert(
    !/pushState/.test(rasterEffectMatch[1]),
    "PdfRasterizeTool: scale-sync effect uses pushState — back-button " +
      "hell. Use replaceState.",
  );
}

// ---------------------------------------------------------------------
// Section J — ImagesToPdfTool sweep batch 6 (?pageSize=&landscape=).
// ---------------------------------------------------------------------
//
// Sweep batch 6 — ImagesToPdfTool wires `?pageSize=<letter|a4|a3|a5|
// legal|fit>&landscape=<1>`. Mixed-type 2-param shape: string-literal
// enum + boolean. Single useEffect with [pageSize, landscape] dep
// array — separate effects would race per the replaceState non-
// batching invariant (same load-bearing detail as Generate's 3-param
// sync).

const IMG2PDF_PATH = path.join(ROOT, "components/tools/ImagesToPdfTool.tsx");
assert(fs.existsSync(IMG2PDF_PATH), `ImagesToPdfTool missing at ${IMG2PDF_PATH}`);
const IMG2PDF = fs.existsSync(IMG2PDF_PATH) ? fs.readFileSync(IMG2PDF_PATH, "utf8") : "";

assert(
  /params\.get\("pageSize"\)/.test(IMG2PDF) && /params\.get\("landscape"\)/.test(IMG2PDF),
  "ImagesToPdfTool: mount-effect must read both `pageSize` and " +
    "`landscape` params.",
);

assert(
  /rawSize\s*===\s*"letter"\s*\|\|\s*rawSize\s*===\s*"a4"\s*\|\|\s*rawSize\s*===\s*"a3"\s*\|\|\s*rawSize\s*===\s*"a5"\s*\|\|\s*rawSize\s*===\s*"legal"\s*\|\|\s*rawSize\s*===\s*"fit"/.test(
    IMG2PDF,
  ),
  "ImagesToPdfTool: pageSize allowlist must enumerate all 6 PaperSize " +
    "literals.",
);

assert(
  /rawLand === "1" \|\| rawLand === "true"/.test(IMG2PDF),
  "ImagesToPdfTool: landscape boolean must accept both `1` and `true` " +
    "URL values — conservative dispatch where only explicit-truthy " +
    "strings flip the state.",
);

assert(
  /useEffect\(\(\)\s*=>\s*\{[\s\S]*?history\.replaceState[\s\S]*?\},\s*\[pageSize,\s*landscape\]\)/.test(
    IMG2PDF,
  ),
  "ImagesToPdfTool: state → URL sync must live in a SINGLE useEffect " +
    "with `[pageSize, landscape]` dep array. Separate effects would race " +
    "because history.replaceState doesn't batch within React's render " +
    "cycle (same load-bearing detail as GeneratePdfTool's 3-param sync).",
);

assert(
  /pageSize === "letter"\s*\)\s*params\.delete\("pageSize"\)/.test(IMG2PDF),
  "ImagesToPdfTool: default `letter` must be omitted from URL.",
);

assert(
  /!landscape\s*\)\s*params\.delete\("landscape"\)/.test(IMG2PDF),
  "ImagesToPdfTool: default `false` for landscape must be omitted via " +
    "`if (!landscape) params.delete(...)`. The negated check is the " +
    "right shape because boolean defaults to false.",
);

assert(
  /params\.set\("landscape", "1"\)/.test(IMG2PDF),
  "ImagesToPdfTool: when landscape is true, URL must write `\"1\"` " +
    "(short form). The mount-effect accepts both `1` and `true` — write " +
    "the shorter one to keep URLs compact.",
);

assert(
  /typeof window === "undefined"/.test(IMG2PDF),
  "ImagesToPdfTool: permalink effects must guard SSR.",
);

const img2pdfEffectMatch = IMG2PDF.match(
  /useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[pageSize,\s*landscape\]\)/,
);
if (img2pdfEffectMatch) {
  assert(
    !/pushState/.test(img2pdfEffectMatch[1]),
    "ImagesToPdfTool: sync effect uses pushState — back-button hell.",
  );
}

// ---------------------------------------------------------------------
// Section K — PdfPageNumbersTool sweep batch 7 (?position=&format=&fontSize=).
// ---------------------------------------------------------------------
//
// Sweep batch 7 — PdfPageNumbersTool wires 3-param permalink with a
// NEW shape variant: an unbounded number (fontSize). Mount-effect
// parses with parseInt + Number.isFinite + bounds check (4-24) to
// reject URL-injected garbage like ?fontSize=9999 or NaN. Format
// values contain spaces ("1 of N", "Page 1 of N") — URLSearchParams
// handles the encoding transparently.

const PAGENUM_PATH = path.join(ROOT, "components/tools/PdfPageNumbersTool.tsx");
assert(fs.existsSync(PAGENUM_PATH), `PdfPageNumbersTool missing at ${PAGENUM_PATH}`);
const PAGENUM = fs.existsSync(PAGENUM_PATH) ? fs.readFileSync(PAGENUM_PATH, "utf8") : "";

assert(
  /params\.get\("position"\)/.test(PAGENUM) &&
    /params\.get\("format"\)/.test(PAGENUM) &&
    /params\.get\("fontSize"\)/.test(PAGENUM),
  "PdfPageNumbersTool: mount-effect must read all 3 params.",
);

assert(
  /rawPos\s*===\s*"bottom-center"\s*\|\|\s*rawPos\s*===\s*"bottom-right"\s*\|\|\s*rawPos\s*===\s*"bottom-left"\s*\|\|\s*rawPos\s*===\s*"top-center"\s*\|\|\s*rawPos\s*===\s*"top-right"\s*\|\|\s*rawPos\s*===\s*"top-left"/.test(
    PAGENUM,
  ),
  "PdfPageNumbersTool: position allowlist must enumerate all 6 Position literals.",
);

assert(
  /rawFmt\s*===\s*"1"\s*\|\|\s*rawFmt\s*===\s*"1 of N"\s*\|\|\s*rawFmt\s*===\s*"Page 1"\s*\|\|\s*rawFmt\s*===\s*"Page 1 of N"/.test(
    PAGENUM,
  ),
  "PdfPageNumbersTool: format allowlist must enumerate all 4 NumberFormat " +
    "literals — including the ones with spaces (\"1 of N\", \"Page 1 of N\"). " +
    "URLSearchParams encodes spaces transparently; the allowlist must " +
    "match the raw decoded values.",
);

assert(
  /parseInt\(rawSize,\s*10\)/.test(PAGENUM),
  "PdfPageNumbersTool: fontSize must parse via parseInt(_, 10) — " +
    "URL values are strings, and parseInt is the standard browser-safe " +
    "way to coerce.",
);

assert(
  /Number\.isFinite\(n\)\s*&&\s*n >= 4\s*&&\s*n <= 24/.test(PAGENUM),
  "PdfPageNumbersTool: fontSize must validate Number.isFinite + bounds " +
    "(4..24). Without this, ?fontSize=NaN or ?fontSize=9999 flows " +
    "straight into setFontSize and renders garbage.",
);

assert(
  /useEffect\(\(\)\s*=>\s*\{[\s\S]*?history\.replaceState[\s\S]*?\},\s*\[position,\s*format,\s*fontSize\]\)/.test(
    PAGENUM,
  ),
  "PdfPageNumbersTool: state → URL sync must live in a SINGLE useEffect " +
    "with `[position, format, fontSize]` dep array. Three separate " +
    "effects would race per the replaceState non-batching invariant.",
);

assert(
  /position === "bottom-center"\s*\)\s*params\.delete\("position"\)/.test(PAGENUM),
  "PdfPageNumbersTool: default `bottom-center` must be omitted from URL.",
);

assert(
  /format === "1 of N"\s*\)\s*params\.delete\("format"\)/.test(PAGENUM),
  "PdfPageNumbersTool: default `1 of N` must be omitted from URL.",
);

assert(
  /fontSize === 11\s*\)\s*params\.delete\("fontSize"\)/.test(PAGENUM),
  "PdfPageNumbersTool: default `11` must be omitted from URL.",
);

assert(
  /params\.set\("fontSize",\s*String\(fontSize\)\)/.test(PAGENUM),
  "PdfPageNumbersTool: non-default fontSize must write via " +
    "`String(fontSize)`. URLSearchParams accepts numbers but explicit " +
    "conversion is the canonical shape.",
);

assert(
  /typeof window === "undefined"/.test(PAGENUM),
  "PdfPageNumbersTool: permalink effects must guard SSR.",
);

const pagenumEffectMatch = PAGENUM.match(
  /useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[position,\s*format,\s*fontSize\]\)/,
);
if (pagenumEffectMatch) {
  assert(
    !/pushState/.test(pagenumEffectMatch[1]),
    "PdfPageNumbersTool: 3-param sync effect uses pushState — back-button hell.",
  );
}

// ---------------------------------------------------------------------
// Section L — PdfResizeTool sweep batch 8 (?size=&landscape=).
// ---------------------------------------------------------------------
//
// Sweep batch 8 — PdfResizeTool wires the same mixed-type 2-param
// shape as ImagesToPdfTool (5-literal PaperSize + boolean landscape).
// Fewer enum members because resize is always to a concrete paper
// (no "fit" option).

const RESIZE_PATH = path.join(ROOT, "components/tools/PdfResizeTool.tsx");
assert(fs.existsSync(RESIZE_PATH), `PdfResizeTool missing at ${RESIZE_PATH}`);
const RESIZE = fs.existsSync(RESIZE_PATH) ? fs.readFileSync(RESIZE_PATH, "utf8") : "";

assert(
  /params\.get\("size"\)/.test(RESIZE) && /params\.get\("landscape"\)/.test(RESIZE),
  "PdfResizeTool: mount-effect must read both `size` and `landscape` params.",
);

assert(
  /rawSize\s*===\s*"letter"\s*\|\|\s*rawSize\s*===\s*"legal"\s*\|\|\s*rawSize\s*===\s*"a4"\s*\|\|\s*rawSize\s*===\s*"a3"\s*\|\|\s*rawSize\s*===\s*"a5"/.test(
    RESIZE,
  ),
  "PdfResizeTool: size allowlist must enumerate all 5 PaperSize literals.",
);

assert(
  /rawLand === "1" \|\| rawLand === "true"/.test(RESIZE),
  "PdfResizeTool: landscape must accept both `1` and `true` URL forms.",
);

assert(
  /useEffect\(\(\)\s*=>\s*\{[\s\S]*?history\.replaceState[\s\S]*?\},\s*\[size,\s*landscape\]\)/.test(
    RESIZE,
  ),
  "PdfResizeTool: state → URL sync must live in a SINGLE useEffect " +
    "with `[size, landscape]` dep array per the replaceState non-" +
    "batching invariant.",
);

assert(
  /size === "letter"\s*\)\s*params\.delete\("size"\)/.test(RESIZE),
  "PdfResizeTool: default `letter` must be omitted from URL.",
);

assert(
  /!landscape\s*\)\s*params\.delete\("landscape"\)/.test(RESIZE),
  "PdfResizeTool: default `false` for landscape must be omitted via " +
    "negated `!landscape` check.",
);

assert(
  /params\.set\("landscape", "1"\)/.test(RESIZE),
  "PdfResizeTool: landscape write side must emit `\"1\"` short form.",
);

assert(
  /typeof window === "undefined"/.test(RESIZE),
  "PdfResizeTool: permalink effects must guard SSR.",
);

const resizeEffectMatch = RESIZE.match(
  /useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[size,\s*landscape\]\)/,
);
if (resizeEffectMatch) {
  assert(
    !/pushState/.test(resizeEffectMatch[1]),
    "PdfResizeTool: sync effect uses pushState — back-button hell.",
  );
}

// ---------------------------------------------------------------------
// Section M — TextToPdfTool sweep batch 9 (?fontFamily=&fontSize=&pageSize=).
// ---------------------------------------------------------------------
//
// Sweep batch 9 — TextToPdfTool 3-param shape combining string-literal
// enum (3) + bounded number (4..72) + string-literal enum (2). Wider
// fontSize bounds than PageNumbers (4..24) because text-to-pdf is
// body copy, not page-number garnish.

const TEXT2PDF_PATH = path.join(ROOT, "components/tools/TextToPdfTool.tsx");
assert(fs.existsSync(TEXT2PDF_PATH), `TextToPdfTool missing at ${TEXT2PDF_PATH}`);
const TEXT2PDF = fs.existsSync(TEXT2PDF_PATH) ? fs.readFileSync(TEXT2PDF_PATH, "utf8") : "";

assert(
  /params\.get\("fontFamily"\)/.test(TEXT2PDF) &&
    /params\.get\("fontSize"\)/.test(TEXT2PDF) &&
    /params\.get\("pageSize"\)/.test(TEXT2PDF),
  "TextToPdfTool: mount-effect must read all 3 params.",
);

assert(
  /rawFam === "monospace" \|\| rawFam === "sans" \|\| rawFam === "serif"/.test(
    TEXT2PDF,
  ),
  "TextToPdfTool: fontFamily allowlist must enumerate all 3 TextFontFamily literals.",
);

assert(
  /Number\.isFinite\(n\)\s*&&\s*n >= 4\s*&&\s*n <= 72/.test(TEXT2PDF),
  "TextToPdfTool: fontSize must validate Number.isFinite + bounds (4..72). " +
    "Wider than PdfPageNumbersTool's 4..24 because text-to-pdf renders " +
    "body copy at all sizes, not just page-number garnish.",
);

assert(
  /rawPage === "letter" \|\| rawPage === "a4"/.test(TEXT2PDF),
  "TextToPdfTool: pageSize allowlist must enumerate the 2 PaperSize " +
    "literals for text-to-pdf (letter / a4 only — text rendering doesn't " +
    "support fit / a3 / a5).",
);

assert(
  /useEffect\(\(\)\s*=>\s*\{[\s\S]*?history\.replaceState[\s\S]*?\},\s*\[fontFamily,\s*fontSize,\s*pageSize\]\)/.test(
    TEXT2PDF,
  ),
  "TextToPdfTool: state → URL sync must live in a SINGLE useEffect " +
    "with `[fontFamily, fontSize, pageSize]` 3-tuple dep per the " +
    "replaceState non-batching invariant.",
);

assert(
  /fontFamily === "monospace"\s*\)\s*params\.delete\("fontFamily"\)/.test(TEXT2PDF),
  "TextToPdfTool: default `monospace` must be omitted from URL.",
);

assert(
  /fontSize === 11\s*\)\s*params\.delete\("fontSize"\)/.test(TEXT2PDF),
  "TextToPdfTool: default `11` must be omitted from URL.",
);

assert(
  /pageSize === "letter"\s*\)\s*params\.delete\("pageSize"\)/.test(TEXT2PDF),
  "TextToPdfTool: default `letter` must be omitted from URL.",
);

assert(
  /params\.set\("fontSize",\s*String\(fontSize\)\)/.test(TEXT2PDF),
  "TextToPdfTool: non-default fontSize must write via `String(fontSize)`.",
);

assert(
  /typeof window === "undefined"/.test(TEXT2PDF),
  "TextToPdfTool: permalink effects must guard SSR.",
);

const text2pdfEffectMatch = TEXT2PDF.match(
  /useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[fontFamily,\s*fontSize,\s*pageSize\]\)/,
);
if (text2pdfEffectMatch) {
  assert(
    !/pushState/.test(text2pdfEffectMatch[1]),
    "TextToPdfTool: 3-param sync effect uses pushState — back-button hell.",
  );
}

// ---------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
}

console.log(`tool-permalinks: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
