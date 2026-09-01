export interface FlowPractitionerScope {
  /** User may view every dentist's pipeline (owners/admins and unlinked staff). */
  viewAll: boolean;
  /** When set, results are limited to this dentist row. */
  dentistId: string | null;
}

export function consultMatchesPractitionerScope(
  consult: { practitionerDentistId: string | null },
  scope: FlowPractitionerScope
): boolean {
  if (scope.viewAll) return true;
  if (!scope.dentistId) return true;
  return consult.practitionerDentistId === scope.dentistId;
}

export function resolveEffectiveDentistFilter(
  scope: FlowPractitionerScope,
  requestedDentistId: string | null | undefined
): string | null {
  if (!scope.viewAll && scope.dentistId) return scope.dentistId;
  if (requestedDentistId && requestedDentistId !== "all") return requestedDentistId;
  return null;
}
