import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { enrolPatient } from "@/lib/plans-service";

/** Enrol a patient onto a plan (PERMISSIONS_MATRIX.md §4 — plans:invite-patients). */
export async function POST(req: Request) {
  try {
    const session = await requirePermission("plans:invite-patients");
    const body = await req.json();
    if (typeof body?.patientId !== "string" || typeof body?.planId !== "string") {
      return NextResponse.json({ error: "patientId and planId are required" }, { status: 400 });
    }
    const result = await enrolPatient(session.practiceId, body);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
