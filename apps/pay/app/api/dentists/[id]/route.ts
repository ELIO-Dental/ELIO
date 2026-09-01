import { NextResponse } from "next/server";
import { updateDentist } from "@/lib/pay-service";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:configure-splits");
    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;

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
    });

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
