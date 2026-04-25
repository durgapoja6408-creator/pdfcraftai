"use client";

// BankStatementTool — Tier 3 §3.1 P0. Bank statement → JSON
// transactions + summary cards + CSV export. Supports the five
// big Indian banks the prompt calls out (SBI, HDFC, ICICI, Axis,
// Kotak) + Yes, IDFC, and most NBFCs. Strict "don't invent" rules
// in the prompt mean null-valued cells are expected for unclear
// rows; the UI renders those as "—".

import { useState, useCallback } from "react";
import { useTrackToolView } from "./useToolTracking";
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

type Txn = {
  date: string | null;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  category: string | null;
};

type Statement = {
  account: {
    holder: string | null;
    bank: string | null;
    number_masked: string | null;
    period: string | null;
  };
  opening_balance: number | null;
  closing_balance: number | null;
  currency: string;
  transactions: Txn[];
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

function n(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function s(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function asStatement(raw: unknown): Statement | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const acct = (r.account as Record<string, unknown>) ?? {};
  const txnsRaw = Array.isArray(r.transactions) ? r.transactions : [];
  const txns: Txn[] = txnsRaw
    .map((t): Txn | null => {
      if (!t || typeof t !== "object") return null;
      const tr = t as Record<string, unknown>;
      const desc = s(tr.description);
      if (!desc) return null;
      return {
        date: s(tr.date),
        description: desc,
        debit: n(tr.debit),
        credit: n(tr.credit),
        balance: n(tr.balance),
        category: s(tr.category),
      };
    })
    .filter((x): x is Txn => x !== null);
  return {
    account: {
      holder: s(acct.holder),
      bank: s(acct.bank),
      number_masked: s(acct.number_masked),
      period: s(acct.period),
    },
    opening_balance: n(r.opening_balance),
    closing_balance: n(r.closing_balance),
    currency: s(r.currency) ?? "INR",
    transactions: txns,
  };
}

function fmt(n: number | null, currency: string): string {
  if (n === null) return "—";
  const sym = currency === "INR" ? "₹" : currency === "USD" ? "$" : currency + " ";
  return `${sym}${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escCsv(s: string): string {
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function statementCsv(s: Statement): string {
  const rows = ["date,description,debit,credit,balance,category"];
  for (const t of s.transactions) {
    rows.push(
      [
        t.date ?? "",
        escCsv(t.description),
        t.debit ?? "",
        t.credit ?? "",
        t.balance ?? "",
        t.category ?? "",
      ].join(",")
    );
  }
  return rows.join("\n") + "\n";
}

export function BankStatementTool() {
  const router = useRouter();
  const { status } = useSession();
  const trackTool = useTrackToolView("ai-bank-statement");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stmt, setStmt] = useState<Statement | null>(null);
  const [meta, setMeta] = useState<{ creditCost: number; newBalance?: number } | null>(null);

  const onFiles = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setStmt(null);
    setMeta(null);
    setFile(f);
    trackTool.upload(f);
  }, [trackTool]);

  const reset = () => {
    setFile(null);
    setError(null);
    setStmt(null);
    setMeta(null);
  };

  const run = async () => {
    if (!file) return;
    const fresh = await getSession();
    if (!fresh?.user) {
      trackTool.signupRedirect("/tool/ai-bank-statement");
      router.push("/login?callbackUrl=/tool/ai-bank-statement");
      return;
    }
    setBusy(true);
    setError(null);
    setStmt(null);

    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ik-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

    try {
      const form = new FormData();
      form.append("pdf", file);
      form.append("depth", "bank-statement");
      form.append("idempotencyKey", idempotencyKey);
      const res = await fetch("/api/ai/summarize", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const processingMs = Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0,
      );

      if (res.ok || res.status === 207) {
        const parsed = extractJsonObject(String(body.markdown ?? ""));
        const obj = parsed ? asStatement(parsed) : null;
        if (!obj || obj.transactions.length === 0) {
          setError("Couldn't parse this as a bank statement. Ensure the PDF has transaction rows (not an image-only scan).");
          trackTool.error({ errorCode: "parse_failed", depth: "bank-statement" });
          return;
        }
        setStmt(obj);
        const credit = Number(body.creditCost ?? 0);
        setMeta({
          creditCost: credit,
          newBalance: typeof body.newBalance === "number" ? body.newBalance : undefined,
        });
        trackTool.success({ creditCost: credit, depth: "bank-statement", processingMs });
        return;
      }
      const classified = classifyAiError(res.status, body);
      setError("userMessage" in classified ? classified.userMessage : "Something went wrong. Try again.");
      trackTool.error({ errorCode: `http_${res.status}`, depth: "bank-statement" });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Request failed.");
      trackTool.error({ errorCode: "network_error", depth: "bank-statement" });
    } finally {
      setBusy(false);
    }
  };

  const downloadCsv = async () => {
    if (!stmt) return;
    const bytes = new TextEncoder().encode(statementCsv(stmt));
    const name = deriveOutputName(file?.name ?? "statement.pdf", "-transactions").replace(/\.pdf$/i, ".csv");
    downloadBytes(bytes, name, "text/csv;charset=utf-8");
    try {
      const sha256 = await sha256HexOfBytes(bytes);
      await logToolResultAction({ toolId: "ai-bank-statement", name, mime: "text/csv", sizeBytes: bytes.length, sha256 });
    } catch (e) { console.warn(e); }
  };

  const signedOut = status !== "loading" && status !== "authenticated";
  const totalIn = stmt ? stmt.transactions.reduce((s, t) => s + (t.credit ?? 0), 0) : 0;
  const totalOut = stmt ? stmt.transactions.reduce((s, t) => s + (t.debit ?? 0), 0) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone onFiles={onFiles} disabled={busy} prompt="Drop a bank statement PDF to extract transactions" />
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

      <div className="card" style={{ padding: 14, fontSize: 13, lineHeight: 1.5, background: "var(--bg-2)" }}>
        <strong>Tier 3 §3.1 Finance (₹999/mo or 30 credits/statement).</strong> Parses SBI / HDFC / ICICI / Axis / Kotak / Yes / IDFC and most NBFC statements. Categories auto-inferred (Food / Travel / Bills / Income / Transfer / …). CSV export for spreadsheet + CA workflows. Do NOT upload statements containing credentials — redact first.
      </div>

      {error && <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{error}</p>}

      {stmt && (
        <div className="card" style={{ padding: 20, borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
          <div className="row" style={{ gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--accent)", color: "var(--bg-1)", display: "grid", placeItems: "center" }}><I.Check size={18} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15 }}>Statement parsed — {stmt.transactions.length} transactions</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {[stmt.account.bank, stmt.account.holder, stmt.account.period].filter(Boolean).join(" · ")}
                {meta && ` · ${meta.creditCost} credits used`}
                {typeof meta?.newBalance === "number" && ` · ${meta.newBalance} left`}
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={downloadCsv}><I.Download size={14} /><span>CSV</span></button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 12 }}>
            <div style={{ padding: 10, background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 4 }}>
              <div className="subtle" style={{ fontSize: 11 }}>OPENING</div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{fmt(stmt.opening_balance, stmt.currency)}</div>
            </div>
            <div style={{ padding: 10, background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 4 }}>
              <div className="subtle" style={{ fontSize: 11 }}>CREDITED</div>
              <div style={{ fontWeight: 500, fontSize: 14, color: "var(--green, #0a7a2a)" }}>+{fmt(totalIn, stmt.currency)}</div>
            </div>
            <div style={{ padding: 10, background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 4 }}>
              <div className="subtle" style={{ fontSize: 11 }}>DEBITED</div>
              <div style={{ fontWeight: 500, fontSize: 14, color: "var(--red)" }}>−{fmt(totalOut, stmt.currency)}</div>
            </div>
            <div style={{ padding: 10, background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 4 }}>
              <div className="subtle" style={{ fontSize: 11 }}>CLOSING</div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{fmt(stmt.closing_balance, stmt.currency)}</div>
            </div>
          </div>

          <div style={{ padding: 0, overflow: "auto", maxHeight: 400, background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--bg-2)", position: "sticky", top: 0 }}>
                  <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--fg-subtle)" }}>Date</th>
                  <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--fg-subtle)" }}>Description</th>
                  <th style={{ textAlign: "right", padding: "6px 10px", color: "var(--fg-subtle)" }}>Debit</th>
                  <th style={{ textAlign: "right", padding: "6px 10px", color: "var(--fg-subtle)" }}>Credit</th>
                  <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--fg-subtle)" }}>Cat.</th>
                </tr>
              </thead>
              <tbody>
                {stmt.transactions.map((t, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "4px 10px", fontFamily: "var(--font-mono), ui-monospace, monospace" }}>{t.date ?? "—"}</td>
                    <td style={{ padding: "4px 10px", maxWidth: 300, wordBreak: "break-word" }}>{t.description}</td>
                    <td style={{ padding: "4px 10px", textAlign: "right", color: t.debit ? "var(--red)" : "var(--fg-subtle)", fontFamily: "var(--font-mono), ui-monospace, monospace" }}>
                      {t.debit !== null ? fmt(t.debit, stmt.currency) : "—"}
                    </td>
                    <td style={{ padding: "4px 10px", textAlign: "right", color: t.credit ? "var(--green, #0a7a2a)" : "var(--fg-subtle)", fontFamily: "var(--font-mono), ui-monospace, monospace" }}>
                      {t.credit !== null ? fmt(t.credit, stmt.currency) : "—"}
                    </td>
                    <td style={{ padding: "4px 10px" }}>
                      {t.category && <span style={{ padding: "1px 5px", background: "var(--bg-2)", borderRadius: 2, fontSize: 10 }}>{t.category}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {file && <button type="button" className="btn btn-ghost" disabled={busy} onClick={reset}>Reset</button>}
        {signedOut ? (
          <Link href="/login?callbackUrl=/tool/ai-bank-statement" className="btn btn-primary">Sign in to parse</Link>
        ) : (
          <button type="button" className="btn btn-primary" disabled={!file || busy} onClick={run}>
            {busy ? "Parsing…" : "Parse statement"}
          </button>
        )}
      </div>
    </div>
  );
}
