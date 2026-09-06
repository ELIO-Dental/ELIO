import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { updateDentist } from "@/lib/pay-service";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import {
  dentistRateSnapshot,
  dentistRatesUpdatedEvent,
  recordPayAudit,
} from "@/lib/pay-audit";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:configure-splits");
    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;

    const db = scopedDb(session.practiceId);
    const existing = await db.dentist.findFirst({ where: { id, practiceId: session.practiceId } });
    if (!existing) return NextResponse.json({ error: "Dentist not found" }, { status: 404 });
    const beforeRates = dentistRateSnapshot(existing);

    const dentist = await updateDentist(session.practiceId, id, {
      name: typeof body.name === "string" ? body.name : undefined,
      email:
        body.email === null
          ? null
          : typeof body.email === "string"
            ? body.email
            : undefined,
      nhsPerformerNumber:
        body.nhsPerformerNumber === null
          ? null
          : typeof body.nhsPerformerNumber === "string"
            ? body.nhsPerformerNumber
            : undefined,
      dentallyPractitionerId:
        body.dentallyPractitionerId === null
          ? null
          : typeof body.dentallyPractitionerId === "string"
            ? body.dentallyPractitionerId
            : undefined,
      privateSplitPercent:
        body.privateSplitPercent != null
          ? Number(body.privateSplitPercent)
          : body.privateSplitPercent === null
            ? null
            : undefined,
      udaRatePence:
        body.udaRatePence != null
          ? Math.round(Number(body.udaRatePence))
          : body.udaRate != null
            ? Math.round(Number(body.udaRate) * 100)
            : body.udaRatePence === null
              ? null
              : undefined,
      hourlyRatePence:
        body.hourlyRatePence != null
          ? Math.round(Number(body.hourlyRatePence))
          : body.hourlyRate != null
            ? Math.round(Number(body.hourlyRate) * 100)
            : body.hourlyRatePence === null
              ? null
              : undefined,
      labShareBp:
        body.labShareBp != null
          ? Math.round(Number(body.labShareBp))
          : body.labShareBp === null
            ? null
            : undefined,
      financeShareBp:
        body.financeShareBp != null
          ? Math.round(Number(body.financeShareBp))
          : body.financeShareBp === null
            ? null
            : undefined,
      therapyHourlyPence:
        body.therapyHourlyPence != null
          ? Math.round(Number(body.therapyHourlyPence))
          : body.therapyHourly != null
            ? Math.round(Number(body.therapyHourly) * 100)
            : body.therapyHourlyPence === null
              ? null
              : undefined,
    });

    const rateEvent = dentistRatesUpdatedEvent(
      dentist.id,
      beforeRates,
      dentistRateSnapshot(dentist),
      typeof body.reason === "string" ? body.reason : null
    );
    if (rateEvent) {
      await recordPayAudit(session, rateEvent);
    }

    return NextResponse.json({ dentist });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof Error && err.message === "Dentist not found") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return errorResponse(err);
  }
}
