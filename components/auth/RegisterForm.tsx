"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { registerAction, type RegisterState } from "@/lib/auth-actions";
import { sanitizeCallbackUrl } from "@/lib/auth-callback";
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
  // 2026-05-01 — read callbackUrl from the URL the visitor arrived on.
  // /chat-with-pdf and other AI SEO landings now route their primary
  // CTAs to /register, so a registering user gets returned to the
  // tool they came from after signup. Default /app/dashboard via
  // sanitizeCallbackUrl() if missing or fails open-redirect validation.
  const search = useSearchParams();
  const callbackUrl = sanitizeCallbackUrl(search?.get("callbackUrl"));

  return (
    <>
      <button
        type="button"
        className="btn btn-outline"
        style={{ width: "100%", marginBottom: 4, justifyContent: "center", height: 44 }}
        onClick={() => signIn("google", { callbackUrl })}
      >
        <GoogleMark />
        <span style={{ marginLeft: 10 }}>Sign up with Google</span>
      </button>

      <Divider label="OR SIGN UP WITH EMAIL" />

      <form action={formAction} noValidate>
        {/* 2026-05-01 — hidden callbackUrl input so registerAction (server)
            knows where to redirect after credentials sign-up. */}
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
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
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          icon={<I.Send size={14} />}
          error={fe.email}
        />

        <div style={{ height: 14 }} />

        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          required
          // 2026-05-02 plan §8a item 5 — bumped 8 → 10 to match
          // the server-side registerSchema. Server-side rule is
          // authoritative; this client hint just prevents an
          // unnecessary round-trip on too-short input.
          minLength={10}
          placeholder="At least 10 characters, mix of cases + digits"
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
            {/* 2026-05-02 plan §2 path D — was "25 AI credits free",
                now "5 AI credits free, valid 7 days". Honest about the
                signup-grant expiry that ships with grantSignupBonus(). */}
            Get <strong>5 AI credits free</strong> on signup — valid 7 days, no card required.
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
          <Link href="/terms" style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 2 }}>
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 2 }}>
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </>
  );
}
