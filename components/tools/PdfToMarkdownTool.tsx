"use client";

// PdfToMarkdownTool — Tier 1 §1.4 P1.
//
// Heuristic PDF → Markdown conversion using pdfjs text content.
// The catalog lists this as AI-gated; we ship a credible heuristic
// version for FREE (no AI credits) that works well for well-typeset
// documents:
//   - Detect font sizes across all text runs; top 2-3 sizes map to
//     # H1 / ## H2 / ### H3.
//   - Join runs on the same line (close y-coordinate).
//   - Separate paragraphs by blank lines when vertical gap exceeds
//     the typical line-height.
//   - Detect bold font (name contains "Bold" or "Black") → wrap in
//     **...**.
//   - Leave plain text as-is; don't invent formatting we can't
//     prove (no italics-by-default, no table detection).
//
// Not AI, so the output won't be perfect for everything — tables,
// multi-column layouts, and figures still lose fidelity. Users who
// need higher-quality output should use the paid AI · Rewrite
// tool chained with the OCR layer.

import { useState, useCallback } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import {
  deriveOutputName,
  downloadBytes,
  humanSize,
  sha256HexOfBytes,
} from "@/lib/client/pdf-utils";
import { logToolResultAction } from "@/lib/tool-result-actions";

export function PdfToMarkdownTool() {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setMarkdown(null);
    setBusy(true);
    try {
      const buffer = await f.arrayBuffer();
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs-worker.min.mjs";
      }
      const doc = await pdfjs.getDocument({ data: buffer.slice(0) }).promise;

      // First pass: collect every text item's font size across all
      // pages to compute heading thresholds.
      const allSizes: number[] = [];
      const pagesRaw: Array<
        Array<{ str: string; fontSize: number; bold: boolean; x: number; y: number }>
      > = [];

      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        const styles = (content as { styles?: Record<string, { fontFamily?: string }> })
          .styles ?? {};
        const items: typeof pagesRaw[number] = [];
        for (const item of content.items) {
          if (!("str" in item) || typeof item.str !== "string") continue;
          const t = (item as { transform?: number[] }).transform ?? [];
          const [, , , d = 0, e = 0, y = 0] = t;
          const fontSize = Math.round(Math.abs(d) || 12);
          const fontRef = (item as { fontName?: string }).fontName ?? "";
          const fontName = styles[fontRef]?.fontFamily ?? fontRef;
          const bold = /bold|black|heavy/i.test(fontName);
          if (item.str.trim()) allSizes.push(fontSize);
          items.push({ str: item.str, fontSize, bold, x: e, y });
        }
        pagesRaw.push(items);
      }

      // Heading size thresholds: bucket sizes, pick the body size
      // (most common), then anything ≥1.3× body → H3, ≥1.6× → H2,
      // ≥2× → H1.
      const sizeHist = new Map<number, number>();
      for (const s of allSizes) sizeHist.set(s, (sizeHist.get(s) ?? 0) + 1);
      const bodySize =
        Array.from(sizeHist.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12;
      const threshH3 = bodySize * 1.25;
      const threshH2 = bodySize * 1.6;
      const threshH1 = bodySize * 2.0;

      const headingLevel = (size: number): 1 | 2 | 3 | 0 => {
        if (size >= threshH1) return 1;
        if (size >= threshH2) return 2;
        if (size >= threshH3) return 3;
        return 0;
      };

      // Build output per page, separating pages with two blank lines.
      const out: string[] = [];
      for (let p = 0; p < pagesRaw.length; p++) {
        const items = pagesRaw[p];
        // Group items into lines by y-coordinate (within 2pt = same line).
        const lines: Array<{ y: number; size: number; pieces: Array<{ str: string; bold: boolean }> }> = [];
        for (const it of items) {
          if (!it.str.trim() && lines.length === 0) continue;
          const last = lines[lines.length - 1];
          if (last && Math.abs(last.y - it.y) < 2) {
            // Same visual line.
            last.pieces.push({ str: it.str, bold: it.bold });
            last.size = Math.max(last.size, it.fontSize);
          } else {
            lines.push({ y: it.y, size: it.fontSize, pieces: [{ str: it.str, bold: it.bold }] });
          }
        }
        // Sort by y DESC (top of page first — pdfjs uses bottom-origin
        // in transform, so higher y = top).
        lines.sort((a, b) => b.y - a.y);

        let prevY: number | null = null;
        for (const line of lines) {
          const text = line.pieces
            .map((p) => {
              const clean = p.str;
              if (!clean.trim()) return clean;
              return p.bold && !/^[\s]+$/.test(clean) ? `**${clean}**` : clean;
            })
            .join("")
            .replace(/\s+/g, " ")
            .trim();
          if (!text) continue;

          // Paragraph break: vertical gap greater than 1.8× line-height.
          if (prevY !== null && Math.abs(prevY - line.y) > bodySize * 1.8) {
            out.push("");
          }

          const hl = headingLevel(line.size);
          if (hl === 1) out.push(`# ${text}`);
          else if (hl === 2) out.push(`## ${text}`);
          else if (hl === 3) out.push(`### ${text}`);
          else out.push(text);

          prevY = line.y;
        }

        if (p < pagesRaw.length - 1) {
          out.push("");
          out.push("---");
          out.push("");
        }
      }

      // Collapse runs of 3+ blank lines to 2.
      const joined = out.join("\n").replace(/\n{3,}/g, "\n\n");
      setMarkdown(joined);
      setSourceName(f.name);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error && /encrypted|password/i.test(err.message)
          ? "This PDF is password-protected. Unlock it first."
          : "Couldn't read that PDF. It may be corrupt or image-only (try AI · OCR first)."
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const reset = () => {
    setMarkdown(null);
    setSourceName("");
    setError(null);
  };

  const download = async () => {
    if (!markdown) return;
    const bytes = new TextEncoder().encode(markdown);
    const name = deriveOutputName(sourceName, "").replace(/\.pdf$/i, ".md");
    downloadBytes(bytes, name, "text/markdown;charset=utf-8");
    try {
      const sha256 = await sha256HexOfBytes(bytes);
      await logToolResultAction({
        toolId: "pdf-to-markdown",
        name,
        mime: "text/markdown",
        sizeBytes: bytes.length,
        sha256,
      });
    } catch (e) {
      console.warn(e);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {markdown === null ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF to convert to Markdown"
        />
      ) : (
        <div
          className="card"
          style={{ padding: 20, borderColor: "var(--accent)", background: "var(--accent-soft)" }}
        >
          <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--accent)", color: "var(--bg-1)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <I.Check size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15 }}>Converted to Markdown</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {humanSize(new TextEncoder().encode(markdown).length)} · {markdown.split("\n").length} lines
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={download}>
              <I.Download size={14} />
              <span>Download .md</span>
            </button>
          </div>
          <pre
            style={{
              marginTop: 16,
              padding: 12,
              background: "var(--bg-1)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              fontFamily: "var(--font-mono), ui-monospace, monospace",
              fontSize: 12,
              lineHeight: 1.5,
              maxHeight: 320,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {markdown.length > 5000 ? markdown.slice(0, 5000) + "\n\n… (preview truncated — download for full content)" : markdown}
          </pre>
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{error}</p>
      )}

      {markdown && (
        <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={reset}>
            Start over
          </button>
        </div>
      )}
    </div>
  );
}
