"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { PasswordField, PasswordStrength, scorePassword } from "@/components/auth/AuthBits";

/**
 * Reset-password form.
 *
 * Receives the raw token as a prop (page-level server component already
 * validated it against the DB). POSTs to /api/auth/reset-password which
 * consumes the token + writes the new passwordHash.
 *
 * On success: redirect to /login?reset=1 so the login page can show a
 * "Password updated — sign in again" flash.
 *
 * Intentionally does NOT auto-sign-in after reset. A fresh credential
 * login proves the user knows the new password AND invalidates any
 * attacker session that might be riding the same browser.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string>("");

  const canSubmit =
    state !== "loading" &&
    password.length >= 8 &&
    password === confirm &&
    scorePassword(password) >= 2;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");

        if (password.length < 8) {
          setError("Use at least 8 characters.");
          setState("error");
          return;
        }
        if (password !== confirm) {
          setError("Passwords don't match.");
          setState("error");
          return;
        }
        if (scorePassword(password) < 2) {
          setError("Add an uppercase letter or a number to strengthen this password.");
          setState("error");
          return;
        }

        setState("loading");
        try {
          const res = await fetch("/api/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, password }),
          });
          if (!res.ok) {
            // 2026-05-12 SEV-1 audit fix: route migrated to
            // { error: "snake_case_code", detail: "Human readable." }.
            // Display detail first, fall back to legacy error string.
            const body = (await res.json().catch(() => ({}))) as {
              error?: string;
              detail?: string;
            };
            throw new Error(
              body.detail ??
                body.error ??
                "Couldn't update your password. Try requesting a new reset link.",
            );
          }
          // Success — send the user to /login with a success flash. Using
          // router.replace so the reset URL doesn't linger in history.
          router.replace("/login?reset=1");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Something went wrong.");
          setState("error");
        }
      }}
    >
      <PasswordField
        label="New password"
        name="password"
        autoComplete="new-password"
        required
        minLength={8}
        placeholder="At least 8 characters"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        show={showPw}
        onToggle={() => setShowPw((v) => !v)}
      />
      <PasswordStrength password={password} />

      <div style={{ marginTop: 16 }}>
        <PasswordField
          label="Confirm new password"
          name="confirm"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="Re-enter the same password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          show={showConfirm}
          onToggle={() => setShowConfirm((v) => !v)}
          error={
            confirm.length > 0 && confirm !== password
              ? "Passwords don't match."
              : undefined
          }
        />
      </div>

      {state === "error" && error && (
        <p
          role="alert"
          style={{
            color: "var(--danger, #ef4444)",
            background:
              "color-mix(in oklab, var(--danger, #ef4444) 10%, transparent)",
            border:
              "1px solid color-mix(in oklab, var(--danger, #ef4444) 30%, transparent)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
            marginTop: 16,
          }}
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        className="btn btn-primary"
        style={{ width: "100%", marginTop: 16, justifyContent: "center", height: 44 }}
        disabled={!canSubmit}
      >
        {state === "loading" ? "Saving…" : "Save new password"}
        {state !== "loading" && <I.ArrowRight size={14} />}
      </button>

      <p
        className="muted"
        style={{ fontSize: 12, marginTop: 14, textAlign: "center" }}
      >
        Changed your mind?{" "}
        <Link
          href="/login"
          style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 2, fontWeight: 500 }}
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
