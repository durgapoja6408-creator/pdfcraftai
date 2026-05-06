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
import { and, eq, isNotNull, isNull, sql, desc } from "drizzle-orm";

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
