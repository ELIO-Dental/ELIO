// Flow had no way to tell a full sync's real completion apart from the dashboard's
// blind 8s setTimeout — the dashboard would show "Full sync started" and refresh once,
// regardless of whether the actual background job (which can legitimately take much
// longer than 8s) had finished. This mirrors apps/shell's status read (pure, no
// mutation — see packages/dentally/src/sync-run.ts for why reads must never auto-fail
// a run) so the dashboard can poll to real completion instead of guessing.
import { NextResponse } from "next/server";
import { getLatestDentallySyncRun } from "@elio/dentally";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

export async function GET() {
  try {
    const session = await requirePermission("flow:view");
    const run = await getLatestDentallySyncRun(session.practiceId);

    return NextResponse.json({
      latestRun: run
        ? {
            id: run.id,
            status: run.status,
            currentPhase: run.currentPhase,
            startedAt: run.startedAt.toISOString(),
            finishedAt: run.finishedAt?.toISOString() ?? null,
            errorMessage: run.errorMessage,
          }
        : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
