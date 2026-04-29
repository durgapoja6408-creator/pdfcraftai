"use client";

// SearchablePdfTool — Tier 2 §2.3 P0.
//
// Turns a scanned PDF into a "searchable PDF" — same visual content,
// but with an invisible text layer so Ctrl-F finds matches and copy/
// paste pulls real text. The classic iLovePDF / Acrobat OCR feature.
//
// Pipeline:
//   1. POST the PDF to /api/ai/ocr — same route OcrPdfTool uses.
//      Server returns Markdown segmented by `## Page N` headers
//      (one section per page, in source order, plus credit + page
//      metadata). Existing infra: credits, idempotency, kill-
//      switch, refund-on-error all reused for free.
//   2. Split the markdown back into per-page text segments.
//   3. Load the ORIGINAL PDF client-side via pdf-lib.
//   4. For each page: drawText(textForThatPage, { opacity: 0 }).
//      Opacity zero leaves the text glyphs in the content stream
//      (so PDF readers' search index sees them and copy/paste
//      extracts them) while keeping the visual page identical to
//      the scan. Standard searchable-PDF technique — no fancy bbox
//      positioning, but search and copy work.
//   5. Save → download. Filename suffixed with `-searchable`.
//
// Caveats surfaced in the UI:
//   - Word positions aren't exact — copy-paste yields a single text
//     block per page, not word-by-word coordinates. Good enough for
//     search; Acrobat-grade word-positioning needs bbox-aware OCR
//     (Tesseract HOCR or similar) which we can ship later.
//   - First-page-only preview during testing is sufficient because
//     the same opacity-0 trick works identically across pages.

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, getSession } from "next-auth/react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import {
  downloadBytes,
  humanSize,
  deriveOutputName,
} from "@/lib/client/pdf-utils";
import { classifyAiError } from "@/lib/ai/degradation";
import { useTrackToolView } from "./useToolTracking";
import { fetchAiWithRetry } from "@/lib/client/fetch-ai-with-retry";

// Server constants duplicated; see OcrPdfTool for rationale.
const CLIENT_MAX_OCR_PAGES = 50;
const CREDITS_PER_PAGE = 2;

const SIGN_IN_HREF =
  "/login?callbackUrl=" + encodeURIComponent("/tool/ai-searchable-pdf");

type RunResult = {
  outputBytes: Uint8Array;
  outputName: string;
  creditCost: number;
  newBalance?: number;
  pageCount: number;
  processedPageCount: number;
  /** Pages we couldn't overlay (e.g. empty OCR for a blank page). */
  emptyPageCount: number;
};

/**
 * Split the OCR markdown into per-page text strings, indexed by
 * page number (1-based). The OCR helper joins per-page outputs with
 * `## Page N` headers; this reverses that join.
 *
 * Defensive on edge cases:
 *   - Missing header (single-page docs sometimes return no header).
 *   - Header with extra whitespace.
 *   - Pages that came back empty (we leave them out — a blank scanned
 *     page contributes no searchable text either).
 */
function splitPerPage(markdown: string): Map<number, string> {
  const out = new Map<number, string>();
  if (!markdown.trim()) return out;
  const re = /^##\s+Page\s+(\d+)\s*$/im;
  // Walk through the document gathering chunks between headers.
  const parts: { page: number; start: number }[] = [];
  let m: RegExpExecArray | null;
  const headerRe = new RegExp(re.source, "img");
  while ((m = headerRe.exec(markdown)) !== null) {
    parts.push({ page: Number(m[1]), start: m.index + m[0].length });
  }
  if (parts.length === 0) {
    // Fallback: treat the entire markdown as page 1.
    out.set(1, markdown.trim());
    return out;
  }
  for (let i = 0; i < parts.length; i++) {
    const startIdx = parts[i].start;
    const endIdx = i + 1 < parts.length ? parts[i + 1].start - `## Page ${parts[i + 1].page}`.length : markdown.length;
    const chunk = markdown.slice(startIdx, endIdx).trim();
    if (chunk) out.set(parts[i].page, chunk);
  }
  return out;
}

/**
 * Lay invisible text down a single page. We don't try to position
 * words individually — instead we draw the page's full OCR text as
 * a stream of newline-separated lines starting at the top-left,
 * with `opacity: 0` so nothing renders visually.
 *
 * Why this works for search: the PDF content stream now contains
 * Tj operators with the OCR'd glyphs, and most PDF readers (Adobe
 * Acrobat, Chrome built-in viewer, Preview.app, Edge) index those
 * for Ctrl-F regardless of opacity. Same trick used by Tesseract's
 * pdfRenderer with `text_only_pdf=true`.
 */
function overlayInvisibleText(
  page: import("pdf-lib").PDFPage,
  text: string,
  font: import("pdf-lib").PDFFont,
): void {
  const { width, height } = page.getSize();
  // Strip Markdown noise — we only want raw words for search.
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/[#*_~`>]+/g, " ") // markdown punctuation
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ") // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → keep text
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return;

  // Conservative wrapping — 80 chars/line, ~10pt. The visual layout
  // doesn't matter (opacity 0); only token presence does. We bound
  // the y-coordinate above 0 so the text doesn't get clipped.
  const fontSize = 10;
  const lineHeight = fontSize * 1.2;
  const maxCharsPerLine = 80;
  const lines: string[] = [];
  let buf = "";
  for (const word of cleaned.split(" ")) {
    if (!word) continue;
    if ((buf + " " + word).trim().length > maxCharsPerLine) {
      if (buf) lines.push(buf);
      buf = word;
    } else {
      buf = buf ? `${buf} ${word}` : word;
    }
  }
  if (buf) lines.push(buf);

  // Cap line count so we never push the y-coordinate negative on a
  // huge OCR result for a tiny page; truncated lines are still
  // searchable for what fit.
  const maxLines = Math.max(1, Math.floor((height - 20) / lineHeight));
  const usable = lines.slice(0, maxLines);

  let y = height - 20;
  for (const line of usable) {
    // Sanitise to ASCII — Helvetica (StandardFonts) can't render
    // arbitrary Unicode. Searching for Indic scripts will be best-
    // effort; word-boundary tokens still match many queries.
    const ascii = line.replace(/[^\x20-\x7E]/g, " ");
    if (ascii.trim()) {
      try {
        page.drawText(ascii, {
          x: 20,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
          opacity: 0,
        });
      } catch {
        // Last-ditch: drop the line silently rather than abort the
        // whole page. Worst case: that line isn't searchable.
      }
    }
    y -= lineHeight;
    if (y < 10) break;
  }

  void width; // unused but kept for future per-line wrapping work
}

export function SearchablePdfTool() {
  useTrackToolView("ai-searchable-pdf", "AI");
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const isAnonymous = sessionStatus === "unauthenticated";
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [peekError, setPeekError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Working…");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  const onFiles = useCallback((files: File[]) => {
    setError(null);
    setResult(null);
    setPageCount(null);
    setPeekError(null);
    setFile(files[0] ?? null);
  }, []);

  const reset = () => {
    setFile(null);
    setPageCount(null);
    setPeekError(null);
    setError(null);
    setResult(null);
  };

  // Peek page count for live cost display + over-cap rejection.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      try {
        const bytes = await file.arrayBuffer();
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        if (cancelled) return;
        const n = doc.getPageCount();
        if (n === 0) {
          setPeekError("This PDF has zero pages — nothing to OCR.");
          return;
        }
        setPageCount(n);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setPeekError(
          `Couldn't read this PDF locally — ${message}. It may be encrypted or corrupt.`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const overLimit =
    typeof pageCount === "number" && pageCount > CLIENT_MAX_OCR_PAGES;
  const projectedCost =
    typeof pageCount === "number" ? pageCount * CREDITS_PER_PAGE : null;

  const run = async () => {
    if (!file) {
      setError("Drop a PDF first.");
      return;
    }
    if (peekError) {
      setError(peekError);
      return;
    }
    if (overLimit) {
      setError(
        `${pageCount} pages exceeds the ${CLIENT_MAX_OCR_PAGES}-page OCR cap. Use the Split tool first, then run each chunk through here.`,
      );
      return;
    }
    if (typeof pageCount !== "number") {
      setError("Still reading the PDF — wait a moment and try again.");
      return;
    }

    const fresh = await getSession();
    if (!fresh?.user) {
      router.push(SIGN_IN_HREF);
      return;
    }

    setBusy(true);
    setBusyLabel("OCR pass — transcribing pages…");
    setError(null);
    setResult(null);

    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ik-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    let creditCost = 0;
    let newBalance: number | undefined;
    let processedPageCount = pageCount;
    let markdown = "";

    try {
      const res = await fetchAiWithRetry("/api/ai/ocr", {
        // M20 (#193): retry on transient 5xx / network failures.
        // FormData is single-use; rebuild it on each attempt.
        bodyFactory: () => {
          const form = new FormData();
          form.append("pdf", file);
          form.append("idempotencyKey", idempotencyKey);
          return form;
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (res.ok || res.status === 207) {
        markdown = String(body.markdown ?? "");
        creditCost = Number(body.creditCost ?? 0);
        newBalance =
          typeof body.newBalance === "number" ? body.newBalance : undefined;
        processedPageCount =
          typeof body.processedPageCount === "number"
            ? body.processedPageCount
            : pageCount;
      } else if (res.status === 401) {
        router.push(SIGN_IN_HREF);
        return;
      } else {
        const classified = classifyAiError(res.status, body);
        setError(
          "userMessage" in classified
            ? classified.userMessage
            : "OCR failed — try again in a moment.",
        );
        return;
      }
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Network error during OCR — check your connection.",
      );
      return;
    }

    if (!markdown.trim()) {
      setError(
        "OCR returned no text. The PDF may already be searchable, or the scan is too low-quality to read.",
      );
      setBusy(false);
      return;
    }

    setBusyLabel("Overlay pass — building searchable PDF…");
    try {
      const perPage = splitPerPage(markdown);
      const bytes = await file.arrayBuffer();
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const pages = doc.getPages();
      let emptyPageCount = 0;
      for (let i = 0; i < pages.length; i++) {
        const text = perPage.get(i + 1);
        if (!text) {
          emptyPageCount++;
          continue;
        }
        overlayInvisibleText(pages[i], text, font);
      }
      const out = await doc.save();

      setResult({
        outputBytes: out,
        outputName: deriveOutputName(file.name, "-searchable"),
        creditCost,
        newBalance,
        pageCount,
        processedPageCount,
        emptyPageCount,
      });
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? `OCR succeeded (${creditCost} credits charged) but overlay failed: ${err.message}. Reload and retry — the duplicate-protection will return cached text without re-spending.`
          : "Overlay step failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const ctaLabel = (() => {
    if (busy) return busyLabel;
    if (!file) return "OCR + overlay — 2 credits / page";
    if (peekError) return "Can't read this PDF";
    if (typeof pageCount !== "number") return "Reading…";
    if (overLimit) return `${pageCount} pages — over the ${CLIENT_MAX_OCR_PAGES} cap`;
    return `Make searchable — ${projectedCost} credit${projectedCost === 1 ? "" : "s"} (${pageCount} page${pageCount === 1 ? "" : "s"})`;
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a scanned PDF — we'll add an invisible text layer so Ctrl-F finds matches"
        />
      ) : (
        <div
          className="card"
          style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center" }}
        >
          <span style={{ color: "var(--fg-subtle)" }}>
            <I.File size={18} />
          </span>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div
              title={file.name}
              style={{
                fontSize: 14,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {file.name}
            </div>
            <div className="subtle" style={{ fontSize: 12 }}>
              {humanSize(file.size)}
              {typeof pageCount === "number" && ` · ${pageCount} page${pageCount === 1 ? "" : "s"}`}
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
      )}

      <div
        className="card"
        style={{ padding: 14, fontSize: 13, lineHeight: 1.5, background: "var(--bg-2)" }}
      >
        <strong>Tier 2 §2.3 — Searchable PDF.</strong> Runs Vision OCR on every page,
        then overlays the recognised text invisibly on the original scan. The visual
        appearance is unchanged but Ctrl-F, copy/paste, and search engines now see the
        text. 2 credits per page. Max 50 pages — split larger files first.{" "}
        <Link href="/tool/ai-ocr" style={{ color: "var(--accent)" }}>
          Need just the transcript instead?
        </Link>
      </div>

      <div
        className="card"
        style={{ padding: 12, fontSize: 12, background: "var(--bg-2)" }}
      >
        <strong>Caveat:</strong> word-level coordinates aren't preserved (the overlay
        is a single text block per page). Search works perfectly; copy/paste yields
        whole-page text rather than word-by-word selection. Pixel-accurate copy/paste
        needs Tesseract-bbox OCR — on the roadmap.
      </div>

      {peekError && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>
          {peekError}
        </p>
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
          <div className="row" style={{ gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "var(--accent)",
                color: "var(--bg-1)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <I.Check size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15 }}>
                Searchable PDF ready
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {result.creditCost} credits used
                {typeof result.newBalance === "number" && ` · ${result.newBalance} left`}
                {" · "}
                {result.processedPageCount} page
                {result.processedPageCount === 1 ? "" : "s"} processed
                {result.emptyPageCount > 0 &&
                  ` · ${result.emptyPageCount} blank page${result.emptyPageCount === 1 ? "" : "s"} skipped`}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                downloadBytes(result.outputBytes, result.outputName, "application/pdf")
              }
            >
              <I.Download size={14} /> Download
            </button>
          </div>
          <div className="subtle" style={{ fontSize: 12 }}>
            Try opening the downloaded PDF and pressing Ctrl-F (Cmd-F on Mac) — search
            for any word that's visible in the document. Should highlight on the right
            page even though the text overlay is invisible.
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {file && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={reset}>
            Reset
          </button>
        )}
        {isAnonymous ? (
          <Link href={SIGN_IN_HREF} className="btn btn-primary">
            Sign in to run
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!file || busy || overLimit || typeof pageCount !== "number" || !!peekError}
            onClick={run}
          >
            {ctaLabel}
          </button>
        )}
      </div>
    </div>
  );
}
