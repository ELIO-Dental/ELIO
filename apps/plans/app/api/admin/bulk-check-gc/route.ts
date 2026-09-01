import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { requirePlansEdit } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { bulkCheckGoCardlessMandates } from "@/lib/plans-service";

/** Bulk discover and link GoCardless mandates for imported patients (P2.6). */
export async function POST() {
  try {
    const session = await requirePlansEdit();
    const result = await bulkCheckGoCardlessMandates(session.practiceId);
    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.gocardless.bulk_check",
      targetType: "Practice",
      targetId: session.practiceId,
      metadata: { checked: result.checked, linked: result.linked, errors: result.errors.length },
    });
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
