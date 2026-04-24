"use client";

// PdfToHtmlTool — Tier 1 §1.4 P1.
//
// Convert PDF to a self-contained HTML file using the same
// heuristic-heading approach as PDF→Markdown, but with inline CSS
// that produces a readable browser page:
//   - Body text in Helvetica
//   - Headings (H1-H3) detected via font-size thresholds
//   - Bold runs preserved via <strong>
//   - Pages separated by <hr>
//   - One self-contained .html file, no external deps
//
// Same limitations as Markdown: multi-column layouts, tables, and
// figures lose fidelity. Good enough for text-heavy docs.

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function PdfToHtmlTool() {
  const [html, setHtml] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setHtml(null);
    setBusy(true);
    try {
      const buffer = await f.arrayBuffer();
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs-worker.min.mjs";
      }
      const doc = await pdfjs.getDocument({ data: buffer.slice(0) }).promise;

      // Same font-size-histogram approach as PDF→Markdown.
      const allSizes: number[] = [];
      const pagesRaw: Array<
        Array<{ str: string; size: number; bold: boolean; y: number }>
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
          const [, , , d = 0, , y = 0] = t;
          const size = Math.round(Math.abs(d) || 12);
          const fontRef = (item as { fontName?: string }).fontName ?? "";
          const fontName = styles[fontRef]?.fontFamily ?? fontRef;
          const bold = /bold|black|heavy/i.test(fontName);
          if (item.str.trim()) allSizes.push(size);
          items.push({ str: item.str, size, bold, y });
        }
        pagesRaw.push(items);
      }

      const sizeHist = new Map<number, number>();
      for (const s of allSizes) sizeHist.set(s, (sizeHist.get(s) ?? 0) + 1);
      const bodySize =
        Array.from(sizeHist.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12;

      const title = f.name.replace(/\.pdf$/i, "");
      const out: string[] = [];
      out.push(
        `<!DOCTYPE html>`,
        `<html lang="en">`,
        `<head>`,
        `<meta charset="utf-8">`,
        `<title>${escapeHtml(title)}</title>`,
        `<style>`,
        `  body { font-family: Helvetica, Arial, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #222; }`,
        `  h1 { font-size: 2em; margin-top: 1.5em; }`,
        `  h2 { font-size: 1.5em; margin-top: 1.3em; }`,
        `  h3 { font-size: 1.2em; margin-top: 1.2em; }`,
        `  p { margin: 0.6em 0; }`,
        `  hr { border: none; border-top: 1px solid #ddd; margin: 2.5em 0; }`,
        `  strong { font-weight: 600; }`,
        `</style>`,
        `</head>`,
        `<body>`,
        `<h1>${escapeHtml(title)}</h1>`
      );

      for (let p = 0; p < pagesRaw.length; p++) {
        const items = pagesRaw[p];
        const lines: Array<{ y: number; size: number; pieces: Array<{ str: string; bold: boolean }> }> = [];
        for (const it of items) {
          const last = lines[lines.length - 1];
          if (last && Math.abs(last.y - it.y) < 2) {
            last.pieces.push({ str: it.str, bold: it.bold });
            last.size = Math.max(last.size, it.size);
          } else {
            lines.push({ y: it.y, size: it.size, pieces: [{ str: it.str, bold: it.bold }] });
          }
        }
        lines.sort((a, b) => b.y - a.y);

        let prevY: number | null = null;
        // Group consecutive non-heading lines into a single paragraph.
        let paragraphBuf: string[] = [];
        const flushPara = () => {
          if (paragraphBuf.length > 0) {
            out.push(`<p>${paragraphBuf.join(" ")}</p>`);
            paragraphBuf = [];
          }
        };

        for (const line of lines) {
          const inner = line.pieces
            .map((p) => {
              const clean = escapeHtml(p.str);
              return p.bold && p.str.trim() ? `<strong>${clean}</strong>` : clean;
            })
            .join("")
            .replace(/\s+/g, " ")
            .trim();
          if (!inner) continue;

          const isH1 = line.size >= bodySize * 2.0;
          const isH2 = !isH1 && line.size >= bodySize * 1.6;
          const isH3 = !isH1 && !isH2 && line.size >= bodySize * 1.25;

          // Paragraph break: large vertical gap.
          if (prevY !== null && Math.abs(prevY - line.y) > bodySize * 1.8) {
            flushPara();
          }

          if (isH1 || isH2 || isH3) {
            flushPara();
            const tag = isH1 ? "h1" : isH2 ? "h2" : "h3";
            out.push(`<${tag}>${inner}</${tag}>`);
          } else {
            paragraphBuf.push(inner);
          }
          prevY = line.y;
        }
        flushPara();

        if (p < pagesRaw.length - 1) {
          out.push("<hr>");
        }
      }

      out.push(`</body>`, `</html>`);
      setHtml(out.join("\n"));
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
    setHtml(null);
    setSourceName("");
    setError(null);
  };

  const download = async () => {
    if (!html) return;
    const bytes = new TextEncoder().encode(html);
    const name = deriveOutputName(sourceName, "").replace(/\.pdf$/i, ".html");
    downloadBytes(bytes, name, "text/html;charset=utf-8");
    try {
      const sha256 = await sha256HexOfBytes(bytes);
      await logToolResultAction({
        toolId: "pdf-to-html",
        name,
        mime: "text/html",
        sizeBytes: bytes.length,
        sha256,
      });
    } catch (e) {
      console.warn(e);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {html === null ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF to convert to HTML"
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
              <div style={{ fontWeight: 500, fontSize: 15 }}>Converted to HTML</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {humanSize(new TextEncoder().encode(html).length)} · self-contained with inline CSS
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={download}>
              <I.Download size={14} />
              <span>Download .html</span>
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
              fontSize: 11,
              lineHeight: 1.5,
              maxHeight: 240,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {html.length > 3000 ? html.slice(0, 3000) + "\n\n… (preview truncated — download for full content)" : html}
          </pre>
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{error}</p>
      )}

      {html && (
        <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={reset}>
            Start over
          </button>
        </div>
      )}
    </div>
  );
}
