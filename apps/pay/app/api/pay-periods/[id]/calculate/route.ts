import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { calculatePrivateEarnings, calculateFinalPay, calculateLabDeduction } from "@elio/pay-engine";
import { getPaySettings } from "@/lib/pay-settings-service";
import { resolveFinanceFeeSplit, resolveLabBillSplit } from "@/lib/pay-settings";
import {
  financeFeesDeductionPence,
  privateRevenueItemsToTreatments,
  therapyDeductionPence,
} from "@/lib/private-revenue";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/**
 * §6.3-6.5 — runs the pay-engine for every dentist in this pay period.
 * Dentally-fetched PrivateRevenueLineItem rows are reused (metadata preserved).
 * Explicit `privateRevenueItems` in the body replace lines (manual £ entry path).
 */

interface CalcDentistInput {
  dentistId: string;
  privateRevenueItems?: { amountPence: number; excludedAsConsultation: boolean; treatmentId?: string }[];
  labBillsPence?: number[];
  manualAdjustmentsPence?: number;
  adjustmentReason?: string;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:run-period");
    const { id: payPeriodId } = await params;
    const body = (await req.json()) as { dentists: CalcDentistInput[] };
    const db = scopedDb(session.practiceId);
    const paySettings = await getPaySettings(session.practiceId);
    const labBillSplit = resolveLabBillSplit(paySettings);
    const financeFeeSplit = resolveFinanceFeeSplit(paySettings);

    const payPeriod = await db.payPeriod.findUnique({ where: { id: payPeriodId } });
    if (!payPeriod) return NextResponse.json({ error: "Pay period not found" }, { status: 404 });
    if (payPeriod.status === "LOCKED") {
      return NextResponse.json({ error: "Pay period is locked" }, { status: 409 });
    }

    const results = [];

    for (const input of body.dentists) {
      const dentist = await db.dentist.findUnique({ where: { id: input.dentistId } });
      if (!dentist) continue;

      const existingPayslip = await db.payslipEntry.findFirst({
        where: { payPeriodId, dentistId: dentist.id },
        include: { privateRevenueLineItems: true },
      });

      const manualItems = input.privateRevenueItems;
      const useManualItems = Boolean(manualItems?.length);
      const existingLines = existingPayslip?.privateRevenueLineItems ?? [];

      if (dentist.payType === "HOURLY") {
        const hourEntries = await db.hourEntry.findMany({ where: { dentistId: dentist.id, payPeriodId } });
        const hoursWorked = hourEntries.reduce((sum, h) => sum + Number(h.hours), 0);
        const hourlyRatePence = dentist.hourlyRatePence ?? 0;
        const finalPayPence = calculateFinalPay({
          payType: "HOURLY",
          hoursWorked,
          hourlyRatePence,
          manualAdjustmentsPence: input.manualAdjustmentsPence ?? 0,
        });

        const hourlyData = {
          practiceId: session.practiceId,
          payPeriodId,
          dentistId: dentist.id,
          payType: "HOURLY" as const,
          hoursWorked,
          hourlyRatePence,
          hourlyEarningsPence: Math.round(hoursWorked * hourlyRatePence),
          manualAdjustmentsPence: input.manualAdjustmentsPence ?? 0,
          adjustmentReason: input.adjustmentReason ?? null,
          finalPayPence,
        };
        const payslip = await db.payslipEntry.upsert({
          where: { payPeriodId_dentistId: { payPeriodId, dentistId: dentist.id } },
          update: hourlyData,
          create: hourlyData,
        });

        results.push(payslip);
        continue;
      }

      const payLine = await db.payLine.findFirst({
        where: { dentistId: dentist.id, compassStatement: { payPeriodId }, matchConfidence: "CONFIDENT" },
        orderBy: { createdAt: "desc" },
      });
      const udas = payLine?.udas ? Number(payLine.udas) : 0;
      const superannuationPence = payLine?.superannuationPence ?? 0;
      const udaRatePence = dentist.udaRatePence ?? 0;
      const privateSplitPercent = dentist.privateSplitPercent ? Number(dentist.privateSplitPercent) : 0;

      const revenueForCalc = useManualItems
        ? (manualItems ?? []).map((item, i) => ({
            amountPence: item.amountPence,
            excludedAsConsultation: item.excludedAsConsultation,
            treatmentId: item.treatmentId,
            id: item.treatmentId ?? `manual-${dentist.id}-${i}`,
          }))
        : existingLines.map((li) => ({
            amountPence: li.amountPence,
            excludedAsConsultation: li.excludedAsConsultation,
            treatmentId: li.treatmentId,
            id: li.id,
          }));

      const treatments = privateRevenueItemsToTreatments(
        dentist.id,
        revenueForCalc,
        payPeriod.periodStart.toISOString()
      );

      const earnings = calculatePrivateEarnings(
        dentist.id,
        treatments,
        payPeriod.periodStart.toISOString().substring(0, 10),
        payPeriod.periodEnd.toISOString().substring(0, 10),
        privateSplitPercent
      );

      const labAgg = await db.labBillEntry.aggregate({
        where: { dentistId: dentist.id },
        _sum: { amountPence: true },
      });
      const labDeductionPence = calculateLabDeduction(
        input.labBillsPence?.length ? input.labBillsPence : [labAgg._sum.amountPence ?? 0],
        labBillSplit
      );

      const therapyDeduction = therapyDeductionPence(
        existingPayslip?.therapyMinutes != null ? Number(existingPayslip.therapyMinutes) : 0,
        existingPayslip?.therapyRatePerMinute != null ? Number(existingPayslip.therapyRatePerMinute) : 0
      );
      const financeDeduction = financeFeesDeductionPence(
        useManualItems ? [] : existingLines.map((li) => ({ financeFeePence: li.financeFeePence })),
        financeFeeSplit
      );

      const finalPayPence = calculateFinalPay({
        payType: "PERCENTAGE_SPLIT",
        udas,
        udaRatePence,
        grossPrivateRevenuePence: earnings.grossPrivateRevenuePence,
        privateSplitPercent,
        privateEarningsPence: earnings.privateEarningsPence,
        consultationExclusionsPence: earnings.consultationExclusionsPence,
        labDeductionPence,
        superannuationPence,
        therapyDeductionPence: therapyDeduction,
        financeFeesDeductionPence: financeDeduction,
        manualAdjustmentsPence: input.manualAdjustmentsPence ?? 0,
      });

      const data = {
        practiceId: session.practiceId,
        payPeriodId,
        dentistId: dentist.id,
        payType: "PERCENTAGE_SPLIT" as const,
        udas,
        udaRatePence,
        nhsEarningsPence: Math.round(udas * udaRatePence),
        grossPrivateRevenuePence: earnings.grossPrivateRevenuePence,
        privateSplitPercent,
        privateEarningsPence: earnings.privateEarningsPence,
        consultationExclusionsPence: earnings.consultationExclusionsPence,
        labDeductionPence,
        superannuationPence,
        manualAdjustmentsPence: input.manualAdjustmentsPence ?? 0,
        adjustmentReason: input.adjustmentReason ?? null,
        finalPayPence,
      };
      const payslip = await db.payslipEntry.upsert({
        where: { payPeriodId_dentistId: { payPeriodId, dentistId: dentist.id } },
        update: data,
        create: {
          ...data,
          therapyMinutes: existingPayslip?.therapyMinutes ?? undefined,
          therapyRatePerMinute: existingPayslip?.therapyRatePerMinute ?? undefined,
          dentallyPatientsJson: existingPayslip?.dentallyPatientsJson ?? undefined,
          dentallyAnalyticsJson: existingPayslip?.dentallyAnalyticsJson ?? undefined,
          dentallyTherapyJson: existingPayslip?.dentallyTherapyJson ?? undefined,
          dentallyDiscrepanciesJson: existingPayslip?.dentallyDiscrepanciesJson ?? undefined,
        },
      });

      if (useManualItems && manualItems) {
        await db.privateRevenueLineItem.deleteMany({ where: { payslipEntryId: payslip.id } });
        for (const item of manualItems) {
          await db.privateRevenueLineItem.create({
            data: {
              payslipEntryId: payslip.id,
              treatmentId: item.treatmentId ?? null,
              amountPence: item.amountPence,
              excludedAsConsultation: item.excludedAsConsultation,
            },
          });
        }
      }

      results.push(payslip);
    }

    return NextResponse.json({ payslips: results });
  } catch (err) {
    return errorResponse(err);
  }
}
