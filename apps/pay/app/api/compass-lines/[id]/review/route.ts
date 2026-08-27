import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { writeAuditLog, resolveAuditActor } from "@elio/auth";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/**
 * Manual Review screen action (§6.2) — admin confirms/corrects a flagged Compass line.
 * Body: { dentistId: string, udas?: number, superannuationPence?: number }
 * Every correction writes an AuditLog row (PERMISSIONS_MATRIX.md §3 — amending NHS figures).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:review-nhs-figure");
    const { id: lineId } = await params;
    const body = await req.json();
    const db = scopedDb(session.practiceId);

    // PayLine has no practiceId column of its own (see packages/db/tenant.ts's note) —
    // scope this read explicitly via its parent CompassStatement's practiceId so a line
    // id from another practice can never be read/updated here.
    const existing = await db.payLine.findFirst({
      where: { id: lineId, compassStatement: { practiceId: session.practiceId } },
    });
    if (!existing) return NextResponse.json({ error: "Line not found" }, { status: 404 });

    const dentist = await db.dentist.findUnique({ where: { id: body.dentistId } });
    if (!dentist) return NextResponse.json({ error: "Dentist not found" }, { status: 400 });

    const updated = await db.payLine.update({
      where: { id: lineId },
      data: {
        dentistId: dentist.id,
        udas: body.udas ?? existing.udas,
        superannuationPence: body.superannuationPence ?? existing.superannuationPence,
        matchConfidence: "CONFIDENT",
        // Attributed to the REAL actor (the Super Admin during impersonation,
        // Step 2.3) — same identity as the AuditLog row below, never the
        // impersonated user, for consistent, honest attribution.
        reviewedBy: resolveAuditActor(session).actorUserId,
        reviewedAt: new Date(),
      },
    });

    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "pay.compass_line.manual_review",
      targetType: "PayLine",
      targetId: lineId,
      metadata: {
        previousDentistId: existing.dentistId,
        newDentistId: dentist.id,
        performerNumber: existing.performerNumber,
        rawDentistName: existing.rawDentistName,
        udas: updated.udas ? Number(updated.udas) : null,
        superannuationPence: updated.superannuationPence,
      },
    });

    return NextResponse.json({ line: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
