// Server Actions for /app/org/[slug]/settings (Phase F-4 follow-on,
// 2026-05-06). Owner-only wrappers around lib/orgs/writers.ts:
//   - renameOrgAction → renameOrg
//   - deleteOrgAction → deleteOrg
//
// Anti-impersonation: byUserId from session, never from input.
// Defense-in-depth: writer ALSO verifies organizations.owner_user_id
// matches actor (column-not-role check) inside the tx, so a stale
// tab from before a transferOwnership can't keep mutating.

"use server";

import { auth } from "@/auth";
import { getMemberRole } from "@/lib/orgs/queries";
import {
  OrgWriteError,
  deleteOrg,
  renameOrg,
} from "@/lib/orgs/writers";

export interface RenameOrgActionInput {
  orgId: string;
  newName: string;
}

export type RenameOrgActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function renameOrgAction(
  input: RenameOrgActionInput,
): Promise<RenameOrgActionResult> {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  if (typeof userId !== "string") {
    return { ok: false, error: "You need to be signed in." };
  }

  // Outer-layer owner check via getMemberRole — cheap pre-flight
  // before the writer's column-level re-check inside its tx.
  const role = await getMemberRole(input.orgId, userId);
  if (role !== "owner") {
    return {
      ok: false,
      error: "Only the current owner can rename the organization.",
    };
  }

  const newName = (input.newName ?? "").trim();
  if (newName.length === 0) {
    return { ok: false, error: "Organization name is required." };
  }
  if (newName.length > 255) {
    return {
      ok: false,
      error: "Organization name must be 255 characters or fewer.",
    };
  }

  try {
    const result = await renameOrg({
      organizationId: input.orgId,
      byUserId: userId,
      newName,
    });
    if (result === null) {
      return {
        ok: false,
        error:
          "Organization settings aren't available on your account yet.",
      };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof OrgWriteError) {
      return { ok: false, error: err.message };
    }
    console.error("[renameOrgAction] unexpected error:", err);
    return {
      ok: false,
      error: "Something went wrong on our side. Try again.",
    };
  }
}

export interface DeleteOrgActionInput {
  orgId: string;
  /** Typed-in confirmation string — must match the org name to fire.
   *  Server re-checks (the client already enforces but a hostile
   *  client could skip this gate). */
  confirmName: string;
  /** The current org name. Loaded server-side; the action verifies
   *  confirmName matches. We still accept this from input rather
   *  than re-loading the org row at the action layer because the
   *  writer's tx already loads it for the column-owner check —
   *  one less round-trip. */
  expectedName: string;
}

export type DeleteOrgActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteOrgAction(
  input: DeleteOrgActionInput,
): Promise<DeleteOrgActionResult> {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  if (typeof userId !== "string") {
    return { ok: false, error: "You need to be signed in." };
  }

  // Owner-only outer-layer check. The writer ALSO verifies
  // organizations.owner_user_id matches actor — defense-in-depth.
  const role = await getMemberRole(input.orgId, userId);
  if (role !== "owner") {
    return {
      ok: false,
      error: "Only the current owner can delete the organization.",
    };
  }

  // Typed-name confirmation re-check at the action layer. The form
  // already enforces this, but hostile clients can skip the form.
  const typed = (input.confirmName ?? "").trim();
  if (typed.length === 0 || typed !== input.expectedName) {
    return {
      ok: false,
      error:
        "Confirmation name doesn't match. Type the organization's exact name to confirm deletion.",
    };
  }

  try {
    const result = await deleteOrg({
      organizationId: input.orgId,
      byUserId: userId,
    });
    if (result === null) {
      return {
        ok: false,
        error:
          "Organization deletion isn't available on your account yet.",
      };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof OrgWriteError) {
      return { ok: false, error: err.message };
    }
    console.error("[deleteOrgAction] unexpected error:", err);
    return {
      ok: false,
      error: "Something went wrong on our side. Try again.",
    };
  }
}
