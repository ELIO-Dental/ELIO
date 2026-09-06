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
import { financeLineUpdatedEvent, recordPayAudit } from "@/lib/pay-audit";

function mapLegacyUpdates(updates: Record<string, unknown>): PrivatePatientLineUpdates {
  const termRaw = updates.financeTerm ?? updates.financeTermMonths;
  let financeTermMonths: number | null | undefined;
  if (termRaw === null || termRaw === "") financeTermMonths = null;
  else if (termRaw != null) {
    const n = Number(termRaw);
    if (!Number.isFinite(n) || ![3, 12, 36, 60].includes(n)) {
      throw new Error("Invalid finance term — use 3, 12, 36, or 60 months");
    }
    financeTermMonths = n;
  }

  let financeFeePence: number | null | undefined;
  if (updates.financeFeePence != null) {
    financeFeePence = Math.round(Number(updates.financeFeePence));
  } else if (updates.financeFee === null || updates.financeFee === "") {
    financeFeePence = null;
  } else if (updates.financeFee != null) {
    financeFeePence = Math.round(Number(updates.financeFee) * 100);
  }

  return {
    patientName: typeof updates.name === "string" ? updates.name : typeof updates.patientName === "string" ? updates.patientName : undefined,
    invoiceDate: typeof updates.date === "string" ? updates.date : typeof updates.invoiceDate === "string" ? updates.invoiceDate : undefined,
    paymentStatus: updates.status as PrivatePatientLineUpdates["paymentStatus"],
    isFinance: updates.finance as boolean | undefined,
    financeFeePence,
    financeTermMonths,
    financeFeeManual: typeof updates.financeFeeManual === "boolean" ? updates.financeFeeManual : undefined,
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
  if (message.startsWith("Invalid finance term")) return NextResponse.json({ error: message }, { status: 400 });
  if (message.includes("require a note") || message.includes("require an author")) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return errorResponse(err);
}

/** Update a private patient row (legacy PUT /periods/patients, Y2.1b / Step 31). */
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

    const db = scopedDb(session.practiceId);
    const beforeLine = await db.privateRevenueLineItem.findFirst({
      where: { id: resolved.lineItemId },
      select: {
        financeTermMonths: true,
        financeFeePence: true,
        financeFeeManual: true,
        isFinance: true,
      },
    });

    const updates = mapLegacyUpdates((body.updates as Record<string, unknown>) ?? {});
    const result = await updatePrivatePatientLine(
      session.practiceId,
      payPeriodId,
      payslipEntryId,
      resolved.lineItemId,
      updates
    );

    if (beforeLine) {
      const financeEvent = financeLineUpdatedEvent(
        resolved.lineItemId,
        {
          financeTermMonths: beforeLine.financeTermMonths,
          financeFeePence: beforeLine.financeFeePence,
          financeFeeManual: beforeLine.financeFeeManual,
          isFinance: beforeLine.isFinance,
        },
        {
          financeTermMonths: result.patient.financeTermMonths ?? null,
          financeFeePence: result.patient.financeFeePence ?? null,
          financeFeeManual: Boolean(result.patient.financeFeeManual),
          isFinance: Boolean(result.patient.isFinance),
        },
        typeof updates.flagReason === "string" ? updates.flagReason : null
      );
      if (financeEvent) {
        await recordPayAudit(session, financeEvent);
      }
    }

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
      financeTermMonths:
        patient.financeTerm != null
          ? Number(patient.financeTerm)
          : patient.financeTermMonths != null
            ? Number(patient.financeTermMonths)
            : undefined,
      note:
        typeof patient.note === "string"
          ? patient.note
          : typeof patient.sourceNote === "string"
            ? patient.sourceNote
            : typeof body.note === "string"
              ? body.note
              : null,
      actorUserId: session.userId,
    });

    await recordPayAudit(session, {
      action: "pay.private_line.created",
      targetType: "PrivateRevenueLineItem",
      targetId: result.patient.id,
      metadata: {
        after: {
          patientName: result.patient.patientName,
          amountPence: result.patient.amountPence,
          isFinance: result.patient.isFinance,
          financeTermMonths: result.patient.financeTermMonths,
          financeFeePence: result.patient.financeFeePence,
        },
        payslipEntryId,
      },
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

    const result = await deletePrivatePatientLine(
      session.practiceId,
      payPeriodId,
      payslipEntryId,
      resolved.lineItemId
    );

    await recordPayAudit(session, {
      action: "pay.private_line.deleted",
      targetType: "PrivateRevenueLineItem",
      targetId: resolved.lineItemId,
      metadata: { payslipEntryId },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleError(err);
  }
}
