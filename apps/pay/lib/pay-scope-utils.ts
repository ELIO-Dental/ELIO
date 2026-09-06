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

/** Filter payslip entries to the caller's allowed dentist. */
export function filterPayslipsForScope<T extends { dentistId: string }>(
  entries: T[],
  scope: PayPractitionerScope
): T[] {
  if (scope.viewAll) return entries;
  if (!scope.dentistId) return [];
  return entries.filter((e) => e.dentistId === scope.dentistId);
}
