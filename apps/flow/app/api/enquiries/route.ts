import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { captureEnquiry } from "@/lib/flow-service";

/** Capture a new enquiry (PERMISSIONS_MATRIX.md §5 — flow:capture-enquiry). */
export async function POST(req: Request) {
  try {
    const session = await requirePermission("flow:capture-enquiry");
    const body = await req.json().catch(() => ({}));
    const patientId = typeof body?.patientId === "string" && body.patientId.length > 0 ? body.patientId : undefined;
    const source = typeof body?.source === "string" && body.source.length > 0 ? body.source : undefined;
    const result = await captureEnquiry(session.practiceId, {
      patientId,
      source,
      capturedByUserId: session.userId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
