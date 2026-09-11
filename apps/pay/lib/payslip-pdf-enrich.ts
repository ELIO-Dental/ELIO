import type { Dentist, PayPeriod, PayslipEntry, PrivateRevenueLineItem, Treatment } from "@elio/db";
import type { PayslipPdfInput } from "./payslip-pdf";
import type { PaySettings } from "./pay-settings";
import { resolveFinanceFeeSplit } from "./pay-settings";
import { resolveShareBp, type DentistRateSnapshot } from "./dentist-rates";

type PayslipWithRelations = PayslipEntry & {
  dentist: Dentist;
  payPeriod: PayPeriod;
  privateRevenueLineItems: (PrivateRevenueLineItem & { treatment: Treatment | null })[];
};

/** Attach practice name + period finance/therapy rates so PDF/email match calc (Step 25/30). */
export function enrichPayslipPdfInput(
  payslip: PayslipWithRelations,
  paySettings: PaySettings,
  /** Prefer period-as-of rates from resolveDentistRatesAsOf; falls back to live dentist. */
  periodRates?: Pick<DentistRateSnapshot, "financeShareBp" | "therapyHourlyPence"> | null
): PayslipPdfInput {
  const practiceFinanceBp = resolveFinanceFeeSplit(paySettings);
  const financeShareBp = periodRates?.financeShareBp ?? payslip.dentist.financeShareBp;
  const therapyHourlyPence =
    periodRates?.therapyHourlyPence ?? payslip.dentist.therapyHourlyPence;
  return {
    ...payslip,
    practiceName: paySettings.clinic_name || undefined,
    clinicWebsite: paySettings.clinic_website || undefined,
    financeFeeSplit: resolveShareBp(financeShareBp, practiceFinanceBp),
    financeRateSettings: {
      finance_rate_3m: paySettings.finance_rate_3m,
      finance_rate_12m: paySettings.finance_rate_12m,
      finance_rate_36m: paySettings.finance_rate_36m,
      finance_rate_60m: paySettings.finance_rate_60m,
    },
    therapyHourlyPence,
  };
}
