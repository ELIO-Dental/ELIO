/** Step 19 — NHS income only when dentist has an NHS performer number. */
export function dentistHasNhs(dentist: { nhsPerformerNumber?: string | null }): boolean {
  return Boolean(dentist.nhsPerformerNumber?.trim());
}

/** Resolve UDAs / rate for calc — non-NHS always zero. */
export function resolveNhsUdasForCalc(
  dentist: { nhsPerformerNumber?: string | null; udaRatePence?: number | null },
  udasRaw: number | null | undefined
): { udas: number; udaRatePence: number; nhsEarningsPence: number } {
  if (!dentistHasNhs(dentist)) {
    return { udas: 0, udaRatePence: 0, nhsEarningsPence: 0 };
  }
  const udas = Number(udasRaw ?? 0);
  const udaRatePence = dentist.udaRatePence ?? 0;
  return {
    udas: Number.isFinite(udas) && udas > 0 ? udas : 0,
    udaRatePence,
    nhsEarningsPence: Math.round((Number.isFinite(udas) && udas > 0 ? udas : 0) * udaRatePence),
  };
}
