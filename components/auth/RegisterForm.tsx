"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { registerAction, type RegisterState } from "@/lib/auth-actions";
import { signIn } from "next-auth/react";
import { I } from "@/components/icons/Icons";
import {
  GoogleMark,
  Divider,
  Field,
  PasswordField,
  PasswordStrength,
} from "@/components/auth/AuthBits";

const initial: RegisterState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-accent"
      style={{ width: "100%", marginTop: 16, justifyContent: "center", height: 44 }}
      disabled={pending}
    >
      {pending ? "Creating account…" : "Create free account"}{" "}
      {!pending && <I.ArrowRight size={14} />}
    </button>
  );
}

export function RegisterForm() {
  const [state, formAction] = useFormState(registerAction, initial);
  const fe = state.fieldErrors ?? {};
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");

  return (
    <>
      <button
        type="button"
        className="btn btn-outline"
        style={{ width: "100%", marginBottom: 4, justifyContent: "center", height: 44 }}
        onClick={() => signIn("google", { callbackUrl: "/app/dashboard" })}
      >
        <GoogleMark />
        <span style={{ marginLeft: 10 }}>Sign up with Google</span>
      </button>

      <Divider label="OR SIGN UP WITH EMAIL" />

      <form action={formAction} noValidate>
        <Field
          label="Full name"
          name="name"
          type="text"
          autoComplete="name"
          required
          placeholder="Ada Lovelace"
          icon={<I.User size={14} />}
          error={fe.name}
        />

        <div style={{ height: 14 }} />

        <Field
          label="Work email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          icon={<I.Send size={14} />}
          error={fe.email}
        />

        <div style={{ height: 14 }} />

        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="At least 8 characters"
          show={showPassword}
          onToggle={() => setShowPassword((v) => !v)}
          error={fe.password}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordStrength password={password} />

        {/* Starter-credit incentive */}
        <div
          style={{
            marginTop: 18,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--bg-2)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "color-mix(in oklab, var(--accent) 15%, transparent)",
              color: "var(--accent)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <I.Sparkle size={14} />
          </span>
          <span style={{ fontSize: 13, lineHeight: 1.4 }}>
            Get <strong>25 AI credits free</strong> on signup — no card required.
          </span>
        </div>

        {state.error && !state.fieldErrors && (
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

        <p className="muted" style={{ fontSize: 12, marginTop: 16, lineHeight: 1.5 }}>
          By creating an account you agree to our{" "}
          <Link href="/terms" style={{ color: "var(--accent)", textDecoration: "none" }}>
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" style={{ color: "var(--accent)", textDecoration: "none" }}>
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </>
  );
}
