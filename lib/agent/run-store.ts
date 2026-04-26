// lib/agent/run-store.ts
//
// Persistence layer for agent runs. Thin wrapper over Drizzle queries —
// every call here is a single SELECT/INSERT/UPDATE so the executor and
// API routes never need to import Drizzle directly. Centralising lets
// us swap the store later (e.g. add a Redis cache for the polling
// endpoint) without touching the call sites.

import { randomUUID } from "crypto";
import { eq, and, desc } from "drizzle-orm";

import { db, schema } from "@/db/client";
import type { AgentPlan, RunStatus, StepStatus } from "./types";

const MICROS_PER_CREDIT = 40_000;

/**
 * Insert a new agent_runs row plus all its agent_run_steps. One DB
 * transaction so a partial insert can never leave orphans.
 *
 * Returns the new run's UUID. Status is "queued" — the executor flips
 * it to "running" when it picks up the run.
 */
export async function createRun(args: {
  userId: string;
  plan: AgentPlan;
}): Promise<{ runId: string }> {
  const runId = randomUUID();
  const estCostMicros = args.plan.totalEstCredits * MICROS_PER_CREDIT;

  await db.transaction(async (tx) => {
    await tx.insert(schema.agentRuns).values({
      id: runId,
      userId: args.userId,
      prompt: args.plan.prompt,
      planJson: args.plan as unknown as Record<string, unknown>,
      status: "queued",
      estCostMicros,
    });
    if (args.plan.steps.length > 0) {
      await tx.insert(schema.agentRunSteps).values(
        args.plan.steps.map((step) => ({
          id: randomUUID(),
          runId,
          idx: step.idx,
          tool: step.tool,
          paramsJson: step.params as unknown as Record<string, unknown>,
          status: "pending" as StepStatus,
        })),
      );
    }
  });

  return { runId };
}

/**
 * Fetch a run + its steps for the polling/SSE endpoint and the
 * /app/agent/history detail page. Returns null if the run doesn't exist
 * or the userId doesn't match (defence-in-depth — the route should
 * also gate by session userId, but a second check here makes data
 * leakage harder).
 */
export async function getRunForUser(args: {
  runId: string;
  userId: string;
}): Promise<RunWithSteps | null> {
  const [run] = await db
    .select()
    .from(schema.agentRuns)
    .where(
      and(
        eq(schema.agentRuns.id, args.runId),
        eq(schema.agentRuns.userId, args.userId),
      ),
    )
    .limit(1);
  if (!run) return null;

  const steps = await db
    .select()
    .from(schema.agentRunSteps)
    .where(eq(schema.agentRunSteps.runId, args.runId))
    .orderBy(schema.agentRunSteps.idx);

  return {
    id: run.id,
    userId: run.userId,
    prompt: run.prompt,
    planJson: run.planJson as unknown as AgentPlan,
    status: run.status as RunStatus,
    totalCostMicros: run.totalCostMicros,
    estCostMicros: run.estCostMicros,
    outputFileId: run.outputFileId,
    errorMessage: run.errorMessage,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    steps: steps.map((s) => ({
      id: s.id,
      idx: s.idx,
      tool: s.tool,
      paramsJson: s.paramsJson as unknown as Record<string, unknown>,
      status: s.status as StepStatus,
      outputRef: s.outputRef,
      outputType: s.outputType,
      costMicros: s.costMicros,
      errorMessage: s.errorMessage,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
    })),
  };
}

/** List recent runs for /app/agent/history. */
export async function listRunsForUser(args: {
  userId: string;
  limit?: number;
}): Promise<RunSummary[]> {
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
  const rows = await db
    .select({
      id: schema.agentRuns.id,
      prompt: schema.agentRuns.prompt,
      status: schema.agentRuns.status,
      totalCostMicros: schema.agentRuns.totalCostMicros,
      estCostMicros: schema.agentRuns.estCostMicros,
      createdAt: schema.agentRuns.createdAt,
      completedAt: schema.agentRuns.completedAt,
    })
    .from(schema.agentRuns)
    .where(eq(schema.agentRuns.userId, args.userId))
    .orderBy(desc(schema.agentRuns.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    prompt: r.prompt,
    status: r.status as RunStatus,
    totalCostMicros: r.totalCostMicros,
    estCostMicros: r.estCostMicros,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
  }));
}

/** Update the run's overall status. Used by the executor at start/end. */
export async function setRunStatus(args: {
  runId: string;
  status: RunStatus;
  totalCostMicros?: number;
  outputFileId?: string;
  errorMessage?: string;
}): Promise<void> {
  const updates: Partial<typeof schema.agentRuns.$inferInsert> = {
    status: args.status,
  };
  if (args.totalCostMicros !== undefined) {
    updates.totalCostMicros = args.totalCostMicros;
  }
  if (args.outputFileId !== undefined) {
    updates.outputFileId = args.outputFileId;
  }
  if (args.errorMessage !== undefined) {
    updates.errorMessage = args.errorMessage;
  }
  if (args.status === "completed" || args.status === "failed" || args.status === "cancelled") {
    updates.completedAt = new Date();
  }
  await db
    .update(schema.agentRuns)
    .set(updates)
    .where(eq(schema.agentRuns.id, args.runId));
}

/** Update a single step. Called by the executor after each tool call. */
export async function setStepStatus(args: {
  runId: string;
  idx: number;
  status: StepStatus;
  outputRef?: string;
  outputType?: string;
  costMicros?: number;
  errorMessage?: string;
}): Promise<void> {
  const updates: Partial<typeof schema.agentRunSteps.$inferInsert> = {
    status: args.status,
  };
  if (args.outputRef !== undefined) updates.outputRef = args.outputRef;
  if (args.outputType !== undefined) updates.outputType = args.outputType;
  if (args.costMicros !== undefined) updates.costMicros = args.costMicros;
  if (args.errorMessage !== undefined) updates.errorMessage = args.errorMessage;
  if (args.status === "running") updates.startedAt = new Date();
  if (
    args.status === "succeeded" ||
    args.status === "failed" ||
    args.status === "skipped"
  ) {
    updates.completedAt = new Date();
  }
  await db
    .update(schema.agentRunSteps)
    .set(updates)
    .where(
      and(
        eq(schema.agentRunSteps.runId, args.runId),
        eq(schema.agentRunSteps.idx, args.idx),
      ),
    );
}

// ───────── Type exports for consumers ─────────
export interface RunSummary {
  id: string;
  prompt: string;
  status: RunStatus;
  totalCostMicros: number | null;
  estCostMicros: number;
  createdAt: Date;
  completedAt: Date | null;
}

export interface StepRow {
  id: string;
  idx: number;
  tool: string;
  paramsJson: Record<string, unknown>;
  status: StepStatus;
  outputRef: string | null;
  outputType: string | null;
  costMicros: number | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface RunWithSteps {
  id: string;
  userId: string;
  prompt: string;
  planJson: AgentPlan;
  status: RunStatus;
  totalCostMicros: number | null;
  estCostMicros: number;
  outputFileId: string | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
  steps: StepRow[];
}
