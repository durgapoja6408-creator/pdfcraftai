// lib/agent/system-tools.ts
//
// In-process handlers for the "system" tools registered in tool-registry.ts.
// These don't touch external services — they're composition primitives the
// executor calls directly.
//
// H2 ships the minimum viable surface:
//   - sys.fs.list      → returns the user's existing files matching pattern
//   - sys.notify.user  → no-op for now (will write to a notifications table
//                          + push to /app/notifications inbox in H4)
//   - sys.ask.user     → returns "awaiting_approval" status; the executor
//                          interprets that as "pause this run and wait for
//                          /api/agent/runs/<id>/approve" — wired in H3
//
// Future system tools (deferred): email.send, slack.post, fs.move

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";

export interface SystemToolContext {
  userId: string;
  runId: string;
  stepIdx: number;
}

export interface SystemToolResult {
  /** "succeeded" | "awaiting_approval" — drives the executor's next move. */
  status: "succeeded" | "awaiting_approval";
  /** Optional output (string for fs.list = JSON list of files). */
  outputRef?: string;
  outputType?: string;
}

/**
 * sys.fs.list — list the user's uploaded files. The first version doesn't
 * filter by `path` because uploaded-file paths aren't really directories
 * (everything's flat in /app/files). We return ALL of the user's recent
 * files; the executor can post-filter by name pattern if the planner
 * passed one.
 */
export async function sysFsList(
  params: { path: string; pattern?: string },
  ctx: SystemToolContext,
): Promise<SystemToolResult> {
  const rows = await db
    .select({
      id: schema.files.id,
      name: schema.files.name,
      sizeBytes: schema.files.sizeBytes,
      mimeType: schema.files.mime,
    })
    .from(schema.files)
    .where(eq(schema.files.userId, ctx.userId))
    .orderBy(schema.files.createdAt)
    .limit(100);

  // Optional name-pattern filter (very simple — substring match).
  const filtered = params.pattern
    ? rows.filter((r) => r.name.includes(params.pattern!.replace(/\*/g, "")))
    : rows;

  return {
    status: "succeeded",
    outputRef: JSON.stringify(filtered),
    outputType: "json/file-list",
  };
}

/**
 * sys.notify.user — record an in-app notification. H2: writes to console
 * + returns succeeded; the proper inbox table arrives with H4.
 */
export async function sysNotifyUser(
  params: { title: string; body?: string },
  ctx: SystemToolContext,
): Promise<SystemToolResult> {
  // H2 stub. In H4 this writes to a `user_notifications` table that the
  // /app navbar subscribes to. For now: persist as the step's outputRef
  // so the UI can show the notification text inline.
  return {
    status: "succeeded",
    outputRef: JSON.stringify({
      title: params.title,
      body: params.body ?? "",
      ts: new Date().toISOString(),
      runId: ctx.runId,
    }),
    outputType: "json/notification",
  };
}

/**
 * sys.ask.user — pause the run pending user input. The executor interprets
 * "awaiting_approval" by stopping the loop and flipping the run status to
 * "awaiting_approval"; the user resumes via /api/agent/runs/<id>/approve
 * (wired in H3).
 */
export async function sysAskUser(
  params: { question: string; options: string[] },
  _ctx: SystemToolContext,
): Promise<SystemToolResult> {
  // The question + options get serialised so the UI can render the
  // approval prompt without re-reading the plan.
  return {
    status: "awaiting_approval",
    outputRef: JSON.stringify({
      question: params.question,
      options: params.options,
    }),
    outputType: "json/approval-request",
  };
}

/**
 * Dispatch table — system tool name → handler. The executor uses this
 * keyed by tool ID. Adding a new system tool = one entry here + one
 * registry entry in tool-registry.ts.
 */
export const SYSTEM_TOOL_HANDLERS: Record<
  string,
  (
    params: Record<string, unknown>,
    ctx: SystemToolContext,
  ) => Promise<SystemToolResult>
> = {
  "sys.fs.list": (p, c) =>
    sysFsList(p as { path: string; pattern?: string }, c),
  "sys.notify.user": (p, c) =>
    sysNotifyUser(p as { title: string; body?: string }, c),
  "sys.ask.user": (p, c) =>
    sysAskUser(p as { question: string; options: string[] }, c),
};
