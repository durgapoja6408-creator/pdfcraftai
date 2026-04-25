"use client";

// RemoveMetadataTool — Tier 1 §1.8 P1.
//
// Strip every piece of document-level metadata a PDF carries:
//   - The `/Info` dictionary: Title, Author, Subject, Keywords, Creator,
//     Producer, CreationDate, ModificationDate.
//   - The XMP metadata stream (modern PDFs also embed a parallel XMP
//     packet alongside `/Info`; readers like Adobe Acrobat read XMP
//     first and fall back to `/Info` if absent).
//
// Why users care: uploaded PDFs routinely carry the author's full name,
// the original filename, the authoring app ("Microsoft® Word 2019"),
// and sometimes even the path on the author's machine. For anyone
// sharing PDFs publicly or with third parties, this is a privacy leak.
// Redacting content with our other tools is pointless if the metadata
// still says "Prepared by Jane Smith, 2025-03-14, C:\Users\jane\…".
//
// Implementation: pdf-lib exposes a `PDFDict` setter on the document's
// catalog but not a one-call clear. We clear each `/Info` field by
// setting it to empty string (pdf-lib's `setTitle("")` serialises as
// `/Title()` which most viewers render as blank), then reach into the
// low-level object graph to delete the XMP metadata stream reference
// if one exists. Content streams (page bodies) are NEVER touched — this
// tool is metadata-only.
//
// Honest limitation surfaced in UI: annotations and form fields can
// also carry metadata (e.g. a text annotation has an `Author`
// property, a signed field has the signer's certificate). We don't
// touch those — if users need a truly clean PDF they should flatten
// first (our Flatten PDF tool), then run Remove Metadata. The
// reassurance copy calls this out.

import { useState, useCallback } from "react";
import { PDFDocument, PDFName } from "pdf-lib";
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

type BeforeSnapshot = {
  title: string | null;
  author: string | null;
  subject: string | null;
  keywords: string | null;
  creator: string | null;
  producer: string | null;
  creationDate: string | null;
  modificationDate: string | null;
  hadXmp: boolean;
};

export function RemoveMetadataTool() {
  useTrackToolView("remove-metadata", "Security");
  const [loaded, setLoaded] = useState<{ file: File; snapshot: BeforeSnapshot } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    bytes: Uint8Array;
    name: string;
    size: number;
    strippedFields: string[];
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
        updateMetadata: false,
      });
      // Snapshot the before-state so we can show the user exactly
      // what was sitting in their PDF.
      const keywords = doc.getKeywords();
      const snapshot: BeforeSnapshot = {
        title: doc.getTitle() ?? null,
        author: doc.getAuthor() ?? null,
        subject: doc.getSubject() ?? null,
        keywords: Array.isArray(keywords)
          ? keywords.join(", ") || null
          : (keywords as string | null | undefined) ?? null,
        creator: doc.getCreator() ?? null,
        producer: doc.getProducer() ?? null,
        creationDate: doc.getCreationDate()?.toISOString() ?? null,
        modificationDate: doc.getModificationDate()?.toISOString() ?? null,
        hadXmp: hasXmpMetadata(doc),
      };
      setLoaded({ file: f, snapshot });
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
    setResult(null);
    setError(null);
  };

  const run = async () => {
    if (!loaded) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      // `updateMetadata: false` so pdf-lib doesn't inject its own
      // `/Producer = 'pdf-lib'` stamp when we save. We want the output
      // to be genuinely scrubbed.
      const doc = await PDFDocument.load(await loaded.file.arrayBuffer(), {
        ignoreEncryption: true,
        updateMetadata: false,
      });

      const stripped: string[] = [];

      // Clear every /Info field. setTitle("") etc. serialises as
      // `/Title ()` which most viewers render blank — a more thorough
      // option would be to delete the key entirely from the /Info
      // dict, which we do below for the dates (they can't be set to
      // empty string).
      if (loaded.snapshot.title !== null) {
        doc.setTitle("");
        stripped.push("Title");
      }
      if (loaded.snapshot.author !== null) {
        doc.setAuthor("");
        stripped.push("Author");
      }
      if (loaded.snapshot.subject !== null) {
        doc.setSubject("");
        stripped.push("Subject");
      }
      if (loaded.snapshot.keywords !== null) {
        doc.setKeywords([]);
        stripped.push("Keywords");
      }
      if (loaded.snapshot.creator !== null) {
        doc.setCreator("");
        stripped.push("Creator");
      }
      if (loaded.snapshot.producer !== null) {
        doc.setProducer("");
        stripped.push("Producer");
      }

      // Delete the date keys entirely — they're typed as /Date, not
      // /String, so we can't set them to an empty string without
      // producing an invalid object.
      const info = doc.context.lookup(doc.context.trailerInfo.Info);
      if (info && "delete" in info && typeof (info as { delete: unknown }).delete === "function") {
        const infoDict = info as {
          delete: (key: PDFName) => void;
          has?: (key: PDFName) => boolean;
        };
        if (loaded.snapshot.creationDate) {
          infoDict.delete(PDFName.of("CreationDate"));
          stripped.push("CreationDate");
        }
        if (loaded.snapshot.modificationDate) {
          infoDict.delete(PDFName.of("ModDate"));
          stripped.push("ModDate");
        }
      }

      // Strip the XMP metadata stream from the document catalog.
      // pdf-lib doesn't expose a high-level setter here; we reach into
      // the catalog dict and delete the `/Metadata` entry. Viewers that
      // were preferring XMP over /Info will now have no XMP to read,
      // and /Info is already blanked, so metadata is effectively gone.
      const catalog = doc.catalog;
      if (catalog.has(PDFName.of("Metadata"))) {
        catalog.delete(PDFName.of("Metadata"));
        stripped.push("XMP stream");
      }

      const bytes = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
      const name = deriveOutputName(loaded.file.name, "-scrubbed");
      setResult({ bytes, name, size: bytes.length, strippedFields: stripped });

      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "remove-metadata",
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
      setError(err instanceof Error ? err.message : "Remove metadata failed.");
    } finally {
      setBusy(false);
    }
  };

  const snap = loaded?.snapshot;

  const carriedRows = snap
    ? [
        ["Title", snap.title],
        ["Author", snap.author],
        ["Subject", snap.subject],
        ["Keywords", snap.keywords],
        ["Creator", snap.creator],
        ["Producer", snap.producer],
        ["Created", snap.creationDate],
        ["Modified", snap.modificationDate],
        ["XMP metadata", snap.hadXmp ? "present" : null],
      ].filter(([, v]) => v !== null && v !== "")
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!loaded ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF to scrub metadata"
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
                {humanSize(loaded.file.size)} · {carriedRows.length} metadata field
                {carriedRows.length === 1 ? "" : "s"} to remove
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

          {carriedRows.length === 0 ? (
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 14, marginBottom: 4 }}>
                No document-level metadata detected
              </div>
              <div className="subtle" style={{ fontSize: 12 }}>
                This PDF carries no Title, Author, Subject, Keywords, Creator,
                Producer, dates, or XMP stream. Nothing to remove.
              </div>
            </div>
          ) : (
            <div
              className="card"
              style={{
                padding: 0,
                overflow: "hidden",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <tbody>
                  {carriedRows.map(([k, v]) => (
                    <tr key={k as string} style={{ borderTop: "1px solid var(--border)" }}>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "8px 12px",
                          width: 140,
                          fontWeight: 500,
                          color: "var(--fg-subtle)",
                          background: "var(--bg-2)",
                        }}
                      >
                        {k}
                      </th>
                      <td
                        style={{
                          padding: "8px 12px",
                          fontFamily: "var(--font-mono), ui-monospace, monospace",
                          wordBreak: "break-word",
                        }}
                      >
                        {v as string}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
                Metadata scrubbed
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                Removed: {result.strippedFields.length === 0 ? "nothing" : result.strippedFields.join(", ")} ·{" "}
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
          disabled={!loaded || busy || carriedRows.length === 0}
          onClick={run}
        >
          {busy ? "Scrubbing…" : "Remove metadata"}
        </button>
      </div>
    </div>
  );
}

function hasXmpMetadata(doc: PDFDocument): boolean {
  try {
    return doc.catalog.has(PDFName.of("Metadata"));
  } catch {
    return false;
  }
}
