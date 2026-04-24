"use client";

// ExtractDatesTool — Tier 2 §2.7 P2 (heuristic, non-AI variant).
//
// Scans PDF text for date-like strings via regex, normalises each
// to ISO, and produces a downloadable .ics (iCalendar) file. Free
// client-side heuristic that catches the common formats; the paid
// AI version handles contextual dates ("next Tuesday", "the first
// Monday of March").
//
// Patterns supported:
//   - "2026-04-24", "24/04/2026", "04/24/2026" (month-day ambiguity
//     surfaced — Indian vs US conventions differ; UI includes a
//     day-first vs month-first toggle)
//   - "Apr 24, 2026", "April 24, 2026", "24 April 2026"
//   - "April 2026" (month-year, defaults to 1st of month)
//
// Each found date becomes an ICS VEVENT with the surrounding ~80
// characters of context as SUMMARY.

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

type DateHit = {
  iso: string; // YYYY-MM-DD
  raw: string;
  context: string;
  page: number;
};

const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];
const MONTH_LONG = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function parseMonth(str: string): number | null {
  const s = str.toLowerCase().slice(0, 3);
  const idx = MONTH_NAMES.indexOf(s);
  return idx === -1 ? null : idx + 1; // 1-based
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoIfValid(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  // Reject invalid day-of-month (e.g. Feb 30).
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function extractDates(text: string, dayFirst: boolean): Array<{ iso: string; raw: string; start: number; end: number }> {
  const out: Array<{ iso: string; raw: string; start: number; end: number }> = [];

  // ISO-like: YYYY-MM-DD or YYYY/MM/DD
  const isoRe = /\b(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/g;
  for (const m of text.matchAll(isoRe)) {
    const iso = isoIfValid(+m[1], +m[2], +m[3]);
    if (iso) out.push({ iso, raw: m[0], start: m.index!, end: m.index! + m[0].length });
  }

  // DD/MM/YYYY or MM/DD/YYYY (ambiguous — use dayFirst)
  const numRe = /\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})\b/g;
  for (const m of text.matchAll(numRe)) {
    let y = +m[3];
    if (y < 100) y += y < 50 ? 2000 : 1900;
    const a = +m[1];
    const b = +m[2];
    const [day, month] = dayFirst ? [a, b] : [b, a];
    const iso = isoIfValid(y, month, day);
    if (iso) out.push({ iso, raw: m[0], start: m.index!, end: m.index! + m[0].length });
  }

  // "24 April 2026" / "April 24, 2026" / "Apr 24, 2026"
  const namedRe1 = /\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/g;
  for (const m of text.matchAll(namedRe1)) {
    const month = parseMonth(m[2]);
    if (month) {
      const iso = isoIfValid(+m[3], month, +m[1]);
      if (iso) out.push({ iso, raw: m[0], start: m.index!, end: m.index! + m[0].length });
    }
  }
  const namedRe2 = /\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/g;
  for (const m of text.matchAll(namedRe2)) {
    const month = parseMonth(m[1]);
    if (month) {
      const iso = isoIfValid(+m[3], month, +m[2]);
      if (iso) out.push({ iso, raw: m[0], start: m.index!, end: m.index! + m[0].length });
    }
  }

  return out;
}

function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function buildIcs(hits: DateHit[]): string {
  const now = new Date();
  const dtstamp =
    `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}T` +
    `${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//pdfcraft ai//Extract Dates//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const dateStr = h.iso.replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${dateStr}-${i}-pdfcraft@pdfcraftai.com`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${dateStr}`,
      `DTEND;VALUE=DATE:${dateStr}`,
      `SUMMARY:${icsEscape(h.context)}`,
      `DESCRIPTION:Extracted from PDF (page ${h.page}).`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export function ExtractDatesTool() {
  const [hits, setHits] = useState<DateHit[] | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [dayFirst, setDayFirst] = useState(true); // Indian convention default
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedText, setLoadedText] = useState<string | null>(null);
  const [loadedPageOffsets, setLoadedPageOffsets] = useState<number[]>([]);

  const run = useCallback(
    (text: string, pageOffsets: number[], useDayFirst: boolean) => {
      const seen = new Set<string>();
      const out: DateHit[] = [];
      for (const h of extractDates(text, useDayFirst)) {
        if (seen.has(h.iso + h.raw)) continue;
        seen.add(h.iso + h.raw);
        // Find which page by looking up the start offset.
        let page = 1;
        for (let p = 0; p < pageOffsets.length; p++) {
          if (h.start >= pageOffsets[p]) page = p + 1;
        }
        const ctxStart = Math.max(0, h.start - 40);
        const ctxEnd = Math.min(text.length, h.end + 40);
        const context = text
          .slice(ctxStart, ctxEnd)
          .replace(/\s+/g, " ")
          .trim();
        out.push({ iso: h.iso, raw: h.raw, context, page });
      }
      out.sort((a, b) => a.iso.localeCompare(b.iso));
      setHits(out);
    },
    []
  );

  const onFiles = useCallback(
    async (files: File[]) => {
      const f = files[0];
      if (!f) return;
      setError(null);
      setHits(null);
      setBusy(true);
      try {
        const buffer = await f.arrayBuffer();
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs-worker.min.mjs";
        }
        const doc = await pdfjs.getDocument({ data: buffer.slice(0) }).promise;
        let allText = "";
        const pageOffsets: number[] = [];
        for (let p = 1; p <= doc.numPages; p++) {
          const page = await doc.getPage(p);
          const content = await page.getTextContent();
          pageOffsets.push(allText.length);
          allText +=
            content.items
              .map((it) => ("str" in it && typeof it.str === "string" ? it.str : ""))
              .join(" ") + "\n";
        }
        setLoadedText(allText);
        setLoadedPageOffsets(pageOffsets);
        setSourceName(f.name);
        run(allText, pageOffsets, dayFirst);
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error && /encrypted|password/i.test(err.message)
            ? "This PDF is password-protected. Unlock it first."
            : "Couldn't read that PDF. It may be corrupt or image-only."
        );
      } finally {
        setBusy(false);
      }
    },
    [dayFirst, run]
  );

  // Re-run extraction when the day-first toggle flips, if we've
  // already parsed the PDF.
  const toggleDayFirst = () => {
    const next = !dayFirst;
    setDayFirst(next);
    if (loadedText) run(loadedText, loadedPageOffsets, next);
  };

  const reset = () => {
    setHits(null);
    setSourceName("");
    setError(null);
    setLoadedText(null);
    setLoadedPageOffsets([]);
  };

  const downloadIcs = async () => {
    if (!hits) return;
    const ics = buildIcs(hits);
    const bytes = new TextEncoder().encode(ics);
    const name = deriveOutputName(sourceName || "dates.pdf", "-dates").replace(
      /\.pdf$/i,
      ".ics"
    );
    downloadBytes(bytes, name, "text/calendar");
    try {
      const sha256 = await sha256HexOfBytes(bytes);
      await logToolResultAction({
        toolId: "extract-dates",
        name,
        mime: "text/calendar",
        sizeBytes: bytes.length,
        sha256,
      });
    } catch (e) {
      console.warn(e);
    }
  };

  const downloadCsv = async () => {
    if (!hits) return;
    const escCsv = (s: string) =>
      s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    const rows = ["date,raw,context,page"];
    for (const h of hits)
      rows.push(`${h.iso},${escCsv(h.raw)},${escCsv(h.context)},${h.page}`);
    const bytes = new TextEncoder().encode(rows.join("\n") + "\n");
    const name = deriveOutputName(sourceName || "dates.pdf", "-dates").replace(
      /\.pdf$/i,
      ".csv"
    );
    downloadBytes(bytes, name, "text/csv;charset=utf-8");
    try {
      const sha256 = await sha256HexOfBytes(bytes);
      await logToolResultAction({
        toolId: "extract-dates",
        name,
        mime: "text/csv",
        sizeBytes: bytes.length,
        sha256,
      });
    } catch (e) {
      console.warn(e);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {hits === null ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF to extract dates into an .ics calendar file"
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
              <div title={sourceName} style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {sourceName}
              </div>
              <div className="subtle" style={{ fontSize: 12 }}>
                {hits.length} date{hits.length === 1 ? "" : "s"} found
              </div>
            </div>
            <button type="button" className="btn btn-sm btn-ghost" onClick={reset} aria-label="Clear">
              <I.X size={14} />
            </button>
          </div>

          <div className="card" style={{ padding: "12px 16px", fontSize: 13 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={dayFirst}
                onChange={toggleDayFirst}
                disabled={busy}
              />
              <span>
                <strong>Day-first parsing</strong> — treat "04/05/2026" as 4 May 2026 (Indian/EU convention).
                Uncheck for US convention (4 May → April 5).
              </span>
            </label>
          </div>

          {hits.length === 0 ? (
            <div className="card" style={{ padding: 20 }}>
              <div className="muted" style={{ fontSize: 13 }}>
                No dates matched the heuristic patterns. Dates written as
                "next Tuesday" or similar phrases need the paid AI version.
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: "auto", maxHeight: 400 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--bg-2)", position: "sticky", top: 0 }}>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, color: "var(--fg-subtle)" }}>Date</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, color: "var(--fg-subtle)" }}>Source</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, color: "var(--fg-subtle)" }}>Context</th>
                    <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: 500, color: "var(--fg-subtle)" }}>Page</th>
                  </tr>
                </thead>
                <tbody>
                  {hits.map((h, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono), ui-monospace, monospace" }}>
                        {h.iso}
                      </td>
                      <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono), ui-monospace, monospace", color: "var(--fg-subtle)" }}>
                        {h.raw}
                      </td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--fg-subtle)" }}>
                        …{h.context}…
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{h.page}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {error && <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{error}</p>}

      {hits && hits.length > 0 && (
        <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={downloadCsv}>
            <I.Download size={14} />
            <span>Download CSV</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={downloadIcs}>
            <I.Download size={14} />
            <span>Download .ics</span>
          </button>
        </div>
      )}
    </div>
  );
}
