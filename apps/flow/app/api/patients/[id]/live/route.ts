import { NextResponse } from "next/server";
import { fetchLivePatientPanel } from "@elio/dentally";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/** F2.10 — live Dentally proxy for dashboard patient detail panel. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("flow:capture-enquiry");
    const { id } = await params;
    const panel = await fetchLivePatientPanel(session.practiceId, id);
    return NextResponse.json(panel);
  } catch (e) {
    return errorResponse(e);
  }
}
