import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { getFlowSettings, saveFlowSettings } from "@elio/dentally";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/** F3.1 — Flow practice settings (plan name, consult filter, conversion thresholds). */
export async function GET() {
  try {
    const session = await requirePermission("flow:view");
    const settings = await getFlowSettings(session.practiceId);
    return NextResponse.json({ settings });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requirePermission("practice:manage");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const settings = await saveFlowSettings(session.practiceId, body);
    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "flow.settings.updated",
      targetType: "Practice",
      targetId: session.practiceId,
      metadata: { keys: Object.keys(body) },
    });
    return NextResponse.json({ ok: true, settings });
  } catch (e) {
    return errorResponse(e);
  }
}
