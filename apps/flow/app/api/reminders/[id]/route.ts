import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { markReminderSent } from "@/lib/flow-service";

/** Mark a reminder sent (PERMISSIONS_MATRIX.md §5 — flow:capture-enquiry). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("flow:capture-enquiry");
    const { id } = await params;
    const result = await markReminderSent(session.practiceId, id);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
