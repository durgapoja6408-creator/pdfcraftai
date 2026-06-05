// Client-only tool preferences (favourites + recently-used) persisted in
// the existing `pdfcraft_state` localStorage object (shared with theme —
// see components/nav/ThemeToggle.tsx). Pure list helpers (addToFront,
// toggleId) are import-free and unit-tested by scripts/test-tool-prefs.mjs;
// the localStorage wrappers are thin and degrade gracefully (private mode).

export const PREFS_KEY = "pdfcraft_state";
export const RECENT_CAP = 8;
export const PREFS_EVENT = "pdfcraft-prefs";

// Pure: move id to the front, dedupe, cap length.
export function addToFront(list: readonly string[], id: string, cap: number) {
  const next = [id];
  for (const x of list) {
    if (x !== id && next.length < cap) next.push(x);
  }
  return next;
}

// Pure: toggle membership of id.
export function toggleId(list: readonly string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [id, ...list];
}

function readState(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(PREFS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeState(patch: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    const cur = readState();
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...cur, ...patch }));
    window.dispatchEvent(new Event(PREFS_EVENT));
  } catch {
    // private mode / quota exceeded — non-fatal, prefs just won't persist.
  }
}

function asIds(v: unknown) {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

export function getFavorites() {
  return asIds(readState().favorites);
}

export function getRecent() {
  return asIds(readState().recent);
}

export function toggleFavorite(id: string) {
  const next = toggleId(getFavorites(), id);
  writeState({ favorites: next });
  return next;
}

export function recordRecent(id: string) {
  writeState({ recent: addToFront(getRecent(), id, RECENT_CAP) });
}
