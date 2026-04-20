// components/workflow/MiniPreview.tsx
// Pure SVG preview of a macro graph. Used inside MacroCard on /macros.
// Safe to render on the server — no browser APIs, no state, no refs.

import * as React from "react";
import { NODE_TYPES, NODE_COLOR } from "@/lib/workflow/nodes";
import type { MacroNode, MacroEdge } from "@/lib/workflow/templates";

interface MiniPreviewProps {
  nodes: MacroNode[];
  edges: MacroEdge[];
  height?: number;
}

/**
 * Render a miniature, non-interactive preview of a macro graph.
 * Nodes become 40x36 rounded rects, edges become smooth bezier paths.
 */
export function MiniPreview({ nodes, edges, height = 140 }: MiniPreviewProps) {
  if (nodes.length === 0) return null;

  const maxX = Math.max(...nodes.map((n) => n.x)) + 60;
  const maxY = Math.max(...nodes.map((n) => n.y)) + 40;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${maxX} ${maxY}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ position: "absolute", inset: 0 }}
      aria-hidden="true"
    >
      {edges.map(([from, to], i) => {
        const a = nodes.find((n) => n.id === from);
        const b = nodes.find((n) => n.id === to);
        if (!a || !b) return null;
        const x1 = a.x + 40;
        const y1 = a.y + 18;
        const x2 = b.x;
        const y2 = b.y + 18;
        const cx = (x1 + x2) / 2;
        return (
          <path
            key={i}
            d={`M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`}
            stroke="var(--fg-subtle)"
            strokeWidth="1.2"
            fill="none"
            opacity="0.5"
          />
        );
      })}
      {nodes.map((n) => {
        const t = NODE_TYPES[n.type];
        const c = NODE_COLOR[t?.color ?? "mute"];
        return (
          <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
            <rect width="40" height="36" rx="6" fill={c.bg} stroke={c.border} strokeWidth="1" />
            <circle cx="20" cy="18" r="6" fill={c.fg} opacity="0.25" />
          </g>
        );
      })}
    </svg>
  );
}
