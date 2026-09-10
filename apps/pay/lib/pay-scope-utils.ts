import { isUatOrE2eDentistName } from "./active-dentists";

export interface PayPractitionerScope {
  /** Ops/admin/finance/auditor — see every dentist. */
  viewAll: boolean;
  /** When set, results are limited to this dentist row. */
  dentistId: string | null;
}

export function payslipMatchesPractitionerScope(
  payslip: { dentistId: string },
  scope: PayPractitionerScope
): boolean {
  if (scope.viewAll) return true;
  if (!scope.dentistId) return false;
  return payslip.dentistId === scope.dentistId;
}

/** Filter payslip entries to the caller's allowed dentist; never show UAT/E2E junk. */
export function filterPayslipsForScope<
  T extends { dentistId: string; dentist?: { name?: string | null } | null },
>(entries: T[], scope: PayPractitionerScope): T[] {
  const withoutTest = entries.filter((e) => {
    const name = e.dentist?.name;
    return !(name && isUatOrE2eDentistName(name));
  });
  if (scope.viewAll) return withoutTest;
  if (!scope.dentistId) return [];
  return withoutTest.filter((e) => e.dentistId === scope.dentistId);
}
