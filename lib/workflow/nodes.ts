// lib/workflow/nodes.ts
// Shared node-type registry for the public workflow product surfaces (/macros, /studio).
// Ported from the Claude Design handoff bundle (project/workflow.jsx, NODE_TYPES).
// This is demo-product metadata — the real server-backed studio lives at /app/studio
// and uses its own action set.

import type { I } from "@/components/icons/Icons";

export type NodeColorKey = "blue" | "accent" | "green" | "yellow" | "mute";

export type NodeCategory =
  | "Trigger"
  | "Organize"
  | "Convert"
  | "Optimize"
  | "Edit"
  | "Security"
  | "AI"
  | "Logic"
  | "Output";

export interface NodeDef {
  cat: NodeCategory;
  name: string;
  icon: keyof typeof I;
  color: NodeColorKey;
  desc: string;
  /** Credits consumed per run; undefined for free nodes. */
  cost?: number;
}

export const NODE_TYPES: Record<string, NodeDef> = {
  // Triggers
  upload:       { cat: "Trigger",  name: "File upload",       icon: "Upload",      color: "blue",   desc: "User drops a file" },
  watch:        { cat: "Trigger",  name: "Watch folder",      icon: "File",        color: "blue",   desc: "Drive / Dropbox / S3" },
  email_in:     { cat: "Trigger",  name: "Email trigger",     icon: "Send",        color: "blue",   desc: "pdfs@you.pdfcraft.ai" },
  schedule:     { cat: "Trigger",  name: "Schedule",          icon: "Clock",       color: "blue",   desc: "Cron / recurring" },
  webhook:      { cat: "Trigger",  name: "Webhook",           icon: "Code",        color: "blue",   desc: "POST /run endpoint" },

  // Free tools
  merge:        { cat: "Organize", name: "Merge",             icon: "Merge",       color: "mute",   desc: "Combine PDFs" },
  split:        { cat: "Organize", name: "Split",             icon: "Split",       color: "mute",   desc: "Separate pages" },
  compress:     { cat: "Optimize", name: "Compress",          icon: "Compress",    color: "mute",   desc: "Shrink file size" },
  rotate:       { cat: "Organize", name: "Rotate & reorder",  icon: "Rotate",      color: "mute",   desc: "Fix orientation" },
  pdf2office:   { cat: "Convert",  name: "PDF → Office",      icon: "Convert",     color: "mute",   desc: "Word / Excel / PPT" },
  to_pdf:       { cat: "Convert",  name: "Any → PDF",         icon: "Image",       color: "mute",   desc: "Word / images / HTML" },
  watermark:    { cat: "Edit",     name: "Page numbers",      icon: "Pages",       color: "mute",   desc: "Header, footer, stamp" },
  protect:      { cat: "Security", name: "Protect",           icon: "Lock",        color: "mute",   desc: "Password / permissions" },

  // AI
  ai_ocr:       { cat: "AI",       name: "OCR & extract",     icon: "Scan",        color: "accent", desc: "Scans → searchable · 2 cr/pg",  cost: 2  },
  ai_sum:       { cat: "AI",       name: "Summarize",         icon: "Summary",     color: "accent", desc: "Exec brief · 8 cr/doc",         cost: 8  },
  ai_translate: { cat: "AI",       name: "Translate",         icon: "Translate",   color: "accent", desc: "90+ languages · 1 cr/pg",       cost: 1  },
  ai_redact:    { cat: "AI",       name: "Redact PII",        icon: "Shield",      color: "accent", desc: "Auto-detect · 2 cr/pg",         cost: 2  },
  ai_rewrite:   { cat: "AI",       name: "Rewrite",           icon: "Edit",        color: "accent", desc: "Tone / simplify · 3 cr/pg",     cost: 3  },
  ai_chat:      { cat: "AI",       name: "Ask question",      icon: "Chat",        color: "accent", desc: "Extract answer · 5 cr/q",       cost: 5  },
  ai_gen:       { cat: "AI",       name: "Generate PDF",      icon: "Generate",    color: "accent", desc: "Draft from prompt · 20 cr",     cost: 20 },
  ai_classify:  { cat: "AI",       name: "Classify",          icon: "Sparkle",     color: "accent", desc: "Auto-tag / categorize · 3 cr",  cost: 3  },

  // Logic
  if_cond:      { cat: "Logic",    name: "If / then",         icon: "ChevronRight", color: "yellow", desc: "Branch on condition" },
  merge_branch: { cat: "Logic",    name: "Join",              icon: "Merge",        color: "yellow", desc: "Combine branches" },
  loop:         { cat: "Logic",    name: "For each page",     icon: "Rotate",       color: "yellow", desc: "Iterate pages" },

  // Outputs
  download:     { cat: "Output",   name: "Download",          icon: "Download",    color: "green",  desc: "Deliver to user" },
  email_out:    { cat: "Output",   name: "Email",             icon: "Send",        color: "green",  desc: "To recipient list" },
  slack:        { cat: "Output",   name: "Slack",             icon: "Chat",        color: "green",  desc: "Post to channel" },
  drive:        { cat: "Output",   name: "Save to Drive",     icon: "File",        color: "green",  desc: "Drive / Dropbox / S3" },
  webhook_out:  { cat: "Output",   name: "Webhook",           icon: "Code",        color: "green",  desc: "POST result to URL" },
};

export type NodeTypeId = keyof typeof NODE_TYPES;

export interface NodeColorSwatch {
  bg: string;
  fg: string;
  border: string;
}

export const NODE_COLOR: Record<NodeColorKey, NodeColorSwatch> = {
  blue:   { bg: "var(--blue-soft)",   fg: "var(--blue)",      border: "var(--blue)" },
  accent: { bg: "var(--accent-soft)", fg: "var(--accent)",    border: "var(--accent)" },
  green:  { bg: "var(--green-soft)",  fg: "var(--green)",     border: "var(--green)" },
  yellow: {
    bg: "color-mix(in oklab, var(--yellow) 14%, var(--bg-1))",
    fg: "var(--yellow)",
    border: "var(--yellow)",
  },
  mute:   { bg: "var(--bg-2)",        fg: "var(--fg-muted)",  border: "var(--border-strong)" },
};

export const NODE_CATEGORIES: NodeCategory[] = [
  "Trigger",
  "Organize",
  "Convert",
  "Optimize",
  "Edit",
  "Security",
  "AI",
  "Logic",
  "Output",
];

/** Look up a node type safely; returns undefined for unknown ids. */
export function getNodeDef(type: string): NodeDef | undefined {
  return NODE_TYPES[type];
}

/** Look up the color swatch for a node type; falls back to 'mute'. */
export function getNodeColor(type: string): NodeColorSwatch {
  const def = NODE_TYPES[type];
  return NODE_COLOR[def?.color ?? "mute"];
}
