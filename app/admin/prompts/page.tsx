// app/admin/prompts/page.tsx — prompt registry + A/B rollout audit.
//
// Task #26 / Phase E.
//
// What this page answers
// ----------------------
// Three questions operators ask in this order when they wonder
// whether prompt quality has slipped or a cost regression landed:
//
//   1. "What variants are registered for each op, and is the
//      registry well-formed?"  (single / experiment / misconfigured
//      / empty — per-op state badges)
//
//   2. "Over the last N days, how did traffic split across variants,
//      and are the per-variant token / cost / truncation numbers
//      sensible?"  (ai_usage rollup grouped by op + version + exp id)
//
//   3. "Which experiments are currently active?"  (EXPERIMENTS list
//      filtered to !endedAt).
//
// Why three sections and not four
// -------------------------------
// Past-experiments history is valuable but is a one-shot git-blame
// question, not a live-dashboard question — the registry is in-repo
// code so operators can run `git log lib/ai/prompts/registry.ts` for
// the rollout timeline. Adding it here would be duplication that
// drifts from git.
//
// Data fetch posture
// ------------------
// - Registry reads (sections 1 + 3) are synchronous in-process calls.
// - Rollout rollup (section 2) hits ai_usage — a Drizzle query
//   wrapped in PhaseEQueryResult so a DB outage renders the
//   ErrorBanner instead of 500ing the whole admin sidebar.
//
// Caution on the "misconfigured" banner
// -------------------------------------
// classifyOpState returns "misconfigured" when an op has >1 enabled
// variant but no active experiment — meaning traffic is splitting
// randomly without an audit trail. Worth flagging loudly because
// it's the silent way an experiment can end up running without
// anyone noticing. We render a red top-of-page banner whenever any
// op is in that state.

import {
  PROMPT_REGISTRY,
  RECORDING_ENABLED,
  classifyOpState,
  listActiveExperiments,
  listAllPromptVersions,
  type OpRegistryState,
  type PromptOp,
} from "@/lib/ai/prompts/registry";
import { getPromptVersionRollout } from "@/lib/admin/phase-e-queries";
import {
  DayPicker,
  ErrorBanner,
  SectionTitle,
  StatCard,
  Td,
  Th,
  clampDays,
  tableStyle,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Map classify output → short label + tone for the operator UI.
// Keep the labels curt — this lives inside a small badge cell.
function stateBadge(state: OpRegistryState): {
  label: string;
  tone: "good" | "warn" | "bad" | undefined;
} {
  switch (state) {
    case "single":
      return { label: "single-variant", tone: "good" };
    case "experiment":
      return { label: "A/B experiment", tone: "good" };
    case "misconfigured":
      return { label: "misconfigured", tone: "bad" };
    case "empty":
      return { label: "no variants", tone: "warn" };
  }
}

export default async function AdminPromptsPage({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  const days = clampDays(searchParams.days, 7);
  const rolloutResult = await getPromptVersionRollout({ days });

  const variants = listAllPromptVersions();
  const experiments = listActiveExperiments();

  const opNames = Object.keys(PROMPT_REGISTRY) as PromptOp[];
  const perOpState = opNames.map((op) => ({ op, state: classifyOpState(op) }));
  const anyMisconfigured = perOpState.some((r) => r.state === "misconfigured");

  // High-level stats for the top strip.
  const activeVariantCount = variants.filter((v) => v.enabled).length;
  const totalVariantCount = variants.length;
  const activeExperimentCount = experiments.length;

  // Rollout figures (safe-access through the result envelope).
  const rollout = rolloutResult.ok ? rolloutResult.data : null;
  const coveragePct =
    rollout && rollout.totalCalls > 0
      ? Math.round(
          (rollout.totalCallsWithVersion / rollout.totalCalls) * 100
        )
      : 0;

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Prompts &amp; A/B experiments
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Read-only audit of the prompt registry at{" "}
          <code>lib/ai/prompts/registry.ts</code> and the per-variant
          traffic split over the last {days} days. Change any of these
          via a commit to the registry file, not this page.
        </p>
      </header>

      {anyMisconfigured ? (
        <div
          className="card"
          style={{
            padding: 12,
            marginBottom: 16,
            borderColor: "#b23b3b",
            color: "#b23b3b",
          }}
        >
          <strong>Misconfigured op detected.</strong> One or more ops have
          multiple enabled variants but no active experiment is registered.
          Traffic is splitting randomly without an audit trail — either
          register an Experiment or disable all but one variant. See the
          per-op state table below.
        </div>
      ) : null}

      {!RECORDING_ENABLED ? (
        <div
          className="card"
          style={{
            padding: 12,
            marginBottom: 16,
            borderColor: "#b7791f",
            color: "#b7791f",
          }}
        >
          <strong>Recording disabled.</strong> The registry resolver is
          still assigning variants but <code>RECORDING_ENABLED</code> is
          off, so <code>ai_usage.prompt_version</code> is being written
          as NULL. The rollout chart below will show {"0%"} coverage —
          this is expected. Flip the flag in{" "}
          <code>lib/ai/prompts/registry.ts</code> to re-enable the
          audit trail.
        </div>
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Registered variants"
          value={`${activeVariantCount} / ${totalVariantCount}`}
          hint="Enabled / total across all ops"
        />
        <StatCard
          label="Active experiments"
          value={String(activeExperimentCount)}
          hint="EXPERIMENTS entries with no endedAt"
          tone={activeExperimentCount > 0 ? "good" : undefined}
        />
        <StatCard
          label={`Version coverage (${days}d)`}
          value={`${coveragePct}%`}
          hint="Share of ai_usage rows with prompt_version recorded"
          tone={
            coveragePct >= 95
              ? "good"
              : coveragePct >= 50
                ? "warn"
                : coveragePct === 0
                  ? undefined
                  : "bad"
          }
        />
        <StatCard
          label="Misconfigured ops"
          value={String(
            perOpState.filter((r) => r.state === "misconfigured").length
          )}
          hint=">1 enabled variant with no experiment"
          tone={anyMisconfigured ? "bad" : "good"}
        />
      </section>

      <section style={{ marginBottom: 32 }}>
        <SectionTitle>Registry — {totalVariantCount} variants</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Op</Th>
                <Th>Variant ID</Th>
                <Th>Enabled</Th>
                <Th align="right">Weight (bps)</Th>
                <Th>Created</Th>
                <Th>Description</Th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={`${v.op}-${v.id}`}>
                  <Td mono>{v.op}</Td>
                  <Td mono>{v.id}</Td>
                  <Td>{v.enabled ? "yes" : "—"}</Td>
                  <Td align="right" mono>
                    {v.weightBps.toLocaleString("en-US")}
                  </Td>
                  <Td mono>{v.createdAt}</Td>
                  <Td>{v.description}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Weights are basis points in [0, 10000]. The resolver normalizes
          weights across enabled variants, so <code>{"{A: 10000, B: 10000}"}</code>{" "}
          is a 50/50 split (equivalent to <code>{"{A: 1, B: 1}"}</code>).
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <SectionTitle>Per-op state</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Op</Th>
                <Th>State</Th>
                <Th align="right">Enabled variants</Th>
                <Th>Active experiment</Th>
              </tr>
            </thead>
            <tbody>
              {perOpState.map(({ op, state }) => {
                const enabledForOp = (PROMPT_REGISTRY[op] ?? []).filter(
                  (v) => v.enabled
                );
                const exp = experiments.find((e) => e.op === op);
                const badge = stateBadge(state);
                return (
                  <tr key={op}>
                    <Td mono>{op}</Td>
                    <Td>
                      <span
                        style={{
                          color:
                            badge.tone === "good"
                              ? "#2f855a"
                              : badge.tone === "bad"
                                ? "#b23b3b"
                                : badge.tone === "warn"
                                  ? "#b7791f"
                                  : undefined,
                          fontWeight: 600,
                        }}
                      >
                        {badge.label}
                      </span>
                    </Td>
                    <Td align="right" mono>
                      {enabledForOp.length}
                    </Td>
                    <Td mono>{exp ? exp.id : "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <SectionTitle>Traffic split (last {days}d)</SectionTitle>
          <DayPicker current={days} base="/admin/prompts" />
        </div>
        {!rolloutResult.ok ? (
          <ErrorBanner message={`Rollout query failed: ${rolloutResult.error}`} />
        ) : rollout && rollout.rows.length === 0 ? (
          <div className="card" style={{ padding: 16 }}>
            <p className="muted" style={{ margin: 0 }}>
              No ai_usage rows with a recorded prompt_version in the last{" "}
              {days} days.{" "}
              {rollout.totalCalls > 0
                ? `(${rollout.totalCalls.toLocaleString(
                    "en-US"
                  )} total calls, all pre-0014 or recording-off.)`
                : "(No calls at all in window.)"}
            </p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Op</Th>
                  <Th>Variant</Th>
                  <Th>Experiment</Th>
                  <Th align="right">Calls</Th>
                  <Th align="right">Errors</Th>
                  <Th align="right">Truncated</Th>
                  <Th align="right">Avg in tok</Th>
                  <Th align="right">Avg out tok</Th>
                  <Th align="right">Avg cached</Th>
                  <Th align="right">Sum cost (µ$)</Th>
                  <Th align="right">Avg latency (ms)</Th>
                </tr>
              </thead>
              <tbody>
                {rollout?.rows.map((r) => (
                  <tr key={`${r.operation}-${r.promptVersion}-${r.experimentId ?? "none"}`}>
                    <Td mono>{r.operation}</Td>
                    <Td mono>{r.promptVersion}</Td>
                    <Td mono>{r.experimentId ?? "—"}</Td>
                    <Td align="right" mono>
                      {r.callCount.toLocaleString("en-US")}
                    </Td>
                    <Td align="right" mono>
                      {r.errorCount.toLocaleString("en-US")}
                    </Td>
                    <Td align="right" mono>
                      {r.truncatedCount.toLocaleString("en-US")}
                    </Td>
                    <Td align="right" mono>
                      {r.avgInputTokens.toLocaleString("en-US")}
                    </Td>
                    <Td align="right" mono>
                      {r.avgOutputTokens.toLocaleString("en-US")}
                    </Td>
                    <Td align="right" mono>
                      {r.avgCachedInputTokens.toLocaleString("en-US")}
                    </Td>
                    <Td align="right" mono>
                      {r.sumCostMicros.toLocaleString("en-US")}
                    </Td>
                    <Td align="right" mono>
                      {r.avgLatencyMs.toLocaleString("en-US")}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Rows filtered to <code>prompt_version IS NOT NULL</code> — pre-0014
          calls (before the registry shipped) are excluded so they don&#x2019;t
          skew the split. <code>Sum cost (µ$)</code> is already
          batch-discounted at insert time (see{" "}
          <a href="/admin/margin" style={{ color: "inherit" }}>
            /admin/margin
          </a>
          ). Per-variant cost delta is the quickest way to spot a
          regression — a variant with 1.5× the sum-cost per call for
          the same call-count deserves scrutiny.
        </p>
      </section>

      <section>
        <SectionTitle>
          Active experiments ({activeExperimentCount})
        </SectionTitle>
        {activeExperimentCount === 0 ? (
          <div className="card" style={{ padding: 16 }}>
            <p className="muted" style={{ margin: 0 }}>
              No active experiments. Add one by appending to{" "}
              <code>EXPERIMENTS</code> in{" "}
              <code>lib/ai/prompts/registry.ts</code> and registering a
              second variant for the target op in{" "}
              <code>PROMPT_REGISTRY</code>.
            </p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Experiment ID</Th>
                  <Th>Op</Th>
                  <Th>Started</Th>
                  <Th>Description</Th>
                </tr>
              </thead>
              <tbody>
                {experiments.map((e) => (
                  <tr key={e.id}>
                    <Td mono>{e.id}</Td>
                    <Td mono>{e.op}</Td>
                    <Td mono>{e.startedAt}</Td>
                    <Td>{e.description}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
