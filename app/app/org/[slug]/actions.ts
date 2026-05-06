// Server Actions for /app/org/[slug]. Permission-gated wrappers
// around lib/orgs/writers.ts.
//
// Permission model
// ----------------
// inviteMemberAction: only owners + admins can invite members.
// changeRoleAction:   only owners + admins can change roles, AND
//                     the writer enforces strict-outrank + authority-
//                     to-grant semantics (see writers.ts:changeRole).
// removeMemberAction: only owners + admins can remove others; non-
//                     owner members + admins can self-leave (writer
//                     handles the self-leave path).
// transferOwnershipAction: only the current owner.
//
// Pinned via canManageMembers() / canTransferOwnership(). Belt +
// braces: even if a malicious admin client somehow renders the
// management UI, the server actions re-check before writing.
//
// Anti-impersonation
// ------------------
// All three writers take `byUserId` / `fromUserId` from the
// session, NEVER from input. Otherwise a hostile client could pass
// a different actor id and bypass permission checks.

"use server";

import { auth } from "@/auth";
import { canManageMembers, getMemberRole } from "@/lib/orgs/queries";
import {
  OrgWriteError,
  cancelInvite,
  changeRole,
  inviteMember,
  removeMember,
  transferOwnership,
} from "@/lib/orgs/writers";

export interface InviteMemberActionInput {
  orgId: string;
  email: string;
  role: "admin" | "member";
}

export type InviteMemberActionResult =
  | { ok: true; token: string; expiresAt: Date; replacedPrior: boolean }
  | { ok: false; error: string };

export async function inviteMemberAction(
  input: InviteMemberActionInput,
): Promise<InviteMemberActionResult> {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  if (typeof userId !== "string") {
    return { ok: false, error: "You need to be signed in." };
  }

  // Permission re-check at write time (in addition to the page-
  // render-time hide of the form). Anyone hitting this action
  // who isn't an owner/admin gets a generic 403-equivalent —
  // we don't say "you're not an admin" specifically because that
  // leaks role info.
  const canManage = await canManageMembers(input.orgId, userId);
  if (!canManage) {
    return {
      ok: false,
      error: "You don't have permission to invite members in this organization.",
    };
  }

  const email = (input.email ?? "").trim();
  if (email.length === 0) {
    return { ok: false, error: "Email is required." };
  }
  // Cheap email-shape check. Not RFC 5322; just "looks like an
  // email" to catch typos. The writer doesn't validate format.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "That doesn't look like a valid email address." };
  }
  if (input.role !== "admin" && input.role !== "member") {
    return { ok: false, error: "Invalid role." };
  }

  try {
    const result = await inviteMember({
      organizationId: input.orgId,
      email,
      role: input.role,
      invitedByUserId: userId,
    });
    if (result === null) {
      // MULTI_SEAT flag is off. Honest copy.
      return {
        ok: false,
        error: "Inviting members isn't available on your account yet.",
      };
    }
    return {
      ok: true,
      token: result.token,
      expiresAt: result.expiresAt,
      replacedPrior: result.replacedPrior,
    };
  } catch (err) {
    if (err instanceof OrgWriteError) {
      return {
        ok: false,
        error: `Couldn't send invite: ${err.message}`,
      };
    }
    console.error("[inviteMemberAction] unexpected error:", err);
    return {
      ok: false,
      error: "Something went wrong on our side. Try again.",
    };
  }
}

// ---------------------------------------------------------------------------
// changeRoleAction (Phase F-4 — 2026-05-05)
// ---------------------------------------------------------------------------

export interface ChangeRoleActionInput {
  orgId: string;
  targetUserId: string;
  newRole: "admin" | "member";
}

export type ChangeRoleActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function changeRoleAction(
  input: ChangeRoleActionInput,
): Promise<ChangeRoleActionResult> {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  if (typeof userId !== "string") {
    return { ok: false, error: "You need to be signed in." };
  }

  // Permission re-check at write time. The writer also checks
  // strict-outrank + authority-to-grant — this is an outer-layer
  // check that cuts off non-admins before we even hit the DB.
  const canManage = await canManageMembers(input.orgId, userId);
  if (!canManage) {
    return {
      ok: false,
      error:
        "You don't have permission to change roles in this organization.",
    };
  }

  if (input.newRole !== "admin" && input.newRole !== "member") {
    return { ok: false, error: "Invalid role." };
  }

  try {
    const result = await changeRole({
      organizationId: input.orgId,
      targetUserId: input.targetUserId,
      newRole: input.newRole,
      byUserId: userId,
    });
    if (result === null) {
      return {
        ok: false,
        error: "Role management isn't available on your account yet.",
      };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof OrgWriteError) {
      return { ok: false, error: err.message };
    }
    console.error("[changeRoleAction] unexpected error:", err);
    return {
      ok: false,
      error: "Something went wrong on our side. Try again.",
    };
  }
}

// ---------------------------------------------------------------------------
// removeMemberAction (Phase F-4 — 2026-05-05)
// ---------------------------------------------------------------------------

export interface RemoveMemberActionInput {
  orgId: string;
  targetUserId: string;
}

export type RemoveMemberActionResult =
  | { ok: true; selfLeave: boolean }
  | { ok: false; error: string };

export async function removeMemberAction(
  input: RemoveMemberActionInput,
): Promise<RemoveMemberActionResult> {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  if (typeof userId !== "string") {
    return { ok: false, error: "You need to be signed in." };
  }

  const isSelfLeave = input.targetUserId === userId;

  // Two permission paths:
  //   - Self-leave: any non-owner member can leave their own org
  //     (writer rejects owner self-leave with "transfer first" copy).
  //   - Cross-user remove: must be owner / admin AND strictly outrank.
  if (!isSelfLeave) {
    const canManage = await canManageMembers(input.orgId, userId);
    if (!canManage) {
      return {
        ok: false,
        error:
          "You don't have permission to remove members from this organization.",
      };
    }
  } else {
    // Self-leave still requires actor to be a member of the org.
    // getMemberRole returns null for non-members; this catches the
    // "stale tab after I was already removed" case.
    const role = await getMemberRole(input.orgId, userId);
    if (role === null) {
      return {
        ok: false,
        error: "You're not a member of this organization.",
      };
    }
  }

  try {
    const result = await removeMember({
      organizationId: input.orgId,
      targetUserId: input.targetUserId,
      byUserId: userId,
    });
    if (result === null) {
      return {
        ok: false,
        error: "Membership management isn't available on your account yet.",
      };
    }
    return { ok: true, selfLeave: isSelfLeave };
  } catch (err) {
    if (err instanceof OrgWriteError) {
      return { ok: false, error: err.message };
    }
    console.error("[removeMemberAction] unexpected error:", err);
    return {
      ok: false,
      error: "Something went wrong on our side. Try again.",
    };
  }
}

// ---------------------------------------------------------------------------
// transferOwnershipAction (Phase F-4 — 2026-05-05)
// ---------------------------------------------------------------------------

export interface TransferOwnershipActionInput {
  orgId: string;
  toUserId: string;
}

export type TransferOwnershipActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function transferOwnershipAction(
  input: TransferOwnershipActionInput,
): Promise<TransferOwnershipActionResult> {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  if (typeof userId !== "string") {
    return { ok: false, error: "You need to be signed in." };
  }

  // Outer-layer check: actor must currently hold the OWNER role on
  // this org. The writer ALSO verifies organizations.owner_user_id
  // matches fromUserId (column-not-role check) — this is the role-
  // side check that cuts off non-owners before we hit the writer's
  // tx. Any inconsistency between the two is a sign that something
  // is wrong (writer logs + escalates).
  const role = await getMemberRole(input.orgId, userId);
  if (role !== "owner") {
    return {
      ok: false,
      error: "Only the current owner can transfer ownership.",
    };
  }

  try {
    const result = await transferOwnership({
      organizationId: input.orgId,
      fromUserId: userId,
      toUserId: input.toUserId,
    });
    if (result === null) {
      return {
        ok: false,
        error:
          "Ownership transfer isn't available on your account yet.",
      };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof OrgWriteError) {
      return { ok: false, error: err.message };
    }
    console.error("[transferOwnershipAction] unexpected error:", err);
    return {
      ok: false,
      error: "Something went wrong on our side. Try again.",
    };
  }
}

// ---------------------------------------------------------------------------
// cancelInviteAction (Phase F-4 — 2026-05-05)
// ---------------------------------------------------------------------------

export interface CancelInviteActionInput {
  orgId: string;
  inviteId: string;
}

export type CancelInviteActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function cancelInviteAction(
  input: CancelInviteActionInput,
): Promise<CancelInviteActionResult> {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  if (typeof userId !== "string") {
    return { ok: false, error: "You need to be signed in." };
  }

  // Outer-layer check: actor must be owner or admin. Writer also
  // re-checks via membership query inside the tx. The writer
  // additionally verifies the invite belongs to THIS org so an
  // admin in org A can't pass in an invite id from org B.
  const canManage = await canManageMembers(input.orgId, userId);
  if (!canManage) {
    return {
      ok: false,
      error:
        "You don't have permission to cancel invites in this organization.",
    };
  }

  try {
    const result = await cancelInvite({
      organizationId: input.orgId,
      inviteId: input.inviteId,
      byUserId: userId,
    });
    if (result === null) {
      return {
        ok: false,
        error:
          "Invite management isn't available on your account yet.",
      };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof OrgWriteError) {
      return { ok: false, error: err.message };
    }
    console.error("[cancelInviteAction] unexpected error:", err);
    return {
      ok: false,
      error: "Something went wrong on our side. Try again.",
    };
  }
}
