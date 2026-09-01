import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { requirePlansEdit } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { linkPlanPatientMandate } from "@/lib/plans-service";

type RouteParams = { params: Promise<{ id: string }> };

/** Manually link a GoCardless mandate ID (P2.3a). */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await requirePlansEdit();
    const { id } = await params;
    const body = await req.json();
    const gocardlessMandateId =
      typeof body?.gocardlessMandateId === "string" ? body.gocardlessMandateId.trim() : "";
    if (!gocardlessMandateId) {
      return NextResponse.json({ error: "gocardlessMandateId is required" }, { status: 400 });
    }

    const mandate = await linkPlanPatientMandate(session.practiceId, id, gocardlessMandateId);
    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.patient.mandate_linked",
      targetType: "PlanMandate",
      targetId: mandate.id,
      metadata: { gocardlessMandateId },
    });
    return NextResponse.json({ mandate });
  } catch (e) {
    return errorResponse(e);
  }
}
