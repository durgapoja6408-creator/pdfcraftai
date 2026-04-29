"use client";

// components/tools/PdfChecklistTool.tsx
//
// Build 2 Wave 8 (2026-04-27): shared runner for the 4 audit-style
// tools — PDF/A check, PDF/X check, Accessibility audit, JS
// detector. Each surfaces a list of findings with status badges,
// optional severity tags, and a top-line headline.
//
// Per-tool wrappers below pass: id, group, headline-builder,
// parser fn. The component handles the boilerplate (drop, parse,
// render checklist + headline + copy/CSV/JSON export, repeat).

import { useState, useCallback } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import type { ToolGroup } from "@/lib/tools";
import { mapPdfOpError } from "@/lib/pdf/error-messages";

export interface ChecklistItem {
  label: string;
  status: "pass" | "fail" | "warning" | "info";
  detail: string;
  severity?: string;
}

export interface ChecklistHeadline {
  /** Big top-line text, e.g. "PDF/A-2b detected" or "Score 80/100". */
  headline: string;
  /** Sub-line under the headline. */
  subhead: string;
  /** Color tone for the headline. */
  tone: "good" | "bad" | "warn" | "neutral";
}

export interface ChecklistResult {
  fileName: string;
  fileSize: number;
  headline: ChecklistHeadline;
  items: ChecklistItem[];
  unsupported: boolean;
}

interface ChecklistToolProps {
  toolId: string;
  group: ToolGroup;
  /** What to call the action — "Check", "Audit", "Detect". */
  actionLabel: string;
  /** Busy-state label, e.g. "Checking…". */
  busyLabel: string;
  /** Empty-state dropzone prompt. */
  dropPrompt: string;
  /** Tool-specific parser. Must not throw. */
  parse: (bytes: Uint8Array) => Promise<ChecklistResult>;
}

export function PdfChecklistTool({
  toolId,
  group,
  actionLabel,
  busyLabel,
  dropPrompt,
  parse,
}: ChecklistToolProps) {
  const tracker = useTrackToolView(toolId, group);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<"idle" | "checking" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ChecklistResult | null>(null);
  const [copied, setCopied] = useState(false);

  const onFiles = useCallback(
    (files: File[]) => {
      setError(null);
      setResult(null);
      const f = files[0];
      if (!f) return;
      if (!f.type.includes("pdf") && !f.name.toLowerCase().endsWith(".pdf")) {
        setError("That's not a PDF. Drop a .pdf file to continue.");
        return;
      }
      if (f.size > 100 * 1024 * 1024) {
        setError("File over 100 MB — try a smaller one.");
        return;
      }
      setFile(f);
      tracker.upload(f);
    },
    [tracker],
  );

  const run = async () => {
    if (!file) return;
    setError(null);
    setStage("checking");
    const t0 = performance.now();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const r = await parse(bytes);
      setResult(r);
      setStage("done");
      tracker.success({
        creditCost: 0,
        pageCount: r.items.length,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error(`${toolId} failed`, err);
      setError(mapPdfOpError(err instanceof Error ? err.message : "Could not check the PDF."));
      setStage("idle");
      tracker.error({ errorCode: "parse_failed" });
    }
  };

  const reset = () => {
    setFile(null);
    setError(null);
    setResult(null);
    setStage("idle");
    setCopied(false);
  };

  const copyJson = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          { headline: result.headline, items: result.items },
          null,
          2,
        ),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silent
    }
  };

  const downloadJson = () => {
    if (!result) return;
    const payload = {
      file: { name: result.fileName, size_bytes: result.fileSize },
      headline: result.headline,
      items: result.items,
      generated_by: `pdfcraft.ai ${toolId}`,
      generated_at: new Date().toISOString(),
      schema_version: 1,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      const base = result.fileName.replace(/\.pdf$/i, "");
      a.download = `${base}.${toolId}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const truncate = (s: string, max = 48) =>
    s.length <= max ? s : `${s.slice(0, max - 1)}…`;
  const busy = stage === "checking";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt={dropPrompt}
          hint="Up to 100 MB · runs privately in your browser"
        />
      ) : (
        <div className="card" style={{ padding: 16 }}>
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <span style={{ color: "var(--fg-subtle)" }}>
              <I.File size={18} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={file.name}
              >
                {truncate(file.name)}
              </div>
              <div className="subtle" style={{ fontSize: 12 }}>
                {humanSize(file.size)}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={reset}
              disabled={busy}
              aria-label="Remove file"
            >
              <I.X size={14} />
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}

      {busy && (
        <div
          className="card"
          style={{ padding: 16, background: "var(--bg-1)", display: "flex", gap: 12 }}
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span className="pulse-soft" style={{ color: "var(--accent)" }}>
            <I.Sparkle size={16} />
          </span>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{busyLabel}</div>
        </div>
      )}

      {result && (
        <div
          className="card"
          style={{ padding: 0, overflow: "hidden" }}
          role="status"
          aria-live="polite"
          aria-label={result.headline.headline}
        >
          <div
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid var(--border)",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 16,
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: toneColor(result.headline.tone),
                }}
              >
                {result.headline.headline}
              </div>
              <div className="subtle" style={{ fontSize: 13, marginTop: 4 }}>
                {result.headline.subhead}
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={copyJson}
                style={{ minWidth: 90 }}
              >
                {copied ? (
                  <>
                    <I.Check size={12} /> Copied
                  </>
                ) : (
                  <>
                    <I.Copy size={12} /> JSON
                  </>
                )}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={downloadJson}
              >
                <I.Download size={12} /> Save
              </button>
            </div>
          </div>

          {result.items.length > 0 && (
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                maxHeight: 480,
                overflowY: "auto",
              }}
            >
              {result.items.map((item, i) => (
                <li
                  key={i}
                  style={{
                    padding: "12px 24px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: statusBg(item.status),
                      color: statusFg(item.status),
                      display: "grid",
                      placeItems: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {statusGlyph(item.status)}
                  </span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>
                      {item.label}
                      {item.severity && (
                        <span
                          className="subtle"
                          style={{
                            fontSize: 11,
                            marginLeft: 8,
                            padding: "1px 6px",
                            borderRadius: 3,
                            background: "var(--bg-2)",
                            color: "var(--fg-muted)",
                          }}
                        >
                          {item.severity}
                        </span>
                      )}
                    </div>
                    <div
                      className="muted"
                      style={{ fontSize: 13, marginTop: 4, lineHeight: 1.55 }}
                    >
                      {item.detail}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>
            Check another PDF
          </button>
        ) : (
          <>
            {file && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={reset}
                disabled={busy}
              >
                Reset
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={!file || busy}
              onClick={run}
            >
              {busy ? busyLabel : actionLabel}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ----- Status visuals -----------------------------------------------

function toneColor(tone: ChecklistHeadline["tone"]): string {
  switch (tone) {
    case "good":
      return "rgb(74, 222, 128)";
    case "bad":
      return "var(--red, rgb(239, 68, 68))";
    case "warn":
      return "rgb(251, 146, 60)";
    default:
      return "var(--fg)";
  }
}

function statusBg(status: ChecklistItem["status"]): string {
  switch (status) {
    case "pass":
      return "rgba(74, 222, 128, 0.15)";
    case "fail":
      return "rgba(239, 68, 68, 0.15)";
    case "warning":
      return "rgba(251, 146, 60, 0.15)";
    case "info":
      return "var(--bg-2)";
  }
}

function statusFg(status: ChecklistItem["status"]): string {
  switch (status) {
    case "pass":
      return "rgb(74, 222, 128)";
    case "fail":
      return "rgb(239, 68, 68)";
    case "warning":
      return "rgb(251, 146, 60)";
    case "info":
      return "var(--fg-muted)";
  }
}

function statusGlyph(status: ChecklistItem["status"]): string {
  switch (status) {
    case "pass":
      return "✓";
    case "fail":
      return "✗";
    case "warning":
      return "!";
    case "info":
      return "i";
  }
}

// ----- Per-tool wrappers --------------------------------------------

export function PdfACheckTool() {
  return (
    <PdfChecklistTool
      toolId="pdf-a-check"
      group="Organize"
      actionLabel="Check PDF/A compliance"
      busyLabel="Checking PDF/A compliance…"
      dropPrompt="Drop a PDF to check PDF/A compliance"
      parse={async (bytes) => {
        const { checkPdfA } = await import("@/lib/pdf/ops/pdfa-check");
        const r = checkPdfA(bytes);
        const headline = r.declaredLevel
          ? r.compliant
            ? {
                headline: `${r.declaredLevel} — looks compliant`,
                subhead: `All ${r.checks.filter((c) => c.status === "pass").length} required checks passed`,
                tone: "good" as const,
              }
            : {
                headline: `${r.declaredLevel} declared — ${r.failureCount} issue${r.failureCount === 1 ? "" : "s"}`,
                subhead: "Document declares PDF/A but fails some checks",
                tone: "warn" as const,
              }
          : {
              headline: "Not PDF/A",
              subhead: "No PDF/A identification markers found",
              tone: "neutral" as const,
            };
        return {
          fileName: "",
          fileSize: 0,
          headline,
          items: r.checks.map((c) => ({
            label: c.label,
            status: c.status,
            detail: c.detail,
          })),
          unsupported: r.unsupported,
        };
      }}
    />
  );
}

export function PdfXCheckTool() {
  return (
    <PdfChecklistTool
      toolId="pdf-x-check"
      group="Organize"
      actionLabel="Check PDF/X compliance"
      busyLabel="Checking PDF/X compliance…"
      dropPrompt="Drop a PDF to check PDF/X compliance"
      parse={async (bytes) => {
        const { checkPdfX } = await import("@/lib/pdf/ops/pdfx-check");
        const r = checkPdfX(bytes);
        const headline = r.declaredVersion
          ? r.compliant
            ? {
                headline: `${r.declaredVersion} — looks compliant`,
                subhead: `All ${r.checks.filter((c) => c.status === "pass").length} required checks passed`,
                tone: "good" as const,
              }
            : {
                headline: `${r.declaredVersion} declared — ${r.failureCount} issue${r.failureCount === 1 ? "" : "s"}`,
                subhead: "Document declares PDF/X but fails some checks",
                tone: "warn" as const,
              }
          : {
              headline: "Not PDF/X",
              subhead: "No PDF/X identification markers found",
              tone: "neutral" as const,
            };
        return {
          fileName: "",
          fileSize: 0,
          headline,
          items: r.checks.map((c) => ({
            label: c.label,
            status: c.status,
            detail: c.detail,
          })),
          unsupported: r.unsupported,
        };
      }}
    />
  );
}

export function AccessibilityCheckerTool() {
  return (
    <PdfChecklistTool
      toolId="pdf-accessibility"
      group="Organize"
      actionLabel="Audit accessibility"
      busyLabel="Auditing accessibility…"
      dropPrompt="Drop a PDF to audit accessibility"
      parse={async (bytes) => {
        const { auditAccessibility } = await import("@/lib/pdf/ops/accessibility");
        const r = auditAccessibility(bytes);
        const tone =
          r.score >= 90
            ? ("good" as const)
            : r.score >= 60
              ? ("warn" as const)
              : ("bad" as const);
        return {
          fileName: "",
          fileSize: 0,
          headline: {
            headline: `Score ${r.score}/100`,
            subhead:
              r.mustFixCount === 0
                ? "All must-fix structural checks passed"
                : `${r.mustFixCount} must-fix issue${r.mustFixCount === 1 ? "" : "s"}`,
            tone,
          },
          items: r.checks.map((c) => ({
            label: c.label,
            status: c.status,
            detail: c.detail,
            severity: c.severity,
          })),
          unsupported: r.unsupported,
        };
      }}
    />
  );
}

export function PdfJsDetectorTool() {
  return (
    <PdfChecklistTool
      toolId="pdf-javascript"
      group="Organize"
      actionLabel="Scan for JavaScript"
      busyLabel="Scanning for JavaScript…"
      dropPrompt="Drop a PDF to scan for JavaScript"
      parse={async (bytes) => {
        const { detectJavaScript } = await import("@/lib/pdf/ops/javascript");
        const r = detectJavaScript(bytes);
        const highCount = r.handlers.filter((h) => h.severity === "high").length;
        const tone = !r.hasJavaScript
          ? ("good" as const)
          : highCount > 0
            ? ("bad" as const)
            : ("warn" as const);
        const headline = !r.hasJavaScript
          ? {
              headline: "No JavaScript detected",
              subhead: "Document is statically readable — safer for security",
              tone,
            }
          : {
              headline: `${r.totalCount} JavaScript handler${r.totalCount === 1 ? "" : "s"} detected`,
              subhead:
                highCount > 0
                  ? `${highCount} high-severity (network / file system access). Review carefully.`
                  : "Review the handlers below to assess risk.",
              tone,
            };
        return {
          fileName: "",
          fileSize: 0,
          headline,
          items: r.handlers.map((h) => ({
            label: h.trigger,
            status: (h.severity === "high"
              ? "fail"
              : h.severity === "medium"
                ? "warning"
                : "info") as ChecklistItem["status"],
            detail:
              `Location: ${h.location} · Code: ${h.preview || "(empty)"}` +
              (h.codeLength > 200
                ? ` … (${h.codeLength} chars total)`
                : ""),
            severity: h.severity,
          })),
          unsupported: r.unsupported,
        };
      }}
    />
  );
}
