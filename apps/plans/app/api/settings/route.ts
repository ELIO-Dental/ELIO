import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { requireLicensedSession, requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { updateRedeemRuleApproval } from "@/lib/plans-service";
import {
  EDITABLE_SETTING_KEYS,
  getAllPlanSettings,
  getBrandingSettings,
  getGoCardlessEnvStatus,
  setBrandingSettings,
  setPlanSettings,
} from "@/lib/plans-settings";

export async function GET() {
  try {
    const session = await requireLicensedSession();
    const [settings, branding] = await Promise.all([
      getAllPlanSettings(session.practiceId),
      getBrandingSettings(session.practiceId),
    ]);

    return NextResponse.json({
      settings,
      branding,
      gocardless: getGoCardlessEnvStatus(),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requirePermission("plans:edit-settings");
    const body = await req.json().catch(() => ({}));

    if (body?.branding && typeof body.branding === "object") {
      const branding = await setBrandingSettings(session.practiceId, body.branding);
      await writeAuditLog({
        ...resolveAuditActor(session),
        practiceId: session.practiceId,
        action: "plans.settings.branding_updated",
        targetType: "PlanPracticeSetting",
        targetId: session.practiceId,
        metadata: { keys: Object.keys(body.branding) },
      });
      const settings = await getAllPlanSettings(session.practiceId);
      return NextResponse.json({ settings, branding });
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const updates: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (key === "branding") continue;
      if (!EDITABLE_SETTING_KEYS.has(key)) continue;
      updates[key] = String(value);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No editable settings provided" }, { status: 400 });
    }

    const settings = await setPlanSettings(session.practiceId, updates);
    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.settings.updated",
      targetType: "PlanPracticeSetting",
      targetId: session.practiceId,
      metadata: { keys: Object.keys(updates) },
    });

    const branding = await getBrandingSettings(session.practiceId);
    return NextResponse.json({ settings, branding });
  } catch (e) {
    return errorResponse(e);
  }
}

// PATCH: toggle a redeem rule's approval requirement
export async function PATCH(req: Request) {
  try {
    const session = await requirePermission("plans:edit-settings");
    const body = await req.json().catch(() => ({}));
    const { redeemRuleId, requiresApproval } = body ?? {};
    if (typeof redeemRuleId !== "string" || !redeemRuleId || typeof requiresApproval !== "boolean") {
      return NextResponse.json({ error: "redeemRuleId and requiresApproval are required" }, { status: 400 });
    }
    const rule = await updateRedeemRuleApproval(session.practiceId, resolveAuditActor(session), redeemRuleId, requiresApproval);
    return NextResponse.json({ rule });
  } catch (e) {
    return errorResponse(e);
  }
}
