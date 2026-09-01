import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { requireLicensedSession, requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { getBrandingSettings, setBrandingSettings } from "@/lib/plans-settings";

export async function GET() {
  try {
    const session = await requireLicensedSession();
    const branding = await getBrandingSettings(session.practiceId);
    return NextResponse.json(branding);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requirePermission("plans:edit-settings");
    const body = await req.json().catch(() => ({}));
    const branding = await setBrandingSettings(session.practiceId, body);

    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.settings.branding_updated",
      targetType: "PlanPracticeSetting",
      targetId: session.practiceId,
      metadata: { keys: Object.keys(body) },
    });

    return NextResponse.json(branding);
  } catch (e) {
    return errorResponse(e);
  }
}
