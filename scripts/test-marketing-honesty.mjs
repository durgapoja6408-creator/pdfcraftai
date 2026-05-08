#!/usr/bin/env node
/**
 * 2026-05-08 — Marketing-surface honesty regression guard.
 *
 * Background: items #4 and #22 from the improvement analysis closed
 * the original "files deleted in 60 minutes" / "100% local
 * processing" lies in the tool-runner + landing-page surface.
 * Items #20 (footer) and #21 (status page) were follow-up surfaces
 * that quietly carried the same lies:
 *   - Footer: "Files deleted after 1h · End-to-end encrypted"
 *   - Status: "Updated every 60 seconds from our monitoring"
 *     (page is fully static — nothing updated)
 *
 * This guard pins the honesty fix on both surfaces:
 *   - Footer must say "Zero retention · TLS 1.3 in transit"
 *   - Status page must NOT claim "every 60 seconds" updates
 *   - Status page must actually probe DB + AI registry (not just
 *     hard-code "operational")
 *   - Status page must include the recent real incidents
 *     documented in CLAUDE.md §5
 *
 * Negative checks for the regressed copy: if a future contributor
 * "tightens" the marketing language by re-introducing "1h
 * retention" or "real-time monitoring" claims, this guard fails.
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

const FOOTER_PATH = path.join(ROOT, "components/nav/Footer.tsx");
const STATUS_PATH = path.join(ROOT, "app/status/page.tsx");

assert(fs.existsSync(FOOTER_PATH), `Footer missing at ${FOOTER_PATH}`);
assert(fs.existsSync(STATUS_PATH), `Status page missing at ${STATUS_PATH}`);

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
  console.log(`marketing-honesty: ${passed} passed, ${failed} failed`);
  process.exit(1);
}

const FOOTER_SRC = fs.readFileSync(FOOTER_PATH, "utf8");
const STATUS_SRC = fs.readFileSync(STATUS_PATH, "utf8");

// ---------------------------------------------------------------------
// Section A — footer copy honesty.
// ---------------------------------------------------------------------

assert(
  /Zero retention\s*·\s*TLS 1\.3 in transit/.test(FOOTER_SRC),
  "Footer must include the canonical 'Zero retention · TLS 1.3 in transit' " +
    "byline. The previous 'Files deleted after 1h' copy was a regression " +
    "of the zero-retention work shipped under items #4 + #22.",
);

assert(
  !/Files deleted after 1h/i.test(FOOTER_SRC),
  "Found 'Files deleted after 1h' in the footer. We don't store files " +
    "for an hour; we don't persist them at all (in-memory for AI ops, " +
    "browser-side for free tools). Replace with 'Zero retention · TLS " +
    "1.3 in transit'.",
);

assert(
  !/End-to-end encrypted/i.test(FOOTER_SRC),
  "Found 'End-to-end encrypted' in the footer. E2E encryption has a " +
    "specific cryptographic meaning (only the endpoints can read the " +
    "plaintext) that doesn't apply here — we DO read the plaintext " +
    "server-side for AI ops. 'TLS 1.3 in transit' is the accurate " +
    "claim.",
);

// ---------------------------------------------------------------------
// Section B — footer Legal column has /cookies.
// ---------------------------------------------------------------------
//
// /cookies exists per Task #24 (commit 30f96f7). Without a footer
// link the page is reachable only from the cookie banner itself —
// not great for users who want to review the policy after dismissing
// the banner.

assert(
  /\["Cookies",\s*"\/cookies"\]/.test(FOOTER_SRC),
  "Footer Legal column must include `[\"Cookies\", \"/cookies\"]`. " +
    "The /cookies page (DPDP/GDPR per-cookie inventory) is otherwise " +
    "reachable only from the consent banner itself — users who " +
    "dismissed the banner can't get back to the policy without " +
    "guessing the URL.",
);

// ---------------------------------------------------------------------
// Section C — status page copy honesty.
// ---------------------------------------------------------------------

assert(
  !/Updated every 60 seconds/i.test(STATUS_SRC),
  "Found 'Updated every 60 seconds' in the status page. The page is " +
    "now a server component that probes DB + AI live on each request, " +
    "but it's NOT a 60-second-poll dashboard. The accurate copy " +
    "describes which signals are live and which are manually flagged.",
);

assert(
  !/from our monitoring/i.test(STATUS_SRC),
  "Found 'from our monitoring' in the status page. Implies an " +
    "automated monitoring pipeline that doesn't exist. Reword to " +
    "describe what's actually probed live (DB liveness, AI provider " +
    "configuration).",
);

assert(
  /probed live/i.test(STATUS_SRC) || /probed on each page load/i.test(STATUS_SRC) ||
    /probed live on each page load/i.test(STATUS_SRC),
  "Status page must mention that signals are 'probed live' to be " +
    "honest about what the page does. Vague 'check status' or 'see " +
    "the dashboard' copy hides the actual mechanism.",
);

// ---------------------------------------------------------------------
// Section D — status page actually probes DB + AI.
// ---------------------------------------------------------------------

assert(
  /import\s*\{\s*sql\s*\}\s*from\s*"drizzle-orm"/.test(STATUS_SRC),
  "Status page must import `sql` from drizzle-orm so it can run the " +
    "SELECT 1 liveness ping. Without this the page can't actually " +
    "report DB state — falls back to hard-coded 'operational'.",
);

assert(
  /listConfiguredProviderIds/.test(STATUS_SRC),
  "Status page must import `listConfiguredProviderIds` from " +
    "@/lib/ai/registry so it can actually report AI provider state. " +
    "Hard-coded 'operational' for AI tools would be wrong if the " +
    "ANTHROPIC_API_KEY env var got rotated and we forgot to update " +
    "the constant.",
);

assert(
  /async\s+function\s+probeServiceHealth\s*\(/.test(STATUS_SRC),
  "probeServiceHealth() helper must be defined and async — wraps the " +
    "DB ping + AI registry call in try/catch so a transient blip " +
    "doesn't take the public-facing status page itself down.",
);

assert(
  /export\s+const\s+dynamic\s*=\s*"force-dynamic"/.test(STATUS_SRC),
  "Status page must export `dynamic = 'force-dynamic'` so each " +
    "request runs the probe fresh. Without this the page caches at " +
    "build time and reports stale state forever.",
);

assert(
  /export\s+default\s+async\s+function\s+StatusPage/.test(STATUS_SRC),
  "StatusPage component must be async (server component) since it " +
    "awaits the probe. A non-async component can't call probeServiceHealth.",
);

// ---------------------------------------------------------------------
// Section E — services array reflects probe results, not constants.
// ---------------------------------------------------------------------

assert(
  /health:\s*probe\.dbOk\s*\?\s*"operational"\s*:\s*"down"/.test(STATUS_SRC),
  "Sign-in & accounts service health must derive from probe.dbOk. " +
    "Hard-coded 'operational' would lie when the DB is actually down — " +
    "exactly the case where the status page needs to be most honest.",
);

assert(
  /health:\s*probe\.aiConfigured\s*\?\s*"operational"\s*:\s*"down"/.test(STATUS_SRC),
  "AI tools service health must derive from probe.aiConfigured. " +
    "Otherwise an env-var rotation that drops all providers would " +
    "silently leave the page green.",
);

// ---------------------------------------------------------------------
// Section F — recent incidents include 2026-05-08 zombie cleanup.
// ---------------------------------------------------------------------
//
// The page previously stopped at 2026-04-19. Real incidents since
// then (documented in CLAUDE.md §5 + docs/STATUS.md): 2026-04-22
// Razorpay drift, 2026-04-28 stale-worker, 2026-05-08 zombie
// cleanup. At minimum the most recent one should be there.

assert(
  /date:\s*"2026-05-08"/.test(STATUS_SRC),
  "INCIDENTS array must include the 2026-05-08 zombie-cleanup " +
    "incident documented in CLAUDE.md §5. Status pages that don't " +
    "include recent incidents are misleading — users assume the " +
    "blank period was incident-free.",
);

// ---------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
}

console.log(`marketing-honesty: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
