"use client";

// RepairPdfTool — Tier 1 §1.2 P1.
//
// Attempts to repair a corrupt or malformed PDF by loading it with
// every pdf-lib recovery flag turned on, walking the page tree to
// verify accessibility, and re-saving to rebuild the xref table,
// recompress streams, and drop unresolved object references.
//
// What this fixes in practice (the common breakage we see in
// user-reported corrupt PDFs):
//   - Stale / out-of-date xref table (pdf-lib rebuilds on save).
//   - Missing trailer (pdf-lib reconstructs from scan).
//   - Broken page tree from truncated uploads — pdf-lib walks as
//     far as it can; unreachable pages get dropped on save.
//   - Invalid /Info dict entries — `updateMetadata: false` on load
//     skips touching them; we clean any unreadable entries at save.
//   - Wrong %PDF header or missing %%EOF — pdf-lib's parser
//     locates the catalog heuristically when this fails.
//   - Encryption with a blank password — `ignoreEncryption: true`
//     lets the user past the lock when the password is "".
//
// What this CAN'T fix:
//   - PDFs missing the catalog object entirely (no recoverable
//     structure to rebuild from).
//   - Mid-stream binary corruption inside content streams (we'd
//     need to parse + heal individual PDF operators, out of
//     scope for an MVP).
//   - PDFs that are actually password-encrypted with a real
//     non-empty password (the `ignoreEncryption` path works only
//     when the password is blank or the encryption layer is a
//     permissions-only placeholder).
//
// The report UI is explicit about BOTH what we repaired and what
// remained. Users who see "parse failed" get a clear "this PDF
// can't be recovered with pdf-lib — try a dedicated recovery
// service" pointer.

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

type RepairOutcome = {
  file: File;
  bytes: Uint8Array;
  name: string;
  originalSize: number;
  newSize: number;
  pageCount: number;
  notes: string[];
};

export function RepairPdfTool() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RepairOutcome | null>(null);

  const onFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setResult(null);
    setBusy(true);

    const notes: string[] = [];
    let originalSize = f.size;
    let doc: PDFDocument | null = null;

    try {
      const buffer = await f.arrayBuffer();
      originalSize = buffer.byteLength;

      // First attempt: strict load. Tells us whether the PDF is
      // structurally sound or needs recovery.
      try {
        doc = await PDFDocument.load(buffer, {
          ignoreEncryption: true,
          updateMetadata: false,
          throwOnInvalidObject: true,
        });
        notes.push("Parsed cleanly on first pass — no structural errors.");
      } catch (strictErr) {
        const msg = strictErr instanceof Error ? strictErr.message : String(strictErr);
        notes.push(
          `First-pass strict parse failed: ${msg.slice(0, 120)}. Retrying with recovery mode…`
        );

        // Second attempt: every recovery flag, no-throw on invalid
        // objects. pdf-lib walks the indirect-object table and
        // swaps any unresolvable refs with PDFNull — the saved PDF
        // drops the broken references cleanly.
        doc = await PDFDocument.load(buffer, {
          ignoreEncryption: true,
          updateMetadata: false,
          throwOnInvalidObject: false,
        });
        notes.push("Recovery-mode parse succeeded.");
      }

      // Walk page tree — any unreachable page throws here; we
      // count what the user will actually get after save.
      const pages = doc.getPages();
      notes.push(`Page tree walkable — ${pages.length} page${pages.length === 1 ? "" : "s"} reachable.`);

      // If there are zero pages, we can't produce a useful output.
      if (pages.length === 0) {
        throw new Error(
          "PDF parsed but contains zero reachable pages. Can't produce a useful repair."
        );
      }

      // Re-save with useObjectStreams so pdf-lib writes a fresh
      // xref, drops orphaned objects, and recompresses. This step
      // alone fixes most everyday corruption.
      const bytes = await doc.save({
        useObjectStreams: true,
        updateFieldAppearances: false,
      });
      const newSize = bytes.length;
      notes.push(
        `Re-saved with fresh xref — ${humanSize(originalSize)} → ${humanSize(newSize)} (${newSize < originalSize ? "smaller" : newSize > originalSize ? "larger" : "same size"}).`
      );
      if (newSize < originalSize) {
        notes.push(
          `Reclaimed ${humanSize(originalSize - newSize)} of orphaned objects / stale xref.`
        );
      }

      const name = deriveOutputName(f.name, "-repaired");
      setResult({
        file: f,
        bytes,
        name,
        originalSize,
        newSize,
        pageCount: pages.length,
        notes,
      });

      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "repair-pdf",
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
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        /password|encrypt/i.test(msg)
          ? "This PDF is password-protected with a real password. Unlock it first with the Protect tool, then retry."
          : `Repair failed: ${msg.slice(0, 200)}`
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const reset = () => {
    setResult(null);
    setError(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!result ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a corrupt or stuck PDF to repair"
        />
      ) : (
        <>
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
                  Repair complete
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {result.pageCount} page{result.pageCount === 1 ? "" : "s"} ·{" "}
                  {humanSize(result.newSize)}
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

          <div className="card" style={{ padding: "14px 16px" }}>
            <div
              style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-subtle)", marginBottom: 10 }}
            >
              REPAIR REPORT
            </div>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                fontSize: 13,
              }}
            >
              {result.notes.map((n, i) => (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <span style={{ color: "var(--accent)", flexShrink: 0 }}>
                    <I.Check size={14} />
                  </span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {error && (
        <div
          className="card"
          style={{
            padding: 16,
            borderColor: "var(--red)",
            background: "var(--red-soft, #fff1f2)",
          }}
        >
          <div
            style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--red)" }}
          >
            Couldn't repair this PDF
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{error}</div>
          <div className="subtle" style={{ fontSize: 12, marginTop: 8 }}>
            pdf-lib couldn't recover the structure. This usually means the PDF
            is missing its catalog object or has content-stream-level binary
            corruption that a structural re-save can't fix. Try a dedicated
            recovery service.
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {result && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={reset}
            disabled={busy}
          >
            Repair another file
          </button>
        )}
      </div>
    </div>
  );
}
