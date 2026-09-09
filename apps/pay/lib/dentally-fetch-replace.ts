/**
 * Replace semantics for Pay-period Dentally fetch writes.
 * Dentally lines are wiped and recreated; MANUAL plugs are preserved.
 * Dentists with zero fetched invoices must still clear stale Dentally rows.
 */

/** Delete filter: wipe Dentally (and legacy non-manual) lines only. */
export function dentallyReplaceLineWhere(payslipEntryId: string) {
  return {
    payslipEntryId,
    sourceType: { not: "MANUAL" as const },
  };
}

/** Prior finance ops merge should only consider Dentally lines being replaced. */
export function dentallyPriorLinesWhere(payslipEntryId: string) {
  return dentallyReplaceLineWhere(payslipEntryId);
}

/**
 * Percentage dentists present in practice but absent from this fetch result
 * still need their Dentally-sourced payslip data cleared (no stale rows).
 */
export function percentageDentistsNeedingEmptyClear(
  dentists: Array<{ id: string; payType: string }>,
  dentistIdsWithFetchData: Iterable<string>
): string[] {
  const withData = new Set(dentistIdsWithFetchData);
  return dentists
    .filter((d) => d.payType !== "HOURLY" && !withData.has(d.id))
    .map((d) => d.id);
}
