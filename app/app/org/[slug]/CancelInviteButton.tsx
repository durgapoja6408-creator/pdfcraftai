// CancelInviteButton — renders next to each pending invite row
// (Phase F-4, 2026-05-05).
//
// Single-purpose client component: confirm() → cancelInviteAction
// → router.refresh() on success. Defense-in-depth on the action
// side re-checks canManageMembers, so even a hostile client that
// rendered this button outside the canManage gate can't bypass
// the writer's permission predicate.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { cancelInviteAction } from "./actions";

interface Props {
  orgId: string;
  inviteId: string;
  email: string;
}

export function CancelInviteButton({ orgId, inviteId, email }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCancel() {
    setError(null);
    if (
      !confirm(
        `Cancel the invite for ${email}? The invite link will stop working immediately.`,
      )
    ) {
      return;
    }
    setBusy(true);
    startTransition(async () => {
      const result = await cancelInviteAction({ orgId, inviteId });
      setBusy(false);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        className="btn btn-outline"
        style={{
          fontSize: 11,
          padding: "3px 8px",
          borderColor: "#c00",
          color: "#c00",
        }}
        onClick={handleCancel}
        disabled={busy || pending}
      >
        {busy ? "Cancelling…" : "Cancel"}
      </button>
      {error ? (
        <div
          role="alert"
          style={{
            fontSize: 10,
            color: "#c00",
            padding: "3px 6px",
            background: "color-mix(in oklab, #c00 6%, transparent)",
            borderRadius: 3,
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
