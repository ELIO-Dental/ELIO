import type { DentallyClient } from "./client";
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
  } catch {
    return null;
  }
}
