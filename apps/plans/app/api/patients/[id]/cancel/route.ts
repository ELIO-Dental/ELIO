import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { requirePlansEdit } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { cancelPlanPatient } from "@/lib/plans-service";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await requirePlansEdit();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const cancelDirectDebit = body?.cancelDirectDebit === true;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : undefined;

    const result = await cancelPlanPatient(session.practiceId, id, { cancelDirectDebit, reason });
    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.patient.cancelled",
      targetType: "PlanPatient",
      targetId: id,
      metadata: { cancelDirectDebit, reason, gcErrors: result.gcErrors },
    });
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
