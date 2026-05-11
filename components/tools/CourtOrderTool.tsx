"use client";

// CourtOrderTool — Tier 3 §3.2 P2. Indian court judgment / order PDF
// → structured JSON (meta + parties + acts cited + issues + holding +
// reasoning + remedy + plain-English summary). Triage aid for legal
// research, NOT legal advice — the UI surfaces that caveat
// prominently after each result.
//
// 2026-05-01 — closes one of the original KNOWN_DEAD_REFS entries
// (the /court-judgment-summarizer SEO landing has been seeded since
// pre-2026-04-30; ai-court-order didn't exist as a tool until today).
//
// Mirrors the BloodTestTool / CourtOrder shape:
//   • POST to /api/ai/summarize with depth=court-order
//   • Parse ```json fenced block from response markdown
//   • Render structured shape — judgment meta + parties + acts +
//     issues + holding + reasoning + remedy + summary
//   • Honest "this is a triage aid, not legal advice" messaging

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { classifyAiError } from "@/lib/ai/degradation";
import { useSession, getSession } from "next-auth/react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useToolTracking } from "./useToolTracking";
import { mapPdfOpError } from "@/lib/pdf/error-messages";
import { fetchAiWithRetry } from "@/lib/client/fetch-ai-with-retry";
import { UploadedFilePreview } from "./UploadedFilePreview";
// 2026-05-04 (PENDING §6b Stage 3 batch C) — specialist tools tail.
// CourtOrderTool routes through /api/ai/summarize so operation
// matches the batch-A/B convention.
import { FeedbackChip } from "@/components/feedback/FeedbackChip";

// 2026-05-01 — logToolResultAction omitted from this runner. The
// /api/ai/summarize endpoint already persists the output file +
// ai_outputs row server-side (see app/api/ai/summarize/route.ts).
// The client-side log is duplicate work for the small benefit of an
// extra row in /app/files, and the action's input shape (name, mime,
// sizeBytes, sha256) doesn't match what we have available here.

// ---------- Types ----------

type Counsel = { party: string; counsel: string };

type ActsCited = { act: string; sections: string[] };

type CourtOrder = {
  meta: {
    caseNumber: string | null;
    court: string | null;
    bench: string | null;
    judges: string[];
    dateOfJudgment: string | null;
    orderType: string | null;
  };
  parties: {
    petitioners: string[];
    respondents: string[];
    appearedFor: Counsel[];
  };
  actsCited: ActsCited[];
  issues: string[];
  holding: string;
  reasoning: string[];
  remedy: string | null;
  summary: string;
};

// ---------- Parser ----------

function extractJsonObject(md: string): unknown | null {
  const fence = md.match(/```json\s*([\s\S]*?)\s*```/);
  const raw = fence ? fence[1] : null;
  let text = raw;
  if (!text) {
    const first = md.indexOf("{");
    const last = md.lastIndexOf("}");
    if (first !== -1 && last > first) text = md.slice(first, last + 1);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function s(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function asCourtOrder(raw: unknown): CourtOrder | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const meta = (r.meta as Record<string, unknown>) ?? {};
  const parties = (r.parties as Record<string, unknown>) ?? {};
  const actsRaw = Array.isArray(r.actsCited) ? r.actsCited : [];
  const counselRaw = Array.isArray(parties.appearedFor) ? parties.appearedFor : [];

  return {
    meta: {
      caseNumber: s(meta.caseNumber),
      court: s(meta.court),
      bench: s(meta.bench),
      judges: strArray(meta.judges),
      dateOfJudgment: s(meta.dateOfJudgment),
      orderType: s(meta.orderType),
    },
    parties: {
      petitioners: strArray(parties.petitioners),
      respondents: strArray(parties.respondents),
      appearedFor: counselRaw
        .map((c) => {
          if (!c || typeof c !== "object") return null;
          const o = c as Record<string, unknown>;
          const party = s(o.party);
          const counsel = s(o.counsel);
          return party && counsel ? { party, counsel } : null;
        })
        .filter((x): x is Counsel => x !== null),
    },
    actsCited: actsRaw
      .map((a) => {
        if (!a || typeof a !== "object") return null;
        const o = a as Record<string, unknown>;
        const act = s(o.act);
        if (!act) return null;
        return { act, sections: strArray(o.sections) };
      })
      .filter((x): x is ActsCited => x !== null),
    issues: strArray(r.issues),
    holding: s(r.holding) ?? "",
    reasoning: strArray(r.reasoning),
    remedy: s(r.remedy),
    summary: s(r.summary) ?? "",
  };
}

// ---------- Component ----------

export function CourtOrderTool() {
  const trackTool = useToolTracking("ai-court-order", "AI");
  useEffect(() => trackTool.view(), [trackTool]);
  const router = useRouter();
  const { status } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  // Item #5 sweep — retry-status UX (mirrors SummarizePdfTool canary)
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [retryMax, setRetryMax] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<CourtOrder | null>(null);
  const [meta, setMeta] = useState<{
    creditCost: number;
    newBalance?: number;
    fileId?: string;
    aiUsageId?: string | null;
    providerId?: string;
    model?: string;
  } | null>(null);

  const onFiles = useCallback(
    (files: File[]) => {
      const f = files[0];
      if (!f) return;
      setError(null);
      setOrder(null);
      setMeta(null);
      setFile(f);
      trackTool.upload(f);
    },
    [trackTool],
  );

  const reset = () => {
    setFile(null);
    setError(null);
    setOrder(null);
    setMeta(null);
  };

  const run = async () => {
    if (!file) return;
    const fresh = await getSession();
    if (!fresh?.user) {
      trackTool.signupRedirect("/tool/ai-court-order");
      router.push("/login?callbackUrl=/tool/ai-court-order");
      return;
    }
    setBusy(true);
    setError(null);
    setOrder(null);

    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ik-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

    try {
      const res = await fetchAiWithRetry("/api/ai/summarize", {
        bodyFactory: () => {
          const form = new FormData();
          form.append("pdf", file);
          form.append("depth", "court-order");
          form.append("idempotencyKey", idempotencyKey);
          return form;
        },
        onAttempt: (attempt, max) => {
          if (attempt > 1) {
            setRetryAttempt(attempt);
            setRetryMax(max);
          }
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const processingMs = Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0,
      );

      if (res.ok || res.status === 207) {
        const parsed = extractJsonObject(String(body.markdown ?? ""));
        const obj = parsed ? asCourtOrder(parsed) : null;
        if (!obj) {
          trackTool.error({ errorCode: "parse_failed", depth: "court-order" });
          setError(
            "Couldn't parse this as a court judgment. Ensure the PDF is a real Indian court order with clear case structure.",
          );
          return;
        }
        if (obj.meta.orderType === "not-a-court-order") {
          trackTool.error({ errorCode: "not_a_court_order", depth: "court-order" });
          setError(
            "This doesn't look like a court order or judgment. The tool is tuned for Indian court judgments — for contracts, NDAs, or other legal docs, try the dedicated tools.",
          );
          return;
        }
        setOrder(obj);
        setMeta({
          creditCost: Number(body.creditCost ?? 0),
          newBalance: typeof body.newBalance === "number" ? body.newBalance : undefined,
          fileId: typeof body.fileId === "string" ? body.fileId : undefined,
          aiUsageId: typeof body.aiUsageId === "string" ? body.aiUsageId : null,
          providerId: typeof body.providerId === "string" ? body.providerId : undefined,
          model: typeof body.model === "string" ? body.model : undefined,
        });
        trackTool.success({
          creditCost: Number(body.creditCost ?? 0),
          depth: "court-order",
          processingMs,
        });
        return;
      }
      const classified = classifyAiError(res.status, body);
      setError(
        "userMessage" in classified
          ? classified.userMessage
          : "Something went wrong. Try again.",
      );
      trackTool.error({ errorCode: `http_${res.status}`, depth: "court-order" });
    } catch (err) {
      console.error(err);
      setError(mapPdfOpError(err instanceof Error ? err.message : "Request failed."));
      trackTool.error({ errorCode: "network_error", depth: "court-order" });
    } finally {
      setBusy(false);
      setRetryAttempt(0);
      setRetryMax(0);
    }
  };

  const signedOut = status !== "loading" && status !== "authenticated";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone onFiles={onFiles} disabled={busy} prompt="Drop an Indian court judgment PDF" />
      ) : (
        <div className="card" style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center" }}>
          <UploadedFilePreview file={file} maxHeight={80} />
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div
              title={file.name}
              style={{
                fontSize: 14,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {file.name}
            </div>
            <div className="subtle" style={{ fontSize: 12 }}>
              {humanSize(file.size)}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={busy}
            onClick={reset}
            aria-label="Remove file"
          >
            <I.X size={14} />
          </button>
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}

      {order && <CourtOrderReport order={order} meta={meta} />}
      {/* 2026-05-04 (PENDING §6b Stage 3 batch C) — chip on judgment summary */}
      {order && (
        <div
          style={{
            paddingTop: 12,
            borderTop: "1px solid var(--border)",
          }}
        >
          <FeedbackChip
            operation="summarize"
            aiUsageId={meta?.aiUsageId ?? null}
            fileId={meta?.fileId ?? null}
            providerId={meta?.providerId}
            model={meta?.model}
          />
        </div>
      )}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {file && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={reset}>
            Reset
          </button>
        )}
        {signedOut ? (
          <Link href="/login?callbackUrl=/tool/ai-court-order" className="btn btn-primary">
            Sign in to run
          </Link>
        ) : (
          <button type="button" className="btn btn-primary" disabled={!file || busy} onClick={run}
            aria-busy={busy}>
            {retryAttempt > 0
              ? `Retrying… (${retryAttempt}/${retryMax})`
              : busy
                ? "Analysing…"
                : "Summarize judgment"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Result rendering ----------

function CourtOrderReport({
  order,
  meta,
}: {
  order: CourtOrder;
  meta: { creditCost: number; newBalance?: number } | null;
}) {
  return (
    <div
      // Item #14 follow-up sweep — announce result arrival to AT.
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="card"
      style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}
    >
      <ResultHeader meta={meta} />

      {/* Plain-English summary — the most user-visible block, surfaced first */}
      {order.summary && (
        <Section title="Summary" emphasis>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{order.summary}</p>
        </Section>
      )}

      {/* Holding — what the court decided */}
      {order.holding && (
        <Section title="Holding">
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{order.holding}</p>
        </Section>
      )}

      {/* Case metadata table */}
      <Section title="Case details">
        <CaseMetaTable meta={order.meta} />
      </Section>

      {/* Parties */}
      {(order.parties.petitioners.length > 0 || order.parties.respondents.length > 0) && (
        <Section title="Parties">
          <PartiesBlock parties={order.parties} />
        </Section>
      )}

      {/* Acts and sections cited */}
      {order.actsCited.length > 0 && (
        <Section title="Acts & sections cited">
          <ActsTable acts={order.actsCited} />
        </Section>
      )}

      {/* Issues framed by the court */}
      {order.issues.length > 0 && (
        <Section title="Issues framed by the court">
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
            {order.issues.map((issue, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                {issue}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Reasoning — load-bearing logic */}
      {order.reasoning.length > 0 && (
        <Section title="Reasoning">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
            {order.reasoning.map((point, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                {point}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Remedy — operative orders */}
      {order.remedy && (
        <Section title="Remedy / operative order">
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{order.remedy}</p>
        </Section>
      )}

      {/* Disclaimer footer */}
      <div
        className="subtle"
        style={{
          fontSize: 11,
          padding: 10,
          borderRadius: 6,
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
        }}
      >
        ⚠ This is a triage aid for legal research, NOT legal advice. The
        extraction may miss subtle holdings, misclassify obiter as ratio, or
        compress context that matters in your specific case. For
        precedent-grade analysis, read the original judgment + consult a
        qualified Indian advocate.
      </div>
    </div>
  );
}

function ResultHeader({ meta }: { meta: { creditCost: number; newBalance?: number } | null }) {
  return (
    <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "var(--accent)",
          color: "var(--bg-1)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <I.Check size={18} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: 15 }}>Judgment analyzed</div>
        {meta && (
          <div className="muted" style={{ fontSize: 12 }}>
            {meta.creditCost} credit{meta.creditCost === 1 ? "" : "s"} used
            {typeof meta.newBalance === "number" && ` · ${meta.newBalance} left`}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  emphasis = false,
  children,
}: {
  title: string;
  emphasis?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3
        style={{
          margin: "0 0 8px",
          fontSize: emphasis ? 14 : 12,
          fontWeight: emphasis ? 600 : 500,
          color: emphasis ? "var(--fg)" : "var(--fg-muted)",
          textTransform: emphasis ? undefined : ("uppercase" as const),
          letterSpacing: emphasis ? undefined : "0.05em",
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function CaseMetaTable({ meta }: { meta: CourtOrder["meta"] }) {
  const rows: Array<[string, string | string[] | null]> = [
    ["Case number", meta.caseNumber],
    ["Court", meta.court],
    ["Bench", meta.bench],
    ["Judges", meta.judges.length > 0 ? meta.judges : null],
    ["Date of judgment", meta.dateOfJudgment],
    ["Order type", meta.orderType],
  ];
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <tbody>
        {rows.map(([label, value]) => {
          const display =
            value == null
              ? "—"
              : Array.isArray(value)
                ? value.join(", ")
                : value;
          return (
            <tr key={label} style={{ borderBottom: "1px solid var(--border)" }}>
              <td
                style={{
                  padding: "8px 12px 8px 0",
                  width: "40%",
                  color: "var(--fg-muted)",
                  fontSize: 12,
                  verticalAlign: "top",
                }}
              >
                {label}
              </td>
              <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                <span style={{ color: value == null ? "var(--fg-subtle)" : "var(--fg)" }}>
                  {display}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PartiesBlock({ parties }: { parties: CourtOrder["parties"] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {parties.petitioners.length > 0 && (
        <div>
          <div className="subtle" style={{ fontSize: 11, marginBottom: 4 }}>
            Petitioner{parties.petitioners.length === 1 ? "" : "s"}
          </div>
          <div style={{ fontSize: 13 }}>{parties.petitioners.join(" · ")}</div>
        </div>
      )}
      {parties.respondents.length > 0 && (
        <div>
          <div className="subtle" style={{ fontSize: 11, marginBottom: 4 }}>
            Respondent{parties.respondents.length === 1 ? "" : "s"}
          </div>
          <div style={{ fontSize: 13 }}>{parties.respondents.join(" · ")}</div>
        </div>
      )}
      {parties.appearedFor.length > 0 && (
        <div>
          <div className="subtle" style={{ fontSize: 11, marginBottom: 4 }}>
            Counsel
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.5 }}>
            {parties.appearedFor.map((c, i) => (
              <li key={i}>
                <strong>{c.party}:</strong> {c.counsel}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ActsTable({ acts }: { acts: ActsCited[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--border)" }}>
          <th
            style={{
              padding: "6px 12px 6px 0",
              textAlign: "left",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--fg-muted)",
            }}
          >
            Act
          </th>
          <th
            style={{
              padding: "6px 0",
              textAlign: "left",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--fg-muted)",
            }}
          >
            Sections
          </th>
        </tr>
      </thead>
      <tbody>
        {acts.map((a, i) => (
          <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
            <td style={{ padding: "8px 12px 8px 0", verticalAlign: "top" }}>{a.act}</td>
            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
              {a.sections.length > 0 ? (
                <span style={{ fontFamily: "var(--mono, monospace)", fontSize: 12 }}>
                  §{a.sections.join(", §")}
                </span>
              ) : (
                <span className="subtle">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
