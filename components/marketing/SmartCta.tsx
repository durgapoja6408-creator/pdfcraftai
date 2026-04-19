"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useSession } from "next-auth/react";

/**
 * SmartCta — a session-aware Link.
 *
 * When the user is logged in, swap the href/label to point them at their
 * dashboard (or wherever `authedHref` says) instead of /register or /login.
 * Falls back to the anonymous variant while the session is loading so we
 * don't ship a flicker.
 *
 * Usage:
 *   <SmartCta
 *     anon={{ href: "/register", label: "Get started free" }}
 *     authed={{ href: "/app/dashboard", label: "Open dashboard" }}
 *     className="btn btn-lg btn-primary"
 *   >
 *     {(label) => <>{label} <I.ArrowRight size={16} /></>}
 *   </SmartCta>
 */
export function SmartCta({
  anon,
  authed,
  className,
  style,
  children,
}: {
  anon: { href: string; label: string };
  authed: { href: string; label: string };
  className?: string;
  style?: React.CSSProperties;
  children?: (label: string) => ReactNode;
}) {
  const { status } = useSession();
  const useAuthed = status === "authenticated";
  const target = useAuthed ? authed : anon;
  return (
    <Link href={target.href} className={className} style={style}>
      {children ? children(target.label) : target.label}
    </Link>
  );
}
