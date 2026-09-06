import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { sendPatientTermsSigningLink } from "@/lib/plans-service";

type RouteParams = { params: Promise<{ id: string }> };

/** Email T&C signing link (legacy send-terms) → /plans/signup/[token]. */
export async function POST(_req: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("plans:invite-patients");
    const { id } = await params;
    const result = await sendPatientTermsSigningLink(session.practiceId, id, {
      sentById: session.userId,
    });
    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.patient.terms_sent",
      targetType: "PlanPatient",
      targetId: id,
      metadata: { emailSent: result.emailSent },
    });
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
