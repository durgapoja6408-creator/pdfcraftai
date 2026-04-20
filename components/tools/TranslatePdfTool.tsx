// TranslatePdfTool — Phase 5.2 client runner.
//
// Pattern mirrors SummarizePdfTool. User picks a target language, we
// POST to /api/ai/translate, render the returned markdown inline.
//
// Language picker UX:
//   - Default: dropdown of ~20 curated languages from
//     COMMON_TARGET_LANGUAGES. Their `name` fields are in-language
//     ("Español" not "Spanish") so the user sees what the output will
//     look like.
//   - "Other…" option reveals a free-text input that accepts any
//     BCP-47-ish code (client regex mirrors the server-side check).
//     This covers rare languages without bloating the primary UI.
//
// Error handling — same REST-code → human-copy mapping as summarize,
// with translate-specific wording (5 credits, language-picker hint).

"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, getSession } from "next-auth/react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { renderMarkdown } from "@/lib/markdown-mini";
import { COMMON_TARGET_LANGUAGES } from "@/lib/ai/translate-langs";
import { MacroBar, type MacroBarItem } from "./MacroBar";
import {
  createMacroAction,
  deleteMacroAction,
  listMacrosForToolAction,
} from "@/lib/macro-actions";

// Client-side mirror of the server's BCP-47-ish regex. Kept in sync
// with /api/ai/translate/route.ts (search for BCP47_ISH).
const BCP47_ISH = /^[a-zA-Z]{1,3}(-[a-zA-Z0-9]{1,8})*$/;

const OTHER_CODE_SENTINEL = "__other__";

const TOOL_ID = "ai-translate";

const COMMON_LANG_CODES: Set<string> = new Set(
  COMMON_TARGET_LANGUAGES.map((l) => l.code)
);

type TranslationResult = {
  fileId?: string;
  filename?: string;
  markdown: string;
  creditCost: number;
  newBalance?: number;
  pageCount?: number;
  providerId: string;
  model: string;
  targetLang: string;
  targetLangLabel: string | null;
  wasChunked: boolean;
  wasTruncated: boolean;
  chunkCount: number;
  /** Non-empty on 207 — compute succeeded, persist failed. */
  persistWarning?: string;
};

// Pre-encoded Sign-in CTA target — see SummarizePdfTool for rationale.
const SIGN_IN_HREF =
  "/login?callbackUrl=" + encodeURIComponent("/tool/ai-translate");

export function TranslatePdfTool() {
  const router = useRouter();
  // Anonymous-user gate: swap the Run button for a Sign-in CTA so the
  // PDF never gets uploaded. See SummarizePdfTool for the full rationale.
  const { status: sessionStatus } = useSession();
  const isAnonymous = sessionStatus === "unauthenticated";
  const [file, setFile] = useState<File | null>(null);
  // Default to Spanish — common target for English source docs and it's
  // the second-most-searched "translate PDF to X" query.
  const [langChoice, setLangChoice] = useState<string>("es");
  const [customLang, setCustomLang] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranslationResult | null>(null);

  // Phase 6.1 macros — chip row above the language select.
  const [macros, setMacros] = useState<MacroBarItem[]>([]);
  const [canSave, setCanSave] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listMacrosForToolAction({ toolId: TOOL_ID });
      if (cancelled || !res.ok) return;
      setCanSave(res.canSave);
      setMacros(
        res.macros.map((m) => ({ id: m.id, name: m.name, params: m.params }))
      );
    })().catch((err) => {
      console.warn("[TranslatePdfTool] load macros failed", err);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Derive the current effective target-language code for matching
  // against saved macros. Returns null when the user is in "Other…"
  // mode with an empty or invalid code (no macro matches then).
  const currentTargetLang =
    langChoice === OTHER_CODE_SENTINEL
      ? (() => {
          const trimmed = customLang.trim();
          return trimmed && BCP47_ISH.test(trimmed) ? trimmed : null;
        })()
      : langChoice;

  const activeMacroId =
    currentTargetLang != null
      ? macros.find(
          (m) =>
            typeof m.params.targetLang === "string" &&
            m.params.targetLang === currentTargetLang
        )?.id ?? null
      : null;

  const applyMacro = useCallback((m: MacroBarItem) => {
    const lang = m.params.targetLang;
    if (typeof lang !== "string") return;
    // Decide whether the macro's language maps to a dropdown option
    // or should land in the "Other…" input. This mirrors the same
    // split the user would make by hand.
    if (COMMON_LANG_CODES.has(lang)) {
      setLangChoice(lang);
      setCustomLang("");
    } else {
      setLangChoice(OTHER_CODE_SENTINEL);
      setCustomLang(lang);
    }
  }, []);

  const saveMacro = useCallback(
    async (name: string) => {
      // Use the derived effective lang — same value that would be
      // submitted if the user clicked Translate right now.
      if (!currentTargetLang) {
        throw new Error("Pick a valid target language before saving.");
      }
      const res = await createMacroAction({
        toolId: TOOL_ID,
        name,
        params: { targetLang: currentTargetLang },
      });
      if (!res.ok) {
        if (res.error === "duplicate_name") {
          throw new Error("A macro with that name already exists.");
        }
        if (res.error === "not_authenticated") {
          throw new Error("Sign in to save presets.");
        }
        if (res.error === "invalid_macro") {
          // The zod enum on server rejects non-common languages. The
          // UI allows custom BCP-47 for Translate runs, but macros
          // are restricted to the curated list so saved presets stay
          // portable across future updates.
          throw new Error(
            "Only common target languages can be saved as presets."
          );
        }
        throw new Error("Couldn't save macro. Try again.");
      }
      setMacros((prev) => [
        { id: res.macro.id, name: res.macro.name, params: res.macro.params },
        ...prev,
      ]);
    },
    [currentTargetLang]
  );

  const deleteMacro = useCallback(async (id: string) => {
    setMacros((prev) => {
      const snapshot = prev;
      const next = prev.filter((m) => m.id !== id);
      void (async () => {
        const res = await deleteMacroAction({ id }).catch(() => null);
        if (!res || !res.ok) {
          setMacros((curr) =>
            curr.some((m) => m.id === id) ? curr : snapshot
          );
        }
      })();
      return next;
    });
  }, []);

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

  /** Resolve the effective target-language code from current state. */
  const effectiveLang = (): string | null => {
    if (langChoice === OTHER_CODE_SENTINEL) {
      const trimmed = customLang.trim();
      if (!trimmed) return null;
      if (!BCP47_ISH.test(trimmed) || trimmed.length > 20) return null;
      return trimmed;
    }
    return langChoice;
  };

  const run = async () => {
    if (!file) {
      setError("Attach a PDF to translate.");
      return;
    }
    const targetLang = effectiveLang();
    if (!targetLang) {
      setError(
        "Enter a valid language code — for example `en`, `pt-BR`, or `zh-Hant`."
      );
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

    try {
      const form = new FormData();
      form.append("pdf", file);
      form.append("targetLang", targetLang);
      form.append("idempotencyKey", idempotencyKey);

      const res = await fetch("/api/ai/translate", {
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
          markdown: String(body.markdown ?? ""),
          creditCost: Number(body.creditCost ?? 0),
          newBalance:
            typeof body.newBalance === "number" ? body.newBalance : undefined,
          pageCount:
            typeof body.pageCount === "number" ? body.pageCount : undefined,
          providerId: String(body.providerId ?? ""),
          model: String(body.model ?? ""),
          targetLang: String(body.targetLang ?? targetLang),
          targetLangLabel:
            typeof body.targetLangLabel === "string"
              ? body.targetLangLabel
              : null,
          wasChunked: Boolean(body.wasChunked),
          wasTruncated: Boolean(body.wasTruncated),
          chunkCount: Number(body.chunkCount ?? 1),
        });
        return;
      }

      if (res.status === 207) {
        setResult({
          markdown: String(body.markdown ?? ""),
          creditCost: Number(body.creditCost ?? 0),
          providerId: String(body.providerId ?? ""),
          model: String(body.model ?? ""),
          targetLang: String(body.targetLang ?? targetLang),
          targetLangLabel:
            typeof body.targetLangLabel === "string"
              ? body.targetLangLabel
              : null,
          wasChunked: Boolean(body.wasChunked),
          wasTruncated: Boolean(body.wasTruncated),
          chunkCount: Number(body.chunkCount ?? 1),
          persistWarning:
            typeof body.detail === "string"
              ? body.detail
              : "Translation generated, but couldn't be saved to your files. Copy it below before leaving.",
        });
        return;
      }

      // Late-401 fallback — render-time gate + getSession() probe
      // should normally catch this earlier; handle the rare expired-
      // mid-upload case gracefully.
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
          : "Translate failed — check your connection and try again."
      );
    } finally {
      setBusy(false);
    }
  };

  const showCustom = langChoice === OTHER_CODE_SENTINEL;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={addFiles}
          prompt="Drop a PDF to translate"
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

      {/* Saved presets (macros) — hidden when anon + empty. */}
      <MacroBar
        macros={macros}
        canSave={canSave}
        disabled={busy}
        activeId={activeMacroId}
        onApply={applyMacro}
        onSave={saveMacro}
        onDelete={deleteMacro}
      />

      {/* Language picker */}
      <fieldset
        style={{
          border: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
        disabled={busy}
      >
        <legend
          className="eyebrow"
          style={{
            padding: 0,
            fontSize: 11,
            marginBottom: 4,
            letterSpacing: "0.08em",
          }}
        >
          TARGET LANGUAGE
        </legend>

        <select
          aria-label="Target language"
          value={langChoice}
          onChange={(e) => setLangChoice(e.target.value)}
          disabled={busy}
          className="card"
          style={{
            padding: "10px 12px",
            fontSize: 14,
            background: "var(--bg-1)",
            color: "var(--fg)",
            cursor: busy ? "not-allowed" : "pointer",
            // Native select arrow still paints; we just normalize
            // padding + border so it matches the card inputs.
          }}
        >
          {COMMON_TARGET_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name} — {lang.code}
            </option>
          ))}
          <option value={OTHER_CODE_SENTINEL}>Other (enter BCP-47 code)…</option>
        </select>

        {showCustom && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <input
              type="text"
              aria-label="Custom BCP-47 language code"
              placeholder="e.g. sw, zh-Hant, pt-BR"
              value={customLang}
              onChange={(e) => setCustomLang(e.target.value)}
              disabled={busy}
              maxLength={20}
              className="card"
              style={{
                padding: "10px 12px",
                fontSize: 14,
                background: "var(--bg-1)",
                color: "var(--fg)",
                fontFamily: "var(--font-geist-mono, monospace)",
              }}
            />
            <div className="muted" style={{ fontSize: 12 }}>
              BCP-47 language tags: 1–3 letters, optionally with subtags
              (e.g. <code>pt-BR</code>, <code>zh-Hant</code>).
            </div>
          </div>
        )}
      </fieldset>

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
        {file && (
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
            Sign in to translate
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !file}
            onClick={run}
          >
            {busy ? "Translating…" : "Translate — 5 credits"}
          </button>
        )}
      </div>
    </div>
  );
}

/** ------------------------------------------------------------------ */

function ResultCard({ result }: { result: TranslationResult }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — silent fall-through.
    }
  };

  const download = () => {
    const blob = new Blob([result.markdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename || `translation-${result.targetLang}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4_000);
  };

  const langDisplay = result.targetLangLabel
    ? `${result.targetLangLabel} (${result.targetLang})`
    : result.targetLang;

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
            <I.Check size={16} />
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 14 }}>
            {result.persistWarning
              ? `Translation generated (not saved) — ${langDisplay}`
              : `Translation ready — ${langDisplay}`}
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
            {result.wasChunked
              ? ` · ${result.chunkCount} chunk${result.chunkCount === 1 ? "" : "s"}`
              : ""}
            {result.wasTruncated ? " · truncated (very long doc)" : ""}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={copy}
          title="Copy markdown"
        >
          <I.Copy size={14} />
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={download}
          title="Download as .md"
        >
          <I.Download size={14} />
          <span>Download</span>
        </button>
        {result.fileId && (
          <Link
            href={`/app/files/${result.fileId}/preview`}
            className="btn btn-sm btn-ghost"
            title="View on Files"
          >
            <I.Eye size={14} />
            <span>View</span>
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

      {/* Rendered markdown */}
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

/** ------------------------------------------------------------------ */

function mapErrorBody(
  status: number,
  body: Record<string, unknown>
): string {
  const code = typeof body.error === "string" ? body.error : "";
  const detail = typeof body.detail === "string" ? body.detail : "";

  switch (status) {
    case 401:
      return "Sign in to translate PDFs — credits are per-user.";
    case 402: {
      const required = typeof body.required === "number" ? body.required : 5;
      const balance = typeof body.balance === "number" ? body.balance : 0;
      return `Not enough credits — this translation costs ${required}, you have ${balance}. Top up on /app/billing.`;
    }
    case 409:
      return (
        detail ||
        "This request is already in flight or has been processed. Check /app/files for the result."
      );
    case 413:
      return "PDF is too large — the translator accepts up to 25 MB.";
    case 422:
      if (code === "no_extractable_text") {
        return (
          detail ||
          "We couldn't find text in this PDF — it looks scanned. OCR is coming soon; for now, try a text-based PDF."
        );
      }
      return detail || "Couldn't process this PDF.";
    case 400:
      if (detail.toLowerCase().includes("targetlang")) {
        return detail;
      }
      return detail || "That file doesn't look like a valid PDF.";
    case 502:
      return (
        detail ||
        "The AI provider errored — we've refunded your credits. Try again in a moment."
      );
    case 503:
      return "No AI provider is configured on this deployment. Ask the admin to set ANTHROPIC_API_KEY or OPENAI_API_KEY.";
    default:
      return detail || `Translate failed (status ${status}).`;
  }
}
