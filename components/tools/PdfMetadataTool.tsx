"use client";

// PdfMetadataTool — Tier 1 §1.8 P1 (combines Metadata Editor + Remove
// Metadata from the catalog into one tool with an "erase all" switch).
//
// Read and optionally edit the six canonical PDF metadata fields:
// Title, Author, Subject, Keywords, Creator, Producer. Ship with an
// "Erase all metadata" one-click for privacy-minded users sharing a
// redacted PDF. All client-side via pdf-lib — no upload.

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

type Loaded = {
  file: File;
  doc: PDFDocument;
  pageCount: number;
};

type Fields = {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
};

const EMPTY_FIELDS: Fields = {
  title: "",
  author: "",
  subject: "",
  keywords: "",
  creator: "",
  producer: "",
};

export function PdfMetadataTool() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    bytes: Uint8Array;
    name: string;
    size: number;
    action: "save" | "erase";
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
      setLoaded({ file: f, doc, pageCount: doc.getPageCount() });
      setFields({
        title: doc.getTitle() ?? "",
        author: doc.getAuthor() ?? "",
        subject: doc.getSubject() ?? "",
        keywords: (doc.getKeywords() ?? "").toString(),
        creator: doc.getCreator() ?? "",
        producer: doc.getProducer() ?? "",
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
    setFields(EMPTY_FIELDS);
    setError(null);
    setResult(null);
  };

  const save = async (mode: "save" | "erase") => {
    if (!loaded) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      // Reload a fresh copy — pdf-lib's setters mutate the loaded doc,
      // which would persist across multiple save clicks.
      const doc = await PDFDocument.load(await loaded.file.arrayBuffer(), {
        ignoreEncryption: true,
      });
      const applied = mode === "erase" ? EMPTY_FIELDS : fields;

      // pdf-lib setters accept strings; empty string clears the entry.
      doc.setTitle(applied.title);
      doc.setAuthor(applied.author);
      doc.setSubject(applied.subject);
      // Keywords: pdf-lib accepts a string[] or string — normalize here.
      doc.setKeywords(
        applied.keywords
          ? applied.keywords.split(",").map((k) => k.trim()).filter(Boolean)
          : []
      );
      doc.setCreator(applied.creator);
      doc.setProducer(applied.producer);

      if (mode === "erase") {
        // Also clear the creation/modification dates — PDF/A-style scrub.
        // Setting to epoch zero is the cleanest cross-reader signal.
        doc.setCreationDate(new Date(0));
        doc.setModificationDate(new Date(0));
      }

      const bytes = await doc.save({ useObjectStreams: true });
      const suffix = mode === "erase" ? "-metadata-removed" : "-metadata-edited";
      const name = deriveOutputName(loaded.file.name, suffix);
      setResult({ bytes, name, size: bytes.length, action: mode });

      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "pdf-metadata",
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
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setBusy(false);
    }
  };

  const F = (key: keyof Fields, label: string, placeholder?: string) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
      <input
        type="text"
        value={fields[key]}
        placeholder={placeholder ?? `(empty)`}
        disabled={busy}
        onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
        style={{
          padding: "10px 12px",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border-strong)",
          background: "var(--bg-1)",
          color: "var(--fg)",
          fontSize: 14,
        }}
      />
    </label>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!loaded ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF to view or edit metadata"
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
                {loaded.pageCount === 1 ? "" : "s"}
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
              padding: 20,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 14,
            }}
          >
            {F("title", "Title")}
            {F("author", "Author")}
            {F("subject", "Subject")}
            {F("keywords", "Keywords", "comma, separated, values")}
            {F("creator", "Creator")}
            {F("producer", "Producer")}
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
                {result.action === "erase"
                  ? "Metadata stripped"
                  : "Metadata updated"}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
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

      {loaded && (
        <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => save("erase")}
          >
            Erase all metadata
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => save("save")}
          >
            {busy ? "Saving…" : "Save & download"}
          </button>
        </div>
      )}
    </div>
  );
}
