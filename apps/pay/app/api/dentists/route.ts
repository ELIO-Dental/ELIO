import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { listDentists, createDentist } from "@/lib/pay-service";

export async function GET() {
  try {
    const session = await requirePermission("pay:view");
    const dentists = await listDentists(session.practiceId, { includeInactive: true });
    return NextResponse.json({ dentists });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("pay:configure-splits");
    const body = (await req.json()) as Record<string, unknown>;
    const dentist = await createDentist(session.practiceId, {
      name: String(body.name ?? "").trim(),
      email: typeof body.email === "string" ? body.email : null,
      nhsPerformerNumber:
        typeof body.nhsPerformerNumber === "string" ? body.nhsPerformerNumber : null,
      dentallyPractitionerId:
        typeof body.dentallyPractitionerId === "string" ? body.dentallyPractitionerId : null,
      isNhs: Boolean(body.isNhs),
      active: body.active === false ? false : true,
      payType: body.payType === "HOURLY" ? "HOURLY" : "PERCENTAGE_SPLIT",
      privateSplitPercent:
        body.privateSplitPercent != null ? Number(body.privateSplitPercent) : 50,
      udaRatePence:
        body.udaRatePence != null
          ? Math.round(Number(body.udaRatePence))
          : body.udaRate != null
            ? Math.round(Number(body.udaRate) * 100)
            : 0,
      hourlyRatePence:
        body.hourlyRatePence != null
          ? Math.round(Number(body.hourlyRatePence))
          : body.hourlyRate != null
            ? Math.round(Number(body.hourlyRate) * 100)
            : null,
      labShareBp: body.labShareBp != null ? Math.round(Number(body.labShareBp)) : null,
      financeShareBp: body.financeShareBp != null ? Math.round(Number(body.financeShareBp)) : null,
      therapyHourlyPence:
        body.therapyHourlyPence != null ? Math.round(Number(body.therapyHourlyPence)) : null,
    });
    return NextResponse.json({ dentist }, { status: 201 });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
