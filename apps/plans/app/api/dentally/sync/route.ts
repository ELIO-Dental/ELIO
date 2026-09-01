import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { runPlansDentallySync, PlansDentallySyncConfigError, DentallySyncConfigError } from "@elio/dentally";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/** Manual "Sync with Dentally" — payment-plan filtered patient import (P1.3). */
export async function POST() {
  try {
    const session = await requirePermission("plans:invite-patients");
    const result = await runPlansDentallySync(session.practiceId);

    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.dentally.sync",
      targetType: "Practice",
      targetId: session.practiceId,
      metadata: {
        trigger: "manual",
        imported: result.imported,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors.length,
        errorMessages: result.errors,
        syncedPlanIds: result.syncedPlanIds,
      },
    });

    return NextResponse.json({
      success: true,
      imported: result.imported,
      updated: result.updated,
      skipped: result.skipped,
      total: result.total,
      plansMatched: result.plansMatched,
      errors: result.errors.length > 0 ? result.errors : undefined,
      noEmailPatients: result.noEmailPatients.length > 0 ? result.noEmailPatients : undefined,
    });
  } catch (e) {
    if (e instanceof PlansDentallySyncConfigError) {
      return NextResponse.json({ error: e.message, ...e.details }, { status: 400 });
    }
    if (e instanceof DentallySyncConfigError) {
      return NextResponse.json(
        { error: e.message, configured: false },
        { status: 400 },
      );
    }
    return errorResponse(e);
  }
}
