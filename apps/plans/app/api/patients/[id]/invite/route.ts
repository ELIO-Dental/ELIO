import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { resendPatientSignupInvite } from "@/lib/plans-service";

type RouteParams = { params: Promise<{ id: string }> };

/** Create a new signup invite link (P2.3a — legacy invite / send-terms / send-dd-link). */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("plans:invite-patients");
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const sendEmail = body?.sendEmail !== false;
    const result = await resendPatientSignupInvite(session.practiceId, id, {
      sendEmail,
      sentById: session.userId,
    });
    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.patient.invite_sent",
      targetType: "PlanPatient",
      targetId: id,
      metadata: { emailed: result.emailed },
    });
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
