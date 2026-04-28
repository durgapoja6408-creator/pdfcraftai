"use client";

// components/tools/PdfSimpleOpsTool.tsx
//
// Tier 3 (2026-04-28): shared runner shell for one-button pdf-lib
// operations that don&rsquo;t need any per-page UI — drop a PDF, click a
// button, download. Three tools share this shell:
//   - Repair PDF        (load + re-save through pdf-lib&rsquo;s parser)
//   - Strip Links       (remove every /Link annotation)
//   - Flatten PDF       (bake AcroForm field values into page content)
//
// Each consumer passes a label / button text / op fn; the shell
// handles file drop, GA4 funnel, error rendering, and download.

import { useState, useCallback } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import type { ToolGroup } from "@/lib/tools";

interface SimpleOpResult {
  outputBytes: Uint8Array;
  outputFileName: string;
  /** Headline for the success card. */
  headline: string;
  /** Smaller subtle line below the headline. */
  detail: string;
}

interface SimpleOpToolProps {
  toolId: string;
  toolGroup: ToolGroup;
  dropPrompt: string;
  /** Optional explainer card shown above the action button. */
  explainer?: React.ReactNode;
  busyLabel: string;
  actionLabel: string;
  successCta: string;
  errorCode: string;
  apply: (bytes: Uint8Array, file: File) => Promise<SimpleOpResult>;
}

function PdfSimpleOpsTool(props: SimpleOpToolProps) {
  const tracker = useTrackToolView(props.toolId, props.toolGroup);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimpleOpResult | null>(null);

  const onFiles = useCallback(
    (files: File[]) => {
      setError(null);
      setResult(null);
      const f = files[0];
      if (!f) return;
      if (!f.type.includes("pdf") && !f.name.toLowerCase().endsWith(".pdf")) {
        setError("Please drop a PDF file.");
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

  const reset = () => {
    setFile(null);
    setError(null);
    setResult(null);
    setBusy(false);
  };

  const run = async () => {
    if (!file) return;
    setError(null);
    setBusy(true);
    const t0 = performance.now();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const r = await props.apply(bytes, file);
      setResult(r);
      tracker.success({
        creditCost: 0,
        pageCount: 1,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Operation failed.";
      setError(msg);
      tracker.error({ errorCode: props.errorCode });
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!result) return;
    const blob = new Blob([result.outputBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = result.outputFileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const truncate = (s: string, max = 38) =>
    s.length <= max ? s : `${s.slice(0, max - 1)}…`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt={props.dropPrompt}
          hint="Up to 100 MB · runs privately in your browser"
        />
      ) : (
        <div className="card" style={{ padding: 16 }}>
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <span style={{ color: "var(--fg-subtle)" }}><I.File size={18} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={file.name}>{truncate(file.name)}</div>
              <div className="subtle" style={{ fontSize: 12 }}>{humanSize(file.size)}</div>
            </div>
            <button type="button" className="btn btn-sm btn-ghost" onClick={reset} disabled={busy} aria-label="Remove file"><I.X size={14} /></button>
          </div>
        </div>
      )}

      {file && !result && props.explainer && (
        <div className="card" style={{ padding: 14, background: "var(--bg-1)", fontSize: 12, color: "var(--fg-muted)" }}>
          {props.explainer}
        </div>
      )}

      {error && <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{error}</p>}

      {busy && (
        <div className="card" style={{ padding: 16, background: "var(--bg-1)", display: "flex", gap: 12 }} role="status" aria-live="polite" aria-busy="true">
          <span className="pulse-soft" style={{ color: "var(--accent)" }}><I.Sparkle size={16} /></span>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{props.busyLabel}</div>
        </div>
      )}

      {result && (
        <div className="card" style={{ padding: "16px 20px" }} role="status" aria-live="polite" aria-label={result.headline}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{result.headline}</div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>{result.detail}</div>
            </div>
            <button type="button" className="btn btn-sm btn-outline" onClick={download}><I.Download size={12} /> Download</button>
          </div>
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>{props.successCta}</button>
        ) : (
          <>
            {file && <button type="button" className="btn btn-ghost" onClick={reset} disabled={busy}>Reset</button>}
            <button type="button" className="btn btn-primary" disabled={!file || busy} onClick={run}>{busy ? props.busyLabel : props.actionLabel}</button>
          </>
        )}
      </div>
    </div>
  );
}

// ============== Wrappers per tool ==============

export function PdfRepairTool() {
  return (
    <PdfSimpleOpsTool
      toolId="repair-pdf"
      toolGroup="Edit"
      dropPrompt="Drop a PDF to repair"
      busyLabel="Repairing…"
      actionLabel="Repair PDF"
      successCta="Repair another PDF"
      errorCode="repair_failed"
      explainer={
        <>
          <strong style={{ color: "var(--fg)" }}>What this does:</strong> reparses
          your PDF through pdf-lib&rsquo;s permissive loader and re-saves it as a
          clean spec-compliant document. Fixes mildly malformed structure
          (dangling xref, stale trailer dicts, bad object streams).{" "}
          <strong style={{ color: "var(--fg)" }}>What it can&rsquo;t do:</strong>{" "}
          recover truncated files or fix encrypted/cryptographically damaged
          content streams. For deeper repairs use Adobe Acrobat or qpdf.
        </>
      }
      apply={async (bytes, file) => {
        const { repairPdf } = await import("@/lib/pdf/ops/repair");
        const r = await repairPdf(bytes);
        const baseName = file.name.replace(/\.pdf$/i, "");
        return {
          outputBytes: r.bytes,
          outputFileName: `${baseName || "document"}-repaired.pdf`,
          headline: r.wasClean
            ? `Re-saved cleanly — ${r.pageCount} page${r.pageCount === 1 ? "" : "s"}`
            : `Repaired — ${r.pageCount} page${r.pageCount === 1 ? "" : "s"} recovered`,
          detail: `Original: ${humanSize(r.originalSize)} → Output: ${humanSize(r.bytes.length)}`,
        };
      }}
    />
  );
}

export function PdfStripLinksTool() {
  return (
    <PdfSimpleOpsTool
      toolId="strip-links"
      toolGroup="Edit"
      dropPrompt="Drop a PDF to strip hyperlinks"
      busyLabel="Stripping links…"
      actionLabel="Remove all links"
      successCta="Strip another PDF"
      errorCode="strip_links_failed"
      explainer={
        <>
          <strong style={{ color: "var(--fg)" }}>What this does:</strong>{" "}
          removes every clickable hyperlink annotation from your PDF.
          Useful for print prep, compliance archiving, and reducing
          accidental tap-throughs on touch screens.{" "}
          <strong style={{ color: "var(--fg)" }}>What it preserves:</strong>{" "}
          all other annotations (highlights, comments, sticky notes, form
          widgets) — only /Link annotations are removed.
        </>
      }
      apply={async (bytes, file) => {
        const { stripLinks } = await import("@/lib/pdf/ops/strip-links");
        const r = await stripLinks(bytes);
        const baseName = file.name.replace(/\.pdf$/i, "");
        return {
          outputBytes: r.bytes,
          outputFileName: `${baseName || "document"}-no-links.pdf`,
          headline:
            r.removedCount === 0
              ? `No hyperlinks found — saved a clean copy`
              : `Removed ${r.removedCount} link${r.removedCount === 1 ? "" : "s"} from ${r.pageCount}-page PDF`,
          detail: `Output: ${humanSize(r.bytes.length)}`,
        };
      }}
    />
  );
}

export function PdfRemoveMetadataTool() {
  return (
    <PdfSimpleOpsTool
      toolId="remove-metadata"
      toolGroup="Security"
      dropPrompt="Drop a PDF to strip its metadata"
      busyLabel="Removing metadata…"
      actionLabel="Remove metadata"
      successCta="Strip another PDF"
      errorCode="remove_metadata_failed"
      explainer={
        <>
          <strong style={{ color: "var(--fg)" }}>What this does:</strong>{" "}
          clears the /Info dict (Title, Author, Subject, Keywords, Producer,
          Creator, dates) and removes the embedded XMP metadata stream.
          PDFs leak surprising amounts of identity info — OS username,
          software fingerprint, document history. Strip before sending
          externally.{" "}
          <strong style={{ color: "var(--fg)" }}>What it doesn&rsquo;t touch:</strong>{" "}
          page content. Anything visible in the document stays exactly as
          it was.
        </>
      }
      apply={async (bytes, file) => {
        const { removePdfMetadata } = await import("@/lib/pdf/ops/remove-metadata");
        const r = await removePdfMetadata(bytes);
        const baseName = file.name.replace(/\.pdf$/i, "");
        const had = r.clearedInfoFields.length > 0 || r.hadXmp;
        const detail =
          r.clearedInfoFields.length > 0
            ? `Cleared: ${r.clearedInfoFields.join(", ")}${r.hadXmp ? " · removed XMP stream" : ""}`
            : r.hadXmp
              ? "Removed XMP metadata stream"
              : "No metadata was present";
        return {
          outputBytes: r.bytes,
          outputFileName: `${baseName || "document"}-clean.pdf`,
          headline: had
            ? `Metadata cleared from ${r.pageCount}-page PDF`
            : `No metadata found — saved a clean copy`,
          detail,
        };
      }}
    />
  );
}

export function PdfFlattenTool() {
  return (
    <PdfSimpleOpsTool
      toolId="flatten-pdf"
      toolGroup="Edit"
      dropPrompt="Drop a PDF to flatten its forms"
      busyLabel="Flattening…"
      actionLabel="Flatten forms"
      successCta="Flatten another PDF"
      errorCode="flatten_failed"
      explainer={
        <>
          <strong style={{ color: "var(--fg)" }}>What this does:</strong>{" "}
          bakes AcroForm field values into the page content. After
          flattening, recipients see the filled values but can no longer
          edit them — useful when you&rsquo;ve completed a form and want to
          freeze it before sending.{" "}
          <strong style={{ color: "var(--fg)" }}>Limit:</strong> XFA forms
          and signature-bound fields need Adobe Acrobat to flatten correctly.
        </>
      }
      apply={async (bytes, file) => {
        const { flattenPdf } = await import("@/lib/pdf/ops/flatten");
        const r = await flattenPdf(bytes);
        const baseName = file.name.replace(/\.pdf$/i, "");
        return {
          outputBytes: r.bytes,
          outputFileName: `${baseName || "document"}-flat.pdf`,
          headline: r.hadFormFields
            ? `Flattened ${r.flattenedFieldCount} form field${r.flattenedFieldCount === 1 ? "" : "s"}`
            : `No forms to flatten — saved a clean copy`,
          detail: `${r.pageCount} page${r.pageCount === 1 ? "" : "s"} · ${humanSize(r.bytes.length)}`,
        };
      }}
    />
  );
}
