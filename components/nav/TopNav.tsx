"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { I } from "@/components/icons/Icons";
import { ThemeToggle } from "@/components/nav/ThemeToggle";

type NavLink = { href: string; label: string; accent?: boolean; eyebrow?: React.ReactNode };

// 2026-05-01 (follow-up to e5a9aa8) — the Chat slot is now auth-conditional.
// Anonymous visitors land on /chat-with-pdf (public marketing surface,
// indexable, FAQs + JSON-LD); logged-in visitors land directly on
// /app/chat (their chat history dashboard).
//
// Why the conditional: sending a logged-in user from inside the app to a
// marketing page is jarring — they want to find their conversations, not
// re-read the value prop. The original e5a9aa8 commit promoted Chat to
// the top-nav but routed everyone to /chat-with-pdf, which created a
// "the marketing page is in my way" experience for returning users.
//
// All other slots are the same for both audiences, so we keep them in
// the static arrays below and inject the Chat slot at render time via
// buildNav(). Centralising the build keeps the desktop nav and the
// mobile nav in sync — drift between the two surfaces has been the
// recurring TopNav bug class since H8.
const NAV_BEFORE_CHAT: NavLink[] = [
  // H8: removed Agent + Macros (and the /studio editor those routed to).
  // The agent surface didn't earn its keep — most workflow features it
  // promised (file uploads, scheduling, sharing) weren't shipped, and
  // the per-tool pages handle the actual user flow. Per-tool macros
  // (saved configs on each /tool/* runner) still work via the separate
  // lib/macro-actions.ts code path.
  { href: "/tools", label: "tools" },
];

const NAV_AFTER_CHAT: NavLink[] = [
  { href: "/pricing", label: "pricing" },
  { href: "/blog", label: "blog" },
  { href: "/help", label: "help" },
];

function buildNav(loggedIn: boolean): NavLink[] {
  return [
    ...NAV_BEFORE_CHAT,
    { href: loggedIn ? "/app/chat" : "/chat-with-pdf", label: "chat" },
    ...NAV_AFTER_CHAT,
  ];
}

/**
 * Marketing top nav with full session awareness:
 *   - Skeleton placeholder during `status === "loading"` to prevent CLS.
 *   - Avatar image (Google profile photo) when available; fallback to initial.
 *   - Click-outside + Esc close the account menu.
 *   - Mobile: collapsible nav with a hamburger; sign-in state preserved.
 */
export function TopNav() {
  const pathname = usePathname() ?? "/";
  const t = useTranslations("nav");
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const mobileRef = useRef<HTMLDivElement | null>(null);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  // Close menus on route change.
  useEffect(() => {
    setMenuOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  // Click outside + Esc close the account menu.
  useEffect(() => {
    if (!menuOpen && !mobileOpen) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (menuOpen && menuRef.current && !menuRef.current.contains(t)) setMenuOpen(false);
      if (mobileOpen && mobileRef.current && !mobileRef.current.contains(t)) setMobileOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, mobileOpen]);

  const user = session?.user;
  const loggedIn = status === "authenticated" && !!user;
  const initial = (user?.name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase();
  // Build the NAV array fresh per render so the Chat slot's href tracks
  // the live auth state. While `status === "loading"` we route Chat to
  // the public marketing page — same destination as anonymous visitors,
  // which is the safer default than briefly flashing a logged-in URL
  // that would 401-bounce if the session ultimately resolves anonymous.
  const nav = buildNav(loggedIn);

  return (
    <header className="topnav">
      <Link href="/" className="logo">
        <span className="logo-mark">P</span>
        <span>
          pdfcraft<span style={{ color: "var(--accent)" }}>ai</span>
        </span>
      </Link>

      <nav className="topnav-links">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={isActive(item.href) ? "active" : ""}
            style={item.accent ? { color: "var(--accent)" } : undefined}
          >
            {item.eyebrow && (
              <span style={{ verticalAlign: "middle", marginRight: 4, display: "inline-flex" }}>
                {item.eyebrow}
              </span>
            )}
            {t(item.label)}
          </Link>
        ))}
      </nav>

      <div className="spacer" />

      <div className="actions">
        <ThemeToggle />
        {status === "loading" ? (
          // Reserve width to prevent layout shift while the session resolves.
          <div
            aria-hidden
            style={{
              width: 160,
              height: 32,
              background: "var(--bg-2)",
              borderRadius: 8,
              opacity: 0.6,
            }}
          />
        ) : loggedIn ? (
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="btn btn-sm btn-ghost"
              style={{ padding: "4px 10px 4px 4px", gap: 8 }}
            >
              <AvatarCircle user={user} initial={initial} size={24} />
              <span style={{ fontSize: 13 }}>
                {user?.name?.split(" ")[0] ?? t("account")}
              </span>
              <I.ChevronDown size={12} />
            </button>

            {menuOpen && (
              <div
                role="menu"
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  minWidth: 240,
                  background: "var(--bg-1)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  boxShadow: "var(--shadow)",
                  padding: 4,
                  zIndex: 50,
                }}
              >
                <div
                  style={{
                    padding: "10px 12px 12px",
                    borderBottom: "1px solid var(--border)",
                    marginBottom: 4,
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <AvatarCircle user={user} initial={initial} size={32} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        lineHeight: 1.2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {user?.name ?? t("account")}
                    </div>
                    <div
                      className="subtle"
                      style={{
                        fontSize: 11,
                        lineHeight: 1.2,
                        marginTop: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {user?.email}
                    </div>
                  </div>
                </div>
                <Link href="/app/dashboard" role="menuitem" style={menuItem}>
                  <I.Layers size={14} /> {t("dashboard")}
                </Link>
                <Link href="/app/files" role="menuitem" style={menuItem}>
                  <I.File size={14} /> {t("files")}
                </Link>
                <Link href="/app/billing" role="menuitem" style={menuItem}>
                  <I.Receipt size={14} /> {t("billing")}
                </Link>
                <Link href="/app/settings" role="menuitem" style={menuItem}>
                  <I.Settings size={14} /> {t("settings")}
                </Link>
                <div
                  style={{
                    height: 1,
                    background: "var(--border)",
                    margin: "4px 0",
                  }}
                  aria-hidden
                />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => signOut({ callbackUrl: "/" })}
                  style={{
                    ...menuItem,
                    background: "transparent",
                    border: "none",
                    width: "100%",
                    textAlign: "left",
                    cursor: "pointer",
                    color: "var(--danger, #ef4444)",
                  }}
                >
                  <I.LogOut size={14} /> {t("signOut")}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="auth-ctas">
            <Link href="/login" className="btn btn-sm btn-ghost">
              {t("logIn")}
            </Link>
            <Link href="/register" className="btn btn-sm btn-primary">
              {t("getStarted")}
            </Link>
          </div>
        )}

        <button
          type="button"
          className="topnav-hamburger btn btn-sm btn-ghost"
          aria-label={mobileOpen ? t("closeMenu") : t("openMenu")}
          aria-controls="mobile-menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          <I.Menu size={16} />
        </button>
      </div>

      {mobileOpen && (
        <div ref={mobileRef} id="mobile-menu" className="topnav-mobile">
          <nav className="col" style={{ gap: 2 }}>
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={isActive(item.href) ? "active" : ""}
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--radius)",
                  fontSize: 14,
                  color: item.accent ? "var(--accent)" : "var(--fg)",
                  textDecoration: "none",
                }}
              >
                {t(item.label)}
              </Link>
            ))}
          </nav>
          <div
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: 12,
              marginTop: 12,
              display: "flex",
              gap: 8,
            }}
          >
            {loggedIn ? (
              <>
                <Link href="/app/dashboard" className="btn btn-sm btn-primary" style={{ flex: 1, justifyContent: "center" }}>
                  {t("dashboard")}
                </Link>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => signOut({ callbackUrl: "/" })}
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  {t("signOut")}
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="btn btn-sm btn-ghost" style={{ flex: 1, justifyContent: "center" }}>
                  {t("logIn")}
                </Link>
                <Link href="/register" className="btn btn-sm btn-primary" style={{ flex: 1, justifyContent: "center" }}>
                  {t("getStarted")}
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .topnav-links { display: none; }
        .topnav-hamburger { display: inline-flex; }
        .topnav-mobile {
          position: absolute;
          left: 12px;
          right: 12px;
          top: calc(100% + 6px);
          background: var(--bg-1);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          padding: 10px;
          z-index: 40;
        }
        @media (min-width: 880px) {
          .topnav-links { display: flex; gap: 14px; align-items: center; }
          .topnav-hamburger { display: none; }
          .topnav-mobile { display: none; }
        }
      `}</style>
    </header>
  );
}

function AvatarCircle({
  user,
  initial,
  size,
}: {
  user: { image?: string | null; name?: string | null } | undefined;
  initial: string;
  size: number;
}) {
  if (user?.image) {
    return (
      <Image
        src={user.image}
        alt={user.name ?? "You"}
        width={size}
        height={size}
        unoptimized
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--accent-soft)",
        color: "var(--accent)",
        display: "inline-grid",
        placeItems: "center",
        fontSize: Math.round(size * 0.45),
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initial}
    </span>
  );
}

const menuItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 12px",
  fontSize: 13,
  color: "var(--fg-muted)",
  textDecoration: "none",
  borderRadius: "var(--radius-sm)",
};
