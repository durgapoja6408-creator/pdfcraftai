// SignPdfTool — Phase 5.6 client runner.
//
// "AI fills fields, you sign and send."
//
// The user drops a PDF + fills a short form of personal info (name,
// initials, email, phone, date, company, title, address + optional
// custom k/v pairs). We POST everything as multipart to /api/ai/sign,
// which returns a filled PDF (base64) + markdown summary.
//
// Auth gate mirrors RedactPdfTool / GeneratePdfTool:
//   - Render-time `useSession()` swaps the Run button for a Sign-in
//     CTA so anonymous users never upload the PDF.
//   - Defense-in-depth `getSession()` probe inside `run()`.
//   - Idempotency key per submit; server-side replay returns the
//     persisted summary (no PDF — we don't store the signed bytes).
//
// UI surface:
//   - Dropzone at top (PDF only, ≤ 25 MB).
//   - Personal info grid (2 columns on wide screens).
//   - Custom fields table — add/remove rows for form-specific keys.
//   - Amber-bordered caveat card under the download button on result:
//     "This is a visual fill, not a cryptographic signature. For
//     legally-binding e-signature use DocuSign / Adobe Sign."
//
// Key naming on the payload must match SignUserInfo in lib/ai/sign.ts:
//   { fullName, initials?, email?, phone?, date?, company?, title?,
//     address?, customFields: [{key, value}] }.

"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, getSession } from "next-auth/react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { renderMarkdown } from "@/lib/markdown-mini";
import { classifyAiError } from "@/lib/ai/degradation";

type SignFilling = {
  label: string;
  fieldKey: string;
  value: string;
  isSignature: boolean;
  page: number;
  reason: string;
};

type SignUnfilled = {
  label: string;
  fieldKey: string;
  reason: string;
  cause: "no_value_for_key" | "anchor_not_found" | "skipped_by_model";
};

type SignResult = {
  fileId?: string;
  filename?: string;
  /**
   * Base64 of the filled+signed PDF. `null` on a replay (we don't
   * persist the PDF bytes, so the first response is the only chance
   * to download it).
   */
  signedPdfBase64: string | null;
  signedPdfFilename: string | null;
  markdown: string;
  filled: SignFilling[];
  unfilled: SignUnfilled[];
  creditCost: number;
  newBalance?: number;
  pageCount?: number;
  providerId: string;
  model: string;
  wasTruncated: boolean;
  /** Non-empty on 207 — compute succeeded, persist failed. */
  persistWarning?: string;
  /** True on idempotency replay — signals "PDF not downloadable again." */
  replay?: boolean;
};

type CustomRow = { key: string; value: string };

const SIGN_IN_HREF =
  "/login?callbackUrl=" + encodeURIComponent("/tool/ai-sign");

const MAX_CUSTOM_FIELDS = 20;

/** Today's date as YYYY-MM-DD (UTC). Used as the default for the Date field. */
function todayIso(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function SignPdfTool() {
  const router = useRouter();
  // Anonymous-user gate — swap Run for Sign-in so the PDF isn't uploaded
  // before the server bounces a 401. See SummarizePdfTool for rationale.
  const { status: sessionStatus } = useSession();
  const isAnonymous = sessionStatus === "unauthenticated";

  const [file, setFile] = useState<File | null>(null);
  const [fullName, setFullName] = useState("");
  const [initials, setInitials] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState<string>(todayIso());
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [customFields, setCustomFields] = useState<CustomRow[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SignResult | null>(null);

  const addFiles = useCallback((files: File[]) => {
    setError(null);
    setResult(null);
    setFile(files[0] ?? null);
  }, []);

  const reset = () => {
    setFile(null);
    setError(null);
    setResult(null);
  };

  // Derived: name is the only hard requirement. Everything else is
  // optional. We hide the "Run" button if no file OR no name.
  const canSubmit = useMemo(() => {
    if (!file) return false;
    if (fullName.trim().length === 0) return false;
    return true;
  }, [file, fullName]);

  const addCustomRow = () => {
    if (customFields.length >= MAX_CUSTOM_FIELDS) return;
    setCustomFields((prev) => [...prev, { key: "", value: "" }]);
  };

  const updateCustomRow = (idx: number, patch: Partial<CustomRow>) => {
    setCustomFields((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row))
    );
  };

  const removeCustomRow = (idx: number) => {
    setCustomFields((prev) => prev.filter((_, i) => i !== idx));
  };

  const run = async () => {
    if (!file) {
      setError("Attach a PDF to fill & sign.");
      return;
    }
    if (fullName.trim().length === 0) {
      setError("Your full name is required — it's how we sign the document.");
      return;
    }

    // Defense-in-depth session probe — see SummarizePdfTool for detail.
    const fresh = await getSession();
    if (!fresh?.user) {
      router.push(SIGN_IN_HREF);
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);

    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ik-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    // Build the info bundle. Keep only non-empty fields so the
    // server-side schema check ("must be a string if present") stays
    // green.
    const info: Record<string, unknown> = { fullName: fullName.trim() };
    const trimAssign = (k: string, v: string) => {
      const t = v.trim();
      if (t.length > 0) info[k] = t;
    };
    trimAssign("initials", initials);
    trimAssign("email", email);
    trimAssign("phone", phone);
    trimAssign("date", date);
    trimAssign("company", company);
    trimAssign("title", title);
    trimAssign("address", address);

    const trimmedCustom = customFields
      .map((row) => ({ key: row.key.trim(), value: row.value.trim() }))
      .filter((row) => row.key.length > 0 && row.value.length > 0);
    if (trimmedCustom.length > 0) {
      info.customFields = trimmedCustom;
    }

    try {
      const form = new FormData();
      form.append("pdf", file);
      form.append("info", JSON.stringify(info));
      form.append("idempotencyKey", idempotencyKey);

      const res = await fetch("/api/ai/sign", {
        method: "POST",
        body: form,
      });

      const body = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (res.ok) {
        setResult({
          fileId: typeof body.fileId === "string" ? body.fileId : undefined,
          filename:
            typeof body.filename === "string" ? body.filename : undefined,
          signedPdfBase64:
            typeof body.signedPdfBase64 === "string"
              ? body.signedPdfBase64
              : null,
          signedPdfFilename:
            typeof body.signedPdfFilename === "string"
              ? body.signedPdfFilename
              : null,
          markdown: String(body.markdown ?? ""),
          filled: Array.isArray(body.filled)
            ? (body.filled as SignFilling[])
            : [],
          unfilled: Array.isArray(body.unfilled)
            ? (body.unfilled as SignUnfilled[])
            : [],
          creditCost: Number(body.creditCost ?? 0),
          newBalance:
            typeof body.newBalance === "number" ? body.newBalance : undefined,
          pageCount:
            typeof body.pageCount === "number" ? body.pageCount : undefined,
          providerId: String(body.providerId ?? ""),
          model: String(body.model ?? ""),
          wasTruncated: Boolean(body.wasTruncated),
          replay: Boolean(body.replay),
        });
        return;
      }

      if (res.status === 207) {
        setResult({
          signedPdfBase64:
            typeof body.signedPdfBase64 === "string"
              ? body.signedPdfBase64
              : null,
          signedPdfFilename:
            typeof body.signedPdfFilename === "string"
              ? body.signedPdfFilename
              : null,
          markdown: String(body.markdown ?? ""),
          filled: Array.isArray(body.filled)
            ? (body.filled as SignFilling[])
            : [],
          unfilled: Array.isArray(body.unfilled)
            ? (body.unfilled as SignUnfilled[])
            : [],
          creditCost: Number(body.creditCost ?? 0),
          providerId: String(body.providerId ?? ""),
          model: String(body.model ?? ""),
          wasTruncated: Boolean(body.wasTruncated),
          persistWarning:
            typeof body.detail === "string"
              ? body.detail
              : "PDF filled and signed, but the summary couldn't be saved to your files. Download the PDF below before leaving.",
        });
        return;
      }

      // Late-401 fallback — render-time gate + getSession() probe should
      // normally catch this earlier.
      if (res.status === 401) {
        router.push(SIGN_IN_HREF);
        return;
      }

      setError(mapErrorBody(res.status, body));
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Fill & sign failed — check your connection and try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={addFiles}
          prompt="Drop a PDF to fill & sign"
          hint="Up to 25 MB · processed on our servers with credits."
        />
      ) : (
        <div
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 16px",
          }}
        >
          <span style={{ color: "var(--fg-subtle)" }}>
            <I.File size={16} />
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
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            aria-label="Remove"
            disabled={busy}
            onClick={() => setFile(null)}
            style={{ padding: 6, color: "var(--fg-subtle)" }}
          >
            <I.X size={14} />
          </button>
        </div>
      )}

      {/* Personal info grid */}
      <div
        className="card"
        style={{
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div>
          <div className="eyebrow" style={{ fontSize: 11, letterSpacing: "0.08em", marginBottom: 6 }}>
            YOUR DETAILS
          </div>
          <div className="subtle" style={{ fontSize: 12, lineHeight: 1.5 }}>
            Leave blank anything the form doesn&apos;t ask for — we only draw what fits.
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <Field
            label="Full name *"
            placeholder="Jane Doe"
            value={fullName}
            onChange={setFullName}
            disabled={busy}
            maxLength={120}
            required
          />
          <Field
            label="Initials"
            placeholder="JD"
            value={initials}
            onChange={setInitials}
            disabled={busy}
            maxLength={8}
            hint="Auto-derived from your name if blank."
          />
          <Field
            label="Email"
            placeholder="jane@example.com"
            value={email}
            onChange={setEmail}
            disabled={busy}
            maxLength={120}
            type="email"
          />
          <Field
            label="Phone"
            placeholder="+1 555-123-4567"
            value={phone}
            onChange={setPhone}
            disabled={busy}
            maxLength={40}
            type="tel"
          />
          <Field
            label="Date"
            placeholder="2026-04-20"
            value={date}
            onChange={setDate}
            disabled={busy}
            maxLength={40}
            hint="Defaults to today."
          />
          <Field
            label="Company"
            placeholder="Acme Inc."
            value={company}
            onChange={setCompany}
            disabled={busy}
            maxLength={120}
          />
          <Field
            label="Title"
            placeholder="Head of Operations"
            value={title}
            onChange={setTitle}
            disabled={busy}
            maxLength={120}
          />
          <Field
            label="Address"
            placeholder="123 Main St, City, ST 12345"
            value={address}
            onChange={setAddress}
            disabled={busy}
            maxLength={200}
          />
        </div>

        {/* Custom fields table */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <div>
              <div
                className="eyebrow"
                style={{ fontSize: 11, letterSpacing: "0.08em" }}
              >
                CUSTOM FIELDS
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                Form-specific values (e.g. Employee ID, Case Number).
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={addCustomRow}
              disabled={busy || customFields.length >= MAX_CUSTOM_FIELDS}
              title={
                customFields.length >= MAX_CUSTOM_FIELDS
                  ? `Max ${MAX_CUSTOM_FIELDS} custom fields`
                  : "Add a custom field"
              }
            >
              <I.Plus size={14} />
              <span>Add field</span>
            </button>
          </div>

          {customFields.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {customFields.map((row, idx) => (
                <div
                  key={idx}
                  className="row"
                  style={{ gap: 8, alignItems: "stretch" }}
                >
                  <input
                    type="text"
                    className="input"
                    placeholder="Key (e.g. employee_id)"
                    value={row.key}
                    maxLength={60}
                    disabled={busy}
                    onChange={(e) =>
                      updateCustomRow(idx, { key: e.target.value })
                    }
                    style={{ padding: "8px 10px", fontSize: 13, flex: "1 1 200px" }}
                  />
                  <input
                    type="text"
                    className="input"
                    placeholder="Value"
                    value={row.value}
                    maxLength={200}
                    disabled={busy}
                    onChange={(e) =>
                      updateCustomRow(idx, { value: e.target.value })
                    }
                    style={{ padding: "8px 10px", fontSize: 13, flex: "1 1 300px" }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    aria-label="Remove row"
                    disabled={busy}
                    onClick={() => removeCustomRow(idx)}
                    style={{ padding: 6, color: "var(--fg-subtle)" }}
                  >
                    <I.X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="card"
          style={{
            padding: 14,
            borderColor: "var(--red)",
            background: "var(--red-soft, rgba(220,38,38,0.08))",
            color: "var(--red)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}

      {result && <ResultCard result={result} />}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {(file || result) && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={reset}
          >
            Reset
          </button>
        )}
        {isAnonymous ? (
          <Link
            href={SIGN_IN_HREF}
            className="btn btn-primary"
            title="Sign in to use AI tools — credits are per-user."
          >
            Sign in to fill & sign
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !canSubmit}
            onClick={run}
          >
            {/* Bundle G5: lib/tools.ts canonical "~10 credits per doc" — preserve ~. */}
            {busy ? "Filling…" : "Fill & sign — ~10 credits"}
          </button>
        )}
      </div>
    </div>
  );
}

/** ------------------------------------------------------------------ */

function Field({
  label,
  placeholder,
  value,
  onChange,
  disabled,
  maxLength,
  type,
  required,
  hint,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  maxLength?: number;
  type?: "text" | "email" | "tel";
  required?: boolean;
  hint?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        className="eyebrow"
        style={{ fontSize: 11, letterSpacing: "0.08em" }}
      >
        {label.toUpperCase()}
      </span>
      <input
        type={type ?? "text"}
        className="input"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: "9px 11px", fontSize: 14 }}
      />
      {hint && (
        <span className="subtle" style={{ fontSize: 11 }}>
          {hint}
        </span>
      )}
    </label>
  );
}

/** ------------------------------------------------------------------ */

function ResultCard({ result }: { result: SignResult }) {
  const sigCount = result.filled.filter((f) => f.isSignature).length;
  const fieldCount = result.filled.length - sigCount;
  const canDownload = Boolean(
    result.signedPdfBase64 && result.signedPdfFilename
  );

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
        borderColor: result.persistWarning
          ? "var(--amber, #d97706)"
          : "var(--accent)",
      }}
    >
      {/* Header */}
      <div
        className="row"
        style={{
          gap: 12,
          alignItems: "center",
          padding: "14px 18px",
          background: result.persistWarning
            ? "var(--amber-soft, rgba(217,119,6,0.08))"
            : "var(--accent-soft)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: result.persistWarning
              ? "var(--amber, #d97706)"
              : "var(--accent)",
            color: "var(--bg-1)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          {result.persistWarning ? (
            <I.Info size={16} />
          ) : (
            <I.Pen size={16} />
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 14 }}>
            {result.persistWarning
              ? `Filled (summary not saved)`
              : result.filled.length === 0
                ? `No fillable fields found`
                : `Filled ${fieldCount} field${
                    fieldCount === 1 ? "" : "s"
                  }${sigCount > 0 ? ` + ${sigCount} signature${sigCount === 1 ? "" : "s"}` : ""}`}
          </div>
          <div className="subtle" style={{ fontSize: 12 }}>
            {result.pageCount
              ? `${result.pageCount} page${result.pageCount === 1 ? "" : "s"} · `
              : ""}
            {result.creditCost} credit
            {result.creditCost === 1 ? "" : "s"} spent
            {typeof result.newBalance === "number"
              ? ` · ${result.newBalance} left`
              : ""}
            {result.wasTruncated ? " · truncated (very long doc)" : ""}
            {result.replay ? " · replayed" : ""}
          </div>
        </div>
        {result.fileId && (
          <Link
            href={`/app/files/${result.fileId}/preview`}
            className="btn btn-sm btn-ghost"
            title="View summary on Files"
          >
            <I.Eye size={14} />
            <span>Summary</span>
          </Link>
        )}
      </div>

      {result.persistWarning && (
        <div
          style={{
            padding: "10px 18px",
            fontSize: 13,
            color: "var(--fg-muted)",
            background: "var(--amber-soft, rgba(217,119,6,0.06))",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {result.persistWarning}
        </div>
      )}

      {/* Download row + legal caveat */}
      <div
        style={{
          padding: "16px 18px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          {canDownload ? (
            <DownloadSignedButton
              base64={result.signedPdfBase64 as string}
              filename={result.signedPdfFilename as string}
            />
          ) : (
            <div
              className="subtle"
              style={{ fontSize: 13, fontStyle: "italic" }}
            >
              {result.replay
                ? "Re-run the tool to download a fresh filled PDF — replays only return the saved summary."
                : "No filled PDF returned."}
            </div>
          )}
        </div>
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.55,
            background: "var(--amber-soft, rgba(217,119,6,0.08))",
            border: "1px solid var(--amber, #d97706)",
            borderRadius: 8,
            padding: "10px 12px",
            color: "var(--fg-muted)",
          }}
        >
          <strong style={{ color: "var(--amber, #d97706)" }}>
            Not a cryptographic signature.
          </strong>{" "}
          We draw your typed name and values onto the page as regular
          text — there&apos;s no PKI, no timestamp authority, no tamper-
          evidence. For legally-binding e-signatures (employment
          contracts, real-estate closings, etc.), use DocuSign or
          Adobe Sign instead.
        </div>
      </div>

      {/* Rendered markdown summary */}
      <div
        className="prose-mini"
        style={{ padding: "20px 22px", fontSize: 14, lineHeight: 1.65 }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(result.markdown) }}
      />

      {/* Provenance footer */}
      <div
        className="subtle mono"
        style={{
          padding: "10px 18px",
          fontSize: 11,
          letterSpacing: "0.04em",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-2)",
        }}
      >
        {result.providerId.toUpperCase()} · {result.model}
      </div>
    </div>
  );
}

/** Converts base64 → Blob → anchor click to trigger a download. */
function DownloadSignedButton({
  base64,
  filename,
}: {
  base64: string;
  filename: string;
}) {
  const download = () => {
    try {
      // atob → binary string → Uint8Array — standard browser path.
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4_000);
    } catch (err) {
      console.error("[SignPdfTool] download failed", err);
      alert(
        "Couldn't decode the filled PDF. Try running the tool again — if it keeps failing, contact support."
      );
    }
  };

  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={download}
      title="Download filled PDF"
    >
      <I.Download size={14} />
      <span>Download filled PDF</span>
    </button>
  );
}

/** ------------------------------------------------------------------ */

function mapErrorBody(
  status: number,
  body: Record<string, unknown>
): string {
  const code = typeof body.error === "string" ? body.error : "";
  const detail = typeof body.detail === "string" ? body.detail : "";

  // Tool-specific 502 — takes precedence over the shared classifier
  // because `sign_parse_failed` is a parse-layer issue with distinct
  // user copy ("retry" rather than "upstream is down").
  if (status === 502 && code === "sign_parse_failed") {
    return (
      detail ||
      "The AI returned output we couldn't parse. We've refunded your credits — please retry."
    );
  }

  // Shared AI-degradation band (401 / 429 / 502 / 503). See
  // lib/ai/degradation.ts for the full rationale.
  const degraded = classifyAiError(status, body, {
    opLabel: "fill & sign",
  });
  if (degraded.kind !== "unknown") return degraded.userMessage;

  switch (status) {
    case 402: {
      const required = typeof body.required === "number" ? body.required : 10;
      const balance = typeof body.balance === "number" ? body.balance : 0;
      return `Not enough credits — this run costs ${required}, you have ${balance}. Top up on /app/billing.`;
    }
    case 409:
      return (
        detail ||
        "This request is already in flight or has been processed. Check /app/files for the summary."
      );
    case 413:
      if (code === "info_too_large") {
        return (
          detail ||
          "Your personal info payload is too large — trim custom fields."
        );
      }
      return "PDF is too large — the fill-and-sign tool accepts up to 25 MB.";
    case 422:
      if (code === "no_extractable_text") {
        return (
          detail ||
          "We couldn't find text in this PDF — it looks scanned. Run OCR first, then try again."
        );
      }
      return detail || "Couldn't process this PDF.";
    case 400:
      return detail || "Check your inputs — something doesn't look right.";
    default:
      return detail || `Fill & sign failed (status ${status}).`;
  }
}
