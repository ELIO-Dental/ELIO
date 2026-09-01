import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { getPlanPatientDetail } from "@/lib/plans-service";

type RouteParams = { params: Promise<{ id: string }> };

/** Plan patient detail for the patient detail page (P2.3). */
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("plans:view-payments");
    const { id } = await params;
    const detail = await getPlanPatientDetail(session.practiceId, id);
    if (!detail) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (e) {
    return errorResponse(e);
  }
}
