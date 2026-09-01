import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { requirePlansEdit } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { pausePlanPatient, resumePlanPatient } from "@/lib/plans-service";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await requirePlansEdit();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = body?.action === "resume" ? "resume" : "pause";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : undefined;

    if (action === "resume") {
      const planPatient = await resumePlanPatient(session.practiceId, id);
      await writeAuditLog({
        ...resolveAuditActor(session),
        practiceId: session.practiceId,
        action: "plans.patient.resumed",
        targetType: "PlanPatient",
        targetId: id,
      });
      return NextResponse.json({ planPatient });
    }

    const result = await pausePlanPatient(session.practiceId, id, reason);
    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.patient.paused",
      targetType: "PlanPatient",
      targetId: id,
      metadata: reason ? { reason } : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
