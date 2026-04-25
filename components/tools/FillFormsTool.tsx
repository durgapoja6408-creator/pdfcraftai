"use client";

// FillFormsTool — Tier 1 §1.7 P0.
//
// Load a PDF, enumerate its AcroForm fields, render the right input
// per field type (text / checkbox / radio group / dropdown), collect
// user values, and write them back via pdf-lib's setters. Save the
// filled doc. Optionally "flatten" after filling so recipients can't
// edit the values — same flatten pattern as FlattenPdfTool.
//
// pdf-lib form API:
//   - form.getFields() returns concrete subclasses:
//     PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown,
//     PDFOptionList, PDFButton, PDFSignature.
//   - Each exposes type-specific getters/setters:
//     .getText() / .setText()       — text
//     .isChecked() / .check() / .uncheck()  — checkbox
//     .getSelected() / .select(option)      — radio group
//     .getOptions() / .getSelected() / .select(option)  — dropdown
//   - Button / Signature fields are not user-fillable; we render a
//     disabled row with an explanation.

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
import { useTrackToolView } from "./useToolTracking";

type FieldDescriptor =
  | { kind: "text"; name: string; initial: string; multiline: boolean }
  | { kind: "checkbox"; name: string; initial: boolean }
  | { kind: "radio"; name: string; options: string[]; initial: string | null }
  | { kind: "dropdown"; name: string; options: string[]; initial: string | null }
  | { kind: "list"; name: string; options: string[]; initial: string[] }
  | { kind: "unsupported"; name: string; reason: string };

type Loaded = {
  file: File;
  pageCount: number;
  fields: FieldDescriptor[];
};

type Values = Record<string, string | boolean | string[]>;

export function FillFormsTool() {
  useTrackToolView("fill-forms", "Edit");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [values, setValues] = useState<Values>({});
  const [flatten, setFlatten] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    bytes: Uint8Array;
    name: string;
    size: number;
    filledCount: number;
    flattened: boolean;
  } | null>(null);

  const onFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const doc = await PDFDocument.load(await f.arrayBuffer(), {
        ignoreEncryption: true,
      });
      const form = doc.getForm();
      const rawFields = form.getFields();

      const descriptors: FieldDescriptor[] = [];
      const initialValues: Values = {};

      for (const field of rawFields) {
        const name = field.getName();
        if (field instanceof PDFTextField) {
          const initial = field.getText() ?? "";
          descriptors.push({
            kind: "text",
            name,
            initial,
            multiline: field.isMultiline(),
          });
          initialValues[name] = initial;
        } else if (field instanceof PDFCheckBox) {
          const initial = field.isChecked();
          descriptors.push({ kind: "checkbox", name, initial });
          initialValues[name] = initial;
        } else if (field instanceof PDFRadioGroup) {
          const options = field.getOptions();
          const initial = field.getSelected() ?? null;
          descriptors.push({ kind: "radio", name, options, initial });
          initialValues[name] = initial ?? "";
        } else if (field instanceof PDFDropdown) {
          const options = field.getOptions();
          const selected = field.getSelected();
          const initial = selected[0] ?? null;
          descriptors.push({ kind: "dropdown", name, options, initial });
          initialValues[name] = initial ?? "";
        } else if (field instanceof PDFOptionList) {
          const options = field.getOptions();
          const initial = field.getSelected();
          descriptors.push({ kind: "list", name, options, initial });
          initialValues[name] = initial;
        } else {
          descriptors.push({
            kind: "unsupported",
            name,
            reason:
              field.constructor.name.replace(/^PDF/, "") ||
              "unknown field type",
          });
        }
      }

      setLoaded({
        file: f,
        pageCount: doc.getPageCount(),
        fields: descriptors,
      });
      setValues(initialValues);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error && /encrypted|password/i.test(err.message)
          ? "This PDF is password-protected. Unlock it first."
          : "Couldn't read that PDF. It may be corrupt."
      );
      setLoaded(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const reset = () => {
    setLoaded(null);
    setValues({});
    setError(null);
    setResult(null);
    setFlatten(false);
  };

  const run = async () => {
    if (!loaded) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const doc = await PDFDocument.load(await loaded.file.arrayBuffer(), {
        ignoreEncryption: true,
      });
      const form = doc.getForm();
      let filledCount = 0;

      for (const desc of loaded.fields) {
        const v = values[desc.name];
        try {
          if (desc.kind === "text") {
            const field = form.getTextField(desc.name);
            field.setText(typeof v === "string" ? v : "");
            filledCount += 1;
          } else if (desc.kind === "checkbox") {
            const field = form.getCheckBox(desc.name);
            if (v === true) field.check();
            else field.uncheck();
            filledCount += 1;
          } else if (desc.kind === "radio") {
            const field = form.getRadioGroup(desc.name);
            if (typeof v === "string" && v && desc.options.includes(v)) {
              field.select(v);
              filledCount += 1;
            } else {
              field.clear();
            }
          } else if (desc.kind === "dropdown") {
            const field = form.getDropdown(desc.name);
            if (typeof v === "string" && v && desc.options.includes(v)) {
              field.select(v);
              filledCount += 1;
            } else {
              field.clear();
            }
          } else if (desc.kind === "list") {
            const field = form.getOptionList(desc.name);
            if (Array.isArray(v) && v.length > 0) {
              const valid = v.filter((x) => desc.options.includes(x));
              if (valid.length > 0) {
                field.select(valid);
                filledCount += 1;
              } else {
                field.clear();
              }
            } else {
              field.clear();
            }
          }
          // unsupported: leave untouched.
        } catch (fieldErr) {
          // Keep going — one broken field shouldn't abort the whole fill.
          console.warn(`Couldn't fill "${desc.name}":`, fieldErr);
        }
      }

      if (flatten) form.flatten();

      const bytes = await doc.save({ useObjectStreams: true });
      const name = deriveOutputName(
        loaded.file.name,
        flatten ? "-filled-flat" : "-filled"
      );
      setResult({
        bytes,
        name,
        size: bytes.length,
        filledCount,
        flattened: flatten,
      });

      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "fill-forms",
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
      setError(err instanceof Error ? err.message : "Fill failed.");
    } finally {
      setBusy(false);
    }
  };

  const fillable = loaded
    ? loaded.fields.filter((f) => f.kind !== "unsupported").length
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!loaded ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF form to fill"
          hint={busy ? "Scanning form fields…" : undefined}
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
              <div
                title={loaded.file.name}
                style={{
                  fontSize: 14,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {loaded.file.name}
              </div>
              <div className="subtle" style={{ fontSize: 12 }}>
                {humanSize(loaded.file.size)} · {loaded.pageCount} page
                {loaded.pageCount === 1 ? "" : "s"} · {fillable} fillable field
                {fillable === 1 ? "" : "s"}
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

          {loaded.fields.length === 0 ? (
            <div
              className="card"
              style={{
                padding: 20,
                textAlign: "center",
                color: "var(--fg-subtle)",
                fontSize: 14,
              }}
            >
              No form fields detected in this PDF. If you expected
              editable fields, the PDF may use scanned form layouts
              (pixels, not AcroForm widgets) — those need the AI OCR
              tool to convert to fillable first.
            </div>
          ) : (
            <div
              className="card"
              style={{ padding: 0, display: "flex", flexDirection: "column" }}
            >
              {loaded.fields.map((desc, i) => (
                <FieldRow
                  key={`${desc.name}-${i}`}
                  desc={desc}
                  value={values[desc.name]}
                  onChange={(v) =>
                    setValues((prev) => ({ ...prev, [desc.name]: v }))
                  }
                  disabled={busy}
                  isFirst={i === 0}
                />
              ))}
            </div>
          )}

          {loaded.fields.length > 0 && (
            <label
              className="row"
              style={{ gap: 8, alignItems: "center", fontSize: 13 }}
            >
              <input
                type="checkbox"
                checked={flatten}
                disabled={busy}
                onChange={(e) => setFlatten(e.target.checked)}
              />
              <span>
                Flatten after filling — bakes values into the page so
                recipients can&apos;t edit them. Good for signed finals.
              </span>
            </label>
          )}
        </>
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
          <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "var(--accent)",
                color: "var(--bg-1)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <I.Check size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 2 }}>
                {result.flattened ? "Filled & flattened" : "Filled"}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {result.filledCount} field
                {result.filledCount === 1 ? "" : "s"} written ·{" "}
                {humanSize(result.size)}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => downloadBytes(result.bytes, result.name)}
            >
              <I.Download size={14} />
              <span>Download</span>
            </button>
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {loaded && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={reset}
          >
            Reset
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!loaded || busy || fillable === 0}
          onClick={run}
        >
          {busy ? "Saving…" : flatten ? "Fill & flatten" : "Fill & download"}
        </button>
      </div>
    </div>
  );
}

function FieldRow({
  desc,
  value,
  onChange,
  disabled,
  isFirst,
}: {
  desc: FieldDescriptor;
  value: string | boolean | string[] | undefined;
  onChange: (v: string | boolean | string[]) => void;
  disabled: boolean;
  isFirst: boolean;
}) {
  const rowStyle: React.CSSProperties = {
    padding: "12px 16px",
    borderTop: isFirst ? "none" : "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--fg-subtle)",
  };
  const inputStyle: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: "var(--radius)",
    border: "1px solid var(--border-strong)",
    background: "var(--bg-1)",
    color: "var(--fg)",
    fontSize: 14,
  };

  if (desc.kind === "text") {
    const str = typeof value === "string" ? value : "";
    return (
      <div style={rowStyle}>
        <label htmlFor={`f-${desc.name}`} style={labelStyle}>
          {desc.name}
        </label>
        {desc.multiline ? (
          <textarea
            id={`f-${desc.name}`}
            value={str}
            rows={3}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            style={inputStyle}
          />
        ) : (
          <input
            id={`f-${desc.name}`}
            type="text"
            value={str}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            style={inputStyle}
          />
        )}
      </div>
    );
  }
  if (desc.kind === "checkbox") {
    return (
      <label
        style={{ ...rowStyle, flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        <input
          type="checkbox"
          checked={value === true}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span style={{ fontSize: 14 }}>{desc.name}</span>
      </label>
    );
  }
  if (desc.kind === "radio") {
    return (
      <div style={rowStyle}>
        <span style={labelStyle}>{desc.name}</span>
        <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
          {desc.options.map((opt) => (
            <label
              key={opt}
              className="row"
              style={{ gap: 6, alignItems: "center", fontSize: 14 }}
            >
              <input
                type="radio"
                name={desc.name}
                value={opt}
                checked={value === opt}
                disabled={disabled}
                onChange={() => onChange(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
      </div>
    );
  }
  if (desc.kind === "dropdown") {
    const str = typeof value === "string" ? value : "";
    return (
      <div style={rowStyle}>
        <label htmlFor={`f-${desc.name}`} style={labelStyle}>
          {desc.name}
        </label>
        <select
          id={`f-${desc.name}`}
          value={str}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        >
          <option value="">— none —</option>
          {desc.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (desc.kind === "list") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div style={rowStyle}>
        <label htmlFor={`f-${desc.name}`} style={labelStyle}>
          {desc.name} (multi-select)
        </label>
        <select
          id={`f-${desc.name}`}
          multiple
          value={arr}
          disabled={disabled}
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions).map(
              (o) => o.value
            );
            onChange(selected);
          }}
          style={{ ...inputStyle, height: 96 }}
        >
          {desc.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }
  // Unsupported — signatures, buttons, unknown.
  return (
    <div
      style={{
        ...rowStyle,
        color: "var(--fg-subtle)",
        fontSize: 13,
      }}
    >
      <span style={labelStyle}>{desc.name}</span>
      <span>
        Not fillable here ({desc.reason}). Signature fields belong in the AI
        Sign tool; button fields are only meaningful when the PDF is opened
        interactively.
      </span>
    </div>
  );
}
