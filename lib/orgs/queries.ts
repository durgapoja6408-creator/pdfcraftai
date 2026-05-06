// lib/orgs/queries.ts — read-side helpers for the multi-seat
// foundation (PENDING §3b, 2026-05-05).
//
// Mirrors the lib/referrals/queries.ts shape: read-only queries +
// a flag-check helper. Writers live in a separate module (Phase F);
// this file is safe to import from server components without
// pulling in any write paths.
//
// All queries are flag-aware in the SENSE that the admin viewer
// renders empty tables when MULTI_SEAT is off (no orgs exist
// because the create-org flow is gated). The queries themselves
// don't gate — they just return empty results because no rows
// exist.

import { db, schema } from "@/db/client";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";

import { isFeatureEnabled, FEATURE_FLAGS } from "@/lib/flags";

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  billingMode: string;
  createdAt: Date;
}

export interface OrganizationMemberRow {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  joinedAt: Date;
}

/**
 * Member row joined onto the users table — used by the org-landing
 * page so owners + admins managing the team see actual emails +
 * names instead of opaque user-id fragments. Both `email` (from
 * the users table) and `name` are nullable: `email` should always
 * be present for active accounts but we type it as `string | null`
 * to match the schema; `name` is nullable in the schema (NextAuth
 * users created via OAuth-without-name skip the column).
 */
export interface OrganizationMemberWithUserRow {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  joinedAt: Date;
  email: string | null;
  name: string | null;
}

export interface OrganizationInviteRow {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  invitedByUserId: string;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
}

export interface OrgAdminStats {
  totalOrgs: number;
  totalMemberships: number;
  pendingInvitesCount: number;
  acceptedInvitesCount: number;
  /** Top 10 orgs by member count, descending. */
  topOrgs: Array<{
    organizationId: string;
    name: string;
    slug: string;
    memberCount: number;
  }>;
}

/**
 * Convenience: is the multi-seat program currently active per env
 * flag? Phase F flips MULTI_SEAT=on to allow create-org from the
 * UI; until then the foundation exists but no orgs are created.
 *
 * Note: this is a global check — multi-seat is currently an
 * all-or-nothing rollout. Phase F could split into "create-org
 * enabled" (visible) vs "billing wired" (charges go through) but
 * there's no need today.
 */
export function isMultiSeatEnabled(userId?: string | null): boolean {
  return isFeatureEnabled(FEATURE_FLAGS.MULTI_SEAT, { userId });
}

/**
 * List the organizations a user belongs to. Used by the (future
 * Phase F) /app dashboard org switcher. Empty array if user
 * doesn't belong to any orgs (the common case today, since the
 * create-org flow is flag-gated).
 *
 * Joins through organizationMembers because user → org is M:N. We
 * include the role from the membership row so callers don't need a
 * second query to know "am I an owner / admin / member here".
 */
export async function loadOrgsForUser(userId: string): Promise<
  Array<{ org: OrganizationRow; role: string }>
> {
  const rows = await db
    .select({
      orgId: schema.organizations.id,
      name: schema.organizations.name,
      slug: schema.organizations.slug,
      ownerUserId: schema.organizations.ownerUserId,
      billingMode: schema.organizations.billingMode,
      createdAt: schema.organizations.createdAt,
      role: schema.organizationMembers.role,
    })
    .from(schema.organizationMembers)
    .innerJoin(
      schema.organizations,
      eq(schema.organizations.id, schema.organizationMembers.organizationId),
    )
    .where(eq(schema.organizationMembers.userId, userId));
  return rows.map((r) => ({
    org: {
      id: r.orgId,
      name: r.name,
      slug: r.slug,
      ownerUserId: r.ownerUserId,
      billingMode: r.billingMode,
      createdAt: r.createdAt,
    },
    role: r.role,
  }));
}

/**
 * List members of an organization. Permission check (caller must
 * be a member of the org) is the caller's responsibility — this
 * function returns the rows unconditionally.
 */
export async function loadOrgMembers(
  organizationId: string,
): Promise<OrganizationMemberRow[]> {
  const rows = await db
    .select()
    .from(schema.organizationMembers)
    .where(eq(schema.organizationMembers.organizationId, organizationId))
    .orderBy(desc(schema.organizationMembers.joinedAt));
  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    userId: r.userId,
    role: r.role,
    joinedAt: r.joinedAt,
  }));
}

/**
 * List members joined with the users table for human-readable display
 * in management UIs (Phase F-4 polish, 2026-05-06). Use this when
 * the page wants email + name instead of just user-id fragments.
 *
 * leftJoin on users keeps members visible even if the user row was
 * somehow soft-deleted (foreign key cascade-delete should prevent
 * this in practice, but a defensive leftJoin keeps the table-render
 * honest if the invariant ever breaks). When the users row is
 * missing, email + name come back as null.
 *
 * Same permission semantics as loadOrgMembers — the caller is
 * responsible for the membership / canManage check before invoking.
 */
export async function loadOrgMembersWithUsers(
  organizationId: string,
): Promise<OrganizationMemberWithUserRow[]> {
  const rows = await db
    .select({
      id: schema.organizationMembers.id,
      organizationId: schema.organizationMembers.organizationId,
      userId: schema.organizationMembers.userId,
      role: schema.organizationMembers.role,
      joinedAt: schema.organizationMembers.joinedAt,
      email: schema.users.email,
      name: schema.users.name,
    })
    .from(schema.organizationMembers)
    .leftJoin(
      schema.users,
      eq(schema.users.id, schema.organizationMembers.userId),
    )
    .where(eq(schema.organizationMembers.organizationId, organizationId))
    .orderBy(desc(schema.organizationMembers.joinedAt));
  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    userId: r.userId,
    role: r.role,
    joinedAt: r.joinedAt,
    email: r.email ?? null,
    name: r.name ?? null,
  }));
}

/**
 * List pending invites for an organization (acceptedAt IS NULL).
 * Pass `includeAccepted=true` to get the full history including
 * accepted invites — used by /admin for audit trail.
 */
export async function loadOrgInvites(
  organizationId: string,
  options: { includeAccepted?: boolean } = {},
): Promise<OrganizationInviteRow[]> {
  const includeAccepted = options.includeAccepted ?? false;
  const where = includeAccepted
    ? eq(schema.organizationInvites.organizationId, organizationId)
    : and(
        eq(schema.organizationInvites.organizationId, organizationId),
        isNull(schema.organizationInvites.acceptedAt),
      );
  const rows = await db
    .select()
    .from(schema.organizationInvites)
    .where(where)
    .orderBy(desc(schema.organizationInvites.createdAt));
  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organizationId,
    email: r.email,
    role: r.role,
    invitedByUserId: r.invitedByUserId,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    acceptedAt: r.acceptedAt ?? null,
  }));
}

/**
 * Look up an organization by its URL slug. Returns null on miss.
 * Used by /app/org/<slug> page to resolve the URL param to the
 * underlying org row. Caller is responsible for the membership /
 * permission check after this.
 */
export async function loadOrgBySlug(
  slug: string,
): Promise<OrganizationRow | null> {
  if (typeof slug !== "string" || slug.length === 0) return null;
  const rows = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, slug))
    .limit(1);
  if (rows.length === 0) return null;
  const r = rows[0]!;
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    ownerUserId: r.ownerUserId,
    billingMode: r.billingMode,
    createdAt: r.createdAt,
  };
}

/**
 * Look up the role a user has in a given org. Returns null if the
 * user is not a member of the org. Used for permission checks at
 * page-render time (which UI to show) and at server-action time
 * (whether to allow the write).
 *
 * Pinned by CI: any caller doing a permission check MUST use this
 * helper rather than re-querying organizationMembers inline (single
 * source of truth on what "membership" means).
 */
export async function getMemberRole(
  organizationId: string,
  userId: string,
): Promise<string | null> {
  if (
    typeof organizationId !== "string" ||
    organizationId.length === 0 ||
    typeof userId !== "string" ||
    userId.length === 0
  ) {
    return null;
  }
  const rows = await db
    .select({ role: schema.organizationMembers.role })
    .from(schema.organizationMembers)
    .where(
      and(
        eq(schema.organizationMembers.organizationId, organizationId),
        eq(schema.organizationMembers.userId, userId),
      ),
    )
    .limit(1);
  if (rows.length === 0) return null;
  return rows[0]!.role;
}

/**
 * Permission predicate: can this user invite + remove members in
 * this org? Owner + admin can; member can't.
 *
 * Owner is the only role that can: transfer ownership, change
 * billing mode, delete the org. Admin can: invite + remove
 * members, change member roles below their own. Member can:
 * use tools, see org-shared resources.
 */
export async function canManageMembers(
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const role = await getMemberRole(organizationId, userId);
  return role === "owner" || role === "admin";
}

/**
 * Look up an invite by its token. Returns null if not found OR if
 * the invite has expired. Used by the (future Phase F)
 * /invite/<token> route to validate the token before showing the
 * accept-invite UI.
 */
export async function lookupInvite(
  token: string,
): Promise<OrganizationInviteRow | null> {
  if (typeof token !== "string" || token.length === 0) return null;
  const rows = await db
    .select()
    .from(schema.organizationInvites)
    .where(eq(schema.organizationInvites.token, token))
    .limit(1);
  if (rows.length === 0) return null;
  const r = rows[0]!;
  // Expired invite — return null. Caller surfaces "invite expired"
  // UI rather than letting the user accept a stale invite.
  if (r.expiresAt < new Date()) return null;
  return {
    id: r.id,
    organizationId: r.organizationId,
    email: r.email,
    role: r.role,
    invitedByUserId: r.invitedByUserId,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    acceptedAt: r.acceptedAt ?? null,
  };
}

/**
 * Per-member usage rollup for an organization (Phase F-4 follow-on,
 * 2026-05-05). Aggregates ai_usage rows for every member of the org
 * within the lookback window, returning calls + credits spent per
 * member. Used by /app/org/[slug] to show owners + admins where
 * the org's credit budget is being consumed.
 *
 * The query is membership-scoped: only members currently in the org
 * are included (sub-query on organizationMembers). Users who joined
 * mid-window get only the calls they made WHILE they were still
 * members of the org (well, almost — see caveat below).
 *
 * Caveat: ai_usage doesn't carry an organization_id column today, so
 * we can't tell whether a user was in this specific org at the time
 * of the call vs in some other org. For a user in only ONE org this
 * is fine. For a user in multiple orgs, the same calls would be
 * attributed to BOTH orgs. That's the cost of org-less ai_usage. A
 * later migration adding ai_usage.organization_id (denormalized at
 * write time) would fix this; today it's an honest limitation.
 *
 * Permission check is the caller's responsibility — typically gated
 * to canManageMembers().
 */
export interface OrgMemberUsageRow {
  userId: string;
  calls: number;
  creditsSpent: number;
}

export async function loadOrgMemberUsage(
  organizationId: string,
  days: number = 30,
): Promise<OrgMemberUsageRow[]> {
  if (typeof organizationId !== "string" || organizationId.length === 0) {
    return [];
  }
  const lookbackDays = Math.max(1, Math.floor(days));
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  // 1. Get the member user-id list for this org. Cheap (small table,
  //    indexed on organization_id).
  const memberRows = await db
    .select({ userId: schema.organizationMembers.userId })
    .from(schema.organizationMembers)
    .where(
      eq(schema.organizationMembers.organizationId, organizationId),
    );
  const memberUserIds = memberRows.map((r) => r.userId);
  if (memberUserIds.length === 0) return [];

  // 2. Aggregate ai_usage in one round-trip with WHERE user_id IN (…)
  //    AND created_at >= cutoff. Drizzle's `inArray` handles the
  //    IN clause; the index on (user_id, created_at) covers the
  //    range filter so this stays fast as ai_usage grows.
  const usageRows = await db
    .select({
      userId: schema.aiUsage.userId,
      calls: sql<number>`COUNT(*)`,
      creditsSpent: sql<number>`COALESCE(SUM(${schema.aiUsage.creditsSpent}), 0)`,
    })
    .from(schema.aiUsage)
    .where(
      and(
        inArray(schema.aiUsage.userId, memberUserIds),
        gte(schema.aiUsage.createdAt, cutoff),
      ),
    )
    .groupBy(schema.aiUsage.userId);

  // 3. Project into the public shape with int-safe casts. Members
  //    who made zero calls in the window are NOT in the result
  //    (caller can left-join against loadOrgMembers if it needs
  //    "every member, even zero-usage ones").
  return usageRows.map((r) => ({
    userId: r.userId,
    calls: Number(r.calls),
    creditsSpent: Number(r.creditsSpent),
  }));
}

/**
 * Aggregate stats for /admin/orgs dashboard. Single function pulls
 * everything the page needs in 5 round-trips so we don't N+1 the
 * page render. Counts are int-safe (cast via Number()).
 */
export async function loadAdminOrgStats(): Promise<OrgAdminStats> {
  const [orgsRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.organizations);

  const [membersRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.organizationMembers);

  const [pendingRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.organizationInvites)
    .where(isNull(schema.organizationInvites.acceptedAt));

  const [acceptedRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.organizationInvites)
    .where(isNotNull(schema.organizationInvites.acceptedAt));

  const topOrgs = await db
    .select({
      organizationId: schema.organizations.id,
      name: schema.organizations.name,
      slug: schema.organizations.slug,
      memberCount: sql<number>`COUNT(${schema.organizationMembers.id})`,
    })
    .from(schema.organizations)
    .leftJoin(
      schema.organizationMembers,
      eq(schema.organizationMembers.organizationId, schema.organizations.id),
    )
    .groupBy(
      schema.organizations.id,
      schema.organizations.name,
      schema.organizations.slug,
    )
    .orderBy(sql`COUNT(${schema.organizationMembers.id}) DESC`)
    .limit(10);

  return {
    totalOrgs: Number(orgsRow?.count ?? 0),
    totalMemberships: Number(membersRow?.count ?? 0),
    pendingInvitesCount: Number(pendingRow?.count ?? 0),
    acceptedInvitesCount: Number(acceptedRow?.count ?? 0),
    topOrgs: topOrgs.map((t) => ({
      organizationId: t.organizationId,
      name: t.name,
      slug: t.slug,
      memberCount: Number(t.memberCount),
    })),
  };
}
