import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { createMandateFlow, recordMandate } from "@/lib/plans-service";

/** Start a GoCardless Billing Request Flow for a plan patient's DD mandate
 * (the public patient signup flow's "set up Direct Debit" step). */
export async function POST(req: Request) {
  try {
    const session = await requirePermission("plans:invite-patients");
    const body = await req.json();
    if (typeof body?.planPatientId !== "string") {
      return NextResponse.json({ error: "planPatientId is required" }, { status: 400 });
    }
    const result = await createMandateFlow(session.practiceId, body);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Record a mandate the signup callback confirmed with GoCardless directly
 * (idempotent — the webhook may also see/create the same mandate first). */
export async function PATCH(req: Request) {
  try {
    const session = await requirePermission("plans:invite-patients");
    const body = await req.json();
    if (typeof body?.planPatientId !== "string" || typeof body?.gocardlessMandateId !== "string") {
      return NextResponse.json({ error: "planPatientId and gocardlessMandateId are required" }, { status: 400 });
    }
    const mandate = await recordMandate(session.practiceId, body);
    return NextResponse.json({ mandate });
  } catch (e) {
    return errorResponse(e);
  }
}
