"use client";

// FlattenPdfTool — Tier 1 §1.2 P1.
//
// "Flatten" a PDF: merge interactive form fields and annotations into
// the page content stream, so nothing is editable afterward. Common
// uses: a filled-in form that needs to be shipped as a signed final
// (recipient can't edit the fields), scanned-style archive copies,
// reducing fragility when a PDF gets re-printed or re-signed.
//
// pdf-lib exposes `form.flatten()` which bakes every widget's current
// appearance into the page. We also strip /Annots from each page for
// the non-form annotation case (highlights, comments, links) because
// form.flatten() only addresses the /AcroForm field widgets.

import { useState, useCallback } from "react";
import { PDFDocument } from "pdf-lib";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import {
  deriveOutputName,
  downloadBytes,
  humanSize,
  sha256HexOfBytes,
} from "@/lib/client/pdf-utils";
import { logToolResultAction } from "@/lib/tool-result-actions";
import { useTrackToolView } from "./useToolTracking";

type Loaded = {
  file: File;
  pageCount: number;
  fieldCount: number;
  annotCount: number;
};

export function FlattenPdfTool() {
  useTrackToolView("flatten-pdf", "Optimize");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    bytes: Uint8Array;
    name: string;
    size: number;
    flattenedFields: number;
    strippedAnnots: number;
  } | null>(null);

  const onFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const doc = await PDFDocument.load(await f.arrayBuffer(), {
        ignoreEncryption: true,
      });
      const form = doc.getForm();
      const fieldCount = form.getFields().length;
      // Count annotations: walk each page's /Annots array.
      let annotCount = 0;
      for (const page of doc.getPages()) {
        const annots = page.node.Annots();
        if (annots) {
          // pdf-lib's PDFArray has `.size()`. Each entry is one
          // annotation (link, highlight, text comment, widget, etc).
          annotCount += annots.size();
        }
      }
      setLoaded({
        file: f,
        pageCount: doc.getPageCount(),
        fieldCount,
        annotCount,
      });
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error && /encrypted|password/i.test(err.message)
          ? "This PDF is password-protected. Unlock it first."
          : "Couldn't read that PDF. It may be corrupt."
      );
      setLoaded(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const reset = () => {
    setLoaded(null);
    setError(null);
    setResult(null);
  };

  const run = async () => {
    if (!loaded) return;
    if (loaded.fieldCount === 0 && loaded.annotCount === 0) {
      setError(
        "This PDF has no form fields or annotations to flatten — nothing would change."
      );
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const doc = await PDFDocument.load(await loaded.file.arrayBuffer(), {
        ignoreEncryption: true,
      });

      // Flatten form widgets (if any). This bakes each field's visible
      // state into the page stream, then strips the interactive widget.
      let flattenedFields = 0;
      const form = doc.getForm();
      const fields = form.getFields();
      if (fields.length > 0) {
        form.flatten();
        flattenedFields = fields.length;
      }

      // Strip non-form annotations (highlights, links, comments, etc.).
      // After form.flatten() the /Annots array still contains any
      // non-widget annotations; removing them is what makes the output
      // "fully flat". Users who want to KEEP links should not use
      // this tool (we surface that trade-off in the UI hint).
      let strippedAnnots = 0;
      for (const page of doc.getPages()) {
        const annots = page.node.Annots();
        if (annots && annots.size() > 0) {
          strippedAnnots += annots.size();
          // pdf-lib's PDFArray doesn't expose a clear() — the supported
          // way is to set the page's /Annots to an empty array.
          page.node.delete(
            // Use the low-level PDFName import via doc.context.obj
            doc.context.obj("Annots")
          );
        }
      }

      const bytes = await doc.save({ useObjectStreams: true });
      const name = deriveOutputName(loaded.file.name, "-flattened");
      setResult({
        bytes,
        name,
        size: bytes.length,
        flattenedFields,
        strippedAnnots,
      });

      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "flatten-pdf",
          name,
          mime: "application/pdf",
          sizeBytes: bytes.length,
          sha256,
        });
      } catch (logErr) {
        console.warn("logToolResult failed (non-fatal):", logErr);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Flatten failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!loaded ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF to flatten forms + annotations"
        />
      ) : (
        <>
          <div
            className="card"
            style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center" }}
          >
            <span style={{ color: "var(--fg-subtle)" }}>
              <I.File size={18} />
            </span>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div
                title={loaded.file.name}
                style={{
                  fontSize: 14,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {loaded.file.name}
              </div>
              <div className="subtle" style={{ fontSize: 12 }}>
                {humanSize(loaded.file.size)} · {loaded.pageCount} page
                {loaded.pageCount === 1 ? "" : "s"} · {loaded.fieldCount} form
                field{loaded.fieldCount === 1 ? "" : "s"} ·{" "}
                {loaded.annotCount} annotation
                {loaded.annotCount === 1 ? "" : "s"}
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

          <div
            className="card"
            style={{
              padding: 16,
              background: "var(--bg-1)",
              fontSize: 13,
              color: "var(--fg-subtle)",
            }}
          >
            <strong style={{ color: "var(--fg)", display: "block", marginBottom: 4 }}>
              What flattening does:
            </strong>
            Form widgets become static text (recipient can&apos;t edit).
            Annotations (highlights, comments, hyperlinks, text boxes) are
            removed entirely. Use this for signed finals, archive copies, or
            before sharing sensitive marked-up documents. If you need to keep
            clickable hyperlinks, don&apos;t flatten — use Protect instead.
          </div>
        </>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}

      {result && (
        <div
          className="card"
          style={{
            padding: 20,
            borderColor: "var(--accent)",
            background: "var(--accent-soft)",
          }}
        >
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
                flexShrink: 0,
              }}
            >
              <I.Check size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 2 }}>
                Flatten complete
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {result.flattenedFields} field
                {result.flattenedFields === 1 ? "" : "s"} baked ·{" "}
                {result.strippedAnnots} annotation
                {result.strippedAnnots === 1 ? "" : "s"} removed ·{" "}
                {humanSize(result.size)}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => downloadBytes(result.bytes, result.name)}
            >
              <I.Download size={14} />
              <span>Download</span>
            </button>
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {loaded && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={reset}
          >
            Reset
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!loaded || busy}
          onClick={run}
        >
          {busy ? "Flattening…" : "Flatten PDF"}
        </button>
      </div>
    </div>
  );
}
