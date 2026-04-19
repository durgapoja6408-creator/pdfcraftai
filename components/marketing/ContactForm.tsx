"use client";

import { useState } from "react";
import { I } from "@/components/icons/Icons";

type State = "idle" | "loading" | "sent" | "error";

/**
 * Contact form — client component.
 *
 * POSTs to /api/contact. Backend currently logs to console and returns 200
 * (mail-sending not wired yet). When SendGrid / Postmark lands, swap the
 * handler in app/api/contact/route.ts — the form stays the same.
 */
export function ContactForm() {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string>("");

  if (state === "sent") {
    return (
      <div
        role="status"
        className="card"
        style={{
          padding: 20,
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          background:
            "color-mix(in oklab, var(--green, #10b981) 10%, var(--bg-1))",
          border:
            "1px solid color-mix(in oklab, var(--green, #10b981) 30%, var(--border))",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "var(--green, #10b981)",
            color: "white",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <I.Check size={16} />
        </span>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>Message sent.</p>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.55 }}>
            We reply within one business day. Check your inbox — and spam, just in case.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (state === "loading") return;
        const form = e.currentTarget;
        const data = Object.fromEntries(new FormData(form).entries());
        setState("loading");
        setError("");
        try {
          const res = await fetch("/api/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error ?? "Something went wrong — please try again.");
          }
          setState("sent");
          form.reset();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Something went wrong.");
          setState("error");
        }
      }}
      style={{ display: "grid", gap: 14 }}
      noValidate
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <FormInput name="name" label="Your name" required autoComplete="name" />
        <FormInput name="email" label="Email" type="email" required autoComplete="email" />
      </div>
      <FormSelect
        name="topic"
        label="Topic"
        options={["Support", "Sales", "Security", "Feedback", "Press", "Other"]}
      />
      <FormTextarea name="message" label="Message" required minLength={10} />
      {state === "error" && (
        <p
          role="alert"
          style={{
            color: "var(--danger, #ef4444)",
            background: "color-mix(in oklab, var(--danger, #ef4444) 10%, transparent)",
            border: "1px solid color-mix(in oklab, var(--danger, #ef4444) 30%, transparent)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
            margin: 0,
          }}
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        className="btn btn-accent"
        style={{ justifyContent: "center", height: 44 }}
        disabled={state === "loading"}
      >
        {state === "loading" ? "Sending…" : "Send message"}{" "}
        {state !== "loading" && <I.ArrowRight size={14} />}
      </button>
      <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
        We use your message only to reply to you. See our{" "}
        <a href="/privacy" style={{ color: "var(--accent)" }}>
          privacy policy
        </a>
        .
      </p>
    </form>
  );
}

function FormInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }
) {
  const { label, ...rest } = props;
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input className="input" {...rest} style={{ width: "100%", height: 42 }} />
    </div>
  );
}

function FormSelect({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: string[];
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select
        name={name}
        className="input"
        defaultValue={options[0]}
        style={{ width: "100%", height: 42 }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function FormTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }
) {
  const { label, ...rest } = props;
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <textarea
        className="input"
        rows={6}
        {...rest}
        style={{ width: "100%", minHeight: 120, padding: 12, resize: "vertical" }}
      />
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 6,
  color: "var(--fg)",
};
