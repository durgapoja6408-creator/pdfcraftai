// Pure URL <-> filter-state helpers for /tools. Dependency-free for
// scripts/test-tools-url.mjs. URLSearchParams exists in node + browsers.

export type ToolsQueryState = { q: string; filter: string; cat: string };

const VALID_FILTERS = ["all", "free", "ai"];

export function parseToolsQuery(search: string) {
  const sp = new URLSearchParams(search || "");
  const q = (sp.get("q") || "").slice(0, 80);
  let filter = (sp.get("filter") || "all").toLowerCase();
  if (!VALID_FILTERS.includes(filter)) filter = "all";
  const cat = (sp.get("cat") || "").slice(0, 48);
  return { q, filter, cat };
}

export function buildToolsQuery(state: ToolsQueryState) {
  const sp = new URLSearchParams();
  const q = state && state.q ? String(state.q).trim() : "";
  const filter = state && state.filter ? String(state.filter) : "all";
  const cat = state && state.cat ? String(state.cat) : "";
  if (q) sp.set("q", q);
  if (filter && filter !== "all") sp.set("filter", filter);
  if (cat) sp.set("cat", cat);
  const s = sp.toString();
  return s ? "?" + s : "";
}
