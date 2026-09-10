import { DentallyApiError, type DentallyClient } from "./client";
import { mapDentallySearchPatient, type DentallySearchPatient } from "./plans-patient-search-map";
import type { DentallyPatientRaw } from "./types";

function unwrapPatient(raw: Record<string, unknown>): DentallyPatientRaw {
  const p = (raw.patient ?? raw) as DentallyPatientRaw;
  return p;
}

export async function searchDentallyPatientsWithClient(
  client: DentallyClient,
  query: string,
): Promise<DentallySearchPatient[]> {
  const allMatched: DentallySearchPatient[] = [];
  const maxPages = 5;

  await client.paginate<DentallyPatientRaw>(
    "/patients",
    "patients",
    { query: query.trim() },
    (page) => {
      for (const raw of page) {
        allMatched.push(mapDentallySearchPatient(raw));
      }
    },
    { maxPages },
  );

  return allMatched;
}

/**
 * Fetches one patient by Dentally id. Returns null ONLY for a genuine 404 (patient
 * doesn't exist / was deleted in Dentally) — every other failure (network error, 5xx,
 * rate limit exhausted, bad API key) is rethrown. Callers used to see null for ANY
 * failure here, which made a real Dentally outage indistinguishable from "patient not
 * found" — e.g. the plan-reassign loop reported it as "no payment plan in Dentally"
 * for a patient whose plan we simply failed to check, and the manual patient-ID
 * lookup route silently returned an empty result instead of an error.
 */
export async function fetchDentallyPatientWithClient(
  client: DentallyClient,
  dentallyPatientId: string,
): Promise<DentallySearchPatient | null> {
  try {
    const data = await client.get<{ patient?: DentallyPatientRaw } | DentallyPatientRaw>(
      `/patients/${dentallyPatientId}`,
    );
    const raw = unwrapPatient(data as Record<string, unknown>);
    if (!raw.id) return null;
    return mapDentallySearchPatient(raw);
  } catch (err) {
    if (err instanceof DentallyApiError && err.status === 404) return null;
    throw err;
  }
}
