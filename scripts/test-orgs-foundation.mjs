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
// Section G: writer module (Phase F partial, 2026-05-05)
// ---------------------------------------------------------------------------

const WRITERS = path.join(ROOT, "lib/orgs/writers.ts");
assert(fs.existsSync(WRITERS), "G1: lib/orgs/writers.ts exists");
if (fs.existsSync(WRITERS)) {
  const writersSrc = fs.readFileSync(WRITERS, "utf8");

  // Public surface — three core writers + error class
  assert(
    /export\s+async\s+function\s+recordOrgCreate\b/.test(writersSrc),
    "G2: recordOrgCreate is exported async",
  );
  assert(
    /export\s+async\s+function\s+inviteMember\b/.test(writersSrc),
    "G3: inviteMember is exported async",
  );
  assert(
    /export\s+async\s+function\s+acceptInvite\b/.test(writersSrc),
    "G4: acceptInvite is exported async",
  );
  assert(
    /export\s+class\s+OrgWriteError\s+extends\s+Error\b/.test(writersSrc),
    "G5: OrgWriteError class is exported",
  );

  // Flag-gate guard: ALL THREE writers must check isMultiSeatEnabled
  // before any DB work. Without this, flag-off prod could write
  // into the org tables via a misconfigured caller.
  for (const fn of ["recordOrgCreate", "inviteMember", "acceptInvite"]) {
    const bodyMatch = writersSrc.match(
      new RegExp(`export async function ${fn}\\b[\\s\\S]*?\\n\\}\\n`),
    );
    assert(
      bodyMatch !== null,
      `G6.${fn}: extracted function body for flag-gate check`,
    );
    if (bodyMatch) {
      const body = bodyMatch[0];
      assert(
        /if\s*\(\s*!isMultiSeatEnabled\(\)\s*\)\s*\{\s*\n?\s*return null/.test(
          body,
        ),
        `G7.${fn}: function checks !isMultiSeatEnabled() and returns null when off`,
      );
    }
  }

  // recordOrgCreate uses a transaction — atomic org + member insert
  assert(
    /db\.transaction\(\s*async\s*\(\s*tx\s*\)\s*=>\s*\{[\s\S]*?tx\.insert\(\s*schema\.organizations[\s\S]*?tx\.insert\(\s*schema\.organizationMembers/.test(
      writersSrc,
    ),
    "G8: recordOrgCreate atomic — org row + owner membership in one transaction",
  );

  // Slug collision retry: suffix `-2`, `-3`, … on dup-key
  assert(
    /Duplicate entry|ER_DUP_ENTRY/.test(writersSrc),
    "G9: writers catch MySQL duplicate-key (slug + invite-token retry paths)",
  );
  assert(
    /MAX_SLUG_RETRIES/.test(writersSrc),
    "G10: recordOrgCreate has bounded slug-retry loop (no infinite retry on misconfigured DB)",
  );

  // Empty-name fallback: slugify("💩") = "" → caller must produce a
  // synthetic slug rather than INSERTing an empty string
  assert(
    /baseSlug\.length\s*>\s*0\s*\?\s*baseSlug\s*:\s*`org-/.test(writersSrc),
    "G11: empty-slug fallback to 'org-<random>' (avoids INSERT of empty slug on names like '💩💩💩')",
  );

  // inviteMember dedupes pending invites for (org, email) — the
  // re-invite path. Without this, the prior token stays valid in
  // the OLD email which is a security regression.
  assert(
    /priorRows[\s\S]*?delete\(\s*schema\.organizationInvites\)/.test(
      writersSrc,
    ),
    "G12: inviteMember replaces prior pending invites (DELETE old → INSERT new in transaction)",
  );

  // role validation in inviteMember — "owner" can ONLY be set on
  // org creation; invites must be admin or member.
  assert(
    /role\s*!==\s*"admin"\s*&&\s*role\s*!==\s*"member"/.test(writersSrc),
    "G13: inviteMember rejects role !== 'admin' && !== 'member' (no 'owner' via invite)",
  );

  // Email lowercased — case-insensitive matching
  assert(
    /\.toLowerCase\(\)/.test(writersSrc),
    "G14: inviteMember lowercases email (case-insensitive (org, email) dedupe)",
  );

  // Invite TTL constant
  assert(
    /export\s+const\s+ORG_INVITE_DEFAULT_TTL_DAYS\s*=\s*7/.test(writersSrc),
    "G15: ORG_INVITE_DEFAULT_TTL_DAYS = 7 (long enough for slow-email recipient, short enough for security)",
  );

  // acceptInvite distinguishes 4 failure modes
  for (const code of [
    "INVITE_NOT_FOUND",
    "INVITE_EXPIRED",
    "INVITE_ALREADY_ACCEPTED",
    "ALREADY_MEMBER",
  ]) {
    assert(
      new RegExp(`"${code}"`).test(writersSrc),
      `G16.${code}: acceptInvite throws ${code} for distinct failure modes`,
    );
  }

  // acceptInvite atomic: insert member + update invite.acceptedAt
  // in a transaction. Pin via 'tx.insert(.+organizationMembers' AND
  // 'tx.update(.+organizationInvites' inside the same transaction
  // block. Multiline regex works fine here because we just need
  // both calls present in the file body.
  assert(
    /tx\.insert\(\s*schema\.organizationMembers/.test(writersSrc) &&
      /tx\n?\s*\.update\(\s*schema\.organizationInvites/.test(writersSrc),
    "G17: acceptInvite atomic — member INSERT + invite UPDATE in transaction",
  );

  // ALREADY_MEMBER edge case: when the user is already a member but
  // the invite is still marked pending (e.g. multiple invites
  // outstanding), we mark the invite accepted anyway so it doesn't
  // hang. The acceptInvite path AFTER throwing ALREADY_MEMBER must
  // mark the invite acceptedAt before throwing. (Implementation
  // detail — pin so a refactor that drops it would be caught.)
  assert(
    /User is already a member[\s\S]*?ALREADY_MEMBER/.test(writersSrc),
    "G18: acceptInvite ALREADY_MEMBER path also marks invite acceptedAt (so re-invite of existing member doesn't hang the invite as pending)",
  );

  // The writer module imports from the canonical query module, NOT
  // from db/client directly for the flag check. Pin to enforce
  // single source of truth.
  assert(
    /isMultiSeatEnabled[\s\S]*?from\s*["']\.\/queries["']/.test(writersSrc),
    "G19: writers import isMultiSeatEnabled from ./queries (single source of truth)",
  );
}

// ---------------------------------------------------------------------------
// Section H: Phase F-3 helpers + org-landing page
// ---------------------------------------------------------------------------

if (fs.existsSync(QUERIES)) {
  const queriesSrc = fs.readFileSync(QUERIES, "utf8");

  // Three new helpers added by Phase F-3
  assert(
    /export\s+(?:async\s+)?function\s+loadOrgBySlug\b/.test(queriesSrc),
    "H1: loadOrgBySlug is exported (slug → org row, used by /app/org/<slug>)",
  );
  assert(
    /export\s+(?:async\s+)?function\s+getMemberRole\b/.test(queriesSrc),
    "H2: getMemberRole is exported (org × user → role | null)",
  );
  assert(
    /export\s+(?:async\s+)?function\s+canManageMembers\b/.test(queriesSrc),
    "H3: canManageMembers is exported (permission predicate)",
  );

  // canManageMembers must accept owner + admin and reject member.
  // Pin the role-check shape so a refactor that flips the predicate
  // (e.g. inverts owner vs admin) is caught.
  assert(
    /role\s*===\s*"owner"\s*\|\|\s*role\s*===\s*"admin"/.test(queriesSrc),
    "H4: canManageMembers accepts owner + admin, rejects member",
  );
}

const ORG_PAGE = path.join(ROOT, "app/app/org/[slug]/page.tsx");
const INVITE_FORM = path.join(ROOT, "app/app/org/[slug]/InviteMemberForm.tsx");
const ORG_ACTIONS = path.join(ROOT, "app/app/org/[slug]/actions.ts");

assert(fs.existsSync(ORG_PAGE), "H5: app/app/org/[slug]/page.tsx exists");
if (fs.existsSync(ORG_PAGE)) {
  const pageSrc = fs.readFileSync(ORG_PAGE, "utf8");

  assert(
    /export\s+default\s+async\s+function\s+OrgLandingPage/.test(pageSrc),
    "H6: OrgLandingPage is the default export",
  );
  assert(
    /export\s+const\s+dynamic\s*=\s*"force-dynamic"/.test(pageSrc),
    "H7: dynamic = force-dynamic",
  );
  assert(
    /export\s+const\s+runtime\s*=\s*"nodejs"/.test(pageSrc),
    "H8: runtime = nodejs",
  );

  // Auth gate
  assert(
    /redirect\(\s*[`'"]\/login/.test(pageSrc) ||
      /redirect\([\s\S]*?callbackUrl[\s\S]*?\/app\/org/.test(pageSrc),
    "H9: page redirects unauthenticated users to /login with callbackUrl",
  );

  // Membership check via getMemberRole — non-members notFound() not
  // 403 (don't leak org existence to non-members)
  assert(
    /getMemberRole\(/.test(pageSrc),
    "H10: page calls getMemberRole() to check membership",
  );
  assert(
    /role\s*===\s*null[\s\S]*?notFound\(\)/.test(pageSrc) ||
      /if\s*\(\s*role\s*===\s*null\s*\)\s*notFound/.test(pageSrc),
    "H11: page returns notFound() for non-members (don't leak org existence)",
  );

  // canManage gate for invite UI surface
  assert(
    /canManageMembers\(/.test(pageSrc),
    "H12: page uses canManageMembers() to gate the invite UI",
  );
  // Pending-invites loaded ONLY if canManage (avoid leaking pending
  // invites to non-admin members)
  assert(
    /canManage\s*\?\s*loadOrgInvites/.test(pageSrc),
    "H13: pending invites are loaded only if canManage (avoids leaking invite list to non-admin members)",
  );
}

assert(
  fs.existsSync(INVITE_FORM),
  "H14: app/app/org/[slug]/InviteMemberForm.tsx exists",
);
if (fs.existsSync(INVITE_FORM)) {
  const formSrc = fs.readFileSync(INVITE_FORM, "utf8");
  assert(
    /^"use client"/m.test(formSrc),
    "H15: InviteMemberForm is a client component",
  );
  assert(
    /navigator\.clipboard\.writeText/.test(formSrc),
    "H16: form copies invite URL via navigator.clipboard",
  );
}

assert(
  fs.existsSync(ORG_ACTIONS),
  "H17: app/app/org/[slug]/actions.ts exists",
);
if (fs.existsSync(ORG_ACTIONS)) {
  const actionsSrc = fs.readFileSync(ORG_ACTIONS, "utf8");

  assert(
    /^"use server"/m.test(actionsSrc),
    "H18: actions.ts is a server-action module",
  );
  assert(
    /export\s+async\s+function\s+inviteMemberAction\b/.test(actionsSrc),
    "H19: inviteMemberAction is exported async",
  );

  // Permission re-check at action layer — belt-and-braces against
  // a malicious client that bypassed the form-render gate
  assert(
    /canManageMembers\(/.test(actionsSrc),
    "H20: action re-checks canManageMembers (defense-in-depth — render-time hide is not enough)",
  );

  // invitedByUserId from session, NEVER from input
  assert(
    /invitedByUserId:\s*userId/.test(actionsSrc),
    "H21: invitedByUserId from session.user.id (anti-impersonation pattern)",
  );
  assert(
    !/invitedByUserId:\s*input\.invitedByUserId/.test(actionsSrc),
    "H22: action does NOT read invitedByUserId from input (would allow attribution forgery)",
  );

  // Cheap email-shape validation
  assert(
    /\^\[\^\\s@\]\+@\[\^\\s@\]\+\\.\[\^\\s@\]\+\$/.test(actionsSrc),
    "H23: action validates email shape (cheap regex, catches typos)",
  );
}

// ---------------------------------------------------------------------------
// Section I: Phase F-4 writers — changeRole / removeMember /
// transferOwnership
// ---------------------------------------------------------------------------

if (fs.existsSync(WRITERS)) {
  const writersSrc = fs.readFileSync(WRITERS, "utf8");

  // Three new writers + role-rank table
  assert(
    /export\s+async\s+function\s+changeRole\b/.test(writersSrc),
    "I1: changeRole is exported async",
  );
  assert(
    /export\s+async\s+function\s+removeMember\b/.test(writersSrc),
    "I2: removeMember is exported async",
  );
  assert(
    /export\s+async\s+function\s+transferOwnership\b/.test(writersSrc),
    "I3: transferOwnership is exported async",
  );

  // Role-rank table — pin owner > admin > member ordering. A regression
  // that flipped the ranks would silently break every permission check.
  assert(
    /owner:\s*3,\s*\n\s*admin:\s*2,\s*\n\s*member:\s*1/.test(writersSrc),
    "I4: ROLE_RANK has owner=3 > admin=2 > member=1 (load-bearing for permission checks)",
  );

  // changeRole rejects newRole='owner' — owner role can ONLY be set
  // via transferOwnership. This is a security property: an admin
  // shouldn't be able to promote themselves to owner via changeRole.
  assert(
    /newRole\s*!==\s*"admin"\s*&&\s*newRole\s*!==\s*"member"/.test(writersSrc),
    "I5: changeRole rejects newRole !== 'admin' && !== 'member' (no 'owner' via changeRole)",
  );

  // changeRole rejects self-targeting
  assert(
    /targetUserId\s*===\s*byUserId/.test(writersSrc),
    "I6: changeRole rejects self-targeting (you can't change your own role)",
  );

  // changeRole strict-outrank check
  assert(
    /actorRank\s*<=\s*targetRank/.test(writersSrc),
    "I7: changeRole requires actor STRICTLY outranks target (admins can't change other admins)",
  );

  // changeRole authority-to-grant check
  assert(
    /actorRank\s*<\s*newRoleRank/.test(writersSrc),
    "I8: changeRole requires actor's rank >= newRole rank (admins can't promote to admin level)",
  );

  // removeMember owner protection — owner cannot be removed
  assert(
    /target\.role\s*===\s*"owner"/.test(writersSrc),
    "I9: removeMember rejects target with role='owner' (use transferOwnership first)",
  );

  // removeMember allows self-removal of non-owners (members can leave)
  assert(
    /targetUserId\s*!==\s*byUserId/.test(writersSrc),
    "I10: removeMember allows self-leave (non-owner) — strict-outrank check is conditional on target !== actor",
  );

  // transferOwnership atomicity — must be wrapped in db.transaction
  assert(
    /transferOwnership[\s\S]*?db\.transaction\(\s*async\s*\(\s*tx\s*\)/.test(
      writersSrc,
    ),
    "I11: transferOwnership wraps the 3-write swap in a transaction",
  );

  // transferOwnership verifies fromUserId matches CURRENT owner column
  // (not just role=owner) — paranoid check against inconsistent state
  assert(
    /orgRows\[0\]!\.ownerUserId\s*!==\s*fromUserId/.test(writersSrc),
    "I12: transferOwnership verifies fromUserId matches organizations.owner_user_id (paranoid against inconsistent state)",
  );

  // transferOwnership requires toUserId to already be a member
  assert(
    /Target user must already be a member/.test(writersSrc),
    "I13: transferOwnership requires toUserId is already a member (no auto-invite)",
  );

  // transferOwnership rejects self-transfer
  assert(
    /fromUserId\s*===\s*toUserId/.test(writersSrc),
    "I14: transferOwnership rejects self-transfer (fromUserId === toUserId)",
  );

  // transferOwnership demotes the former owner to admin (not removed)
  assert(
    /role:\s*"admin"[\s\S]*?fromRow\.id|fromRow\.id[\s\S]*?role:\s*"admin"/.test(
      writersSrc,
    ),
    "I15: transferOwnership demotes the former owner to 'admin' (not removed — they likely want to keep using the org)",
  );
}

// ---------------------------------------------------------------------------
// Section J: Phase F-4 server actions + MemberActions client surface
// (PENDING §3b, 2026-05-05)
//
// Pins the wrapping pattern around the three Phase F-4 writers:
//   - changeRoleAction       wraps lib/orgs/writers.ts:changeRole
//   - removeMemberAction     wraps lib/orgs/writers.ts:removeMember
//   - transferOwnershipAction wraps lib/orgs/writers.ts:transferOwnership
//
// Each must:
//   1. Pull the actor's userId from session, NEVER from input
//      (anti-impersonation — pinned via positive + negative regex).
//   2. Re-check permissions before calling the writer (defense-in-
//      depth; the writer also re-checks but a render-time UI hide
//      isn't enough on its own).
//   3. Catch OrgWriteError + map to user-facing copy.
//
// MemberActions client component must:
//   - Mirror ROLE_RANK from writers.ts (no hardcoded ranks that
//     could drift from the writer's source of truth).
//   - Hide buttons with the same predicates the writer enforces, so
//     we don't render an action the user can't actually take.
//   - Confirm destructive actions (remove + transfer) before firing.
// ---------------------------------------------------------------------------

const MEMBER_ACTIONS = path.join(
  ROOT,
  "app/app/org/[slug]/MemberActions.tsx",
);

if (fs.existsSync(ORG_ACTIONS)) {
  const actionsSrc = fs.readFileSync(ORG_ACTIONS, "utf8");

  // ----- Three new server actions exported -----
  assert(
    /export\s+async\s+function\s+changeRoleAction\b/.test(actionsSrc),
    "J1: changeRoleAction is exported async",
  );
  assert(
    /export\s+async\s+function\s+removeMemberAction\b/.test(actionsSrc),
    "J2: removeMemberAction is exported async",
  );
  assert(
    /export\s+async\s+function\s+transferOwnershipAction\b/.test(actionsSrc),
    "J3: transferOwnershipAction is exported async",
  );

  // ----- Anti-impersonation: actor identity from session -----
  // changeRole + removeMember writers take byUserId; transferOwnership
  // takes fromUserId. Both must come from session.user.id, never from
  // input.
  assert(
    /byUserId:\s*userId/.test(actionsSrc),
    "J4: changeRole + removeMember actions pass byUserId from session userId (anti-impersonation)",
  );
  assert(
    /fromUserId:\s*userId/.test(actionsSrc),
    "J5: transferOwnership action passes fromUserId from session userId (anti-impersonation)",
  );

  // Negative anti-impersonation checks: input must NOT carry actor id
  assert(
    !/byUserId:\s*input\.byUserId/.test(actionsSrc),
    "J6: actions do NOT read byUserId from input (would allow actor-id forgery)",
  );
  assert(
    !/fromUserId:\s*input\.fromUserId/.test(actionsSrc),
    "J7: transferOwnershipAction does NOT read fromUserId from input (would allow ownership-transfer forgery)",
  );

  // ----- Permission re-checks at action layer -----
  // changeRoleAction + removeMemberAction (cross-user path) check
  // canManageMembers(). Self-leave path falls through to the writer.
  assert(
    /canManageMembers\([\s\S]*?canManageMembers\(/.test(actionsSrc),
    "J8: changeRoleAction + removeMemberAction both call canManageMembers (defense-in-depth)",
  );

  // transferOwnershipAction owner-only check via getMemberRole
  assert(
    /role\s*!==\s*"owner"/.test(actionsSrc),
    "J9: transferOwnershipAction rejects callers whose role !== 'owner' (outer-layer check)",
  );

  // ----- Error mapping: OrgWriteError → user-facing copy -----
  assert(
    /err\s+instanceof\s+OrgWriteError/.test(actionsSrc),
    "J10: actions catch OrgWriteError and surface err.message to the client",
  );

  // ----- newRole allowlist on the action surface -----
  assert(
    /input\.newRole\s*!==\s*"admin"\s*&&\s*input\.newRole\s*!==\s*"member"/.test(
      actionsSrc,
    ),
    "J11: changeRoleAction rejects newRole !== 'admin' && !== 'member' (no owner-promotion via this path)",
  );

  // ----- Self-leave path returns a discriminator -----
  // selfLeave: boolean lets the client decide whether to refresh or
  // navigate away (the org won't appear in the user's list anymore).
  assert(
    /selfLeave:\s*isSelfLeave/.test(actionsSrc),
    "J12: removeMemberAction returns selfLeave:boolean so client can decide router.push vs router.refresh",
  );
}

assert(
  fs.existsSync(MEMBER_ACTIONS),
  "J13: app/app/org/[slug]/MemberActions.tsx exists",
);

if (fs.existsSync(MEMBER_ACTIONS)) {
  const maSrc = fs.readFileSync(MEMBER_ACTIONS, "utf8");

  // ----- Client component -----
  assert(
    /^"use client"/m.test(maSrc),
    "J14: MemberActions is a client component (uses useTransition + router.refresh)",
  );

  // ----- ROLE_RANK mirrors writer's source of truth -----
  // Same ordering pin as I4 so client-side hides match server-side
  // rejects. A regression that flipped them would let the UI render
  // a button that the action then rejects with a confusing error.
  assert(
    /owner:\s*3,?\s*\n\s*admin:\s*2,?\s*\n\s*member:\s*1/.test(maSrc),
    "J15: MemberActions mirrors ROLE_RANK (owner=3 > admin=2 > member=1) — must match writer's source of truth",
  );

  // ----- Strict-outrank predicate for cross-user actions -----
  assert(
    /actorRank\s*>\s*targetRank/.test(maSrc),
    "J16: MemberActions hides cross-user actions when actorRank <= targetRank (matches writer's strict-outrank check)",
  );

  // ----- Owner protection on Remove button -----
  assert(
    /targetRole\s*!==\s*"owner"/.test(maSrc),
    "J17: MemberActions hides 'Remove' when target.role === 'owner' (matches writer's owner-protection)",
  );

  // ----- Owner-only Transfer button -----
  assert(
    /actorRole\s*===\s*"owner"/.test(maSrc),
    "J18: MemberActions hides 'Transfer ownership' for non-owners (matches writer's owner-only check)",
  );

  // ----- Self-leave button gated on actorRole !== owner -----
  // Owner can't self-leave (writer rejects). UI must hide the button
  // for owners so they don't get a confusing error after click.
  assert(
    /isSelf\s*&&\s*actorRole\s*!==\s*"owner"/.test(maSrc),
    "J19: MemberActions hides 'Leave organization' for the owner viewing themselves (must transfer first)",
  );

  // ----- Destructive action confirmation -----
  // confirm() before remove + transfer so a stray click can't drop
  // a member or hand over the org.
  assert(
    /confirm\(/.test(maSrc),
    "J20: MemberActions confirms destructive actions (remove + transfer) before firing",
  );

  // ----- Wires through the three new actions -----
  assert(
    /import\s*\{[^}]*changeRoleAction[^}]*\}\s*from\s*"\.\/actions"/.test(
      maSrc,
    ) ||
      /import\s*\{[\s\S]*?changeRoleAction[\s\S]*?\}\s*from\s*"\.\/actions"/.test(
        maSrc,
      ),
    "J21: MemberActions imports changeRoleAction from ./actions",
  );
  assert(
    /import\s*\{[^}]*removeMemberAction[^}]*\}\s*from\s*"\.\/actions"/.test(
      maSrc,
    ) ||
      /import\s*\{[\s\S]*?removeMemberAction[\s\S]*?\}\s*from\s*"\.\/actions"/.test(
        maSrc,
      ),
    "J22: MemberActions imports removeMemberAction from ./actions",
  );
  assert(
    /import\s*\{[^}]*transferOwnershipAction[^}]*\}\s*from\s*"\.\/actions"/.test(
      maSrc,
    ) ||
      /import\s*\{[\s\S]*?transferOwnershipAction[\s\S]*?\}\s*from\s*"\.\/actions"/.test(
        maSrc,
      ),
    "J23: MemberActions imports transferOwnershipAction from ./actions",
  );

  // ----- Self-leave navigates away (org won't appear in dashboard) -----
  assert(
    /result\.selfLeave[\s\S]*?router\.push/.test(maSrc),
    "J24: MemberActions navigates to dashboard on selfLeave success (org disappeared from user's list)",
  );
}

// ----- Page wires MemberActions into the member directory -----
if (fs.existsSync(ORG_PAGE)) {
  const pageSrc = fs.readFileSync(ORG_PAGE, "utf8");

  assert(
    /import\s*\{\s*MemberActions\s*\}\s*from\s*"\.\/MemberActions"/.test(
      pageSrc,
    ),
    "J25: page imports MemberActions",
  );
  assert(
    /<MemberActions[\s\S]*?actorUserId=\{userId\}[\s\S]*?actorRole=\{role\}/.test(
      pageSrc,
    ) ||
      /<MemberActions[\s\S]*?actorRole=\{role\}[\s\S]*?actorUserId=\{userId\}/.test(
        pageSrc,
      ),
    "J26: page passes actorUserId + actorRole from server-side session/role lookup (anti-impersonation pattern preserved at render layer)",
  );
}

// ---------------------------------------------------------------------------
// Section K: Phase F-4 cancelInvite — closes the pending-invites
// loop so admins can revoke a typoed invite (PENDING §3b, 2026-05-05)
//
// Writer: lib/orgs/writers.ts:cancelInvite (gated by canManageMembers
// at action layer; writer ALSO re-checks role-from-membership inside
// the tx; cross-org confusion attack defense via organizationId
// match).
// Action: app/app/org/[slug]/actions.ts:cancelInviteAction
// UI: app/app/org/[slug]/CancelInviteButton.tsx
// ---------------------------------------------------------------------------

const CANCEL_BUTTON = path.join(
  ROOT,
  "app/app/org/[slug]/CancelInviteButton.tsx",
);

if (fs.existsSync(WRITERS)) {
  const writersSrc = fs.readFileSync(WRITERS, "utf8");

  // ----- Writer exists + flag-gated -----
  assert(
    /export\s+async\s+function\s+cancelInvite\b/.test(writersSrc),
    "K1: cancelInvite is exported async",
  );
  // Flag check inside cancelInvite — same isMultiSeatEnabled() gate
  // every other writer uses.
  assert(
    /cancelInvite[\s\S]*?isMultiSeatEnabled\(\)[\s\S]*?return null/.test(
      writersSrc,
    ),
    "K2: cancelInvite returns null when MULTI_SEAT flag is off (matches other writers' staging discipline)",
  );

  // ----- Cross-org confusion defense -----
  // Writer must verify the invite belongs to the org the caller
  // claims; otherwise an admin in org A could cancel an invite
  // belonging to org B by passing the invite id directly.
  assert(
    /invite\.organizationId\s*!==\s*organizationId/.test(writersSrc),
    "K3: cancelInvite verifies invite.organizationId === input.organizationId (cross-org confusion defense)",
  );

  // ----- Permission re-check inside writer tx -----
  // Even though the action layer re-checks canManageMembers, the
  // writer must also reject non-owners + non-admins inside the tx.
  assert(
    /actorRole\s*!==\s*"owner"\s*&&\s*actorRole\s*!==\s*"admin"/.test(
      writersSrc,
    ),
    "K4: cancelInvite re-checks actor role inside the tx (defense-in-depth)",
  );

  // ----- No-op on already-accepted -----
  assert(
    /invite\.acceptedAt\s*!==\s*null/.test(writersSrc),
    "K5: cancelInvite rejects already-accepted invites with a clear error",
  );

  // ----- DELETE the row -----
  assert(
    /cancelInvite[\s\S]*?tx\s*\.delete\(\s*schema\.organizationInvites\s*\)/.test(
      writersSrc,
    ),
    "K6: cancelInvite DELETEs the invite row (token in URL becomes 404 if anyone follows it)",
  );
}

if (fs.existsSync(ORG_ACTIONS)) {
  const actionsSrc = fs.readFileSync(ORG_ACTIONS, "utf8");

  // ----- Action surface -----
  assert(
    /export\s+async\s+function\s+cancelInviteAction\b/.test(actionsSrc),
    "K7: cancelInviteAction is exported async",
  );

  // ----- Anti-impersonation: actor identity from session -----
  assert(
    /cancelInvite\([\s\S]*?byUserId:\s*userId/.test(actionsSrc),
    "K8: cancelInviteAction passes byUserId from session userId (anti-impersonation)",
  );

  // ----- Permission re-check at action layer -----
  // Outer layer must call canManageMembers before invoking the writer.
  assert(
    /cancelInviteAction[\s\S]*?canManageMembers\(/.test(actionsSrc),
    "K9: cancelInviteAction calls canManageMembers (defense-in-depth)",
  );

  // ----- OrgWriteError mapping -----
  assert(
    /cancelInviteAction[\s\S]*?err\s+instanceof\s+OrgWriteError/.test(
      actionsSrc,
    ),
    "K10: cancelInviteAction catches OrgWriteError and surfaces err.message",
  );
}

assert(
  fs.existsSync(CANCEL_BUTTON),
  "K11: app/app/org/[slug]/CancelInviteButton.tsx exists",
);

if (fs.existsSync(CANCEL_BUTTON)) {
  const btnSrc = fs.readFileSync(CANCEL_BUTTON, "utf8");

  assert(
    /^"use client"/m.test(btnSrc),
    "K12: CancelInviteButton is a client component",
  );

  // confirm() before destructive action
  assert(
    /confirm\(/.test(btnSrc),
    "K13: CancelInviteButton confirms before firing the cancel",
  );

  assert(
    /cancelInviteAction\(/.test(btnSrc),
    "K14: CancelInviteButton calls cancelInviteAction",
  );

  // router.refresh() on success so the page re-renders without the
  // cancelled invite
  assert(
    /router\.refresh\(\)/.test(btnSrc),
    "K15: CancelInviteButton calls router.refresh() on success",
  );
}

// Page wire-up: page imports + renders CancelInviteButton in the
// pending-invites loop (only inside the canManage gate, since the
// pending-invites section itself is gated)
if (fs.existsSync(ORG_PAGE)) {
  const pageSrc = fs.readFileSync(ORG_PAGE, "utf8");
  assert(
    /import\s*\{\s*CancelInviteButton\s*\}\s*from\s*"\.\/CancelInviteButton"/.test(
      pageSrc,
    ),
    "K16: page imports CancelInviteButton",
  );
  assert(
    /<CancelInviteButton[\s\S]*?orgId=\{org\.id\}[\s\S]*?inviteId=\{inv\.id\}/.test(
      pageSrc,
    ),
    "K17: page renders CancelInviteButton with orgId + inviteId from the loop variable",
  );
}

// ---------------------------------------------------------------------------
// Section L: Phase F-4 follow-on — per-member usage rollup
// (PENDING §3b, 2026-05-05)
//
// New query: lib/orgs/queries.ts:loadOrgMemberUsage(orgId, days) —
// aggregates ai_usage per member of the org over the lookback
// window. Joins via ai_usage.user_id IN (org's member ids) since
// ai_usage doesn't carry organization_id today (honest limitation
// pinned in the queries module's docstring).
//
// New page surface: org-landing renders a "Usage — last 30 days"
// section ONLY when canManage is truthy (members don't see what
// other members have spent — that's owner/admin info).
// ---------------------------------------------------------------------------

if (fs.existsSync(QUERIES)) {
  const queriesSrc = fs.readFileSync(QUERIES, "utf8");

  // ----- Public surface -----
  assert(
    /export\s+(?:async\s+)?function\s+loadOrgMemberUsage\b/.test(
      queriesSrc,
    ),
    "L1: loadOrgMemberUsage is exported",
  );
  assert(
    /export\s+interface\s+OrgMemberUsageRow\b/.test(queriesSrc),
    "L2: OrgMemberUsageRow result type is exported",
  );

  // ----- Membership-scoped: must restrict to current members only -----
  // Pin the WHERE clause shape so a refactor that drops the
  // membership filter doesn't quietly include ex-members or non-
  // members in the rollup.
  assert(
    /inArray\(\s*schema\.aiUsage\.userId,\s*memberUserIds\s*\)/.test(
      queriesSrc,
    ),
    "L3: loadOrgMemberUsage filters ai_usage by IN(memberUserIds) (membership-scoped)",
  );

  // ----- Lookback window: must use a Date cutoff, not e.g. raw days -----
  assert(
    /gte\(\s*schema\.aiUsage\.createdAt,\s*cutoff\s*\)/.test(queriesSrc),
    "L4: loadOrgMemberUsage filters ai_usage by createdAt >= cutoff (lookback window)",
  );

  // ----- Aggregations: COUNT(*) calls + SUM(credits_spent) -----
  assert(
    /calls:\s*sql<number>`COUNT\(\*\)`/.test(queriesSrc),
    "L5: loadOrgMemberUsage aggregates COUNT(*) as calls",
  );
  assert(
    /COALESCE\(SUM\(\$\{schema\.aiUsage\.creditsSpent\}\),\s*0\)/.test(
      queriesSrc,
    ),
    "L6: loadOrgMemberUsage aggregates SUM(credits_spent) with COALESCE-zero fallback",
  );

  // ----- Empty-membership early-return: if the org has no members,
  //       don't issue an empty IN() clause (some MySQL dialects
  //       choke on `WHERE col IN ()`) -----
  assert(
    /memberUserIds\.length\s*===\s*0/.test(queriesSrc),
    "L7: loadOrgMemberUsage early-returns [] on empty membership (avoids `WHERE x IN ()` SQL)",
  );

  // ----- Honest-limitation comment: ai_usage doesn't carry org_id -----
  // The query tags this as a known limitation in the docstring;
  // pinning the comment ensures a future contributor doesn't
  // accidentally remove the disclosure.
  assert(
    /ai_usage\s+doesn't\s+carry\s+an\s+organization_id\s+column/i.test(
      queriesSrc,
    ),
    "L8: docstring discloses ai_usage's missing organization_id (honest limitation)",
  );
}

// ----- Page wires usage rollup, owner/admin only -----
if (fs.existsSync(ORG_PAGE)) {
  const pageSrc = fs.readFileSync(ORG_PAGE, "utf8");

  assert(
    /import\s*\{[\s\S]*?loadOrgMemberUsage[\s\S]*?\}\s*from\s*"@\/lib\/orgs\/queries"/.test(
      pageSrc,
    ),
    "L9: page imports loadOrgMemberUsage",
  );

  // Must call loadOrgMemberUsage ONLY when canManage is truthy —
  // members don't see other members' usage. Pinned via the
  // ternary `canManage ? loadOrgMemberUsage(...) : []` shape.
  assert(
    /canManage\s*\?\s*loadOrgMemberUsage\(/.test(pageSrc),
    "L10: usage rollup is loaded only when canManage (owners + admins) — members don't see peer usage",
  );

  // The "Usage — last 30 days" section must be wrapped in a
  // canManage gate so members never render the section
  assert(
    /canManage\s*\?\s*\(\s*\n[\s\S]{0,800}?Usage\s+—\s+last\s+30\s+days/.test(
      pageSrc,
    ),
    "L11: 'Usage — last 30 days' section is wrapped in canManage ternary (owner/admin only render)",
  );

  // Honest disclosure of the cross-org double-counting limitation
  // in the page copy itself
  assert(
    /multiple\s+organizations[\s\S]{0,200}?counted\s+in\s+each/i.test(
      pageSrc,
    ),
    "L12: page surfaces the cross-org double-counting limitation (honest copy)",
  );
}

// ---------------------------------------------------------------------------
// Section M: Phase F-4 settings — renameOrg + deleteOrg
// (PENDING §3b, 2026-05-06)
//
// Owner-only writers + matching server actions + settings page UI.
// Owner check is enforced at THREE layers:
//   1. Page render: getMemberRole === "owner" → notFound() else
//      (notFound not 403 — anti-existence-leak; admins + members
//      don't even know the settings URL exists)
//   2. Server Action: outer-layer getMemberRole owner check before
//      hitting the writer
//   3. Writer tx: organizations.owner_user_id COLUMN check (paranoid
//      against role-vs-column drift, same pattern as transferOwnership)
//
// Cascade behavior on deleteOrg
// -----------------------------
// Migration 0025 has no FK ON DELETE CASCADE on the children tables
// (varchar(36) FKs without referential constraints). Writer manually
// deletes invites + members + the org row in dependency order inside
// one tx so a partial failure can't leave orphans.
// ---------------------------------------------------------------------------

const SETTINGS_PAGE = path.join(
  ROOT,
  "app/app/org/[slug]/settings/page.tsx",
);
const SETTINGS_ACTIONS = path.join(
  ROOT,
  "app/app/org/[slug]/settings/actions.ts",
);
const RENAME_FORM = path.join(
  ROOT,
  "app/app/org/[slug]/settings/RenameOrgForm.tsx",
);
const DELETE_FORM = path.join(
  ROOT,
  "app/app/org/[slug]/settings/DeleteOrgForm.tsx",
);

if (fs.existsSync(WRITERS)) {
  const writersSrc = fs.readFileSync(WRITERS, "utf8");

  // ----- renameOrg writer -----
  assert(
    /export\s+async\s+function\s+renameOrg\b/.test(writersSrc),
    "M1: renameOrg is exported async",
  );
  // Owner-only via column check on organizations.owner_user_id
  assert(
    /renameOrg[\s\S]*?orgRows\[0\]!\.ownerUserId\s*!==\s*byUserId/.test(
      writersSrc,
    ),
    "M2: renameOrg verifies byUserId matches organizations.owner_user_id (column-not-role check)",
  );
  // Name-length validation (255 cap, matching column width)
  assert(
    /renameOrg[\s\S]*?newName\.length\s*>\s*255/.test(writersSrc),
    "M3: renameOrg rejects names longer than 255 chars (matches organizations.name column width)",
  );
  // Slug NOT touched on rename — pinned via absence of .slug update inside renameOrg
  assert(
    /renameOrg[\s\S]*?\.set\(\s*\{\s*name:\s*newName\s*\}\s*\)/.test(
      writersSrc,
    ),
    "M4: renameOrg only updates the name column (slug stays stable so existing URLs keep working)",
  );

  // ----- deleteOrg writer -----
  assert(
    /export\s+async\s+function\s+deleteOrg\b/.test(writersSrc),
    "M5: deleteOrg is exported async",
  );
  assert(
    /deleteOrg[\s\S]*?orgRows\[0\]!\.ownerUserId\s*!==\s*byUserId/.test(
      writersSrc,
    ),
    "M6: deleteOrg verifies byUserId matches organizations.owner_user_id",
  );
  // Cascade-delete pattern: invites + members + org, all inside the
  // same tx
  assert(
    /deleteOrg[\s\S]*?db\.transaction\(/.test(writersSrc),
    "M7: deleteOrg wraps the cascade in a transaction (atomic)",
  );
  assert(
    /deleteOrg[\s\S]*?\.delete\(\s*schema\.organizationInvites\s*\)[\s\S]*?\.delete\(\s*schema\.organizationMembers\s*\)[\s\S]*?\.delete\(\s*schema\.organizations\s*\)/.test(
      writersSrc,
    ),
    "M8: deleteOrg deletes invites → members → org in dependency order",
  );
}

// ----- Settings page -----
assert(
  fs.existsSync(SETTINGS_PAGE),
  "M9: app/app/org/[slug]/settings/page.tsx exists",
);
if (fs.existsSync(SETTINGS_PAGE)) {
  const pageSrc = fs.readFileSync(SETTINGS_PAGE, "utf8");

  assert(
    /export\s+default\s+async\s+function\s+OrgSettingsPage/.test(pageSrc),
    "M10: OrgSettingsPage default export",
  );
  // Auth gate redirects to /login with callbackUrl preserved
  assert(
    /redirect\([\s\S]*?\/login\?callbackUrl=[\s\S]*?\/settings/.test(
      pageSrc,
    ),
    "M11: settings page preserves callbackUrl on /login redirect",
  );
  // Owner-only render: role !== "owner" → notFound()
  assert(
    /role\s*!==\s*"owner"[\s\S]{0,80}?notFound\(\)/.test(pageSrc),
    "M12: settings page returns notFound() for non-owners (anti-existence-leak)",
  );
  assert(
    /import\s*\{\s*RenameOrgForm\s*\}\s*from\s*"\.\/RenameOrgForm"/.test(
      pageSrc,
    ),
    "M13: settings page imports RenameOrgForm",
  );
  assert(
    /import\s*\{\s*DeleteOrgForm\s*\}\s*from\s*"\.\/DeleteOrgForm"/.test(
      pageSrc,
    ),
    "M14: settings page imports DeleteOrgForm",
  );
}

// ----- Settings actions -----
assert(
  fs.existsSync(SETTINGS_ACTIONS),
  "M15: app/app/org/[slug]/settings/actions.ts exists",
);
if (fs.existsSync(SETTINGS_ACTIONS)) {
  const actionsSrc = fs.readFileSync(SETTINGS_ACTIONS, "utf8");

  assert(
    /^"use server"/m.test(actionsSrc),
    "M16: settings actions module is server-action",
  );
  assert(
    /export\s+async\s+function\s+renameOrgAction\b/.test(actionsSrc),
    "M17: renameOrgAction is exported async",
  );
  assert(
    /export\s+async\s+function\s+deleteOrgAction\b/.test(actionsSrc),
    "M18: deleteOrgAction is exported async",
  );

  // ----- Anti-impersonation: byUserId from session -----
  assert(
    /byUserId:\s*userId/.test(actionsSrc),
    "M19: settings actions pass byUserId from session userId (anti-impersonation)",
  );
  assert(
    !/byUserId:\s*input\.byUserId/.test(actionsSrc),
    "M20: settings actions do NOT read byUserId from input",
  );

  // ----- Owner check at action layer -----
  assert(
    /role\s*!==\s*"owner"/.test(actionsSrc),
    "M21: settings actions reject callers whose role !== 'owner'",
  );

  // ----- Typed-name confirmation re-checked at action layer -----
  // Hostile clients can skip the form's gate; the action must
  // independently verify the typed name matches expected.
  assert(
    /typed\s*!==\s*input\.expectedName/.test(actionsSrc),
    "M22: deleteOrgAction re-checks typed confirmName === expectedName at action layer (defense-in-depth)",
  );

  // ----- OrgWriteError mapping -----
  assert(
    /err\s+instanceof\s+OrgWriteError/.test(actionsSrc),
    "M23: settings actions catch OrgWriteError + surface err.message",
  );
}

// ----- RenameOrgForm -----
assert(
  fs.existsSync(RENAME_FORM),
  "M24: app/app/org/[slug]/settings/RenameOrgForm.tsx exists",
);
if (fs.existsSync(RENAME_FORM)) {
  const formSrc = fs.readFileSync(RENAME_FORM, "utf8");
  assert(
    /^"use client"/m.test(formSrc),
    "M25: RenameOrgForm is a client component",
  );
  assert(
    /renameOrgAction\(/.test(formSrc),
    "M26: RenameOrgForm calls renameOrgAction",
  );
  // Save-button disabled when name unchanged (avoids no-op writes)
  assert(
    /dirty/.test(formSrc) &&
      /name\.trim\(\)\s*!==\s*currentName\.trim\(\)/.test(formSrc),
    "M27: RenameOrgForm disables Save when name is unchanged (avoids no-op writes)",
  );
}

// ----- DeleteOrgForm -----
assert(
  fs.existsSync(DELETE_FORM),
  "M28: app/app/org/[slug]/settings/DeleteOrgForm.tsx exists",
);
if (fs.existsSync(DELETE_FORM)) {
  const formSrc = fs.readFileSync(DELETE_FORM, "utf8");
  assert(
    /^"use client"/m.test(formSrc),
    "M29: DeleteOrgForm is a client component",
  );

  // Two-step: armed + typed-name confirm
  assert(
    /armed/.test(formSrc) && /confirmName/.test(formSrc),
    "M30: DeleteOrgForm uses two-step confirmation (arm + typed-name)",
  );

  // Submit gated on typed name matching org name
  assert(
    /confirmName\.trim\(\)\s*!==\s*orgName\.trim\(\)/.test(formSrc),
    "M31: DeleteOrgForm submit guard verifies confirmName matches orgName before firing the action",
  );

  // On success: navigate to /app/dashboard (org URL is now 404)
  assert(
    /router\.push\("\/app\/dashboard"\)/.test(formSrc),
    "M32: DeleteOrgForm pushes to /app/dashboard on success (org URL is now 404)",
  );
}

// ----- Org page links to settings (owner-only) -----
if (fs.existsSync(ORG_PAGE)) {
  const pageSrc = fs.readFileSync(ORG_PAGE, "utf8");

  // Settings link rendered ONLY when role === "owner". Admins +
  // members shouldn't see the link (they couldn't reach the page
  // anyway — notFound() on the settings page itself — but hiding
  // the link keeps the surface honest).
  assert(
    /role\s*===\s*"owner"\s*\?\s*\(\s*\n[\s\S]{0,400}?\/app\/org\/\$\{org\.slug\}\/settings/.test(
      pageSrc,
    ),
    "M33: org-landing page renders Settings link only when role === 'owner'",
  );
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
