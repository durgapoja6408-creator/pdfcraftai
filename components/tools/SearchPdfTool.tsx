"use client";

// components/tools/SearchPdfTool.tsx
//
// Build 2 Wave 3 (2026-04-27): full-text search across a PDF.
// Different shape from the conversion tools — there's a query
// input alongside the dropzone. User can re-search the same PDF
// with different queries without re-uploading.

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import type { SearchMatch, SearchResult } from "@/lib/pdf/ops/search-text";

type LoadStage = "idle" | "loading-engine" | "searching" | "done";

export function SearchPdfTool() {
  const tracker = useTrackToolView("pdf-search", "Organize");
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [stage, setStage] = useState<LoadStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const queryInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus the query input once a file is loaded.
  useEffect(() => {
    if (file && !result && queryInputRef.current) {
      queryInputRef.current.focus();
    }
  }, [file, result]);

  const onFiles = useCallback(
    async (files: File[]) => {
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
      // Cache the bytes once so re-searches don't re-read the file.
      try {
        const buf = new Uint8Array(await f.arrayBuffer());
        setBytes(buf);
      } catch {
        setError("Could not read the file. Try again.");
      }
    },
    [tracker],
  );

  const run = async () => {
    if (!bytes) return;
    if (!query.trim()) {
      setError("Enter a query to search for.");
      return;
    }
    setError(null);
    setResult(null);
    setStage("loading-engine");
    const t0 = performance.now();
    try {
      const { searchPdfText } = await import("@/lib/pdf/ops/search-text");
      setStage("searching");
      const r = await searchPdfText(bytes, query, {
        caseSensitive,
        wholeWord,
        maxMatches: 200,
      });
      setResult(r);
      setStage("done");
      tracker.success({
        creditCost: 0,
        pageCount: r.totalPages,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("pdf-search failed", err);
      const msg =
        err instanceof Error ? err.message : "Could not read the PDF. Is it valid?";
      setError(msg);
      setStage("idle");
      tracker.error({
        errorCode:
          err instanceof Error && /pdfium|wasm/i.test(err.message)
            ? "engine_load"
            : "search_failed",
      });
    }
  };

  const reset = () => {
    setFile(null);
    setBytes(null);
    setQuery("");
    setError(null);
    setResult(null);
    setStage("idle");
  };

  const truncateFilename = (name: string, max = 48) => {
    if (name.length <= max) return name;
    const ext = name.lastIndexOf(".");
    if (ext < 0) return `${name.slice(0, max - 1)}…`;
    const base = name.slice(0, ext);
    const extension = name.slice(ext);
    const keep = max - extension.length - 1;
    return `${base.slice(0, Math.max(8, keep))}…${extension}`;
  };

  const busy = stage === "loading-engine" || stage === "searching";

  // Group matches by page for the result display.
  const matchesByPage = result
    ? result.matches.reduce<Record<number, SearchMatch[]>>((acc, m) => {
        (acc[m.pageNumber] ||= []).push(m);
        return acc;
      }, {})
    : {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt="Drop a PDF to search inside it"
          hint="Up to 100 MB · runs privately in your browser via Google PDFium"
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
                {truncateFilename(file.name)}
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

      {/* Query input + options. Visible after a file is loaded. */}
      {file && (
        <div className="card" style={{ padding: 14 }}>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <I.Search size={14} style={{ color: "var(--fg-subtle)", flexShrink: 0 }} />
            <input
              ref={queryInputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) run();
              }}
              placeholder="Type a word or phrase…"
              aria-label="Search query"
              disabled={busy}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--fg)",
                fontSize: 14,
                padding: "4px 0",
              }}
            />
          </div>
          <div
            className="row"
            style={{
              gap: 14,
              fontSize: 12,
              marginTop: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <label
              className="row"
              style={{ gap: 5, alignItems: "center", cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                disabled={busy}
              />
              <span className="muted">Case-sensitive</span>
            </label>
            <label
              className="row"
              style={{ gap: 5, alignItems: "center", cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={wholeWord}
                onChange={(e) => setWholeWord(e.target.checked)}
                disabled={busy}
              />
              <span className="muted">Whole word</span>
            </label>
            <span className="subtle" style={{ marginLeft: "auto", fontSize: 11 }}>
              Press Enter to search
            </span>
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
          style={{
            padding: 16,
            background: "var(--bg-1)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span
            className="pulse-soft"
            style={{ color: "var(--accent)", display: "inline-flex" }}
          >
            <I.Sparkle size={16} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {stage === "loading-engine" ? "Loading PDFium engine…" : "Searching…"}
            </div>
            {stage === "loading-engine" && (
              <div className="subtle" style={{ fontSize: 11, marginTop: 2 }}>
                One-time download (~3.8 MB) · cached for next time
              </div>
            )}
          </div>
        </div>
      )}

      {result && (
        <div
          className="card"
          style={{ padding: 0, overflow: "hidden" }}
          role="status"
          aria-live="polite"
          aria-label={`Found ${result.matches.length} matches`}
        >
          <div
            style={{
              padding: "16px 24px",
              borderBottom: "1px solid var(--border)",
              fontSize: 14,
            }}
          >
            <strong>{result.matches.length}</strong>{" "}
            match{result.matches.length === 1 ? "" : "es"} on{" "}
            <strong>{result.pagesWithMatches}</strong> of {result.totalPages} page
            {result.totalPages === 1 ? "" : "s"}
            {result.truncated && (
              <span className="subtle" style={{ fontSize: 12, marginLeft: 8 }}>
                (showing first 200 — refine your query for fewer results)
              </span>
            )}
          </div>

          {result.matches.length === 0 ? (
            <div
              style={{
                padding: "24px 24px",
                textAlign: "center",
                fontSize: 13,
              }}
              className="muted"
            >
              No matches. Try a shorter query or untick &ldquo;Whole word&rdquo; /
              &ldquo;Case-sensitive&rdquo;.
            </div>
          ) : (
            <div
              style={{
                padding: "8px 0",
                maxHeight: 480,
                overflowY: "auto",
              }}
            >
              {Object.entries(matchesByPage).map(([pageStr, pageMatches]) => (
                <div
                  key={pageStr}
                  style={{
                    padding: "10px 24px",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <div
                    className="mono subtle"
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.05em",
                      marginBottom: 8,
                    }}
                  >
                    PAGE {pageStr} · {pageMatches.length} match
                    {pageMatches.length === 1 ? "" : "es"}
                  </div>
                  <ul
                    style={{
                      margin: 0,
                      padding: 0,
                      listStyle: "none",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    {pageMatches.map((m, i) => (
                      <li
                        key={i}
                        style={{
                          fontSize: 13,
                          lineHeight: 1.6,
                          fontFamily: "var(--mono, monospace)",
                          color: "var(--fg-muted)",
                        }}
                      >
                        …{m.beforeContext}
                        <mark
                          style={{
                            background: "var(--accent-soft)",
                            color: "var(--accent)",
                            padding: "1px 3px",
                            borderRadius: 3,
                            fontWeight: 500,
                          }}
                        >
                          {m.match}
                        </mark>
                        {m.afterContext}…
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setResult(null);
                setQuery("");
                queryInputRef.current?.focus();
              }}
            >
              New search
            </button>
            <button type="button" className="btn btn-primary" onClick={reset}>
              Search another PDF
            </button>
          </>
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
              disabled={!file || busy || !query.trim()}
              onClick={run}
            >
              {busy ? "Searching…" : "Search PDF"}
            </button>
          </>
        )}
      </div>

      {!file && !busy && (
        <div
          className="card"
          style={{
            padding: 14,
            background: "var(--bg-1)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 13,
          }}
        >
          <span style={{ color: "var(--fg-subtle)" }}>
            <I.Search size={16} />
          </span>
          <div style={{ flex: 1, color: "var(--fg-muted)" }}>
            Searching scans? Run{" "}
            <Link
              href="/tool/ai-searchable-pdf"
              style={{
                color: "var(--accent)",
                textDecoration: "underline",
                textDecorationStyle: "dotted",
                textUnderlineOffset: 3,
              }}
            >
              Make PDF Searchable
            </Link>{" "}
            first to OCR scanned pages — otherwise there&apos;s no text for us
            to find.
          </div>
        </div>
      )}
    </div>
  );
}
