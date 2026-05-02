#!/usr/bin/env node
/**
 * 2026-05-02 Day 1.6 (plan §8a DPDP gap 13) — DPDP endpoint contract guard.
 *
 * Static-parse guard for the data-export and account-delete endpoints
 * + the breach runbook. Verifies:
 *   - GET /api/account/export exists, gates on auth, returns JSON,
 *     pulls every user-attributable table, scopes ai_outputs via files
 *     join (no userId column on ai_outputs).
 *   - POST /api/account/delete exists, gates on auth, requires email
 *     confirmation, deletes via cascade, audit-logs minimal info only.
 *   - docs/runbooks/data-breach.md exists and covers DPDP §8(6) +
 *     GDPR Art. 33-34 + tier classification + hour-by-hour response.
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

const EXPORT_ROUTE = path.join(ROOT, "app", "api", "account", "export", "route.ts");
const DELETE_ROUTE = path.join(ROOT, "app", "api", "account", "delete", "route.ts");
const RUNBOOK = path.join(ROOT, "docs", "runbooks", "data-breach.md");

// ============================================================================
// Section A — Export endpoint
// ============================================================================

assert(fs.existsSync(EXPORT_ROUTE), "A1: /api/account/export route file exists");
const exportSrc = fs.existsSync(EXPORT_ROUTE)
  ? fs.readFileSync(EXPORT_ROUTE, "utf8")
  : "";

assert(/export\s+async\s+function\s+GET/m.test(exportSrc), "A2: GET handler exported");
assert(exportSrc.includes('error: "auth_required"'), "A3: 401 on missing auth");
assert(exportSrc.includes("application/json"), "A4: response is JSON");
assert(/content-disposition.*attachment/i.test(exportSrc), "A5: response uses Content-Disposition: attachment");
assert(exportSrc.includes("schema.users"), "A6: pulls users row");
assert(exportSrc.includes("schema.credits"), "A7: pulls credits row");
assert(exportSrc.includes("schema.creditLedger"), "A8: pulls credit_ledger");
assert(exportSrc.includes("schema.aiUsage"), "A9: pulls ai_usage");
assert(exportSrc.includes("schema.aiOutputs"), "A10: pulls ai_outputs");
assert(exportSrc.includes("schema.payments"), "A11: pulls payments");
assert(exportSrc.includes("schema.files"), "A12: pulls files (metadata only — blobs already deleted)");
assert(
  /innerJoin\(schema\.files/.test(exportSrc),
  "A13: ai_outputs joined via files (ai_outputs has no userId column)"
);
assert(
  exportSrc.includes("Promise.all"),
  "A14: parallel queries (one disk seek per table)"
);
assert(
  exportSrc.includes("schemaVersion"),
  "A15: export payload includes schemaVersion for forward compatibility"
);
assert(
  /password.*[Hh]ash/.test(exportSrc),
  "A16: payload acknowledges password hash exclusion"
);

// ============================================================================
// Section B — Delete endpoint
// ============================================================================

assert(fs.existsSync(DELETE_ROUTE), "B1: /api/account/delete route file exists");
const deleteSrc = fs.existsSync(DELETE_ROUTE)
  ? fs.readFileSync(DELETE_ROUTE, "utf8")
  : "";

assert(/export\s+async\s+function\s+POST/m.test(deleteSrc), "B2: POST handler exported");
assert(deleteSrc.includes('error: "auth_required"'), "B3: 401 on missing auth");
assert(
  deleteSrc.includes("confirmEmail"),
  "B4: requires email confirmation"
);
assert(
  /confirmation_mismatch/.test(deleteSrc),
  "B5: mismatch error code defined"
);
assert(
  /db\.delete\(schema\.users\)/.test(deleteSrc),
  "B6: hard-deletes users row (cascade handles dependents)"
);
assert(
  /event:\s*"account_deletion"/.test(deleteSrc),
  "B7: structured audit log on deletion"
);
assert(
  /emailDomain/.test(deleteSrc),
  "B8: audit log captures domain only (no full email)"
);
// B9: the audit-log object literal must not include a full-email or
// password field. Comments may legitimately mention "password" (e.g.
// passwordResetTokens table name in the cascade-list); we check the
// console.log call site only.
const auditLogCall = deleteSrc.match(/console\.log\(\s*JSON\.stringify\(\{[\s\S]*?\}\)\s*\)/);
assert(
  auditLogCall &&
    !/email:|emailFull|password/i.test(auditLogCall[0]),
  "B9: audit-log payload does NOT include full email or password fields"
);

// ============================================================================
// Section C — Breach runbook
// ============================================================================

assert(fs.existsSync(RUNBOOK), "C1: docs/runbooks/data-breach.md exists");
const runbook = fs.existsSync(RUNBOOK) ? fs.readFileSync(RUNBOOK, "utf8") : "";

assert(/DPDP Act 2023/i.test(runbook), "C2: covers DPDP Act 2023");
assert(/GDPR/.test(runbook), "C3: covers GDPR");
assert(/72\s*hour/.test(runbook), "C4: documents 72-hour notification window");
assert(/Tier\s*1/.test(runbook), "C5: defines tier classification");
assert(/Hour-by-hour/i.test(runbook), "C6: hour-by-hour response sequence");
assert(/cross-border/i.test(runbook), "C7: covers cross-border data transfer (DPDP §16)");
assert(
  /Hostinger.*EU/.test(runbook),
  "C8: documents data-residency location (Hostinger EU)"
);
assert(
  /next review/i.test(runbook),
  "C9: includes review cadence"
);

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(`dpdp-endpoints: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
