"use client";

// TextToPdfTool — Tier 1 §1.3 P1.
//
// Plain text → A4/Letter/Legal PDF. Separate tool from
// Markdown→PDF because the UX, SEO, and user expectation are
// different: people searching "text to pdf" don't want to learn
// markdown syntax, they just want their .txt file wrapped into a
// clean PDF.
//
// Behaviour:
//   - Line breaks in the input are preserved (no markdown-style
//     paragraph collapsing — if you typed two lines, you get two
//     lines).
//   - Lines longer than the page-width get word-wrapped greedily.
//   - Empty lines are kept as vertical spacing.
//   - Font choice (Helvetica / Times Roman / Courier) and size
//     (9–18 pt) are user controls. Courier is popular for code
//     listings; Times for letters.
//   - Page size: A4 (default), US Letter, US Legal.

import { useState, useCallback } from "react";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { I } from "@/components/icons/Icons";
import {
  deriveOutputName,
  downloadBytes,
  humanSize,
  sha256HexOfBytes,
} from "@/lib/client/pdf-utils";
import { logToolResultAction } from "@/lib/tool-result-actions";

type FontChoice = "helvetica" | "times" | "courier";
type PageSize = "a4" | "letter" | "legal";

const PAGE_DIMS: Record<PageSize, [number, number]> = {
  a4: [595, 842],
  letter: [612, 792],
  legal: [612, 1008],
};

const FONT_STD: Record<FontChoice, StandardFonts> = {
  helvetica: StandardFonts.Helvetica,
  times: StandardFonts.TimesRoman,
  courier: StandardFonts.Courier,
};

async function renderTextToPdf(
  src: string,
  opts: {
    font: FontChoice;
    size: number;
    pageSize: PageSize;
    marginPt: number;
    title: string;
  }
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  if (opts.title.trim()) doc.setTitle(opts.title.trim());
  const font = await doc.embedFont(FONT_STD[opts.font]);

  const [pageW, pageH] = PAGE_DIMS[opts.pageSize];
  const margin = opts.marginPt;
  const lineW = pageW - margin * 2;
  const lineHeight = opts.size * 1.35;

  let page = doc.addPage([pageW, pageH]);
  let y = pageH - margin;

  const newPage = () => {
    page = doc.addPage([pageW, pageH]);
    y = pageH - margin;
  };

  const writeLine = (text: string) => {
    if (y - lineHeight < margin) newPage();
    page.drawText(text, {
      x: margin,
      y: y - opts.size,
      size: opts.size,
      font,
      color: rgb(0.05, 0.05, 0.05),
    });
    y -= lineHeight;
  };

  const wrapAndWrite = (line: string, f: PDFFont) => {
    if (line.length === 0) {
      y -= lineHeight;
      if (y < margin) newPage();
      return;
    }
    // Greedy word-wrap against lineW.
    const words = line.split(/(\s+)/);
    let buf = "";
    let bufWidth = 0;
    for (const w of words) {
      if (!w) continue;
      const ww = f.widthOfTextAtSize(w, opts.size);
      if (bufWidth + ww > lineW && buf) {
        writeLine(buf);
        if (/^\s+$/.test(w)) {
          // Skip leading whitespace on the new line.
          buf = "";
          bufWidth = 0;
          continue;
        }
        buf = w;
        bufWidth = ww;
      } else {
        buf += w;
        bufWidth += ww;
      }
    }
    if (buf.trim()) writeLine(buf);
    else if (buf) {
      // Trailing whitespace-only remnant — still advance y once.
      y -= lineHeight;
      if (y < margin) newPage();
    }
  };

  for (const rawLine of src.replace(/\r\n/g, "\n").split("\n")) {
    // Expand tabs to 4 spaces for consistent Courier alignment.
    const line = rawLine.replace(/\t/g, "    ");
    wrapAndWrite(line, font);
  }

  return await doc.save({ useObjectStreams: true });
}

export function TextToPdfTool() {
  const [src, setSrc] = useState<string>("");
  const [title, setTitle] = useState("");
  const [font, setFont] = useState<FontChoice>("helvetica");
  const [size, setSize] = useState<number>(11);
  const [pageSize, setPageSize] = useState<PageSize>("a4");
  const [margin, setMargin] = useState<number>(72);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ bytes: Uint8Array; name: string; size: number } | null>(null);

  const onUploadFile = async (f: File) => {
    setError(null);
    if (f.size > 5 * 1024 * 1024) {
      setError("Text file too large (5MB max). Split it first.");
      return;
    }
    const text = await f.text();
    setSrc(text);
    if (!title.trim()) setTitle(f.name.replace(/\.(txt|text|log)$/i, ""));
  };

  const generate = useCallback(async () => {
    if (!src.trim()) {
      setError("Paste or upload some text first.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const bytes = await renderTextToPdf(src, { font, size, pageSize, marginPt: margin, title });
      const base = title.trim() || "document";
      const outName = deriveOutputName(base.endsWith(".txt") ? base : `${base}.txt`, "").replace(/\.txt$/i, ".pdf");
      const name = outName.endsWith(".pdf") ? outName : `${outName}.pdf`;
      setResult({ bytes, name, size: bytes.length });
      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "text-to-pdf",
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
      setError(err instanceof Error ? err.message : "Render failed.");
    } finally {
      setBusy(false);
    }
  }, [src, title, font, size, pageSize, margin]);

  const inputStyle: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: "var(--radius)",
    border: "1px solid var(--border-strong)",
    background: "var(--bg-1)",
    color: "var(--fg)",
    fontSize: 14,
    width: "100%",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-subtle)" }}>TEXT CONTENT</div>
          <label className="btn btn-sm btn-ghost" style={{ cursor: "pointer" }}>
            <I.Upload size={12} />
            <span>Upload .txt</span>
            <input
              type="file"
              accept=".txt,.text,.log,text/plain"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadFile(f); }}
              style={{ display: "none" }}
            />
          </label>
        </div>
        <textarea
          value={src}
          onChange={(e) => setSrc(e.target.value)}
          rows={14}
          disabled={busy}
          placeholder="Paste or type your text here. Line breaks are preserved; long lines auto-wrap to the page width."
          style={{
            width: "100%",
            padding: 12,
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius)",
            background: "var(--bg-1)",
            color: "var(--fg)",
            fontFamily: font === "courier" ? "var(--font-mono), ui-monospace, monospace" : "inherit",
            fontSize: 13,
            lineHeight: 1.5,
            resize: "vertical",
          }}
        />
        <div className="subtle" style={{ fontSize: 11 }}>
          Line breaks preserved · long lines auto-wrap · tabs expand to 4 spaces.
        </div>
      </div>

      <div className="card" style={{ padding: 16, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--fg-subtle)" }}>TITLE (optional)</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="document" disabled={busy} style={inputStyle} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--fg-subtle)" }}>FONT</span>
          <select value={font} onChange={(e) => setFont(e.target.value as FontChoice)} disabled={busy} style={inputStyle}>
            <option value="helvetica">Helvetica (sans)</option>
            <option value="times">Times Roman (serif)</option>
            <option value="courier">Courier (monospace)</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--fg-subtle)" }}>SIZE (pt)</span>
          <input type="number" min={8} max={24} step={1} value={size} onChange={(e) => setSize(Math.max(8, Math.min(24, Number(e.target.value) || 11)))} disabled={busy} style={inputStyle} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--fg-subtle)" }}>PAGE SIZE</span>
          <select value={pageSize} onChange={(e) => setPageSize(e.target.value as PageSize)} disabled={busy} style={inputStyle}>
            <option value="a4">A4 (595 × 842 pt)</option>
            <option value="letter">US Letter (612 × 792 pt)</option>
            <option value="legal">US Legal (612 × 1008 pt)</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--fg-subtle)" }}>MARGIN (pt)</span>
          <input type="number" min={24} max={144} step={6} value={margin} onChange={(e) => setMargin(Math.max(24, Math.min(144, Number(e.target.value) || 72)))} disabled={busy} style={inputStyle} />
        </label>
      </div>

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{error}</p>
      )}

      {result && (
        <div className="card" style={{ padding: 20, borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
          <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--accent)", color: "var(--bg-1)", display: "grid", placeItems: "center" }}>
              <I.Check size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15 }}>PDF generated</div>
              <div className="muted" style={{ fontSize: 13 }}>{result.name} · {humanSize(result.size)}</div>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => downloadBytes(result.bytes, result.name)}>
              <I.Download size={14} />
              <span>Download</span>
            </button>
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-primary" disabled={busy || !src.trim()} onClick={generate}>
          {busy ? "Rendering…" : "Generate PDF"}
        </button>
      </div>
    </div>
  );
}
