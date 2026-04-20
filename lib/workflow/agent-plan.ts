// lib/workflow/agent-plan.ts
// Deterministic prompt → plan mapper for the public /agent demo surface.
// Ported from the Claude Design handoff bundle (project/agent.jsx, buildPlan).
// This is intentionally NOT an LLM call — the public Agent page is a
// describe-then-show-me-the-plan demo. For real execution, users run each
// step on its own /tool/* page. (The previous server-backed Smart-mode
// runner at /app/studio was retired on 2026-04-20.)

import type { I } from "@/components/icons/Icons";

/** A single step in a planned workflow. */
export interface PlanStep {
  /** Icon name from the I icon set. Doubles as the "tool" identifier. */
  tool: keyof typeof I;
  /** Short step name (~3-5 words). */
  name: string;
  /** Longer description of what the step does. */
  desc: string;
  /** Credits this step consumes; undefined for free preparatory steps. */
  cost?: number;
}

export interface PlanOutput {
  name: string;
  type: "pdf" | "zip" | "docx" | "csv" | string;
  pages?: number;
}

export interface AgentPlan {
  steps: PlanStep[];
  /** Total credits the plan will consume. */
  credits: number;
  output: PlanOutput;
  /** Number of source files inferred from the prompt. */
  fileCount: number;
}

/**
 * Build a deterministic plan from a natural-language prompt.
 * Pure function — safe to call on server and client.
 */
export function buildPlan(prompt: string): AgentPlan {
  const p = prompt.toLowerCase();
  const steps: PlanStep[] = [];
  let credits = 0;
  let output: PlanOutput = { name: "Result.pdf", type: "pdf" };

  // Detect inputs
  const numMatch = p.match(/(\d+)\s+(receipt|doc|file|page|invoice|pdf|contract)/);
  const fileCount = numMatch
    ? parseInt(numMatch[1]!, 10)
    : p.includes("data room") || p.includes("handbook")
    ? 14
    : 3;

  if (p.includes("receipt") || p.includes("expense") || p.includes("invoice")) {
    steps.push({ tool: "Scan", name: "Ingest files", desc: `Detected ${fileCount} scanned images in /Downloads/receipts/` });
    steps.push({ tool: "Scan", name: "OCR & extract line items", desc: `Reading vendor, date, total, and line items from ${fileCount} files`, cost: fileCount * 2 });
    steps.push({ tool: "Summary", name: "Categorize by vendor & month", desc: "Grouping into categories: Travel, Meals, Software, Office" });
    steps.push({ tool: "Generate", name: "Draft expense report", desc: "Cover page → totals → line-item table → receipts appendix", cost: 20 });
    output = { name: "Expense-Report-Q3.pdf", type: "pdf", pages: 18 };
    credits = fileCount * 2 + 20;
  } else if (p.includes("redact")) {
    steps.push({ tool: "Scan", name: "Parse document", desc: "Contract.pdf · 4 pages" });
    steps.push({ tool: "Shield", name: "Detect sensitive entities", desc: "Found: 2 SSNs, 3 salary figures, 4 email addresses, 1 home address", cost: 8 });
    steps.push({ tool: "Shield", name: "Apply redactions", desc: "Black-box overlays, searchable text stripped, image pixels burned" });
    steps.push({ tool: "Lock", name: "Password-protect output", desc: "AES-256 · password copied to clipboard" });
    steps.push({ tool: "Send", name: "Share with HR", desc: "Expiring link (7 days) → hr@studio.co" });
    output = { name: "Offer-Letter-REDACTED.pdf", type: "pdf", pages: 4 };
    credits = 8;
  } else if (p.includes("investor") || p.includes("board") || p.includes("summary") || p.includes("memo")) {
    steps.push({ tool: "Scan", name: "Read source documents", desc: "Q3-Financials.pdf · Board-Memo.pdf · Product-Roadmap.pdf" });
    steps.push({ tool: "Summary", name: "Extract key metrics & themes", desc: "Revenue, NRR, headcount, pipeline, risks, roadmap bets", cost: 12 });
    steps.push({ tool: "Sparkle", name: "Cross-reference & synthesize", desc: "Reconciling metrics across source docs · 3 conflicts resolved" });
    steps.push({ tool: "Generate", name: "Draft 2-page update", desc: "Opening → wins → metrics → ask → appendix", cost: 20 });
    output = { name: "Investor-Update-Q3.pdf", type: "pdf", pages: 2 };
    credits = 32;
  } else if (p.includes("translate") || p.includes("language") || p.includes("spanish") || p.includes("french")) {
    const langs = ["Spanish", "French", "Japanese"].filter((l) => p.includes(l.toLowerCase()));
    const targetLangs = langs.length ? langs : ["Spanish", "French"];
    steps.push({ tool: "Scan", name: "Parse source document", desc: "Employee-Handbook.pdf · 42 pages · English" });
    targetLangs.forEach((l) => {
      steps.push({ tool: "Translate", name: `Translate → ${l}`, desc: "Preserving headings, tables, and bullet structure", cost: 42 });
    });
    steps.push({ tool: "Merge", name: "Bundle outputs", desc: `${targetLangs.length} translated PDFs in one archive` });
    if (p.includes("email") || p.includes("send") || p.includes("priya")) {
      steps.push({ tool: "Send", name: "Draft email to Priya", desc: "Attaches PDFs · 2-sentence body · awaiting your send-off" });
    }
    output = { name: `Handbook-${targetLangs.length}langs.zip`, type: "zip", pages: 42 * targetLangs.length };
    credits = 42 * targetLangs.length;
  } else if (p.includes("study") || p.includes("textbook") || p.includes("practice") || p.includes("guide")) {
    steps.push({ tool: "Scan", name: "Parse source chapter", desc: "Chapter-7-Thermodynamics.pdf · 32 pages" });
    steps.push({ tool: "Summary", name: "Extract key terms & concepts", desc: "47 terms · 12 key equations identified", cost: 12 });
    steps.push({ tool: "Sparkle", name: "Generate practice questions", desc: "15 MCQ + 5 long-form + answer key", cost: 15 });
    steps.push({ tool: "Generate", name: "Format as study guide", desc: "Glossary → summary → questions → answer key", cost: 20 });
    output = { name: "Study-Guide-Ch7.pdf", type: "pdf", pages: 10 };
    credits = 47;
  } else if (p.includes("due diligence") || p.includes("data room") || p.includes("red flag") || p.includes("review")) {
    steps.push({ tool: "Scan", name: "Index data room", desc: "14 documents · 412 pages total · NDAs, contracts, financials" });
    steps.push({ tool: "Sparkle", name: "Cross-doc semantic search", desc: "Building knowledge graph of entities, clauses, amounts", cost: 28 });
    steps.push({ tool: "Shield", name: "Flag unusual clauses", desc: "6 flags: auto-renewal, non-compete scope, liability caps", cost: 14 });
    steps.push({ tool: "Summary", name: "Check completeness", desc: "Missing: cap table as of Q3 · board consents for 2 rounds" });
    steps.push({ tool: "Generate", name: "Draft red-flag brief", desc: "1 page · executive tone · linked to source citations", cost: 20 });
    output = { name: "Due-Diligence-Brief.pdf", type: "pdf", pages: 1 };
    credits = 62;
  } else {
    // Generic fallback
    steps.push({ tool: "Scan", name: "Understand the task", desc: "Analyzing your request and identifying source files" });
    steps.push({ tool: "Sparkle", name: "Plan approach", desc: "Selecting tools and sequencing steps", cost: 5 });
    steps.push({ tool: "Generate", name: "Execute", desc: "Running the plan", cost: 15 });
    steps.push({ tool: "File", name: "Package result", desc: "Preparing download" });
    credits = 20;
  }

  return { steps, credits, output, fileCount };
}

/** Suggested example prompts for the empty-state grid. */
export interface AgentExample {
  icon: keyof typeof I;
  title: string;
  prompt: string;
  tag: string;
}

export const AGENT_EXAMPLES: AgentExample[] = [
  {
    icon: "Receipt",
    title: "Expense report from receipts",
    prompt: "Take the 12 receipts in my downloads, OCR them, categorize by vendor, and produce a monthly expense report PDF with totals.",
    tag: "Finance",
  },
  {
    icon: "Shield",
    title: "Redact & share a contract",
    prompt: "Redact all PII and salary figures from this offer letter, then share a password-protected version with HR.",
    tag: "Legal",
  },
  {
    icon: "Summary",
    title: "Investor update from Q3 data",
    prompt: "Read the Q3 financials, the board memo, and our product roadmap. Write a 2-page investor update with the key wins and ask.",
    tag: "Executive",
  },
  {
    icon: "Translate",
    title: "Multi-language handbook",
    prompt: "Translate the employee handbook into Spanish, French, and Japanese. Keep formatting. Email a draft to Priya.",
    tag: "HR",
  },
  {
    icon: "Book",
    title: "Study guide from textbook",
    prompt: "From this textbook chapter, make a 10-page study guide: key terms, summary, practice questions with answer key.",
    tag: "Student",
  },
  {
    icon: "File",
    title: "Due-diligence brief",
    prompt: "Review all 14 docs in the data room. Flag unusual clauses, missing items, and draft a 1-page red-flag brief.",
    tag: "Finance",
  },
];

/**
 * Convert an executed plan into a graph that MacroCard's MiniPreview can render.
 * Returns the nodes + edges shape used by MacroTemplate.
 */
export function planToGraph(plan: AgentPlan): {
  nodes: Array<{ id: string; type: string; x: number; y: number }>;
  edges: Array<[string, string]>;
} {
  const stepToNodeType = (t: keyof typeof I): string =>
    ({
      Scan: "ai_ocr",
      Shield: "ai_redact",
      Summary: "ai_sum",
      Translate: "ai_translate",
      Generate: "ai_gen",
      Merge: "merge",
      Lock: "protect",
      Send: "email_out",
      Sparkle: "ai_classify",
    } as Record<string, string>)[t as string] || "ai_classify";

  const nodes = [
    { id: "n0", type: "upload", x: 40, y: 100 },
    ...plan.steps.map((s, i) => ({
      id: "n" + (i + 1),
      type: stepToNodeType(s.tool),
      x: 160 + i * 120,
      y: 100,
    })),
    { id: "nout", type: "download", x: 160 + plan.steps.length * 120, y: 100 },
  ];
  const edges: Array<[string, string]> = nodes
    .slice(0, -1)
    .map((n, i) => [n.id, nodes[i + 1]!.id]);
  return { nodes, edges };
}
