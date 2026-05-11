"use client";

// components/tools/PdfFormFillTool.tsx
//
// 2026-05-01 Tier 3: visually fill PDF AcroForm fields. Major gap-
// closer for the catalog (the existing pdf-forms inspector READS
// fields; this one WRITES values back).
//
// Flow:
//   1. User drops PDF
//   2. We call getFormFieldSchema() to extract field types + options
//   3. UI renders an input control per field (text / checkbox /
//      radio group / dropdown / option-list)
//   4. User fills values; clicks "Build filled PDF"
//   5. We call fillForm() with the collected values map
//   6. Output = filled PDF, optionally flattened
//
// All 7 standardized hooks wired (input is PDF — not on
// NON_PDF_INPUT_TOOLS).

import { useState, useCallback, useEffect } from "react";
import { I } from "@/components/icons/Icons";
import { humanSize, MAX_FILE_SIZE_BYTES, isPdfFile } from "@/lib/client/pdf-utils";
import { downloadBytes } from "@/lib/client/download";
import { useTrackToolView } from "./useToolTracking";
import { useScrollErrorIntoView } from "./useScrollErrorIntoView";
import { useHandoffConsumer } from "./useHandoffConsumer";
import { useFileUrlConsumer } from "./useFileUrlConsumer";
import { HandoffSuggestions } from "./HandoffSuggestions";
import { ToolHowItWorks } from "./ToolHowItWorks";
import { mapPdfOpError } from "@/lib/pdf/error-messages";
import type {
  FillValue,
  FormFieldSchema,
  FieldSchemaEntry,
} from "@/lib/pdf/ops/fill-form";

interface ResultState {
  outputBytes: Uint8Array;
  outputFileName: string;
  pageCount: number;
  filledCount: number;
  skipped: string[];
}

export function PdfFormFillTool() {
  const tracker = useTrackToolView("pdf-form-fill", "Edit");
  const [file, setFile] = useState<File | null>(null);
  const [schema, setSchema] = useState<FormFieldSchema | null>(null);
  const [values, setValues] = useState<Record<string, FillValue>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [flatten, setFlatten] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const errorRef = useScrollErrorIntoView(error);

  const onFiles = useCallback(
    (files: File[]) => {
      setError(null);
      setResult(null);
      setSchema(null);
      setValues({});
      const f = files[0];
      if (!f) return;
      if (!isPdfFile(f)) {
        setError(`"${f.name}" is not a PDF file.`);
        return;
      }
      if (f.size > MAX_FILE_SIZE_BYTES) {
        setError(`"${f.name}" exceeds ${humanSize(MAX_FILE_SIZE_BYTES)}.`);
        return;
      }
      setFile(f);
      tracker.upload(f);
    },
    [tracker],
  );

  useHandoffConsumer(onFiles);
  useFileUrlConsumer(onFiles);

  // Whenever a file lands, async-load the schema.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { getFormFieldSchema } = await import("@/lib/pdf/ops/fill-form");
        const s = await getFormFieldSchema(bytes);
        if (cancelled) return;
        if (s.fields.length === 0) {
          setError(
            "This PDF doesn't have any fillable form fields. Use a fillable PDF (look for one with input boxes / checkboxes / dropdowns).",
          );
          setSchema(null);
          return;
        }
        setSchema(s);
        // Seed `values` with current field values so the UI starts
        // from the existing state (user can edit any of them).
        const seed: Record<string, FillValue> = {};
        for (const f of s.fields) {
          if (f.kind === "checkbox") seed[f.name] = f.value as boolean;
          else if (f.kind === "option-list") seed[f.name] = f.value as string[];
          else seed[f.name] = (f.value as string) ?? "";
        }
        setValues(seed);
      } catch (err) {
        if (cancelled) return;
        setError(mapPdfOpError(err instanceof Error ? err.message : "Couldn't read form fields."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const reset = () => {
    setFile(null);
    setSchema(null);
    setValues({});
    setError(null);
    setResult(null);
    setBusy(false);
  };

  const setFieldValue = (name: string, v: FillValue) => {
    setValues((prev) => ({ ...prev, [name]: v }));
  };

  const run = async () => {
    if (!file || !schema) return;
    setError(null);
    setBusy(true);
    const t0 = performance.now();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { fillForm } = await import("@/lib/pdf/ops/fill-form");
      const r = await fillForm(bytes, { values, flatten });
      const baseName = file.name.replace(/\.pdf$/i, "");
      setResult({
        outputBytes: r.bytes,
        outputFileName: `${baseName || "document"}-filled.pdf`,
        pageCount: r.pageCount,
        filledCount: r.filledCount,
        skipped: r.skipped,
      });
      tracker.success({
        creditCost: 0,
        pageCount: r.pageCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("pdf-form-fill failed", err);
      setError(
        mapPdfOpError(err instanceof Error ? err.message : "Couldn't fill the form."),
      );
      tracker.error({ errorCode: "pdf_form_fill_failed" });
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!result) return;
    downloadBytes(result.outputBytes, result.outputFileName);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <ToolHowItWorks
        steps={[
          {
            title: "Drop in a fillable PDF",
            body: "Up to 100 MB. The form is parsed locally — your filled values stay in your browser the whole way through.",
          },
          {
            title: "Type your answers right on the page",
            body: "Text, checkboxes, radio groups, dropdowns — every field surfaces as a normal HTML control with its current value pre-filled if any.",
          },
          {
            title: "Save the filled PDF",
            body: "We write the values back into the AcroForm dictionary so any PDF reader can re-open and re-save the file with your answers intact.",
          },
        ]}
        privacyNote="Your PDF and the values you type stay in your browser. The fill happens client-side with pdf-lib — nothing is uploaded or persisted."
      />
      {!file && !result && (
        <div
          role="button"
          tabIndex={0}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length > 0) {
              onFiles(Array.from(e.dataTransfer.files));
            }
          }}
          onClick={() => document.getElementById("pdf-form-fill-input")?.click()}
          style={{
            border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
            borderRadius: 12,
            padding: "32px 24px",
            textAlign: "center",
            background: dragOver ? "var(--accent-soft)" : "var(--bg-1)",
            cursor: "pointer",
          }}
        >
          <I.File size={28} style={{ color: "var(--fg-muted)", marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 500 }}>
            Drop a fillable PDF here or click to browse
          </div>
          <div className="subtle" style={{ fontSize: 12, marginTop: 6 }}>
            Up to 100 MB · runs privately in your browser
          </div>
          <input
            id="pdf-form-fill-input"
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              if (e.target.files) onFiles(Array.from(e.target.files));
            }}
          />
        </div>
      )}

      {file && schema && !result && (
        <>
          <div className="subtle" style={{ fontSize: 13 }}>
            <strong>{file.name}</strong> · {schema.totalCount} field
            {schema.totalCount === 1 ? "" : "s"} ({schema.fillableCount} fillable)
          </div>
          <div
            className="card"
            style={{
              padding: 0,
              maxHeight: 600,
              overflowY: "auto",
            }}
          >
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {schema.fields.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  style={{
                    padding: "12px 16px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  }}
                >
                  <FieldRow
                    field={f}
                    value={values[f.name]}
                    onChange={(v) => setFieldValue(f.name, v)}
                  />
                </li>
              ))}
            </ul>
          </div>
          <div
            className="card"
            style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={flatten}
                onChange={(e) => setFlatten(e.target.checked)}
              />
              Flatten the form (bake values into page content — recipients can&rsquo;t edit them)
            </label>
            <div className="subtle" style={{ fontSize: 12 }}>
              Default keeps fields editable. Flatten when sharing a finalized
              copy where the values shouldn&rsquo;t be changed downstream.
            </div>
          </div>
        </>
      )}

      {error && (
        <p
          ref={errorRef as React.RefObject<HTMLParagraphElement>}
          role="alert"
          style={{ color: "var(--red)", fontSize: 13, margin: 0 }}
        >
          {error}
        </p>
      )}

      {busy && (
        <div
          className="card"
          style={{ padding: 16, background: "var(--bg-1)", display: "flex", gap: 12 }}
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span className="pulse-soft" style={{ color: "var(--accent)" }}>
            <I.Sparkle size={16} />
          </span>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
            Building filled PDF…
          </div>
        </div>
      )}

      {result && (
        <div
          className="card"
          style={{ padding: "16px 20px" }}
          role="status"
          aria-live="polite"
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 16,
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                Filled {result.filledCount} field{result.filledCount === 1 ? "" : "s"}
                {flatten ? " · flattened (read-only)" : " · still editable"}
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                {humanSize(result.outputBytes.length)}
                {result.skipped.length > 0
                  ? ` · ${result.skipped.length} field${result.skipped.length === 1 ? "" : "s"} skipped (signature / unsupported type)`
                  : ""}
              </div>
            </div>
            <button type="button" className="btn btn-sm btn-outline" onClick={download}>
              <I.Download size={12} /> Download
            </button>
          </div>
          <HandoffSuggestions
            sourceToolId="pdf-form-fill"
            outputBytes={result.outputBytes}
            outputFileName={result.outputFileName}
          />
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>
            Fill another form
          </button>
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
              disabled={!file || !schema || busy}
              onClick={run}
            >
              {busy ? "Building…" : "Build filled PDF"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// --- Field row sub-component ---

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: FieldSchemaEntry;
  value: FillValue | undefined;
  onChange: (v: FillValue) => void;
}) {
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    marginBottom: 4,
    color: "var(--fg)",
    display: "block",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 10px",
    border: "1px solid var(--border)",
    borderRadius: 4,
    background: field.readOnly ? "var(--bg-2)" : "var(--bg-1)",
    color: "var(--fg)",
    fontSize: 13,
  };
  const meta = (
    <div className="subtle" style={{ fontSize: 11, marginTop: 4 }}>
      {field.kind}
      {field.readOnly ? " · read-only" : ""}
    </div>
  );

  if (field.kind === "text") {
    if (field.multiline) {
      return (
        <div>
          <label style={labelStyle}>{field.name}</label>
          <textarea
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={field.readOnly}
            rows={3}
            style={{ ...inputStyle, fontFamily: "var(--mono, monospace)" }}
          />
          {meta}
        </div>
      );
    }
    return (
      <div>
        <label style={labelStyle}>{field.name}</label>
        <input
          type="text"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={field.readOnly}
          style={inputStyle}
        />
        {meta}
      </div>
    );
  }
  if (field.kind === "checkbox") {
    return (
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          disabled={field.readOnly}
        />
        <span>{field.name}</span>
        {field.readOnly && <span className="subtle" style={{ fontSize: 11 }}>(read-only)</span>}
      </label>
    );
  }
  if (field.kind === "radio") {
    return (
      <div>
        <div style={labelStyle}>{field.name}</div>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          {field.options.map((opt) => (
            <label
              key={opt}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
              }}
            >
              <input
                type="radio"
                name={field.name}
                checked={value === opt}
                onChange={() => onChange(opt)}
                disabled={field.readOnly}
              />
              {opt}
            </label>
          ))}
        </div>
        {meta}
      </div>
    );
  }
  if (field.kind === "dropdown") {
    return (
      <div>
        <label style={labelStyle}>{field.name}</label>
        <select
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={field.readOnly}
          style={inputStyle}
        >
          <option value="">— select —</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {meta}
      </div>
    );
  }
  if (field.kind === "option-list") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div>
        <label style={labelStyle}>{field.name}</label>
        <select
          multiple
          value={arr}
          onChange={(e) =>
            onChange(Array.from(e.target.selectedOptions).map((o) => o.value))
          }
          disabled={field.readOnly}
          style={{ ...inputStyle, height: Math.min(120, 24 * field.options.length) }}
        >
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <div className="subtle" style={{ fontSize: 11, marginTop: 4 }}>
          option-list · cmd/ctrl-click to select multiple
        </div>
      </div>
    );
  }
  return (
    <div>
      <label style={labelStyle}>{field.name}</label>
      <div className="subtle" style={{ fontSize: 12 }}>
        {field.kind === "signature"
          ? "Signature field — use the Sign PDF tool to add a signature image."
          : "Unsupported field type — skipped during fill."}
      </div>
    </div>
  );
}
