"use client";

import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { I } from "@/components/icons/Icons";

export function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function Divider({ label = "OR" }: { label?: string }) {
  return (
    <div
      aria-hidden
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        margin: "18px 0",
        color: "var(--fg-subtle)",
        fontSize: 11,
        letterSpacing: "0.08em",
      }}
    >
      <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
      {label}
      <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}

export function Field({
  label,
  icon,
  error,
  hint,
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: ReactNode;
  error?: string;
  hint?: string;
}) {
  const id = useId();
  const errorId = useId();
  return (
    <div>
      <label
        htmlFor={id}
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 500,
          marginBottom: 6,
          color: "var(--fg)",
        }}
      >
        {label}
      </label>
      <div style={{ position: "relative" }}>
        {icon && (
          <span
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--fg-subtle)",
              pointerEvents: "none",
            }}
          >
            {icon}
          </span>
        )}
        <input
          id={id}
          className="input"
          {...inputProps}
          style={{
            width: "100%",
            paddingLeft: icon ? 36 : undefined,
            height: 42,
            borderColor: error ? "var(--danger, #ef4444)" : undefined,
          }}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        />
      </div>
      {error ? (
        <p id={errorId} role="alert" style={{ color: "var(--danger, #ef4444)", fontSize: 12, margin: "6px 0 0" }}>{error}</p>
      ) : hint ? (
        <p style={{ color: "var(--fg-subtle)", fontSize: 12, margin: "6px 0 0" }}>{hint}</p>
      ) : null}
    </div>
  );
}

export function PasswordField({
  label,
  show,
  onToggle,
  rightLabel,
  error,
  hint,
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  show: boolean;
  onToggle: () => void;
  rightLabel?: ReactNode;
  error?: string;
  hint?: string;
}) {
  const id = useId();
  const errorId = useId();
  return (
    <div>
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}
      >
        <label htmlFor={id} style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>{label}</label>
        {rightLabel}
      </div>
      <div style={{ position: "relative" }}>
        <input
          id={id}
          className="input"
          {...inputProps}
          type={show ? "text" : "password"}
          style={{
            width: "100%",
            paddingRight: 44,
            height: 42,
            borderColor: error ? "var(--danger, #ef4444)" : undefined,
          }}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        />
        <button
          type="button"
          aria-label={show ? "Hide password" : "Show password"}
          onClick={onToggle}
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            background: "transparent",
            border: 0,
            color: "var(--fg-subtle)",
            cursor: "pointer",
            padding: 6,
            borderRadius: 6,
            display: "grid",
            placeItems: "center",
          }}
        >
          {show ? <I.EyeOff size={16} /> : <I.Eye size={16} />}
        </button>
      </div>
      {error ? (
        <p id={errorId} role="alert" style={{ color: "var(--danger, #ef4444)", fontSize: 12, margin: "6px 0 0" }}>{error}</p>
      ) : hint ? (
        <p style={{ color: "var(--fg-subtle)", fontSize: 12, margin: "6px 0 0" }}>{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Password-strength heuristic: 0 = empty, 1 = weak, 2 = okay, 3 = good, 4 = strong.
 *
 * Rules match what most users recognize as "strong":
 *   - length ≥ 8 → baseline
 *   - mixed case adds a bar
 *   - digits adds a bar
 *   - symbols adds a bar
 *   - length ≥ 14 adds a bar
 */
export function scorePassword(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length >= 14) score++;
  return Math.min(score, 4);
}

export function PasswordStrength({ password }: { password: string }) {
  const score = scorePassword(password);
  const labels = ["Too short", "Weak", "Okay", "Good", "Strong"];
  const colors = [
    "var(--danger, #ef4444)",
    "var(--danger, #ef4444)",
    "var(--amber, #f59e0b)",
    "var(--blue, #3b82f6)",
    "var(--green, #10b981)",
  ];
  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 4,
          height: 4,
        }}
        aria-hidden
      >
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            style={{
              height: 4,
              borderRadius: 2,
              background:
                password.length === 0
                  ? "var(--border)"
                  : i <= score
                  ? colors[score]
                  : "var(--border)",
              transition: "background 120ms",
            }}
          />
        ))}
      </div>
      {password.length > 0 && (
        <p
          style={{
            fontSize: 11,
            margin: "6px 0 0",
            color: colors[score],
          }}
        >
          {labels[score]}
          {score < 3 && (
            <span style={{ color: "var(--fg-subtle)" }}>
              {" — "}
              add {score < 1 ? "more characters" : score < 2 ? "an uppercase letter" : score < 3 ? "a number" : "a symbol"}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
