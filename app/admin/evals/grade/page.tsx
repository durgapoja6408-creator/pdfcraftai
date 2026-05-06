// app/admin/evals/grade/page.tsx — Human eval grader form (PENDING
// §6a Phase G partial, 2026-05-05).
//
// Pairs with /api/admin/evals/grade (the POST handler shipped
// earlier this session). Operator submits a Likert grade; the form
// POSTs to the route; the route calls recordHumanGrade or
// replaceGrade.
//
// Scope decision (v1)
// -------------------
// This is the BASIC grader form — text inputs for fixture
// metadata + 4 Likert sliders + notes textarea. The original Phase
// G spec called for "golden-set fixture + AI output side-by-side"
// which would require:
//   - A dropdown of valid fixture ids (read from
//     lib/ai/eval/golden-set.ts)
//   - A "regenerate output now" button that calls route(op,…) and
//     shows the live AI output for grading
// Both are bigger builds. v1 is intentionally minimal: operators
// run scripts/run-ai-evals.mjs separately, then come here to enter
// the score. The richer side-by-side flow is a future enhancement.

import type { Metadata } from "next";
import { auth } from "@/auth";
import { requireAdmin } from "@/lib/admin/guard";
import { loadGraderActivityForUser } from "@/lib/ai/eval/human-grades";
import { GraderForm } from "./GraderForm";

function fmtRelative(d: Date | null): string | null {
  if (!d) return null;
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export const metadata: Metadata = {
  title: "Grade AI eval",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function GradePage() {
  await requireAdmin();

  // Personal-stats panel — Phase G-2 motivation polish (PENDING §6a,
  // 2026-05-06). Pulls the current grader's count + last-graded
  // timestamp so the grader can see at a glance how much they've
  // contributed this week. Empty-state copy when count = 0 nudges
  // toward the first grade.
  const session = await auth();
  const graderUserId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  const myStats =
    typeof graderUserId === "string"
      ? await loadGraderActivityForUser(graderUserId, { lookbackDays: 7 })
      : { gradeCount: 0, lastGradedAt: null };
  const lastRel = fmtRelative(myStats.lastGradedAt);

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Enter human grade
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Submit a Likert score (1-5) on a (provider × model × op ×
          fixture) tuple. Posts to{" "}
          <code>/api/admin/evals/grade</code>. Returns to{" "}
          <code>/admin/evals</code> on success.
        </p>
      </header>

      {/* Personal stats — small motivational panel. Reads
          eval_human_grades scoped to the current grader. */}
      <div
        className="card"
        style={{
          padding: "10px 14px",
          marginBottom: 24,
          fontSize: 13,
          background:
            myStats.gradeCount > 0
              ? "color-mix(in oklab, #4caf50 6%, transparent)"
              : "var(--bg-2)",
          borderColor:
            myStats.gradeCount > 0
              ? "color-mix(in oklab, #4caf50 30%, var(--border))"
              : "var(--border)",
        }}
      >
        {myStats.gradeCount === 0 ? (
          <span>
            <strong>Your stats (last 7 days):</strong> no grades yet.
            Submit your first grade below to start contributing to
            the weekly quality review.
          </span>
        ) : (
          <span>
            <strong>Your stats (last 7 days):</strong> you&rsquo;ve
            entered{" "}
            <strong>
              {myStats.gradeCount}{" "}
              {myStats.gradeCount === 1 ? "grade" : "grades"}
            </strong>
            {lastRel ? `, last one ${lastRel}` : ""}. Thanks for
            keeping the calibration loop running.
          </span>
        )}
      </div>

      <GraderForm />
    </div>
  );
}
