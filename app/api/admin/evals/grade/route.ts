// app/api/admin/evals/grade/route.ts — admin POST handler for human
// eval grading (PENDING §6a Phase G partial, 2026-05-05).
//
// Pairs with `lib/ai/eval/human-grade-writer.ts`. Auth-gated by admin
// session (mirrors /api/admin/reconcile pattern from Task #24). The
// (future) interactive grader UI at /admin/evals/grade hits this
// endpoint when an operator submits a Likert score.
//
// Behavior contract
// -----------------
// POST /api/admin/evals/grade
//   JSON body:
//     {
//       goldenSetId, operation, providerId, model, evalRunId?,
//       scoreRelevance: 1..5, scoreCompleteness: 1..5,
//       scoreFaithfulness: 1..5, scoreActionability: 1..5,
//       notes?, aiOutputExcerpt?, replace?: boolean
//     }
//
//   - graderUserId is taken from the admin session, NOT the request
//     body. Trusting the body would let an admin attribute grades to
//     other admins.
//   - replace=false (default): INSERT, throws DUPLICATE on the 5-col
//     unique. Surfaces 409 to the client.
//   - replace=true: DELETE-then-INSERT. Returns replaced=true if
//     a prior row existed.
//
// Response shapes:
//   200 — { ok: true, id, replaced }
//   400 — bad_request (validation error from writer — invalid score,
//         missing required field)
//   401 — not_authenticated
//   403 — forbidden (logged in but not admin)
//   409 — duplicate (replace=false and the 5-col combo already
//         has a row; client should retry with replace=true)
//   500 — db_error (any other write failure)

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin/guard";
import {
  HumanGradeWriteError,
  recordHumanGrade,
  replaceGrade,
  type RecordHumanGradeInput,
} from "@/lib/ai/eval/human-grade-writer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  // -- 1. Auth + admin gate ---------------------------------------------
  const session = await auth();
  const email = session?.user?.email;
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  if (typeof email !== "string" || typeof userId !== "string") {
    return NextResponse.json(
      { ok: false, error: "not_authenticated" },
      { status: 401 },
    );
  }
  if (!isAdminEmail(email, process.env.ADMIN_EMAILS)) {
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403 },
    );
  }

  // -- 2. Parse body ----------------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "invalid JSON body" },
      { status: 400 },
    );
  }

  // -- 3. Build writer input -------------------------------------------
  // graderUserId is taken from the SESSION, not the body. This is
  // load-bearing: trusting the body would let an admin attribute
  // grades to other admins.
  const input: RecordHumanGradeInput = {
    goldenSetId: String(body.goldenSetId ?? ""),
    operation: String(body.operation ?? ""),
    providerId: String(body.providerId ?? ""),
    model: String(body.model ?? ""),
    evalRunId:
      typeof body.evalRunId === "string" ? body.evalRunId : null,
    graderUserId: userId,
    scoreRelevance: Number(body.scoreRelevance),
    scoreCompleteness: Number(body.scoreCompleteness),
    scoreFaithfulness: Number(body.scoreFaithfulness),
    scoreActionability: Number(body.scoreActionability),
    notes: typeof body.notes === "string" ? body.notes : null,
    aiOutputExcerpt:
      typeof body.aiOutputExcerpt === "string"
        ? body.aiOutputExcerpt
        : null,
  };

  const replace = body.replace === true;

  // -- 4. Write --------------------------------------------------------
  try {
    const result = replace
      ? await replaceGrade(input)
      : await recordHumanGrade(input);
    return NextResponse.json({
      ok: true,
      id: result.id,
      replaced: result.replaced,
    });
  } catch (err) {
    if (err instanceof HumanGradeWriteError) {
      // Map writer error codes to HTTP status. INVALID_SCORE +
      // EMPTY_REQUIRED are 400 (caller's bug), DUPLICATE is 409,
      // anything else is 500.
      let status = 500;
      if (
        err.code === "INVALID_SCORE" ||
        err.code === "EMPTY_REQUIRED"
      ) {
        status = 400;
      } else if (err.code === "DUPLICATE") {
        status = 409;
      }
      return NextResponse.json(
        { ok: false, error: err.code.toLowerCase(), detail: err.message },
        { status },
      );
    }
    console.error("[admin/evals/grade] unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: "db_error", detail: "internal_error" },
      { status: 500 },
    );
  }
}
