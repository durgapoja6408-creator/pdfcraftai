// lib/agent/client.ts
//
// Browser-side client for the production Agent backend (/api/agent/*).
// Used by AgentInteractive when the real-backend flag is enabled.
//
// Returns BACKEND types (AgentPlan from lib/agent/types.ts) — NOT the
// older AgentPlan shape used by the public demo (lib/workflow/agent-plan).
// We keep them separate so the demo code path doesn't change.

import type { AgentPlan, RunStatus, StepStatus } from "./types";

export interface ApiError {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

/**
 * POST /api/agent/plan — get a plan from the LLM.
 */
export async function generatePlanRemote(args: {
  prompt: string;
  files?: Array<{ id: string; name: string; pageCount?: number }>;
}): Promise<AgentPlan> {
  const res = await fetch("/api/agent/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(
      body?.error?.message ??
        `Planner returned ${res.status} ${res.statusText}`,
    );
  }
  const data = (await res.json()) as { plan: AgentPlan };
  return data.plan;
}

/**
 * POST /api/agent/run — start executing a plan. Returns immediately
 * with the runId (executor runs synchronously today; will be async-by-
 * default once H3 wires AI dispatch and steps may take >5s each).
 */
export async function startRunRemote(args: {
  plan: AgentPlan;
}): Promise<{ runId: string; status: RunStatus }> {
  const res = await fetch("/api/agent/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(
      body?.error?.message ?? `Run-start returned ${res.status}`,
    );
  }
  return (await res.json()) as { runId: string; status: RunStatus };
}

/**
 * GET /api/agent/runs/:id — poll for the latest run state. Caller
 * decides cadence; typical: 1Hz while status is "running" or
 * "queued", stop on terminal status.
 */
export async function pollRunRemote(
  runId: string,
): Promise<RunSnapshot> {
  const res = await fetch(`/api/agent/runs/${encodeURIComponent(runId)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(
      body?.error?.message ?? `Poll returned ${res.status}`,
    );
  }
  const { run } = (await res.json()) as { run: RunSnapshot };
  return run;
}

export interface RunSnapshot {
  id: string;
  prompt: string;
  status: RunStatus;
  totalCostMicros: number | null;
  estCostMicros: number;
  outputFileId: string | null;
  errorMessage: string | null;
  steps: Array<{
    id: string;
    idx: number;
    tool: string;
    status: StepStatus;
    outputRef: string | null;
    outputType: string | null;
    costMicros: number | null;
    errorMessage: string | null;
  }>;
}

/**
 * Helper: poll until the run reaches a terminal state (or
 * awaiting_approval, which is a soft pause).
 */
export async function pollUntilTerminal(
  runId: string,
  opts: { intervalMs?: number; maxMs?: number; onUpdate?: (s: RunSnapshot) => void } = {},
): Promise<RunSnapshot> {
  const intervalMs = opts.intervalMs ?? 1000;
  const maxMs = opts.maxMs ?? 60_000;
  const startedAt = Date.now();
  let snapshot: RunSnapshot | null = null;

  for (;;) {
    snapshot = await pollRunRemote(runId);
    opts.onUpdate?.(snapshot);
    if (
      snapshot.status === "completed" ||
      snapshot.status === "failed" ||
      snapshot.status === "cancelled" ||
      snapshot.status === "awaiting_approval"
    ) {
      return snapshot;
    }
    if (Date.now() - startedAt > maxMs) {
      // Don't crash — just return the last snapshot we have so the UI
      // can show "still running, refresh to see progress".
      return snapshot;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
