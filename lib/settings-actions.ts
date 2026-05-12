"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { auth, signOut } from "@/auth";
import { BCRYPT_COST } from "@/lib/auth/bcrypt-cost";

type UserRow = {
  id: string;
  email: string;
  passwordHash: string | null;
};

async function requireUser(): Promise<UserRow> {
  const session = await auth();
  const id = session?.user ? (session.user as { id?: string }).id : undefined;
  if (!id) {
    redirect("/login");
  }
  const [row] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      passwordHash: schema.users.passwordHash,
    })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);
  if (!row) redirect("/login");
  return row;
}

// ---------------- Update profile ----------------

const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(120, "Name is too long."),
});

export type ProfileState = { ok: boolean; message?: string; error?: string };

export async function updateProfileAction(
  _prev: ProfileState | undefined,
  formData: FormData
): Promise<ProfileState> {
  const user = await requireUser();

  const parsed = profileSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await db
      .update(schema.users)
      .set({ name: parsed.data.name })
      .where(eq(schema.users.id, user.id));
    revalidatePath("/app/settings");
    return { ok: true, message: "Profile updated." };
  } catch (err) {
    console.error("updateProfile failed:", err);
    return { ok: false, error: "Could not update profile." };
  }
}

// ---------------- Change password ----------------

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters.")
    .max(128, "New password is too long."),
});

export type PasswordState = { ok: boolean; message?: string; error?: string };

export async function changePasswordAction(
  _prev: PasswordState | undefined,
  formData: FormData
): Promise<PasswordState> {
  const user = await requireUser();

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  if (!user.passwordHash) {
    return {
      ok: false,
      error:
        "This account was created with Google. Set a password from your Google account instead.",
    };
  }

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    return { ok: false, error: "Current password is incorrect." };
  }

  try {
    // 2026-05-12 — SEV-0 fix: was cost 10, now BCRYPT_COST (=12)
    // matching signup. Previously every password-change downgraded
    // the hash strength below the original signup. See
    // lib/auth/bcrypt-cost.ts for full rationale.
    const newHash = await bcrypt.hash(parsed.data.newPassword, BCRYPT_COST);
    await db
      .update(schema.users)
      .set({ passwordHash: newHash })
      .where(eq(schema.users.id, user.id));
    return { ok: true, message: "Password changed." };
  } catch (err) {
    console.error("changePassword failed:", err);
    return { ok: false, error: "Could not change password." };
  }
}

// ---------------- Delete account ----------------

export type DeleteState = { ok: boolean; error?: string };

export async function deleteAccountAction(
  _prev: DeleteState | undefined,
  formData: FormData
): Promise<DeleteState> {
  const user = await requireUser();

  const confirm = String(formData.get("confirmEmail") ?? "").trim().toLowerCase();
  if (confirm !== user.email.toLowerCase()) {
    return { ok: false, error: "Confirmation email doesn't match your account email." };
  }

  try {
    // Cascades: accounts, sessions, files, api_keys, credits, credit_ledger all reference users.id.
    await db.delete(schema.users).where(eq(schema.users.id, user.id));
  } catch (err) {
    console.error("deleteAccount failed:", err);
    return { ok: false, error: "Could not delete account. Contact support." };
  }

  await signOut({ redirect: false });
  redirect("/");
}
