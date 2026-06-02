#!/usr/bin/env node
/**
 * 2026-05-03 Day 5.5 layer 7 (plan §8) — Turnstile captcha contract.
 *
 * Static-parse guard for:
 *   1. lib/auth/turnstile.ts — verifyTurnstileToken() server helper
 *   2. lib/auth-actions.ts — verify call BEFORE DB write
 *   3. components/auth/RegisterForm.tsx — widget + script tag
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

const HELPER = path.join(ROOT, "lib", "auth", "turnstile.ts");
const helperSrc = fs.readFileSync(HELPER, "utf8");

const ACTIONS = path.join(ROOT, "lib", "auth-actions.ts");
const actionsSrc = fs.readFileSync(ACTIONS, "utf8");

const FORM = path.join(ROOT, "components", "auth", "RegisterForm.tsx");
const formSrc = fs.readFileSync(FORM, "utf8");

// ============================================================================
// Section A — Helper surface
// ============================================================================

assert(
  /export\s+async\s+function\s+verifyTurnstileToken/m.test(helperSrc),
  "A1: verifyTurnstileToken exported"
);
assert(
  helperSrc.includes("https://challenges.cloudflare.com/turnstile/v0/siteverify"),
  "A2: uses official Cloudflare verify URL"
);
assert(
  helperSrc.includes('import "server-only"'),
  "A3: server-only guard"
);
assert(
  /TURNSTILE_SECRET_KEY/.test(helperSrc),
  "A4: env var name TURNSTILE_SECRET_KEY"
);
assert(
  /NODE_ENV\s*===\s*"production"/.test(helperSrc) &&
    /turnstile_not_configured/.test(helperSrc) &&
    /return\s*\{\s*ok:\s*true/.test(helperSrc),
  "A5: secret unset -> fail-CLOSED in production, fail-open only in dev"
);

// ============================================================================
// Section B — Token submission contract
// ============================================================================

assert(
  /\.append\("secret",\s*secret\)/.test(helperSrc),
  "B1: posts secret as form field"
);
assert(
  /\.append\("response",\s*token\)/.test(helperSrc),
  "B2: posts token as 'response' field (matches CF API)"
);
assert(
  /\.append\("remoteip",/.test(helperSrc),
  "B3: optional remoteip field for fraud detection"
);
assert(
  /AbortSignal\.timeout\(5000\)/.test(helperSrc),
  "B4: 5-second request timeout"
);

// ============================================================================
// Section C — Failure handling
// ============================================================================

assert(
  /errorCodes\?:\s*string\[\]/.test(helperSrc),
  "C1: TurnstileVerdict surfaces errorCodes for ops audit"
);
assert(
  /errorCodes:\s*\["missing-input-response"\]/.test(helperSrc),
  "C2: returns missing-input-response when token absent"
);
assert(
  /errorCodes:\s*\["network-error"\]/.test(helperSrc),
  "C3: network failure → fail-OPEN with network-error code"
);

// ============================================================================
// Section D — registerAction wire-in
// ============================================================================

assert(
  actionsSrc.includes("verifyTurnstileToken"),
  "D1: registerAction imports verifyTurnstileToken"
);
assert(
  /formData\.get\("cf-turnstile-response"\)/.test(actionsSrc),
  "D2: extracts token from cf-turnstile-response form field"
);
assert(
  /turnstileVerdict\.ok/.test(actionsSrc),
  "D3: branches on verdict.ok"
);
assert(
  /event:\s*"turnstile_verify_failed"/.test(actionsSrc),
  "D4: structured stdout log on failure for ops review"
);
assert(
  /Captcha verification failed/.test(actionsSrc),
  "D5: user-facing error message"
);

// Ordering: turnstile verify must run BEFORE the DB insert.
const turnstileIdx = actionsSrc.indexOf("verifyTurnstileToken");
const dbInsertIdx = actionsSrc.indexOf("db.insert(schema.users)");
assert(
  turnstileIdx > 0 && dbInsertIdx > 0 && turnstileIdx < dbInsertIdx,
  "D6: turnstile verify fires BEFORE users insert"
);

// ============================================================================
// Section E — Client widget
// ============================================================================

assert(
  /import\s+Script\s+from\s+"next\/script"/.test(formSrc),
  "E1: imports Next Script component"
);
assert(
  /NEXT_PUBLIC_TURNSTILE_SITE_KEY/.test(formSrc),
  "E2: reads site key from NEXT_PUBLIC_ env var (build-time inlined)"
);
assert(
  /className="cf-turnstile"/.test(formSrc),
  "E3: renders Cloudflare's standard widget class"
);
assert(
  /data-sitekey=\{TURNSTILE_SITE_KEY\}/.test(formSrc),
  "E4: passes site key via data-sitekey attribute"
);
assert(
  formSrc.includes("https://challenges.cloudflare.com/turnstile/v0/api.js"),
  "E5: loads Turnstile script from official CDN"
);
assert(
  /strategy="afterInteractive"/.test(formSrc),
  "E6: script loads afterInteractive (doesn't block initial render)"
);
assert(
  /\{TURNSTILE_SITE_KEY\s*&&\s*\(/.test(formSrc),
  "E7: widget conditionally rendered (skipped when env var unset)"
);

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(`turnstile: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
