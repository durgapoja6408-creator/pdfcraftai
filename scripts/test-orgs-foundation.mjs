#!/usr/bin/env node
/**
 * 2026-05-05 — Multi-seat / organizations foundation guard
 * (PENDING §3b).
 *
 * Mirrors test-referrals-foundation.mjs: pin migration 0025 DDL,
 * Drizzle schema parity, helper public surface, admin viewer
 * read-only invariant.
 *
 * Pure static parse, sub-second.
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

const MIGRATION = path.join(ROOT, "db/migrations/0025_organizations.sql");
const SCHEMA = path.join(ROOT, "db/schema/app.ts");
const CODES = path.join(ROOT, "lib/orgs/codes.ts");
const QUERIES = path.join(ROOT, "lib/orgs/queries.ts");
const ADMIN_PAGE = path.join(ROOT, "app/admin/orgs/page.tsx");

// ---------------------------------------------------------------------------
// Section A: migration 0025 shape
// ---------------------------------------------------------------------------

assert(
  fs.existsSync(MIGRATION),
  "A1: db/migrations/0025_organizations.sql exists",
);
const migrationSrc = fs.readFileSync(MIGRATION, "utf8");

function stripSqlComments(src) {
  return src
    .replace(/^\s*--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}
const migrationExec = stripSqlComments(migrationSrc);

// Three tables created
for (const tbl of [
  "organizations",
  "organization_members",
  "organization_invites",
]) {
  assert(
    new RegExp(`CREATE TABLE\\s+\`${tbl}\``).test(migrationExec),
    `A2.${tbl}: migration creates ${tbl} table`,
  );
}

// Slug unique on organizations
assert(
  /UNIQUE\s*\(\s*`slug`\s*\)/.test(migrationExec),
  "A3: organizations.slug is UNIQUE (URL component must be globally unique)",
);

// Member uniqueness — one membership per (org, user) pair
assert(
  /UNIQUE\s*\(\s*`organization_id`\s*,\s*`user_id`\s*\)/.test(migrationExec),
  "A4: organization_members has UNIQUE(organization_id, user_id)",
);

// Token unique on invites — lookup key for /invite/<token>
assert(
  /UNIQUE\s*\(\s*`token`\s*\)/.test(migrationExec),
  "A5: organization_invites.token is UNIQUE (lookup key for /invite/<token>)",
);

// Required columns on organizations
for (const col of [
  "name",
  "slug",
  "owner_user_id",
  "billing_mode",
  "created_at",
  "updated_at",
]) {
  assert(
    new RegExp(`\`${col}\``).test(migrationExec),
    `A6.${col}: organizations has \`${col}\` column`,
  );
}

// Required columns on organization_members
for (const col of ["organization_id", "user_id", "role", "joined_at"]) {
  assert(
    new RegExp(`\`${col}\``).test(migrationExec),
    `A7.${col}: organization_members has \`${col}\``,
  );
}

// Required columns on organization_invites
for (const col of [
  "organization_id",
  "email",
  "token",
  "invited_by_user_id",
  "role",
  "expires_at",
  "accepted_at",
]) {
  assert(
    new RegExp(`\`${col}\``).test(migrationExec),
    `A8.${col}: organization_invites has \`${col}\``,
  );
}

// Defensive: no DROP / MODIFY / CHANGE in executable SQL.
for (const verb of ["DROP TABLE", "DROP COLUMN", "MODIFY", "CHANGE"]) {
  assert(
    !new RegExp(`\\b${verb}\\b`).test(migrationExec),
    `A9.${verb.replace(/\s/g, "_")}: migration is additive-only`,
  );
}

// ---------------------------------------------------------------------------
// Section B: Drizzle schema parity
// ---------------------------------------------------------------------------

assert(fs.existsSync(SCHEMA), "B1: db/schema/app.ts exists");
const schemaSrc = fs.readFileSync(SCHEMA, "utf8");

assert(
  /export\s+const\s+organizations\s*=\s*mysqlTable\(\s*"organizations"/.test(
    schemaSrc,
  ),
  "B2: organizations is exported from app.ts",
);
assert(
  /export\s+const\s+organizationMembers\s*=\s*mysqlTable\(\s*"organization_members"/.test(
    schemaSrc,
  ),
  "B3: organizationMembers is exported",
);
assert(
  /export\s+const\s+organizationInvites\s*=\s*mysqlTable\(\s*"organization_invites"/.test(
    schemaSrc,
  ),
  "B4: organizationInvites is exported",
);

function extractBlock(src, exportName) {
  const start = src.indexOf(`export const ${exportName}`);
  if (start === -1) return null;
  const after = src.slice(start);
  const nextExport = after.indexOf("\nexport const ", 1);
  return nextExport === -1 ? after : after.slice(0, nextExport);
}

// organizations block
const orgsBlock = extractBlock(schemaSrc, "organizations");
assert(orgsBlock !== null, "B5: extracted organizations block");
if (orgsBlock) {
  for (const f of [
    "name",
    "slug",
    "ownerUserId",
    "billingMode",
    "createdAt",
    "updatedAt",
  ]) {
    assert(
      new RegExp(`${f}:`).test(orgsBlock),
      `B6.${f}: organizations has ${f} field`,
    );
  }
  assert(
    /uniqueIndex\("organizations_slug_unique"\)/.test(orgsBlock),
    "B7: organizations has slug unique index",
  );
  // billingMode default 'central'
  assert(
    /billingMode:[\s\S]*?\.default\(\s*"central"\s*\)/.test(orgsBlock),
    "B8: organizations.billingMode defaults to 'central'",
  );
}

// organizationMembers block
const membersBlock = extractBlock(schemaSrc, "organizationMembers");
assert(membersBlock !== null, "B9: extracted organizationMembers block");
if (membersBlock) {
  for (const f of ["organizationId", "userId", "role", "joinedAt"]) {
    assert(
      new RegExp(`${f}:`).test(membersBlock),
      `B10.${f}: organizationMembers has ${f}`,
    );
  }
  assert(
    /uniqueIndex\(\s*\n?\s*"organization_members_org_user_unique"/.test(
      membersBlock,
    ),
    "B11: organizationMembers has (org, user) unique index",
  );
  // Default role 'member'
  assert(
    /role:[\s\S]*?\.default\(\s*"member"\s*\)/.test(membersBlock),
    "B12: organizationMembers.role defaults to 'member'",
  );
}

// organizationInvites block
const invitesBlock = extractBlock(schemaSrc, "organizationInvites");
assert(invitesBlock !== null, "B13: extracted organizationInvites block");
if (invitesBlock) {
  for (const f of [
    "organizationId",
    "email",
    "token",
    "invitedByUserId",
    "role",
    "expiresAt",
    "acceptedAt",
  ]) {
    assert(
      new RegExp(`${f}:`).test(invitesBlock),
      `B14.${f}: organizationInvites has ${f}`,
    );
  }
  assert(
    /uniqueIndex\("organization_invites_token_unique"\)/.test(invitesBlock),
    "B15: organizationInvites has token unique index",
  );
}

// ---------------------------------------------------------------------------
// Section C: codes.ts public surface
// ---------------------------------------------------------------------------

assert(fs.existsSync(CODES), "C1: lib/orgs/codes.ts exists");
const codesSrc = fs.readFileSync(CODES, "utf8");

assert(
  /export\s+function\s+slugify\b/.test(codesSrc),
  "C2: slugify is exported",
);
assert(
  /export\s+function\s+generateInviteToken\b/.test(codesSrc),
  "C3: generateInviteToken is exported",
);
assert(
  /export\s+const\s+ORG_SLUG_MAX_LENGTH\s*=\s*64/.test(codesSrc),
  "C4: ORG_SLUG_MAX_LENGTH = 64 (matches schema varchar(64))",
);
assert(
  /export\s+const\s+ORG_INVITE_TOKEN_LENGTH\s*=\s*32/.test(codesSrc),
  "C5: ORG_INVITE_TOKEN_LENGTH = 32 (security choice — 36^32 namespace)",
);

// ---------------------------------------------------------------------------
// Section D: queries.ts public surface (read-only)
// ---------------------------------------------------------------------------

assert(fs.existsSync(QUERIES), "D1: lib/orgs/queries.ts exists");
const queriesSrc = fs.readFileSync(QUERIES, "utf8");

assert(
  /export\s+(?:async\s+)?function\s+isMultiSeatEnabled\b/.test(queriesSrc),
  "D2: isMultiSeatEnabled is exported (flag-check helper)",
);
assert(
  /FEATURE_FLAGS\.MULTI_SEAT/.test(queriesSrc),
  "D3: isMultiSeatEnabled checks FEATURE_FLAGS.MULTI_SEAT (the registered flag from §4d)",
);
assert(
  /export\s+(?:async\s+)?function\s+loadOrgsForUser\b/.test(queriesSrc),
  "D4: loadOrgsForUser is exported (M:N join through organizationMembers)",
);
assert(
  /export\s+(?:async\s+)?function\s+loadOrgMembers\b/.test(queriesSrc),
  "D5: loadOrgMembers is exported",
);
assert(
  /export\s+(?:async\s+)?function\s+loadOrgInvites\b/.test(queriesSrc),
  "D6: loadOrgInvites is exported",
);
assert(
  /export\s+(?:async\s+)?function\s+lookupInvite\b/.test(queriesSrc),
  "D7: lookupInvite is exported (used by future /invite/<token> route)",
);
assert(
  /export\s+(?:async\s+)?function\s+loadAdminOrgStats\b/.test(queriesSrc),
  "D8: loadAdminOrgStats is exported (drives /admin/orgs aggregates)",
);

// Read-only invariant: no db.insert/update/delete on org tables.
for (const verb of [
  "db\\.insert\\(\\s*schema\\.organizations",
  "db\\.update\\(\\s*schema\\.organizations",
  "db\\.delete\\(\\s*schema\\.organizations",
  "db\\.insert\\(\\s*schema\\.organizationMembers",
  "db\\.update\\(\\s*schema\\.organizationMembers",
  "db\\.insert\\(\\s*schema\\.organizationInvites",
  "db\\.update\\(\\s*schema\\.organizationInvites",
]) {
  assert(
    !new RegExp(verb).test(queriesSrc),
    `D9.${verb}: queries.ts is read-only (no ${verb.replace(/\\\\/g, "")})`,
  );
}

// Expired-invite filter in lookupInvite — without this, a stale
// invite link could be accepted past its TTL.
assert(
  /r\.expiresAt\s*<\s*new\s+Date\(\)/.test(queriesSrc),
  "D10: lookupInvite returns null for expired invites (expiresAt < now)",
);

// ---------------------------------------------------------------------------
// Section E: admin viewer is a Next.js Page (read-only, no foreign exports)
// ---------------------------------------------------------------------------

assert(fs.existsSync(ADMIN_PAGE), "E1: app/admin/orgs/page.tsx exists");
const pageSrc = fs.readFileSync(ADMIN_PAGE, "utf8");

assert(
  /export\s+default\s+async\s+function\s+AdminOrgsPage/.test(pageSrc),
  "E2: AdminOrgsPage is the default export",
);
assert(
  /export\s+const\s+dynamic\s*=\s*"force-dynamic"/.test(pageSrc),
  "E3: dynamic = force-dynamic",
);
assert(
  /export\s+const\s+runtime\s*=\s*"nodejs"/.test(pageSrc),
  "E4: runtime = nodejs",
);
assert(
  /requireAdmin\(\)/.test(pageSrc),
  "E5: page calls requireAdmin() before rendering",
);
assert(
  !/(form\s+action|action="\/api|method="post"|method="POST")/.test(pageSrc),
  "E6: page has no form/POST surface (read-only invariant)",
);
assert(
  /isMultiSeatEnabled\(\)/.test(pageSrc),
  "E7: page surfaces MULTI_SEAT flag state to operators",
);

// ---------------------------------------------------------------------------
// Section F: dynamic execution — slugify produces valid output
// ---------------------------------------------------------------------------

const slugifyMatch = codesSrc.match(
  /export function slugify\(name:\s*string\):\s*string\s*\{([\s\S]*?)\n\}/,
);
assert(slugifyMatch !== null, "F1: extracted slugify body for dynamic eval");
if (slugifyMatch) {
  const body = slugifyMatch[1].replace(
    /SLUG_CHAR_RE/g,
    "/[^a-z0-9-]/g",
  );
  let slugify;
  try {
    slugify = new Function(
      "name",
      `${body}\nreturn "" + name.toLowerCase().replace(/\\s+/g,"-").replace(/[^a-z0-9-]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,64);`,
    );
  } catch (err) {
    failed++;
    failures.push(
      `F2: failed to build slugify test fn: ${err instanceof Error ? err.message : err}`,
    );
  }
  if (slugify) {
    // Pin some normalization invariants.
    assert(
      slugify("Acme Corp") === "acme-corp",
      `F3: 'Acme Corp' → 'acme-corp' (got '${slugify("Acme Corp")}')`,
    );
    assert(
      slugify("  Foo  Bar  ") === "foo-bar",
      `F4: leading/trailing whitespace normalized (got '${slugify("  Foo  Bar  ")}')`,
    );
    assert(
      slugify("foo--bar") === "foo-bar",
      `F5: hyphen runs collapsed (got '${slugify("foo--bar")}')`,
    );
    assert(
      slugify("---") === "",
      `F6: only-hyphens produces empty (got '${slugify("---")}')`,
    );
    const long = slugify("a".repeat(100));
    assert(
      long.length <= 64,
      `F7: output is truncated to 64 chars (got ${long.length})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(`orgs-foundation: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
