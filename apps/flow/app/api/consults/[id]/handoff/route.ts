import { NextResponse } from "next/server";
import { requirePermission, resolveFlowScope } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { triggerPlansHandoff } from "@/lib/flow-service";
import { assertConsultInScope } from "@/lib/flow-scope";
import { resolveAuditActor } from "@elio/auth";

/**
 * Cross-module handoff trigger — UI shortcut only, no ElioPlans DB write
 * (APPLICATION_FLOW.md §8/§12). PERMISSIONS_MATRIX.md §5 —
 * "Trigger cross-module handoff" has its own dedicated permission
 * (packages/auth/lib/permissions.ts: flow:trigger-handoff).
 *
 * `assertConsultInScope` was missing here (unlike the sibling
 * outcome/pipeline-move routes) — a scoped clinician (linked to a Dentist
 * row, no flow:view-all-patients) could guess/increment another dentist's
 * consult id and trigger a Plans handoff on a patient they have no
 * legitimate access to (found in a security review, 2026-09-12).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("flow:trigger-handoff");
    const scope = await resolveFlowScope(session);
    const { id } = await params;
    await assertConsultInScope(session.practiceId, id, scope);
    const result = await triggerPlansHandoff(session.practiceId, resolveAuditActor(session), id);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
