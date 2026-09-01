import { scopedDb } from "@elio/db";
import {
  calculateFinalPay,
  extractPdfText,
  parseCompassStatement,
} from "@elio/pay-engine";
import { extractNhsPeriodDates, toValidISODate } from "./nhs-period-extract";
import { financeFeesDeductionPence, therapyDeductionPence } from "./private-revenue";

// pdf-parse removed — use pay-engine extractPdfText

export interface NhsUdaExtraction {
  dentistId: string;
  dentistName: string;
  performerNumber: string | null;
  udas: number;
  udaRatePence: number;
  nhsEarningsPence: number;
  source: "pdf" | "manual";
}

export interface ProcessNhsStatementInput {
  pdfBuffer?: Buffer;
  manualUdas?: Record<string, number>;
  nhsPeriodStart?: string;
  nhsPeriodEnd?: string;
}

export interface ProcessNhsStatementResult {
  message: string;
  extractions: NhsUdaExtraction[];
  updates: string[];
  period: { start: string | null; end: string | null };
}

function assertDraftPeriod(status: string) {
  if (status === "LOCKED") throw new Error("Pay period is locked");
}

async function extractPdfTextFromBuffer(buffer: Buffer): Promise<string> {
  return extractPdfText(buffer);
}

/** Process NHS statement PDF and/or manual UDAs (legacy Y2.8, coexists with Compass upload). */
export async function processNhsStatement(
  practiceId: string,
  payPeriodId: string,
  input: ProcessNhsStatementInput
): Promise<ProcessNhsStatementResult> {
  const db = scopedDb(practiceId);
  const payPeriod = await db.payPeriod.findUnique({ where: { id: payPeriodId } });
  if (!payPeriod) throw new Error("Pay period not found");
  assertDraftPeriod(payPeriod.status);

  const nhsDentists = await db.dentist.findMany({
    where: { nhsPerformerNumber: { not: null } },
    select: {
      id: true,
      name: true,
      nhsPerformerNumber: true,
      udaRatePence: true,
    },
  });

  if (nhsDentists.length === 0) {
    throw new Error("No NHS dentists configured");
  }

  let extractions: NhsUdaExtraction[] = [];
  let nhsPeriodStart = input.nhsPeriodStart ?? "";
  let nhsPeriodEnd = input.nhsPeriodEnd ?? "";

  if (input.pdfBuffer) {
    const text = await extractPdfTextFromBuffer(input.pdfBuffer);
    if (!nhsPeriodStart || !nhsPeriodEnd) {
      const periodDates = extractNhsPeriodDates(text);
      if (periodDates.periodStart) nhsPeriodStart = periodDates.periodStart;
      if (periodDates.periodEnd) nhsPeriodEnd = periodDates.periodEnd;
    }

    const knownNamesByPerformer = new Map<string, string>();
    for (const d of nhsDentists) {
      if (d.nhsPerformerNumber) knownNamesByPerformer.set(d.nhsPerformerNumber, d.name);
    }

    const parsed = await parseCompassStatement(input.pdfBuffer, knownNamesByPerformer);
    if (!nhsPeriodStart && parsed.activityPeriodStart) nhsPeriodStart = parsed.activityPeriodStart;
    if (!nhsPeriodEnd && parsed.activityPeriodEnd) nhsPeriodEnd = parsed.activityPeriodEnd;

    for (const line of parsed.lines) {
      const dentist = nhsDentists.find((d) => d.nhsPerformerNumber === line.performerNumber);
      if (!dentist || line.udas == null) continue;
      const udaRatePence = dentist.udaRatePence ?? 0;
      extractions.push({
        dentistId: dentist.id,
        dentistName: dentist.name,
        performerNumber: dentist.nhsPerformerNumber,
        udas: line.udas,
        udaRatePence,
        nhsEarningsPence: Math.round(line.udas * udaRatePence),
        source: "pdf",
      });
    }
  }

  if (input.manualUdas) {
    for (const dentist of nhsDentists) {
      const udas = input.manualUdas[dentist.name];
      if (udas === undefined || udas <= 0) continue;
      const udaRatePence = dentist.udaRatePence ?? 0;
      const manual: NhsUdaExtraction = {
        dentistId: dentist.id,
        dentistName: dentist.name,
        performerNumber: dentist.nhsPerformerNumber,
        udas,
        udaRatePence,
        nhsEarningsPence: Math.round(udas * udaRatePence),
        source: "manual",
      };
      const idx = extractions.findIndex((e) => e.dentistId === dentist.id);
      if (idx >= 0) extractions[idx] = manual;
      else extractions.push(manual);
    }
  }

  if (extractions.length === 0) {
    throw new Error("No UDAs found — upload a PDF or enter UDAs manually");
  }

  const validStart = toValidISODate(nhsPeriodStart) ?? null;
  const validEnd = toValidISODate(nhsPeriodEnd) ?? null;
  if (validStart || validEnd) {
    await db.payPeriod.update({
      where: { id: payPeriodId },
      data: {
        nhsPeriodStart: validStart ? new Date(`${validStart}T00:00:00.000Z`) : null,
        nhsPeriodEnd: validEnd ? new Date(`${validEnd}T00:00:00.000Z`) : null,
      },
    });
  }

  const updates: string[] = [];
  for (const extraction of extractions) {
    const existing = await db.payslipEntry.findFirst({
      where: { payPeriodId, dentistId: extraction.dentistId },
      include: { privateRevenueLineItems: true },
    });
    if (!existing) {
      updates.push(`${extraction.dentistName}: skipped (no payslip — run calculation first)`);
      continue;
    }

    const therapyDeduction = therapyDeductionPence(
      existing.therapyMinutes != null ? Number(existing.therapyMinutes) : 0,
      existing.therapyRatePerMinute != null ? Number(existing.therapyRatePerMinute) : 0
    );
    const financeDeduction = financeFeesDeductionPence(
      existing.privateRevenueLineItems.map((li) => ({ financeFeePence: li.financeFeePence }))
    );

    const finalPayPence = calculateFinalPay({
      payType: "PERCENTAGE_SPLIT",
      udas: extraction.udas,
      udaRatePence: extraction.udaRatePence,
      grossPrivateRevenuePence: existing.grossPrivateRevenuePence ?? 0,
      privateSplitPercent: Number(existing.privateSplitPercent ?? 0),
      privateEarningsPence: existing.privateEarningsPence ?? 0,
      consultationExclusionsPence: existing.consultationExclusionsPence ?? 0,
      labDeductionPence: existing.labDeductionPence ?? 0,
      superannuationPence: existing.superannuationPence ?? 0,
      therapyDeductionPence: therapyDeduction,
      financeFeesDeductionPence: financeDeduction,
      manualAdjustmentsPence: existing.manualAdjustmentsPence ?? 0,
    });

    await db.payslipEntry.update({
      where: { id: existing.id },
      data: {
        udas: extraction.udas,
        udaRatePence: extraction.udaRatePence,
        nhsEarningsPence: extraction.nhsEarningsPence,
        finalPayPence,
      },
    });

    updates.push(
      `${extraction.dentistName}: ${extraction.udas} UDAs = £${(extraction.nhsEarningsPence / 100).toFixed(2)}`
    );
  }

  return {
    message: `Updated NHS UDAs for ${updates.filter((u) => !u.includes("skipped")).length} dentist(s)`,
    extractions,
    updates,
    period: { start: validStart, end: validEnd },
  };
}
