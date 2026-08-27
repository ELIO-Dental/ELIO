import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { linkConsultToAppointment } from "@/lib/flow-service";

/** Link a Consult to a real Dentally-synced Appointment picked from the
 * appointment picker on the consult detail screen. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("flow:capture-enquiry");
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { appointmentId } = body ?? {};
    if (typeof appointmentId !== "string" || appointmentId.length === 0) {
      return NextResponse.json({ error: "appointmentId is required" }, { status: 400 });
    }
    const result = await linkConsultToAppointment(session.practiceId, id, appointmentId);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
