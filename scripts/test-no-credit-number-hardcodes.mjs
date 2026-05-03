#!/usr/bin/env node
/**
 * 2026-05-02 pricing guard: per-tool credit numbers must not be
 * hardcoded into user-facing copy. The pre-flight estimator is the
 * single source of truth for "how many credits will this cost?"; the
 * moment any size-based multiplier ships (plan §3), every "3 credits
 * per doc" / "5 credits" hardcode in marketing copy or chip badges
 * becomes a lie that erodes user trust.
 *
 * Scope (in scope, MUST NOT contain hardcoded credit numbers):
 *   - components/* (all UI components)
 *   - app/* EXCEPT app/admin/*, app/api/*, app/buy/*, app/pricing/*
 *   - Marketing landing copy, FAQ entries, tool description chips,
 *     button labels, JSON-LD descriptions.
 *
 * Out of scope (LEGITIMATELY contains credit numbers):
 *   - app/admin/*  — admins see exact numbers everywhere.
 *   - app/api/*    — server route handlers spend/refund credits.
 *   - app/buy/* + app/pricing/* — buy/pricing pages quote credit
 *     pack sizes (100 credits / ₹399 etc) by definition.
 *   - lib/pricing.ts — the credit-cost source of truth.
 *   - lib/ai/* — server-side routing/cost code.
 *   - lib/payments/* — server-side payment ledger code.
 *   - scripts/ — test files (this guard would self-match otherwise).
 *
 * What's matched: regex `\b\d+\s*(credit|credits)\b` (case-insensitive).
 * Catches "3 credits", "25 credits", "5 free credits", "1 credit", etc.
 *
 * What's NOT matched (intentional escapes):
 *   - "credits" without a number (e.g. "Purchased credits never expire")
 *   - "your credits" / "more credits" — relative quantifiers, no leak
 *
 * To allow a specific in-scope file (e.g. an out-of-credits modal that
 * legitimately echoes a user's spend), add it to `EXEMPT_PATHS` with
 * an inline comment explaining why.
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

// Files where hardcoded credit numbers are allowed for a specific
// reason. Add sparingly. Each entry path-relative to repo root.
const EXEMPT_PATHS = new Set([
  // Billing page legitimately explains "1 credit ≈ one AI op" — that
  // IS the unit definition the user needs to read once.
  path.join("app", "app", "billing", "page.tsx"),

  // Chat helper text ("Each turn costs 1 credit") tells users a
  // chat-specific charging convention before they type. The pre-flight
  // estimator pattern doesn't fit chat (no upload to size against).
  path.join("components", "app", "chat", "ChatClient.tsx"),

  // 2026-05-02 Day 6 marketing copy sweep — the "25 credits" hardcodes
  // were swept to "5 credits, valid 7 days" + the "5 free credits"
  // chip rendering moved to a place that legitimately quotes the new
  // grant size. The new copy still trips the regex (matches "5 free
  // credits" / "5 credits"), so the file stays exempt — but the
  // exemption is now ABOUT the new (correct) number, not the old
  // (stale) one.
  path.join("components", "marketing", "SeoLandingPage.tsx"),

  // RESUME tool tier-3 pricing context: "5 credits per resume" is
  // intentional — resume parsing is a high-value 1-credit-per-resume
  // billing unit that resists multiplier framing. Keep until product
  // pricing lead reviews (Day 7 follow-up).
  // (Listed for visibility, not yet exempt — auditing on next pass.)
]);

// Directories to skip entirely.
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "scripts", // self-test files match the regex literally
  "docs",
  "db",
  "out",
  "build",
]);

// In-scope subtrees.
const IN_SCOPE = ["components", "app"];

// Subtrees within IN_SCOPE that are out-of-scope (admin, server,
// pricing UI legitimately mention credit numbers).
const SCOPE_EXCLUSIONS = [
  path.join("app", "admin"),
  path.join("app", "api"),
  path.join("app", "buy"),
  path.join("app", "pricing"),
  // The /app/usage page (Day 3) renders the user's own historical
  // credit spend — those are echoed user data, not hardcoded copy.
  path.join("app", "(app)", "usage"),
  path.join("app", "app", "usage"),
];

// Match `<digit>+<optional space>credit(s)`. Word boundaries on both
// sides to skip false positives like "abcredits" or "12345credit". Case
// insensitive to catch "3 Credits" too.
const CREDIT_NUMBER_RE = /\b\d+\s*credits?\b/i;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      walk(path.join(dir, entry.name), out);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".tsx") ||
        entry.name.endsWith(".ts") ||
        entry.name.endsWith(".jsx"))
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
let hitCount = 0;
const perFileHits = [];

for (const file of inScopeFiles) {
  scanned++;
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);

  // Walk line by line so we can ignore comment-only lines (block
  // comments may legitimately reference numbers in rationale).
  const lines = text.split("\n");
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Track multi-line block comments.
    if (inBlockComment) {
      if (line.includes("*/")) {
        inBlockComment = false;
        line = line.slice(line.indexOf("*/") + 2);
      } else {
        continue;
      }
    }
    if (line.includes("/*") && !line.includes("*/")) {
      inBlockComment = true;
      line = line.slice(0, line.indexOf("/*"));
    }

    // Strip line comments. JSX strings can contain "//" but our matcher
    // is conservative — strip only when "//" starts at column 0 or
    // after whitespace.
    const lineCommentIdx = line.search(/(^|\s)\/\//);
    if (lineCommentIdx >= 0) line = line.slice(0, lineCommentIdx);

    // Strip JSX comments {/* ... */} on the same line.
    line = line.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

    if (CREDIT_NUMBER_RE.test(line)) {
      hitCount++;
      perFileHits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
    }
  }
}

assert(
  hitCount === 0,
  hitCount === 0
    ? "no hardcoded credit numbers in user-facing copy"
    : `${hitCount} hardcoded credit-number(s) found:\n  ${perFileHits.join("\n  ")}`
);

assert(scanned > 50, `scanned ${scanned} files (expected > 50 in components+app)`);

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(
  `no-credit-number-hardcodes: ${passed} passed, ${failed} failed (${scanned} files scanned)`
);
process.exit(failed > 0 ? 1 : 0);
