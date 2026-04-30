"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { loginAction, type LoginState } from "@/lib/auth-actions";
import { signIn } from "next-auth/react";
import { I } from "@/components/icons/Icons";
import { GoogleMark, Divider, Field, PasswordField } from "@/components/auth/AuthBits";

const initial: LoginState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-primary"
      style={{ width: "100%", marginTop: 14, justifyContent: "center", height: 44 }}
      disabled={pending}
    >
      {pending ? "Signing in…" : "Sign in"}{" "}
      {!pending && <I.ArrowRight size={14} />}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, initial);
  const [showPassword, setShowPassword] = useState(false);
  const search = useSearchParams();
  // Flash messages arrive as short query strings:
  //   ?reset=1      → password successfully reset, tell them to sign in
  //   ?verified=1   → reserved for future email-verify flow
  const resetFlash = search?.get("reset") === "1";

  return (
    <>
      {resetFlash && (
        <div
          role="status"
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border:
              "1px solid color-mix(in oklab, var(--green, #10b981) 30%, transparent)",
            background:
              "color-mix(in oklab, var(--green, #10b981) 10%, transparent)",
            color: "var(--green, #10b981)",
            fontSize: 13,
            marginBottom: 14,
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <I.Check size={14} />
          <span>
            Password updated. Sign in with your new password to continue.
          </span>
        </div>
      )}

      <button
        type="button"
        className="btn btn-outline"
        style={{ width: "100%", marginBottom: 4, justifyContent: "center", height: 44 }}
        onClick={() => signIn("google", { callbackUrl: "/app/dashboard" })}
      >
        <GoogleMark />
        <span style={{ marginLeft: 10 }}>Continue with Google</span>
      </button>

      <Divider label="OR CONTINUE WITH EMAIL" />

      <form action={formAction} noValidate>
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          icon={<I.Send size={14} />}
        />

        <div style={{ height: 14 }} />

        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          required
          placeholder="Your password"
          show={showPassword}
          onToggle={() => setShowPassword((v) => !v)}
          rightLabel={
            <Link
              href="/forgot-password"
              style={{
                color: "var(--accent)",
                textDecoration: "underline",
                textUnderlineOffset: 2,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              Forgot password?
            </Link>
          }
        />

        <label
          className="row"
          style={{ marginTop: 14, gap: 8, fontSize: 13, cursor: "pointer", color: "var(--fg)" }}
        >
          <input
            type="checkbox"
            name="remember"
            defaultChecked
            style={{ accentColor: "var(--accent)" }}
          />
          Keep me signed in
        </label>

        {state.error && (
          <p
            role="alert"
            style={{
              color: "var(--danger, #ef4444)",
              background: "color-mix(in oklab, var(--danger, #ef4444) 10%, transparent)",
              border: "1px solid color-mix(in oklab, var(--danger, #ef4444) 30%, transparent)",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 13,
              marginTop: 14,
            }}
          >
            {state.error}
          </p>
        )}

        <SubmitButton />
      </form>
    </>
  );
}
