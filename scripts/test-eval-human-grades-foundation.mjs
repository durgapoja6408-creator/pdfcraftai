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
// Section G: Phase G-2 drilldown — /admin/evals/[op]/[providerId]/
// [model]/page.tsx + loadGradesForOpCombo helper. PENDING §6a,
// 2026-05-06.
//
// Purpose: when the parent /admin/evals page renders a (provider×
// model×op) row red (overall average < HUMAN_GRADE_FLOOR), ops
// needs to drill into the actual grades + grader notes to
// understand WHY. This drilldown surface aggregates all grades
// for the combo across all golden-set fixtures, with notes
// expanded inline + per-fixture grouping.
// ---------------------------------------------------------------------------

const DRILLDOWN_PAGE = path.join(
  ROOT,
  "app/admin/evals/[op]/[providerId]/[model]/page.tsx",
);

if (fs.existsSync(QUERIES)) {
  const queriesSrc = fs.readFileSync(QUERIES, "utf8");

  assert(
    /export\s+async\s+function\s+loadGradesForOpCombo\b/.test(queriesSrc),
    "G1: loadGradesForOpCombo is exported (Phase G-2 drilldown helper)",
  );
  // Filters on operation + providerId + model. NO goldenSetId
  // filter (that's loadGradesForCombo's purpose) — drilldown
  // shows ALL fixtures.
  assert(
    /loadGradesForOpCombo[\s\S]*?eq\(\s*schema\.evalHumanGrades\.operation/.test(
      queriesSrc,
    ),
    "G2: loadGradesForOpCombo filters on operation",
  );
  assert(
    /loadGradesForOpCombo[\s\S]*?eq\(\s*schema\.evalHumanGrades\.providerId/.test(
      queriesSrc,
    ),
    "G3: loadGradesForOpCombo filters on providerId",
  );
  assert(
    /loadGradesForOpCombo[\s\S]*?eq\(\s*schema\.evalHumanGrades\.model/.test(
      queriesSrc,
    ),
    "G4: loadGradesForOpCombo filters on model",
  );
  // Limit clamp — defensive against caller passing huge limits
  assert(
    /Math\.max\(\s*1,\s*Math\.min\(\s*500/.test(queriesSrc),
    "G5: loadGradesForOpCombo clamps limit to [1, 500] (defensive against huge values)",
  );
}

assert(
  fs.existsSync(DRILLDOWN_PAGE),
  "G6: app/admin/evals/[op]/[providerId]/[model]/page.tsx exists",
);

if (fs.existsSync(DRILLDOWN_PAGE)) {
  const ddSrc = fs.readFileSync(DRILLDOWN_PAGE, "utf8");

  assert(
    /export\s+default\s+async\s+function\s+AdminEvalsDrilldownPage/.test(
      ddSrc,
    ),
    "G7: drilldown page default export",
  );
  assert(
    /requireAdmin\(\)/.test(ddSrc),
    "G8: drilldown page is admin-gated via requireAdmin()",
  );

  // Calls the new helper with URL params
  assert(
    /loadGradesForOpCombo\(\s*op,\s*providerId,\s*model/.test(ddSrc),
    "G9: drilldown calls loadGradesForOpCombo with the URL params",
  );

  // Defensive trim on URL params
  assert(
    /decodeURIComponent\(params\.op\)\.trim\(\)/.test(ddSrc),
    "G10: drilldown defensively trims decoded URL params",
  );

  // Computes combo averages from result set (self-contained)
  assert(
    /grades\.reduce\(/.test(ddSrc),
    "G11: drilldown computes combo averages from result set (self-contained — no round-trip to loadPerOpAverages)",
  );

  // Groups by goldenSetId for per-fixture rendering
  assert(
    /byFixture\.set\(g\.goldenSetId/.test(ddSrc),
    "G12: drilldown groups grades by goldenSetId (per-fixture rendering for trend visibility)",
  );

  // Back link to /admin/evals
  assert(
    /href="\/admin\/evals"/.test(ddSrc),
    "G13: drilldown has a back link to /admin/evals",
  );

  // Read-only invariant — no forms/POST (matches D6 on the parent page)
  assert(
    !/(form\s+action|action="\/api|method="post"|method="POST")/.test(ddSrc),
    "G14: drilldown is read-only (no form/POST surface — Phase G-1 grader writes; this drilldown is observational)",
  );

  // ----- Trend chart (Phase G-2 final, 2026-05-06) -----
  assert(
    /function\s+TrendChart\(/.test(ddSrc),
    "G19: drilldown defines TrendChart inline SVG component (Phase G-2 trend chart)",
  );
  // Empty-state branch — returns null on zero grades so the section
  // doesn't paint an empty rectangle
  assert(
    /grades\.length\s*===\s*0[\s\S]{0,40}?return\s+null/.test(ddSrc),
    "G20: TrendChart returns null on empty grades (no meaningless empty-rectangle render)",
  );
  // Sorts ASC for left-to-right time progression (loadGradesForOpCombo
  // returns DESC; chart needs ASC)
  assert(
    /a\.createdAt\.getTime\(\)\s*-\s*b\.createdAt\.getTime\(\)/.test(ddSrc),
    "G21: TrendChart sorts ASC by createdAt (left=oldest, right=newest — eye-natural)",
  );
  // Threshold floor line at HUMAN_GRADE_FLOOR
  assert(
    /yOf\(HUMAN_GRADE_FLOOR\)/.test(ddSrc),
    "G22: TrendChart draws threshold line at HUMAN_GRADE_FLOOR (red/green visual reference)",
  );
  // Score-axis range is fixed [1, 5] (Likert)
  assert(
    /\(s\s*-\s*1\)\s*\/\s*4/.test(ddSrc),
    "G23: TrendChart maps score [1,5] to y-axis (Likert range fixed)",
  );
  // Polyline (not bar/scatter) — connects dots chronologically
  assert(
    /<polyline\s/.test(ddSrc),
    "G24: TrendChart renders a <polyline> for the trend (connected chronological line)",
  );
  // Per-point dots colored by HUMAN_GRADE_FLOOR (matches scoreColor
  // semantics — red below floor, neutral mid, green high)
  assert(
    /p\.score\s*<\s*HUMAN_GRADE_FLOOR/.test(ddSrc),
    "G25: TrendChart colors per-point dots by floor (matches scoreColor semantics)",
  );
  // Single-grade case handled (avoids divide-by-zero on tSpan)
  assert(
    /points\.length\s*===\s*1/.test(ddSrc),
    "G26: TrendChart handles single-grade case (avoids /0 on tSpan and pins dot to viewport midpoint)",
  );
  // Accessibility: role + aria-label on the SVG
  assert(
    /role="img"[\s\S]{0,300}?aria-label=/.test(ddSrc),
    "G27: TrendChart has role='img' + aria-label for screen readers",
  );
  // Section is gated on n > 0 (no chart card when zero grades)
  assert(
    /n\s*>\s*0\s*\?\s*\(\s*\n[\s\S]{0,400}?<TrendChart/.test(ddSrc),
    "G28: trend chart section is wrapped in n > 0 ternary (matches TrendChart's empty-state contract)",
  );

  // ----- aiOutputExcerpt expansion (Phase G-2 polish, 2026-05-06) -----
  // Drilldown shows the actual graded output as an expandable
  // <details> block under each row's notes. Lets admins see WHAT
  // was graded without a separate query.
  assert(
    /g\.aiOutputExcerpt/.test(ddSrc),
    "G29: drilldown shows aiOutputExcerpt per grade row",
  );
  assert(
    /<details/.test(ddSrc),
    "G30: aiOutputExcerpt rendered as collapsed <details> (row stays compact, expandable on demand)",
  );
  assert(
    /<pre/.test(ddSrc) && /whiteSpace:\s*"pre-wrap"/.test(ddSrc),
    "G31: excerpt rendered in <pre> with whiteSpace:pre-wrap (preserves linebreaks but allows wrap on long lines)",
  );
  // Cap the rendered excerpt height so a 10K-char output doesn't
  // dominate the page
  assert(
    /maxHeight:\s*240/.test(ddSrc),
    "G32: excerpt <pre> caps at maxHeight:240 with overflow:auto (page stays scannable)",
  );
}

if (fs.existsSync(ADMIN_PAGE)) {
  const adminSrc = fs.readFileSync(ADMIN_PAGE, "utf8");

  // encodeURIComponent on each segment so dots/hyphens survive
  // (multi-line argument formatting allowed: `encodeURIComponent(\n
  // r.operation,\n)` and `encodeURIComponent(r.operation)` should
  // both pass)
  assert(
    /encodeURIComponent\(\s*r\.operation\s*,?\s*\)/.test(adminSrc),
    "G15: per-op table encodes r.operation in drilldown URL",
  );
  assert(
    /encodeURIComponent\(\s*r\.providerId\s*,?\s*\)/.test(adminSrc),
    "G16: per-op table encodes r.providerId in drilldown URL",
  );
  assert(
    /encodeURIComponent\(\s*r\.model\s*,?\s*\)/.test(adminSrc),
    "G17: per-op table encodes r.model in drilldown URL",
  );
  // Wraps the operation cell in a Link
  assert(
    /<Link\s+href=\{drilldownHref\}/.test(adminSrc),
    "G18: per-op row wraps the operation cell in a Link to the drilldown URL",
  );

  // ----- Recent grades table also links to drilldown (Phase G-2
  //       polish, 2026-05-06) -----
  // The Recent grades table at the bottom of /admin/evals now also
  // links each row's Op cell to the drilldown surface, so admins
  // can navigate from "this grade was low" → "what's the broader
  // trend on this combo" in one click. We verify the drilldownHref
  // is computed inside the recent.map() loop (not just the per-op
  // map) by checking for two separate occurrences.
  const drilldownHrefMatches = adminSrc.match(/const drilldownHref =/g) ?? [];
  assert(
    drilldownHrefMatches.length >= 2,
    "G33: drilldownHref is computed in BOTH the per-op averages table AND the recent-grades table (Phase G-2 polish)",
  );
}

// ---------------------------------------------------------------------------
// Section H: personal-stats panel on /admin/evals/grade
// (PENDING §6a polish, 2026-05-06).
//
// Small motivational panel: "you've entered N grades in the last
// 7 days, last one Xh ago". Pulls eval_human_grades scoped to the
// current grader via loadGraderActivityForUser. Empty-state copy
// nudges toward first grade.
// ---------------------------------------------------------------------------

const GRADER_PAGE = path.join(ROOT, "app/admin/evals/grade/page.tsx");

if (fs.existsSync(QUERIES)) {
  const queriesSrc = fs.readFileSync(QUERIES, "utf8");

  assert(
    /export\s+async\s+function\s+loadGraderActivityForUser\b/.test(
      queriesSrc,
    ),
    "H1: loadGraderActivityForUser is exported (per-user grader stats helper)",
  );
  // Filters by graderUserId AND createdAt >= cutoff
  assert(
    /loadGraderActivityForUser[\s\S]*?eq\(\s*schema\.evalHumanGrades\.graderUserId/.test(
      queriesSrc,
    ),
    "H2: helper filters by graderUserId (per-user scope)",
  );
  assert(
    /loadGraderActivityForUser[\s\S]*?gte\(\s*schema\.evalHumanGrades\.createdAt,\s*cutoff/.test(
      queriesSrc,
    ),
    "H3: helper applies cutoff via gte(createdAt, cutoff)",
  );
  // Returns BOTH count + lastGradedAt (the form needs both for
  // "you've graded N items, last one Xh ago" copy)
  assert(
    /gradeCount:\s*Number\(/.test(queriesSrc) &&
      /lastGradedAt:\s*row\?\.lastAt/.test(queriesSrc),
    "H4: helper returns BOTH gradeCount + lastGradedAt (caller renders 'last one Xh ago')",
  );
  // Empty-string graderUserId guard
  assert(
    /graderUserId\.length\s*===\s*0/.test(queriesSrc),
    "H5: helper short-circuits on empty graderUserId (defensive — auth-gated callers shouldn't hit this but pin it anyway)",
  );
}

assert(
  fs.existsSync(GRADER_PAGE),
  "H6: app/admin/evals/grade/page.tsx exists",
);
if (fs.existsSync(GRADER_PAGE)) {
  const gpSrc = fs.readFileSync(GRADER_PAGE, "utf8");

  // Imports + calls
  assert(
    /import\s*\{\s*loadGraderActivityForUser\s*\}\s*from\s*"@\/lib\/ai\/eval\/human-grades"/.test(
      gpSrc,
    ),
    "H7: grader page imports loadGraderActivityForUser",
  );
  assert(
    /loadGraderActivityForUser\(\s*graderUserId/.test(gpSrc),
    "H8: grader page calls loadGraderActivityForUser with graderUserId from session",
  );

  // graderUserId from session, NEVER from input or query param —
  // anti-impersonation invariant for the stats lookup itself
  assert(
    /\(session\.user\s+as\s+\{\s*id\?\s*:\s*string\s*\}\)\.id/.test(
      gpSrc,
    ),
    "H9: graderUserId pulled from session.user.id (anti-impersonation)",
  );

  // Empty-state branch
  assert(
    /myStats\.gradeCount\s*===\s*0/.test(gpSrc),
    "H10: grader page handles empty-state (gradeCount === 0 branch with first-grade nudge copy)",
  );

  // Singular/plural copy correctness
  assert(
    /myStats\.gradeCount\s*===\s*1\s*\?\s*"grade"\s*:\s*"grades"/.test(
      gpSrc,
    ),
    "H11: stats panel uses singular/plural copy correctly",
  );

  // fmtRelative helper for last-graded timestamp
  assert(
    /function\s+fmtRelative\(/.test(gpSrc),
    "H12: page defines fmtRelative helper for human-readable timestamps",
  );

  // The "last one Xh ago" string is gated on lastRel — null when
  // no grades, so the copy doesn't say "last one null ago"
  assert(
    /lastRel\s*\?\s*`,\s*last one \$\{lastRel\}`/.test(gpSrc),
    "H13: 'last one Xh ago' copy is null-gated (no 'last one null ago' regression)",
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
