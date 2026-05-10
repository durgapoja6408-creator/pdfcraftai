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
// Output
// ---------------------------------------------------------------------

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
}

console.log(`tool-permalinks: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
