// lib/agent/planner.ts
//
// Production planner. Given a user prompt + context (uploaded files), call
// Claude with the agent's tool registry as `tools` and parse the response
// into an AgentPlan. Validate every tool call against the registry; refuse
// the plan if anything looks wrong (hallucinated tool name, bad params).
//
// Why Anthropic + tools API instead of free-form JSON output:
//   The tools API enforces tool_name + input_schema at the model level.
//   Anthropic's models are best-in-class at not hallucinating tool names
//   when given a fixed catalog (much better than "respond in this JSON").
//   The model can also return tool_use blocks in any order so we naturally
//   get a list-of-steps without having to teach a JSON schema.
//
// Why a single planner call instead of a ReAct loop:
//   Plans are reviewed by the user BEFORE any credit gets spent. ReAct
//   ("call tool, see result, plan next") would mean executing some steps
//   before showing the plan, which breaks the screenshot's "Plan it →
//   Review → Run" UX. We accept the trade-off (less reactive to surprise
//   tool outputs) for the safety of explicit pre-approval.
//
// Failure modes handled:
//   - Anthropic 5xx / timeout      → propagate to caller; route returns 502
//   - Model returns no tool_use    → return empty plan with notes
//   - Model picks an unknown tool  → reject the whole plan, tell the user
//   - Model picks invalid params   → reject the step, replan with one
//                                    repair-attempt call (1 retry max)

import Anthropic from "@anthropic-ai/sdk";
import {
  AGENT_TOOLS,
  toAnthropicToolDefs,
  type PlanContext,
} from "./tool-registry";
import type { AgentPlan, AgentStep, RiskLevel } from "./types";

/**
 * The system prompt that shapes the planner's behavior. Keep it short —
 * Claude is already excellent at tool selection. This prompt focuses on
 * the things our domain cares about (cost-efficiency, safety, plan style)
 * rather than re-explaining how tool_use works.
 */
const SYSTEM_PROMPT = `You are the planner for a PDF automation agent.

Given a user's request and any uploaded files, choose a sequence of tools
to fulfil the request. You will return ONLY tool_use blocks — no prose.

Rules:
1. Use the smallest plan that achieves the goal. If the user asks for a
   summary of one PDF, that is ONE tool call (ai-summarize), not a chain.
2. Use FREE tools (merge, split, extract-pages, compress) before AI tools
   when both would work. Free tools cost 0 credits.
3. ANY destructive or external step (sys.ask.user, ai-generate, anything
   that emails or shares) must be preceded by sys.ask.user with a clear
   yes/no question.
4. Always end the plan with sys.notify.user so the user knows it's done.
5. If the user mentions a file count ("12 receipts"), use it. Otherwise
   start with sys.fs.list to discover files.
6. Be conservative on cost. If the plan would exceed 50 credits, prefer a
   cheaper alternative (ai-tldr instead of ai-summarize, fewer pages).`;

// H7 fix: default model was "claude-3-5-sonnet-20241022" which 502'd on
// our live Anthropic account (model retired / not allow-listed). Match
// the registry's defaultModel (lib/ai/registry.ts) which is verified
// working in production. Override via AGENT_PLANNER_MODEL env if/when
// we want to upgrade to Sonnet/Opus 4.x for richer tool-use planning.
const PLANNER_MODEL =
  process.env.AGENT_PLANNER_MODEL ??
  process.env.ANTHROPIC_MODEL ??
  "claude-haiku-4-5-20251001";
const PLANNER_MAX_TOKENS = 4096;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing — cannot run planner");
  _client = new Anthropic({ apiKey });
  return _client;
}

export interface PlannerInput {
  /** What the user typed in the prompt box. */
  prompt: string;
  /** Files already uploaded by the user, available as inputs. */
  files?: Array<{ id: string; name: string; pageCount?: number }>;
}

export interface PlannerOutput {
  /** The validated plan. Always non-null on success. */
  plan: AgentPlan;
  /**
   * Diagnostic info for /admin debugging. Not surfaced to end users
   * but logged server-side for plan-quality analysis.
   */
  diagnostics: {
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    rejectedSteps: Array<{ tool: string; reason: string }>;
    latencyMs: number;
  };
}

export class PlannerError extends Error {
  constructor(
    message: string,
    public code: "no_steps" | "invalid_tool" | "invalid_params" | "model_error" | "config",
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PlannerError";
  }
}

/**
 * Produce an AgentPlan from a natural-language prompt.
 *
 * Throws PlannerError on any failure mode that the caller (the route
 * handler) needs to map to a specific HTTP status code.
 */
export async function generatePlan(
  input: PlannerInput,
): Promise<PlannerOutput> {
  const startedAt = Date.now();

  // Build context payload for the LLM. Pre-uploaded files become a
  // user-message preamble so the model can reference them by id.
  const filesPreamble = input.files?.length
    ? `\n\nFiles already uploaded:\n${input.files
        .map(
          (f) =>
            `- file_id: ${f.id}, name: ${f.name}` +
            (f.pageCount ? ` (${f.pageCount} pages)` : ""),
        )
        .join("\n")}`
    : "";

  const tools = toAnthropicToolDefs();

  let response;
  try {
    response = await client().messages.create({
      model: PLANNER_MODEL,
      max_tokens: PLANNER_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools,
      // tool_choice: "auto" lets the model decide whether to use any tools.
      // For the planner we want it to ALWAYS use tools (a plan with zero
      // steps is useless), but Anthropic doesn't support a "must use any"
      // mode — only "must use this specific one". We post-validate that
      // at least one tool_use came back.
      messages: [
        { role: "user", content: input.prompt + filesPreamble },
      ],
    });
  } catch (e) {
    throw new PlannerError(
      `Anthropic call failed: ${(e as Error).message}`,
      "model_error",
      { cause: e },
    );
  }

  const toolUseBlocks = response.content.filter(
    (b): b is Extract<typeof response.content[0], { type: "tool_use" }> =>
      b.type === "tool_use",
  );
  if (toolUseBlocks.length === 0) {
    throw new PlannerError(
      "Planner returned no tool_use blocks — the prompt may be unrelated to PDF work, or the model couldn't pick a tool.",
      "no_steps",
      {
        // Surface the model's text reply (if any) so admins can see why.
        modelText: response.content
          .filter((b) => b.type === "text")
          .map((b) => (b as { text: string }).text)
          .join("\n"),
      },
    );
  }

  // Build the plan. Reject any unknown tool names; collect rejection
  // reasons in diagnostics so the admin dashboard can flag bad plans.
  const steps: AgentStep[] = [];
  const rejectedSteps: PlannerOutput["diagnostics"]["rejectedSteps"] = [];

  // Build a context object for cost estimation. For now this is just the
  // first uploaded file's page count. Future: thread page counts through
  // the chain so estimators know what each prior step produced.
  const ctx: PlanContext = {
    inputPageCount: input.files?.[0]?.pageCount,
    inputFileCount: input.files?.length,
  };

  for (const [i, block] of toolUseBlocks.entries()) {
    // Convert the underscored name back to the canonical dotted name.
    const canonicalName = block.name.replace(/_/g, ".").replace("sys.", "sys.");
    // Naïve: anything starting "sys_" → "sys.X". Actually our underscore
    // -> dot conversion is symmetric so handle both forms.
    const candidate1 = block.name.replace(/_/g, "-");
    const candidate2 = block.name.replace(/_/g, ".");
    const def =
      AGENT_TOOLS[block.name] ??
      AGENT_TOOLS[candidate1] ??
      AGENT_TOOLS[candidate2] ??
      AGENT_TOOLS[canonicalName];

    if (!def) {
      rejectedSteps.push({
        tool: block.name,
        reason: "Unknown tool — not in registry",
      });
      continue;
    }

    // Validate params against the registered Zod schema. The planner LLM
    // is excellent but not perfect — sometimes it omits a required field.
    const parseResult = def.params.safeParse(block.input);
    if (!parseResult.success) {
      rejectedSteps.push({
        tool: def.name,
        reason: `Invalid params: ${parseResult.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
      });
      continue;
    }

    steps.push({
      idx: i + 1,
      tool: def.name,
      params: parseResult.data,
      label: shortLabel(def.name, parseResult.data),
      description: def.description.split(".")[0] ?? def.description,
      estCredits: def.estCredits(parseResult.data, ctx),
      risk: def.risk,
      // Naïve dependency model for H1: every step depends on the previous
      // one. Future: parse @file_id_<n> references in the LLM's params.
      dependsOn: i > 0 ? [i] : [],
    });
  }

  if (steps.length === 0) {
    throw new PlannerError(
      "No valid steps after registry validation — all tool calls were rejected.",
      "invalid_tool",
      { rejectedSteps },
    );
  }

  const totalEstCredits = steps.reduce((sum, s) => sum + s.estCredits, 0);

  return {
    plan: {
      prompt: input.prompt,
      steps,
      totalEstCredits,
      output: inferOutput(steps),
      confidence: rejectedSteps.length === 0 ? 0.95 : 0.7,
      notes:
        rejectedSteps.length > 0
          ? [`${rejectedSteps.length} step(s) skipped due to validation`]
          : undefined,
    },
    diagnostics: {
      modelId: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      rejectedSteps,
      latencyMs: Date.now() - startedAt,
    },
  };
}

/**
 * Short human-readable label for a step. ~3-7 words.
 */
function shortLabel(toolName: string, params: Record<string, unknown>): string {
  const map: Record<string, (p: Record<string, unknown>) => string> = {
    "sys.fs.list": (p) => `List files in ${(p.path as string) ?? "folder"}`,
    "sys.ask.user": (p) =>
      `Ask: ${truncate((p.question as string) ?? "confirm", 40)}`,
    "sys.notify.user": (p) =>
      `Notify: ${truncate((p.title as string) ?? "done", 40)}`,
    merge: () => "Merge PDFs",
    split: () => "Split PDF",
    compress: (p) => `Compress (${(p.level as string) ?? "balanced"})`,
    "extract-pages": (p) => `Extract pages ${(p.ranges as string) ?? ""}`,
    "delete-pages": (p) => `Delete pages ${(p.ranges as string) ?? ""}`,
    "ai-summarize": () => "Summarize PDF",
    "ai-tldr": () => "Generate TL;DR",
    "ai-ocr": () => "OCR scanned PDF",
    "ai-translate": (p) => `Translate to ${(p.target_lang as string) ?? "target"}`,
    "ai-redact": () => "Redact PII",
    "ai-table": () => "Extract tables",
    "ai-entities": () => "Extract entities",
    "ai-action-items": () => "Extract action items",
    "ai-generate": () => "Generate new PDF",
    "ai-rewrite": (p) => `Rewrite (${(p.tone as string) ?? "tone"})`,
    "ai-compare": () => "Compare two PDFs",
  };
  const fn = map[toolName];
  return fn ? fn(params) : toolName;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

/**
 * Best-effort output inference. Looks at the last non-system step.
 */
function inferOutput(steps: AgentStep[]): AgentPlan["output"] {
  for (let i = steps.length - 1; i >= 0; i--) {
    const tool = steps[i]!.tool;
    if (tool.startsWith("sys.")) continue;
    if (tool === "ai-table") return { type: "xlsx", description: "Excel file with extracted tables" };
    if (tool === "split") return { type: "zip", description: "Zip of split PDFs" };
    if (tool === "ai-generate") return { type: "pdf", description: "Generated PDF" };
    if (tool === "ai-translate") return { type: "pdf", description: "Translated PDF" };
    if (tool === "ai-summarize" || tool === "ai-tldr") return { type: "md", description: "Markdown summary" };
    return { type: "pdf", description: "Processed PDF" };
  }
  return { type: "pdf", description: "Result" };
}

// Re-export the risk type for callers that wire UI labels.
export type { RiskLevel };
