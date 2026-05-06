// lib/orgs/writers.ts — write-side helpers for the multi-seat
// foundation (PENDING §3b Phase F partial, 2026-05-05).
//
// Companion to lib/orgs/queries.ts (read-side) and lib/orgs/codes.ts
// (slugify + invite token). Sits beside the foundation shipped earlier
// this session (commit 2bef9e0).
//
// Three core writers
// ------------------
// 1. recordOrgCreate({ownerUserId, name, billingMode?})
//    Creates a new organization. Atomically inserts the org row +
//    the owner's organization_members row (role="owner") in a
//    transaction. Slug generated via slugify() with collision-retry.
//    All flag-gated — calls are no-op'd silently when MULTI_SEAT
//    is off.
//
// 2. inviteMember({organizationId, email, role, invitedByUserId,
//                  ttlDays?})
//    Generates an invite token + INSERTs into organization_invites.
//    If a pending invite already exists for (orgId, email), the
//    prior token is replaced (DELETE + re-INSERT in transaction)
//    rather than creating a duplicate row. Caller (the future
//    UI) is responsible for dispatching the email.
//
// 3. acceptInvite({token, userId})
//    Validates the token (lives + not expired + not already
//    accepted), INSERTs into organization_members with the role
//    from the invite, marks the invite acceptedAt. Atomic.
//
// What this module does NOT do (deferred Phase F-2)
// -------------------------------------------------
// - changeRole / transferOwnership writers. These have permission
//   semantics (only owner can transfer; only admin+ can change
//   member roles) that depend on UI input. Skipping them in this
//   foundation; the create + invite + accept loop is enough to
//   bootstrap a team.
// - Email dispatch on invite. Caller wires the SendGrid/Postmark
//   send after this writer succeeds. Depends on §11 transactional
//   email wiring.
// - Permission enforcement on tool routes (org members can only
//   see their org's resources). That's a routing-layer concern
//   that touches every API route — separate batch.
// - Billing wire-up: the billingMode column is reserved
//   ("central" | "per_seat" | "credit_pool") but nothing reads it
//   yet. credit_ledger plumbing comes with billing-mode
//   enforcement in a separate commit.

import { randomUUID } from "node:crypto";

import { db, schema } from "@/db/client";
import { and, eq, isNull } from "drizzle-orm";

import { isMultiSeatEnabled } from "./queries";
import {
  ORG_SLUG_MAX_LENGTH,
  generateInviteToken,
  slugify,
} from "./codes";

export class OrgWriteError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "DISABLED"
      | "EMPTY_REQUIRED"
      | "SLUG_GENERATION_FAILED"
      | "INVITE_NOT_FOUND"
      | "INVITE_EXPIRED"
      | "INVITE_ALREADY_ACCEPTED"
      | "ALREADY_MEMBER"
      | "DB_ERROR",
  ) {
    super(message);
    this.name = "OrgWriteError";
  }
}

// ---------------------------------------------------------------------------
// recordOrgCreate
// ---------------------------------------------------------------------------

export interface RecordOrgCreateInput {
  ownerUserId: string;
  name: string;
  /** Reserved for Phase F billing wire-up. Defaults to "central". */
  billingMode?: "central" | "per_seat" | "credit_pool";
}

export interface RecordOrgCreateResult {
  organizationId: string;
  slug: string;
}

/**
 * Default invite TTL — 7 days. Long enough for someone on a slow
 * email cadence to accept; short enough that a leaked token from
 * an old email isn't useful forever.
 */
export const ORG_INVITE_DEFAULT_TTL_DAYS = 7;

/**
 * Maximum slug-collision retries before throwing. At 31^7 namespace
 * the collision probability for `slugify(name)` to clash with a
 * real org is high only when many orgs share the same name root
 * ("Acme", "Acme Corp", "Acme Inc") — we suffix `-2`, `-3`, … on
 * collision. 16 retries means we'd suffix up to `-16` before
 * giving up; in practice ops would rename the org well before that.
 */
const MAX_SLUG_RETRIES = 16;

/**
 * Create a new organization. Atomic: inserts the org + the owner's
 * membership in a single transaction. If either fails, the whole
 * operation rolls back.
 *
 * Returns null when MULTI_SEAT is off, so callers can
 * unconditionally invoke this without branching:
 *
 *   const result = await recordOrgCreate({...});
 *   if (result) { ... }
 */
export async function recordOrgCreate(
  input: RecordOrgCreateInput,
): Promise<RecordOrgCreateResult | null> {
  if (!isMultiSeatEnabled()) {
    return null;
  }

  const ownerUserId = requireNonEmpty("ownerUserId", input.ownerUserId);
  const name = requireNonEmpty("name", input.name);
  const billingMode = input.billingMode ?? "central";

  const baseSlug = slugify(name);
  // Empty slug on names like "💩💩💩" — fall back to "org-<random>"
  // so we don't INSERT an empty-string slug.
  const seedSlug =
    baseSlug.length > 0 ? baseSlug : `org-${randomUUID().slice(0, 8)}`;

  for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
    const slug =
      attempt === 0
        ? seedSlug.slice(0, ORG_SLUG_MAX_LENGTH)
        : `${seedSlug}-${attempt + 1}`.slice(0, ORG_SLUG_MAX_LENGTH);
    const organizationId = randomUUID();

    try {
      await db.transaction(async (tx) => {
        await tx.insert(schema.organizations).values({
          id: organizationId,
          name,
          slug,
          ownerUserId,
          billingMode,
        });
        await tx.insert(schema.organizationMembers).values({
          id: randomUUID(),
          organizationId,
          userId: ownerUserId,
          role: "owner",
        });
      });
      return { organizationId, slug };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // UNIQUE(slug) collision → retry with suffix
      if (
        message.includes("Duplicate entry") ||
        message.includes("ER_DUP_ENTRY")
      ) {
        // Determine which uniqueness collided. The slug is the most
        // likely; the (orgId, userId) member unique can't collide
        // because we just generated a fresh orgId. Continue the
        // loop to suffix the slug.
        continue;
      }
      throw new OrgWriteError(
        `Failed to create org: ${message}`,
        "DB_ERROR",
      );
    }
  }

  throw new OrgWriteError(
    `Slug-collision retry exhausted after ${MAX_SLUG_RETRIES} attempts (base='${baseSlug}')`,
    "SLUG_GENERATION_FAILED",
  );
}

// ---------------------------------------------------------------------------
// inviteMember
// ---------------------------------------------------------------------------

export interface InviteMemberInput {
  organizationId: string;
  email: string;
  role: "admin" | "member";
  invitedByUserId: string;
  /** Defaults to ORG_INVITE_DEFAULT_TTL_DAYS. */
  ttlDays?: number;
}

export interface InviteMemberResult {
  inviteId: string;
  token: string;
  expiresAt: Date;
  /** True if a prior pending invite was replaced (re-invite case). */
  replacedPrior: boolean;
}

/**
 * Generate + persist an invite. If a PENDING invite already exists
 * for (organizationId, email), the prior token is replaced with a
 * fresh one (DELETE + INSERT in transaction). This re-invite
 * pattern means the email link in the OLD invitation email goes
 * dead the moment we re-invite — important for security (the prior
 * email might be in the wrong inbox, on a stolen device, etc.).
 *
 * Caller (the future Phase F-2 invite UI) is responsible for
 * dispatching the email containing /invite/<token> after this
 * writer returns successfully.
 */
export async function inviteMember(
  input: InviteMemberInput,
): Promise<InviteMemberResult | null> {
  if (!isMultiSeatEnabled()) {
    return null;
  }

  const organizationId = requireNonEmpty(
    "organizationId",
    input.organizationId,
  );
  const email = requireNonEmpty("email", input.email).toLowerCase();
  const invitedByUserId = requireNonEmpty(
    "invitedByUserId",
    input.invitedByUserId,
  );
  const role = input.role;
  if (role !== "admin" && role !== "member") {
    throw new OrgWriteError(
      `role must be 'admin' or 'member' (got '${role}')`,
      "EMPTY_REQUIRED",
    );
  }

  const ttlDays = input.ttlDays ?? ORG_INVITE_DEFAULT_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  return await db.transaction(async (tx) => {
    // Check for existing pending invite. UNIQUE constraint isn't on
    // (org, email) — it's only on token — so we manually dedupe.
    const priorRows = await tx
      .select({ id: schema.organizationInvites.id })
      .from(schema.organizationInvites)
      .where(
        and(
          eq(schema.organizationInvites.organizationId, organizationId),
          eq(schema.organizationInvites.email, email),
          isNull(schema.organizationInvites.acceptedAt),
        ),
      );

    let replacedPrior = false;
    if (priorRows.length > 0) {
      // Delete every pending invite for this (org, email) — there
      // shouldn't be more than one in practice but defensive cleanup
      // covers any race that snuck duplicates in.
      for (const row of priorRows) {
        await tx
          .delete(schema.organizationInvites)
          .where(eq(schema.organizationInvites.id, row.id));
      }
      replacedPrior = true;
    }

    // Generate token + collision retry. At 36^32 namespace size
    // the collision probability is ~7e-49 — retry is theatrical.
    let token = "";
    let inviteId = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      token = generateInviteToken();
      inviteId = randomUUID();
      try {
        await tx.insert(schema.organizationInvites).values({
          id: inviteId,
          organizationId,
          email,
          token,
          invitedByUserId,
          role,
          expiresAt,
        });
        return { inviteId, token, expiresAt, replacedPrior };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (
          message.includes("Duplicate entry") ||
          message.includes("ER_DUP_ENTRY")
        ) {
          continue;
        }
        throw err;
      }
    }
    throw new OrgWriteError(
      "Failed to generate unique invite token after 8 attempts",
      "DB_ERROR",
    );
  });
}

// ---------------------------------------------------------------------------
// acceptInvite
// ---------------------------------------------------------------------------

export interface AcceptInviteInput {
  token: string;
  userId: string;
}

export interface AcceptInviteResult {
  organizationId: string;
  role: string;
}

/**
 * Accept an invite. Validates token → not expired → not already
 * accepted, then atomically inserts the member row + marks the
 * invite acceptedAt. Throws typed errors for each failure mode
 * so the (future) /invite/<token> UI can render the appropriate
 * "expired" / "already accepted" / "invalid" copy.
 *
 * Why we don't validate the email match
 *   The original audit flagged this — should we check that the
 *   accepting user's email matches the invite.email? In v1, no:
 *   if Alice forwards her invite to Bob and Bob accepts, that's
 *   Alice's choice. v2 could add an opt-in "lock invites to the
 *   email" toggle on per-org basis.
 */
export async function acceptInvite(
  input: AcceptInviteInput,
): Promise<AcceptInviteResult | null> {
  if (!isMultiSeatEnabled()) {
    return null;
  }

  const token = requireNonEmpty("token", input.token);
  const userId = requireNonEmpty("userId", input.userId);

  return await db.transaction(async (tx) => {
    const inviteRows = await tx
      .select()
      .from(schema.organizationInvites)
      .where(eq(schema.organizationInvites.token, token))
      .limit(1);

    if (inviteRows.length === 0) {
      throw new OrgWriteError(
        "Invite not found",
        "INVITE_NOT_FOUND",
      );
    }
    const invite = inviteRows[0]!;

    if (invite.acceptedAt !== null) {
      throw new OrgWriteError(
        "Invite already accepted",
        "INVITE_ALREADY_ACCEPTED",
      );
    }

    if (invite.expiresAt < new Date()) {
      throw new OrgWriteError(
        "Invite expired",
        "INVITE_EXPIRED",
      );
    }

    // Check if the user is already a member (e.g. they accepted a
    // prior invite, then got a re-invite, then click both). Surface
    // ALREADY_MEMBER rather than throwing on the UNIQUE.
    const memberRows = await tx
      .select({ id: schema.organizationMembers.id })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(
            schema.organizationMembers.organizationId,
            invite.organizationId,
          ),
          eq(schema.organizationMembers.userId, userId),
        ),
      )
      .limit(1);

    if (memberRows.length > 0) {
      // Mark the invite as accepted anyway (the user IS a member,
      // just from a different invite path) so it doesn't hang
      // around as "pending" forever.
      await tx
        .update(schema.organizationInvites)
        .set({ acceptedAt: new Date() })
        .where(eq(schema.organizationInvites.id, invite.id));
      throw new OrgWriteError(
        "User is already a member of this organization",
        "ALREADY_MEMBER",
      );
    }

    // Insert the membership + mark the invite accepted.
    await tx.insert(schema.organizationMembers).values({
      id: randomUUID(),
      organizationId: invite.organizationId,
      userId,
      role: invite.role,
    });
    await tx
      .update(schema.organizationInvites)
      .set({ acceptedAt: new Date() })
      .where(eq(schema.organizationInvites.id, invite.id));

    return { organizationId: invite.organizationId, role: invite.role };
  });
}

// ---------------------------------------------------------------------------
// changeRole / removeMember / transferOwnership (Phase F-4, 2026-05-05)
// ---------------------------------------------------------------------------

/**
 * Role rank for permission comparison. Higher number = more
 * authority. Used in changeRole + removeMember to enforce "you can
 * only act on roles strictly below your own" — prevents admins
 * from demoting other admins or members from removing the owner.
 */
const ROLE_RANK: Record<string, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

function rankOf(role: string): number {
  return ROLE_RANK[role] ?? 0;
}

export interface ChangeRoleInput {
  organizationId: string;
  /** The member whose role is being changed. */
  targetUserId: string;
  /** New role for the target. Cannot be 'owner' (use transferOwnership). */
  newRole: "admin" | "member";
  /** The user performing the change. Must outrank the target both
   *  before AND after — i.e. an admin can demote a member but
   *  cannot promote a member to admin (because that creates a peer,
   *  not a subordinate). Owner can change anyone. */
  byUserId: string;
}

/**
 * Change a member's role. Permission rules:
 *   - byUserId must be a member of the org
 *   - byUserId's role must STRICTLY OUTRANK the target's CURRENT role
 *     (admins can't change other admins; members can't change anyone)
 *   - byUserId's role must be GREATER THAN OR EQUAL TO newRole
 *     (admins can't promote anyone to admin level — only owner can do
 *     that)
 *   - newRole cannot be 'owner' — use transferOwnership for that
 *
 * Self-targeting is rejected (you can't change your own role; ask
 * someone with higher authority OR transfer ownership first if
 * you're the owner trying to step down).
 */
export async function changeRole(
  input: ChangeRoleInput,
): Promise<{ ok: true } | null> {
  if (!isMultiSeatEnabled()) {
    return null;
  }

  const organizationId = requireNonEmpty(
    "organizationId",
    input.organizationId,
  );
  const targetUserId = requireNonEmpty("targetUserId", input.targetUserId);
  const byUserId = requireNonEmpty("byUserId", input.byUserId);
  const newRole = input.newRole;

  if (newRole !== "admin" && newRole !== "member") {
    throw new OrgWriteError(
      `newRole must be 'admin' or 'member' (got '${newRole}'). Use transferOwnership to change ownership.`,
      "EMPTY_REQUIRED",
    );
  }

  if (targetUserId === byUserId) {
    throw new OrgWriteError(
      "You can't change your own role.",
      "EMPTY_REQUIRED",
    );
  }

  return await db.transaction(async (tx) => {
    // Read both rows in one pass. We need both the actor's role
    // (to check authority) and the target's current role (to check
    // we strictly outrank them).
    const memberRows = await tx
      .select()
      .from(schema.organizationMembers)
      .where(eq(schema.organizationMembers.organizationId, organizationId));

    const actor = memberRows.find((m) => m.userId === byUserId);
    const target = memberRows.find((m) => m.userId === targetUserId);

    if (!actor) {
      throw new OrgWriteError(
        "You're not a member of this organization.",
        "ALREADY_MEMBER", // re-using; semantically: "no membership"
      );
    }
    if (!target) {
      throw new OrgWriteError(
        "Target user is not a member of this organization.",
        "ALREADY_MEMBER",
      );
    }

    const actorRank = rankOf(actor.role);
    const targetRank = rankOf(target.role);

    // Strict outrank on the target's current role
    if (actorRank <= targetRank) {
      throw new OrgWriteError(
        `You don't have permission to change ${target.role} roles.`,
        "EMPTY_REQUIRED",
      );
    }

    // Authority to grant the new role: actor's rank must be >= newRole
    // rank. Admin (2) granting admin (2): rejected. Admin granting
    // member (1): allowed. Owner (3) granting admin (2): allowed.
    const newRoleRank = rankOf(newRole);
    if (actorRank < newRoleRank) {
      throw new OrgWriteError(
        `You don't have permission to grant the '${newRole}' role.`,
        "EMPTY_REQUIRED",
      );
    }

    // Apply the change.
    await tx
      .update(schema.organizationMembers)
      .set({ role: newRole })
      .where(eq(schema.organizationMembers.id, target.id));

    return { ok: true as const };
  });
}

export interface RemoveMemberInput {
  organizationId: string;
  targetUserId: string;
  byUserId: string;
}

/**
 * Remove a member from the org. Permission rules:
 *   - byUserId must strictly OUTRANK the target's role
 *   - target cannot be the OWNER (use transferOwnership first if you
 *     want to leave an org you own)
 *
 * Self-removal of non-owner roles is allowed (members can leave the
 * org). Self-removal of owner is rejected — owner must transfer first.
 */
export async function removeMember(
  input: RemoveMemberInput,
): Promise<{ ok: true } | null> {
  if (!isMultiSeatEnabled()) {
    return null;
  }

  const organizationId = requireNonEmpty(
    "organizationId",
    input.organizationId,
  );
  const targetUserId = requireNonEmpty("targetUserId", input.targetUserId);
  const byUserId = requireNonEmpty("byUserId", input.byUserId);

  return await db.transaction(async (tx) => {
    const memberRows = await tx
      .select()
      .from(schema.organizationMembers)
      .where(eq(schema.organizationMembers.organizationId, organizationId));

    const actor = memberRows.find((m) => m.userId === byUserId);
    const target = memberRows.find((m) => m.userId === targetUserId);

    if (!actor) {
      throw new OrgWriteError(
        "You're not a member of this organization.",
        "ALREADY_MEMBER",
      );
    }
    if (!target) {
      throw new OrgWriteError(
        "Target user is not a member of this organization.",
        "ALREADY_MEMBER",
      );
    }

    if (target.role === "owner") {
      throw new OrgWriteError(
        "The organization owner cannot be removed. Transfer ownership first.",
        "EMPTY_REQUIRED",
      );
    }

    // Self-leave is allowed (target === actor, target.role !== owner).
    // Otherwise require strict outrank.
    if (targetUserId !== byUserId) {
      const actorRank = rankOf(actor.role);
      const targetRank = rankOf(target.role);
      if (actorRank <= targetRank) {
        throw new OrgWriteError(
          `You don't have permission to remove ${target.role} members.`,
          "EMPTY_REQUIRED",
        );
      }
    }

    await tx
      .delete(schema.organizationMembers)
      .where(eq(schema.organizationMembers.id, target.id));

    return { ok: true as const };
  });
}

export interface TransferOwnershipInput {
  organizationId: string;
  /** The current owner — must match the org's owner_user_id. */
  fromUserId: string;
  /** The new owner. Must already be a member of the org. */
  toUserId: string;
}

/**
 * Transfer ownership of the org. Atomic: all three writes happen
 * in a single transaction so a partial failure can't leave the
 * org with two owners or no owner.
 *
 * Writes:
 *   1. organizations.owner_user_id = toUserId
 *   2. organization_members[fromUserId].role = 'admin' (former
 *      owner becomes admin, NOT removed — they likely want to keep
 *      using the org)
 *   3. organization_members[toUserId].role = 'owner'
 *
 * Permission: only the current owner can initiate transfer.
 * fromUserId must match the org's current owner_user_id (not just
 * "have role=owner" — paranoid check matches the column rather than
 * the role to defend against an inconsistent state where two rows
 * have role=owner).
 *
 * toUserId must already be a member. We don't auto-invite — that
 * would create a flow where transferring ownership creates a member
 * row, which is more state for the caller to track. UI gates on the
 * existing-membership precondition.
 */
export async function transferOwnership(
  input: TransferOwnershipInput,
): Promise<{ ok: true } | null> {
  if (!isMultiSeatEnabled()) {
    return null;
  }

  const organizationId = requireNonEmpty(
    "organizationId",
    input.organizationId,
  );
  const fromUserId = requireNonEmpty("fromUserId", input.fromUserId);
  const toUserId = requireNonEmpty("toUserId", input.toUserId);

  if (fromUserId === toUserId) {
    throw new OrgWriteError(
      "fromUserId and toUserId must differ — can't transfer ownership to yourself.",
      "EMPTY_REQUIRED",
    );
  }

  return await db.transaction(async (tx) => {
    // Read the org row to verify fromUserId is currently the owner.
    const orgRows = await tx
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId))
      .limit(1);
    if (orgRows.length === 0) {
      throw new OrgWriteError(
        "Organization not found.",
        "ALREADY_MEMBER",
      );
    }
    if (orgRows[0]!.ownerUserId !== fromUserId) {
      throw new OrgWriteError(
        "Only the current owner can transfer ownership.",
        "EMPTY_REQUIRED",
      );
    }

    // Verify toUserId is already a member
    const memberRows = await tx
      .select()
      .from(schema.organizationMembers)
      .where(eq(schema.organizationMembers.organizationId, organizationId));

    const fromRow = memberRows.find((m) => m.userId === fromUserId);
    const toRow = memberRows.find((m) => m.userId === toUserId);
    if (!fromRow) {
      throw new OrgWriteError(
        "From-user has no membership row (data inconsistency — contact support).",
        "ALREADY_MEMBER",
      );
    }
    if (!toRow) {
      throw new OrgWriteError(
        "Target user must already be a member of the organization. Invite them first.",
        "ALREADY_MEMBER",
      );
    }

    // Three writes, atomic
    await tx
      .update(schema.organizations)
      .set({ ownerUserId: toUserId })
      .where(eq(schema.organizations.id, organizationId));
    await tx
      .update(schema.organizationMembers)
      .set({ role: "admin" })
      .where(eq(schema.organizationMembers.id, fromRow.id));
    await tx
      .update(schema.organizationMembers)
      .set({ role: "owner" })
      .where(eq(schema.organizationMembers.id, toRow.id));

    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// cancelInvite (Phase F-4 — 2026-05-05)
// ---------------------------------------------------------------------------

export interface CancelInviteInput {
  organizationId: string;
  inviteId: string;
  byUserId: string;
}

/**
 * Cancel a pending invite. Permission rules:
 *   - byUserId must have canManageMembers permission on the org (admin
 *     or owner; checked by caller, but writer ALSO double-checks via
 *     the membership query).
 *   - Invite must belong to organizationId (caller-supplied; we
 *     re-verify so a malicious admin in org A can't pass an invite
 *     id from org B).
 *   - Invite must NOT be accepted yet (acceptedAt IS NULL); cancelling
 *     an already-accepted invite is a no-op and would be confusing
 *     UX (the member is already in the org).
 *
 * Cancellation = DELETE the invite row. The token in the URL becomes
 * a 404 if anyone follows it.
 */
export async function cancelInvite(
  input: CancelInviteInput,
): Promise<{ ok: true } | null> {
  if (!isMultiSeatEnabled()) {
    return null;
  }

  const organizationId = requireNonEmpty(
    "organizationId",
    input.organizationId,
  );
  const inviteId = requireNonEmpty("inviteId", input.inviteId);
  const byUserId = requireNonEmpty("byUserId", input.byUserId);

  return await db.transaction(async (tx) => {
    // Membership + permission re-check inside the tx — the action
    // layer already calls canManageMembers, but a hostile path that
    // bypassed the action surface would still be blocked here.
    const memberRows = await tx
      .select()
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.organizationId, organizationId),
          eq(schema.organizationMembers.userId, byUserId),
        ),
      )
      .limit(1);
    if (memberRows.length === 0) {
      throw new OrgWriteError(
        "You're not a member of this organization.",
        "ALREADY_MEMBER",
      );
    }
    const actorRole = memberRows[0]!.role;
    if (actorRole !== "owner" && actorRole !== "admin") {
      throw new OrgWriteError(
        "You don't have permission to cancel invites in this organization.",
        "EMPTY_REQUIRED",
      );
    }

    // Verify the invite belongs to THIS org (cross-org confusion
    // attack defense). Also confirm it's still pending.
    const inviteRows = await tx
      .select()
      .from(schema.organizationInvites)
      .where(eq(schema.organizationInvites.id, inviteId))
      .limit(1);
    if (inviteRows.length === 0) {
      throw new OrgWriteError("Invite not found.", "ALREADY_MEMBER");
    }
    const invite = inviteRows[0]!;
    if (invite.organizationId !== organizationId) {
      // Don't leak that the invite exists in another org; just say
      // not-found.
      throw new OrgWriteError("Invite not found.", "ALREADY_MEMBER");
    }
    if (invite.acceptedAt !== null) {
      throw new OrgWriteError(
        "This invite has already been accepted; the member is already in the organization.",
        "ALREADY_MEMBER",
      );
    }

    await tx
      .delete(schema.organizationInvites)
      .where(eq(schema.organizationInvites.id, inviteId));

    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// shared validation
// ---------------------------------------------------------------------------

function requireNonEmpty(name: string, value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OrgWriteError(`${name} is required`, "EMPTY_REQUIRED");
  }
  return value.trim();
}
