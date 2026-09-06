import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { requirePermission } from "@/lib/session";
import { errorResponse, BadRequestError } from "@/lib/api-error";
import { createManualPatient } from "@/lib/plans-service";

/** Create a manual (non-Dentally) patient, optionally enrol on a plan. */
export async function POST(req: Request) {
  try {
    const session = await requirePermission("plans:invite-patients");
    const body = await req.json().catch(() => ({}));

    const firstName = typeof body?.firstName === "string" ? body.firstName : "";
    const lastName = typeof body?.lastName === "string" ? body.lastName : "";
    if (!firstName.trim() || !lastName.trim()) {
      throw new BadRequestError("firstName and lastName are required");
    }

    const result = await createManualPatient(session.practiceId, {
      firstName,
      lastName,
      email: typeof body?.email === "string" ? body.email : undefined,
      phone: typeof body?.phone === "string" ? body.phone : undefined,
      dateOfBirth: typeof body?.dateOfBirth === "string" ? body.dateOfBirth : undefined,
      planId: typeof body?.planId === "string" ? body.planId : undefined,
      parentPatientId: typeof body?.parentPatientId === "string" ? body.parentPatientId : undefined,
    });

    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.patient.created_manual",
      targetType: "Patient",
      targetId: result.patient.id,
      metadata: {
        enrolled: Boolean(result.enrolment),
        planPatientId: result.enrolment?.planPatient.id ?? null,
      },
    });

    return NextResponse.json(
      {
        patient: result.patient,
        planPatient: result.enrolment?.planPatient ?? null,
        enrolment: result.enrolment?.enrolment ?? null,
        signupUrl: result.enrolment?.signupToken
          ? `/plans/signup/${result.enrolment.signupToken}`
          : null,
      },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
