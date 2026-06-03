"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { I } from "@/components/icons/Icons";

const NAV = [
  { href: "/app/dashboard", label: "Dashboard", icon: "Layers" as const },
  { href: "/app/files", label: "Files", icon: "File" as const },
  { href: "/app/chat", label: "Chat", icon: "Chat" as const },
  { href: "/app/ai-history", label: "AI History", icon: "FileAi" as const },
  { href: "/app/usage", label: "Usage", icon: "Clock" as const },
  { href: "/app/billing", label: "Billing", icon: "Receipt" as const },
  { href: "/app/settings", label: "Settings", icon: "Settings" as const },
];

type UserChip = { name?: string | null; email?: string | null; image?: string | null };

export function AppShell({
  user,
  children,
}: {
  user: UserChip;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [menuOpen, setMenuOpen] = useState(false);
  const initial = (user.name?.[0] ?? user.email?.[0] ?? "?").toUpperCase();

  return (
    <div style={{ minHeight: "100dvh", display: "grid", gridTemplateColumns: "240px 1fr" }}>
      <aside
        style={{
          borderRight: "1px solid var(--border)",
          background: "var(--bg-1)",
          padding: "20px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          position: "sticky",
          top: 0,
          height: "100dvh",
          overflow: "auto",
        }}
      >
        <Link href="/" className="logo" style={{ marginBottom: 24, paddingLeft: 6 }}>
          <span className="logo-mark">P</span>
          <span>
            pdfcraft<span style={{ color: "var(--accent)" }}>ai</span>
          </span>
        </Link>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map((item) => {
            const Icon = I[item.icon];
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  borderRadius: "var(--radius)",
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  color: active ? "var(--accent)" : "var(--fg-muted)",
                  background: active ? "var(--accent-soft)" : "transparent",
                  textDecoration: "none",
                  transition: "background 150ms, color 150ms",
                }}
              >
                {Icon ? <Icon size={16} /> : null}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        <div style={{ position: "relative", paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "8px 10px",
              borderRadius: "var(--radius)",
              background: menuOpen ? "var(--bg-2)" : "transparent",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              color: "var(--fg)",
            }}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--accent-soft)",
                color: "var(--accent)",
                display: "grid",
                placeItems: "center",
                fontSize: 12,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {initial}
            </span>
            <span style={{ overflow: "hidden", flex: 1 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 500, lineHeight: 1.2, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                {user.name ?? "You"}
              </span>
              <span style={{ display: "block", fontSize: 11, color: "var(--fg-subtle)", lineHeight: 1.2, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                {user.email ?? ""}
              </span>
            </span>
          </button>

          {menuOpen && (
            <div
              role="menu"
              style={{
                position: "absolute",
                bottom: "calc(100% + 6px)",
                left: 0,
                right: 0,
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                boxShadow: "var(--shadow)",
                padding: 4,
                zIndex: 10,
              }}
            >
              <Link
                href="/app/settings"
                onClick={() => setMenuOpen(false)}
                role="menuitem"
                style={menuItem}
              >
                Account settings
              </Link>
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                role="menuitem"
                style={menuItem}
              >
                Back to site
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => signOut({ callbackUrl: "/" })}
                style={{ ...menuItem, background: "transparent", border: "none", width: "100%", textAlign: "left", cursor: "pointer" }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      <main style={{ padding: "32px 40px", maxWidth: 1200 }}>
        {children}
      </main>
    </div>
  );
}

const menuItem: React.CSSProperties = {
  display: "block",
  padding: "8px 10px",
  fontSize: 13,
  color: "var(--fg-muted)",
  textDecoration: "none",
  borderRadius: "var(--radius-sm)",
};
