// CodeEntryForm — 6-digit OTP entry form on /verify-email
// (PENDING auth-flow gap #1, 2026-05-06).
//
// UX: single 6-digit input (not 6 separate boxes — simpler to
// implement, copy-paste-friendly, accessible). Auto-submits when
// 6 digits are entered.
//
// POSTs to /api/auth/verify-code with { code }. userId comes from
// the session cookie server-side. On success, navigates to
// /app/dashboard so the user lands on the live state (banner
// dismissed, signup bonus visible if granted).

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Outcome =
  | { kind: "idle" }
  | { kind: "error"; detail: string }
  | { kind: "locked"; retryAfterSeconds: number };

export function CodeEntryForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  function submitCode(c: string) {
    setOutcome({ kind: "idle" });
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/verify-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: c }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          detail?: string;
          retryAfterSeconds?: number;
        };
        if (res.ok && body.ok) {
          router.push("/app/dashboard");
          return;
        }
        if (res.status === 429 && body.retryAfterSeconds) {
          setOutcome({
            kind: "locked",
            retryAfterSeconds: body.retryAfterSeconds,
          });
          return;
        }
        setOutcome({
          kind: "error",
          detail:
            body.detail ??
            `Couldn't verify (HTTP ${res.status}). Try again or use the link in your email.`,
        });
      } catch {
        setOutcome({
          kind: "error",
          detail: "Network error — check your connection and try again.",
        });
      }
    });
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Strip non-digits + cap at 6
    const next = e.target.value.replace(/\D+/g, "").slice(0, 6);
    setCode(next);
    setOutcome({ kind: "idle" });
    // Auto-submit on full 6 digits
    if (next.length === 6) {
      submitCode(next);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length === 6) submitCode(code);
  }

  const lockoutMin =
    outcome.kind === "locked"
      ? Math.ceil(outcome.retryAfterSeconds / 60)
      : null;

  return (
    <form
      onSubmit={onSubmit}
      style={{
        maxWidth: 360,
        margin: "16px auto 0",
        textAlign: "left",
      }}
    >
      <label
        htmlFor="otp-code"
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 8,
          textAlign: "center",
        }}
      >
        Or enter the 6-digit code from your email
      </label>
      <input
        id="otp-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={7} /* allows the space-separated "123 456" paste */
        value={code}
        onChange={onChange}
        disabled={pending || outcome.kind === "locked"}
        autoFocus
        style={{
          width: "100%",
          padding: "14px 12px",
          fontSize: 24,
          letterSpacing: 8,
          textAlign: "center",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          fontWeight: 600,
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--bg)",
          color: "var(--fg)",
        }}
        placeholder="● ● ● ● ● ●"
      />
      {outcome.kind === "error" ? (
        <div
          role="alert"
          style={{
            marginTop: 12,
            padding: "8px 12px",
            borderRadius: 4,
            background: "color-mix(in oklab, #c00 8%, transparent)",
            color: "#c00",
            fontSize: 12,
            textAlign: "center",
          }}
        >
          {outcome.detail}
        </div>
      ) : null}
      {outcome.kind === "locked" ? (
        <div
          role="alert"
          style={{
            marginTop: 12,
            padding: "10px 14px",
            borderRadius: 4,
            background: "color-mix(in oklab, #c00 8%, transparent)",
            color: "#c00",
            fontSize: 12,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          Too many wrong codes. Try again in{" "}
          <strong>~{lockoutMin} min</strong>, or:
          <ul
            style={{
              margin: "8px 0 0",
              padding: 0,
              listStyle: "none",
              fontSize: 12,
            }}
          >
            <li>· Click the magic link in your email instead</li>
            <li>
              · Sign in at <a href="/login" style={{ color: "#c00", textDecoration: "underline" }}>/login</a>{" "}
              and click <strong>Resend verification email</strong> on
              the dashboard for a fresh code (lockout doesn&rsquo;t
              affect a new code — only the prior one)
            </li>
          </ul>
        </div>
      ) : null}
      <button
        type="submit"
        disabled={pending || code.length !== 6 || outcome.kind === "locked"}
        className="btn btn-primary"
        style={{ width: "100%", marginTop: 12 }}
      >
        {pending ? "Verifying…" : "Verify"}
      </button>
      <p
        className="muted"
        style={{
          fontSize: 11,
          marginTop: 12,
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        Code is valid for 15 minutes. Need a fresh one? Sign in and
        click <strong>Resend verification email</strong> on the
        dashboard.
      </p>
    </form>
  );
}
