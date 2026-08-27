import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { triggerPlansHandoff } from "@/lib/flow-service";
import { resolveAuditActor } from "@elio/auth";

/** Cross-module handoff trigger — UI shortcut only, no ElioPlans DB write
 * (APPLICATION_FLOW.md §8/§12). PERMISSIONS_MATRIX.md §5 —
 * "Trigger cross-module handoff" has its own dedicated permission
 * (packages/auth/lib/permissions.ts: flow:trigger-handoff). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("flow:trigger-handoff");
    const { id } = await params;
    const result = await triggerPlansHandoff(session.practiceId, resolveAuditActor(session), id);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
