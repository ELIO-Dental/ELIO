import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { scheduleReminder } from "@/lib/flow-service";

/** Schedule a new reminder for a Consult (PERMISSIONS_MATRIX.md §5 —
 * flow:capture-enquiry covers the staff pipeline workflow, reminders included). */
export async function POST(req: Request) {
  try {
    const session = await requirePermission("flow:capture-enquiry");
    const body = await req.json().catch(() => ({}));
    const { consultId, dueAt, channel } = body ?? {};
    if (typeof consultId !== "string" || typeof dueAt !== "string") {
      return NextResponse.json({ error: "consultId and dueAt are required" }, { status: 400 });
    }
    const parsedDueAt = new Date(dueAt);
    if (Number.isNaN(parsedDueAt.getTime())) {
      return NextResponse.json({ error: "dueAt must be a valid date" }, { status: 400 });
    }
    const result = await scheduleReminder(
      session.practiceId,
      consultId,
      parsedDueAt,
      typeof channel === "string" && channel.length > 0 ? channel : undefined,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
