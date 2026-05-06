// app/admin/evals/page.tsx — Human eval grading admin viewer.
//
// PENDING_WORK_ANALYSIS.md §6a foundation. Read-only consumer of
// `lib/ai/eval/human-grades.ts`. Surfaces:
//   1. Per-(provider × model × op) average scores over 30 days,
//      sorted worst-first so red flags surface immediately
//   2. Recent grade activity (last 7 days, who graded what)
//   3. Recent grade rows (200 latest) for audit + spot-check
//
// Threshold floor (HUMAN_GRADE_FLOOR = 3.5) — overall averages
// below this render in red. Above 4.0 render green; 3.5-4.0 render
// neutral. The floor is calibrated for "user-noticeable mediocre"
// (3.0 and below) vs "good enough" (3.5 and up). Recalibrate after
// 2-3 weeks of real grading data accumulates.
//
// What this page does NOT do
// --------------------------
// - Submit grades. The grader UI is Phase G — interactive form
//   with the golden-set fixture + AI output side-by-side + Likert
//   sliders. Today's foundation is observational only.
// - Trigger automated runs. Phase A Task #14 already ships the
//   CLI (`scripts/run-ai-evals.mjs`); operators run it manually
//   weekly.
// - Show the actual AI output. Each grade row stores a 4KB
//   excerpt; we don't surface that here to keep the page
//   scannable. Future enhancement: per-grade-row drilldown link
//   to /admin/evals/<id>.

import { requireAdmin } from "@/lib/admin/guard";
import {
  HUMAN_GRADE_FLOOR,
  listRecentHumanGrades,
  loadGraderActivity,
  loadPerOpAverages,
} from "@/lib/ai/eval/human-grades";
import { SectionTitle, Td, Th, tableStyle } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ") + " UTC";
}

function fmtScore(n: number): string {
  return n.toFixed(2);
}

function shortUser(userId: string): string {
  if (userId.length <= 16) return userId;
  return `${userId.slice(0, 8)}…${userId.slice(-4)}`;
}

function scoreColor(avg: number): string {
  if (avg < HUMAN_GRADE_FLOOR) return "#c00"; // red
  if (avg < 4.0) return "var(--fg)"; // neutral
  return "#4caf50"; // green
}

export default async function AdminEvalsPage() {
  await requireAdmin();
  const [perOp, activity, recent] = await Promise.all([
    loadPerOpAverages({ lookbackDays: 30 }),
    loadGraderActivity({ lookbackDays: 7 }),
    listRecentHumanGrades(200),
  ]);

  const flaggedCount = perOp.filter(
    (r) => r.overallAvg < HUMAN_GRADE_FLOOR,
  ).length;
  const totalGrades = perOp.reduce((acc, r) => acc + r.gradeCount, 0);
  const gradersThisWeek = activity.length;

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Human eval grades
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Source: <code>eval_human_grades</code> (migration 0026). Pairs
          with the automated eval layer (Phase A Task #14, runs via{" "}
          <code>scripts/run-ai-evals.mjs</code>) — this page surfaces
          the SUBJECTIVE judgment from weekly review sessions.
        </p>
        <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
          Threshold floor: <strong>{HUMAN_GRADE_FLOOR.toFixed(1)}</strong>{" "}
          overall average (mean of relevance / completeness /
          faithfulness / actionability). Below this, the
          (provider × model × op) combo renders red. Recalibrate
          after 2-3 weeks of grading data accumulates.
        </p>
      </header>

      {/* Summary cards */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div className="card" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Total grades (30d)
          </div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{totalGrades}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Combos flagged red
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: flaggedCount > 0 ? "#c00" : "#4caf50",
            }}
          >
            {flaggedCount}
          </div>
        </div>
        <div
          className="card"
          style={{
            padding: 16,
            borderColor:
              gradersThisWeek === 0 ? "#f57c00" : "var(--border)",
          }}
        >
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Active graders (7d)
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: gradersThisWeek === 0 ? "#f57c00" : "var(--fg)",
            }}
          >
            {gradersThisWeek}
          </div>
        </div>
      </section>

      {/* Per-(provider × model × op) averages — worst first */}
      <SectionTitle>
        Per-(provider × model × op) averages — last 30 days
      </SectionTitle>
      {perOp.length === 0 ? (
        <p className="muted" style={{ fontSize: 14, marginBottom: 24 }}>
          No grades yet. Empty by design — Phase G adds the grader UI
          at <code>/admin/evals/grade</code>. Until then, this table
          stays empty even when the automated eval CLI runs.
        </p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Op</Th>
              <Th>Provider</Th>
              <Th>Model</Th>
              <Th>n</Th>
              <Th>Relevance</Th>
              <Th>Completeness</Th>
              <Th>Faithfulness</Th>
              <Th>Actionability</Th>
              <Th>Overall</Th>
            </tr>
          </thead>
          <tbody>
            {perOp.map((r) => (
              <tr key={`${r.operation}.${r.providerId}.${r.model}`}>
                <Td>
                  <code style={{ fontSize: 12 }}>{r.operation}</code>
                </Td>
                <Td>
                  <code style={{ fontSize: 12 }}>{r.providerId}</code>
                </Td>
                <Td>
                  <code style={{ fontSize: 12 }}>{r.model}</code>
                </Td>
                <Td>{r.gradeCount}</Td>
                <Td>{fmtScore(r.avgRelevance)}</Td>
                <Td>{fmtScore(r.avgCompleteness)}</Td>
                <Td>{fmtScore(r.avgFaithfulness)}</Td>
                <Td>{fmtScore(r.avgActionability)}</Td>
                <Td>
                  <span
                    style={{
                      fontWeight: 700,
                      color: scoreColor(r.overallAvg),
                    }}
                  >
                    {fmtScore(r.overallAvg)}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Grader activity */}
      <div style={{ marginTop: 24 }}>
        <SectionTitle>Grader activity — last 7 days</SectionTitle>
        {activity.length === 0 ? (
          <p
            className="muted"
            style={{
              fontSize: 13,
              padding: "8px 12px",
              borderRadius: 4,
              background: "color-mix(in oklab, #f57c00 10%, transparent)",
              color: "#f57c00",
            }}
          >
            <strong>Stale:</strong> no grades have been entered in the
            last 7 days. The weekly grading cadence has lapsed — assign
            a grader for this week.
          </p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Grader</Th>
                <Th>Grades (7d)</Th>
              </tr>
            </thead>
            <tbody>
              {activity.map((a) => (
                <tr key={a.graderUserId}>
                  <Td>
                    <code style={{ fontSize: 12 }}>
                      {shortUser(a.graderUserId)}
                    </code>
                  </Td>
                  <Td>{a.gradeCount}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent grades */}
      <div style={{ marginTop: 24 }}>
        <SectionTitle>Recent grades ({recent.length})</SectionTitle>
        {recent.length === 0 ? (
          <p className="muted" style={{ fontSize: 14 }}>
            Nothing graded yet.
          </p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Op</Th>
                <Th>Provider</Th>
                <Th>Model</Th>
                <Th>Fixture</Th>
                <Th>Grader</Th>
                <Th>R</Th>
                <Th>C</Th>
                <Th>F</Th>
                <Th>A</Th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <span
                      style={{ fontSize: 11, color: "var(--fg-subtle)" }}
                    >
                      {fmtDate(r.createdAt)}
                    </span>
                  </Td>
                  <Td>
                    <code style={{ fontSize: 12 }}>{r.operation}</code>
                  </Td>
                  <Td>
                    <code style={{ fontSize: 12 }}>{r.providerId}</code>
                  </Td>
                  <Td>
                    <code style={{ fontSize: 12 }}>{r.model}</code>
                  </Td>
                  <Td>
                    <code style={{ fontSize: 12 }}>{r.goldenSetId}</code>
                  </Td>
                  <Td>
                    <code style={{ fontSize: 12 }}>
                      {shortUser(r.graderUserId)}
                    </code>
                  </Td>
                  <Td>{r.scoreRelevance}</Td>
                  <Td>{r.scoreCompleteness}</Td>
                  <Td>{r.scoreFaithfulness}</Td>
                  <Td>{r.scoreActionability}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
