import { NextResponse } from "next/server";
import { requirePermission, resolveFlowScope } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { syncConsultFinancials } from "@/lib/flow-service";
import { assertConsultInScope } from "@/lib/flow-scope";

/**
 * Sync `Consult.totalPaidPence` and `hasDeposit` from the linked patient's
 * Dentally-synced payments (legacy manual-sync parity).
 *
 * `assertConsultInScope` was missing here (unlike the sibling
 * outcome/pipeline-move routes) — a scoped clinician could force a
 * financial re-sync on a consult they don't own (security review,
 * 2026-09-12).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("flow:capture-enquiry");
    const scope = await resolveFlowScope(session);
    const { id } = await params;
    await assertConsultInScope(session.practiceId, id, scope);
    const result = await syncConsultFinancials(session.practiceId, id);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
