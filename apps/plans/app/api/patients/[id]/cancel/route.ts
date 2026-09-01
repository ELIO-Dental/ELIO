import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { cancelPlanPatient } from "@/lib/plans-service";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("plans:invite-patients");
    const { id } = await params;
    const planPatient = await cancelPlanPatient(session.practiceId, id);
    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.patient.cancelled",
      targetType: "PlanPatient",
      targetId: id,
    });
    return NextResponse.json({ planPatient });
  } catch (e) {
    return errorResponse(e);
  }
}
