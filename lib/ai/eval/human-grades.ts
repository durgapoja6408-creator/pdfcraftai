// lib/ai/eval/human-grades.ts — read-side helpers for the human
// eval grading layer (PENDING §6a foundation, 2026-05-05).
//
// Sits beside the existing automated-eval modules in lib/ai/eval/:
//   - golden-set.ts (Phase A Task #14): fixture data
//   - rubric.ts:                        deterministic check fns
//   - runner.ts:                        runs op → records ai_eval_runs
//   - types.ts:                         shared types
//   - human-grades.ts (THIS FILE):      read queries on eval_human_grades
//
// Writers + grader UI deferred to Phase G — same staging discipline
// as the other foundations this session.

import { db, schema } from "@/db/client";
import { and, desc, eq, gte, sql } from "drizzle-orm";

export interface HumanGradeRow {
  id: string;
  goldenSetId: string;
  operation: string;
  providerId: string;
  model: string;
  evalRunId: string | null;
  graderUserId: string;
  scoreRelevance: number;
  scoreCompleteness: number;
  scoreFaithfulness: number;
  scoreActionability: number;
  notes: string | null;
  aiOutputExcerpt: string | null;
  createdAt: Date;
}

export interface PerOpAvgRow {
  operation: string;
  providerId: string;
  model: string;
  /** Count of distinct grade rows in the lookback window. */
  gradeCount: number;
  /** Average score per dimension, weighted equally (mean of all rows). */
  avgRelevance: number;
  avgCompleteness: number;
  avgFaithfulness: number;
  avgActionability: number;
  /** Mean of the 4 dimension averages. Quick "is this combo healthy?" signal. */
  overallAvg: number;
}

/**
 * Quality floor for the overall average (mean of 4 dimension means).
 * Below this, the (provider × model × op) combo is flagged red on
 * the admin view. 3.5 chosen as the boundary between "noticeably
 * mediocre" (3.0) and "users complain" (3.0 and below) — calibrate
 * after 2-3 weeks of real grading data lands.
 */
export const HUMAN_GRADE_FLOOR = 3.5;

/**
 * List recent grade rows for the admin /admin/evals page. Default
 * limit 200; paginate later when volume justifies it.
 */
export async function listRecentHumanGrades(
  limit = 200,
): Promise<HumanGradeRow[]> {
  const rows = await db
    .select()
    .from(schema.evalHumanGrades)
    .orderBy(desc(schema.evalHumanGrades.createdAt))
    .limit(limit);
  return rows.map(toRow);
}

/**
 * Aggregate scores per (provider × model × op) over the lookback
 * window (default 30 days). One row per combo. Sorted by overallAvg
 * ASC so the worst-performing combos surface first.
 *
 * Why 30 days lookback:
 *   - Weekly review cadence + 4 weeks of history = enough rows per
 *     combo to compute meaningful averages even at low grade volume
 *   - Anything older than 30 days is from a model version that's
 *     potentially been rotated; including it muddles current quality
 *     signal
 */
export async function loadPerOpAverages(
  options: { lookbackDays?: number } = {},
): Promise<PerOpAvgRow[]> {
  const lookbackDays = options.lookbackDays ?? 30;
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      operation: schema.evalHumanGrades.operation,
      providerId: schema.evalHumanGrades.providerId,
      model: schema.evalHumanGrades.model,
      gradeCount: sql<number>`COUNT(*)`,
      avgRelevance: sql<number>`AVG(${schema.evalHumanGrades.scoreRelevance})`,
      avgCompleteness: sql<number>`AVG(${schema.evalHumanGrades.scoreCompleteness})`,
      avgFaithfulness: sql<number>`AVG(${schema.evalHumanGrades.scoreFaithfulness})`,
      avgActionability: sql<number>`AVG(${schema.evalHumanGrades.scoreActionability})`,
    })
    .from(schema.evalHumanGrades)
    .where(gte(schema.evalHumanGrades.createdAt, cutoff))
    .groupBy(
      schema.evalHumanGrades.operation,
      schema.evalHumanGrades.providerId,
      schema.evalHumanGrades.model,
    );

  return rows
    .map((r) => {
      const avgR = Number(r.avgRelevance);
      const avgC = Number(r.avgCompleteness);
      const avgF = Number(r.avgFaithfulness);
      const avgA = Number(r.avgActionability);
      return {
        operation: r.operation,
        providerId: r.providerId,
        model: r.model,
        gradeCount: Number(r.gradeCount),
        avgRelevance: avgR,
        avgCompleteness: avgC,
        avgFaithfulness: avgF,
        avgActionability: avgA,
        overallAvg: (avgR + avgC + avgF + avgA) / 4,
      };
    })
    .sort((a, b) => a.overallAvg - b.overallAvg);
}

/**
 * Count of grades broken down by grader. Used for an "is the team
 * actually grading?" health card on /admin/evals — if no grades have
 * landed in the last 7 days, the weekly cadence has lapsed.
 */
/**
 * Personal stats for a single grader: total grade count + most-
 * recent grade timestamp within the lookback window. Used by the
 * /admin/evals/grade page to render a "you've graded N items in
 * the last 7 days" panel — small motivational nudge for graders
 * doing weekly review sessions.
 *
 * Differs from loadGraderActivity (which aggregates across all
 * graders) by scoping to a single graderUserId.
 *
 * Returns { gradeCount: 0, lastGradedAt: null } when the user
 * has no grades in the window — caller can render an empty-state
 * "you haven't graded anything yet" copy.
 */
export async function loadGraderActivityForUser(
  graderUserId: string,
  options: { lookbackDays?: number } = {},
): Promise<{ gradeCount: number; lastGradedAt: Date | null }> {
  if (typeof graderUserId !== "string" || graderUserId.length === 0) {
    return { gradeCount: 0, lastGradedAt: null };
  }
  const lookbackDays = Math.max(1, options.lookbackDays ?? 7);
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const [row] = await db
    .select({
      count: sql<number>`COUNT(*)`,
      lastAt: sql<Date | null>`MAX(${schema.evalHumanGrades.createdAt})`,
    })
    .from(schema.evalHumanGrades)
    .where(
      and(
        eq(schema.evalHumanGrades.graderUserId, graderUserId),
        gte(schema.evalHumanGrades.createdAt, cutoff),
      ),
    );

  return {
    gradeCount: Number(row?.count ?? 0),
    lastGradedAt: row?.lastAt ?? null,
  };
}

export async function loadGraderActivity(
  options: { lookbackDays?: number } = {},
): Promise<
  Array<{
    graderUserId: string;
    gradeCount: number;
    graderEmail: string | null;
    graderName: string | null;
  }>
> {
  const lookbackDays = options.lookbackDays ?? 7;
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  // leftJoin on users so the admin table can render email/name
  // instead of opaque user-id fragments. leftJoin (not innerJoin)
  // is defensive: if a user row went missing the grade still
  // shows up — the page falls back to shortUser(graderUserId).
  // Aggregate by graderUserId (the stable identifier); MAX() on
  // email/name returns the same single value for all rows in the
  // group since users.id is unique.
  const rows = await db
    .select({
      graderUserId: schema.evalHumanGrades.graderUserId,
      gradeCount: sql<number>`COUNT(*)`,
      graderEmail: sql<string | null>`MAX(${schema.users.email})`,
      graderName: sql<string | null>`MAX(${schema.users.name})`,
    })
    .from(schema.evalHumanGrades)
    .leftJoin(
      schema.users,
      eq(schema.users.id, schema.evalHumanGrades.graderUserId),
    )
    .where(gte(schema.evalHumanGrades.createdAt, cutoff))
    .groupBy(schema.evalHumanGrades.graderUserId)
    .orderBy(sql`COUNT(*) DESC`);

  return rows.map((r) => ({
    graderUserId: r.graderUserId,
    gradeCount: Number(r.gradeCount),
    graderEmail: r.graderEmail ?? null,
    graderName: r.graderName ?? null,
  }));
}

/**
 * Look up grades for a specific (golden-set fixture × provider ×
 * model × op) combo. Used by the (future Phase G) grader UI to show
 * "what other graders said" when entering a new grade.
 */
export async function loadGradesForCombo(
  goldenSetId: string,
  providerId: string,
  model: string,
  operation: string,
): Promise<HumanGradeRow[]> {
  const rows = await db
    .select()
    .from(schema.evalHumanGrades)
    .where(
      and(
        eq(schema.evalHumanGrades.goldenSetId, goldenSetId),
        eq(schema.evalHumanGrades.providerId, providerId),
        eq(schema.evalHumanGrades.model, model),
        eq(schema.evalHumanGrades.operation, operation),
      ),
    )
    .orderBy(desc(schema.evalHumanGrades.createdAt));
  return rows.map(toRow);
}

/**
 * Load all grades for a specific (operation × providerId × model)
 * combo across all golden-set fixtures. Used by Phase G-2's
 * /admin/evals/[op]/[providerId]/[model] drilldown to surface
 * the full grade history for a single model/op pair — useful
 * for spotting trends across fixtures (e.g. "summarize on
 * Claude Haiku 4.5 is degrading on long inputs").
 *
 * Differs from loadGradesForCombo: that takes a goldenSetId
 * (single fixture); this takes none and includes all fixtures.
 *
 * Limit defaults to 200 — same ceiling as listRecentHumanGrades
 * to keep the drilldown table renderable without pagination.
 */
export async function loadGradesForOpCombo(
  operation: string,
  providerId: string,
  model: string,
  limit: number = 200,
): Promise<HumanGradeRow[]> {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const rows = await db
    .select()
    .from(schema.evalHumanGrades)
    .where(
      and(
        eq(schema.evalHumanGrades.operation, operation),
        eq(schema.evalHumanGrades.providerId, providerId),
        eq(schema.evalHumanGrades.model, model),
      ),
    )
    .orderBy(desc(schema.evalHumanGrades.createdAt))
    .limit(safeLimit);
  return rows.map(toRow);
}

function toRow(r: typeof schema.evalHumanGrades.$inferSelect): HumanGradeRow {
  return {
    id: r.id,
    goldenSetId: r.goldenSetId,
    operation: r.operation,
    providerId: r.providerId,
    model: r.model,
    evalRunId: r.evalRunId ?? null,
    graderUserId: r.graderUserId,
    scoreRelevance: r.scoreRelevance,
    scoreCompleteness: r.scoreCompleteness,
    scoreFaithfulness: r.scoreFaithfulness,
    scoreActionability: r.scoreActionability,
    notes: r.notes ?? null,
    aiOutputExcerpt: r.aiOutputExcerpt ?? null,
    createdAt: r.createdAt,
  };
}
