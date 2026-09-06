import { NextResponse } from "next/server";
import { listPayslipEntriesForPeriod, savePayslipEntry } from "@/lib/pay-service";
import {
  normalizeSavePayslipEntryInput,
  PayslipAdjustmentValidationError,
} from "@/lib/save-payslip-entry";
import { getPaySettings } from "@/lib/pay-settings-service";
import { resolveLabBillSplit } from "@/lib/pay-settings";
import { requireAnyPermission, requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { scopedDb } from "@elio/db";
import { resolvePayPractitionerScope } from "@/lib/pay-scope";
import { payslipEditAuditEvents, recordPayAudits } from "@/lib/pay-audit";

/** List payslip entries for a period (Step 30 — scoped for own-only clinicians). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAnyPermission(
      "pay:view",
      "pay:view:readonly",
      "pay:view-own-payslip"
    );
    const { id: payPeriodId } = await params;
    const scope = await resolvePayPractitionerScope(session.practiceId, session);
    if (!scope.viewAll && !scope.dentistId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const entries = await listPayslipEntriesForPeriod(
      session.practiceId,
      payPeriodId,
      scope.viewAll ? null : scope.dentistId
    );
    return NextResponse.json({ entries });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Save a single dentist payslip without recalculating the whole period (Y2.1a / Step 27 / Step 31). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:run-period");
    const { id: payPeriodId } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const paySettings = await getPaySettings(session.practiceId);
    const input = normalizeSavePayslipEntryInput(body, {
      labBillSplit: resolveLabBillSplit(paySettings),
      actorUserId: session.userId,
    });

    if (!input.payslipEntryId) {
      return NextResponse.json({ error: "payslipEntryId required" }, { status: 400 });
    }

    const db = scopedDb(session.practiceId);
    const before = await db.payslipEntry.findFirst({
      where: { id: input.payslipEntryId, payPeriodId },
      select: {
        manualAdjustmentsPence: true,
        adjustmentsJson: true,
        udas: true,
        therapyMinutes: true,
      },
    });

    const payslip = await savePayslipEntry(session.practiceId, payPeriodId, input);

    const events = payslipEditAuditEvents(
      payslip.id,
      {
        udas: before?.udas != null ? Number(before.udas) : null,
        therapyMinutes: before?.therapyMinutes != null ? Number(before.therapyMinutes) : null,
        manualAdjustmentsPence: before?.manualAdjustmentsPence ?? null,
        adjustmentsJson: before?.adjustmentsJson ?? null,
      },
      {
        udas: payslip.udas != null ? Number(payslip.udas) : null,
        therapyMinutes: payslip.therapyMinutes != null ? Number(payslip.therapyMinutes) : null,
        manualAdjustmentsPence: payslip.manualAdjustmentsPence ?? null,
        adjustmentsJson: payslip.adjustmentsJson ?? null,
      },
      {
        udas: input.udas !== undefined,
        therapyMinutes: input.therapyMinutes !== undefined,
        adjustments: input.adjustmentsJson !== undefined,
      }
    );
    await recordPayAudits(session, events);

    return NextResponse.json({ ok: true, payslip });
  } catch (err) {
    if (err instanceof PayslipAdjustmentValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Save failed";
    if (message === "Pay period is locked") return NextResponse.json({ error: message }, { status: 409 });
    if (message === "Payslip not found" || message === "Pay period not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return errorResponse(err);
  }
}
