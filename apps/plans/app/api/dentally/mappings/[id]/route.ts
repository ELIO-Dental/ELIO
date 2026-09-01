import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { scopedDb } from "@elio/db";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

type RouteParams = { params: Promise<{ id: string }> };

/** Update a Dentally plan mapping (P1.5). */
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("plans:edit-settings");
    const db = scopedDb(session.practiceId);
    const { id } = await params;
    const body = await req.json();

    const existing = await db.dentallyPlanMapping.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }

    const data: { dentallyPlanName?: string; planModelId?: string } = {};
    if (typeof body?.dentallyPlanName === "string" && body.dentallyPlanName.trim()) {
      data.dentallyPlanName = body.dentallyPlanName.trim();
    }
    if (typeof body?.planModelId === "string" && body.planModelId) {
      const plan = await db.planModel.findUnique({ where: { id: body.planModelId } });
      if (!plan) {
        return NextResponse.json({ error: "Plan not found" }, { status: 404 });
      }
      data.planModelId = body.planModelId;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const mapping = await db.dentallyPlanMapping.update({
      where: { id },
      data,
      include: { planModel: { select: { id: true, name: true } } },
    });

    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.dentally.mapping.updated",
      targetType: "DentallyPlanMapping",
      targetId: id,
      metadata: data,
    });

    return NextResponse.json(mapping);
  } catch (e) {
    return errorResponse(e);
  }
}

/** Delete a Dentally plan mapping (P1.5). */
export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("plans:edit-settings");
    const db = scopedDb(session.practiceId);
    const { id } = await params;

    const existing = await db.dentallyPlanMapping.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }

    await db.dentallyPlanMapping.delete({ where: { id } });

    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.dentally.mapping.deleted",
      targetType: "DentallyPlanMapping",
      targetId: id,
      metadata: { dentallyPlanName: existing.dentallyPlanName, planModelId: existing.planModelId },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return errorResponse(e);
  }
}
