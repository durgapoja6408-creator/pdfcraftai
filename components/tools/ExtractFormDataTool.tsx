"use client";

// ExtractFormDataTool — Tier 1 §1.7 P1.
//
// Walks the AcroForm fields of a PDF and serialises each field's
// current value to either CSV or JSON. The inverse of our existing
// Fill PDF Forms tool: that lets you PUT data in; this one gets it
// OUT. Common use case: batch-collect responses from filled forms
// for spreadsheet analysis.
//
// Field type handling:
//   - PDFTextField → string value
//   - PDFCheckBox → "true" / "false"
//   - PDFRadioGroup → selected option
//   - PDFDropdown → selected value
//   - PDFOptionList → comma-joined selected values
//   - PDFButton → skipped (no data to extract)
//   - Unknown → skipped with a note

import { useState, useCallback } from "react";
import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
} from "pdf-lib";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import {
  deriveOutputName,
  downloadBytes,
  humanSize,
  sha256HexOfBytes,
} from "@/lib/client/pdf-utils";
import { logToolResultAction } from "@/lib/tool-result-actions";

type Row = { name: string; type: string; value: string };

export function ExtractFormDataTool() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setRows(null);
    setBusy(true);
    try {
      const doc = await PDFDocument.load(await f.arrayBuffer(), {
        ignoreEncryption: true,
      });
      const form = doc.getForm();
      const fields = form.getFields();
      const out: Row[] = [];
      for (const field of fields) {
        const name = field.getName();
        let type = "unknown";
        let value = "";
        try {
          if (field instanceof PDFTextField) {
            type = "text";
            value = field.getText() ?? "";
          } else if (field instanceof PDFCheckBox) {
            type = "checkbox";
            value = field.isChecked() ? "true" : "false";
          } else if (field instanceof PDFRadioGroup) {
            type = "radio";
            value = field.getSelected() ?? "";
          } else if (field instanceof PDFDropdown) {
            type = "dropdown";
            value = (field.getSelected() ?? []).join(", ");
          } else if (field instanceof PDFOptionList) {
            type = "list";
            value = (field.getSelected() ?? []).join(", ");
          } else {
            type = "unsupported";
          }
        } catch (fieldErr) {
          // A malformed field shouldn't kill the whole extraction.
          console.warn(`failed to read field "${name}":`, fieldErr);
          value = "";
          type = `${type}-error`;
        }
        out.push({ name, type, value });
      }
      setRows(out);
      setSourceName(f.name);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error && /encrypted|password/i.test(err.message)
          ? "This PDF is password-protected. Unlock it first."
          : "Couldn't read that PDF. It may be corrupt."
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const reset = () => {
    setRows(null);
    setSourceName("");
    setError(null);
  };

  const escapeCsv = (s: string) => {
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const downloadCsv = async () => {
    if (!rows) return;
    const lines = ["name,type,value"];
    for (const r of rows) {
      lines.push(`${escapeCsv(r.name)},${escapeCsv(r.type)},${escapeCsv(r.value)}`);
    }
    const csv = lines.join("\n") + "\n";
    const bytes = new TextEncoder().encode(csv);
    const name = deriveOutputName(sourceName || "form-data.pdf", "-fields").replace(
      /\.pdf$/i,
      ".csv"
    );
    downloadBytes(bytes, name, "text/csv;charset=utf-8");
    try {
      const sha256 = await sha256HexOfBytes(bytes);
      await logToolResultAction({
        toolId: "extract-form-data",
        name,
        mime: "text/csv",
        sizeBytes: bytes.length,
        sha256,
      });
    } catch (e) {
      console.warn(e);
    }
  };

  const downloadJson = async () => {
    if (!rows) return;
    const obj: Record<string, string | boolean | string[]> = {};
    for (const r of rows) {
      if (r.type === "checkbox") obj[r.name] = r.value === "true";
      else if (r.type === "dropdown" || r.type === "list")
        obj[r.name] = r.value ? r.value.split(",").map((s) => s.trim()) : [];
      else obj[r.name] = r.value;
    }
    const json = JSON.stringify(obj, null, 2);
    const bytes = new TextEncoder().encode(json);
    const name = deriveOutputName(sourceName || "form-data.pdf", "-fields").replace(
      /\.pdf$/i,
      ".json"
    );
    downloadBytes(bytes, name, "application/json");
    try {
      const sha256 = await sha256HexOfBytes(bytes);
      await logToolResultAction({
        toolId: "extract-form-data",
        name,
        mime: "application/json",
        sizeBytes: bytes.length,
        sha256,
      });
    } catch (e) {
      console.warn(e);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {rows === null ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a filled PDF form to extract its values"
        />
      ) : rows.length === 0 ? (
        <div className="card" style={{ padding: 24 }}>
          <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
            <I.Info size={18} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>
                No form fields found
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                <code>{sourceName}</code> has no AcroForm fields. This is normal
                for PDFs that weren't authored as fillable forms — static PDFs
                with visible "signature" lines aren't fields, they're just
                drawn text.
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
              <div
                title={sourceName}
                style={{
                  fontSize: 14,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {sourceName}
              </div>
              <div className="subtle" style={{ fontSize: 12 }}>
                {rows.length} field{rows.length === 1 ? "" : "s"} found
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={reset}
              aria-label="Clear"
            >
              <I.X size={14} />
            </button>
          </div>

          <div className="card" style={{ padding: 0, overflow: "auto", maxHeight: 400 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg-2)", position: "sticky", top: 0 }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, color: "var(--fg-subtle)" }}>Name</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, color: "var(--fg-subtle)" }}>Type</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 500, color: "var(--fg-subtle)" }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono), ui-monospace, monospace" }}>
                      {r.name}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ padding: "2px 6px", background: "var(--bg-2)", borderRadius: 3, fontSize: 11 }}>
                        {r.type}
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px", wordBreak: "break-word" }}>
                      {r.value || <span style={{ color: "var(--fg-subtle)" }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{error}</p>
      )}

      {rows && rows.length > 0 && (
        <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={downloadJson}>
            <I.Download size={14} />
            <span>Download JSON</span>
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
