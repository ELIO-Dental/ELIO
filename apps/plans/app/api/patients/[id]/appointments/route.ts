import { NextResponse } from "next/server";
import { fetchLivePatientPanel, DentallySyncConfigError } from "@elio/dentally";
import { requireViewPayments } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { getPlanPatientDetail } from "@/lib/plans-service";

type RouteParams = { params: Promise<{ id: string }> };

/** Live Dentally appointments for a plan patient (P2.3a). */
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const session = await requireViewPayments();
    const { id } = await params;
    const detail = await getPlanPatientDetail(session.practiceId, id);
    if (!detail) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    try {
      const panel = await fetchLivePatientPanel(session.practiceId, detail.patientId);
      return NextResponse.json({
        appointments: panel.appointments,
        fetchedAt: panel.fetchedAt,
        configured: true,
      });
    } catch (e) {
      if (e instanceof DentallySyncConfigError) {
        return NextResponse.json(
          { error: "Dentally is not configured", configured: false, appointments: [] },
          { status: 400 },
        );
      }
      if (e instanceof Error && e.message === "Patient not found") {
        return NextResponse.json({ appointments: [], configured: true });
      }
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
