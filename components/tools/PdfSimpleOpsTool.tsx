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
import { downloadBytes } from "@/lib/client/download";
import { useTrackToolView } from "./useToolTracking";
import { mapPdfOpError } from "@/lib/pdf/error-messages";
import { useHandoffConsumer } from "./useHandoffConsumer";
import { useFileUrlConsumer } from "./useFileUrlConsumer";
import { useScrollErrorIntoView } from "./useScrollErrorIntoView";
import { HandoffSuggestions } from "./HandoffSuggestions";
import type { ToolGroup } from "@/lib/tools";

// 2026-04-30: exported so external consumers (PdfNUpTool, PdfResizeTool)
// can type their `apply` returns without re-declaring the shape.
export interface SimpleOpResult {
  outputBytes: Uint8Array;
  outputFileName: string;
  /** Headline for the success card. */
  headline: string;
  /** Smaller subtle line below the headline. */
  detail: string;
}

/**
 * G2 (#193, 2026-04-28): "before" inspection result. When a consumer
 * provides an `inspect` callback, the shell runs it after file drop
 * and shows the headline + detail in a card BEFORE the user clicks
 * the action. Lets users see exactly what the op will touch (e.g.
 * "Found 23 hyperlinks across 8 pages — strip them?") instead of
 * running blind. The tone is neutral / pre-action; the success card
 * stays the actual confirmation that something happened.
 */
interface SimpleOpInspect {
  /** Pre-action headline (e.g. "Found 23 hyperlinks"). */
  headline: string;
  /** Subline detail (e.g. "across 8 pages"). */
  detail: string;
  /**
   * Optional flag — if set true and no items were found, the action
   * button can be relabeled to "Save a clean copy" and the helper
   * text shifts to make the no-op outcome explicit.
   */
  empty?: boolean;
}

interface SimpleOpToolProps {
  toolId: string;
  toolGroup: ToolGroup;
  dropPrompt: string;
  /**
   * Optional ToolHowItWorks-style explainer rendered ABOVE the
   * dropzone, before any file is loaded. Item #8 (improvement
   * analysis) — gives the user context on "what does this tool do?"
   * without bouncing them to /help. Mount via:
   *   howItWorks={<ToolHowItWorks steps={[...]} privacyNote="..." />}
   *
   * Distinct from `explainer` below: that prop renders AFTER drop,
   * as a small confirmation card. howItWorks is the pre-drop "is
   * this the right tool?" surface.
   */
  howItWorks?: React.ReactNode;
  /** Optional explainer card shown above the action button. */
  explainer?: React.ReactNode;
  busyLabel: string;
  /**
   * Action button label. Function form lets the consumer derive the
   * label from its own config state (e.g. "Build 2-up PDF" vs
   * "Build 4-up PDF" based on the user's layout selection in the
   * configPanel slot).
   */
  actionLabel: string | (() => string);
  successCta: string;
  errorCode: string;
  /**
   * Optional pre-action inspector. Runs after file drop, before the
   * user clicks the action button. The shell renders the headline +
   * detail in an inspection card so users know what the op will do.
   * Failures fall back silently — no point blocking the action just
   * because we couldn't pre-count.
   */
  inspect?: (bytes: Uint8Array) => Promise<SimpleOpInspect>;
  /**
   * 2026-04-30 (audit cluster C): optional config panel slot for ops
   * that need user input before applying (n-up layout, paper-size,
   * etc.). Renders as a styled card above the action button when a
   * file is loaded but no result is shown yet. The consumer manages
   * the config state and the `apply` callback closes over it.
   *
   * Use this for tools that previously couldn't migrate to
   * PdfSimpleOpsTool because they needed config UI between drop
   * and apply (n-up-pdf, resize-pdf, etc.).
   */
  configPanel?: React.ReactNode;
  apply: (bytes: Uint8Array, file: File) => Promise<SimpleOpResult>;
}

// 2026-04-30: exported (was locally-scoped) so external tool files
// can wrap it directly. The 4 wrappers below stay co-located in
// this file for the historical "4 tools share one chunk"
// optimization, but new consumers (PdfNUpTool, PdfResizeTool) live
// in their own files for clarity. Both patterns are valid.
export function PdfSimpleOpsTool(props: SimpleOpToolProps) {
  const tracker = useTrackToolView(props.toolId, props.toolGroup);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimpleOpResult | null>(null);
  // G2 (#193): cached inspection result from props.inspect. Stored
  // separately from the action result so both can coexist (inspect
  // runs once on file drop; result appears after Apply).
  const [inspect, setInspect] = useState<SimpleOpInspect | null>(null);
  const [inspecting, setInspecting] = useState(false);

  const onFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      setResult(null);
      setInspect(null);
      const f = files[0];
      if (!f) return;
      if (!f.type.includes("pdf") && !f.name.toLowerCase().endsWith(".pdf")) {
        setError("That's not a PDF. Drop a .pdf file to continue.");
        return;
      }
      if (f.size > 50 * 1024 * 1024) {
        setError("File over 50 MB — try a smaller one.");
        return;
      }
      setFile(f);
      tracker.upload(f);

      // Kick off pre-action inspection if the consumer provided one.
      // Failures fall back silently — pre-counting is informational,
      // not a hard prerequisite for running the op.
      if (props.inspect) {
        setInspecting(true);
        try {
          const bytes = new Uint8Array(await f.arrayBuffer());
          const r = await props.inspect(bytes);
          setInspect(r);
        } catch (err) {
          // Don't surface — inspection is best-effort.
          console.warn(`${props.toolId} inspect failed`, err);
        } finally {
          setInspecting(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tracker, props.toolId],
  );

  // M9 part 2 (#193, 2026-04-29): consume incoming handoff.
  useHandoffConsumer(onFiles);
  // M10 (#193, 2026-04-29): consume incoming ?file=<url> deep-link.
  useFileUrlConsumer(onFiles);
  // M16: scroll error into view on null→string transition.
  const errorRef = useScrollErrorIntoView(error);

  const reset = () => {
    setFile(null);
    setError(null);
    setResult(null);
    setInspect(null);
    setInspecting(false);
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
      setError(mapPdfOpError(msg));
      tracker.error({ errorCode: props.errorCode });
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!result) return;
    downloadBytes(result.outputBytes, result.outputFileName);
  };

  const truncate = (s: string, max = 38) =>
    s.length <= max ? s : `${s.slice(0, max - 1)}…`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Item #8 (improvement analysis) — pre-drop explainer slot.
          Renders unconditionally above the dropzone; consumers pass
          a <ToolHowItWorks> element here. Distinct from `explainer`
          below which fires after drop as a smaller confirmation. */}
      {props.howItWorks}
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt={props.dropPrompt}
          hint="Up to 50 MB · runs privately in your browser"
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

      {/* 2026-04-30 (audit cluster C): config-panel slot for ops that
          need user input before applying (n-up layout, paper-size).
          Rendered as the consumer-supplied node — they control
          styling so radio groups + selects can use full-strength
          contrast rather than the muted-explainer treatment. */}
      {file && !result && props.configPanel && props.configPanel}

      {/* G2: pre-action inspection card. Shows what the op will
          touch BEFORE the user commits. Renders only when the
          consumer wires `inspect` — for the four PdfSimpleOpsTool
          consumers (Repair / Strip Links / Flatten / Remove
          Metadata) this means users know what they're stripping
          before they strip it. */}
      {file && !result && inspecting && (
        <div
          className="card"
          style={{ padding: 14, background: "var(--bg-1)", fontSize: 12, color: "var(--fg-muted)" }}
          role="status"
          aria-live="polite"
        >
          Inspecting…
        </div>
      )}
      {file && !result && inspect && !inspecting && (
        <div
          className="card"
          style={{
            padding: "14px 16px",
            background: inspect.empty ? "var(--bg-1)" : "var(--accent-soft)",
            border: inspect.empty
              ? "1px solid var(--border)"
              : "1px solid var(--accent)",
          }}
          role="status"
          aria-live="polite"
        >
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>
            {inspect.headline}
          </div>
          <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
            {inspect.detail}
          </div>
        </div>
      )}

      {error && <p ref={errorRef as React.RefObject<HTMLParagraphElement>} role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{error}</p>}

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
          {/* M9 part 2 (#193, 2026-04-29): handoff suggestions. */}
          <HandoffSuggestions
            sourceToolId={props.toolId}
            outputBytes={result.outputBytes}
            outputFileName={result.outputFileName}
          />
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>{props.successCta}</button>
        ) : (
          <>
            {file && <button type="button" className="btn btn-ghost" onClick={reset} disabled={busy}>Reset</button>}
            <button type="button" className="btn btn-primary" disabled={!file || busy} onClick={run}>{busy ? props.busyLabel : (typeof props.actionLabel === "function" ? props.actionLabel() : props.actionLabel)}</button>
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
      inspect={async (bytes) => {
        const { extractLinks } = await import("@/lib/pdf/ops/links");
        const r = extractLinks(bytes);
        const total = r.totalCount;
        if (total === 0) {
          return {
            headline: "No hyperlinks found",
            detail: "This PDF has no /Link annotations to remove.",
            empty: true,
          };
        }
        const pagesWithLinks = new Set(r.links.map((l) => l.pageNumber)).size;
        const breakdown =
          r.externalCount > 0 && r.internalCount > 0
            ? `${r.externalCount} external · ${r.internalCount} internal`
            : r.externalCount > 0
              ? `${r.externalCount} external`
              : `${r.internalCount} internal`;
        return {
          headline: `Found ${total} hyperlink${total === 1 ? "" : "s"}`,
          detail: `${breakdown} across ${pagesWithLinks} page${pagesWithLinks === 1 ? "" : "s"} — click "Remove all links" to strip them.`,
        };
      }}
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
      inspect={async (bytes) => {
        const { extractPdfMetadata } = await import(
          "@/lib/pdf/ops/metadata"
        );
        const m = extractPdfMetadata(bytes);
        const fields: string[] = [];
        if (m.title) fields.push("Title");
        if (m.author) fields.push("Author");
        if (m.subject) fields.push("Subject");
        if (m.keywords) fields.push("Keywords");
        if (m.producer) fields.push("Producer");
        if (m.creator) fields.push("Creator");
        if (m.creationDate) fields.push("CreationDate");
        if (m.modDate) fields.push("ModDate");
        if (fields.length === 0) {
          return {
            headline: "No /Info metadata fields found",
            detail:
              "This PDF doesn't expose /Info dict fields. (XMP streams may still be present and will be stripped.)",
            empty: true,
          };
        }
        return {
          headline: `Found ${fields.length} /Info field${fields.length === 1 ? "" : "s"}`,
          detail: `Will clear: ${fields.join(", ")}. Embedded XMP streams (if any) will also be removed.`,
        };
      }}
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
      inspect={async (bytes) => {
        const { extractFormFields } = await import("@/lib/pdf/ops/forms");
        const r = extractFormFields(bytes);
        const total = r.fields.length;
        if (total === 0) {
          return {
            headline: "No form fields found",
            detail: "This PDF has no AcroForm fields to flatten.",
            empty: true,
          };
        }
        const filled = r.fields.filter(
          (f) =>
            f.value !== null &&
            f.value !== undefined &&
            String(f.value).trim() !== "",
        ).length;
        return {
          headline: `Found ${total} form field${total === 1 ? "" : "s"}`,
          detail:
            filled > 0
              ? `${filled} filled · ${total - filled} empty. Flattening bakes filled values into the page; empty fields disappear.`
              : `All fields are empty. Flattening will remove the form layer; the page content stays as-is.`,
        };
      }}
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
