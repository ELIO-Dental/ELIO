import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { sendPatientDdSetupLink } from "@/lib/plans-service";

type RouteParams = { params: Promise<{ id: string }> };

/** Email the plan's GoCardless Direct Debit payment-page link (legacy send-dd-link). */
export async function POST(_req: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("plans:invite-patients");
    const { id } = await params;
    const result = await sendPatientDdSetupLink(session.practiceId, id, {
      sentById: session.userId,
    });
    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.patient.dd_link_emailed",
      targetType: "PlanPatient",
      targetId: id,
      metadata: { emailSent: result.emailSent },
    });
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
