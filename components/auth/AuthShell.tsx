import Link from "next/link";
import type { ReactNode } from "react";
import { I } from "@/components/icons/Icons";

/**
 * Two-pane auth shell.
 *
 * Left: the form card (centered, bounded width), with a back-to-home logo
 * link and an aftercard footer (sign-in / sign-up switch). The left pane
 * is the ONLY column shown on narrow viewports.
 *
 * Right: marketing panel with value-props, trust badges, and a testimonial.
 * Hidden below ~960px to keep the mobile auth flow pristine.
 */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  sidePanel = "default",
}: {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Swap the right-pane copy: register vs. login vs. forgot-password */
  sidePanel?: "default" | "register" | "forgot";
}) {
  return (
    <main
      className="auth-shell"
      style={{
        minHeight: "100dvh",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr)",
        background: "var(--bg)",
      }}
    >
      {/* LEFT: form column */}
      <section
        style={{
          display: "grid",
          placeItems: "center",
          padding: "48px 24px",
          position: "relative",
        }}
      >
        <div style={{ width: "100%", maxWidth: 440 }}>
          <Link
            href="/"
            className="logo"
            style={{ marginBottom: 40, justifyContent: "flex-start" }}
          >
            <span className="logo-mark">P</span>
            <span>
              pdfcraft<span style={{ color: "var(--accent)" }}>ai</span>
            </span>
          </Link>

          <div
            className="card"
            style={{
              padding: 32,
              border: "1px solid var(--border-strong, var(--border))",
              boxShadow: "var(--shadow-lg, var(--shadow))",
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              {eyebrow}
            </div>
            <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", marginBottom: 8 }}>
              {title}
            </h1>
            {subtitle && (
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 24 }}>
                {subtitle}
              </p>
            )}
            {children}
          </div>

          {footer && (
            <p className="muted" style={{ fontSize: 13, textAlign: "center", marginTop: 24 }}>
              {footer}
            </p>
          )}

          <div
            className="row"
            style={{
              justifyContent: "center",
              gap: 16,
              marginTop: 20,
              fontSize: 12,
              color: "var(--fg-subtle)",
              flexWrap: "wrap",
            }}
          >
            <span className="row" style={{ gap: 6 }}>
              <I.Shield size={12} /> SOC 2 · ISO 27001
            </span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span className="row" style={{ gap: 6 }}>
              <I.Check size={12} /> Files auto-delete in 60 min
            </span>
          </div>
        </div>
      </section>

      {/* RIGHT: marketing panel */}
      <aside className="auth-side">
        <div className="grid-bg" style={{ position: "absolute", inset: 0, opacity: 0.35 }} />
        <div
          style={{
            position: "absolute",
            top: "-20%",
            right: "-10%",
            width: 600,
            height: 600,
            background:
              "radial-gradient(ellipse, color-mix(in oklab, var(--accent) 22%, transparent), transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 460 }}>
          <div className="row" style={{ gap: 8, marginBottom: 20 }}>
            <span className="chip chip-new">
              <I.Sparkle size={10} /> NEW
            </span>
            <span className="eyebrow">AGENT MODE LIVE</span>
          </div>

          <h2 style={{ fontSize: 36, lineHeight: 1.15, letterSpacing: "-0.02em", marginBottom: 18 }}>
            {sidePanel === "register"
              ? "Your documents, on autopilot."
              : sidePanel === "forgot"
              ? "Forgot a password? It happens."
              : "Welcome back to your PDF workspace."}
          </h2>
          <p className="muted" style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 32 }}>
            {sidePanel === "register"
              ? "Join 40,000+ people using pdfcraft ai to merge, convert, chat, and automate — all in one place."
              : sidePanel === "forgot"
              ? "We'll email you a secure reset link. Make it strong this time — or use Google and skip passwords altogether."
              : "Every PDF tool you need, plus the ones you didn't know existed. Free tools stay free. AI costs credits — no subscription required."}
          </p>

          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gap: 14,
              marginBottom: 36,
            }}
          >
            {[
              ["Sparkle", "AI Chat, Summarize, Translate, OCR, Redact"],
              ["Flow", "Workflow Studio + Agent for multi-step tasks"],
              ["Shield", "Private mode · DPA available · Zero training on your data"],
              ["Check", "16 tools. 8 free forever. No credit card."],
            ].map(([icon, text]) => {
              const Ic = I[icon as keyof typeof I];
              return (
                <li key={text} className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      flexShrink: 0,
                      borderRadius: 8,
                      background: "var(--bg-2)",
                      border: "1px solid var(--border)",
                      color: "var(--accent)",
                      display: "grid",
                      placeItems: "center",
                      marginTop: 1,
                    }}
                  >
                    <Ic size={14} />
                  </span>
                  <span style={{ fontSize: 14, lineHeight: 1.5 }}>{text}</span>
                </li>
              );
            })}
          </ul>

          {/* Testimonial */}
          <figure
            className="card"
            style={{
              padding: 20,
              background:
                "linear-gradient(135deg, color-mix(in oklab, var(--accent) 6%, var(--bg-1)), var(--bg-1))",
              marginBottom: 24,
            }}
          >
            <blockquote
              style={{
                margin: 0,
                fontSize: 14,
                lineHeight: 1.55,
                fontStyle: "italic",
                color: "var(--fg)",
              }}
            >
              &ldquo;We replaced three tools with pdfcraft ai. The Agent mode alone saves my
              paralegal 6 hours a week.&rdquo;
            </blockquote>
            <figcaption
              className="row"
              style={{ gap: 10, marginTop: 14, fontSize: 12, color: "var(--fg-subtle)" }}
            >
              <span
                aria-hidden
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  color: "var(--accent-fg)",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                M
              </span>
              <span>
                <strong style={{ color: "var(--fg)" }}>Maya K.</strong> — Senior counsel, mid-sized
                firm
              </span>
            </figcaption>
          </figure>

          {/* Compliance badges */}
          <div
            className="row"
            style={{ gap: 8, flexWrap: "wrap", color: "var(--fg-subtle)", fontSize: 11 }}
          >
            {["SOC 2", "ISO 27001", "GDPR", "HIPAA*"].map((b) => (
              <span
                key={b}
                className="mono"
                style={{
                  padding: "5px 10px",
                  border: "1px solid var(--border)",
                  borderRadius: 999,
                  background: "var(--bg-1)",
                }}
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      </aside>

      <style>{`
        .auth-side { display: none; }
        @media (min-width: 960px) {
          .auth-shell { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; }
          .auth-side {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 56px 48px;
            position: relative;
            overflow: hidden;
            background: var(--bg-1);
            border-left: 1px solid var(--border);
          }
        }
      `}</style>
    </main>
  );
}
