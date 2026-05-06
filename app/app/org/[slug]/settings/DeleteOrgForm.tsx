// DeleteOrgForm — client-side form for permanently deleting the
// org. Two-step confirmation: (1) initially the form shows just a
// "Delete organization" button; (2) clicking expands to a typed-
// name confirmation field. Server Action ALSO re-checks the typed
// name against the expected name (defense-in-depth — hostile
// clients can skip the in-form gate).
//
// On success, navigate to /app/dashboard since the org URL is now
// a 404.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { deleteOrgAction } from "./actions";

interface Props {
  orgId: string;
  orgName: string;
}

export function DeleteOrgForm({ orgId, orgName }: Props) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function arm() {
    setArmed(true);
    setConfirmName("");
    setError(null);
  }

  function disarm() {
    setArmed(false);
    setConfirmName("");
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (confirmName.trim() !== orgName.trim()) {
      setError(
        `Type the exact organization name (\"${orgName}\") to confirm deletion.`,
      );
      return;
    }
    startTransition(async () => {
      const result = await deleteOrgAction({
        orgId,
        confirmName: confirmName.trim(),
        expectedName: orgName,
      });
      if (result.ok) {
        // Org URL is now a 404. Push to dashboard.
        router.push("/app/dashboard");
      } else {
        setError(result.error);
      }
    });
  }

  if (!armed) {
    return (
      <button
        type="button"
        className="btn btn-outline"
        style={{
          fontSize: 13,
          padding: "8px 14px",
          borderColor: "#c00",
          color: "#c00",
        }}
        onClick={arm}
      >
        Delete organization
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label
          htmlFor="org-delete-confirm"
          style={{
            display: "block",
            fontWeight: 600,
            fontSize: 13,
            marginBottom: 6,
          }}
        >
          Type the organization name to confirm
        </label>
        <p
          className="muted"
          style={{ fontSize: 12, marginBottom: 6, lineHeight: 1.4 }}
        >
          To confirm, type <code style={{ fontSize: 11 }}>{orgName}</code>{" "}
          exactly.
        </p>
        <input
          id="org-delete-confirm"
          type="text"
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          autoFocus
          required
          maxLength={255}
          disabled={pending}
          style={{
            width: "100%",
            padding: "10px 12px",
            fontSize: 14,
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--fg)",
            fontFamily: "ui-monospace, monospace",
          }}
        />
      </div>

      {error ? (
        <div
          role="alert"
          className="card"
          style={{
            padding: "8px 12px",
            borderColor: "#c00",
            background: "color-mix(in oklab, #c00 6%, transparent)",
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="submit"
          className="btn btn-primary"
          style={{
            background: "#c00",
            borderColor: "#c00",
          }}
          disabled={pending || confirmName.trim() !== orgName.trim()}
        >
          {pending ? "Deleting…" : "Permanently delete"}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={disarm}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
