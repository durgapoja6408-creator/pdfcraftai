"use client";

import { useState } from "react";
import { I } from "@/components/icons/Icons";
import { Field } from "@/components/auth/AuthBits";

/**
 * Forgot-password form.
 *
 * POSTs to /api/auth/forgot-password which intentionally returns 200 whether
 * or not the email is on file (anti-enumeration). The UI mirrors that and
 * always renders the success card, so we never leak account existence.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [error, setError] = useState<string>("");

  if (state === "sent") {
    return (
      <div
        role="status"
        style={{
          padding: 16,
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "var(--bg-2)",
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "color-mix(in oklab, var(--green, #10b981) 18%, transparent)",
            color: "var(--green, #10b981)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <I.Check size={16} />
        </span>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>Check your inbox</p>
          <p
            className="muted"
            style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.5 }}
          >
            If <strong style={{ color: "var(--fg)" }}>{email}</strong> is on file, we just sent a
            reset link. The link expires in 30 minutes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!email || state === "loading") return;
        setState("loading");
        setError("");
        try {
          const res = await fetch("/api/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            // 4xx with a known message — show it. Server still acks 200 for valid
            // payloads regardless of account existence, so this only fires on
            // malformed input.
            throw new Error(body.error ?? "Couldn't send the reset email — try again in a minute.");
          }
          setState("sent");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Something went wrong.");
          setState("error");
        }
      }}
    >
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        icon={<I.Send size={14} />}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        hint="We'll always show this success page, even if no account matches — that's intentional, to protect privacy."
      />
      {state === "error" && (
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
            marginTop: 12,
          }}
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        className="btn btn-primary"
        style={{ width: "100%", marginTop: 16, justifyContent: "center", height: 44 }}
        disabled={state === "loading"}
      >
        {state === "loading" ? "Sending…" : "Send reset link"}
        {state !== "loading" && <I.ArrowRight size={14} />}
      </button>
    </form>
  );
}
