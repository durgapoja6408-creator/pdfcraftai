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
export async function loadGraderActivity(
  options: { lookbackDays?: number } = {},
): Promise<Array<{ graderUserId: string; gradeCount: number }>> {
  const lookbackDays = options.lookbackDays ?? 7;
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      graderUserId: schema.evalHumanGrades.graderUserId,
      gradeCount: sql<number>`COUNT(*)`,
    })
    .from(schema.evalHumanGrades)
    .where(gte(schema.evalHumanGrades.createdAt, cutoff))
    .groupBy(schema.evalHumanGrades.graderUserId)
    .orderBy(sql`COUNT(*) DESC`);

  return rows.map((r) => ({
    graderUserId: r.graderUserId,
    gradeCount: Number(r.gradeCount),
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
