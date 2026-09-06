import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { calculatePrivateEarnings, calculateFinalPay, calculateLabDeduction } from "@elio/pay-engine";
import { getPaySettings } from "@/lib/pay-settings-service";
import { resolveFinanceFeeSplit, resolveLabBillSplit } from "@/lib/pay-settings";
import { resolveDentistRatesAsOf, resolveShareBp, periodRatesAsOfDate } from "@/lib/dentist-rates";
import {
  financeFeesDeductionPence,
  privateRevenueItemsToTreatments,
  therapyDeductionPence,
} from "@/lib/private-revenue";
import { payslipIsProvisional, resolveFinanceFeesForDeduction } from "@/lib/finance-fee";
import { resolveNhsUdasForCalc } from "@/lib/nhs-udas";
import { labBillAmountsPenceFromPayslipJson, labBillEntriesToPayslipJson, labBillPeriodWhere } from "@/lib/lab-bills-period";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { lineCountsTowardGross } from "@/lib/payment-flags";
import { isAlreadyPaidInOtherPeriod } from "@/lib/paid-invoice-line-log";
import { loadPaidLogLookup, upsertPaidLogEntries } from "@/lib/paid-invoice-line-log-db";
import { manualLineSourceFields } from "@/lib/line-source";

/**
 * §6.3-6.5 — runs the pay-engine for every dentist in this pay period.
 * Dentally-fetched PrivateRevenueLineItem rows are reused (metadata preserved).
 * Explicit `privateRevenueItems` in the body replace lines (manual £ entry path)
 * and MUST include a Step 32 note + author stamp.
 * Rates use DentistRateHistory as-of period end (Step 21 / 34).
 */

interface CalcDentistInput {
  dentistId: string;
  privateRevenueItems?: {
    amountPence: number;
    excludedAsConsultation: boolean;
    treatmentId?: string;
    manualNote?: string;
  }[];
  /** Shared note for all manual £ plugs for this dentist (Step 32). */
  manualRevenueNote?: string;
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
    const practiceLabBp = resolveLabBillSplit(paySettings);
    const practiceFinanceBp = resolveFinanceFeeSplit(paySettings);

    const payPeriod = await db.payPeriod.findUnique({ where: { id: payPeriodId } });
    if (!payPeriod) return NextResponse.json({ error: "Pay period not found" }, { status: 404 });

    const { canRunPeriodCalculation } = await import("@/lib/month-pipeline");
    const gate = canRunPeriodCalculation({
      periodStatus: payPeriod.status,
      dentallyFetchStatus: payPeriod.dentallyFetchStatus,
    });
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const results = [];
    const paidLogLookup = await loadPaidLogLookup(db, session.practiceId);

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

      if (useManualItems) {
        const note =
          input.manualRevenueNote?.trim() ||
          manualItems?.find((i) => i.manualNote?.trim())?.manualNote?.trim() ||
          "";
        if (!note) {
          return NextResponse.json(
            {
              error: `Manual private revenue for ${dentist.name} requires a note (Step 32 — no unexplained plugs)`,
            },
            { status: 400 }
          );
        }
      }

      const rateHistory = await db.dentistRateHistory.findMany({
        where: { dentistId: dentist.id },
        orderBy: { effectiveFrom: "desc" },
      });
      const rates = resolveDentistRatesAsOf(
        {
          privateSplitPercent:
            dentist.privateSplitPercent != null ? Number(dentist.privateSplitPercent) : null,
          udaRatePence: dentist.udaRatePence,
          hourlyRatePence: dentist.hourlyRatePence,
          labShareBp: dentist.labShareBp,
          financeShareBp: dentist.financeShareBp,
          therapyHourlyPence: dentist.therapyHourlyPence,
        },
        rateHistory.map((h) => ({
          effectiveFrom: h.effectiveFrom,
          privateSplitPercent:
            h.privateSplitPercent != null ? Number(h.privateSplitPercent) : null,
          udaRatePence: h.udaRatePence,
          hourlyRatePence: h.hourlyRatePence,
          labShareBp: h.labShareBp,
          financeShareBp: h.financeShareBp,
          therapyHourlyPence: h.therapyHourlyPence,
        })),
        periodRatesAsOfDate(payPeriod.periodEnd)
      );

      if (dentist.payType === "HOURLY") {
        const hourEntries = await db.hourEntry.findMany({ where: { dentistId: dentist.id, payPeriodId } });
        const hoursWorked = hourEntries.reduce((sum, h) => sum + Number(h.hours), 0);
        const hourlyRatePence = rates.hourlyRatePence ?? 0;
        const finalPayPence = calculateFinalPay({
          payType: "HOURLY",
          hoursWorked,
          hourlyRatePence,
          manualAdjustmentsPence:
            input.manualAdjustmentsPence ?? existingPayslip?.manualAdjustmentsPence ?? 0,
        });

        const hourlyData = {
          practiceId: session.practiceId,
          payPeriodId,
          dentistId: dentist.id,
          payType: "HOURLY" as const,
          hoursWorked,
          hourlyRatePence,
          hourlyEarningsPence: Math.round(hoursWorked * hourlyRatePence),
          manualAdjustmentsPence:
            input.manualAdjustmentsPence ?? existingPayslip?.manualAdjustmentsPence ?? 0,
          adjustmentReason:
            input.adjustmentReason ?? existingPayslip?.adjustmentReason ?? null,
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
      const nhs = resolveNhsUdasForCalc(
        { nhsPerformerNumber: dentist.nhsPerformerNumber, udaRatePence: rates.udaRatePence },
        payLine?.udas ? Number(payLine.udas) : 0
      );
      const { udas, udaRatePence, nhsEarningsPence } = nhs;
      const superannuationPence = dentist.nhsPerformerNumber?.trim()
        ? (payLine?.superannuationPence ?? 0)
        : 0;
      const privateSplitPercent = rates.privateSplitPercent ?? 0;
      const labBillSplit = resolveShareBp(rates.labShareBp, practiceLabBp);
      const financeFeeSplit = resolveShareBp(rates.financeShareBp, practiceFinanceBp);

      const revenueForCalc = useManualItems
        ? (manualItems ?? []).map((item, i) => ({
            amountPence: item.amountPence,
            excludedAsConsultation: item.excludedAsConsultation,
            treatmentId: item.treatmentId,
            id: item.treatmentId ?? `manual-${dentist.id}-${i}`,
          }))
        : existingLines
            .filter((li) => {
              const prior = isAlreadyPaidInOtherPeriod(
                {
                  dentallyInvoiceId: li.dentallyInvoiceId,
                  dentallyPatientId: li.dentallyPatientId,
                  treatmentDescription: li.treatmentDescription,
                  amountPence: li.amountPence,
                },
                paidLogLookup,
                payPeriodId,
                dentist.id
              );
              return !prior;
            })
            .map((li) => ({
              amountPence: li.amountPence,
              excludedAsConsultation: li.excludedAsConsultation,
              treatmentId: li.treatmentId,
              id: li.id,
              paymentStatus: li.paymentStatus,
              flagged: li.flagged,
              amountOutstandingPence: li.amountOutstandingPence,
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

      const fromPayslipLabs = labBillAmountsPenceFromPayslipJson(existingPayslip?.labBillsJson);
      let labAmounts: number[];
      let syncedLabBillsJson: ReturnType<typeof labBillEntriesToPayslipJson> | undefined;
      if (input.labBillsPence?.length) {
        labAmounts = input.labBillsPence;
      } else if (fromPayslipLabs != null) {
        // Explicit payslip JSON (including []) — never resurrect LabBillEntry rows.
        labAmounts = fromPayslipLabs;
      } else {
        const labEntries = await db.labBillEntry.findMany({
          where: labBillPeriodWhere(dentist.id, payPeriod.periodStart),
          select: { labName: true, amountPence: true, description: true, fileUrl: true },
        });
        labAmounts = labEntries.map((e) => e.amountPence).filter((n) => n > 0);
        // Step 15 — snapshot each lab invoice (name + link) onto the payslip for PDF/UI.
        if (labEntries.length > 0) {
          syncedLabBillsJson = labBillEntriesToPayslipJson(labEntries);
        }
      }
      const labDeductionPence = calculateLabDeduction(labAmounts, labBillSplit);

      const therapyDeduction = therapyDeductionPence(
        existingPayslip?.therapyMinutes != null ? Number(existingPayslip.therapyMinutes) : 0,
        existingPayslip?.therapyRatePerMinute != null ? Number(existingPayslip.therapyRatePerMinute) : 0,
        rates.therapyHourlyPence
      );
      const financeDeduction = financeFeesDeductionPence(
        useManualItems
          ? []
          : resolveFinanceFeesForDeduction(existingLines, paySettings),
        financeFeeSplit
      );
      const provisional = useManualItems ? false : payslipIsProvisional(existingLines);

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
        manualAdjustmentsPence:
          input.manualAdjustmentsPence ?? existingPayslip?.manualAdjustmentsPence ?? 0,
      });

      const data = {
        practiceId: session.practiceId,
        payPeriodId,
        dentistId: dentist.id,
        payType: "PERCENTAGE_SPLIT" as const,
        udas,
        udaRatePence,
        nhsEarningsPence,
        grossPrivateRevenuePence: earnings.grossPrivateRevenuePence,
        privateSplitPercent,
        privateEarningsPence: earnings.privateEarningsPence,
        consultationExclusionsPence: earnings.consultationExclusionsPence,
        labDeductionPence,
        superannuationPence,
        manualAdjustmentsPence:
          input.manualAdjustmentsPence ?? existingPayslip?.manualAdjustmentsPence ?? 0,
        adjustmentReason: input.adjustmentReason ?? existingPayslip?.adjustmentReason ?? null,
        finalPayPence,
        provisional,
        ...(syncedLabBillsJson
          ? { labBillsJson: syncedLabBillsJson as unknown as object }
          : {}),
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
        const note =
          input.manualRevenueNote?.trim() ||
          manualItems.find((i) => i.manualNote?.trim())?.manualNote?.trim() ||
          "";
        await db.privateRevenueLineItem.deleteMany({ where: { payslipEntryId: payslip.id } });
        for (const item of manualItems) {
          const itemNote = item.manualNote?.trim() || note;
          const source = manualLineSourceFields({
            amountPence: item.amountPence,
            actorUserId: session.userId,
            note: itemNote,
          });
          await db.privateRevenueLineItem.create({
            data: {
              payslipEntryId: payslip.id,
              treatmentId: item.treatmentId ?? null,
              amountPence: item.amountPence,
              excludedAsConsultation: item.excludedAsConsultation,
              dentallyLineKey: source.dentallyLineKey,
              sourceType: source.sourceType,
              manualCreatedByUserId: source.manualCreatedByUserId,
              manualNote: source.manualNote,
            },
          });
        }
      }

      // Step 14 — append lines that count toward this month's gross into PaidInvoiceLineLog.
      // Manual £ entries have no Dentally invoice id — upsert skips unstable identities.
      const linesToLog = useManualItems
        ? []
        : existingLines.filter(
            (li) =>
              lineCountsTowardGross(li) &&
              !isAlreadyPaidInOtherPeriod(
                {
                  dentallyInvoiceId: li.dentallyInvoiceId,
                  dentallyPatientId: li.dentallyPatientId,
                  treatmentDescription: li.treatmentDescription,
                  amountPence: li.amountPence,
                },
                paidLogLookup,
                payPeriodId,
                dentist.id
              )
          );
      await upsertPaidLogEntries(db, session.practiceId, payPeriodId, dentist.id, linesToLog);

      results.push(payslip);
    }

    return NextResponse.json({ payslips: results });
  } catch (err) {
    return errorResponse(err);
  }
}
