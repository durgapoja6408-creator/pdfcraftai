// app/admin/evals/[op]/[providerId]/[model]/page.tsx — Phase G-2
// drilldown view for a single (operation × providerId × model)
// combo (PENDING §6a, 2026-05-06).
//
// Surfaces all eval_human_grades rows for the combo across all
// golden-set fixtures, with per-grade notes + ai_output_excerpt
// in expanded view. Used by ops to investigate WHY a combo's
// overall average dropped below HUMAN_GRADE_FLOOR (the parent
// /admin/evals page renders red on combos below the floor; this
// page is the drilldown that shows the actual feedback).
//
// Read-only by design — no actions, no mutation, no admin grants.
// Pure observability surface.

import Link from "next/link";

import { requireAdmin } from "@/lib/admin/guard";
import {
  HUMAN_GRADE_FLOOR,
  loadGradesForOpCombo,
} from "@/lib/ai/eval/human-grades";
import { SectionTitle, Td, Th, tableStyle } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  op: string;
  providerId: string;
  model: string;
}

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
  if (avg < HUMAN_GRADE_FLOOR) return "#c00";
  if (avg < 4.0) return "var(--fg)";
  return "#4caf50";
}

/**
 * Inline SVG trend chart — overall score over time. No external
 * chart library; pure SVG polyline. Phase G-2 (PENDING §6a,
 * 2026-05-06).
 *
 * Layout: 600 × 180 viewBox, 32px left padding for y-axis labels +
 * 16px right padding, 8px top + 24px bottom for x-axis labels.
 * Points plotted in chronological order (oldest → newest, left →
 * right) so a left-to-right downward slope reads as quality
 * regression — the visually expected direction.
 *
 * Renders a horizontal threshold line at y = HUMAN_GRADE_FLOOR
 * with red tint below + green tint above (matches the per-op
 * table's red/green semantics). Empty-state branch returns null
 * so the chart section just doesn't render when there are zero
 * grades — avoids a meaningless empty rectangle.
 */
function TrendChart({
  grades,
}: {
  grades: Array<{
    createdAt: Date;
    scoreRelevance: number;
    scoreCompleteness: number;
    scoreFaithfulness: number;
    scoreActionability: number;
  }>;
}) {
  if (grades.length === 0) return null;

  // Sort chronologically (loadGradesForOpCombo returns DESC; chart
  // wants ASC for the eye-natural left-to-right time progression).
  const points = [...grades]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((g) => ({
      t: g.createdAt.getTime(),
      score:
        (g.scoreRelevance +
          g.scoreCompleteness +
          g.scoreFaithfulness +
          g.scoreActionability) /
        4,
    }));

  // Viewbox geometry. Score axis is fixed [1, 5] (Likert range);
  // time axis spans from earliest to latest grade. Single-grade
  // case: lay the dot at x = midpoint so it doesn't pin to the
  // left edge.
  const W = 600;
  const H = 180;
  const padLeft = 32;
  const padRight = 16;
  const padTop = 8;
  const padBottom = 24;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;

  const minT = points[0]!.t;
  const maxT = points[points.length - 1]!.t;
  const tSpan = maxT - minT > 0 ? maxT - minT : 1; // avoid /0

  const xOf = (t: number) =>
    points.length === 1
      ? padLeft + innerW / 2
      : padLeft + ((t - minT) / tSpan) * innerW;
  // Map score [1, 5] → y [padTop+innerH, padTop] (flip — high score
  // is high on screen)
  const yOf = (s: number) =>
    padTop + innerH - ((s - 1) / 4) * innerH;

  const polyline = points
    .map((p) => `${xOf(p.t).toFixed(2)},${yOf(p.score).toFixed(2)}`)
    .join(" ");

  const floorY = yOf(HUMAN_GRADE_FLOOR);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{
        width: "100%",
        maxWidth: 640,
        height: "auto",
        display: "block",
        marginBottom: 8,
      }}
      role="img"
      aria-label={`Trend chart of overall score over ${points.length} grade${points.length === 1 ? "" : "s"}`}
    >
      {/* Background tint above + below the floor line */}
      <rect
        x={padLeft}
        y={padTop}
        width={innerW}
        height={floorY - padTop}
        fill="color-mix(in oklab, #4caf50 4%, transparent)"
      />
      <rect
        x={padLeft}
        y={floorY}
        width={innerW}
        height={padTop + innerH - floorY}
        fill="color-mix(in oklab, #c00 4%, transparent)"
      />

      {/* Y-axis grid lines at integer scores (1, 2, 3, 4, 5) */}
      {[1, 2, 3, 4, 5].map((s) => (
        <g key={s}>
          <line
            x1={padLeft}
            y1={yOf(s)}
            x2={W - padRight}
            y2={yOf(s)}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray={s === Math.round(HUMAN_GRADE_FLOOR) ? "0" : "2,2"}
            opacity="0.5"
          />
          <text
            x={padLeft - 6}
            y={yOf(s) + 4}
            textAnchor="end"
            fontSize="10"
            fill="var(--fg-subtle)"
          >
            {s}
          </text>
        </g>
      ))}

      {/* Threshold floor line — solid + red */}
      <line
        x1={padLeft}
        y1={floorY}
        x2={W - padRight}
        y2={floorY}
        stroke="#c00"
        strokeWidth="1"
        strokeDasharray="4,3"
        opacity="0.6"
      />
      <text
        x={W - padRight - 4}
        y={floorY - 4}
        textAnchor="end"
        fontSize="10"
        fill="#c00"
        fontWeight="600"
      >
        floor {HUMAN_GRADE_FLOOR.toFixed(1)}
      </text>

      {/* X-axis labels — first + last timestamp only (more would
          clutter at this width) */}
      <text
        x={padLeft}
        y={H - 6}
        fontSize="10"
        fill="var(--fg-subtle)"
      >
        {new Date(minT).toISOString().slice(0, 10)}
      </text>
      {points.length > 1 ? (
        <text
          x={W - padRight}
          y={H - 6}
          textAnchor="end"
          fontSize="10"
          fill="var(--fg-subtle)"
        >
          {new Date(maxT).toISOString().slice(0, 10)}
        </text>
      ) : null}

      {/* Trend line */}
      {points.length > 1 ? (
        <polyline
          points={polyline}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}

      {/* Per-point dots */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={xOf(p.t)}
          cy={yOf(p.score)}
          r="3"
          fill={
            p.score < HUMAN_GRADE_FLOOR
              ? "#c00"
              : p.score < 4.0
              ? "var(--fg)"
              : "#4caf50"
          }
        />
      ))}
    </svg>
  );
}

export default async function AdminEvalsDrilldownPage({
  params,
}: {
  params: Params;
}) {
  await requireAdmin();
  // Next.js URL-decodes params, but we re-trim defensively in case
  // a URL-encoded value comes in with whitespace.
  const op = decodeURIComponent(params.op).trim();
  const providerId = decodeURIComponent(params.providerId).trim();
  const model = decodeURIComponent(params.model).trim();

  const grades = await loadGradesForOpCombo(op, providerId, model, 500);

  // Compute combo-level averages from the result set so the page
  // is self-contained (doesn't need to re-query loadPerOpAverages).
  // Floors at 0/0/0/0 when grades is empty.
  const n = grades.length;
  const sum = grades.reduce(
    (acc, r) => ({
      relevance: acc.relevance + r.scoreRelevance,
      completeness: acc.completeness + r.scoreCompleteness,
      faithfulness: acc.faithfulness + r.scoreFaithfulness,
      actionability: acc.actionability + r.scoreActionability,
    }),
    { relevance: 0, completeness: 0, faithfulness: 0, actionability: 0 },
  );
  const avg = n > 0
    ? {
        relevance: sum.relevance / n,
        completeness: sum.completeness / n,
        faithfulness: sum.faithfulness / n,
        actionability: sum.actionability / n,
        overall:
          (sum.relevance + sum.completeness + sum.faithfulness +
            sum.actionability) /
          (4 * n),
      }
    : null;

  // Group by goldenSetId so the table reads "fixture, then chronologically
  // within the fixture" — easier to spot per-fixture regression.
  const byFixture = new Map<string, typeof grades>();
  for (const g of grades) {
    const list = byFixture.get(g.goldenSetId) ?? [];
    list.push(g);
    byFixture.set(g.goldenSetId, list);
  }

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          <Link href="/admin/evals" style={{ color: "var(--accent)" }}>
            ← All evals
          </Link>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
          <code style={{ fontSize: 22 }}>
            {op} · {providerId} · {model}
          </code>
        </h1>
        <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
          {n} grade{n === 1 ? "" : "s"} across {byFixture.size} fixture
          {byFixture.size === 1 ? "" : "s"}. Threshold floor:{" "}
          <strong>{HUMAN_GRADE_FLOOR.toFixed(1)}</strong> overall
          average.
        </p>
      </header>

      {/* Combo averages */}
      {avg ? (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 12,
            marginBottom: 24,
          }}
        >
          {(
            [
              ["Relevance", avg.relevance],
              ["Completeness", avg.completeness],
              ["Faithfulness", avg.faithfulness],
              ["Actionability", avg.actionability],
              ["Overall", avg.overall],
            ] as Array<[string, number]>
          ).map(([label, value]) => (
            <div key={label} className="card" style={{ padding: 16 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                {label}
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color:
                    label === "Overall" ? scoreColor(value) : "var(--fg)",
                }}
              >
                {fmtScore(value)}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {/* Trend chart — overall score over time. Renders only when
          there's at least one grade (TrendChart returns null on
          empty input so we don't paint a meaningless rectangle). */}
      {n > 0 ? (
        <section style={{ marginBottom: 24 }}>
          <SectionTitle>Trend — overall score over time</SectionTitle>
          <div className="card" style={{ padding: 16 }}>
            <TrendChart grades={grades} />
            <p
              className="muted"
              style={{
                fontSize: 11,
                marginTop: 4,
                lineHeight: 1.4,
              }}
            >
              Each dot is one grade&rsquo;s overall score (mean of
              relevance / completeness / faithfulness /
              actionability). Dashed red line at{" "}
              <strong>{HUMAN_GRADE_FLOOR.toFixed(1)}</strong> is the
              quality floor — green tint above, red tint below.
              Left = oldest grade, right = newest. Single-grade case:
              one dot at the midpoint.
            </p>
          </div>
        </section>
      ) : null}

      {n === 0 ? (
        <p
          className="muted"
          style={{
            padding: "12px 16px",
            background: "var(--bg-2)",
            borderRadius: 6,
          }}
        >
          No grades for this combo yet. Check the parent{" "}
          <code>/admin/evals</code> table — this drilldown is reachable
          only from rows that have at least one grade in the lookback
          window, so a stale URL might land here after retention
          pruning.
        </p>
      ) : (
        Array.from(byFixture.entries()).map(([fixtureId, fixtureGrades]) => (
          <section key={fixtureId} style={{ marginBottom: 24 }}>
            <SectionTitle>
              Fixture: <code>{fixtureId}</code> ({fixtureGrades.length})
            </SectionTitle>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Grader</Th>
                  <Th>R</Th>
                  <Th>C</Th>
                  <Th>F</Th>
                  <Th>A</Th>
                  <Th>Notes</Th>
                </tr>
              </thead>
              <tbody>
                {fixtureGrades.map((g) => (
                  <tr key={g.id}>
                    <Td>
                      <span
                        style={{ fontSize: 11, color: "var(--fg-subtle)" }}
                      >
                        {fmtDate(g.createdAt)}
                      </span>
                    </Td>
                    <Td>
                      {/* loadGradesForOpCombo now leftJoins users —
                          prefer email, fall back to name, then
                          shortUser for missing-users-row case. */}
                      <span style={{ fontSize: 12 }}>
                        {g.graderEmail && g.graderEmail.length > 0
                          ? g.graderEmail
                          : g.graderName && g.graderName.length > 0
                          ? g.graderName
                          : shortUser(g.graderUserId)}
                      </span>
                    </Td>
                    <Td>{g.scoreRelevance}</Td>
                    <Td>{g.scoreCompleteness}</Td>
                    <Td>{g.scoreFaithfulness}</Td>
                    <Td>{g.scoreActionability}</Td>
                    <Td>
                      {/* Notes block — surfaces grader feedback. When
                          aiOutputExcerpt is also present, render it
                          below as a collapsed <details> so the row
                          stays compact but admins can expand to see
                          the actual output that was graded. */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {g.notes ? (
                          <span style={{ fontSize: 12, lineHeight: 1.5 }}>
                            {g.notes}
                          </span>
                        ) : (
                          <span
                            className="muted"
                            style={{ fontSize: 11, fontStyle: "italic" }}
                          >
                            (no notes)
                          </span>
                        )}
                        {g.aiOutputExcerpt ? (
                          <details style={{ fontSize: 11 }}>
                            <summary
                              style={{
                                cursor: "pointer",
                                color: "var(--fg-subtle)",
                              }}
                            >
                              View graded output ({g.aiOutputExcerpt.length}{" "}
                              chars)
                            </summary>
                            <pre
                              style={{
                                marginTop: 4,
                                padding: "8px 10px",
                                background: "var(--bg-2)",
                                borderRadius: 4,
                                fontSize: 11,
                                lineHeight: 1.5,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                maxHeight: 240,
                                overflow: "auto",
                                fontFamily:
                                  "ui-monospace, SFMono-Regular, monospace",
                              }}
                            >
                              {g.aiOutputExcerpt}
                            </pre>
                          </details>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </div>
  );
}
