#!/usr/bin/env node
/**
 * 2026-05-04 — Contact form persistence guard.
 *
 * PENDING_WORK_ANALYSIS.md §4c flagged that the /api/contact route
 * logged to stdout only, putting /enterprise sales-qualified leads
 * at the mercy of Hostinger log rotation. Migration 0021 added the
 * `contact_submissions` table; the route now persists every
 * submission AND continues to log to stdout (defense-in-depth).
 *
 * This guard locks in the 4-layer chain:
 *   A. Migration 0021 SQL has the right shape (additive-only,
 *      11 columns, 3 secondary indexes, no FK)
 *   B. Drizzle schema matches the migration column-for-column
 *   C. Route imports + persists + falls back gracefully on DB error
 *   D. Admin viewer page exists, gates on requireAdmin, queries the
 *      table, and is wired into the admin layout nav
 *
 * Why static-parse rather than integration:
 *   The aggregator runs ~3-13s end-to-end across 80+ suites and
 *   shouldn't depend on a live MySQL. The integration is verified
 *   manually (POST /api/contact with curl, then check
 *   /admin/contact-submissions). This guard catches regressions in
 *   the static surface — anyone deleting the persist call,
 *   schema entry, or admin page fails CI.
 *
 * Output line conforms to aggregator regex `${name}: ${pass} passed,
 * ${fail} failed`.
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

const MIGRATION_PATH = path.join(
  ROOT,
  "db",
  "migrations",
  "0021_contact_submissions.sql",
);
const SCHEMA_PATH = path.join(ROOT, "db", "schema", "app.ts");
const ROUTE_PATH = path.join(ROOT, "app", "api", "contact", "route.ts");
const ADMIN_PAGE_PATH = path.join(
  ROOT,
  "app",
  "admin",
  "contact-submissions",
  "page.tsx",
);
const ADMIN_LAYOUT_PATH = path.join(ROOT, "app", "admin", "layout.tsx");

// ============================================================================
// Section A — Migration 0021 contract
// ============================================================================

assert(
  fs.existsSync(MIGRATION_PATH),
  "A0: migration 0021_contact_submissions.sql exists",
);
const migSrc = fs.existsSync(MIGRATION_PATH)
  ? fs.readFileSync(MIGRATION_PATH, "utf8")
  : "";

// Strip block comments so we only inspect executable SQL.
const execSql = migSrc.replace(/^--.*$/gm, "");

assert(
  /CREATE TABLE\s+`contact_submissions`/.test(execSql),
  "A1: migration creates contact_submissions table",
);

// 11 columns expected (id, name, email, topic, message, ip,
// user_agent, referer, status, created_at, read_at).
const expectedCols = [
  "id",
  "name",
  "email",
  "topic",
  "message",
  "ip",
  "user_agent",
  "referer",
  "status",
  "created_at",
  "read_at",
];
for (const col of expectedCols) {
  assert(
    new RegExp(`\`${col}\``).test(execSql),
    `A2.${col}: column \`${col}\` declared in migration`,
  );
}

// 3 secondary indexes + PK = 4 total. Migration defines PK inline
// (CONSTRAINT ... PRIMARY KEY) and 3 CREATE INDEX statements.
const idxCount = (execSql.match(/CREATE INDEX/g) ?? []).length;
assert(
  idxCount === 3,
  `A3: exactly 3 secondary indexes defined (got ${idxCount}; created/status-created/email)`,
);

// No FK — anonymous visitors can submit without an account.
assert(
  !/REFERENCES/.test(execSql),
  "A4: no foreign key constraint (anonymous submissions allowed)",
);

// Additive-only: no DROP / MODIFY / CHANGE.
assert(
  !/\b(DROP|MODIFY|CHANGE)\b/.test(execSql),
  "A5: migration is additive-only (no DROP/MODIFY/CHANGE in executable SQL)",
);

// ============================================================================
// Section B — Drizzle schema parity
// ============================================================================

const schemaSrc = fs.readFileSync(SCHEMA_PATH, "utf8");

assert(
  /export\s+const\s+contactSubmissions\s*=\s*mysqlTable\(\s*"contact_submissions"/.test(
    schemaSrc,
  ),
  "B1: contactSubmissions Drizzle table exported with table name 'contact_submissions'",
);

// Each migration column must have a matching schema field. Use the
// snake_case → camelCase mapping that Drizzle uses.
const colToField = {
  id: 'id: varchar\\("id"',
  name: 'name: varchar\\("name"',
  email: 'email: varchar\\("email"',
  topic: 'topic: varchar\\("topic"',
  message: 'message: text\\("message"',
  ip: 'ip: varchar\\("ip"',
  user_agent: 'userAgent: varchar\\("user_agent"',
  referer: 'referer: varchar\\("referer"',
  status: 'status: varchar\\("status"',
  created_at: 'createdAt: timestamp\\("created_at"',
  read_at: 'readAt: timestamp\\("read_at"',
};
for (const [col, regex] of Object.entries(colToField)) {
  assert(
    new RegExp(regex).test(schemaSrc),
    `B2.${col}: schema declares matching field for column ${col}`,
  );
}

// Three indexes mirrored.
for (const idxName of [
  "contact_submissions_created_idx",
  "contact_submissions_status_created_idx",
  "contact_submissions_email_idx",
]) {
  assert(
    schemaSrc.includes(idxName),
    `B3.${idxName}: schema declares matching index ${idxName}`,
  );
}

// ============================================================================
// Section C — Contact route persists
// ============================================================================

const routeSrc = fs.readFileSync(ROUTE_PATH, "utf8");

assert(
  /from\s+"@\/db\/client"/.test(routeSrc),
  "C1: route imports db client from @/db/client",
);
assert(
  /db\.insert\(\s*schema\.contactSubmissions\s*\)/.test(routeSrc),
  "C2: route calls db.insert(schema.contactSubmissions) (the persist call)",
);
assert(
  /randomUUID/.test(routeSrc),
  "C3: route mints a UUID for the row id (matches schema.id varchar(36))",
);
// Persist must be inside try/catch so a transient DB error never
// breaks the form. Removing the try would surface 500s to legitimate
// users on a transient outage.
assert(
  /try\s*\{[\s\S]{0,400}db\.insert\(\s*schema\.contactSubmissions/.test(
    routeSrc,
  ),
  "C4: persist is wrapped in try/catch (transient DB error never bricks the form)",
);
// Stdout fallback log must still fire — defense-in-depth so the data
// survives even if the DB write silently lost the row.
assert(
  /console\.log\(\s*"\[contact\]"/.test(routeSrc),
  "C5: stdout fallback log preserved (defense-in-depth for DB write)",
);
// User-Agent + Referer captured for triage.
assert(
  /req\.headers\.get\("user-agent"\)/.test(routeSrc),
  "C6: route captures User-Agent for triage",
);
assert(
  /req\.headers\.get\("referer"\)/.test(routeSrc),
  "C7: route captures Referer for /enterprise vs /contact attribution",
);

// ============================================================================
// Section D — Admin viewer page
// ============================================================================

assert(
  fs.existsSync(ADMIN_PAGE_PATH),
  "D0: app/admin/contact-submissions/page.tsx exists",
);
const adminSrc = fs.existsSync(ADMIN_PAGE_PATH)
  ? fs.readFileSync(ADMIN_PAGE_PATH, "utf8")
  : "";

assert(
  /requireAdmin/.test(adminSrc),
  "D1: admin page gates on requireAdmin (404 for non-admins)",
);
assert(
  /schema\.contactSubmissions/.test(adminSrc),
  "D2: admin page queries schema.contactSubmissions (the new table)",
);
assert(
  /\.limit\(\s*100\s*\)/.test(adminSrc),
  "D3: admin page LIMITs to 100 rows (paginate when this becomes a problem)",
);
assert(
  /export const dynamic = "force-dynamic"/.test(adminSrc),
  "D4: admin page is force-dynamic (always fresh data)",
);
assert(
  /export const runtime = "nodejs"/.test(adminSrc),
  "D5: admin page runs on nodejs runtime (db client requirement)",
);

// ============================================================================
// Section E — Admin layout nav wiring
// ============================================================================

const layoutSrc = fs.readFileSync(ADMIN_LAYOUT_PATH, "utf8");

assert(
  /\/admin\/contact-submissions/.test(layoutSrc),
  "E1: admin layout NAV array includes /admin/contact-submissions href",
);
// Sits in the People section per the inline comment rationale.
const navEntry = layoutSrc.match(
  /section:\s*"People"[\s\S]{0,400}\/admin\/contact-submissions/,
);
assert(
  navEntry !== null,
  "E2: /admin/contact-submissions nav entry is in the 'People' section (matches rationale: 'who's reaching out')",
);

// ============================================================================
// Output
// ============================================================================

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(`contact-persistence: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
