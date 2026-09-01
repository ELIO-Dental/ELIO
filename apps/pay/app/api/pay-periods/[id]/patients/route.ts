import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import {
  addManualPrivatePatientLine,
  deletePrivatePatientLine,
  resolveLineItemIdByIndex,
  updatePrivatePatientLine,
  type PrivatePatientLineUpdates,
} from "@/lib/private-patient-lines";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

function mapLegacyUpdates(updates: Record<string, unknown>): PrivatePatientLineUpdates {
  return {
    paymentStatus: updates.status as PrivatePatientLineUpdates["paymentStatus"],
    isFinance: updates.finance as boolean | undefined,
    financeFeePence: updates.financeFee != null ? Math.round(Number(updates.financeFee) * 100) : undefined,
    amountPence: updates.amount != null ? Math.round(Number(updates.amount) * 100) : undefined,
    flagged: updates.resolved === true ? false : updates.resolved === false ? true : undefined,
    flagReason: typeof updates.resolvedNote === "string" ? updates.resolvedNote : undefined,
  };
}

async function resolveLineId(
  practiceId: string,
  payPeriodId: string,
  payslipEntryId: string,
  lineItemId?: string,
  patientIndex?: number
): Promise<{ lineItemId: string | null; error?: string }> {
  if (lineItemId) return { lineItemId };
  if (patientIndex == null || patientIndex < 0) return { lineItemId: null };
  const db = scopedDb(practiceId);
  const payslip = await db.payslipEntry.findFirst({
    where: { id: payslipEntryId, payPeriodId, practiceId },
    include: { privateRevenueLineItems: true },
  });
  if (!payslip) return { lineItemId: null, error: "Payslip not found" };
  if (patientIndex >= payslip.privateRevenueLineItems.length) {
    return { lineItemId: null, error: "Patient index out of range" };
  }
  return { lineItemId: resolveLineItemIdByIndex(payslip.privateRevenueLineItems, patientIndex) };
}

function handleError(err: unknown) {
  const message = err instanceof Error ? err.message : "Request failed";
  if (message === "Pay period is locked") return NextResponse.json({ error: message }, { status: 409 });
  if (message === "Payslip not found" || message === "Patient line not found") {
    return NextResponse.json({ error: message }, { status: 404 });
  }
  if (message === "Patient index out of range") return NextResponse.json({ error: message }, { status: 400 });
  return errorResponse(err);
}

/** Update a private patient row (legacy PUT /periods/patients, Y2.1b). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:manual-adjustment");
    const { id: payPeriodId } = await params;
    const body = (await req.json()) as Record<string, unknown>;

    const payslipEntryId = String(body.payslipEntryId ?? body.entry_id ?? "");
    const resolved = await resolveLineId(
      session.practiceId,
      payPeriodId,
      payslipEntryId,
      body.lineItemId ? String(body.lineItemId) : undefined,
      body.patient_index != null ? Number(body.patient_index) : undefined
    );

    if (resolved.error === "Patient index out of range") {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }
    if (!payslipEntryId || !resolved.lineItemId) {
      return NextResponse.json({ error: "payslipEntryId and lineItemId (or patient_index) required" }, { status: 400 });
    }

    const result = await updatePrivatePatientLine(
      session.practiceId,
      payPeriodId,
      payslipEntryId,
      resolved.lineItemId,
      mapLegacyUpdates((body.updates as Record<string, unknown>) ?? {})
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleError(err);
  }
}

/** Add a manual private patient row (legacy POST /periods/patients, Y2.1b). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:manual-adjustment");
    const { id: payPeriodId } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const payslipEntryId = String(body.payslipEntryId ?? body.entry_id ?? "");
    const patient = body.patient as Record<string, unknown> | undefined;

    if (!payslipEntryId || !patient) {
      return NextResponse.json({ error: "payslipEntryId and patient required" }, { status: 400 });
    }

    const result = await addManualPrivatePatientLine(session.practiceId, payPeriodId, payslipEntryId, {
      patientName: typeof patient.name === "string" ? patient.name : undefined,
      invoiceDate: typeof patient.date === "string" ? patient.date : undefined,
      amountPence: Math.round(Number(patient.amount ?? 0) * 100),
      paymentStatus: patient.status as "paid" | "partial" | "unpaid" | undefined,
      isFinance: Boolean(patient.finance),
      financeFeePence: patient.financeFee != null ? Math.round(Number(patient.financeFee) * 100) : undefined,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleError(err);
  }
}

/** Delete a private patient row (legacy DELETE /periods/patients, Y2.1b). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:manual-adjustment");
    const { id: payPeriodId } = await params;
    const { searchParams } = new URL(req.url);
    const payslipEntryId = searchParams.get("payslipEntryId") ?? searchParams.get("entry_id") ?? "";
    const lineItemIdParam = searchParams.get("lineItemId");
    const patientIndex = searchParams.get("patient_index");

    const resolved = await resolveLineId(
      session.practiceId,
      payPeriodId,
      payslipEntryId,
      lineItemIdParam ?? undefined,
      patientIndex != null ? Number(patientIndex) : undefined
    );

    if (resolved.error === "Patient index out of range") {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }
    if (!payslipEntryId || !resolved.lineItemId) {
      return NextResponse.json({ error: "payslipEntryId and lineItemId (or patient_index) required" }, { status: 400 });
    }

    const result = await deletePrivatePatientLine(session.practiceId, payPeriodId, payslipEntryId, resolved.lineItemId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleError(err);
  }
}
