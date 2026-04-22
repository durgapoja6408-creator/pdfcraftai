// components/admin/ui.tsx — shared presentational primitives used across
// every /admin/* page. Putting them here (instead of inlining in each
// page or re-exporting from one of the pages) keeps each page file
// focused on the *query-to-table* wiring rather than repeating table
// chrome.
//
// All components are pure presentation — no data fetching, no state —
// so they can freely be used in server components.

import type { CSSProperties, ReactNode } from "react";

export const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
};

/**
 * <StatCard> — labelled "headline number" card. Used on Overview, each
 * detail page's summary strip, and anywhere else we want a one-glance
 * metric. `tone` paints the number green/yellow/red.
 */
export function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn" | "bad";
}) {
  const toneColor =
    tone === "good"
      ? "#2f855a"
      : tone === "bad"
        ? "#b23b3b"
        : tone === "warn"
          ? "#b7791f"
          : undefined;
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="subtle" style={{ fontSize: 12, marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: -0.3,
          color: toneColor,
        }}
      >
        {value}
      </div>
      {hint ? (
        <div className="subtle" style={{ fontSize: 12, marginTop: 6 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

/**
 * <ErrorBanner> — compact "query failed" strip rendered above a
 * section when its loader returned an `error`. Keeps the rest of the
 * page usable instead of killing the whole render.
 */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="card"
      style={{
        padding: 12,
        marginBottom: 16,
        borderColor: "#b23b3b",
        color: "#b23b3b",
      }}
    >
      {message}
    </div>
  );
}

export function Th({
  children,
  align,
}: {
  children: ReactNode;
  align?: "right" | "left" | "center";
}) {
  return (
    <th
      style={{
        padding: "10px 12px",
        textAlign: align ?? "left",
        borderBottom: "1px solid var(--border)",
        fontWeight: 600,
        background: "var(--bg-2)",
        position: "sticky",
        top: 0,
      }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align,
  colSpan,
  mono,
}: {
  children: ReactNode;
  align?: "right" | "left" | "center";
  colSpan?: number;
  mono?: boolean;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        padding: "8px 12px",
        textAlign: align ?? "left",
        borderBottom: "1px solid var(--border)",
        fontFamily: mono
          ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
          : undefined,
      }}
    >
      {children}
    </td>
  );
}

/**
 * <DayPicker> — query-string day-window switcher. All detail pages that
 * accept a ?days= param use this. The active option is highlighted.
 */
export function DayPicker({
  current,
  base,
}: {
  current: number;
  base: string;
}) {
  const options = [7, 14, 30, 60, 90];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((d) => (
        <a
          key={d}
          href={`${base}?days=${d}`}
          className={d === current ? "btn btn-primary btn-sm" : "btn btn-sm"}
        >
          {d}d
        </a>
      ))}
    </div>
  );
}

/**
 * clampDays — treat an untrusted ?days= query string as a positive
 * integer in [1, 365], defaulting to 30 when missing/invalid. Used by
 * every detail page that accepts the parameter.
 */
export function clampDays(raw: string | undefined, fallback = 30): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 365);
}

/**
 * Compact "section title" wrapper. Keeps spacing identical across
 * pages without requiring h2 style overrides on each caller.
 */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 style={{ fontSize: 18, marginBottom: 8 }}>{children}</h2>;
}
