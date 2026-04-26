// /api/agent/runs/[id] — GET a run's full state for polling.
//
// Used by the AgentInteractive component to refresh the timeline after
// firing /api/agent/run. Returns the run + all its steps with current
// status, costs, output refs.
//
// In H3 we'll add an SSE variant at /api/agent/runs/[id]/stream that
// pushes step updates as they happen. For H2 plain polling at 1Hz is
// fine — system-only plans typically finish in <2s anyway.

import "server-only";

import { auth } from "@/auth";
import { getRunForUser } from "@/lib/agent/run-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: { id: string } },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json(
      { error: { code: "auth_required", message: "Sign in." } },
      { status: 401 },
    );
  }

  const run = await getRunForUser({
    runId: ctx.params.id,
    userId: session.user.id,
  });
  if (!run) {
    return Response.json(
      { error: { code: "not_found", message: "Run not found or not yours." } },
      { status: 404 },
    );
  }

  return Response.json({ run }, { status: 200 });
}
