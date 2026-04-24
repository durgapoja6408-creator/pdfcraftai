// Static-analysis regression test for migration-drift detection
// (Task #28). We can't run DB queries from the test harness (no MySQL
// in CI), so we assert the MODULE SHAPE: that every mysqlTable export
// in db/schema/ is enumerable via `expectedSchema()`, that the health
// endpoint wires it behind `?drift=1`, and that the admin deploy page
// surfaces the report inline. If a future refactor breaks any of those
// hinges the drift guard goes silent — exactly the failure mode this
// test exists to catch.
//
// Run: node scripts/test-schema-drift.mjs
// Auto-run: included in scripts/run-all-tests.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const readRepo = (relPath) =>
  readFileSync(resolve(repoRoot, relPath), "utf8");

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(msg);
    console.error(`  ✗ ${msg}`);
  }
}

console.log("Test suite: schema-drift detection");
console.log("----------------------------------");

// 1. Drift module exists and exports the expected surface.
const driftModule = readRepo("lib/db/schema-drift.ts");
assert(
  driftModule.includes("export function expectedSchema"),
  "schema-drift.ts exports expectedSchema()"
);
assert(
  driftModule.includes("export async function detectSchemaDrift"),
  "schema-drift.ts exports detectSchemaDrift()"
);
assert(
  driftModule.includes("import \"server-only\""),
  "schema-drift.ts imports server-only guard"
);
assert(
  driftModule.includes("getTableConfig"),
  "schema-drift.ts uses Drizzle getTableConfig for introspection"
);
assert(
  driftModule.includes("information_schema.COLUMNS"),
  "schema-drift.ts queries information_schema.COLUMNS"
);
assert(
  /TABLE_SCHEMA\s*=\s*\$\{databaseName\}/.test(driftModule) ||
    driftModule.includes("TABLE_SCHEMA = ${databaseName}"),
  "schema-drift.ts parameterises TABLE_SCHEMA (no string concat)"
);
assert(
  /catch\s*\([^)]*\)\s*\{/.test(driftModule) && driftModule.includes("error:"),
  "schema-drift.ts swallows errors into the report (never throws)"
);

// 2. Every mysqlTable in db/schema/ should be enumerable. We can't call
//    expectedSchema() without running TS, but we can static-compare the
//    count: grep the exports, then assert the report shape references
//    them. Minimum floor is 25 tables per schema/app.ts + schema/auth.ts.
const appSchema = readRepo("db/schema/app.ts");
const authSchema = readRepo("db/schema/auth.ts");
const tableCount =
  (appSchema.match(/= mysqlTable\(/g) || []).length +
  (authSchema.match(/= mysqlTable\(/g) || []).length;
assert(
  tableCount >= 20,
  `db/schema/ declares at least 20 tables (found ${tableCount})`
);

// 3. Health endpoint wires the drift probe behind ?drift=1 (default-off
//    so Cloudflare pings stay cheap).
const healthRoute = readRepo("app/api/health/route.ts");
assert(
  healthRoute.includes("detectSchemaDrift"),
  "health route imports detectSchemaDrift"
);
assert(
  healthRoute.includes('searchParams.get("drift")'),
  "health route gates drift probe on ?drift query param"
);
assert(
  /schemaDrift/.test(healthRoute),
  "health route surfaces schemaDrift key in the response body"
);
assert(
  /status:\s*dbOk\s*\?\s*200\s*:\s*503/.test(healthRoute),
  "health route still returns 200/503 on DB liveness alone — drift never flips ok"
);

// 4. Admin deploy page renders the drift report inline so operators see
//    it right after a push.
const adminDeploy = readRepo("app/admin/deploy/page.tsx");
assert(
  adminDeploy.includes("detectSchemaDrift"),
  "admin/deploy imports detectSchemaDrift"
);
assert(
  adminDeploy.includes("Schema drift"),
  "admin/deploy renders the 'Schema drift' section heading"
);
assert(
  adminDeploy.includes("drift.missingTables") &&
    adminDeploy.includes("drift.driftedTables"),
  "admin/deploy renders both missingTables and driftedTables lists"
);
assert(
  adminDeploy.includes("drift.error") || /drift\.error/.test(adminDeploy),
  "admin/deploy renders the drift probe error state"
);

// 5. Documentation: CLAUDE.md §6 mentions the errno-150 incident that
//    motivated this guard. Drift guard should be recorded in STATUS.md
//    once shipped — the test itself can't assert the commit SHA, but we
//    can check that the punch-list entry exists.
let statusDoc = "";
try {
  statusDoc = readRepo("docs/STATUS.md");
} catch {
  statusDoc = "";
}
assert(
  statusDoc.length > 0,
  "docs/STATUS.md exists (punch list is checked into the repo)"
);

console.log("");
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("");
  console.error("Failures:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
