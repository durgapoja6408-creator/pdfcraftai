"use client";

/**
 * /tool/protect — client-side PDF protect + unlock runner.
 *
 * Two modes in one runner:
 *
 * 1. "Protect" — user uploads a plain PDF, sets a password (and optional
 *    owner password + permissions), downloads an encrypted PDF.
 * 2. "Unlock"  — user uploads a password-protected PDF + the password,
 *    downloads a decrypted PDF (password stripped, permissions reset).
 *
 * pdf-lib 1.17 (the one in our package.json) does NOT implement the
 * PDF encryption handler, so we dynamic-import `@cantoo/pdf-lib` —
 * a maintained fork whose API is identical to pdf-lib except that it
 * adds:
 *   - PDFDocument.load(bytes, { password }) — opens an encrypted PDF
 *   - pdfDoc.encrypt({ userPassword, ownerPassword, permissions }) —
 *     writes the Encrypt dictionary on the next .save() call.
 *
 * We dynamic-import it so that the main pdf-lib bundle (used by every
 * other tool) isn't duplicated on runners that don't need encryption.
 *
 * Everything is still 100% client-side — the password never leaves the
 * browser. Same reassurance card as the other free tools.
 */

import { useEffect, useRef, useState } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import {
  downloadBytes,
  humanSize,
  sha256HexOfBytes,
  deriveOutputName,
} from "@/lib/client/pdf-utils";
import { logToolResultAction } from "@/lib/tool-result-actions";
import { useTrackToolView } from "./useToolTracking";

type Mode = "protect" | "unlock";

type Permissions = {
  printing: boolean;
  copying: boolean;
  modifying: boolean;
  annotating: boolean;
};

const DEFAULT_PERMS: Permissions = {
  printing: true,
  copying: false,
  modifying: false,
  annotating: true,
};

// ---------------------------------------------------------------------------
// Lazy pdf-lib-with-encrypt loader. Only the first use pays the import cost;
// every subsequent call reuses the cached module. Wrapped in a tiny helper so
// the component can stay `async`-free in its render body.
// ---------------------------------------------------------------------------
type CantooModule = typeof import("@cantoo/pdf-lib");
let _cantooPromise: Promise<CantooModule> | null = null;
function loadCantoo(): Promise<CantooModule> {
  if (!_cantooPromise) {
    _cantooPromise = import("@cantoo/pdf-lib");
  }
  return _cantooPromise;
}

export function ProtectPdfTool() {
  useTrackToolView("protect", "Security");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("protect");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [ownerPassword, setOwnerPassword] = useState("");
  const [permissions, setPermissions] = useState<Permissions>(DEFAULT_PERMS);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [detected, setDetected] = useState<
    | null
    | {
        pageCount: number | null;
        isEncrypted: boolean;
      }
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    bytes: Uint8Array;
    name: string;
    size: number;
    pages: number;
  } | null>(null);

  // Keep a ref to the most-recent file so the detection effect can bail
  // cleanly if the user swaps files while a previous probe is in flight.
  const fileRef = useRef<File | null>(null);
  useEffect(() => {
    fileRef.current = file;
  }, [file]);

  // When a file is chosen, try to peek at it to count pages and detect
  // encryption. For encrypted files we can't count pages until the user
  // provides the password, but we can tell it's encrypted.
  useEffect(() => {
    let cancelled = false;
    setDetected(null);
    setError(null);
    setResult(null);
    if (!file) return;
    (async () => {
      try {
        const { PDFDocument } = await loadCantoo();
        const bytes = await file.arrayBuffer();
        // First pass: try without password, but opt out of throwing
        // on encryption. If the file is encrypted, this call surfaces
        // the encryption without forcing us to handle an error path.
        try {
          const doc = await PDFDocument.load(bytes, {
            ignoreEncryption: true,
          });
          if (cancelled || fileRef.current !== file) return;
          setDetected({
            pageCount: doc.getPageCount(),
            isEncrypted: doc.isEncrypted,
          });
          // Nudge the mode to match: encrypted → unlock, otherwise protect.
          if (doc.isEncrypted) setMode("unlock");
          else setMode("protect");
        } catch (inner) {
          // Couldn't parse at all (corrupt, not actually a PDF, etc.).
          if (cancelled) return;
          setError(
            inner instanceof Error
              ? `Could not read the PDF: ${inner.message}`
              : "Could not read the PDF.",
          );
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? `Could not load encryption module: ${err.message}`
            : "Could not load encryption module.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const reset = () => {
    setFile(null);
    setMode("protect");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setOwnerPassword("");
    setPermissions(DEFAULT_PERMS);
    setUnlockPassword("");
    setDetected(null);
    setBusy(false);
    setError(null);
    setResult(null);
  };

  const protectDisabled =
    busy ||
    !file ||
    password.length < 4 ||
    password !== confirmPassword;
  const unlockDisabled = busy || !file || unlockPassword.length === 0;

  async function runProtect() {
    if (!file) return;
    if (password.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { PDFDocument } = await loadCantoo();
      const bytes = await file.arrayBuffer();
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      doc.encrypt({
        userPassword: password,
        // If the user didn't set an owner password, reuse the user's so
        // they still have full owner access when reopening.
        ownerPassword: ownerPassword.trim() || password,
        permissions: {
          // pdf-lib's permissions model treats `printing` as a tri-state
          // ('highResolution' | 'lowResolution' | false). We ship the
          // simpler "printing yes/no" here; 'highResolution' preserves the
          // user's print quality when printing is allowed.
          printing: permissions.printing ? "highResolution" : false,
          modifying: permissions.modifying,
          copying: permissions.copying,
          annotating: permissions.annotating,
          fillingForms: true,
          contentAccessibility: true,
          documentAssembly: permissions.modifying,
        },
      });
      const out = await doc.save({ useObjectStreams: true });
      const name = deriveOutputName(file.name, "-protected");
      setResult({
        bytes: out,
        name,
        size: out.length,
        pages: doc.getPageCount(),
      });

      try {
        const sha256 = await sha256HexOfBytes(out);
        await logToolResultAction({
          toolId: "protect",
          name,
          mime: "application/pdf",
          sizeBytes: out.length,
          sha256,
        });
      } catch (logErr) {
        console.warn("logToolResult failed (non-fatal):", logErr);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Protect failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runUnlock() {
    if (!file) return;
    if (!unlockPassword) {
      setError("Enter the password that was set on this PDF.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { PDFDocument } = await loadCantoo();
      const bytes = await file.arrayBuffer();
      let doc;
      try {
        doc = await PDFDocument.load(bytes, { password: unlockPassword });
      } catch (inner) {
        // Bad password is the overwhelmingly common failure — keep the
        // copy user-friendly instead of echoing the library's exception.
        const msg =
          inner instanceof Error && /password/i.test(inner.message)
            ? "That password didn't unlock the file. Double-check it and try again."
            : inner instanceof Error
              ? inner.message
              : "Could not unlock the PDF.";
        throw new Error(msg);
      }
      // Explicitly do NOT call doc.encrypt() here — on save, the output
      // is emitted without the Encrypt dictionary, i.e. fully decrypted.
      const out = await doc.save({ useObjectStreams: true });
      const name = deriveOutputName(file.name, "-unlocked");
      setResult({
        bytes: out,
        name,
        size: out.length,
        pages: doc.getPageCount(),
      });

      try {
        const sha256 = await sha256HexOfBytes(out);
        await logToolResultAction({
          toolId: "protect",
          name,
          mime: "application/pdf",
          sizeBytes: out.length,
          sha256,
        });
      } catch (logErr) {
        console.warn("logToolResult failed (non-fatal):", logErr);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unlock failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone onFiles={(files) => setFile(files[0] ?? null)} />
      ) : (
        <>
          <div
            className="card"
            style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}
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
                {detected?.pageCount != null && ` · ${detected.pageCount} pages`}
                {detected?.isEncrypted && " · encrypted"}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              aria-label="Remove"
              disabled={busy}
              onClick={reset}
              style={{ padding: 6, color: "var(--fg-subtle)" }}
            >
              <I.X size={14} />
            </button>
          </div>

          <div>
            <label
              className="subtle"
              style={{ fontSize: 12, display: "block", marginBottom: 6 }}
            >
              Mode
            </label>
            <div className="row" style={{ gap: 8 }}>
              <ModeButton
                active={mode === "protect"}
                disabled={busy}
                onClick={() => setMode("protect")}
                label="Protect (add password)"
              />
              <ModeButton
                active={mode === "unlock"}
                disabled={busy}
                onClick={() => setMode("unlock")}
                label="Unlock (remove password)"
              />
            </div>
            {detected?.isEncrypted && mode === "protect" && (
              <p className="subtle" style={{ fontSize: 12, marginTop: 8 }}>
                This file is already password-protected — switch to{" "}
                <strong>Unlock</strong> to remove its password.
              </p>
            )}
            {detected && !detected.isEncrypted && mode === "unlock" && (
              <p className="subtle" style={{ fontSize: 12, marginTop: 8 }}>
                This file doesn't appear to be password-protected. You can
                still try to unlock it, but there may be nothing to remove.
              </p>
            )}
          </div>

          {mode === "protect" ? (
            <>
              <PasswordInput
                label="Password"
                value={password}
                onChange={setPassword}
                show={showPassword}
                onToggleShow={() => setShowPassword((v) => !v)}
                disabled={busy}
                autoComplete="new-password"
                placeholder="At least 4 characters"
              />
              <PasswordInput
                label="Confirm password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                show={showPassword}
                disabled={busy}
                autoComplete="new-password"
                placeholder="Re-enter the same password"
                errorText={
                  confirmPassword.length > 0 &&
                  confirmPassword !== password
                    ? "Doesn't match"
                    : undefined
                }
              />
              <details>
                <summary
                  className="subtle"
                  style={{ fontSize: 13, cursor: "pointer" }}
                >
                  Advanced: set a separate owner password + permissions
                </summary>
                <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                  <PasswordInput
                    label="Owner password (optional)"
                    value={ownerPassword}
                    onChange={setOwnerPassword}
                    show={showPassword}
                    disabled={busy}
                    autoComplete="new-password"
                    placeholder="Blank = same as user password"
                  />
                  <p className="subtle" style={{ fontSize: 12, margin: 0 }}>
                    Anyone opening the PDF with the user password will only be
                    allowed the permissions below. The owner password grants
                    full access regardless of these settings.
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: 8,
                    }}
                  >
                    <PermissionToggle
                      label="Allow printing"
                      checked={permissions.printing}
                      disabled={busy}
                      onChange={(v) =>
                        setPermissions((p) => ({ ...p, printing: v }))
                      }
                    />
                    <PermissionToggle
                      label="Allow copying text"
                      checked={permissions.copying}
                      disabled={busy}
                      onChange={(v) =>
                        setPermissions((p) => ({ ...p, copying: v }))
                      }
                    />
                    <PermissionToggle
                      label="Allow editing content"
                      checked={permissions.modifying}
                      disabled={busy}
                      onChange={(v) =>
                        setPermissions((p) => ({ ...p, modifying: v }))
                      }
                    />
                    <PermissionToggle
                      label="Allow annotations"
                      checked={permissions.annotating}
                      disabled={busy}
                      onChange={(v) =>
                        setPermissions((p) => ({ ...p, annotating: v }))
                      }
                    />
                  </div>
                </div>
              </details>
              <p className="subtle" style={{ fontSize: 12, margin: 0 }}>
                The password is processed only in your browser — the PDF never
                leaves your device. We can't recover it if you lose it.
              </p>
            </>
          ) : (
            <>
              <PasswordInput
                label="Current password"
                value={unlockPassword}
                onChange={setUnlockPassword}
                show={showPassword}
                onToggleShow={() => setShowPassword((v) => !v)}
                disabled={busy}
                autoComplete="current-password"
                placeholder="Password set when the PDF was protected"
              />
              <p className="subtle" style={{ fontSize: 12, margin: 0 }}>
                The password is checked in your browser. We don't brute-force
                or bypass passwords — you need to know it.
              </p>
            </>
          )}
        </>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--red, #ef4444)", fontSize: 13, margin: 0 }}>
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
                {mode === "protect"
                  ? "PDF password-protected"
                  : "Password removed"}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {result.pages} pages · {humanSize(result.size)}
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
        <button
          type="button"
          className="btn btn-primary"
          disabled={mode === "protect" ? protectDisabled : unlockDisabled}
          onClick={() => (mode === "protect" ? runProtect() : runUnlock())}
        >
          {busy
            ? mode === "protect"
              ? "Protecting…"
              : "Unlocking…"
            : mode === "protect"
              ? "Protect PDF"
              : "Unlock PDF"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Internal bits                                                             */
/* ------------------------------------------------------------------------- */

function ModeButton({
  active,
  disabled,
  onClick,
  label,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="btn btn-sm"
      disabled={disabled}
      onClick={onClick}
      style={{
        background: active ? "var(--accent)" : "var(--bg-1)",
        color: active ? "var(--bg-1)" : "var(--fg)",
        border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
      }}
    >
      {label}
    </button>
  );
}

function PasswordInput({
  label,
  value,
  onChange,
  show,
  onToggleShow,
  disabled,
  autoComplete,
  placeholder,
  errorText,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow?: () => void;
  disabled: boolean;
  autoComplete: string;
  placeholder?: string;
  errorText?: string;
}) {
  return (
    <div>
      <label
        className="subtle"
        style={{ fontSize: 12, display: "block", marginBottom: 6 }}
      >
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoComplete={autoComplete}
          spellCheck={false}
          placeholder={placeholder}
          className="input"
          style={{
            width: "100%",
            padding: "10px 12px",
            paddingRight: onToggleShow ? 40 : 12,
            fontSize: 14,
            background: "var(--bg-1)",
            border: `1px solid ${errorText ? "var(--red, #ef4444)" : "var(--border)"}`,
            borderRadius: "var(--radius)",
            color: "var(--fg)",
          }}
        />
        {onToggleShow && (
          <button
            type="button"
            onClick={onToggleShow}
            disabled={disabled}
            aria-label={show ? "Hide password" : "Show password"}
            className="btn btn-ghost btn-sm"
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              padding: 6,
              color: "var(--fg-subtle)",
            }}
          >
            {show ? <I.EyeOff size={14} /> : <I.Eye size={14} />}
          </button>
        )}
      </div>
      {errorText && (
        <div style={{ color: "var(--red, #ef4444)", fontSize: 12, marginTop: 4 }}>
          {errorText}
        </div>
      )}
    </div>
  );
}

function PermissionToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className="row"
      style={{
        gap: 8,
        fontSize: 13,
        cursor: disabled ? "not-allowed" : "pointer",
        color: disabled ? "var(--fg-subtle)" : "var(--fg)",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: "var(--accent)" }}
      />
      {label}
    </label>
  );
}
