// lib/agent/executor.ts
//
// Walks an AgentPlan one step at a time, dispatching to the right handler:
//
//   handler="system"    → in-process (lib/agent/system-tools.ts)
//   handler="ai-route"  → POST internally to /api/ai/<op> (H3)
//   handler="wasm-node" → server-side pdf-lib invocation (H3)
//
// H2 ships system-tool dispatch only — ai-route + wasm-node steps are
// marked "skipped" with a TODO message so the run still completes and
// the UI can render the timeline. H3 wires the other dispatch paths.
//
// Lifecycle:
//   1. setRunStatus(running)
//   2. for each step (in idx order):
//        - if status is already terminal, skip
//        - setStepStatus(running)
//        - dispatch handler
//        - setStepStatus(succeeded | failed | awaiting_approval)
//        - if awaiting_approval → break, leave run paused
//        - if failed and not recoverable → break, mark run failed
//   3. setRunStatus(completed | failed)
//
// Why synchronous (not background-job-queued):
//   For H2 the executor runs in the same request as POST /api/agent/run.
//   Hostinger's request budget is generous (~30s) and our typical plan
//   is 4-7 steps of <2s each. If we exceed that we'll move to a queued
//   pattern in H4 (the existing batch-jobs table can host agent work).

import { getAgentTool } from "./tool-registry";
import { setRunStatus, setStepStatus } from "./run-store";
import { SYSTEM_TOOL_HANDLERS } from "./system-tools";
import type { AgentPlan, AgentStep } from "./types";

const MICROS_PER_CREDIT = 40_000;

export interface ExecutorInput {
  runId: string;
  userId: string;
  plan: AgentPlan;
}

export interface ExecutorOutput {
  /** Final run status. */
  status: "completed" | "failed" | "awaiting_approval";
  /** Total cost in micros across all succeeded steps. */
  totalCostMicros: number;
  /** Number of steps that ran (any non-pending status). */
  stepsExecuted: number;
}

/**
 * Run a plan to completion (or until it pauses for approval / fails).
 * Returns the final status. Persists every step's status as it goes.
 */
export async function executePlan(
  input: ExecutorInput,
): Promise<ExecutorOutput> {
  await setRunStatus({ runId: input.runId, status: "running" });

  let totalCostMicros = 0;
  let stepsExecuted = 0;
  let finalStatus: ExecutorOutput["status"] = "completed";

  for (const step of input.plan.steps) {
    const def = getAgentTool(step.tool);
    if (!def) {
      // Should never happen — planner already validated against the
      // registry. Skip + record so we don't crash the loop.
      await setStepStatus({
        runId: input.runId,
        idx: step.idx,
        status: "failed",
        errorMessage: `Unknown tool: ${step.tool}`,
      });
      finalStatus = "failed";
      break;
    }

    await setStepStatus({
      runId: input.runId,
      idx: step.idx,
      status: "running",
    });

    try {
      const result = await dispatchStep(step, def.handler, def.aiOp, input);
      stepsExecuted++;

      if (result.status === "awaiting_approval") {
        // The executor halts here. The user approves via /api/agent/
        // runs/<id>/approve, which re-invokes executePlan with the
        // step status flipped to "succeeded" — the loop picks up at
        // the next step. (H3 wires that endpoint.)
        await setStepStatus({
          runId: input.runId,
          idx: step.idx,
          status: "awaiting_approval",
          outputRef: result.outputRef,
          outputType: result.outputType,
        });
        finalStatus = "awaiting_approval";
        break;
      }

      // succeeded
      const stepCostMicros = (result.costCredits ?? 0) * MICROS_PER_CREDIT;
      totalCostMicros += stepCostMicros;
      await setStepStatus({
        runId: input.runId,
        idx: step.idx,
        status: "succeeded",
        outputRef: result.outputRef,
        outputType: result.outputType,
        costMicros: stepCostMicros,
      });
    } catch (err) {
      const message = (err as Error).message ?? "unknown error";
      await setStepStatus({
        runId: input.runId,
        idx: step.idx,
        status: "failed",
        errorMessage: message.slice(0, 500),
      });
      finalStatus = "failed";
      // Mark remaining steps as skipped so the UI doesn't show them
      // as eternally pending.
      for (const remaining of input.plan.steps.filter(
        (s) => s.idx > step.idx,
      )) {
        await setStepStatus({
          runId: input.runId,
          idx: remaining.idx,
          status: "skipped",
        });
      }
      break;
    }
  }

  await setRunStatus({
    runId: input.runId,
    status: finalStatus,
    totalCostMicros,
    ...(finalStatus === "failed" && { errorMessage: "See step error." }),
  });

  return { status: finalStatus, totalCostMicros, stepsExecuted };
}

interface DispatchResult {
  status: "succeeded" | "awaiting_approval";
  outputRef?: string;
  outputType?: string;
  costCredits?: number;
}

/**
 * Single-step dispatcher. Routes by handler type to the right execution
 * path. H2 implements `system`; H3 fills in `ai-route` and `wasm-node`.
 */
async function dispatchStep(
  step: AgentStep,
  handler: "ai-route" | "wasm-node" | "system",
  _aiOp: string | undefined,
  ctx: ExecutorInput,
): Promise<DispatchResult> {
  switch (handler) {
    case "system": {
      const fn = SYSTEM_TOOL_HANDLERS[step.tool];
      if (!fn) {
        throw new Error(`No system handler registered for ${step.tool}`);
      }
      const r = await fn(step.params, {
        userId: ctx.userId,
        runId: ctx.runId,
        stepIdx: step.idx,
      });
      return {
        status: r.status,
        outputRef: r.outputRef,
        outputType: r.outputType,
      };
    }

    case "ai-route":
      // H3 will:
      //   1. Resolve aiOp → /api/ai/<aiOp> URL
      //   2. Build a multipart body from the prior step's output_ref
      //   3. fetch() with the user's session cookie forwarded
      //   4. Capture { fileId, creditCost, balance } from the response
      // For H2 we mark as skipped so the run still terminates cleanly.
      return {
        status: "succeeded",
        outputRef: JSON.stringify({
          stub: true,
          message:
            "ai-route dispatch deferred to H3 — step recorded as a no-op for now.",
          tool: step.tool,
          params: step.params,
        }),
        outputType: "json/stub",
        costCredits: 0,
      };

    case "wasm-node":
      // H3 will run pdf-lib server-side. For H2: same stub treatment.
      return {
        status: "succeeded",
        outputRef: JSON.stringify({
          stub: true,
          message:
            "wasm-node dispatch deferred to H3 — step recorded as a no-op for now.",
          tool: step.tool,
        }),
        outputType: "json/stub",
        costCredits: 0,
      };

    default:
      throw new Error(`Unknown handler type: ${handler as string}`);
  }
}
