/** Pure helpers for Dentally fetch banner copy (Y2.2). */
export function formatFetchSkippedLine(debug: {
  skippedNonClinician?: number;
  skippedNhs?: number;
}): string | null {
  const nonClinician = debug.skippedNonClinician ?? 0;
  const nhs = debug.skippedNhs ?? 0;
  if (nonClinician === 0 && nhs === 0) return null;
  return `Skipped: ${nonClinician} non-clinician, ${nhs} NHS`;
}
