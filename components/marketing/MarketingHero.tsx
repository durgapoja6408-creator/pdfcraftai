import Link from "next/link";
import type { ReactNode } from "react";
import { I } from "@/components/icons/Icons";

/**
 * Reusable marketing hero block — eyebrow chip, large headline, subhead,
 * dual CTAs, optional decorative grid + radial accent. Used by /bulk,
 * /about, /contact, etc. Keeps copy out of the component.
 */
export function MarketingHero({
  chip,
  eyebrow,
  title,
  subtitle,
  primaryCta,
  secondaryCta,
}: {
  chip?: { label: string; tone?: "new" | "ai" | "free" };
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  primaryCta?: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
}) {
  const chipClass =
    chip?.tone === "ai"
      ? "chip chip-ai"
      : chip?.tone === "free"
      ? "chip chip-free"
      : "chip chip-new";

  return (
    <section style={{ position: "relative", overflow: "hidden" }}>
      <div className="grid-bg" style={{ position: "absolute", inset: 0, opacity: 0.4 }} />
      <div
        style={{
          position: "absolute",
          top: "-20%",
          left: "50%",
          transform: "translateX(-50%)",
          maxWidth: "100%",
          width: 900,
          height: 500,
          background:
            "radial-gradient(ellipse, color-mix(in oklab, var(--accent) 18%, transparent), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        className="container-x"
        style={{ position: "relative", padding: "96px 28px 56px", textAlign: "center" }}
      >
        {(chip || eyebrow) && (
          <div className="row" style={{ justifyContent: "center", gap: 10, marginBottom: 24 }}>
            {chip && (
              <span className={chipClass}>
                <I.Sparkle size={10} /> {chip.label}
              </span>
            )}
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          </div>
        )}

        {/* Bundle G2 (2026-04-26): migrated from inline styles to the
            standardized hero-major / hero-sub typography tier classes
            so /bulk, /about, /contact (and any future MarketingHero
            consumer) all use the same scale + mobile step-downs as
            /pricing, /use-cases, /alternatives. */}
        <h1 className="hero-major" style={{ maxWidth: 880, margin: "0 auto" }}>
          {title}
        </h1>

        {subtitle && (
          <p className="hero-sub" style={{ maxWidth: 620, margin: "24px auto 0" }}>
            {subtitle}
          </p>
        )}

        {(primaryCta || secondaryCta) && (
          <div className="row" style={{ justifyContent: "center", gap: 12, marginTop: 36 }}>
            {primaryCta && (
              <Link href={primaryCta.href} className="btn btn-lg btn-accent">
                {primaryCta.label} <I.ArrowRight size={16} />
              </Link>
            )}
            {secondaryCta && (
              <Link href={secondaryCta.href} className="btn btn-lg btn-outline">
                {secondaryCta.label}
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
