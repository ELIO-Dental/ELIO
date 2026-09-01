import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { legacyStatusToOutcome, updateConsultFromDashboard } from "@/lib/flow-service";
import { resolveAuditActor } from "@elio/auth";

/** Update a Consult's own fields (quote, deposit, treatment booked,
 * practitioner, notes) from the consult detail screen. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("flow:capture-enquiry");
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const input: Parameters<typeof updateConsultFromDashboard>[3] = {};
    if ("quotePence" in body) input.quotePence = body.quotePence === null ? null : Number(body.quotePence);
    if ("quotePenceOverride" in body) {
      input.quotePenceOverride = body.quotePenceOverride === null ? null : Number(body.quotePenceOverride);
    }
    if ("hasDeposit" in body) input.hasDeposit = body.hasDeposit === null ? null : Boolean(body.hasDeposit);
    if ("treatmentBooked" in body) {
      input.treatmentBooked = body.treatmentBooked === null ? null : Boolean(body.treatmentBooked);
    }
    if ("practitionerDentistId" in body) {
      input.practitionerDentistId =
        typeof body.practitionerDentistId === "string" && body.practitionerDentistId.length > 0
          ? body.practitionerDentistId
          : null;
    }
    if ("notes" in body) {
      input.notes = typeof body.notes === "string" && body.notes.length > 0 ? body.notes : null;
    }
    if ("planSignedUp" in body) input.planSignedUp = Boolean(body.planSignedUp);
    if ("legacyStatus" in body) {
      const status = String(body.legacyStatus);
      legacyStatusToOutcome(status); // validate before save
      input.legacyStatus = status;
    }

    const result = await updateConsultFromDashboard(session.practiceId, resolveAuditActor(session), id, input);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
