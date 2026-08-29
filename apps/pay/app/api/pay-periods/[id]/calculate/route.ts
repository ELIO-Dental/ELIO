import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { calculatePrivateEarnings, calculateFinalPay, calculateLabDeduction } from "@elio/pay-engine";
import type { TreatmentRecord } from "@elio/pay-engine";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/**
 * §6.3-6.5 — runs the pay-engine for every dentist in this pay period and writes one
 * PayslipEntry per dentist, snapshotting the dentist's CURRENT rate/split so a later rate
 * edit never retroactively changes this payslip (versioning, DATA_MODEL.md §3).
 *
 * KNOWN GAP (flagged per MASTER_BUILD_GUIDE.md §1.6's own escape hatch: "flag to Hisham if
 * it doesn't [expose a category]"): packages/db's synced `Treatment` model (Step 1.4) has
 * no `dentistId` column at all — Dentally's invoice-line-item sync has no per-treatment
 * clinician attribution today, and no treatment-category field either. §6.3's "that
 * specific dentist actually completed" and the £50-cosmetic-consultation match therefore
 * cannot be derived automatically from the live synced core yet. Until that sync gap is
 * closed (needs a schema change + Step 1.4 sync update — out of scope to do silently here),
 * this endpoint accepts each dentist's private-revenue line items as explicit input
 * (`privateRevenueItems`) rather than deriving them from `Treatment` — matching the
 * PrivateRevenueLineItem model's own nullable `treatmentId` (already designed to allow a
 * manually-entered line with no linked synced Treatment row).
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

    const payPeriod = await db.payPeriod.findUnique({ where: { id: payPeriodId } });
    if (!payPeriod) return NextResponse.json({ error: "Pay period not found" }, { status: 404 });
    if (payPeriod.status === "LOCKED") {
      return NextResponse.json({ error: "Pay period is locked" }, { status: 409 });
    }

    const results = [];

    for (const input of body.dentists) {
      const dentist = await db.dentist.findUnique({ where: { id: input.dentistId } });
      if (!dentist) continue;

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

        // F.1 Final QA money-path audit (2026-08-29): was find-then-write with
        // no DB guard — now a real upsert against the new
        // @@unique([payPeriodId, dentistId]) constraint (packages/db/prisma/
        // schema.prisma), closing a genuine duplicate-payslip race between
        // two concurrent calculate calls for the same dentist/period.
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

      // PERCENTAGE_SPLIT
      const payLine = await db.payLine.findFirst({
        where: { dentistId: dentist.id, compassStatement: { payPeriodId }, matchConfidence: "CONFIDENT" },
        orderBy: { createdAt: "desc" },
      });
      const udas = payLine?.udas ? Number(payLine.udas) : 0;
      const superannuationPence = payLine?.superannuationPence ?? 0;
      const udaRatePence = dentist.udaRatePence ?? 0;
      const privateSplitPercent = dentist.privateSplitPercent ? Number(dentist.privateSplitPercent) : 0;

      const treatments: TreatmentRecord[] = (input.privateRevenueItems ?? []).map((item, i) => ({
        id: item.treatmentId ?? `manual-${dentist.id}-${i}`,
        dentistId: dentist.id,
        completedAt: payPeriod.periodStart.toISOString(), // caller has already filtered to this period
        amountPence: item.amountPence,
        isCosmeticConsultation: item.excludedAsConsultation,
      }));

      const earnings = calculatePrivateEarnings(
        dentist.id,
        treatments,
        payPeriod.periodStart.toISOString().substring(0, 10),
        payPeriod.periodEnd.toISOString().substring(0, 10),
        privateSplitPercent,
      );

      const labBillsPence = input.labBillsPence ?? [];
      const labDeductionPence = calculateLabDeduction(labBillsPence);

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
        manualAdjustmentsPence: input.manualAdjustmentsPence ?? 0,
      });

      // F.1 Final QA money-path audit (2026-08-29): was find-then-write with
      // no DB guard — now a real upsert against the new
      // @@unique([payPeriodId, dentistId]) constraint, same rationale as the
      // HOURLY branch above.
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
        create: data,
      });

      if (input.privateRevenueItems?.length) {
        await db.privateRevenueLineItem.deleteMany({ where: { payslipEntryId: payslip.id } });
        for (const item of input.privateRevenueItems) {
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
