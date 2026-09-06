import { scopedDb } from "@elio/db";
import type { PayslipPdfInput } from "./payslip-pdf";
import { getPaySettings } from "./pay-settings-service";
import { enrichPayslipPdfInput } from "./payslip-pdf-enrich";
import { periodRatesAsOfDate, resolveDentistRatesAsOf } from "./dentist-rates";
import {
  assertPayslipInScope,
  resolvePayPractitionerScope,
  type PayPractitionerScope,
} from "./pay-scope";

/** Loads a payslip with relations required for PDF generation and email (Y3.8 / Step 25 / Step 30). */
export async function loadPayslipPdfInput(
  practiceId: string,
  payslipEntryId: string,
  opts?: {
    userId?: string;
    role?: import("@elio/db").Role;
    scope?: PayPractitionerScope;
  }
): Promise<PayslipPdfInput | null> {
  if (opts?.scope) {
    await assertPayslipInScope(practiceId, payslipEntryId, opts.scope);
  } else if (opts?.userId && opts?.role) {
    const scope = await resolvePayPractitionerScope(practiceId, {
      userId: opts.userId,
      role: opts.role,
    });
    await assertPayslipInScope(practiceId, payslipEntryId, scope);
  }

  const db = scopedDb(practiceId);
  const payslip = await db.payslipEntry.findUnique({
    where: { id: payslipEntryId },
    include: {
      dentist: true,
      payPeriod: true,
      privateRevenueLineItems: {
        include: { treatment: true },
        orderBy: [{ invoiceDate: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!payslip) return null;

  const paySettings = await getPaySettings(practiceId);
  const rateHistory = await db.dentistRateHistory.findMany({
    where: { dentistId: payslip.dentistId },
    orderBy: { effectiveFrom: "desc" },
  });
  const periodRates = resolveDentistRatesAsOf(
    {
      privateSplitPercent:
        payslip.dentist.privateSplitPercent != null
          ? Number(payslip.dentist.privateSplitPercent)
          : null,
      udaRatePence: payslip.dentist.udaRatePence,
      hourlyRatePence: payslip.dentist.hourlyRatePence,
      labShareBp: payslip.dentist.labShareBp,
      financeShareBp: payslip.dentist.financeShareBp,
      therapyHourlyPence: payslip.dentist.therapyHourlyPence,
    },
    rateHistory.map((h) => ({
      effectiveFrom: h.effectiveFrom,
      privateSplitPercent: h.privateSplitPercent != null ? Number(h.privateSplitPercent) : null,
      udaRatePence: h.udaRatePence,
      hourlyRatePence: h.hourlyRatePence,
      labShareBp: h.labShareBp,
      financeShareBp: h.financeShareBp,
      therapyHourlyPence: h.therapyHourlyPence,
    })),
    periodRatesAsOfDate(payslip.payPeriod.periodEnd)
  );

  return enrichPayslipPdfInput(payslip, paySettings, periodRates);
}
