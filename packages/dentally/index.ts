// ONE Dentally API client, used by all modules (FR-9) — packages/dentally.
// See project-docs/APPLICATION_FLOW.md section 5 and
// project-docs/PERFORMANCE_SCALABILITY.md section 1 for the design decisions.

export { DentallyClient, DentallyApiError, getDentallyClient } from "./src/client";
export type { DentallyClientOptions } from "./src/client";

export { syncPracticeDentallyData } from "./src/sync";
export type { SyncResult, SyncError } from "./src/sync";

export { getPatient, getPatients, getAppointments, getTreatments, getInvoices } from "./src/queries";

export { inngest, dentallySyncFunction, requestDentallySync } from "./src/inngest";

export * from "./src/types";
