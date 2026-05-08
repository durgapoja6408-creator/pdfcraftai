#!/usr/bin/env node
/**
 * 2026-05-08 — /app/ai-history page regression guard (Tier 4 #11).
 *
 * Background: /app/ai-history is the dedicated AI-artifact index that
 * closes the "where did my output go?" gap. The query joins two tables:
 *
 *   ai_outputs  ──INNER JOIN──  files
 *
 * filtered by `files.userId = session.userId`. The userId filter MUST
 * be on the `files` row, not on `ai_outputs` (which has no userId
 * column at all — auth model is "owner of the source PDF owns the
 * derivative"). A future contributor refactoring this query who
 * accidentally removes the join, or filters on the wrong table, would
 * silently leak other users' AI outputs. This guard catches that class
 * of regression at static-parse time.
 *
 * Also catches:
 *   - Nav entry deleted (page becomes unreachable from the shell)
 *   - kind enum drift (schema gains a new kind that the page's
 *     KIND_META doesn't render — the row would crash with a runtime
 *     undefined-property access; we'd rather fail at CI)
 *   - Excerpt sent untruncated (would balloon the page payload — the
 *     content_md column is mediumtext / 16MB)
 *   - Limit dropped (unbounded query against a high-traffic table)
 *
 * Pure static parse. Sub-second. No DB or runtime dependency. Output
 * conforms to the aggregator regex `${name}: ${pass} passed, ${fail} failed`.
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

const PAGE_PATH = path.join(ROOT, "app/app/ai-history/page.tsx");
const NAV_PATH = path.join(ROOT, "components/app/AppShell.tsx");
const SCHEMA_PATH = path.join(ROOT, "db/schema/app.ts");

assert(fs.existsSync(PAGE_PATH), `Page missing at ${PAGE_PATH}`);
assert(fs.existsSync(NAV_PATH), `AppShell missing at ${NAV_PATH}`);
assert(fs.existsSync(SCHEMA_PATH), `Schema missing at ${SCHEMA_PATH}`);

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
  console.log(`ai-history-page: ${passed} passed, ${failed} failed`);
  process.exit(1);
}

const PAGE_SRC = fs.readFileSync(PAGE_PATH, "utf8");
const NAV_SRC = fs.readFileSync(NAV_PATH, "utf8");
const SCHEMA_SRC = fs.readFileSync(SCHEMA_PATH, "utf8");

// ---------------------------------------------------------------------
// Section A — auth + redirect.
// ---------------------------------------------------------------------

assert(
  /import\s*\{\s*auth\s*\}\s*from\s*"@\/auth"/.test(PAGE_SRC),
  "Page must import auth from @/auth — without it, no session = no userId.",
);

assert(
  /const\s+userId\s*=\s*session\?\.user\s*\?\s*\(session\.user\s+as\s*\{[^}]*id\?:\s*string[^}]*\}\)\.id\s*:\s*undefined;\s*if\s*\(!userId\)\s*redirect\("\/login(?:\?[^"]*)?"\);/s.test(
    PAGE_SRC,
  ),
  "Auth-then-redirect-to-login pattern not found. Expected the canonical " +
    "`const userId = session?.user ? (session.user as { id?: string }).id : undefined; " +
    "if (!userId) redirect(\"/login?...\");` from /app/files/page.tsx (callbackUrl optional).",
);

assert(
  /export\s+const\s+dynamic\s*=\s*"force-dynamic"/.test(PAGE_SRC),
  "Page must export `dynamic = 'force-dynamic'` — auth() reads cookies, " +
    "so static generation would either crash or serve stale state.",
);

// ---------------------------------------------------------------------
// Section B — query joins both tables and filters by files.userId.
// ---------------------------------------------------------------------
//
// This is the cross-tenant safety invariant. The whole class of bugs
// caught by this section: someone refactors the query, drops the join,
// and filters on `ai_outputs` alone — but `ai_outputs` has no userId
// column, so the filter compiles against the wrong column or returns
// EVERY row. The three checks below pin down the exact join + filter
// shape this page depends on.

assert(
  /\.from\(\s*schema\.aiOutputs\s*\)/.test(PAGE_SRC),
  "Query must use `db.select(...).from(schema.aiOutputs)` as the FROM. " +
    "Listing AI artifacts FROM `files` would force a left-join shape that " +
    "leaks files with no AI output.",
);

assert(
  /\.innerJoin\(\s*schema\.files\s*,\s*eq\(\s*schema\.aiOutputs\.fileId\s*,\s*schema\.files\.id\s*\)\s*\)/.test(
    PAGE_SRC,
  ),
  "INNER JOIN on files.id = ai_outputs.fileId not found. Required for " +
    "cross-tenant safety: the userId filter lives on `files`, and an outputs-" +
    "only query has no way to scope by user.",
);

assert(
  /eq\(\s*schema\.files\.userId\s*,\s*userId\s*\)/.test(PAGE_SRC),
  "userId filter must be on `schema.files.userId`. Filtering on " +
    "ai_outputs.userId would compile against a non-existent column and " +
    "even if it didn't, would skip the `files` ownership check that " +
    "every other multi-tenant query in this codebase relies on.",
);

// Negative check — there is no `ai_outputs.userId` column today, but
// someone might "fix" a future TS error by adding `eq(schema.aiOutputs.userId, userId)`.
// Catch that proactively.
assert(
  !/eq\(\s*schema\.aiOutputs\.userId\s*,/.test(PAGE_SRC),
  "Found `eq(schema.aiOutputs.userId, ...)` — but ai_outputs has no userId column. " +
    "userId scoping must go through the joined `files` row.",
);

assert(
  /\.limit\(\s*\d+\s*\)/.test(PAGE_SRC),
  "Query must `.limit(...)` — unbounded SELECT against ai_outputs " +
    "would balloon page payload + DB load on power users.",
);

assert(
  /\.orderBy\(\s*desc\(\s*schema\.aiOutputs\.createdAt\s*\)\s*\)/.test(PAGE_SRC),
  "Must `orderBy(desc(schema.aiOutputs.createdAt))` — anything else " +
    "either ignores the existing ai_outputs_created_idx index or returns " +
    "the wrong rows when the result is truncated by the limit.",
);

// ---------------------------------------------------------------------
// Section C — kind enum parity with db/schema/app.ts.
// ---------------------------------------------------------------------
//
// db/schema/app.ts defines the ai_outputs.kind enum. The page's
// KIND_META map MUST include every member of that enum, otherwise a
// row with a future kind crashes the render with `Cannot read property
// 'icon' of undefined`. Drift goes the other direction too — KIND_META
// shouldn't include kinds the schema doesn't, since they'd be dead code.
//
// The schema enum is multi-line in this codebase (spans lines 491–502
// with comments interleaved), so we extract the aiOutputs block first,
// then pull every quoted literal from inside the kind() call.

const aiOutputsBlock = SCHEMA_SRC.match(
  /export\s+const\s+aiOutputs\s*=\s*mysqlTable\([\s\S]*?\)\s*;/,
);
assert(
  aiOutputsBlock,
  "Could not locate `export const aiOutputs = mysqlTable(...)` block in schema. " +
    "Update this guard if the export was renamed.",
);

const kindCall = aiOutputsBlock
  ? aiOutputsBlock[0].match(/mysqlEnum\(\s*"kind"\s*,\s*\[([\s\S]*?)\]\s*\)/)
  : null;
assert(
  kindCall,
  "Could not find `mysqlEnum('kind', [...])` for ai_outputs.kind in schema.",
);

// Strip line/block comments before pulling literals — Phase 5.6 added
// inline `// Phase 5.6 — five new AI tools` comments inside the array.
const kindBody = kindCall ? kindCall[1].replace(/\/\/[^\n]*\n/g, "\n") : "";
const schemaKinds = kindBody
  .match(/"([^"]+)"/g)
  ? kindBody.match(/"([^"]+)"/g).map((s) => s.slice(1, -1)).sort()
  : [];

const kindMetaBlock = PAGE_SRC.match(/KIND_META\s*:\s*Record<\s*([\s\S]*?),\s*\{/);
const pageKinds = kindMetaBlock
  ? (kindMetaBlock[1].match(/"([^"]+)"/g) || [])
      .map((s) => s.slice(1, -1))
      .sort()
  : [];

assert(
  schemaKinds.length > 0 && pageKinds.length > 0,
  `Schema kinds: [${schemaKinds.join(", ")}], page kinds: [${pageKinds.join(", ")}]. ` +
    "Both must be non-empty.",
);
assert(
  schemaKinds.join(",") === pageKinds.join(","),
  `Kind enum drift. Schema has [${schemaKinds.join(", ")}] but page KIND_META ` +
    `has [${pageKinds.join(", ")}]. Add the missing kind to the page's ` +
    "KIND_META map (with label / icon / tint) — a row with a kind not in " +
    "KIND_META renders undefined.",
);

// ---------------------------------------------------------------------
// Section D — content excerpt + payload size guard.
// ---------------------------------------------------------------------
//
// content_md is `mediumtext` (16MB ceiling). The page MUST excerpt
// before rendering. Catch the regression where someone "simplifies" by
// dropping makeExcerpt and rendering r.contentMd directly.

assert(
  /function\s+makeExcerpt\s*\(/.test(PAGE_SRC),
  "makeExcerpt() helper not found. The page must server-side truncate " +
    "ai_outputs.content_md (mediumtext / 16MB) before sending to the client.",
);

assert(
  /\bmakeExcerpt\s*\(\s*r\.contentMd\s*\)/.test(PAGE_SRC),
  "Render path must call `makeExcerpt(r.contentMd)`. Rendering raw " +
    "contentMd would let one row's 16MB worst-case push the page over " +
    "Next.js's RSC payload ceiling.",
);

// ---------------------------------------------------------------------
// Section E — kind filter is whitelisted, not echoed.
// ---------------------------------------------------------------------
//
// The `?kind=` search param is user-controlled. If it flowed straight
// into the Drizzle eq() call, a malformed value would surface as a TS
// type error at runtime (Drizzle uses literal-typed enums). Worse, a
// future refactor that loosens the type would let the user filter by
// arbitrary strings — fine for security, ugly for caching.

assert(
  /\(ALL_KINDS\s+as\s+string\[\]\)\.includes\(\s*rawKind\s*\)/.test(PAGE_SRC),
  "kind filter must be whitelisted via `(ALL_KINDS as string[]).includes(rawKind)`. " +
    "Direct echo of `searchParams.kind` into eq() would either crash on " +
    "an invalid value or compile against a future loose type.",
);

// ---------------------------------------------------------------------
// Section F — nav entry exists in AppShell.
// ---------------------------------------------------------------------

assert(
  /\{\s*href:\s*"\/app\/ai-history"\s*,\s*label:\s*"AI History"\s*,\s*icon:\s*"FileAi"\s+as\s+const\s*\}/.test(
    NAV_SRC,
  ),
  "AppShell.tsx NAV is missing the AI History entry. Without the nav " +
    "link, the page is reachable only by typing the URL — defeats the " +
    "whole point of the discoverability fix.",
);

// ---------------------------------------------------------------------
// Section G — source-name filter (?source=<name>) safety + wiring.
// ---------------------------------------------------------------------
//
// The source filter accepts user-controlled URL input. Defense-in-
// depth requires:
//   1. A sanitizer that rejects empty / oversized / control-char inputs
//      by returning null (= "no filter") rather than echoing.
//   2. The query path uses Drizzle's sql template binding (so the
//      value is parameterized — no SQL injection even if the
//      sanitizer ever gets bypassed).
//   3. The display path strips "prompt" (generation kind's literal
//      sourceName placeholder) so the row doesn't render the
//      meaningless "From prompt" label.

assert(
  /function\s+sanitizeSourceFilter\s*\(/.test(PAGE_SRC),
  "sanitizeSourceFilter() helper not found. The ?source= URL param " +
    "is user-controlled — without sanitization, oversized or " +
    "control-char inputs make the chip render strangely or generate " +
    "nonsense queries.",
);

assert(
  /SOURCE_NAME_MAX_CHARS\s*=\s*\d+/.test(PAGE_SRC),
  "SOURCE_NAME_MAX_CHARS constant not found. A length cap on the " +
    "source filter rejects pathological URL params; without it a " +
    "16KB sourceName eats query time + chip layout.",
);

assert(
  /JSON_UNQUOTE\(JSON_EXTRACT\(\$\{schema\.aiOutputs\.meta\},\s*'\$\.sourceName'\)\)\s*=\s*\$\{sourceFilter\}/.test(
    PAGE_SRC,
  ),
  "Source filter SQL clause not found. Expected " +
    "`JSON_UNQUOTE(JSON_EXTRACT(${schema.aiOutputs.meta}, '$.sourceName')) = ${sourceFilter}` " +
    "inside a Drizzle sql template. The sql template is what binds " +
    "the value as a parameterized arg — string-interpolating the " +
    "value into the SQL is the regression to catch.",
);

// Negative check — the source value must not be string-interpolated
// into the SQL via template literal arithmetic. Catch any regression
// like `sql\`... = '${sourceFilter}'\`` (extra single-quotes around
// the binding).
assert(
  !/JSON_UNQUOTE[\s\S]*?=\s*'\$\{sourceFilter\}'/.test(PAGE_SRC),
  "Found single-quoted `'${sourceFilter}'` interpolation in the " +
    "source-filter clause. Drizzle's sql template binds via `${...}` " +
    "without quotes — adding quotes turns the binding into a literal " +
    "string. Either way is wrong shape — remove the surrounding quotes.",
);

assert(
  /jsonSourceName\s*:\s*sql<string\s*\|\s*null>/.test(PAGE_SRC),
  "Row select must include `jsonSourceName: sql<string | null>\\`...\\`` — " +
    "the original ship pulled `schema.files.name` (the OUTPUT file " +
    "name) which subtly mislabeled the source. Pulling " +
    "JSON_UNQUOTE(JSON_EXTRACT(meta, '$.sourceName')) gives the real " +
    "source PDF filename. The `string | null` type makes the JSX " +
    "explicitly handle the legacy-row case.",
);

assert(
  /sourceName\s*===\s*"prompt"\s*\?\s*"From prompt"/.test(PAGE_SRC),
  "Generation kind's `sourceName === \"prompt\"` literal must be " +
    "filtered to a friendlier display ('From prompt') rather than " +
    "rendering the raw token. Without this, generation rows show " +
    "the meaningless filename 'prompt'.",
);

assert(
  /SourceFilterChip[\s\S]*?function\s+SourceFilterChip\s*\(/.test(PAGE_SRC),
  "SourceFilterChip helper component not found. The active source " +
    "filter needs a visible affordance with an X to clear — without " +
    "it users have to manually edit the URL to drop the filter.",
);

// ---------------------------------------------------------------------
// Section H — content keyword search (?q=<term>) safety + wiring.
// ---------------------------------------------------------------------
//
// The keyword search is the third filter axis (after kind + source).
// It runs LIKE against the mediumtext content_md column. Required:
//   1. Sanitizer that trims, length-clamps (KEYWORD_MIN/MAX_CHARS),
//      rejects control chars, AND escapes MySQL LIKE metacharacters
//      (% and _) so a literal % typed by the user doesn't act as a
//      wildcard.
//   2. The query path uses Drizzle's sql template binding with the
//      wildcards in the OUTER literal — never let the user control
//      the leading/trailing `%`. Anchored search via input alone is
//      not a feature; it's either a query language or it isn't.
//   3. ESCAPE clause names backslash explicitly so the % and _
//      escapes the sanitizer added are honored as literals, not
//      meta-chars.
//   4. Form preserves kind + source on submit (so submitting a new
//      keyword from a kind-filtered page keeps the kind filter).

assert(
  /function\s+sanitizeKeyword\s*\(/.test(PAGE_SRC),
  "sanitizeKeyword() helper not found. The ?q= URL param is user-" +
    "controlled — without sanitization, a user typing `%` triggers " +
    "wildcard search instead of a literal `%` match.",
);

assert(
  /KEYWORD_MIN_CHARS\s*=\s*\d+[\s\S]*?KEYWORD_MAX_CHARS\s*=\s*\d+/.test(PAGE_SRC) ||
    /KEYWORD_MAX_CHARS\s*=\s*\d+[\s\S]*?KEYWORD_MIN_CHARS\s*=\s*\d+/.test(PAGE_SRC),
  "KEYWORD_MIN_CHARS + KEYWORD_MAX_CHARS constants not found. The min " +
    "rejects single-char queries (too noisy) and the max rejects " +
    "pathological URL params; both are essential UX hygiene.",
);

// Match the literal `replaceAll("\\", "\\\\")` in source (where `\\`
// is a 2-char escape representing one literal backslash). The first
// argument has 2 backslash chars, the second has 4. In a regex literal
// each backslash needs `\\` so 2 chars → `\\\\`, 4 chars → `\\\\\\\\`.
assert(
  /\.replaceAll\(\s*"\\\\"\s*,\s*"\\\\\\\\"\s*\)/.test(PAGE_SRC),
  "Sanitizer must escape backslash FIRST via " +
    "`.replaceAll(\"\\\\\", \"\\\\\\\\\")`. Without that, the % and " +
    "_ replacements would themselves get escaped on a second pass — " +
    "you'd end up with `\\\\%` which is a backslash followed by an " +
    "unescaped % rather than a literal %.",
);

assert(
  /\.replaceAll\(\s*"%"\s*,\s*"\\\\%"\s*\)/.test(PAGE_SRC),
  "Sanitizer must escape `%` to `\\%`. Without this, a literal % in " +
    "the search input acts as a SQL wildcard, breaking 'find the " +
    "string with a percent sign in it' searches.",
);

assert(
  /\.replaceAll\(\s*"_"\s*,\s*"\\\\_"\s*\)/.test(PAGE_SRC),
  "Sanitizer must escape `_` to `\\_`. Without this, a literal _ in " +
    "the search input acts as a single-character wildcard.",
);

assert(
  /\$\{schema\.aiOutputs\.contentMd\}\s+LIKE\s+\$\{[^}]+\}\s+ESCAPE\s+'\\\\\\\\'/.test(
    PAGE_SRC,
  ),
  "LIKE clause must use `${schema.aiOutputs.contentMd} LIKE ${...} " +
    "ESCAPE '\\\\'`. The ESCAPE clause names backslash so the % and _ " +
    "the sanitizer escaped are honored as literals. Without ESCAPE, " +
    "MySQL's default escape character is `\\` only on some servers — " +
    "make it explicit.",
);

// Negative check — wildcards must be in the OUTER literal, not the
// inner binding. Catch the regression where someone "simplifies" by
// inlining `%${keyword}%` directly into the sql template literal
// (which would interpolate the value into the SQL string instead of
// binding it).
assert(
  !/LIKE\s+['"]%\$\{keywordFilter\}%['"]/.test(PAGE_SRC),
  "Found `LIKE '%${keywordFilter}%'` with wildcards inside a quoted " +
    "string — this string-interpolates the user's input. Pass the " +
    "wrapped pattern via Drizzle's sql template binding (no quotes) " +
    "as `LIKE ${\"%\" + keywordFilter + \"%\"}`.",
);

assert(
  /function\s+KeywordSearchForm\s*\(/.test(PAGE_SRC),
  "KeywordSearchForm helper not found. Without the form, the keyword " +
    "filter is reachable only via direct URL editing.",
);

assert(
  /method=["']get["']/.test(PAGE_SRC),
  "Search form must be method='get' (case-insensitive). GET makes " +
    "the resulting URL shareable + back-button-safe; POST would " +
    "force re-submission warnings on every navigation.",
);

assert(
  /\{kind\s*\?\s*<input\s+type="hidden"\s+name="kind"\s+value=\{kind\}\s*\/>\s*:\s*null\}[\s\S]*?\{source\s*\?\s*<input\s+type="hidden"\s+name="source"\s+value=\{source\}\s*\/>\s*:\s*null\}/.test(
    PAGE_SRC,
  ),
  "KeywordSearchForm must include hidden inputs for kind + source so " +
    "submitting the form preserves them. Without this, searching " +
    "from a `?kind=summary` page navigates to `?q=foo` (dropping " +
    "kind) — annoying axis-clobber.",
);

// ---------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
}

console.log(`ai-history-page: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
