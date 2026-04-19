"use client";

import { useEffect, useState } from "react";
import { I } from "@/components/icons/Icons";

/**
 * Theme toggle for the marketing + app TopNav.
 *
 * Works with the no-flash inline script in `app/layout.tsx` which reads
 * `pdfcraft_state.theme` from localStorage before hydration. We update
 * both `document.documentElement[data-theme]` and the same localStorage
 * key so:
 *   1. The current view flips instantly
 *   2. A page reload picks up the chosen theme before React mounts
 *   3. The value survives across routes (no flash on client-side nav
 *      because the html element is persisted)
 *
 * The component renders a compact icon button matching `btn-sm btn-ghost`
 * so it slots into the TopNav actions row without extra styling.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Hydration-safe read: the html element is the source of truth because
    // the pre-hydration script has already applied the stored value.
    const current =
      (document.documentElement.getAttribute("data-theme") as "dark" | "light" | null) ?? "dark";
    setTheme(current);
    setMounted(true);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      const raw = localStorage.getItem("pdfcraft_state");
      const existing = raw ? JSON.parse(raw) : {};
      localStorage.setItem(
        "pdfcraft_state",
        JSON.stringify({ ...existing, theme: next }),
      );
    } catch {
      // localStorage unavailable (private mode, SSR edge) — toggle still
      // flips the current view; next reload just reverts to the default.
    }
  }

  // Before hydration we render the dark-mode icon to match the default
  // <html data-theme="dark">. `suppressHydrationWarning` on the button
  // keeps React quiet if the stored theme disagrees — the pre-hydration
  // script already fixed the page, we just update the icon after mount.
  const isLight = mounted && theme === "light";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
      title={isLight ? "Switch to dark theme" : "Switch to light theme"}
      className={className ?? "btn btn-sm btn-ghost"}
      style={{ padding: 8, lineHeight: 0 }}
      suppressHydrationWarning
    >
      {isLight ? <I.Moon size={16} /> : <I.Sun size={16} />}
    </button>
  );
}
