// lib/workflow/templates.ts
// Seeded macro templates for the public /macros library.
// Ported verbatim from the Claude Design handoff bundle (project/workflow.jsx, MACRO_TEMPLATES).
// User-saved macros are kept separately in lib/workflow/demo-state.ts and merged at render time.

import type { NodeTypeId } from "./nodes";
import type { I } from "@/components/icons/Icons";

export interface MacroNode {
  id: string;
  type: NodeTypeId;
  x: number;
  y: number;
}

export type MacroEdge = [from: string, to: string];

export interface MacroTemplate {
  id: string;
  name: string;
  desc: string;
  icon: keyof typeof I;
  runs: number;
  time: string;
  creditsPerRun: number;
  author: string;
  nodes: MacroNode[];
  edges: MacroEdge[];
}

export const MACRO_TEMPLATES: MacroTemplate[] = [
  {
    id: "tpl-invoice",
    name: "Invoice intake",
    desc: "Gmail attachments → OCR → classify → save to Drive → post to Slack",
    icon: "Receipt",
    runs: 142,
    time: "~45s",
    creditsPerRun: 8,
    author: "Community",
    nodes: [
      { id: "n1", type: "email_in",    x: 40,  y: 80  },
      { id: "n2", type: "ai_ocr",      x: 260, y: 80  },
      { id: "n3", type: "ai_classify", x: 480, y: 80  },
      { id: "n4", type: "drive",       x: 700, y: 20  },
      { id: "n5", type: "slack",       x: 700, y: 150 },
    ],
    edges: [
      ["n1", "n2"],
      ["n2", "n3"],
      ["n3", "n4"],
      ["n3", "n5"],
    ],
  },
  {
    id: "tpl-diligence",
    name: "Diligence brief",
    desc: "Data room → redact PII → summarize each doc → generate one-page brief",
    icon: "Shield",
    runs: 87,
    time: "~2m",
    creditsPerRun: 62,
    author: "Studio Inc.",
    nodes: [
      { id: "n1", type: "upload",     x: 40,  y: 100 },
      { id: "n2", type: "ai_redact",  x: 240, y: 100 },
      { id: "n3", type: "ai_sum",     x: 440, y: 100 },
      { id: "n4", type: "ai_gen",     x: 640, y: 100 },
      { id: "n5", type: "email_out",  x: 840, y: 100 },
    ],
    edges: [
      ["n1", "n2"],
      ["n2", "n3"],
      ["n3", "n4"],
      ["n4", "n5"],
    ],
  },
  {
    id: "tpl-handbook",
    name: "Multilingual handbook",
    desc: "Split by chapter → translate to 3 languages → merge → watermark → download",
    icon: "Translate",
    runs: 34,
    time: "~90s",
    creditsPerRun: 126,
    author: "You",
    nodes: [
      { id: "n1", type: "upload",       x: 40,   y: 140 },
      { id: "n2", type: "split",        x: 220,  y: 140 },
      { id: "n3", type: "ai_translate", x: 440,  y: 30  },
      { id: "n4", type: "ai_translate", x: 440,  y: 140 },
      { id: "n5", type: "ai_translate", x: 440,  y: 250 },
      { id: "n6", type: "merge_branch", x: 660,  y: 140 },
      { id: "n7", type: "watermark",    x: 840,  y: 140 },
      { id: "n8", type: "download",     x: 1020, y: 140 },
    ],
    edges: [
      ["n1", "n2"],
      ["n2", "n3"],
      ["n2", "n4"],
      ["n2", "n5"],
      ["n3", "n6"],
      ["n4", "n6"],
      ["n5", "n6"],
      ["n6", "n7"],
      ["n7", "n8"],
    ],
  },
  {
    id: "tpl-contract",
    name: "Contract send-off",
    desc: "Upload → redact salaries → password-protect → email counterparty",
    icon: "Lock",
    runs: 56,
    time: "~30s",
    creditsPerRun: 14,
    author: "Community",
    nodes: [
      { id: "n1", type: "upload",     x: 40,  y: 100 },
      { id: "n2", type: "ai_redact",  x: 240, y: 100 },
      { id: "n3", type: "protect",    x: 440, y: 100 },
      { id: "n4", type: "email_out",  x: 640, y: 100 },
    ],
    edges: [
      ["n1", "n2"],
      ["n2", "n3"],
      ["n3", "n4"],
    ],
  },
];

export function getTemplateById(id: string | null | undefined): MacroTemplate | undefined {
  if (!id) return undefined;
  return MACRO_TEMPLATES.find((t) => t.id === id);
}
