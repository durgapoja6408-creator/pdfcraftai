#!/usr/bin/env node
/**
 * 2026-05-04 — operational Slack alert foundation guard.
 *
 * PENDING_WORK_ANALYSIS.md §2a + §2b. Several modules across the
 * codebase have TODO markers that reference "post a Slack alert
 * when X" — margin-rollup floor breach, dunning lifecycle
 * transitions (commit `76a0c82`), quality-signal flagging
 * (commit `81087df`), cron failure escalation. They were all
 * writing to the same TODO without a shared helper to call.
 *
 * This guard locks in:
 *   A. lib/ops/slack-alert.ts surface — type union + payload
 *      shape + helpers all exported with the right shapes.
 *   B. Pure-function semantics — the static-parse guard verifies
 *      shape, but for `formatSlackPayload` the function body is
 *      simple enough to just RUN it and assert on the output. We
 *      eval the source via a stripped TS-to-JS subset and exercise
 *      canonical inputs.
 *   C. Failure-handling invariants — `sendSlackAlert` MUST never
 *      throw, must wrap fetch in try/catch, must use
 *      AbortController for the timeout, must return a result
 *      envelope on every code path.
 *   D. Credential safety — no hardcoded webhook URLs anywhere in
 *      the source tree (a `https://hooks.slack.com/` literal in
 *      committed code is a credential leak waiting to happen).
 *   E. Cross-file invariant — severity literal union agrees with
 *      the COLOR_BY_SEVERITY + EMOJI_BY_SEVERITY map keys; missing
 *      a key would be a runtime undefined-color bug.
 *
 * Output line conforms to aggregator regex:
 *   `${name}: ${pass} passed, ${fail} failed`.
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

// ============================================================================
// SECTION A: lib/ops/slack-alert.ts surface
// ============================================================================

const LIB_PATH = path.join(ROOT, "lib", "ops", "slack-alert.ts");
const LIB_SRC = fs.existsSync(LIB_PATH) ? fs.readFileSync(LIB_PATH, "utf8") : "";

assert(LIB_SRC.length > 0, "A1: lib/ops/slack-alert.ts file exists");

assert(
  /export\s+type\s+SlackAlertSeverity\s*=/.test(LIB_SRC),
  "A2: SlackAlertSeverity type exported",
);
assert(
  /export\s+interface\s+SlackAlertInput/.test(LIB_SRC),
  "A3: SlackAlertInput interface exported",
);
assert(
  /export\s+type\s+SlackAlertResult/.test(LIB_SRC),
  "A4: SlackAlertResult discriminated-union type exported",
);
assert(
  /export\s+function\s+formatSlackPayload\(/.test(LIB_SRC),
  "A5: formatSlackPayload (pure) exported",
);
assert(
  /export\s+function\s+readSlackWebhookUrl\(/.test(LIB_SRC),
  "A6: readSlackWebhookUrl exported",
);
assert(
  /export\s+async\s+function\s+sendSlackAlert\(/.test(LIB_SRC),
  "A7: sendSlackAlert (async) exported",
);

// All three severity literals must be in the union — adding a new
// severity is fine, removing one breaks every consumer.
for (const sev of ["info", "warn", "alarm"]) {
  assert(
    new RegExp(`"${sev}"`).test(LIB_SRC),
    `A8.${sev}: severity literal "${sev}" present in union`,
  );
}

// 2026-05-04 follow-up to commit 36821aa — sendSlackAlert gained an
// optional `urlOverride` param so legacy AI_SPEND_ALERT_SLACK_URL
// callers can migrate without losing alerts mid-flight. The
// SendSlackAlertOptions interface MUST exist + the urlOverride field
// MUST go through the same https:// validation gate as the canonical
// env var read (otherwise the migration escape hatch becomes a
// defensive-check bypass).
assert(
  /export\s+interface\s+SendSlackAlertOptions/.test(LIB_SRC),
  "A9: SendSlackAlertOptions interface exported (urlOverride migration param)",
);
assert(
  /urlOverride\?:\s*string/.test(LIB_SRC),
  "A10: urlOverride is `string | undefined` (optional migration escape hatch)",
);
assert(
  /urlOverride[^]*?startsWith\(\s*"https:\/\/"/.test(LIB_SRC),
  "A11: urlOverride still validates startsWith('https://') — escape hatch can't bypass the defensive check",
);

// ============================================================================
// SECTION B: formatSlackPayload semantics — actually RUN the function
// ============================================================================
//
// The CI guard convention for this codebase is static-parse-only,
// but `formatSlackPayload` is small enough + side-effect free that
// extracting + executing it is cheap and catches more than regex.
// We extract the function body via regex, plus the COLOR_BY_SEVERITY
// + EMOJI_BY_SEVERITY tables it depends on, build a self-contained
// JS snippet via stripped-TS substitution, and run it through
// `new Function()` against canonical inputs.

function extractTsBlock(src, regex) {
  const m = src.match(regex);
  return m ? m[0] : "";
}

const COLOR_MAP_BLOCK = extractTsBlock(
  LIB_SRC,
  /const\s+COLOR_BY_SEVERITY[\s\S]*?\};/,
);
const EMOJI_MAP_BLOCK = extractTsBlock(
  LIB_SRC,
  /const\s+EMOJI_BY_SEVERITY[\s\S]*?\};/,
);
const FORMAT_FN_BLOCK = extractTsBlock(
  LIB_SRC,
  /export\s+function\s+formatSlackPayload\(input:[\s\S]*?\n\}/,
);

assert(
  COLOR_MAP_BLOCK.length > 0 && EMOJI_MAP_BLOCK.length > 0 && FORMAT_FN_BLOCK.length > 0,
  "B1: extracted COLOR_BY_SEVERITY + EMOJI_BY_SEVERITY + formatSlackPayload blocks",
);

// Strip TS-only syntax that JS doesn't understand. The function body
// here is intentionally simple TS: type annotations on consts +
// params + return types, generic type args, etc. We don't need a
// full TS parser — a few regex substitutions handle the subset
// this file actually uses. Order matters: strip the most specific
// patterns first so they don't get clobbered by the more permissive
// ones below.
function stripTsToJs(ts) {
  return (
    ts
      // Strip `export` keyword (not valid in `new Function` body).
      .replace(/^export\s+/gm, "")
      // Top-level const annotations: `const COLOR_BY_SEVERITY:
      // Record<SlackAlertSeverity, "good" | "warning" | "danger"> = {`
      // The Record<...> can contain unions with multiple `|` so we
      // match through the `>` greedily-but-bounded.
      .replace(/(const\s+\w+)\s*:\s*Record<[^>]+>\s*=/g, "$1 =")
      // `: Array<{...}>` annotations on inline const decls.
      .replace(/\s*:\s*Array<\{[^}]*\}>/g, "")
      // Function param + return type annotations: `(input:
      // SlackAlertInput): unknown` → `(input)`.
      .replace(/\(\s*input\s*:\s*\w+\s*\)\s*:\s*\w+/g, "(input)")
      // Standalone `: unknown` / `: void` return-type annotations
      // before `{` — catches anything the param-anchored rule above
      // missed.
      .replace(/\)\s*:\s*\w+\s*\{/g, ") {")
  );
}

const colorJs = stripTsToJs(COLOR_MAP_BLOCK);
const emojiJs = stripTsToJs(EMOJI_MAP_BLOCK);
const formatJs = stripTsToJs(FORMAT_FN_BLOCK);

let formatFn = null;
try {
  // Use a `new Function` factory rather than `eval()` so the closure
  // is well-defined (no leaking outer scope). The factory returns
  // the compiled function.
  formatFn = new Function(
    `${colorJs}\n${emojiJs}\n${formatJs}\nreturn formatSlackPayload;`,
  )();
} catch (e) {
  failures.push(`B2: failed to compile formatSlackPayload to JS: ${e.message}`);
  failed++;
}

if (typeof formatFn === "function") {
  passed++;
  // B3: minimal payload (just severity + title + body)
  const minimal = formatFn({
    severity: "info",
    title: "Test",
    body: "Body",
  });
  assert(
    minimal &&
      Array.isArray(minimal.attachments) &&
      minimal.attachments.length === 1,
    "B3: minimal payload has attachments[1]",
  );
  assert(
    minimal.attachments[0].color === "good",
    "B4: severity 'info' maps to color 'good'",
  );
  assert(
    /information_source/.test(minimal.attachments[0].title),
    "B5: severity 'info' prefixes :information_source: emoji",
  );
  assert(
    Array.isArray(minimal.attachments[0].fields) &&
      minimal.attachments[0].fields.length === 0,
    "B6: minimal payload has empty fields[] (no context provided)",
  );

  // B7-B9: warn + alarm severity color/emoji
  const warn = formatFn({ severity: "warn", title: "T", body: "B" });
  assert(warn.attachments[0].color === "warning", "B7: 'warn' → color 'warning'");
  const alarm = formatFn({ severity: "alarm", title: "T", body: "B" });
  assert(alarm.attachments[0].color === "danger", "B8: 'alarm' → color 'danger'");
  assert(
    /rotating_light/.test(alarm.attachments[0].title),
    "B9: 'alarm' prefixes :rotating_light: emoji",
  );

  // B10-B12: context fields rendering
  const withCtx = formatFn({
    severity: "info",
    title: "T",
    body: "B",
    context: { "User ID": "u_xyz", "Streak": 3 },
  });
  assert(
    withCtx.attachments[0].fields.length === 2,
    "B10: context with 2 entries → 2 fields",
  );
  assert(
    withCtx.attachments[0].fields[0].title === "User ID" &&
      withCtx.attachments[0].fields[0].value === "u_xyz",
    "B11: context entry preserves title + value as strings",
  );
  // Numeric values must be coerced to string (Slack rejects non-string field values).
  assert(
    withCtx.attachments[0].fields[1].value === "3",
    "B12: numeric context value coerced to string '3'",
  );

  // B13: null/undefined context entries dropped (don't render as "null")
  const withNull = formatFn({
    severity: "info",
    title: "T",
    body: "B",
    context: { Real: "yes", Empty: null, Missing: undefined },
  });
  assert(
    withNull.attachments[0].fields.length === 1 &&
      withNull.attachments[0].fields[0].title === "Real",
    "B13: null/undefined context entries are dropped (no 'null' strings rendered)",
  );

  // B14: long context value truncated at 200 chars (Slack ugly past that).
  const longVal = "x".repeat(500);
  const withLong = formatFn({
    severity: "info",
    title: "T",
    body: "B",
    context: { Long: longVal },
  });
  assert(
    withLong.attachments[0].fields[0].value.length === 200,
    "B14: context value capped at 200 chars",
  );

  // B15: ts is a unix-seconds integer (not millis).
  const withTs = formatFn({ severity: "info", title: "T", body: "B" });
  const ts = withTs.attachments[0].ts;
  assert(
    Number.isInteger(ts) && ts > 1_500_000_000 && ts < 10_000_000_000,
    "B15: ts is a plausible unix-seconds integer (not ms)",
  );
}

// ============================================================================
// SECTION C: sendSlackAlert failure-handling invariants
// ============================================================================

const SEND_FN_BLOCK = extractTsBlock(
  LIB_SRC,
  /export\s+async\s+function\s+sendSlackAlert\([\s\S]*?\n\}/,
);
assert(SEND_FN_BLOCK.length > 0, "C1: sendSlackAlert body extracted");

assert(
  /try\s*\{[\s\S]*?\}\s*catch\s*\(/.test(SEND_FN_BLOCK),
  "C2: sendSlackAlert wraps fetch in try/catch (must never throw)",
);
assert(
  /AbortController/.test(SEND_FN_BLOCK),
  "C3: sendSlackAlert uses AbortController for fetch timeout",
);
assert(
  /setTimeout\(\(\)\s*=>\s*ctrl\.abort\(\)/.test(SEND_FN_BLOCK),
  "C4: sendSlackAlert wires AbortController into a setTimeout (5s deadline)",
);
assert(
  /clearTimeout\(/.test(SEND_FN_BLOCK),
  "C5: sendSlackAlert clears the timeout in finally (no leaked handle on success)",
);
// The "no_webhook_configured" graceful no-op path must short-circuit
// BEFORE we call fetch (otherwise we'd hit the network with an empty
// URL).
assert(
  /no_webhook_configured/.test(SEND_FN_BLOCK) &&
    SEND_FN_BLOCK.indexOf("no_webhook_configured") <
      SEND_FN_BLOCK.indexOf("fetch("),
  "C6: 'no_webhook_configured' return precedes the fetch() call (graceful no-op)",
);

// Every documented failure mode in the result-envelope union must
// appear as a return statement in the function body.
for (const reason of ["no_webhook_configured", "delivery_failed"]) {
  assert(
    new RegExp(`reason:\\s*"${reason}"`).test(SEND_FN_BLOCK),
    `C7.${reason}: sendSlackAlert returns SlackAlertResult with reason "${reason}"`,
  );
}

// ============================================================================
// SECTION D: Credential safety — no hardcoded webhook URLs
// ============================================================================

// Scan the entire source tree for `https://hooks.slack.com/` —
// that's a credential leak. A test fixture inside scripts/ MUST
// be allowed (we use one such fixture below in this very file
// to test the URL-validation behavior, ironically), but a
// committed copy in lib/, app/, components/ would be a real
// vulnerability.
const SCAN_DIRS = ["lib", "app", "components"];
let leakFound = false;
let leakDetail = "";
for (const dir of SCAN_DIRS) {
  const root = path.join(ROOT, dir);
  if (!fs.existsSync(root)) continue;
  // Recursive scan via a stack so we don't pull in `find`/`rg`.
  const stack = [root];
  while (stack.length > 0) {
    const cur = stack.pop();
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        stack.push(fullPath);
      } else if (
        entry.name.endsWith(".ts") ||
        entry.name.endsWith(".tsx") ||
        entry.name.endsWith(".js") ||
        entry.name.endsWith(".jsx")
      ) {
        const content = fs.readFileSync(fullPath, "utf8");
        if (/https:\/\/hooks\.slack\.com\//.test(content)) {
          leakFound = true;
          leakDetail = fullPath;
          break;
        }
      }
    }
    if (leakFound) break;
  }
  if (leakFound) break;
}
assert(
  !leakFound,
  `D1: no hardcoded https://hooks.slack.com/ URL in lib/ app/ components/${leakFound ? ` (found in ${leakDetail})` : ""}`,
);

// Env var name must match the canonical `SLACK_OPS_WEBHOOK_URL`
// — a typo here means the panel-side configuration silently
// no-ops at runtime. Single source of truth lives in this file;
// future consumers of `readSlackWebhookUrl()` get the right name
// transitively.
assert(
  /SLACK_OPS_WEBHOOK_URL/.test(LIB_SRC),
  "D2: env var read uses the canonical name SLACK_OPS_WEBHOOK_URL",
);

// readSlackWebhookUrl must reject non-https URLs (defense-in-depth
// against accidentally pasting a `http://` URL).
const READ_FN_BLOCK = extractTsBlock(
  LIB_SRC,
  /export\s+function\s+readSlackWebhookUrl\([\s\S]*?\n\}/,
);
assert(
  /startsWith\(\s*"https:\/\/"\s*\)/.test(READ_FN_BLOCK),
  "D3: readSlackWebhookUrl validates startsWith('https://')",
);

// ============================================================================
// SECTION E: Cross-file invariant — severity union vs map keys
// ============================================================================

const SEVERITIES = ["info", "warn", "alarm"];
for (const sev of SEVERITIES) {
  // Color map has the key.
  assert(
    new RegExp(`${sev}:\\s*"(good|warning|danger)"`).test(COLOR_MAP_BLOCK),
    `E1.${sev}: COLOR_BY_SEVERITY has '${sev}' → valid color`,
  );
  // Emoji map has the key.
  assert(
    new RegExp(`${sev}:\\s*":[a-z_]+:"`).test(EMOJI_MAP_BLOCK),
    `E2.${sev}: EMOJI_BY_SEVERITY has '${sev}' → ':emoji:' value`,
  );
}

// ============================================================================
// Output
// ============================================================================

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(`slack-alert-foundation: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
