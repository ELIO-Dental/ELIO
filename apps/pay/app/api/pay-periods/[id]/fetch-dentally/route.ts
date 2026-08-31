import { NextResponse } from "next/server";
import { DentallyFetchConfigError, fetchDentallyForPayPeriod } from "@/lib/dentally-fetch";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/** Y1.2 — POST fetch from Dentally for a draft pay period (legacy AuraPay /api/dentally parity). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:run-period");
    const { id: payPeriodId } = await params;

    const result = await fetchDentallyForPayPeriod(session.practiceId, payPeriodId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DentallyFetchConfigError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Error && err.message === "Pay period is locked") {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof Error && err.message === "Pay period not found") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return errorResponse(err);
  }
}
