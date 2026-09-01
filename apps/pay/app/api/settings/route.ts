import { NextResponse } from "next/server";
import { getPaySettings, savePaySettings } from "@/lib/pay-settings-service";
import { paySettingsForExport } from "@/lib/pay-settings";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/** Full pay settings (Y3.5). */
export async function GET() {
  try {
    const session = await requirePermission("pay:view");
    const settings = await getPaySettings(session.practiceId);
    return NextResponse.json({ settings: paySettingsForExport(settings) });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return errorResponse(err);
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requirePermission("practice:manage");
    const body = (await req.json()) as Record<string, unknown>;
    const settings = await savePaySettings(session.practiceId, body);
    return NextResponse.json({ ok: true, settings: paySettingsForExport(settings) });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return errorResponse(err);
  }
}

/** Partial update — cosmetic code only (backward compat). */
export async function PATCH(req: Request) {
  try {
    const session = await requirePermission("practice:manage");
    const body = (await req.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = { ...body };
    if ("cosmeticConsultationTreatmentCode" in body) {
      patch.cosmetic_consultation_treatment_code = body.cosmeticConsultationTreatmentCode;
      delete patch.cosmeticConsultationTreatmentCode;
    }
    const settings = await savePaySettings(session.practiceId, patch);
    return NextResponse.json({
      cosmeticConsultationTreatmentCode: settings.cosmetic_consultation_treatment_code || null,
      settings: paySettingsForExport(settings),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return errorResponse(err);
  }
}
