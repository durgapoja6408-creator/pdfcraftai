// lib/workflow/demo-state.ts
// Browser-only state for the public demo surfaces (/agent, /macros, /studio).
// These pages are intentionally stateless on the server — credits, history, and
// user-saved macros all live in localStorage so a logged-out visitor can play
// with the product. The real, server-backed product lives behind /app/* and
// uses Drizzle + NextAuth.

import type { MacroTemplate, MacroNode, MacroEdge } from "./templates";

const KEY_CREDITS = "pdfcraft.demo.credits";
const KEY_HISTORY = "pdfcraft.demo.history";
const KEY_MACROS  = "pdfcraft.demo.macros";

const DEFAULT_CREDITS = 1000;
const HISTORY_CAP = 50;

export interface DemoHistoryEntry {
  /** Tool or workflow name. */
  tool: string;
  /** File name or workflow name being run. */
  file: string;
  /** Credits consumed by this run. */
  credits: number;
  /** Unix epoch ms. */
  ts: number;
}

/**
 * User-saved macro. Same shape as a template but with author='You' and an
 * optional `createdAt` timestamp. Stored client-side only.
 */
export interface UserMacro extends MacroTemplate {
  createdAt: number;
}

const isBrowser = (): boolean => typeof window !== "undefined";

// ---------- Credits ----------

export function getDemoCredits(): number {
  if (!isBrowser()) return DEFAULT_CREDITS;
  try {
    const raw = window.localStorage.getItem(KEY_CREDITS);
    if (raw == null) {
      window.localStorage.setItem(KEY_CREDITS, String(DEFAULT_CREDITS));
      return DEFAULT_CREDITS;
    }
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_CREDITS;
  } catch {
    return DEFAULT_CREDITS;
  }
}

export function setDemoCredits(n: number): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY_CREDITS, String(Math.max(0, Math.floor(n))));
  } catch {
    /* quota exceeded or storage unavailable — ignore */
  }
}

export function spendDemoCredits(amount: number): number {
  const before = getDemoCredits();
  const after = Math.max(0, before - Math.max(0, Math.floor(amount)));
  setDemoCredits(after);
  return after;
}

export function resetDemoCredits(): void {
  setDemoCredits(DEFAULT_CREDITS);
}

// ---------- History ----------

export function getDemoHistory(): DemoHistoryEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(KEY_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addDemoHistory(entry: Omit<DemoHistoryEntry, "ts">): void {
  if (!isBrowser()) return;
  const cur = getDemoHistory();
  const next = [{ ...entry, ts: Date.now() }, ...cur].slice(0, HISTORY_CAP);
  try {
    window.localStorage.setItem(KEY_HISTORY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

// ---------- User macros ----------

export function getUserMacros(): UserMacro[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(KEY_MACROS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface AddUserMacroInput {
  name: string;
  desc: string;
  icon: MacroTemplate["icon"];
  creditsPerRun: number;
  nodes: MacroNode[];
  edges: MacroEdge[];
}

export function addUserMacro(input: AddUserMacroInput): UserMacro {
  const id = "user-" + Date.now().toString(36);
  const macro: UserMacro = {
    id,
    name: input.name,
    desc: input.desc,
    icon: input.icon,
    runs: 0,
    time: "—",
    creditsPerRun: input.creditsPerRun,
    author: "You",
    nodes: input.nodes,
    edges: input.edges,
    createdAt: Date.now(),
  };
  if (isBrowser()) {
    try {
      const cur = getUserMacros();
      window.localStorage.setItem(KEY_MACROS, JSON.stringify([macro, ...cur]));
    } catch {
      /* ignore */
    }
  }
  return macro;
}

export function deleteUserMacro(id: string): void {
  if (!isBrowser()) return;
  try {
    const cur = getUserMacros().filter((m) => m.id !== id);
    window.localStorage.setItem(KEY_MACROS, JSON.stringify(cur));
  } catch {
    /* ignore */
  }
}
