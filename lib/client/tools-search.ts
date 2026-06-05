// Pure, import-free search helpers for the /tools catalog
// (components/marketing/ToolFilter.tsx). Dependency-free so
// scripts/test-tools-search.mjs can type-strip + execute the logic in node.

export function normalize(s: string) {
  return (s || "").toLowerCase().trim();
}

export function tokenize(s: string) {
  return normalize(s).split(/[^a-z0-9]+/).filter(Boolean);
}

// Bounded Levenshtein: true iff editDistance(a,b) <= max. Early-exits per
// row; only ever called on short tool-name tokens, so cost is trivial.
export function editDistanceWithin(a: string, b: string, max: number) {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return false;
  let prev = new Array(lb + 1);
  let curr = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return false;
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[lb] <= max;
}

// One query token vs one haystack token: substring / prefix / 1-typo.
export function tokenMatches(qt: string, ht: string) {
  if (!qt || !ht) return false;
  if (ht.includes(qt) || qt.includes(ht)) return true;
  if (ht.startsWith(qt) || qt.startsWith(ht)) return true;
  if (qt.length >= 4 && ht.length >= 4) return editDistanceWithin(qt, ht, 1);
  return false;
}

// Whole-query match against a haystack string (name + desc + category).
// (1) raw substring of the full trimmed query, OR (2) every query token
// fuzzy-matches some haystack token (typo-tolerant).
export function matchesQuery(haystack: string, query: string) {
  const q = normalize(query);
  if (!q) return true;
  const hay = normalize(haystack);
  if (hay.includes(q)) return true;
  const qts = tokenize(q);
  if (!qts.length) return false;
  const hts = tokenize(hay);
  if (!hts.length) return false;
  return qts.every((qt) => hts.some((ht) => tokenMatches(qt, ht)));
}

// Split `text` into {t,hit} segments marking every case-insensitive
// occurrence of the trimmed query, for bold highlighting in the UI.
export function highlightSegments(text: string, query: string) {
  const out = [];
  const q = normalize(query);
  if (!q) {
    out.push({ t: text, hit: false });
    return out;
  }
  const lower = text.toLowerCase();
  let i = 0;
  let idx = lower.indexOf(q, i);
  if (idx === -1) {
    out.push({ t: text, hit: false });
    return out;
  }
  while (idx !== -1) {
    if (idx > i) out.push({ t: text.slice(i, idx), hit: false });
    out.push({ t: text.slice(idx, idx + q.length), hit: true });
    i = idx + q.length;
    idx = lower.indexOf(q, i);
  }
  if (i < text.length) out.push({ t: text.slice(i), hit: false });
  return out;
}
