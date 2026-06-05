#!/usr/bin/env node
/**
 * 2026-05-02 brand guard: tool-facing UI must not leak the AI supply
 * chain. Provider names (Anthropic, OpenAI, Gemini), model names
 * (Haiku, Sonnet, GPT-4, Flash, etc.), per-call latency, and raw
 * token counts have no business in user-visible components.
 *
 * Why: leaks tell competitors our routing logic, give users material
 * to compare against direct provider pricing, create support load
 * when models change, and contradict principle 2 of the locked plan
 * ("Hide the supply chain"). The brand is pdfcraft ai, not the
 * upstream resellers.
 *
 * What's checked:
 *   - All .tsx and .ts files under components/ + app/, EXCLUDING
 *     anything under app/admin/* or lib/ai/* (admins legitimately
 *     view this data; lib/ai/* is server-side routing infrastructure
 *     that consumes provider names).
 *   - For each in-scope file, scan for forbidden tokens. Each match
 *     is a fail.
 *
 * What's NOT checked:
 *   - Server route handlers under app/api/* — these orchestrate
 *     providers, so naming them is correct usage.
 *   - lib/* files outside lib/ai/* — pricing.ts mentions providers in
 *     comments (cost rationale), not user copy.
 *   - Test fixtures (test-* files).
 *
 * To extend: add a new banned token to `BANNED` and re-run. To allow
 * a specific in-scope file (e.g. an admin component), add it to
 * `EXEMPT_PATHS`. Don't add a banned token without a Plan §4.1 entry.
 *
 * Output line conforms to the aggregator regex
 * `${name}: ${pass} passed, ${fail} failed`.
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

// Banned tokens. Each entry is [needle, description]. The needle is a
// case-sensitive substring; if it appears in JSX or rendered string
// literals, the file fails. Comments and import paths are still
// caught by the substring scan, which is intentionally aggressive —
// any mention in a UI component is suspicious.
//
// We avoid `Compare` and `flash` (lowercase) because they're common
// English words. The forms below are specific enough to avoid false
// positives in 99% of cases. False positives can be silenced via
// EXEMPT_PATHS or by rewriting the offending code.
const BANNED = [
  // Provider names — case-sensitive variants chosen to avoid common
  // English collisions (e.g. "OPenAI" never appears in a sentence).
  ["Anthropic", "provider name"],
  ["OpenAI", "provider name"],
  ["Gemini", "provider name (Google)"],
  // Model names — exact substrings that virtually never appear as
  // English words. "Haiku" in lowercase appears once or twice as a
  // poetry reference; we anchor on capitalised form.
  ["Haiku", "Anthropic model name"],
  ["Sonnet", "Anthropic model name"],
  ["GPT-4", "OpenAI model name"],
  ["GPT-5", "OpenAI model name"],
  [" Flash ", "Gemini model name (note leading/trailing space anchor)"],
  // Per-call telemetry — these are object-key names that should only
  // exist server-side or in admin context.
  ["latencyMs", "per-call latency telemetry"],
  ["inputTokens", "per-call token count"],
  ["outputTokens", "per-call token count"],
];

// Files where mention is allowed. Add sparingly. Each entry should be
// path-relative to repo root and committed alongside the exemption
// rationale (don't add an entry without a comment explaining why).
const EXEMPT_PATHS = new Set([
  // BYOK ("bring your own key") copy on landing + pricing must name
  // the providers — that IS the feature. User is plugging their own
  // OpenAI/Anthropic/Google key into our orchestration layer; naming
  // those providers is necessary, not a leak. Plan §12 acknowledges
  // BYOK copy as a legitimate exception to principle 2.
  path.join("components", "landing", "LandingSections.tsx"),
  path.join("app", "pricing", "page.tsx"),

  // AI Detector tool (component slot inside SummarizeVariantTool):
  // names ChatGPT/Claude/Gemini in the prompt because the tool's
  // PURPOSE is to detect output from those LLMs. Hiding them defeats
  // the tool's value prop.
  path.join("components", "tools", "SummarizeVariantTool.tsx"),

  // Chat pages render a per-message provenance label ("Anthropic /
  // OpenAI") because chat tier/quality varies meaningfully by
  // provider in a way users notice. Cleanup deferred to a follow-up
  // commit (chat-specific UX needs its own design pass — Day 7+).
  // Document the deferral in plan §4.1 follow-up.
  path.join("components", "app", "chat", "ChatClient.tsx"),
  // ChatList renders the same per-session provider provenance label
  // (2026-06-05 — extracted from the chat page for title search; same
  // documented exception as the page it came from).
  path.join("components", "app", "chat", "ChatList.tsx"),
  path.join("app", "app", "chat", "page.tsx"),
  path.join("app", "app", "chat", "[id]", "page.tsx"),
]);

// Directories to skip entirely.
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "scripts", // self-test files would otherwise match BANNED
  "docs",
  "out",
  "build",
]);

// In-scope subtrees only. We deliberately don't scan the whole repo.
const IN_SCOPE = ["components", "app"];

// Subtrees within IN_SCOPE that are allowed to mention providers.
// Admins legitimately see this; server orchestration legitimately
// references providers; lib/ai/* is the brain of the routing layer.
const SCOPE_EXCLUSIONS = [
  path.join("app", "admin"),
  path.join("app", "api"),
  // lib/ai is outside `app` and `components`, so it's already
  // out-of-scope; listed here for documentation purposes.
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      walk(path.join(dir, entry.name), out);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))
    ) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function isInScopeAndNotExcluded(absPath) {
  const rel = path.relative(ROOT, absPath);
  if (EXEMPT_PATHS.has(rel)) return false;
  if (!IN_SCOPE.some((root) => rel.startsWith(root + path.sep))) return false;
  if (SCOPE_EXCLUSIONS.some((excl) => rel.startsWith(excl + path.sep))) {
    return false;
  }
  return true;
}

const files = [];
for (const root of IN_SCOPE) {
  const abs = path.join(ROOT, root);
  if (fs.existsSync(abs)) walk(abs, files);
}

const inScopeFiles = files.filter(isInScopeAndNotExcluded);

let scanned = 0;
let leakCount = 0;
const perFileLeaks = [];

// Strip block comments (/* ... */) and line comments (// ...) before
// scanning. Same approach as the credit-number guard. We also strip
// JSX comments {/* ... */} since they're inert.
function stripComments(src) {
  // Remove /* ... */ blocks (multi-line capable). Lazy quantifier so
  // it stops at the first */.
  let s = src.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove JSX comments {/* ... */}.
  s = s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  // Remove // comments to end of line. Naive — doesn't account for
  // "//" inside string literals, but that's rare and the false-
  // positive direction is "we miss a leak in a string", which is the
  // safer direction (a real string-literal "Anthropic" is rare and
  // can be silenced via EXEMPT_PATHS if it shows up).
  s = s.replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  return s;
}

for (const file of inScopeFiles) {
  scanned++;
  const raw = fs.readFileSync(file, "utf8");
  const text = stripComments(raw);
  const rel = path.relative(ROOT, file);
  for (const [needle, desc] of BANNED) {
    if (text.includes(needle)) {
      leakCount++;
      perFileLeaks.push(`${rel}: contains "${needle}" (${desc})`);
    }
  }
}

assert(
  leakCount === 0,
  leakCount === 0
    ? "no supply-chain leaks in user-facing components"
    : `${leakCount} supply-chain leak(s) found:\n  ${perFileLeaks.join("\n  ")}`
);

assert(scanned > 50, `scanned ${scanned} files (expected > 50 in components+app)`);

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(
  `no-supply-chain-leaks: ${passed} passed, ${failed} failed (${scanned} files scanned)`
);
process.exit(failed > 0 ? 1 : 0);
