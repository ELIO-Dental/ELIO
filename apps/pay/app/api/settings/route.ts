import { NextResponse } from "next/server";
import { getPaySettings, savePaySettings } from "@/lib/pay-settings-service";
import { paySettingsForExport, type PaySettings } from "@/lib/pay-settings";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { recordPayAudit } from "@/lib/pay-audit";

const AUDITED_SETTING_KEYS = [
  "lab_bill_split",
  "finance_fee_split",
  "therapy_hourly_rate",
  "therapy_rate",
  "finance_rate_3m",
  "finance_rate_12m",
  "finance_rate_36m",
  "finance_rate_60m",
  "cosmetic_consultation_treatment_code",
] as const;

function auditedSettingsSlice(settings: PaySettings) {
  const out: Record<string, unknown> = {};
  for (const key of AUDITED_SETTING_KEYS) {
    out[key] = settings[key];
  }
  return out;
}

/** Full pay settings (Y3.5 / Step 31). */
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
    const before = auditedSettingsSlice(await getPaySettings(session.practiceId));
    const settings = await savePaySettings(session.practiceId, body);
    const after = auditedSettingsSlice(settings);
    await recordPayAudit(session, {
      action: "pay.settings.updated",
      targetType: "Practice",
      targetId: session.practiceId,
      metadata: { before, after },
    });
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
    const before = auditedSettingsSlice(await getPaySettings(session.practiceId));
    const patch: Record<string, unknown> = { ...body };
    if ("cosmeticConsultationTreatmentCode" in body) {
      patch.cosmetic_consultation_treatment_code = body.cosmeticConsultationTreatmentCode;
      delete patch.cosmeticConsultationTreatmentCode;
    }
    const settings = await savePaySettings(session.practiceId, patch);
    const after = auditedSettingsSlice(settings);
    await recordPayAudit(session, {
      action: "pay.settings.updated",
      targetType: "Practice",
      targetId: session.practiceId,
      metadata: { before, after },
    });
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
