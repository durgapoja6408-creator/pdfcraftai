// lib/ai/eval/human-grade-writer.ts — write-side helpers for human
// eval grading (PENDING §6a Phase G partial, 2026-05-05).
//
// Companion to lib/ai/eval/human-grades.ts (read-side). Sits beside
// the foundation shipped earlier this session: this module is what
// the (future) interactive grader UI at /admin/evals/grade calls
// when an operator submits a Likert score.
//
// Two operations:
//   1. recordHumanGrade(input) — INSERT a fresh grade row. Throws
//      on duplicate-key (the 5-col unique constraint) so the
//      caller surfaces "you've already graded this combo — did you
//      mean to overwrite?" UI rather than silently replacing.
//   2. replaceGrade(input) — explicit "yes, overwrite my prior
//      grade" path. DELETE then INSERT in a transaction.
//
// What this module does NOT do
// ----------------------------
// - Validate that the goldenSetId resolves to a real fixture in
//   lib/ai/eval/golden-set.ts. Caller (the grader UI) is responsible
//   for picking from a dropdown of valid fixture ids. The schema
//   stores the id as a string for code-as-source-of-truth reasons
//   (foundation rationale in human-grades.ts header).
// - Truncate the ai_output_excerpt to 4KB. Caller does that — the
//   excerpt comes from the grader UI which already shows a
//   preview, so truncation is at the UI layer.
// - Send notifications. Slack alerter on per-op average crossing
//   below HUMAN_GRADE_FLOOR is a Phase G follow-on (depends on §2a
//   Slack webhook URL).

import { randomUUID } from "node:crypto";
import { db, schema } from "@/db/client";
import { and, eq } from "drizzle-orm";

export class HumanGradeWriteError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_SCORE"
      | "EMPTY_REQUIRED"
      | "DUPLICATE"
      | "ROW_NOT_FOUND"
      | "DB_ERROR",
  ) {
    super(message);
    this.name = "HumanGradeWriteError";
  }
}

export interface RecordHumanGradeInput {
  goldenSetId: string;
  operation: string;
  providerId: string;
  model: string;
  evalRunId?: string | null;
  graderUserId: string;
  scoreRelevance: number;
  scoreCompleteness: number;
  scoreFaithfulness: number;
  scoreActionability: number;
  notes?: string | null;
  aiOutputExcerpt?: string | null;
}

export interface RecordHumanGradeResult {
  /** UUID of the new (or replaced) eval_human_grades row. */
  id: string;
  /** True if a prior row was replaced by this write (replaceGrade only). */
  replaced: boolean;
}

/**
 * 1..5 Likert scale validation. Outside this range = caller bug —
 * the grader UI sliders are clamped client-side; if the server sees
 * an out-of-range value it's either a malicious POST or a logic bug
 * in the form. Either way: throw, don't silently clamp.
 */
function validateScore(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HumanGradeWriteError(
      `${name} must be a number (got ${typeof value})`,
      "INVALID_SCORE",
    );
  }
  if (!Number.isInteger(value)) {
    throw new HumanGradeWriteError(
      `${name} must be an integer (got ${value})`,
      "INVALID_SCORE",
    );
  }
  if (value < 1 || value > 5) {
    throw new HumanGradeWriteError(
      `${name} must be 1..5 (got ${value})`,
      "INVALID_SCORE",
    );
  }
  return value;
}

function validateNonEmpty(name: string, value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HumanGradeWriteError(
      `${name} is required`,
      "EMPTY_REQUIRED",
    );
  }
  return value.trim();
}

function valuesFromInput(input: RecordHumanGradeInput, id: string) {
  return {
    id,
    goldenSetId: validateNonEmpty("goldenSetId", input.goldenSetId),
    operation: validateNonEmpty("operation", input.operation),
    providerId: validateNonEmpty("providerId", input.providerId),
    model: validateNonEmpty("model", input.model),
    evalRunId: input.evalRunId ?? null,
    graderUserId: validateNonEmpty("graderUserId", input.graderUserId),
    scoreRelevance: validateScore(
      "scoreRelevance",
      input.scoreRelevance,
    ),
    scoreCompleteness: validateScore(
      "scoreCompleteness",
      input.scoreCompleteness,
    ),
    scoreFaithfulness: validateScore(
      "scoreFaithfulness",
      input.scoreFaithfulness,
    ),
    scoreActionability: validateScore(
      "scoreActionability",
      input.scoreActionability,
    ),
    notes: input.notes ?? null,
    aiOutputExcerpt: input.aiOutputExcerpt ?? null,
  };
}

/**
 * INSERT a new human grade row. Throws DUPLICATE if a row already
 * exists for the (goldenSetId, providerId, model, operation,
 * graderUserId) combo — the 5-col unique constraint enforces this
 * at the DB level; the catch block translates the duplicate-key
 * error into a typed exception.
 *
 * Use this when you want "first grade wins" semantics. Use
 * `replaceGrade` to explicitly overwrite.
 */
export async function recordHumanGrade(
  input: RecordHumanGradeInput,
): Promise<RecordHumanGradeResult> {
  const id = randomUUID();
  const values = valuesFromInput(input, id);

  try {
    await db.insert(schema.evalHumanGrades).values(values);
    return { id, replaced: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("Duplicate entry") ||
      message.includes("ER_DUP_ENTRY")
    ) {
      throw new HumanGradeWriteError(
        `Grade already exists for (${input.goldenSetId}, ${input.providerId}, ${input.model}, ${input.operation}, ${input.graderUserId}). Use replaceGrade() to overwrite.`,
        "DUPLICATE",
      );
    }
    throw new HumanGradeWriteError(
      `Failed to record grade: ${message}`,
      "DB_ERROR",
    );
  }
}

/**
 * Overwrite an existing grade. DELETE the prior row (matching the
 * 5-col combo), then INSERT the new one. Wrapped in a transaction
 * so a partial failure doesn't leave the table in an
 * insert-without-delete OR delete-without-insert state.
 *
 * Returns `replaced: true` if a prior row existed. `replaced:
 * false` if there was no prior row — caller can use this to
 * disambiguate "I just overwrote a grade" vs "I just wrote a
 * fresh grade" UI.
 */
export async function replaceGrade(
  input: RecordHumanGradeInput,
): Promise<RecordHumanGradeResult> {
  const id = randomUUID();
  const values = valuesFromInput(input, id);

  return await db.transaction(async (tx) => {
    const priorRows = await tx
      .select({ id: schema.evalHumanGrades.id })
      .from(schema.evalHumanGrades)
      .where(
        and(
          eq(schema.evalHumanGrades.goldenSetId, values.goldenSetId),
          eq(schema.evalHumanGrades.providerId, values.providerId),
          eq(schema.evalHumanGrades.model, values.model),
          eq(schema.evalHumanGrades.operation, values.operation),
          eq(schema.evalHumanGrades.graderUserId, values.graderUserId),
        ),
      )
      .limit(1);

    const replaced = priorRows.length > 0;

    if (replaced) {
      await tx
        .delete(schema.evalHumanGrades)
        .where(eq(schema.evalHumanGrades.id, priorRows[0]!.id));
    }

    await tx.insert(schema.evalHumanGrades).values(values);
    return { id, replaced };
  });
}
