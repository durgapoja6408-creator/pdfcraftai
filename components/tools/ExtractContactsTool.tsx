"use client";

// ExtractContactsTool — Tier 2 §2.7 P1 (heuristic, non-AI variant).
//
// Pulls email addresses, phone numbers, and URLs from a PDF via
// pdfjs text extraction + regex. The catalog lists the AI version
// (credits-based, handles obfuscated / handwritten / image-only
// cases); this free heuristic version covers 90% of
// well-formatted PDFs — enough for most real workflows.
//
// What it finds:
//   - Emails: RFC-5322-practical pattern
//   - Phones: broad international + Indian 10-digit patterns
//   - URLs: http/https, www.*, bare domains like example.com/path
//
// Honest FAQ note: this won't catch handwritten phone numbers,
// emails obfuscated as "name (at) company (dot) com", or text
// embedded as images. For those, chain with AI · OCR first.

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

type Hit = { type: "email" | "phone" | "url"; value: string; page: number };

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// Practical phone pattern — covers common international and IN
// formats without over-matching dates / ISBNs. Requires ≥10 digits
// total after stripping separators.
const PHONE_RE =
  /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}(?:[-.\s]?\d{1,4})?/g;
const URL_RE =
  /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+|\b[a-z0-9][a-z0-9-]{0,62}\.[a-z]{2,}(?:\/[^\s<>"')\]]*)?/gi;

function validPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return false;
  // Reject 8+ consecutive identical digits (looks like page numbers,
  // ISBN fragments, or auto-generated IDs).
  if (/(\d)\1{7,}/.test(digits)) return false;
  return true;
}

function normalizeUrl(raw: string): string {
  // Drop trailing punctuation the regex may have captured with the URL.
  return raw.replace(/[.,;:)\]]+$/, "");
}

export function ExtractContactsTool() {
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFiles = useCallback(async (files: File[]) => {
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

      const seen = new Set<string>();
      const out: Hit[] = [];

      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        // Stitch items with a space — long emails sometimes get
        // split across text items. Space-join doesn't hurt because
        // EMAIL_RE rejects whitespace inside.
        const text = content.items
          .map((it) => ("str" in it && typeof it.str === "string" ? it.str : ""))
          .join(" ");

        for (const m of text.matchAll(EMAIL_RE)) {
          const v = m[0].toLowerCase();
          const key = `email:${v}`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push({ type: "email", value: v, page: p });
          }
        }
        for (const m of text.matchAll(PHONE_RE)) {
          const raw = m[0].trim();
          if (!validPhone(raw)) continue;
          const key = `phone:${raw.replace(/\s+/g, "")}`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push({ type: "phone", value: raw, page: p });
          }
        }
        for (const m of text.matchAll(URL_RE)) {
          const v = normalizeUrl(m[0]);
          if (!v) continue;
          // Skip emails caught by the URL regex
          if (v.includes("@")) continue;
          const key = `url:${v.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push({ type: "url", value: v, page: p });
          }
        }
      }

      setHits(out);
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
    setHits(null);
    setSourceName("");
    setError(null);
  };

  const escCsv = (s: string) =>
    s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;

  const downloadCsv = async () => {
    if (!hits) return;
    const rows = ["type,value,page"];
    for (const h of hits) rows.push(`${h.type},${escCsv(h.value)},${h.page}`);
    const bytes = new TextEncoder().encode(rows.join("\n") + "\n");
    const name = deriveOutputName(sourceName || "contacts.pdf", "-contacts").replace(
      /\.pdf$/i,
      ".csv"
    );
    downloadBytes(bytes, name, "text/csv;charset=utf-8");
    try {
      const sha256 = await sha256HexOfBytes(bytes);
      await logToolResultAction({
        toolId: "extract-contacts",
        name,
        mime: "text/csv",
        sizeBytes: bytes.length,
        sha256,
      });
    } catch (e) {
      console.warn(e);
    }
  };

  const downloadVcard = async () => {
    if (!hits) return;
    // Build one vCard per email; attach any phone/URL found in the
    // same PDF. Conservative — each vCard has every email + every
    // phone rather than trying to cluster by proximity (would need
    // AI to do reliably).
    const emails = hits.filter((h) => h.type === "email");
    const phones = hits.filter((h) => h.type === "phone");
    const urls = hits.filter((h) => h.type === "url");
    const lines: string[] = [];
    if (emails.length === 0 && phones.length === 0) {
      // Edge case: no emails/phones — vCard doesn't make sense.
      setError("No emails or phones found; vCard export needs at least one.");
      return;
    }
    if (emails.length === 0) {
      // One vCard with all phones + urls.
      lines.push("BEGIN:VCARD", "VERSION:3.0", "FN:Contact from PDF");
      for (const p of phones) lines.push(`TEL:${p.value}`);
      for (const u of urls) lines.push(`URL:${u.value}`);
      lines.push("END:VCARD");
    } else {
      for (const e of emails) {
        lines.push("BEGIN:VCARD", "VERSION:3.0", `FN:${e.value}`, `EMAIL:${e.value}`);
        for (const p of phones) lines.push(`TEL:${p.value}`);
        for (const u of urls) lines.push(`URL:${u.value}`);
        lines.push("END:VCARD");
      }
    }
    const bytes = new TextEncoder().encode(lines.join("\r\n") + "\r\n");
    const name = deriveOutputName(sourceName || "contacts.pdf", "-contacts").replace(
      /\.pdf$/i,
      ".vcf"
    );
    downloadBytes(bytes, name, "text/vcard");
    try {
      const sha256 = await sha256HexOfBytes(bytes);
      await logToolResultAction({
        toolId: "extract-contacts",
        name,
        mime: "text/vcard",
        sizeBytes: bytes.length,
        sha256,
      });
    } catch (e) {
      console.warn(e);
    }
  };

  const counts = hits
    ? {
        emails: hits.filter((h) => h.type === "email").length,
        phones: hits.filter((h) => h.type === "phone").length,
        urls: hits.filter((h) => h.type === "url").length,
      }
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {hits === null ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF to extract emails, phones, and URLs"
        />
      ) : hits.length === 0 ? (
        <div className="card" style={{ padding: 24 }}>
          <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
            <I.Info size={18} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 500 }}>No contacts found</div>
              <div className="muted" style={{ fontSize: 13 }}>
                <code>{sourceName}</code> contains no extractable emails, phones,
                or URLs. If it's a scanned image-only PDF, run AI · OCR first.
                If contacts are obfuscated (e.g. "jane (at) example"), use the
                paid AI version which handles those patterns.
              </div>
            </div>
            <button type="button" className="btn btn-sm btn-ghost" onClick={reset}>
              Try another
            </button>
          </div>
        </div>
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
                {counts!.emails} email{counts!.emails === 1 ? "" : "s"} ·{" "}
                {counts!.phones} phone{counts!.phones === 1 ? "" : "s"} ·{" "}
                {counts!.urls} URL{counts!.urls === 1 ? "" : "s"}
              </div>
            </div>
            <button type="button" className="btn btn-sm btn-ghost" onClick={reset} aria-label="Clear">
              <I.X size={14} />
            </button>
          </div>

          <div className="card" style={{ padding: 0, overflow: "auto", maxHeight: 400 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg-2)", position: "sticky", top: 0 }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, color: "var(--fg-subtle)" }}>Type</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, color: "var(--fg-subtle)" }}>Value</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: 500, color: "var(--fg-subtle)" }}>Page</th>
                </tr>
              </thead>
              <tbody>
                {hits.map((h, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ padding: "2px 6px", background: "var(--bg-2)", borderRadius: 3, fontSize: 11, textTransform: "uppercase" }}>
                        {h.type}
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono), ui-monospace, monospace", wordBreak: "break-all" }}>
                      {h.value}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--fg-subtle)" }}>
                      {h.page}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {error && <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{error}</p>}

      {hits && hits.length > 0 && (
        <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={downloadVcard}>
            <I.Download size={14} />
            <span>Download vCard</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={downloadCsv}>
            <I.Download size={14} />
            <span>Download CSV</span>
          </button>
        </div>
      )}
    </div>
  );
}
