"use client";

import { useRef, useState, type ReactNode } from "react";
import { I } from "@/components/icons/Icons";
import { isPdfFile, MAX_FILE_SIZE_BYTES, PDF_ACCEPT, humanSize } from "@/lib/client/pdf-utils";

type ToolDropzoneProps = {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  /** Optional override for the hint text under the prompt. */
  hint?: ReactNode;
  /** Override the primary call-to-action label (default: "Drop a PDF here or click to browse"). */
  prompt?: string;
};

export function ToolDropzone({
  onFiles,
  multiple = false,
  disabled = false,
  hint,
  prompt,
}: ToolDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * M4 (#193, 2026-04-28): soft notice when the user drops multiple
   * files into a single-file tool. We still take files[0] (preserves
   * existing behavior), but tell the user we ignored the rest so
   * they don't end up confused why "only one of my PDFs got
   * watermarked." Clears on next drop or after 6 seconds.
   */
  const [notice, setNotice] = useState<string | null>(null);

  function handleList(list: FileList | File[]) {
    setError(null);
    setNotice(null);
    const files = Array.from(list);
    if (files.length === 0) return;

    for (const f of files) {
      if (!isPdfFile(f)) {
        setError(`"${f.name}" — only PDF files are supported.`);
        return;
      }
      if (f.size > MAX_FILE_SIZE_BYTES) {
        setError(`"${f.name}" exceeds the ${humanSize(MAX_FILE_SIZE_BYTES)} limit.`);
        return;
      }
    }

    // M4: surface the multi-file → single-file truncation explicitly.
    if (!multiple && files.length > 1) {
      setNotice(
        `Took the first PDF (${files[0]!.name}). This tool processes one file at a time — drop the rest separately.`,
      );
      // Auto-clear after 6s so the notice doesn't persist forever.
      setTimeout(() => setNotice(null), 6000);
    }

    onFiles(multiple ? files : [files[0]!]);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer?.files) handleList(e.dataTransfer.files);
        }}
        onClick={() => {
          if (disabled) return;
          inputRef.current?.click();
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        style={{
          border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border-strong)"}`,
          borderRadius: "var(--radius-lg)",
          padding: "40px 24px",
          textAlign: "center",
          background: dragOver ? "var(--accent-soft)" : "var(--bg-1)",
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "background 150ms, border-color 150ms",
          opacity: disabled ? 0.55 : 1,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "var(--bg-2)",
            display: "grid",
            placeItems: "center",
            margin: "0 auto 12px",
            color: dragOver ? "var(--accent)" : "var(--fg-subtle)",
          }}
        >
          <I.Upload size={20} />
        </div>
        <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>
          {prompt ?? (multiple ? "Drop PDFs here or click to browse" : "Drop a PDF here or click to browse")}
        </p>
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          {hint ?? (
            <>
              Up to {humanSize(MAX_FILE_SIZE_BYTES)}
              {multiple ? " each" : ""} · processed privately in your browser.
            </>
          )}
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={PDF_ACCEPT}
          multiple={multiple}
          hidden
          onChange={(e) => {
            if (e.target.files) handleList(e.target.files);
          }}
        />
      </div>

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, marginTop: 12 }}>
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          aria-live="polite"
          style={{
            color: "var(--fg-muted)",
            fontSize: 13,
            marginTop: 12,
            padding: "8px 12px",
            background: "var(--bg-2)",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
          }}
        >
          {notice}
        </p>
      )}
    </div>
  );
}
