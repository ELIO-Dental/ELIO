/**
 * Live Dentally patient search for Plans import dialog (P1.4).
 */

import { getDentallyClientForPractice } from "./resolve-api-key";
import {
  fetchDentallyPatientWithClient,
  searchDentallyPatientsWithClient,
} from "./plans-patient-search-client";

export { mapDentallySearchPatient, type DentallySearchPatient } from "./plans-patient-search-map";

export async function searchDentallyPatients(practiceId: string, query: string) {
  const client = await getDentallyClientForPractice(practiceId);
  return searchDentallyPatientsWithClient(client, query);
}

export async function fetchDentallyPatient(practiceId: string, dentallyPatientId: string) {
  const client = await getDentallyClientForPractice(practiceId);
  return fetchDentallyPatientWithClient(client, dentallyPatientId);
}
