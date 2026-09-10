import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import {
  DentallySyncConfigError,
  PlansDentallySyncConfigError,
  runPlansDentallyReassign,
} from "@elio/dentally";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/**
 * Reassign ELIO plans from live Dentally payment plan data (P1.9).
 * Sequential per-patient `GET /patients/{id}` calls (no batching) — wall-clock time
 * scales with roster size. Unlike apps/pay's fetch-dentally route this has no
 * maxDuration of its own before this fix, so a practice with a large linked-patient
 * roster was at real risk of hitting the platform's default execution timeout with
 * zero partial result (see handleReassign's fixed no-catch bug in
 * dentally-mappings-client.tsx for the client-side half of this).
 */
export const maxDuration = 300;

export async function POST() {
  try {
    const session = await requirePermission("plans:edit-settings");
    const result = await runPlansDentallyReassign(session.practiceId);

    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.dentally.reassign",
      targetType: "Practice",
      targetId: session.practiceId,
      metadata: {
        total: result.total,
        assigned: result.assigned,
        corrected: result.corrected,
        skipped: result.skipped,
        details: result.details,
      },
    });

    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    if (e instanceof PlansDentallySyncConfigError) {
      return NextResponse.json({ error: e.message, ...e.details }, { status: 400 });
    }
    if (e instanceof DentallySyncConfigError) {
      return NextResponse.json({ error: e.message, configured: false }, { status: 400 });
    }
    return errorResponse(e);
  }
}
