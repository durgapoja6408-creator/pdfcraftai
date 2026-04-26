// lib/agent/macro-bridge.ts
//
// Bridge between AgentPlan and the existing user_macros table. The macro
// table is per-tool — every row has a tool_id (one of lib/tools.ts IDs).
// For agent macros we use a sentinel tool_id of "agent" so they slot
// into the same table without colliding with per-tool macros.
//
// Why we don't add a new agent_macros table:
//   - The shape (id, user, name, params_json) is identical
//   - macro-actions.ts already has CRUD + permission checks
//   - Listing "all macros for this user" in /macros page works for both
//   - One less migration to ship
//
// `params_json` for an agent macro stores the full AgentPlan so the user
// can re-run it later (with the same prompt + steps) without going
// through the planner again. Future: add a re-plan-from-prompt mode that
// lets the user re-plan with current registry/model improvements.

"use server";

import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import type { AgentPlan } from "./types";

/** Sentinel tool_id for plan-shaped macros. */
export const AGENT_MACRO_TOOL_ID = "agent";

const MAX_NAME_LEN = 80;
const MIN_NAME_LEN = 1;

/**
 * Save an AgentPlan as a macro. Direct insert — bypasses macro-actions.ts
 * which has a per-tool schema whitelist that doesn't fit the AgentPlan
 * shape (params is a free-form plan, not a per-tool param object).
 *
 * Same `user_macros` table as the per-tool macros, with `tool_id="agent"`
 * as the discriminator. The unique (user, tool, name) index applies, so
 * users can have at most one agent macro with a given name.
 */
export async function saveAgentMacroAction(args: {
  name: string;
  plan: AgentPlan;
}): Promise<{ ok: true; macroId: string } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  if (!userId) return { ok: false, error: "not_authenticated" };

  const trimmed = args.name.trim();
  if (trimmed.length < MIN_NAME_LEN) return { ok: false, error: "name_too_short" };
  if (trimmed.length > MAX_NAME_LEN) return { ok: false, error: "name_too_long" };
  if (!args.plan?.steps?.length) return { ok: false, error: "empty_plan" };

  const id = randomUUID();
  try {
    await db.insert(schema.userMacros).values({
      id,
      userId,
      toolId: AGENT_MACRO_TOOL_ID,
      name: trimmed,
      paramsJson: args.plan as unknown as Record<string, unknown>,
    });
    return { ok: true, macroId: id };
  } catch (err) {
    const e = err as { code?: string; errno?: number };
    if (e.code === "ER_DUP_ENTRY" || e.errno === 1062) {
      return { ok: false, error: "duplicate_name" };
    }
    console.error("[saveAgentMacroAction] insert failed", err);
    return { ok: false, error: "db_error" };
  }
}

/**
 * List the user's saved agent macros. Used by the /macros library page
 * + a future "Apply existing macro" picker on /agent.
 */
export async function listAgentMacrosAction(): Promise<
  | { ok: true; macros: Array<{ id: string; name: string; plan: AgentPlan; createdAt: Date }> }
  | { ok: false; error: string }
> {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  if (!userId) return { ok: false, error: "not_authenticated" };

  const rows = await db
    .select()
    .from(schema.userMacros)
    .where(
      and(
        eq(schema.userMacros.userId, userId),
        eq(schema.userMacros.toolId, AGENT_MACRO_TOOL_ID),
      ),
    )
    .orderBy(desc(schema.userMacros.createdAt))
    .limit(50);

  return {
    ok: true,
    macros: rows.map((r) => ({
      id: r.id,
      name: r.name,
      plan: r.paramsJson as unknown as AgentPlan,
      createdAt: r.createdAt,
    })),
  };
}
