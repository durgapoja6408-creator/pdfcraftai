"use client";

// components/agent/AgentInteractive.tsx
// Public, demo-mode Agent surface (Claude Design parity port). Stateless
// client demo, no auth, no DB:
//  • Prompt → deterministic plan via lib/workflow/agent-plan.buildPlan
//  • Plan review with editable steps
//  • Mocked execution loop with terminal-style log
//  • Optional "save as macro" flow (?saveAsMacro=1) → localStorage
// Ported from the Claude Design handoff bundle (project/agent.jsx).
// (The earlier server-backed /app/studio "Smart mode" runner was removed
// on 2026-04-20; per-tool pages remain the real execution surface.)

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { I } from "@/components/icons/Icons";
import {
  buildPlan,
  AGENT_EXAMPLES,
  AGENT_COMING_SOON_EXAMPLES,
  planToGraph,
  type AgentPlan,
  type PlanStep,
} from "@/lib/workflow/agent-plan";
import {
  generatePlanRemote,
  startRunRemote,
  pollUntilTerminal,
  type RunSnapshot,
} from "@/lib/agent/client";
import type { AgentPlan as BackendAgentPlan } from "@/lib/agent/types";
import {
  getDemoCredits,
  spendDemoCredits,
  addDemoHistory,
  addUserMacro,
} from "@/lib/workflow/demo-state";

type Stage = "idle" | "planning" | "reviewing" | "running" | "done";

// ----------------------------------------------------------------------------
// StepRow
// ----------------------------------------------------------------------------

interface StepRowProps {
  step: PlanStep;
  status: "pending" | "active" | "done";
  index: number;
  editable?: boolean;
  canRemove?: boolean;
  onChange?: (next: PlanStep) => void;
  onRemove?: () => void;
}

function StepRow({ step, status, index, editable, canRemove, onChange, onRemove }: StepRowProps) {
  const Ic = (I as Record<string, React.FC<{ size?: number }>>)[step.tool] ?? I.Sparkle;
  const bgByStatus: Record<typeof status, string> = {
    pending: "var(--bg-2)",
    active: "var(--accent-soft)",
    done: "var(--green-soft)",
  };
  const fgByStatus: Record<typeof status, string> = {
    pending: "var(--fg-subtle)",
    active: "var(--accent)",
    done: "var(--green)",
  };
  return (
    <div className="row" style={{ gap: 12, padding: "14px 0", alignItems: "flex-start" }}>
      <div
        className={status === "active" ? "pulse-soft" : ""}
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: bgByStatus[status],
          color: fgByStatus[status],
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          border: "1px solid " + (status === "active" ? "var(--accent)" : "var(--border)"),
        }}
      >
        {status === "done" ? (
          <I.Check size={14} />
        ) : status === "active" ? (
          <Ic size={13} />
        ) : (
          <span className="mono" style={{ fontSize: 10 }}>{index + 1}</span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editable ? (
          <div className="col" style={{ gap: 6 }}>
            <input
              className="input"
              value={step.name}
              onChange={(e) => onChange?.({ ...step, name: e.target.value })}
              style={{ fontSize: 13, fontWeight: 500, height: 32, padding: "4px 8px" }}
            />
            <input
              className="input"
              value={step.desc}
              onChange={(e) => onChange?.({ ...step, desc: e.target.value })}
              style={{ fontSize: 12, height: 28, padding: "4px 8px", color: "var(--fg-muted)" }}
            />
          </div>
        ) : (
          <>
            <div className="row" style={{ gap: 8, marginBottom: 2 }}>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: status === "pending" ? "var(--fg-muted)" : "var(--fg)",
                }}
              >
                {step.name}
              </span>
              {step.cost !== undefined && (
                <span className="chip chip-ai" style={{ fontSize: 10 }}>{step.cost} cr</span>
              )}
            </div>
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{step.desc}</div>
          </>
        )}
      </div>
      {editable && canRemove && (
        <button
          className="btn btn-sm btn-ghost"
          onClick={onRemove}
          title="Remove step"
          style={{ padding: "0 8px" }}
        >
          <I.X size={12} />
        </button>
      )}
      {!editable && status === "active" && (
        <span className="mono" style={{ fontSize: 10, color: "var(--accent)" }}>RUNNING</span>
      )}
      {!editable && status === "done" && (
        <span className="mono subtle" style={{ fontSize: 10 }}>DONE</span>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// AgentLog
// ----------------------------------------------------------------------------

function AgentLog({ lines, collapsed = false }: { lines: string[]; collapsed?: boolean }) {
  const [open, setOpen] = React.useState(!collapsed);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines, open]);
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: collapsed ? 16 : 0 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="row"
        style={{
          width: "100%",
          padding: "10px 14px",
          background: "var(--bg-2)",
          border: "none",
          cursor: "pointer",
          gap: 8,
          borderBottom: open ? "1px solid var(--border)" : "none",
          color: "var(--fg)",
        }}
      >
        <I.Terminal size={13} />
        <span className="mono" style={{ fontSize: 11, flex: 1, textAlign: "left" }}>
          AGENT LOG · {lines.length} lines
        </span>
        <I.ChevronDown
          size={13}
          style={{ transform: open ? "rotate(0)" : "rotate(-90deg)", transition: "transform .15s" }}
        />
      </button>
      {open && (
        <div
          ref={ref}
          style={{
            padding: "14px 16px",
            maxHeight: 220,
            overflow: "auto",
            background: "var(--bg)",
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontSize: 12,
            lineHeight: 1.7,
          }}
        >
          {lines.map((l, i) => {
            const color = l.startsWith(">")
              ? "var(--accent)"
              : l.startsWith("✓") || l.startsWith("  ✓")
              ? "var(--green)"
              : l.startsWith("→")
              ? "var(--fg-muted)"
              : "var(--fg)";
            return (
              <div key={i} style={{ color, whiteSpace: "pre-wrap" }}>{l || "\u00A0"}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// AgentCapabilities
// ----------------------------------------------------------------------------

const CAPABILITIES: Array<{ i: keyof typeof I; t: string; d: string }> = [
  { i: "Flow", t: "Chain tools", d: "Merge → OCR → redact → translate → sign, all in one request." },
  { i: "Robot", t: "Read & reason", d: "Cross-reference multiple docs and synthesize new output." },
  { i: "Shield", t: "Ask before risky steps", d: "Confirms before sending emails, deleting files, or redacting." },
  { i: "Star", t: "Save as macro", d: "Reuse any completed plan with one click next time." },
  { i: "Key", t: "BYOK supported", d: "Route agent calls through your own API key — 15% infra fee." },
  { i: "Clock", t: "Schedulable", d: "Run weekly or on new file in a watched folder (coming soon)." },
];

function AgentCapabilities() {
  return (
    <div style={{ marginTop: 48 }}>
      <div className="eyebrow" style={{ marginBottom: 16 }}>WHAT THE AGENT CAN DO</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
        }}
      >
        {CAPABILITIES.map((x) => {
          const Ic = (I as Record<string, React.FC<{ size?: number }>>)[x.i] ?? I.Sparkle;
          return (
            <div key={x.t} className="card" style={{ padding: 14 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: "var(--bg-2)",
                  color: "var(--fg-muted)",
                  display: "grid",
                  placeItems: "center",
                  marginBottom: 10,
                }}
              >
                <Ic size={14} />
              </div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{x.t}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.5 }}>{x.d}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// AgentInteractive (main)
// ----------------------------------------------------------------------------

export default function AgentInteractive() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const saveAsMacroMode = searchParams?.get("saveAsMacro") === "1";

  const [prompt, setPrompt] = React.useState("");
  const [plan, setPlan] = React.useState<AgentPlan | null>(null);
  const [stage, setStage] = React.useState<Stage>("idle");
  const [activeStep, setActiveStep] = React.useState(-1);
  const [log, setLog] = React.useState<string[]>([]);
  const [saveEnabled, setSaveEnabled] = React.useState<boolean>(saveAsMacroMode);
  const [macroName, setMacroName] = React.useState("");
  const [savedMacroName, setSavedMacroName] = React.useState<string | null>(null);
  const [editMode, setEditMode] = React.useState(false);
  const [credits, setCredits] = React.useState<number>(1000);
  const tickTimers = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  // Bundle H7: session-aware. "authenticated" → real backend by default;
  // "unauthenticated" / "loading" → demo. Tracked here so submitPrompt /
  // runPlan / saveMacroFromPlan can branch on it.
  const { status: sessionStatus } = useSession();

  // Hydrate credits. H7.2: signed-in users see their REAL balance
  // from /api/account/balance; anon users see the localStorage demo
  // balance. Refresh on every stage change so the chip is fresh after
  // a run completes.
  React.useEffect(() => {
    let cancelled = false;
    if (sessionStatus === "authenticated") {
      fetch("/api/account/balance", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled) return;
          if (d && typeof d.balance === "number") setCredits(d.balance);
        })
        .catch(() => {
          // Silently fall back to demo balance — we don't want a
          // network blip to make the chip disappear.
          if (!cancelled) setCredits(getDemoCredits());
        });
    } else if (sessionStatus === "unauthenticated") {
      setCredits(getDemoCredits());
    }
    return () => {
      cancelled = true;
    };
    // Re-run whenever the run stage transitions (planning → done) so
    // we re-fetch after a successful charge.
  }, [sessionStatus, stage]);

  // Cleanup timers on unmount.
  React.useEffect(() => {
    return () => {
      tickTimers.current.forEach((t) => clearTimeout(t));
      tickTimers.current = [];
    };
  }, []);

  // Keep saveEnabled in sync if URL changes (e.g. user toggles via Macros card)
  React.useEffect(() => {
    setSaveEnabled(saveAsMacroMode);
  }, [saveAsMacroMode]);

  const submitPrompt = (text?: string) => {
    const p = (text ?? prompt).trim();
    if (!p) return;
    setPrompt(p);
    setStage("planning");
    setLog([`> ${p}`, "→ parsing intent...", "→ selecting tools...", "→ drafting plan..."]);

    // Bundle H7 (2026-04-26): auth-aware backend selection.
    //
    // Selection matrix:
    //   - anon users      → demo (deterministic buildPlan + setTimeout)
    //   - signed-in users → real backend (LLM planner + DB-persisted run)
    //   - ?backend=demo   → force demo even when signed in (for screenshots)
    //   - ?backend=real   → force real even when anon (will 401 then fall
    //                        back to demo with an error log)
    //
    // Was Bundle H3: opt-in flag for everyone. That left signed-in users
    // staring at a deterministic mock unless they manually edited the URL,
    // which defeats the purpose of having a real backend.
    //
    // H7.1 race fix: useSession returns "loading" briefly on first paint
    // while it fetches /api/auth/session. A signed-in user who types fast
    // and hits Plan it during that window used to get the demo path. We
    // now treat "loading" as "probably authenticated" — the API will 401
    // if truly anon, and the catch block already falls back to demo with
    // a logged error. Worst case is one wasted API call for an anon user
    // who happened to click during the loading window; right tradeoff.
    const sessionAuthed = sessionStatus === "authenticated";
    const sessionLoading = sessionStatus === "loading";
    const forceDemo = searchParams.get("backend") === "demo";
    const forceReal = searchParams.get("backend") === "real";
    const useRealBackend =
      forceReal || ((sessionAuthed || sessionLoading) && !forceDemo);

    if (useRealBackend) {
      // Real LLM-driven planner. The backend AgentPlan shape differs from
      // the demo's; we adapt it for the existing UI by mapping each
      // backend step to a PlanStep with a best-effort tool-icon mapping.
      generatePlanRemote({ prompt: p })
        .then((backendPlan) => {
          const adapted = adaptBackendPlanForDemoUi(backendPlan);
          setPlan(adapted);
          if (!macroName) {
            const short = p.replace(/[.!?]$/, "").split(/[,.]/)[0]!.slice(0, 48);
            setMacroName(short.charAt(0).toUpperCase() + short.slice(1));
          }
          // Stash the full backend plan on the window so the run handler
          // can post it back to /api/agent/run unchanged. (Stateful but
          // scoped — cleaner than threading it through React state for
          // an opt-in flag path.)
          (window as unknown as { __agentBackendPlan?: BackendAgentPlan }).__agentBackendPlan =
            backendPlan;
          setStage("reviewing");
        })
        .catch((err: Error) => {
          // Surface the error in the log + fall back to the demo plan
          // so the user isn't stuck staring at "drafting plan..." forever.
          setLog((l) => [
            ...l,
            `× planner error: ${err.message}`,
            "→ falling back to demo plan",
          ]);
          const built = buildPlan(p);
          setPlan(built);
          setStage("reviewing");
        });
      return;
    }

    // Demo path — unchanged.
    const t = setTimeout(() => {
      const built = buildPlan(p);
      setPlan(built);
      if (!macroName) {
        const short = p.replace(/[.!?]$/, "").split(/[,.]/)[0]!.slice(0, 48);
        setMacroName(short.charAt(0).toUpperCase() + short.slice(1));
      }
      setStage("reviewing");
    }, 1400);
    tickTimers.current.push(t);
  };

  /**
   * Bridge between the production AgentPlan (lib/agent/types.ts) and the
   * demo AgentPlan (lib/workflow/agent-plan.ts) used by the existing UI.
   * Maps each backend step to a PlanStep with a best-effort icon name.
   * This keeps H3 as a thin wiring change — no UI rewrite required.
   */
  function adaptBackendPlanForDemoUi(bp: BackendAgentPlan): AgentPlan {
    const ICON_MAP: Record<string, keyof typeof I> = {
      "sys.fs.list": "Search",
      "sys.ask.user": "Help",
      "sys.notify.user": "Check",
      merge: "Merge",
      split: "Split",
      compress: "Compress",
      "extract-pages": "Pages",
      "delete-pages": "Pages",
      "ai-summarize": "Summary",
      "ai-tldr": "Summary",
      "ai-ocr": "Scan",
      "ai-translate": "Translate",
      "ai-redact": "Shield",
      "ai-table": "Pages",
      "ai-entities": "Search",
      "ai-action-items": "Check",
      "ai-generate": "Generate",
      "ai-rewrite": "Edit",
      "ai-compare": "Compare",
    };
    // Prefer the planner's prompt-derived filename (H7.2). Fall back
    // to the legacy "Result.<type>" only when the planner didn't ship
    // a name (older cached plans, or a future planner that opts out).
    const outputName =
      bp.output.name ?? `Result.${bp.output.type}`;
    return {
      steps: bp.steps.map((s) => ({
        tool: ICON_MAP[s.tool] ?? "Flow",
        name: s.label,
        desc: s.description,
        cost: s.estCredits > 0 ? s.estCredits : undefined,
      })),
      credits: bp.totalEstCredits,
      output: { name: outputName, type: bp.output.type },
      fileCount: 0,
    };
  }

  const saveMacroFromPlan = (): string | null => {
    if (!plan) return null;
    const iconFromStep =
      (plan.steps.find((s) => ["Scan", "Shield", "Summary", "Translate", "Generate"].includes(s.tool as string))
        ?.tool as keyof typeof I) || "Flow";
    const graph = planToGraph(plan);

    // Bundle H7: signed-in users → real DB-backed macro via the H4
    // server action. Anon users → localStorage demo (unchanged).
    // Server-side persistence runs fire-and-forget — the UI doesn't
    // wait on the action's Promise (the existing demo-mode return is
    // synchronous; threading async through every save call site would
    // be invasive). The fire-and-forget pattern is OK because:
    //   - the H4 action is idempotent on (userId, toolId, name) via
    //     the existing user_macros unique index
    //   - failure logs to console for /admin debug, doesn't crash UI
    //   - duplicate-name errors surface gracefully (saved one wins)
    const isSignedIn = sessionStatus === "authenticated";
    const backendPlan = (window as unknown as { __agentBackendPlan?: BackendAgentPlan })
      .__agentBackendPlan;
    if (isSignedIn && backendPlan) {
      // Lazy import the server action to avoid pulling Drizzle into the
      // anon code path's bundle.
      void import("@/lib/agent/macro-bridge").then(({ saveAgentMacroAction }) =>
        saveAgentMacroAction({
          name: macroName || "Untitled macro",
          plan: backendPlan,
        }).then((r) => {
          if (!r.ok) {
            console.warn(`[agent] DB macro save failed: ${r.error}`);
          }
        }),
      );
    }

    // Always also write the localStorage demo macro so the
    // /macros visualisation works for both anon + signed-in users
    // (the /macros page reads from localStorage today).
    const macro = addUserMacro({
      name: macroName || "Untitled macro",
      desc: prompt.slice(0, 140),
      icon: iconFromStep,
      creditsPerRun: plan.credits,
      nodes: graph.nodes as never,
      edges: graph.edges as never,
    });
    return macro.name;
  };

  const runPlan = () => {
    if (!plan) return;
    if (credits < plan.credits) {
      const ok = window.confirm(
        `This plan will use ${plan.credits} credits. You have ${credits}. Buy more?`,
      );
      if (ok) router.push("/pricing");
      return;
    }
    setStage("running");
    setActiveStep(0);
    setLog((l) => [...l, "", "> run plan", "→ starting execution..."]);

    // Bundle H7: signed-in users with a backend plan in scope go to the
    // real executor via /api/agent/run, polling /api/agent/runs/:id for
    // step progress. Anon users (or signed-in users on demo plans) keep
    // the existing fake setTimeout loop.
    const isSignedIn = sessionStatus === "authenticated";
    const backendPlan = (window as unknown as { __agentBackendPlan?: BackendAgentPlan })
      .__agentBackendPlan;

    if (isSignedIn && backendPlan) {
      void (async () => {
        try {
          const { runId } = await startRunRemote({ plan: backendPlan });
          // Stash so the Download button can fetch outputs from this run.
          (window as unknown as { __agentRunId?: string }).__agentRunId = runId;
          setLog((l) => [...l, `→ run started (id ${runId.slice(0, 8)})`]);
          const final = await pollUntilTerminal(runId, {
            intervalMs: 1000,
            maxMs: 60_000,
            onUpdate: (snap) => {
              const lastSucceeded = snap.steps
                .filter((s) => s.status === "succeeded")
                .pop();
              if (lastSucceeded) {
                setActiveStep(lastSucceeded.idx - 1);
              }
            },
          });
          // Render terminal status to the log.
          for (const s of final.steps) {
            if (s.status === "succeeded") {
              setLog((l) => [...l, `  ✓ step ${s.idx}: ${s.tool}`]);
            } else if (s.status === "failed") {
              setLog((l) => [
                ...l,
                `  × step ${s.idx} failed: ${s.errorMessage ?? "unknown error"}`,
              ]);
            } else if (s.status === "awaiting_approval") {
              setLog((l) => [
                ...l,
                `  ⊘ step ${s.idx} awaiting approval (UI for inline approval lands in H8)`,
              ]);
            }
          }
          if (final.status === "completed") {
            setLog((l) => [
              ...l,
              "✓ run complete",
              `→ cost: ${(final.totalCostMicros ?? 0) / 40_000} credits`,
            ]);
            if (saveEnabled) {
              const name = saveMacroFromPlan();
              setSavedMacroName(name);
            }
            setStage("done");
          } else {
            setLog((l) => [...l, `→ run ended with status: ${final.status}`]);
            setStage("done");
          }
          setActiveStep(-1);

          // H7.4: explicit balance refresh after run terminates. The
          // [sessionStatus, stage] useEffect higher up *should* fire
          // on stage→"done", but the fetch races the run's
          // spendCredits commit and sometimes returns the pre-spend
          // value. Doing it here, after we already know the run
          // committed, guarantees a fresh read.
          if (sessionStatus === "authenticated") {
            try {
              const r = await fetch("/api/account/balance", {
                cache: "no-store",
              });
              if (r.ok) {
                const d = (await r.json()) as { balance?: number };
                if (typeof d.balance === "number") setCredits(d.balance);
              }
            } catch {
              // Silently ignore — the next page load will pick it up.
            }
          }
        } catch (err) {
          setLog((l) => [
            ...l,
            `× executor error: ${(err as Error).message}`,
            "→ falling back to demo run",
          ]);
          // Fall through to the demo path below
          runDemoLoop();
        }
      })();
      return;
    }

    // Demo path — unchanged.
    runDemoLoop();
  };

  /** Fake setTimeout-based step loop for the anon/demo path. */
  function runDemoLoop() {
    if (!plan) return;
    let i = 0;
    const tick = () => {
      if (!plan) return;
      if (i >= plan.steps.length) {
        const after = spendDemoCredits(plan.credits);
        setCredits(after);
        addDemoHistory({ tool: "Agent", file: plan.output.name, credits: plan.credits });
        if (saveEnabled) {
          const name = saveMacroFromPlan();
          setSavedMacroName(name);
        }
        setLog((l) => [...l, "✓ all steps complete", `→ output: ${plan.output.name}`]);
        setStage("done");
        setActiveStep(-1);
        return;
      }
      const s = plan.steps[i]!;
      setActiveStep(i);
      setLog((l) => [...l, `  [${i + 1}/${plan.steps.length}] ${s.name}`]);
      const t1 = setTimeout(() => {
        setLog((l) => [...l, `  ✓ ${s.desc}`]);
        i++;
        const t2 = setTimeout(tick, 400);
        tickTimers.current.push(t2);
      }, 1100);
      tickTimers.current.push(t1);
    };
    tick();
  }

  const reset = () => {
    tickTimers.current.forEach((t) => clearTimeout(t));
    tickTimers.current = [];
    setPrompt("");
    setPlan(null);
    setStage("idle");
    setActiveStep(-1);
    setLog([]);
    setMacroName("");
    setSavedMacroName(null);
    setEditMode(false);
  };

  return (
    <div className="container-x" style={{ maxWidth: 960, padding: "32px 28px 80px" }}>
      {/* Header row */}
      <div className="row" style={{ gap: 10, marginBottom: 24 }}>
        <Link href="/tools" className="btn btn-sm btn-ghost">
          <I.ArrowLeft size={14} /> All tools
        </Link>
        <span className="chip chip-new">
          <I.Sparkle size={10} /> New · beta
        </span>
        {saveAsMacroMode && (
          <span
            className="chip"
            style={{
              fontSize: 10,
              background: "var(--accent-soft)",
              color: "var(--accent)",
              borderColor: "var(--accent)",
            }}
          >
            <I.Star size={10} /> SAVE AS MACRO MODE
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span className="mono subtle" style={{ fontSize: 11 }}>BALANCE: {credits} cr</span>
      </div>

      {saveAsMacroMode && stage === "idle" && (
        <div
          className="card"
          style={{
            padding: 16,
            marginBottom: 24,
            borderColor: "var(--accent)",
            background: "color-mix(in oklab, var(--accent) 6%, var(--bg-1))",
          }}
        >
          <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "var(--accent)",
                color: "var(--accent-fg)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <I.Star size={14} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>
                This run will be saved as a reusable macro
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                After the agent runs once successfully, the workflow is added to your Macro Library so you can re-run it on demand or on a schedule.
              </div>
            </div>
            <Link href="/agent" className="btn btn-sm btn-ghost" title="Run once without saving">
              Turn off
            </Link>
          </div>
        </div>
      )}

      {/* Title row */}
      <div className="row" style={{ gap: 16, alignItems: "flex-start", marginBottom: 32 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "linear-gradient(135deg, var(--accent), var(--accent-soft))",
            color: "var(--accent-fg)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <I.Robot size={28} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="row" style={{ gap: 8, marginBottom: 4 }}>
            <h1 style={{ fontSize: 28, margin: 0, letterSpacing: "-0.02em" }}>Agent mode</h1>
            <span className="chip chip-ai">credits by plan</span>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>
            Describe what you want. The agent chains tools, runs them for you, and delivers the result.
          </p>
        </div>
      </div>

      {/* Idle */}
      {stage === "idle" && (
        <>
          {/*
            H7.5: 3-step "how it works" strip. Was missing before, so a
            first-time user landed on the prompt box with no context.
            Three icons + one line each — no hero illustrations, no
            modal. Lives between the title block and the textarea.
          */}
          <div
            className="card"
            style={{
              padding: 14,
              marginBottom: 20,
              background: "var(--bg-1)",
              borderColor: "var(--border-soft, var(--border))",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 14,
              }}
            >
              {[
                {
                  Ic: I.Sparkle,
                  step: "1",
                  title: "Describe the outcome",
                  blurb: "Paste text and ask for a summary, translation, rewrite, or short draft.",
                },
                {
                  Ic: I.Flow,
                  step: "2",
                  title: "Review the plan",
                  blurb: "Agent picks tools and shows the cost. Nothing runs without your approval.",
                },
                {
                  Ic: I.Download,
                  step: "3",
                  title: "Download the result",
                  blurb: "Output is saved as a markdown file you can keep or paste into other tools.",
                },
              ].map((s) => {
                const Ic = s.Ic;
                return (
                  <div key={s.step} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        background: "var(--accent-soft)",
                        color: "var(--accent)",
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Ic size={13} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        <span className="mono subtle" style={{ marginRight: 6 }}>{s.step}.</span>
                        {s.title}
                      </div>
                      <div className="muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: 2 }}>
                        {s.blurb}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card" style={{ padding: 20, borderColor: "var(--border-strong)" }}>
            <div className="row" style={{ gap: 8, marginBottom: 16 }}>
              <I.Sparkle size={14} style={{ color: "var(--accent)" }} />
              <span className="mono" style={{ fontSize: 11 }}>WHAT DO YOU WANT DONE?</span>
            </div>
            <textarea
              className="textarea"
              rows={4}
              // H7.5: placeholder updated to match what the agent
              // can actually produce today (text-input → markdown).
              // Was suggesting "merge 3 contracts → email a draft"
              // which the executor can't do, leading to silently
              // stubbed runs.
              placeholder='e.g. Summarize this in two paragraphs: "Q3 revenue grew 23% to $4.2B…"'
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitPrompt();
              }}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                resize: "vertical",
                fontSize: 15,
                minHeight: 80,
              }}
            />
            <div className="row" style={{ justifyContent: "space-between", marginTop: 16 }}>
              <div className="row" style={{ gap: 8 }}>
                {/*
                  H7.5: removed the dead "Attach files" disabled button.
                  PDF attachments need file-storage infra (deferred);
                  a permanently-greyed-out button just confused users.
                  Replaced with a small inline note that tells them
                  what to do INSTEAD (paste text). When file uploads
                  ship, this becomes a real button again.
                */}
                <span className="mono subtle" style={{ fontSize: 11 }}>
                  Paste text in the prompt · file uploads coming soon
                </span>
                <span className="mono subtle" style={{ fontSize: 11 }}>·</span>
                <span className="mono subtle" style={{ fontSize: 11 }}>⌘⏎ to run</span>
              </div>
              <button
                type="button"
                className="btn btn-accent"
                onClick={() => submitPrompt()}
                disabled={!prompt.trim()}
              >
                <I.Sparkle size={14} /> Plan it
              </button>
            </div>
          </div>

          <div style={{ marginTop: 40 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
              <div className="eyebrow">TRY AN EXAMPLE</div>
              {/*
                H7.5: softened the "CLICK TO PREFILL" all-caps mono
                label. The example cards already have hover styling +
                cursor:pointer; the label is still helpful to first-
                timers but doesn't need to shout.
              */}
              <span className="muted" style={{ fontSize: 12 }}>
                Click any card to fill the prompt
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 10,
              }}
            >
              {AGENT_EXAMPLES.map((ex) => {
                const Ic = (I as Record<string, React.FC<{ size?: number }>>)[ex.icon] ?? I.Sparkle;
                return (
                  <button
                    key={ex.title}
                    type="button"
                    className="card card-hover"
                    style={{ padding: 16, textAlign: "left", cursor: "pointer", background: "var(--bg-1)" }}
                    onClick={() => submitPrompt(ex.prompt)}
                  >
                    <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
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
                      <span className="chip" style={{ fontSize: 10 }}>{ex.tag}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{ex.title}</div>
                    <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{ex.prompt}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/*
            H7.5: roadmap row. Shows aspirational use-cases (folder
            ingest, redact-and-share, doc-to-doc compare) as non-
            clickable preview chips so users see what's coming
            without being able to launch a run that would fall
            through to a stub.
          */}
          {AGENT_COMING_SOON_EXAMPLES.length > 0 && (
            <div style={{ marginTop: 36 }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
                <div className="eyebrow">COMING SOON</div>
                <span className="muted" style={{ fontSize: 12 }}>
                  Needs file uploads or external integrations
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: 10,
                }}
              >
                {AGENT_COMING_SOON_EXAMPLES.map((ex) => {
                  const Ic = (I as Record<string, React.FC<{ size?: number }>>)[ex.icon] ?? I.Sparkle;
                  return (
                    <div
                      key={ex.title}
                      className="card"
                      style={{
                        padding: 16,
                        background: "var(--bg-1)",
                        opacity: 0.7,
                        cursor: "not-allowed",
                      }}
                      title="Not available yet — needs file upload support"
                    >
                      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: "var(--bg-2)",
                            color: "var(--fg-muted)",
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          <Ic size={15} />
                        </div>
                        <span className="chip" style={{ fontSize: 10 }}>{ex.tag}</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                        {ex.title}{" "}
                        <span
                          className="mono subtle"
                          style={{ fontSize: 10, marginLeft: 4 }}
                        >
                          SOON
                        </span>
                      </div>
                      <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                        {ex.blurb}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <AgentCapabilities />
        </>
      )}

      {/* Planning */}
      {stage === "planning" && (
        <div className="card fade-in" style={{ padding: 24 }}>
          <div className="row" style={{ gap: 10, marginBottom: 24 }}>
            <I.Sparkle size={16} className="pulse-soft" style={{ color: "var(--accent)" }} />
            <span className="mono" style={{ fontSize: 13 }}>PLANNING…</span>
          </div>
          <AgentLog lines={log} />
        </div>
      )}

      {/* Reviewing */}
      {stage === "reviewing" && plan && (
        <div className="fade-in">
          <div
            className="card"
            style={{
              padding: 20,
              marginBottom: 24,
              borderColor: "var(--accent-soft)",
              background: "color-mix(in oklab, var(--accent) 5%, var(--bg-1))",
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 8 }}>YOUR REQUEST</div>
            <p style={{ fontSize: 15, margin: 0, lineHeight: 1.6 }}>{prompt}</p>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <div className="row" style={{ gap: 8, marginBottom: 2 }}>
                  <I.Flow size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ fontWeight: 500 }}>Proposed plan</span>
                  <span className="chip" style={{ fontSize: 10 }}>{plan.steps.length} steps</span>
                </div>
                <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                  Review, edit, then run — nothing runs without your approval.
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="mono subtle" style={{ fontSize: 11 }}>ESTIMATED COST</div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    color: "var(--accent)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  ~{plan.credits}{" "}
                  <span className="mono" style={{ fontSize: 11, color: "var(--fg-muted)" }}>credits</span>
                </div>
              </div>
            </div>

            <div style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: 13,
                  top: 24,
                  bottom: 24,
                  width: 1,
                  background: "var(--border)",
                }}
              />
              {plan.steps.map((s, i) => (
                <StepRow
                  key={i}
                  step={s}
                  status="pending"
                  index={i}
                  editable={editMode}
                  canRemove={plan.steps.length > 1}
                  onChange={(next) => {
                    const steps = plan.steps.map((x, j) => (j === i ? next : x));
                    setPlan({ ...plan, steps });
                  }}
                  onRemove={() => {
                    const steps = plan.steps.filter((_, j) => j !== i);
                    const credits2 = steps.reduce((n, x) => n + (x.cost ?? 0), 0);
                    setPlan({ ...plan, steps, credits: credits2 });
                  }}
                />
              ))}
              {editMode && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    const newStep: PlanStep = {
                      tool: "Sparkle",
                      name: "New step",
                      desc: "Describe what this step does.",
                      cost: 2,
                    };
                    setPlan({
                      ...plan,
                      steps: [...plan.steps, newStep],
                      credits: plan.credits + 2,
                    });
                  }}
                  style={{ marginTop: 8, marginLeft: 40 }}
                >
                  <I.Plus size={12} /> Add step
                </button>
              )}
            </div>

            <div className="divider" style={{ margin: "12px 0 16px" }} />

            <div className="row" style={{ gap: 10, justifyContent: "space-between" }}>
              <button type="button" className="btn btn-ghost" onClick={reset}>
                <I.ArrowLeft size={14} /> Start over
              </button>
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className={"btn btn-sm " + (editMode ? "btn-accent" : "btn-outline")}
                  onClick={() => setEditMode((v) => !v)}
                >
                  {editMode ? (
                    <>
                      <I.Check size={12} /> Done editing
                    </>
                  ) : (
                    <>
                      <I.Edit size={12} /> Edit plan
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-accent"
                  onClick={runPlan}
                  disabled={editMode}
                >
                  <I.Play size={12} /> Approve &amp; run · {plan.credits} credits
                </button>
              </div>
            </div>
          </div>

          {saveEnabled && (
            <div
              className="card"
              style={{
                padding: 16,
                marginTop: 16,
                borderColor: "var(--accent-soft)",
              }}
            >
              <div className="row" style={{ gap: 8, marginBottom: 12 }}>
                <I.Star size={13} style={{ color: "var(--accent)" }} />
                <span style={{ fontWeight: 500, fontSize: 13 }}>Save this workflow as a macro</span>
                <div style={{ flex: 1 }} />
                <label className="row" style={{ gap: 6, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={saveEnabled}
                    onChange={(e) => setSaveEnabled(e.target.checked)}
                  />
                  <span className="muted">Save on success</span>
                </label>
              </div>
              <input
                className="input"
                value={macroName}
                onChange={(e) => setMacroName(e.target.value)}
                placeholder="Macro name (e.g. Weekly invoice intake)"
              />
              <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                Will appear in your Macro Library under{" "}
                <span className="mono" style={{ color: "var(--fg)" }}>Yours</span>. You can re-run it without re-describing.
              </div>
            </div>
          )}

          <p className="muted" style={{ fontSize: 12, textAlign: "center", marginTop: 24 }}>
            <I.Info size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
            Cost is an estimate. Final usage may vary ±10% based on actual document size.
          </p>
        </div>
      )}

      {/* Running */}
      {stage === "running" && plan && (
        <div className="fade-in">
          <div className="card" style={{ padding: 20, marginBottom: 24 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
              <div className="row" style={{ gap: 10 }}>
                <I.Sparkle size={16} className="pulse-soft" style={{ color: "var(--accent)" }} />
                <span style={{ fontWeight: 500 }}>Running plan</span>
              </div>
              <button type="button" className="btn btn-sm btn-ghost" onClick={reset}>
                <I.Stop size={12} /> Cancel
              </button>
            </div>

            <div
              style={{
                height: 6,
                background: "var(--bg-2)",
                borderRadius: 3,
                overflow: "hidden",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: ((activeStep + 0.5) / plan.steps.length) * 100 + "%",
                  background: "var(--accent)",
                  transition: "width .4s ease",
                }}
              />
            </div>

            <div style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: 13,
                  top: 24,
                  bottom: 24,
                  width: 1,
                  background: "var(--border)",
                }}
              />
              {plan.steps.map((s, i) => (
                <StepRow
                  key={i}
                  step={s}
                  status={i < activeStep ? "done" : i === activeStep ? "active" : "pending"}
                  index={i}
                />
              ))}
            </div>
          </div>

          <AgentLog lines={log} />
        </div>
      )}

      {/* Done */}
      {stage === "done" && plan && (
        <div className="fade-in">
          <div
            className="card"
            style={{ padding: 32, textAlign: "center", borderColor: "var(--green)" }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "var(--green-soft)",
                color: "var(--green)",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 16px",
              }}
            >
              <I.Check size={28} />
            </div>
            <h3 style={{ marginBottom: 8 }}>Plan complete</h3>
            <p className="muted" style={{ fontSize: 14, marginBottom: 24 }}>
              {plan.steps.length} steps · {plan.credits} credits used ·{" "}
              {plan.output.pages ? `${plan.output.pages} pages produced` : "output ready"}
            </p>

            {savedMacroName && (
              <div
                className="card"
                style={{
                  padding: 12,
                  margin: "0 auto 16px",
                  maxWidth: 460,
                  borderColor: "var(--green)",
                  background: "var(--green-soft)",
                  color: "var(--green)",
                }}
              >
                <div className="row" style={{ gap: 10, justifyContent: "center" }}>
                  <I.Check size={14} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    Saved as macro &ldquo;{savedMacroName}&rdquo;
                  </span>
                  <Link href="/macros" className="btn btn-sm btn-ghost" style={{ color: "var(--green)" }}>
                    View in library <I.ArrowRight size={11} />
                  </Link>
                </div>
              </div>
            )}

            <div
              className="card"
              style={{ padding: 16, margin: "0 auto 20px", maxWidth: 360, background: "var(--bg)" }}
            >
              <div className="row" style={{ gap: 12, textAlign: "left" }}>
                <div
                  style={{
                    width: 40,
                    height: 48,
                    background: "var(--bg-2)",
                    borderRadius: 4,
                    display: "grid",
                    placeItems: "center",
                    color: "var(--red)",
                    flexShrink: 0,
                  }}
                >
                  <span className="mono" style={{ fontSize: 10 }}>
                    {plan.output.type.toUpperCase()}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {plan.output.name}
                  </div>
                  {plan.output.pages !== undefined && (
                    <div className="mono subtle" style={{ fontSize: 11 }}>
                      {plan.output.pages} pages
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="row" style={{ justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  // H7+ download: real runs have a runId stashed by runPlan;
                  // fetch the latest succeeded step's outputRef and download
                  // it as a Blob with the right MIME. Demo runs (no runId)
                  // fall back to the demo-only alert.
                  const runId = (window as unknown as { __agentRunId?: string }).__agentRunId;
                  if (!runId) {
                    alert(
                      "Demo only — run each step on its individual /tool/* page for real downloads.",
                    );
                    return;
                  }
                  try {
                    const res = await fetch(`/api/agent/runs/${encodeURIComponent(runId)}`);
                    if (!res.ok) throw new Error(`run fetch ${res.status}`);
                    const { run } = (await res.json()) as {
                      run: {
                        steps: Array<{
                          status: string;
                          outputRef: string | null;
                          outputType: string | null;
                          tool: string;
                        }>;
                      };
                    };
                    // Pick the last succeeded step with a non-stub output as
                    // the deliverable. Stub steps (output_type starts with
                    // "json/stub-") are no-op placeholders pre-H6+.
                    const deliverables = run.steps.filter(
                      (s) =>
                        s.status === "succeeded" &&
                        s.outputRef &&
                        s.outputType &&
                        !s.outputType.startsWith("json/stub-") &&
                        !s.outputType.startsWith("json/notification") &&
                        !s.outputType.startsWith("json/file-list"),
                    );
                    const last = deliverables[deliverables.length - 1];
                    if (!last) {
                      alert(
                        "No downloadable output yet — this plan only contained system steps (file listing / notifications) or stub steps. Run an AI step (summarize, translate, etc.) to get a deliverable.",
                      );
                      return;
                    }
                    // Map outputType → file extension + MIME for the
                    // browser's download UX.
                    const extByType: Record<string, [string, string]> = {
                      "text/markdown": ["md", "text/markdown"],
                      "text/plain": ["txt", "text/plain"],
                      "text/csv": ["csv", "text/csv"],
                      "application/json": ["json", "application/json"],
                    };
                    const [ext, mime] = extByType[last.outputType ?? ""] ?? [
                      "txt",
                      "text/plain",
                    ];
                    const blob = new Blob([last.outputRef ?? ""], { type: mime });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    // H7.2 download filename:
                    //   1. Prefer the planner-suggested name (already
                    //      includes a meaningful slug + extension).
                    //   2. Fallback to agent-<runId>-step-<tool> for
                    //      legacy plans without an output.name.
                    const planName = plan?.output?.name?.trim();
                    a.download =
                      planName && /\.[a-z0-9]{2,4}$/i.test(planName)
                        ? planName
                        : `agent-${runId.slice(0, 8)}-step-${last.tool}.${ext}`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    alert(`Download failed: ${(err as Error).message}`);
                  }
                }}
              >
                <I.Download size={14} /> Download
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  if (savedMacroName) {
                    router.push("/macros");
                    return;
                  }
                  const name = saveMacroFromPlan();
                  if (name) setSavedMacroName(name);
                }}
              >
                <I.Star size={14} /> {savedMacroName ? "Open in Macro Library" : "Save as macro"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={reset}>
                Run another plan
              </button>
            </div>

            <div className="divider" style={{ margin: "24px 0 16px" }} />

            {/*
              H7.4: BALANCE chip lives in the page header (line ~670)
              and stays visible the whole time. The done card already
              shows "3 credits used" two rows up, so a second BALANCE
              line here is pure duplication. Keep just the file-TTL
              note — it's the one piece of footer info that isn't
              available elsewhere in the layout.
            */}
            <div className="row" style={{ justifyContent: "center", gap: 14 }}>
              <span className="mono subtle" style={{ fontSize: 11 }}>FILES AUTO-DELETE IN 60 MIN</span>
            </div>
          </div>

          <AgentLog lines={log} collapsed />
        </div>
      )}
    </div>
  );
}
