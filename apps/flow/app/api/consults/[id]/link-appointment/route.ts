import { NextResponse } from "next/server";
import { requirePermission, resolveFlowScope } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { linkConsultToAppointment } from "@/lib/flow-service";
import { assertConsultInScope } from "@/lib/flow-scope";

/**
 * Link a Consult to a real Dentally-synced Appointment picked from the
 * appointment picker on the consult detail screen.
 *
 * `assertConsultInScope` was missing here (unlike the sibling
 * outcome/pipeline-move routes) — a scoped clinician could relink another
 * dentist's consult to a different appointment, corrupting attribution on
 * a patient they have no legitimate access to (security review, 2026-09-12).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("flow:capture-enquiry");
    const scope = await resolveFlowScope(session);
    const { id } = await params;
    await assertConsultInScope(session.practiceId, id, scope);
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
