"use client";

// components/workflow/MacroLibrary.tsx
// Public Macros library — featured cards (start from scratch / describe to Agent),
// filter pills (All / Yours / Community), and a responsive grid of MacroCards.
// User-saved macros from localStorage are merged with the seeded MACRO_TEMPLATES
// and shown above the templates.
// Ported from the Claude Design handoff bundle (project/workflow.jsx, MacroLibrary).

import * as React from "react";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { MacroCard } from "./MacroCard";
import { MACRO_TEMPLATES, type MacroTemplate } from "@/lib/workflow/templates";
import { getUserMacros } from "@/lib/workflow/demo-state";

type FilterKey = "all" | "yours" | "community";

const FILTERS: Array<[FilterKey, string]> = [
  ["all", "All"],
  ["yours", "Yours"],
  ["community", "Community"],
];

export function MacroLibrary() {
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [userMacros, setUserMacros] = React.useState<MacroTemplate[]>([]);

  // Hydrate user macros from localStorage on mount
  React.useEffect(() => {
    setUserMacros(getUserMacros());
  }, []);

  // Merge user-saved macros with seeded templates (user macros first)
  const allMacros: MacroTemplate[] = React.useMemo(
    () => [...userMacros, ...MACRO_TEMPLATES],
    [userMacros]
  );

  const filtered = React.useMemo(
    () =>
      allMacros.filter((m) =>
        filter === "all" ? true : filter === "yours" ? m.author === "You" : m.author !== "You"
      ),
    [allMacros, filter]
  );

  return (
    <div className="container-x" style={{ padding: "48px 28px" }}>
      <div className="row" style={{ gap: 10, marginBottom: 16 }}>
        <span className="chip chip-new">
          <I.Sparkle size={10} /> NEW
        </span>
        <span className="eyebrow">WORKFLOW STUDIO</span>
      </div>

      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: 20,
          marginBottom: 32,
        }}
      >
        <div>
          <h1 style={{ fontSize: 40, margin: "0 0 8px", letterSpacing: "-0.02em" }}>Macros.</h1>
          <p className="muted" style={{ fontSize: 16, maxWidth: 560, margin: 0 }}>
            Chain tools into reusable workflows. Run on demand, on a schedule, or when a file lands
            in your inbox.
          </p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <div
            style={{
              display: "flex",
              background: "var(--bg-1)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 3,
            }}
          >
            {FILTERS.map(([k, l]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={"btn btn-sm " + (filter === k ? "btn-outline" : "btn-ghost")}
                style={{ height: 28 }}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Link href="/agent" className="btn btn-outline">
              <I.Sparkle size={14} /> Describe to Agent
            </Link>
            <Link href="/studio" className="btn btn-accent">
              <I.Plus size={14} /> New macro
            </Link>
          </div>
        </div>
      </div>

      {/* Featured: blank canvas + AI builder */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 12,
          marginBottom: 32,
        }}
      >
        <Link
          href="/studio"
          className="card card-hover"
          style={{
            padding: 24,
            textAlign: "left",
            cursor: "pointer",
            border: "1px dashed var(--border-strong)",
            background: "transparent",
            display: "block",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "var(--bg-2)",
              color: "var(--fg-muted)",
              display: "grid",
              placeItems: "center",
              marginBottom: 12,
            }}
          >
            <I.Plus size={20} />
          </div>
          <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 4 }}>Start from scratch</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Open the canvas. Drag tools in, connect them, run.
          </div>
        </Link>
        <Link
          href="/agent?saveAsMacro=1"
          className="card card-hover"
          style={{
            padding: 24,
            textAlign: "left",
            cursor: "pointer",
            background: "linear-gradient(135deg, var(--accent-soft), var(--bg-1))",
            borderColor: "var(--accent)",
            display: "block",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "var(--accent)",
              color: "var(--accent-fg, white)",
              display: "grid",
              placeItems: "center",
              marginBottom: 12,
            }}
          >
            <I.Sparkle size={20} />
          </div>
          <div className="row" style={{ gap: 6, marginBottom: 4 }}>
            <div style={{ fontWeight: 500, fontSize: 16 }}>Describe it to Agent</div>
            <span className="chip chip-new" style={{ fontSize: 10 }}>
              AI
            </span>
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            Type a sentence. Agent drafts the workflow and saves it here as a reusable macro.
          </div>
        </Link>
      </div>

      <div className="eyebrow" style={{ marginBottom: 16 }}>
        {filter === "yours" ? "YOUR MACROS" : "TEMPLATES"}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 12,
        }}
      >
        {filtered.map((m) => (
          <MacroCard key={m.id} macro={m} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="card" style={{ padding: 48, textAlign: "center", marginTop: 20 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "var(--bg-2)",
              color: "var(--fg-muted)",
              display: "grid",
              placeItems: "center",
              margin: "0 auto 12px",
            }}
          >
            <I.Flow size={22} />
          </div>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            {filter === "yours" ? "No saved macros yet" : "Nothing matches this filter"}
          </div>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 16px" }}>
            {filter === "yours"
              ? "Save a workflow from the canvas, or describe one to Agent."
              : "Try a different filter, or create your own."}
          </p>
          <Link href="/studio" className="btn btn-accent">
            New macro
          </Link>
        </div>
      )}
    </div>
  );
}
