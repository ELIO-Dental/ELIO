import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { requirePlansEdit } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { createMandateFlow } from "@/lib/plans-service";

type RouteParams = { params: Promise<{ id: string }> };

/** Start in-practice GoCardless DD setup for a plan patient (P2.3a). */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await requirePlansEdit();
    const { id } = await params;
    const body = await req.json();
    if (typeof body?.redirectUri !== "string" || typeof body?.exitUri !== "string") {
      return NextResponse.json({ error: "redirectUri and exitUri are required" }, { status: 400 });
    }

    const result = await createMandateFlow(session.practiceId, {
      planPatientId: id,
      redirectUri: body.redirectUri,
      exitUri: body.exitUri,
      email: typeof body?.email === "string" ? body.email : "",
      givenName: typeof body?.givenName === "string" ? body.givenName : "",
      familyName: typeof body?.familyName === "string" ? body.familyName : "",
    });

    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.patient.setup_dd_started",
      targetType: "PlanPatient",
      targetId: id,
    });

    const authorisationUrl =
      (result.flow as { authorisation_url?: string })?.authorisation_url ??
      (result.flow as { authorisationUrl?: string })?.authorisationUrl;

    return NextResponse.json({ ...result, authorisationUrl });
  } catch (e) {
    return errorResponse(e);
  }
}
