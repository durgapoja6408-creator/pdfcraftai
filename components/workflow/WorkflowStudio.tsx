"use client";

// components/workflow/WorkflowStudio.tsx
// Public, demo-mode Workflow Studio (Claude Design parity port). Stateless
// client demo, no auth, no DB:
//  • Loads a template via ?t=<id> (or starts from Invoice Intake by default)
//  • Drag nodes to reposition; drag the right handle to connect
//  • Click an edge to delete it; click a node to inspect & configure
//  • Mocked Run executes the plan in topological-ish order with a terminal log
//  • Save Macro persists the current graph to localStorage as a "Yours" macro
// Ported from the Claude Design handoff bundle (project/workflow.jsx).

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { I } from "@/components/icons/Icons";
import {
  NODE_TYPES,
  NODE_COLOR,
  NODE_CATEGORIES,
  type NodeTypeId,
} from "@/lib/workflow/nodes";
import {
  MACRO_TEMPLATES,
  getTemplateById,
  type MacroNode,
  type MacroEdge,
} from "@/lib/workflow/templates";
import {
  getDemoCredits,
  spendDemoCredits,
  addDemoHistory,
  addUserMacro,
} from "@/lib/workflow/demo-state";

interface RunState {
  step: number;            // -1 before first step or after done
  log: string[];
  done: boolean;
  order: string[];         // topo-ish ordered node ids
}

const NODE_W = 200;
const NODE_HANDLE_Y_OFFSET = 30; // visually centers handles on header row
const NODE_BODY_Y_OFFSET = 34;   // for SVG endpoints

// ----------------------------------------------------------------------------
// NodeInspector
// ----------------------------------------------------------------------------

interface NodeInspectorProps {
  node: MacroNode;
  onDelete: () => void;
  onClose: () => void;
}

function NodeInspector({ node, onDelete, onClose }: NodeInspectorProps) {
  const t = NODE_TYPES[node.type];
  if (!t) return null;
  const Ic = (I as Record<string, React.FC<{ size?: number }>>)[t.icon] ?? I.Sparkle;
  const c = NODE_COLOR[t.color];
  return (
    <div
      style={{
        width: 320,
        borderLeft: "1px solid var(--border)",
        background: "var(--bg-1)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        className="row"
        style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", gap: 8 }}
      >
        <span className="mono" style={{ fontSize: 11 }}>INSPECTOR</span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close inspector">
          <I.X size={12} />
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        <div className="row" style={{ gap: 12, marginBottom: 18 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: c.bg,
              color: c.fg,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Ic size={22} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{t.name}</div>
            <div className="mono subtle" style={{ fontSize: 11 }}>
              {t.cat.toUpperCase()}
              {t.cost ? ` · ${t.cost} CR` : ""}
            </div>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 20px" }}>{t.desc}</p>

        {/* Config fields (mocked per type) */}
        <div className="col" style={{ gap: 14 }}>
          {node.type === "ai_translate" && (
            <div>
              <label className="label-x">Target language</label>
              <select className="select" defaultValue="Spanish">
                <option>Spanish</option>
                <option>French</option>
                <option>Japanese</option>
                <option>German</option>
              </select>
            </div>
          )}
          {node.type === "ai_sum" && (
            <div>
              <label className="label-x">Summary style</label>
              <select className="select" defaultValue="Executive · 3 paragraphs">
                <option>Executive · 3 paragraphs</option>
                <option>Bullets</option>
                <option>One-liner</option>
              </select>
            </div>
          )}
          {node.type === "ai_redact" && (
            <div>
              <label className="label-x">Redact types</label>
              <div className="col" style={{ gap: 6 }}>
                {["Emails", "Phones", "SSNs", "Credit cards", "Names", "Addresses"].map((x) => (
                  <label key={x} className="row" style={{ fontSize: 13, gap: 8 }}>
                    <input
                      type="checkbox"
                      defaultChecked={["Emails", "SSNs", "Credit cards"].includes(x)}
                    />
                    {x}
                  </label>
                ))}
              </div>
            </div>
          )}
          {node.type === "email_out" && (
            <>
              <div>
                <label className="label-x">To</label>
                <input className="input" defaultValue="priya@studio.co" />
              </div>
              <div>
                <label className="label-x">Subject template</label>
                <input className="input" defaultValue="Report ready — {{file.name}}" />
              </div>
            </>
          )}
          {node.type === "slack" && (
            <>
              <div>
                <label className="label-x">Channel</label>
                <input className="input" defaultValue="#ops-pdfs" />
              </div>
              <div>
                <label className="label-x">Message</label>
                <textarea
                  className="textarea"
                  rows={3}
                  defaultValue="New report landed: {{file.name}}"
                />
              </div>
            </>
          )}
          {node.type === "protect" && (
            <div>
              <label className="label-x">Password source</label>
              <select className="select" defaultValue="Auto-generate (copy to clipboard)">
                <option>Auto-generate (copy to clipboard)</option>
                <option>Use env var</option>
                <option>Fixed</option>
              </select>
            </div>
          )}
          {node.type === "watch" && (
            <>
              <div>
                <label className="label-x">Source</label>
                <select className="select" defaultValue="Google Drive">
                  <option>Google Drive</option>
                  <option>Dropbox</option>
                  <option>OneDrive</option>
                  <option>S3 bucket</option>
                </select>
              </div>
              <div>
                <label className="label-x">Folder path</label>
                <input className="input" defaultValue="/Invoices/Incoming" />
              </div>
            </>
          )}
          {node.type === "if_cond" && (
            <>
              <div>
                <label className="label-x">Condition</label>
                <input className="input" defaultValue="file.pages > 10" />
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Outputs: <span className="mono">true</span> / <span className="mono">false</span>{" "}
                branches
              </div>
            </>
          )}
          {node.type === "schedule" && (
            <div>
              <label className="label-x">Frequency</label>
              <select className="select" defaultValue="Daily at 9:00">
                <option>Daily at 9:00</option>
                <option>Weekly · Monday 9:00</option>
                <option>Monthly · 1st</option>
                <option>Custom cron</option>
              </select>
            </div>
          )}
          {/* Default field shown always */}
          <div>
            <label className="label-x">On error</label>
            <select className="select" defaultValue="Stop workflow">
              <option>Stop workflow</option>
              <option>Skip this step</option>
              <option>Retry 3×</option>
              <option>Send to manual queue</option>
            </select>
          </div>
        </div>

        <div className="divider" style={{ margin: "24px 0 18px" }} />
        <div className="eyebrow" style={{ marginBottom: 10 }}>INPUTS</div>
        <div className="card" style={{ padding: 10, background: "var(--bg)" }}>
          <pre
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--fg-muted)",
              margin: 0,
              whiteSpace: "pre-wrap",
            }}
          >
{`{
  "file": { "name": "Q3-Report.pdf", "pages": 18 },
  "prev": "ocr_output"
}`}
          </pre>
        </div>

        <div className="divider" style={{ margin: "20px 0" }} />
        <button
          className="btn btn-danger"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={onDelete}
        >
          <I.Trash size={12} /> Delete node
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// RunLog
// ----------------------------------------------------------------------------

interface RunLogProps {
  state: RunState;
  onClose: () => void;
}

function RunLog({ state, onClose }: RunLogProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [state.log, collapsed]);

  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 12,
        background: "var(--bg-1)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        boxShadow: "var(--shadow-lg)",
        zIndex: 10,
        overflow: "hidden",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="row"
        style={{
          padding: "10px 14px",
          borderBottom: collapsed ? "none" : "1px solid var(--border)",
          background: "var(--bg-2)",
          gap: 10,
        }}
      >
        <I.Terminal size={13} />
        <span className="mono" style={{ fontSize: 11 }}>RUN LOG</span>
        {!state.done ? (
          <>
            <I.Sparkle size={11} />
            <span className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>
              RUNNING
            </span>
          </>
        ) : (
          <>
            <I.Check size={11} />
            <span className="mono" style={{ fontSize: 11, color: "var(--green)" }}>
              DONE
            </span>
          </>
        )}
        <div style={{ flex: 1 }} />
        <span className="mono subtle" style={{ fontSize: 10 }}>
          {state.log.length} lines
        </span>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand log" : "Collapse log"}
        >
          <I.ChevronDown
            size={12}
            // visual rotate via inline style — Icons.tsx Chevrons accept size only
          />
        </button>
        <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close log">
          <I.X size={12} />
        </button>
      </div>
      {!collapsed && (
        <div
          ref={ref}
          style={{
            padding: "12px 16px",
            maxHeight: 200,
            overflow: "auto",
            background: "var(--bg)",
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontSize: 12,
            lineHeight: 1.7,
          }}
        >
          {state.log.map((l, i) => (
            <div
              key={i}
              style={{
                color: l.startsWith(">")
                  ? "var(--accent)"
                  : l.startsWith("✓") || l.startsWith("  ✓")
                  ? "var(--green)"
                  : l.startsWith("→")
                  ? "var(--fg-muted)"
                  : "var(--fg)",
              }}
            >
              {l || "\u00A0"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// WorkflowStudio (default export)
// ----------------------------------------------------------------------------

export default function WorkflowStudio() {
  const router = useRouter();
  const params = useSearchParams();
  const templateId = params?.get("t") ?? null;

  const initial = React.useMemo(
    () => getTemplateById(templateId) ?? MACRO_TEMPLATES[0]!,
    [templateId]
  );

  const [nodes, setNodes] = React.useState<MacroNode[]>(() =>
    initial.nodes.map((n) => ({ ...n }))
  );
  const [edges, setEdges] = React.useState<MacroEdge[]>(() =>
    initial.edges.map((e) => [...e] as MacroEdge)
  );
  const [selected, setSelected] = React.useState<string | null>(null);
  const [panelOpen, setPanelOpen] = React.useState<"tools" | "inspector" | null>("tools");
  const [runState, setRunState] = React.useState<RunState | null>(null);
  const [name, setName] = React.useState<string>(initial.name);
  const [connecting, setConnecting] = React.useState<{ fromId: string; x: number; y: number } | null>(
    null
  );
  const [credits, setCredits] = React.useState<number>(0);
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const tickTimers = React.useRef<Array<ReturnType<typeof setTimeout>>>([]);

  // Hydrate credits from localStorage on mount
  React.useEffect(() => {
    setCredits(getDemoCredits());
  }, []);

  // Cleanup timers on unmount
  React.useEffect(
    () => () => {
      tickTimers.current.forEach((t) => clearTimeout(t));
      tickTimers.current = [];
    },
    []
  );

  const totalCredits = React.useMemo(
    () =>
      nodes.reduce((sum, n) => {
        const t = NODE_TYPES[n.type];
        return sum + (t?.cost ?? 0);
      }, 0),
    [nodes]
  );

  const addNode = (type: NodeTypeId) => {
    const id = "n" + Date.now().toString(36);
    setNodes((ns) => [
      ...ns,
      { id, type, x: 240 + Math.random() * 60, y: 220 + Math.random() * 60 },
    ]);
  };

  const onNodeMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelected(id);
    setPanelOpen("inspector");
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = node.x;
    const origY = node.y;
    const move = (ev: MouseEvent) => {
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id
            ? { ...n, x: origX + (ev.clientX - startX), y: origY + (ev.clientY - startY) }
            : n
        )
      );
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const startConnect = (e: React.MouseEvent, fromId: string) => {
    e.stopPropagation();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scrollLeft = canvasRef.current.scrollLeft;
    const scrollTop = canvasRef.current.scrollTop;
    setConnecting({
      fromId,
      x: e.clientX - rect.left + scrollLeft,
      y: e.clientY - rect.top + scrollTop,
    });
    const move = (ev: MouseEvent) => {
      if (!canvasRef.current) return;
      const r = canvasRef.current.getBoundingClientRect();
      setConnecting((c) =>
        c
          ? {
              ...c,
              x: ev.clientX - r.left + canvasRef.current!.scrollLeft,
              y: ev.clientY - r.top + canvasRef.current!.scrollTop,
            }
          : null
      );
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      // find node under cursor
      const target = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const toNode = target?.closest("[data-node-id]") as HTMLElement | null;
      if (toNode) {
        const toId = toNode.getAttribute("data-node-id");
        if (toId && toId !== fromId) {
          setEdges((es) =>
            es.some(([a, b]) => a === fromId && b === toId)
              ? es
              : ([...es, [fromId, toId]] as MacroEdge[])
          );
        }
      }
      setConnecting(null);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const deleteNode = (id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter(([a, b]) => a !== id && b !== id));
    setSelected(null);
    setPanelOpen("tools");
  };

  const deleteEdge = (i: number) => setEdges((es) => es.filter((_, x) => x !== i));

  const run = () => {
    if (credits < totalCredits) {
      const ok =
        typeof window !== "undefined" &&
        window.confirm(
          `This workflow needs ${totalCredits} credits but you only have ${credits}. Open pricing?`
        );
      if (ok) router.push("/pricing");
      return;
    }
    // Topological-ish order: walk roots → followed edges, then catch orphans
    const order: string[] = [];
    const visited = new Set<string>();
    const roots = nodes.filter((n) => !edges.some(([, to]) => to === n.id));
    const walk = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      order.push(id);
      edges.filter(([from]) => from === id).forEach(([, to]) => walk(to));
    };
    roots.forEach((r) => walk(r.id));
    nodes.forEach((n) => walk(n.id));

    setRunState({
      step: -1,
      log: [
        `> Run workflow: ${name}`,
        `→ ${nodes.length} nodes · ${edges.length} connections`,
      ],
      done: false,
      order,
    });

    let i = 0;
    const tick = () => {
      if (i >= order.length) {
        const after = spendDemoCredits(totalCredits);
        setCredits(after);
        addDemoHistory({ tool: "Workflow", file: name, credits: totalCredits });
        setRunState((s) =>
          s
            ? {
                ...s,
                step: -1,
                done: true,
                log: [...s.log, `✓ workflow complete · ${totalCredits} credits used`],
              }
            : s
        );
        return;
      }
      const nodeId = order[i]!;
      const node = nodes.find((n) => n.id === nodeId);
      const t = node ? NODE_TYPES[node.type] : undefined;
      if (!t) {
        i++;
        const next = setTimeout(tick, 100);
        tickTimers.current.push(next);
        return;
      }
      const stepIdx = i;
      setRunState((s) =>
        s
          ? {
              ...s,
              step: stepIdx,
              log: [
                ...s.log,
                `  [${stepIdx + 1}/${order.length}] ${t.name}${t.cost ? ` (${t.cost} cr)` : ""}`,
              ],
            }
          : s
      );
      const t1 = setTimeout(() => {
        setRunState((s) => (s ? { ...s, log: [...s.log, `  ✓ ${t.desc}`] } : s));
        i++;
        const t2 = setTimeout(tick, 380);
        tickTimers.current.push(t2);
      }, 850);
      tickTimers.current.push(t1);
    };
    tick();
  };

  const saveMacro = () => {
    if (nodes.length === 0) return;
    const macro = addUserMacro({
      name: name || "Untitled macro",
      desc: `Custom workflow · ${nodes.length} steps · ${totalCredits} cr/run`,
      icon: "Flow",
      creditsPerRun: totalCredits,
      nodes,
      edges,
    });
    if (typeof window !== "undefined") {
      window.alert(`Saved as "${macro.name}". You'll find it under Macros → Yours.`);
    }
    router.push("/macros");
  };

  const selectedNode = nodes.find((n) => n.id === selected) ?? null;

  return (
    <div
      style={{
        height: "calc(100vh - 64px)", // assumes ~64px TopNav
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Top bar */}
      <div
        className="row"
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-1)",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Link href="/macros" className="btn btn-sm btn-ghost">
          <I.ArrowLeft size={14} /> Macros
        </Link>
        <div style={{ width: 1, height: 20, background: "var(--border)" }} />
        <I.Flow size={14} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Macro name"
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--fg)",
            fontSize: 14,
            fontWeight: 500,
            width: 240,
          }}
        />
        <span className="chip" style={{ fontSize: 10 }}>Draft</span>
        <div style={{ flex: 1 }} />
        <span className="mono subtle" style={{ fontSize: 11 }}>
          {nodes.length} nodes · {edges.length} edges
        </span>
        <span className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>
          ~{totalCredits} credits / run
        </span>
        <span className="mono subtle" style={{ fontSize: 11 }}>
          · {credits} cr left
        </span>
        <div style={{ width: 1, height: 20, background: "var(--border)" }} />
        <button className="btn btn-sm btn-ghost" disabled title="Coming soon">
          <I.Clock size={12} /> Schedule
        </button>
        <button className="btn btn-sm btn-outline" onClick={saveMacro}>
          <I.Star size={12} /> Save macro
        </button>
        <button
          className="btn btn-sm btn-accent"
          onClick={run}
          disabled={!!runState && !runState.done}
        >
          <I.Play size={11} />{" "}
          {runState && !runState.done ? "Running…" : "Run"}
        </button>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        {/* Left: tool palette */}
        {panelOpen === "tools" && (
          <div
            style={{
              width: 260,
              borderRight: "1px solid var(--border)",
              background: "var(--bg-1)",
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
            }}
          >
            <div
              className="row"
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border)",
                gap: 8,
              }}
            >
              <span className="mono" style={{ fontSize: 11 }}>TOOLBOX</span>
              <div style={{ flex: 1 }} />
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setPanelOpen(null)}
                aria-label="Hide toolbox"
              >
                <I.X size={12} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
              {NODE_CATEGORIES.map((cat) => {
                const tools = Object.entries(NODE_TYPES).filter(([, t]) => t.cat === cat);
                if (tools.length === 0) return null;
                return (
                  <div key={cat} style={{ padding: "6px 12px 10px" }}>
                    <div className="eyebrow" style={{ padding: "6px 4px" }}>
                      {cat}
                    </div>
                    <div className="col" style={{ gap: 2 }}>
                      {tools.map(([id, t]) => {
                        const Ic =
                          (I as Record<string, React.FC<{ size?: number }>>)[t.icon] ?? I.Sparkle;
                        const c = NODE_COLOR[t.color];
                        return (
                          <button
                            key={id}
                            className="row"
                            onClick={() => addNode(id as NodeTypeId)}
                            style={{
                              padding: "8px 8px",
                              background: "transparent",
                              borderRadius: 6,
                              gap: 10,
                              cursor: "pointer",
                              border: "1px solid transparent",
                              width: "100%",
                              textAlign: "left",
                              color: "inherit",
                            }}
                          >
                            <div
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: 5,
                                background: c.bg,
                                color: c.fg,
                                display: "grid",
                                placeItems: "center",
                                flexShrink: 0,
                              }}
                            >
                              <Ic size={12} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                              <div style={{ fontSize: 12, fontWeight: 500 }}>{t.name}</div>
                              <div
                                className="muted"
                                style={{
                                  fontSize: 10,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {t.desc}
                              </div>
                            </div>
                            {t.cost && (
                              <span
                                className="mono"
                                style={{ fontSize: 9, color: "var(--accent)" }}
                              >
                                {t.cost}cr
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {panelOpen !== "tools" && (
          <button
            className="btn btn-ghost"
            onClick={() => setPanelOpen("tools")}
            style={{
              position: "absolute",
              left: 12,
              top: 12,
              zIndex: 5,
              background: "var(--bg-1)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "6px 10px",
            }}
          >
            <I.Plus size={12} /> Add node
          </button>
        )}

        {/* Canvas */}
        <div
          ref={canvasRef}
          onMouseDown={() => {
            setSelected(null);
            if (panelOpen === "inspector") setPanelOpen("tools");
          }}
          style={{
            flex: 1,
            position: "relative",
            overflow: "auto",
            background: "var(--bg)",
          }}
        >
          <div
            className="grid-bg"
            style={{ position: "absolute", inset: 0, opacity: 0.45, pointerEvents: "none" }}
          />
          <div style={{ position: "relative", width: 2000, height: 1200 }}>
            {/* Edges SVG */}
            <svg
              width={2000}
              height={1200}
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            >
              <defs>
                <marker
                  id="ws-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--fg-muted)" />
                </marker>
                <marker
                  id="ws-arrow-active"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
                </marker>
              </defs>
              {edges.map(([from, to], i) => {
                const a = nodes.find((n) => n.id === from);
                const b = nodes.find((n) => n.id === to);
                if (!a || !b) return null;
                const x1 = a.x + NODE_W;
                const y1 = a.y + NODE_BODY_Y_OFFSET;
                const x2 = b.x;
                const y2 = b.y + NODE_BODY_Y_OFFSET;
                const cx = (x1 + x2) / 2;
                const orderIdx = runState?.order?.indexOf(from) ?? -1;
                const active =
                  !!runState && orderIdx >= 0 && orderIdx < runState.step;
                return (
                  <g key={i}>
                    <path
                      d={`M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`}
                      stroke={active ? "var(--accent)" : "var(--fg-muted)"}
                      strokeWidth="1.8"
                      fill="none"
                      markerEnd={`url(#${active ? "ws-arrow-active" : "ws-arrow"})`}
                      style={{ pointerEvents: "stroke", cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteEdge(i);
                      }}
                    />
                  </g>
                );
              })}
              {/* Active connection in progress */}
              {connecting &&
                (() => {
                  const a = nodes.find((n) => n.id === connecting.fromId);
                  if (!a) return null;
                  return (
                    <path
                      d={`M ${a.x + NODE_W} ${a.y + NODE_BODY_Y_OFFSET} L ${connecting.x} ${connecting.y}`}
                      stroke="var(--accent)"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                      fill="none"
                    />
                  );
                })()}
            </svg>

            {/* Nodes */}
            {nodes.map((n) => {
              const t = NODE_TYPES[n.type];
              if (!t) return null;
              const Ic = (I as Record<string, React.FC<{ size?: number }>>)[t.icon] ?? I.Sparkle;
              const c = NODE_COLOR[t.color];
              const orderIdx = runState?.order?.indexOf(n.id) ?? -1;
              const isActive = !!runState && orderIdx === runState.step;
              const isDone = !!runState && orderIdx >= 0 && orderIdx < runState.step;
              const isSel = selected === n.id;
              const borderColor = isSel
                ? "var(--accent)"
                : isActive
                ? "var(--accent)"
                : isDone
                ? "var(--green)"
                : "var(--border-strong)";
              return (
                <div
                  key={n.id}
                  data-node-id={n.id}
                  onMouseDown={(e) => onNodeMouseDown(e, n.id)}
                  className={isActive ? "pulse-soft" : ""}
                  style={{
                    position: "absolute",
                    left: n.x,
                    top: n.y,
                    width: NODE_W,
                    background: "var(--bg-1)",
                    border: "1.5px solid " + borderColor,
                    borderRadius: 10,
                    padding: "10px 12px",
                    cursor: "grab",
                    userSelect: "none",
                    boxShadow: isSel
                      ? "0 0 0 3px color-mix(in oklab, var(--accent) 20%, transparent)"
                      : "var(--shadow-sm)",
                    transition: "border-color .15s, box-shadow .15s",
                  }}
                >
                  <div className="row" style={{ gap: 10 }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        background: c.bg,
                        color: c.fg,
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Ic size={14} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t.name}
                      </div>
                      <div
                        className="muted mono"
                        style={{ fontSize: 10, textTransform: "uppercase" }}
                      >
                        {isDone ? "✓ done" : isActive ? "running…" : t.cat}
                      </div>
                    </div>
                    {t.cost && (
                      <span
                        className="chip chip-ai"
                        style={{ fontSize: 9, padding: "2px 6px", height: "auto" }}
                      >
                        {t.cost}cr
                      </span>
                    )}
                  </div>
                  {/* Input/output handles */}
                  {t.cat !== "Trigger" && (
                    <div
                      style={{
                        position: "absolute",
                        left: -7,
                        top: NODE_HANDLE_Y_OFFSET,
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: "var(--bg)",
                        border: "2px solid var(--fg-muted)",
                      }}
                    />
                  )}
                  {t.cat !== "Output" && (
                    <div
                      onMouseDown={(e) => startConnect(e, n.id)}
                      style={{
                        position: "absolute",
                        right: -7,
                        top: NODE_HANDLE_Y_OFFSET,
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        background: "var(--accent)",
                        border: "2px solid var(--bg-1)",
                        cursor: "crosshair",
                      }}
                      title="Drag to connect"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom run log */}
          {runState && <RunLog state={runState} onClose={() => setRunState(null)} />}
        </div>

        {/* Right: inspector */}
        {panelOpen === "inspector" && selectedNode && (
          <NodeInspector
            node={selectedNode}
            onDelete={() => deleteNode(selectedNode.id)}
            onClose={() => setPanelOpen("tools")}
          />
        )}
      </div>
    </div>
  );
}
