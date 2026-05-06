#!/usr/bin/env node
/**
 * 2026-05-05 — Human eval grades foundation guard (PENDING §6a).
 *
 * Mirrors the other foundation guards: pin migration 0026 DDL,
 * Drizzle schema parity, helper public surface (read-only),
 * admin viewer Page export shape + read-only invariant.
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

const MIGRATION = path.join(ROOT, "db/migrations/0026_eval_human_grades.sql");
const SCHEMA = path.join(ROOT, "db/schema/app.ts");
const QUERIES = path.join(ROOT, "lib/ai/eval/human-grades.ts");
const ADMIN_PAGE = path.join(ROOT, "app/admin/evals/page.tsx");

// ---------------------------------------------------------------------------
// Section A: migration 0026 shape
// ---------------------------------------------------------------------------

assert(
  fs.existsSync(MIGRATION),
  "A1: db/migrations/0026_eval_human_grades.sql exists",
);
const migrationSrc = fs.readFileSync(MIGRATION, "utf8");

function stripSqlComments(src) {
  return src
    .replace(/^\s*--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}
const migrationExec = stripSqlComments(migrationSrc);

assert(
  /CREATE TABLE\s+`eval_human_grades`/.test(migrationExec),
  "A2: migration creates eval_human_grades table",
);

// All score columns — 4 dimensions
for (const col of [
  "score_relevance",
  "score_completeness",
  "score_faithfulness",
  "score_actionability",
]) {
  assert(
    new RegExp(`\`${col}\`\\s+tinyint\\s+unsigned\\s+NOT\\s+NULL`, "i").test(
      migrationExec,
    ),
    `A3.${col}: ${col} is tinyint unsigned NOT NULL (1..5 Likert)`,
  );
}

// Required columns
for (const col of [
  "golden_set_id",
  "operation",
  "provider_id",
  "model",
  "grader_user_id",
  "notes",
  "ai_output_excerpt",
  "created_at",
]) {
  assert(
    new RegExp(`\`${col}\``).test(migrationExec),
    `A4.${col}: has ${col} column`,
  );
}

// Optional eval_run_id (NULLable — fresh-regen-and-grade case)
assert(
  /`eval_run_id`\s+varchar\(36\)\s+DEFAULT\s+NULL/i.test(migrationExec),
  "A5: eval_run_id is varchar(36) NULL (optional ref to ai_eval_runs)",
);

// Unique on (fixture, provider, model, op, grader)
assert(
  /UNIQUE\s*\(\s*[\s\S]*?`golden_set_id`[\s\S]*?`provider_id`[\s\S]*?`model`[\s\S]*?`operation`[\s\S]*?`grader_user_id`/i.test(
    migrationExec,
  ),
  "A6: UNIQUE(golden_set_id, provider_id, model, operation, grader_user_id)",
);

// All three indexes
for (const idx of [
  "eval_human_grades_op_created_idx",
  "eval_human_grades_provider_model_op_idx",
  "eval_human_grades_grader_created_idx",
]) {
  assert(
    new RegExp(`CREATE INDEX\\s+\`${idx}\``).test(migrationExec),
    `A7.${idx}: ${idx} exists`,
  );
}

// No DROP / MODIFY / CHANGE — additive only
for (const verb of ["DROP TABLE", "DROP COLUMN", "MODIFY", "CHANGE"]) {
  assert(
    !new RegExp(`\\b${verb}\\b`).test(migrationExec),
    `A8.${verb.replace(/\s/g, "_")}: migration is additive-only`,
  );
}

// ---------------------------------------------------------------------------
// Section B: Drizzle schema parity
// ---------------------------------------------------------------------------

assert(fs.existsSync(SCHEMA), "B1: db/schema/app.ts exists");
const schemaSrc = fs.readFileSync(SCHEMA, "utf8");

// tinyint must be imported (the score columns need it)
assert(
  /\btinyint\b/.test(schemaSrc) &&
    /^import\s*\{[\s\S]*?\btinyint\b[\s\S]*?\}\s*from\s*"drizzle-orm\/mysql-core"/m.test(
      schemaSrc,
    ),
  "B2: tinyint is imported from drizzle-orm/mysql-core",
);

assert(
  /export\s+const\s+evalHumanGrades\s*=\s*mysqlTable\(\s*"eval_human_grades"/.test(
    schemaSrc,
  ),
  "B3: evalHumanGrades is exported",
);

// Extract the block (same pattern as other foundation guards)
function extractBlock(src, exportName) {
  const start = src.indexOf(`export const ${exportName}`);
  if (start === -1) return null;
  const after = src.slice(start);
  const nextExport = after.indexOf("\nexport const ", 1);
  return nextExport === -1 ? after : after.slice(0, nextExport);
}

const block = extractBlock(schemaSrc, "evalHumanGrades");
assert(block !== null, "B4: extracted evalHumanGrades block");
if (block) {
  for (const f of [
    "goldenSetId",
    "operation",
    "providerId",
    "model",
    "evalRunId",
    "graderUserId",
    "scoreRelevance",
    "scoreCompleteness",
    "scoreFaithfulness",
    "scoreActionability",
    "notes",
    "aiOutputExcerpt",
    "createdAt",
  ]) {
    assert(
      new RegExp(`${f}:`).test(block),
      `B5.${f}: evalHumanGrades has ${f} field`,
    );
  }

  // All 4 score columns are tinyint unsigned NOT NULL
  for (const col of [
    "scoreRelevance",
    "scoreCompleteness",
    "scoreFaithfulness",
    "scoreActionability",
  ]) {
    assert(
      new RegExp(
        `${col}:\\s*tinyint\\(\\s*"score_[a-z]+",\\s*\\{\\s*\\n?\\s*unsigned:\\s*true,?\\s*\\n?\\s*\\}\\)\\.notNull\\(\\)`,
      ).test(block),
      `B6.${col}: ${col} is tinyint unsigned notNull`,
    );
  }

  // Unique index on the 5-column combo
  assert(
    /uniqueIndex\("eval_human_grades_unique"\)\.on\(\s*[\s\S]*?goldenSetId[\s\S]*?providerId[\s\S]*?model[\s\S]*?operation[\s\S]*?graderUserId/.test(
      block,
    ),
    "B7: uniqueIndex covers (goldenSetId, providerId, model, operation, graderUserId)",
  );
}

// ---------------------------------------------------------------------------
// Section C: queries.ts public surface (read-only)
// ---------------------------------------------------------------------------

assert(fs.existsSync(QUERIES), "C1: lib/ai/eval/human-grades.ts exists");
const queriesSrc = fs.readFileSync(QUERIES, "utf8");

assert(
  /export\s+const\s+HUMAN_GRADE_FLOOR\s*=\s*3\.5/.test(queriesSrc),
  "C2: HUMAN_GRADE_FLOOR = 3.5 (overall threshold)",
);
assert(
  /export\s+(?:async\s+)?function\s+listRecentHumanGrades\b/.test(queriesSrc),
  "C3: listRecentHumanGrades is exported",
);
assert(
  /export\s+(?:async\s+)?function\s+loadPerOpAverages\b/.test(queriesSrc),
  "C4: loadPerOpAverages is exported",
);
assert(
  /export\s+(?:async\s+)?function\s+loadGraderActivity\b/.test(queriesSrc),
  "C5: loadGraderActivity is exported (drives 'is grading happening?' card)",
);
assert(
  /export\s+(?:async\s+)?function\s+loadGradesForCombo\b/.test(queriesSrc),
  "C6: loadGradesForCombo is exported (for future Phase G grader UI)",
);

// Read-only invariant: no inserts/updates/deletes on the table
for (const verb of [
  "db\\.insert\\(\\s*schema\\.evalHumanGrades",
  "db\\.update\\(\\s*schema\\.evalHumanGrades",
  "db\\.delete\\(\\s*schema\\.evalHumanGrades",
]) {
  assert(
    !new RegExp(verb).test(queriesSrc),
    `C7.${verb}: queries.ts is read-only (no ${verb.replace(/\\\\/g, "")})`,
  );
}

// Per-op aggregates compute overallAvg as mean of 4 dimensions
assert(
  /\(\s*avgR\s*\+\s*avgC\s*\+\s*avgF\s*\+\s*avgA\s*\)\s*\/\s*4/.test(queriesSrc),
  "C8: overallAvg = mean of 4 dimension averages",
);

// Sort by overallAvg ASC (worst first)
assert(
  /\.sort\(\s*\(\s*a\s*,\s*b\s*\)\s*=>\s*a\.overallAvg\s*-\s*b\.overallAvg/.test(
    queriesSrc,
  ),
  "C9: per-op averages sorted ASC (worst-performing combos surface first)",
);

// 30-day default lookback
assert(
  /lookbackDays\s*\?\?\s*30/.test(queriesSrc),
  "C10: per-op averages default lookback = 30 days",
);

// 7-day default for grader activity
assert(
  /lookbackDays\s*\?\?\s*7/.test(queriesSrc),
  "C11: grader-activity default lookback = 7 days (weekly cadence)",
);

// ---------------------------------------------------------------------------
// Section D: admin viewer is a Next.js Page (read-only, no foreign exports)
// ---------------------------------------------------------------------------

assert(fs.existsSync(ADMIN_PAGE), "D1: app/admin/evals/page.tsx exists");
const pageSrc = fs.readFileSync(ADMIN_PAGE, "utf8");

assert(
  /export\s+default\s+async\s+function\s+AdminEvalsPage/.test(pageSrc),
  "D2: AdminEvalsPage is the default export",
);
assert(
  /export\s+const\s+dynamic\s*=\s*"force-dynamic"/.test(pageSrc),
  "D3: dynamic = force-dynamic",
);
assert(
  /export\s+const\s+runtime\s*=\s*"nodejs"/.test(pageSrc),
  "D4: runtime = nodejs",
);
assert(
  /requireAdmin\(\)/.test(pageSrc),
  "D5: page calls requireAdmin() before rendering",
);
assert(
  !/(form\s+action|action="\/api|method="post"|method="POST")/.test(pageSrc),
  "D6: page has no form/POST surface (read-only invariant — grader UI is Phase G)",
);
assert(
  /HUMAN_GRADE_FLOOR/.test(pageSrc),
  "D7: page surfaces HUMAN_GRADE_FLOOR threshold to operators",
);

// scoreColor uses the floor for red/green
assert(
  /<\s*HUMAN_GRADE_FLOOR/.test(pageSrc),
  "D8: red-flag rendering pinned to HUMAN_GRADE_FLOOR",
);

// ---------------------------------------------------------------------------
// Section E: writer module (Phase G partial, 2026-05-05)
// ---------------------------------------------------------------------------

const WRITER = path.join(ROOT, "lib/ai/eval/human-grade-writer.ts");
assert(fs.existsSync(WRITER), "E1: lib/ai/eval/human-grade-writer.ts exists");
if (fs.existsSync(WRITER)) {
  const writerSrc = fs.readFileSync(WRITER, "utf8");

  assert(
    /export\s+async\s+function\s+recordHumanGrade\b/.test(writerSrc),
    "E2: recordHumanGrade is exported async",
  );
  assert(
    /export\s+async\s+function\s+replaceGrade\b/.test(writerSrc),
    "E3: replaceGrade is exported async (explicit overwrite path)",
  );
  assert(
    /export\s+class\s+HumanGradeWriteError\s+extends\s+Error\b/.test(
      writerSrc,
    ),
    "E4: HumanGradeWriteError class is exported",
  );

  // 1..5 Likert validation — reject out-of-range
  assert(
    /value\s*<\s*1\s*\|\|\s*value\s*>\s*5/.test(writerSrc),
    "E5: validateScore rejects values outside 1..5 (no silent clamp)",
  );
  assert(
    /Number\.isInteger/.test(writerSrc),
    "E6: validateScore requires integer (no 3.5 sneaking through)",
  );

  // Duplicate-key handling — translate ER_DUP_ENTRY to typed
  // exception, not silent failure.
  assert(
    /Duplicate entry|ER_DUP_ENTRY/.test(writerSrc),
    "E7: recordHumanGrade catches MySQL duplicate-key (the 5-col unique)",
  );
  assert(
    /"DUPLICATE"/.test(writerSrc),
    "E8: duplicate path throws HumanGradeWriteError with code 'DUPLICATE'",
  );

  // replaceGrade uses a transaction (DELETE + INSERT must be atomic)
  assert(
    /db\.transaction\(\s*async\s*\(\s*tx\s*\)/.test(writerSrc),
    "E9: replaceGrade wraps DELETE+INSERT in a transaction",
  );

  // Both writer functions exist; pin that they hit the eval table.
  // tx.delete may be split across lines (chained ./delete on next
  // line) — multiline-friendly match.
  assert(
    /tx[\s\S]*?\.delete\(\s*schema\.evalHumanGrades/.test(writerSrc) &&
      /tx\.insert\(\s*schema\.evalHumanGrades/.test(writerSrc),
    "E10: replaceGrade transaction does delete-then-insert on evalHumanGrades",
  );
}

// ---------------------------------------------------------------------------
// Section F: admin POST handler /api/admin/evals/grade
// ---------------------------------------------------------------------------

const ROUTE = path.join(ROOT, "app/api/admin/evals/grade/route.ts");
assert(fs.existsSync(ROUTE), "F1: app/api/admin/evals/grade/route.ts exists");
if (fs.existsSync(ROUTE)) {
  const routeSrc = fs.readFileSync(ROUTE, "utf8");

  assert(
    /export\s+async\s+function\s+POST\b/.test(routeSrc),
    "F2: POST handler is exported",
  );
  assert(
    /export\s+const\s+runtime\s*=\s*"nodejs"/.test(routeSrc),
    "F3: runtime = nodejs",
  );

  // Auth gate — admin email check
  assert(
    /isAdminEmail/.test(routeSrc),
    "F4: route uses isAdminEmail() admin-allowlist gate",
  );
  assert(
    /not_authenticated/.test(routeSrc) && /forbidden/.test(routeSrc),
    "F5: route returns 401 not_authenticated + 403 forbidden",
  );

  // graderUserId from session — NEVER from body. Load-bearing:
  // trusting the body would let an admin attribute grades to other
  // admins.
  assert(
    /graderUserId:\s*userId/.test(routeSrc),
    "F6: graderUserId is taken from session.user.id (NEVER from body — anti-impersonation)",
  );
  assert(
    !/graderUserId:\s*body\.graderUserId/.test(routeSrc),
    "F7: route does NOT read graderUserId from body (would allow grade impersonation)",
  );

  // Error code → HTTP status mapping
  assert(
    /code\s*===\s*"DUPLICATE"/.test(routeSrc) &&
      /status\s*=\s*409/.test(routeSrc),
    "F8: DUPLICATE writer error maps to 409 Conflict",
  );
  assert(
    /code\s*===\s*"INVALID_SCORE"/.test(routeSrc) &&
      /status\s*=\s*400/.test(routeSrc),
    "F9: INVALID_SCORE writer error maps to 400 Bad Request",
  );

  // replace flag handling
  assert(
    /body\.replace\s*===\s*true/.test(routeSrc),
    "F10: route reads body.replace boolean (explicit overwrite opt-in)",
  );
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(`eval-human-grades-foundation: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
