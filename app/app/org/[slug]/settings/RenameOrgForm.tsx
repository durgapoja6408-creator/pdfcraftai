// RenameOrgForm — client-side form for renaming the org.
// Calls renameOrgAction. On success, refreshes the page so the
// header + breadcrumbs pick up the new name. Slug stays the same
// so the URL doesn't change.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { renameOrgAction } from "./actions";

interface Props {
  orgId: string;
  currentName: string;
  slug: string;
}

export function RenameOrgForm({ orgId, currentName, slug: _slug }: Props) {
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await renameOrgAction({ orgId, newName: name });
      if (result.ok) {
        setSuccess(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const dirty = name.trim() !== currentName.trim();

  return (
    <form onSubmit={onSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label
          htmlFor="org-rename"
          style={{
            display: "block",
            fontWeight: 600,
            fontSize: 13,
            marginBottom: 6,
          }}
        >
          Organization name
        </label>
        <input
          id="org-rename"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSuccess(false);
          }}
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

      {success ? (
        <div
          role="status"
          style={{
            padding: "8px 12px",
            borderRadius: 4,
            background: "color-mix(in oklab, #4caf50 10%, transparent)",
            color: "#4caf50",
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          Saved.
        </div>
      ) : null}

      <button
        type="submit"
        className="btn btn-primary"
        disabled={pending || !dirty || name.trim().length === 0}
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
