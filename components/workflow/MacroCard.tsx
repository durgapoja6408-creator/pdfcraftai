// components/workflow/MacroCard.tsx
// Renders a single macro template as a clickable card linking to /studio?t=<id>.
// Server-safe: uses Next.js <Link>, no React state.

import * as React from "react";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { MiniPreview } from "./MiniPreview";
import type { MacroTemplate } from "@/lib/workflow/templates";

interface MacroCardProps {
  macro: MacroTemplate;
}

export function MacroCard({ macro }: MacroCardProps) {
  const Ic = (I as Record<string, React.FC<{ size?: number }>>)[macro.icon] ?? I.Flow;
  return (
    <Link
      href={`/studio?t=${encodeURIComponent(macro.id)}`}
      className="card card-hover"
      style={{
        padding: 0,
        textAlign: "left",
        cursor: "pointer",
        overflow: "hidden",
        display: "block",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      {/* Mini canvas preview */}
      <div
        style={{
          height: 140,
          background: "var(--bg)",
          borderBottom: "1px solid var(--border)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div className="grid-bg" style={{ position: "absolute", inset: 0, opacity: 0.4 }} />
        <MiniPreview nodes={macro.nodes} edges={macro.edges} />
      </div>
      <div style={{ padding: 18 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "var(--accent-soft)",
                color: "var(--accent)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Ic size={15} />
            </div>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{macro.name}</div>
              <div className="mono subtle" style={{ fontSize: 11 }}>
                by {macro.author}
              </div>
            </div>
          </div>
          {macro.author === "You" && (
            <span className="chip" style={{ fontSize: 10 }}>
              Private
            </span>
          )}
        </div>
        <p
          className="muted"
          style={{ fontSize: 12, lineHeight: 1.5, margin: "0 0 14px", minHeight: 36 }}
        >
          {macro.desc}
        </p>
        <div className="row" style={{ justifyContent: "space-between", fontSize: 11 }}>
          <span className="mono subtle">
            <I.Play size={10} /> {macro.runs} runs
          </span>
          <span className="mono subtle">{macro.time}</span>
          <span className="mono" style={{ color: "var(--accent)" }}>
            {macro.creditsPerRun} cr/run
          </span>
        </div>
      </div>
    </Link>
  );
}
