import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { checkPlanPatientGoCardless } from "@/lib/plans-service";

type RouteParams = { params: Promise<{ id: string }> };

/** Poll GoCardless mandate status for one plan patient (P2.3a). */
export async function POST(_req: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("plans:invite-patients");
    const { id } = await params;
    const result = await checkPlanPatientGoCardless(session.practiceId, id);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
