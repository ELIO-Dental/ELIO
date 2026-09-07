/** AuraPay `is_nhs` — prefer explicit flag; fall back to performer # for pre-migration rows. */
export function dentistHasNhs(dentist: {
  isNhs?: boolean | null;
  nhsPerformerNumber?: string | null;
}): boolean {
  if (typeof dentist.isNhs === "boolean") return dentist.isNhs;
  return Boolean(dentist.nhsPerformerNumber?.trim());
}

/** Resolve UDAs / rate for calc — non-NHS always zero. */
export function resolveNhsUdasForCalc(
  dentist: {
    isNhs?: boolean | null;
    nhsPerformerNumber?: string | null;
    udaRatePence?: number | null;
  },
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
