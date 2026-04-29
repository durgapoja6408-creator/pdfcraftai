"use client";

// BloodTestTool — Tier 3 §3.4 P0. Lab report PDF → structured
// lab values with normal/low/high/critical flags. Shows ONLY
// extracted data — no clinical interpretation (that belongs with
// a doctor; UI surfaces that caveat prominently).

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { classifyAiError } from "@/lib/ai/degradation";
import { useSession, getSession } from "next-auth/react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import {
  deriveOutputName,
  downloadBytes,
  humanSize,
  sha256HexOfBytes,
} from "@/lib/client/pdf-utils";
import { logToolResultAction } from "@/lib/tool-result-actions";
import { useToolTracking } from "./useToolTracking";
import { mapPdfOpError } from "@/lib/pdf/error-messages";
import { fetchAiWithRetry } from "@/lib/client/fetch-ai-with-retry";

type Flag = "normal" | "low" | "high" | "critical" | "unknown";

type Result = {
  test: string;
  value: string;
  range: string | null;
  flag: Flag;
  group: string | null;
};

type Report = {
  patient: {
    name: string | null;
    age: string | null;
    sex: string | null;
    date: string | null;
  };
  lab: string | null;
  results: Result[];
};

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

function asFlag(v: unknown): Flag {
  const f = typeof v === "string" ? v.toLowerCase() : "";
  if (f === "normal" || f === "low" || f === "high" || f === "critical") return f;
  return "unknown";
}

function asReport(raw: unknown): Report | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const p = (r.patient as Record<string, unknown>) ?? {};
  const results: Result[] = Array.isArray(r.results)
    ? r.results
        .map((x): Result | null => {
          if (!x || typeof x !== "object") return null;
          const xr = x as Record<string, unknown>;
          const test = s(xr.test);
          const value = s(xr.value);
          if (!test || !value) return null;
          return {
            test,
            value,
            range: s(xr.range),
            flag: asFlag(xr.flag),
            group: s(xr.group),
          };
        })
        .filter((x): x is Result => x !== null)
    : [];
  if (results.length === 0) return null;
  return {
    patient: {
      name: s(p.name),
      age: s(p.age),
      sex: s(p.sex),
      date: s(p.date),
    },
    lab: s(r.lab),
    results,
  };
}

function escCsv(s: string): string {
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function reportCsv(r: Report): string {
  const rows = ["group,test,value,range,flag"];
  for (const x of r.results) {
    rows.push(
      [
        x.group ?? "",
        escCsv(x.test),
        escCsv(x.value),
        x.range ? escCsv(x.range) : "",
        x.flag,
      ].join(",")
    );
  }
  return rows.join("\n") + "\n";
}

const FLAG_COLOR: Record<Flag, string> = {
  normal: "var(--green, #0a7a2a)",
  low: "var(--yellow-dark, #92400e)",
  high: "var(--yellow-dark, #92400e)",
  critical: "var(--red, #b91c1c)",
  unknown: "var(--fg-subtle)",
};

export function BloodTestTool() {
  const trackTool = useToolTracking("ai-blood-test", "AI");
  useEffect(() => trackTool.view(), [trackTool]);
  const router = useRouter();
  const { status } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [meta, setMeta] = useState<{ creditCost: number; newBalance?: number } | null>(null);

  const onFiles = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setReport(null);
    setMeta(null);
    setFile(f);
    trackTool.upload(f);
  }, [trackTool]);

  const reset = () => {
    setFile(null);
    setError(null);
    setReport(null);
    setMeta(null);
  };

  const run = async () => {
    if (!file) return;
    const fresh = await getSession();
    if (!fresh?.user) {
      trackTool.signupRedirect("/tool/ai-blood-test");

      router.push("/login?callbackUrl=/tool/ai-blood-test");
      return;
    }
    setBusy(true);
    setError(null);
    setReport(null);

    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ik-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

    try {
      const res = await fetchAiWithRetry("/api/ai/summarize", {
        // M20 (#193): retry on transient 5xx / network failures.
        // FormData is single-use; rebuild it on each attempt.
        bodyFactory: () => {
          const form = new FormData();
          form.append("pdf", file);
          form.append("depth", "blood-test");
          form.append("idempotencyKey", idempotencyKey);
          return form;
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const processingMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);

      if (res.ok || res.status === 207) {
        const parsed = extractJsonObject(String(body.markdown ?? ""));
        const obj = parsed ? asReport(parsed) : null;
        if (!obj) {
          trackTool.error({ errorCode: "parse_failed", depth: "blood-test" });
          setError("Couldn't parse this as a lab report. Ensure the PDF has named tests with values.");
          return;
        }
        setReport(obj);
        setMeta({
          creditCost: Number(body.creditCost ?? 0),
          newBalance: typeof body.newBalance === "number" ? body.newBalance : undefined,
        });
        trackTool.success({ creditCost: Number(body.creditCost ?? 0), depth: "blood-test", processingMs });
        return;
      }
      const classified = classifyAiError(res.status, body);
      setError("userMessage" in classified ? classified.userMessage : "Something went wrong. Try again.");
      trackTool.error({ errorCode: `http_${res.status}`, depth: "blood-test" });
    } catch (err) {
      console.error(err);
      setError(mapPdfOpError(err instanceof Error ? err.message : "Request failed."));
      trackTool.error({ errorCode: "network_error", depth: "blood-test" });
    } finally {
      setBusy(false);
    }
  };

  const downloadCsv = async () => {
    if (!report) return;
    const bytes = new TextEncoder().encode(reportCsv(report));
    const name = deriveOutputName(file?.name ?? "labreport.pdf", "-parsed").replace(/\.pdf$/i, ".csv");
    downloadBytes(bytes, name, "text/csv;charset=utf-8");
    try {
      const sha256 = await sha256HexOfBytes(bytes);
      await logToolResultAction({ toolId: "ai-blood-test", name, mime: "text/csv", sizeBytes: bytes.length, sha256 });
    } catch (e) { console.warn(e); }
  };

  const signedOut = status !== "loading" && status !== "authenticated";

  // Group by group field for display.
  const grouped = report
    ? report.results.reduce<Record<string, Result[]>>((acc, r) => {
        const k = r.group ?? "Other";
        if (!acc[k]) acc[k] = [];
        acc[k].push(r);
        return acc;
      }, {})
    : {};

  const flagsCount = report
    ? report.results.reduce<Record<Flag, number>>(
        (acc, r) => {
          acc[r.flag] = (acc[r.flag] ?? 0) + 1;
          return acc;
        },
        { normal: 0, low: 0, high: 0, critical: 0, unknown: 0 }
      )
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone onFiles={onFiles} disabled={busy} prompt="Drop a lab report PDF to extract test values" />
      ) : (
        <div className="card" style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ color: "var(--fg-subtle)" }}><I.File size={18} /></span>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div title={file.name} style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</div>
            <div className="subtle" style={{ fontSize: 12 }}>{humanSize(file.size)}</div>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={reset} aria-label="Remove file"><I.X size={14} /></button>
        </div>
      )}

      <div className="card" style={{ padding: 14, fontSize: 13, lineHeight: 1.5, background: "var(--red-soft, #fff1f2)", borderLeft: "3px solid var(--red)" }}>
        <strong>Tier 3 §3.4 — NOT medical advice.</strong> This tool extracts data only — it does not interpret results or recommend action. Always consult a qualified clinician for interpretation. 15 credits per report.
      </div>

      {error && <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{error}</p>}

      {report && flagsCount && (
        <div className="card" style={{ padding: 20, borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
          <div className="row" style={{ gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--accent)", color: "var(--bg-1)", display: "grid", placeItems: "center" }}><I.Check size={18} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15 }}>Lab report parsed — {report.results.length} values</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {[report.patient.name, report.patient.age, report.patient.sex, report.patient.date, report.lab].filter(Boolean).join(" · ")}
                {meta && ` · ${meta.creditCost} credits used`}
                {typeof meta?.newBalance === "number" && ` · ${meta.newBalance} left`}
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={downloadCsv}><I.Download size={14} /><span>CSV</span></button>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {(["normal", "low", "high", "critical", "unknown"] as Flag[]).map((f) =>
              flagsCount[f] > 0 ? (
                <span key={f} style={{ padding: "3px 8px", borderRadius: 3, fontSize: 11, color: "var(--bg-1)", background: FLAG_COLOR[f] }}>
                  {flagsCount[f]} {f}
                </span>
              ) : null
            )}
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {Object.entries(grouped).map(([group, rows]) => (
              <div key={group}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-subtle)", marginBottom: 4 }}>{group}</div>
                <div style={{ background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
                          <td style={{ padding: "6px 10px", fontWeight: 500, width: "40%" }}>{r.test}</td>
                          <td style={{ padding: "6px 10px", fontFamily: "var(--font-mono), ui-monospace, monospace" }}>{r.value}</td>
                          <td style={{ padding: "6px 10px", color: "var(--fg-subtle)", fontSize: 11 }}>{r.range ?? "—"}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right" }}>
                            <span style={{
                              padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 500,
                              color: "var(--bg-1)", background: FLAG_COLOR[r.flag],
                            }}>{r.flag}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {file && <button type="button" className="btn btn-ghost" disabled={busy} onClick={reset}>Reset</button>}
        {signedOut ? (
          <Link href="/login?callbackUrl=/tool/ai-blood-test" className="btn btn-primary">Sign in to parse</Link>
        ) : (
          <button type="button" className="btn btn-primary" disabled={!file || busy} onClick={run}>
            {busy ? "Parsing…" : "Parse lab report"}
          </button>
        )}
      </div>
    </div>
  );
}
