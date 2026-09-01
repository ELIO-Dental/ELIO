import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { scopedDb } from "@elio/db";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/** List Dentally plan → ELIO plan mappings for this practice (P1.5). */
export async function GET() {
  try {
    const session = await requirePermission("plans:edit-settings");
    const db = scopedDb(session.practiceId);
    const mappings = await db.dentallyPlanMapping.findMany({
      include: {
        planModel: {
          select: { id: true, name: true, monthlyPricePence: true, requiresAdultMembership: true },
        },
      },
      orderBy: { dentallyPlanName: "asc" },
    });
    return NextResponse.json(mappings);
  } catch (e) {
    return errorResponse(e);
  }
}

/** Create a Dentally plan mapping (P1.5). */
export async function POST(req: Request) {
  try {
    const session = await requirePermission("plans:edit-settings");
    const db = scopedDb(session.practiceId);
    const body = await req.json();
    const dentallyPlanName = typeof body?.dentallyPlanName === "string" ? body.dentallyPlanName.trim() : "";
    const planModelId = typeof body?.planModelId === "string" ? body.planModelId : "";

    if (!dentallyPlanName || !planModelId) {
      return NextResponse.json({ error: "dentallyPlanName and planModelId are required" }, { status: 400 });
    }

    const plan = await db.planModel.findUnique({ where: { id: planModelId } });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const mapping = await db.dentallyPlanMapping.create({
      data: {
        practiceId: session.practiceId,
        dentallyPlanName,
        planModelId,
      },
      include: { planModel: { select: { id: true, name: true } } },
    });

    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.dentally.mapping.created",
      targetType: "DentallyPlanMapping",
      targetId: mapping.id,
      metadata: { dentallyPlanName, planModelId },
    });

    return NextResponse.json(mapping, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
