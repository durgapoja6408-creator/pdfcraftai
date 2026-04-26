// /api/agent/run — start executing an AgentPlan.
//
// REQUEST  (POST, application/json)
//   {
//     plan: AgentPlan   // exactly the shape returned by /api/agent/plan
//   }
//
// RESPONSE (200, application/json)
//   {
//     runId: string,
//     status: "running" | "completed" | "failed" | "awaiting_approval",
//     totalCostMicros: number,
//     stepsExecuted: number
//   }
//
// ERRORS
//   401 → not signed in
//   400 → plan missing or malformed
//   422 → plan has zero steps (planner shouldn't produce these)
//
// Synchronous in H2: the executor runs in the same request. For typical
// plans (system-only, no AI dispatch) this completes in <500ms. Once H3
// adds AI dispatch this becomes "fire and forget" — return runId
// immediately, frontend polls /api/agent/runs/<id> for progress.

import "server-only";

import { auth } from "@/auth";
import { createRun } from "@/lib/agent/run-store";
import { executePlan } from "@/lib/agent/executor";
import type { AgentPlan } from "@/lib/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json(
      { error: { code: "auth_required", message: "Sign in to run agent plans." } },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: { code: "bad_json", message: "Body must be valid JSON." } },
      { status: 400 },
    );
  }

  const { plan } = (body ?? {}) as { plan?: AgentPlan };
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.steps)) {
    return Response.json(
      { error: { code: "missing_plan", message: "Field 'plan' is required and must contain a steps array." } },
      { status: 400 },
    );
  }
  if (plan.steps.length === 0) {
    return Response.json(
      { error: { code: "empty_plan", message: "Plan must contain at least one step." } },
      { status: 422 },
    );
  }

  // Persist + execute
  const { runId } = await createRun({ userId: session.user.id, plan });

  try {
    const result = await executePlan({
      runId,
      userId: session.user.id,
      plan,
    });
    return Response.json(
      {
        runId,
        status: result.status,
        totalCostMicros: result.totalCostMicros,
        stepsExecuted: result.stepsExecuted,
      },
      { status: 200 },
    );
  } catch (e) {
    // The executor catches step errors internally; if we're here, something
    // top-level broke (DB down, etc). Return the runId so the user can
    // re-poll once the issue clears.
    console.error(`[/api/agent/run] executor crashed for run ${runId}:`, e);
    return Response.json(
      {
        runId,
        status: "failed",
        error: {
          code: "executor_crash",
          message: (e as Error).message ?? "Executor crashed.",
        },
      },
      { status: 500 },
    );
  }
}
